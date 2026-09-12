import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RecipeDocument, RecipeVersion } from '../../types';
import { useTheme, Theme } from '../../context/ThemeContext';
import { type } from '../../theme';
import { summarizeVersionChange } from '../../utils/versionSummary';
import { makeSharedStyles } from './styles';

// The three inline panels an expanded recipe card can show below the recipe:
// refine-with-AI, create-variant, and edit history.

export interface VariantPreview {
  recipename: string;
  recipe: string;
  structured: RecipeDocument;
  variantOfRecipeId: number;
}

export const RefinePanel: React.FC<{ loading: boolean; onApply: (prompt: string) => void }> = ({ loading, onApply }) => {
  const { theme } = useTheme();
  const s = useMemo(() => makeSharedStyles(theme), [theme]);
  const [prompt, setPrompt] = useState('');

  return (
    <View style={s.refineBox}>
      <TextInput autoComplete="off"
        style={[s.fieldInput, s.fieldInputMultiline]}
        placeholder="e.g. make it vegetarian, double the servings..."
        placeholderTextColor={theme.muted}
        value={prompt}
        onChangeText={setPrompt}
        editable={!loading}
        multiline
      />
      <TouchableOpacity
        style={[s.cookButton, (!prompt.trim() || loading) && s.btnDisabled]}
        onPress={() => onApply(prompt.trim())}
        disabled={!prompt.trim() || loading}
      >
        <Text style={s.cookButtonText}>{loading ? 'Thinking…' : 'Apply'}</Text>
      </TouchableOpacity>
    </View>
  );
};

export const VariantPanel: React.FC<{
  loading: boolean;
  preview: VariantPreview | null;
  onGenerate: (hint: string) => void;
  onDiscard: () => void;
  onAccept: () => void;
}> = ({ loading, preview, onGenerate, onDiscard, onAccept }) => {
  const { theme } = useTheme();
  const s = useMemo(() => makeSharedStyles(theme), [theme]);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [hint, setHint] = useState('');

  return (
    <View style={s.refineBox}>
      {preview ? (
        <View style={styles.variantPreviewBox}>
          <Text style={styles.variantPreviewTitle}>{preview.recipename}</Text>
          {preview.structured.summary ? (
            <Text style={styles.variantPreviewSummary}>{preview.structured.summary}</Text>
          ) : null}
          <View style={styles.variantActionsRow}>
            <TouchableOpacity style={styles.variantDiscardButton} onPress={onDiscard}>
              <Text style={styles.variantDiscardButtonText}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.variantAcceptButton} onPress={onAccept}>
              <Text style={styles.variantAcceptButtonText}>Save as new recipe</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <TextInput autoComplete="off"
            style={[s.fieldInput, s.fieldInputMultiline]}
            placeholder="Optional: steer the twist, e.g. make it Thai-style"
            placeholderTextColor={theme.muted}
            value={hint}
            onChangeText={setHint}
            editable={!loading}
            multiline
          />
          <TouchableOpacity
            style={[s.cookButton, loading && s.btnDisabled]}
            onPress={() => onGenerate(hint.trim())}
            disabled={loading}
          >
            <Text style={s.cookButtonText}>{loading ? 'Thinking…' : 'Generate'}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const CHANGE_KIND_ICON: Record<RecipeVersion['change_kind'], React.ComponentProps<typeof Ionicons>['name']> = {
  extraction: 'add-circle-outline',
  import: 'add-circle-outline',
  manual: 'create-outline',
  ai_edit: 'sparkles-outline',
};

const CHANGE_KIND_LABEL: Record<RecipeVersion['change_kind'], string> = {
  extraction: 'Created',
  import: 'Imported',
  manual: 'Manual edit',
  ai_edit: 'AI edit',
};

export const HistoryPanel: React.FC<{ loading: boolean; entries: RecipeVersion[] }> = ({ loading, entries }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.historyBox}>
      {loading ? (
        <Text style={styles.historyEmptyText}>Loading history…</Text>
      ) : entries.length === 0 ? (
        <Text style={styles.historyEmptyText}>No edit history yet.</Text>
      ) : (
        <ScrollView style={styles.historyScroll} nestedScrollEnabled>
          {entries.map((entry, idx) => (
            <View key={entry.version} style={styles.historyEntry}>
              <View style={styles.historyEntryHeader}>
                <Ionicons name={CHANGE_KIND_ICON[entry.change_kind]} size={13} color={theme.accent} style={{ marginRight: 6 }} />
                <Text style={styles.historyKind}>{CHANGE_KIND_LABEL[entry.change_kind]}</Text>
                <Text style={styles.historyDate}>{new Date(entry.created_at).toLocaleString()}</Text>
              </View>
              <Text style={styles.historySummary}>
                {summarizeVersionChange(entry.data, entries[idx + 1]?.data)}
              </Text>
              {entry.change_note ? (
                <Text style={styles.historyNote}>“{entry.change_note}”</Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  variantPreviewBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    gap: 6,
  },
  variantPreviewTitle: {
    ...type.label,
    color: t.text,
  },
  variantPreviewSummary: {
    ...type.body, fontSize: 13,
    color: t.subtext,
    lineHeight: 18,
  },
  variantActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  variantAcceptButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: t.accent,
  },
  variantAcceptButtonText: {
    color: t.onAccent,
    ...type.label, fontSize: 13,
  },
  variantDiscardButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.border,
  },
  variantDiscardButtonText: {
    color: t.subtext,
    ...type.label, fontSize: 13,
  },
  historyBox: {
    marginBottom: 15,
  },
  historyEmptyText: {
    ...type.body, fontSize: 13,
    color: t.muted,
    fontStyle: 'italic',
  },
  historyScroll: {
    maxHeight: 260,
  },
  historyEntry: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  historyEntryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  historyKind: {
    ...type.label, fontSize: 12,
    color: t.text,
    flex: 1,
  },
  historyDate: {
    ...type.caption, fontSize: 11,
    color: t.muted,
  },
  historySummary: {
    ...type.body, fontSize: 13,
    color: t.subtext,
  },
  historyNote: {
    ...type.caption,
    color: t.muted,
    fontStyle: 'italic',
    marginTop: 3,
  },
});
