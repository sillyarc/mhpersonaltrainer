import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { fetchAvailableExercises } from '../../src/services/workouts';
import { Exercise } from '../../src/types/workout';
import { useAuthStore } from '../../src/store/authStore';
import { isPremiumUserRecord } from '../../src/services/ai';

export default function GPTTrainingHomeScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { user } = useAuthStore();
  const hasPremiumAiAccess = isPremiumUserRecord((user || {}) as Record<string, any>);
  const [popular, setPopular] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPopular = useCallback(async () => {
    setLoading(true);
    const result = await fetchAvailableExercises();
    const list = (result.data || []).slice(0, 8);
    setPopular(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPopular();
  }, [loadPopular]);

  if (!hasPremiumAiAccess) {
    return (
      <LinearGradient
        colors={[colors.primaryBackground, colors.alternate]}
        start={{ x: 0.85, y: 0 }}
        end={{ x: 0.15, y: 1 }}
        style={styles.container}
      >
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
            <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
              <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
                Recurso Premium
              </Text>
              <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                Treinos com IA estao disponiveis apenas para assinantes Premium.
              </Text>
              <TouchableOpacity
                style={[styles.heroButton, { backgroundColor: colors.primary, borderRadius: borderRadius.full }]}
                onPress={() => router.push('/profile/subscription' as any)}
              >
                <Text style={[{ color: colors.info }, typography.titleSmall]}>
                  Ver planos Premium
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
          <View style={[styles.hero, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
            <View style={styles.heroHeader}>
              <View style={[styles.heroIcon, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="sparkles-outline" size={28} color={colors.primary} />
              </View>
              <View style={styles.heroText}>
                <Text style={[{ color: colors.primaryText }, typography.headlineSmall]}>
                  Assistente IA
                </Text>
                <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                  Tire duvidas e crie treinos personalizados.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.heroButton, { backgroundColor: colors.primary, borderRadius: borderRadius.full }]}
              onPress={() => router.push('/ai/assistant')}
            >
              <Text style={[{ color: colors.info }, typography.titleSmall]}>
                Conversar com a IA
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
              Treinos populares
            </Text>
            <TouchableOpacity onPress={() => router.push('/workout/categories')}>
              <Text style={[{ color: colors.primary }, typography.labelSmall]}>Ver todos</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={popular}
            horizontal
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.exerciseCard,
                  { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg },
                ]}
              >
                <Text style={[{ color: colors.primaryText }, typography.titleSmall]} numberOfLines={1}>
                  {item.nomeDoTreino}
                </Text>
                <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                  {item.colecao || 'geral'}
                </Text>
                <View style={styles.exerciseMeta}>
                  <Ionicons name="barbell-outline" size={16} color={colors.primary} />
                  <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
                    {item.seriesRep ? `${item.seriesRep} series` : 'Series livre'}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                  {loading ? 'Carregando treinos...' : 'Nenhum treino encontrado'}
                </Text>
              </View>
            }
          />

          <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
            <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
              Dicas do dia
            </Text>
            <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
              Hidratacao, descanso e constancia sao os pilares do progresso.
            </Text>
          </View>
        </ScrollView>
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
  content: {
    gap: 16,
  },
  hero: {
    padding: 16,
    gap: 12,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    flex: 1,
  },
  heroButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  horizontalList: {
    gap: 12,
  },
  exerciseCard: {
    width: 180,
    padding: 12,
    gap: 6,
  },
  exerciseMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyCard: {
    padding: 12,
  },
  card: {
    padding: 16,
    gap: 8,
  },
});
