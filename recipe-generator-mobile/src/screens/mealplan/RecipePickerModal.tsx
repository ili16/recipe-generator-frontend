import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList } from 'react-native';
import { Recipe } from '../../types';
import { useTheme, Theme } from '../../context/ThemeContext';

interface Props {
  visible: boolean;
  recipes: Recipe[];
  onSelect: (recipe: Recipe) => void;
  onClose: () => void;
}

// Shared "choose a saved recipe" picker used by Week view (tap an empty day) and Day
// view (tap an empty timeline slot).
const RecipePickerModal: React.FC<Props> = ({ visible, recipes, onSelect, onClose }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Choose a recipe</Text>
          {recipes.length === 0 ? (
            <Text style={styles.emptySubtext}>No saved recipes yet</Text>
          ) : (
            <FlatList
              data={recipes}
              keyExtractor={r => String(r.id)}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickerRow} onPress={() => onSelect(item)}>
                  <Text style={styles.pickerRowText} numberOfLines={1}>{item.recipename}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: t.surface, borderRadius: 16, padding: 16, maxHeight: '70%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: t.text, marginBottom: 12 },
  emptySubtext: { fontSize: 14, color: t.subtext, textAlign: 'center' },
  pickerRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.hairline },
  pickerRowText: { color: t.text, fontSize: 15 },
});

export default RecipePickerModal;
