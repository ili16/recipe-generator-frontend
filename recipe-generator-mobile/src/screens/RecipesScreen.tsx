import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import Loading from '../components/Loading';
import { useTheme, Theme } from '../context/ThemeContext';
import { type } from '../theme';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { useRecipeLibrary } from '../hooks/useRecipeLibrary';
import RecipeToolbar, { SortMode } from './recipes/RecipeToolbar';
import RecipeCard from './recipes/RecipeCard';

type Props = NativeStackScreenProps<RootStackParamList, 'Recipes'>;

const RecipesScreen: React.FC<Props> = ({ navigation }) => {
  const lib = useRecipeLibrary();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  useEscapeBack();

  // Keep the list current with whatever created a recipe elsewhere (e.g. accepting an
  // AI-suggested meal-plan variant) — a silent background refresh, no spinner, so this
  // doesn't fight the cache-first mount.
  useEffect(() => navigation.addListener('focus', lib.refreshQuietly), [navigation]);

  const toggleTagFilter = (slug: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  const recipeNameById = useMemo(() => {
    const map = new Map<number, string>();
    lib.recipes.forEach(r => map.set(r.id, r.recipename));
    return map;
  }, [lib.recipes]);

  const visibleRecipes = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = lib.recipes.filter(r => {
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
  }, [lib.recipes, search, selectedTags, sortMode]);

  if (!lib.isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Sign in required</Text>
          <Text style={styles.emptySubtext}>Please sign in to save and view your recipes</Text>
          <TouchableOpacity style={styles.generateButton} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.generateButtonText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={() => navigation.navigate('Chat')}>
            <Text style={styles.skipButtonText}>Generate Recipes Anonymously</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (lib.loading && lib.recipes.length === 0) {
    return (
      <View style={styles.container}>
        <Loading visible={true} message="Loading recipes..." />
      </View>
    );
  }

  if (lib.recipes.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No recipes yet</Text>
          <Text style={styles.emptySubtext}>Generate and save your first recipe</Text>
          <TouchableOpacity style={styles.generateButton} onPress={() => navigation.navigate('Chat')}>
            <Text style={styles.generateButtonText}>Generate Recipe</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <RecipeToolbar
        search={search}
        onSearch={setSearch}
        selectedTags={selectedTags}
        onToggleTag={toggleTagFilter}
        sortMode={sortMode}
        onToggleSort={() => setSortMode(m => (m === 'recent' ? 'name' : 'recent'))}
      />

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
              refreshing={lib.refreshing}
              onRefresh={lib.refresh}
              tintColor={theme.text}
              colors={[theme.accent]}
            />
          }
        >
          {visibleRecipes.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              expanded={expandedId === recipe.id}
              variantOfName={recipe.variant_of_recipe_id != null ? recipeNameById.get(recipe.variant_of_recipe_id) : undefined}
              onToggle={() => setExpandedId(prev => (prev === recipe.id ? null : recipe.id))}
              onCook={() => navigation.navigate('CookingMode', { recipe })}
              onDelete={async () => {
                if (await lib.remove(recipe.id)) {
                  setExpandedId(prev => (prev === recipe.id ? null : prev));
                }
              }}
              onVote={v => lib.vote(recipe, v)}
              ensureStructured={lib.ensureStructured}
              onSaveEdit={doc => lib.saveEdit(recipe.id, doc)}
              onRefine={prompt => lib.refine(recipe, prompt)}
              onGenerateVariant={hint => lib.generateVariant(recipe, hint)}
              onAcceptVariant={preview => lib.acceptVariant(preview)}
              onLoadHistory={() => lib.loadHistory(recipe.id)}
            />
          ))}
        </ScrollView>
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
    ...type.title,
    color: t.text,
    marginBottom: 10,
  },
  emptySubtext: {
    ...type.body, fontSize: 16,
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
    color: t.onAccent,
    ...type.label, fontSize: 16,
  },
  skipButton: {
    marginTop: 15,
    padding: 10,
  },
  skipButtonText: {
    color: t.subtext,
    ...type.label,
    textAlign: 'center',
  },
});

export default RecipesScreen;
