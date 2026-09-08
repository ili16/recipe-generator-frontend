import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import authService from '../services/authService';
import Loading from '../components/Loading';
import { useTheme, Theme } from '../context/ThemeContext';
import { useEscapeBack } from '../hooks/useEscapeBack';
import WeekView from './mealplan/WeekView';
import DayView from './mealplan/DayView';
import MonthView from './mealplan/MonthView';
import { MealPlanProvider } from '../context/MealPlanContext';

type Props = NativeStackScreenProps<RootStackParamList, 'MealPlan'>;

type ViewMode = 'day' | 'week' | 'month';
const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

// Thin shell: auth gate, the Day/Week/Month switcher, and the date the active view is
// centered on. Week is the default per the product brief — it's the only view with the
// AI suggest/chat flow.
const MealPlanScreen: React.FC<Props> = ({ navigation }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  useEscapeBack();

  useEffect(() => {
    (async () => {
      const authed = await authService.isAuthenticated();
      setIsAuthenticated(authed);
      setCheckingAuth(false);
    })();
  }, []);

  if (checkingAuth) {
    return <Loading visible message="Loading..." />;
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Sign in required</Text>
          <Text style={styles.emptySubtext}>Please sign in to plan your week</Text>
          <TouchableOpacity style={styles.signInButton} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const openDay = (d: Date) => {
    setSelectedDate(d);
    setViewMode('day');
  };

  return (
    <MealPlanProvider>
      <View style={styles.container}>
        <View style={styles.switcher}>
          {VIEW_MODES.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[styles.switchButton, viewMode === m.key && styles.switchButtonActive]}
              onPress={() => setViewMode(m.key)}
            >
              <Text style={[styles.switchButtonText, viewMode === m.key && styles.switchButtonTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {viewMode === 'week' && <WeekView selectedDate={selectedDate} onChangeDate={setSelectedDate} />}
        {viewMode === 'day' && <DayView selectedDate={selectedDate} onChangeDate={setSelectedDate} />}
        {viewMode === 'month' && <MonthView selectedDate={selectedDate} onChangeDate={setSelectedDate} onOpenDay={openDay} />}
      </View>
    </MealPlanProvider>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  switcher: { flexDirection: 'row', padding: 12, gap: 8 },
  switchButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: t.surface, borderWidth: 1, borderColor: t.hairline },
  switchButtonActive: { backgroundColor: t.accent, borderColor: t.accent },
  switchButtonText: { fontSize: 13, fontWeight: '600', color: t.subtext },
  switchButtonTextActive: { color: '#fff' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyText: { fontSize: 18, fontWeight: '700', color: t.text },
  emptySubtext: { fontSize: 14, color: t.subtext, textAlign: 'center' },
  signInButton: { marginTop: 16, backgroundColor: t.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  signInButtonText: { color: '#fff', fontWeight: '700' },
});

export default MealPlanScreen;
