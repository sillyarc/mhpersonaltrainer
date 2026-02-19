import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { Loading, Button, Input, Card } from '../../src/components/common';
import { CalendarMonthView } from '../../src/components/scheduling';
import { spacing, borderRadius } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { AppointmentType, TimeSlot } from '../../src/types/scheduling';
import {
  createAppointment,
  getAvailableSlots,
  getAppointmentTypeLabel,
  getAppointmentTypeColor,
} from '../../src/services/scheduling';

const APPOINTMENT_TYPES: AppointmentType[] = [
  'treino',
  'avaliacao',
  'consulta',
  'acompanhamento',
  'online',
  'presencial',
];

export default function CreateAppointmentScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const params = useLocalSearchParams<{ date?: string }>();

  const initialDate = params.date ? new Date(params.date) : new Date();
  
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [currentMonth, setCurrentMonth] = useState<Date>(initialDate);
  const [selectedType, setSelectedType] = useState<AppointmentType>('treino');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [alunoNome, setAlunoNome] = useState('');
  const [local, setLocal] = useState('');
  const [servico, setServico] = useState('');
  const [valor, setValor] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState<'date' | 'time' | 'details'>('date');

  const loadAvailableSlots = useCallback(async () => {
    if (!user?.uid) return;

    setIsLoading(true);
    try {
      const result = await getAvailableSlots(user.uid, selectedDate);
      if (result.data) {
        setAvailableSlots(result.data.slots);
      }
    } catch (error) {
      console.error('Error loading slots:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, selectedDate]);

  useEffect(() => {
    if (step === 'time') {
      loadAvailableSlots();
    }
  }, [step, loadAvailableSlots]);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const handlePreviousMonth = () => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() - 1);
    setCurrentMonth(newMonth);
  };

  const handleNextMonth = () => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + 1);
    setCurrentMonth(newMonth);
  };

  const handleSlotSelect = (slot: TimeSlot) => {
    if (!slot.disponivel) return;
    setSelectedSlot(slot);
  };

  const handleNextStep = () => {
    if (step === 'date') {
      setStep('time');
    } else if (step === 'time') {
      if (!selectedSlot) {
        showAlert('Atenção', 'Selecione um horário disponível');
        return;
      }
      setStep('details');
    }
  };

  const handlePreviousStep = () => {
    if (step === 'time') {
      setStep('date');
      setSelectedSlot(null);
    } else if (step === 'details') {
      setStep('time');
    }
  };

  const handleSave = async () => {
    if (!user?.uid || !selectedSlot) {
      showAlert('Erro', 'Dados incompletos');
      return;
    }

    setIsSaving(true);
    try {
      const result = await createAppointment({
        alunoId: '',
        personalId: user.uid,
        alunoNome: alunoNome || undefined,
        personalNome: user.displayName || undefined,
        data: selectedDate,
        horaInicio: selectedSlot.inicio,
        horaFim: selectedSlot.fim,
        tipo: selectedType,
        status: 'agendado',
        servico: servico || undefined,
        valor: valor ? parseFloat(valor.replace(',', '.')) : undefined,
        observacoes: observacoes || undefined,
        local: local || undefined,
      });

      if (result.error) {
        showAlert('Erro', result.error);
      } else {
        showAlert('Sucesso', 'Agendamento criado com sucesso!', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (error: any) {
      showAlert('Erro', error.message || 'Erro ao criar agendamento');
    } finally {
      setIsSaving(false);
    }
  };

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const formatSelectedDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
  };

  const renderDateStep = () => (
    <>
      <View style={styles.monthNavigation}>
        <TouchableOpacity onPress={handlePreviousMonth} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.monthText, { color: colors.text }]}>
          {formatMonthYear(currentMonth)}
        </Text>
        <TouchableOpacity onPress={handleNextMonth} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <CalendarMonthView
        selectedDate={selectedDate}
        currentMonth={currentMonth}
        onSelectDate={handleDateSelect}
      />

      <Text style={[styles.selectedDateText, { color: colors.text }]}>
        Data selecionada: {formatSelectedDate(selectedDate)}
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Tipo de Agendamento
      </Text>
      <View style={styles.typesGrid}>
        {APPOINTMENT_TYPES.map((type) => {
          const typeColor = getAppointmentTypeColor(type);
          const isSelected = selectedType === type;
          return (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeCard,
                {
                  backgroundColor: isSelected ? typeColor + '20' : colors.surface,
                  borderColor: isSelected ? typeColor : 'transparent',
                },
              ]}
              onPress={() => setSelectedType(type)}
            >
              <Text
                style={[
                  styles.typeCardText,
                  { color: isSelected ? typeColor : colors.text },
                ]}
              >
                {getAppointmentTypeLabel(type)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  const renderTimeStep = () => (
    <>
      <Text style={[styles.selectedDateText, { color: colors.text }]}>
        {formatSelectedDate(selectedDate)}
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Horários Disponíveis
      </Text>

      {isLoading ? (
        <Loading />
      ) : (
        <View style={styles.slotsGrid}>
          {availableSlots.map((slot) => (
            <TouchableOpacity
              key={slot.inicio}
              style={[
                styles.slotCard,
                {
                  backgroundColor: !slot.disponivel
                    ? colors.textMuted + '20'
                    : selectedSlot?.inicio === slot.inicio
                    ? colors.primary
                    : colors.surface,
                  borderColor:
                    selectedSlot?.inicio === slot.inicio
                      ? colors.primary
                      : 'transparent',
                },
              ]}
              onPress={() => handleSlotSelect(slot)}
              disabled={!slot.disponivel}
            >
              <Text
                style={[
                  styles.slotText,
                  {
                    color: !slot.disponivel
                      ? colors.textMuted
                      : selectedSlot?.inicio === slot.inicio
                      ? '#fff'
                      : colors.text,
                  },
                ]}
              >
                {slot.inicio}
              </Text>
              {!slot.disponivel && (
                <Text style={[styles.unavailableText, { color: colors.textMuted }]}>
                  Ocupado
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );

  const renderDetailsStep = () => (
    <>
      <Card style={styles.summaryCard}>
        <Text style={[styles.summaryTitle, { color: colors.text }]}>Resumo</Text>
        <View style={styles.summaryRow}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
            {formatSelectedDate(selectedDate)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Ionicons name="time-outline" size={18} color={colors.primary} />
          <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
            {selectedSlot?.inicio} - {selectedSlot?.fim}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Ionicons name="bookmark-outline" size={18} color={colors.primary} />
          <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
            {getAppointmentTypeLabel(selectedType)}
          </Text>
        </View>
      </Card>

      <Input
        label="Nome do Aluno"
        placeholder="Digite o nome do aluno"
        value={alunoNome}
        onChangeText={setAlunoNome}
        icon="person-outline"
      />

      <Input
        label="Local"
        placeholder="Ex: Academia, Online, Casa do cliente"
        value={local}
        onChangeText={setLocal}
        icon="location-outline"
      />

      <Input
        label="Serviço"
        placeholder="Descrição do serviço"
        value={servico}
        onChangeText={setServico}
        icon="briefcase-outline"
      />

      <Input
        label="Valor (R$)"
        placeholder="0,00"
        value={valor}
        onChangeText={setValor}
        keyboardType="numeric"
        icon="cash-outline"
      />

      <Input
        label="Observações"
        placeholder="Observações adicionais..."
        value={observacoes}
        onChangeText={setObservacoes}
        multiline
        numberOfLines={3}
        icon="document-text-outline"
      />
    </>
  );

  const getStepTitle = () => {
    switch (step) {
      case 'date':
        return 'Selecione a Data';
      case 'time':
        return 'Selecione o Horário';
      case 'details':
        return 'Detalhes';
      default:
        return 'Novo Agendamento';
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={step === 'date' ? () => router.back() : handlePreviousStep}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{getStepTitle()}</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.stepsIndicator}>
        {['date', 'time', 'details'].map((s, index) => (
          <React.Fragment key={s}>
            <View
              style={[
                styles.stepDot,
                {
                  backgroundColor:
                    step === s
                      ? colors.primary
                      : ['date', 'time', 'details'].indexOf(step) > index
                      ? colors.success
                      : colors.textMuted,
                },
              ]}
            >
              {['date', 'time', 'details'].indexOf(step) > index && (
                <Ionicons name="checkmark" size={12} color="#fff" />
              )}
            </View>
            {index < 2 && (
              <View
                style={[
                  styles.stepLine,
                  {
                    backgroundColor:
                      ['date', 'time', 'details'].indexOf(step) > index
                        ? colors.success
                        : colors.textMuted,
                  },
                ]}
              />
            )}
          </React.Fragment>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {step === 'date' && renderDateStep()}
        {step === 'time' && renderTimeStep()}
        {step === 'details' && renderDetailsStep()}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background }]}>
        {step !== 'details' ? (
          <Button
            title="Continuar"
            onPress={handleNextStep}
            fullWidth
            icon={<Ionicons name="arrow-forward" size={20} color="#fff" />}
          />
        ) : (
          <Button
            title="Criar Agendamento"
            onPress={handleSave}
            loading={isSaving}
            fullWidth
            icon={<Ionicons name="checkmark" size={20} color="#fff" />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  backButton: {
    padding: spacing.xs,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 32,
  },
  stepsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['3xl'],
    marginBottom: spacing.lg,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
  },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navButton: {
    padding: spacing.sm,
  },
  monthText: {
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  selectedDateText: {
    fontSize: 16,
    fontWeight: '500',
    textTransform: 'capitalize',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  typesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeCard: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
  },
  typeCardText: {
    fontSize: 14,
    fontWeight: '500',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  slotCard: {
    width: '23%',
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 2,
  },
  slotText: {
    fontSize: 14,
    fontWeight: '500',
  },
  unavailableText: {
    fontSize: 10,
    marginTop: 2,
  },
  summaryCard: {
    marginBottom: spacing.lg,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  summaryText: {
    fontSize: 14,
  },
  footer: {
    padding: spacing.base,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.base,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
});
