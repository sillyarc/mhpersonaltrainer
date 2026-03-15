import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Linking } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import {
  API_BASE_URL,
  STRIPE_PAYMENT_LINK_ANUAL,
  STRIPE_PAYMENT_LINK_BIMESTRAL,
  STRIPE_PAYMENT_LINK_MENSAL,
  STRIPE_PAYMENT_LINK_SEMESTRAL,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_RETURN_URL,
  createSubscription,
  createSetupIntent,
  extractSubscriptionDetails,
  formatCurrency,
  isStripeReady,
} from '../../src/services/payments';

const stripePaymentLinks = {
  mensal: STRIPE_PAYMENT_LINK_MENSAL,
  bimestral: STRIPE_PAYMENT_LINK_BIMESTRAL,
  semestral: STRIPE_PAYMENT_LINK_SEMESTRAL,
  anual: STRIPE_PAYMENT_LINK_ANUAL,
};
const PAYMENT_LINK_ENV_BY_PLAN_ID: Record<string, string> = {
  mensal: 'EXPO_PUBLIC_STRIPE_PAYMENT_LINK_MENSAL',
  bimestral: 'EXPO_PUBLIC_STRIPE_PAYMENT_LINK_BIMESTRAL',
  semestral: 'EXPO_PUBLIC_STRIPE_PAYMENT_LINK_SEMESTRAL',
  anual: 'EXPO_PUBLIC_STRIPE_PAYMENT_LINK_ANUAL',
};

const localPlans = [
  {
    id: 'mensal',
    name: 'Mensal',
    price: 30,
    intervalLabel: 'por mes',
    description: 'Pagamento recorrente mensal',
    priceId: 'price_1RjKmIP3w93hGHYvwnQ25m13',
    paymentLink: stripePaymentLinks.mensal,
    features: ['Acesso completo ao app', 'Historico de treinos', 'Suporte por email', 'Chat com IA'],
    highlight: true,
  },
  {
    id: 'bimestral',
    name: 'Bimestral',
    price: 54,
    intervalLabel: 'a cada 2 meses',
    description: 'Pagamento a cada 2 meses',
    priceId: 'price_1RQ5T8P3w93hGHYvCfnTTdnp',
    paymentLink: stripePaymentLinks.bimestral,
    features: ['Acesso completo ao app', 'Historico de treinos', 'Suporte por email', 'Chat com IA'],
  },
  {
    id: 'semestral',
    name: 'Semestral',
    price: 150,
    intervalLabel: 'a cada 6 meses',
    description: 'Pagamento a cada 6 meses',
    priceId: 'price_1RQ5T8P3w93hGHYve8VegKff',
    paymentLink: stripePaymentLinks.semestral,
    features: ['Acesso completo ao app', 'Historico de treinos', 'Suporte por email', 'Chat com IA'],
  },
  {
    id: 'anual',
    name: 'Anual',
    price: 300,
    intervalLabel: 'por ano',
    description: 'Pagamento anual',
    priceId: 'price_1RQ5T8P3w93hGHYvld6PCdaY',
    paymentLink: stripePaymentLinks.anual,
    features: ['Acesso completo ao app', 'Historico de treinos', 'Suporte por email', 'Chat com IA'],
  },
];

