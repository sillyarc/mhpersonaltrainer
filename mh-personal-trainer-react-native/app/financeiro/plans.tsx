import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Linking } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import {
  createSubscription,
  formatCurrency,
  getSubscriptionStatus,
  subscriptionPlans,
} from '../../src/services/payments';
import {
  isTerminalSubscriptionStatus,
  resolveSubscribedPlan,
} from '../../src/utils/subscriptionPlanUtils';
import { getCleanPalette } from '../../src/theme/cleanPalette';

const intervalLabels: Record<string, string> = {
  mensal: 'por mes',
  bimestral: 'a cada 2 meses',
  semestral: 'a cada 6 meses',
  anual: 'por ano',
};

const descriptions: Record<string, string> = {
  mensal: 'Pagamento recorrente mensal',
  bimestral: 'Pagamento a cada 2 meses',
  semestral: 'Pagamento a cada 6 meses',
  anual: 'Pagamento anual',
};

const localPlans = subscriptionPlans.map((plan) => ({
  ...plan,
  intervalLabel: intervalLabels[plan.id] || plan.interval,
  description: descriptions[plan.id] || `Pagamento recorrente ${plan.name.toLowerCase()}`,
}));

export default function PlanoAssinaturaScreen() {
  const { colors, spacing, borderRadius, typography, isDark } = useTheme();
  const { user } = useAuthStore();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const pageGradient = getCleanPalette(isDark).surfaceGradient;
  const userRecord = (user || {}) as Record<string, any>;
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<any | null>(null);
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL || '';
  const stripeFunctionsUrl = process.env.EXPO_PUBLIC_STRIPE_FUNCTIONS_URL || '';
  const hasStripeEndpoint = !!stripeFunctionsUrl || !!apiBaseUrl;
  const subscriptionStatusValue =
    subscriptionStatus?.status || subscriptionStatus?.subscriptionStatus || userRecord.stripeSubscriptionStatus || '';
  const currentPlan = resolveSubscribedPlan(localPlans, [
    subscriptionStatus?.priceId,
    subscriptionStatus?.stripePriceId,
    subscriptionStatus?.price?.id,
    subscriptionStatus?.planId,
    subscriptionStatus?.plan?.id,
    subscriptionStatus?.planName,
    subscriptionStatus?.plan?.nickname,
    subscriptionStatus?.plan,
    subscriptionStatus?.price?.nickname,
    userRecord.stripePriceId,
    user?.tipoDeAssinatura,
  ]);
  const hasSubscriptionEvidence = Boolean(
    subscriptionStatus?.subscriptionId ||
      subscriptionStatusValue ||
      user?.subscribeId ||
      user?.assinatura ||
      userRecord.stripePriceId
  );

  const loadSubscriptionStatus = useCallback(async () => {
    if (!user?.uid) {
      setSubscriptionStatus(null);
      return;
    }

    try {
      const result = await getSubscriptionStatus(user.uid);
      if (result.data && result.data.status !== 'not_found') {
        setSubscriptionStatus(result.data);
      } else {
        setSubscriptionStatus(null);
      }
    } catch {
      setSubscriptionStatus(null);
    }
  }, [user?.uid]);

  useEffect(() => {
    void loadSubscriptionStatus();
  }, [loadSubscriptionStatus]);

  const openExternalUrl = async (url?: string, includeEmail: boolean = false) => {
    if (!url) return false;
    const separator = url.includes('?') ? '&' : '?';
    const prefilledEmail = includeEmail && user?.email
      ? `${separator}prefilled_email=${encodeURIComponent(user.email)}`
      : '';
    const finalUrl = prefilledEmail ? `${url}${prefilledEmail}` : url;
    await Linking.openURL(finalUrl);
    return true;
  };

  const shouldPreventCheckoutForPlan = (plan: (typeof localPlans)[number]) => {
    if (!currentPlan || currentPlan.id !== plan.id) return false;
    if (!hasSubscriptionEvidence) return false;
    if (!subscriptionStatusValue) return true;
    return !isTerminalSubscriptionStatus(subscriptionStatusValue);
  };

  const showAlreadySubscribedAlert = (plan: (typeof localPlans)[number]) => {
    showAlert(
      'Plano ja assinado',
      `Voce ja possui o plano ${plan.name}. Nao e preciso abrir outro checkout para ele agora.`
    );
  };

  const handleSelectPlan = async (plan: (typeof localPlans)[number]) => {
    if (!user?.uid || !user.email || !user.displayName) {
      showAlert('Atenção', 'Complete seu perfil antes de assinar.');
      return;
    }
    if (shouldPreventCheckoutForPlan(plan)) {
      showAlreadySubscribedAlert(plan);
      return;
    }
    if (!plan.priceId) {
      showAlert('Plano indisponível', 'O `priceId` deste plano ainda não foi configurado.');
      return;
    }
    if (Platform.OS === 'web') {
      if (await openExternalUrl(plan.paymentLink, true)) {
        return;
      }
      showAlert('Stripe', 'Pagamento via Stripe nao esta disponivel no web. Use o app mobile.');
      return;
    }
    if (!hasStripeEndpoint) {
      showAlert(
        'Stripe nao configurado',
        'Defina EXPO_PUBLIC_STRIPE_FUNCTIONS_URL (ou EXPO_PUBLIC_API_URL com /api/payments) no arquivo .env para ativar as assinaturas.'
      );
      return;
    }

    setLoadingPlan(plan.id);
    try {
      const result = await createSubscription(
        user.uid,
        user.email,
        user.displayName,
        plan.priceId,
        plan.id
      );

      if (result.error) {
        throw new Error(result.error);
      }
      if (!result.data?.clientSecret) {
        throw new Error('O backend nao retornou o segredo de pagamento da assinatura.');
      }

      const initResult = await initPaymentSheet({
        merchantDisplayName: 'MH Personal Trainer',
        paymentIntentClientSecret: result.data.clientSecret,
        customerId: result.data.customerId,
        customerEphemeralKeySecret: result.data.ephemeralKey,
        returnURL: 'mhpersonaltrainer://stripe-redirect',
        defaultBillingDetails: {
          email: user.email,
          name: user.displayName,
        },
      });
      if (initResult.error) {
        throw new Error(initResult.error.message);
      }

      const paymentResult = await presentPaymentSheet();
      if (paymentResult.error) {
        if (paymentResult.error.code === 'Canceled') {
          showAlert('Pagamento cancelado', 'Voce fechou a tela de pagamento antes de concluir.');
          return;
        }
        throw new Error(paymentResult.error.message);
      }

      await loadSubscriptionStatus();
      showAlert(
        'Pagamento confirmado',
        'Sua assinatura foi processada. Se o status ainda nao mudar, atualize a tela em alguns segundos.'
      );
    } catch (error: any) {
      showAlert('Erro', error.message || 'Não foi possível criar a assinatura.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <LinearGradient
      colors={pageGradient}
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
            Pagamento seguro processado pelo Stripe.
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
                    {loadingPlan === plan.id
                      ? 'Processando...'
                      : shouldPreventCheckoutForPlan(plan)
                        ? 'Plano atual'
                        : 'Assinar plano'}
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
