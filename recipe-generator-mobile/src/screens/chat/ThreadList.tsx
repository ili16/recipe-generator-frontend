import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Sheet, Text } from '../../components/ui';
import { Theme, useTheme } from '../../context/ThemeContext';
import { space, type } from '../../theme';
import { useLanguage } from '../../context/LanguageContext';
import { currentLocale } from '../../i18n';
import apiService from '../../services/apiService';
import { ConversationSummary } from '../../types';

// The conversation list (BACKLOG.md 10.4). Threads have been in Postgres since 2.1 with
// no way to get back to one: closing the tab lost the conversation from the user's side.
//
// Loaded each time it opens rather than cached — it is a list of at most a hundred rows,
// read once per opening, and a stale "yesterday you were planning next week" is worse
// than a spinner.
const ThreadList: React.FC<{
  visible: boolean;
  currentId: string | null;
  onClose: () => void;
  onOpen: (id: string) => void;
}> = ({ visible, currentId, onClose, onOpen }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [threads, setThreads] = useState<ConversationSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setThreads(null);
    setFailed(false);
    apiService.listConversations().then(setThreads).catch(() => setFailed(true));
  }, [visible]);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('chat.history.title')}>
      {threads === null && !failed && <ActivityIndicator color={theme.accent} style={styles.spinner} />}
      {failed && <Text tone="muted">{t('common.unknownError')}</Text>}
      {threads?.length === 0 && <Text tone="muted">{t('chat.history.empty')}</Text>}
      <ScrollView style={styles.list}>
        {threads?.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={styles.row}
            onPress={() => onOpen(c.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: c.id === currentId }}
          >
            <View style={styles.rowBody}>
              {/* An untitled thread is one whose naming call has not landed (or failed);
                  its own last message says more than a placeholder would. */}
              <Text numberOfLines={1} style={[styles.title, c.id === currentId && styles.current]}>
                {c.title || c.preview}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {new Date(c.updated_at).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' })}
                {c.title ? ` · ${c.preview}` : ''}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Sheet>
  );
};

const makeStyles = (t: Theme) => StyleSheet.create({
  spinner: { paddingVertical: space.lg },
  // Capped so a long history cannot push the sheet past the screen; it scrolls instead.
  list: { maxHeight: 360 },
  row: { paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  rowBody: { gap: 2 },
  title: { ...type.body, fontSize: 15, color: t.text },
  current: { color: t.accent },
});

export default ThreadList;
