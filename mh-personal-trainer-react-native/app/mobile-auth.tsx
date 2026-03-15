import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { consumeMobileAuthHandoff } from '../src/services/mobileAuthHandoff';

const readParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Falha ao concluir o login no app.';
};

export default function MobileAuthScreen() {
  const params = useLocalSearchParams<{ handoff?: string | string[] }>();
  const handoffId = useMemo(() => readParam(params.handoff).trim(), [params.handoff]);
  const { loginWithCustomToken } = useAuth();
  const { colors, typography } = useTheme();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    if (!handoffId) {
      setError('Link invalido. Volte ao convite e tente novamente.');
      return () => {
        active = false;
      };
    }

    void (async () => {
      try {
        const handoffResult = await consumeMobileAuthHandoff(handoffId);
        if (!active) return;

        const result = await loginWithCustomToken(handoffResult.customToken, 'web-handoff');
        if (!active) return;

        if (!result.success) {
          setError(result.error || 'Falha ao entrar no app.');
          return;
        }

        router.replace('/(tabs)');
      } catch (authError) {
        if (!active) return;
        setError(getErrorMessage(authError));
      }
    })();

    return () => {
      active = false;
    };
  }, [handoffId, loginWithCustomToken]);

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.87, y: 0 }}
      end={{ x: 0.13, y: 1 }}
      style={styles.container}
    >
      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
        <Text style={[styles.title, { color: colors.primaryText }, typography.displaySmall]}>
          Entrando no app
        </Text>
        {!error ? (
          <>
            <Text style={[styles.subtitle, { color: colors.secondaryText }, typography.bodyMedium]}>
              Validando seu acesso e sincronizando a sessao do navegador com o app.
            </Text>
            <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
          </>
        ) : (
          <>
            <Text style={[styles.subtitle, { color: colors.error }, typography.bodyMedium]}>
              {error}
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={() => router.replace('/(auth)/login')}
            >
              <Text style={[styles.buttonText, { color: colors.info }, typography.titleSmall]}>
                Ir para login
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.alternate }]}
              onPress={() => router.replace('/')}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: colors.primaryText },
                  typography.titleSmall,
                ]}
              >
                Tentar novamente
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    textAlign: 'center',
  },
  loader: {
    marginTop: 24,
  },
  button: {
    width: '100%',
    marginTop: 24,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonText: {
    fontWeight: '700',
  },
  secondaryButton: {
    width: '100%',
    marginTop: 12,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    fontWeight: '600',
  },
});
