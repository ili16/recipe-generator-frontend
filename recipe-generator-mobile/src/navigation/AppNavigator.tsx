import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';

// Screens - we'll create these next
import GenerateScreen from '../screens/GenerateScreen';
import RecipesScreen from '../screens/RecipesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LoginScreen from '../screens/LoginScreen';
import CookingModeScreen from '../screens/CookingModeScreen';
import { Recipe } from '../types';

export type RootStackParamList = {
  Login: undefined;
  Generate: undefined;
  Recipes: undefined;
  Profile: undefined;
  CookingMode: { recipe: Recipe };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  const { theme } = useTheme();
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Generate"
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.accent,
          headerTitleStyle: { fontWeight: '700', color: theme.text },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen
          name="Generate"
          component={GenerateScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: 'Sign In' }}
        />
        <Stack.Screen
          name="Recipes"
          component={RecipesScreen}
          options={{ title: 'My Recipes' }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ title: 'Profile' }}
        />
        <Stack.Screen
          name="CookingMode"
          component={CookingModeScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
