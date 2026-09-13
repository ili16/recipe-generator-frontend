import axios, { AxiosInstance } from 'axios';
import { Platform } from 'react-native';
import { API_BASE_URL, API_ENDPOINTS } from '../constants';
import { Recipe, RecipeDocument, RecipeResponse, PatchRecipePayload, GenerationOrigin, EditTurn, RecipeVersion, UserPreferences, MealPlanWeek, MealPlanItem, MealSlot, MealPlanSuggestion, GroceryList, ChatStreamEvent, ChatAttachment, Collection, PantryItem } from '../types';
import authService from './authService';
import { getLocales } from 'expo-localization';

// The device locale, sent on every /chat turn. It is the only language signal the backend
// has left since POST /generate (and its `language` form field) was deleted — the agent
// uses it when the user's own message is too short to detect a language from, so that
// "cacio e pepe" comes back in the user's language rather than Italian (BACKLOG 3.9).
// Read once: a locale change restarts the app.
const deviceLanguage = getLocales()[0]?.languageCode ?? '';

// The one error type every apiService method rejects with. `status` is the HTTP status
// (undefined = the request never reached the server), so a caller can tell "the server
// said no" from "the server is down" — which the old swallow-and-return-empty methods
// made impossible. No method swallows its own errors; swallowing is the call site's choice.
export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly data?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token (only if authenticated)
    this.client.interceptors.request.use(
      async (config) => {
        const token = await authService.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        // If no token, requests still proceed (for anonymous access)
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config as any;
        const status = error?.response?.status;

        if (status === 401 && originalRequest && !originalRequest._retry) {
          originalRequest._retry = true;

          const refreshedToken = await authService.refreshAccessToken();
          if (refreshedToken) {
            originalRequest.headers = originalRequest.headers ?? {};
            originalRequest.headers.Authorization = `Bearer ${refreshedToken}`;
            return this.client(originalRequest);
          }
        }

        return Promise.reject(
          new ApiError(error?.message ?? 'request failed', status, error?.response?.data)
        );
      }
    );
  }

  // The one SSE reader. Mirrors the axios interceptors the raw-fetch streams would
  // otherwise miss: bearer token in, one 401 refresh-and-replay. Always cancels the
  // reader so an abandoned stream stops server-side too. `signal` aborts the request.
  private async streamSSE(
    path: string,
    init: (token: string | null) => RequestInit,
    onEvent: (type: string, payload: unknown) => void,
    defaultEvent: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const send = (token: string | null) =>
      fetch(`${API_BASE_URL}/${path}`, { ...init(token), signal });

    let response = await send(await authService.getAccessToken());
    if (response.status === 401) {
      const refreshed = await authService.refreshAccessToken();
      if (refreshed) response = await send(refreshed);
    }
    if (!response.ok || !response.body) {
      throw new ApiError(`stream failed: ${response.status}`, response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const raw of events) {
          if (!raw.trim()) continue;
          let type = defaultEvent;
          const data: string[] = [];
          for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) type = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).trim());
          }
          if (data.length === 0) continue;
          let payload: unknown;
          try {
            payload = JSON.parse(data.join('\n'));
          } catch {
            continue; // a malformed frame must not kill the stream
          }
          // The agent loop reports failures as {code}; older streams send a bare string.
          if (type === 'error') {
            const code = typeof payload === 'string' ? payload : (payload as { code?: string })?.code;
            throw new ApiError(code || 'stream error');
          }
          onEvent(type, payload);
        }
      }
    } finally {
      reader.cancel().catch(() => { /* already closed */ });
    }
  }

  // The agent loop (POST /chat): one user turn in, a stream of prose tokens, tool events
  // and artifact cards out. The thread lives server-side — the only state the client
  // keeps is the conversation id, which this resolves from the closing `done` event.
  // Native has no readable body, so it asks for `Accept: application/json` and gets the
  // same events in one buffered array once the turn ends (BACKLOG 3.8).
  async streamChat(
    message: string,
    conversationId: string | null,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
    attachments?: ChatAttachment[],
  ): Promise<string | null> {
    let conversation = conversationId;
    const body = { conversation_id: conversationId ?? '', message, attachments, language: deviceLanguage };

    if (Platform.OS !== 'web') {
      const { data } = await this.client.post<{ events: { type: string; payload: unknown }[] }>(
        API_ENDPOINTS.CHAT,
        body,
        { headers: { Accept: 'application/json' }, signal },
      );
      for (const { type, payload } of data.events ?? []) {
        if (type === 'error') throw new ApiError((payload as { code?: string })?.code || 'stream error');
        if (type === 'done') conversation = (payload as { conversation_id?: string }).conversation_id ?? conversation;
        onEvent({ type, payload } as ChatStreamEvent);
      }
      return conversation;
    }

    await this.streamSSE(
      API_ENDPOINTS.CHAT,
      (token) => ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }),
      (type, payload) => {
        if (type === 'done') conversation = (payload as { conversation_id?: string }).conversation_id ?? conversation;
        onEvent({ type, payload } as ChatStreamEvent);
      },
      'token',
      signal,
    );
    return conversation;
  }

  // One /chat turn collapsed to its result, for the surfaces that want an answer rather
  // than a conversation to render: the assistant's prose and the last recipe document it
  // produced. Pass the returned `conversationId` back in to make the next call a follow-up
  // in the same thread — which is the whole reason cooking mode stopped posting to the old
  // stateless /refine-recipe and /cooking-chat (BACKLOG 3.13).
  async chatTurn(
    message: string,
    conversationId: string | null = null,
  ): Promise<{ conversationId: string | null; text: string; document?: RecipeDocument }> {
    let text = '';
    let document: RecipeDocument | undefined;
    const conversation = await this.streamChat(message, conversationId, (event) => {
      if (event.type === 'token') text += event.payload.text;
      else if (event.type === 'artifact' && event.payload.kind === 'recipe') {
        document = event.payload.data.document;
      }
    });
    return { conversationId: conversation, text: text.trim(), document };
  }

  // Transcribe audio to text using OpenAI Whisper on the backend
  async transcribeAudio(audioUri: string): Promise<string> {
    const formData = new FormData();
    const filename = audioUri.split('/').pop() || 'audio.m4a';
    const ext = filename.split('.').pop()?.toLowerCase() ?? 'm4a';
    const mimeMap: Record<string, string> = { m4a: 'audio/m4a', mp3: 'audio/mpeg', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg' };
    const type = mimeMap[ext] ?? 'audio/m4a';
    formData.append('audio', { uri: audioUri, name: filename, type } as any);
    const response = await this.client.post<{ text: string }>(
      API_ENDPOINTS.TRANSCRIBE_AUDIO,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response.data.text ?? '';
  }

  async transcribeBlob(blob: Blob, filename = 'recording.webm'): Promise<string> {
    const formData = new FormData();
    formData.append('audio', blob, filename);
    const response = await this.client.post<{ text: string }>(
      API_ENDPOINTS.TRANSCRIBE_AUDIO,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response.data.text ?? '';
  }

  // Persist manual edits to a saved recipe (PATCH /update-recipe)
  async patchRecipe(payload: PatchRecipePayload): Promise<Recipe> {
    const response = await this.client.patch<Recipe>(
      API_ENDPOINTS.UPDATE_RECIPE,
      payload
    );
    return response.data;
  }

  // Get all recipes
  async getRecipes(): Promise<Recipe[]> {
    const response = await this.client.get<Recipe[]>(API_ENDPOINTS.GET_RECIPES);
    return response.data;
  }

  // Delete recipe (soft — it lands in the trash for 30 days, BACKLOG 8.2)
  async deleteRecipe(recipeId: number): Promise<void> {
    await this.client.delete(`${API_ENDPOINTS.DELETE_RECIPE}/${recipeId}`);
  }

  async getTrash(): Promise<Recipe[]> {
    const response = await this.client.get<Recipe[]>(`${API_ENDPOINTS.GET_RECIPE}/trash`);
    return response.data;
  }

  async restoreRecipe(recipeId: number): Promise<void> {
    await this.client.post(`${API_ENDPOINTS.GET_RECIPE}/${recipeId}/restore`);
  }

  /* ── Collections (BACKLOG 8.1) ───────────────────────────────────────────── */

  async getCollections(): Promise<Collection[]> {
    const response = await this.client.get<Collection[]>(API_ENDPOINTS.COLLECTIONS);
    return response.data;
  }

  // Creating a name that already exists returns that collection rather than a duplicate.
  async createCollection(name: string): Promise<Collection> {
    const response = await this.client.post<Collection>(API_ENDPOINTS.COLLECTIONS, { name });
    return response.data;
  }

  async deleteCollection(collectionId: number): Promise<void> {
    await this.client.delete(`${API_ENDPOINTS.COLLECTIONS}/${collectionId}`);
  }

  async setRecipeCollection(collectionId: number, recipeId: number, member: boolean): Promise<void> {
    const path = `${API_ENDPOINTS.COLLECTIONS}/${collectionId}/recipes/${recipeId}`;
    if (member) await this.client.put(path);
    else await this.client.delete(path);
  }

  /* ── Pantry (BACKLOG 7.1) ────────────────────────────────────────────────── */

  async getPantry(): Promise<PantryItem[]> {
    const response = await this.client.get<PantryItem[]>(API_ENDPOINTS.PANTRY);
    return response.data;
  }

  // Upsert, not create: the server keys on the normalised name and unit, so saving
  // "flour" twice updates the amount rather than adding a second line. The saved item
  // comes back with its id, which is how a ticked grocery line remembers what to remove
  // again when it is unticked (BACKLOG 7.2).
  async savePantryItem(item: Omit<PantryItem, 'id'>): Promise<PantryItem> {
    const response = await this.client.post<PantryItem>(API_ENDPOINTS.PANTRY, item);
    return response.data;
  }

  async deletePantryItem(itemId: number): Promise<void> {
    await this.client.delete(`${API_ENDPOINTS.PANTRY}/${itemId}`);
  }

  /* ── Read-only share link (BACKLOG 8.4) ──────────────────────────────────── */

  // Turns sharing on and returns the token. Idempotent: an already-shared recipe
  // returns the same token, so a second tap never invalidates a link already sent.
  async shareRecipe(recipeId: number): Promise<string> {
    const response = await this.client.post<{ share_token: string }>(`${API_ENDPOINTS.GET_RECIPE}/${recipeId}/share`);
    return response.data.share_token;
  }

  async unshareRecipe(recipeId: number): Promise<void> {
    await this.client.delete(`${API_ENDPOINTS.GET_RECIPE}/${recipeId}/share`);
  }

  // Unauthenticated on purpose — the token is the credential.
  async getSharedRecipe(token: string): Promise<Recipe> {
    const response = await this.client.get<Recipe>(`${API_ENDPOINTS.SHARED}/${token}`);
    return response.data;
  }

  async getRecipeById(recipeId: number): Promise<Recipe> {
    const response = await this.client.get<Recipe>(`${API_ENDPOINTS.GET_RECIPE}/${recipeId}`);
    return response.data;
  }

  async getRecipeHistory(recipeId: number): Promise<RecipeVersion[]> {
    const response = await this.client.get<RecipeVersion[]>(`${API_ENDPOINTS.GET_RECIPE}/${recipeId}/history`);
    return response.data;
  }

  // Save recipe (requires authentication)
  async saveRecipe(
    recipeName: string,
    recipeContent: string,
    tags?: string[],
    structured?: RecipeDocument,
    origin?: GenerationOrigin,
    history?: EditTurn[],
    variantOfRecipeId?: number
  ): Promise<Recipe> {
    const response = await this.client.post<Recipe>(API_ENDPOINTS.SAVE_RECIPE, {
      recipename: recipeName,
      recipe: recipeContent,
      ...(tags && tags.length > 0 ? { tags } : {}),
      ...(structured ? { structured } : {}),
      ...(origin ? { origin } : {}),
      ...(history ? { history } : {}),
      ...(variantOfRecipeId ? { variant_of_recipe_id: variantOfRecipeId } : {}),
    });
    return response.data;
  }

  // Last known preferences, kept so a screen can render the right week start on its first
  // frame instead of showing the Monday default and visibly jumping once the fetch lands.
  // Cleared on logout (authService.clearSession) — another account's week start is wrong,
  // not just stale.
  cachedPreferences: UserPreferences | null = null;

  async getPreferences(): Promise<UserPreferences> {
    const response = await this.client.get<UserPreferences>(API_ENDPOINTS.PREFERENCES);
    this.cachedPreferences = response.data;
    return response.data;
  }

  async updatePreferences(p: Partial<UserPreferences>): Promise<UserPreferences> {
    const response = await this.client.patch<UserPreferences>(API_ENDPOINTS.PREFERENCES, p);
    this.cachedPreferences = response.data;
    return response.data;
  }

  async voteRecipe(recipeId: number, vote: 1 | -1): Promise<void> {
    await this.client.put(`${API_ENDPOINTS.GET_RECIPE}/${recipeId}/vote`, { vote });
  }

  async unvoteRecipe(recipeId: number): Promise<void> {
    await this.client.delete(`${API_ENDPOINTS.GET_RECIPE}/${recipeId}/vote`);
  }

  // Mark a recipe cooked now (BACKLOG 6.3) — keeps it out of meal-plan suggestions for
  // a couple of weeks. Idempotent: re-marking just moves the timestamp forward. An
  // optional 1–5 rating (BACKLOG 6.7) rides the same call, so the automatic mark at the
  // end of cooking mode and the stars tapped a moment later need no second endpoint;
  // omitting it leaves any previous rating alone.
  async markCooked(recipeId: number, rating?: number): Promise<void> {
    await this.client.put(`${API_ENDPOINTS.GET_RECIPE}/${recipeId}/cooked`, rating ? { rating } : {});
  }

  async unmarkCooked(recipeId: number): Promise<void> {
    await this.client.delete(`${API_ENDPOINTS.GET_RECIPE}/${recipeId}/cooked`);
  }

  // Get every meal-plan item in [startsOn, endsOn]. endsOn defaults server-side to
  // startsOn+6d (a week) when omitted.
  async getMealPlanWeek(startsOn: string, endsOn?: string): Promise<MealPlanWeek> {
    const response = await this.client.get<MealPlanWeek>(API_ENDPOINTS.MEAL_PLAN, {
      params: { starts_on: startsOn, ...(endsOn ? { ends_on: endsOn } : {}) },
    });
    return response.data;
  }

  // The week's shopping list, derived from the plan server-side. endsOn defaults to
  // startsOn+6d, exactly as getMealPlanWeek does.
  async getGroceryList(startsOn: string, endsOn?: string): Promise<GroceryList> {
    const response = await this.client.get<GroceryList>(API_ENDPOINTS.GROCERY_LIST, {
      params: { starts_on: startsOn, ...(endsOn ? { ends_on: endsOn } : {}) },
    });
    return response.data;
  }

  // Assign a saved recipe to one meal slot of a day (upsert — replaces whatever was in
  // that slot, leaving the day's other meals alone; BACKLOG 6.4). Because it upserts,
  // re-posting the same recipe with a different `servings` is also how a planned day's
  // servings get changed (BACKLOG 6.2). Omitting mealSlot means dinner.
  async addMealPlanItem(recipeId: number, plannedOn: string, servings?: number, mealSlot?: MealSlot): Promise<MealPlanItem> {
    const response = await this.client.post<MealPlanItem>(API_ENDPOINTS.MEAL_PLAN_ITEMS, {
      recipe_id: recipeId,
      planned_on: plannedOn,
      ...(servings ? { servings } : {}),
      ...(mealSlot ? { meal_slot: mealSlot } : {}),
    });
    return response.data;
  }

  async deleteMealPlanItem(itemId: number): Promise<void> {
    await this.client.delete(`${API_ENDPOINTS.MEAL_PLAN_ITEMS}/${itemId}`);
  }

  // Propose a new, unsaved recipe variant of an existing saved recipe
  async generateVariant(recipeId: number, hint?: string): Promise<RecipeResponse & { variant_of_recipe_id: number }> {
    const response = await this.client.post<RecipeResponse & { variant_of_recipe_id: number }>(
      `${API_ENDPOINTS.MEAL_PLAN_VARIANTS}/${recipeId}`,
      hint ? { hint } : {}
    );
    return response.data;
  }
}

export default new ApiService();
