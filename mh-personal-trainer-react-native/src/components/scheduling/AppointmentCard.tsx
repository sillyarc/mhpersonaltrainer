import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius, shadows } from '../../theme';
import { Appointment } from '../../types/scheduling';
import {
  getAppointmentTypeLabel,
  getAppointmentStatusLabel,
  getAppointmentStatusColor,
  getAppointmentTypeColor,
} from '../../services/scheduling';

interface AppointmentCardProps {
  appointment: Appointment;
  onPress?: () => void;
  showDate?: boolean;
}

export function AppointmentCard({
  appointment,
  onPress,
  showDate = false,
}: AppointmentCardProps) {
  const { colors } = useTheme();
  const statusColor = getAppointmentStatusColor(appointment.status);
  const typeColor = getAppointmentTypeColor(appointment.tipo);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusIcon = () => {
    switch (appointment.status) {
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

  const getTypeIcon = () => {
    switch (appointment.tipo) {
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

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: colors.card },
        shadows.md,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.leftBorder, { backgroundColor: typeColor }]} />
      
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.typeContainer}>
            <View style={[styles.iconContainer, { backgroundColor: typeColor + '20' }]}>
              <Ionicons name={getTypeIcon()} size={20} color={typeColor} />
            </View>
            <Text style={[styles.typeText, { color: colors.text }]}>
              {getAppointmentTypeLabel(appointment.tipo)}
            </Text>
          </View>
          
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Ionicons name={getStatusIcon()} size={14} color={statusColor} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {getAppointmentStatusLabel(appointment.status)}
            </Text>
          </View>
        </View>

        {(appointment.horaInicio || appointment.horaFim || showDate) && (
          <View style={styles.timeRow}>
            {(appointment.horaInicio || appointment.horaFim) && (
              <>
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.timeText, { color: colors.text }]}>
                  {appointment.horaInicio || '--'}
                  {appointment.horaFim ? ` - ${appointment.horaFim}` : ''}
                </Text>
              </>
            )}
            {showDate && (
              <>
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color={colors.textSecondary}
                  style={{ marginLeft: spacing.md }}
                />
                <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                  {formatDate(appointment.data)}
                </Text>
              </>
            )}
          </View>
        )}

        {(appointment.alunoNome || appointment.personalNome) && (
          <View style={styles.personRow}>
            <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.personText, { color: colors.textSecondary }]}>
              {appointment.alunoNome || appointment.personalNome}
            </Text>
          </View>
        )}

        {appointment.local && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.locationText, { color: colors.textSecondary }]}>
              {appointment.local}
            </Text>
          </View>
        )}

        {appointment.servico && (
          <View style={styles.serviceRow}>
            <Text style={[styles.serviceText, { color: colors.textMuted }]}>
              {appointment.servico}
            </Text>
            {appointment.valor !== undefined && (
              <Text style={[styles.valueText, { color: colors.primary }]}>
                R$ {appointment.valor.toFixed(2)}
              </Text>
            )}
          </View>
        )}
      </View>

      <Ionicons
        name="chevron-forward"
        size={20}
        color={colors.textMuted}
        style={styles.chevron}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  leftBorder: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: spacing.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  typeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dateText: {
    fontSize: 14,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  personText: {
    fontSize: 14,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  locationText: {
    fontSize: 13,
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  serviceText: {
    fontSize: 13,
  },
  valueText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chevron: {
    alignSelf: 'center',
    marginRight: spacing.md,
  },
});
