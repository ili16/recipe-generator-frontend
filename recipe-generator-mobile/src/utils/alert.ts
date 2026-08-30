import { Alert, Platform } from 'react-native';

// react-native-web ships `Alert.alert` as an empty no-op, so button callbacks
// never fire on web. Fall back to the browser dialogs there.

export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAction(
  title: string,
  message: string,
  options?: { confirmLabel?: string; destructive?: boolean }
): Promise<boolean> {
  const confirmLabel = options?.confirmLabel ?? 'OK';

  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: options?.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
