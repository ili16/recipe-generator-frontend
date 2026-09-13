import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from './AppNavigator';

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  route: keyof RootStackParamList;
}

/**
 * The five real destinations, and the bottom tab bar's contents on narrow (BACKLOG 5.7).
 *
 * `route` is required: the three route-less "Soon" entries (Grocery List, Pantry, Discover) are
 * gone. A tab is a promise, and an inert one is worse than an absent one — Grocery List arrived
 * with 6.1, Pantry with 7.1, Discover only if it is ever scheduled. Do not add an entry
 * here before the screen it points at exists.
 */
export const NAV_ITEMS: NavItem[] = [
  { key: 'chat', label: 'Chat', icon: 'chatbubbles-outline', route: 'Chat' },
  { key: 'recipes', label: 'My Recipes', icon: 'book-outline', route: 'Recipes' },
  { key: 'mealplan', label: 'Meal Plan', icon: 'calendar-outline', route: 'MealPlan' },
  { key: 'grocery', label: 'Grocery List', icon: 'cart-outline', route: 'GroceryList' },
  { key: 'pantry', label: 'Pantry', icon: 'file-tray-stacked-outline', route: 'Pantry' },
];

export const PROFILE_NAV_ITEM: NavItem = {
  key: 'profile',
  label: 'Profile',
  icon: 'person-circle-outline',
  route: 'Profile',
};
