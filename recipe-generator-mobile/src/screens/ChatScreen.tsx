import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Ionicons } from '@expo/vector-icons';
import RecipeView, { recipeMarkdownStyles } from '../components/RecipeView';
import { Theme, useTheme } from '../context/ThemeContext';
import { layout, type } from '../theme';
import apiService, { ApiError } from '../services/apiService';
import { getCachedRecipes } from '../utils/recipesCache';
import { parseISODate } from '../utils/mealPlanDates';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { ChatArtifact, ChatAttachment, ChatMessage, ChatSource } from '../types';
import { hostLabel } from '../utils/recipeOrigin';
import Composer from './chat/Composer';

// The home surface (BACKLOG.md 3.3): one thread that can generate, refine, save and plan,
// with the agent picking the action. Everything structured the turn produced arrives as an
// artifact and renders through the shared RecipeView — no second recipe renderer here.

// What each tool is doing, in the user's terms. An unlisted tool falls back to its name,
// so a tool added server-side degrades to something readable rather than nothing.
const TOOL_LABELS: Record<string, string> = {
  generate_recipe: 'Writing a recipe',
  transform_recipe: 'Adjusting the recipe',
  search_my_recipes: 'Searching your recipes',
  get_recipe: 'Opening a recipe',
  save_recipe: 'Saving to your account',
  plan_week: 'Planning the week',
  set_plan_day: 'Updating your plan',
  clear_plan_day: 'Clearing that day',
  get_preferences: 'Reading your preferences',
  set_preferences: 'Updating your preferences',
  fetch_url: 'Reading the page',
  answer_cooking_question: 'Thinking it through',
};

const ERROR_MESSAGES: Record<string, string> = {
  budget_exceeded: "You've hit your monthly usage cap.",
  conversation_not_found: 'That conversation is gone — starting a new one.',
  timeout: 'That took too long. Try asking for something smaller.',
  iteration_limit: 'I got stuck going in circles. Try rephrasing?',
};

// The extracting tools carry what they are extracting *from* in their own arguments —
// the only place the client can learn it, and it arrives before the recipe does
// (BACKLOG.md 3.7). A spoken prompt needs nothing here: dictation lands in the composer,
// so the transcript is already the user's own bubble.
const sourceFromArgs = (name: string, args: string, attachments: ChatAttachment[]): ChatSource | null => {
  if (name !== 'generate_recipe' && name !== 'fetch_url') return null;
  let parsed: { description?: string; url?: string; image_ref?: string };
  try {
    parsed = JSON.parse(args || '{}');
  } catch {
    return null;
  }
  if (parsed.url) return { kind: 'url', value: parsed.url };
  if (parsed.image_ref) {
    // image1 is the turn's first attachment; the data URL doubles as the thumbnail.
    const image = attachments[Number(parsed.image_ref.replace(/\D/g, '')) - 1];
    return image?.type === 'image' ? { kind: 'photo', value: image.data } : null;
  }
  if (parsed.description) return { kind: 'text', value: parsed.description };
  return null;
};

const OPENERS = [
  'A quick vegan pasta for two',
  'Make something with what I have: eggs, spinach, feta',
  'Plan my week from my saved recipes',
];

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

