import axios, { AxiosInstance } from 'axios';
import * as Localization from 'expo-localization';
import { Platform } from 'react-native';
import { API_BASE_URL, API_ENDPOINTS } from '../constants';
import { Recipe, RecipeDocument, RecipeResponse, RefineResult, PatchRecipePayload, GenerationOrigin, EditTurn, RecipeVersion, UserPreferences, MealPlanWeekPreferences, MealPlanWeek, MealPlanItem, MealPlanSuggestion, MealPlanChatTurn } from '../types';
import authService from './authService';

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

        return Promise.reject(error);
      }
    );
  }

  private async generateRecipe(formData: FormData): Promise<RecipeResponse> {
    const language = Localization.getLocales()[0]?.languageCode;
    if (language) formData.append('language', language);
    const response = await this.client.post<RecipeResponse>(
      API_ENDPOINTS.GENERATE_RECIPE,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  }

  // Generate recipe by description (anonymous or authenticated)
  async generateByDescription(description: string): Promise<RecipeResponse> {
    return this.generateRecipe(this.buildDescriptionFormData(description));
  }

  async generateByDescriptionStream(description: string, onDelta: (raw: string) => void): Promise<RecipeResponse> {
    return this.generateRecipeStream(this.buildDescriptionFormData(description), onDelta);
  }

  private buildDescriptionFormData(description: string): FormData {
    const formData = new FormData();
    formData.append('description', description);
    return formData;
  }

  // Generate recipe by link
  async generateByLink(url: string): Promise<RecipeResponse> {
    return this.generateRecipe(this.buildLinkFormData(url));
  }

  async generateByLinkStream(url: string, onDelta: (raw: string) => void): Promise<RecipeResponse> {
    return this.generateRecipeStream(this.buildLinkFormData(url), onDelta);
  }

  private buildLinkFormData(url: string): FormData {
    const formData = new FormData();
    formData.append('url', url);
    return formData;
  }

  // Generate recipe by image
  async generateByImage(imageUri: string): Promise<RecipeResponse> {
    return this.generateRecipe(await this.buildImageFormData(imageUri));
  }

  async generateByImageStream(imageUri: string, onDelta: (raw: string) => void): Promise<RecipeResponse> {
    return this.generateRecipeStream(await this.buildImageFormData(imageUri), onDelta);
  }

  private async buildImageFormData(imageUri: string): Promise<FormData> {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      let blob: Blob;
      if (imageUri.startsWith('data:')) {
        const [header, b64] = imageUri.split(',');
        const mime = header.replace('data:', '').replace(';base64', '');
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        blob = new Blob([bytes], { type: mime });
      } else {
        // blob: URL from the image picker on web
        const res = await fetch(imageUri);
        blob = await res.blob();
      }
      formData.append('image', blob, 'image.jpg');
    } else {
      const filename = imageUri.split('/').pop() || 'image.jpg';
      const ext = filename.split('.').pop()?.toLowerCase();
      const type = ext ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : 'image/jpeg';
      formData.append('image', { uri: imageUri, name: filename, type } as any);
    }

    return formData;
  }

  // Stream a recipe generation via SSE — web only (native fetch can't consume a
  // streaming body, same constraint as streamMealPlanChatReply). onDelta fires once per
  // raw JSON text fragment as the structured recipe is generated; resolves with the same
  // shape generateRecipe() returns once the stream's "done" event arrives.
  async generateRecipeStream(formData: FormData, onDelta: (raw: string) => void): Promise<RecipeResponse> {
    const language = Localization.getLocales()[0]?.languageCode;
    if (language) formData.append('language', language);
    const token = await authService.getAccessToken();
    const response = await fetch(`${API_BASE_URL}/${API_ENDPOINTS.GENERATE_RECIPE_STREAM}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    if (!response.ok || !response.body) {
      throw new Error(`stream failed: ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: RecipeResponse | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const raw of events) {
        if (!raw.trim()) continue;
        const lines = raw.split('\n');
        const eventLine = lines.find(l => l.startsWith('event:'));
        const dataLine = lines.find(l => l.startsWith('data:'));
        const eventType = eventLine ? eventLine.slice(6).trim() : 'delta';
        if (!dataLine) continue;
        const payload = JSON.parse(dataLine.slice(5).trim());
        if (eventType === 'error') throw new Error(typeof payload === 'string' ? payload : 'stream error');
        if (eventType === 'delta') onDelta(payload as string);
        if (eventType === 'done') result = payload as RecipeResponse;
      }
    }
    if (!result) throw new Error('stream ended without a result');
    return result;
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

  async suggestInput(input: string): Promise<{ mode: 'append' | 'rewrite' | 'none'; text: string }> {
    try {
      const response = await this.client.post<{ mode: 'append' | 'rewrite' | 'none'; text: string }>(API_ENDPOINTS.SUGGEST, { input });
      return { mode: response.data.mode ?? 'none', text: response.data.text ?? '' };
    } catch (error: any) {
      if (error?.response?.status === 422) throw error;
      return { mode: 'none', text: '' };
    }
  }

  async suggestPrefs(
    input: string,
    history?: Array<{ role: 'user' | 'assistant'; text: string }>
  ): Promise<{ mode: 'prefs' | 'chat'; questions?: Array<{ id: string; label: string; type: string; options: string[] }>; reply?: string }> {
    try {
      const response = await this.client.post<{ mode: 'prefs' | 'chat'; questions?: Array<{ id: string; label: string; type: string; options: string[] }>; reply?: string }>(
        API_ENDPOINTS.SUGGEST_PREFS,
        { input, ...(history && history.length > 0 ? { history } : {}) }
      );
      return response.data;
    } catch { return { mode: 'prefs', questions: [] }; }
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

  // Delete recipe
  async deleteRecipe(recipeId: number): Promise<void> {
    await this.client.delete(`${API_ENDPOINTS.DELETE_RECIPE}/${recipeId}`);
  }

  async refineRecipe(
    origin: GenerationOrigin,
    initial: RecipeDocument,
    history: EditTurn[],
    changePrompt: string,
    generationId?: string
  ): Promise<RefineResult> {
    const response = await this.client.post<RefineResult>(API_ENDPOINTS.REFINE_RECIPE, {
      origin,
      initial,
      history,
      change_prompt: changePrompt,
      ...(generationId ? { generation_id: generationId } : {}),
    });
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

  async cookingChat(
    recipeName: string,
    recipe: string,
    question: string,
    stepText?: string,
  ): Promise<string> {
    try {
      const response = await this.client.post<{ answer: string }>(API_ENDPOINTS.COOKING_CHAT, {
        recipe_name: recipeName,
        recipe,
        question,
        step_text: stepText ?? '',
      });
      return response.data.answer ?? '';
    } catch {
      return '';
    }
  }

  // Save recipe (requires authentication)
  async saveRecipe(
    recipeName: string,
    recipeContent: string,
    tags?: string[],
    structured?: RecipeDocument,
    origin?: GenerationOrigin,
    history?: EditTurn[],
    generationId?: string,
    variantOfRecipeId?: number
  ): Promise<Recipe> {
    const response = await this.client.post<Recipe>(API_ENDPOINTS.SAVE_RECIPE, {
      recipename: recipeName,
      recipe: recipeContent,
      ...(tags && tags.length > 0 ? { tags } : {}),
      ...(structured ? { structured } : {}),
      ...(origin ? { origin } : {}),
      ...(history ? { history } : {}),
      ...(generationId ? { generation_id: generationId } : {}),
      ...(variantOfRecipeId ? { variant_of_recipe_id: variantOfRecipeId } : {}),
    });
    return response.data;
  }

  // Fire-and-forget analytics beacon: the review screen was closed without saving. Must
  // never block the UI, so errors are swallowed.
  async declineGeneration(generationId: string): Promise<void> {
    try {
      await this.client.post(API_ENDPOINTS.DECLINE_GENERATION, { generation_id: generationId });
    } catch { /* best-effort beacon */ }
  }

  async getPreferences(): Promise<UserPreferences> {
    const response = await this.client.get<UserPreferences>(API_ENDPOINTS.PREFERENCES);
    return response.data;
  }

  async updatePreferences(p: Partial<UserPreferences>): Promise<UserPreferences> {
    const response = await this.client.patch<UserPreferences>(API_ENDPOINTS.PREFERENCES, p);
    return response.data;
  }

  // Per-week override of the 3 scheduling fields for the week containing startsOn. A
  // null field on the returned object means "inherit the global default".
  async getWeekPreferences(startsOn: string): Promise<MealPlanWeekPreferences> {
    const response = await this.client.get<MealPlanWeekPreferences>(API_ENDPOINTS.MEAL_PLAN_WEEK_PREFERENCES, {
      params: { starts_on: startsOn },
    });
    return response.data;
  }

  // Full-replace, like updatePreferences — a null field reverts that setting to the
  // global default for this week.
  async updateWeekPreferences(startsOn: string, p: MealPlanWeekPreferences): Promise<MealPlanWeekPreferences> {
    const response = await this.client.patch<MealPlanWeekPreferences>(
      API_ENDPOINTS.MEAL_PLAN_WEEK_PREFERENCES,
      p,
      { params: { starts_on: startsOn } }
    );
    return response.data;
  }

  async voteRecipe(recipeId: number, vote: 1 | -1): Promise<void> {
    await this.client.put(`${API_ENDPOINTS.GET_RECIPE}/${recipeId}/vote`, { vote });
  }

  async unvoteRecipe(recipeId: number): Promise<void> {
    await this.client.delete(`${API_ENDPOINTS.GET_RECIPE}/${recipeId}/vote`);
  }

  // Get every meal-plan item in [startsOn, endsOn]. endsOn defaults server-side to
  // startsOn+6d (a week) when omitted.
  async getMealPlanWeek(startsOn: string, endsOn?: string): Promise<MealPlanWeek> {
    const response = await this.client.get<MealPlanWeek>(API_ENDPOINTS.MEAL_PLAN, {
      params: { starts_on: startsOn, ...(endsOn ? { ends_on: endsOn } : {}) },
    });
    return response.data;
  }

  // Assign a saved recipe to a day (upsert — replaces whatever was already there)
  async addMealPlanItem(recipeId: number, plannedOn: string, startTime?: string): Promise<MealPlanItem> {
    const response = await this.client.post<MealPlanItem>(API_ENDPOINTS.MEAL_PLAN_ITEMS, {
      recipe_id: recipeId,
      planned_on: plannedOn,
      ...(startTime ? { start_time: startTime } : {}),
    });
    return response.data;
  }

  // Move an item to a new day/time (Day view drag)
  async patchMealPlanItem(itemId: number, plannedOn: string, startTime: string): Promise<MealPlanItem> {
    const response = await this.client.patch<MealPlanItem>(`${API_ENDPOINTS.MEAL_PLAN_ITEMS}/${itemId}`, {
      planned_on: plannedOn,
      start_time: startTime,
    });
    return response.data;
  }

  async deleteMealPlanItem(itemId: number): Promise<void> {
    await this.client.delete(`${API_ENDPOINTS.MEAL_PLAN_ITEMS}/${itemId}`);
  }

  // Propose a fresh plan for [startsOn, endsOn] from the caller's saved recipes
  async suggestMealPlan(startsOn: string, endsOn: string): Promise<MealPlanSuggestion> {
    const response = await this.client.post<MealPlanSuggestion>(API_ENDPOINTS.MEAL_PLAN_SUGGEST, {
      starts_on: startsOn,
      ends_on: endsOn,
    });
    return response.data;
  }

  // Stream a short conversational acknowledgment of message via SSE (web only — call
  // mealPlanChat() separately/concurrently for the actual plan update). onChunk fires
  // once per text delta as it arrives; resolves once the stream ends.
  async streamMealPlanChatReply(
    startsOn: string,
    endsOn: string,
    message: string,
    onChunk: (text: string) => void
  ): Promise<void> {
    const token = await authService.getAccessToken();
    const response = await fetch(`${API_BASE_URL}/${API_ENDPOINTS.MEAL_PLAN_CHAT_STREAM}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ starts_on: startsOn, ends_on: endsOn, message }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`stream failed: ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const raw of events) {
        if (!raw.trim()) continue;
        const lines = raw.split('\n');
        const eventLine = lines.find(l => l.startsWith('event:'));
        const dataLine = lines.find(l => l.startsWith('data:'));
        const eventType = eventLine ? eventLine.slice(6).trim() : 'message';
        if (!dataLine) continue;
        const payload = JSON.parse(dataLine.slice(5).trim());
        if (eventType === 'error') throw new Error(typeof payload === 'string' ? payload : 'stream error');
        if (eventType === 'message') onChunk(payload as string);
      }
    }
  }

  // Refine an in-progress plan proposal — stateless, resend the full history each call
  async mealPlanChat(
    startsOn: string,
    endsOn: string,
    initial: MealPlanSuggestion,
    history: MealPlanChatTurn[],
    message: string
  ): Promise<MealPlanSuggestion> {
    const response = await this.client.post<MealPlanSuggestion>(API_ENDPOINTS.MEAL_PLAN_CHAT, {
      starts_on: startsOn,
      ends_on: endsOn,
      initial,
      history,
      message,
    });
    return response.data;
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
