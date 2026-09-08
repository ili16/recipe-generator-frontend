import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Markdown from 'react-native-markdown-display';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Recipe, RecipeDocument, RecipeResponse } from '../types';
import { useTheme, Theme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import apiService from '../services/apiService';
import { recipeMarkdownStyles } from '../components/RecipeView';

type Props = NativeStackScreenProps<RootStackParamList, 'CookingMode'>;
type Phase = 'loading' | 'overview' | 'cooking' | 'done' | 'refining' | 'refined';

type Step = RecipeDocument['steps'][number];
type Ingredient = RecipeDocument['ingredients'][number];

// Parse numbered steps from the ## Preparation section of rendered markdown.
function parseMarkdownSteps(md: string): Step[] {
  const lines = md.split('\n');
  let inPrep = false;
  const result: Step[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^## /i.test(line)) {
      inPrep = /preparation|zubereitung|instruction|method|step/i.test(line);
      continue;
    }
    if (!inPrep) continue;
    const m = line.match(/^(\d+)\.\s+(.+)/);
    if (!m) continue;
    let timerSeconds: number | null = null;
    const nextLine = lines[i + 1]?.trim() ?? '';
    const timerMatch = nextLine.match(/⏱\s*(\d+)\s*min/);
    if (timerMatch) timerSeconds = parseInt(timerMatch[1], 10) * 60;
    result.push({ sort_order: parseInt(m[1], 10), step_text: m[2], timer_seconds: timerSeconds, temperature_c: null });
  }
  return result;
}

// Parse bullet ingredients from the ## Ingredients section.
function parseMarkdownIngredients(md: string): Ingredient[] {
  const lines = md.split('\n');
  let inIng = false;
  const result: Ingredient[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^## /i.test(t)) { inIng = /ingredient|zutat/i.test(t); continue; }
    if (/^### /i.test(t) || !inIng) continue;
    const m = t.match(/^-\s+(.+)/);
    if (m) result.push({ item: m[1].replace(/\*\(optional\)\*/g, '(optional)').trim(), optional: /\(optional\)/i.test(m[1]), quantity: null, quantity_text: null, unit: null, section: null });
  }
  return result;
}

// Match ingredients mentioned in a step — use DB-provided indices if available, fall back to text matching.
function getStepIngredients(step: Step, allIngredients: Ingredient[]): Ingredient[] {
  if (step.ingredient_indices && step.ingredient_indices.length > 0) {
    return step.ingredient_indices
      .filter(i => i >= 0 && i < allIngredients.length)
      .map(i => allIngredients[i]);
  }
  // Fallback for recipes without DB-backed indices.
  const lower = step.step_text.toLowerCase();
  return allIngredients.filter(ing => {
    const words = ing.item.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !/^\d/.test(w));
    return words.length > 0 && words.some(w => lower.includes(w));
  });
}

