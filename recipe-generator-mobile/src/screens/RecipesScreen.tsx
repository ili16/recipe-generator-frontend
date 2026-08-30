import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import apiService from '../services/apiService';
import authService from '../services/authService';
import { Recipe } from '../types';
import Loading from '../components/Loading';
import { useTheme, Theme } from '../context/ThemeContext';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { useAlert } from '../context/AlertContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Recipes'>;

const RecipesScreen: React.FC<Props> = ({ navigation }) => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { theme } = useTheme();
  const { showAlert, confirmAction } = useAlert();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  useEscapeBack();

  useEffect(() => {
    checkAuthAndLoadRecipes();
  }, []);

  const checkAuthAndLoadRecipes = async () => {
    setLoading(true);
    try {
      const authenticated = await authService.isAuthenticated();
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        await loadRecipes();
      }
    } catch (error) {
      console.error('Error checking auth:', error);
    } finally {
      setLoading(false);
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
    } catch (error) {
      console.error('Error loading recipes:', error);
      showAlert('Error', 'Failed to load recipes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
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
      setRecipes(prev => prev.filter(r => r.id !== recipeId));
      setExpandedId(prev => (prev === recipeId ? null : prev));
      showAlert('Success', 'Recipe deleted successfully');
    } catch (error) {
      console.error('Error deleting recipe:', error);
      showAlert('Error', 'Failed to delete recipe');
    }
  };

  const toggleExpand = (recipeId: number) => {
    setExpandedId(expandedId === recipeId ? null : recipeId);
  };

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
          {recipes.map((recipe) => (
            <View key={recipe.id} style={styles.recipeCard}>
              <TouchableOpacity
                onPress={() => toggleExpand(recipe.id)}
                style={styles.cardHeader}
              >
                <Text style={styles.recipeName}>{recipe.recipename}</Text>
                <Text style={styles.expandIcon}>
                  {expandedId === recipe.id ? '▼' : '▶'}
                </Text>
              </TouchableOpacity>

              {expandedId === recipe.id && (
                <View style={styles.cardContent}>
                  <ScrollView style={styles.recipeContentScroll}>
                    <Text style={styles.recipeText}>{recipe.recipe}</Text>
                  </ScrollView>
                  
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.cookButton}
                      onPress={() => navigation.navigate('CookingMode', { recipe })}
                    >
                      <Text style={styles.cookButtonText}>🍳 Cook</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDelete(recipe.id)}
                    >
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
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
  recipeName: {
    fontSize: 18,
    fontWeight: '600',
    color: t.text,
    flex: 1,
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
    maxHeight: 300,
    marginBottom: 15,
  },
  recipeText: {
    fontSize: 14,
    lineHeight: 20,
    color: t.subtext,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cookButton: {
    backgroundColor: t.surface,
    borderWidth: 1.5,
    borderColor: t.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cookButtonText: {
    color: t.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: t.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
