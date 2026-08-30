import axios, { AxiosInstance } from 'axios';
import { Platform } from 'react-native';
import { API_BASE_URL, API_ENDPOINTS } from '../constants';
import { Recipe, RecipeDocument, RecipeResponse, PatchRecipePayload, ValidateChangesPayload, ValidateChangesResponse } from '../types';
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
  async generateByDescription(
    description: string,
    isGerman: boolean = false
  ): Promise<RecipeResponse> {
    const formData = new FormData();
    formData.append('description', description);
    return this.generateRecipe(formData);
  }

  // Generate recipe by link
  async generateByLink(url: string, isGerman: boolean = false): Promise<RecipeResponse> {
    const formData = new FormData();
    formData.append('url', url);
    return this.generateRecipe(formData);
  }

  // Generate recipe by image
  async generateByImage(imageUri: string): Promise<RecipeResponse> {
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

    return this.generateRecipe(formData);
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

  async updateItem(current: string, instruction: string, context: string): Promise<string> {
    try {
      const response = await this.client.post<{ updated: string }>(API_ENDPOINTS.UPDATE_ITEM, { current, instruction, context });
      return response.data.updated ?? current;
    } catch {
      return current;
    }
  }

  async suggestInput(input: string): Promise<string> {
    try {
      const response = await this.client.post<{ suggestion: string }>(API_ENDPOINTS.SUGGEST, { input });
      return response.data.suggestion ?? '';
    } catch (error: any) {
      if (error?.response?.status === 422) throw error;
      return '';
    }
  }

  async suggestPrefs(input: string): Promise<Array<{ id: string; label: string; type: string; options: string[] }>> {
    try {
      const response = await this.client.post<{ questions: Array<{ id: string; label: string; type: string; options: string[] }> }>(API_ENDPOINTS.SUGGEST_PREFS, { input });
      return response.data.questions ?? [];
    } catch { return []; }
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

  async refineRecipe(recipe: string, structured: RecipeDocument | null, changePrompt: string): Promise<RecipeResponse> {
    const response = await this.client.post<RecipeResponse>(API_ENDPOINTS.REFINE_RECIPE, {
      recipe,
      structured,
      change_prompt: changePrompt,
    });
    return response.data;
  }

  async validateChanges(payload: ValidateChangesPayload): Promise<ValidateChangesResponse> {
    try {
      const response = await this.client.post<ValidateChangesResponse>(API_ENDPOINTS.VALIDATE_CHANGES, payload);
      return response.data;
    } catch {
      return { flags: [], can_proceed: true };
    }
  }

  async getRecipeById(recipeId: number): Promise<Recipe> {
    const response = await this.client.get<Recipe>(`${API_ENDPOINTS.GET_RECIPE}/${recipeId}`);
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

  async askStep(recipeName: string, stepText: string, question: string): Promise<string> {
    try {
      const response = await this.client.post<{ answer: string }>(API_ENDPOINTS.ASK_STEP, {
        recipe_name: recipeName,
        step_text: stepText,
        question,
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
    category?: string,
    structured?: RecipeDocument
  ): Promise<Recipe> {
    const response = await this.client.post<Recipe>(API_ENDPOINTS.SAVE_RECIPE, {
      recipename: recipeName,
      recipe: recipeContent,
      ...(category ? { category } : {}),
      ...(structured ? { structured } : {}),
    });
    return response.data;
  }
}

export default new ApiService();
