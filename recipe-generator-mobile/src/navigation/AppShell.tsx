import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../context/ThemeContext';
import Sidebar from '../components/Sidebar';
import { Text, useIsDesktopNav } from '../components/ui';
import { space } from '../theme';
import { NAV_ITEMS } from './navItems';
import AppNavigator, { RootStackParamList } from './AppNavigator';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

type NavigateFn = (route: keyof RootStackParamList) => void;

/**
 * The narrow shell (BACKLOG 5.7 / DESIGN_SYSTEM §7.6): three fixed bottom tabs, replacing the
 * menu FAB and the slide-in drawer.
 *
 * Hand-rolled rather than `@react-navigation/bottom-tabs`, because the shell already owns the
 * active route and a `navigate`: a real tab navigator would mean nesting the three top-level
 * screens under a second navigator and reworking `RootStackParamList` and the in-screen
 * `navigate('Chat')` calls, to buy a row of buttons.
 *
 * ponytail: the bar does not hide itself when the keyboard opens, so on Android (adjustResize) it
 * eats ~56px while typing. Add a `Keyboard` listener if that annoys in practice.
 */
const TabBar: React.FC<{ activeRoute: string; onNavigate: NavigateFn }> = ({ activeRoute, onNavigate }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.tabBar}>
      {NAV_ITEMS.map((item) => {
        const active = item.route === activeRoute;
        return (
          <TouchableOpacity
            key={item.key}
            style={styles.tab}
            onPress={() => onNavigate(item.route)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
          >
            <Ionicons name={item.icon} size={22} color={active ? theme.accent : theme.muted} />
            <Text variant="caption" tone={active ? 'accent' : 'muted'}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const AppShell: React.FC = () => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [activeRoute, setActiveRoute] = useState('Chat');
  const [railCollapsed, setRailCollapsed] = useState(false);

  const isDesktopNav = useIsDesktopNav();
  // Cooking mode is immersive and already opts out of the stack header for the same reason.
  const showChrome = activeRoute !== 'CookingMode';

  const navigate: NavigateFn = (route) => {
    // Tabs and rail entries are top-level, so a tap replaces the stack instead of pushing onto
    // it — otherwise Recipes → MealPlan → Recipes leaves a back trail (BACKLOG 0.14). Tapping
    // the active item is a no-op: reset() would remount the screen and drop its state.
    if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name !== route) {
      navigationRef.reset({ index: 0, routes: [{ name: route }] });
    }
  };

  return (
    <View style={[styles.root, { flexDirection: isDesktopNav && showChrome ? 'row' : 'column' }]}>
      {isDesktopNav && showChrome && (
        <Sidebar
          activeRoute={activeRoute}
          onNavigate={navigate}
          collapsed={railCollapsed}
          onToggleCollapse={() => setRailCollapsed((v) => !v)}
        />
      )}

      <View style={styles.content}>
        <NavigationContainer
          ref={navigationRef}
          onStateChange={() => {
            const name = navigationRef.getCurrentRoute()?.name;
            if (name) setActiveRoute(name);
          }}
        >
          <AppNavigator />
        </NavigationContainer>
      </View>

      {!isDesktopNav && showChrome && <TabBar activeRoute={activeRoute} onNavigate={navigate} />}
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: t.bg,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: t.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
    paddingTop: space.sm,
    // No SafeAreaProvider in this app, so the home-indicator inset is a constant, as it already
    // was for the FAB this replaced.
    paddingBottom: Platform.OS === 'ios' ? space.xl : space.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
  },
});

export default AppShell;
