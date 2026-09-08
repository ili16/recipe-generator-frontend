import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import authService, { AuthMode } from '../services/authService';
import Loading from '../components/Loading';
import { useTheme, Theme } from '../context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const handleLogin = async (mode: AuthMode) => {
    setLoading(true);
    try {
      const profile = await authService.login(mode);
      if (Platform.OS === 'web') {
        // Web login redirects the whole page to Keycloak; the app reloads
        // once the user comes back, so there's nothing left to do here.
        return;
      }
      if (profile) {
        Alert.alert('Welcome!', `Logged in as ${profile.name}`);
        navigation.goBack();
      } else {
        Alert.alert('Login Failed', 'Unable to authenticate. Please try again.');
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Error', 'An error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Sign In</Text>
        <Text style={styles.subtitle}>
          Sign in to save recipes and create cookbooks.
        </Text>

        <TouchableOpacity
          style={[styles.authButton, styles.primaryButton]}
          onPress={() => handleLogin('login')}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>Log in</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.authButton, styles.googleButton]}
          onPress={() => handleLogin('signup')}
          disabled={loading}
        >
          <Text style={styles.authButtonText}>Signup for free</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
      
      <Loading visible={loading} message="Signing in..." />
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: t.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: t.muted,
    marginBottom: 40,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  authButton: {
    width: '100%',
    maxWidth: 300,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 1.5,
  },
  googleButton: {
    backgroundColor: 'transparent',
    borderColor: t.accent,
  },
  authButtonText: {
    color: t.text,
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: t.accent,
    borderColor: t.accent,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    marginTop: 20,
    padding: 10,
  },
  skipButtonText: {
    color: t.subtext,
    fontSize: 16,
    fontWeight: '500',
  },
});

export default LoginScreen;
