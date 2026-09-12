import React from 'react';
import { TouchableOpacity } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { type } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useIsDesktopNav } from '../components/ui';

// Screens - we'll create these next
import ChatScreen from '../screens/ChatScreen';
import RecipesScreen from '../screens/RecipesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PreferencesScreen from '../screens/PreferencesScreen';
import LoginScreen from '../screens/LoginScreen';
import CookingModeScreen from '../screens/CookingModeScreen';
import MealPlanScreen from '../screens/MealPlanScreen';
import { Recipe } from '../types';

export type RootStackParamList = {
  Login: undefined;
  // `prompt` is sent as a user turn on arrival (the planner hands a day or a week over
  // to the thread); the screen clears the param so it never re-fires.
  Chat: { prompt?: string } | undefined;
  Recipes: undefined;
  Profile: undefined;
  Preferences: undefined;
  CookingMode: { recipe: Recipe };
  MealPlan: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Tab / rail destinations are top-level: the shell is what moves between them, so the stack's
// back button is noise (and lies about where "back" goes). Sub-screens reached from inside a
// screen — Preferences, Login, CookingMode — keep theirs.
const topLevel = { headerBackVisible: false } as const;

/** Only `navigate('Profile')` is needed here; typing it this narrowly avoids an `any`. */
type ProfileNav = { navigate: (route: 'Profile') => void };

const AppNavigator: React.FC = () => {
  const { theme } = useTheme();
  const isDesktopNav = useIsDesktopNav();

  // Profile holds logout, Appearance and the way into Preferences. On wide the rail's footer
  // links to it; on narrow there is no rail and it is not one of the three tabs, so without this
  // header button it would be unreachable (BACKLOG 5.7). The mockups put an avatar here too.
  const profileButton = ({ navigation }: { navigation: ProfileNav }) =>
    isDesktopNav
      ? topLevel
      : {
          ...topLevel,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate('Profile')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Profile"
            >
              <Ionicons name="person-circle-outline" size={26} color={theme.subtext} />
            </TouchableOpacity>
          ),
        };

  return (
    <Stack.Navigator
      initialRouteName="Chat"
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.accent,
        // The native header takes family/size/weight only — no lineHeight.
        headerTitleStyle: { fontFamily: type.title.fontFamily, fontSize: 17, color: theme.text },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={(props) => ({ title: 'Recipe Generator', ...profileButton(props) })}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ title: 'Sign In' }}
      />
      <Stack.Screen
        name="Recipes"
        component={RecipesScreen}
        options={(props) => ({ title: 'My Recipes', ...profileButton(props) })}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        // Top-level on wide (a rail entry, reset to). On narrow it is *pushed* by the header
        // button above, so it keeps its back arrow — it is not a tab to return from.
        options={{ title: 'Profile', headerBackVisible: !isDesktopNav }}
      />
      <Stack.Screen
        name="Preferences"
        component={PreferencesScreen}
        options={{ title: 'Preferences' }}
      />
      <Stack.Screen
        name="CookingMode"
        component={CookingModeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MealPlan"
        component={MealPlanScreen}
        options={(props) => ({ title: 'Meal Plan', ...profileButton(props) })}
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;
