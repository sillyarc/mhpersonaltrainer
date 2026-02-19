import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { fetchAvailableExercises } from '../../src/services/workouts';
import { Exercise } from '../../src/types/workout';
import { SearchableSelect } from '../../src/components/common';

interface CategorySummary {
  id: string;
  label: string;
  count: number;
}

const normalizeCategory = (value?: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const getCategoryVisual = (category: string | undefined, colors: any) => {
  const normalized = normalizeCategory(category);
  if (normalized.includes('ombro')) {
    return { icon: 'body-outline' as const, color: colors.primary };
  }
  if (normalized.includes('peito') || normalized.includes('peitoral')) {
    return { icon: 'heart-outline' as const, color: colors.tertiary };
  }
  if (normalized.includes('costa') || normalized.includes('dorsal') || normalized.includes('lombar')) {
    return { icon: 'body-outline' as const, color: colors.secondary };
  }
  if (normalized.includes('triceps') || normalized.includes('biceps')) {
    return { icon: 'barbell-outline' as const, color: colors.primary };
  }
  if (
    normalized.includes('perna') ||
    normalized.includes('membros inferiores') ||
    normalized.includes('coxa') ||
    normalized.includes('panturrilha')
  ) {
    return { icon: 'walk-outline' as const, color: colors.success };
  }
  if (normalized.includes('abdomen') || normalized.includes('core')) {
    return { icon: 'grid-outline' as const, color: colors.warning };
  }
  if (normalized.includes('aerobico') || normalized.includes('cardio') || normalized.includes('hiit')) {
    return { icon: 'pulse-outline' as const, color: colors.primary };
  }
  if (
    normalized.includes('funcional') ||
    normalized.includes('mobilidade') ||
    normalized.includes('alongamento')
  ) {
    return { icon: 'accessibility-outline' as const, color: colors.tertiary };
  }
  return { icon: 'barbell-outline' as const, color: colors.primary };
};

function ExerciseCardItem({
  item,
  cardWidth,
  onPress,
}: {
  item: Exercise;
  cardWidth: string;
  onPress: () => void;
}) {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const videoUrl = item.videoUrl1080 || item.videoUrl720 || item.videoUrl;
  const categoryVisual = getCategoryVisual(item.colecao || 'geral', colors);

  return (
    <TouchableOpacity
      style={[
        styles.exerciseCard,
        {
          backgroundColor: colors.secondaryBackground,
          borderRadius: borderRadius.lg,
          padding: spacing.md,
          marginBottom: spacing.sm,
          width: cardWidth,
        },
      ]}
      onPress={onPress}
    >
      <View style={styles.exerciseHeader}>
        <View
          style={[
            styles.exerciseImage,
            {
              backgroundColor: categoryVisual.color + '20',
              borderRadius: borderRadius.md,
            },
          ]}
        >
          <Ionicons name={categoryVisual.icon} size={24} color={categoryVisual.color} />
        </View>
        <View style={styles.exerciseInfo}>
          <Text style={[{ color: colors.primaryText }, typography.titleSmall]} numberOfLines={1}>
            {item.nomeDoTreino}
          </Text>
          <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
            {item.colecao || 'geral'}
          </Text>
        </View>
        {videoUrl ? (
          <Ionicons name="play-circle" size={22} color={colors.primary} />
        ) : null}
      </View>
      <View style={[styles.exerciseMeta, { marginTop: spacing.sm }]}>
        <View style={styles.metaItem}>
          <Ionicons name="repeat-outline" size={14} color={colors.secondaryText} />
          <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
            {item.seriesRep ? `${item.seriesRep} series` : 'Series livre'}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="barbell-outline" size={14} color={colors.secondaryText} />
          <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
            {item.carga ? `${item.carga} kg` : 'Carga livre'}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={14} color={colors.secondaryText} />
          <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
            {item.intervalo ? `${item.intervalo}s` : 'Intervalo livre'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function WorkoutCategoriesScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { padding, columns, isDesktop } = useResponsive();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadExercises = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const result = await fetchAvailableExercises();
      setExercises(result.data || []);
    } finally {
      if (mode === 'initial') {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadExercises('initial');
  }, [loadExercises]);

  const categories = useMemo<CategorySummary[]>(() => {
    const counts = new Map<string, number>();
    exercises.forEach((exercise) => {
      const key = exercise.colecao || 'geral';
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const list: CategorySummary[] = Array.from(counts.entries()).map(([key, count]) => ({
      id: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      count,
    }));

    list.sort((a, b) => a.label.localeCompare(b.label));
    list.unshift({ id: 'all', label: 'Todas', count: exercises.length });
    return list;
  }, [exercises]);

  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        id: category.id,
        label: `${category.label} (${category.count})`,
      })),
    [categories]
  );

  const filteredExercises = useMemo(() => {
    if (selectedCategory === 'all') return exercises;
    return exercises.filter((exercise) => exercise.colecao === selectedCategory);
  }, [exercises, selectedCategory]);

  const cardWidth = isDesktop ? `${100 / columns - 2}%` : '100%';
  const renderExerciseCard = ({ item }: { item: Exercise }) => (
    <ExerciseCardItem
      item={item}
      cardWidth={cardWidth}
      onPress={() => router.push(`/workout/exercise/${item.id}`)}
    />
  );

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
            Categorias de exercicios
          </Text>
        </View>

        <View style={[styles.categorySelect, { paddingHorizontal: padding }]}>
          <SearchableSelect
            label="Categoria"
            placeholder="Selecione uma categoria"
            options={categoryOptions}
            value={selectedCategory}
            onChange={setSelectedCategory}
          />
        </View>

        <FlatList
          data={filteredExercises}
          renderItem={renderExerciseCard}
          keyExtractor={(item) => item.id}
          numColumns={isDesktop ? columns : 1}
          key={isDesktop ? 'desktop' : 'mobile'}
          style={styles.list}
          contentContainerStyle={[styles.listContent, { padding, paddingBottom: spacing['4xl'] }]}
          refreshing={refreshing}
          onRefresh={() => loadExercises('refresh')}
          ListEmptyComponent={
            <View style={[styles.emptyContainer, { paddingVertical: spacing['4xl'] }]}>
              <Ionicons name="grid-outline" size={64} color={colors.secondaryText} />
              <Text
                style={[
                  { color: colors.secondaryText, marginTop: spacing.md },
                  typography.bodyLarge,
                ]}
              >
                {loading ? 'Carregando exercicios...' : 'Nenhum exercicio encontrado'}
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categorySelect: {
    paddingBottom: 12,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  exerciseCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exerciseImage: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
