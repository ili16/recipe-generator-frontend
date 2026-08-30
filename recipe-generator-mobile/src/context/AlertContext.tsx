import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useMemo,
  ReactNode,
} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from './ThemeContext';

interface AlertConfig {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  isConfirm: boolean;
  resolve: (result: boolean) => void;
}

interface AlertContextValue {
  showAlert: (title: string, message?: string) => void;
  confirmAction: (
    title: string,
    message: string,
    options?: { confirmLabel?: string; destructive?: boolean }
  ) => Promise<boolean>;
}

const AlertContext = createContext<AlertContextValue>({
  showAlert: () => {},
  confirmAction: async () => false,
});

function iconFor(title: string, message = ''): { name: React.ComponentProps<typeof Ionicons>['name']; bg: string; color: string } | null {
  const text = (title + ' ' + message).toLowerCase();
  if (/error|fail|invalid|no recipe|permission|unsupported|sorry|could not/i.test(text))
    return { name: 'warning-outline', bg: '#2d1010', color: '#e53935' };
  if (/success|saved|deleted/i.test(text))
    return { name: 'checkmark-circle-outline', bg: '#0d2316', color: '#4caf50' };
  if (/welcome|sign/i.test(text))
    return { name: 'person-circle-outline', bg: '#121a2d', color: '#5c9cf5' };
  return null;
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const { theme: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  const open = (cfg: AlertConfig) => {
    setConfig(cfg);
    scaleAnim.setValue(0.9);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 300 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
  };

  const close = (result: boolean) => {
    config?.resolve(result);
    setConfig(null);
  };

  const showAlert = (title: string, message?: string) =>
    new Promise<boolean>(resolve => open({ title, message, isConfirm: false, resolve }));

  const confirmAction = (
    title: string,
    message: string,
    options?: { confirmLabel?: string; destructive?: boolean }
  ): Promise<boolean> =>
    new Promise(resolve =>
      open({
        title, message,
        confirmLabel: options?.confirmLabel ?? 'OK',
        destructive: options?.destructive,
        isConfirm: true,
        resolve,
      })
    );

  const icon = config ? iconFor(config.title, config.message) : null;

  return (
    <AlertContext.Provider value={{ showAlert, confirmAction }}>
      {children}
      <Modal
        visible={!!config}
        transparent
        animationType="none"
        onRequestClose={() => close(false)}
        statusBarTranslucent
      >
        <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => !config?.isConfirm && close(false)} />
          <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
            {icon && (
              <View style={[styles.iconWrap, { backgroundColor: icon.bg }]}>
                <Ionicons name={icon.name} size={26} color={icon.color} />
              </View>
            )}
            <Text style={styles.title}>{config?.title}</Text>
            {config?.message ? <Text style={styles.message}>{config.message}</Text> : null}
            <View style={[styles.buttonRow, config?.isConfirm && styles.buttonRowDual]}>
              {config?.isConfirm && (
                <TouchableOpacity style={styles.btnCancel} onPress={() => close(false)}>
                  <Text style={styles.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.btnOk, config?.destructive && styles.btnDestructive]}
                onPress={() => close(true)}
              >
                <Text style={[styles.btnOkText, config?.destructive && styles.btnDestructiveText]}>
                  {config?.isConfirm ? (config.confirmLabel ?? 'OK') : 'OK'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </AlertContext.Provider>
  );
}

export const useAlert = () => useContext(AlertContext);

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    card: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: t.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: t.border,
      paddingHorizontal: 24,
      paddingTop: 28,
      paddingBottom: 20,
      alignItems: 'center',
      // shadow for iOS
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 18,
      // elevation for Android
      elevation: 12,
    },
    iconWrap: {
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: t.text,
      textAlign: 'center',
      marginBottom: 6,
    },
    message: {
      fontSize: 13,
      color: t.muted,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: 4,
    },
    buttonRow: {
      marginTop: 22,
      width: '100%',
    },
    buttonRowDual: {
      flexDirection: 'row',
      gap: 10,
    },
    btnOk: {
      flex: 1,
      backgroundColor: t.accent,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: 'center',
    },
    btnOkText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
    },
    btnCancel: {
      flex: 1,
      backgroundColor: t.surface,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.border,
    },
    btnCancelText: {
      color: t.subtext,
      fontSize: 14,
      fontWeight: '600',
    },
    btnDestructive: {
      backgroundColor: '#c0392b',
    },
    btnDestructiveText: {
      color: '#fff',
    },
  });
