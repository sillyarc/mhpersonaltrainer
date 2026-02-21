import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useAuthStore } from '../../src/store/authStore';
import { firestoreService, Aluno } from '../../src/services/firestoreService';
import { fetchAerobicWorkouts } from '../../src/services/workouts';
import { AerobicWorkout } from '../../src/types/workout';
import { SearchableSelect } from '../../src/components/common';

export default function AerobicoScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { padding } = useResponsive();
  const { role, user } = useAuthStore();
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<AerobicWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        const result = await fetchAerobicWorkouts(targetUserId);
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

  const renderCard = ({ item }: { item: AerobicWorkout }) => {
    const treinos = item.treinos?.length
      ? item.treinos
      : item.treino
      ? [item.treino]
      : [];
    const title = treinos[0] || 'Treino aeróbico';
    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: colors.secondaryBackground,
            borderRadius: borderRadius.lg,
            padding: spacing.md,
            marginBottom: spacing.sm,
          },
        ]}
        onPress={() =>
          isPersonal
            ? router.push(
                `/workout/aerobico-create?studentId=${selectedStudentId ?? ''}&workoutId=${item.id}`
              )
            : null
        }
        activeOpacity={isPersonal ? 0.8 : 1}
      >
        <View style={styles.cardHeader}>
          <Ionicons name="bicycle-outline" size={22} color={colors.success} />
          <Text style={[{ color: colors.primaryText }, typography.titleSmall]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {treinos.length > 1 && (
          <Text style={[styles.cardLine, { color: colors.secondaryText }, typography.bodySmall]}>
            {treinos.length} atividades
          </Text>
        )}
        {item.aquecimento ? (
          <Text style={[styles.cardLine, { color: colors.secondaryText }, typography.bodySmall]}>
            Aquecimento: {item.aquecimento}
          </Text>
        ) : null}
        {item.voltaacalma ? (
          <Text style={[styles.cardLine, { color: colors.secondaryText }, typography.bodySmall]}>
            Volta a calma: {item.voltaacalma}
          </Text>
        ) : null}
        {item.observacoes ? (
          <Text style={[styles.cardLine, { color: colors.secondaryText }, typography.bodySmall]}>
            Observações: {item.observacoes}
          </Text>
        ) : null}
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
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, { paddingHorizontal: padding, paddingVertical: spacing.md }]}>
          <Text style={[{ color: colors.primaryText }, typography.headlineLarge]}>
            Treinos aeróbicos
          </Text>
          {isPersonal && (
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary, borderRadius: borderRadius.full }]}
              onPress={() => router.push(`/workout/aerobico-create?studentId=${selectedStudentId ?? ''}`)}
            >
              <Ionicons name="add" size={22} color={colors.info} />
            </TouchableOpacity>
          )}
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
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { padding }]}
          refreshing={refreshing}
          onRefresh={() => loadWorkouts('refresh')}
          ListEmptyComponent={
            <View style={[styles.emptyContainer, { paddingVertical: spacing['4xl'] }]}>
              <Ionicons name="bicycle-outline" size={64} color={colors.secondaryText} />
              <Text
                style={[
                  { color: colors.secondaryText, marginTop: spacing.md },
                  typography.bodyLarge,
                ]}
              >
                {loading ? 'Carregando treinos...' : 'Nenhum treino aeróbico encontrado'}
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
    justifyContent: 'space-between',
  },
  addButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorContainer: {
    paddingVertical: 8,
  },
  listContent: {
    flexGrow: 1,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  cardLine: {
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
