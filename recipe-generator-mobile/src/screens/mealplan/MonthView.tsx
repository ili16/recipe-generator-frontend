import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiService from '../../services/apiService';
import { useTheme, Theme } from '../../context/ThemeContext';
import { useMealPlanContext } from '../../context/MealPlanContext';
import { toISODate, addMonths, monthGridRange } from '../../utils/mealPlanDates';

interface Props {
  selectedDate: Date;
  onChangeDate: (d: Date) => void;
  onOpenDay: (d: Date) => void;
}

// Read-only month overview: a calendar grid (starting on the user's configured
// week_start_day) over the full month (including the leading/trailing days of adjacent
// months needed to tile whole weeks). Tapping a day switches the shell into Day view.
const MonthView: React.FC<Props> = ({ selectedDate, onChangeDate, onOpenDay }) => {
  const [weekStartDay, setWeekStartDay] = useState('monday');
  useEffect(() => {
    apiService.getPreferences().then(p => setWeekStartDay(p.week_start_day)).catch(error => console.error('Error loading preferences:', error));
  }, []);

  const { start: gridStart, end: gridEnd } = useMemo(() => monthGridRange(selectedDate, weekStartDay), [selectedDate, weekStartDay]);
  const { itemsByDate, ensureRange } = useMealPlanContext();

  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const gridStartISO = toISODate(gridStart);
  const gridEndISO = toISODate(gridEnd);
  useEffect(() => { ensureRange(gridStartISO, gridEndISO); }, [gridStartISO, gridEndISO, ensureRange]);

  const cells: Date[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    cells.push(new Date(d));
  }
  const weeks: Date[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const currentMonth = selectedDate.getMonth();
  const todayISO = toISODate(new Date());

  return (
    <View style={styles.container}>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => onChangeDate(addMonths(selectedDate, -1))} style={styles.navButton}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{selectedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        <TouchableOpacity onPress={() => onChangeDate(addMonths(selectedDate, 1))} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekdayRow}>
        {(weeks[0] ?? []).map(d => (
          <Text key={toISODate(d)} style={styles.weekdayLabel}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map(date => {
              const iso = toISODate(date);
              const item = itemsByDate[iso];
              const inMonth = date.getMonth() === currentMonth;
              const isToday = iso === todayISO;
              return (
                <TouchableOpacity
                  key={iso}
                  style={[styles.cell, isToday && styles.cellToday]}
                  onPress={() => onOpenDay(date)}
                >
                  <Text style={[styles.cellDate, !inMonth && styles.cellDateOutside, isToday && styles.cellDateToday]}>
                    {date.getDate()}
                  </Text>
                  {item && (
                    <View style={styles.cellPill}>
                      <Text style={styles.cellPillText} numberOfLines={1}>{item.recipe_title}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.hairline,
  },
  navButton: { padding: 6 },
  monthLabel: { fontSize: 16, fontWeight: '600', color: t.text },
  weekdayRow: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 8 },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: t.subtext },
  grid: { padding: 8, gap: 4 },
  weekRow: { flexDirection: 'row', gap: 4 },
  cell: {
    flex: 1, aspectRatio: 0.85, borderRadius: 8, borderWidth: 1, borderColor: t.hairline,
    backgroundColor: t.surface, padding: 4,
  },
  cellToday: { borderColor: t.accent, borderWidth: 1.5 },
  cellDate: { fontSize: 12, color: t.text, fontWeight: '600' },
  cellDateOutside: { color: t.muted },
  cellDateToday: { color: t.accent },
  cellPill: { marginTop: 4, backgroundColor: t.accentFaded, borderRadius: 4, paddingHorizontal: 3, paddingVertical: 2 },
  cellPillText: { fontSize: 9, color: t.accent, fontWeight: '600' },
});

export default MonthView;
