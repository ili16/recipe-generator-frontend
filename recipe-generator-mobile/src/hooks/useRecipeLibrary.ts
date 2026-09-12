import { useCallback, useEffect, useState } from 'react';
import apiService from '../services/apiService';
import authService from '../services/authService';
import { Collection, Recipe, RecipeDocument } from '../types';
import { useAlert } from '../context/AlertContext';
import * as Clipboard from 'expo-clipboard';
import { shareUrl } from '../constants';
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
  // Trash is loaded on demand — it's a side view, not part of the cached library.
  const [trash, setTrash] = useState<Recipe[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);

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
      'This moves the recipe to the trash. It stays restorable for 30 days.',
      { confirmLabel: 'Delete', destructive: true }
    );
    if (!confirmed) return false;

    try {
      await apiService.deleteRecipe(recipeId);
      applyRecipes(recipes.filter(r => r.id !== recipeId));
      showAlert('Moved to trash', 'You can restore it from the trash for 30 days', 'success');
      return true;
    } catch (error) {
      console.error('Error deleting recipe:', error);
      showAlert('Error', 'Failed to delete recipe', 'error');
      return false;
    }
  };

  const loadCollections = useCallback(async () => {
    try {
      setCollections(await apiService.getCollections());
    } catch (error) {
      console.error('Error loading collections:', error);
    }
  }, []);

  const createCollection = async (name: string): Promise<Collection | null> => {
    try {
      const created = await apiService.createCollection(name);
      // Re-creating an existing name returns that collection, so replace rather than append.
      setCollections(prev => [...prev.filter(c => c.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name)));
      return created;
    } catch (error) {
      console.error('Error creating collection:', error);
      showAlert('Error', 'Failed to create the collection', 'error');
      return null;
    }
  };

  const removeCollection = async (collection: Collection) => {
    const confirmed = await confirmAction(
      `Delete "${collection.name}"?`,
      'The collection goes away. The recipes in it stay in your library.',
      { confirmLabel: 'Delete', destructive: true },
    );
    if (!confirmed) return false;
    try {
      await apiService.deleteCollection(collection.id);
      setCollections(prev => prev.filter(c => c.id !== collection.id));
      return true;
    } catch (error) {
      console.error('Error deleting collection:', error);
      showAlert('Error', 'Failed to delete the collection', 'error');
      return false;
    }
  };

  // Optimistic: the membership row is the only state, and a failure puts it straight back.
  const setRecipeCollection = async (collectionId: number, recipeId: number, member: boolean) => {
    const apply = (on: boolean) => setCollections(prev => prev.map(c => (
      c.id !== collectionId ? c
        : { ...c, recipe_ids: on ? [recipeId, ...c.recipe_ids.filter(id => id !== recipeId)] : c.recipe_ids.filter(id => id !== recipeId) }
    )));
    apply(member);
    try {
      await apiService.setRecipeCollection(collectionId, recipeId, member);
    } catch (error) {
      console.error('Error updating collection membership:', error);
      apply(!member);
      showAlert('Error', 'Failed to update the collection', 'error');
    }
  };

  const loadTrash = useCallback(async () => {
    try {
      setTrash(await apiService.getTrash());
    } catch (error) {
      console.error('Error loading trash:', error);
      showAlert('Error', 'Failed to load the trash', 'error');
    }
  }, [showAlert]);

  // Restoring puts the recipe back at the top of the library optimistically; the next
  // refresh re-sorts it by updated_at, which is where it actually belongs.
  const restore = async (recipe: Recipe) => {
    try {
      await apiService.restoreRecipe(recipe.id);
      setTrash(prev => prev.filter(r => r.id !== recipe.id));
      applyRecipes([recipe, ...recipes.filter(r => r.id !== recipe.id)]);
      return true;
    } catch (error) {
      console.error('Error restoring recipe:', error);
      showAlert('Error', 'Failed to restore the recipe', 'error');
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

  // Share on: issue (or reuse) the token, put the link on the clipboard, and show it.
  // Share off: revoke, which kills the link everyone already has (BACKLOG 8.4).
  const toggleShare = async (recipe: Recipe) => {
    try {
      if (recipe.share_token) {
        if (!(await confirmAction('Stop sharing?', 'Anyone with the existing link will lose access.',
          { confirmLabel: 'Stop sharing', destructive: true }))) return;
        await apiService.unshareRecipe(recipe.id);
        applyRecipes(recipes.map(r => (r.id === recipe.id ? { ...r, share_token: null } : r)));
        showAlert('Link revoked', 'The shared link no longer works', 'success');
        return;
      }
      const token = await apiService.shareRecipe(recipe.id);
      applyRecipes(recipes.map(r => (r.id === recipe.id ? { ...r, share_token: token } : r)));
      const url = shareUrl(token);
      await Clipboard.setStringAsync(url);
      showAlert('Link copied', url, 'success');
    } catch (error) {
      console.error('Error sharing recipe:', error);
      showAlert('Error', 'Failed to update sharing', 'error');
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
    remove, vote, toggleShare, ensureStructured, saveEdit, refine, generateVariant, acceptVariant, loadHistory,
    trash, loadTrash, restore,
    collections, loadCollections, createCollection, removeCollection, setRecipeCollection,
  };
}
