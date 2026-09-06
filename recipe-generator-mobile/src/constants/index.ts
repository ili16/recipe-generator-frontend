// API Configuration
export const API_BASE_URL = __DEV__
  ? 'http://localhost:8080/api/v1'
  : 'https://recipe-generator-beta.ili16.de/api/v1';

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
  googleIdpHint: 'google',
} as const;

// API Endpoints (relative to API_BASE_URL)
export const API_ENDPOINTS = {
  GENERATE_RECIPE: 'generate',
  TRANSCRIBE_AUDIO: 'transcribe',
  UPDATE_RECIPE: 'update-recipe',
  GET_RECIPES: 'get-recipes',
  DELETE_RECIPE: 'delete-recipe',
  SAVE_RECIPE: 'add-recipe',
  USER_INFO: 'user-info',
  SUGGEST: 'suggest',
  SUGGEST_PREFS: 'suggest-prefs',
  COOKING_CHAT: 'cooking-chat',
  GET_RECIPE: 'recipes',
  REFINE_RECIPE: 'refine-recipe',
} as const;

// Storage Keys
export const STORAGE_KEYS = {
  RECIPES: 'recipes',
  USER_TOKEN: 'user_token',
  USER_REFRESH_TOKEN: 'user_refresh_token',
  USER_TOKEN_EXPIRES_AT: 'user_token_expires_at',
  USER_PROFILE: 'user_profile',
} as const;

// App Constants
export const MAX_RECIPE_NAME_LENGTH = 25;
export const SUGGEST_DEBOUNCE_MS = 1200;
