import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Image } from 'react-native';
import { showAlert } from '@utils/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input } from '../../src/components/common';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { readInviteCodeParam } from '../../src/services/inviteLinking';
import { spacing, borderRadius } from '../../src/theme';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { register } = useAuth();
  const params = useLocalSearchParams<{ inviteCode?: string | string[] }>();
  const inviteCode = readInviteCodeParam(params.inviteCode);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name) newErrors.name = 'Nome é obrigatório';
    if (!email) newErrors.email = 'Email é obrigatório';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Email inválido';
    if (!password) newErrors.password = 'Senha é obrigatória';
    else if (password.length < 6) newErrors.password = 'Senha deve ter pelo menos 6 caracteres';
    if (password !== confirmPassword) newErrors.confirmPassword = 'Senhas não coincidem';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;

    setLoading(true);
    const numericInviteCode = inviteCode ? Number(inviteCode) : null;
    const extraData =
      numericInviteCode && Number.isFinite(numericInviteCode) && numericInviteCode > 0
        ? { codigoPersonal: numericInviteCode }
        : undefined;
    const result = await register(email, password, name, extraData);
    setLoading(false);

    if (result.success) {
      router.replace('/(tabs)');
    } else {
      showAlert('Erro', result.error || 'Erro ao cadastrar');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.logoContainer}>
            <Image
              source={
                isDark
                  ? require('../../assets/images/mh_personal_branco.png')
                  : require('../../assets/images/PT_transparente.png')
              }
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              Criar Conta
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {inviteCode
                ? `Preencha seus dados para entrar com o convite ${inviteCode}`
                : 'Preencha seus dados para se cadastrar'}
            </Text>

            <View style={styles.form}>
            <Input
              label={t('auth.name')}
              placeholder="Seu nome completo"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              error={errors.name}
              icon="person-outline"
            />

            <Input
              label={t('auth.email')}
              placeholder="seu@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
              icon="mail-outline"
            />

            <Input
              label={t('auth.password')}
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={errors.password}
              icon="lock-closed-outline"
            />

            <Input
              label={t('auth.confirmPassword')}
              placeholder="••••••••"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              error={errors.confirmPassword}
              icon="lock-closed-outline"
            />

              <Button
                title="Cadastrar"
                onPress={handleRegister}
                loading={loading}
                fullWidth
                size="large"
                style={{ marginTop: spacing.md }}
              />

              <View style={styles.loginContainer}>
                <Text style={[styles.loginText, { color: colors.textSecondary }]}>
                  Já tem uma conta?{' '}
                </Text>
                <TouchableOpacity onPress={() => router.back()}>
                  <Text style={[styles.loginLink, { color: colors.primary }]}>
                    Entrar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xl,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    zIndex: 10,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: spacing['2xl'],
    marginBottom: spacing.xl,
  },
  logo: {
    width: 180,
    height: 60,
  },
  card: {
    width: '100%',
    maxWidth: 450,
    padding: spacing.xl,
    borderRadius: borderRadius.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  form: {
    width: '100%',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  loginText: {
    fontSize: 14,
  },
  loginLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});
