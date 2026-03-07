import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Linking } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useStripe } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { Button, Card, Loading } from '../../src/components/common';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import {
  subscriptionPlans,
  formatCurrency,
  createSubscription,
  cancelSubscription,
  createSetupIntent,
  extractSubscriptionDetails,
  getSubscriptionStatus,
} from '../../src/services/payments';
import { AiAccessStatusCard } from '../../src/components/ai/AiAccessStatusCard';
import { useAiAccessStatus } from '../../src/hooks/useAiAccessStatus';
import { spacing, borderRadius } from '../../src/theme';

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);
const PAYMENT_LINK_ENV_BY_PLAN_ID: Record<string, string> = {
  mensal: 'EXPO_PUBLIC_STRIPE_PAYMENT_LINK_MENSAL',
  bimestral: 'EXPO_PUBLIC_STRIPE_PAYMENT_LINK_BIMESTRAL',
  semestral: 'EXPO_PUBLIC_STRIPE_PAYMENT_LINK_SEMESTRAL',
  anual: 'EXPO_PUBLIC_STRIPE_PAYMENT_LINK_ANUAL',
  'aluno-mensal': 'EXPO_PUBLIC_STRIPE_PAYMENT_LINK_ALUNO_MENSAL',
};

const formatDateLabel = (value?: any) => {
  if (!value) return '-';
  if (typeof value?.toDate === 'function') return value.toDate().toLocaleDateString('pt-BR');
  if (value instanceof Date) return value.toLocaleDateString('pt-BR');
  if (typeof value === 'number') {
    const millis = value < 1000000000000 ? value * 1000 : value;
    return new Date(millis).toLocaleDateString('pt-BR');
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('pt-BR');
};

const formatAmountLabel = (value?: any, currency: string = 'BRL') => {
  if (value === undefined || value === null) return '-';
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return '-';
  const amount = parsed > 1000 ? parsed / 100 : parsed;
  return formatCurrency(amount, currency ? String(currency).toUpperCase() : 'BRL');
};

const formatStatusLabel = (value?: string) => {
  if (!value) return '-';
  const normalized = String(value).toLowerCase();
  const labels: Record<string, string> = {
    active: 'Ativa',
    trialing: 'Em teste',
    past_due: 'Pagamento pendente',
    canceled: 'Cancelada',
    unpaid: 'Nao paga',
    incomplete: 'Incompleta',
    incomplete_expired: 'Incompleta expirada',
  };
  return labels[normalized] || normalized.replace(/_/g, ' ');
};

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user, role } = useAuth();
  const aiAccess = useAiAccessStatus();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<any | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL || '';
  const stripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const stripeFunctionsUrl = process.env.EXPO_PUBLIC_STRIPE_FUNCTIONS_URL || '';
  const stripeReturnUrl =
    process.env.EXPO_PUBLIC_STRIPE_RETURN_URL || 'mhpersonaltrainer://stripe-redirect';
  const isExpoGo =
    Constants.appOwnership === 'expo' ||
    (Constants as { executionEnvironment?: string }).executionEnvironment === 'storeClient';
  const hasStripeEndpoint = !!stripeFunctionsUrl || !!apiBaseUrl;
  const isPersonal = role === 'personal' || role === 'professor';
  const defaultPlan = subscriptionPlans[0];
  const alunoPremiumPlan: (typeof subscriptionPlans)[number] = {
    id: 'aluno-mensal',
    name: 'Assistente Premium',
    price: 24.99,
    interval: '/mes',
    priceId:
      process.env.EXPO_PUBLIC_STRIPE_PRICE_ID_ALUNO_MENSAL ||
      defaultPlan?.priceId ||
      '',
    paymentLink:
      process.env.EXPO_PUBLIC_STRIPE_PAYMENT_LINK_ALUNO_MENSAL ||
      defaultPlan?.paymentLink ||
      '',
    highlight: true,
    features: [
      'Assistente IA premium sem personal',
      'Treinos, ajustes e duvidas com IA',
      'Acesso completo aos recursos de IA do app',
      'Cancelamento quando quiser',
    ],
  };
  const availablePlans = isPersonal ? subscriptionPlans : [alunoPremiumPlan];
  const highlightPlan = availablePlans.find((plan) => plan.highlight) || availablePlans[0];
  const freeCreditsPerDay = isPersonal ? aiAccess.dailyLimit || 8 : 8;
  const subscriptionStatusValue =
    subscriptionStatus?.status || subscriptionStatus?.subscriptionStatus || '';
  const hasSubscriptionData = Boolean(subscriptionStatus?.subscriptionId);
  const isStripeActive = ACTIVE_SUBSCRIPTION_STATUSES.has(
    String(subscriptionStatusValue || '').toLowerCase()
  );
  const isSubscribed = Boolean(user?.assinatura || hasSubscriptionData || isStripeActive);
  const currentPlanLabel =
    subscriptionStatus?.planName ||
    subscriptionStatus?.plan?.nickname ||
    subscriptionStatus?.plan ||
    subscriptionStatus?.price?.nickname ||
    user?.tipoDeAssinatura ||
    'Premium';
  const currentRenewDate =
    subscriptionStatus?.currentPeriodEnd ||
    subscriptionStatus?.current_period_end ||
    subscriptionStatus?.renovacao;
  const currentAmount =
    subscriptionStatus?.amount ||
    subscriptionStatus?.planAmount ||
    subscriptionStatus?.price?.unit_amount;
  const currentCurrency =
    subscriptionStatus?.currency || subscriptionStatus?.planCurrency || 'BRL';
  const resolvedSubscriptionId = user?.subscribeId || subscriptionStatus?.subscriptionId;

  const loadSubscriptionStatus = useCallback(async () => {
    if (!user?.uid) {
      setSubscriptionStatus(null);
      return;
    }
    setSubscriptionLoading(true);
    try {
      const result = await getSubscriptionStatus(user.uid);
      if (result.data && result.data.status !== 'not_found') {
        setSubscriptionStatus(result.data);
      } else {
        setSubscriptionStatus(null);
      }
    } finally {
      setSubscriptionLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadSubscriptionStatus();
  }, [loadSubscriptionStatus]);

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
      return `Configure ${envKey} no arquivo .env para abrir o checkout no navegador pelo Expo Go.`;
    }
    return 'Configure EXPO_PUBLIC_STRIPE_PAYMENT_LINK_* no arquivo .env para abrir o checkout no navegador pelo Expo Go.';
  };

  const handleSelectPlan = async (plan: (typeof subscriptionPlans)[number]) => {
    if (!user) return;
    if (Platform.OS === 'web') {
      if (await openPaymentLink(plan.paymentLink)) {
        return;
      }
      showAlert('Stripe', 'Pagamento via Stripe não está disponível no web. Use o app mobile.');
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
    if (!hasStripeEndpoint || !stripeKey) {
      showAlert(
        'Stripe não configurado',
        'Defina EXPO_PUBLIC_STRIPE_FUNCTIONS_URL (ou EXPO_PUBLIC_API_URL com /api/payments) e EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY no arquivo .env para ativar as assinaturas.'
      );
      return;
    }

    setSelectedPlan(plan.id);
    setLoading(true);

    try {
      const result = await createSubscription(
        user.uid,
        user.email,
        user.displayName,
        plan.priceId
      );

      if (result.error) {
        throw new Error(result.error);
      }

      const subscriptionData = result.data as any;
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
            returnURL: stripeReturnUrl,
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

          showAlert('Sucesso', 'Cartão salvo com sucesso.');
          router.back();
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
        returnURL: stripeReturnUrl,
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

      showAlert('Sucesso', 'Assinatura confirmada com sucesso!');
      router.back();
    } catch (error: any) {
      showAlert('Erro', error.message || 'Erro ao processar assinatura');
    } finally {
      setLoading(false);
      setSelectedPlan(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!resolvedSubscriptionId) return;

    showAlert(
      'Cancelar Assinatura',
      'Tem certeza que deseja cancelar sua assinatura?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, Cancelar',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await cancelSubscription(resolvedSubscriptionId);
              await loadSubscriptionStatus();
              showAlert('Sucesso', 'Assinatura cancelada');
            } catch (error: any) {
              showAlert('Erro', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('profile.subscription')}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient
          colors={['#0b1c3b', '#1c5aa6', '#5bb7ff']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroGlow} />
          <View style={styles.heroContent}>
            <View style={styles.heroBadge}>
              <Ionicons name="sparkles" size={14} color="#fff" />
              <Text style={styles.heroBadgeText}>Premium</Text>
            </View>

            <Text style={styles.heroTitle}>
              {isPersonal
                ? 'Transforme seus resultados com o Premium'
                : 'Tenha o poder do assistente sem precisar de personal'}
            </Text>
            <Text style={styles.heroSubtitle}>
              {isPersonal
                ? 'Desbloqueie mais alunos, automações e avaliações completas em um único lugar.'
                : 'Assinatura focada no aluno para usar o assistente completo e montar sua rotina com autonomia.'}
            </Text>

            {isPersonal && (
              <Text style={styles.heroTrialText}>7 dias gratis com cartao cadastrado.</Text>
            )}
            <Text style={styles.heroFreePlanText}>
              Plano gratuito: {freeCreditsPerDay} creditos de IA por dia.
            </Text>
            <Text style={styles.heroPremiumInfoText}>
              {isPersonal
                ? 'No gratuito, o chat IA consome 1 credito por solicitacao. Insights IA e avaliacao postural por IA sao exclusivos do Premium.'
                : 'No Premium, por R$ 24,99/mes, voce libera o assistente completo mesmo sem personal e usa IA sem limite diario.'}
            </Text>

            <View style={styles.heroMetaRow}>
              <View style={styles.heroPriceBlock}>
                <Text style={styles.heroPrice}>
                  {highlightPlan ? formatCurrency(highlightPlan.price) : '--'}
                </Text>
                <Text style={styles.heroInterval}>
                  {highlightPlan?.interval || ''}
                </Text>
              </View>
              {isSubscribed && (
                <View style={styles.heroActiveBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#0b1c3b" />
                  <Text style={styles.heroActiveText}>Ativo</Text>
                </View>
              )}
            </View>

            <View style={styles.heroFeatures}>
              {(isPersonal
                ? ['Chat IA ilimitado', 'Insights IA premium', 'Avaliacao postural IA']
                : ['Assistente completo sem personal', 'Plano do aluno: R$ 24,99/mes', '8 creditos gratis por dia no plano free']
              ).map((feature) => (
                <View key={feature} style={styles.heroFeatureItem}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                  <Text style={styles.heroFeatureText}>{feature}</Text>
                </View>
              ))}
            </View>

            {!isSubscribed && highlightPlan && (
              <TouchableOpacity
                style={styles.heroButton}
                onPress={() => handleSelectPlan(highlightPlan)}
                disabled={loading}
              >
                <Text style={styles.heroButtonText}>
                  {isPersonal ? 'Assinar Premium' : 'Assinar por R$ 24,99'}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#0b1c3b" />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>

        <View style={[styles.trustRow, { backgroundColor: colors.card }]}>
          {(isPersonal
            ? [
                { icon: 'shield-checkmark', label: 'Pagamento seguro' },
                { icon: 'repeat', label: 'Cancele quando quiser' },
                { icon: 'sparkles', label: 'Suporte prioritário' },
              ]
            : [
                { icon: 'shield-checkmark', label: 'Pagamento seguro' },
                { icon: 'repeat', label: 'Cancele quando quiser' },
                { icon: 'sparkles', label: 'Plano focado no aluno' },
              ]
          ).map((item) => (
            <View key={item.label} style={styles.trustItem}>
              <Ionicons name={item.icon as any} size={16} color={colors.primary} />
              <Text style={[styles.trustText, { color: colors.textSecondary }]}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>

        <AiAccessStatusCard />

        {(isSubscribed || subscriptionLoading || hasSubscriptionData) && (
          <Card style={styles.currentPlanCard}>
            <View style={styles.currentPlanHeader}>
              <Ionicons name="star" size={24} color={colors.warning} />
              <Text style={[styles.currentPlanTitle, { color: colors.text }]}>
                Detalhes da assinatura
              </Text>
            </View>
            <Text style={[styles.currentPlanName, { color: colors.primary }]}>
              {currentPlanLabel}
            </Text>
            <Text style={[styles.currentPlanStatus, { color: isSubscribed ? colors.success : colors.textSecondary }]}>
              Status: {formatStatusLabel(subscriptionStatusValue || (isSubscribed ? 'active' : 'inactive'))}
            </Text>
            <Text style={[styles.currentPlanMeta, { color: colors.textSecondary }]}>
              Renovacao: {formatDateLabel(currentRenewDate)}
            </Text>
            <Text style={[styles.currentPlanMeta, { color: colors.textSecondary }]}>
              Valor: {formatAmountLabel(currentAmount, currentCurrency)}
            </Text>
            <Button
              title={subscriptionLoading ? 'Atualizando...' : 'Atualizar assinatura'}
              onPress={loadSubscriptionStatus}
              variant="outline"
              disabled={subscriptionLoading}
              style={{ marginTop: spacing.md }}
            />
            <Button
              title="Cancelar Assinatura"
              onPress={handleCancelSubscription}
              variant="outline"
              disabled={!resolvedSubscriptionId}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {isSubscribed
            ? isPersonal
              ? 'Mudar de Plano'
              : 'Seu plano atual'
            : isPersonal
              ? 'Escolha seu Plano'
              : 'Plano do aluno'}
        </Text>

        {availablePlans.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            style={[
              styles.planCard,
              { 
                backgroundColor: colors.card,
                borderColor: selectedPlan === plan.id ? colors.primary : colors.border,
              },
              plan.highlight && styles.planCardHighlight,
              selectedPlan === plan.id && {
                shadowColor: colors.primary,
                shadowOpacity: 0.2,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                elevation: 6,
              },
            ]}
            onPress={() => handleSelectPlan(plan)}
            disabled={loading}
          >
            {plan.highlight && (
              <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.popularBadgeText}>Mais Popular</Text>
              </View>
            )}

            <Text style={[styles.planName, { color: colors.text }]}>
              {plan.name}
            </Text>

            <View style={styles.priceContainer}>
              <Text style={[styles.planPrice, { color: colors.primary }]}>
                {formatCurrency(plan.price)}
              </Text>
              <Text style={[styles.planInterval, { color: colors.textSecondary }]}>
                {plan.interval}
              </Text>
            </View>

            <View style={styles.featuresContainer}>
              {plan.features.map((feature, index) => (
                <View key={index} style={styles.featureItem}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                    {feature}
                  </Text>
                </View>
              ))}
            </View>

            {loading && selectedPlan === plan.id ? (
              <Loading size="small" />
            ) : (
              <Button
                title={
                  isSubscribed
                    ? isPersonal
                      ? 'Mudar para este plano'
                      : 'Reativar plano'
                    : isPersonal
                      ? 'Assinar'
                      : 'Assinar por R$ 24,99'
                }
                onPress={() => handleSelectPlan(plan)}
                variant={plan.highlight ? 'primary' : 'outline'}
                fullWidth
              />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
  },
  heroCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -80,
    right: -80,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroContent: {
    gap: spacing.md,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  heroBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    lineHeight: 20,
  },
  heroTrialText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  heroFreePlanText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  heroPremiumInfoText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    lineHeight: 18,
  },
  heroMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroPriceBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  heroPrice: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '700',
  },
  heroInterval: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  heroActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  heroActiveText: {
    color: '#0b1c3b',
    fontSize: 12,
    fontWeight: '600',
  },
  heroFeatures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  heroFeatureText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#fff',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  heroButtonText: {
    color: '#0b1c3b',
    fontSize: 14,
    fontWeight: '600',
  },
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  trustText: {
    fontSize: 12,
    fontWeight: '500',
  },
  currentPlanCard: {
    marginBottom: spacing.xl,
    alignItems: 'flex-start',
  },
  currentPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  currentPlanTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  currentPlanName: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  currentPlanStatus: {
    fontSize: 14,
    marginTop: spacing.xs,
  },
  currentPlanMeta: {
    fontSize: 13,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  planCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    marginBottom: spacing.md,
  },
  planCardHighlight: {
    borderColor: '#1c5aa6',
    shadowColor: '#1c5aa6',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    right: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  planPrice: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  planInterval: {
    fontSize: 14,
    marginLeft: spacing.xs,
  },
  featuresContainer: {
    marginBottom: spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  featureText: {
    fontSize: 14,
  },
});
