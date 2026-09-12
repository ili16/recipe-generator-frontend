import type { Recipe } from '../../types';

/**
 * The three cheap library filters from BACKLOG 6.5 — all of them read fields the list
 * payload already carries, so none of them costs a request.
 */
export type QuickFilter = 'favourite' | 'fast' | 'batch';

export const QUICK_FILTER_LABELS: Record<QuickFilter, string> = {
  favourite: 'Favourites',
  fast: 'Fast (<25m)',
  batch: 'Batch cooked',
};

// A recipe with no time or servings recorded is not "fast" and not "batch" — unknown is
// excluded rather than guessed, so a filter never promises something it can't back.
const MATCHES: Record<QuickFilter, (r: Recipe) => boolean> = {
  favourite: r => r.my_vote === 1,
  fast: r => (r.total_minutes ?? 0) > 0 && r.total_minutes! < 25,
  batch: r => (r.servings ?? 0) >= 4,
};

/** Every selected filter must match — they narrow, like the tag filters above them. */
export const matchesQuickFilters = (recipe: Recipe, active: Set<QuickFilter>): boolean =>
  Array.from(active).every(f => MATCHES[f](recipe));
