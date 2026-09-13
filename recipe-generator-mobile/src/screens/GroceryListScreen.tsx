import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import apiService from '../services/apiService';
import authService from '../services/authService';
import { GroceryCategory, GroceryLine, PantryCategory } from '../types';
import { groceryCheckedKey } from '../constants';
import { useTheme, Theme } from '../context/ThemeContext';
import { space, radius } from '../theme';
import { Text, SignInRequired } from '../components/ui';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { usePreferences } from '../hooks/usePreferences';
import { useIsAuthenticated } from '../hooks/useIsAuthenticated';
import { useLanguage } from '../context/LanguageContext';
import { toISODate, addDays, startOfWeek } from '../utils/mealPlanDates';

type Props = NativeStackScreenProps<RootStackParamList, 'GroceryList'>;

// Aisle headings, in the order the server already sorts the lines into (DESIGN_SYSTEM §7.7).
// The words are in `src/i18n` under `grocery.aisle.*`; the server sends the category only.
const aisleLabelKey = (category: GroceryCategory) => `grocery.aisle.${category}`;

// Where a ticked-off line lands in the pantry (BACKLOG 7.2). A shopping aisle and a pantry
// shelf are not the same axis — everything chilled goes in the fridge whether it was bought
// from the meat counter or the dairy one — so this is a mapping, not a shared enum.
const PANTRY_SHELF: Record<GroceryCategory, PantryCategory> = {
  produce: 'produce',
  protein: 'fridge',
  dairy: 'fridge',
  pantry: 'spices_dry',
  other: 'spices_dry',
};

// Identity of a line across reloads: the server consolidates by item + unit, so that pair
// is what a tick is attached to. Not the index — the list reshuffles when the plan changes.
const lineKey = (line: GroceryLine) => `${line.item.toLowerCase()}|${line.unit ?? ''}`;

// "500 g", "2", "" — trailing zeroes dropped, and nothing at all when the amount is only
// a note ("to taste"), which renders separately.
const formatAmount = (line: GroceryLine): string => {
  if (line.quantity == null) return '';
  const n = Math.round(line.quantity * 100) / 100;
  return line.unit ? `${n} ${line.unit}` : `${n}`;
};

/**
 * The week's shopping list (BACKLOG 6.1). Derived, never stored: every load re-aggregates the
 * plan as it stands, so dropping a meal drops its lines. Which lines are ticked off is kept per
 * user and per week in AsyncStorage — a tick is about this shopping trip on this device, not an
 * account-level fact — but the tick itself has one durable effect: it adds the line to the
 * pantry, and unticking removes it again (BACKLOG 7.2).
 */
