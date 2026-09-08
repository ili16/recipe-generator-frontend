import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UserPreferences, Weekday } from '../types';
import { TAGS_BY_GROUP } from '../constants/tags';
import { WEEKDAYS, BATCH_DAYS_OPTIONS } from '../constants/mealPlanPrefs';
import { useTheme, Theme } from '../context/ThemeContext';

const SKILL_LEVELS: Array<{ value: NonNullable<UserPreferences['skill_level']>; label: string }> = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const CADENCES: Array<{ value: NonNullable<UserPreferences['cooking_cadence']>; label: string }> = [
  { value: 'daily', label: 'Every day' },
  { value: 'every_couple_days', label: 'Every couple days' },
  { value: 'meal_prep_batching', label: 'Meal-prep batching' },
];

const DIETARY_CHIPS = TAGS_BY_GROUP.dietary;

interface Props {
  value: UserPreferences;
  onChange: (next: UserPreferences) => void;
  compact?: boolean;
}

// The full set of explicit profile settings, shared by PreferencesScreen (Profile) and
// WeekView's inline planning-preferences panel — one implementation instead of two
// copies of the same chip/segment markup editing the same UserPreferences object.
const PreferencesPanel: React.FC<Props> = ({ value, onChange, compact }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme, !!compact), [theme, compact]);
  const [dislikedInput, setDislikedInput] = useState('');

  const toggleDietaryPref = (slug: string) => {
    onChange({
      ...value,
      dietary_prefs: value.dietary_prefs.includes(slug)
        ? value.dietary_prefs.filter(s => s !== slug)
        : [...value.dietary_prefs, slug],
    });
  };

  const addDislikedIngredient = () => {
    const v = dislikedInput.trim().toLowerCase();
    if (!v || value.disliked_ingredients.includes(v)) { setDislikedInput(''); return; }
    onChange({ ...value, disliked_ingredients: [...value.disliked_ingredients, v] });
    setDislikedInput('');
  };

  const removeDislikedIngredient = (v: string) => {
    onChange({ ...value, disliked_ingredients: value.disliked_ingredients.filter(x => x !== v) });
  };

  const toggleDay = (field: 'meal_plan_no_food_days' | 'meal_plan_no_cook_days', day: Weekday) => {
    const days = value[field];
    onChange({ ...value, [field]: days.includes(day) ? days.filter(d => d !== day) : [...days, day] });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Skill level</Text>
      <View style={styles.segmented}>
        {SKILL_LEVELS.map(({ value: v, label }) => {
          const sel = value.skill_level === v;
          return (
            <TouchableOpacity
              key={v}
              style={[styles.segment, sel && styles.segmentSel]}
              onPress={() => onChange({ ...value, skill_level: sel ? null : v })}
            >
              <Text style={[styles.segmentText, sel && styles.segmentTextSel]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Dietary preferences</Text>
      <View style={styles.chipRow}>
        {DIETARY_CHIPS.map(tag => {
          const sel = value.dietary_prefs.includes(tag.slug);
          return (
            <TouchableOpacity key={tag.slug} style={[styles.chip, sel && styles.chipSel]} onPress={() => toggleDietaryPref(tag.slug)}>
              <Text style={[styles.chipText, sel && styles.chipTextSel]}>{tag.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Ingredients you dislike</Text>
      <View style={styles.addRow}>
        <TextInput
          autoComplete="off"
          style={styles.addInput}
          placeholder="e.g. cilantro"
          placeholderTextColor={theme.muted}
          value={dislikedInput}
          onChangeText={setDislikedInput}
          onSubmitEditing={addDislikedIngredient}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addButton} onPress={addDislikedIngredient}>
          <Ionicons name="add" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={styles.chipRow}>
        {value.disliked_ingredients.map(item => (
          <View key={item} style={[styles.chip, styles.chipSel]}>
            <Text style={[styles.chipText, styles.chipTextSel]}>{item}</Text>
            <TouchableOpacity onPress={() => removeDislikedIngredient(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="close" size={12} color={theme.accent} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <Text style={styles.label}>How often do you cook?</Text>
      <View style={styles.segmented}>
        {CADENCES.map(({ value: v, label }) => {
          const sel = value.cooking_cadence === v;
          return (
            <TouchableOpacity
              key={v}
              style={[styles.segment, sel && styles.segmentSel]}
              onPress={() => onChange({ ...value, cooking_cadence: sel ? null : v })}
            >
              <Text style={[styles.segmentText, sel && styles.segmentTextSel]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Days you need no food at all</Text>
      <View style={styles.chipRow}>
        {WEEKDAYS.map(({ value: v, label }) => {
          const sel = value.meal_plan_no_food_days.includes(v);
          return (
            <TouchableOpacity key={v} style={[styles.chip, sel && styles.chipSel]} onPress={() => toggleDay('meal_plan_no_food_days', v)}>
              <Text style={[styles.chipText, sel && styles.chipTextSel]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Days you don't want to cook (still eat — leftovers)</Text>
      <View style={styles.chipRow}>
        {WEEKDAYS.map(({ value: v, label }) => {
          const sel = value.meal_plan_no_cook_days.includes(v);
          return (
            <TouchableOpacity key={v} style={[styles.chip, sel && styles.chipSel]} onPress={() => toggleDay('meal_plan_no_cook_days', v)}>
              <Text style={[styles.chipText, sel && styles.chipTextSel]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>How many days does one recipe cover?</Text>
      <View style={styles.segmented}>
        {BATCH_DAYS_OPTIONS.map(({ value: v, label }) => {
          const sel = value.meal_plan_batch_days === v;
          return (
            <TouchableOpacity
              key={v}
              style={[styles.segment, sel && styles.segmentSel]}
              onPress={() => onChange({ ...value, meal_plan_batch_days: v })}
            >
              <Text style={[styles.segmentText, sel && styles.segmentTextSel]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Week starts on</Text>
      <View style={styles.chipRow}>
        {WEEKDAYS.map(({ value: v, label }) => {
          const sel = value.week_start_day === v;
          return (
            <TouchableOpacity key={v} style={[styles.chip, sel && styles.chipSel]} onPress={() => onChange({ ...value, week_start_day: v })}>
              <Text style={[styles.chipText, sel && styles.chipTextSel]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const makeStyles = (t: Theme, compact: boolean) => StyleSheet.create({
  container: { gap: compact ? 4 : 8 },
  label: {
    fontSize: compact ? 11 : 12, color: t.muted, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: compact ? 6 : 18, marginBottom: 4,
  },
  segmented: { flexDirection: 'row', gap: compact ? 6 : 8 },
  segment: {
    flex: 1, paddingVertical: compact ? 7 : 10, borderRadius: compact ? 8 : 10, borderWidth: 1,
    borderColor: t.border, backgroundColor: compact ? t.bg : t.surface, alignItems: 'center',
  },
  segmentSel: { borderColor: t.accent, backgroundColor: t.accentFaded },
  segmentText: { fontSize: compact ? 11 : 13, color: t.subtext },
  segmentTextSel: { color: t.accent, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: compact ? 6 : 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: compact ? 10 : 12, paddingVertical: compact ? 6 : 7,
    borderRadius: compact ? 14 : 16, borderWidth: 1, borderColor: t.border, backgroundColor: compact ? t.bg : t.surface,
  },
  chipSel: { borderColor: t.accent, backgroundColor: t.accentFaded },
  chipText: { fontSize: compact ? 12 : 13, color: t.subtext },
  chipTextSel: { color: t.accent, fontWeight: '600' },
  addRow: { flexDirection: 'row', gap: 8 },
  addInput: {
    flex: 1, borderWidth: 1, borderColor: t.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: compact ? 8 : 10, color: t.text, backgroundColor: t.surface, fontSize: compact ? 13 : 14,
  },
  addButton: { width: compact ? 34 : 40, borderRadius: 10, backgroundColor: t.accent, justifyContent: 'center', alignItems: 'center' },
});

export default PreferencesPanel;
