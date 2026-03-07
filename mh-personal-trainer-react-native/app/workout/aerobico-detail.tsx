import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '@utils/alert';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import {
  fetchAerobicWorkoutById,
  updateAerobicWorkout,
} from '../../src/services/workouts';
import { AerobicWorkout, AerobicWorkoutItem } from '../../src/types/workout';
import { Button, Loading } from '../../src/components/common';
import { spacing, borderRadius } from '../../src/theme';

interface AerobicActivityViewModel extends AerobicWorkoutItem {
  id: string;
}

const isSameDay = (value?: Date) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
};

export default function AerobicoDetailScreen() {
  const { colors } = useTheme();
  const { user, role } = useAuthStore();
  const { id, studentId } = useLocalSearchParams<{ id: string; studentId?: string }>();
  const [workout, setWorkout] = useState<AerobicWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [completedActivityIds, setCompletedActivityIds] = useState<string[]>([]);

  const workoutId = Array.isArray(id) ? id[0] : id;
  const selectedStudentId = Array.isArray(studentId) ? studentId[0] : studentId;
  const isPersonal = role === 'personal' || role === 'professor';
  const targetUserId = selectedStudentId || user?.uid;

  useEffect(() => {
    const loadWorkout = async () => {
      if (!workoutId || !targetUserId) {
        setLoading(false);
        return;
      }
      const result = await fetchAerobicWorkoutById(targetUserId, workoutId);
      if (result.data) {
        setWorkout(result.data);
      }
      setLoading(false);
    };
    loadWorkout();
  }, [targetUserId, workoutId]);

  useEffect(() => {
    setSessionStarted(false);
    setCompletedActivityIds([]);
  }, [workout?.id]);

  const activities = useMemo<AerobicActivityViewModel[]>(() => {
    if (!workout) return [];
    const baseItems = workout.items?.length
      ? workout.items
      : workout.treinos?.length
      ? workout.treinos.map((nome) => ({ nome }))
      : workout.treino
      ? [{ nome: workout.treino }]
      : [];
    return baseItems.map((item, index) => ({
      ...item,
      id: `${workout.id}-${index}`,
    }));
  }, [workout]);

  const completedToday = isSameDay(workout?.lastCompletedAt);
  const totalActivities = activities.length;
  const completedCount = completedActivityIds.length;
  const allActivitiesCompleted = totalActivities > 0 && completedCount === totalActivities;

  const handleEdit = () => {
    if (!workoutId || !targetUserId) return;
    router.push(`/workout/aerobico-create?studentId=${targetUserId}&workoutId=${workoutId}`);
  };

  const toggleActivity = (activityId: string) => {
    if (!sessionStarted || completedToday) return;
    setCompletedActivityIds((prev) =>
      prev.includes(activityId)
        ? prev.filter((idItem) => idItem !== activityId)
        : [...prev, activityId]
    );
  };

  const handleStartWorkout = () => {
    if (totalActivities === 0) {
      showAlert('Treino aeróbico', 'Adicione pelo menos uma atividade para iniciar.');
      return;
    }
    setSessionStarted(true);
    setCompletedActivityIds([]);
  };

  const persistCompletion = async () => {
    if (!workout || !targetUserId) return;
    setSaving(true);
    const completedAt = new Date();
    const result = await updateAerobicWorkout(targetUserId, workout.id, {
      lastCompletedAt: completedAt,
    });
    setSaving(false);
    if (result.error) {
      showAlert('Erro', result.error);
      return;
    }
    setWorkout((prev) => (prev ? { ...prev, lastCompletedAt: completedAt } : prev));
    setSessionStarted(false);
    const pendingCount = Math.max(0, totalActivities - completedCount);
    showAlert(
      'Treino concluido',
      pendingCount > 0
        ? `Treino finalizado com ${completedCount}/${totalActivities} atividades concluidas.`
        : `Bom treino! ${completedCount} atividade(s) concluidas.`
    );
  };

  const handleFinishWorkout = () => {
    if (!sessionStarted) return;
    if (!allActivitiesCompleted) {
      const missingCount = Math.max(0, totalActivities - completedCount);
      showAlert(
        'Finalizar treino?',
        `Ainda faltam ${missingCount} atividade(s). Deseja finalizar mesmo assim?`,
        [
          { text: 'Continuar treino', style: 'cancel' },
          {
            text: 'Finalizar',
            onPress: () => {
              void persistCompletion();
            },
          },
        ]
      );
      return;
    }
    void persistCompletion();
  };

  const handlePrimaryAction = () => {
    if (completedToday) return;
    if (!sessionStarted) {
      handleStartWorkout();
      return;
    }
    handleFinishWorkout();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (!workout) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
          <Text style={[styles.emptyText, { color: colors.text }]}>Treino aeróbico não encontrado</Text>
          <Button title="Voltar" onPress={() => router.back()} variant="outline" />
        </View>
      </SafeAreaView>
    );
  }

  const actionLabel = completedToday
    ? 'Treino concluido hoje'
    : sessionStarted
    ? allActivitiesCompleted
      ? 'Concluir treino'
      : 'Finalizar treino'
    : 'Iniciar treino';
  const actionIconName: keyof typeof Ionicons.glyphMap = completedToday
    ? 'checkmark'
    : sessionStarted
    ? 'flag-outline'
    : 'play';
  const sectionHint = completedToday
    ? 'Treino concluído hoje. Volte amanhã para novo registro.'
    : sessionStarted
    ? 'Toque nas atividades para marcar como concluídas.'
    : 'Inicie o treino para liberar a interação.';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          Treino aeróbico
        </Text>
        <View style={styles.headerActions}>
          {isPersonal && (
            <TouchableOpacity style={styles.actionButton} onPress={handleEdit}>
              <Ionicons name="pencil-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {workout.observacoes || 'Treino aeróbico personalizado para condicionamento.'}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: colors.success + '20' }]}>
                <Ionicons name="bicycle-outline" size={20} color={colors.success} />
              </View>
              <View>
                <Text style={[styles.statValue, { color: colors.text }]}>{totalActivities}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Atividades</Text>
              </View>
            </View>
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {completedToday ? totalActivities : completedCount}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Concluidas</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Atividades</Text>
          <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>{sectionHint}</Text>
          {activities.length === 0 ? (
            <View style={[styles.emptyActivitiesCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.emptyActivitiesText, { color: colors.textSecondary }]}>
                Sem atividades cadastradas.
              </Text>
            </View>
          ) : (
            activities.map((item, index) => {
              const isCompleted = completedActivityIds.includes(item.id);
              const detailParts: string[] = [];
              if (item.series && item.repeticoes) {
                detailParts.push(`${item.series} x ${item.repeticoes}`);
              } else if (item.series) {
                detailParts.push(`${item.series} series`);
              } else if (item.repeticoes) {
                detailParts.push(`${item.repeticoes} reps`);
              }
              if (item.carga) {
                detailParts.push(`${item.carga} kg`);
              }
              const detailText =
                detailParts.length > 0
                  ? detailParts.join('  •  ')
                  : isCompleted
                  ? 'Concluída'
                  : sessionStarted
                  ? 'Toque para concluir'
                  : 'Inicie o treino para marcar';

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.activityCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: isCompleted ? colors.success : colors.border,
                    },
                  ]}
                  onPress={() => toggleActivity(item.id)}
                  activeOpacity={sessionStarted && !completedToday ? 0.75 : 1}
                  disabled={!sessionStarted || completedToday}
                >
                  <View
                    style={[
                      styles.activityIndex,
                      {
                        backgroundColor: isCompleted ? colors.success + '20' : colors.surface,
                      },
                    ]}
                  >
                    {isCompleted ? (
                      <Ionicons name="checkmark" size={17} color={colors.success} />
                    ) : (
                      <Text style={[styles.activityIndexText, { color: colors.textSecondary }]}>
                        {index + 1}
                      </Text>
                    )}
                  </View>
                  <View style={styles.activityInfo}>
                    <Text
                      style={[
                        styles.activityName,
                        { color: colors.text },
                        isCompleted && styles.activityNameCompleted,
                      ]}
                      numberOfLines={1}
                    >
                      {item.nome}
                    </Text>
                    <Text style={[styles.activityMeta, { color: colors.textMuted }]}>
                      {detailText}
                    </Text>
                  </View>
                  <Ionicons
                    name={
                      sessionStarted && !completedToday
                        ? isCompleted
                          ? 'refresh-outline'
                          : 'checkmark-circle-outline'
                        : 'lock-closed-outline'
                    }
                    size={20}
                    color={sessionStarted && !completedToday ? colors.primary : colors.textMuted}
                  />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {workout.aquecimento ? (
          <View style={[styles.detailCard, { backgroundColor: colors.card }]}>
            <View style={styles.detailHeader}>
              <Ionicons name="flame-outline" size={18} color={colors.primary} />
              <Text style={[styles.detailTitle, { color: colors.text }]}>Aquecimento</Text>
            </View>
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              {workout.aquecimento}
            </Text>
          </View>
        ) : null}

        {workout.voltaacalma ? (
          <View style={[styles.detailCard, { backgroundColor: colors.card }]}>
            <View style={styles.detailHeader}>
              <Ionicons name="walk-outline" size={18} color={colors.primary} />
              <Text style={[styles.detailTitle, { color: colors.text }]}>Volta a calma</Text>
            </View>
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              {workout.voltaacalma}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Button
          title={actionLabel}
          onPress={handlePrimaryAction}
          fullWidth
          size="large"
          loading={saving}
          disabled={saving || completedToday || totalActivities === 0}
          icon={
            <Ionicons
              name={actionIconName}
              size={20}
              color="#fff"
              style={{ marginRight: spacing.xs }}
            />
          }
        />
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
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: spacing.sm,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  infoCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  statLabel: {
    fontSize: 11,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sectionHint: {
    fontSize: 12,
    marginTop: spacing.xs,
    marginBottom: spacing.base,
  },
  emptyActivitiesCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    alignItems: 'center',
  },
  emptyActivitiesText: {
    fontSize: 14,
    textAlign: 'center',
  },
  activityCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.base,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  activityIndex: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityIndexText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activityInfo: {
    flex: 1,
  },
  activityName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  activityNameCompleted: {
    textDecorationLine: 'line-through',
  },
  activityMeta: {
    fontSize: 12,
  },
  detailCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  detailTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailText: {
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    padding: spacing.base,
    borderTopWidth: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: 15,
    marginVertical: spacing.md,
    textAlign: 'center',
  },
});
