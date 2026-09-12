import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme, Theme } from '../../context/ThemeContext';
import { type } from '../../theme';
import { Step } from './steps';
import { makeChromeStyles } from './styles';

interface Props {
  recipeName: string;
  steps: Step[];
  notes: Record<number, string>;
  onClose: () => void;
  onRefine: () => void;
}

const DonePhase: React.FC<Props> = ({ recipeName, steps, notes, onClose, onRefine }) => {
  const { theme } = useTheme();
  const c = useMemo(() => makeChromeStyles(theme), [theme]);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const noteEntries = Object.entries(notes).filter(([, n]) => n.trim());

  return (
    <View style={c.container}>
      <View style={c.header}>
        <TouchableOpacity onPress={onClose} style={c.headerSide}>
          <Text style={c.headerAction}>Close</Text>
        </TouchableOpacity>
        <Text style={c.headerTitle} numberOfLines={1}>{recipeName}</Text>
        <View style={c.headerSide} />
      </View>

      <ScrollView style={c.scrollView} contentContainerStyle={c.scrollContent}>
        <Text style={styles.doneEmoji}>🍽️</Text>
        <Text style={styles.doneTitle}>Great job!</Text>
        <Text style={styles.doneSubtitle}>You cooked {recipeName}</Text>

        {noteEntries.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Your cooking notes</Text>
            {noteEntries.map(([idx, note]) => {
              const s = steps[parseInt(idx, 10)];
              return (
                <View key={idx} style={styles.noteCard}>
                  {s && <Text style={styles.noteStepLabel}>Step {parseInt(idx, 10) + 1}</Text>}
                  <Text style={styles.noteText}>{note}</Text>
                </View>
              );
            })}
            <TouchableOpacity style={c.primaryBtn} onPress={onRefine}>
              <Text style={c.primaryBtnText}>✨ Refine recipe with my notes</Text>
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

      <View style={c.footer}>
        <TouchableOpacity style={c.secondaryBtn} onPress={onClose}>
          <Text style={c.secondaryBtnText}>Back to Recipes</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  doneEmoji: {
    ...type.display, fontSize: 56,
    lineHeight: 73,
    textAlign: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  doneTitle: {
    ...type.display, fontSize: 28,
    color: t.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  doneSubtitle: {
    ...type.body, fontSize: 16,
    color: t.muted,
    textAlign: 'center',
    marginBottom: 32,
  },
  sectionLabel: {
    ...type.label,
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
    ...type.label, fontSize: 12,
    color: t.accent,
    marginBottom: 4,
  },
  noteText: {
    ...type.body,
    color: t.text,
    lineHeight: 21,
  },
  noNotesText: {
    ...type.body,
    color: t.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
  },
  refineHint: {
    ...type.body, fontSize: 13,
    color: t.muted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },
});

export default DonePhase;