const ChatScreen: React.FC<Props> = ({ route, navigation }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && width > layout.breakpointWide;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const conversationId = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Saved-recipe titles for week-plan cards, which carry ids rather than names.
  const [titles, setTitles] = useState<Record<number, string>>({});
  useEffect(() => {
    getCachedRecipes().then((recipes) => {
      if (recipes) setTitles(Object.fromEntries(recipes.map((r) => [r.id, r.recipename])));
    });
  }, []);

  // Abort the in-flight turn on unmount so an abandoned stream stops server-side too.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(async (text: string, attachments: ChatAttachment[] = []) => {
    const message = text.trim();
    if ((!message && attachments.length === 0) || sending) return;

    setSending(true);
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: message, attachmentCount: attachments.length || undefined },
      { role: 'assistant', text: '' },
    ]);

    // The assistant turn is always the last message; every event folds into it.
    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? fn(m) : m)));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      conversationId.current = await apiService.streamChat(message, conversationId.current, (event) => {
        switch (event.type) {
          case 'token':
            patch((m) => ({ ...m, text: m.text + event.payload.text }));
            break;
          case 'tool_start': {
            setActiveTool(event.payload.name);
            const source = sourceFromArgs(event.payload.name, event.payload.args, attachments);
            patch((m) => ({
              ...m,
              tools: [...(m.tools ?? []), event.payload.name],
              sources: source ? [...(m.sources ?? []), source] : m.sources,
            }));
            break;
          }
          case 'tool_end':
            setActiveTool(null);
            break;
          case 'artifact':
            patch((m) => ({ ...m, artifacts: [...(m.artifacts ?? []), event.payload] }));
            break;
        }
      }, controller.signal, attachments);
    } catch (err) {
      if (!controller.signal.aborted) {
        const code = err instanceof ApiError ? err.message : '';
        patch((m) => ({ ...m, error: ERROR_MESSAGES[code] ?? 'Something went wrong. Try again?' }));
      }
    } finally {
      setActiveTool(null);
      setSending(false);
      abortRef.current = null;
    }
  }, [sending]);

  // A prompt handed over by another screen (the planner's "Plan my week" / "Ask the
  // assistant") is sent as an ordinary turn, then cleared so going back doesn't resend it.
  const handedPrompt = route.params?.prompt;
  useEffect(() => {
    if (!handedPrompt) return;
    navigation.setParams({ prompt: undefined });
    send(handedPrompt);
  }, [handedPrompt, navigation, send]);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={styles.thread}
        contentContainerStyle={[styles.threadContent, isWide && styles.wide]}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>What are we cooking?</Text>
            {OPENERS.map((o) => (
              <TouchableOpacity key={o} style={styles.opener} onPress={() => send(o)}>
                <Text style={styles.openerText}>{o}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {messages.map((m, i) => (
          <Turn key={i} message={m} theme={theme} styles={styles} titles={titles} />
        ))}

        {activeTool && (
          <View style={styles.working}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={styles.workingText}>{TOOL_LABELS[activeTool] ?? activeTool}…</Text>
          </View>
        )}
      </ScrollView>

      <View style={isWide ? styles.wide : undefined}>
        <Composer sending={sending} onSend={send} />
      </View>
    </KeyboardAvoidingView>
  );
};

interface TurnProps {
  message: ChatMessage;
  theme: Theme;
  styles: ReturnType<typeof makeStyles>;
  titles: Record<number, string>;
}

const Turn: React.FC<TurnProps> = ({ message, theme, styles, titles }) => {
  if (message.role === 'user') {
    return (
      <View style={styles.userBubble}>
        {message.attachmentCount ? (
          <Text style={styles.userAttachments}>
            <Ionicons name="image-outline" size={12} color={theme.subtext} />
            {` ${message.attachmentCount} photo${message.attachmentCount > 1 ? 's' : ''}`}
          </Text>
        ) : null}
        <Text style={styles.userText}>{message.text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.assistantTurn}>
      {message.text !== '' && <Markdown style={recipeMarkdownStyles(theme)}>{message.text}</Markdown>}
      {message.sources?.map((s, i) => (
        <SourceCard key={i} source={s} theme={theme} styles={styles} />
      ))}
      {message.artifacts?.map((a, i) => (
        <ArtifactCard key={i} artifact={a} theme={theme} styles={styles} titles={titles} />
      ))}
      {message.error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.accent} />
          <Text style={styles.errorText}>{message.error}</Text>
        </View>
      )}
    </View>
  );
};

