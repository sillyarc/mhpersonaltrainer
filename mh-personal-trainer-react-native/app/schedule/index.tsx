import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { Loading } from '../../src/components/common';
import { AppointmentCard, CalendarWeekView, CalendarMonthView } from '../../src/components/scheduling';
import { spacing, borderRadius } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { Appointment, AppointmentStatus, AppointmentType } from '../../src/types/scheduling';
import { fetchAppointments } from '../../src/services/scheduling';
import { fetchUserWorkouts } from '../../src/services/workouts';
import { fetchEvaluations, fetchEvaluationsForStudents, getEvaluationTypeLabel } from '../../src/services/evaluations';
import { firestoreService, Aluno } from '../../src/services/firestoreService';
import { getDateKey } from '../../src/utils/date';

const FILTER_OPTIONS: { id: AppointmentType | null; label: string }[] = [
  { id: null, label: 'Todos' },
  { id: 'treino', label: 'Treino' },
  { id: 'avaliacao', label: 'Avaliação' },
  { id: 'consulta', label: 'Consulta' },
];

type ViewMode = 'week' | 'month';

type AgendaItem = Appointment & {
  source?: 'appointment' | 'workout' | 'evaluation';
  route?: { pathname: string; params?: Record<string, string> };
};

export default function ScheduleScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user, role } = useAuthStore();
  const [appointments, setAppointments] = useState<AgendaItem[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<AgendaItem[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<AppointmentType | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [appointmentCounts, setAppointmentCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPersonal = role === 'personal' || role === 'professor' || role === 'admin';

  const mapEvaluationStatus = (status: string): AppointmentStatus => {
    switch (status) {
      case 'agendada':
        return 'agendado';
      case 'em_andamento':
        return 'em_andamento';
      case 'concluida':
        return 'concluido';
      case 'cancelada':
      case 'nao_realizada':
        return 'cancelado';
      default:
        return 'agendado';
    }
  };

  const buildWorkoutAppointment = (
    workout: {
      id: string;
      nomeDoTreino?: string;
      obsInstrucao?: string;
      data?: Date;
      createdAt?: Date;
      updatedAt?: Date;
      lastCompletedAt?: Date;
    },
    student: Aluno | null,
    personalId: string
  ): AgendaItem | null => {
    const appointmentDate =
      workout.data || workout.createdAt || workout.updatedAt || workout.lastCompletedAt;
    if (!appointmentDate) return null;
    return {
      id: `workout-${student?.id ?? personalId}-${workout.id}`,
      alunoId: student?.id ?? personalId,
      personalId,
      alunoNome: student?.nome,
      data: appointmentDate,
      horaInicio: '',
      horaFim: '',
      tipo: 'treino',
      status: workout.lastCompletedAt ? 'concluido' : 'agendado',
      servico: workout.nomeDoTreino || 'Treino',
      observacoes: workout.obsInstrucao,
      createdAt: workout.createdAt || appointmentDate,
      updatedAt: workout.updatedAt,
      source: 'workout',
      route: {
        pathname: '/workout/[id]',
        params: {
          id: workout.id,
          ...(student?.id ? { studentId: student.id } : {}),
        },
      },
    };
  };

  const buildEvaluationAppointment = (
    evaluation: {
      id: string;
      type: string;
      date: Date;
      status: string;
      userId?: string;
      personalId?: string;
      prazoResposta?: Date | null;
      createdAt?: Date;
    },
    student: Aluno | null,
    personalId: string
  ): AgendaItem => {
    const appointmentDate =
      evaluation.type === 'personalizada' && evaluation.prazoResposta
        ? evaluation.prazoResposta
        : evaluation.date || evaluation.createdAt || new Date();
    return {
      id: `evaluation-${student?.id ?? personalId}-${evaluation.id}`,
      alunoId: student?.id ?? personalId,
      personalId,
      alunoNome: student?.nome,
      data: appointmentDate,
      horaInicio: '',
      horaFim: '',
      tipo: 'avaliacao',
      status: mapEvaluationStatus(evaluation.status),
      servico: getEvaluationTypeLabel(evaluation.type as any),
      createdAt: evaluation.date,
      source: 'evaluation',
      route: {
        pathname: '/evaluations/[id]',
        params: {
          id: evaluation.id,
          type: evaluation.type,
          ...(evaluation.userId ? { userId: evaluation.userId } : {}),
        },
      },
    };
  };

  const sortAppointments = (items: AgendaItem[]) =>
    [...items].sort((a, b) => {
      const dateDiff = a.data.getTime() - b.data.getTime();
      if (dateDiff !== 0) return dateDiff;
      return (a.horaInicio || '').localeCompare(b.horaInicio || '');
    });

  const loadAppointments = useCallback(async () => {
    if (!user?.uid) {
      setIsLoading(false);
      return;
    }

    try {
      const errors: string[] = [];
      const baseResult = await fetchAppointments(user.uid, isPersonal);
      if (baseResult.error) {
        errors.push(baseResult.error);
      }

      let workoutAppointments: AgendaItem[] = [];
      let evaluationAppointments: AgendaItem[] = [];

      if (isPersonal) {
        const students = await firestoreService.getAlunosDoPersonal(user.uid);
        const studentMap = new Map<string, Aluno>();
        students.forEach((student) => studentMap.set(student.id, student));
        const studentIds = students.map((student) => student.id);

        const workoutResults = await Promise.all(
          students.map(async (student) => ({
            student,
            result: await fetchUserWorkouts(student.id, false),
          }))
        );

        workoutAppointments = workoutResults
          .flatMap(({ student, result }) =>
            (result.data || [])
              .map((workout) => buildWorkoutAppointment(workout, student, user.uid))
              .filter(Boolean)
          )
          .filter(Boolean) as AgendaItem[];

        const evaluationsResult = await fetchEvaluationsForStudents(studentIds);
        if (evaluationsResult.error) {
          errors.push(evaluationsResult.error);
        }
        evaluationAppointments = (evaluationsResult.data || [])
          .map((evaluation) =>
            buildEvaluationAppointment(
              evaluation,
              studentMap.get(evaluation.userId || '') || null,
              user.uid
            )
          );
      } else {
        const [workoutResult, evaluationsResult] = await Promise.all([
          fetchUserWorkouts(user.uid, false),
          fetchEvaluations(user.uid),
        ]);
        if (workoutResult.error) {
          errors.push(workoutResult.error);
        }
        if (evaluationsResult.error) {
          errors.push(evaluationsResult.error);
        }

        workoutAppointments = (workoutResult.data || [])
          .map((workout) => buildWorkoutAppointment(workout, null, user.uid))
          .filter(Boolean) as AgendaItem[];
        evaluationAppointments = (evaluationsResult.data || [])
          .map((evaluation) => buildEvaluationAppointment(evaluation, null, user.uid));
      }

      const merged = sortAppointments([
        ...(baseResult.data || []),
        ...workoutAppointments,
        ...evaluationAppointments,
      ]);

      setAppointments(merged);

      const counts: Record<string, number> = {};
      merged.forEach((apt) => {
        const dateKey = getDateKey(apt.data);
        if (!dateKey) return;
        counts[dateKey] = (counts[dateKey] || 0) + 1;
      });
      setAppointmentCounts(counts);
      setError(errors.length ? errors[0] : null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, isPersonal]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    if (selectedFilter) {
      const selectedDateKey = getDateKey(selectedDate);
      const dateAppointments = appointments.filter((apt) => {
        const aptDate = getDateKey(apt.data);
        return aptDate === selectedDateKey && apt.tipo === selectedFilter;
      });
      setFilteredAppointments(sortAppointments(dateAppointments));
    } else {
      const selectedDateKey = getDateKey(selectedDate);
      const dateAppointments = appointments.filter((apt) => {
        const aptDate = getDateKey(apt.data);
        return aptDate === selectedDateKey;
      });
      setFilteredAppointments(sortAppointments(dateAppointments));
    }
  }, [appointments, selectedDate, selectedFilter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAppointments();
    setRefreshing(false);
  }, [loadAppointments]);

  const handleAppointmentPress = (appointment: AgendaItem) => {
    if (appointment.route) {
      router.push(appointment.route as any);
      return;
    }
    router.push({
      pathname: '/schedule/[id]',
      params: { id: appointment.id },
    });
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

  const handlePreviousWeek = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 7);
    setSelectedDate(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 7);
    setSelectedDate(newDate);
  };

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const formatSelectedDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="calendar-outline" size={64} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        Nenhum agendamento
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        Não há agendamentos para esta data
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerContent}>
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Agenda</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.viewModeToggle}>
        <TouchableOpacity
          style={[
            styles.viewModeButton,
            viewMode === 'week' && { backgroundColor: colors.primary },
          ]}
          onPress={() => setViewMode('week')}
        >
          <Text
            style={[
              styles.viewModeText,
              { color: viewMode === 'week' ? '#fff' : colors.textSecondary },
            ]}
          >
            Semana
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.viewModeButton,
            viewMode === 'month' && { backgroundColor: colors.primary },
          ]}
          onPress={() => setViewMode('month')}
        >
          <Text
            style={[
              styles.viewModeText,
              { color: viewMode === 'month' ? '#fff' : colors.textSecondary },
            ]}
          >
            Mês
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.monthNavigation}>
        <TouchableOpacity
          onPress={viewMode === 'week' ? handlePreviousWeek : handlePreviousMonth}
          style={styles.navButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.monthText, { color: colors.text }]}>
          {viewMode === 'month'
            ? formatMonthYear(currentMonth)
            : formatMonthYear(selectedDate)}
        </Text>
        <TouchableOpacity
          onPress={viewMode === 'week' ? handleNextWeek : handleNextMonth}
          style={styles.navButton}
        >
          <Ionicons name="chevron-forward" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {viewMode === 'week' ? (
        <CalendarWeekView
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          appointmentCounts={appointmentCounts}
        />
      ) : (
        <CalendarMonthView
          selectedDate={selectedDate}
          currentMonth={currentMonth}
          onSelectDate={setSelectedDate}
          appointmentCounts={appointmentCounts}
        />
      )}

      <Text style={[styles.selectedDateText, { color: colors.text }]}>
        {formatSelectedDate(selectedDate)}
      </Text>

      <FlatList
        horizontal
        data={FILTER_OPTIONS}
        keyExtractor={(item) => item.id || 'all'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  selectedFilter === item.id ? colors.primary : colors.surface,
              },
            ]}
            onPress={() => setSelectedFilter(item.id)}
          >
            <Text
              style={[
                styles.filterChipText,
                {
                  color: selectedFilter === item.id ? '#fff' : colors.textSecondary,
                },
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Loading />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {renderHeader()}

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: colors.error + '20' }]}>
          <Ionicons name="alert-circle" size={20} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      )}

      <FlatList
        data={filteredAppointments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AppointmentCard
            appointment={item}
            onPress={() => handleAppointmentPress(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContent: {
    paddingBottom: spacing.md,
  },
  titleRow: {
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
    fontSize: 24,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40,
  },
  viewModeToggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
  },
  viewModeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  viewModeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
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
    paddingHorizontal: spacing.base,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  filterList: {
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    padding: spacing.base,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginHorizontal: spacing.base,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  errorText: {
    fontSize: 14,
    flex: 1,
  },
});
