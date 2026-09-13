import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, TextInput } from 'react-native';
import { Recipe, MealSlot } from '../../types';
import { useTheme, Theme } from '../../context/ThemeContext';
import { pickerRows } from './pickerRows';
import { type } from '../../theme';

interface Props {
  visible: boolean;
  recipes: Recipe[];
  /** The slot being filled, when one is known — titles the picker and orders the list. */
  slot?: MealSlot;
  onSelect: (recipe: Recipe) => void;
  onClose: () => void;
}

const SLOT_ARTICLE: Record<MealSlot, string> = {
  breakfast: 'a breakfast',
  lunch: 'a lunch',
  dinner: 'a dinner',
  snack: 'a snack',
};

/**
 * Shared "choose a saved recipe" picker: the week view's empty day, every row's Swap, and
 * "Add a meal".
 *
 * The slot is known at the moment the picker opens, so it is used: recipes tagged for that
 * meal lead, the rest sit under "Other recipes" (BACKLOG 9.9). Ranked, never filtered —
 * hiding would be wrong, people eat soup for breakfast.
 */
const RecipePickerModal: React.FC<Props> = ({ visible, recipes, slot, onSelect, onClose }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [query, setQuery] = useState('');

  // A query is about one picking, not about the picker.
  useEffect(() => { if (visible) setQuery(''); }, [visible]);

  const rows = useMemo(() => pickerRows(recipes, slot, query), [recipes, slot, query]);

  const title = slot ? `Choose ${SLOT_ARTICLE[slot]}` : 'Choose a recipe';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
          <Text style={styles.modalTitle}>{title}</Text>
          {recipes.length === 0 ? (
            <Text style={styles.emptySubtext}>No saved recipes yet</Text>
          ) : (
            <>
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder="Search recipes"
                placeholderTextColor={theme.muted}
                autoCorrect={false}
                accessibilityLabel="Search saved recipes"
              />
              {rows.length === 0 ? (
                <Text style={styles.emptySubtext}>Nothing matches “{query.trim()}”</Text>
              ) : (
                <FlatList
                  data={rows}
                  keyboardShouldPersistTaps="handled"
                  keyExtractor={row => row.kind === 'heading' ? `h:${row.label}` : String(row.recipe.id)}
                  renderItem={({ item }) => item.kind === 'heading' ? (
                    <Text style={styles.heading}>{item.label}</Text>
                  ) : (
                    <TouchableOpacity style={styles.pickerRow} onPress={() => onSelect(item.recipe)}>
                      <Text style={styles.pickerRowText} numberOfLines={1}>{item.recipe.recipename}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: t.overlay, justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: t.surface, borderRadius: 16, padding: 16, maxHeight: '70%' },
  modalTitle: { ...type.title, fontSize: 16, lineHeight: 22, color: t.text, marginBottom: 12 },
  emptySubtext: { ...type.body, fontSize: 14, color: t.subtext, textAlign: 'center' },
  search: {
    ...type.body,
    color: t.text,
    backgroundColor: t.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  heading: { ...type.label, color: t.muted, paddingTop: 16, paddingBottom: 4 },
  pickerRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  pickerRowText: { color: t.text, ...type.body },
});

export default RecipePickerModal;
