import type { MealPlanItem, Recipe, Weekday } from '../../types';
import { addDays, toISODate, weekdayName } from '../../utils/mealPlanDates';
import type { DayKind, PlannedDay } from './DayCard';

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
 * The signal is "same `recipe_id` as the previous day", which needs no API change. Which *kind*
 * of repeat it is comes from the user's own `meal_plan_no_cook_days`.
 *
 * `priorItem` is the day *before* the window — a Monday can carry Sunday's dish forward, and
 * without it the first day of every week mislabels itself as freshly cooked.
 */
export function buildWeek(args: {
  weekStart: Date;
  today: Date;
  itemsByDate: Record<string, MealPlanItem>;
  priorItem: MealPlanItem | null;
  recipesById: Record<number, Recipe>;
  noCookDays: Weekday[];
}): PlannedDay[] {
  const { weekStart, today, itemsByDate, priorItem, recipesById, noCookDays } = args;
  const todayISO = toISODate(today);

  let previous: MealPlanItem | null = priorItem;
  // The day whose cooking a run of repeats traces back to. Only a genuinely cooked day
  // advances it, so Wednesday-after-two-leftover-days still says "from Monday".
  let lastCookedWeekday: string | null =
    priorItem ? weekdayLabel(priorItem.planned_on) : null;

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const iso = toISODate(date);
    const item = itemsByDate[iso] ?? null;
    const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });

    let kind: DayKind = 'empty';
    let carriedFrom: string | undefined;

    if (item) {
      const repeats = previous != null && previous.recipe_id === item.recipe_id;
      if (repeats) {
        kind = noCookDays.includes(weekdayName(date)) ? 'leftover' : 'batch';
        carriedFrom = lastCookedWeekday ?? undefined;
      } else {
        kind = 'cook';
        lastCookedWeekday = weekday;
      }
    }
    // An empty day breaks the chain: nothing was cooked, and nothing carried forward.
    previous = item;
    if (!item) lastCookedWeekday = null;

    return {
      iso,
      weekday,
      dateLabel: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      isToday: iso === todayISO,
      isPast: iso < todayISO,
      kind,
      carriedFrom,
      title: item?.recipe_title ?? null,
      recipe: item ? recipesById[item.recipe_id] : undefined,
    };
  });
}

const weekdayLabel = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' });
};
