# AGENT.md

Technical reference for the recipe-generator-frontend. Primary workspace for changes is `recipe-generator-mobile/src/`.

## Tech Stack

| Layer | Library / Version |
|-------|-------------------|
| Runtime | Expo SDK 54, React Native 0.81, React 19 |
| Language | TypeScript (strict) |
| Navigation | `@react-navigation/native-stack` |
| HTTP | Axios (singleton in `apiService.ts`) |
| Auth | `expo-auth-session` PKCE + Keycloak OIDC |
| Storage | `@react-native-async-storage/async-storage` |
| Image | `expo-image-picker` |
| Locale | `expo-localization` (device/browser language sent to `/generate`) |
| Clipboard | `expo-clipboard` |
| Audio | `expo-av` (`Audio.Recording`) |
| Icons | `@expo/vector-icons` (Ionicons) |
| Markdown | `react-native-markdown-display` |

## Local Runbook

```bash
cd recipe-generator-mobile
npm install
npm start          # Expo dev server
npm run ios        # iOS simulator
npm run android    # Android emulator / device
npm run web        # http://localhost:8081
```

Backend must be running at `http://localhost:8080/api/v1`. See `recipe-generator/CLAUDE.md`.

## Configuration Source of Truth

`recipe-generator-mobile/src/constants/index.ts` — the only place for runtime config. The app does **not** read `process.env`; there is no `.env` wiring.

| Export | Purpose |
|--------|---------|
| `API_BASE_URL` | Backend base URL (`__DEV__` switches) |
| `KEYCLOAK_CONFIG` | url, realm, clientId, redirectUri, googleIdpHint |
| `API_ENDPOINTS` | All path strings (no leading slash) |
| `STORAGE_KEYS` | AsyncStorage key names |
| `SUGGEST_DEBOUNCE_MS` | Delay before inline suggestion fires (1200 ms) |
| `MAX_RECIPE_NAME_LENGTH` | Display truncation limit |

## File Map

```
src/
├── constants/index.ts          — config, endpoint strings, constants
├── context/ThemeContext.tsx    — dark/light theme provider and useTheme hook
├── hooks/useEscapeBack.ts      — web: Escape key → goBack
├── navigation/AppNavigator.tsx — Stack: Generate | Login | Recipes | Profile
├── screens/
│   ├── GenerateScreen.tsx      — main generation + recipe review UI
│   ├── RecipesScreen.tsx       — list, expand, delete saved recipes
│   ├── ProfileScreen.tsx       — user info + logout
│   └── LoginScreen.tsx         — Keycloak login trigger
├── services/
│   ├── apiService.ts           — Axios client, all API methods
│   └── authService.ts          — OIDC PKCE, token storage, refresh
├── types/index.ts              — all shared TypeScript interfaces
└── utils/alert.ts              — cross-platform alert/confirm helpers
```

## Authentication Flow

`authService.ts` owns all auth logic.

1. `loginWithKeycloak()` — opens `expo-auth-session` browser session with `code_challenge` (PKCE). Redirect URI is `com.recipegenerator://oauth/callback`.
2. Code exchange returns `access_token`, `refresh_token`, `expires_in`. All four values (plus decoded profile) are stored in AsyncStorage under `STORAGE_KEYS.*`.
3. `getAccessToken()` checks expiry; if within threshold, calls `refreshAccessToken()` first.
4. `ApiService` request interceptor calls `getAccessToken()` before every request. Token is attached only when present (anonymous calls pass through).
5. On a `401` response, the response interceptor sets `_retry = true`, calls `refreshAccessToken()`, and replays the original request once.

Do not bypass this pattern when adding new authenticated calls.

## API Contract

`apiService.ts` wraps all backend calls. All paths are relative to `API_BASE_URL`.

| Method | Path | Body / Params | Auth | Return |
|--------|------|---------------|------|--------|
| POST | `generate` | `FormData` (description \| url \| image, + `language` from `expo-localization`) | optional | `RecipeResponse` |
| POST | `update-recipe` | `{recipe, changePrompt}` | required | `RecipeResponse` |
| PATCH | `update-recipe` | `{id, structured, ai_sourced?}` | required | `Recipe` |
| GET | `get-recipes` | — | required | `Recipe[]` |
| POST | `add-recipe` | `{recipename, recipe, category?, structured?}` | required | `Recipe` |
| DELETE | `delete-recipe/:id` | — | required | `204` |
| POST | `suggest` | `{input}` | none | `{suggestion}` |
| POST | `suggest-prefs` | `{input}` | none | `{questions[]}` |
| POST | `refine-recipe` | `{recipe, structured, change_prompt}` | optional | `RecipeResponse` |