const GroceryListScreen: React.FC<Props> = ({ navigation }) => {
  const authed = useIsAuthenticated();
  const prefs = usePreferences();
  const [lines, setLines] = useState<GroceryLine[] | null>(null);
  const [error, setError] = useState(false);
  // Value is the pantry item the tick created (BACKLOG 7.2), so unticking knows what to
  // remove again. `true` is the legacy shape from before 7.2 and from a failed write: still
  // ticked, just with no pantry row behind it.
  const [checked, setChecked] = useState<Record<string, number | true>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => new Date());
  const { theme } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  useEscapeBack();

  const weekStartISO = toISODate(startOfWeek(anchor, prefs?.week_start_day ?? 'monday'));
  const weekEndISO = toISODate(addDays(startOfWeek(anchor, prefs?.week_start_day ?? 'monday'), 6));

  useEffect(() => {
    authService.getUserId().then(setUserId).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!authed) return;
    setError(false);
    apiService.getGroceryList(weekStartISO, weekEndISO)
      .then(list => setLines(list.lines))
      .catch(err => { console.error('Error loading grocery list:', err); setError(true); });
  }, [authed, weekStartISO, weekEndISO]);

  // Re-read on focus for the same reason WeekView does: the assistant writes to the plan
  // server-side, and this list is only ever as current as the plan it was built from.
  useEffect(load, [load]);
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(groceryCheckedKey(userId, weekStartISO))
      .then(raw => setChecked(raw ? JSON.parse(raw) : {}))
      .catch(() => setChecked({}));
  }, [userId, weekStartISO]);

  const persistChecked = useCallback((next: Record<string, number | true>) => {
    if (userId) AsyncStorage.setItem(groceryCheckedKey(userId, weekStartISO), JSON.stringify(next)).catch(() => {});
  }, [userId, weekStartISO]);

  // Ticking a line puts it in the pantry, unticking takes it back out (BACKLOG 7.2) — the
  // only way a pantry stays accurate without data entry. The tick itself is applied
  // immediately and never waits on the network: a failed write leaves the line ticked with
  // no pantry row, which is the same state every tick had before 7.2.
  const toggle = (line: GroceryLine) => {
    const key = lineKey(line);
    const was = checked[key];
    const next = { ...checked };
    if (was) delete next[key]; else next[key] = true;
    setChecked(next);
    persistChecked(next);

    if (was) {
      if (typeof was === 'number') apiService.deletePantryItem(was).catch(err => console.error('Error removing pantry item:', err));
      return;
    }
    apiService.savePantryItem({
      name: line.item,
      quantity: line.quantity ?? null,
      unit: line.unit ?? null,
      category: PANTRY_SHELF[line.category] ?? 'spices_dry',
      expires_on: null,
    })
      .then(item => setChecked(prev => {
        // Only record the id if the line is still ticked — the user may have unticked it
        // while the write was in flight, in which case it is already deleted.
        if (!prev[key]) return prev;
        const withID = { ...prev, [key]: item.id };
        persistChecked(withID);
        return withID;
      }))
      .catch(err => console.error('Error adding pantry item:', err));
  };

  // The server sorts by aisle already, so grouping is a single pass that keeps that order.
  const sections = useMemo(() => {
    const out: Array<{ category: GroceryCategory; lines: GroceryLine[] }> = [];
    for (const line of lines ?? []) {
      const last = out[out.length - 1];
      if (last && last.category === line.category) last.lines.push(line);
      else out.push({ category: line.category, lines: [line] });
    }
    return out;
  }, [lines]);

  const remaining = (lines ?? []).filter(l => !checked[lineKey(l)]).length;

  if (authed === null) {
    return <ActivityIndicator style={styles.pad} color={theme.accent} />;
  }

  if (!authed) {
    return (
      <SignInRequired
        message={t('grocery.signInRequired')}
        onSignIn={() => navigation.navigate('Login')}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => setAnchor(addDays(anchor, -7))} style={styles.navButton} accessibilityRole="button" accessibilityLabel={t('plan.previousWeek')}>
          <Ionicons name="chevron-back" size={20} color={theme.subtext} />
        </TouchableOpacity>
        <View style={styles.weekLabel}>
          <Text variant="label">{weekStartISO} → {weekEndISO}</Text>
          {lines !== null && <Text variant="caption" tone="subtle">{t('grocery.remaining', { remaining, total: lines.length })}</Text>}
        </View>
        <TouchableOpacity onPress={() => setAnchor(addDays(anchor, 7))} style={styles.navButton} accessibilityRole="button" accessibilityLabel={t('plan.nextWeek')}>
          <Ionicons name="chevron-forward" size={20} color={theme.subtext} />
        </TouchableOpacity>
      </View>

      {lines === null && !error ? (
        <ActivityIndicator style={styles.pad} color={theme.accent} />
      ) : error ? (
        <View style={styles.pad}>
          <Text tone="subtle">{t('grocery.loadFailed')}</Text>
          <TouchableOpacity onPress={load} accessibilityRole="button"><Text tone="accent">{t('common.retry')}</Text></TouchableOpacity>
        </View>
      ) : lines!.length === 0 ? (
        <View style={styles.pad}>
          <Text tone="subtle">{t('grocery.empty')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('MealPlan')} accessibilityRole="button"><Text tone="accent">{t('grocery.openMealPlan')}</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {sections.map(section => (
            <View key={section.category} style={styles.section}>
              <Text variant="label" tone="subtle">{t(aisleLabelKey(section.category))}</Text>
              {section.lines.map(line => {
                const isChecked = !!checked[lineKey(line)];
                const amount = formatAmount(line);
                return (
                  <TouchableOpacity
                    key={lineKey(line)}
                    onPress={() => toggle(line)}
                    style={styles.row}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                  >
                    <Ionicons
                      name={isChecked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={isChecked ? theme.accent : theme.muted}
                    />
                    <View style={styles.rowText}>
                      <Text style={isChecked ? styles.struck : undefined}>
                        {amount ? `${amount} · ` : ''}{line.item}{line.note ? ` (${line.note})` : ''}
                      </Text>
                      <Text variant="caption" tone="subtle">{t('grocery.forMeals', { meals: line.for.join(' · ') })}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md },
  navButton: { padding: space.sm, borderRadius: radius.full },
  weekLabel: { alignItems: 'center' },
  pad: { padding: space.lg, gap: space.sm },
  list: { padding: space.lg, gap: space.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  section: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.sm },
  rowText: { flex: 1 },
  struck: { textDecorationLine: 'line-through', color: t.muted },
});

export default GroceryListScreen;
