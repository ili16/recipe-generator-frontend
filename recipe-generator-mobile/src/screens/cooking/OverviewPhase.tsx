import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Recipe, RecipeDocument } from '../../types';
import { useTheme, Theme } from '../../context/ThemeContext';
import { type } from '../../theme';
import RecipeView from '../../components/RecipeView';
import { Step } from './steps';
import { makeChromeStyles } from './styles';

interface Props {
  recipe: Recipe;
  structured?: RecipeDocument | null;
  steps: Step[];
  onClose: () => void;
  onStart: () => void;
}

const OverviewPhase: React.FC<Props> = ({ recipe, structured, steps, onClose, onStart }) => {
  const { theme } = useTheme();
  const c = useMemo(() => makeChromeStyles(theme), [theme]);
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={c.container}>
      <View style={c.header}>
        <TouchableOpacity onPress={onClose} style={c.headerSide}>
          <Text style={c.headerAction}>✕</Text>
        </TouchableOpacity>
        <Text style={c.headerTitle} numberOfLines={1}>{recipe.recipename}</Text>
        <View style={c.headerSide} />
      </View>

      <ScrollView style={c.scrollView} contentContainerStyle={c.scrollContent}>
        <RecipeView structured={structured} markdown={recipe.recipe} showSteps={false} />

        {steps.length > 0 && (
          <Text style={styles.stepsCount}>{steps.length} steps to cook</Text>
        )}
      </ScrollView>

      {/* No structured steps means there is nothing to walk — the recipe text above is all
          there is, so don't offer a step-by-step run that would open on an empty screen. */}
      {steps.length > 0 && (
        <View style={c.footer}>
          <TouchableOpacity style={styles.startButton} onPress={onStart}>
            <Text style={styles.startButtonText}>Start Cooking · {steps.length} steps</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  stepsCount: {
    marginTop: 24,
    ...type.body, fontSize: 14,
    color: t.muted,
    textAlign: 'center',
  },
  startButton: {
    backgroundColor: t.accent,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  startButtonText: {
    color: t.onAccent,
    ...type.label, fontSize: 17,
  },
});

export default OverviewPhase;
