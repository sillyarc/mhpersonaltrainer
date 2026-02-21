import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColorScheme } from '../theme';

interface AppState {
  colorScheme: ColorScheme;
  language: string;
  isOnboarded: boolean;
  pushNotificationsEnabled: boolean;
}

interface AppStore extends AppState {
  setColorScheme: (scheme: ColorScheme) => void;
  toggleColorScheme: () => void;
  setLanguage: (language: string) => void;
  setOnboarded: (value: boolean) => void;
  setPushNotifications: (enabled: boolean) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      colorScheme: 'light',
      language: 'pt',
      isOnboarded: false,
      pushNotificationsEnabled: true,

      setColorScheme: (colorScheme) => set({ colorScheme }),

      toggleColorScheme: () => {
        const current = get().colorScheme;
        set({ colorScheme: current === 'light' ? 'dark' : 'light' });
      },

      setLanguage: (language) => set({ language }),

      setOnboarded: (isOnboarded) => set({ isOnboarded }),

      setPushNotifications: (pushNotificationsEnabled) => 
        set({ pushNotificationsEnabled }),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
