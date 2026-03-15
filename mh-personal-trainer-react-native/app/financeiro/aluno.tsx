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
  API_BASE_URL,
  createStripeCheckoutSession,
  fetchStripeConnectStatus,
  formatCurrency,
  isStripeReady,
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

export default function FinanceiroAlunoScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { padding } = useResponsive();
  const { user } = useAuthStore();

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);
  const resolvedPersonalCacheRef = useRef<Record<string, ResolvedPersonalRoute>>({});

  const stripeReady = isStripeReady();

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
          `Stripe nao configurado no app. Defina EXPO_PUBLIC_STRIPE_FUNCTIONS_URL ou EXPO_PUBLIC_API_URL. API atual: ${API_BASE_URL || 'nao definida'}.`
        );
        return;
      }

      const amountValue = Number(payment.valorDaCombranca || 0);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        showAlert('Pagamento', 'Valor da cobranca invalido para gerar checkout.');
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
            'Nao foi possivel identificar a conta Stripe do personal. Abra o MH Agenda Fit ou peca ao personal para reenviar a cobranca.'
          );
          return;
        }

        const amountInCents = Math.round(amountValue * 100);
        const checkoutResult = await createStripeCheckoutSession({
          amount: amountInCents,
          currency: 'brl',
          studentId: user.uid,
          personalId: personalRoute.personalId,
          paymentId: payment.id,
          destinationAccountId: personalRoute.destinationAccountId,
          description: sanitizePaymentTitle(payment.descricao),
        });

        if (checkoutResult.error || !checkoutResult.data?.checkoutUrl) {
          showAlert('Stripe', checkoutResult.error || 'Nao foi possivel gerar o checkout Stripe.');
          return;
        }

        await updatePaymentForUser(user.uid, payment.id, {
          checkoutUrl: checkoutResult.data.checkoutUrl,
          stripeSessionId: checkoutResult.data.sessionId,
          stripePaymentIntentId: checkoutResult.data.paymentIntentId,
          stripeStatus: checkoutResult.data.status || 'pending',
          personalId: personalRoute.personalId,
          destinationAccountId: personalRoute.destinationAccountId,
          personalDisplayName: personalRoute.personalDisplayName,
          studentId: user.uid,
          origem: payment.origem || 'financeiro-aluno',
        });

        setPayments((prev) =>
          prev.map((item) =>
            item.id === payment.id
              ? {
                  ...item,
                  checkoutUrl: checkoutResult.data?.checkoutUrl,
                  stripeSessionId: checkoutResult.data?.sessionId,
                  stripePaymentIntentId: checkoutResult.data?.paymentIntentId,
                  stripeStatus: checkoutResult.data?.status || 'pending',
                  personalId: personalRoute.personalId,
                  destinationAccountId: personalRoute.destinationAccountId,
                  personalDisplayName: personalRoute.personalDisplayName,
                  studentId: user.uid,
                }
              : item
          )
        );

        const opened = await handleOpenPayment(checkoutResult.data.checkoutUrl);
        if (!opened) {
          showAlert('Pagamento', 'Checkout gerado, mas nao foi possivel abrir automaticamente.');
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
      colors={['#0A1019', '#111E2F', '#192B43']}
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
                <Text style={[{ color: '#F6FBFF' }, typography.headlineLarge]}>Financeiro</Text>
                <Text style={[{ color: 'rgba(224,236,247,0.84)', marginTop: spacing.xs }, typography.bodySmall]}>
                  Cobrancas, vencimentos e pagamento Stripe em um unico painel.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.headerAction, { borderRadius: borderRadius.full }]}
                onPress={() => router.push('/financeiro/plans')}
              >
                <Ionicons name="diamond-outline" size={18} color="#194784" />
              </TouchableOpacity>
            </View>

            <LinearGradient
              colors={['#0B1A2C', '#123051', '#1B476F']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.heroCard, { borderRadius: borderRadius.lg, marginTop: spacing.md }]}
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
              <Text style={[{ color: '#F0F7FD' }, typography.titleSmall]}>Metodos de pagamento</Text>
              <View style={[styles.methodRow, { marginTop: spacing.sm }]}>
                <View style={[styles.methodCard, { borderRadius: borderRadius.md }]}>
                  <Ionicons name="card-outline" size={18} color="#99D8FF" />
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
                <Text style={[{ color: '#C7DBEB', marginTop: spacing.sm }, typography.bodySmall]}>
                  Carregando cobrancas...
                </Text>
              </View>
            ) : orderedPayments.length === 0 ? (
              <View style={[styles.loadingCard, { borderRadius: borderRadius.lg }]}>
                <Ionicons name="wallet-outline" size={48} color="rgba(199,219,235,0.6)" />
                <Text style={[{ color: '#C7DBEB', marginTop: spacing.sm }, typography.bodyMedium]}>
                  Nenhuma cobranca encontrada.
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
                    colors={paid ? ['#0E2C22', '#123729', '#164734'] : ['#1A1110', '#271816', '#38211E']}
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
                              borderColor: canDirectPay || canTryGenerate ? '#194784' : 'rgba(196,210,223,0.22)',
                              backgroundColor:
                                canDirectPay || canTryGenerate ? 'rgba(25,71,132,0.16)' : 'rgba(10,17,28,0.24)',
                            },
                          ]}
                          onPress={() => void handlePayWithStripe(item)}
                          disabled={isProcessing || (!canDirectPay && !canTryGenerate)}
                        >
                          {isProcessing ? (
                            <ActivityIndicator size="small" color="#194784" />
                          ) : (
                            <>
                              <Ionicons
                                name="card-outline"
                                size={16}
                                color={canDirectPay || canTryGenerate ? '#194784' : 'rgba(185,204,221,0.55)'}
                              />
                              <Text
                                style={[
                                  styles.stripeButtonText,
                                  typography.labelMedium,
                                  {
                                    color:
                                      canDirectPay || canTryGenerate ? '#DFF2FF' : 'rgba(185,204,221,0.55)',
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
                            <Ionicons name="calendar-outline" size={14} color="#FFD8C7" />
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
    borderColor: 'rgba(25,71,132,0.32)',
    backgroundColor: 'rgba(21,53,80,0.5)',
  },
  heroCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(186,223,247,0.2)',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    right: -40,
    top: -32,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(117,196,255,0.14)',
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heroMetricCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(186,223,247,0.22)',
    backgroundColor: 'rgba(6,14,24,0.48)',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  heroMetricLabel: {
    color: 'rgba(208,231,247,0.82)',
  },
  heroMetricValue: {
    marginTop: 4,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  methodsWrap: {
    borderWidth: 1,
    borderColor: 'rgba(186,223,247,0.16)',
    backgroundColor: 'rgba(6,14,24,0.4)',
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
    borderColor: 'rgba(186,223,247,0.22)',
    backgroundColor: 'rgba(7,16,28,0.55)',
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
    color: '#E6EEF8',
  },
  methodSubtitle: {
    marginTop: 2,
    color: 'rgba(201,224,242,0.76)',
  },
  loadingCard: {
    borderWidth: 1,
    borderColor: 'rgba(186,223,247,0.18)',
    backgroundColor: 'rgba(7,16,28,0.56)',
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  paymentCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
    color: '#F6FBFF',
    flex: 1,
  },
  paymentAmount: {
    color: '#B9E5FF',
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
    color: 'rgba(221,234,247,0.82)',
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(7,16,28,0.28)',
  },
  statusPillText: {
    fontWeight: '700',
  },
  paymentStripeText: {
    marginTop: 6,
    color: 'rgba(199,216,232,0.78)',
  },
  paymentPersonalText: {
    marginTop: 6,
    color: '#E6EEF8',
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
    borderColor: 'rgba(255,198,173,0.32)',
    backgroundColor: 'rgba(76,33,28,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secondaryActionText: {
    color: '#FFD8C7',
    fontWeight: '700',
  },
});


