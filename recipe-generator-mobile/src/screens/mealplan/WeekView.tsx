import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import apiService from '../../services/apiService';
import { Recipe, MealPlanItem, UserPreferences } from '../../types';
import { useTheme, Theme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { useMealPlanContext } from '../../context/MealPlanContext';
import { toISODate, addDays, startOfWeek } from '../../utils/mealPlanDates';
import { RootStackParamList } from '../../navigation/AppNavigator';
import RecipePickerModal from './RecipePickerModal';
import DayCard from './DayCard';
import { buildWeek } from './planDays';
import { space } from '../../theme';
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
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const weekStart = useMemo(() => startOfWeek(selectedDate, prefs?.week_start_day ?? 'monday'), [selectedDate, prefs?.week_start_day]);
  // One day before the window: a carried-forward Monday takes its dish from Sunday, and without
  // that day loaded the first card of every week mislabels itself as freshly cooked.
  const fetchStartISO = toISODate(addDays(weekStart, -1));
  const weekStartISO = toISODate(weekStart);
  const weekEndISO = toISODate(addDays(weekStart, 6));

  const { itemsByDate, recipes, ensureRange, upsertItem, removeItem } = useMealPlanContext();
  const [sheetDay, setSheetDay] = useState<string | null>(null);
  const [pickerDay, setPickerDay] = useState<string | null>(null);

  const { theme } = useTheme();
  const { showAlert } = useAlert();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  useEffect(() => { ensureRange(fetchStartISO, weekEndISO); }, [fetchStartISO, weekEndISO, ensureRange]);

  // The assistant writes to the plan server-side, so re-read the week whenever we come
  // back from the chat thread instead of trusting the cache we left with.
  useEffect(() => navigation.addListener('focus', () => ensureRange(fetchStartISO, weekEndISO)),
    [navigation, fetchStartISO, weekEndISO, ensureRange]);

  useEffect(() => {
    apiService.getPreferences().then(setPrefs).catch(error => console.error('Error loading preferences:', error));
  }, []);

  const askAssistant = (prompt: string) => {
    setSheetDay(null);
    navigation.navigate('Chat', { prompt });
  };

  const assign = async (recipe: Recipe) => {
    if (!pickerDay) return;
    const dayISO = pickerDay;
    setPickerDay(null);
    try {
      upsertItem(await apiService.addMealPlanItem(recipe.id, dayISO));
    } catch (error) {
      console.error('Error assigning recipe:', error);
      showAlert('Error', 'Failed to add recipe to plan', 'error');
    }
  };

  const clear = async (item: MealPlanItem) => {
    setSheetDay(null);
    try {
      await apiService.deleteMealPlanItem(item.id);
      removeItem(item.planned_on);
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
    priorItem: itemsByDate[fetchStartISO] ?? null,
    recipesById,
    noCookDays: prefs?.meal_plan_no_cook_days ?? [],
  }), [weekStart, itemsByDate, fetchStartISO, recipesById, prefs?.meal_plan_no_cook_days]);

  const sheet = sheetDay ? days.find(d => d.iso === sheetDay) ?? null : null;
  const sheetItem = sheetDay ? itemsByDate[sheetDay] ?? null : null;
  const planned = days.filter(d => d.kind !== 'empty').length;

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
            onSwap={() => setPickerDay(day.iso)}
            onMore={() => setSheetDay(day.iso)}
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

      <Sheet visible={sheet !== null} onClose={() => setSheetDay(null)} title={sheet?.weekday}>
        <SheetRow
          label="Ask the assistant"
          onPress={() => askAssistant(sheet!.title
            ? `Change ${sheet!.weekday} ${sheet!.iso} — it's currently ${sheet!.title}.`
            : `Plan ${sheet!.weekday} ${sheet!.iso} for me.`)}
        />
        {sheetItem && <SheetRow label="Clear" destructive onPress={() => clear(sheetItem)} />}
      </Sheet>

      <RecipePickerModal
        visible={pickerDay !== null}
        recipes={recipes}
        onSelect={assign}
        onClose={() => setPickerDay(null)}
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
  prefsLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
  },
});

export default WeekView;
