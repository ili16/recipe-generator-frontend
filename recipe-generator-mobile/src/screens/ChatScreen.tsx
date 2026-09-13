import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Ionicons } from '@expo/vector-icons';
import RecipeView, { recipeMarkdownStyles } from '../components/RecipeView';
import { Theme, useTheme } from '../context/ThemeContext';
import { layout, radius, type } from '../theme';
import apiService, { ApiError } from '../services/apiService';
import { addCachedRecipe, getCachedRecipes } from '../utils/recipesCache';
import { useAlert } from '../context/AlertContext';
import { useLanguage } from '../context/LanguageContext';
import { currentLocale } from '../i18n';
import { parseISODate } from '../utils/mealPlanDates';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { ChatArtifact, ChatAttachment, ChatMessage, ChatSource } from '../types';
import { hostLabel } from '../utils/recipeOrigin';
import { foldArtifact } from '../utils/chatArtifacts';
import Composer from './chat/Composer';
import { FeedbackPulse } from '../components/FeedbackPulse';

// The home surface (BACKLOG.md 3.3): one thread that can generate, refine, save and plan,
// with the agent picking the action. Everything structured the turn produced arrives as an
// artifact and renders through the shared RecipeView — no second recipe renderer here.

// The tools we have words for, under `chat.tool.*`. A tool added server-side is not in the
// catalog and falls back to its own name — readable, rather than nothing.
const NAMED_TOOLS = new Set([
  'generate_recipe', 'transform_recipe', 'search_my_recipes', 'get_recipe', 'save_recipe',
  'plan_week', 'set_plan_day', 'clear_plan_day', 'get_preferences', 'set_preferences',
  'fetch_url', 'answer_cooking_question',
]);

// Server error codes we have words for, under `chat.error.*`.
const NAMED_ERRORS = new Set([
  'budget_exceeded', 'conversation_not_found', 'timeout', 'iteration_limit',
]);

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

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

