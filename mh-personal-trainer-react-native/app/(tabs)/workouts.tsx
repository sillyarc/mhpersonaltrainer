import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { useResponsive } from '../../src/hooks/useResponsive';
import { fetchAerobicWorkouts, fetchUserWorkouts } from '../../src/services/workouts';
import { firestoreService, Aluno } from '../../src/services/firestoreService';
import { AerobicWorkout, UserWorkout } from '../../src/types/workout';
import { SearchableSelect } from '../../src/components/common';
import { getWorkoutStatusPresentation } from '../../src/utils/workoutStatus';
import { spacing as themeSpacing, borderRadius as themeBorderRadius } from '../../src/theme';

export default function WorkoutsScreen() {
  const { t } = useTranslation();
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { role, user } = useAuthStore();
  const { isDesktop, padding, columns } = useResponsive();
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const [workouts, setWorkouts] = useState<UserWorkout[]>([]);
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [aerobicWorkouts, setAerobicWorkouts] = useState<AerobicWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isPersonal = role === 'personal' || role === 'professor';
  const isAdmin = role === 'admin';
  const targetUserId = isPersonal ? selectedStudentId : user?.uid;
  const studentOptions = students.map((student) => ({
    id: student.id,
    label: student.nome,
    description: student.email,
  }));

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
  }, [isPersonal, user?.uid, selectedStudentId, studentId]);

  useEffect(() => {
    if (studentId) {
      setSelectedStudentId(studentId);
    }
  }, [studentId]);

  const loadWorkouts = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
      if (!targetUserId) {
        setWorkouts([]);
        setAerobicWorkouts([]);
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
        const [result, aerobicResult] = await Promise.all([
          fetchUserWorkouts(targetUserId, false),
          fetchAerobicWorkouts(targetUserId),
        ]);
        setWorkouts(result.data || []);
        setAerobicWorkouts(aerobicResult.data || []);
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
    loadWorkouts('initial');
  }, [loadWorkouts]);

  useFocusEffect(
    useCallback(() => {
      loadWorkouts('silent');
    }, [loadWorkouts])
  );

  const listTitle = isPersonal
    ? t('workout.studentWorkouts')
    : isAdmin
      ? t('workout.adminWorkouts')
      : t('workout.myWorkouts');

  const isCompletedToday = (lastCompletedAt?: Date) => {
    if (!lastCompletedAt) return false;
    const completed = new Date(lastCompletedAt);
    const today = new Date();
    return (
      completed.getFullYear() === today.getFullYear() &&
      completed.getMonth() === today.getMonth() &&
      completed.getDate() === today.getDate()
    );
  };

  type WorkoutListItem =
    | { kind: 'strength'; data: UserWorkout }
    | { kind: 'aerobic'; data: AerobicWorkout };

  const listItems: WorkoutListItem[] = [
    ...workouts.map((item) => ({ kind: 'strength', data: item } as WorkoutListItem)),
    ...aerobicWorkouts.map((item) => ({ kind: 'aerobic', data: item } as WorkoutListItem)),
  ].sort((a, b) => {
    const aName =
      a.kind === 'strength'
        ? a.data.nomeDoTreino
        : a.data.treinos?.[0] || a.data.treino || t('workout.aerobicWorkout');
    const bName =
      b.kind === 'strength'
        ? b.data.nomeDoTreino
        : b.data.treinos?.[0] || b.data.treino || t('workout.aerobicWorkout');
    return aName.localeCompare(bName, 'pt-BR');
  });

  const renderWorkoutCard = ({ item }: { item: UserWorkout }) => {
    const workoutStatus = getWorkoutStatusPresentation(item);
    const badgeColor =
      workoutStatus.badgeTone === 'warning' ? colors.warning : colors.success;
    const hasMissingExercises = workoutStatus.status === 'partial';
    return (
      <TouchableOpacity
        style={[
          styles.workoutCard,
          {
            backgroundColor: colors.secondaryBackground,
            borderRadius: borderRadius.lg,
            padding: spacing.md,
            marginBottom: spacing.sm,
            width: isDesktop ? `${100 / columns - 2}%` : '100%',
          },
        ]}
        onPress={() =>
          router.push({
            pathname: '/workout/[id]',
            params: { id: item.id, ...(targetUserId ? { studentId: targetUserId } : {}) },
          })
        }
      >
        <View style={[styles.workoutHeader, { marginBottom: spacing.md }]}>
          <View
            style={[
              styles.categoryBadge,
              {
                backgroundColor: colors.primary + '20',
                borderRadius: borderRadius.md,
              },
            ]}
          >
            <Ionicons name="barbell" size={20} color={colors.primary} />
          </View>
          {workoutStatus.status !== 'pending' ? (
            <View style={styles.statusStack}>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: badgeColor + '20',
                    borderRadius: borderRadius.full,
                  },
                ]}
              >
                <Text style={[styles.statusText, { color: badgeColor }]}>
                  {workoutStatus.badgeLabel}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
        <View style={styles.workoutTitleRow}>
          <Text
            style={[
              { color: colors.primaryText, marginBottom: spacing.xs, flex: 1 },
              typography.titleMedium,
            ]}
          >
            {item.nomeDoTreino}
          </Text>
          {hasMissingExercises ? (
            <View style={[styles.warningInlineBadge, { backgroundColor: colors.warning + '18' }]}>
              <Text style={[styles.warningInlineBadgeText, { color: colors.warning }]}>!</Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[
            { color: colors.secondaryText, marginBottom: spacing.md },
            typography.bodyMedium,
          ]}
        >
          {item.obsInstrucao || t('workout.customWorkout')}
        </Text>
        <View style={[styles.workoutMeta, { gap: spacing.lg }]}>
          <View style={[styles.metaItem, { gap: spacing.xs }]}>
            <Ionicons name="list-outline" size={16} color={colors.secondaryText} />
            <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
              {t('workout.exerciseCount', { count: item.treino?.length || 0 })}
            </Text>
          </View>
          <View style={[styles.metaItem, { gap: spacing.xs }]}>
            <Ionicons name="time-outline" size={16} color={colors.secondaryText} />
            <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
              {item.intervalo?.length ? `${item.intervalo.length * 2} min` : t('workout.freeTime')}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAerobicCard = ({ item }: { item: AerobicWorkout }) => {
    const completedToday = isCompletedToday(item.lastCompletedAt);
    const treinos = item.treinos?.length
      ? item.treinos
      : item.treino
        ? [item.treino]
        : [];

    return (
      <TouchableOpacity
        style={[
          styles.workoutCard,
          {
            backgroundColor: colors.secondaryBackground,
            borderRadius: borderRadius.lg,
            padding: spacing.md,
            marginBottom: spacing.sm,
            width: isDesktop ? `${100 / columns - 2}%` : '100%',
          },
        ]}
        onPress={() =>
          router.push({
            pathname: '/workout/aerobico-detail',
            params: { id: item.id, ...(targetUserId ? { studentId: targetUserId } : {}) },
          })
        }
      >
        <View style={[styles.workoutHeader, { marginBottom: spacing.md }]}>
          <View
            style={[
              styles.categoryBadge,
              {
                backgroundColor: colors.success + '20',
                borderRadius: borderRadius.md,
              },
            ]}
          >
            <Ionicons name="bicycle-outline" size={20} color={colors.success} />
          </View>
          {completedToday ? (
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: colors.success + '20', borderRadius: borderRadius.full },
              ]}
            >
              <Ionicons name="checkmark" size={16} color={colors.success} />
              <Text style={[styles.statusText, { color: colors.success }]}>
                {t('workout.completedToday')}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[
            { color: colors.primaryText, marginBottom: spacing.xs },
            typography.titleMedium,
          ]}
        >
          {treinos[0] || t('workout.aerobicWorkout')}
        </Text>
        <Text
          style={[
            { color: colors.secondaryText, marginBottom: spacing.md },
            typography.bodyMedium,
          ]}
        >
          {item.observacoes || item.aquecimento || t('workout.aerobicWorkout')}
        </Text>
        <View style={[styles.workoutMeta, { gap: spacing.lg }]}>
          <View style={[styles.metaItem, { gap: spacing.xs }]}>
            <Ionicons name="list-outline" size={16} color={colors.secondaryText} />
            <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
              {t('workout.activityCount', { count: treinos.length })}
            </Text>
          </View>
          {item.aquecimento ? (
            <View style={[styles.metaItem, { gap: spacing.xs }]}>
              <Ionicons name="flame-outline" size={16} color={colors.secondaryText} />
              <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
                {t('workout.warmup')}
              </Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.87, y: 0 }}
      end={{ x: 0.13, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View
          style={[styles.header, { paddingHorizontal: padding, paddingVertical: spacing.md }]}
        >
          <Text style={[{ color: colors.primaryText }, typography.headlineLarge]}>
            {listTitle}
          </Text>
          {isPersonal ? (
            <TouchableOpacity
              style={[
                styles.addButton,
                { backgroundColor: colors.primary, borderRadius: borderRadius.full },
              ]}
              onPress={() =>
                router.push({
                  pathname: '/workout/create',
                  params: selectedStudentId ? { studentId: selectedStudentId } : {},
                })
              }
            >
              <Ionicons name="add" size={24} color={colors.info} />
            </TouchableOpacity>
          ) : null}
        </View>

        {isPersonal && students.length > 0 ? (
          <View style={[styles.selectorContainer, { paddingHorizontal: padding }]}>
            <SearchableSelect
              label={t('workout.studentLabel')}
              placeholder={t('workout.selectStudent')}
              options={studentOptions}
              value={selectedStudentId}
              onChange={setSelectedStudentId}
            />
          </View>
        ) : null}

        {isPersonal ? (
          <View style={[styles.quickActions, { paddingHorizontal: padding, gap: spacing.sm }]}>
            <TouchableOpacity
              style={[styles.quickActionChip, { backgroundColor: colors.secondaryBackground }]}
              onPress={() => router.push('/workout/categories')}
            >
              <Ionicons name="grid-outline" size={18} color={colors.primary} />
              <Text style={[styles.quickActionText, { color: colors.primaryText }]}>
                {t('workout.categories')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickActionChip, { backgroundColor: colors.secondaryBackground }]}
              onPress={() => router.push('/workout/aerobico')}
            >
              <Ionicons name="bicycle-outline" size={18} color={colors.success} />
              <Text style={[styles.quickActionText, { color: colors.primaryText }]}>
                {t('workout.aerobic')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickActionChip, { backgroundColor: colors.secondaryBackground }]}
              onPress={() => router.push('/workout/archived')}
            >
              <Ionicons name="archive-outline" size={18} color={colors.warning} />
              <Text style={[styles.quickActionText, { color: colors.primaryText }]}>
                {t('workout.archived')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <FlatList
          data={listItems}
          renderItem={({ item }) =>
            item.kind === 'strength'
              ? renderWorkoutCard({ item: item.data })
              : renderAerobicCard({ item: item.data })
          }
          keyExtractor={(item) => `${item.kind}-${item.data.id}`}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[
            styles.listContent,
            {
              paddingHorizontal: padding,
              paddingTop: spacing.sm,
              paddingBottom: spacing['3xl'],
            },
          ]}
          numColumns={isDesktop ? columns : 1}
          key={isDesktop ? 'desktop' : 'mobile'}
          refreshing={refreshing}
          onRefresh={() => loadWorkouts('refresh')}
          ListEmptyComponent={
            <View style={[styles.emptyContainer, { paddingVertical: spacing['4xl'] }]}>
              <Ionicons name="barbell-outline" size={64} color={colors.secondaryText} />
              <Text
                style={[
                  {
                    color: colors.secondaryText,
                    marginTop: spacing.md,
                    marginBottom: spacing.xl,
                  },
                  typography.bodyLarge,
                ]}
              >
                {loading ? t('common.loading') : t('workout.noWorkoutsFound')}
              </Text>
              {isPersonal ? (
                <TouchableOpacity
                  style={[
                    styles.createButton,
                    {
                      backgroundColor: colors.primary,
                      borderRadius: borderRadius.lg,
                      paddingHorizontal: spacing.xl,
                      paddingVertical: spacing.md,
                    },
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: '/workout/create',
                      params: selectedStudentId ? { studentId: selectedStudentId } : {},
                    })
                  }
                >
                  <Text style={[{ color: colors.info }, typography.titleSmall]}>
                    {t('workout.createWorkout')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorContainer: {
    paddingVertical: 8,
  },
  quickActions: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  quickActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 6,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    flexGrow: 1,
  },
  workoutCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  workoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryBadge: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusStack: {
    alignItems: 'flex-end',
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusHelperText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
  },
  workoutTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: themeSpacing.sm,
  },
  warningInlineBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: themeBorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: themeSpacing.xs,
  },
  warningInlineBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  workoutMeta: {
    flexDirection: 'row',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButton: {},
});
