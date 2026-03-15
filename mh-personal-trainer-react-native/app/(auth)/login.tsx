import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '@utils/alert';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import {
  getGoogleNativeSignInErrorMessage,
  getGoogleNativeRuntimeUnavailableMessage,
  googleAuthConfig,
  isGoogleAuthConfigured,
  isGoogleNativeRuntimeAvailable,
  signInWithGoogleNative,
} from '../../src/services/googleAuth';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { login, loginWithGoogle, loginWithApple } = useAuth();
  const { colors, isDark, typography } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const hasGoogleConfig = isGoogleAuthConfigured();

  const [googleRequest, googleResponse, promptGoogleAsync] =
    Google.useAuthRequest(googleAuthConfig);

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email) newErrors.email = 'Email e obrigatorio';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Email invalido';
    if (!password) newErrors.password = 'Senha e obrigatoria';
    else if (password.length < 6) newErrors.password = 'Senha deve ter pelo menos 6 caracteres';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      router.replace('/(tabs)');
    } else {
      showAlert('Erro', result.error || 'Erro ao fazer login');
    }
  };

  const handleCreatePersonal = () => {
    router.push('/(auth)/register-personal');
  };

  const handleGoogleLogin = async () => {
    if (!hasGoogleConfig) {
      showAlert(
        'Google nao configurado',
        'Defina os client IDs do Google no .env para habilitar o login.'
      );
      return;
    }

    if (Platform.OS === 'android') {
      if (!isGoogleNativeRuntimeAvailable()) {
        showAlert('Google', getGoogleNativeRuntimeUnavailableMessage());
        return;
      }

      setSocialLoading(true);
      try {
        const tokens = await signInWithGoogleNative();
        if (!tokens) {
          return;
        }

        const result = await loginWithGoogle(tokens.idToken, tokens.accessToken);
        if (result.success) {
          router.replace('/(tabs)');
        } else {
          showAlert('Erro', result.error || 'Erro ao fazer login com Google.');
        }
      } catch (error: unknown) {
        const message = getGoogleNativeSignInErrorMessage(error);
        if (message) {
          showAlert('Erro', message);
        }
      } finally {
        setSocialLoading(false);
      }
      return;
    }

    if (!googleRequest) {
      showAlert('Google', 'Login com Google nao esta pronto. Tente novamente.');
      return;
    }

    setSocialLoading(true);
    try {
      await promptGoogleAsync();
    } catch (error: any) {
      setSocialLoading(false);
      showAlert('Erro', error?.message || 'Falha ao iniciar login com Google.');
    }
  };

  const handleAppleLogin = async () => {
    if (Platform.OS !== 'ios') return;
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      showAlert('Apple', 'Login com Apple nao esta disponivel neste dispositivo.');
      return;
    }

    setSocialLoading(true);
    try {
      const rawNonce = `${Math.random().toString(36).slice(2)}${Math.random()
        .toString(36)
        .slice(2)}`;
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) {
        throw new Error('Token da Apple nao retornou.');
      }

      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      const result = await loginWithApple(credential.identityToken, rawNonce, {
        displayName: fullName || undefined,
        email: credential.email || undefined,
      });
      setSocialLoading(false);

      if (result.success) {
        router.replace('/(tabs)');
      } else {
        showAlert('Erro', result.error || 'Erro ao fazer login com Apple.');
      }
    } catch (error: any) {
      setSocialLoading(false);
      showAlert('Erro', error?.message || 'Falha ao iniciar login com Apple.');
    }
  };

  useEffect(() => {
    const handleGoogleResponse = async () => {
      if (Platform.OS === 'android' || !googleResponse) return;
      if (googleResponse.type !== 'success') {
        setSocialLoading(false);
        return;
      }

      const idToken = googleResponse.params?.id_token as string | undefined;
      const accessToken = googleResponse.params?.access_token as string | undefined;
      if (!idToken && !accessToken) {
        setSocialLoading(false);
        showAlert('Google', 'Nao foi possivel obter o token de acesso.');
        return;
      }

      const result = await loginWithGoogle(idToken, accessToken);
      setSocialLoading(false);
      if (result.success) {
        router.replace('/(tabs)');
      } else {
        showAlert('Erro', result.error || 'Erro ao fazer login com Google.');
      }
    };

    handleGoogleResponse();
  }, [googleResponse, loginWithGoogle]);

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
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
            <Text
              style={[styles.title, { color: colors.primaryText, ...typography.displaySmall }]}
            >
              Entrar
            </Text>
            <Text
              style={[styles.subtitle, { color: colors.secondaryText, ...typography.bodyMedium }]}
            >
              Entre com seu e-mail e senha que voce criou.
            </Text>

            <View style={styles.inputContainer}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: colors.secondaryText, ...typography.labelMedium },
                ]}
              >
                E-mail
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.primaryBackground,
                    borderColor: errors.email ? colors.error : colors.alternate,
                  },
                ]}
              >
                <TextInput
                  placeholder="seu@email.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.input, { color: colors.primaryText, ...typography.bodyMedium }]}
                  placeholderTextColor={colors.secondaryText}
                />
              </View>
              {errors.email && (
                <Text style={[styles.errorText, { color: colors.error }]}>{errors.email}</Text>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: colors.secondaryText, ...typography.labelMedium },
                ]}
              >
                Senha
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.primaryBackground,
                    borderColor: errors.password ? colors.error : colors.alternate,
                  },
                ]}
              >
                <TextInput
                  placeholder="********"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  style={[styles.input, { color: colors.primaryText, ...typography.bodyMedium }]}
                  placeholderTextColor={colors.secondaryText}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={24}
                    color={colors.secondaryText}
                  />
                </TouchableOpacity>
              </View>
              {errors.password && (
                <Text style={[styles.errorText, { color: colors.error }]}>{errors.password}</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.loginButton, { backgroundColor: colors.primary }]}
              onPress={handleLogin}
              disabled={loading || socialLoading}
            >
              <Text style={[styles.loginButtonText, { color: colors.info }]}>
                {loading ? 'Carregando...' : 'Entrar'}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.orText, { color: colors.secondaryText, ...typography.labelMedium }]}>
              Ou logue com
            </Text>

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.secondary,
                },
              ]}
              onPress={handleCreatePersonal}
              disabled={loading || socialLoading}
            >
              <Ionicons name="school-outline" size={20} color={colors.info} />
              <Text style={[styles.secondaryButtonText, { color: colors.info }]}>
                Criar conta de personal
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                {
                  backgroundColor: colors.secondaryBackground,
                  borderColor: colors.alternate,
                },
              ]}
              onPress={handleGoogleLogin}
              disabled={loading || socialLoading}
            >
              <Ionicons name="logo-google" size={20} color={colors.primaryText} />
              <Text style={[styles.secondaryButtonText, { color: colors.primaryText }]}>
                {socialLoading ? 'Conectando...' : 'Continue com o Google'}
              </Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  {
                    backgroundColor: colors.secondaryBackground,
                    borderColor: colors.alternate,
                  },
                ]}
                onPress={handleAppleLogin}
                disabled={loading || socialLoading}
              >
                <Ionicons name="logo-apple" size={20} color={colors.primaryText} />
                <Text style={[styles.secondaryButtonText, { color: colors.primaryText }]}>
                  {socialLoading ? 'Conectando...' : 'Continue com a Apple'}
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: colors.secondaryText, ...typography.bodyMedium }]}>
                Nao tem uma conta?{' '}
              </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text style={[styles.footerLink, { color: colors.primary, ...typography.titleSmall }]}>
                  Cadastre-se
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/(auth)/forgot-password')}
              style={styles.forgotPassword}
            >
              <Text
                style={[
                  styles.forgotPasswordText,
                  { color: colors.primary, ...typography.labelMedium },
                ]}
              >
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
    paddingTop: 70,
    paddingBottom: 32,
    alignItems: 'center',
  },
  logoContainer: {
    width: '100%',
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
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
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
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
  },
  eyeIcon: {
    padding: 4,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  loginButton: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  orText: {
    textAlign: 'center',
    marginBottom: 16,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 12,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  footerText: {},
  footerLink: {
    fontWeight: '600',
  },
  forgotPassword: {
    alignItems: 'center',
    marginTop: 16,
  },
  forgotPasswordText: {
    fontWeight: '500',
  },
});
