import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { Loading } from '../src/components/common';
import { useTheme } from '../src/hooks/useTheme';

export default function SplashScreen() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const hasNavigated = useRef(false);
  const { colors, typography, spacing, isDark } = useTheme();
  const versionLabel = '8.9.42+111';

  useEffect(() => {
    const navigate = () => {
      if (hasNavigated.current) return;
      
      if (!isLoading) {
        hasNavigated.current = true;
        if (isAuthenticated) {
          router.replace('/(tabs)');
        } else {
          router.replace('/(auth)/login');
        }
      }
    };

    const timer = setTimeout(() => {
      navigate();
    }, 1500);

    if (!isLoading) {
      const immediateTimer = setTimeout(navigate, 100);
      return () => {
        clearTimeout(timer);
        clearTimeout(immediateTimer);
      };
    }

    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading]);

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.87, y: 0 }}
      end={{ x: 0.13, y: 1 }}
      style={[styles.container, { padding: spacing.lg }]}
    >
      <View style={[styles.logoContainer, { marginBottom: spacing['3xl'] }]}>
        <Image
          source={
            isDark
              ? require('../assets/images/mh_personal_branco.png')
              : require('../assets/images/PT_transparente.png')
          }
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>
      <Loading size="large" />
      <View style={[styles.footer, { bottom: spacing['3xl'] }]}>
        <Text style={[styles.version, { color: colors.secondaryText }, typography.labelMedium]}>
          {versionLabel}
        </Text>
        <Text style={[styles.version, { color: colors.secondaryText }, typography.labelSmall]}>
          Desenvolvido por Nagazaki Software
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoImage: {
    width: 220,
    height: 220,
  },
  version: {
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    alignItems: 'center',
  },
});

