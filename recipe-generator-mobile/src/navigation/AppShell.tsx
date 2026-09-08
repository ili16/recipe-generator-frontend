import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Pressable, Platform, useWindowDimensions } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../context/ThemeContext';
import Sidebar from '../components/Sidebar';
import AppNavigator, { RootStackParamList } from './AppNavigator';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Sidebar breakpoint — distinct from GenerateScreen's 720px content breakpoint, since the
// sidebar needs extra width alongside that content.
const DESKTOP_NAV_BREAKPOINT = 900;

const AppShell: React.FC = () => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [activeRoute, setActiveRoute] = useState('Generate');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);

  const isDesktopNav = Platform.OS === 'web' && width >= DESKTOP_NAV_BREAKPOINT;
  // Cooking mode is immersive and already opts out of the stack header for the same reason.
  const showChrome = activeRoute !== 'CookingMode';

  const navigate = (route: keyof RootStackParamList) => {
    if (navigationRef.isReady()) navigationRef.navigate(route as never);
    setDrawerOpen(false);
  };

  return (
    <View style={[styles.root, { flexDirection: isDesktopNav && showChrome ? 'row' : 'column' }]}>
      {isDesktopNav && showChrome && (
        <Sidebar
          variant="rail"
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

      {!isDesktopNav && showChrome && (
        <TouchableOpacity style={styles.fab} onPress={() => setDrawerOpen(true)}>
          <Ionicons name="menu" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {!isDesktopNav && drawerOpen && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={() => setDrawerOpen(false)} />
          <View style={styles.drawerPanel}>
            <Sidebar variant="drawer" activeRoute={activeRoute} onNavigate={navigate} onClose={() => setDrawerOpen(false)} />
          </View>
        </View>
      )}
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: Platform.OS === 'ios' ? 40 : 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: t.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  drawerPanel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
});

export default AppShell;
