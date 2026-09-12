import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Recipe } from '../../types';
import { useTheme, Theme } from '../../context/ThemeContext';
import { type } from '../../theme';
import { fmtIngredient } from '../../components/RecipeView';
import { Badge } from '../../components/ui';
import { Ingredient, Step, formatTimer, getStepIngredients } from './steps';
import { makeChromeStyles } from './styles';
import { AskAiPanel, NotePanel, SavedNote } from './StepPanels';

interface Props {
  recipe: Recipe;
  steps: Step[];
  ingredients: Ingredient[];
  currentStep: number;
  notes: Record<number, string>;
  onSaveNote: (idx: number, text: string) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: (pendingNote: string) => void;
  onAsk: (question: string, stepText?: string) => Promise<string>;
}

// One cooking step at a time, with the two panels that hang off it: a note the user
// takes, and a question to the AI about this step.
const StepPhase: React.FC<Props> = ({
  recipe, steps, ingredients, currentStep, notes, onSaveNote, onClose, onPrev, onNext, onAsk,
}) => {
  const { theme } = useTheme();
  const c = useMemo(() => makeChromeStyles(theme), [theme]);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const scrollRef = useRef<ScrollView>(null);

  const [noteInput, setNoteInput] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);

  const step = steps[currentStep];

  // Reset the AI/note panels when the step changes.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setShowAiInput(false);
    setShowNoteInput(false);
    setNoteInput(notes[currentStep] ?? '');
  }, [currentStep]);

  const stepIngredients = step ? getStepIngredients(step, ingredients) : [];

  return (
    <KeyboardAvoidingView
      style={c.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={c.header}>
        <TouchableOpacity onPress={onClose} style={c.headerSide}>
          <Text style={c.headerAction}>✕</Text>
        </TouchableOpacity>
        <Text style={c.headerTitle} numberOfLines={1}>{recipe.recipename}</Text>
        <Text style={styles.stepCounter}>
          {steps.length > 0 ? `${currentStep + 1}/${steps.length}` : ''}
        </Text>
      </View>

      {steps.length > 1 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((currentStep + 1) / steps.length) * 100}%` as any }]} />
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={c.scrollView}
        contentContainerStyle={styles.stepScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {step && (
          <>
            <Text style={styles.stepLabel}>Step {currentStep + 1}</Text>
            <Text style={styles.stepText}>{step.step_text}</Text>

            <View style={styles.badgeRow}>
              {step.timer_seconds != null && step.timer_seconds > 0 && (
                <Badge label={`⏱ ${formatTimer(step.timer_seconds)}`} />
              )}
              {step.temperature_c != null && step.temperature_c > 0 && (
                <Badge label={`🌡️ ${step.temperature_c}°C`} />
              )}
            </View>

            {stepIngredients.length > 0 && (
              <View style={styles.stepIngSection}>
                <Text style={styles.stepIngLabel}>You'll need</Text>
                <View style={styles.stepIngChips}>
                  {stepIngredients.map((ing, i) => (
                    <Badge
                      key={i}
                      tone="neutral"
                      label={`${fmtIngredient(ing)}${ing.optional ? ' (optional)' : ''}`}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {showNoteInput ? (
          <NotePanel
            value={noteInput}
            onChange={setNoteInput}
            onSave={() => {
              onSaveNote(currentStep, noteInput);
              setShowNoteInput(false);
            }}
            onCancel={() => setShowNoteInput(false)}
          />
        ) : notes[currentStep] ? (
          <SavedNote
            note={notes[currentStep]}
            onEdit={() => {
              setNoteInput(notes[currentStep]);
              setShowNoteInput(true);
            }}
          />
        ) : null}

        {showAiInput && (
          <AskAiPanel onAsk={onAsk} stepText={step?.step_text} />
        )}
      </ScrollView>

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

      <View style={styles.navBar}>
        <TouchableOpacity
          style={[styles.navBtnPrev, currentStep === 0 && styles.navBtnDisabled]}
          onPress={onPrev}
          disabled={currentStep === 0}
        >
          <Text style={[styles.navBtnPrevText, currentStep === 0 && styles.navBtnTextDisabled]}>← Prev</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtnNext} onPress={() => onNext(noteInput)}>
          <Text style={styles.navBtnNextText}>
            {currentStep === steps.length - 1 ? 'Finish ✓' : 'Next →'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  stepCounter: {
    ...type.label,
    color: t.muted,
    width: 60,
    textAlign: 'right',
  },
  progressBar: {
    height: 3,
    backgroundColor: t.border,
  },
  progressFill: {
    height: 3,
    backgroundColor: t.accent,
  },
  stepScrollContent: {
    padding: 24,
    paddingBottom: 20,
  },
  stepLabel: {
    ...type.label, fontSize: 13,
    color: t.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  stepText: {
    ...type.title, fontSize: 22,
    lineHeight: 32,
    color: t.text,
    marginBottom: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  stepIngSection: {
    marginBottom: 20,
  },
  stepIngLabel: {
    ...type.label, fontSize: 11,
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
  actionBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
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
    ...type.label, fontSize: 15,
    color: t.subtext,
  },
  navBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    gap: 12,
    backgroundColor: t.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
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
    ...type.label, fontSize: 16,
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
    ...type.label, fontSize: 16,
    color: t.onAccent,
  },
});

export default StepPhase;
