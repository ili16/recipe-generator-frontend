import { useCallback, useEffect, useState } from 'react';
import apiService from '../services/apiService';
import authService from '../services/authService';
import { Recipe, RecipeDocument } from '../types';
import { useAlert } from '../context/AlertContext';
import { getCachedRecipes, setCachedRecipes } from '../utils/recipesCache';
import type { VariantPreview } from '../screens/recipes/RecipePanels';

// Everything RecipesScreen knows about the saved-recipe list: loading it, keeping the
// cache in step, and the mutations (delete, vote, manual edit, AI refine, variants).
export function useRecipeLibrary() {
  const { showAlert, confirmAction } = useAlert();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Applies a locally-known-correct recipe list (post edit/delete/vote) to both
  // screen state and the cache, without a round-trip to the API.
  const applyRecipes = useCallback((next: Recipe[]) => {
    setRecipes(next);
    setCachedRecipes(next);
  }, []);

  const loadRecipes = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await apiService.getRecipes();
      setRecipes(data);
      setCachedRecipes(data);
    } catch (error) {
      console.error('Error loading recipes:', error);
      showAlert('Error', 'Failed to load recipes', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showAlert]);

  useEffect(() => {
    (async () => {
      try {
        const authenticated = await authService.isAuthenticated();
        setIsAuthenticated(authenticated);
        if (!authenticated) return;

        // Cache is the source of truth for opening this screen - avoids a loading
        // spinner on every visit. It's only refreshed from the API on pull-to-refresh,
        // or updated directly by local mutations and by saving a new recipe.
        const cached = await getCachedRecipes();
        if (cached) setRecipes(cached);
        else await loadRecipes();
      } catch (error) {
        console.error('Error checking auth:', error);
      }
    })();
  }, []);

  // Silent background refresh — no spinner, so it doesn't fight the cache-first mount.
  const refreshQuietly = useCallback(() => {
    apiService.getRecipes().then(applyRecipes).catch(error => console.error('Error refreshing recipes:', error));
  }, [applyRecipes]);

  const remove = async (recipeId: number) => {
    const confirmed = await confirmAction(
      'Delete Recipe',
      'Are you sure you want to delete this recipe?',
      { confirmLabel: 'Delete', destructive: true }
    );
    if (!confirmed) return false;

    try {
      await apiService.deleteRecipe(recipeId);
      applyRecipes(recipes.filter(r => r.id !== recipeId));
      showAlert('Success', 'Recipe deleted successfully', 'success');
      return true;
    } catch (error) {
      console.error('Error deleting recipe:', error);
      showAlert('Error', 'Failed to delete recipe', 'error');
      return false;
    }
  };

  // Toggles a thumbs up/down vote on a recipe: tapping the already-active vote clears
  // it, tapping the other one switches it. Optimistic update, reverted on error.
  const vote = async (recipe: Recipe, value: 1 | -1) => {
    const prevVote = recipe.my_vote ?? null;
    const nextVote = prevVote === value ? null : value;
    applyRecipes(recipes.map(r => (r.id === recipe.id ? { ...r, my_vote: nextVote } : r)));
    try {
      if (nextVote === null) await apiService.unvoteRecipe(recipe.id);
      else await apiService.voteRecipe(recipe.id, nextVote);
    } catch (error) {
      console.error('Error voting on recipe:', error);
      applyRecipes(recipes.map(r => (r.id === recipe.id ? { ...r, my_vote: prevVote } : r)));
      showAlert('Error', 'Failed to save your vote', 'error');
    }
  };

  // Structured doc isn't in the list response - fetch it on demand before editing/refining.
  const ensureStructured = async (recipe: Recipe): Promise<RecipeDocument | null> => {
    if (recipe.structured) return recipe.structured;
    try {
      const full = await apiService.getRecipeById(recipe.id);
      applyRecipes(recipes.map(r => (r.id === recipe.id ? full : r)));
      return full.structured ?? null;
    } catch {
      showAlert('Error', 'Failed to load recipe details', 'error');
      return null;
    }
  };

  const saveEdit = async (id: number, doc: RecipeDocument): Promise<boolean> => {
    try {
      const updated = await apiService.patchRecipe({ id, structured: doc });
      applyRecipes(recipes.map(r => (r.id === updated.id ? updated : r)));
      return true;
    } catch {
      showAlert('Error', 'Failed to save recipe', 'error');
      return false;
    }
  };

  // One-shot refine from the recipes list: a fresh agent thread each time, since there is
  // no conversation on this surface to follow up in (BACKLOG 3.13). The agent loads the
  // recipe by id and only proposes — the patch below is still the only write.
  const refine = async (recipe: Recipe, prompt: string): Promise<boolean> => {
    const doc = await ensureStructured(recipe);
    if (!doc) return false;
    try {
      const { text, document } = await apiService.chatTurn(
        `Apply this change to my saved recipe ${recipe.id} and show me the updated version. Do not save it.\n${prompt}`,
      );
      if (!document) {
        showAlert("Couldn't apply that", text || 'Could not refine the recipe.', 'error');
        return false;
      }
      if (recipe.manually_edited) {
        const ok = await confirmAction(
          'Overwrite manual edits?',
          'Applying this AI suggestion will replace your manual changes to this recipe.',
          { confirmLabel: 'Apply' },
        );
        if (!ok) return false;
      }
      const updated = await apiService.patchRecipe({
        id: recipe.id, structured: document, ai_sourced: true, change_prompt: prompt,
      });
      applyRecipes(recipes.map(r => (r.id === updated.id ? updated : r)));
      return true;
    } catch {
      showAlert('Error', 'Failed to refine recipe', 'error');
      return false;
    }
  };

  // Unlike Refine (which overwrites the recipe in place), a variant is a genuinely
  // different twist proposed alongside the original — it only becomes a real, separate
  // recipe if the user accepts it.
  const generateVariant = async (recipe: Recipe, hint: string): Promise<VariantPreview | null> => {
    const doc = await ensureStructured(recipe);
    if (!doc) {
      showAlert('Error', 'This recipe has no structured data to vary', 'error');
      return null;
    }
    try {
      const result = await apiService.generateVariant(recipe.id, hint || undefined);
      if (!result.structured) {
        showAlert('Error', 'Failed to generate a variant', 'error');
        return null;
      }
      return {
        recipename: result.recipename, recipe: result.recipe,
        structured: result.structured, variantOfRecipeId: result.variant_of_recipe_id,
      };
    } catch {
      showAlert('Error', 'Failed to generate a variant', 'error');
      return null;
    }
  };

  const acceptVariant = async (preview: VariantPreview): Promise<boolean> => {
    try {
      const saved = await apiService.saveRecipe(
        preview.recipename, preview.recipe, undefined, preview.structured,
        undefined, undefined, preview.variantOfRecipeId,
      );
      applyRecipes([saved, ...recipes]);
      return true;
    } catch {
      showAlert('Error', 'Failed to save the variant', 'error');
      return false;
    }
  };

  const loadHistory = async (recipeId: number) => {
    try {
      return await apiService.getRecipeHistory(recipeId);
    } catch {
      showAlert('Error', 'Failed to load edit history', 'error');
      return [];
    }
  };

  return {
    recipes, loading, refreshing, isAuthenticated,
    refresh: () => loadRecipes(true),
    refreshQuietly,
    remove, vote, ensureStructured, saveEdit, refine, generateVariant, acceptVariant, loadHistory,
  };
}
