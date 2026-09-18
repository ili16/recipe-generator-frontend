import { RecipeDocument } from '../types';

export type Ingredient = RecipeDocument['ingredients'][number];

// One ingredient as a line: "250 g flour". quantity_text wins when the model wrote an
// amount words rather than a number ("a pinch of"). Lives here rather than in RecipeView
// because it is a pure string function that non-rendering code — the version diff, its
// assert script — needs too.
export const fmtIngredient = (ing: Ingredient): string => {
  const qty = ing.quantity_text ?? (ing.quantity != null ? `${ing.quantity}${ing.unit ? ' ' + ing.unit : ''}` : null);
  return qty ? `${qty} ${ing.item}` : ing.item;
};
