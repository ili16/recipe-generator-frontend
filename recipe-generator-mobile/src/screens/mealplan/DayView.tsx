import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, GestureResponderEvent } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import apiService from '../../services/apiService';
import { Recipe } from '../../types';
import { useTheme, Theme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { useMealPlanContext } from '../../context/MealPlanContext';
import { toISODate, addDays } from '../../utils/mealPlanDates';
import RecipePickerModal from './RecipePickerModal';

const START_HOUR = 8;
const END_HOUR = 20;
const PX_PER_MIN = 1; // 60px/hour
const TIMELINE_HEIGHT = (END_HOUR - START_HOUR) * 60 * PX_PER_MIN;
const BLOCK_HEIGHT = 60 * PX_PER_MIN; // fixed 1-hour block
const SNAP_MIN = 15;

function timeToOffsetMin(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h - START_HOUR) * 60 + m;
}

function offsetMinToTime(offsetMin: number): string {
  const clamped = Math.max(0, Math.min(offsetMin, (END_HOUR - START_HOUR) * 60 - 60));
  const snapped = Math.round(clamped / SNAP_MIN) * SNAP_MIN;
  const totalMin = START_HOUR * 60 + snapped;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

interface Props {
  selectedDate: Date;
  onChangeDate: (d: Date) => void;
}

// A single day's 08:00–20:00 timeline. The day's item (if any) is a fixed-height
// (1 hour) draggable block — drag to reposition its time, tap empty space to assign.
// Drag uses react-native-gesture-handler (not the built-in PanResponder, which has
// unreliable pointer capture on web and fights the surrounding ScrollView).
const DayView: React.FC<Props> = ({ selectedDate, onChangeDate }) => {
  const dayISO = toISODate(selectedDate);
  const { itemsByDate, recipes, ensureRange, upsertItem, removeItem } = useMealPlanContext();
  const item = itemsByDate[dayISO] ?? null;
  const [pickerTime, setPickerTime] = useState<string | null>(null); // set when picker is open
  const [dragTop, setDragTop] = useState<number | null>(null); // live position while dragging
  const dragStartTopRef = useRef(0);
  const itemRef = useRef(item);
  itemRef.current = item;

  const { theme } = useTheme();
  const { showAlert } = useAlert();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  useEffect(() => { ensureRange(dayISO, dayISO); setDragTop(null); }, [dayISO, ensureRange]);

  const currentTop = dragTop ?? (item ? timeToOffsetMin(item.start_time) * PX_PER_MIN : 0);

  const panGesture = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .onStart(() => {
      dragStartTopRef.current = itemRef.current ? timeToOffsetMin(itemRef.current.start_time) * PX_PER_MIN : 0;
    })
    .onUpdate((e) => {
      const next = Math.max(0, Math.min(dragStartTopRef.current + e.translationY, TIMELINE_HEIGHT - BLOCK_HEIGHT));
      setDragTop(next);
    })
    .onEnd(async (e) => {
      const current = itemRef.current;
      if (!current) { setDragTop(null); return; }
      const finalTop = Math.max(0, Math.min(dragStartTopRef.current + e.translationY, TIMELINE_HEIGHT - BLOCK_HEIGHT));
      const newTime = offsetMinToTime(finalTop / PX_PER_MIN);
      if (newTime === current.start_time) { setDragTop(null); return; }
      try {
        const updated = await apiService.patchMealPlanItem(current.id, current.planned_on, newTime);
        upsertItem(updated);
      } catch (error) {
        console.error('Error moving meal plan item:', error);
        showAlert('Error', 'Failed to move the recipe');
      } finally {
        setDragTop(null);
      }
    }),
  [showAlert, upsertItem]);

  const handleEmptyTap = (e: GestureResponderEvent) => {
    if (item) return;
    const y = e.nativeEvent.locationY;
    setPickerTime(offsetMinToTime(y / PX_PER_MIN));
  };

  const assign = async (recipe: Recipe) => {
    if (!pickerTime) return;
    const startTime = pickerTime;
    setPickerTime(null);
    try {
      const created = await apiService.addMealPlanItem(recipe.id, dayISO, startTime);
      upsertItem(created);
    } catch (error) {
      console.error('Error assigning recipe:', error);
      showAlert('Error', 'Failed to add recipe to this day');
    }
  };

  const remove = async () => {
    if (!item) return;
    try {
      await apiService.deleteMealPlanItem(item.id);
      removeItem(item.planned_on);
    } catch (error) {
      console.error('Error removing meal plan item:', error);
      showAlert('Error', 'Failed to remove recipe');
    }
  };

  const hourMarks = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  return (
    <View style={styles.container}>
      <View style={styles.dayNav}>
        <TouchableOpacity onPress={() => onChangeDate(addDays(selectedDate, -1))} style={styles.navButton}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.dayLabel}>
          {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={() => onChangeDate(addDays(selectedDate, 1))} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.timeline, { height: TIMELINE_HEIGHT }]}>
          {hourMarks.map(h => (
            <View key={h} style={[styles.hourRow, { top: (h - START_HOUR) * 60 * PX_PER_MIN }]}>
              <Text style={styles.hourLabel}>{String(h).padStart(2, '0')}:00</Text>
              <View style={styles.hourLine} />
            </View>
          ))}

          {!item && (
            <View
              style={StyleSheet.absoluteFill}
              onStartShouldSetResponder={() => true}
              onResponderRelease={handleEmptyTap}
            />
          )}

          {item && (
            <GestureDetector gesture={panGesture}>
              <View style={[styles.block, { top: currentTop, height: BLOCK_HEIGHT }]}>
                <Text style={styles.blockText} numberOfLines={2}>{item.recipe_title}</Text>
                <View style={styles.blockFooter}>
                  <Text style={styles.blockTime}>{item.start_time.slice(0, 5)}</Text>
                  <TouchableOpacity onPress={remove} hitSlop={8}>
                    <Ionicons name="close-circle-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </GestureDetector>
          )}
        </View>
        {!item && <Text style={styles.emptyHint}>Tap the timeline to add a recipe</Text>}
      </ScrollView>

      <RecipePickerModal
        visible={pickerTime !== null}
        recipes={recipes}
        onSelect={assign}
        onClose={() => setPickerTime(null)}
      />
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  dayNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.hairline,
  },
  navButton: { padding: 6 },
  dayLabel: { fontSize: 16, fontWeight: '600', color: t.text },
  scrollContent: { padding: 16, paddingRight: 20 },
  timeline: { position: 'relative', marginLeft: 48 },
  hourRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  hourLabel: { position: 'absolute', left: -48, width: 40, fontSize: 11, color: t.subtext },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.hairline },
  emptyHint: { textAlign: 'center', color: t.muted, fontSize: 13, marginTop: 12 },
  block: {
    position: 'absolute', left: 0, right: 0, backgroundColor: t.accent, borderRadius: 10,
    padding: 10, justifyContent: 'space-between', shadowColor: t.shadow, shadowOpacity: 0.25,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  blockText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  blockFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockTime: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
});

export default DayView;
