import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Collection, Recipe, RecipeDocument, RecipeVersion } from '../../types';
import { useTheme, Theme } from '../../context/ThemeContext';
import { type } from '../../theme';
import RecipeView from '../../components/RecipeView';
import { Badge } from '../../components/ui';
import { TAG_LABEL_BY_SLUG } from '../../constants/tags';
import { originLabel } from '../../utils/recipeOrigin';
import { makeSharedStyles } from './styles';
import RecipeEditForm from './RecipeEditForm';
import { RefinePanel, VariantPanel, HistoryPanel, CollectionsPanel, VariantPreview } from './RecipePanels';

interface Props {
  recipe: Recipe;
  expanded: boolean;
  variantOfName?: string;
  /** How many saved recipes name this one as their parent (BACKLOG 6.5). */
  variantCount?: number;
  onToggle: () => void;
  onCook: () => void;
  onDelete: () => void;
  /** Share on (copies the link) when unshared, revoke when shared — BACKLOG 8.4. */
  onToggleShare: () => void;
  onVote: (vote: 1 | -1) => void;
  ensureStructured: (recipe: Recipe) => Promise<RecipeDocument | null>;
  onSaveEdit: (doc: RecipeDocument) => Promise<boolean>;
  onRefine: (prompt: string) => Promise<boolean>;
  onGenerateVariant: (hint: string) => Promise<VariantPreview | null>;
  onAcceptVariant: (preview: VariantPreview) => Promise<boolean>;
  onLoadHistory: () => Promise<RecipeVersion[]>;
  collections: Collection[];
  onToggleCollection: (collectionId: number, member: boolean) => void;
  onCreateCollection: (name: string) => Promise<Collection | null>;
}

type Panel = 'none' | 'edit' | 'refine' | 'variant' | 'history' | 'collections';

