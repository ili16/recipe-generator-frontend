import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import AppNavigator from './src/navigation/AppNavigator';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AlertProvider } from './src/context/AlertContext';

WebBrowser.maybeCompleteAuthSession();

function Root() {
  const { isDark } = useTheme();
  return (
    <>
      <AppNavigator />
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
