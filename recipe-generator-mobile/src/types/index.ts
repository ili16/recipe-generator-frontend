export interface Recipe {
  id: number;
  recipename: string;
  recipe: string;
  tags?: string[];
  createdAt?: string;
  structured?: RecipeDocument;
  manually_edited?: boolean;
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
  tags: string[];
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

// POST /refine-recipe response: a status envelope instead of always a new recipe, so
// the backend can refuse a change that breaks the dish's identity, or ask the caller
// to pick from a short list of substitutions, instead of silently guessing.
export interface RefineResult {
  status: 'applied' | 'rejected' | 'needs_choice';
  message?: string;
  options?: string[];
  recipename?: string;
  recipe?: string;
  structured?: RecipeDocument;
}

// What the user originally handed the generator — carried through the review chat so
// later edits (and the eventual save) stay traceable to the initial ask.
export interface GenerationOrigin {
  prompt: string;
  source_type: 'text' | 'url' | 'image';
  source_url?: string;
}

// One accepted edit in a refinement conversation: the instruction and the resulting
// document. When persisted at save time, index 0 (change_prompt: '') stands for the
// initial generation, not an edit.
export interface EditTurn {
  change_prompt: string;
  structured: RecipeDocument;
}

// PATCH /update-recipe - persist edits to a saved recipe. ai_sourced omitted/false means a
// manual edit (flags the recipe manually_edited); true clears that flag (an applied AI
// refine result now backs the recipe instead). change_prompt is optional and, for an
// ai_sourced update, is recorded as that edit's change_note in the recipe's history.
export interface PatchRecipePayload {
  id: number;
  structured: RecipeDocument;
  ai_sourced?: boolean;
  change_prompt?: string;
}

// GET /recipes/:id/history - one snapshot in a saved recipe's edit trail, newest first.
// change_note carries the AI instruction for change_kind "ai_edit"; absent otherwise.
export interface RecipeVersion {
  version: number;
  change_kind: 'extraction' | 'manual' | 'ai_edit' | 'import';
  change_note?: string;
  created_at: string;
  data: RecipeDocument;
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
