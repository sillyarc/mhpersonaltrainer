import React, { useCallback, useEffect, useState } from 'react';
import { AppState, View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Linking } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Loading } from '../../src/components/common';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import {
  subscriptionPlans,
  formatCurrency,
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
} from '../../src/services/payments';
import {
  isTerminalSubscriptionStatus,
  resolveReadablePlanLabel,
  resolveSubscribedPlan,
} from '../../src/utils/subscriptionPlanUtils';
import { AiAccessStatusCard } from '../../src/components/ai/AiAccessStatusCard';
import { useAiAccessStatus } from '../../src/hooks/useAiAccessStatus';
import { spacing, borderRadius } from '../../src/theme';
import { getCleanPalette } from '../../src/theme/cleanPalette';

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);

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
    unpaid: 'Não paga',
    incomplete: 'Incompleta',
    incomplete_expired: 'Incompleta expirada',
  };
  return labels[normalized] || normalized.replace(/_/g, ' ');
};

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { user, role, refreshUser } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const aiAccess = useAiAccessStatus();
  const cleanPalette = getCleanPalette(isDark);
  const {
    surface: CLEAN_SURFACE,
    surfaceAlt: CLEAN_SURFACE_ALT,
    surfaceSoft: CLEAN_SURFACE_SOFT,
    border: CLEAN_BORDER,
    text: CLEAN_TEXT,
    textMuted: CLEAN_TEXT_MUTED,
    surfaceGradient: CLEAN_SURFACE_GRADIENT,
  } = cleanPalette;
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<any | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL || '';
  const stripeFunctionsUrl = process.env.EXPO_PUBLIC_STRIPE_FUNCTIONS_URL || '';
  const hasStripeEndpoint = !!stripeFunctionsUrl || !!apiBaseUrl;
  const isPersonal = role === 'personal' || role === 'professor';
  const defaultPlan = subscriptionPlans[0];
  const alunoPremiumPlan: (typeof subscriptionPlans)[number] = {
    id: 'aluno-mensal',
    name: 'Assistente Premium',
    price: 24.99,
    interval: '/mês',
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
      'Treinos, ajustes e dúvidas com IA',
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
  const currentPlan = resolveSubscribedPlan(availablePlans, [
    subscriptionStatus?.priceId,
    subscriptionStatus?.stripePriceId,
    subscriptionStatus?.price?.id,
    subscriptionStatus?.planId,
    subscriptionStatus?.plan?.id,
    subscriptionStatus?.planName,
    subscriptionStatus?.plan?.nickname,
    subscriptionStatus?.plan,
    subscriptionStatus?.price?.nickname,
    user?.stripePriceId,
    user?.tipoDeAssinatura,
  ]);
  const currentPlanLabel = resolveReadablePlanLabel(
    availablePlans,
    [
      subscriptionStatus?.planName,
      subscriptionStatus?.plan?.nickname,
      subscriptionStatus?.plan,
      subscriptionStatus?.price?.nickname,
      subscriptionStatus?.priceId,
      subscriptionStatus?.stripePriceId,
      subscriptionStatus?.price?.id,
      user?.stripePriceId,
      user?.tipoDeAssinatura,
    ],
    'Premium'
  );
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
  const hasSubscriptionEvidence = Boolean(
    resolvedSubscriptionId ||
      hasSubscriptionData ||
      subscriptionStatusValue ||
      isSubscribed ||
      user?.stripePriceId
  );
  const activeBadgePalette = isDark
    ? { bg: 'rgba(31,122,99,0.18)', border: '#1F5F4A', text: '#7DD3AE' }
    : { bg: '#E8F7EE', border: '#CFE9D9', text: '#1F7A63' };

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

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void loadSubscriptionStatus();
      }
    });

    return () => subscription.remove();
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

  const resolveCheckoutEmail = () => String(user?.email || '').trim();
  const resolveCheckoutName = () => {
    const fallbackName = resolveCheckoutEmail().split('@')[0] || '';
    return String(user?.displayName || fallbackName).trim();
  };
  const resolvePlanPriceId = (plan: (typeof availablePlans)[number]) =>
    String(plan.priceId || (plan.id === 'aluno-mensal' ? defaultPlan?.priceId || '' : '')).trim();

  const shouldPreventCheckoutForPlan = (plan: (typeof availablePlans)[number]) => {
    if (!currentPlan || currentPlan.id !== plan.id) return false;
    if (!hasSubscriptionEvidence) return false;
    const normalizedStatus = subscriptionStatusValue || user?.stripeSubscriptionStatus;
    if (!normalizedStatus) return true;
    return !isTerminalSubscriptionStatus(normalizedStatus);
  };

  const showAlreadySubscribedAlert = (plan: (typeof availablePlans)[number]) => {
    const normalizedStatus = String(
      subscriptionStatusValue || user?.stripeSubscriptionStatus || ''
    ).toLowerCase();
    const statusLabel = formatStatusLabel(normalizedStatus || 'active');
    const description =
      normalizedStatus === 'incomplete'
        ? `Você já iniciou o plano ${plan.name}. Atualize a assinatura antes de tentar pagar novamente.`
        : `Você já possui o plano ${plan.name}${statusLabel !== '-' ? ` (${statusLabel})` : ''}.`;

    showAlert('Plano já assinado', `${description} Não é preciso abrir outro checkout agora.`);
  };

  const handleSelectPlan = async (plan: (typeof subscriptionPlans)[number]) => {
    if (!user) return;
    const checkoutEmail = resolveCheckoutEmail();
    const checkoutName = resolveCheckoutName();
    const resolvedPriceId = resolvePlanPriceId(plan);
    if (!user.uid || !checkoutEmail || !checkoutName) {
      showAlert('Atenção', 'Complete seu perfil com email e nome antes de assinar.');
      return;
    }
    if (shouldPreventCheckoutForPlan(plan)) {
      showAlreadySubscribedAlert(plan);
      return;
    }
    if (!resolvedPriceId && !plan.id) {
      showAlert('Plano indisponível', 'O `priceId` deste plano ainda não foi configurado.');
      return;
    }
    if (Platform.OS === 'web') {
      if (await openExternalUrl(plan.paymentLink, true)) {
        return;
      }
      showAlert('Stripe', 'O pagamento via Stripe não está disponível na web. Use o app mobile.');
      return;
    }
    if (!hasStripeEndpoint) {
      showAlert(
        'Stripe não configurado',
        'Defina EXPO_PUBLIC_STRIPE_FUNCTIONS_URL (ou EXPO_PUBLIC_API_URL com /api/payments) no arquivo .env para ativar as assinaturas.'
      );
      return;
    }

    setSelectedPlan(plan.id);
    setLoading(true);

    try {
      const result = await createSubscription(
        user.uid,
        checkoutEmail,
        checkoutName,
        resolvedPriceId,
        plan.id
      );

      if (result.error) {
        throw new Error(result.error);
      }
      if (!result.data?.clientSecret) {
        throw new Error('O backend não retornou o segredo de pagamento da assinatura.');
      }

      const initResult = await initPaymentSheet({
        merchantDisplayName: 'MH Personal Trainer',
        paymentIntentClientSecret: result.data.clientSecret,
        customerId: result.data.customerId,
        customerEphemeralKeySecret: result.data.ephemeralKey,
        returnURL: 'mhpersonaltrainer://stripe-redirect',
        defaultBillingDetails: {
          email: checkoutEmail,
          name: checkoutName,
        },
      });
      if (initResult.error) {
        throw new Error(initResult.error.message);
      }

      const paymentResult = await presentPaymentSheet();
      if (paymentResult.error) {
        if (paymentResult.error.code === 'Canceled') {
          showAlert('Pagamento cancelado', 'Você fechou a tela de pagamento antes de concluir.');
          return;
        }
        throw new Error(paymentResult.error.message);
      }

      await loadSubscriptionStatus();
      await refreshUser?.();
      showAlert(
        'Pagamento confirmado',
        'Sua assinatura foi processada. Se o status ainda não mudar, atualize a tela em alguns segundos.'
      );
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
          colors={CLEAN_SURFACE_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroCard, { borderWidth: 1, borderColor: CLEAN_BORDER }]}
        >
          <View style={[styles.heroGlow, { backgroundColor: isDark ? `${colors.primary}10` : CLEAN_SURFACE_SOFT }]} />
          <View style={styles.heroContent}>
            <View style={[styles.heroBadge, { backgroundColor: CLEAN_SURFACE_ALT, borderWidth: 1, borderColor: CLEAN_BORDER }]}>
              <Ionicons name="sparkles" size={14} color={colors.primary} />
              <Text style={[styles.heroBadgeText, { color: CLEAN_TEXT }]}>Premium</Text>
            </View>

            <Text style={[styles.heroTitle, { color: CLEAN_TEXT }]}>
              {isPersonal
                ? 'Transforme seus resultados com o Premium'
                : 'Tenha o poder do assistente sem precisar de personal'}
            </Text>
            <Text style={[styles.heroSubtitle, { color: CLEAN_TEXT_MUTED }]}>
              {isPersonal
                ? 'Desbloqueie mais alunos, automações e avaliações completas em um único lugar.'
                : 'Assinatura focada no aluno para usar o assistente completo e montar sua rotina com autonomia.'}
            </Text>

            {isPersonal && (
              <Text style={[styles.heroTrialText, { color: CLEAN_TEXT }]}>7 dias grátis com cartão cadastrado.</Text>
            )}
            <Text style={[styles.heroFreePlanText, { color: CLEAN_TEXT_MUTED }]}>
              Plano gratuito: {freeCreditsPerDay} créditos de IA por dia.
            </Text>
            <Text style={[styles.heroPremiumInfoText, { color: CLEAN_TEXT_MUTED }]}>
              {isPersonal
                ? 'No gratuito, o chat IA consome 1 crédito por solicitação. Insights IA e avaliação postural por IA são exclusivos do Premium.'
                : 'No Premium, por R$ 24,99/mês, você libera o assistente completo mesmo sem personal e usa IA sem limite diário.'}
            </Text>

            <View style={styles.heroMetaRow}>
              <View style={styles.heroPriceBlock}>
                <Text style={[styles.heroPrice, { color: CLEAN_TEXT }]}>
                  {highlightPlan ? formatCurrency(highlightPlan.price) : '--'}
                </Text>
                <Text style={[styles.heroInterval, { color: CLEAN_TEXT_MUTED }]}>
                  {highlightPlan?.interval || ''}
                </Text>
              </View>
              {isSubscribed && (
                <View
                  style={[
                    styles.heroActiveBadge,
                    {
                      backgroundColor: activeBadgePalette.bg,
                      borderWidth: 1,
                      borderColor: activeBadgePalette.border,
                    },
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={16} color={activeBadgePalette.text} />
                  <Text style={[styles.heroActiveText, { color: activeBadgePalette.text }]}>Ativo</Text>
                </View>
              )}
            </View>

            <View style={styles.heroFeatures}>
              {(isPersonal
                ? ['Chat com IA ilimitado', 'Insights com IA premium', 'Avaliação postural com IA']
                : ['Assistente completo sem personal', 'Plano do aluno: R$ 24,99/mês', '8 créditos grátis por dia no plano free']
              ).map((feature) => (
                <View key={feature} style={[styles.heroFeatureItem, { backgroundColor: CLEAN_SURFACE_ALT, borderWidth: 1, borderColor: CLEAN_BORDER }]}>
                  <Ionicons name="checkmark" size={14} color={colors.primary} />
                  <Text style={[styles.heroFeatureText, { color: CLEAN_TEXT_MUTED }]}>{feature}</Text>
                </View>
              ))}
            </View>

            {!isSubscribed && highlightPlan && (
              <TouchableOpacity
                style={[styles.heroButton, { backgroundColor: CLEAN_SURFACE_ALT, borderWidth: 1, borderColor: CLEAN_BORDER }]}
                onPress={() => handleSelectPlan(highlightPlan)}
                disabled={loading}
              >
                <Text style={[styles.heroButtonText, { color: CLEAN_TEXT }]}>
                  {isPersonal ? 'Assinar Premium' : 'Assinar por R$ 24,99'}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={CLEAN_TEXT} />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>

        <View style={[styles.trustRow, { backgroundColor: CLEAN_SURFACE, borderWidth: 1, borderColor: CLEAN_BORDER }]}>
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
              Renovação: {formatDateLabel(currentRenewDate)}
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
              ? 'Escolha seu plano'
              : 'Plano do aluno'}
        </Text>

        {availablePlans.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            activeOpacity={0.92}
            style={[
              styles.planCard,
              { 
                backgroundColor: colors.card,
                borderColor: shouldPreventCheckoutForPlan(plan)
                  ? colors.success
                  : selectedPlan === plan.id
                    ? colors.primary
                    : colors.border,
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
                <Text style={styles.popularBadgeText}>Mais popular</Text>
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
                  shouldPreventCheckoutForPlan(plan)
                    ? 'Plano atual'
                    : isSubscribed
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
  },
  heroContent: {
    gap: spacing.md,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  heroTrialText: {
    fontSize: 12,
    fontWeight: '600',
  },
  heroFreePlanText: {
    fontSize: 12,
    fontWeight: '600',
  },
  heroPremiumInfoText: {
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
    fontSize: 13,
  },
  heroActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  heroActiveText: {
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
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  heroFeatureText: {
    fontSize: 12,
    fontWeight: '500',
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  heroButtonText: {
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
    shadowColor: '#CBD5E1',
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
