/**
 * Self-check for `buildWeek` — the only real logic in the planner, and the piece that decides
 * whether a repeated dish reads as deliberate or as a bug.
 *
 * There is no test runner in this repo (see `AGENT.md`), so this is a plain assert script.
 * Run it:
 *
 *   npx tsc src/screens/mealplan/planDays.check.ts --outDir /tmp/pd --module commonjs \
 *     --target es2019 --moduleResolution node --skipLibCheck ; node /tmp/pd/screens/mealplan/planDays.check.js
 *
 * (tsc reports TS6142 for the type-only `./DayCard` import and emits anyway — that is expected.)
 * Nothing imports this file, so it never reaches a bundle; `npx tsc --noEmit` still typechecks it.
 */
import { strict as assert } from 'assert';
import type { MealPlanItem, MealSlot } from '../../types';
import { buildWeek } from './planDays';

let nextID = 1;
const item = (iso: string, recipeId: number, title: string, slot: MealSlot = 'dinner'): MealPlanItem =>
  ({ id: nextID++, recipe_id: recipeId, recipe_title: title, planned_on: iso, meal_slot: slot });

const weekStart = new Date(2026, 8, 7); // Mon 2026-09-07 … Sun 2026-09-13
const today = new Date(2026, 8, 9); // Wednesday

const run = (items: MealPlanItem[], opts: { priorDay?: MealPlanItem[]; noCookDays?: string[] } = {}) => {
  const itemsByDate: Record<string, MealPlanItem[]> = {};
  for (const i of items) itemsByDate[i.planned_on] = [...(itemsByDate[i.planned_on] ?? []), i];
  return buildWeek({
    weekStart,
    today,
    itemsByDate,
    priorDay: opts.priorDay ?? [],
    recipesById: {},
    noCookDays: (opts.noCookDays ?? []) as never[],
  });
};

// Every assertion below is about the single meal of a day unless it says otherwise.
const only = (day: { meals: { kind: string; carriedFrom?: string }[] }) => day.meals[0];
const kindOf = (day: { meals: { kind: string }[] }) => day.meals[0]?.kind ?? 'empty';

export function check(): void {
  // A repeat on a declared no-cook day is a leftover, and names the day it came from.
  let d = run([item('2026-09-07', 1, 'Roast'), item('2026-09-08', 1, 'Roast')], { noCookDays: ['tuesday'] });
  assert.equal(kindOf(d[0]), 'cook');
  assert.equal(kindOf(d[1]), 'leftover');
  assert.equal(only(d[1]).carriedFrom, d[0].weekday);

  // The same repeat with no no-cook preference is a batch day, not a leftover.
  d = run([item('2026-09-07', 1, 'Roast'), item('2026-09-08', 1, 'Roast')]);
  assert.equal(kindOf(d[1]), 'batch');

  // A run of repeats traces back to the day actually cooked, not to the previous repeat.
  d = run(
    [item('2026-09-07', 1, 'Roast'), item('2026-09-08', 1, 'Roast'), item('2026-09-09', 1, 'Roast')],
    { noCookDays: ['tuesday', 'wednesday'] },
  );
  assert.deepEqual(d.slice(0, 3).map(kindOf), ['cook', 'leftover', 'leftover']);
  assert.equal(only(d[2]).carriedFrom, d[0].weekday);

  // A different recipe is a fresh cook even on a no-cook day.
  d = run([item('2026-09-07', 1, 'Roast'), item('2026-09-08', 2, 'Curry')], { noCookDays: ['tuesday'] });
  assert.equal(kindOf(d[1]), 'cook');

  // The window's first day can carry the day *before* the window forward.
  d = run([item('2026-09-07', 1, 'Roast')], { priorDay: [item('2026-09-06', 1, 'Roast')], noCookDays: ['monday'] });
  assert.equal(kindOf(d[0]), 'leftover');
  assert.equal(only(d[0]).carriedFrom, 'Sunday');

  // An empty day breaks the chain: the same dish after a gap is cooked again, not carried.
  d = run([item('2026-09-07', 1, 'Roast'), item('2026-09-09', 1, 'Roast')], { noCookDays: ['wednesday'] });
  assert.deepEqual(d.slice(0, 3).map(kindOf), ['cook', 'empty', 'cook']);

  // Past days are dimmed, today is marked.
  d = run([]);
  assert.deepEqual(d.map(x => x.isPast), [true, true, false, false, false, false, false]);
  assert.equal(d[2].isToday, true);

  // BACKLOG 6.4: a day holds a meal per slot. Both survive, in the order the day is
  // eaten, and each is classified on its own.
  d = run([
    item('2026-09-07', 1, 'Roast'),
    item('2026-09-08', 2, 'Porridge', 'breakfast'),
    item('2026-09-08', 1, 'Roast', 'lunch'),
    item('2026-09-08', 3, 'Curry'),
  ], { noCookDays: ['tuesday'] });
  assert.deepEqual(d[1].meals.map(m => m.slot), ['breakfast', 'lunch', 'dinner']);
  assert.deepEqual(d[1].meals.map(m => m.kind), ['cook', 'leftover', 'cook']);
  assert.equal(d[1].meals[1].carriedFrom, 'Monday');

  // The same dish twice in one day: the earlier slot cooks it, the later one carries it.
  d = run([item('2026-09-07', 1, 'Roast', 'lunch'), item('2026-09-07', 1, 'Roast')]);
  assert.deepEqual(d[0].meals.map(m => m.kind), ['cook', 'batch']);
  assert.equal(d[0].meals[1].carriedFrom, 'Monday');

  console.log('planDays: all 9 checks pass');
}

check();
