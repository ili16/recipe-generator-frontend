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
import type { MealPlanItem } from '../../types';
import { buildWeek } from './planDays';

const item = (iso: string, recipeId: number, title: string): MealPlanItem =>
  ({ id: Number(iso.replace(/-/g, '')), recipe_id: recipeId, recipe_title: title, planned_on: iso, start_time: '18:00:00' });

const weekStart = new Date(2026, 8, 7); // Mon 2026-09-07 … Sun 2026-09-13
const today = new Date(2026, 8, 9); // Wednesday

const run = (items: MealPlanItem[], opts: { priorItem?: MealPlanItem; noCookDays?: string[] } = {}) =>
  buildWeek({
    weekStart,
    today,
    itemsByDate: Object.fromEntries(items.map(i => [i.planned_on, i])),
    priorItem: opts.priorItem ?? null,
    recipesById: {},
    noCookDays: (opts.noCookDays ?? []) as never[],
  });

export function check(): void {
  // A repeat on a declared no-cook day is a leftover, and names the day it came from.
  let d = run([item('2026-09-07', 1, 'Roast'), item('2026-09-08', 1, 'Roast')], { noCookDays: ['tuesday'] });
  assert.equal(d[0].kind, 'cook');
  assert.equal(d[1].kind, 'leftover');
  assert.equal(d[1].carriedFrom, d[0].weekday);

  // The same repeat with no no-cook preference is a batch day, not a leftover.
  d = run([item('2026-09-07', 1, 'Roast'), item('2026-09-08', 1, 'Roast')]);
  assert.equal(d[1].kind, 'batch');

  // A run of repeats traces back to the day actually cooked, not to the previous repeat.
  d = run(
    [item('2026-09-07', 1, 'Roast'), item('2026-09-08', 1, 'Roast'), item('2026-09-09', 1, 'Roast')],
    { noCookDays: ['tuesday', 'wednesday'] },
  );
  assert.deepEqual(d.slice(0, 3).map(x => x.kind), ['cook', 'leftover', 'leftover']);
  assert.equal(d[2].carriedFrom, d[0].weekday);

  // A different recipe is a fresh cook even on a no-cook day.
  d = run([item('2026-09-07', 1, 'Roast'), item('2026-09-08', 2, 'Curry')], { noCookDays: ['tuesday'] });
  assert.equal(d[1].kind, 'cook');

  // The window's first day can carry the day *before* the window forward.
  d = run([item('2026-09-07', 1, 'Roast')], { priorItem: item('2026-09-06', 1, 'Roast'), noCookDays: ['monday'] });
  assert.equal(d[0].kind, 'leftover');
  assert.equal(d[0].carriedFrom, 'Sunday');

  // An empty day breaks the chain: the same dish after a gap is cooked again, not carried.
  d = run([item('2026-09-07', 1, 'Roast'), item('2026-09-09', 1, 'Roast')], { noCookDays: ['wednesday'] });
  assert.deepEqual(d.slice(0, 3).map(x => x.kind), ['cook', 'empty', 'cook']);

  // Past days are dimmed, today is marked.
  d = run([]);
  assert.deepEqual(d.map(x => x.isPast), [true, true, false, false, false, false, false]);
  assert.equal(d[2].isToday, true);

  console.log('planDays: all 7 checks pass');
}

check();
