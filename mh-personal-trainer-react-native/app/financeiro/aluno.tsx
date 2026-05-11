import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useAuthStore } from '../../src/store/authStore';
import { fetchPaymentsForUser, updatePaymentForUser } from '../../src/services/financeiro';
import { firestoreService } from '../../src/services/firestoreService';
import {
  createStripeCheckoutSession,
  fetchStripeConnectStatus,
  formatCurrency,
} from '../../src/services/payments';
import { PaymentRecord } from '../../src/types/finance';

type ResolvedPersonalRoute = {
  personalId: string;
  destinationAccountId: string;
  personalDisplayName: string;
};

type AgfMetadata = {
  personalRef: string;
  personalName: string;
};

const normalizeText = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const parseAgfMetadata = (description?: string): AgfMetadata | null => {
  const raw = String(description || '');
  const match = raw.match(/\(agf:([^)]+)\)/i);
  if (!match) return null;
  const payload = match[1] || '';
  const parts = payload
    .split(':')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return {
    personalRef: parts[0] || '',
    personalName: parts[parts.length - 1] || '',
  };
};

const sanitizePaymentTitle = (description?: string) => {
  const text = String(description || '').trim();
  if (!text) return 'Cobranca';
  const cleaned = text.replace(/\(agf:[^)]+\)/gi, '').replace(/\s+/g, ' ').trim();
  return cleaned || text;
};

const extractPersonalLabel = (payment: PaymentRecord) => {
  const directName = String(payment.personalDisplayName || '').trim();
  if (directName && normalizeText(directName) !== 'personal') return directName;
  const agf = parseAgfMetadata(payment.descricao);
  if (agf?.personalName && normalizeText(agf.personalName) !== 'personal') return agf.personalName;
  return 'Personal';
};

const isPaymentPaid = (item: PaymentRecord) => {
  if (item.pago === true) return true;
  const status = String(item.stripeStatus || '').toLowerCase();
  return ['paid', 'succeeded', 'complete', 'completed'].includes(status);
};

const isPaymentPending = (item: PaymentRecord) => {
  const status = String(item.stripeStatus || '').toLowerCase();
  if (isPaymentPaid(item)) return false;
  if (!status) return true;
  return ['pending', 'open', 'requires_payment_method', 'requires_action', 'processing'].includes(status);
};

const formatStripeStatus = (value?: string) => {
  const status = String(value || '').toLowerCase();
  if (!status) return 'aguardando';
  const map: Record<string, string> = {
    paid: 'pago',
    succeeded: 'pago',
    completed: 'pago',
    complete: 'pago',
    pending: 'pendente',
    open: 'aberto',
    processing: 'processando',
    requires_payment_method: 'metodo necessario',
    requires_action: 'acao necessaria',
    canceled: 'cancelado',
    failed: 'falhou',
  };
  return map[status] || status;
};

const CLEAN_SURFACE = '#FFFFFF';
const CLEAN_SURFACE_ALT = '#F8FAFC';
const CLEAN_BORDER = '#E0E3E7';
const CLEAN_TEXT = '#14181B';
const CLEAN_TEXT_MUTED = '#57636C';
const STRIPE_FEE_RATE = 0.1;

