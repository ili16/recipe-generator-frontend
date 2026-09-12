import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import authService from '../services/authService';
import Loading from '../components/Loading';
import { useTheme, Theme } from '../context/ThemeContext';
import { type } from '../theme';
import { useEscapeBack } from '../hooks/useEscapeBack';
import WeekView from './mealplan/WeekView';
import TodayBanner from './mealplan/TodayBanner';
import { MealPlanProvider } from '../context/MealPlanContext';

type Props = NativeStackScreenProps<RootStackParamList, 'MealPlan'>;

// Thin shell: auth gate plus the week the planner is centered on. Week is the only view —
// the Day timeline and Month grid were deleted (BACKLOG 4.1); neither showed what a day
// was planned for, and only Week has the AI suggest/chat flow.
const MealPlanScreen: React.FC<Props> = ({ navigation }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
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

  return (
    <MealPlanProvider>
      <View style={styles.container}>
        <TodayBanner navigation={navigation} />
        <WeekView selectedDate={selectedDate} onChangeDate={setSelectedDate} navigation={navigation} />
      </View>
    </MealPlanProvider>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyText: { ...type.title, fontSize: 18, lineHeight: 26, color: t.text },
  emptySubtext: { ...type.body, fontSize: 14, color: t.subtext, textAlign: 'center' },
  signInButton: { marginTop: 16, backgroundColor: t.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  signInButtonText: { color: t.onAccent, ...type.label },
});

export default MealPlanScreen;