// One recipe in the library list: collapsed header, and when expanded the recipe plus
// whichever of the four inline flows the user opened.
const RecipeCard: React.FC<Props> = ({
  recipe, expanded, variantOfName, variantCount = 0, onToggle, onCook, onDelete, onToggleShare, onVote,
  ensureStructured, onSaveEdit, onRefine, onGenerateVariant, onAcceptVariant, onLoadHistory,
  collections, onToggleCollection, onCreateCollection,
}) => {
  const { theme } = useTheme();
  const s = useMemo(() => makeSharedStyles(theme), [theme]);
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [panel, setPanel] = useState<Panel>('none');
  const [editDoc, setEditDoc] = useState<RecipeDocument | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantPreview, setVariantPreview] = useState<VariantPreview | null>(null);
  const [historyEntries, setHistoryEntries] = useState<RecipeVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const memberOf = collections.filter(c => c.recipe_ids.includes(recipe.id));

  const startEdit = async () => {
    const doc = (await ensureStructured(recipe)) ?? {
      title: recipe.recipename,
      summary: null,
      language: 'en',
      tags: recipe.tags ?? [],
      servings: null,
      total_minutes: null,
      prep_minutes: null,
      cook_minutes: null,
      difficulty: null,
      ingredients: [],
      steps: [],
    };
    setEditDoc(doc);
    setPanel('edit');
  };

  const saveEdit = async (doc: RecipeDocument) => {
    setSavingEdit(true);
    const ok = await onSaveEdit(doc);
    setSavingEdit(false);
    if (ok) {
      setPanel('none');
      setEditDoc(null);
    }
  };

  const runRefine = async (prompt: string) => {
    if (!prompt) return;
    setRefineLoading(true);
    const ok = await onRefine(prompt);
    setRefineLoading(false);
    if (ok) setPanel('none');
  };

  const runVariant = async (hint: string) => {
    setVariantLoading(true);
    setVariantPreview(await onGenerateVariant(hint));
    setVariantLoading(false);
  };

  const acceptVariant = async () => {
    if (!variantPreview) return;
    if (await onAcceptVariant(variantPreview)) {
      setVariantPreview(null);
      setPanel('none');
    }
  };

  const toggleHistory = async () => {
    if (panel === 'history') {
      setPanel('none');
      return;
    }
    setPanel('history');
    setHistoryLoading(true);
    setHistoryEntries(await onLoadHistory());
    setHistoryLoading(false);
  };

  return (
    <View style={styles.recipeCard}>
      <TouchableOpacity onPress={onToggle} style={styles.cardHeader}>
        <View style={styles.cardHeaderMain}>
          <Text style={styles.recipeName}>{recipe.recipename}</Text>
          {recipe.variant_of_recipe_id != null && (
            <Text style={styles.variantOfCaption}>
              Variant of {variantOfName ?? 'a saved recipe'}
            </Text>
          )}
          {originLabel(recipe) && (
            <Text style={styles.variantOfCaption}>{originLabel(recipe)}</Text>
          )}
          {((recipe.tags ?? []).length > 0 || recipe.manually_edited || memberOf.length > 0 || variantCount > 0 || !!recipe.share_token) && (
            <View style={styles.tagBadgeRow}>
              {!!recipe.share_token && (
                <Badge label="Shared" icon={<Ionicons name="link" size={11} color={theme.accent} />} />
              )}
              {variantCount > 0 && (
                <Badge
                  label={`${variantCount} variant${variantCount === 1 ? '' : 's'}`}
                  icon={<Ionicons name="copy-outline" size={11} color={theme.accent} />}
                />
              )}
              {memberOf.map(c => (
                <Badge
                  key={`c${c.id}`}
                  label={c.name}
                  icon={<Ionicons name="folder-outline" size={11} color={theme.accent} />}
                />
              ))}
              {recipe.manually_edited && (
                <Badge
                  label="Manually edited"
                  icon={<Ionicons name="create-outline" size={11} color={theme.accent} />}
                />
              )}
              {(recipe.tags ?? []).map(slug => (
                <Badge key={slug} label={TAG_LABEL_BY_SLUG[slug] ?? slug} />
              ))}
            </View>
          )}
        </View>
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={theme.subtext}
          style={styles.expandIcon}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.cardContent}>
          {panel === 'edit' && editDoc ? (
            <RecipeEditForm
              initial={editDoc}
              saving={savingEdit}
              onCancel={() => { setPanel('none'); setEditDoc(null); }}
              onSave={saveEdit}
            />
          ) : (
            <>
              <ScrollView style={styles.recipeContentScroll} nestedScrollEnabled>
                <RecipeView structured={recipe.structured} markdown={recipe.recipe} />
              </ScrollView>

              {panel === 'refine' && <RefinePanel loading={refineLoading} onApply={runRefine} />}

              {panel === 'variant' && (
                <VariantPanel
                  loading={variantLoading}
                  preview={variantPreview}
                  onGenerate={runVariant}
                  onDiscard={() => setVariantPreview(null)}
                  onAccept={acceptVariant}
                />
              )}

              {panel === 'history' && <HistoryPanel loading={historyLoading} entries={historyEntries} />}

              {panel === 'collections' && (
                <CollectionsPanel
                  collections={collections}
                  recipeId={recipe.id}
                  onToggle={onToggleCollection}
                  onCreate={onCreateCollection}
                />
              )}

              <View style={s.cardActions}>
                <TouchableOpacity style={s.cookButton} onPress={startEdit}>
                  <Ionicons name="create-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
                  <Text style={s.cookButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.cookButton}
                  onPress={() => setPanel(p => (p === 'refine' ? 'none' : 'refine'))}
                >
                  <Ionicons name="sparkles-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
                  <Text style={s.cookButtonText}>Refine with AI</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.cookButton}
                  onPress={() => {
                    setVariantPreview(null);
                    setPanel(p => (p === 'variant' ? 'none' : 'variant'));
                  }}
                >
                  <Ionicons name="copy-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
                  <Text style={s.cookButtonText}>Create Variant</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.cookButton}
                  onPress={() => setPanel(p => (p === 'collections' ? 'none' : 'collections'))}
                >
                  <Ionicons name="folder-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
                  <Text style={s.cookButtonText}>Collections</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cookButton} onPress={toggleHistory}>
                  <Ionicons name="time-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
                  <Text style={s.cookButtonText}>History</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cookButton} onPress={onCook}>
                  <Ionicons name="flame-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
                  <Text style={s.cookButtonText}>Cook</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cookButton} onPress={onToggleShare}>
                  <Ionicons
                    name={recipe.share_token ? 'link' : 'link-outline'}
                    size={14}
                    color={theme.accent}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={s.cookButtonText}>{recipe.share_token ? 'Stop sharing' : 'Share link'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cookButton} onPress={() => onVote(1)}>
                  <Ionicons name={recipe.my_vote === 1 ? 'thumbs-up' : 'thumbs-up-outline'} size={14} color={theme.accent} />
                </TouchableOpacity>
                <TouchableOpacity style={s.cookButton} onPress={() => onVote(-1)}>
                  <Ionicons name={recipe.my_vote === -1 ? 'thumbs-down' : 'thumbs-down-outline'} size={14} color={theme.accent} />
                </TouchableOpacity>
                <TouchableOpacity style={s.deleteButton} onPress={onDelete}>
                  <Ionicons name="trash-outline" size={14} color={theme.onAccent} style={{ marginRight: 6 }} />
                  <Text style={s.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  recipeCard: {
    backgroundColor: t.surface,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1.5,
    borderColor: t.accent,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
  },
  cardHeaderMain: {
    flex: 1,
  },
  recipeName: {
    ...type.title, fontSize: 18,
    color: t.text,
  },
  variantOfCaption: {
    ...type.caption,
    color: t.subtext,
    marginTop: 2,
  },
  tagBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  expandIcon: {
    ...type.body, fontSize: 16,
    color: t.subtext,
    marginLeft: 10,
  },
  cardContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
    padding: 15,
  },
  recipeContentScroll: {
    maxHeight: 420,
    marginBottom: 15,
  },
});

export default RecipeCard;
