import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Image, useColorScheme, TextInput } from 'react-native';
import { showAlert } from '@utils/alert';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';

export default function PersonalLoginScreen() {
  const { loginAsPersonal } = useAuth();
  const { colors } = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email) newErrors.email = 'Email é obrigatório';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Email inválido';
    if (!password) newErrors.password = 'Senha é obrigatória';
    else if (password.length < 6) newErrors.password = 'Senha deve ter pelo menos 6 caracteres';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    
    setLoading(true);
    const result = await loginAsPersonal(email, password);
    setLoading(false);

    if (result.success) {
      router.replace('/(tabs)');
    } else {
      showAlert('Erro', result.error || 'Erro ao fazer login');
    }
  };

  const themeColors = {
    background: isDark ? '#1a1a2e' : '#f5f5f7',
    cardBackground: isDark ? '#16213e' : '#ffffff',
    text: isDark ? '#ffffff' : '#1a1a2e',
    textSecondary: isDark ? '#a0a0a0' : '#666666',
    border: isDark ? '#2a2a4e' : '#e0e0e0',
    inputBackground: isDark ? '#1a1a2e' : '#f5f5f7',
    gradientStart: isDark ? '#1a1a2e' : '#f5f5f7',
    gradientEnd: isDark ? '#0f0f1e' : '#e8e8ec',
  };

  return (
    <LinearGradient
      colors={[themeColors.gradientStart, themeColors.gradientEnd]}
      start={{ x: 0.87, y: 0 }}
      end={{ x: 0.13, y: 1 }}
      style={styles.container}
    >
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
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={themeColors.text} />
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

          <View style={[styles.card, { backgroundColor: themeColors.cardBackground }]}>
            <View style={styles.titleRow}>
              <Ionicons name="school" size={28} color={colors.primary} />
              <Text style={[styles.title, { color: themeColors.text }]}>
                Área do Personal
              </Text>
            </View>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
              Acesse sua conta de Personal Trainer para gerenciar seus alunos.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                E-mail
              </Text>
              <View style={[styles.inputWrapper, { 
                backgroundColor: themeColors.inputBackground,
                borderColor: errors.email ? '#ef4444' : themeColors.border,
              }]}>
                <TextInput
                  placeholder="personal@email.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.input, { color: themeColors.text }]}
                  placeholderTextColor={themeColors.textSecondary}
                />
              </View>
              {errors.email && (
                <Text style={styles.errorText}>{errors.email}</Text>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                Senha
              </Text>
              <View style={[styles.inputWrapper, { 
                backgroundColor: themeColors.inputBackground,
                borderColor: errors.password ? '#ef4444' : themeColors.border,
              }]}>
                <TextInput
                  placeholder="••••••••"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  style={[styles.input, { color: themeColors.text }]}
                  placeholderTextColor={themeColors.textSecondary}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={24}
                    color={themeColors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              {errors.password && (
                <Text style={styles.errorText}>{errors.password}</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.loginButton, { backgroundColor: colors.primary }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <Text style={styles.loginButtonText}>Carregando...</Text>
              ) : (
                <Text style={styles.loginButtonText}>Entrar como Personal</Text>
              )}
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: themeColors.textSecondary }]}>
                Ainda não é Personal?{' '}
              </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register-personal')}>
                <Text style={[styles.footerLink, { color: colors.primary }]}>
                  Cadastre-se
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/(auth)/forgot-password')}
              style={styles.forgotPassword}
            >
              <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>
                Esqueci minha senha
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
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
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 32,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  logoContainer: {
    width: '100%',
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    marginTop: 30,
  },
  logo: {
    width: 300,
    height: 200,
  },
  card: {
    width: '100%',
    maxWidth: 570,
    borderRadius: 12,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
  },
  eyeIcon: {
    padding: 4,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  loginButton: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  footerText: {
    fontSize: 14,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  forgotPassword: {
    alignItems: 'center',
    marginTop: 16,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
