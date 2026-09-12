import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme, Theme } from '../../context/ThemeContext';
import { type } from '../../theme';
import { TAGS_BY_GROUP, TAG_GROUP_LABELS, TagGroup } from '../../constants/tags';
import { makeSharedStyles } from './styles';
import { Chip } from '../../components/ui';
import { Collection } from '../../types';
import { QuickFilter, QUICK_FILTER_LABELS } from './quickFilters';

export type SortMode = 'recent' | 'name';

interface Props {
  search: string;
  onSearch: (value: string) => void;
  selectedTags: Set<string>;
  onToggleTag: (slug: string) => void;
  sortMode: SortMode;
  onToggleSort: () => void;
  trashMode: boolean;
  onToggleTrash: () => void;
  collections: Collection[];
  activeCollectionId: number | null;
  onSelectCollection: (id: number | null) => void;
  onDeleteCollection: (collection: Collection) => void;
  quickFilters: Set<QuickFilter>;
  onToggleQuickFilter: (filter: QuickFilter) => void;
}

const RecipeToolbar: React.FC<Props> = ({ search, onSearch, selectedTags, onToggleTag, sortMode, onToggleSort, trashMode, onToggleTrash,
  collections, activeCollectionId, onSelectCollection, onDeleteCollection, quickFilters, onToggleQuickFilter }) => {
  const { theme } = useTheme();
  const s = useMemo(() => makeSharedStyles(theme), [theme]);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [showFilters, setShowFilters] = useState(false);

  return (
    <View style={styles.toolbar}>
      <View style={styles.searchRow}>
        {/* Search, tags and sort are library-only — the trash is a short flat list. */}
        {!trashMode && (
          <>
            <TextInput autoComplete="off"
              style={styles.searchInput}
              placeholder="Search recipes..."
              placeholderTextColor={theme.muted}
              value={search}
              onChangeText={onSearch}
            />
            <TouchableOpacity
              style={[styles.filterToggle, (showFilters || selectedTags.size > 0) && styles.filterToggleActive]}
              onPress={() => setShowFilters(v => !v)}
            >
              <Text style={[styles.filterToggleText, (showFilters || selectedTags.size > 0) && styles.filterToggleTextActive]}>
                Tags{selectedTags.size > 0 ? ` (${selectedTags.size})` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sortToggle} onPress={onToggleSort}>
              <Text style={styles.sortToggleText}>{sortMode === 'recent' ? 'Recent' : 'A–Z'}</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity
          style={[styles.sortToggle, trashMode && styles.filterToggleActive, trashMode && styles.trashToggleWide]}
          onPress={onToggleTrash}
        >
          <Text style={[styles.sortToggleText, trashMode && styles.filterToggleTextActive]}>
            {trashMode ? '← Back to recipes' : 'Trash'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* The three cheap filters (BACKLOG 6.5): they read fields the list already carries,
          and unlike collections they combine. */}
      {!trashMode && (
        <View style={[s.tagRow, styles.quickRow]}>
          {(Object.keys(QUICK_FILTER_LABELS) as QuickFilter[]).map(f => (
            <Chip
              key={f}
              label={QUICK_FILTER_LABELS[f]}
              selected={quickFilters.has(f)}
              onPress={() => onToggleQuickFilter(f)}
            />
          ))}
        </View>
      )}

      {/* Collections are a one-at-a-time filter, unlike tags: "which of these are mine
          for Sunday" is a single answer. Long-press a chip to delete the collection. */}
      {!trashMode && collections.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.collectionRow}>
          <View style={s.tagRow}>
            <Chip label="All" selected={activeCollectionId === null} onPress={() => onSelectCollection(null)} />
            {collections.map(c => (
              <Chip
                key={c.id}
                label={`${c.name} (${c.recipe_ids.length})`}
                selected={activeCollectionId === c.id}
                onPress={() => onSelectCollection(activeCollectionId === c.id ? null : c.id)}
                onLongPress={() => onDeleteCollection(c)}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {!trashMode && showFilters && (
        <ScrollView style={styles.filterPanel} nestedScrollEnabled>
          {(Object.keys(TAGS_BY_GROUP) as TagGroup[]).map(group => (
            <View key={group} style={s.filterGroup}>
              <Text style={s.filterGroupLabel}>{TAG_GROUP_LABELS[group]}</Text>
              <View style={s.tagRow}>
                {TAGS_BY_GROUP[group].map(tag => (
                  <Chip
                    key={tag.slug}
                    label={tag.label}
                    selected={selectedTags.has(tag.slug)}
                    onPress={() => onToggleTag(tag.slug)}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  toolbar: {
    paddingHorizontal: 15,
    paddingTop: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...type.body, fontSize: 14,
    color: t.text,
  },
  filterToggle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  filterToggleActive: {
    borderColor: t.accent,
    backgroundColor: t.accentFaded,
  },
  filterToggleText: {
    ...type.label, fontSize: 13,
    color: t.subtext,
  },
  filterToggleTextActive: {
    color: t.accent,
  },
  sortToggle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  collectionRow: {
    marginTop: 10,
  },
  quickRow: {
    marginTop: 10,
  },
  trashToggleWide: {
    flex: 1,
  },
  sortToggleText: {
    ...type.body, fontSize: 13,
    color: t.subtext,
  },
  filterPanel: {
    marginTop: 10,
    maxHeight: 220,
    backgroundColor: t.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
    padding: 12,
  },
});

export default RecipeToolbar;
