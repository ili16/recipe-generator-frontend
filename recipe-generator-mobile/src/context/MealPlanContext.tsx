import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from '../services/apiService';
import { MealPlanItem, Recipe } from '../types';
import { toISODate, addDays, parseISODate } from '../utils/mealPlanDates';

const ITEMS_CACHE_KEY = 'mealplan_cache_items_v1';
const RECIPES_CACHE_KEY = 'mealplan_cache_recipes_v1';

interface MealPlanContextValue {
  itemsByDate: Record<string, MealPlanItem>;
  recipes: Recipe[];
  ensureRange: (startISO: string, endISO: string) => void;
  upsertItem: (item: MealPlanItem) => void;
  removeItem: (plannedOn: string) => void;
}

const MealPlanContext = createContext<MealPlanContextValue | null>(null);

// Shared meal-plan data for the Day/Week/Month views: an AsyncStorage-persisted
// itemsByDate map plus the saved-recipes list, so switching views is a synchronous
// read of already-known state (no loading spinner) with a background refresh to stay
// current. Scoped to MealPlanScreen's subtree.
export const MealPlanProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [itemsByDate, setItemsByDate] = useState<Record<string, MealPlanItem>>({});
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const [itemsRaw, recipesRaw] = await Promise.all([
          AsyncStorage.getItem(ITEMS_CACHE_KEY),
          AsyncStorage.getItem(RECIPES_CACHE_KEY),
        ]);
        if (itemsRaw) setItemsByDate(JSON.parse(itemsRaw));
        if (recipesRaw) setRecipes(JSON.parse(recipesRaw));
      } catch (error) {
        console.error('Error hydrating meal plan cache:', error);
      } finally {
        hydrated.current = true;
      }
      apiService.getRecipes().then(list => {
        setRecipes(list);
        AsyncStorage.setItem(RECIPES_CACHE_KEY, JSON.stringify(list)).catch(() => {});
      }).catch(error => console.error('Error refreshing recipes:', error));
    })();
  }, []);

  const persistItems = useCallback((next: Record<string, MealPlanItem>) => {
    AsyncStorage.setItem(ITEMS_CACHE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const ensureRange = useCallback((startISO: string, endISO: string) => {
    apiService.getMealPlanWeek(startISO, endISO).then(range => {
      setItemsByDate(prev => {
        const next = { ...prev };
        const byDate = new Map(range.items.map(it => [it.planned_on, it]));
        for (let d = parseISODate(startISO); toISODate(d) <= endISO; d = addDays(d, 1)) {
          const iso = toISODate(d);
          const found = byDate.get(iso);
          if (found) next[iso] = found; else delete next[iso];
        }
        persistItems(next);
        return next;
      });
    }).catch(error => console.error('Error refreshing meal plan range:', error));
  }, [persistItems]);

  const upsertItem = useCallback((item: MealPlanItem) => {
    setItemsByDate(prev => {
      const next = { ...prev, [item.planned_on]: item };
      persistItems(next);
      return next;
    });
  }, [persistItems]);

  const removeItem = useCallback((plannedOn: string) => {
    setItemsByDate(prev => {
      if (!(plannedOn in prev)) return prev;
      const next = { ...prev };
      delete next[plannedOn];
      persistItems(next);
      return next;
    });
  }, [persistItems]);

  return (
    <MealPlanContext.Provider value={{ itemsByDate, recipes, ensureRange, upsertItem, removeItem }}>
      {children}
    </MealPlanContext.Provider>
  );
};

export function useMealPlanContext(): MealPlanContextValue {
  const ctx = useContext(MealPlanContext);
  if (!ctx) throw new Error('useMealPlanContext must be used within a MealPlanProvider');
  return ctx;
}
