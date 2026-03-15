import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, usePathname, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../store/authStore';

const NAVBAR_SEGMENTS = new Set<string | undefined>([
  undefined,
  'index',
  'workouts',
  'nutrition',
  'evaluations',
  'chat',
  'profile',
]);

export function FloatingHomeButton() {
  const { colors, borderRadius, spacing, typography, shadows } = useTheme();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const segments = useSegments();

  const firstSegment = segments[0];
  const secondSegment = segments[1];
  const isNavbarScreen =
    firstSegment === '(tabs)' && NAVBAR_SEGMENTS.has(secondSegment);
  const isSplashScreen = pathname === '/';
  const isLoginScreen = !user && pathname === '/login';

  if (isNavbarScreen || isSplashScreen || isLoginScreen) {
    return null;
  }

  const homeRoute = user ? '/(tabs)' : '/(auth)/login';

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Pressable
        accessibilityLabel="Ir para a tela inicial"
        accessibilityRole="button"
        onPress={() => router.replace(homeRoute as any)}
        style={({ pressed }) => [
          styles.button,
          shadows.md,
          {
            top: insets.top + spacing.md,
            right: spacing.md,
            backgroundColor: colors.secondaryBackground,
            borderColor: colors.border,
            borderRadius: borderRadius.full,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
      >
        <Ionicons name="home-outline" size={18} color={colors.primary} />
        <Text style={[typography.labelMedium, { color: colors.primaryText }]}>
          Inicio
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  button: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
});