export default function PlanoAssinaturaScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { user } = useAuthStore();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const isExpoGo =
    Constants.appOwnership === 'expo' ||
    (Constants as { executionEnvironment?: string }).executionEnvironment === 'storeClient';
  const stripeReady = isStripeReady();

  const openPaymentLink = async (url?: string) => {
    if (!url) return false;
    const separator = url.includes('?') ? '&' : '?';
    const prefilledEmail = user?.email
      ? `${separator}prefilled_email=${encodeURIComponent(user.email)}`
      : '';
    const finalUrl = prefilledEmail ? `${url}${prefilledEmail}` : url;
    await Linking.openURL(finalUrl);
    return true;
  };

  const getExpoGoPaymentHint = (planId?: string) => {
    const envKey = (planId && PAYMENT_LINK_ENV_BY_PLAN_ID[planId]) || '';
    if (envKey) {
      return `Configure ${envKey} no .env ou em expo.extra para abrir o checkout no navegador pelo Expo Go.`;
    }
    return 'Configure EXPO_PUBLIC_STRIPE_PAYMENT_LINK_* no .env ou em expo.extra para abrir o checkout no navegador pelo Expo Go.';
  };

  const handleSelectPlan = async (plan: (typeof localPlans)[number]) => {
    if (!user?.uid || !user.email || !user.displayName) {
      showAlert('Atencao', 'Complete seu perfil antes de assinar.');
      return;
    }
    if (Platform.OS === 'web') {
      if (await openPaymentLink(plan.paymentLink)) {
        return;
      }
      showAlert('Stripe', 'Pagamento via Stripe não est? disponível no web. Use o app mobile.');
      return;
    }
    if (isExpoGo) {
      if (await openPaymentLink(plan.paymentLink)) {
        return;
      }
      showAlert(
        'Cartao indisponivel no Expo Go',
        `${getExpoGoPaymentHint(plan.id)} Se preferir cadastrar cartao dentro do app, rode um Development Build (expo run:ios/android + expo start --dev-client).`
      );
      return;
    }
    if (!stripeReady || !STRIPE_PUBLISHABLE_KEY) {
      showAlert(
        'Stripe não configurado',
        `Defina EXPO_PUBLIC_STRIPE_FUNCTIONS_URL (ou EXPO_PUBLIC_API_URL com /api/payments) e EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY no .env ou em expo.extra para ativar as assinaturas. API atual: ${API_BASE_URL || 'nao definida'}.`
      );
      return;
    }
    setLoadingPlan(plan.id);
    try {
      const result = await createSubscription(user.uid, user.email, user.displayName, plan.priceId);
      if (result.error) {
        throw new Error(result.error);
      }
      const subscriptionData = (result.data || {}) as any;
      const details = extractSubscriptionDetails(subscriptionData);
      const backendMessage =
        subscriptionData?.message || subscriptionData?.details || subscriptionData?.error;
      const status = details.status || subscriptionData?.status;
      const isTrial = status === 'trialing' || /gratis|grátis|trial/i.test(String(backendMessage ?? ''));
      if (!details.clientSecret) {
        if (isTrial) {
          const setupIntentResult = await createSetupIntent(
            user.email,
            user.displayName,
            details.customerId
          );
          if (setupIntentResult.error || !setupIntentResult.data?.setupIntentClientSecret) {
            throw new Error(
              `Teste de 7 dias ativado, mas nao foi possivel abrir o cadastro do cartao: ${
                setupIntentResult.error || 'SetupIntent ausente'
              }.`
            );
          }

          const setupParams: any = {
            setupIntentClientSecret: setupIntentResult.data.setupIntentClientSecret,
            merchantDisplayName: 'MH Personal Trainer',
            returnURL: STRIPE_RETURN_URL,
            googlePay: { merchantCountryCode: 'BR', testEnv: true },
            applePay: { merchantCountryCode: 'BR' },
          };
          if (setupIntentResult.data.customerId && setupIntentResult.data.ephemeralKey) {
            setupParams.customerId = setupIntentResult.data.customerId;
            setupParams.customerEphemeralKeySecret = setupIntentResult.data.ephemeralKey;
          }

          const initSetup = await initPaymentSheet(setupParams);
          if (initSetup.error) {
            throw new Error(initSetup.error.message);
          }
          const presentSetup = await presentPaymentSheet();
          if (presentSetup.error) {
            throw new Error(
              `Teste de 7 dias ativado, mas o cartao nao foi salvo: ${presentSetup.error.message}`
            );
          }

          showAlert('Sucesso', 'Cartao salvo com sucesso.');
          return;
        }
        throw new Error(
          backendMessage ? `Erro no backend: ${backendMessage}` : 'Resposta do Stripe incompleta. Tente novamente.'
        );
      }

      const paymentSheetParams: any = {
        paymentIntentClientSecret: details.clientSecret,
        merchantDisplayName: 'MH Personal Trainer',
        allowsDelayedPaymentMethods: true,
        returnURL: STRIPE_RETURN_URL,
        googlePay: { merchantCountryCode: 'BR', testEnv: true },
        applePay: { merchantCountryCode: 'BR' },
      };
      if (details.customerId && details.ephemeralKey) {
        paymentSheetParams.customerId = details.customerId;
        paymentSheetParams.customerEphemeralKeySecret = details.ephemeralKey;
      }

      const initResult = await initPaymentSheet(paymentSheetParams);
      if (initResult.error) {
        throw new Error(initResult.error.message);
      }
      const presentResult = await presentPaymentSheet();
      if (presentResult.error) {
        throw new Error(presentResult.error.message);
      }

      showAlert('Sucesso', 'Assinatura confirmada com sucesso.');
    } catch (error: any) {
      showAlert('Erro', error.message || 'Nao foi possivel criar a assinatura.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.9, y: 0 }}
      end={{ x: 0.1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
          <Text style={[{ color: colors.primaryText }, typography.headlineLarge]}>
            Planos de assinatura
          </Text>
          <Text style={[{ color: colors.secondaryText }, typography.bodyMedium]}>
            Escolha o plano ideal para destravar recursos premium.
          </Text>
          <Text style={[{ color: colors.primary }, typography.labelSmall]}>
            Teste gratis de 7 dias com cartao cadastrado.
          </Text>

          <View style={[styles.planGrid, { marginTop: spacing.lg }]}>
            {localPlans.map((plan) => (
              <TouchableOpacity
                key={plan.id}
                style={[
                  styles.planCard,
                  {
                    backgroundColor: colors.secondaryBackground,
                    borderRadius: borderRadius.xl,
                    borderColor: plan.highlight ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => handleSelectPlan(plan)}
                disabled={loadingPlan !== null}
              >
                {plan.highlight && (
                  <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.badgeText, { color: colors.info }]}>Popular</Text>
                  </View>
                )}
                <Text style={[{ color: colors.primaryText }, typography.titleLarge]}>
                  {plan.name}
                </Text>
                <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                  {plan.description}
                </Text>
                <Text style={[{ color: colors.primary }, typography.displaySmall]}>
                  {formatCurrency(plan.price)}
                </Text>
                <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
                  {plan.intervalLabel}
                </Text>

                <View style={[styles.featureList, { marginTop: spacing.md }]}>
                  {plan.features.map((feature) => (
                    <View key={feature} style={styles.featureItem}>
                      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                      <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                        {feature}
                      </Text>
                    </View>
                  ))}
                </View>

                <View
                  style={[
                    styles.ctaButton,
                    {
                      backgroundColor: plan.highlight ? colors.primary : colors.surface,
                      borderRadius: borderRadius.lg,
                      marginTop: spacing.md,
                    },
                  ]}
                >
                  <Text
                    style={[
                      { color: plan.highlight ? colors.info : colors.primaryText },
                      typography.titleSmall,
                    ]}
                  >
                    {loadingPlan === plan.id ? 'Processando...' : 'Assinar plano'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: 8,
  },
  planGrid: {
    gap: 16,
  },
  planCard: {
    padding: 20,
    borderWidth: 2,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  featureList: {
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ctaButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
});
