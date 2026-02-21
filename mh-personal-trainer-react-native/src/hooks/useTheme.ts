import { useMemo } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import { useAppStore } from '../store/appStore';
import { theme, getThemeColors, ColorScheme, ThemeColors } from '../theme';

export function useTheme() {
  const deviceScheme = useDeviceColorScheme();
  const { colorScheme, setColorScheme, toggleColorScheme } = useAppStore();

  const effectiveScheme: ColorScheme = colorScheme || (deviceScheme as ColorScheme) || 'light';

  const colors: ThemeColors = useMemo(() => getThemeColors(effectiveScheme), [effectiveScheme]);

  return {
    colors,
    colorScheme: effectiveScheme,
    isDark: effectiveScheme === 'dark',
    isLight: effectiveScheme === 'light',
    setColorScheme,
    toggleColorScheme,
    typography: theme.typography,
    textStyles: theme.textStyles,
    spacing: theme.spacing,
    borderRadius: theme.borderRadius,
    shadows: theme.shadows,
    fontFamilies: theme.fontFamilies,
  };
}

export function useColors(): ThemeColors {
  const { colors } = useTheme();
  return colors;
}
