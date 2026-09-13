import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import apiService from '../services/apiService';
import { PantryCategory, PantryItem } from '../types';
import { useTheme, Theme } from '../context/ThemeContext';
import { space, radius } from '../theme';
import { Text, Button, Chip, Badge, SignInRequired } from '../components/ui';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { useIsAuthenticated } from '../hooks/useIsAuthenticated';
import { useLanguage } from '../context/LanguageContext';
import { daysUntil, expiryLabel, USE_FIRST_DAYS } from '../utils/pantryExpiry';

type Props = NativeStackScreenProps<RootStackParamList, 'Pantry'>;

// Sections, in the order the mockup's inventory reads (DESIGN_SYSTEM §7.7).
const CATEGORIES: Array<{ key: PantryCategory; labelKey: string }> = [
  { key: 'fridge', labelKey: 'pantry.shelf.fridge' },
  { key: 'freezer', labelKey: 'pantry.shelf.freezer' },
  { key: 'produce', labelKey: 'pantry.shelf.produce' },
  { key: 'spices_dry', labelKey: 'pantry.shelf.spices_dry' },
];

// "Use first" is derived from the expiry date rather than being a column the user has to
// maintain: anything due within USE_FIRST_DAYS is what you cook next (BACKLOG 7.4). A flag
// would be a second source of truth for the same fact, and one that goes stale.

const amountLabel = (item: PantryItem): string => {
  if (item.quantity == null) return '';
  const n = Math.round(item.quantity * 100) / 100;
  return item.unit ? `${n} ${item.unit}` : `${n}`;
};

/**
 * What the user has in the house (BACKLOG 7.1, 7.4) — the inventory half of the Pantry tab.
 *
 * Server-held, unlike the grocery list's ticks: a pantry is an account-level fact, and it is
 * what the grocery list writes into when a line is checked off (7.2). Items arrive already
 * normalised (lowercased name, kg folded into g), so what is shown here is exactly what a
 * recipe's ingredients are matched against.
 */
