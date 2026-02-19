import { Platform, TextStyle } from 'react-native';

const outfitFamily = Platform.select({
  web: 'Outfit, sans-serif',
  ios: 'Outfit-Regular',
  android: 'Outfit-Regular',
  default: 'Outfit',
});

const readexProFamily = Platform.select({
  web: '"Readex Pro", sans-serif',
  ios: 'ReadexPro-Regular',
  android: 'ReadexPro-Regular',
  default: 'ReadexPro',
});

export const fontFamilies = {
  outfit: outfitFamily,
  readexPro: readexProFamily,
};

export const typography = {
  displayLarge: {
    fontFamily: outfitFamily,
    fontSize: 64,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 72,
  },
  displayMedium: {
    fontFamily: outfitFamily,
    fontSize: 44,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 52,
  },
  displaySmall: {
    fontFamily: outfitFamily,
    fontSize: 36,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 44,
  },
  headlineLarge: {
    fontFamily: outfitFamily,
    fontSize: 32,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 40,
  },
  headlineMedium: {
    fontFamily: outfitFamily,
    fontSize: 24,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 32,
  },
  headlineSmall: {
    fontFamily: outfitFamily,
    fontSize: 24,
    fontWeight: '500' as TextStyle['fontWeight'],
    lineHeight: 32,
  },
  titleLarge: {
    fontFamily: outfitFamily,
    fontSize: 22,
    fontWeight: '500' as TextStyle['fontWeight'],
    lineHeight: 28,
  },
  titleMedium: {
    fontFamily: readexProFamily,
    fontSize: 18,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 24,
  },
  titleSmall: {
    fontFamily: readexProFamily,
    fontSize: 16,
    fontWeight: '500' as TextStyle['fontWeight'],
    lineHeight: 22,
  },
  labelLarge: {
    fontFamily: readexProFamily,
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 22,
  },
  labelMedium: {
    fontFamily: readexProFamily,
    fontSize: 14,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 20,
  },
  labelSmall: {
    fontFamily: readexProFamily,
    fontSize: 12,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 16,
  },
  bodyLarge: {
    fontFamily: readexProFamily,
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 24,
  },
  bodyMedium: {
    fontFamily: readexProFamily,
    fontSize: 14,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 20,
  },
  bodySmall: {
    fontFamily: readexProFamily,
    fontSize: 12,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 16,
  },
};

export const textStyles = {
  h1: typography.displaySmall,
  h2: typography.headlineLarge,
  h3: typography.headlineMedium,
  h4: typography.titleLarge,
  body: typography.bodyMedium,
  bodySmall: typography.bodySmall,
  caption: typography.labelSmall,
  button: typography.titleSmall,
};

export type Typography = typeof typography;
