import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiService from '../../services/apiService';
import { Recipe, MealPlanItem, MealPlanSuggestion, MealPlanAssignment, UserPreferences, MealPlanWeekPreferences } from '../../types';
import Loading from '../../components/Loading';
import PreferencesPanel from '../../components/PreferencesPanel';
import { useTheme, Theme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { useMealPlanContext } from '../../context/MealPlanContext';
import { toISODate, addDays, startOfWeek } from '../../utils/mealPlanDates';
import { WEEKDAYS, BATCH_DAYS_OPTIONS } from '../../constants/mealPlanPrefs';
import RecipePickerModal from './RecipePickerModal';

interface ChatTurn {
  id: number;
  message: string;
  replyText: string;
  streaming: boolean;
  plan: MealPlanSuggestion | null;
}

interface Props {
  selectedDate: Date;
  onChangeDate: (d: Date) => void;
}

// The default, AI-capable view: a 7-day grid the user can hand-edit, or fill via
// "Suggest a plan" + a chat panel to refine the AI's proposal before accepting it.
const WeekView: React.FC<Props> = ({ selectedDate, onChangeDate }) => {
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [weekPrefs, setWeekPrefs] = useState<MealPlanWeekPreferences | null>(null);
  const [customizeWeek, setCustomizeWeek] = useState(false);

  const weekStart = useMemo(() => startOfWeek(selectedDate, prefs?.week_start_day ?? 'monday'), [selectedDate, prefs?.week_start_day]);
  const weekStartISO = toISODate(weekStart);
  const weekEndISO = toISODate(addDays(weekStart, 6));

  const { itemsByDate, recipes, ensureRange, upsertItem, removeItem } = useMealPlanContext();
  const [pickerDay, setPickerDay] = useState<string | null>(null);

  const [suggestion, setSuggestion] = useState<MealPlanSuggestion | null>(null);
  const [initialSuggestion, setInitialSuggestion] = useState<MealPlanSuggestion | null>(null);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const nextTurnId = useRef(0);
  const [suggesting, setSuggesting] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [rerolling, setRerolling] = useState<string | null>(null);
  const [lockedVariants, setLockedVariants] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState(false);

  const { theme } = useTheme();
  const { showAlert, confirmAction } = useAlert();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const chatScrollRef = useRef<ScrollView>(null);

  useEffect(() => { ensureRange(weekStartISO, weekEndISO); }, [weekStartISO, weekEndISO, ensureRange]);

  useEffect(() => {
    apiService.getPreferences().then(setPrefs).catch(error => console.error('Error loading preferences:', error));
  }, []);

  useEffect(() => {
    apiService.getWeekPreferences(weekStartISO).then(wp => {
      setWeekPrefs(wp);
      setCustomizeWeek(wp.no_food_days !== null || wp.no_cook_days !== null || wp.batch_days !== null);
    }).catch(error => console.error('Error loading week preferences:', error));
  }, [weekStartISO]);

  const recipeTitleById = useMemo(() => {
    const map = new Map<number, string>();
    recipes.forEach(r => map.set(r.id, r.recipename));
    return map;
  }, [recipes]);

  const savePrefs = async (next: UserPreferences) => {
    setPrefs(next);
    try {
      await apiService.updatePreferences(next);
    } catch (error) {
      console.error('Error saving preferences:', error);
      showAlert('Error', 'Failed to save planning preferences');
    }
  };

  const saveWeekPrefs = async (next: MealPlanWeekPreferences) => {
    setWeekPrefs(next);
    try {
      await apiService.updateWeekPreferences(weekStartISO, next);
    } catch (error) {
      console.error('Error saving week preferences:', error);
      showAlert('Error', 'Failed to save this week\'s preferences');
    }
  };

  const toggleWeekDay = (field: 'no_food_days' | 'no_cook_days', day: UserPreferences['meal_plan_no_food_days'][number]) => {
    if (!weekPrefs) return;
    const days = weekPrefs[field] ?? [];
    saveWeekPrefs({ ...weekPrefs, [field]: days.includes(day) ? days.filter(d => d !== day) : [...days, day] });
  };

  const setWeekBatchDays = (value: UserPreferences['meal_plan_batch_days']) => {
    if (!weekPrefs) return;
    saveWeekPrefs({ ...weekPrefs, batch_days: value });
  };

  // Off: edit the global defaults (shown/saved for every week). On: scope edits to just
  // this week, seeded from the current effective values so toggling on doesn't blank
  // the fields out from under the user.
  const toggleCustomizeWeek = async () => {
    if (customizeWeek) {
      await saveWeekPrefs({ no_food_days: null, no_cook_days: null, batch_days: null });
      setCustomizeWeek(false);
    } else if (prefs) {
      await saveWeekPrefs({
        no_food_days: prefs.meal_plan_no_food_days,
        no_cook_days: prefs.meal_plan_no_cook_days,
        batch_days: prefs.meal_plan_batch_days,
      });
      setCustomizeWeek(true);
    }
  };

  const assign = async (recipe: Recipe) => {
    if (!pickerDay) return;
    const dayISO = pickerDay;
    setPickerDay(null);
    try {
      const item = await apiService.addMealPlanItem(recipe.id, dayISO);
      upsertItem(item);
    } catch (error) {
      console.error('Error assigning recipe:', error);
      showAlert('Error', 'Failed to add recipe to plan');
    }
  };

  const remove = async (item: MealPlanItem) => {
    const confirmed = await confirmAction('Remove from plan?', item.recipe_title, {
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await apiService.deleteMealPlanItem(item.id);
      removeItem(item.planned_on);
    } catch (error) {
      console.error('Error removing meal plan item:', error);
      showAlert('Error', 'Failed to remove recipe from plan');
    }
  };

  const discardSuggestion = () => {
    setSuggestion(null);
    setInitialSuggestion(null);
    setChatTurns([]);
    setLockedVariants(new Set());
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const result = await apiService.suggestMealPlan(weekStartISO, weekEndISO);
      setSuggestion(result);
      setInitialSuggestion(result);
      setChatTurns([]);
      setLockedVariants(new Set());
    } catch (error) {
      console.error('Error suggesting meal plan:', error);
      showAlert('Error', 'Failed to suggest a plan');
    } finally {
      setSuggesting(false);
    }
  };

  // The user's message renders instantly (pushed before any network call); the
  // assistant's reply streams in live on web via a fast parallel call, while the
  // heavier structured plan-update call runs alongside it.
  const handleChatSend = async () => {
    const text = chatInput.trim();
    if (!text || chatSending || !initialSuggestion) return;
    setChatInput('');
    setChatSending(true);

    const turnId = nextTurnId.current++;
    const priorHistory = chatTurns.filter(t => t.plan).map(t => ({ message: t.message, plan: t.plan! }));
    setChatTurns(prev => [...prev, { id: turnId, message: text, replyText: '', streaming: true, plan: null }]);

    const streamPromise = Platform.OS === 'web'
      ? apiService.streamMealPlanChatReply(weekStartISO, weekEndISO, text, chunk => {
          setChatTurns(prev => prev.map(t => t.id === turnId ? { ...t, replyText: t.replyText + chunk } : t));
        }).catch(error => console.error('Error streaming chat reply:', error))
      : Promise.resolve();

    try {
      const [, result] = await Promise.all([
        streamPromise,
        apiService.mealPlanChat(weekStartISO, weekEndISO, initialSuggestion, priorHistory, text),
      ]);
      setChatTurns(prev => prev.map(t => t.id === turnId
        ? { ...t, plan: result, streaming: false, replyText: t.replyText || (result.message ?? 'Updated the plan.') }
        : t));
      setSuggestion(result);
    } catch (error) {
      console.error('Error in meal plan chat:', error);
      showAlert('Error', "Couldn't update the plan. Try again.");
      setChatTurns(prev => prev.filter(t => t.id !== turnId));
    } finally {
      setChatSending(false);
    }
  };

  useEffect(() => {
    if (chatTurns.length > 0) chatScrollRef.current?.scrollToEnd({ animated: true });
  }, [chatTurns]);

  const rerollVariant = async (assignment: MealPlanAssignment) => {
    if (assignment.variant_of_recipe_id == null) return;
    setRerolling(assignment.planned_on);
    try {
      // Anchor the reroll to whatever direction is already established, so "Another
      // variant" doesn't wander off it (e.g. losing a "beef" swap the user just asked for).
      const hint = assignment.variant
        ? `Keep it similar to: ${assignment.variant.title}, but try a different take.`
        : undefined;
      const result = await apiService.generateVariant(assignment.variant_of_recipe_id, hint);
      setSuggestion(prev => prev && {
        ...prev,
        assignments: prev.assignments.map(a =>
          a.planned_on === assignment.planned_on ? { ...a, variant: result.structured ?? a.variant } : a
        ),
      });
    } catch (error) {
      console.error('Error generating variant:', error);
      showAlert('Error', 'Failed to generate another variant');
    } finally {
      setRerolling(null);
    }
  };

  const toggleLockVariant = (dayISO: string) => {
    setLockedVariants(prev => {
      const next = new Set(prev);
      if (next.has(dayISO)) next.delete(dayISO); else next.add(dayISO);
      return next;
    });
  };

  const acceptPlan = async () => {
    if (!suggestion) return;
    setAccepting(true);
    try {
      for (const a of suggestion.assignments) {
        let recipeId = a.recipe_id ?? undefined;
        if (recipeId == null && a.variant) {
          const created = await apiService.saveRecipe(
            a.variant.title, `# ${a.variant.title}`, undefined, a.variant,
            undefined, undefined, undefined, a.variant_of_recipe_id ?? undefined
          );
          recipeId = created.id;
        }
        if (recipeId == null) continue;
        const item = await apiService.addMealPlanItem(recipeId, a.planned_on, a.start_time);
        upsertItem(item);
      }
      showAlert('Plan added', 'Your week has been updated.');
      discardSuggestion();
    } catch (error) {
      console.error('Error accepting plan:', error);
      showAlert('Error', 'Failed to save part of the plan — check your week and try again.');
    } finally {
      setAccepting(false);
    }
  };

  const introText = initialSuggestion
    ? initialSuggestion.message
      ?? (initialSuggestion.low_variety
        ? "You only have a few saved recipes, so I mixed in a couple of variants to fill the week. Cycle through a variant with the arrows, or tell me what to change."
        : "Here's a plan for the week — tell me if you'd like anything changed.")
    : null;

  const rawDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const iso = toISODate(date);
    const label = date.toLocaleDateString(undefined, { weekday: 'short' });
    return {
      label, iso, date,
      actualItem: itemsByDate[iso] ?? null,
      proposed: suggestion?.assignments.find(a => a.planned_on === iso) ?? null,
    };
  });

  // Batch cooking (meal_plan_batch_days > 1) assigns the same recipe to a run of
  // consecutive days as separate items. Mark a day as a "leftover" continuation
  // when the immediately preceding day carries the same recipe, so it renders
  // distinctly instead of looking like an unrelated repeat.
  const days = rawDays.map((d, i) => {
    const prev = rawDays[i - 1];
    const isLeftover = !!d.actualItem && !!prev?.actualItem && prev.actualItem.recipe_id === d.actualItem.recipe_id;
    return { ...d, isLeftover, leftoverFromLabel: isLeftover ? prev!.label : null };
  });

  return (
    <View style={styles.container}>
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => onChangeDate(addDays(selectedDate, -7))} style={styles.navButton}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.weekLabel}>
          {weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          {' – '}
          {addDays(weekStart, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={() => onChangeDate(addDays(selectedDate, 7))} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.prefsToggle} onPress={() => setPrefsOpen(o => !o)}>
        <Ionicons name={prefsOpen ? 'chevron-up' : 'chevron-down'} size={13} color={theme.subtext} />
        <Text style={styles.prefsToggleText}>Planning preferences</Text>
      </TouchableOpacity>
      {prefsOpen && prefs && (
        <View style={styles.prefsPanel}>
          <View style={styles.customizeRow}>
            <Text style={styles.prefsToggleText}>Customize this week</Text>
            <TouchableOpacity onPress={toggleCustomizeWeek} style={[styles.switchTrack, customizeWeek && styles.switchTrackOn]}>
              <View style={[styles.switchThumb, customizeWeek && styles.switchThumbOn]} />
            </TouchableOpacity>
          </View>

          {customizeWeek && weekPrefs ? (
            <>
              <Text style={styles.prefsLabel}>Days you need no food at all</Text>
              <View style={styles.prefsChipRow}>
                {WEEKDAYS.map(({ value, label }) => {
                  const sel = (weekPrefs.no_food_days ?? []).includes(value);
                  return (
                    <TouchableOpacity key={value} style={[styles.prefsChip, sel && styles.prefsChipSel]} onPress={() => toggleWeekDay('no_food_days', value)}>
                      <Text style={[styles.prefsChipText, sel && styles.prefsChipTextSel]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.prefsLabel}>Days you don't want to cook (still eat)</Text>
              <View style={styles.prefsChipRow}>
                {WEEKDAYS.map(({ value, label }) => {
                  const sel = (weekPrefs.no_cook_days ?? []).includes(value);
                  return (
                    <TouchableOpacity key={value} style={[styles.prefsChip, sel && styles.prefsChipSel]} onPress={() => toggleWeekDay('no_cook_days', value)}>
                      <Text style={[styles.prefsChipText, sel && styles.prefsChipTextSel]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.prefsLabel}>One recipe covers</Text>
              <View style={styles.prefsSegmented}>
                {BATCH_DAYS_OPTIONS.map(({ value, label }) => {
                  const sel = weekPrefs.batch_days === value;
                  return (
                    <TouchableOpacity key={value} style={[styles.prefsSegment, sel && styles.prefsSegmentSel]} onPress={() => setWeekBatchDays(value)}>
                      <Text style={[styles.prefsSegmentText, sel && styles.prefsSegmentTextSel]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : (
            <PreferencesPanel value={prefs} onChange={savePrefs} compact />
          )}
        </View>
      )}

      {!suggestion && !suggesting && (
        <TouchableOpacity style={styles.suggestButton} onPress={handleSuggest}>
          <Ionicons name="sparkles" size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.suggestButtonText}>Suggest a plan</Text>
        </TouchableOpacity>
      )}
      {suggesting && <Loading visible message="Thinking about your week..." />}

      <ScrollView contentContainerStyle={styles.list}>
        {days.map(({ label, iso, date, actualItem, proposed, isLeftover, leftoverFromLabel }) => (
          <View key={iso} style={styles.dayRow}>
            <View style={styles.dayLabelBlock}>
              <Text style={styles.dayLabel}>{label}</Text>
              <Text style={styles.dayDate}>{date.getDate()}</Text>
            </View>

            {proposed ? (
              <View style={styles.proposedCard}>
                <View style={styles.proposedBadge}><Text style={styles.proposedBadgeText}>AI</Text></View>
                {proposed.recipe_id != null ? (
                  <Text style={styles.dayCardText} numberOfLines={2}>
                    {recipeTitleById.get(proposed.recipe_id) ?? `Recipe #${proposed.recipe_id}`}
                  </Text>
                ) : proposed.variant ? (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayCardText} numberOfLines={2}>{proposed.variant.title}</Text>
                    <Text style={styles.variantCaption}>
                      variant of {recipeTitleById.get(proposed.variant_of_recipe_id ?? -1) ?? 'a saved recipe'}
                    </Text>
                    {!lockedVariants.has(iso) ? (
                      <View style={styles.variantControls}>
                        <TouchableOpacity
                          onPress={() => rerollVariant(proposed)}
                          disabled={rerolling === iso}
                          style={styles.variantControlButton}
                        >
                          <Ionicons name="refresh" size={14} color={theme.accent} />
                          <Text style={styles.variantControlText}>{rerolling === iso ? 'Trying...' : 'Another variant'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => toggleLockVariant(iso)} style={styles.variantControlButton}>
                          <Ionicons name="checkmark" size={14} color={theme.accent} />
                          <Text style={styles.variantControlText}>Use this</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.variantLockedText}>✓ Selected</Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.dayCardText}>—</Text>
                )}
              </View>
            ) : actualItem && isLeftover ? (
              <TouchableOpacity style={styles.dayCardLeftover} onPress={() => remove(actualItem)}>
                <Ionicons name="repeat" size={16} color={theme.muted} style={{ marginRight: 6 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dayCardLeftoverText} numberOfLines={1}>{actualItem.recipe_title}</Text>
                  <Text style={styles.dayCardLeftoverCaption}>Leftover from {leftoverFromLabel}</Text>
                </View>
                <Ionicons name="close-circle-outline" size={18} color={theme.muted} />
              </TouchableOpacity>
            ) : actualItem ? (
              <TouchableOpacity style={styles.dayCard} onPress={() => remove(actualItem)}>
                <Text style={styles.dayCardText} numberOfLines={2}>{actualItem.recipe_title}</Text>
                <Ionicons name="close-circle-outline" size={20} color={theme.subtext} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.dayCardEmpty} onPress={() => setPickerDay(iso)}>
                <Ionicons name="add" size={18} color={theme.accent} />
                <Text style={styles.dayCardEmptyText}>Add recipe</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      {suggestion && (
        <View style={styles.chatBar}>
          <View style={styles.chatLogWrap}>
            <ScrollView ref={chatScrollRef} showsVerticalScrollIndicator={false}>
              {introText && (
                <View style={[styles.chatBubbleRow, styles.chatBubbleRowAssistant]}>
                  <View style={[styles.chatBubble, styles.chatBubbleAssistant]}>
                    <Text style={styles.chatBubbleTextAssistant}>{introText}</Text>
                  </View>
                </View>
              )}
              {chatTurns.map(turn => (
                <React.Fragment key={turn.id}>
                  <View style={[styles.chatBubbleRow, styles.chatBubbleRowUser]}>
                    <View style={[styles.chatBubble, styles.chatBubbleUser]}>
                      <Text style={styles.chatBubbleTextUser}>{turn.message}</Text>
                    </View>
                  </View>
                  <View style={[styles.chatBubbleRow, styles.chatBubbleRowAssistant]}>
                    <View style={[styles.chatBubble, styles.chatBubbleAssistant]}>
                      <Text style={styles.chatBubbleTextAssistant}>
                        {turn.replyText || (turn.streaming ? '…' : 'Updated the plan.')}
                      </Text>
                    </View>
                  </View>
                </React.Fragment>
              ))}
            </ScrollView>
          </View>

          <View style={styles.chatInputRow}>
            <TextInput
              style={[styles.chatInput, { outlineStyle: 'none' } as any]}
              placeholder="e.g. swap Wednesday for something vegetarian"
              placeholderTextColor={theme.muted}
              value={chatInput}
              onChangeText={setChatInput}
              onSubmitEditing={handleChatSend}
              editable={!chatSending}
            />
            <TouchableOpacity onPress={handleChatSend} disabled={!chatInput.trim() || chatSending} hitSlop={8}>
              <Ionicons name="send" size={18} color={chatInput.trim() ? theme.accent : theme.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.acceptRow}>
            <TouchableOpacity style={styles.discardButton} onPress={discardSuggestion} disabled={accepting}>
              <Text style={styles.discardButtonText}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptButton} onPress={acceptPlan} disabled={accepting}>
              <Text style={styles.acceptButtonText}>{accepting ? 'Saving...' : 'Accept plan'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <RecipePickerModal
        visible={pickerDay !== null}
        recipes={recipes}
        onSelect={assign}
        onClose={() => setPickerDay(null)}
      />
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.hairline,
  },
  navButton: { padding: 6 },
  weekLabel: { fontSize: 16, fontWeight: '600', color: t.text },
  prefsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 10 },
  prefsToggleText: { fontSize: 12, color: t.subtext, fontWeight: '600' },
  prefsPanel: {
    marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 10,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.hairline, gap: 6,
  },
  customizeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 },
  switchTrack: { width: 38, height: 22, borderRadius: 11, backgroundColor: t.border, padding: 2, justifyContent: 'center' },
  switchTrackOn: { backgroundColor: t.accent },
  switchThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
  switchThumbOn: { alignSelf: 'flex-end' },
  prefsLabel: { fontSize: 11, color: t.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
  prefsChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  prefsChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.bg },
  prefsChipSel: { borderColor: t.accent, backgroundColor: t.accentFaded },
  prefsChipText: { fontSize: 12, color: t.subtext },
  prefsChipTextSel: { color: t.accent, fontWeight: '600' },
  prefsSegmented: { flexDirection: 'row', gap: 6 },
  prefsSegment: { flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: t.border, backgroundColor: t.bg, alignItems: 'center' },
  prefsSegmentSel: { borderColor: t.accent, backgroundColor: t.accentFaded },
  prefsSegmentText: { fontSize: 11, color: t.subtext },
  prefsSegmentTextSel: { color: t.accent, fontWeight: '600' },
  suggestButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.accent, marginHorizontal: 16, marginTop: 12, paddingVertical: 12, borderRadius: 10,
  },
  suggestButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { padding: 16, gap: 10 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayLabelBlock: { width: 44, alignItems: 'center' },
  dayLabel: { fontSize: 12, color: t.subtext, fontWeight: '600' },
  dayDate: { fontSize: 16, color: t.text, fontWeight: '700' },
  dayCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: t.card, borderRadius: 12, borderWidth: 1, borderColor: t.border,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  dayCardText: { flex: 1, color: t.text, fontSize: 15, fontWeight: '500', marginRight: 8 },
  dayCardLeftover: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: t.surface, borderRadius: 12, borderWidth: 1, borderColor: t.hairline, borderStyle: 'dashed',
    paddingHorizontal: 14, paddingVertical: 12, opacity: 0.7,
  },
  dayCardLeftoverText: { color: t.subtext, fontSize: 14, fontWeight: '500' },
  dayCardLeftoverCaption: { color: t.muted, fontSize: 11, marginTop: 2 },
  dayCardEmpty: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: t.surface, borderRadius: 12, borderWidth: 1, borderColor: t.hairline, borderStyle: 'dashed',
    paddingVertical: 14,
  },
  dayCardEmptyText: { color: t.accent, fontSize: 14, fontWeight: '600' },
  proposedCard: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: t.accentFaded, borderRadius: 12, borderWidth: 1.5, borderColor: t.accent,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  proposedBadge: { backgroundColor: t.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  proposedBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  variantCaption: { fontSize: 12, color: t.subtext, marginTop: 2 },
  variantControls: { flexDirection: 'row', gap: 14, marginTop: 8 },
  variantControlButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  variantControlText: { color: t.accent, fontSize: 12, fontWeight: '600' },
  variantLockedText: { color: t.accent, fontSize: 12, fontWeight: '600', marginTop: 8 },
  chatBar: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.hairline, gap: 10 },
  chatLogWrap: { width: '100%', minHeight: 80, maxHeight: 220 },
  chatBubbleRow: { flexDirection: 'row', marginBottom: 8 },
  chatBubbleRowUser: { justifyContent: 'flex-end' },
  chatBubbleRowAssistant: { justifyContent: 'flex-start' },
  chatBubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  chatBubbleUser: { backgroundColor: t.accent, borderBottomRightRadius: 4 },
  chatBubbleAssistant: { backgroundColor: t.card, borderBottomLeftRadius: 4 },
  chatBubbleTextUser: { fontSize: 13, color: '#fff', lineHeight: 18 },
  chatBubbleTextAssistant: { fontSize: 13, color: t.text, lineHeight: 18 },
  chatInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: t.border,
    borderRadius: 10, backgroundColor: t.surface, paddingLeft: 14, paddingRight: 12,
  },
  chatInput: { flex: 1, fontSize: 14, color: t.text, paddingVertical: 10, lineHeight: 20 },
  acceptRow: { flexDirection: 'row', gap: 10 },
  discardButton: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: t.border },
  discardButtonText: { color: t.subtext, fontWeight: '600' },
  acceptButton: { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: t.accent },
  acceptButtonText: { color: '#fff', fontWeight: '700' },
});

export default WeekView;
