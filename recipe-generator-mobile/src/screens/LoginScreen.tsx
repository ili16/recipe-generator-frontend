import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import authService, { AuthProvider } from '../services/authService';
import Loading from '../components/Loading';
import { useTheme, Theme } from '../context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const handleLogin = async (provider: AuthProvider) => {
    setLoading(true);
    try {
      const profile = await authService.login(provider);
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
          Sign in to save recipes and create cookbooks. Google is currently supported.
        </Text>
        
        {/* Google Sign In */}
        <TouchableOpacity
          style={[styles.authButton, styles.googleButton]}
          onPress={() => handleLogin('google')}
          disabled={loading}
        >
          <Text style={styles.authButtonText}>Continue with Google (recommended)</Text>
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
