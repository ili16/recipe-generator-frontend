import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { RootStackParamList } from '../navigation/AppNavigator';
import apiService from '../services/apiService';
import authService from '../services/authService';
import { Household } from '../types';
import { Text, Button, Card, Badge, Screen, SignInRequired } from '../components/ui';
import Loading from '../components/Loading';
import { useTheme, Theme } from '../context/ThemeContext';
import { space, radius } from '../theme';
import { useEscapeBack } from '../hooks/useEscapeBack';
import { useIsAuthenticated } from '../hooks/useIsAuthenticated';
import { useAlert } from '../context/AlertContext';
import { useLanguage } from '../context/LanguageContext';
import { ApiError } from '../services/apiService';

type Props = NativeStackScreenProps<RootStackParamList, 'Household'>;

/**
 * Households (BACKLOG 15.1). One kitchen instead of one cook: a shared pantry, a shared
 * week, a shared grocery list, and a library everyone can cook from but only the owner
 * can rewrite.
 *
 * Two states, one screen. Out of a household it is a create form and a join form; in one
 * it is the member list, the code, and the two ways out. There is no invite flow and no
 * member management because the code is the whole mechanism — the same call the read-only
 * recipe link makes (8.4), with the addition that this one can be rotated.
 */
const HouseholdScreen: React.FC<Props> = ({ navigation }) => {
  const authed = useIsAuthenticated();
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { showAlert, confirmAction } = useAlert();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  useEscapeBack();

  const load = useCallback(() => {
    if (!authed) { setLoading(false); return; }
    apiService.getHousehold()
      .then(setHousehold)
      .catch(err => console.error('Error loading household:', err))
      .finally(() => setLoading(false));
  }, [authed]);

  // Re-read on focus: somebody else joining or disbanding changes what this screen says
  // without this device having done anything.
  useEffect(load, [load]);
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  // Every action here is one call that either replaces the household or clears it, and
  // every one of them needs the same guard, spinner and error line.
  const run = async (action: () => Promise<Household | null>, failure: string) => {
    if (busy) return;
    setBusy(true);
    try {
      setHousehold(await action());
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      showAlert(t('common.error'), status === 409 ? t('household.alreadyIn') : status === 404 ? t('household.badCode') : failure, 'error');
    } finally {
      setBusy(false);
    }
  };

  const create = () => {
    if (!name.trim()) return;
    run(async () => {
      const created = await apiService.createHousehold(name.trim());
      setName('');
      return created;
    }, t('household.createFailed'));
  };

  const join = () => {
    if (!code.trim()) return;
    run(async () => {
      const joined = await apiService.joinHousehold(code.trim());
      setCode('');
      return joined;
    }, t('household.joinFailed'));
  };

  const copyCode = async () => {
    if (!household) return;
    await Clipboard.setStringAsync(household.join_code);
    showAlert(t('household.codeCopied'), household.join_code, 'success');
  };

  // Rotating is destructive to anybody holding the old code, which is the point — say so
  // before doing it, because the person who left is not the only one who might have it.
  const rotate = async () => {
    if (!household) return;
    if (!(await confirmAction(t('household.rotateTitle'), t('household.rotateBody'),
      { confirmLabel: t('household.rotate'), destructive: true }))) return;
    run(async () => ({ ...household, join_code: await apiService.rotateHouseholdCode() }), t('household.rotateFailed'));
  };

  const leave = async () => {
    if (!(await confirmAction(t('household.leaveTitle'), t('household.leaveBody'),
      { confirmLabel: t('household.leave'), destructive: true }))) return;
    run(async () => { await apiService.leaveHousehold(); return null; }, t('household.leaveFailed'));
  };

  const disband = async () => {
    if (!(await confirmAction(t('household.disbandTitle'), t('household.disbandBody'),
      { confirmLabel: t('household.disband'), destructive: true }))) return;
    run(async () => { await apiService.disbandHousehold(); return null; }, t('household.disbandFailed'));
  };

  if (!authed) {
    return <SignInRequired message={t('household.signInRequired')} onSignIn={() => authService.login()} />;
  }
  if (loading) return <Loading visible />;

  if (!household) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.list}>
          <Text variant="title">{t('household.title')}</Text>
          <Text tone="subtle">{t('household.intro')}</Text>

          <Card style={styles.section}>
            <Text variant="label" tone="subtle">{t('household.createLabel')}</Text>
            <TextInput
              autoComplete="off"
              style={styles.input}
              placeholder={t('household.namePlaceholder')}
              placeholderTextColor={theme.muted}
              value={name}
              onChangeText={setName}
              onSubmitEditing={create}
              returnKeyType="done"
            />
            <Button title={t('household.create')} onPress={create} disabled={!name.trim() || busy} loading={busy} />
          </Card>

          <Card style={styles.section}>
            <Text variant="label" tone="subtle">{t('household.joinLabel')}</Text>
            <TextInput
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.input, styles.code]}
              placeholder={t('household.codePlaceholder')}
              placeholderTextColor={theme.muted}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={join}
              returnKeyType="done"
            />
            <Button title={t('household.join')} variant="secondary" onPress={join} disabled={!code.trim() || busy} loading={busy} />
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.list}>
        <Text variant="title">{household.name}</Text>
        <Text tone="subtle">{t('household.sharedExplainer')}</Text>

        <Card style={styles.section}>
          <Text variant="label" tone="subtle">{t('household.members')}</Text>
          {household.members.map(m => (
            <View key={m.id} style={styles.memberRow}>
              <Text>{m.name || m.email || t('household.unnamedMember')}</Text>
              {m.is_me ? <Badge label={t('household.you')} /> : null}
            </View>
          ))}
        </Card>

        <Card style={styles.section}>
          <Text variant="label" tone="subtle">{t('household.joinCode')}</Text>
          <Text tone="subtle">{t('household.joinCodeExplainer')}</Text>
          <Text variant="title" style={styles.codeValue}>{household.join_code}</Text>
          <View style={styles.actionRow}>
            <Button title={t('household.copyCode')} variant="secondary" size="sm" onPress={copyCode} />
            <Button title={t('household.rotate')} variant="ghost" size="sm" onPress={rotate} disabled={busy} />
          </View>
        </Card>

        <View style={styles.actionRow}>
          <Button title={t('household.leave')} variant="secondary" onPress={leave} disabled={busy} />
          <Button title={t('household.disband')} variant="danger" onPress={disband} disabled={busy} />
        </View>
      </ScrollView>
    </Screen>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  list: { gap: space.md, paddingBottom: space.xl },
  section: { gap: space.sm },
  input: {
    borderWidth: 1, borderColor: t.border, borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.sm + 2,
    color: t.text, backgroundColor: t.surface,
  },
  // The code is read aloud and retyped, so it is spaced out and monospaced rather than
  // set as prose.
  code: { letterSpacing: 2, textTransform: 'uppercase' },
  codeValue: { letterSpacing: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actionRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});

export default HouseholdScreen;
