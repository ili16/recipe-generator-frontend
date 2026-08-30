export interface Recipe {
  id: number;
  recipename: string;
  recipe: string;
  category?: string;
  createdAt?: string;
  structured?: RecipeDocument;
}

export interface RecipeGeneratePayload {
  description?: string;
  url?: string;
  image?: File;
}

export interface RecipeDocument {
  title: string;
  summary?: string | null;
  language: string;
  category: string;
  servings?: number | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  difficulty?: string | null;
  ingredients: Array<{
    section?: string | null;
    item: string;
    quantity?: number | null;
    quantity_text?: string | null;
    unit?: string | null;
    optional: boolean;
  }>;
  steps: Array<{
    sort_order: number;
    step_text: string;
    timer_seconds?: number | null;
    temperature_c?: number | null;
    ingredient_indices?: number[] | null;
  }>;
}

export interface RecipeResponse {
  recipename: string;
  recipe: string;
  structured?: RecipeDocument;
}

// PATCH /update-recipe - persist edits to a saved recipe
export interface PatchRecipePayload {
  id: number;
  recipename: string;
  recipe: string;
  category?: string;
}

export interface CookingNote {
  stepIndex: number;
  stepText: string;
  note: string;
}

export interface UserProfile {
  name: string;
  email?: string;
  username?: string;
}

export type GenerateMethod = 'description' | 'link' | 'image' | 'voice';

export interface ValidationFlag {
  type: 'ingredient' | 'step';
  idx: number;
  item?: string;
  message: string;
  suggestion: string;
}

export interface ValidateChangesPayload {
  recipe_name: string;
  structured: RecipeDocument;
  ingredient_removals: number[];
  ingredient_comments: Record<string, string>;
  step_comments: Record<string, string>;
}

export interface ValidateChangesResponse {
  flags: ValidationFlag[];
  can_proceed: boolean;
}
