# Frontend Refactor Plan (Expo)

Date: 2026-08-16 — updated 2026-08-21
Scope: recipe-generator-frontend/recipe-generator-mobile

---

## ✅ Done (2026-08-21)

- `apiService` fully aligned with canonical backend contract.
- `Recipe.id` changed to `number`; `UpdateRecipePayload` key is `recipe` not `service`.
- `deleteRecipe(id: number)` calls `DELETE /delete-recipe/{id}` path param.
- `saveRecipe` returns `Recipe` (201); `patchRecipe` added for PATCH.
- Cookbook stubs removed from `apiService`.
- `API_ENDPOINTS` cleaned up; `USER_INFO` added, `CREATE_COOKBOOK` removed.
- `Alert.alert` web no-op fixed: `src/utils/alert.ts` with `confirmAction`/`showAlert` using `window.confirm`/`window.alert` on web and native `Alert.alert` on iOS/Android.
- Delete button working on web (was silently no-op due to `Alert.alert` stub).
- ProfileScreen redesigned: compact centered card, name + email only, no avatar, no username, no footer.
- GenerateScreen: "My Recipes" pill button (always visible when authenticated).
- Clipboard paste: global `paste` event listener on web (Cmd+V anywhere on page), `expo-clipboard` button in toolbar on native iOS.
- Web `FormData` image fix: `data:` URLs and `blob:` URLs converted to real `Blob` before `formData.append`.
- `PatchRecipePayload` type added.

---

## 🔨 Active — Next Up

### Voice UX

The backend will support voice via Whisper transcription. Frontend side:
- Record → preview playback → re-record or submit.
- Show a "Transcribing…" loading phase distinct from "Generating…".
- On submit, send audio as `voice` multipart field to `POST /api/v1/generate`.
- Wire `generateByVoice` in `apiService` (currently throws).

### Recipe detail screen

Currently recipes are a flat list with inline expanded markdown. Replace with:
- Recipe detail screen (new stack screen `RecipeDetail`).
- Tabs: Overview (title, category, servings, times), Ingredients, Steps, Notes (future).
- Populated from `GET /api/v1/recipes/:id` once the backend structured write path is live.
- Until then, render existing `recipe` markdown in the Overview tab.

---

## 🌟 Prime Features (planned, not yet scheduled)

### Cookbook sharing
- "Share cookbook" action on the library/profile screen.
- Opens a share sheet with the static cookbook URL from the backend.
- Version label so user knows which state is published.

### AI diff editor
- Step-level action buttons on the recipe detail screen: Explain, Simplify, Substitute.
- Chat panel bound to a selected step or ingredient.
- Backend returns proposed diff; user taps Accept/Reject per change.
- Accepted changes visible in timeline.

### What to eat today / meal planning
- Week view with quick-assign from saved recipes.
- Servings auto-scale preview while planning.

---

## 🗂 Backlog (future)

- Notes tab per recipe (add note after cooking, rating, variant label).
- Timeline tab (attempts, edits, outcomes in order).
- Ingredient scaling on-device (2× / 0.5×) without regeneration.
- Step timers embedded in step cards with background-safe notifications.
- Offline read cache for recently viewed recipes.
- Smart recent searches / prompt history.
- Local favourites / pinning.
- EAS channels: dev / preview / production.
- Telemetry and crash-free session threshold.

---

## ❌ Dropped

- OAS / typed client stubs from generated spec — not doing OAS.
- Creator / blog follow UX — far future.
- Feed candidate screen — far future.
- Technique chips / flavor profile badges — backlog not prime.
- WCAG audit / motion system — informal for now.
- Formal release pipeline (rollback playbook, QA matrix) — not yet.
