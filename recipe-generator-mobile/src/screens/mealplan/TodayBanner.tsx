import React, { useEffect, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme, Theme } from '../../context/ThemeContext';
import { useMealPlanContext } from '../../context/MealPlanContext';
import { toISODate } from '../../utils/mealPlanDates';
import { totalTimeMinutes } from '../../utils/recipeTime';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { Badge, Text } from '../../components/ui';
import { radius, space } from '../../theme';

// Local notifications aren't supported on web (expo-notifications), so skip the handler
// there entirely — matches the Platform.OS guard around scheduling below.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

interface Props {
  navigation: NativeStackScreenProps<RootStackParamList, 'MealPlan'>['navigation'];
}

/**
 * The answer to "what should I eat?", which is the question the planner exists to answer — so it
 * leads the screen and the date navigation does not. Before this it was a thin strip under a
 * bordered week-picker bar, which put the chrome above the content.
 *
 * Also the only place a plan turns into cooking: decide → cook is one tap from here, not a
 * separate feature reached from another screen. (Shopping is the missing middle step; there is no
 * grocery domain yet — BACKLOG 6.1.)
 *
 * Still owns the best-effort local push reminder timed to when prep should start, and still lives
 * inside MealPlanProvider so it reads today's item from the shared cache.
 */
const TodayBanner: React.FC<Props> = ({ navigation }) => {
  const { itemsByDate, recipes, ensureRange } = useMealPlanContext();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const todayISO = toISODate(new Date());
  useEffect(() => { ensureRange(todayISO, todayISO); }, [todayISO, ensureRange]);

  const item = itemsByDate[todayISO] ?? null;
  const fullRecipe = item ? recipes.find(r => r.id === item.recipe_id) : undefined;
  const totalMinutes = totalTimeMinutes(fullRecipe?.structured);

  useEffect(() => {
    if (Platform.OS === 'web' || !item) return;
    (async () => {
      try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        const granted = existing === 'granted' || (await Notifications.requestPermissionsAsync()).status === 'granted';
        if (!granted) return;

        await Notifications.cancelAllScheduledNotificationsAsync();
        const [h, m] = item.start_time.split(':').map(Number);
        const startAt = new Date();
        startAt.setHours(h, m, 0, 0);
        const prepAt = new Date(startAt.getTime() - totalMinutes * 60_000);
        if (prepAt.getTime() <= Date.now()) return; // already past prep time today

        await Notifications.scheduleNotificationAsync({
          content: { title: 'Time to start prepping', body: item.recipe_title },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: prepAt },
        });
      } catch (error) {
        console.error('Error scheduling meal-plan reminder:', error);
      }
    })();
  }, [item, totalMinutes]);

  // An unplanned today is still an answer, and the useful one is "ask, and it will be planned".
  if (!item) {
    return (
      <View style={styles.hero}>
        <Text variant="caption" tone="muted">TONIGHT</Text>
        <Text variant="display">Nothing planned yet</Text>
        <TouchableOpacity
          style={styles.cookButton}
          onPress={() => navigation.navigate('Chat', { prompt: 'What should I cook tonight?' })}
          accessibilityRole="button"
        >
          <Ionicons name="sparkles" size={16} color={theme.onAccent} />
          <Text variant="label" style={{ color: theme.onAccent }}>Ask what to cook</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const doc = fullRecipe?.structured;

  return (
    <View style={styles.hero}>
      <Text variant="caption" tone="muted">TONIGHT</Text>
      <Text variant="display" numberOfLines={2}>{item.recipe_title}</Text>
      {doc?.summary ? <Text variant="body" tone="subtle" numberOfLines={2}>{doc.summary}</Text> : null}

      <View style={styles.badges}>
        {totalMinutes > 0 && (
          <Badge
            label={`${totalMinutes} min`}
            icon={<Ionicons name="time-outline" size={12} color={theme.accent} />}
          />
        )}
        {doc?.servings != null && (
          <Badge
            label={`${doc.servings} servings`}
            icon={<Ionicons name="people-outline" size={12} color={theme.accent} />}
          />
        )}
      </View>

      {fullRecipe && (
        <TouchableOpacity
          style={styles.cookButton}
          onPress={() => navigation.navigate('CookingMode', { recipe: fullRecipe })}
          accessibilityRole="button"
        >
          <Ionicons name="flame-outline" size={16} color={theme.onAccent} />
          <Text variant="label" style={{ color: theme.onAccent }}>Start cooking</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  hero: {
    gap: space.sm,
    margin: space.md,
    marginBottom: 0,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: t.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  cookButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
    alignSelf: 'flex-start', marginTop: space.xs,
    backgroundColor: t.accent,
    paddingHorizontal: space.lg, paddingVertical: space.md - 2,
    borderRadius: radius.full,
  },
});

export default TodayBanner;
