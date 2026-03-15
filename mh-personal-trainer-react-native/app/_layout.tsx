import React, { useEffect, useMemo, useRef } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StripeProvider } from '@stripe/stripe-react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { initializeFirebase } from '../src/services/firebase';
import { firestoreService } from '../src/services/firestoreService';
import { registerForPushNotificationsAsync, savePushToken } from '../src/services/notifications';
import { notifyAdminsUserOnline } from '../src/services/notificationCenter';
import { useAppStore } from '../src/store/appStore';
import { changeLanguage, normalizeSupportedLanguage } from '../src/i18n';
import { useAuthStore } from '../src/store/authStore';
import { STRIPE_PUBLISHABLE_KEY } from '../src/services/payments';
import '../src/i18n';
import { AppAlertHost } from '../src/components/common/AppAlertHost';
import { FloatingHomeButton } from '../src/components/common';
import { getThemeColors } from '../src/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});

const getWebAccessAllowed = (width: number) => {
  if (Platform.OS !== 'web') return true;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const uaMatch =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Windows Phone|Tablet/i.test(ua);
  const widthMatch = window.matchMedia
    ? window.matchMedia('(max-width: 1024px)').matches
    : width <= 1024;
  const touchMatch = window.matchMedia
    ? window.matchMedia('(pointer: coarse)').matches
    : 'ontouchstart' in window;

  return uaMatch || (widthMatch && touchMatch);
};

export default function RootLayout() {
  const { colorScheme, language, setLanguage } = useAppStore();
  const { user, setUser, setLoading } = useAuthStore();
  const webLandingUrl = (process.env.EXPO_PUBLIC_WEB_LANDING_URL || '').trim();
  const { width } = useWindowDimensions();
  const colors = getThemeColors(colorScheme);
  const notifiedUserRef = useRef<string | null>(null);
  const syncedLanguageRef = useRef<string | null>(null);

  const allowWeb = useMemo(() => getWebAccessAllowed(width), [width]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!allowWeb && webLandingUrl) {
      window.location.replace(webLandingUrl);
    }
  }, [allowWeb, webLandingUrl]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let auth: ReturnType<typeof initializeFirebase>['auth'] | null = null;

    try {
      ({ auth } = initializeFirebase());
    } catch (error) {
      console.error('Firebase initialization failed:', error);
      setUser(null);
      setLoading(false);
      return;
    }

    if (!auth) {
      setUser(null);
      setLoading(false);
      return;
    }

    const notifyAppOpen = (
      firebaseUser: { uid: string; displayName?: string | null; email?: string | null },
      userData?: { admin?: boolean; displayName?: string; professorAccount?: boolean } | null
    ) => {
      if (notifiedUserRef.current === firebaseUser.uid) return;
      notifiedUserRef.current = firebaseUser.uid;
      if (userData?.admin) return;
      void notifyAdminsUserOnline({
        userId: firebaseUser.uid,
        userName: userData?.displayName || firebaseUser.displayName || firebaseUser.email || 'Usuario',
        userEmail: firebaseUser.email || '',
        isPersonal: userData?.professorAccount,
      });
    };
    
    unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userData = await firestoreService.getUserDocument(firebaseUser.uid);
          
          if (userData) {
            setUser(userData);
            await firestoreService.updateLastActiveTime(firebaseUser.uid);
          } else {
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || '',
              photoUrl: firebaseUser.photoURL || undefined,
              createdTime: new Date(),
              professorAccount: false,
              admin: false,
              assinatura: false,
              planoChatGPT: false,
              acessoSuspenso: false,
            });
          }
          notifyAppOpen(firebaseUser, userData);
          registerForPushNotificationsAsync()
            .then((token) => {
              if (token) {
                savePushToken(firebaseUser.uid, token);
              }
            })
            .catch(() => {});
        } catch (error) {
          console.error('Error fetching user data:', error);
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || '',
            photoUrl: firebaseUser.photoURL || undefined,
            createdTime: new Date(),
            professorAccount: false,
              admin: false,
              assinatura: false,
              planoChatGPT: false,
              acessoSuspenso: false,
            });
          notifyAppOpen(firebaseUser);
        }
        setLoading(false);
      } else {
        setUser(null);
        setLoading(false);
        notifiedUserRef.current = null;
      }
    });
    
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (language) {
      changeLanguage(language);
    }
  }, [language]);

  useEffect(() => {
    const remoteLanguage = normalizeSupportedLanguage(user?.language);
    if (remoteLanguage && remoteLanguage !== language) {
      setLanguage(remoteLanguage);
      return;
    }

    if (!user?.uid || remoteLanguage || !language) {
      return;
    }

    const syncKey = `${user.uid}:${language}`;
    if (syncedLanguageRef.current === syncKey) {
      return;
    }
    syncedLanguageRef.current = syncKey;
    void firestoreService.updateUserLanguage(user.uid, language).catch((error) => {
      console.warn('Error syncing user language:', error);
      syncedLanguageRef.current = null;
    });
  }, [user?.uid, user?.language, language, setLanguage]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const applyImmersiveMode = async () => {
      try {
        await NavigationBar.setPositionAsync('absolute');
        await NavigationBar.setBackgroundColorAsync('#00000000');
        await NavigationBar.setVisibilityAsync('hidden');
      } catch {
        // Ignore unsupported devices or runtime limitations.
      }
    };

    void applyImmersiveMode();

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void applyImmersiveMode();
      }
    });

    return () => appStateSubscription.remove();
  }, []);

  if (Platform.OS === 'web' && !allowWeb) {
    return (
      <View style={styles.webGate}>
        <View style={styles.webGateCard}>
          <Text style={styles.webGateTitle}>Acesso do aluno no web</Text>
          <Text style={styles.webGateText}>
            Esta versao funciona apenas em celular e tablet.
          </Text>
          {webLandingUrl ? (
            <Pressable
              style={styles.webGateButton}
              onPress={() => {
                Linking.openURL(webLandingUrl).catch(() => {
                  window.location.href = webLandingUrl;
                });
              }}
            >
              <Text style={styles.webGateButtonText}>Ir para o site</Text>
            </Pressable>
          ) : (
            <Text style={styles.webGateHint}>
              Defina EXPO_PUBLIC_WEB_LANDING_URL para redirecionar.
            </Text>
          )}
        </View>
      </View>
    );
  }

  const paperTheme = colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider
          publishableKey={STRIPE_PUBLISHABLE_KEY}
          urlScheme="mhpersonaltrainer"
          merchantIdentifier="merchant.com.mh.personaltrainer"
        >
          <QueryClientProvider client={queryClient}>
            <PaperProvider theme={paperTheme}>
              <StatusBar
                hidden={Platform.OS !== 'web'}
                style={colorScheme === 'dark' ? 'light' : 'dark'}
                backgroundColor={colors.background}
              />
              <AppAlertHost />
              <View style={{ flex: 1, backgroundColor: colors.background }}>
                <Stack
                  key={language}
                  screenOptions={{
                    headerShown: false,
                    animation: 'slide_from_right',
                    contentStyle: { backgroundColor: colors.background },
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                </Stack>
                <FloatingHomeButton />
              </View>
            </PaperProvider>
          </QueryClientProvider>
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  webGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0f172a',
  },
  webGateCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  webGateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f8fafc',
    textAlign: 'center',
    marginBottom: 8,
  },
  webGateText: {
    fontSize: 14,
    color: '#cbd5f5',
    textAlign: 'center',
    marginBottom: 16,
  },
  webGateButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
  },
  webGateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  webGateHint: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
});
