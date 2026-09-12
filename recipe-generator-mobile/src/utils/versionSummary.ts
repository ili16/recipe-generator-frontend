import { RecipeDocument } from '../types';

// One-line, human summary of what changed between two consecutive snapshots. entries are
// newest-first (as returned by the history endpoint), so `prev` is the chronologically
// earlier one at index+1.
export function summarizeVersionChange(curr: RecipeDocument, prev?: RecipeDocument): string {
  if (!prev) return 'Initial version';
  const changes: string[] = [];
  if (curr.title !== prev.title) changes.push(`Renamed to "${curr.title}"`);
  if (curr.servings !== prev.servings) changes.push(`Servings ${prev.servings ?? '—'} → ${curr.servings ?? '—'}`);
  if (curr.total_minutes !== prev.total_minutes) changes.push(`Total ${prev.total_minutes ?? '—'} → ${curr.total_minutes ?? '—'} min`);
  if (curr.prep_minutes !== prev.prep_minutes) changes.push(`Prep ${prev.prep_minutes ?? '—'} → ${curr.prep_minutes ?? '—'} min`);
  if (curr.cook_minutes !== prev.cook_minutes) changes.push(`Cook ${prev.cook_minutes ?? '—'} → ${curr.cook_minutes ?? '—'} min`);
  if (curr.difficulty !== prev.difficulty) changes.push('Difficulty changed');
  if ((curr.summary ?? '') !== (prev.summary ?? '')) changes.push('Summary updated');

  const prevIngredients = new Set(prev.ingredients.map(i => i.item.trim().toLowerCase()));
  const currIngredients = new Set(curr.ingredients.map(i => i.item.trim().toLowerCase()));
  const added = [...currIngredients].filter(i => !prevIngredients.has(i)).length;
  const removed = [...prevIngredients].filter(i => !currIngredients.has(i)).length;
  if (added) changes.push(`+${added} ingredient${added > 1 ? 's' : ''}`);
  if (removed) changes.push(`-${removed} ingredient${removed > 1 ? 's' : ''}`);

  if (curr.steps.length !== prev.steps.length) {
    const diff = curr.steps.length - prev.steps.length;
    changes.push(`${diff > 0 ? '+' : ''}${diff} step${Math.abs(diff) > 1 ? 's' : ''}`);
  } else if (curr.steps.some((s, i) => s.step_text !== prev.steps[i]?.step_text)) {
    changes.push('Steps updated');
  }

  return changes.length ? changes.join(' · ') : 'Minor edit';
}
