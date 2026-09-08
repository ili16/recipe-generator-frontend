export interface Recipe {
  id: number;
  recipename: string;
  recipe: string;
  tags?: string[];
  createdAt?: string;
  structured?: RecipeDocument;
  manually_edited?: boolean;
  my_vote?: 1 | -1 | null;
  // Links back to the saved recipe this was generated as a variant of (POST
  // /meal-plan/variants/:id, persisted at save time), if any.
  variant_of_recipe_id?: number | null;
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
  generation_id?: string;
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

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

// GET/PATCH /preferences - explicit profile settings the user can set about themselves.
export interface UserPreferences {
  skill_level: 'beginner' | 'intermediate' | 'advanced' | null;
  dietary_prefs: string[];
  disliked_ingredients: string[];
  cooking_cadence: 'daily' | 'every_couple_days' | 'meal_prep_batching' | null;
  // Meal-plan scheduling: days the user needs no food planned at all (a true skip), days
  // they don't want to cook but still eat (a leftover day, repeats the prior cooked
  // day's dish), and how many consecutive days one recipe should cover (1 = fresh every
  // day).
  meal_plan_no_food_days: Weekday[];
  meal_plan_no_cook_days: Weekday[];
  meal_plan_batch_days: 1 | 2 | 3;
  // Which weekday the user's meal-plan week begins on.
  week_start_day: Weekday;
}

// GET/PATCH /meal-plan/week-preferences?starts_on=... - per-week override of the 3
// scheduling fields above. null on a field means "inherit the global UserPreferences
// default"; a concrete value (including an empty array) overrides it for that week.
export interface MealPlanWeekPreferences {
  no_food_days: Weekday[] | null;
  no_cook_days: Weekday[] | null;
  batch_days: 1 | 2 | 3 | null;
}

export type GenerateMethod = 'description' | 'link' | 'image' | 'voice';

// GET /meal-plan - one recipe assigned to one day (and time) of a meal plan.
export interface MealPlanItem {
  id: number;
  recipe_id: number;
  recipe_title: string;
  planned_on: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
}

export interface MealPlanWeek {
  starts_on: string; // YYYY-MM-DD
  ends_on: string; // YYYY-MM-DD
  items: MealPlanItem[];
}

// One proposed day in an AI-suggested meal plan (POST /meal-plan/suggest,
// /meal-plan/chat). Exactly one of recipe_id or variant is set.
export interface MealPlanAssignment {
  recipe_id: number | null;
  variant: RecipeDocument | null;
  variant_of_recipe_id: number | null;
  planned_on: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
}

export interface MealPlanSuggestion {
  status: 'applied' | 'needs_clarification';
  message: string | null;
  low_variety: boolean;
  assignments: MealPlanAssignment[];
}

// One exchange in an in-progress /meal-plan/chat conversation.
export interface MealPlanChatTurn {
  message: string;
  plan: MealPlanSuggestion;
}
