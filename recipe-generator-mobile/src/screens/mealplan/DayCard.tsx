import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MealPlanItem, MealSlot, MEAL_SLOTS, Recipe } from '../../types';
import { Theme, useTheme } from '../../context/ThemeContext';
import { radius, space } from '../../theme';
import { Badge, Text } from '../../components/ui';
import { totalTimeMinutes } from '../../utils/recipeTime';

/**
 * One day of the plan. `DESIGN_SYSTEM.md` §7.4's `DayCard`, declined in 5.8 for want of a second
 * caller and built here because the planner rebuild is that caller.
 *
 * Each meal carries its own *kind*, which is the whole point: a repeated dish is either a
 * leftover or a batch, and before this it rendered exactly like a freshly cooked one, so
 * a deliberate plan read as a buggy one.
 *
 * A day holds a meal per slot since BACKLOG 6.4 — one card, one row per meal, and the slot
 * name only appears once there is more than dinner to distinguish.
 */
export type DayKind = 'cook' | 'leftover' | 'batch' | 'empty';

/** One planned meal within a day, already classified by `planDays.ts`. */
export interface PlannedMeal {
  item: MealPlanItem;
  slot: MealSlot;
  kind: Exclude<DayKind, 'empty'>;
  /** For a repeat: the weekday whose dish this is. */
  carriedFrom?: string;
  /** For a repeat: which portion of the cook's pot this is, and how many it makes in all. */
  portion?: { index: number; total: number };
  /** For a cook: how many *later* days this one pot also covers. 0 for an ordinary day. */
  covers: number;
  title: string;
  /** Portions wanted that day (BACKLOG 6.2); null falls back to what the recipe yields. */
  servings?: number | null;
  /** The saved recipe behind the meal, when the library cache has it. Absent → title only. */
  recipe?: Recipe;
}

export interface PlannedDay {
  iso: string;
  weekday: string;
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;
  /** In the order the day is eaten. Empty means nothing is planned. */
  meals: PlannedMeal[];
}

const KIND_LABEL: Record<DayKind, string> = {
  cook: 'Cook fresh',
  leftover: 'No cooking required',
  batch: 'Batch cooked',
  empty: 'Nothing planned',
};

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

interface Props {
  day: PlannedDay;
  onCook: (recipe: Recipe) => void;
  /** Choose a recipe for a slot — the empty card and every row's Swap. */
  onSwap: (slot: MealSlot) => void;
  onMore: (meal: PlannedMeal) => void;
  /** Add another meal to a day that already has one (BACKLOG 6.4). */
  onAdd: () => void;
  /** The one action a leftover row offers (BACKLOG 9.11). */
  onClear: (meal: PlannedMeal) => void;
  /** How many people the user cooks for (BACKLOG 9.12); null when they never said. */
  householdSize: number | null;
  /** Scale a cooking day to the portions it needs. */
  onScale: (meal: PlannedMeal, servings: number) => void;
}

