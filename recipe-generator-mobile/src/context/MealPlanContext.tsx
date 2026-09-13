import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from '../services/apiService';
import authService from '../services/authService';
import { mealPlanCacheKeys } from '../constants';
import { MealPlanItem, MEAL_SLOTS, Recipe } from '../types';
import { toISODate, addDays, parseISODate } from '../utils/mealPlanDates';

interface MealPlanContextValue {
  /** Every meal planned for a date, in the order the day is eaten (BACKLOG 6.4). */
  itemsByDate: Record<string, MealPlanItem[]>;
  recipes: Recipe[];
  ensureRange: (startISO: string, endISO: string) => void;
  /** Re-read the saved-recipe list — a recipe saved from chat this session is otherwise
   *  absent from the picker until the app restarts (BACKLOG 9.9). */
  refreshRecipes: () => void;
  upsertItem: (item: MealPlanItem) => void;
  removeItem: (item: MealPlanItem) => void;
}

const MealPlanContext = createContext<MealPlanContextValue | null>(null);

// A day reads in the order it is eaten, not in the order things were added to it.
const sortBySlot = (items: MealPlanItem[]): MealPlanItem[] =>
  [...items].sort((a, b) => MEAL_SLOTS.indexOf(a.meal_slot) - MEAL_SLOTS.indexOf(b.meal_slot));

// Shared meal-plan data for the Day/Week/Month views: an AsyncStorage-persisted
// itemsByDate map plus the saved-recipes list, so switching views is a synchronous
// read of already-known state (no loading spinner) with a background refresh to stay
// current. Scoped to MealPlanScreen's subtree.
export const MealPlanProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [itemsByDate, setItemsByDate] = useState<Record<string, MealPlanItem[]>>({});
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const hydrated = useRef(false);
  // Resolved once per mount before anything touches AsyncStorage, so a stale cache read
  // under the wrong key (and thus another account's data) can never happen.
  const userIdRef = useRef<string | null>(null);

  const refreshRecipes = useCallback(() => {
    apiService.getRecipes().then(list => {
      setRecipes(list);
      if (userIdRef.current) {
        AsyncStorage.setItem(mealPlanCacheKeys(userIdRef.current).recipes, JSON.stringify(list)).catch(() => {});
      }
    }).catch(error => console.error('Error refreshing recipes:', error));
  }, []);

  useEffect(() => {
    (async () => {
      const userId = await authService.getUserId();
      userIdRef.current = userId;
      if (!userId) {
        hydrated.current = true;
        return;
      }
      const keys = mealPlanCacheKeys(userId);
      try {
        const [itemsRaw, recipesRaw] = await Promise.all([
          AsyncStorage.getItem(keys.items),
          AsyncStorage.getItem(keys.recipes),
        ]);
        if (itemsRaw) setItemsByDate(JSON.parse(itemsRaw));
        if (recipesRaw) setRecipes(JSON.parse(recipesRaw));
      } catch (error) {
        console.error('Error hydrating meal plan cache:', error);
      } finally {
        hydrated.current = true;
      }
      refreshRecipes();
    })();
  }, [refreshRecipes]);

  const persistItems = useCallback((next: Record<string, MealPlanItem[]>) => {
    if (!userIdRef.current) return;
    AsyncStorage.setItem(mealPlanCacheKeys(userIdRef.current).items, JSON.stringify(next)).catch(() => {});
  }, []);

  const ensureRange = useCallback((startISO: string, endISO: string) => {
    apiService.getMealPlanWeek(startISO, endISO).then(range => {
      setItemsByDate(prev => {
        const next = { ...prev };
        // The API already returns the range sorted by date then slot, so grouping keeps
        // that order and nothing here has to know what the slot order is.
        const byDate = new Map<string, MealPlanItem[]>();
        for (const it of range.items) {
          byDate.set(it.planned_on, [...(byDate.get(it.planned_on) ?? []), it]);
        }
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

  // Mirrors the server's upsert key: the item replaces whatever held its (date, slot),
  // and the day's other meals stay put.
  const upsertItem = useCallback((item: MealPlanItem) => {
    setItemsByDate(prev => {
      const day = (prev[item.planned_on] ?? []).filter(i => i.meal_slot !== item.meal_slot);
      const next = { ...prev, [item.planned_on]: sortBySlot([...day, item]) };
      persistItems(next);
      return next;
    });
  }, [persistItems]);

  const removeItem = useCallback((item: MealPlanItem) => {
    setItemsByDate(prev => {
      const day = prev[item.planned_on];
      if (!day) return prev;
      const next = { ...prev };
      const kept = day.filter(i => i.id !== item.id);
      if (kept.length) next[item.planned_on] = kept; else delete next[item.planned_on];
      persistItems(next);
      return next;
    });
  }, [persistItems]);

  return (
    <MealPlanContext.Provider value={{ itemsByDate, recipes, ensureRange, refreshRecipes, upsertItem, removeItem }}>
      {children}
    </MealPlanContext.Provider>
  );
};

export function useMealPlanContext(): MealPlanContextValue {
  const ctx = useContext(MealPlanContext);
  if (!ctx) throw new Error('useMealPlanContext must be used within a MealPlanProvider');
  return ctx;
}
