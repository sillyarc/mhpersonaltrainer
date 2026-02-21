import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Image,
} from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { firestoreService, PersonalProfile } from '../../src/services/firestoreService';
import { Button } from '../../src/components/common';
import { createAppointment, getAvailableSlots } from '../../src/services/scheduling';
import { createPaymentForUser, fetchPaymentsForUser, updatePaymentForUser } from '../../src/services/financeiro';
import { createStripeCheckoutSession, fetchStripeConnectStatus, formatCurrency } from '../../src/services/payments';
import { spacing, borderRadius } from '../../src/theme';
import { TimeSlot } from '../../src/types/scheduling';
import { PaymentRecord } from '../../src/types/finance';

const PLATFORM_FEE_RATE = 0.1;
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const startOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const isSameDay = (a: Date, b: Date) =>
  a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

const getMonthCells = (monthDate: Date) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const cells: Array<Date | null> = [];

  for (let i = 0; i < firstDay.getDay(); i++) {
    cells.push(null);
  }
  for (let day = 1; day <= lastDay.getDate(); day++) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
};

const isPaymentPaid = (payment?: PaymentRecord | null) => {
  if (!payment) return false;
  const normalized = String(payment.stripeStatus || '').toLowerCase();
  return (
    payment.pago === true ||
    normalized === 'paid' ||
    normalized === 'pago' ||
    normalized === 'succeeded' ||
    normalized === 'complete' ||
    normalized === 'completed'
  );
};

const toSlotDate = (baseDate: Date, slot: TimeSlot) => {
  const [hoursRaw, minutesRaw] = String(slot.inicio || '00:00').split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const value = new Date(baseDate);
  value.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return value;
};

