import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import apiService from '../services/apiService';
import authService from '../services/authService';
import { Recipe, RecipeDocument, RecipeVersion } from '../types';
import Loading from '../components/Loading';
import RecipeView from '../components/RecipeView';
import { useTheme, Theme } from '../context/ThemeContext';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { useAlert } from '../context/AlertContext';
import { TAGS_BY_GROUP, TAG_GROUP_LABELS, TAG_LABEL_BY_SLUG, TagGroup } from '../constants/tags';
import { getCachedRecipes, setCachedRecipes } from '../utils/recipesCache';

type Props = NativeStackScreenProps<RootStackParamList, 'Recipes'>;
type SortMode = 'recent' | 'name';

const CHANGE_KIND_ICON: Record<RecipeVersion['change_kind'], React.ComponentProps<typeof Ionicons>['name']> = {
  extraction: 'add-circle-outline',
  import: 'add-circle-outline',
  manual: 'create-outline',
  ai_edit: 'sparkles-outline',
};

const CHANGE_KIND_LABEL: Record<RecipeVersion['change_kind'], string> = {
  extraction: 'Created',
  import: 'Imported',
  manual: 'Manual edit',
  ai_edit: 'AI edit',
};

// One-line, human summary of what changed between two consecutive snapshots. entries are
// newest-first (as returned by the history endpoint), so `prev` is the chronologically
// earlier one at index+1.
function summarizeVersionChange(curr: RecipeDocument, prev?: RecipeDocument): string {
  if (!prev) return 'Initial version';
  const changes: string[] = [];
  if (curr.title !== prev.title) changes.push(`Renamed to "${curr.title}"`);
  if (curr.servings !== prev.servings) changes.push(`Servings ${prev.servings ?? '—'} → ${curr.servings ?? '—'}`);
  if (curr.prep_minutes !== prev.prep_minutes) changes.push(`Prep ${prev.prep_minutes ?? '—'} → ${curr.prep_minutes ?? '—'} min`);
  if (curr.cook_minutes !== prev.cook_minutes) changes.push(`Cook ${prev.cook_minutes ?? '—'} → ${curr.cook_minutes ?? '—'} min`);
  if (curr.difficulty !== prev.difficulty) changes.push('Difficulty changed');
  if ((curr.summary ?? '') !== (prev.summary ?? '')) changes.push('Summary updated');

  const prevIngredients = new Set(prev.ingredients.map(i => i.item.trim().toLowerCase()));
  const currIngredients = new Set(curr.ingredients.map(i => i.item.trim().toLowerCase()));
  const added = [...currIngredients].filter(i => !prevIngredients.has(i)).length;
  const removed = [...prevIngredients].filter(i => !currIngredients.has(i)).length;
  if (added) changes.push(`+${added} ingredient${added > 1 ? 's' : ''}`);
  if (removed) changes.push(`-${removed} ingredient${removed > 1 ? 's' : ''}`);

  if (curr.steps.length !== prev.steps.length) {
    const diff = curr.steps.length - prev.steps.length;
    changes.push(`${diff > 0 ? '+' : ''}${diff} step${Math.abs(diff) > 1 ? 's' : ''}`);
  } else if (curr.steps.some((s, i) => s.step_text !== prev.steps[i]?.step_text)) {
    changes.push('Steps updated');
  }

  return changes.length ? changes.join(' · ') : 'Minor edit';
}

