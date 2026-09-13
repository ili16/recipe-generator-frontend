import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import apiService from '../../services/apiService';
import { Recipe, MealPlanItem, MealSlot, MEAL_SLOTS } from '../../types';
import { useTheme, Theme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { useMealPlanContext } from '../../context/MealPlanContext';
import { toISODate, addDays, startOfWeek } from '../../utils/mealPlanDates';
import { RootStackParamList } from '../../navigation/AppNavigator';
import RecipePickerModal from './RecipePickerModal';
import DayCard, { PlannedMeal } from './DayCard';
import { buildWeek } from './planDays';
import { usePreferences } from '../../hooks/usePreferences';
import { radius, space } from '../../theme';
import { Button, Sheet, SheetRow, Text } from '../../components/ui';

interface Props {
  selectedDate: Date;
  onChangeDate: (d: Date) => void;
  navigation: NativeStackScreenProps<RootStackParamList, 'MealPlan'>['navigation'];
}

/**
 * The week, as cards rather than a settings list.
 *
 * Three things drive the layout, all of them complaints about what this used to be:
 *  - **"What should I eat?" is the question**, so the answer leads the screen (`TodayBanner`,
 *    rendered above by `MealPlanScreen`) and the date navigation is a quiet row, not the
 *    dominant element it was when it sat in a bordered bar at the top.
 *  - **A repeated meal is deliberate**, and now says so — see `planDays.ts`.
 *  - **Changing a day should not cost three taps.** Swap opens the picker directly and Cook
 *    starts cooking; the sheet holds only what is left (ask the assistant, clear).
 *
 * Everything conversational still happens in the chat thread (BACKLOG 4.2) — this screen shows
 * what is saved and hands over a prompt.
 */
const WeekView: React.FC<Props> = ({ selectedDate, onChangeDate, navigation }) => {
  const prefs = usePreferences();
  const weekStart = useMemo(() => startOfWeek(selectedDate, prefs?.week_start_day ?? 'monday'), [selectedDate, prefs?.week_start_day]);
  // One day before the window: a carried-forward Monday takes its dish from Sunday, and without
  // that day loaded the first card of every week mislabels itself as freshly cooked.
  const fetchStartISO = toISODate(addDays(weekStart, -1));
  const weekStartISO = toISODate(weekStart);
  const weekEndISO = toISODate(addDays(weekStart, 6));

  const { itemsByDate, recipes, ensureRange, upsertItem, removeItem } = useMealPlanContext();
  // A sheet and a picker are both about one *slot* of one day since BACKLOG 6.4, so both
  // carry the slot they were opened for.
  const [sheetMeal, setSheetMeal] = useState<PlannedMeal | null>(null);
  const [picker, setPicker] = useState<{ iso: string; slot: MealSlot } | null>(null);
  const [slotChoiceDay, setSlotChoiceDay] = useState<string | null>(null);

  const { theme } = useTheme();
  const { showAlert } = useAlert();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  useEffect(() => { ensureRange(fetchStartISO, weekEndISO); }, [fetchStartISO, weekEndISO, ensureRange]);

  // The assistant writes to the plan server-side, so re-read the week whenever we come
  // back from the chat thread instead of trusting the cache we left with.
  useEffect(() => navigation.addListener('focus', () => ensureRange(fetchStartISO, weekEndISO)),
    [navigation, fetchStartISO, weekEndISO, ensureRange]);

  const askAssistant = (prompt: string) => {
    setSheetMeal(null);
    navigation.navigate('Chat', { prompt });
  };

  const assign = async (recipe: Recipe) => {
    if (!picker) return;
    const { iso, slot } = picker;
    setPicker(null);
    try {
      upsertItem(await apiService.addMealPlanItem(recipe.id, iso, undefined, slot));
    } catch (error) {
      console.error('Error assigning recipe:', error);
      showAlert('Error', 'Failed to add recipe to plan', 'error');
    }
  };

  // Servings are set by re-assigning the same recipe to the same day and slot: POST
  // /meal-plan/items upserts on exactly that key, so there is no separate endpoint to
  // call (BACKLOG 6.2).
  const setServings = async (item: MealPlanItem, servings: number) => {
    if (servings < 1 || servings > 99) return;
    try {
      upsertItem(await apiService.addMealPlanItem(item.recipe_id, item.planned_on, servings, item.meal_slot));
    } catch (error) {
      console.error('Error setting servings:', error);
      showAlert('Error', 'Failed to change servings', 'error');
    }
  };

  const clear = async (item: MealPlanItem) => {
    setSheetMeal(null);
    try {
      await apiService.deleteMealPlanItem(item.id);
      removeItem(item);
    } catch (error) {
      console.error('Error removing meal plan item:', error);
      showAlert('Error', 'Failed to remove recipe from plan', 'error');
    }
  };

  const recipesById = useMemo(
    () => Object.fromEntries(recipes.map(r => [r.id, r])) as Record<number, Recipe>,
    [recipes],
  );

  const days = useMemo(() => buildWeek({
    weekStart,
    today: new Date(),
    itemsByDate,
    priorDay: itemsByDate[fetchStartISO] ?? [],
    recipesById,
    noCookDays: prefs?.meal_plan_no_cook_days ?? [],
  }), [weekStart, itemsByDate, fetchStartISO, recipesById, prefs?.meal_plan_no_cook_days]);

  const sheetItem = sheetMeal?.item ?? null;
  const sheetWeekday = sheetMeal ? days.find(d => d.iso === sheetMeal.item.planned_on)?.weekday ?? '' : '';
  const planned = days.filter(d => d.meals.length > 0).length;
  // Unset servings mean "as the recipe is written", so the stepper starts from what the
  // recipe yields (or 2, when the library cache doesn't know) rather than from zero.
  const sheetServings = sheetItem?.servings ?? sheetMeal?.recipe?.structured?.servings ?? 2;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.weekNav}>
          <TouchableOpacity
            onPress={() => onChangeDate(addDays(selectedDate, -7))}
            style={styles.navButton}
            accessibilityRole="button"
            accessibilityLabel="Previous week"
          >
            <Ionicons name="chevron-back" size={16} color={theme.subtext} />
          </TouchableOpacity>
          <Text variant="caption" tone="subtle">
            {weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            {' – '}
            {addDays(weekStart, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            {`  ·  ${planned} of 7 planned`}
          </Text>
          <TouchableOpacity
            onPress={() => onChangeDate(addDays(selectedDate, 7))}
            style={styles.navButton}
            accessibilityRole="button"
            accessibilityLabel="Next week"
          >
            <Ionicons name="chevron-forward" size={16} color={theme.subtext} />
          </TouchableOpacity>
        </View>

        {days.map(day => (
          <DayCard
            key={day.iso}
            day={day}
            onCook={recipe => navigation.navigate('CookingMode', { recipe })}
            onSwap={slot => setPicker({ iso: day.iso, slot })}
            onMore={setSheetMeal}
            onAdd={() => setSlotChoiceDay(day.iso)}
          />
        ))}

        <Button
          title={planned === 0 ? 'Plan my week' : 'Re-plan this week'}
          variant="secondary"
          fullWidth
          icon={<Ionicons name="sparkles" size={16} color={theme.text} />}
          onPress={() => askAssistant(`Plan my week starting ${weekStartISO}, using my saved recipes.`)}
        />

        <TouchableOpacity
          style={styles.prefsLinkRow}
          onPress={() => navigation.navigate('Preferences')}
          accessibilityRole="button"
        >
          <Text variant="caption" tone="accent">Planning preferences</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.accent} />
        </TouchableOpacity>
      </ScrollView>

      <Sheet visible={sheetMeal !== null} onClose={() => setSheetMeal(null)} title={sheetWeekday}>
        {sheetItem && (
          <View style={styles.servingsRow}>
            <Text variant="body">Cooking for</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setServings(sheetItem, sheetServings - 1)}
                accessibilityRole="button"
                accessibilityLabel="One fewer serving"
              >
                <Ionicons name="remove" size={16} color={theme.accent} />
              </TouchableOpacity>
              <Text variant="title">{sheetServings}</Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setServings(sheetItem, sheetServings + 1)}
                accessibilityRole="button"
                accessibilityLabel="One more serving"
              >
                <Ionicons name="add" size={16} color={theme.accent} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        {sheetMeal && (
          <SheetRow
            label="Ask the assistant"
            onPress={() => askAssistant(
              `Change ${sheetWeekday} ${sheetMeal.item.planned_on} ${sheetMeal.slot} — it's currently ${sheetMeal.title}.`)}
          />
        )}
        {sheetItem && <SheetRow label="Clear" destructive onPress={() => clear(sheetItem)} />}
      </Sheet>

      {/* Which meal the new dish is — asked only when adding a second one, since the
          empty card and Swap already know the slot they mean. */}
      <Sheet visible={slotChoiceDay !== null} onClose={() => setSlotChoiceDay(null)} title="Which meal?">
        {MEAL_SLOTS.map(slot => (
          <SheetRow
            key={slot}
            label={slot[0].toUpperCase() + slot.slice(1)}
            onPress={() => {
              setPicker({ iso: slotChoiceDay!, slot });
              setSlotChoiceDay(null);
            }}
          />
        ))}
      </Sheet>

      <RecipePickerModal
        visible={picker !== null}
        recipes={recipes}
        onSelect={assign}
        onClose={() => setPicker(null)}
      />
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  list: { padding: space.md, gap: space.md },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: { padding: space.xs },
  servingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepperBtn: {
    padding: space.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: t.border,
  },
  prefsLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
  },
});

export default WeekView;