The backend provisions users just-in-time from the JWT `sub` claim; there is no separate signup endpoint.

## Key Types (`types/index.ts`)

- `Recipe` — `{id, recipename, recipe, category?, createdAt?}` — persisted DB record
- `RecipeDocument` — structured parse: `{title, summary, language, category, servings, prep_minutes, cook_minutes, difficulty, ingredients[], steps[]}`
- `RecipeResponse` — `{recipename, recipe, structured?}` — generation endpoint response
- `UpdateRecipePayload` — POST body for AI reprompt
- `PatchRecipePayload` — PATCH body for manual edits
- `UserProfile` — `{name, email?, username?}`

## GenerateScreen Internals

This is the most complex screen. Key state:

| State | Purpose |
|-------|---------|
| `inputMode` | `'text' \| 'url' \| 'image' \| 'voice'` |
| `structuredDoc` | `RecipeDocument \| null` — parsed result from backend |
| `editableIngredients / editableSteps` | local copies, purely derived from `structuredDoc` for display |
| `chatMessages` | the single review chat log (`{role, text}[]`) |
| `chatInput / chatSending` | composer state for the chat pane |
| `docHistory` | stack of prior `{recipe, recipeName, structuredDoc}` snapshots, one per chat turn, for "Undo last change" |
| `suggestion` | inline LLM autocomplete ghost text |
| `dynamicPrefs` | `ClarifyQuestion[]` generated by `/suggest-prefs` |
| `clarifyAnswers` | user selections fed into the generate prompt |

**Suggestion flow**: `inputText` change → debounce 1200 ms → `POST /suggest` → show ghost text. Tab (web) or tap accepts it.

**Preference chip flow**: `inputText` change → debounce 700 ms → `POST /suggest-prefs` → fade-in chips. Answers appended to `description` on generate.

**Review chat flow**: the review screen has a single chat pane, not per-ingredient/per-step controls.
Every message — typed by the user, or triggered by tapping the "x" next to an ingredient — is sent
as one whole-recipe instruction via `sendChatMessage()`: push a snapshot onto `docHistory`, call
`POST /refine-recipe {recipe, structured, change_prompt}`, and replace `recipe`/`recipeName`/
`structuredDoc` with the regenerated document. Because `/refine-recipe` regenerates the full
structured recipe rather than patching one field, removing or changing an ingredient always keeps
the steps consistent (no separate cascade logic needed on either side). "Undo last change" pops
the last `docHistory` snapshot and restores it.

**Image input**: `expo-image-picker` for native. On web, also listens to `paste` event for clipboard images and converts to a data URL blob.

## Theme System

`ThemeContext.tsx` provides a `Theme` object with semantic color tokens. Default is dark. Toggle is exposed via `useTheme().toggle`. All `StyleSheet` calls inside screens use `useMemo(() => makeStyles(theme), [theme])` — follow this pattern when adding new screens or components.

## Web-Specific Behavior

- Layout switches to wide card (max-width ~720 px) — check `isWebWide` in `GenerateScreen`.
- Clipboard paste triggers `handleClipboardImage` and auto-switches to image mode.
- Tab key accepts inline suggestion.
- `useEscapeBack` adds `keydown` listener for Escape → `navigation.goBack()`.

## Known Issues

- **Voice generation** — `generateByVoice` throws immediately; backend does not support it. The recording UI is wired but the call is dead.
- **Production API_BASE_URL** — placeholder string; must be updated before any release build.
- **No .env wiring** — all config is hard-coded in `constants/index.ts`.

## Editing Guidance

- When the backend adds or changes a route, update `API_ENDPOINTS` in `constants/index.ts` and the corresponding method in `apiService.ts` first.
- Preserve the token refresh interceptor in `apiService.ts` when touching `authService.ts`.
- New screens must be added to `RootStackParamList` in `AppNavigator.tsx` before they can be navigated to.
- Keep `types/index.ts` as the single source of truth for shared shapes; do not redeclare them inline.
- All API calls that require auth should use `apiService` methods — never call Axios directly from screens.

## Related Plans

- `REFACTOR_PLAN_FRONTEND.md` — frontend-specific roadmap
- `../REFACTOR_PLAN_API_AUTH_CRUD.md` — full-stack API/auth/CRUD plan
- `../recipe-generator/REFACTOR_PLAN.md` — backend plan