export default function FinanceiroAlunoScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { padding } = useResponsive();
  const { user } = useAuthStore();

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);
  const resolvedPersonalCacheRef = useRef<Record<string, ResolvedPersonalRoute>>({});

  const stripeFunctionsUrl = process.env.EXPO_PUBLIC_STRIPE_FUNCTIONS_URL || '';
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';
  const stripeReady =
    Boolean(stripeFunctionsUrl) || (Boolean(apiUrl) && !apiUrl.includes('api.stripe.com'));

  const loadPayments = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
      if (!user?.uid) {
        setPayments([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (mode === 'initial') {
        setLoading(true);
      } else if (mode === 'refresh') {
        setRefreshing(true);
      }
      try {
        const result = await fetchPaymentsForUser(user.uid);
        setPayments(Array.isArray(result.data) ? result.data : []);
      } finally {
        if (mode === 'initial') setLoading(false);
        if (mode === 'refresh') setRefreshing(false);
      }
    },
    [user?.uid]
  );

  useEffect(() => {
    void loadPayments('initial');
  }, [loadPayments]);

  const orderedPayments = useMemo(() => {
    return [...payments].sort((left, right) => {
      const leftPending = isPaymentPending(left) ? 0 : 1;
      const rightPending = isPaymentPending(right) ? 0 : 1;
      if (leftPending !== rightPending) return leftPending - rightPending;
      const leftDue = Number(left.todoDiaDoMes || left.diaDoPagamento || 99);
      const rightDue = Number(right.todoDiaDoMes || right.diaDoPagamento || 99);
      return leftDue - rightDue;
    });
  }, [payments]);

  const totalPendente = useMemo(() => {
    return orderedPayments
      .filter((item) => isPaymentPending(item))
      .reduce((sum, item) => sum + (item.valorDaCombranca || 0), 0);
  }, [orderedPayments]);

  const proximoVencimento = useMemo(() => {
    const dias = orderedPayments
      .filter((item) => isPaymentPending(item))
      .map((item) => Number(item.todoDiaDoMes || item.diaDoPagamento || 0))
      .filter((item) => item > 0)
      .sort((a, b) => a - b);
    return dias.length ? dias[0] : null;
  }, [orderedPayments]);

  const paymentsOpenCount = useMemo(
    () => orderedPayments.filter((item) => isPaymentPending(item)).length,
    [orderedPayments]
  );

  const handleOpenPayment = useCallback(async (url?: string) => {
    if (!url) return false;
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }, []);

  const resolvePersonalRouteForPayment = useCallback(async (payment: PaymentRecord) => {
    const resolveAndValidateRoute = async (
      personalId: string,
      destinationAccountId: string,
      personalDisplayName?: string
    ): Promise<ResolvedPersonalRoute | null> => {
      const normalizedPersonalId = String(personalId || '').trim();
      const normalizedDestination = String(destinationAccountId || '').trim();
      if (!normalizedPersonalId || !normalizedDestination) return null;
      const cacheByIdKey = `id:${normalizedPersonalId}`;
      const cachedById = resolvedPersonalCacheRef.current[cacheByIdKey];
      if (cachedById) return cachedById;

      let active = true;
      try {
        const status = await fetchStripeConnectStatus(normalizedPersonalId, normalizedDestination);
        if (status.data) {
          active = Boolean(status.data.chargesEnabled) && status.data.detailsSubmitted !== false;
        }
      } catch (_) {
        // keep optimistic route when status endpoint fails
      }
      if (!active) return null;

      const resolved: ResolvedPersonalRoute = {
        personalId: normalizedPersonalId,
        destinationAccountId: normalizedDestination,
        personalDisplayName: String(personalDisplayName || '').trim() || 'Personal',
      };
      resolvedPersonalCacheRef.current[cacheByIdKey] = resolved;
      return resolved;
    };

    const directPersonal = String(payment.personalId || '').trim();
    const directDestination = String(payment.destinationAccountId || '').trim();
    const directName = extractPersonalLabel(payment);
    if (directPersonal && directDestination) {
      const resolved = await resolveAndValidateRoute(directPersonal, directDestination, directName);
      if (resolved) return resolved;
    }

    if (directPersonal && !directDestination) {
      const personalDoc = await firestoreService.getUserDocument(directPersonal);
      const destinationFromDoc = String(personalDoc?.stripeAccountId || '').trim();
      if (destinationFromDoc) {
        const resolved = await resolveAndValidateRoute(
          directPersonal,
          destinationFromDoc,
          personalDoc?.displayName || directName
        );
        if (resolved) return resolved;
      }
      const profileByCode = await firestoreService.getPersonalProfileByCode(directPersonal);
      if (profileByCode?.uid && profileByCode?.stripeAccountId) {
        const resolved = await resolveAndValidateRoute(
          profileByCode.uid,
          profileByCode.stripeAccountId,
          profileByCode.displayName || directName
        );
        if (resolved) return resolved;
      }
    }

    const agfMetadata = parseAgfMetadata(payment.descricao);
    const agfPersonalRef = String(agfMetadata?.personalRef || '').trim();
    if (agfPersonalRef) {
      const personalDoc = await firestoreService.getUserDocument(agfPersonalRef);
      const destinationFromDoc = String(personalDoc?.stripeAccountId || '').trim();
      if (destinationFromDoc) {
        const resolved = await resolveAndValidateRoute(
          agfPersonalRef,
          destinationFromDoc,
          personalDoc?.displayName || agfMetadata?.personalName || directName
        );
        if (resolved) return resolved;
      }
      const profileByCode = await firestoreService.getPersonalProfileByCode(agfPersonalRef);
      if (profileByCode?.uid && profileByCode?.stripeAccountId) {
        const resolved = await resolveAndValidateRoute(
          profileByCode.uid,
          profileByCode.stripeAccountId,
          profileByCode.displayName || agfMetadata?.personalName || directName
        );
        if (resolved) return resolved;
      }
    }

    const candidateNames = [
      directName,
      String(payment.personalDisplayName || ''),
      String(agfMetadata?.personalName || ''),
    ]
      .map((item) => item.trim())
      .filter((item) => item && normalizeText(item) !== 'personal');

    const uniqueNormalized = Array.from(new Set(candidateNames.map((item) => normalizeText(item))));
    if (!uniqueNormalized.length) return null;
    for (const normalizedCandidate of uniqueNormalized) {
      const cacheByNameKey = `name:${normalizedCandidate}`;
      if (resolvedPersonalCacheRef.current[cacheByNameKey]) {
        return resolvedPersonalCacheRef.current[cacheByNameKey];
      }
    }

    const personals = await firestoreService.fetchPersonals(120);
    for (const normalizedCandidate of uniqueNormalized) {
      const matched = personals.find((item) => {
        const display = normalizeText(item.displayName);
        return (
          display === normalizedCandidate ||
          display.includes(normalizedCandidate) ||
          normalizedCandidate.includes(display)
        );
      });
      if (!matched?.uid || !matched?.stripeAccountId) continue;
      const resolved = await resolveAndValidateRoute(
        matched.uid,
        matched.stripeAccountId,
        matched.displayName || candidateNames[0] || 'Personal'
      );
      if (!resolved) continue;
      resolvedPersonalCacheRef.current[`name:${normalizedCandidate}`] = resolved;
      return resolved;
    }

    return null;
  }, []);

  const handlePayWithStripe = useCallback(
    async (payment: PaymentRecord) => {
      if (processingPaymentId) return;
      if (!user?.uid) return;

      if (payment.checkoutUrl) {
        const opened = await handleOpenPayment(payment.checkoutUrl);
        if (opened) return;
      }

      if (!stripeReady) {
        showAlert(
          'Stripe',
          'Stripe nao configurado no app. Defina EXPO_PUBLIC_STRIPE_FUNCTIONS_URL ou EXPO_PUBLIC_API_URL.'
        );
        return;
      }

      const amountValue = Number(payment.valorDaCombranca || 0);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        showAlert('Pagamento', 'Valor da cobrança inválido para gerar checkout.');
        return;
      }

      setProcessingPaymentId(payment.id);
      try {
        let personalRoute: ResolvedPersonalRoute | null = null;
        const hasDirectRoute =
          String(payment.personalId || '').trim().length > 0 &&
          String(payment.destinationAccountId || '').trim().length > 0;

        if (hasDirectRoute) {
          personalRoute = {
            personalId: String(payment.personalId || '').trim(),
            destinationAccountId: String(payment.destinationAccountId || '').trim(),
            personalDisplayName: String(payment.personalDisplayName || 'Personal'),
          };
        } else {
          personalRoute = await resolvePersonalRouteForPayment(payment);
        }

        if (!personalRoute) {
          showAlert(
            'Pagamento',
            'Não foi possível identificar a conta Stripe do personal. Abra o MH Agenda Fit ou peça ao personal para reenviar a cobrança.'
          );
          return;
        }

        const amountInCents = Math.round(amountValue * 100);
        const feeInCents = Math.round(amountInCents * STRIPE_FEE_RATE);
        const checkoutResult = await createStripeCheckoutSession({
          amount: amountInCents,
          currency: 'brl',
          studentId: user.uid,
          personalId: personalRoute.personalId,
          paymentId: payment.id,
          destinationAccountId: personalRoute.destinationAccountId,
          applicationFeeAmount: feeInCents,
          description: sanitizePaymentTitle(payment.descricao),
          returnPath: '/financeiro/aluno',
        });

        if (checkoutResult.error) {
          showAlert('Stripe', checkoutResult.error);
          return;
        }
        if (!checkoutResult.data?.checkoutUrl) {
          showAlert('Stripe', 'O backend nao retornou a URL do checkout.');
          return;
        }

        const checkoutData = checkoutResult.data;
        await updatePaymentForUser(user.uid, payment.id, {
          personalId: personalRoute.personalId,
          destinationAccountId: personalRoute.destinationAccountId,
          personalDisplayName: personalRoute.personalDisplayName,
          studentId: user.uid,
          origem: payment.origem || 'financeiro-aluno',
          checkoutUrl: checkoutData.checkoutUrl,
          stripeSessionId: checkoutData.sessionId,
          stripePaymentIntentId: checkoutData.paymentIntentId,
          stripeStatus: checkoutData.status,
        });

        setPayments((prev) =>
          prev.map((item) =>
            item.id === payment.id
              ? {
                  ...item,
                  personalId: personalRoute.personalId,
                  destinationAccountId: personalRoute.destinationAccountId,
                  personalDisplayName: personalRoute.personalDisplayName,
                  studentId: user.uid,
                  checkoutUrl: checkoutData.checkoutUrl,
                  stripeSessionId: checkoutData.sessionId,
                  stripePaymentIntentId: checkoutData.paymentIntentId,
                  stripeStatus: checkoutData.status,
                }
              : item
          )
        );

        const opened = await handleOpenPayment(checkoutData.checkoutUrl);
        if (!opened) {
          showAlert('Pagamento', 'Não foi possível abrir o checkout Stripe agora.');
        }
      } catch (error: any) {
        showAlert('Stripe', error?.message || 'Falha ao gerar checkout Stripe.');
      } finally {
        setProcessingPaymentId(null);
      }
    },
    [processingPaymentId, user?.uid, handleOpenPayment, resolvePersonalRouteForPayment, stripeReady]
  );

  return (
    <LinearGradient
      colors={[CLEAN_SURFACE, CLEAN_SURFACE, CLEAN_SURFACE]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: spacing['3xl'] }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void loadPayments('refresh')} />
          }
        >
          <View style={{ paddingHorizontal: padding }}>
            <View style={[styles.headerRow, { marginTop: spacing.sm }]}>
              <View>
                <Text style={[{ color: colors.text }, typography.headlineLarge]}>Financeiro</Text>
                <Text style={[{ color: colors.textSecondary, marginTop: spacing.xs }, typography.bodySmall]}>
                  Cobrancas, vencimentos e pagamento Stripe em um unico painel.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.headerAction, { borderRadius: borderRadius.full }]}
                onPress={() => router.push('/financeiro/plans')}
              >
                <Ionicons name="diamond-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <LinearGradient
              colors={[CLEAN_SURFACE, CLEAN_SURFACE, CLEAN_SURFACE]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.heroCard, { borderRadius: borderRadius.lg, marginTop: spacing.md, borderColor: CLEAN_BORDER }]}
            >
              <View style={styles.heroGlow} />
              <View style={styles.heroStatsRow}>
                <View style={[styles.heroMetricCard, { borderRadius: borderRadius.md }]}>
                  <Text style={[styles.heroMetricLabel, typography.labelSmall]}>Total pendente</Text>
                  <Text style={[styles.heroMetricValue, typography.titleLarge]}>
                    {formatCurrency(totalPendente)}
                  </Text>
                </View>
                <View style={[styles.heroMetricCard, { borderRadius: borderRadius.md }]}>
                  <Text style={[styles.heroMetricLabel, typography.labelSmall]}>Proximo vencimento</Text>
                  <Text style={[styles.heroMetricValue, typography.titleLarge]}>
                    {proximoVencimento ? `Dia ${proximoVencimento}` : '-'}
                  </Text>
                </View>
                <View style={[styles.heroMetricCard, { borderRadius: borderRadius.md }]}>
                  <Text style={[styles.heroMetricLabel, typography.labelSmall]}>Cobrancas abertas</Text>
                  <Text style={[styles.heroMetricValue, typography.titleLarge]}>
                    {paymentsOpenCount}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <View style={[styles.methodsWrap, { marginTop: spacing.md }]}>
              <Text style={[{ color: colors.text }, typography.titleSmall]}>Metodos de pagamento</Text>
              <View style={[styles.methodRow, { marginTop: spacing.sm }]}>
                <View style={[styles.methodCard, { borderRadius: borderRadius.md }]}>
                  <Ionicons name="card-outline" size={18} color={colors.primary} />
                  <View style={styles.methodCopy}>
                    <Text style={[styles.methodTitle, typography.labelMedium]}>Stripe Checkout</Text>
                    <Text style={[styles.methodSubtitle, typography.bodySmall]}>
                      {stripeReady ? 'Pagamento online ativo' : 'Configure Stripe no app'}
                    </Text>
                  </View>
                </View>
                <View style={[styles.methodCard, { borderRadius: borderRadius.md }]}>
                  <Ionicons name="flash-outline" size={18} color="#4ADE80" />
                  <View style={styles.methodCopy}>
                    <Text style={[styles.methodTitle, typography.labelMedium]}>Pix</Text>
                    <Text style={[styles.methodSubtitle, typography.bodySmall]}>
                      {user?.chavePixDoPersonal || 'Solicite a chave ao personal'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View style={{ marginTop: spacing.md, paddingHorizontal: padding }}>
            {loading ? (
              <View style={[styles.loadingCard, { borderRadius: borderRadius.lg }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[{ color: colors.textSecondary, marginTop: spacing.sm }, typography.bodySmall]}>
                  Carregando cobranças...
                </Text>
              </View>
            ) : orderedPayments.length === 0 ? (
              <View style={[styles.loadingCard, { borderRadius: borderRadius.lg }]}>
                <Ionicons name="wallet-outline" size={48} color={colors.textMuted} />
                <Text style={[{ color: colors.textSecondary, marginTop: spacing.sm }, typography.bodyMedium]}>
                  Nenhuma cobrança encontrada.
                </Text>
              </View>
            ) : (
              orderedPayments.map((item) => {
                const paid = isPaymentPaid(item);
                const statusColor = paid ? '#36D399' : '#F59E0B';
                const isProcessing = processingPaymentId === item.id;
                const canDirectPay = Boolean(item.checkoutUrl);
                const canTryGenerate = !paid && !canDirectPay && stripeReady;
                const dueDay = item.todoDiaDoMes || item.diaDoPagamento || '-';

                return (
                  <LinearGradient
                    key={item.id}
                    colors={[CLEAN_SURFACE, CLEAN_SURFACE, CLEAN_SURFACE]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.paymentCard, { borderRadius: borderRadius.lg, marginBottom: spacing.sm }]}
                  >
                    <View style={styles.paymentTopRow}>
                      <View style={styles.paymentTitleRow}>
                        <Ionicons
                          name={paid ? 'checkmark-circle' : 'alert-circle'}
                          size={18}
                          color={statusColor}
                        />
                        <Text style={[styles.paymentTitle, typography.titleSmall]} numberOfLines={2}>
                          {sanitizePaymentTitle(item.descricao)}
                        </Text>
                      </View>
                      <Text style={[styles.paymentAmount, typography.titleSmall]}>
                        {formatCurrency(item.valorDaCombranca || 0)}
                      </Text>
                    </View>

                    <View style={styles.paymentMetaRow}>
                      <Text style={[styles.paymentMetaText, typography.bodySmall]}>Vencimento dia {dueDay}</Text>
                      <View style={[styles.statusPill, { borderColor: `${statusColor}88` }]}>
                        <Text style={[styles.statusPillText, typography.labelSmall, { color: statusColor }]}>
                          {paid ? 'Pago' : 'Pendente'}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.paymentPersonalText, typography.bodySmall]} numberOfLines={1}>
                      Personal: {extractPersonalLabel(item)}
                    </Text>

                    <Text style={[styles.paymentStripeText, typography.bodySmall]}>
                      Stripe: {formatStripeStatus(item.stripeStatus)}
                    </Text>

                    {!paid ? (
                      <View style={[styles.paymentActionColumn, { marginTop: spacing.sm }]}>
                        <TouchableOpacity
                          style={[
                            styles.stripeButton,
                            {
                              borderRadius: borderRadius.full,
                              borderColor: canDirectPay || canTryGenerate ? colors.primary : CLEAN_BORDER,
                              backgroundColor:
                                canDirectPay || canTryGenerate ? `${colors.primary}12` : CLEAN_SURFACE_ALT,
                            },
                          ]}
                          onPress={() => void handlePayWithStripe(item)}
                          disabled={isProcessing || (!canDirectPay && !canTryGenerate)}
                        >
                          {isProcessing ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <>
                              <Ionicons
                                name="card-outline"
                                size={16}
                                color={canDirectPay || canTryGenerate ? colors.primary : colors.textMuted}
                              />
                              <Text
                                style={[
                                  styles.stripeButtonText,
                                  typography.labelMedium,
                                  {
                                    color:
                                      canDirectPay || canTryGenerate ? colors.primary : colors.textMuted,
                                  },
                                ]}
                              >
                                {canDirectPay ? 'Pagar com Stripe' : 'Gerar checkout Stripe'}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>

                        {!canDirectPay ? (
                          <TouchableOpacity
                            style={[styles.secondaryAction, { borderRadius: borderRadius.full }]}
                            onPress={() => router.push('/mh-agenda-fit' as any)}
                          >
                            <Ionicons name="calendar-outline" size={14} color={colors.text} />
                            <Text style={[styles.secondaryActionText, typography.labelSmall]}>
                              Abrir MH Agenda Fit
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                  </LinearGradient>
                );
              })
            )}
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
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  headerAction: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E3E7',
    backgroundColor: '#F8FAFC',
  },
  heroCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#E0E3E7',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    right: -40,
    top: -32,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#EEF3F8',
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heroMetricCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E3E7',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  heroMetricLabel: {
    color: '#57636C',
  },
  heroMetricValue: {
    marginTop: 4,
    color: '#14181B',
    fontWeight: '800',
  },
  methodsWrap: {
    borderWidth: 1,
    borderColor: '#E0E3E7',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 16,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  methodCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E3E7',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  methodCopy: {
    flex: 1,
  },
  methodTitle: {
    color: '#14181B',
  },
  methodSubtitle: {
    marginTop: 2,
    color: '#57636C',
  },
  loadingCard: {
    borderWidth: 1,
    borderColor: '#E0E3E7',
    backgroundColor: '#FFFFFF',
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  paymentCard: {
    borderWidth: 1,
    borderColor: '#E0E3E7',
    padding: 14,
  },
  paymentTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  paymentTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 6,
  },
  paymentTitle: {
    color: '#14181B',
    flex: 1,
  },
  paymentAmount: {
    color: '#14181B',
    fontWeight: '800',
  },
  paymentMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  paymentMetaText: {
    color: '#57636C',
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#F8FAFC',
  },
  statusPillText: {
    fontWeight: '700',
  },
  paymentStripeText: {
    marginTop: 6,
    color: '#57636C',
  },
  paymentPersonalText: {
    marginTop: 6,
    color: '#57636C',
  },
  paymentActionColumn: {
    gap: 8,
  },
  stripeButton: {
    minHeight: 44,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  stripeButtonText: {
    fontWeight: '700',
  },
  secondaryAction: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#E0E3E7',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secondaryActionText: {
    color: '#14181B',
    fontWeight: '700',
  },
});