const DayCard: React.FC<Props> = ({ day, onCook, onSwap, onMore, onAdd, onClear, householdSize, onScale }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const allRepeats = day.meals.length > 0 && day.meals.every(m => m.kind !== 'cook');
  // Every slot taken: "Add a meal" could only ever replace something, and a control whose
  // one outcome is destroying something is not an add (BACKLOG 9.10).
  const full = day.meals.length >= MEAL_SLOTS.length;

  // A header per kind, so the week has a shape you can read at a glance instead of seven
  // identical rows. Colour alone never carries it — the badge says the same thing in words.
  const header =
    day.meals.length === 0 ? { bg: theme.surfaceRaised, fg: theme.muted }
    : allRepeats ? { bg: theme.accentFaded, fg: theme.accent }
    : { bg: theme.primaryDeep, fg: theme.onPrimaryDeep };

  // One meal speaks for the day; several are counted, because no single kind is true of
  // all of them.
  const headerLabel =
    day.meals.length === 0 ? KIND_LABEL.empty
    : day.meals.length === 1 ? KIND_LABEL[day.meals[0].kind]
    : `${day.meals.length} meals`;

  if (day.meals.length === 0) {
    // One tap to fill an empty day: the picker, not a sheet that then offers the picker.
    return (
      <TouchableOpacity
        style={[styles.card, day.isPast && styles.past]}
        onPress={() => onSwap('dinner')}
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
        <Text variant="caption" style={{ color: header.fg }}>{headerLabel}</Text>
      </View>

      {day.meals.map((meal, i) => (
        <MealRow
          key={meal.item.id}
          meal={meal}
          weekday={day.weekday}
          // The slot name is noise on a day that is just dinner, and the only way to tell
          // the rows apart once it isn't.
          showSlot={day.meals.length > 1 || meal.slot !== 'dinner'}
          divided={i > 0}
          onCook={onCook}
          onSwap={onSwap}
          onMore={onMore}
          onClear={onClear}
          householdSize={householdSize}
          onScale={onScale}
        />
      ))}

      {!full && <TouchableOpacity
        style={styles.addRow}
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={`Add another meal to ${day.weekday}`}
      >
        <Ionicons name="add" size={14} color={theme.accent} />
        <Text variant="label" tone="accent">Add a meal</Text>
      </TouchableOpacity>}
    </View>
  );
};

const MealRow: React.FC<{
  meal: PlannedMeal;
  weekday: string;
  showSlot: boolean;
  divided: boolean;
  onCook: (recipe: Recipe) => void;
  onSwap: (slot: MealSlot) => void;
  onMore: (meal: PlannedMeal) => void;
  onClear: (meal: PlannedMeal) => void;
  householdSize: number | null;
  onScale: (meal: PlannedMeal, servings: number) => void;
}> = ({ meal, weekday, showSlot, divided, onCook, onSwap, onMore, onClear, householdSize, onScale }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const doc = meal.recipe?.structured;
  const minutes = totalTimeMinutes(doc);
  const repeat = meal.kind !== 'cook';

  // BACKLOG 9.12: servings was carrying two meanings at once, so nothing could notice a
  // recipe yielding 2 planned for a household of 5. One pot has to cover the household
  // for every day it feeds — this day plus the ones its leftovers cover.
  const planned = meal.servings ?? doc?.servings ?? null;
  const needed = householdSize != null ? householdSize * (1 + meal.covers) : null;
  const mismatch = !repeat && planned != null && needed != null && planned !== needed;

  return (
    <View style={[styles.body, divided && styles.divided]}>
      {showSlot && (
        <Text variant="caption" tone="muted">
          {SLOT_LABEL[meal.slot].toUpperCase()}
          {repeat ? ` · ${KIND_LABEL[meal.kind]}` : ''}
        </Text>
      )}
      <Text variant="title" numberOfLines={2}>{meal.title}</Text>

      {repeat && (
        <Text variant="caption" tone="accent">
          {meal.kind === 'leftover'
            ? `Leftovers from ${meal.carriedFrom} — reheat, no cooking`
            : `Batch cooked on ${meal.carriedFrom} — already made`}
        </Text>
      )}

      {doc?.summary ? (
        <Text variant="body" tone="subtle" numberOfLines={2}>{doc.summary}</Text>
      ) : null}

      {/* A fact and the one-tap fix, where the servings badge already is: not a modal, not
          a blocking error, not a red border (BACKLOG 9.12). */}
      {mismatch && (
        <TouchableOpacity
          style={styles.mismatch}
          onPress={() => onScale(meal, needed!)}
          accessibilityRole="button"
          accessibilityLabel={`Makes ${planned}, cooking for ${needed}. Scale to ${needed}.`}
        >
          <Ionicons name="alert-circle-outline" size={14} color={theme.accent} />
          <Text variant="caption" tone="accent">
            {`Makes ${planned} · cooking for ${needed} — scale it?`}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.badges}>
        {minutes > 0 && (
          <Badge
            tone="neutral"
            label={repeat ? `${minutes} min when cooked` : `${minutes} min`}
            icon={<Ionicons name="time-outline" size={12} color={theme.accent} />}
          />
        )}
        {/* How much gets cooked belongs to the day that cooks, so a leftover reads its
            share of that pot rather than a number it could edit (BACKLOG 9.11). */}
        {repeat ? (
          meal.portion && (
            <Badge
              tone="neutral"
              label={`Portion ${meal.portion.index} of ${meal.portion.total}`}
              icon={<Ionicons name="people-outline" size={12} color={theme.accent} />}
            />
          )
        ) : (meal.servings ?? doc?.servings) != null ? (
          <Badge
            tone="neutral"
            label={meal.servings != null ? `Cooking for ${meal.servings}` : `${doc?.servings} servings`}
            icon={<Ionicons name="people-outline" size={12} color={theme.accent} />}
          />
        ) : null}
      </View>

      {/* A leftover is food that already exists, so every action that edits a *plan* was
          nonsense on it: swapping the contents of the fridge, stepping up how much of it was
          cooked, asking the assistant to change a plate. One decision is left — am I eating
          this — so that is the one control (BACKLOG 9.11). */}
      {repeat ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => onClear(meal)}
            accessibilityRole="button"
            accessibilityLabel={`Not eating ${weekday} ${SLOT_LABEL[meal.slot].toLowerCase()}`}
          >
            <Ionicons name="close" size={14} color={theme.subtext} />
            <Text variant="label" tone="subtle">Not eating this</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <View style={styles.actions}>
        {/* Cook needs the full recipe, which the library cache may not hold yet for a recipe
            saved elsewhere this session. No recipe, no button — rather than a button that
            fails. */}
        {meal.recipe && (
          <TouchableOpacity style={styles.cookBtn} onPress={() => onCook(meal.recipe!)} accessibilityRole="button">
            <Ionicons name="flame-outline" size={14} color={theme.onAccent} />
            <Text variant="label" style={{ color: theme.onAccent }}>Start cooking</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.ghostBtn} onPress={() => onSwap(meal.slot)} accessibilityRole="button">
          <Ionicons name="swap-horizontal" size={14} color={theme.accent} />
          <Text variant="label" tone="accent">Swap</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={() => onMore(meal)}
          accessibilityRole="button"
          accessibilityLabel={`More options for ${weekday} ${SLOT_LABEL[meal.slot].toLowerCase()}`}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={theme.subtext} />
        </TouchableOpacity>
      </View>
      )}
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
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
  addRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
  },
  emptyBody: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  mismatch: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
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
