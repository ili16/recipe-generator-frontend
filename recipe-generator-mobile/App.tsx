import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import AppShell from './src/navigation/AppShell';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AlertProvider } from './src/context/AlertContext';
import authService from './src/services/authService';
import Loading from './src/components/Loading';

// Web only: if we just landed back from Keycloak's redirect (see
// authService.login), there's a `?code=&state=` pair to exchange for tokens
// before anything that checks auth status renders.
const hasPendingWebOAuthCallback =
  Platform.OS === 'web' && new URLSearchParams(window.location.search).has('code');

function Root() {
  const { isDark } = useTheme();
  const [authReady, setAuthReady] = useState(!hasPendingWebOAuthCallback);

  useEffect(() => {
    if (!authReady) {
      authService.completeWebLoginIfNeeded().finally(() => setAuthReady(true));
    }
  }, [authReady]);

  if (!authReady) {
    return <Loading visible message="Signing in..." />;
  }

  return (
    <>
      <AppShell />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AlertProvider>
          <Root />
        </AlertProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
