import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useAuthStore } from '../../src/store/authStore';
import { firestoreService, Aluno } from '../../src/services/firestoreService';
import { archiveUserWorkout, createUserWorkout, fetchUserWorkouts } from '../../src/services/workouts';
import { UserWorkout } from '../../src/types/workout';
import { SearchableSelect } from '../../src/components/common';
import { useFocusEffect } from '@react-navigation/native';

export default function ArchivedWorkoutsScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { padding, columns, isDesktop } = useResponsive();
  const { role, user } = useAuthStore();
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<UserWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const isPersonal = role === 'personal' || role === 'professor';
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
      if (!selectedStudentId && alunos.length > 0) {
        setSelectedStudentId(alunos[0].id);
      }
    };
    loadStudents();
  }, [isPersonal, user?.uid, selectedStudentId]);

  useEffect(() => {
    if (studentId) {
      setSelectedStudentId(studentId);
    }
  }, [studentId]);

  const loadWorkouts = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
      if (!targetUserId) {
        setWorkouts([]);
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
        const result = await fetchUserWorkouts(targetUserId, true);
        setWorkouts(result.data || []);
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

  const handleRestore = (workoutId: string) => {
    if (!targetUserId) return;
    showAlert('Restaurar treino', 'Deseja restaurar este treino?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Restaurar',
        onPress: async () => {
          setActionLoadingId(workoutId);
          await archiveUserWorkout(targetUserId, workoutId, false);
          setActionLoadingId(null);
          loadWorkouts('silent');
        },
      },
    ]);
  };

  const handleReuse = (workout: UserWorkout) => {
    if (!targetUserId) return;
    showAlert('Reutilizar treino', 'Criar uma copia ativa deste treino?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Criar copia',
        onPress: async () => {
          setActionLoadingId(workout.id);
          const payload = {
            nomeDoTreino: `${workout.nomeDoTreino} (copia)`,
            obsInstrucao: workout.obsInstrucao,
            treino: workout.treino || [],
            seriesRep: workout.seriesRep || [],
            repeticoes: workout.repeticoes || [],
            carga: workout.carga || [],
            intervalo: workout.intervalo || [],
            videoUrls: workout.videoUrls || [],
            arquivos: false,
            diasDaSemana: workout.diasDaSemana || [],
            lastCompletedAt: undefined,
          };
          const result = await createUserWorkout(targetUserId, payload);
          setActionLoadingId(null);
          if (result.error || !result.data) {
            showAlert('Erro', result.error || 'Nao foi possivel reutilizar o treino.');
            return;
          }
          showAlert('Treino reutilizado', 'Deseja abrir o treino agora?', [
            { text: 'Depois', style: 'cancel' },
            {
              text: 'Abrir',
              onPress: () =>
                router.push(`/workout/${result.data?.id}?studentId=${targetUserId ?? ''}`),
            },
          ]);
        },
      },
    ]);
  };

  const renderWorkoutCard = ({ item }: { item: UserWorkout }) => (
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
      onPress={() => router.push(`/workout/${item.id}?studentId=${targetUserId ?? ''}`)}
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
          <Ionicons name="archive-outline" size={20} color={colors.primary} />
        </View>
        <TouchableOpacity onPress={() => handleRestore(item.id)} disabled={actionLoadingId === item.id}>
          <Ionicons name="refresh-outline" size={20} color={colors.success} />
        </TouchableOpacity>
      </View>
      <Text style={[{ color: colors.primaryText, marginBottom: spacing.xs }, typography.titleMedium]}>
        {item.nomeDoTreino}
      </Text>
      <Text style={[{ color: colors.secondaryText, marginBottom: spacing.md }, typography.bodyMedium]}>
        {item.obsInstrucao || 'Treino arquivado'}
      </Text>
      <View style={[styles.workoutMeta, { gap: spacing.lg }]}>
        <View style={[styles.metaItem, { gap: spacing.xs }]}>
          <Ionicons name="list-outline" size={16} color={colors.secondaryText} />
          <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
            {item.treino?.length || 0} exercicios
          </Text>
        </View>
        <View style={[styles.metaItem, { gap: spacing.xs }]}>
          <Ionicons name="time-outline" size={16} color={colors.secondaryText} />
          <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
            {item.intervalo?.length ? `${item.intervalo.length * 2} min` : 'Tempo livre'}
          </Text>
        </View>
      </View>
      <View style={[styles.actionRow, { marginTop: spacing.md }]}>
        <TouchableOpacity
          style={[styles.actionChip, { backgroundColor: colors.surface }]}
          onPress={() => handleReuse(item)}
          disabled={actionLoadingId === item.id}
        >
          <Ionicons name="copy-outline" size={16} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.primaryText }]}>Reutilizar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionChip, { backgroundColor: colors.surface }]}
          onPress={() => handleRestore(item.id)}
          disabled={actionLoadingId === item.id}
        >
          <Ionicons name="arrow-undo-outline" size={16} color={colors.success} />
          <Text style={[styles.actionText, { color: colors.primaryText }]}>Restaurar</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.87, y: 0 }}
      end={{ x: 0.13, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { paddingHorizontal: padding, paddingVertical: spacing.md }]}>
          <Text style={[{ color: colors.primaryText }, typography.headlineLarge]}>
            Treinos arquivados
          </Text>
        </View>

        {isPersonal && students.length > 0 && (
          <View style={[styles.selectorContainer, { paddingHorizontal: padding }]}>
            <SearchableSelect
              label="Aluno"
              placeholder="Selecione um aluno"
              options={studentOptions}
              value={selectedStudentId}
              onChange={setSelectedStudentId}
            />
          </View>
        )}

        <FlatList
          data={workouts}
          renderItem={renderWorkoutCard}
          keyExtractor={(item) => item.id}
          numColumns={isDesktop ? columns : 1}
          key={isDesktop ? 'desktop' : 'mobile'}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[
            styles.listContent,
            {
              paddingHorizontal: padding,
              paddingTop: spacing.sm,
              paddingBottom: spacing['3xl'],
            },
          ]}
          refreshing={refreshing}
          onRefresh={() => loadWorkouts('refresh')}
          ListEmptyComponent={
            <View style={[styles.emptyContainer, { paddingVertical: spacing['4xl'] }]}>
              <Ionicons name="archive-outline" size={64} color={colors.secondaryText} />
              <Text
                style={[
                  { color: colors.secondaryText, marginTop: spacing.md },
                  typography.bodyLarge,
                ]}
              >
                {loading ? 'Carregando treinos...' : 'Nenhum treino arquivado'}
              </Text>
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
    alignItems: 'center',
  },
  selectorContainer: {
    paddingVertical: 8,
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
  workoutMeta: {
    flexDirection: 'row',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 999,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
