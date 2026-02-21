import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { showAlert } from '@utils/alert';
import { coerceMetricValue } from '@utils/workoutMetrics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { Button, Loading } from '../../src/components/common';
import { ExerciseCard } from '../../src/components/workout/ExerciseCard';
import { spacing, borderRadius } from '../../src/theme';
import { WorkoutExercise } from '../../src/types/workout';
import { fetchAvailableExercises, fetchUserWorkoutById, archiveUserWorkout } from '../../src/services/workouts';
import { useAuthStore } from '../../src/store/authStore';

interface WorkoutDetail {
  id: string;
  name: string;
  description: string;
  exercises: WorkoutExercise[];
  isArchived: boolean;
  completedToday: boolean;
}

export default function WorkoutDetailScreen() {
  const { colors } = useTheme();
  const { user, role } = useAuthStore();
  const { id, studentId } = useLocalSearchParams<{ id: string; studentId?: string }>();
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const normalizeName = (value: string) => value.trim().toLowerCase();

  const targetUserId = studentId || user?.uid;
  const isPersonal = role === 'personal' || role === 'professor';

  useEffect(() => {
    const loadWorkout = async () => {
      if (!id || !targetUserId) {
        setIsLoading(false);
        return;
      }
      const result = await fetchUserWorkoutById(targetUserId, id);
      if (result.data) {
        const storedVideoUrls = result.data.videoUrls || [];
        let videoUrlByName = new Map<string, string>();
        const needsVideoFallback = (result.data.treino || []).some(
          (treino, index) => !storedVideoUrls[index] && treino
        );
        if (needsVideoFallback) {
          const exercisesResult = await fetchAvailableExercises();
          if (exercisesResult.data) {
            exercisesResult.data.forEach((exercise) => {
              const resolvedUrl =
                exercise.videoUrl1080 || exercise.videoUrl720 || exercise.videoUrl;
              if (resolvedUrl) {
                videoUrlByName.set(normalizeName(exercise.nomeDoTreino), resolvedUrl);
              }
            });
          }
        }
        const exercises: WorkoutExercise[] = (result.data.treino || []).map((name, index) => ({
          videoUrl:
            storedVideoUrls[index] ||
            videoUrlByName.get(normalizeName(name)) ||
            undefined,
          exerciseId: `${result.data.id}-${index}`,
          nome: name,
          series: coerceMetricValue(result.data.seriesRep?.[index], 3),
          repeticoes: coerceMetricValue(result.data.repeticoes?.[index], 12),
          carga: coerceMetricValue(result.data.carga?.[index], 0),
          intervalo: coerceMetricValue(result.data.intervalo?.[index], 60),
        }));
        const lastCompletedAt = result.data.lastCompletedAt ? new Date(result.data.lastCompletedAt) : null;
        const today = new Date();
        const completedToday = !!lastCompletedAt
          && lastCompletedAt.getFullYear() === today.getFullYear()
          && lastCompletedAt.getMonth() === today.getMonth()
          && lastCompletedAt.getDate() === today.getDate();
        setWorkout({
          id: result.data.id,
          name: result.data.nomeDoTreino,
          description: result.data.obsInstrucao || 'Treino personalizado',
          exercises,
          isArchived: !!result.data.arquivos,
          completedToday,
        });
      }
      setIsLoading(false);
    };
    loadWorkout();
  }, [id, targetUserId]);

  const handleStartWorkout = () => {
    if (workout) {
      router.push({
        pathname: '/start-workout',
        params: { workoutId: workout.id, studentId: targetUserId },
      });
    }
  };

  const handleEditWorkout = () => {
    router.push({
      pathname: '/workout/create',
      params: { editId: workout?.id, studentId: targetUserId },
    });
  };

  const handleArchiveWorkout = async () => {
    if (!workout || !targetUserId) return;
    const shouldArchive = !workout.isArchived;
    showAlert(
      shouldArchive ? 'Arquivar treino' : 'Restaurar treino',
      shouldArchive
        ? 'Deseja arquivar este treino? Ele vai para a lista de arquivados.'
        : 'Deseja restaurar este treino para a lista ativa?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: shouldArchive ? 'Arquivar' : 'Restaurar',
          style: shouldArchive ? 'destructive' : 'default',
          onPress: async () => {
            setIsSaving(true);
            const result = await archiveUserWorkout(targetUserId, workout.id, shouldArchive);
            setIsSaving(false);
            if (result.error) {
              showAlert('Erro', result.error);
              return;
            }
            const nextState = { ...workout, isArchived: shouldArchive };
            setWorkout(nextState);
            showAlert(
              shouldArchive ? 'Treino arquivado' : 'Treino restaurado',
              shouldArchive
                ? 'Voce pode acessar em Treinos > Arquivados.'
                : 'O treino voltou para a lista ativa.'
            );
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (!workout) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.text }]}>
            Treino nao encontrado
          </Text>
          <Button title="Voltar" onPress={() => router.back()} variant="outline" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {workout.name}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleEditWorkout}>
            <Ionicons name="pencil-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          {isPersonal && (
            <TouchableOpacity style={styles.actionButton} onPress={handleArchiveWorkout} disabled={isSaving}>
              <Ionicons
                name={workout.isArchived ? 'archive-outline' : 'archive'}
                size={22}
                color={colors.warning}
              />
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
            {workout.description}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="list" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {workout.exercises.length}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                  Exercicios
                </Text>
              </View>
            </View>
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: colors.success + '20' }]}>
                <Ionicons name="time" size={20} color={colors.success} />
              </View>
              <View>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {workout.exercises.length * 2} min
                </Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                  Duracao
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Exercicios
          </Text>
          {workout.exercises.map((exercise, index) => (
            <ExerciseCard key={exercise.exerciseId} exercise={exercise} index={index} showActions={false} />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Button
          title={workout.completedToday ? 'Treino concluido hoje' : 'Iniciar treino'}
          onPress={handleStartWorkout}
          fullWidth
          size="large"
          disabled={workout.completedToday}
          icon={
            <Ionicons
              name={workout.completedToday ? 'checkmark' : 'play'}
              size={20}
              color="#fff"
              style={{ marginRight: spacing.sm }}
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
    gap: spacing.sm,
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
    marginBottom: spacing.xl,
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
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.base,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    padding: spacing.base,
    borderTopWidth: 1,
  },
});
