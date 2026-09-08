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
| Gestures | `react-native-gesture-handler` (~2.28.0, Day view drag only — no Reanimated) |

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
├── constants/
│   ├── index.ts                — config, endpoint strings, constants
│   └── mealPlanPrefs.ts        — WEEKDAYS / BATCH_DAYS_OPTIONS, shared by PreferencesScreen + WeekView's ad-hoc panel
├── context/
│   ├── ThemeContext.tsx        — dark/light theme provider and useTheme hook
│   └── MealPlanContext.tsx     — AsyncStorage-persisted itemsByDate/recipes cache shared by Day/Week/Month (see below)
├── hooks/useEscapeBack.ts      — web: Escape key → goBack
├── navigation/AppNavigator.tsx — Stack: Generate | Login | Recipes | Profile | MealPlan
├── screens/
│   ├── GenerateScreen.tsx      — main generation + recipe review UI
│   ├── RecipesScreen.tsx       — list, expand, delete saved recipes
│   ├── ProfileScreen.tsx       — user info + logout
│   ├── LoginScreen.tsx         — Keycloak login trigger
│   ├── MealPlanScreen.tsx      — thin shell: auth gate, Day/Week/Month switcher, shared selectedDate, wraps MealPlanProvider
│   └── mealplan/
│       ├── WeekView.tsx        — default view: hand-assign a day, AI "Suggest a plan" + streaming chat + accept, ad-hoc scheduling-preferences panel
│       ├── DayView.tsx         — 08:00–20:00 timeline, drag the day's recipe block to a new time (react-native-gesture-handler)
│       ├── MonthView.tsx       — read-only calendar grid, tap a day → opens Day view
│       └── RecipePickerModal.tsx — shared "choose a saved recipe" modal (Week + Day)
├── services/
│   ├── apiService.ts           — Axios client, all API methods (+ one raw-fetch SSE reader for chat streaming)
│   └── authService.ts          — OIDC PKCE, token storage, refresh
├── types/index.ts              — all shared TypeScript interfaces
└── utils/
    ├── alert.ts                — cross-platform alert/confirm helpers
    └── mealPlanDates.ts        — plain-Date helpers (toISODate, parseISODate, mondayOf, addDays, monthGridRange)
```

**`MealPlanContext`**: `itemsByDate: Record<YYYY-MM-DD, MealPlanItem>` + `recipes: Recipe[]`,
hydrated from AsyncStorage on mount then background-refreshed via `ensureRange(startISO,
endISO)`; `upsertItem`/`removeItem` update it immediately after a successful add/patch/
delete so every mounted view reflects the change without waiting for a refetch. This is
what makes switching Day/Week/Month instant (no loading spinner on switch) — each view
reads synchronously from context instead of fetching on its own mount.

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
| PATCH | `update-recipe` | `{id, structured, ai_sourced?, change_prompt?}` | required | `Recipe` |
| GET | `get-recipes` | — | required | `Recipe[]` |
| POST | `add-recipe` | `{recipename, recipe, category?, structured?}` | required | `Recipe` |
| DELETE | `delete-recipe/:id` | — | required | `204` |
| POST | `suggest` | `{input}` | none | `{suggestion}` |
| POST | `suggest-prefs` | `{input}` | none | `{questions[]}` |
| POST | `refine-recipe` | `{recipe, structured, change_prompt}` | optional | `RecipeResponse` |
| GET | `recipes/:id/history` | — | required | `RecipeVersion[]` (newest first; `change_note` holds the AI prompt for `ai_edit` entries) |
| GET | `meal-plan?starts_on=&ends_on=` | `ends_on` optional (defaults to `starts_on+6d`) | required | `MealPlanWeek` — `{starts_on, ends_on, items[]}`, one recipe per day, up to 42-day range |
| POST | `meal-plan/items` | `{recipe_id, planned_on, start_time?}` | required | `MealPlanItem` — upserts by day |
| PATCH | `meal-plan/items/:id` | `{planned_on, start_time}` (both required) | required | `MealPlanItem` — Day view drag |
| DELETE | `meal-plan/items/:id` | — | required | `204` |
| POST | `meal-plan/suggest` | `{starts_on, ends_on}` | required* | `MealPlanSuggestion` |
| POST | `meal-plan/chat` | `{starts_on, ends_on, initial, history[], message}` | required* | `MealPlanSuggestion` — stateless, resend `initial` + `history` every call |
| POST | `meal-plan/chat/stream` | `{starts_on, ends_on, message}` | required* | SSE (`text/event-stream`) — not axios, `apiService.streamMealPlanChatReply` uses raw `fetch` + `response.body.getReader()`. Web only (no streaming `fetch` body on native); called in parallel with `meal-plan/chat`, purely for a live-typed reply while the real plan update is in flight |
| POST | `meal-plan/variants/:recipe_id` | `{hint?}` | required* | `RecipeResponse & {variant_of_recipe_id}` — unsaved; persist via `add-recipe` |
| GET | `preferences` | — | required | `UserPreferences` |
| PATCH | `preferences` | full `UserPreferences` (server overwrites, not a merge — always send the complete object) | required | `UserPreferences` |

\* the 4 AI meal-plan endpoints are wired under the same "optional auth" middleware as `/refine-recipe` etc., but their handlers 401 an anonymous caller (they operate on the caller's own saved recipes).

The backend provisions users just-in-time from the JWT `sub` claim; there is no separate signup endpoint.

## Key Types (`types/index.ts`)

- `Recipe` — `{id, recipename, recipe, category?, createdAt?}` — persisted DB record
- `RecipeDocument` — structured parse: `{title, summary, language, category, servings, prep_minutes, cook_minutes, difficulty, ingredients[], steps[]}`
- `RecipeResponse` — `{recipename, recipe, structured?}` — generation endpoint response
- `UpdateRecipePayload` — POST body for AI reprompt
- `PatchRecipePayload` — PATCH body for manual edits
- `RecipeVersion` — `{version, change_kind, change_note?, created_at, data}` — one entry from `GET recipes/:id/history`
- `UserProfile` — `{name, email?, username?}`
- `MealPlanItem` — `{id, recipe_id, recipe_title, planned_on, start_time}`; `MealPlanWeek` — `{starts_on, ends_on, items: MealPlanItem[]}`
- `UserPreferences` — `{skill_level, dietary_prefs, disliked_ingredients, cooking_cadence, meal_plan_skip_days: Weekday[], meal_plan_batch_days: 1|2|3}` — the last two feed the meal-plan AI's system prompt server-side, editable from `PreferencesScreen` or WeekView's ad-hoc panel (both just PATCH the same row)
- `MealPlanAssignment` — one proposed day: `{recipe_id, variant, variant_of_recipe_id, planned_on, start_time}` — exactly one of `recipe_id`/`variant` is non-null
- `MealPlanSuggestion` — `{status: 'applied'|'needs_clarification', message, low_variety, assignments[]}` — the AI suggest/chat response envelope
- `MealPlanChatTurn` — `{message, plan: MealPlanSuggestion}` — one exchange in the meal-plan chat history the client resends each call

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
- **Chat streaming is web-only** — `WeekView`'s live-typed reply (`streamMealPlanChatReply`) needs `response.body.getReader()`, which RN's native `fetch` doesn't support. On native, `handleChatSend` skips the stream call entirely and the turn just shows "…" until the (non-streamed) `meal-plan/chat` call resolves — functional, just not live-typed.

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
