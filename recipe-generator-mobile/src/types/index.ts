export interface Recipe {
  id: number;
  recipename: string;
  recipe: string;
  tags?: string[];
  structured?: RecipeDocument;
  manually_edited?: boolean;
  my_vote?: 1 | -1 | null;
  // Links back to the saved recipe this was generated as a variant of (POST
  // /meal-plan/variants/:id, persisted at save time), if any.
  variant_of_recipe_id?: number | null;
  // Where this recipe came from, recorded at save time. `source_url` is set for
  // 'url' only; both are absent on recipes saved before BACKLOG 3.7.
  source_type?: 'text' | 'url' | 'image' | 'voice' | 'manual' | 'import';
  source_url?: string | null;
  // Denormalised onto the list payload (GET /get-recipes) so the library can filter on
  // cooking time and batch size without loading every document. Undefined = unknown.
  servings?: number | null;
  total_minutes?: number | null;
  created_at?: string;
  // Set only on the trash listing (GET /recipes/trash); absent everywhere else.
  deleted_at?: string;
}

// A user-named grouping of their own recipes (BACKLOG 8.1). `recipe_ids` is the whole
// membership, so the library filters itself client-side — there is no per-collection
// list endpoint.
export interface Collection {
  id: number;
  name: string;
  recipe_ids: number[];
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
  total_minutes?: number | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  difficulty?: string | null;
  // Per-serving macros, all nullable: they are model estimates, so null means "not
  // estimated" and must render as nothing at all, never 0 (BACKLOG 6.6).
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
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

// ---- POST /chat (the agent loop) -------------------------------------------

// A structured tool result the transcript renders as a card instead of prose.
// `draft_ref` names an unsaved draft the agent can still transform; `recipe_id` a saved one.
export type ChatArtifact =
  | { kind: 'recipe'; data: { draft_ref?: string; recipe_id?: number; document: RecipeDocument } }
  | { kind: 'week_plan'; data: { starts_on: string; ends_on: string; plan: MealPlanSuggestion } };

// What the composer can hang on a turn. An image travels inline as a data URL or bare
// base64 — /chat is JSON, and the server sniffs the bytes before they reach the model.
export type ChatAttachment =
  | { type: 'url'; url: string }
  | { type: 'image'; data: string };

// The SSE frames one turn emits, in the order they can arrive.
export type ChatStreamEvent =
  | { type: 'token'; payload: { text: string } }
  | { type: 'tool_start'; payload: { name: string; args: string } }
  | { type: 'tool_end'; payload: { name: string; ok: boolean } }
  | { type: 'artifact'; payload: ChatArtifact }
  | { type: 'done'; payload: { conversation_id: string } };

// What the agent is extracting from, read off the tool call's own arguments and shown
// before the recipe arrives (BACKLOG.md 3.7). `value` is the URL, the photo's data URL,
// or the description the agent worked from.
export interface ChatSource {
  kind: 'url' | 'photo' | 'text';
  value: string;
}

// One rendered turn in the thread. Tool names are kept so a turn that only ran tools
// still shows what happened.
export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  /** How many photos the user attached to this turn; the bytes themselves are not kept. */
  attachmentCount?: number;
  tools?: string[];
  sources?: ChatSource[];
  artifacts?: ChatArtifact[];
  error?: string;
}