const RecipesScreen: React.FC<Props> = ({ navigation }) => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showFilters, setShowFilters] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDoc, setEditDoc] = useState<RecipeDocument | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [refiningId, setRefiningId] = useState<number | null>(null);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [refineLoading, setRefineLoading] = useState(false);
  const [variantSourceId, setVariantSourceId] = useState<number | null>(null);
  const [variantHint, setVariantHint] = useState('');
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantPreview, setVariantPreview] = useState<{ recipename: string; recipe: string; structured: RecipeDocument; variantOfRecipeId: number } | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [historyEntries, setHistoryEntries] = useState<RecipeVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const { theme } = useTheme();
  const { showAlert, confirmAction } = useAlert();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  useEscapeBack();

  useEffect(() => {
    checkAuthAndLoadRecipes();
  }, []);

  const checkAuthAndLoadRecipes = async () => {
    try {
      const authenticated = await authService.isAuthenticated();
      setIsAuthenticated(authenticated);
      if (!authenticated) return;

      // Cache is the source of truth for opening this screen - avoids a loading
      // spinner on every visit. It's only refreshed from the API on pull-to-refresh,
      // or updated directly by local mutations and by saving a new recipe.
      const cached = await getCachedRecipes();
      if (cached) {
        setRecipes(cached);
      } else {
        await loadRecipes();
      }
    } catch (error) {
      console.error('Error checking auth:', error);
    }
  };

  const loadRecipes = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await apiService.getRecipes();
      setRecipes(data);
      setCachedRecipes(data);
    } catch (error) {
      console.error('Error loading recipes:', error);
      showAlert('Error', 'Failed to load recipes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Applies a locally-known-correct recipe list (post edit/delete/vote) to both
  // screen state and the cache, without a round-trip to the API.
  const applyRecipes = (next: Recipe[]) => {
    setRecipes(next);
    setCachedRecipes(next);
  };

  const onRefresh = useCallback(() => {
    loadRecipes(true);
  }, []);

  const handleDelete = async (recipeId: number) => {
    const confirmed = await confirmAction(
      'Delete Recipe',
      'Are you sure you want to delete this recipe?',
      { confirmLabel: 'Delete', destructive: true }
    );
    if (!confirmed) {
      return;
    }

    try {
      await apiService.deleteRecipe(recipeId);
      applyRecipes(recipes.filter(r => r.id !== recipeId));
      setExpandedId(prev => (prev === recipeId ? null : prev));
      showAlert('Success', 'Recipe deleted successfully');
    } catch (error) {
      console.error('Error deleting recipe:', error);
      showAlert('Error', 'Failed to delete recipe');
    }
  };

  // Toggles a thumbs up/down vote on a recipe: tapping the already-active vote clears
  // it, tapping the other one switches it. Optimistic update, reverted on error.
  const handleVote = async (recipe: Recipe, vote: 1 | -1) => {
    const prevVote = recipe.my_vote ?? null;
    const nextVote = prevVote === vote ? null : vote;
    applyRecipes(recipes.map(r => (r.id === recipe.id ? { ...r, my_vote: nextVote } : r)));
    try {
      if (nextVote === null) {
        await apiService.unvoteRecipe(recipe.id);
      } else {
        await apiService.voteRecipe(recipe.id, nextVote);
      }
    } catch (error) {
      console.error('Error voting on recipe:', error);
      applyRecipes(recipes.map(r => (r.id === recipe.id ? { ...r, my_vote: prevVote } : r)));
      showAlert('Error', 'Failed to save your vote');
    }
  };

  const toggleExpand = (recipeId: number) => {
    setExpandedId(expandedId === recipeId ? null : recipeId);
  };

  const toggleTagFilter = (slug: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  // Structured doc isn't in the list response - fetch it on demand before editing/refining.
  const ensureStructured = async (recipe: Recipe): Promise<RecipeDocument | null> => {
    if (recipe.structured) return recipe.structured;
    try {
      const full = await apiService.getRecipeById(recipe.id);
      applyRecipes(recipes.map(r => (r.id === recipe.id ? full : r)));
      return full.structured ?? null;
    } catch {
      showAlert('Error', 'Failed to load recipe details');
      return null;
    }
  };

  const startEdit = async (recipe: Recipe) => {
    const doc = (await ensureStructured(recipe)) ?? {
      title: recipe.recipename,
      summary: null,
      language: 'en',
      tags: recipe.tags ?? [],
      servings: null,
      prep_minutes: null,
      cook_minutes: null,
      difficulty: null,
      ingredients: [],
      steps: [],
    };
    setEditDoc(JSON.parse(JSON.stringify(doc)));
    setEditingId(recipe.id);
    setRefiningId(null);
    setHistoryId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDoc(null);
  };

  const openHistory = async (recipe: Recipe) => {
    if (historyId === recipe.id) {
      setHistoryId(null);
      return;
    }
    setEditingId(null);
    setRefiningId(null);
    setHistoryId(recipe.id);
    setHistoryLoading(true);
    try {
      const entries = await apiService.getRecipeHistory(recipe.id);
      setHistoryEntries(entries);
    } catch {
      showAlert('Error', 'Failed to load edit history');
      setHistoryEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const updateDoc = (patch: Partial<RecipeDocument>) => {
    setEditDoc(prev => (prev ? { ...prev, ...patch } : prev));
  };

  const updateIngredient = (idx: number, patch: Partial<RecipeDocument['ingredients'][number]>) => {
    setEditDoc(prev => prev ? { ...prev, ingredients: prev.ingredients.map((ing, i) => (i === idx ? { ...ing, ...patch } : ing)) } : prev);
  };

  const addIngredient = () => {
    setEditDoc(prev => prev ? {
      ...prev,
      ingredients: [...prev.ingredients, { item: '', quantity: null, quantity_text: '', unit: null, section: null, optional: false }],
    } : prev);
  };

  const removeIngredient = (idx: number) => {
    setEditDoc(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        ingredients: prev.ingredients.filter((_, i) => i !== idx),
        // keep step -> ingredient links valid: drop refs to the removed ingredient, shift later indices down
        steps: prev.steps.map(s => ({
          ...s,
          ingredient_indices: (s.ingredient_indices ?? []).filter(i => i !== idx).map(i => (i > idx ? i - 1 : i)),
        })),
      };
    });
  };

  const updateStep = (idx: number, patch: Partial<RecipeDocument['steps'][number]>) => {
    setEditDoc(prev => prev ? { ...prev, steps: prev.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)) } : prev);
  };

  const addStep = () => {
    setEditDoc(prev => prev ? {
      ...prev,
      steps: [...prev.steps, { sort_order: prev.steps.length + 1, step_text: '', timer_seconds: null, temperature_c: null, ingredient_indices: [] }],
    } : prev);
  };

  const removeStep = (idx: number) => {
    setEditDoc(prev => prev ? {
      ...prev,
      steps: prev.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sort_order: i + 1 })),
    } : prev);
  };

  const toggleEditTag = (slug: string) => {
    setEditDoc(prev => {
      if (!prev) return prev;
      const has = prev.tags.includes(slug);
      return { ...prev, tags: has ? prev.tags.filter(t => t !== slug) : [...prev.tags, slug] };
    });
  };

  const saveEdit = async () => {
    if (!editDoc || editingId == null) return;
    if (!editDoc.title.trim()) {
      showAlert('Error', 'Title is required');
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await apiService.patchRecipe({ id: editingId, structured: editDoc });
      applyRecipes(recipes.map(r => (r.id === updated.id ? updated : r)));
      setEditingId(null);
      setEditDoc(null);
    } catch {
      showAlert('Error', 'Failed to save recipe');
    } finally {
      setSavingEdit(false);
    }
  };

  const runRefine = async (recipe: Recipe) => {
    if (!refinePrompt.trim()) return;
    const doc = await ensureStructured(recipe);
    if (!doc) return;
    setRefineLoading(true);
    try {
      const result = await apiService.refineRecipe(
        { prompt: recipe.recipename, source_type: 'text' },
        doc, [], refinePrompt.trim(),
      );
      if (result.status !== 'applied' || !result.structured) {
        const detail = result.options?.length ? `${result.message}\n\nOptions: ${result.options.join(', ')}` : result.message;
        showAlert(result.status === 'rejected' ? "Can't apply that" : 'Needs a choice', detail || 'Could not refine the recipe.');
        return;
      }
      if (recipe.manually_edited) {
        const ok = await confirmAction(
          'Overwrite manual edits?',
          'Applying this AI suggestion will replace your manual changes to this recipe.',
          { confirmLabel: 'Apply' },
        );
        if (!ok) return;
      }
      const updated = await apiService.patchRecipe({
        id: recipe.id, structured: result.structured, ai_sourced: true, change_prompt: refinePrompt.trim(),
      });
      applyRecipes(recipes.map(r => (r.id === updated.id ? updated : r)));
      setRefinePrompt('');
      setRefiningId(null);
    } catch {
      showAlert('Error', 'Failed to refine recipe');
    } finally {
      setRefineLoading(false);
    }
  };

  // Unlike Refine (which overwrites the recipe in place), a variant is a genuinely
  // different twist proposed alongside the original — it only becomes a real, separate
  // recipe if the user accepts it.
  const runCreateVariant = async (recipe: Recipe) => {
    const doc = await ensureStructured(recipe);
    if (!doc) {
      showAlert('Error', 'This recipe has no structured data to vary');
      return;
    }
    setVariantLoading(true);
    try {
      const result = await apiService.generateVariant(recipe.id, variantHint.trim() || undefined);
      if (!result.structured) {
        showAlert('Error', 'Failed to generate a variant');
        return;
      }
      setVariantPreview({
        recipename: result.recipename, recipe: result.recipe,
        structured: result.structured, variantOfRecipeId: result.variant_of_recipe_id,
      });
    } catch {
      showAlert('Error', 'Failed to generate a variant');
    } finally {
      setVariantLoading(false);
    }
  };

  const acceptVariant = async () => {
    if (!variantPreview) return;
    try {
      const saved = await apiService.saveRecipe(
        variantPreview.recipename, variantPreview.recipe, undefined, variantPreview.structured,
        undefined, undefined, undefined, variantPreview.variantOfRecipeId,
      );
      applyRecipes([saved, ...recipes]);
      setVariantPreview(null);
      setVariantSourceId(null);
      setVariantHint('');
    } catch {
      showAlert('Error', 'Failed to save the variant');
    }
  };

  const recipeNameById = useMemo(() => {
    const map = new Map<number, string>();
    recipes.forEach(r => map.set(r.id, r.recipename));
    return map;
  }, [recipes]);

  const visibleRecipes = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = recipes.filter(r => {
      const matchesSearch = !q ||
        r.recipename.toLowerCase().includes(q) ||
        r.recipe.toLowerCase().includes(q);
      const matchesTags = selectedTags.size === 0 ||
        Array.from(selectedTags).every(t => (r.tags ?? []).includes(t));
      return matchesSearch && matchesTags;
    });
    if (sortMode === 'name') {
      list = [...list].sort((a, b) => a.recipename.localeCompare(b.recipename));
    }
    return list;
  }, [recipes, search, selectedTags, sortMode]);

  return (
    <View style={styles.container}>
      {!isAuthenticated ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Sign in required</Text>
          <Text style={styles.emptySubtext}>
            Please sign in to save and view your recipes
          </Text>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.generateButtonText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => navigation.navigate('Generate')}
          >
            <Text style={styles.skipButtonText}>Generate Recipes Anonymously</Text>
          </TouchableOpacity>
        </View>
      ) : loading && recipes.length === 0 ? (
        <Loading visible={true} message="Loading recipes..." />
      ) : recipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No recipes yet</Text>
          <Text style={styles.emptySubtext}>
            Generate and save your first recipe
          </Text>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={() => navigation.navigate('Generate')}
          >
            <Text style={styles.generateButtonText}>Generate Recipe</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.toolbar}>
            <View style={styles.searchRow}>
              <TextInput autoComplete="off"
                style={styles.searchInput}
                placeholder="Search recipes..."
                placeholderTextColor={theme.muted}
                value={search}
                onChangeText={setSearch}
              />
              <TouchableOpacity
                style={[styles.filterToggle, (showFilters || selectedTags.size > 0) && styles.filterToggleActive]}
                onPress={() => setShowFilters(v => !v)}
              >
                <Text style={[styles.filterToggleText, (showFilters || selectedTags.size > 0) && styles.filterToggleTextActive]}>
                  Tags{selectedTags.size > 0 ? ` (${selectedTags.size})` : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sortToggle}
                onPress={() => setSortMode(m => (m === 'recent' ? 'name' : 'recent'))}
              >
                <Text style={styles.sortToggleText}>{sortMode === 'recent' ? 'Recent' : 'A–Z'}</Text>
              </TouchableOpacity>
            </View>

            {showFilters && (
              <ScrollView style={styles.filterPanel} nestedScrollEnabled>
                {(Object.keys(TAGS_BY_GROUP) as TagGroup[]).map(group => (
                  <View key={group} style={styles.filterGroup}>
                    <Text style={styles.filterGroupLabel}>{TAG_GROUP_LABELS[group]}</Text>
                    <View style={styles.tagRow}>
                      {TAGS_BY_GROUP[group].map(tag => {
                        const sel = selectedTags.has(tag.slug);
                        return (
                          <TouchableOpacity
                            key={tag.slug}
                            style={[styles.tagChip, sel && styles.tagChipSel]}
                            onPress={() => toggleTagFilter(tag.slug)}
                          >
                            <Text style={[styles.tagChipText, sel && styles.tagChipTextSel]}>{tag.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          {visibleRecipes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No matching recipes</Text>
              <Text style={styles.emptySubtext}>Try a different search or fewer tag filters</Text>
            </View>
          ) : (
          <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.text}
              colors={[theme.accent]}
            />
          }
        >
          {visibleRecipes.map((recipe) => (
            <View key={recipe.id} style={styles.recipeCard}>
              <TouchableOpacity
                onPress={() => toggleExpand(recipe.id)}
                style={styles.cardHeader}
              >
                <View style={styles.cardHeaderMain}>
                  <Text style={styles.recipeName}>{recipe.recipename}</Text>
                  {recipe.variant_of_recipe_id != null && (
                    <Text style={styles.variantOfCaption}>
                      Variant of {recipeNameById.get(recipe.variant_of_recipe_id) ?? 'a saved recipe'}
                    </Text>
                  )}
                  {((recipe.tags ?? []).length > 0 || recipe.manually_edited) && (
                    <View style={styles.tagBadgeRow}>
                      {recipe.manually_edited && (
                        <View style={[styles.tagBadge, styles.tagBadgeRowInner]}>
                          <Ionicons name="create-outline" size={11} color={theme.accent} style={{ marginRight: 3 }} />
                          <Text style={styles.tagBadgeText}>Manually edited</Text>
                        </View>
                      )}
                      {(recipe.tags ?? []).map(slug => (
                        <View key={slug} style={styles.tagBadge}>
                          <Text style={styles.tagBadgeText}>{TAG_LABEL_BY_SLUG[slug] ?? slug}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <Ionicons
                  name={expandedId === recipe.id ? 'chevron-down' : 'chevron-forward'}
                  size={16}
                  color={theme.subtext}
                  style={styles.expandIcon}
                />
              </TouchableOpacity>

              {expandedId === recipe.id && (
                <View style={styles.cardContent}>
                  {editingId === recipe.id && editDoc ? (
                    <>
                      <ScrollView style={styles.editFormScroll} nestedScrollEnabled>
                        <Text style={styles.fieldLabel}>Title</Text>
                        <TextInput autoComplete="off"
                          style={styles.fieldInput}
                          value={editDoc.title}
                          onChangeText={t => updateDoc({ title: t })}
                          placeholderTextColor={theme.placeholder}
                        />

                        <Text style={styles.fieldLabel}>Summary</Text>
                        <TextInput autoComplete="off"
                          style={[styles.fieldInput, styles.fieldInputMultiline]}
                          value={editDoc.summary ?? ''}
                          onChangeText={t => updateDoc({ summary: t })}
                          multiline
                          placeholderTextColor={theme.placeholder}
                        />

                        <View style={styles.fieldRow}>
                          <View style={styles.fieldCol}>
                            <Text style={styles.fieldLabel}>Servings</Text>
                            <TextInput autoComplete="off"
                              style={styles.fieldInput}
                              keyboardType="numeric"
                              value={editDoc.servings != null ? String(editDoc.servings) : ''}
                              onChangeText={t => updateDoc({ servings: t.trim() ? parseInt(t, 10) || null : null })}
                              placeholderTextColor={theme.placeholder}
                            />
                          </View>
                          <View style={styles.fieldCol}>
                            <Text style={styles.fieldLabel}>Prep (min)</Text>
                            <TextInput autoComplete="off"
                              style={styles.fieldInput}
                              keyboardType="numeric"
                              value={editDoc.prep_minutes != null ? String(editDoc.prep_minutes) : ''}
                              onChangeText={t => updateDoc({ prep_minutes: t.trim() ? parseInt(t, 10) || null : null })}
                              placeholderTextColor={theme.placeholder}
                            />
                          </View>
                          <View style={styles.fieldCol}>
                            <Text style={styles.fieldLabel}>Cook (min)</Text>
                            <TextInput autoComplete="off"
                              style={styles.fieldInput}
                              keyboardType="numeric"
                              value={editDoc.cook_minutes != null ? String(editDoc.cook_minutes) : ''}
                              onChangeText={t => updateDoc({ cook_minutes: t.trim() ? parseInt(t, 10) || null : null })}
                              placeholderTextColor={theme.placeholder}
                            />
                          </View>
                        </View>

                        <Text style={styles.fieldLabel}>Difficulty</Text>
                        <TextInput autoComplete="off"
                          style={styles.fieldInput}
                          value={editDoc.difficulty ?? ''}
                          onChangeText={t => updateDoc({ difficulty: t })}
                          placeholder="e.g. easy"
                          placeholderTextColor={theme.placeholder}
                        />

                        <Text style={styles.sectionLabel}>Ingredients</Text>
                        {editDoc.ingredients.map((ing, idx) => (
                          <View key={idx} style={styles.ingredientEditRow}>
                            <TextInput autoComplete="off"
                              style={[styles.fieldInput, styles.ingredientAmountInput]}
                              placeholder="Amount"
                              placeholderTextColor={theme.placeholder}
                              value={ing.quantity_text ?? ''}
                              onChangeText={t => updateIngredient(idx, { quantity_text: t })}
                            />
                            <TextInput autoComplete="off"
                              style={[styles.fieldInput, styles.ingredientItemInput]}
                              placeholder="Ingredient"
                              placeholderTextColor={theme.placeholder}
                              value={ing.item}
                              onChangeText={t => updateIngredient(idx, { item: t })}
                            />
                            <TouchableOpacity
                              style={[styles.optionalToggle, ing.optional && styles.optionalToggleOn]}
                              onPress={() => updateIngredient(idx, { optional: !ing.optional })}
                            >
                              <Text style={[styles.optionalToggleText, ing.optional && styles.optionalToggleTextOn]}>opt</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.removeRowButton} onPress={() => removeIngredient(idx)}>
                              <Ionicons name="close" size={13} color={theme.muted} />
                            </TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity style={styles.addRowButton} onPress={addIngredient}>
                          <Text style={styles.addRowButtonText}>+ Add ingredient</Text>
                        </TouchableOpacity>

                        <Text style={styles.sectionLabel}>Steps</Text>
                        {editDoc.steps.map((step, idx) => (
                          <View key={idx} style={styles.stepEditBlock}>
                            <View style={styles.stepEditHeader}>
                              <Text style={styles.stepEditNumber}>{idx + 1}.</Text>
                              <TouchableOpacity style={styles.removeRowButton} onPress={() => removeStep(idx)}>
                                <Ionicons name="close" size={13} color={theme.muted} />
                              </TouchableOpacity>
                            </View>
                            <TextInput autoComplete="off"
                              style={[styles.fieldInput, styles.stepTextInput]}
                              placeholder="Step"
                              placeholderTextColor={theme.placeholder}
                              value={step.step_text}
                              onChangeText={t => updateStep(idx, { step_text: t })}
                              multiline
                            />
                            <View style={styles.fieldRow}>
                              <View style={styles.fieldCol}>
                                <Text style={styles.fieldLabel}>Timer (sec)</Text>
                                <TextInput autoComplete="off"
                                  style={styles.fieldInput}
                                  keyboardType="numeric"
                                  value={step.timer_seconds != null ? String(step.timer_seconds) : ''}
                                  onChangeText={t => updateStep(idx, { timer_seconds: t.trim() ? parseInt(t, 10) || null : null })}
                                  placeholderTextColor={theme.placeholder}
                                />
                              </View>
                              <View style={styles.fieldCol}>
                                <Text style={styles.fieldLabel}>Temp (°C)</Text>
                                <TextInput autoComplete="off"
                                  style={styles.fieldInput}
                                  keyboardType="numeric"
                                  value={step.temperature_c != null ? String(step.temperature_c) : ''}
                                  onChangeText={t => updateStep(idx, { temperature_c: t.trim() ? parseInt(t, 10) || null : null })}
                                  placeholderTextColor={theme.placeholder}
                                />
                              </View>
                            </View>
                          </View>
                        ))}
                        <TouchableOpacity style={styles.addRowButton} onPress={addStep}>
                          <Text style={styles.addRowButtonText}>+ Add step</Text>
                        </TouchableOpacity>

                        <Text style={styles.sectionLabel}>Tags</Text>
                        {(Object.keys(TAGS_BY_GROUP) as TagGroup[]).map(group => (
                          <View key={group} style={styles.filterGroup}>
                            <Text style={styles.filterGroupLabel}>{TAG_GROUP_LABELS[group]}</Text>
                            <View style={styles.tagRow}>
                              {TAGS_BY_GROUP[group].map(tag => {
                                const sel = editDoc.tags.includes(tag.slug);
                                return (
                                  <TouchableOpacity
                                    key={tag.slug}
                                    style={[styles.tagChip, sel && styles.tagChipSel]}
                                    onPress={() => toggleEditTag(tag.slug)}
                                  >
                                    <Text style={[styles.tagChipText, sel && styles.tagChipTextSel]}>{tag.label}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        ))}
                      </ScrollView>

                      <View style={styles.cardActions}>
                        <TouchableOpacity style={styles.cancelButton} onPress={cancelEdit} disabled={savingEdit}>
                          <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.deleteButton, savingEdit && styles.btnDisabled]}
                          onPress={saveEdit}
                          disabled={savingEdit}
                        >
                          <Text style={styles.deleteButtonText}>{savingEdit ? 'Saving…' : 'Save'}</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <ScrollView style={styles.recipeContentScroll} nestedScrollEnabled>
                        <RecipeView structured={recipe.structured} markdown={recipe.recipe} />
                      </ScrollView>

                      {refiningId === recipe.id && (
                        <View style={styles.refineBox}>
                          <TextInput autoComplete="off"
                            style={[styles.fieldInput, styles.fieldInputMultiline]}
                            placeholder="e.g. make it vegetarian, double the servings..."
                            placeholderTextColor={theme.placeholder}
                            value={refinePrompt}
                            onChangeText={setRefinePrompt}
                            editable={!refineLoading}
                            multiline
                          />
                          <TouchableOpacity
                            style={[styles.cookButton, (!refinePrompt.trim() || refineLoading) && styles.btnDisabled]}
                            onPress={() => runRefine(recipe)}
                            disabled={!refinePrompt.trim() || refineLoading}
                          >
                            <Text style={styles.cookButtonText}>{refineLoading ? 'Thinking…' : 'Apply'}</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {variantSourceId === recipe.id && (
                        <View style={styles.refineBox}>
                          {variantPreview ? (
                            <View style={styles.variantPreviewBox}>
                              <Text style={styles.variantPreviewTitle}>{variantPreview.recipename}</Text>
                              {variantPreview.structured.summary ? (
                                <Text style={styles.variantPreviewSummary}>{variantPreview.structured.summary}</Text>
                              ) : null}
                              <View style={styles.variantActionsRow}>
                                <TouchableOpacity style={styles.variantDiscardButton} onPress={() => setVariantPreview(null)}>
                                  <Text style={styles.variantDiscardButtonText}>Discard</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.variantAcceptButton} onPress={acceptVariant}>
                                  <Text style={styles.variantAcceptButtonText}>Save as new recipe</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : (
                            <>
                              <TextInput autoComplete="off"
                                style={[styles.fieldInput, styles.fieldInputMultiline]}
                                placeholder="Optional: steer the twist, e.g. make it Thai-style"
                                placeholderTextColor={theme.placeholder}
                                value={variantHint}
                                onChangeText={setVariantHint}
                                editable={!variantLoading}
                                multiline
                              />
                              <TouchableOpacity
                                style={[styles.cookButton, variantLoading && styles.btnDisabled]}
                                onPress={() => runCreateVariant(recipe)}
                                disabled={variantLoading}
                              >
                                <Text style={styles.cookButtonText}>{variantLoading ? 'Thinking…' : 'Generate'}</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      )}

                      {historyId === recipe.id && (
                        <View style={styles.historyBox}>
                          {historyLoading ? (
                            <Text style={styles.historyEmptyText}>Loading history…</Text>
                          ) : historyEntries.length === 0 ? (
                            <Text style={styles.historyEmptyText}>No edit history yet.</Text>
                          ) : (
                            <ScrollView style={styles.historyScroll} nestedScrollEnabled>
                              {historyEntries.map((entry, idx) => (
                                <View key={entry.version} style={styles.historyEntry}>
                                  <View style={styles.historyEntryHeader}>
                                    <Ionicons name={CHANGE_KIND_ICON[entry.change_kind]} size={13} color={theme.accent} style={{ marginRight: 6 }} />
                                    <Text style={styles.historyKind}>{CHANGE_KIND_LABEL[entry.change_kind]}</Text>
                                    <Text style={styles.historyDate}>{new Date(entry.created_at).toLocaleString()}</Text>
                                  </View>
                                  <Text style={styles.historySummary}>
                                    {summarizeVersionChange(entry.data, historyEntries[idx + 1]?.data)}
                                  </Text>
                                  {entry.change_note ? (
                                    <Text style={styles.historyNote}>“{entry.change_note}”</Text>
                                  ) : null}
                                </View>
                              ))}
                            </ScrollView>
                          )}
                        </View>
                      )}

                      <View style={styles.cardActions}>
                        <TouchableOpacity style={styles.cookButton} onPress={() => startEdit(recipe)}>
                          <Ionicons name="create-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
                          <Text style={styles.cookButtonText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cookButton}
                          onPress={() => {
                            setHistoryId(null);
                            setRefiningId(prev => (prev === recipe.id ? null : recipe.id));
                            setRefinePrompt('');
                          }}
                        >
                          <Ionicons name="sparkles-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
                          <Text style={styles.cookButtonText}>Refine with AI</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cookButton}
                          onPress={() => {
                            setHistoryId(null);
                            setVariantPreview(null);
                            setVariantSourceId(prev => (prev === recipe.id ? null : recipe.id));
                            setVariantHint('');
                          }}
                        >
                          <Ionicons name="copy-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
                          <Text style={styles.cookButtonText}>Create Variant</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cookButton} onPress={() => openHistory(recipe)}>
                          <Ionicons name="time-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
                          <Text style={styles.cookButtonText}>History</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cookButton}
                          onPress={() => navigation.navigate('CookingMode', { recipe })}
                        >
                          <Ionicons name="flame-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
                          <Text style={styles.cookButtonText}>Cook</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cookButton} onPress={() => handleVote(recipe, 1)}>
                          <Ionicons
                            name={recipe.my_vote === 1 ? 'thumbs-up' : 'thumbs-up-outline'}
                            size={14}
                            color={theme.accent}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cookButton} onPress={() => handleVote(recipe, -1)}>
                          <Ionicons
                            name={recipe.my_vote === -1 ? 'thumbs-down' : 'thumbs-down-outline'}
                            size={14}
                            color={theme.accent}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => handleDelete(recipe.id)}
                        >
                          <Ionicons name="trash-outline" size={14} color="#fff" style={{ marginRight: 6 }} />
                          <Text style={styles.deleteButtonText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>
          ))}
          </ScrollView>
          )}
        </>
      )}
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 15,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: t.text,
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 16,
    color: t.muted,
    textAlign: 'center',
    marginBottom: 30,
  },
  generateButton: {
    backgroundColor: t.accent,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  toolbar: {
    paddingHorizontal: 15,
    paddingTop: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: t.text,
  },
  filterToggle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  filterToggleActive: {
    borderColor: t.accent,
    backgroundColor: t.accentFaded,
  },
  filterToggleText: {
    fontSize: 13,
    color: t.subtext,
  },
  filterToggleTextActive: {
    color: t.accent,
    fontWeight: '600',
  },
  sortToggle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  sortToggleText: {
    fontSize: 13,
    color: t.subtext,
  },
  filterPanel: {
    marginTop: 10,
    maxHeight: 220,
    backgroundColor: t.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
    padding: 12,
  },
  filterGroup: {
    marginBottom: 10,
    gap: 6,
  },
  filterGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: t.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.bg,
  },
  tagChipSel: {
    borderColor: t.accent,
    backgroundColor: t.accentFaded,
  },
  tagChipText: {
    fontSize: 13,
    color: t.subtext,
  },
  tagChipTextSel: {
    color: t.accent,
    fontWeight: '600',
  },
  recipeCard: {
    backgroundColor: t.surface,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1.5,
    borderColor: t.accent,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
  },
  cardHeaderMain: {
    flex: 1,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: '600',
    color: t.text,
  },
  variantOfCaption: {
    fontSize: 12,
    color: t.subtext,
    marginTop: 2,
  },
  tagBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: t.accentFaded,
  },
  tagBadgeRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagBadgeText: {
    fontSize: 11,
    color: t.accent,
    fontWeight: '500',
  },
  expandIcon: {
    fontSize: 16,
    color: t.subtext,
    marginLeft: 10,
  },
  cardContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.hairline,
    padding: 15,
  },
  recipeContentScroll: {
    maxHeight: 420,
    marginBottom: 15,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  cancelButton: {
    backgroundColor: t.surface,
    borderWidth: 1.5,
    borderColor: t.border,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: t.subtext,
    fontSize: 14,
    fontWeight: '600',
  },
  editFormScroll: {
    maxHeight: 420,
    marginBottom: 15,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: t.muted,
    marginTop: 10,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: t.text,
    marginTop: 16,
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: t.bg,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: t.text,
  },
  fieldInputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fieldCol: {
    flex: 1,
  },
  ingredientEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  ingredientAmountInput: {
    flex: 1,
  },
  ingredientItemInput: {
    flex: 2,
  },
  optionalToggle: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.bg,
  },
  optionalToggleOn: {
    borderColor: t.accent,
    backgroundColor: t.accentFaded,
  },
  optionalToggleText: {
    fontSize: 11,
    color: t.muted,
  },
  optionalToggleTextOn: {
    color: t.accent,
    fontWeight: '600',
  },
  removeRowButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
  },
  removeRowButtonText: {
    color: t.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  addRowButton: {
    marginTop: 4,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.border,
    borderStyle: 'dashed',
  },
  addRowButtonText: {
    color: t.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  stepEditBlock: {
    marginBottom: 10,
  },
  stepEditHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepEditNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: t.subtext,
  },
  stepTextInput: {
    minHeight: 44,
    textAlignVertical: 'top',
    marginTop: 4,
    marginBottom: 6,
  },
  refineBox: {
    marginBottom: 15,
    gap: 8,
  },
  variantPreviewBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.hairline,
    backgroundColor: t.surface,
    gap: 6,
  },
  variantPreviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: t.text,
  },
  variantPreviewSummary: {
    fontSize: 13,
    color: t.subtext,
    lineHeight: 18,
  },
  variantActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  variantAcceptButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: t.accent,
  },
  variantAcceptButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  variantDiscardButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.border,
  },
  variantDiscardButtonText: {
    color: t.subtext,
    fontWeight: '600',
    fontSize: 13,
  },
  historyBox: {
    marginBottom: 15,
  },
  historyEmptyText: {
    fontSize: 13,
    color: t.muted,
    fontStyle: 'italic',
  },
  historyScroll: {
    maxHeight: 260,
  },
  historyEntry: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.hairline,
  },
  historyEntryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  historyKind: {
    fontSize: 12,
    fontWeight: '600',
    color: t.text,
    flex: 1,
  },
  historyDate: {
    fontSize: 11,
    color: t.muted,
  },
  historySummary: {
    fontSize: 13,
    color: t.subtext,
  },
  historyNote: {
    fontSize: 12,
    color: t.muted,
    fontStyle: 'italic',
    marginTop: 3,
  },
  cookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cookButtonText: {
    color: t.accent,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  skipButton: {
    marginTop: 15,
    padding: 10,
  },
  skipButtonText: {
    color: t.subtext,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default RecipesScreen;