// What the agent read, shown in the thread ahead of what it produced, so an extracted
// recipe is visibly an extraction rather than an invention.
const SourceCard: React.FC<{ source: ChatSource } & Pick<TurnProps, 'theme' | 'styles'>> = ({ source, theme, styles }) => (
  <View style={styles.sourceCard}>
    {source.kind === 'photo' ? (
      <Image source={{ uri: source.value }} style={styles.sourceThumb} />
    ) : (
      <Ionicons name={source.kind === 'url' ? 'link-outline' : 'chatbubble-outline'} size={16} color={theme.subtext} />
    )}
    <View style={styles.sourceBody}>
      <Text style={styles.sourceLabel}>
        {source.kind === 'photo' ? 'Reading your photo' : source.kind === 'url' ? `Reading ${hostLabel(source.value)}` : 'From what you asked for'}
      </Text>
      {source.kind !== 'photo' && (
        <Text style={styles.sourceDetail} numberOfLines={2}>{source.value}</Text>
      )}
    </View>
  </View>
);

const ArtifactCard: React.FC<{ artifact: ChatArtifact } & Omit<TurnProps, 'message'>> = ({ artifact, theme, styles, titles }) => {
  if (artifact.kind === 'recipe') {
    const doc = artifact.data.document;
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{doc.title}</Text>
        {artifact.data.recipe_id == null && <Text style={styles.draftTag}>Unsaved draft — say "save it" to keep it</Text>}
        <RecipeView structured={doc} markdown="" />
      </View>
    );
  }

  const { plan, starts_on, ends_on } = artifact.data;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Week of {starts_on} – {ends_on}</Text>
      {plan.message && <Text style={styles.draftTag}>{plan.message}</Text>}
      {plan.assignments.map((a) => (
        <View key={a.planned_on} style={styles.planRow}>
          <Text style={styles.planDay}>
            {parseISODate(a.planned_on).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
          </Text>
          <Text style={styles.planMeal} numberOfLines={1}>
            {a.variant?.title ?? (a.recipe_id != null ? titles[a.recipe_id] ?? `Recipe #${a.recipe_id}` : '—')}
          </Text>
        </View>
      ))}
      <Text style={styles.draftTag}>Proposal only — say "apply it" to put it on your plan</Text>
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  thread: { flex: 1 },
  threadContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4, gap: 12 },
  wide: { maxWidth: layout.contentMaxWidth, width: '100%', alignSelf: 'center' },

  empty: { paddingVertical: 12, gap: 8 },
  emptyTitle: { ...type.title, fontSize: 22, lineHeight: 30, color: t.text, marginBottom: 8 },
  opener: { backgroundColor: t.surfaceRaised, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 12 },
  openerText: { color: t.subtext, ...type.body, fontSize: 14 },

  userBubble: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: t.accentFaded, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  userText: { color: t.text, ...type.body, fontSize: 14, lineHeight: 20 },
  userAttachments: { color: t.subtext, ...type.caption, marginBottom: 4 },
  assistantTurn: { gap: 10 },

  sourceCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surfaceRaised, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 10 },
  sourceThumb: { width: 40, height: 40, borderRadius: 8 },
  sourceBody: { flex: 1 },
  sourceLabel: { ...type.label, fontSize: 13, color: t.subtext },
  sourceDetail: { ...type.caption, color: t.muted },

  card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 14, gap: 6 },
  cardTitle: { ...type.title, fontSize: 16, lineHeight: 22, color: t.text },
  draftTag: { ...type.caption, color: t.muted, fontStyle: 'italic' },

  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  planDay: { width: 96, ...type.label, fontSize: 13, color: t.subtext },
  planMeal: { flex: 1, ...type.body, fontSize: 14, color: t.text },

  working: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  workingText: { ...type.body, fontSize: 13, color: t.muted },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { ...type.body, fontSize: 13, color: t.accent, flex: 1 },

});

export default ChatScreen;
