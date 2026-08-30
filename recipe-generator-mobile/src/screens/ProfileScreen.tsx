import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import authService from '../services/authService';
import { UserProfile } from '../types';
import Loading from '../components/Loading';
import { useTheme, Theme } from '../context/ThemeContext';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { useAlert } from '../context/AlertContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { theme } = useTheme();
  const { showAlert } = useAlert();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  useEscapeBack();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const authenticated = await authService.isAuthenticated();
      setIsAuthenticated(authenticated);
      if (authenticated) {
        const userProfile = await authService.getUserProfile();
        setProfile(userProfile);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      showAlert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await authService.logout();
      setIsAuthenticated(false);
      setProfile(null);
      navigation.navigate('Generate');
    } catch (error) {
      console.error('Logout error:', error);
      showAlert('Error', 'Failed to logout');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Loading visible={true} message="Loading..." />;
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.centered}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Not Signed In</Text>
          <Text style={styles.muted}>Sign in to view your profile and save recipes</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostButton} onPress={() => navigation.navigate('Generate')}>
            <Text style={styles.ghostButtonText}>Continue Without Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Profile</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{profile?.name || '—'}</Text>
        </View>

        {profile?.email ? (
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{profile.email}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.primaryButton} onPress={handleLogout}>
          <Text style={styles.primaryButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: t.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: t.surface,
    borderRadius: 16,
    padding: 28,
    borderWidth: 1.5,
    borderColor: t.accent,
    gap: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: t.text,
    marginBottom: 4,
  },
  muted: {
    fontSize: 14,
    color: t.muted,
    lineHeight: 20,
  },
  field: {
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: t.muted,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    fontSize: 16,
    color: t.text,
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: t.accent,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  ghostButton: {
    padding: 10,
    alignItems: 'center',
  },
  ghostButtonText: {
    color: t.subtext,
    fontSize: 14,
  },
});

export default ProfileScreen;
