// API Configuration
export const API_BASE_URL = __DEV__
  ? 'http://localhost:8080/api/v1'
  : 'https://recipe-generator-beta.ili16.de/api/v1';

// Where a share link points (BACKLOG 8.4). In prod the app and the API are the same
// origin; in dev on web the app serves itself, and native dev has no web origin of its
// own so it hands out the beta one.
export const APP_BASE_URL = __DEV__ && typeof window !== 'undefined'
  ? window.location.origin
  : 'https://recipe-generator-beta.ili16.de';

export const shareUrl = (token: string) => `${APP_BASE_URL}/s/${token}`;

const KEYCLOAK_DEV_URL = 'https://sso.ili16.de';
const KEYCLOAK_PROD_URL = 'https://sso.ili16.de';
const KEYCLOAK_DEV_REALM = 'recipe-generator';
const KEYCLOAK_PROD_REALM = 'recipe-generator';

// Keycloak OIDC Configuration
export const KEYCLOAK_CONFIG = {
  url: __DEV__ ? KEYCLOAK_DEV_URL : KEYCLOAK_PROD_URL,
  realm: __DEV__ ? KEYCLOAK_DEV_REALM : KEYCLOAK_PROD_REALM,
  clientId: 'frontend',
  redirectUri: 'com.recipegenerator://oauth/callback',
} as const;

// API Endpoints (relative to API_BASE_URL)
export const API_ENDPOINTS = {
  CHAT: 'chat',
  SAVE_CHAT_DRAFT: 'chat/drafts/save',
  TRANSCRIBE_AUDIO: 'transcribe',
  UPDATE_RECIPE: 'update-recipe',
  GET_RECIPES: 'get-recipes',
  DELETE_RECIPE: 'delete-recipe',
  SAVE_RECIPE: 'add-recipe',
  USER_INFO: 'user-info',
  GET_RECIPE: 'recipes',
  PREFERENCES: 'preferences',
  MEAL_PLAN: 'meal-plan',
  GROCERY_LIST: 'grocery-list',
  MEAL_PLAN_ITEMS: 'meal-plan/items',
  MEAL_PLAN_VARIANTS: 'meal-plan/variants',
  COLLECTIONS: 'collections',
  PANTRY: 'pantry',
  HOUSEHOLD: 'household',
  SHARED: 'shared',
  FEEDBACK: 'feedback',
} as const;

// Storage Keys
export const STORAGE_KEYS = {
  RECIPES: 'recipes',
  USER_TOKEN: 'user_token',
  USER_REFRESH_TOKEN: 'user_refresh_token',
  USER_TOKEN_EXPIRES_AT: 'user_token_expires_at',
  USER_PROFILE: 'user_profile',
  THEME_MODE: 'theme_mode',
  LANGUAGE: 'language',
} as const;


// Keyed by user id so a shared device — or a logout/login within the same session —
// never shows one account's cached meal plan to another before the background refetch lands.
export const mealPlanCacheKeys = (userId: string) => ({
  // v2: the shape changed from one item per date to a list per date (BACKLOG 6.4).
  // A new key is the migration — the old cache is a week of plan data that the next
  // ensureRange refetches anyway.
  items: `mealplan_cache_items_v2_${userId}`,
  recipes: `mealplan_cache_recipes_v1_${userId}`,
});

// Ticked-off grocery lines, per user and per week. The list itself is derived from the
// plan on every load — only the ticks are worth keeping, and only on this device.
export const groceryCheckedKey = (userId: string, weekStartISO: string) =>
  `grocery_checked_v1_${userId}_${weekStartISO}`;

// App Constants
export const MAX_RECIPE_NAME_LENGTH = 25;