const ChatScreen: React.FC<Props> = ({ route, navigation }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { showAlert } = useAlert();
  const { t } = useLanguage();
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
            // A save re-emits the recipe's card carrying its new recipe_id. That usually
            // lands a turn or more after the card it updates ("make me a pasta" … "save
            // it"), so the fold searches the whole thread, not just this turn: the
            // existing card flips to Saved instead of a second copy appearing below it.
            setMessages((prev) => foldArtifact(prev, event.payload));
            break;
        }
      }, controller.signal, attachments);
    } catch (err) {
      if (!controller.signal.aborted) {
        const code = err instanceof ApiError ? err.message : '';
        patch((m) => ({ ...m, error: NAMED_ERRORS.has(code) ? t(`chat.error.${code}`) : t('common.unknownError') }));
      }
    } finally {
      setActiveTool(null);
      setSending(false);
      abortRef.current = null;
    }
  }, [sending, t]);

  // Saving a draft the agent wrote, without asking the model to do it again. The server
  // saves through the same idempotent path as the save_recipe tool, so a second tap — or
  // a later "save it" — lands on the recipe already saved.
  const [savingRef, setSavingRef] = useState<string | null>(null);
  const [expiredRefs, setExpiredRefs] = useState<string[]>([]);
  const saveDraft = useCallback(async (draftRef: string) => {
    const conversation = conversationId.current;
    if (!conversation || savingRef) return;
    setSavingRef(draftRef);
    try {
      const saved = await apiService.saveChatDraft(conversation, draftRef);
      addCachedRecipe(saved);
      setMessages((prev) =>
        prev.map((m) =>
          m.artifacts
            ? {
                ...m,
                artifacts: m.artifacts.map((a) =>
                  a.kind === 'recipe' && a.data.draft_ref === draftRef
                    ? { ...a, data: { ...a.data, recipe_id: saved.id } }
                    : a
                ),
              }
            : m
        )
      );
    } catch (err) {
      // The server forgets a cold conversation's drafts (2h, and a restart). Nothing the
      // button can do then, so the card falls back to asking the assistant.
      const code = err instanceof ApiError ? (err.data as { code?: string } | undefined)?.code : undefined;
      if (code === 'draft_expired') setExpiredRefs((prev) => [...prev, draftRef]);
      else showAlert(t('chat.saveFailedTitle'), t('chat.saveFailedBody'), 'error');
    } finally {
      setSavingRef(null);
    }
  }, [showAlert, savingRef, t]);

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
        {/* The occasional "how is it going" card (BACKLOG 9.16). It decides for itself
            whether it is eligible and renders nothing when it is not. */}
        <FeedbackPulse route="Chat" />

        {messages.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('chat.emptyTitle')}</Text>
            {(['chat.opener1', 'chat.opener2', 'chat.opener3'].map((k) => t(k))).map((o) => (
              <TouchableOpacity key={o} style={styles.opener} onPress={() => send(o)}>
                <Text style={styles.openerText}>{o}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {messages.map((m, i) => (
          <Turn
            key={i}
            message={m}
            theme={theme}
            styles={styles}
            t={t}
            titles={titles}
            savingRef={savingRef}
            expiredRefs={expiredRefs}
            onSaveDraft={saveDraft}
          />
        ))}

        {activeTool && (
          <View style={styles.working}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={styles.workingText}>{NAMED_TOOLS.has(activeTool) ? t(`chat.tool.${activeTool}`) : activeTool}…</Text>
          </View>
        )}
      </ScrollView>

      <View style={isWide ? styles.wide : undefined}>
        <Composer sending={sending} onSend={send} />
      </View>
    </KeyboardAvoidingView>
  );
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

interface TurnProps {
  message: ChatMessage;
  theme: Theme;
  /** Passed down rather than re-read per card: these are all render-only children. */
  t: Translate;
  styles: ReturnType<typeof makeStyles>;
  titles: Record<number, string>;
  /** Draft-save plumbing for recipe artifacts: which ref is in flight, which are gone. */
  savingRef: string | null;
  expiredRefs: string[];
  onSaveDraft: (draftRef: string) => void;
}

const Turn: React.FC<TurnProps> = ({ message, theme, styles, titles, savingRef, expiredRefs, onSaveDraft, t }) => {
  if (message.role === 'user') {
    return (
      <View style={styles.userBubble}>
        {message.attachmentCount ? (
          <Text style={styles.userAttachments}>
            <Ionicons name="image-outline" size={12} color={theme.subtext} />
            {` ${t('chat.photoCount', { count: message.attachmentCount })}`}
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
        <SourceCard key={i} source={s} theme={theme} styles={styles} t={t} />
      ))}
      {message.artifacts?.map((a, i) => (
        <ArtifactCard
          key={i}
          artifact={a}
          theme={theme}
          styles={styles}
          titles={titles}
          t={t}
          savingRef={savingRef}
          expiredRefs={expiredRefs}
          onSaveDraft={onSaveDraft}
        />
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
const SourceCard: React.FC<{ source: ChatSource } & Pick<TurnProps, 'theme' | 'styles' | 't'>> = ({ source, theme, styles, t }) => (
  <View style={styles.sourceCard}>
    {source.kind === 'photo' ? (
      <Image source={{ uri: source.value }} style={styles.sourceThumb} />
    ) : (
      <Ionicons name={source.kind === 'url' ? 'link-outline' : 'chatbubble-outline'} size={16} color={theme.subtext} />
    )}
    <View style={styles.sourceBody}>
      <Text style={styles.sourceLabel}>
        {source.kind === 'photo'
          ? t('chat.source.photo')
          : source.kind === 'url'
          ? t('chat.source.url', { host: hostLabel(source.value) })
          : t('chat.source.text')}
      </Text>
      {source.kind !== 'photo' && (
        <Text style={styles.sourceDetail} numberOfLines={2}>{source.value}</Text>
      )}
    </View>
  </View>
);

const ArtifactCard: React.FC<{ artifact: ChatArtifact } & Omit<TurnProps, 'message'>> = ({
  artifact, theme, styles, titles, savingRef, expiredRefs, onSaveDraft, t,
}) => {
  if (artifact.kind === 'recipe') {
    const doc = artifact.data.document;
    const ref = artifact.data.draft_ref;
    const saved = artifact.data.recipe_id != null;
    const expired = !!ref && expiredRefs.includes(ref);
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{doc.title}</Text>
        {saved ? (
          <Text style={styles.draftTag}>
            <Ionicons name="checkmark-circle" size={12} color={theme.accent} /> {t('chat.savedToRecipes')}
          </Text>
        ) : ref && !expired ? (
          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => onSaveDraft(ref)}
            disabled={savingRef != null}
          >
            {savingRef === ref ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Ionicons name="bookmark-outline" size={14} color={theme.accent} />
            )}
            <Text style={styles.saveButtonText}>
              {savingRef === ref ? t('common.saving') : t('chat.saveToRecipes')}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.draftTag}>{t('chat.unsavedDraft')}</Text>
        )}
        <RecipeView structured={doc} markdown="" />
      </View>
    );
  }

  const { plan, starts_on, ends_on } = artifact.data;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('chat.weekOf', { start: starts_on, end: ends_on })}</Text>
      {plan.message && <Text style={styles.draftTag}>{plan.message}</Text>}
      {plan.assignments.map((a) => (
        <View key={a.planned_on} style={styles.planRow}>
          <Text style={styles.planDay}>
            {parseISODate(a.planned_on).toLocaleDateString(currentLocale(), { weekday: 'short', day: 'numeric', month: 'short' })}
          </Text>
          <Text style={styles.planMeal} numberOfLines={1}>
            {a.variant?.title ?? (a.recipe_id != null ? titles[a.recipe_id] ?? t('chat.recipeNumber', { id: a.recipe_id }) : '—')}
          </Text>
        </View>
      ))}
      <Text style={styles.draftTag}>{t('chat.proposalOnly')}</Text>
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
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: t.accentFaded,
  },
  saveButtonText: { ...type.label, fontSize: 13, color: t.accent },

  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  planDay: { width: 96, ...type.label, fontSize: 13, color: t.subtext },
  planMeal: { flex: 1, ...type.body, fontSize: 14, color: t.text },

  working: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  workingText: { ...type.body, fontSize: 13, color: t.muted },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { ...type.body, fontSize: 13, color: t.accent, flex: 1 },

});

export default ChatScreen;
