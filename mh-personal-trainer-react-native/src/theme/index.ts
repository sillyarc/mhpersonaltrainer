import { lightColors, darkColors, getColors, ThemeColors, ColorScheme } from './colors';
import { typography, textStyles, fontFamilies } from './typography';
import { spacing, borderRadius, shadows } from './spacing';

export const theme = {
  lightColors,
  darkColors,
  typography,
  textStyles,
  fontFamilies,
  spacing,
  borderRadius,
  shadows,
};

export type Theme = typeof theme;

export function getThemeColors(scheme: ColorScheme): ThemeColors {
  return getColors(scheme);
}

export { lightColors, darkColors, typography, textStyles, fontFamilies, spacing, borderRadius, shadows };
export type { ColorScheme, ThemeColors };