export default function MHAgendaFitDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const [personal, setPersonal] = useState<PersonalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedServiceIndex, setSelectedServiceIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [currentMonth, setCurrentMonth] = useState(startOfDay(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [validatingPayment, setValidatingPayment] = useState(false);
  const [confirmingAppointment, setConfirmingAppointment] = useState(false);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [pendingCheckoutUrl, setPendingCheckoutUrl] = useState('');

  useEffect(() => {
    if (!id) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      const userDoc = await firestoreService.getUserDocument(id);
      if (!active) return;
      if (userDoc) {
        const toDate = (value?: Date | string) => {
          if (!value) return undefined;
          if (value instanceof Date) return value;
          const parsed = new Date(value);
          return Number.isNaN(parsed.getTime()) ? undefined : parsed;
        };
        const accountId = String(userDoc.stripeAccountId || '').trim();
        let stripeReady = Boolean(userDoc.stripeAtivo);
        if (!stripeReady && accountId) {
          const stripeStatus = await fetchStripeConnectStatus(userDoc.uid, accountId);
          stripeReady = Boolean(stripeStatus.data?.chargesEnabled) && stripeStatus.data?.detailsSubmitted !== false;
        }

        setPersonal({
          id: userDoc.uid,
          uid: userDoc.uid,
          displayName: userDoc.displayName || 'Personal',
          photoUrl: userDoc.photoUrl,
          cidade: userDoc.cidade,
          estado: userDoc.estado,
          especializacao: Array.isArray(userDoc.especializacao)
            ? userDoc.especializacao.join(', ')
            : (userDoc.especializacao as any),
          codigoPersonal: typeof userDoc.codigoPersonal === 'number' ? userDoc.codigoPersonal : undefined,
          stripeAtivo: stripeReady,
          stripeAccountId: accountId || undefined,
          servicos: (userDoc.servicos || []).map((service) => ({
            servicos: service.nome,
            descricao: service.descricao,
            valor: service.preco,
          })),
          horarioAtendimento: userDoc.horarioAtendimento
            ? {
                inicioSegSex: toDate(userDoc.horarioAtendimento.inicioSegSex),
                terminioSegSex: toDate(userDoc.horarioAtendimento.terminioSegSex),
                inicioSab: toDate(userDoc.horarioAtendimento.inicioSab),
                terminioSab: toDate(userDoc.horarioAtendimento.terminioSab),
                inicioDom: toDate(userDoc.horarioAtendimento.inicioDom),
                terminioDom: toDate(userDoc.horarioAtendimento.terminioDom),
              }
            : undefined,
        });
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const loadSlots = async () => {
      setLoadingSlots(true);
      const result = await getAvailableSlots(id, selectedDate);
      if (!active) return;
      setSlots(result.data?.slots || []);
      setLoadingSlots(false);
    };
    loadSlots();
    return () => {
      active = false;
    };
  }, [id, selectedDate]);

  const services = personal?.servicos || [];
  const selectedService = services[selectedServiceIndex];
  const servicePrice = Number(selectedService?.valor || 0);
  const platformFee = servicePrice * PLATFORM_FEE_RATE;
  const personalNet = Math.max(servicePrice - platformFee, 0);

  const bookingKey = useMemo(() => {
    if (!personal?.uid || !selectedService?.servicos || !selectedSlot?.inicio) return '';
    const dateKey = [
      selectedDate.getFullYear(),
      String(selectedDate.getMonth() + 1).padStart(2, '0'),
      String(selectedDate.getDate()).padStart(2, '0'),
    ].join('-');
    return `agf:${personal.uid}:${dateKey}:${selectedSlot.inicio}:${selectedService.servicos}`;
  }, [personal?.uid, selectedDate, selectedService?.servicos, selectedSlot?.inicio]);

  useEffect(() => {
    setPendingPaymentId(null);
    setPendingCheckoutUrl('');
  }, [bookingKey]);

  const slotItems = useMemo(() => {
    const now = new Date();
    const selectedDayStart = startOfDay(selectedDate);
    const todayStart = startOfDay(now);
    const isToday = selectedDayStart.getTime() === todayStart.getTime();

    return slots.map((slot) => {
      const hasPassed = isToday ? toSlotDate(selectedDate, slot).getTime() <= now.getTime() : false;
      const available = slot.disponivel && !hasPassed;
      return {
        ...slot,
        disponivel: available,
      };
    });
  }, [slots, selectedDate]);

  const availableSlotCount = slotItems.filter((slot) => slot.disponivel).length;
  const summaryDate = selectedDate.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const summaryTime = selectedSlot ? `${selectedSlot.inicio} - ${selectedSlot.fim}` : '--';

  const monthLabel = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const monthCells = useMemo(() => getMonthCells(currentMonth), [currentMonth]);
  const today = startOfDay(new Date());

  const ensureSlotStillAvailable = async () => {
    if (!personal?.uid || !selectedSlot) return false;
    const availability = await getAvailableSlots(personal.uid, selectedDate);
    const updatedSlots = availability.data?.slots || [];
    setSlots(updatedSlots);
    const stillAvailable = updatedSlots.some(
      (item) => item.inicio === selectedSlot.inicio && item.disponivel
    );
    if (!stillAvailable) {
      setSelectedSlot(null);
      showAlert('Horario indisponivel', 'Esse horario acabou de ser ocupado. Escolha outro.');
      return false;
    }
    return true;
  };

  const openPaymentLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      showAlert('Erro', 'Nao foi possivel abrir o pagamento agora.');
    }
  };

  const handlePayAndUnlock = async () => {
    if (!user?.uid || !personal || !selectedSlot || !selectedService) {
      showAlert('Atencao', 'Selecione servico, data e horario.');
      return;
    }
    if (servicePrice <= 0) {
      showAlert('Valor invalido', 'Este servico nao possui valor para pagamento.');
      return;
    }
    if (!personal.stripeAccountId || !personal.stripeAtivo) {
      showAlert('Indisponivel', 'Este personal nao esta recebendo pagamentos no momento.');
      return;
    }

    const slotAvailable = await ensureSlotStillAvailable();
    if (!slotAvailable) return;

    setProcessingPayment(true);
    try {
      const paymentDescription = `MH Agenda Fit - ${selectedService.servicos} (${bookingKey})`;
      const paymentCreate = await createPaymentForUser(user.uid, {
        valorDaCombranca: servicePrice,
        todoDiaDoMes: selectedDate.getDate(),
        descricao: paymentDescription,
        pago: false,
        repetirPMes: 0,
        diaDoPagamento: selectedDate.getDate(),
        datas: [new Date()],
        stripeStatus: 'pending',
        studentId: user.uid,
        personalId: personal.uid,
        destinationAccountId: personal.stripeAccountId,
        personalDisplayName: personal.displayName || 'Personal',
        origem: 'mh-agenda-fit',
      });

      if (paymentCreate.error || !paymentCreate.data?.id) {
        showAlert('Erro', paymentCreate.error || 'Nao foi possivel gerar a cobranca.');
        return;
      }

      const amountInCents = Math.round(servicePrice * 100);
      const feeInCents = Math.round(amountInCents * PLATFORM_FEE_RATE);

      const checkout = await createStripeCheckoutSession({
        amount: amountInCents,
        currency: 'brl',
        studentId: user.uid,
        personalId: personal.uid,
        paymentId: paymentCreate.data.id,
        destinationAccountId: personal.stripeAccountId,
        applicationFeeAmount: feeInCents,
        description: `Agendamento ${selectedService.servicos}`,
      });

      if (checkout.error || !checkout.data?.checkoutUrl) {
        showAlert('Erro no pagamento', checkout.error || 'Nao foi possivel abrir o checkout.');
        return;
      }

      await updatePaymentForUser(user.uid, paymentCreate.data.id, {
        checkoutUrl: checkout.data.checkoutUrl,
        stripeSessionId: checkout.data.sessionId,
        stripePaymentIntentId: checkout.data.paymentIntentId,
        stripeStatus: checkout.data.status,
      });

      setPendingPaymentId(paymentCreate.data.id);
      setPendingCheckoutUrl(checkout.data.checkoutUrl);
      await openPaymentLink(checkout.data.checkoutUrl);
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleValidateAndConfirm = async () => {
    if (!user?.uid || !personal || !selectedSlot || !selectedService) {
      showAlert('Atencao', 'Selecione servico, data e horario.');
      return;
    }
    if (!pendingPaymentId) {
      showAlert('Pagamento necessario', 'Finalize o pagamento antes de confirmar o agendamento.');
      return;
    }

    setValidatingPayment(true);
    try {
      const paymentResult = await fetchPaymentsForUser(user.uid);
      if (paymentResult.error || !paymentResult.data) {
        showAlert('Erro', paymentResult.error || 'Nao foi possivel validar o pagamento.');
        return;
      }

      const payment = paymentResult.data.find((item) => item.id === pendingPaymentId) || null;
      if (!isPaymentPaid(payment)) {
        if (payment?.checkoutUrl) {
          setPendingCheckoutUrl(payment.checkoutUrl);
        }
        showAlert('Pagamento pendente', 'Pagamento ainda nao confirmado. Conclua e valide novamente.');
        return;
      }
    } finally {
      setValidatingPayment(false);
    }

    const slotAvailable = await ensureSlotStillAvailable();
    if (!slotAvailable) return;

    setConfirmingAppointment(true);
    try {
      const result = await createAppointment({
        alunoId: user.uid,
        personalId: personal.uid,
        alunoNome: user.displayName || undefined,
        personalNome: personal.displayName,
        data: selectedDate,
        horaInicio: selectedSlot.inicio,
        horaFim: selectedSlot.fim,
        tipo: 'treino',
        status: 'confirmado',
        servico: selectedService.servicos,
        valor: selectedService.valor,
        observacoes: `Pagamento validado: ${pendingPaymentId}`,
      });

      if (result.error) {
        showAlert('Erro', result.error);
        return;
      }

      showAlert('Agendamento confirmado', 'Pagamento validado e horario confirmado.', [
        { text: 'Ok', onPress: () => router.back() },
      ]);
    } finally {
      setConfirmingAppointment(false);
    }
  };

  if (loading || !personal) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Carregando agenda...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const actionInProgress = processingPayment || validatingPayment || confirmingAppointment;
  const canContinueToPayment =
    Boolean(selectedService) &&
    Boolean(selectedSlot) &&
    servicePrice > 0 &&
    Boolean(personal.stripeAtivo) &&
    Boolean(personal.stripeAccountId);
  const hasPendingPayment = Boolean(pendingPaymentId);

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>MH Agenda Fit</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={['#08192D', '#123A60', '#1F6FA5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroGlowPrimary} />
            <View style={styles.heroGlowSecondary} />
            <View style={styles.heroTop}>
              {personal.photoUrl ? (
                <Image source={{ uri: personal.photoUrl }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: 'rgba(22,175,255,0.2)' }]}>
                  <Text style={[styles.avatarText, { color: '#A7E5FF' }]}>
                    {personal.displayName?.[0]?.toUpperCase() || 'P'}
                  </Text>
                </View>
              )}
              <View style={styles.heroInfo}>
                <Text style={styles.heroEyebrow}>PERSONAL DISPONIVEL</Text>
                <Text style={[styles.heroName, { color: '#F3FBFF' }]} numberOfLines={1}>
                  {personal.displayName}
                </Text>
                <Text style={[styles.heroSubtitle, { color: 'rgba(216,237,255,0.9)' }]} numberOfLines={2}>
                  {personal.especializacao || 'Personal trainer'}
                </Text>
                {(personal.cidade || personal.estado) ? (
                  <View style={styles.heroLocationRow}>
                    <Ionicons name="location-outline" size={13} color="#BEE5FF" />
                    <Text style={[styles.heroLocationText, { color: 'rgba(214,236,255,0.9)' }]} numberOfLines={1}>
                      {[personal.cidade, personal.estado].filter(Boolean).join(' - ')}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.heroBadgesRow}>
              <View style={styles.heroBadge}>
                <Ionicons name="shield-checkmark-outline" size={14} color="#8ED6FF" />
                <Text style={styles.heroBadgeText}>Pagamento protegido</Text>
              </View>
              <View style={styles.heroBadge}>
                <Ionicons name="card-outline" size={14} color="#8ED6FF" />
                <Text style={styles.heroBadgeText}>{services.length} servicos</Text>
              </View>
            </View>
          </LinearGradient>

          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.secondaryBackground, borderColor: colors.border },
            ]}
          >
            <View style={styles.sectionHeader}>
              <View style={[styles.stepPill, { backgroundColor: colors.primary + '1A' }]}>
                <Text style={[styles.stepPillText, { color: colors.primary }]}>1</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Escolha o servico</Text>
            </View>
            {services.length === 0 ? (
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>Nenhum servico cadastrado.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.servicesRow}>
                {services.map((service, index) => {
                  const isSelected = index === selectedServiceIndex;
                  return (
                    <TouchableOpacity
                      key={`${service.servicos}-${index}`}
                      onPress={() => setSelectedServiceIndex(index)}
                      style={[
                        styles.serviceCard,
                        {
                          backgroundColor: isSelected ? colors.primary + '20' : colors.surface,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <View style={styles.serviceHeader}>
                        <Text style={[styles.serviceName, { color: colors.text }]} numberOfLines={1}>
                          {service.servicos}
                        </Text>
                        {isSelected ? (
                          <View style={[styles.selectedTag, { backgroundColor: colors.primary }]}>
                            <Text style={[styles.selectedTagText, { color: colors.info }]}>Selecionado</Text>
                          </View>
                        ) : null}
                      </View>
                      {service.descricao ? (
                        <Text style={[styles.serviceDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                          {service.descricao}
                        </Text>
                      ) : (
                        <Text style={[styles.serviceDesc, { color: colors.textMuted }]}>Sem descricao adicional.</Text>
                      )}
                      <Text style={[styles.servicePrice, { color: colors.primary }]}>
                        {formatCurrency(Number(service.valor || 0))}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.secondaryBackground, borderColor: colors.border },
            ]}
          >
            <View style={styles.monthHeader}>
              <View style={styles.sectionHeader}>
                <View style={[styles.stepPill, { backgroundColor: colors.primary + '1A' }]}>
                  <Text style={[styles.stepPillText, { color: colors.primary }]}>2</Text>
                </View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Escolha a data</Text>
              </View>
              <View style={styles.monthActions}>
                <TouchableOpacity
                  onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                  style={[styles.monthButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Ionicons name="chevron-back" size={18} color={colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.monthText, { color: colors.text }]}>{monthLabel}</Text>
                <TouchableOpacity
                  onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                  style={[styles.monthButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.calendarHeaderRow}>
              {WEEKDAY_LABELS.map((label) => (
                <Text key={label} style={[styles.calendarHeaderText, { color: colors.textMuted }]}>
                  {label}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {monthCells.map((day, index) => {
                if (!day) {
                  return <View key={`empty-${index}`} style={styles.calendarCell} />;
                }

                const isPast = startOfDay(day).getTime() < today.getTime();
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, today);

                return (
                  <TouchableOpacity
                    key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
                    style={[
                      styles.calendarCell,
                      styles.dayButton,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.surface,
                        borderColor: isToday ? colors.primary : isSelected ? colors.primary : colors.border,
                        opacity: isPast ? 0.42 : 1,
                      },
                    ]}
                    disabled={isPast}
                    onPress={() => {
                      setSelectedDate(startOfDay(day));
                      setSelectedSlot(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        {
                          color: isSelected ? colors.info : isToday ? colors.primary : colors.text,
                        },
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.selectedDateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text style={[styles.selectedDateText, { color: colors.text }]} numberOfLines={1}>
                Data selecionada: {summaryDate}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.secondaryBackground, borderColor: colors.border },
            ]}
          >
            <View style={styles.sectionHeader}>
              <View style={[styles.stepPill, { backgroundColor: colors.primary + '1A' }]}>
                <Text style={[styles.stepPillText, { color: colors.primary }]}>3</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Escolha o horario</Text>
            </View>
            <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
              {loadingSlots ? 'Carregando horarios...' : `${availableSlotCount} horarios disponiveis`}
            </Text>

            <View style={styles.slotsGrid}>
              {slotItems.length === 0 && !loadingSlots ? (
                <Text style={[styles.helperText, { color: colors.textSecondary }]}>Nenhum horario para esta data.</Text>
              ) : null}
              {slotItems.map((slot) => {
                const isSelected = selectedSlot?.inicio === slot.inicio;
                return (
                  <TouchableOpacity
                    key={slot.inicio}
                    onPress={() => slot.disponivel && setSelectedSlot(slot)}
                    disabled={!slot.disponivel}
                    style={[
                      styles.slotChip,
                      {
                        backgroundColor: isSelected
                          ? colors.primary + '24'
                          : slot.disponivel
                          ? colors.surface
                          : colors.border,
                        borderColor: isSelected ? colors.primary : colors.border,
                        opacity: slot.disponivel ? 1 : 0.45,
                      },
                    ]}
                  >
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'time-outline'}
                      size={14}
                      color={isSelected ? colors.primary : colors.textMuted}
                    />
                    <Text style={[styles.slotText, { color: isSelected ? colors.primary : colors.text }]}>
                      {slot.inicio}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.secondaryBackground, borderColor: colors.border },
            ]}
          >
            <View style={styles.sectionHeader}>
              <View style={[styles.stepPill, { backgroundColor: colors.primary + '1A' }]}>
                <Text style={[styles.stepPillText, { color: colors.primary }]}>4</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Pagamento e confirmacao</Text>
            </View>

            <View style={[styles.paymentStatusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons
                name={hasPendingPayment ? 'hourglass-outline' : 'lock-closed-outline'}
                size={16}
                color={hasPendingPayment ? colors.warning : colors.primary}
              />
              <Text style={[styles.paymentStatusText, { color: hasPendingPayment ? colors.warning : colors.textSecondary }]}>
                {hasPendingPayment
                  ? 'Pagamento iniciado: valide para confirmar o horario.'
                  : 'Pagamento necessario para liberar confirmacao do agendamento.'}
              </Text>
            </View>

            <View style={styles.summaryGrid}>
              <View style={[styles.summaryItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Servico</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]} numberOfLines={1}>
                  {selectedService?.servicos || '--'}
                </Text>
              </View>
              <View style={[styles.summaryItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Horario</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>{summaryTime}</Text>
              </View>
              <View style={[styles.summaryItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Valor total</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  {servicePrice > 0 ? formatCurrency(servicePrice) : '--'}
                </Text>
              </View>
              <View style={[styles.summaryItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Taxa plataforma</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>{formatCurrency(platformFee)}</Text>
              </View>
              <View style={[styles.summaryItem, styles.summaryItemFull, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Recebimento do personal</Text>
                <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatCurrency(personalNet)}</Text>
              </View>
            </View>

            {!personal.stripeAccountId ? (
              <Text style={[styles.warningText, { color: colors.warning }]}>
                Este personal nao esta apto para receber pagamentos agora.
              </Text>
            ) : null}

            <Button
              title={hasPendingPayment ? 'Validar pagamento e confirmar agendamento' : 'Pagar para desbloquear agendamento'}
              onPress={hasPendingPayment ? handleValidateAndConfirm : handlePayAndUnlock}
              fullWidth
              size="large"
              loading={actionInProgress}
              disabled={!canContinueToPayment || actionInProgress}
              style={styles.primaryAction}
            />

            {hasPendingPayment && pendingCheckoutUrl ? (
              <TouchableOpacity
                style={[styles.retryPaymentButton, { borderColor: colors.primary, backgroundColor: colors.surface }]}
                onPress={() => openPaymentLink(pendingCheckoutUrl)}
                disabled={actionInProgress}
              >
                <Ionicons name="card-outline" size={16} color={colors.primary} />
                <Text style={[styles.retryPaymentText, { color: colors.primary }]}>Abrir pagamento novamente</Text>
              </TouchableOpacity>
            ) : null}

            <Text style={[styles.footerNote, { color: colors.textMuted }]}>
              O horario so e confirmado apos pagamento concluido.
            </Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['4xl'],
    gap: spacing.md,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: 14,
  },
  heroCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(174,226,255,0.34)',
    overflow: 'hidden',
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroGlowPrimary: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    right: -72,
    top: -66,
    backgroundColor: 'rgba(116,209,255,0.22)',
  },
  heroGlowSecondary: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    left: -42,
    bottom: -44,
    backgroundColor: 'rgba(113,167,255,0.22)',
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.25,
    color: 'rgba(193,229,255,0.9)',
  },
  heroLocationRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroLocationText: {
    flex: 1,
    fontSize: 12,
  },
  heroBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(168,223,255,0.3)',
    backgroundColor: 'rgba(6,35,61,0.45)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CFEFFF',
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontSize: 18,
    fontWeight: '700',
  },
  heroSubtitle: {
    marginTop: 3,
    fontSize: 12,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepPill: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  helperText: {
    marginTop: spacing.xs,
    fontSize: 13,
  },
  servicesRow: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingRight: spacing.base,
  },
  serviceCard: {
    width: 232,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  selectedTag: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectedTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '700',
  },
  serviceDesc: {
    fontSize: 12,
    lineHeight: 18,
    minHeight: 34,
  },
  servicePrice: {
    marginTop: spacing.xs,
    fontSize: 16,
    fontWeight: '700',
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  monthActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  monthButton: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  calendarHeaderText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
  },
  calendarCell: {
    width: '14.28%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  dayButton: {
    width: 40,
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  selectedDateCard: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  selectedDateText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHint: {
    fontSize: 12,
    marginTop: -2,
    marginBottom: spacing.xs,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  slotChip: {
    minWidth: 72,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  slotText: {
    fontSize: 13,
    fontWeight: '600',
  },
  summaryGrid: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  paymentStatusCard: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  paymentStatusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  summaryItem: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    width: '48%',
  },
  summaryItemFull: {
    width: '100%',
  },
  summaryLabel: {
    fontSize: 11,
  },
  summaryValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '700',
  },
  warningText: {
    marginTop: spacing.sm,
    fontSize: 12,
    fontWeight: '600',
  },
  primaryAction: {
    marginTop: spacing.lg,
  },
  retryPaymentButton: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  retryPaymentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerNote: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: 12,
  },
});
