import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Ionicons } from '@expo/vector-icons';
import { Theme, useTheme } from '../context/ThemeContext';
import { type } from '../theme';
import { Badge } from './ui';
import { RecipeDocument } from '../types';
import { totalTimeMinutes } from '../utils/recipeTime';

type Ingredient = RecipeDocument['ingredients'][number];

export const fmtIngredient = (ing: Ingredient): string => {
  const qty = ing.quantity_text ?? (ing.quantity != null ? `${ing.quantity}${ing.unit ? ' ' + ing.unit : ''}` : null);
  return qty ? `${qty} ${ing.item}` : ing.item;
};

// Themed style object for react-native-markdown-display — the real "render actual
// markdown" fallback used wherever there's no structured doc to display instead.
export const recipeMarkdownStyles = (t: Theme) => ({
  body: { color: t.text, ...type.body, fontSize: 14, lineHeight: 21 },
  heading1: { color: t.text, ...type.title, marginTop: 12, marginBottom: 6 },
  heading2: { color: t.text, ...type.title, fontSize: 17, lineHeight: 24, marginTop: 12, marginBottom: 6 },
  heading3: { color: t.text, ...type.title, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 4 },
  paragraph: { color: t.subtext, ...type.body, fontSize: 14, lineHeight: 21, marginTop: 0, marginBottom: 8 },
  // `strong` only overlays the body face, so it keeps a weight rather than a family.
  strong: { color: t.text, fontWeight: '700' as const },
  em: { color: t.subtext, fontStyle: 'italic' as const },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  list_item: { color: t.subtext, ...type.body, fontSize: 14, marginBottom: 4 },
  bullet_list_icon: { color: t.accent },
  ordered_list_icon: { color: t.accent },
  hr: { backgroundColor: t.border, height: StyleSheet.hairlineWidth, marginVertical: 10 },
});

interface Props {
  structured?: RecipeDocument | null;
  markdown: string;
  // Cooking mode's overview walks the steps one screen at a time, so it renders the
  // ingredients here and leaves the steps to StepPhase.
  showSteps?: boolean;
}

const RecipeView: React.FC<Props> = ({ structured, markdown, showSteps = true }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const hasContent = structured && (structured.ingredients.length > 0 || structured.steps.length > 0);
  if (!hasContent) {
    return <Markdown style={recipeMarkdownStyles(theme)}>{markdown}</Markdown>;
  }

  const meta: Array<{ icon: React.ComponentProps<typeof Ionicons>['name']; text: string }> = [];
  if (structured!.servings != null) meta.push({ icon: 'people-outline', text: `${structured!.servings} servings` });
  const totalMinutes = totalTimeMinutes(structured);
  if (totalMinutes > 0) meta.push({ icon: 'time-outline', text: `${totalMinutes} min` });
  if (structured!.difficulty) meta.push({ icon: 'speedometer-outline', text: structured!.difficulty });

  // Group ingredients by their optional section label, preserving first-seen order;
  // recipes with no sections fall into a single unlabeled group.
  const sections = new Map<string, Ingredient[]>();
  for (const ing of structured!.ingredients) {
    const key = ing.section ?? '';
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(ing);
  }

  return (
    <View>
      {meta.length > 0 && (
        <View style={styles.metaRow}>
          {meta.map((m, i) => (
            <Badge
              key={i}
              tone="neutral"
              label={m.text}
              icon={<Ionicons name={m.icon} size={13} color={theme.accent} />}
            />
          ))}
        </View>
      )}

      {structured!.summary != null && structured!.summary !== '' && (
        <Text style={styles.summary}>{structured!.summary}</Text>
      )}

      {structured!.ingredients.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Ingredients</Text>
          {[...sections.entries()].map(([section, items]) => (
            <View key={section || '__default'}>
              {section !== '' && <Text style={styles.subsectionLabel}>{section}</Text>}
              {items.map((ing, idx) => (
                <View key={idx} style={styles.ingRow}>
                  <View style={styles.ingBullet} />
                  <Text style={styles.ingText}>
                    {fmtIngredient(ing)}
                    {ing.optional ? <Text style={styles.optLabel}>  optional</Text> : null}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {showSteps && structured!.steps.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Steps</Text>
          {structured!.steps.map((s, idx) => (
            <View key={idx} style={styles.stepCard}>
              <View style={styles.stepCardMain}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>{s.sort_order}</Text></View>
                <Text style={styles.stepText}>{s.step_text}</Text>
              </View>
              {(s.timer_seconds != null || s.temperature_c != null) && (
                <View style={styles.badgeRow}>
                  {s.timer_seconds != null && (
                    <Badge
                      label={`${Math.round(s.timer_seconds / 60)} min`}
                      icon={<Ionicons name="timer-outline" size={12} color={theme.accent} />}
                    />
                  )}
                  {s.temperature_c != null && (
                    <Badge
                      label={`${s.temperature_c}°C`}
                      icon={<Ionicons name="thermometer-outline" size={12} color={theme.accent} />}
                    />
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },

  summary: { ...type.body, fontSize: 14, color: t.subtext, lineHeight: 20, marginBottom: 12, fontStyle: 'italic' },

  section: { marginBottom: 14 },
  sectionLabel: { ...type.label, fontSize: 12, lineHeight: 16, color: t.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  subsectionLabel: { ...type.label, fontSize: 12, lineHeight: 16, color: t.accent, marginTop: 8, marginBottom: 4 },

  ingRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  ingBullet: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: t.accent, marginTop: 7 },
  ingText: { flex: 1, ...type.body, fontSize: 14, color: t.text, lineHeight: 20 },
  optLabel: { ...type.caption, color: t.muted, fontStyle: 'italic' },

  stepCard: { backgroundColor: t.surfaceRaised, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: t.border },
  stepCardMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: t.accentFaded, justifyContent: 'center', alignItems: 'center' },
  stepNumText: { ...type.label, fontSize: 12, lineHeight: 16, color: t.accent },
  stepText: { flex: 1, ...type.body, fontSize: 14, color: t.text, lineHeight: 20 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 8, marginLeft: 32 },
});

export default RecipeView;
