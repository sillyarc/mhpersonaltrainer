import { Alert, Platform } from 'react-native';
import { useAlertStore, AlertButton, AlertOptions } from '../store/alertStore';

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions
) {
  if (Platform.OS === 'ios') {
    return Alert.alert(title, message, buttons as any, options as any);
  }

  useAlertStore.getState().show({
    title,
    message,
    buttons,
    options,
  });
}

export type { AlertButton, AlertOptions };
