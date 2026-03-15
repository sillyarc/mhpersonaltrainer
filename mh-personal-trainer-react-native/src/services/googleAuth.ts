import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

type GoogleExtraConfig = {
  expoClientId?: string;
  iosClientId?: string;
  androidClientId?: string;
  webClientId?: string;
};

type ExpoExtra = {
  google?: GoogleExtraConfig;
};

type GoogleAuthPlatform = 'android' | 'ios' | 'web';

type NativeGoogleTokens = {
  idToken?: string;
  accessToken?: string;
};

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

const expoExtra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;
const googleExtraConfig = expoExtra.google ?? {};

const pickConfigValue = (envValue: string | undefined, extraValue?: string) =>
  (envValue ?? '').trim() || (extraValue ?? '').trim();

const expoClientId = pickConfigValue(
  process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
  googleExtraConfig.expoClientId
);
const webClientId = pickConfigValue(
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleExtraConfig.webClientId
);
const iosClientId = pickConfigValue(
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  googleExtraConfig.iosClientId
);
const androidClientId = pickConfigValue(
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  googleExtraConfig.androidClientId
);

let nativeGoogleConfigured = false;
let nativeGoogleModule: GoogleSigninModule | null = null;

export const googleAuthConfig = {
  clientId: webClientId || expoClientId,
  iosClientId: iosClientId || webClientId || expoClientId,
  androidClientId: androidClientId || webClientId || expoClientId,
  webClientId: webClientId || expoClientId,
};

function isExpoGoRuntime() {
  return (
    Constants.executionEnvironment === 'storeClient' ||
    Constants.appOwnership === 'expo'
  );
}

function hasTurboModule(name: string): boolean {
  try {
    const turboModuleRegistry = require('react-native/Libraries/TurboModule/TurboModuleRegistry');
    return Boolean(turboModuleRegistry?.get?.(name));
  } catch (_) {
    return false;
  }
}

export function isGoogleNativeRuntimeAvailable(): boolean {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return false;
  }

  if (isExpoGoRuntime()) {
    return false;
  }

  return Boolean(
    (NativeModules as Record<string, unknown>).RNGoogleSignin ||
      hasTurboModule('RNGoogleSignin')
  );
}

export function getGoogleNativeRuntimeUnavailableMessage(): string {
  if (isExpoGoRuntime()) {
    return 'Login com Google no Android precisa de um development build ou APK proprio. No Expo Go esse modulo nativo nao existe.';
  }

  return 'O binario atual nao inclui o modulo nativo do Google Sign-In. Gere um novo build Android e abra esse build, nao o Expo Go.';
}

function getNativeGoogleSigninModule(): GoogleSigninModule {
  if (nativeGoogleModule) {
    return nativeGoogleModule;
  }

  if (!isGoogleNativeRuntimeAvailable()) {
    throw new Error(getGoogleNativeRuntimeUnavailableMessage());
  }

  try {
    nativeGoogleModule = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
    return nativeGoogleModule;
  } catch (_) {
    throw new Error(getGoogleNativeRuntimeUnavailableMessage());
  }
}

function resolvePlatform(platform?: GoogleAuthPlatform): GoogleAuthPlatform {
  if (platform) return platform;
  return Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web';
}

export function isGoogleAuthConfigured(platform?: GoogleAuthPlatform): boolean {
  const currentPlatform = resolvePlatform(platform);
  if (currentPlatform === 'android') {
    return Boolean(webClientId);
  }
  if (currentPlatform === 'ios') {
    return Boolean(iosClientId || webClientId || expoClientId);
  }

  return Boolean(googleAuthConfig.clientId || googleAuthConfig.webClientId);
}

function ensureNativeGoogleConfigured() {
  if (nativeGoogleConfigured) return;
  if (!webClientId) {
    throw new Error(
      'Defina EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ou extra.google.webClientId para habilitar o login nativo com Google.'
    );
  }

  const { GoogleSignin } = getNativeGoogleSigninModule();
  GoogleSignin.configure({
    scopes: ['email', 'profile'],
    webClientId,
    iosClientId: iosClientId || undefined,
  });
  nativeGoogleConfigured = true;
}

export async function signInWithGoogleNative(): Promise<NativeGoogleTokens | null> {
  const { GoogleSignin } = getNativeGoogleSigninModule();
  ensureNativeGoogleConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();
  if (!response || response.type !== 'success') {
    return null;
  }

  const tokens = await GoogleSignin.getTokens();
  return {
    idToken: tokens.idToken || response.data.idToken || undefined,
    accessToken: tokens.accessToken || undefined,
  };
}

export function getGoogleNativeSignInErrorMessage(error: unknown): string | null {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined;
  const message =
    typeof error === 'object' && error && 'message' in error ? String(error.message) : undefined;

  switch (code) {
    case 'SIGN_IN_CANCELLED':
      return null;
    case 'IN_PROGRESS':
      return 'O login com Google ja esta em andamento.';
    case 'PLAY_SERVICES_NOT_AVAILABLE':
      return 'Google Play Services indisponivel ou desatualizado neste dispositivo.';
    case 'DEVELOPER_ERROR':
    case '12500':
      return 'Configuracao do Google Sign-In invalida. Confira o SHA-1/SHA-256 do app Android no Firebase e no Google Cloud.';
  }

  if (message) {
    return message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Falha ao iniciar login com Google.';
}
