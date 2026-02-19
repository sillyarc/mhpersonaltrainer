import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Image } from 'react-native';
import { showAlert } from '@utils/alert';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input } from '../../src/components/common';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { spacing, borderRadius } from '../../src/theme';

export default function ForgotPasswordScreen() {
  const { colors, isDark } = useTheme();
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const validate = () => {
    if (!email) {
      setError('Email é obrigatório');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Email inválido');
      return false;
    }
    setError('');
    return true;
  };

  const handleResetPassword = async () => {
    if (!validate()) return;

    setLoading(true);
    const result = await resetPassword(email);
    setLoading(false);

    if (result.success) {
      setSent(true);
    } else {
      showAlert('Erro', result.error || 'Erro ao enviar email');
    }
  };

  if (sent) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.successContainer}>
          <View style={[styles.successIcon, { backgroundColor: colors.success + '20' }]}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          </View>
          <Text style={[styles.successTitle, { color: colors.text }]}>
            Email Enviado!
          </Text>
          <Text style={[styles.successText, { color: colors.textSecondary }]}>
            Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
          </Text>
          <Button
            title="Voltar ao Login"
            onPress={() => router.back()}
            style={{ marginTop: spacing.xl }}
          />
        </View>
      </View>
    );
  }

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
              Recuperar Senha
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Digite seu email para receber o link de redefinição
            </Text>

            <View style={styles.form}>
              <Input
                label="E-mail"
                placeholder="seu@email.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                error={error}
                icon="mail-outline"
              />

              <Button
                title="Enviar Link"
                onPress={handleResetPassword}
                loading={loading}
                fullWidth
                size="large"
                style={{ marginTop: spacing.md }}
              />

              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.backLink}
              >
                <Text style={[styles.backLinkText, { color: colors.primary }]}>
                  Voltar para o Login
                </Text>
              </TouchableOpacity>
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
  backLink: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: spacing.md,
  },
  successText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: spacing.md,
    maxWidth: 300,
  },
});
