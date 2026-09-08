import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from './AppNavigator';

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  route?: keyof RootStackParamList; // absent = planned but not implemented yet
}

// Mirrors PRODUCT_PLAN.md's Core Use Cases / Weekly Management / Collaboration sections.
export const NAV_ITEMS: NavItem[] = [
  { key: 'generate', label: 'New Recipe', icon: 'sparkles-outline', route: 'Generate' },
  { key: 'recipes', label: 'My Recipes', icon: 'book-outline', route: 'Recipes' },
  { key: 'talk', label: 'Talk It Through', icon: 'chatbubbles-outline' },
  { key: 'mealplan', label: 'Meal Plan', icon: 'calendar-outline', route: 'MealPlan' },
  { key: 'grocery', label: 'Grocery List', icon: 'cart-outline' },
  { key: 'pantry', label: 'Pantry', icon: 'file-tray-stacked-outline' },
  { key: 'discover', label: 'Discover', icon: 'compass-outline' },
];

export const PROFILE_NAV_ITEM: NavItem = {
  key: 'profile',
  label: 'Profile',
  icon: 'person-circle-outline',
  route: 'Profile',
};
