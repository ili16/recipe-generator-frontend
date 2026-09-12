import { useEffect, useRef, useState } from 'react';
import apiService from '../services/apiService';
import { Recipe, RecipeResponse } from '../types';
import { useAlert } from '../context/AlertContext';
import { Ingredient, Step } from '../screens/cooking/steps';

export type Phase = 'loading' | 'overview' | 'cooking' | 'done' | 'refining' | 'refined';

// The cooking run itself: which phase, which step, the notes taken along the way, and
// the AI refine those notes feed.
export function useCookingSession(initialRecipe: Recipe, onSaved: () => void) {
  const { showAlert, confirmAction } = useAlert();
  const [recipe, setRecipe] = useState<Recipe>(initialRecipe);
  const [phase, setPhase] = useState<Phase>(initialRecipe.structured ? 'overview' : 'loading');
  const [currentStep, setCurrentStep] = useState(0);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [refinedRecipe, setRefinedRecipe] = useState<RecipeResponse | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialRecipe.structured) return;
    apiService.getRecipeById(initialRecipe.id)
      .then(setRecipe)
      .catch(() => {/* fall through: overview renders the markdown text only */})
      .finally(() => setPhase('overview'));
  }, []);

  // A recipe with no structured document has no steps to walk: the overview renders its
  // markdown through RecipeView's fallback and hides "Start Cooking" entirely.
  const structured = recipe.structured;
  const steps: Step[] = structured?.steps ?? [];
  const ingredients: Ingredient[] = structured?.ingredients ?? [];

  const setNote = (idx: number, text: string) => {
    if (!text.trim()) return;
    setNotes(prev => ({ ...prev, [idx]: text.trim() }));
  };

  const next = (pendingNote?: string) => {
    if (pendingNote?.trim()) setNote(currentStep, pendingNote);
    if (currentStep < steps.length - 1) setCurrentStep(prev => prev + 1);
    else setPhase('done');
  };

  const prev = () => setCurrentStep(p => (p > 0 ? p - 1 : p));

  // Every AI call this cooking run makes — the refine below and each "Ask AI" question —
  // is a turn in one agent thread, so a question can follow up on the last answer and the
  // refine sees what was already discussed (BACKLOG 3.13).
  const conversationId = useRef<string | null>(null);

  const turn = async (message: string) => {
    const result = await apiService.chatTurn(message, conversationId.current);
    conversationId.current = result.conversationId;
    return result;
  };

  // A question about the step the user is on. Returns the agent's prose; the panel that
  // calls it renders the running Q&A.
  const ask = async (question: string, stepText?: string) => {
    const context = stepText ? `\n\n(I'm on this step: ${stepText})` : '';
    const { text } = await turn(
      `I'm cooking my saved recipe ${recipe.id} ("${recipe.recipename}"). ${question}${context}`,
    );
    return text;
  };

  const refine = async () => {
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
      // The agent loads the recipe by id itself (transform_recipe takes a saved id), so
      // the document no longer travels up with the request. It proposes; saveRefined
      // below is still the only thing that writes.
      const { text, document } = await turn(
        `Apply my cooking notes to my saved recipe ${recipe.id} and show me the updated version. Do not save it.\n${changePrompt}`,
      );
      if (!document) {
        // No artifact means the agent declined or asked something back — its own words
        // are a better message than the old envelope's canned one.
        showAlert("Couldn't apply that", text || 'Could not refine the recipe.', 'error');
        setPhase('done');
        return;
      }
      setRefinedRecipe({ recipename: document.title, recipe: '', structured: document });
      setPhase('refined');
    } catch {
      setPhase('done');
    }
  };

  const saveRefined = async () => {
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
      onSaved();
    } catch {
      setSaving(false);
    }
  };

  return {
    recipe, structured, steps, ingredients,
    phase, setPhase, currentStep, setCurrentStep,
    notes, setNote, next, prev,
    ask, refine, refinedRecipe, saveRefined, saving,
  };
}
