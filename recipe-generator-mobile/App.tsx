import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { fontAssets } from './src/theme';
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
  // Gate the first render on the brand fonts so nothing flashes in the system face and reflows
  // (BACKLOG 5.6). `error` counts as ready: a failed font download degrades to system fonts, it
  // does not hold the app on a spinner forever.
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    if (!authReady) {
      authService.completeWebLoginIfNeeded().finally(() => setAuthReady(true));
    }
  }, [authReady]);

  if (!fontsLoaded && !fontError) {
    return <Loading visible />;
  }

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
    <ThemeProvider>
      <AlertProvider>
        <Root />
      </AlertProvider>
    </ThemeProvider>
  );
}
