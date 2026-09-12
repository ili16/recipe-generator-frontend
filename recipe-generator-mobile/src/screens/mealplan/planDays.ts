import type { MealPlanItem, Recipe, Weekday } from '../../types';
import { addDays, toISODate, weekdayName } from '../../utils/mealPlanDates';
import type { PlannedDay, PlannedMeal } from './DayCard';

/**
 * Turn seven dates plus the plan cache into what the week view renders.
 *
 * The only real logic here: **a repeated dish is labelled as one.** The backend already
 * guarantees a no-cook day carries the last cooked day's recipe forward by construction
 * (`enforceNoCookCarryover`, `internal/service/mealplan.go`) and a batch-days preference makes the
 * model repeat a dish across N days — but `MealPlanItem` carries no flag saying so, so the
 * planner used to render a carried-forward day exactly like a freshly cooked one and the plan
 * looked broken rather than deliberate.
 *
 * The signal is "the day before held this same `recipe_id`", which needs no API change. Which
 * *kind* of repeat it is comes from the user's own `meal_plan_no_cook_days`.
 *
 * A day holds a meal per slot since BACKLOG 6.4, so the repeat question is asked **per dish**
 * rather than per day: Tuesday's lunch can be Monday's leftovers while Tuesday's dinner is
 * freshly cooked.
 *
 * `priorDay` is the day *before* the window — a Monday can carry Sunday's dish forward, and
 * without it the first day of every week mislabels itself as freshly cooked.
 */
export function buildWeek(args: {
  weekStart: Date;
  today: Date;
  itemsByDate: Record<string, MealPlanItem[]>;
  priorDay: MealPlanItem[];
  recipesById: Record<number, Recipe>;
  noCookDays: Weekday[];
}): PlannedDay[] {
  const { weekStart, today, itemsByDate, priorDay, recipesById, noCookDays } = args;
  const todayISO = toISODate(today);

  let previousIDs = new Set(priorDay.map(i => i.recipe_id));
  // recipe id → the weekday whose cooking a run of repeats traces back to. Only a
  // genuinely cooked day writes it, so Wednesday-after-two-leftover-days still says
  // "from Monday", and a dish dropped for a day is cooked afresh when it returns.
  let cookedOn: Record<number, string> = {};
  for (const item of priorDay) cookedOn[item.recipe_id] = weekdayLabel(item.planned_on);

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const iso = toISODate(date);
    const items = itemsByDate[iso] ?? [];
    const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
    const isNoCookDay = noCookDays.includes(weekdayName(date));

    // The same dish twice in one day (a lunch of last night's dinner, say) is a repeat
    // too — the earlier slot is the cook, the later one is carried.
    const servedToday = new Set<number>();
    const meals: PlannedMeal[] = items.map(item => {
      const repeats = previousIDs.has(item.recipe_id) || servedToday.has(item.recipe_id);
      servedToday.add(item.recipe_id);
      const carriedFrom = repeats ? cookedOn[item.recipe_id] : undefined;
      if (carriedFrom === undefined) cookedOn[item.recipe_id] = weekday;
      return {
        item,
        slot: item.meal_slot,
        kind: carriedFrom === undefined ? 'cook' : isNoCookDay ? 'leftover' : 'batch',
        carriedFrom,
        title: item.recipe_title,
        servings: item.servings ?? null,
        recipe: recipesById[item.recipe_id],
      };
    });

    // A dish absent today breaks its chain: served again later it was cooked again, not
    // carried forward.
    const todayIDs = new Set(items.map(m => m.recipe_id));
    cookedOn = Object.fromEntries(
      Object.entries(cookedOn).filter(([id]) => todayIDs.has(Number(id))),
    );
    previousIDs = todayIDs;

    return {
      iso,
      weekday,
      dateLabel: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      isToday: iso === todayISO,
      isPast: iso < todayISO,
      meals,
    };
  });
}

const weekdayLabel = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' });
};
