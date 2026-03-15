import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { applyInviteCodeToStudent, readInviteCodeParam } from '../src/services/inviteLinking';
import { firestoreService, type PersonalProfile } from '../src/services/firestoreService';

export default function InviteLinkScreen() {
  const params = useLocalSearchParams<{
    code?: string | string[];
    codigo?: string | string[];
    codigoPersonal?: string | string[];
    personalCode?: string | string[];
  }>();
  const inviteCode = useMemo(
    () =>
      readInviteCodeParam(
        params.code ?? params.codigo ?? params.codigoPersonal ?? params.personalCode
      ),
    [params.code, params.codigo, params.codigoPersonal, params.personalCode]
  );
  const { user, role, isAuthenticated, isLoading, refreshUser } = useAuth();
  const { colors, typography } = useTheme();
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState('');
  const [linking, setLinking] = useState(false);
  const attemptedLinkRef = useRef(false);

  useEffect(() => {
    let active = true;

    if (!inviteCode) {
      setProfile(null);
      setProfileLoading(false);
      setError('Codigo do convite nao informado.');
      return () => {
        active = false;
      };
    }

    setProfileLoading(true);
    setError('');
    void (async () => {
      const result = await firestoreService.getPersonalProfileByCode(inviteCode);
      if (!active) return;

      if (!result) {
        setProfile(null);
        setError('Personal nao encontrado.');
      } else {
        setProfile(result);
      }
      setProfileLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [inviteCode]);

  useEffect(() => {
    let active = true;

    if (!isAuthenticated || !user?.uid || !inviteCode || isLoading || attemptedLinkRef.current) {
      return () => {
        active = false;
      };
    }

    attemptedLinkRef.current = true;
    setLinking(true);
    setError('');

    void (async () => {
      const result = await applyInviteCodeToStudent({
        uid: user.uid,
        code: inviteCode,
        displayName: user.displayName,
        email: user.email,
        currentCode: user.codigoPersonal,
        professorAccount: user.professorAccount || role === 'professor' || role === 'personal',
        admin: user.admin || role === 'admin',
      });

      if (!active) return;

      if (!result.success) {
        setLinking(false);
        setError(result.error);
        attemptedLinkRef.current = false;
        return;
      }

      await refreshUser?.();
      if (!active) return;
      router.replace('/(tabs)');
    })();

    return () => {
      active = false;
    };
  }, [
    inviteCode,
    isAuthenticated,
    isLoading,
    refreshUser,
    role,
    user?.admin,
    user?.codigoPersonal,
    user?.displayName,
    user?.email,
    user?.professorAccount,
    user?.uid,
  ]);

  const goToLogin = () => {
    if (inviteCode) {
      router.push(`/(auth)/login?inviteCode=${encodeURIComponent(inviteCode)}` as any);
      return;
    }
    router.push('/(auth)/login');
  };

  const goToRegister = () => {
    if (inviteCode) {
      router.push(`/(auth)/register?inviteCode=${encodeURIComponent(inviteCode)}` as any);
      return;
    }
    router.push('/(auth)/register');
  };

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.87, y: 0 }}
      end={{ x: 0.13, y: 1 }}
      style={styles.container}
    >
      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
        <Text style={[styles.kicker, { color: colors.primary }, typography.labelMedium]}>
          Convite
        </Text>
        <Text style={[styles.title, { color: colors.primaryText }, typography.displaySmall]}>
          {isAuthenticated ? 'Abrindo seu convite' : 'Treine com seu personal no app'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }, typography.bodyMedium]}>
          {isAuthenticated
            ? 'Estamos vinculando seu acesso ao personal que enviou este convite.'
            : 'Entre ou crie sua conta no app para ativar esse convite automaticamente.'}
        </Text>

        {profileLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.secondaryText }, typography.bodyMedium]}>
              Carregando dados do personal...
            </Text>
          </View>
        )}

        {isLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.secondaryText }, typography.bodyMedium]}>
              Verificando seu acesso no app...
            </Text>
          </View>
        )}

        {profile && (
          <View style={[styles.profileCard, { borderColor: colors.alternate }]}>
            <Text style={[styles.profileName, { color: colors.primaryText }, typography.titleMedium]}>
              {profile.displayName}
            </Text>
            <Text style={[styles.profileMeta, { color: colors.secondaryText }, typography.bodyMedium]}>
              {profile.especializacao || 'Personal trainer'}
            </Text>
            <Text style={[styles.profileMeta, { color: colors.secondaryText }, typography.bodyMedium]}>
              Codigo {profile.codigoPersonal ?? inviteCode}
            </Text>
          </View>
        )}

        {linking && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.secondaryText }, typography.bodyMedium]}>
              Vinculando seu perfil ao convite...
            </Text>
          </View>
        )}

        {error ? (
          <Text style={[styles.error, { color: colors.error }, typography.bodyMedium]}>{error}</Text>
        ) : null}

        {!isLoading && !isAuthenticated ? (
          <>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              onPress={goToLogin}
            >
              <Text style={[styles.primaryButtonText, { color: colors.info }, typography.titleSmall]}>
                Entrar no app
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.alternate }]}
              onPress={goToRegister}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: colors.primaryText },
                  typography.titleSmall,
                ]}
              >
                Criar conta
              </Text>
            </TouchableOpacity>
          </>
        ) : error ? (
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.alternate }]}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                { color: colors.primaryText },
                typography.titleSmall,
              ]}
            >
              Ir para o app
            </Text>
          </TouchableOpacity>
        ) : null}
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
  },
  kicker: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    marginTop: 8,
  },
  subtitle: {
    marginTop: 12,
  },
  profileCard: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  profileName: {
    fontWeight: '700',
  },
  profileMeta: {
    marginTop: 6,
  },
  loadingRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    marginLeft: 10,
  },
  error: {
    marginTop: 18,
  },
  primaryButton: {
    marginTop: 24,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    fontWeight: '700',
  },
  secondaryButton: {
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
