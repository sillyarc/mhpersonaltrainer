import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { fetchAerobicWorkoutById } from '../../src/services/workouts';
import { AerobicWorkout } from '../../src/types/workout';
import { Button, Loading } from '../../src/components/common';
import { spacing, borderRadius } from '../../src/theme';

export default function AerobicoDetailScreen() {
  const { colors } = useTheme();
  const { user, role } = useAuthStore();
  const { id, studentId } = useLocalSearchParams<{ id: string; studentId?: string }>();
  const [workout, setWorkout] = useState<AerobicWorkout | null>(null);
  const [loading, setLoading] = useState(true);

  const isPersonal = role === 'personal' || role === 'professor';
  const targetUserId = studentId || user?.uid;

  useEffect(() => {
    const loadWorkout = async () => {
      if (!id || !targetUserId) {
        setLoading(false);
        return;
      }
      const result = await fetchAerobicWorkoutById(targetUserId, id);
      if (result.data) {
        setWorkout(result.data);
      }
      setLoading(false);
    };
    loadWorkout();
  }, [id, targetUserId]);

  const handleEdit = () => {
    if (!id || !targetUserId) return;
    router.push(`/workout/aerobico-create?studentId=${targetUserId}&workoutId=${id}`);
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

  const items = workout.items?.length
    ? workout.items
    : workout.treinos?.length
    ? workout.treinos.map((nome) => ({ nome }))
    : workout.treino
    ? [{ nome: workout.treino }]
    : [];

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

      <ScrollView contentContainerStyle={[styles.content, { padding: spacing.base }]}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="bicycle-outline" size={20} color={colors.success} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Atividades</Text>
          </View>
          {items.length === 0 ? (
            <Text style={[styles.cardText, { color: colors.textSecondary }]}>Sem atividades cadastradas.</Text>
          ) : (
            items.map((item, index) => {
              return (
                <Text
                  key={`${item.nome}-${index}`}
                  style={[styles.listItem, { color: colors.textSecondary }]}
                >
                  {index + 1}. {item.nome}
                </Text>
              );
            })
          )}
        </View>

        {workout.aquecimento ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="flame-outline" size={20} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.text }]}>Aquecimento</Text>
            </View>
            <Text style={[styles.cardText, { color: colors.textSecondary }]}>
              {workout.aquecimento}
            </Text>
          </View>
        ) : null}

        {workout.voltaacalma ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="walk-outline" size={20} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.text }]}>Volta a calma</Text>
            </View>
            <Text style={[styles.cardText, { color: colors.textSecondary }]}>
              {workout.voltaacalma}
            </Text>
          </View>
        ) : null}

        {workout.observacoes ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="clipboard-outline" size={20} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.text }]}>Observações</Text>
            </View>
            <Text style={[styles.cardText, { color: colors.textSecondary }]}>
              {workout.observacoes}
            </Text>
          </View>
        ) : null}
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
    fontSize: 16,
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
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  cardText: {
    fontSize: 13,
    lineHeight: 18,
  },
  listItem: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
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
