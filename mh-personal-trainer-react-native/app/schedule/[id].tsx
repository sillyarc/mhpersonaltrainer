import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { Loading, Button, Card } from '../../src/components/common';
import { spacing, borderRadius, shadows } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { Appointment } from '../../src/types/scheduling';
import {
  fetchAppointmentById,
  cancelAppointment,
  confirmAppointment,
  completeAppointment,
  deleteAppointment,
  getAppointmentTypeLabel,
  getAppointmentStatusLabel,
  getAppointmentStatusColor,
  getAppointmentTypeColor,
} from '../../src/services/scheduling';

export default function AppointmentDetailScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user, role } = useAuthStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPersonal = role === 'personal' || role === 'professor' || role === 'admin';

  const loadAppointment = useCallback(async () => {
    if (!id) {
      setError('ID do agendamento não fornecido');
      setIsLoading(false);
      return;
    }

    try {
      const result = await fetchAppointmentById(id);
      if (result.error) {
        setError(result.error);
      } else {
        setAppointment(result.data || null);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAppointment();
  }, [loadAppointment]);

  const handleConfirm = async () => {
    if (!appointment) return;

    showAlert(
      'Confirmar Agendamento',
      'Deseja confirmar este agendamento?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setIsUpdating(true);
            const result = await confirmAppointment(appointment.id);
            if (result.error) {
              showAlert('Erro', result.error);
            } else {
              await loadAppointment();
            }
            setIsUpdating(false);
          },
        },
      ]
    );
  };

  const handleComplete = async () => {
    if (!appointment) return;

    showAlert(
      'Concluir Agendamento',
      'Marcar este agendamento como concluído?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Concluir',
          onPress: async () => {
            setIsUpdating(true);
            const result = await completeAppointment(appointment.id);
            if (result.error) {
              showAlert('Erro', result.error);
            } else {
              await loadAppointment();
            }
            setIsUpdating(false);
          },
        },
      ]
    );
  };

  const handleCancel = async () => {
    if (!appointment) return;

    showAlert(
      'Cancelar Agendamento',
      'Tem certeza que deseja cancelar este agendamento?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, Cancelar',
          style: 'destructive',
          onPress: async () => {
            setIsUpdating(true);
            const result = await cancelAppointment(appointment.id);
            if (result.error) {
              showAlert('Erro', result.error);
            } else {
              await loadAppointment();
            }
            setIsUpdating(false);
          },
        },
      ]
    );
  };

  const handleDelete = async () => {
    if (!appointment) return;

    showAlert(
      'Excluir Agendamento',
      'Tem certeza que deseja excluir este agendamento permanentemente?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, Excluir',
          style: 'destructive',
          onPress: async () => {
            setIsUpdating(true);
            const result = await deleteAppointment(appointment.id);
            if (result.error) {
              showAlert('Erro', result.error);
            } else {
              router.back();
            }
            setIsUpdating(false);
          },
        },
      ]
    );
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmado':
        return 'checkmark-circle';
      case 'cancelado':
        return 'close-circle';
      case 'concluido':
        return 'checkmark-done-circle';
      case 'em_andamento':
        return 'play-circle';
      case 'nao_compareceu':
        return 'alert-circle';
      default:
        return 'time';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'treino':
        return 'barbell-outline';
      case 'avaliacao':
        return 'clipboard-outline';
      case 'consulta':
        return 'chatbubbles-outline';
      case 'acompanhamento':
        return 'trending-up-outline';
      case 'online':
        return 'videocam-outline';
      case 'presencial':
        return 'location-outline';
      default:
        return 'calendar-outline';
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (error || !appointment) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Detalhes</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color={colors.error} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            {error || 'Agendamento não encontrado'}
          </Text>
          <Button
            title="Voltar"
            onPress={() => router.back()}
            style={{ marginTop: spacing.xl }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getAppointmentStatusColor(appointment.status);
  const typeColor = getAppointmentTypeColor(appointment.tipo);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Detalhes</Text>
        {isPersonal && appointment.status !== 'cancelado' && (
          <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={24} color={colors.error} />
          </TouchableOpacity>
        )}
        {!isPersonal && <View style={styles.placeholder} />}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.mainCard}>
          <View style={styles.typeHeader}>
            <View style={[styles.typeIconContainer, { backgroundColor: typeColor + '20' }]}>
              <Ionicons name={getTypeIcon(appointment.tipo)} size={32} color={typeColor} />
            </View>
            <View style={styles.typeInfo}>
              <Text style={[styles.typeLabel, { color: colors.text }]}>
                {getAppointmentTypeLabel(appointment.tipo)}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                <Ionicons name={getStatusIcon(appointment.status)} size={16} color={statusColor} />
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {getAppointmentStatusLabel(appointment.status)}
                </Text>
              </View>
            </View>
          </View>
        </Card>

        <Card style={styles.infoCard}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Data e Horário
          </Text>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              {formatDate(appointment.data)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              {appointment.horaInicio} - {appointment.horaFim}
            </Text>
          </View>
        </Card>

        {(appointment.alunoNome || appointment.personalNome) && (
          <Card style={styles.infoCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {isPersonal ? 'Aluno' : 'Personal'}
            </Text>
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={20} color={colors.primary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {isPersonal ? appointment.alunoNome : appointment.personalNome}
              </Text>
            </View>
          </Card>
        )}

        {appointment.local && (
          <Card style={styles.infoCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Local</Text>
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={20} color={colors.primary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {appointment.local}
              </Text>
            </View>
          </Card>
        )}

        {appointment.servico && (
          <Card style={styles.infoCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Serviço</Text>
            <Text style={[styles.serviceText, { color: colors.textSecondary }]}>
              {appointment.servico}
            </Text>
            {appointment.valor !== undefined && (
              <Text style={[styles.valueText, { color: colors.primary }]}>
                R$ {appointment.valor.toFixed(2)}
              </Text>
            )}
          </Card>
        )}

        {appointment.observacoes && (
          <Card style={styles.infoCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Observações
            </Text>
            <Text style={[styles.observacoesText, { color: colors.textSecondary }]}>
              {appointment.observacoes}
            </Text>
          </Card>
        )}

        {appointment.status !== 'cancelado' && appointment.status !== 'concluido' && (
          <View style={styles.actionsContainer}>
            {appointment.status === 'agendado' && (
              <Button
                title="Confirmar"
                onPress={handleConfirm}
                loading={isUpdating}
                icon={<Ionicons name="checkmark" size={20} color="#fff" />}
                fullWidth
                style={{ marginBottom: spacing.md }}
              />
            )}
            {(appointment.status === 'confirmado' || appointment.status === 'em_andamento') && (
              <Button
                title="Concluir"
                onPress={handleComplete}
                loading={isUpdating}
                icon={<Ionicons name="checkmark-done" size={20} color="#fff" />}
                fullWidth
                style={{ marginBottom: spacing.md }}
              />
            )}
            <Button
              title="Cancelar Agendamento"
              onPress={handleCancel}
              variant="outline"
              loading={isUpdating}
              icon={<Ionicons name="close" size={20} color={colors.error} />}
              fullWidth
              textStyle={{ color: colors.error }}
              style={{ borderColor: colors.error }}
            />
          </View>
        )}
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
  deleteButton: {
    padding: spacing.xs,
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  mainCard: {
    marginBottom: spacing.md,
  },
  typeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeIconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.base,
  },
  typeInfo: {
    flex: 1,
  },
  typeLabel: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  infoCard: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  infoText: {
    fontSize: 16,
    flex: 1,
  },
  serviceText: {
    fontSize: 16,
    marginBottom: spacing.xs,
  },
  valueText: {
    fontSize: 18,
    fontWeight: '600',
  },
  observacoesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  actionsContainer: {
    marginTop: spacing.lg,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
