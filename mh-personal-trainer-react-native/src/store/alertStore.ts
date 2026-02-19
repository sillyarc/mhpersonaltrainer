import { create } from 'zustand';

export type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type AlertOptions = {
  cancelable?: boolean;
};

interface AlertState {
  visible: boolean;
  title: string;
  message: string;
  buttons: AlertButton[];
  options?: AlertOptions;
  show: (payload: {
    title: string;
    message?: string;
    buttons?: AlertButton[];
    options?: AlertOptions;
  }) => void;
  hide: () => void;
}

const defaultButton: AlertButton = { text: 'OK', style: 'default' };

export const useAlertStore = create<AlertState>((set) => ({
  visible: false,
  title: '',
  message: '',
  buttons: [defaultButton],
  options: { cancelable: true },
  show: (payload) => {
    set({
      visible: true,
      title: payload.title || '',
      message: payload.message || '',
      buttons: payload.buttons?.length ? payload.buttons : [defaultButton],
      options: payload.options,
    });
  },
  hide: () => set({ visible: false }),
}));
