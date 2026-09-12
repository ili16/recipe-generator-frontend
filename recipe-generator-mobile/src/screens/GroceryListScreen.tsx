import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import apiService from '../services/apiService';
import authService from '../services/authService';
import { GroceryCategory, GroceryLine, UserPreferences } from '../types';
import { groceryCheckedKey } from '../constants';
import { useTheme, Theme } from '../context/ThemeContext';
import { space, radius } from '../theme';
import { Text } from '../components/ui';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { toISODate, addDays, startOfWeek } from '../utils/mealPlanDates';

type Props = NativeStackScreenProps<RootStackParamList, 'GroceryList'>;

// Aisle headings, in the order the server already sorts the lines into (DESIGN_SYSTEM §7.7).
const CATEGORY_LABELS: Record<GroceryCategory, string> = {
  produce: 'Produce & Herbs',
  protein: 'Proteins & Seafood',
  dairy: 'Dairy & Chilled',
  pantry: 'Pantry & Dry Goods',
  other: 'Other',
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
 * plan as it stands, so dropping a meal drops its lines. The only local state is which lines are
 * ticked off, kept per user and per week in AsyncStorage — a tick is about this shopping trip on
 * this device, not an account-level fact.
 */
const GroceryListScreen: React.FC<Props> = ({ navigation }) => {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [lines, setLines] = useState<GroceryLine[] | null>(null);
  const [error, setError] = useState(false);
  const [checked, setChecked] = useState<Record<string, true>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => new Date());
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  useEscapeBack();

  const weekStartISO = toISODate(startOfWeek(anchor, prefs?.week_start_day ?? 'monday'));
  const weekEndISO = toISODate(addDays(startOfWeek(anchor, prefs?.week_start_day ?? 'monday'), 6));

  useEffect(() => {
    apiService.getPreferences().then(setPrefs).catch(error => console.error('Error loading preferences:', error));
    authService.getUserId().then(setUserId).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setError(false);
    apiService.getGroceryList(weekStartISO, weekEndISO)
      .then(list => setLines(list.lines))
      .catch(err => { console.error('Error loading grocery list:', err); setError(true); });
  }, [weekStartISO, weekEndISO]);

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

  const toggle = (line: GroceryLine) => {
    const key = lineKey(line);
    setChecked(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = true;
      if (userId) AsyncStorage.setItem(groceryCheckedKey(userId, weekStartISO), JSON.stringify(next)).catch(() => {});
      return next;
    });
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

  return (
    <View style={styles.container}>
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => setAnchor(addDays(anchor, -7))} style={styles.navButton} accessibilityRole="button" accessibilityLabel="Previous week">
          <Ionicons name="chevron-back" size={20} color={theme.subtext} />
        </TouchableOpacity>
        <View style={styles.weekLabel}>
          <Text variant="label">{weekStartISO} → {weekEndISO}</Text>
          {lines !== null && <Text variant="caption" tone="subtle">{remaining} of {lines.length} left</Text>}
        </View>
        <TouchableOpacity onPress={() => setAnchor(addDays(anchor, 7))} style={styles.navButton} accessibilityRole="button" accessibilityLabel="Next week">
          <Ionicons name="chevron-forward" size={20} color={theme.subtext} />
        </TouchableOpacity>
      </View>

      {lines === null && !error ? (
        <ActivityIndicator style={styles.pad} color={theme.accent} />
      ) : error ? (
        <View style={styles.pad}>
          <Text tone="subtle">Could not load the list.</Text>
          <TouchableOpacity onPress={load} accessibilityRole="button"><Text tone="accent">Try again</Text></TouchableOpacity>
        </View>
      ) : lines!.length === 0 ? (
        <View style={styles.pad}>
          <Text tone="subtle">Nothing planned this week — plan some meals and their ingredients land here.</Text>
          <TouchableOpacity onPress={() => navigation.navigate('MealPlan')} accessibilityRole="button"><Text tone="accent">Open the meal plan</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {sections.map(section => (
            <View key={section.category} style={styles.section}>
              <Text variant="label" tone="subtle">{CATEGORY_LABELS[section.category] ?? CATEGORY_LABELS.other}</Text>
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
                      <Text variant="caption" tone="subtle">For {line.for.join(' · ')}</Text>
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
