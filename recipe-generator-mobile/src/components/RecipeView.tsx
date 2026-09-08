import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Ionicons } from '@expo/vector-icons';
import { Theme, useTheme } from '../context/ThemeContext';
import { RecipeDocument } from '../types';

type Ingredient = RecipeDocument['ingredients'][number];

const fmtIngredient = (ing: Ingredient): string => {
  const qty = ing.quantity_text ?? (ing.quantity != null ? `${ing.quantity}${ing.unit ? ' ' + ing.unit : ''}` : null);
  return qty ? `${qty} ${ing.item}` : ing.item;
};

// Themed style object for react-native-markdown-display — the real "render actual
// markdown" fallback used wherever there's no structured doc to display instead.
export const recipeMarkdownStyles = (t: Theme) => ({
  body: { color: t.text, fontSize: 14, lineHeight: 21 },
  heading1: { color: t.text, fontSize: 20, fontWeight: '700' as const, marginTop: 12, marginBottom: 6 },
  heading2: { color: t.text, fontSize: 17, fontWeight: '700' as const, marginTop: 12, marginBottom: 6 },
  heading3: { color: t.text, fontSize: 15, fontWeight: '700' as const, marginTop: 10, marginBottom: 4 },
  paragraph: { color: t.subtext, fontSize: 14, lineHeight: 21, marginTop: 0, marginBottom: 8 },
  strong: { color: t.text, fontWeight: '700' as const },
  em: { color: t.subtext, fontStyle: 'italic' as const },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  list_item: { color: t.subtext, fontSize: 14, marginBottom: 4 },
  bullet_list_icon: { color: t.accent },
  ordered_list_icon: { color: t.accent },
  hr: { backgroundColor: t.border, height: StyleSheet.hairlineWidth, marginVertical: 10 },
});

interface Props {
  structured?: RecipeDocument | null;
  markdown: string;
}

const RecipeView: React.FC<Props> = ({ structured, markdown }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const hasContent = structured && (structured.ingredients.length > 0 || structured.steps.length > 0);
  if (!hasContent) {
    return <Markdown style={recipeMarkdownStyles(theme)}>{markdown}</Markdown>;
  }

  const meta: Array<{ icon: React.ComponentProps<typeof Ionicons>['name']; text: string }> = [];
  if (structured!.servings != null) meta.push({ icon: 'people-outline', text: `${structured!.servings} servings` });
  const totalMinutes = (structured!.prep_minutes ?? 0) + (structured!.cook_minutes ?? 0);
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
            <View key={i} style={styles.metaBadge}>
              <Ionicons name={m.icon} size={13} color={theme.accent} style={{ marginRight: 4 }} />
              <Text style={styles.metaBadgeText}>{m.text}</Text>
            </View>
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

      {structured!.steps.length > 0 && (
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
                    <View style={styles.badge}>
                      <Ionicons name="timer-outline" size={12} color={theme.accent} style={{ marginRight: 3 }} />
                      <Text style={styles.badgeText}>{Math.round(s.timer_seconds / 60)} min</Text>
                    </View>
                  )}
                  {s.temperature_c != null && (
                    <View style={styles.badge}>
                      <Ionicons name="thermometer-outline" size={12} color={theme.accent} style={{ marginRight: 3 }} />
                      <Text style={styles.badgeText}>{s.temperature_c}°C</Text>
                    </View>
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
  metaBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: t.border },
  metaBadgeText: { fontSize: 12, color: t.subtext, fontWeight: '600' },

  summary: { fontSize: 14, color: t.subtext, lineHeight: 20, marginBottom: 12, fontStyle: 'italic' },

  section: { marginBottom: 14 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: t.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  subsectionLabel: { fontSize: 12, fontWeight: '600', color: t.accent, marginTop: 8, marginBottom: 4 },

  ingRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  ingBullet: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: t.accent, marginTop: 7 },
  ingText: { flex: 1, fontSize: 14, color: t.text, lineHeight: 20 },
  optLabel: { fontSize: 12, color: t.muted, fontStyle: 'italic' },

  stepCard: { backgroundColor: t.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: t.border },
  stepCardMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: t.accentFaded, justifyContent: 'center', alignItems: 'center' },
  stepNumText: { fontSize: 12, fontWeight: '700', color: t.accent },
  stepText: { flex: 1, fontSize: 14, color: t.text, lineHeight: 20 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 8, marginLeft: 32 },
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.accentFaded, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 11, color: t.accent, fontWeight: '600' },
});

export default RecipeView;