const CookingModeScreen: React.FC<Props> = ({ navigation, route }) => {
  const { recipe: initialRecipe } = route.params;
  const { theme } = useTheme();
  const { showAlert, confirmAction } = useAlert();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [recipe, setRecipe] = useState<Recipe>(initialRecipe);
  const [phase, setPhase] = useState<Phase>(
    initialRecipe.structured ? 'overview' : 'loading',
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [noteInput, setNoteInput] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);
  const [refinedRecipe, setRefinedRecipe] = useState<RecipeResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!initialRecipe.structured) {
      fetchFullRecipe();
    }
  }, []);

  // Reset AI/note panel when step changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setAiInput('');
    setAiAnswer(null);
    setShowAiInput(false);
    setShowNoteInput(false);
    setNoteInput(notes[currentStep] ?? '');
  }, [currentStep]);

  const fetchFullRecipe = async () => {
    try {
      const full = await apiService.getRecipeById(initialRecipe.id);
      setRecipe(full);
      setPhase('overview');
    } catch {
      // Fallback: show overview with only markdown text
      setPhase('overview');
    }
  };

  const structured = recipe.structured;
  const steps: Step[] = structured?.steps?.length
    ? structured.steps
    : parseMarkdownSteps(recipe.recipe);
  const ingredients: Ingredient[] = structured?.ingredients?.length
    ? structured.ingredients
    : parseMarkdownIngredients(recipe.recipe);
  const step = steps[currentStep];

  const goNext = () => {
    if (noteInput.trim()) {
      setNotes(prev => ({ ...prev, [currentStep]: noteInput.trim() }));
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      setPhase('done');
    }
  };

  const goPrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const askAI = async () => {
    const q = aiInput.trim();
    if (!q || aiLoading) return;
    setAiLoading(true);
    setAiAnswer(null);
    try {
      const answer = await apiService.cookingChat(
        recipe.recipename,
        recipe.recipe,
        q,
        step?.step_text,
      );
      setAiAnswer(answer || 'No answer available.');
    } catch {
      setAiAnswer('Sorry, I could not answer that right now.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleRefine = async () => {
    const noteEntries = Object.entries(notes).filter(([, n]) => n.trim());
    if (noteEntries.length === 0 || !recipe.structured) return;

    const changePrompt = noteEntries
      .map(([idx, note]) => {
        const s = steps[parseInt(idx, 10)];
        const prefix = s
          ? `After step ${parseInt(idx, 10) + 1} ("${s.step_text.slice(0, 60)}"): `
          : '';
        return prefix + note;
      })
      .join('\n');

    setPhase('refining');
    try {
      // This is a one-off refine of an already-saved recipe (no original generation
      // prompt or edit history is retained for it), so it's seeded as a single-turn
      // conversation using the current recipe as the "initial" document.
      const result = await apiService.refineRecipe(
        { prompt: recipe.recipename, source_type: 'text' },
        recipe.structured,
        [],
        `Apply my cooking notes to improve this recipe:\n${changePrompt}`,
      );
      if (result.status !== 'applied' || !result.structured) {
        const detail = result.options?.length ? `${result.message}\n\nOptions: ${result.options.join(', ')}` : result.message;
        showAlert(result.status === 'rejected' ? "Can't apply that" : 'Needs a choice', detail || 'Could not refine the recipe.');
        setPhase('done');
        return;
      }
      setRefinedRecipe({ recipename: result.recipename!, recipe: result.recipe!, structured: result.structured });
      setPhase('refined');
    } catch {
      setPhase('done');
    }
  };

  const handleSaveRefined = async () => {
    if (!refinedRecipe?.structured) return;
    if (recipe.manually_edited) {
      const ok = await confirmAction(
        'Overwrite manual edits?',
        'Applying this AI suggestion will replace your manual changes to this recipe.',
        { confirmLabel: 'Apply' },
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      const updated = await apiService.patchRecipe({
        id: recipe.id,
        structured: refinedRecipe.structured,
        ai_sourced: true,
      });
      setRecipe(updated);
      navigation.navigate('Recipes');
    } catch {
      setSaving(false);
    }
  };

  const formatTimer = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m} min`;
  };

  const renderIngredientText = (ing: Ingredient): string => {
    let qty = '';
    if (ing.quantity && ing.quantity > 0) {
      qty =
        ing.quantity === Math.floor(ing.quantity)
          ? `${Math.floor(ing.quantity)} `
          : `${ing.quantity.toFixed(1)} `;
      if (ing.unit) qty += `${ing.unit} `;
    } else if (ing.quantity_text) {
      qty = `${ing.quantity_text} `;
    }
    return `${qty}${ing.item}${ing.optional ? ' (optional)' : ''}`;
  };

  // ── Loading ──────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={styles.loadingText}>Loading recipe...</Text>
      </View>
    );
  }

  // ── Refining ─────────────────────────────────────────────────────────────

  if (phase === 'refining') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={styles.loadingText}>Refining your recipe...</Text>
        <Text style={styles.loadingSubtext}>AI is incorporating your cooking notes</Text>
      </View>
    );
  }

  // ── Refined result ───────────────────────────────────────────────────────

  if (phase === 'refined' && refinedRecipe) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setPhase('done')} style={styles.headerSide}>
            <Text style={styles.headerAction}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Refined Recipe
          </Text>
          <View style={styles.headerSide} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.refinedTitle}>{refinedRecipe.recipename}</Text>
          <Text style={styles.refinedBody}>{refinedRecipe.recipe}</Text>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.btnDisabled]}
            onPress={handleSaveRefined}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Save to My Recipes</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('Recipes')}
          >
            <Text style={styles.secondaryBtnText}>Discard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────

  if (phase === 'done') {
    const noteEntries = Object.entries(notes).filter(([, n]) => n.trim());
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerSide}>
            <Text style={styles.headerAction}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {recipe.recipename}
          </Text>
          <View style={styles.headerSide} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.doneEmoji}>🍽️</Text>
          <Text style={styles.doneTitle}>Great job!</Text>
          <Text style={styles.doneSubtitle}>You cooked {recipe.recipename}</Text>

          {noteEntries.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Your cooking notes</Text>
              {noteEntries.map(([idx, note]) => {
                const s = steps[parseInt(idx, 10)];
                return (
                  <View key={idx} style={styles.noteCard}>
                    {s && (
                      <Text style={styles.noteStepLabel}>
                        Step {parseInt(idx, 10) + 1}
                      </Text>
                    )}
                    <Text style={styles.noteText}>{note}</Text>
                  </View>
                );
              })}
              <TouchableOpacity style={styles.primaryBtn} onPress={handleRefine}>
                <Text style={styles.primaryBtnText}>✨ Refine recipe with my notes</Text>
              </TouchableOpacity>
              <Text style={styles.refineHint}>
                AI will incorporate your notes into an improved version
              </Text>
            </>
          ) : (
            <Text style={styles.noNotesText}>
              No notes this time. Tap "📝 Note" during cooking to capture observations.
            </Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.secondaryBtnText}>Back to Recipes</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Overview ─────────────────────────────────────────────────────────────

  if (phase === 'overview') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerSide}>
            <Text style={styles.headerAction}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {recipe.recipename}
          </Text>
          <View style={styles.headerSide} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {structured && (
            <View style={styles.metaRow}>
              {structured.servings != null && (
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>👤 {structured.servings}</Text>
                </View>
              )}
              {structured.prep_minutes != null && (
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>⏱ Prep {structured.prep_minutes}m</Text>
                </View>
              )}
              {structured.cook_minutes != null && (
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>🔥 Cook {structured.cook_minutes}m</Text>
                </View>
              )}
              {structured.difficulty != null && (
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>{structured.difficulty}</Text>
                </View>
              )}
            </View>
          )}

          {ingredients.length > 0 ? (
            <>
              <Text style={styles.overviewSectionTitle}>Ingredients</Text>
              {ingredients.map((ing: Ingredient, i: number) => (
                <View key={i} style={styles.ingredientRow}>
                  <Text style={styles.ingredientDot}>•</Text>
                  <Text style={styles.ingredientText}>{renderIngredientText(ing)}</Text>
                </View>
              ))}
            </>
          ) : (
            <Markdown style={recipeMarkdownStyles(theme)}>{recipe.recipe}</Markdown>
          )}

          {steps.length > 0 && (
            <Text style={styles.stepsCount}>{steps.length} steps to cook</Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.startButton}
            onPress={() => {
              setCurrentStep(0);
              setPhase('cooking');
            }}
          >
            <Text style={styles.startButtonText}>
              {steps.length > 0
                ? `Start Cooking · ${steps.length} steps`
                : 'Start Cooking'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Cooking ──────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setPhase('overview')}
          style={styles.headerSide}
        >
          <Text style={styles.headerAction}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {recipe.recipename}
        </Text>
        <Text style={styles.stepCounter}>
          {steps.length > 0 ? `${currentStep + 1}/${steps.length}` : ''}
        </Text>
      </View>

      {/* Progress bar */}
      {steps.length > 1 && (
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentStep + 1) / steps.length) * 100}%` as any },
            ]}
          />
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.stepScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {step ? (
          <>
            <Text style={styles.stepLabel}>Step {currentStep + 1}</Text>
            <Text style={styles.stepText}>{step.step_text}</Text>

            <View style={styles.badgeRow}>
              {step.timer_seconds != null && step.timer_seconds > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    ⏱ {formatTimer(step.timer_seconds)}
                  </Text>
                </View>
              )}
              {step.temperature_c != null && step.temperature_c > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>🌡️ {step.temperature_c}°C</Text>
                </View>
              )}
            </View>

            {(() => {
              const stepIngs = getStepIngredients(step, ingredients);
              if (stepIngs.length === 0) return null;
              return (
                <View style={styles.stepIngSection}>
                  <Text style={styles.stepIngLabel}>You'll need</Text>
                  <View style={styles.stepIngChips}>
                    {stepIngs.map((ing, i) => (
                      <View key={i} style={styles.stepIngChip}>
                        <Text style={styles.stepIngChipText}>
                          {renderIngredientText(ing)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}
          </>
        ) : (
          <Markdown style={recipeMarkdownStyles(theme)}>{recipe.recipe}</Markdown>
        )}

        {/* Note panel */}
        {showNoteInput ? (
          <View style={styles.noteInputContainer}>
            <Text style={styles.noteInputLabel}>📝 Add a note</Text>
            <TextInput autoComplete="off"
              style={styles.noteInputField}
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="e.g. Used less salt, tasted great"
              placeholderTextColor={theme.placeholder}
              multiline
              autoFocus
            />
            <View style={styles.noteInputActions}>
              <TouchableOpacity
                style={styles.noteSaveBtn}
                onPress={() => {
                  if (noteInput.trim()) {
                    setNotes(prev => ({ ...prev, [currentStep]: noteInput.trim() }));
                  }
                  setShowNoteInput(false);
                }}
              >
                <Text style={styles.noteSaveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.noteCancelBtn}
                onPress={() => setShowNoteInput(false)}
              >
                <Text style={styles.noteCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : notes[currentStep] ? (
          <TouchableOpacity
            style={styles.savedNote}
            onPress={() => {
              setNoteInput(notes[currentStep]);
              setShowNoteInput(true);
            }}
          >
            <Text style={styles.savedNoteLabel}>📝 Your note (tap to edit)</Text>
            <Text style={styles.savedNoteText}>{notes[currentStep]}</Text>
          </TouchableOpacity>
        ) : null}

        {/* AI chat panel */}
        {showAiInput && (
          <View style={styles.aiContainer}>
            <Text style={styles.aiLabel}>✨ Ask AI</Text>
            <View style={styles.aiInputRow}>
              <TextInput autoComplete="off"
                style={styles.aiInputField}
                value={aiInput}
                onChangeText={setAiInput}
                placeholder="e.g. What if I forgot the eggs?"
                placeholderTextColor={theme.placeholder}
                onSubmitEditing={askAI}
                returnKeyType="send"
                editable={!aiLoading}
              />
              <TouchableOpacity
                style={[
                  styles.aiSendBtn,
                  (aiLoading || !aiInput.trim()) && styles.btnDisabled,
                ]}
                onPress={askAI}
                disabled={aiLoading || !aiInput.trim()}
              >
                {aiLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.aiSendBtnText}>Ask</Text>
                )}
              </TouchableOpacity>
            </View>
            {aiAnswer && (
              <View style={styles.aiAnswer}>
                <Text style={styles.aiAnswerText}>{aiAnswer}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Action bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.actionBtn, showNoteInput && styles.actionBtnActive]}
          onPress={() => {
            setShowNoteInput(prev => !prev);
            if (showAiInput) setShowAiInput(false);
          }}
        >
          <Text style={styles.actionBtnText}>📝 Note</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, showAiInput && styles.actionBtnActive]}
          onPress={() => {
            setShowAiInput(prev => !prev);
            if (showNoteInput) setShowNoteInput(false);
          }}
        >
          <Text style={styles.actionBtnText}>✨ Ask AI</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={[styles.navBtnPrev, currentStep === 0 && styles.navBtnDisabled]}
          onPress={goPrev}
          disabled={currentStep === 0}
        >
          <Text
            style={[
              styles.navBtnPrevText,
              currentStep === 0 && styles.navBtnTextDisabled,
            ]}
          >
            ← Prev
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtnNext} onPress={goNext}>
          <Text style={styles.navBtnNextText}>
            {currentStep === steps.length - 1 ? 'Finish ✓' : 'Next →'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.bg,
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center',
      padding: 30,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 17,
      color: t.text,
      fontWeight: '600',
    },
    loadingSubtext: {
      marginTop: 6,
      fontSize: 14,
      color: t.muted,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'ios' ? 56 : 20,
      paddingBottom: 12,
      backgroundColor: t.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.hairline,
    },
    headerSide: {
      width: 60,
    },
    headerAction: {
      fontSize: 16,
      color: t.accent,
      fontWeight: '600',
    },
    headerTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: t.text,
      textAlign: 'center',
    },
    stepCounter: {
      fontSize: 14,
      color: t.muted,
      fontWeight: '600',
      width: 60,
      textAlign: 'right',
    },

    // Progress
    progressBar: {
      height: 3,
      backgroundColor: t.border,
    },
    progressFill: {
      height: 3,
      backgroundColor: t.accent,
    },

    // Scrollable content
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    stepScrollContent: {
      padding: 24,
      paddingBottom: 20,
    },

    // Overview
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 24,
    },
    metaBadge: {
      backgroundColor: t.surface,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: t.border,
    },
    metaBadgeText: {
      fontSize: 13,
      color: t.subtext,
      fontWeight: '500',
    },
    overviewSectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: t.text,
      marginBottom: 14,
    },
    ingredientRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    ingredientDot: {
      fontSize: 16,
      color: t.accent,
      marginRight: 10,
      marginTop: 1,
    },
    ingredientText: {
      flex: 1,
      fontSize: 16,
      color: t.text,
      lineHeight: 22,
    },
    stepsCount: {
      marginTop: 24,
      fontSize: 14,
      color: t.muted,
      textAlign: 'center',
    },
    // Step
    stepLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: t.accent,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 14,
    },
    stepText: {
      fontSize: 22,
      lineHeight: 32,
      color: t.text,
      fontWeight: '500',
      marginBottom: 20,
    },
    badgeRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    badge: {
      backgroundColor: t.accentFaded,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    badgeText: {
      fontSize: 13,
      color: t.accent,
      fontWeight: '600',
    },

    // Step ingredient chips
    stepIngSection: {
      marginBottom: 20,
    },
    stepIngLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: t.muted,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    stepIngChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    stepIngChip: {
      backgroundColor: t.surface,
      borderRadius: 20,
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: t.border,
    },
    stepIngChipText: {
      fontSize: 13,
      color: t.subtext,
    },

    // Note input
    noteInputContainer: {
      backgroundColor: t.surface,
      borderRadius: 12,
      padding: 14,
      marginTop: 16,
      borderWidth: 1,
      borderColor: t.border,
    },
    noteInputLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: t.text,
      marginBottom: 8,
    },
    noteInputField: {
      fontSize: 15,
      color: t.text,
      minHeight: 60,
      textAlignVertical: 'top',
    },
    noteInputActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 10,
    },
    noteSaveBtn: {
      backgroundColor: t.accent,
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 8,
    },
    noteSaveBtnText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    noteCancelBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    noteCancelBtnText: {
      color: t.muted,
      fontSize: 14,
    },
    savedNote: {
      backgroundColor: t.surface,
      borderRadius: 12,
      padding: 14,
      marginTop: 16,
      borderLeftWidth: 3,
      borderLeftColor: t.accent,
    },
    savedNoteLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: t.accent,
      marginBottom: 4,
    },
    savedNoteText: {
      fontSize: 14,
      color: t.text,
      lineHeight: 20,
    },

    // AI chat
    aiContainer: {
      backgroundColor: t.surface,
      borderRadius: 12,
      padding: 14,
      marginTop: 16,
      borderWidth: 1,
      borderColor: t.border,
    },
    aiLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: t.text,
      marginBottom: 10,
    },
    aiInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    aiInputField: {
      flex: 1,
      backgroundColor: t.bg,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: t.text,
      borderWidth: 1,
      borderColor: t.border,
    },
    aiSendBtn: {
      backgroundColor: t.accent,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      minWidth: 56,
      alignItems: 'center',
    },
    aiSendBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
    },
    aiAnswer: {
      marginTop: 12,
      backgroundColor: t.accentFaded,
      borderRadius: 10,
      padding: 12,
    },
    aiAnswerText: {
      fontSize: 15,
      color: t.text,
      lineHeight: 22,
    },

    // Action bar
    actionBar: {
      flexDirection: 'row',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.hairline,
      backgroundColor: t.surface,
    },
    actionBtn: {
      flex: 1,
      paddingVertical: 14,
      alignItems: 'center',
    },
    actionBtnActive: {
      backgroundColor: t.accentFaded,
    },
    actionBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: t.subtext,
    },

    // Nav bar
    navBar: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 12,
      paddingBottom: Platform.OS === 'ios' ? 28 : 12,
      gap: 12,
      backgroundColor: t.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.hairline,
    },
    navBtnPrev: {
      flex: 1,
      paddingVertical: 16,
      alignItems: 'center',
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: t.border,
    },
    navBtnDisabled: {
      opacity: 0.3,
    },
    navBtnPrevText: {
      fontSize: 16,
      fontWeight: '600',
      color: t.text,
    },
    navBtnTextDisabled: {
      color: t.muted,
    },
    navBtnNext: {
      flex: 2,
      paddingVertical: 16,
      alignItems: 'center',
      backgroundColor: t.accent,
      borderRadius: 14,
    },
    navBtnNextText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },

    // Done screen
    doneEmoji: {
      fontSize: 56,
      textAlign: 'center',
      marginBottom: 16,
      marginTop: 8,
    },
    doneTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: t.text,
      textAlign: 'center',
      marginBottom: 6,
    },
    doneSubtitle: {
      fontSize: 16,
      color: t.muted,
      textAlign: 'center',
      marginBottom: 32,
    },
    sectionLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: t.muted,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 12,
    },
    noteCard: {
      backgroundColor: t.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderLeftWidth: 3,
      borderLeftColor: t.accent,
    },
    noteStepLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: t.accent,
      marginBottom: 4,
    },
    noteText: {
      fontSize: 15,
      color: t.text,
      lineHeight: 21,
    },
    noNotesText: {
      fontSize: 15,
      color: t.muted,
      textAlign: 'center',
      lineHeight: 22,
      marginTop: 8,
    },
    refineHint: {
      fontSize: 13,
      color: t.muted,
      textAlign: 'center',
      marginTop: 10,
      lineHeight: 18,
    },

    // Refined recipe
    refinedTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: t.text,
      marginBottom: 16,
    },
    refinedBody: {
      fontSize: 15,
      color: t.subtext,
      lineHeight: 22,
    },

    // Shared buttons
    primaryBtn: {
      backgroundColor: t.accent,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 16,
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryBtn: {
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: t.border,
      marginTop: 10,
    },
    secondaryBtnText: {
      color: t.subtext,
      fontSize: 15,
      fontWeight: '600',
    },
    btnDisabled: {
      opacity: 0.5,
    },

    // Footer
    footer: {
      padding: 16,
      paddingBottom: Platform.OS === 'ios' ? 28 : 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.hairline,
      backgroundColor: t.bg,
    },
    startButton: {
      backgroundColor: t.accent,
      borderRadius: 14,
      paddingVertical: 18,
      alignItems: 'center',
    },
    startButtonText: {
      color: '#fff',
      fontSize: 17,
      fontWeight: '700',
    },
  });

export default CookingModeScreen;
