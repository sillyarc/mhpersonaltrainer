import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useAuthStore } from '../../src/store/authStore';
import { firestoreService, Aluno } from '../../src/services/firestoreService';
import { createPaymentForUser, fetchPaymentsForUser, updatePaymentForUser } from '../../src/services/financeiro';
import { PaymentRecord } from '../../src/types/finance';
import { Button, Card, Input, SearchableSelect } from '../../src/components/common';
import {
  formatCurrency,
  fetchStripeConnectStatus,
  createStripeCheckoutSession,
  StripeConnectStatus,
} from '../../src/services/payments';

const STRIPE_FEE_RATE = 0.1;

export default function FinanceiroPersonalScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { padding, columns, isDesktop } = useResponsive();
  const { role, user } = useAuthStore();
  const { studentId, descricao: descricaoParam, valor: valorParam } = useLocalSearchParams<{
    studentId?: string;
    descricao?: string;
    valor?: string;
  }>();
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(Boolean(studentId || descricaoParam || valorParam));
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [repetirMeses, setRepetirMeses] = useState('');
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [stripeStatusLoading, setStripeStatusLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';
  const stripeReady =
    Boolean(process.env.EXPO_PUBLIC_STRIPE_FUNCTIONS_URL) ||
    (Boolean(apiUrl) && !apiUrl.includes('api.stripe.com'));

  const isPersonal = role === 'personal' || role === 'professor';
  const targetUserId = isPersonal ? selectedStudentId : user?.uid;
  const isFocusedStudent = !!studentId;

  useEffect(() => {
    if (!isPersonal || !user?.uid) return;
    const loadStudents = async () => {
      const alunos = await firestoreService.getAlunosDoPersonal(user.uid);
      setStudents(alunos);
      if (!selectedStudentId && !studentId && alunos.length > 0) {
        setSelectedStudentId(alunos[0].id);
      }
    };
    loadStudents();
  }, [isPersonal, user?.uid, studentId]);

  useEffect(() => {
    if (studentId) {
      setSelectedStudentId(studentId);
      setShowForm(true);
    }
  }, [studentId]);

  useEffect(() => {
    if (descricaoParam) {
      setDescricao(String(descricaoParam));
      setShowForm(true);
    }
  }, [descricaoParam]);

  useEffect(() => {
    if (valorParam) {
      setValor(String(valorParam));
      setShowForm(true);
    }
  }, [valorParam]);

  const loadPayments = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
      if (!targetUserId) {
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
        const result = await fetchPaymentsForUser(targetUserId);
        setPayments(result.data || []);
      } finally {
        if (mode === 'initial') {
          setLoading(false);
        } else if (mode === 'refresh') {
          setRefreshing(false);
        }
      }
    },
    [targetUserId]
  );

  useEffect(() => {
    loadPayments('initial');
  }, [loadPayments]);

  useEffect(() => {
    if (!isPersonal || !user?.uid || !stripeReady) return;
    let active = true;
    setStripeStatusLoading(true);
    fetchStripeConnectStatus(user.uid, user.stripeAccountId)
      .then((result) => {
        if (!active) return;
        setStripeStatus(result.data);
      })
      .catch(() => {
        if (!active) return;
        setStripeStatus(null);
      })
      .finally(() => {
        if (!active) return;
        setStripeStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isPersonal, stripeReady, user?.uid, user?.stripeAccountId]);

  const totalPendente = useMemo(() => {
    return payments
      .filter((item) => !item.pago)
      .reduce((sum, item) => sum + (item.valorDaCombranca || 0), 0);
  }, [payments]);

  const totalRecebido = useMemo(() => {
    return payments
      .filter((item) => item.pago)
      .reduce((sum, item) => sum + (item.valorDaCombranca || 0), 0);
  }, [payments]);

  const proximoVencimento = useMemo(() => {
    const dias = payments
      .filter((item) => !item.pago && item.todoDiaDoMes)
      .map((item) => item.todoDiaDoMes as number)
      .sort((a, b) => a - b);
    return dias.length ? dias[0] : null;
  }, [payments]);

  const taxaPlataforma = totalPendente * STRIPE_FEE_RATE;
  const liquidoEstimado = Math.max(totalPendente - taxaPlataforma, 0);

  const hasStripeStatus = Boolean(stripeStatus);
  const stripeConnected = hasStripeStatus
    ? Boolean(stripeStatus?.chargesEnabled) && stripeStatus?.detailsSubmitted !== false
    : !!user?.stripeAccountId || !!user?.stripeAtivo;

  const focusedStudent = students.find((student) => student.id === selectedStudentId) || null;
  const studentOptions = students.map((student) => ({
    id: student.id,
    label: student.nome,
    description: student.email,
  }));

  const stripeStatusText = stripeStatusLoading
    ? 'Verificando Stripe...'
    : !stripeReady
    ? 'Stripe não configurado'
    : stripeConnected
    ? 'Conectado para receber pagamentos'
    : stripeStatus?.requirements?.disabledReason
    ? `Conta incompleta: ${stripeStatus.requirements.disabledReason}`
    : 'Conectar Stripe para cobrar alunos';
  const stripeIcon = stripeStatusLoading
    ? 'time-outline'
    : !stripeReady
    ? 'alert-circle-outline'
    : stripeConnected
    ? 'checkmark-circle-outline'
    : 'card-outline';
  const stripeBadgeColor = stripeStatusLoading
    ? colors.primary + '15'
    : !stripeReady
    ? colors.warning + '20'
    : stripeConnected
    ? colors.success + '20'
    : colors.primary + '20';
  const stripeIconColor = stripeStatusLoading
    ? colors.primary
    : !stripeReady
    ? colors.warning
    : stripeConnected
    ? colors.success
    : colors.primary;

  const summaryCards = [
    {
      id: 'pendente',
      label: 'Total pendente',
      value: formatCurrency(totalPendente),
      icon: 'alert-circle-outline',
      color: colors.warning,
    },
    {
      id: 'recebido',
      label: 'Recebido',
      value: formatCurrency(totalRecebido),
      icon: 'checkmark-circle-outline',
      color: colors.success,
    },
    {
      id: 'taxa',
      label: 'Taxa MH (10%)',
      value: formatCurrency(taxaPlataforma),
      icon: 'cash-outline',
      color: colors.tertiary,
    },
    {
      id: 'liquido',
      label: 'Liquido estimado',
      value: formatCurrency(liquidoEstimado),
      icon: 'wallet-outline',
      color: colors.primary,
    },
  ];

  const handleSave = async () => {
    if (isSaving) return;
    if (!targetUserId) {
      showAlert('Atenção', 'Selecione um aluno para salvar a cobrança.');
      return;
    }
    if (!descricao.trim()) {
      showAlert('Atenção', 'Informe a descrição da cobrança.');
      return;
    }
    const valorNumero = Number(valor.replace(',', '.'));
    if (Number.isNaN(valorNumero) || valorNumero <= 0) {
      showAlert('Atenção', 'Informe um valor válido.');
      return;
    }
    const diaNumero = Number(vencimento);
    if (Number.isNaN(diaNumero) || diaNumero < 1 || diaNumero > 31) {
      showAlert('Atenção', 'Informe o dia do vencimento (1-31).');
      return;
    }
    const repetirNumero = repetirMeses ? Number(repetirMeses) : 0;
    if (Number.isNaN(repetirNumero) || repetirNumero < 0) {
      showAlert('Atenção', 'Informe um número válido para repetir.');
      return;
    }
    setIsSaving(true);
    try {
      const paymentResult = await createPaymentForUser(targetUserId, {
        descricao: descricao.trim(),
        valorDaCombranca: valorNumero,
        todoDiaDoMes: diaNumero,
        repetirPMes: repetirNumero,
        pago: false,
        diaDoPagamento: diaNumero,
        studentId: targetUserId,
        personalId: user?.uid,
        destinationAccountId: user?.stripeAccountId,
        personalDisplayName: user?.displayName || 'Personal',
        origem: 'financeiro-personal',
      });
      if (paymentResult.error) {
        showAlert('Erro', paymentResult.error);
        return;
      }

      if (
        stripeReady &&
        stripeConnected &&
        user?.uid &&
        user?.stripeAccountId &&
        paymentResult.data
      ) {
        const amountInCents = Math.round(valorNumero * 100);
        const feeInCents = Math.round(amountInCents * STRIPE_FEE_RATE);
        const checkoutResult = await createStripeCheckoutSession({
          amount: amountInCents,
          currency: 'brl',
          studentId: targetUserId,
          personalId: user.uid,
          paymentId: paymentResult.data.id,
          destinationAccountId: user.stripeAccountId,
          applicationFeeAmount: feeInCents,
          description: descricao.trim(),
        });

        if (checkoutResult.error) {
          showAlert('Stripe', checkoutResult.error);
        }
        if (checkoutResult.data) {
          await updatePaymentForUser(targetUserId, paymentResult.data.id, {
            checkoutUrl: checkoutResult.data.checkoutUrl,
            stripeSessionId: checkoutResult.data.sessionId,
            stripePaymentIntentId: checkoutResult.data.paymentIntentId,
            stripeStatus: checkoutResult.data.status,
          });
        }
      }
      setDescricao('');
      setValor('');
      setVencimento('');
      setRepetirMeses('');
      setShowForm(false);
      loadPayments('silent');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePaid = async (payment: PaymentRecord) => {
    if (!targetUserId) return;
    await updatePaymentForUser(targetUserId, payment.id, {
      pago: !payment.pago,
    });
    loadPayments('silent');
  };

  const handleStripeSetup = () => {
    if (stripeStatusLoading) {
      showAlert('Stripe', 'Aguarde, estamos verificando sua conta Stripe.');
      return;
    }
    if (!stripeReady) {
      showAlert(
        'Stripe',
        'Configure EXPO_PUBLIC_STRIPE_FUNCTIONS_URL (ou API URL valido) e EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY para ativar o Stripe.'
      );
      return;
    }
    if (!stripeConnected) {
      showAlert('Stripe', 'Conecte sua conta Stripe no painel do personal para receber pagamentos.');
      return;
    }
    showAlert('Stripe', 'Sua conta Stripe ja esta conectada.');
  };

  const handleChargeWithStripe = async (payment: PaymentRecord) => {
    if (!stripeReady) {
      showAlert('Stripe', 'Stripe ainda não configurado. Defina a API e a chave pública para ativar pagamentos.');
      return;
    }
    if (!stripeConnected) {
      showAlert('Stripe', 'Conecte sua conta Stripe antes de cobrar o aluno.');
      return;
    }
    if (!user?.uid || !user?.stripeAccountId || !targetUserId) {
      showAlert('Stripe', 'Nao foi possivel identificar sua conta ou aluno.');
      return;
    }
    if (!payment.valorDaCombranca) {
      showAlert('Stripe', 'Informe o valor da cobrança.');
      return;
    }
    if (payment.checkoutUrl) {
      showAlert('Stripe', 'Link de pagamento já foi gerado para esta cobrança.');
      return;
    }
    const amountInCents = Math.round(payment.valorDaCombranca * 100);
    const feeInCents = Math.round(amountInCents * STRIPE_FEE_RATE);
    const checkoutResult = await createStripeCheckoutSession({
      amount: amountInCents,
      currency: 'brl',
      studentId: targetUserId,
      personalId: user.uid,
      paymentId: payment.id,
      destinationAccountId: user.stripeAccountId,
      applicationFeeAmount: feeInCents,
      description: payment.descricao || 'Cobrança',
    });
    if (checkoutResult.error) {
      showAlert('Stripe', checkoutResult.error);
      return;
    }
    if (checkoutResult.data) {
      await updatePaymentForUser(targetUserId, payment.id, {
        checkoutUrl: checkoutResult.data.checkoutUrl,
        stripeSessionId: checkoutResult.data.sessionId,
        stripePaymentIntentId: checkoutResult.data.paymentIntentId,
        stripeStatus: checkoutResult.data.status,
      });
      loadPayments('silent');
      showAlert('Stripe', 'Link de pagamento gerado para o aluno.');
    }
  };

  const renderPayment = ({ item }: { item: PaymentRecord }) => {
    const statusColor = item.pago ? colors.success : colors.warning;
    const dueDay = item.todoDiaDoMes || item.diaDoPagamento;
    const hasCheckout = Boolean(item.checkoutUrl);

    return (
      <Card
        style={[
          styles.paymentCard,
          {
            backgroundColor: colors.secondaryBackground,
            borderRadius: borderRadius.lg,
          },
        ]}
        shadow={false}
      >
        <View style={styles.paymentHeader}>
          <View style={styles.paymentTitleRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text
              style={[{ color: colors.primaryText }, typography.titleSmall]}
              numberOfLines={1}
            >
              {item.descricao || 'Cobrança'}
            </Text>
          </View>
          <Text style={[{ color: colors.primary }, typography.titleSmall]}>
            {formatCurrency(item.valorDaCombranca || 0)}
          </Text>
        </View>

        <View style={styles.paymentMetaRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.secondaryText} />
          <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
            Vencimento dia {dueDay || '-'}
          </Text>
          {hasCheckout && (
            <View
              style={[
                styles.inlineBadge,
                { backgroundColor: colors.primary + '15', borderRadius: borderRadius.full },
              ]}
            >
              <Text style={[{ color: colors.primary }, typography.labelSmall]}>Link gerado</Text>
            </View>
          )}
        </View>

        {item.repetirPMes ? (
          <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
            Repetir por {item.repetirPMes} mes(es)
          </Text>
        ) : null}

        <View style={styles.paymentActions}>
          <TouchableOpacity
            style={[styles.statusButton, { borderColor: statusColor, borderRadius: borderRadius.full }]}
            onPress={() => handleTogglePaid(item)}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>
              {item.pago ? 'Pago' : 'Pendente'}
            </Text>
          </TouchableOpacity>
          {!item.pago && (
            <TouchableOpacity
              style={[styles.chargeButton, { borderColor: colors.primary, borderRadius: borderRadius.full }]}
              onPress={() => handleChargeWithStripe(item)}
            >
              <Ionicons name="card-outline" size={16} color={colors.primary} />
              <Text style={[styles.chargeText, { color: colors.primary }]}>Cobrar</Text>
            </TouchableOpacity>
          )}
        </View>
      </Card>
    );
  };

  const renderHeader = () => {
    const subtitle = focusedStudent
      ? `Aluno: ${focusedStudent.nome}`
      : 'Controle de cobranças, pagamentos e links';
    return (
      <View style={{ paddingTop: spacing.lg }}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[{ color: colors.primaryText }, typography.headlineLarge]}>
              Financeiro do aluno
            </Text>
            <Text style={[{ color: colors.secondaryText, marginTop: spacing.xs }, typography.bodySmall]}>
              {subtitle}
            </Text>
          </View>
          {isFocusedStudent ? (
            <TouchableOpacity
              style={[styles.headerButton, { backgroundColor: colors.primary, borderRadius: borderRadius.full }]}
              onPress={() => router.back()}
            >
              <Ionicons name="close" size={22} color={colors.info} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.headerButton, { backgroundColor: colors.primary, borderRadius: borderRadius.full }]}
              onPress={() => setShowForm((prev) => !prev)}
            >
              <Ionicons name={showForm ? 'close' : 'add'} size={22} color={colors.info} />
            </TouchableOpacity>
          )}
        </View>

        {isPersonal && !isFocusedStudent && (
          <Card style={{ marginTop: spacing.md }} shadow={false}>
            <SearchableSelect
              label="Aluno"
              placeholder={students.length ? 'Selecione um aluno' : 'Nenhum aluno encontrado'}
              options={studentOptions}
              value={selectedStudentId}
              onChange={setSelectedStudentId}
              disabled={students.length === 0}
            />
          </Card>
        )}

        <View style={[styles.summaryGrid, { marginTop: spacing.lg }]}>
          {summaryCards.map((item) => (
            <Card
              key={item.id}
              style={[styles.summaryCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}
              shadow={false}
            >
              <View
                style={[
                  styles.summaryIcon,
                  { backgroundColor: item.color + '15', borderRadius: borderRadius.full },
                ]}
              >
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>{item.label}</Text>
              <Text style={[{ color: colors.primaryText, marginTop: spacing.xs }, typography.titleMedium]}>
                {item.value}
              </Text>
            </Card>
          ))}
        </View>

        <View style={[styles.metaRow, { marginTop: spacing.sm }]}>
          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
          <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
            Proximo vencimento: {proximoVencimento ? `Dia ${proximoVencimento}` : '-'}
          </Text>
        </View>

        <Card
          style={[styles.stripeCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg, marginTop: spacing.lg }]}
          shadow={false}
          onPress={handleStripeSetup}
        >
          <View style={styles.stripeInfo}>
            <View style={[styles.stripeBadge, { backgroundColor: stripeBadgeColor }]}>
              <Ionicons name={stripeIcon as any} size={18} color={stripeIconColor} />
            </View>
            <View style={styles.stripeText}>
              <Text style={[{ color: colors.primaryText }, typography.titleSmall]}>Stripe</Text>
              <Text style={[{ color: colors.secondaryText, marginTop: 2 }, typography.bodySmall]}>
                {stripeStatusText}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
        </Card>

        {showForm && (
          <Card
            style={[styles.formCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg, marginTop: spacing.lg }]}
            shadow={false}
          >
            <View style={styles.formHeader}>
              <Text style={[{ color: colors.primaryText }, typography.titleSmall]}>Nova cobrança</Text>
              {!targetUserId && (
                <View style={[styles.inlineBadge, { backgroundColor: colors.warning + '20', borderRadius: borderRadius.full }]}>
                  <Text style={[{ color: colors.warning }, typography.labelSmall]}>Selecione um aluno</Text>
                </View>
              )}
            </View>

            <Input
              label="Descrição"
              placeholder="Ex: Avaliacao fisica"
              value={descricao}
              onChangeText={setDescricao}
              autoCapitalize="sentences"
              disabled={!targetUserId}
            />
            <Input
              label="Valor"
              placeholder="Ex: 150.00"
              keyboardType="numeric"
              value={valor}
              onChangeText={setValor}
              disabled={!targetUserId}
            />
            <Input
              label="Dia do vencimento"
              placeholder="1 a 31"
              keyboardType="numeric"
              value={vencimento}
              onChangeText={setVencimento}
              disabled={!targetUserId}
            />
            <Input
              label="Repetir por meses (opcional)"
              placeholder="Ex: 3"
              keyboardType="numeric"
              value={repetirMeses}
              onChangeText={setRepetirMeses}
              disabled={!targetUserId}
            />

            <Button
              title="Salvar cobrança"
              onPress={handleSave}
              fullWidth
              loading={isSaving}
              disabled={!targetUserId}
              style={{ marginTop: spacing.sm }}
            />
          </Card>
        )}

        <View style={[styles.sectionRow, { marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          <Text style={[{ color: colors.primaryText }, typography.titleLarge]}>Cobranças</Text>
          {payments.length > 0 && (
            <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
              {payments.length} registro(s)
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[styles.listContent, { paddingHorizontal: padding, paddingBottom: spacing['4xl'] }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadPayments('refresh')} />
          }
        >
          {renderHeader()}

          {payments.length === 0 ? (
            <View style={[styles.emptyContainer, { paddingVertical: spacing['4xl'] }]}>
              <Ionicons name="wallet-outline" size={64} color={colors.secondaryText} />
              <Text style={[{ color: colors.secondaryText, marginTop: spacing.md }, typography.bodyLarge]}>
                {loading ? 'Carregando cobranças...' : 'Nenhuma cobrança encontrada'}
              </Text>
            </View>
          ) : (
            <View style={styles.paymentsGrid}>
              {payments.map((payment) => (
                <View
                  key={payment.id}
                  style={[
                    styles.paymentWrapper,
                    { width: isDesktop ? `${100 / columns - 2}%` : '100%' },
                  ]}
                >
                  {renderPayment({ item: payment })}
                </View>
              ))}
            </View>
          )}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  headerButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    flexBasis: '48%',
    padding: 12,
  },
  summaryIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stripeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  stripeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  stripeBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripeText: {
    flex: 1,
  },
  formCard: {
    padding: 16,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listContent: {
    flexGrow: 1,
  },
  paymentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  paymentWrapper: {
    marginBottom: 12,
  },
  paymentCard: {
    padding: 12,
    marginBottom: 12,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  paymentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  inlineBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  paymentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  statusButton: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chargeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  chargeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