const PantryScreen: React.FC<Props> = ({ navigation }) => {
  const authed = useIsAuthenticated();
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [category, setCategory] = useState<PantryCategory>('fridge');
  const { theme } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  useEscapeBack();

  const load = useCallback(() => {
    if (!authed) return;
    setError(false);
    apiService.getPantry()
      .then(setItems)
      .catch(err => { console.error('Error loading pantry:', err); setError(true); });
  }, [authed]);

  // Re-read on focus: checking a grocery line writes here (7.2), so this list is stale the
  // moment the user comes back from a shopping trip.
  useEffect(load, [load]);
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const add = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const parsed = parseFloat(quantity.replace(',', '.'));
      const saved = await apiService.savePantryItem({
        name: name.trim(),
        quantity: Number.isFinite(parsed) ? parsed : null,
        unit: unit.trim() || null,
        category,
        expires_on: expiresOn.trim() || null,
      });
      // Upsert: replace the row of the same id if it was already there, else append.
      setItems(prev => [...(prev ?? []).filter(i => i.id !== saved.id), saved]);
      setName(''); setQuantity(''); setUnit(''); setExpiresOn('');
    } catch (err) {
      console.error('Error saving pantry item:', err);
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: PantryItem) => {
    setItems(prev => (prev ?? []).filter(i => i.id !== item.id));
    try {
      await apiService.deletePantryItem(item.id);
    } catch (err) {
      console.error('Error deleting pantry item:', err);
      load();
    }
  };

  const useFirst = (items ?? []).filter(i => i.expires_on != null && daysUntil(i.expires_on) <= USE_FIRST_DAYS);

  // "Find recipes using these" is a chat turn, not new machinery (BACKLOG 7.4): the agent's
  // search_my_recipes tool answers it through its `ingredients` filter, and offers to invent
  // something when the library has nothing.
  const findRecipes = () => navigation.navigate('Chat', {
    prompt: `What can I cook with these before they go off: ${useFirst.map(i => i.name).join(', ')}?`,
  });

  if (authed === null) {
    return <ActivityIndicator style={styles.pad} color={theme.accent} />;
  }

  if (!authed) {
    return (
      <SignInRequired
        message={t('pantry.signInRequired')}
        onSignIn={() => navigation.navigate('Login')}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.list}>
      <View style={styles.addCard}>
        <Text variant="label" tone="subtle">{t('pantry.addItem')}</Text>
        <TextInput
          autoComplete="off"
          style={styles.input}
          placeholder={t('pantry.namePlaceholder')}
          placeholderTextColor={theme.muted}
          value={name}
          onChangeText={setName}
          onSubmitEditing={add}
          returnKeyType="done"
        />
        <View style={styles.row}>
          <TextInput
            autoComplete="off"
            style={[styles.input, styles.short]}
            placeholder="500"
            placeholderTextColor={theme.muted}
            keyboardType="numeric"
            value={quantity}
            onChangeText={setQuantity}
          />
          <TextInput
            autoComplete="off"
            style={[styles.input, styles.short]}
            placeholder="g"
            placeholderTextColor={theme.muted}
            value={unit}
            onChangeText={setUnit}
          />
          <TextInput
            autoComplete="off"
            style={[styles.input, styles.flex]}
            placeholder={t('pantry.expiresPlaceholder')}
            placeholderTextColor={theme.muted}
            value={expiresOn}
            onChangeText={setExpiresOn}
          />
        </View>
        <View style={styles.chipRow}>
          {CATEGORIES.map(c => (
            <Chip key={c.key} label={t(c.labelKey)} selected={category === c.key} onPress={() => setCategory(c.key)} />
          ))}
        </View>
        <Button title={t('common.add')} onPress={add} loading={saving} disabled={!name.trim()} />
      </View>

      {error && (
        <View style={styles.section}>
          <Text tone="danger">{t('pantry.loadFailed')}</Text>
          <Button title={t('common.retry')} variant="secondary" size="sm" onPress={load} />
        </View>
      )}

      {useFirst.length > 0 && (
        <View style={styles.section}>
          <Text variant="label" tone="subtle">{t('pantry.useFirst')}</Text>
          <Text tone="subtle" variant="caption">
            {useFirst.map(i => i.name).join(' · ')}
          </Text>
          <Button title={t('pantry.findRecipes')} variant="secondary" size="sm" onPress={findRecipes} />
        </View>
      )}

      {items === null && !error ? (
        <ActivityIndicator style={styles.pad} color={theme.accent} />
      ) : (items ?? []).length === 0 ? (
        <Text tone="subtle">{t('pantry.empty')}</Text>
      ) : (
        CATEGORIES.map(c => {
          const section = (items ?? []).filter(i => i.category === c.key);
          if (section.length === 0) return null;
          return (
            <View key={c.key} style={styles.section}>
              <Text variant="label" tone="subtle">{t(c.labelKey)}</Text>
              {section.map(item => {
                const days = item.expires_on != null ? daysUntil(item.expires_on) : null;
                const amount = amountLabel(item);
                return (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={styles.flex}>
                      <Text>{amount ? `${amount} · ` : ''}{item.name}</Text>
                    </View>
                    {days !== null && (
                      <Badge
                        label={expiryLabel(days, t)}
                        tone={days <= USE_FIRST_DAYS ? 'accent' : 'neutral'}
                      />
                    )}
                    <TouchableOpacity
                      onPress={() => remove(item)}
                      accessibilityRole="button"
                      accessibilityLabel={t('pantry.removeItem', { name: item.name })}
                      style={styles.removeButton}
                    >
                      <Ionicons name="close" size={18} color={theme.muted} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          );
        })
      )}
    </ScrollView>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  list: { padding: space.lg, gap: space.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  pad: { padding: space.lg },
  addCard: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  flex: { flex: 1 },
  short: { width: 72 },
  input: {
    borderWidth: 1, borderColor: t.border, borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.sm + 2,
    color: t.text, backgroundColor: t.surface,
  },
  section: { gap: space.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  removeButton: { padding: space.xs },
});

export default PantryScreen;
