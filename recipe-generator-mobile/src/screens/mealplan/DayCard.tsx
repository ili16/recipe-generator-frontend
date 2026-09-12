import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Recipe } from '../../types';
import { Theme, useTheme } from '../../context/ThemeContext';
import { radius, space } from '../../theme';
import { Badge, Text } from '../../components/ui';
import { totalTimeMinutes } from '../../utils/recipeTime';

/**
 * One day of the plan. `DESIGN_SYSTEM.md` §7.4's `DayCard`, declined in 5.8 for want of a second
 * caller and built here because the planner rebuild is that caller.
 *
 * The header bar carries the *kind*, which is the whole point: a repeated dish is either a
 * leftover day or a batch day, and before this it rendered exactly like a freshly cooked one, so
 * a deliberate plan read as a buggy one.
 */
export type DayKind = 'cook' | 'leftover' | 'batch' | 'empty';

export interface PlannedDay {
  iso: string;
  weekday: string;
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;
  kind: DayKind;
  /** For a repeat: the weekday whose dish this is. */
  carriedFrom?: string;
  title: string | null;
  /** The saved recipe behind the day, when the library cache has it. Absent → title only. */
  recipe?: Recipe;
}

const KIND_LABEL: Record<DayKind, string> = {
  cook: 'Cook fresh',
  leftover: 'No cooking required',
  batch: 'Batch cooked',
  empty: 'Nothing planned',
};

interface Props {
  day: PlannedDay;
  onCook: (recipe: Recipe) => void;
  onSwap: () => void;
  onMore: () => void;
}

const DayCard: React.FC<Props> = ({ day, onCook, onSwap, onMore }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const doc = day.recipe?.structured;
  const minutes = totalTimeMinutes(doc);
  const repeat = day.kind === 'leftover' || day.kind === 'batch';

  // A header per kind, so the week has a shape you can read at a glance instead of seven
  // identical rows. Colour alone never carries it — the badge says the same thing in words.
  const header =
    day.kind === 'empty' ? { bg: theme.surfaceRaised, fg: theme.muted }
    : repeat ? { bg: theme.accentFaded, fg: theme.accent }
    : { bg: theme.primaryDeep, fg: theme.onPrimaryDeep };

  if (day.kind === 'empty') {
    // One tap to fill an empty day: the picker, not a sheet that then offers the picker.
    return (
      <TouchableOpacity
        style={[styles.card, day.isPast && styles.past]}
        onPress={onSwap}
        accessibilityRole="button"
        accessibilityLabel={`${day.weekday} ${day.dateLabel}, nothing planned. Choose a recipe.`}
      >
        <View style={[styles.header, { backgroundColor: header.bg }]}>
          <DayHeading day={day} color={header.fg} />
          <Text variant="caption" style={{ color: header.fg }}>{KIND_LABEL.empty}</Text>
        </View>
        <View style={styles.emptyBody}>
          <Ionicons name="add-circle-outline" size={18} color={theme.muted} />
          <Text variant="body" tone="muted">Pick something for {day.weekday}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.card, day.isPast && styles.past]}>
      <View style={[styles.header, { backgroundColor: header.bg }]}>
        <DayHeading day={day} color={header.fg} />
        <Text variant="caption" style={{ color: header.fg }}>{KIND_LABEL[day.kind]}</Text>
      </View>

      <View style={styles.body}>
        <Text variant="title" numberOfLines={2}>{day.title}</Text>

        {repeat && (
          <Text variant="caption" tone="accent">
            {day.kind === 'leftover'
              ? `Leftovers from ${day.carriedFrom} — reheat, no cooking`
              : `Batch cooked on ${day.carriedFrom} — already made`}
          </Text>
        )}

        {doc?.summary ? (
          <Text variant="body" tone="subtle" numberOfLines={2}>{doc.summary}</Text>
        ) : null}

        <View style={styles.badges}>
          {minutes > 0 && (
            <Badge
              tone="neutral"
              label={repeat ? `${minutes} min when cooked` : `${minutes} min`}
              icon={<Ionicons name="time-outline" size={12} color={theme.accent} />}
            />
          )}
          {doc?.servings != null && (
            <Badge
              tone="neutral"
              label={`${doc.servings} servings`}
              icon={<Ionicons name="people-outline" size={12} color={theme.accent} />}
            />
          )}
        </View>

        <View style={styles.actions}>
          {/* Cook needs the full recipe, which the library cache may not hold yet for a recipe
              saved elsewhere this session. No recipe, no button — rather than a button that
              fails. */}
          {day.recipe && !repeat && (
            <TouchableOpacity style={styles.cookBtn} onPress={() => onCook(day.recipe!)} accessibilityRole="button">
              <Ionicons name="flame-outline" size={14} color={theme.onAccent} />
              <Text variant="label" style={{ color: theme.onAccent }}>Start cooking</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.ghostBtn} onPress={onSwap} accessibilityRole="button">
            <Ionicons name="swap-horizontal" size={14} color={theme.accent} />
            <Text variant="label" tone="accent">Swap</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={onMore}
            accessibilityRole="button"
            accessibilityLabel={`More options for ${day.weekday}`}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={theme.subtext} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const DayHeading: React.FC<{ day: PlannedDay; color: string }> = ({ day, color }) => (
  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
    <Text variant="label" style={{ color }}>{day.weekday}</Text>
    <Text variant="caption" style={{ color, opacity: 0.8 }}>{day.dateLabel}</Text>
    {day.isToday && <Text variant="caption" style={{ color, opacity: 0.8 }}>· Today</Text>}
  </View>
);

const makeStyles = (t: Theme) => StyleSheet.create({
  card: {
    backgroundColor: t.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden',
  },
  // A day that has already happened is context, not a decision. Dimmed, still readable.
  past: { opacity: 0.55 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  body: { padding: space.md, gap: space.sm },
  emptyBody: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  cookBtn: {
    flexDirection: 'row', alignItems: 'center', gap: space.xs,
    backgroundColor: t.accent, paddingHorizontal: space.md, paddingVertical: space.sm,
    borderRadius: radius.full,
  },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', gap: space.xs,
    paddingHorizontal: space.md, paddingVertical: space.sm,
    borderRadius: radius.full, borderWidth: 1, borderColor: t.border,
  },
});

export default DayCard;
