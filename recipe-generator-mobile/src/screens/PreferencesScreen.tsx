import React, { useState, useEffect, useMemo } from 'react';
import {
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import apiService from '../services/apiService';
import { UserPreferences } from '../types';
import PreferencesPanel from '../components/PreferencesPanel';
import Loading from '../components/Loading';
import { useTheme, Theme } from '../context/ThemeContext';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { useAlert } from '../context/AlertContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Preferences'>;

const EMPTY_PREFS: UserPreferences = {
  skill_level: null,
  dietary_prefs: [],
  disliked_ingredients: [],
  cooking_cadence: null,
  meal_plan_no_food_days: [],
  meal_plan_no_cook_days: [],
  meal_plan_batch_days: 1,
  week_start_day: 'monday',
};

const PreferencesScreen: React.FC<Props> = () => {
  const [prefs, setPrefs] = useState<UserPreferences>(EMPTY_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { theme } = useTheme();
  const { showAlert } = useAlert();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  useEscapeBack();

  useEffect(() => {
    (async () => {
      try {
        setPrefs(await apiService.getPreferences());
      } catch (error) {
        console.error('Error loading preferences:', error);
        showAlert('Error', 'Failed to load preferences');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      setPrefs(await apiService.updatePreferences(prefs));
      showAlert('Saved', 'Your preferences were updated');
    } catch (error) {
      console.error('Error saving preferences:', error);
      showAlert('Error', 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading visible={true} message="Loading..." />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <PreferencesPanel value={prefs} onChange={setPrefs} />

      <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: 20, maxWidth: 560, width: '100%', alignSelf: 'center' },
  saveButton: { backgroundColor: t.accent, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 28, marginBottom: 20 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

export default PreferencesScreen;
