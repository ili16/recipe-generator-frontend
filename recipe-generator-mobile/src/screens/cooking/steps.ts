import { RecipeDocument } from '../../types';

export type Step = RecipeDocument['steps'][number];
export type Ingredient = RecipeDocument['ingredients'][number];

// Match ingredients mentioned in a step — use DB-provided indices if available, fall back to text matching.
export function getStepIngredients(step: Step, allIngredients: Ingredient[]): Ingredient[] {
  if (step.ingredient_indices && step.ingredient_indices.length > 0) {
    return step.ingredient_indices
      .filter(i => i >= 0 && i < allIngredients.length)
      .map(i => allIngredients[i]);
  }
  // Fallback for recipes without DB-backed indices.
  const lower = step.step_text.toLowerCase();
  return allIngredients.filter(ing => {
    const words = ing.item.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !/^\d/.test(w));
    return words.length > 0 && words.some(w => lower.includes(w));
  });
}

export function formatTimer(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m} min`;
}
