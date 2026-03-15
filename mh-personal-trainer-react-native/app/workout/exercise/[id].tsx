import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTheme } from '../../../src/hooks/useTheme';
import { Button, Card } from '../../../src/components/common';
import { fetchExerciseById } from '../../../src/services/workouts';
import { generateExerciseInsights, isPremiumUserRecord } from '../../../src/services/ai';
import { Exercise } from '../../../src/types/workout';
import { getExerciseInsights, saveExerciseInsights } from '../../../src/services/exerciseInsights';
import { getCachedVideoUri } from '../../../src/services/videoCache';
import { useAuthStore } from '../../../src/store/authStore';
import { isGifMediaUrl, resolveExerciseMediaFromExercise } from '@utils/exerciseLookup';

export default function ExerciseDetailScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { id, media } = useLocalSearchParams<{ id: string; media?: 'video' | 'gif' }>();
  const { user } = useAuthStore();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<ExerciseInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [cachedVideoUri, setCachedVideoUri] = useState<string | null>(null);
  const [isCachingVideo, setIsCachingVideo] = useState(false);
  const [preferredMedia, setPreferredMedia] = useState<'video' | 'gif'>(
    media === 'gif' ? 'gif' : 'video'
  );
  const hasPremiumAiAccess = isPremiumUserRecord((user || {}) as Record<string, any>);

  useEffect(() => {
    const loadExercise = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      const result = await fetchExerciseById(String(id));
      if (result.data) {
        setExercise(result.data);
      }
      setLoading(false);
    };
    loadExercise();
  }, [id]);

  const selectedMedia = useMemo(
    () => resolveExerciseMediaFromExercise(exercise, preferredMedia),
    [exercise, preferredMedia]
  );
  const selectedMediaUrl = selectedMedia.url || null;
  const isSelectedGif = selectedMedia.kind === 'gif' || isGifMediaUrl(selectedMediaUrl);
  const hasVideoOption = Boolean(selectedMedia.videoUrl);
  const hasGifOption = Boolean(selectedMedia.gifUrl);

  useEffect(() => {
    if (!exercise) return;
    if (preferredMedia === 'video' && hasVideoOption) return;
    if (preferredMedia === 'gif' && hasGifOption) return;
    if (hasVideoOption) {
      setPreferredMedia('video');
      return;
    }
    if (hasGifOption) {
      setPreferredMedia('gif');
    }
  }, [exercise, hasGifOption, hasVideoOption, preferredMedia]);

  useEffect(() => {
    if (media === 'gif') {
      setPreferredMedia('gif');
      return;
    }
    if (media === 'video') {
      setPreferredMedia('video');
    }
  }, [media]);

  useEffect(() => {
    let isActive = true;
    setCachedVideoUri(null);
    if (!selectedMediaUrl || isSelectedGif) {
      setIsCachingVideo(false);
      return;
    }
    setIsCachingVideo(true);
    getCachedVideoUri(selectedMediaUrl)
      .then((uri) => {
        if (isActive && uri) {
          setCachedVideoUri(uri);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) setIsCachingVideo(false);
      });
    return () => {
      isActive = false;
    };
  }, [isSelectedGif, selectedMediaUrl]);

  const loadInsights = useCallback(async () => {
    if (!exercise || insightsLoading) return;
    if (!hasPremiumAiAccess) {
      setInsights(null);
      setInsightsError('Detalhes por IA disponiveis apenas para assinantes Premium.');
      return;
    }
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const cached = await getExerciseInsights(exercise.id);
      if (cached) {
        setInsights(normalizeInsights(cached));
        setInsightsLoading(false);
        return;
      }

      if (!process.env.EXPO_PUBLIC_OPENROUTER_API_KEY) {
        setInsightsLoading(false);
        return;
      }

      const result = await generateExerciseInsights({
        nome: exercise.nomeDoTreino,
        categoria: exercise.colecao || 'geral',
      });
      const normalized = normalizeInsights(result);
      setInsights(normalized);
      await saveExerciseInsights(exercise.id, normalized);
    } catch (error: any) {
      setInsightsError(error?.message || 'Falha ao carregar detalhes.');
    } finally {
      setInsightsLoading(false);
    }
  }, [exercise, hasPremiumAiAccess, insightsLoading]);

  useEffect(() => {
    if (!exercise) return;
    if (!hasPremiumAiAccess) return;
    if (insights || insightsLoading) return;
    loadInsights();
  }, [exercise, hasPremiumAiAccess, insights, insightsLoading, loadInsights]);

  if (loading || !exercise) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
        <View style={styles.loadingContainer}>
          <Text style={[{ color: colors.primaryText }, typography.bodyLarge]}>
            Carregando exercício...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { padding: spacing.lg, paddingBottom: spacing['4xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {selectedMediaUrl ? (
            isSelectedGif ? (
              <ExerciseGif uri={selectedMediaUrl} borderRadius={borderRadius.xl} />
            ) : (
              <ExerciseVideo
                key={cachedVideoUri || selectedMediaUrl}
                uri={cachedVideoUri || selectedMediaUrl}
                borderRadius={borderRadius.xl}
              />
            )
          ) : (
            <View
              style={[
                styles.heroImage,
                {
                  backgroundColor: colors.primary + '20',
                  borderRadius: borderRadius.xl,
                },
              ]}
            >
              <Ionicons name="barbell" size={48} color={colors.primary} />
            </View>
          )}
        </View>

        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[{ color: colors.primaryText }, typography.headlineMedium]}>
              {exercise.nomeDoTreino}
            </Text>
            <Text style={[{ color: colors.secondaryText }, typography.labelLarge]}>
              {exercise.colecao || 'geral'}
            </Text>
          </View>
          {selectedMediaUrl ? (
            <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons
                name={isSelectedGif ? 'images-outline' : 'play'}
                size={14}
                color={colors.primary}
              />
              <Text style={[styles.badgeText, { color: colors.primary }]}>
                {isSelectedGif ? 'GIF' : isCachingVideo ? 'Salvando video' : 'Video'}
              </Text>
            </View>
          ) : null}
        </View>

        {hasVideoOption && hasGifOption ? (
          <View style={styles.mediaSwitchRow}>
            <TouchableOpacity
              style={[
                styles.mediaSwitchButton,
                {
                  borderColor: colors.border,
                  backgroundColor:
                    preferredMedia === 'video' ? colors.primary + '18' : colors.secondaryBackground,
                },
              ]}
              onPress={() => setPreferredMedia('video')}
            >
              <Ionicons name="play-circle-outline" size={16} color={colors.primary} />
              <Text style={[styles.mediaSwitchText, { color: colors.primaryText }]}>Video</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.mediaSwitchButton,
                {
                  borderColor: colors.border,
                  backgroundColor:
                    preferredMedia === 'gif' ? colors.success + '18' : colors.secondaryBackground,
                },
              ]}
              onPress={() => setPreferredMedia('gif')}
            >
              <Ionicons name="images-outline" size={16} color={colors.success} />
              <Text style={[styles.mediaSwitchText, { color: colors.primaryText }]}>GIF</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View
          style={[
            styles.infoCard,
            { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg },
          ]}
        >
          <View style={styles.infoRow}>
            <Ionicons name="repeat-outline" size={18} color={colors.secondaryText} />
            <Text style={[styles.infoLabel, { color: colors.secondaryText }]}>Series</Text>
            <Text style={[styles.infoValue, { color: colors.primaryText }]}>
              {exercise.seriesRep ?? 'Livre'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="barbell-outline" size={18} color={colors.secondaryText} />
            <Text style={[styles.infoLabel, { color: colors.secondaryText }]}>Carga</Text>
            <Text style={[styles.infoValue, { color: colors.primaryText }]}>
              {exercise.carga ?? 'Livre'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={18} color={colors.secondaryText} />
            <Text style={[styles.infoLabel, { color: colors.secondaryText }]}>Intervalo</Text>
            <Text style={[styles.infoValue, { color: colors.primaryText }]}>
              {exercise.intervalo ? `${exercise.intervalo}s` : 'Livre'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="people-outline" size={18} color={colors.secondaryText} />
            <Text style={[styles.infoLabel, { color: colors.secondaryText }]}>Adicionados</Text>
            <Text style={[styles.infoValue, { color: colors.primaryText }]}>
              {exercise.adicionados ?? 0}
            </Text>
          </View>
        </View>

        {hasPremiumAiAccess ? (
          <Card style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <Text style={[styles.aiTitle, { color: colors.primaryText }]}>
              Detalhes do exercício
            </Text>
            {insightsLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>
          {insights ? (
            <View style={styles.aiContent}>
              <Text style={[styles.aiText, { color: colors.secondaryText }]}>
                {insights.resumo}
              </Text>
              <View style={styles.aiGrid}>
                <MetricBar label="Cardio" value={insights.metricas.cardio} />
                <MetricBar label="Forca" value={insights.metricas.forca} />
                <MetricBar label="Mobilidade" value={insights.metricas.mobilidade} />
                <MetricBar label="Resistencia" value={insights.metricas.resistencia} />
              </View>
              <View style={styles.aiRow}>
                <Text style={[styles.aiLabel, { color: colors.textSecondary }]}>Nivel</Text>
                <Text style={[styles.aiValue, { color: colors.primaryText }]}>
                  {insights.nivel}
                </Text>
              </View>
              <Text style={[styles.aiSubTitle, { color: colors.primaryText }]}>
                Dica tecnica
              </Text>
              <Text style={[styles.aiText, { color: colors.secondaryText }]}>
                {insights.dica}
              </Text>
              <Text style={[styles.aiSubTitle, { color: colors.primaryText }]}>
                Erro comum
              </Text>
              <Text style={[styles.aiText, { color: colors.secondaryText }]}>
                {insights.erroComum}
              </Text>
              <Text style={[styles.aiSubTitle, { color: colors.primaryText }]}>
                Beneficios
              </Text>
              {insights.beneficios.map((item, index) => (
                <Text key={`${item}-${index}`} style={[styles.aiBullet, { color: colors.secondaryText }]}>
                  - {item}
                </Text>
              ))}
              <Text style={[styles.aiSubTitle, { color: colors.primaryText }]}>
                Musculos alvo
              </Text>
              {insights.musculos.map((item, index) => (
                <Text key={`${item}-${index}`} style={[styles.aiBullet, { color: colors.secondaryText }]}>
                  - {item}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={[styles.aiPlaceholder, { color: colors.secondaryText }]}>
              {insightsLoading
                ? 'Carregando detalhes...'
                : 'Detalhes indisponiveis no momento.'}
            </Text>
          )}
          {insightsError ? (
            <Text style={[styles.aiError, { color: colors.error }]}>{insightsError}</Text>
          ) : null}
          </Card>
        ) : (
          <Card style={styles.aiCard}>
            <View style={styles.aiHeader}>
              <Text style={[styles.aiTitle, { color: colors.primaryText }]}>
                Recursos IA Premium
              </Text>
            </View>
            <Text style={[styles.aiText, { color: colors.secondaryText }]}>
              Detalhes de IA para exercicios estao disponiveis apenas para assinantes Premium.
            </Text>
            <Button
              title="Ver planos Premium"
              onPress={() => router.push('/profile/subscription' as any)}
              variant="outline"
            />
          </Card>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function ExerciseVideo({ uri, borderRadius }: { uri: string; borderRadius: number }) {
  const { colors } = useTheme();
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });

  return (
    <View style={[styles.heroVideo, { borderRadius, backgroundColor: colors.secondaryBackground }]}>
      <VideoView style={styles.heroVideoInner} player={player} contentFit="cover" />
    </View>
  );
}

function ExerciseGif({ uri, borderRadius }: { uri: string; borderRadius: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.heroVideo, { borderRadius, backgroundColor: colors.secondaryBackground }]}>
      <Image source={{ uri }} style={styles.heroVideoInner} resizeMode="cover" />
    </View>
  );
}

type ExerciseInsights = {
  resumo: string;
  beneficios: string[];
  musculos: string[];
  dica: string;
  erroComum: string;
  nivel: string;
  metricas: {
    cardio: number;
    forca: number;
    mobilidade: number;
    resistencia: number;
  };
};

function normalizeInsights(raw: ExerciseInsights): ExerciseInsights {
  const clamp = (value: number) => Math.max(0, Math.min(100, Number(value) || 0));
  return {
    resumo: raw?.resumo || 'Detalhes não informados.',
    beneficios: Array.isArray(raw?.beneficios) ? raw.beneficios : [],
    musculos: Array.isArray(raw?.musculos) ? raw.musculos : [],
    dica: raw?.dica || 'Sem dica tecnica.',
    erroComum: raw?.erroComum || 'Sem erro comum.',
    nivel: raw?.nivel || 'Intermediario',
    metricas: {
      cardio: clamp(raw?.metricas?.cardio ?? 0),
      forca: clamp(raw?.metricas?.forca ?? 0),
      mobilidade: clamp(raw?.metricas?.mobilidade ?? 0),
      resistencia: clamp(raw?.metricas?.resistencia ?? 0),
    },
  };
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricHeader}>
        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
        <Text style={[styles.metricValue, { color: colors.primaryText }]}>
          {Math.round(value)}%
        </Text>
      </View>
      <View style={[styles.metricTrack, { backgroundColor: colors.surface }]}>
        <View
          style={[
            styles.metricFill,
            { backgroundColor: colors.primary, width: `${Math.round(value)}%` },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginBottom: 16,
  },
  heroImage: {
    width: '100%',
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroVideo: {
    width: '100%',
    height: 240,
    overflow: 'hidden',
  },
  heroVideoInner: {
    width: '100%',
    height: '100%',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mediaSwitchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  mediaSwitchButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mediaSwitchText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoCard: {
    padding: 16,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoLabel: {
    flex: 1,
    fontSize: 13,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  aiCard: {
    marginTop: 20,
    gap: 12,
  },
  aiContent: {
    gap: 10,
  },
  aiGrid: {
    gap: 12,
  },
  aiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aiLabel: {
    fontSize: 12,
  },
  aiValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  aiTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  aiSubTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  aiText: {
    fontSize: 14,
    lineHeight: 20,
  },
  aiPlaceholder: {
    fontSize: 13,
    lineHeight: 19,
  },
  aiError: {
    fontSize: 12,
  },
  aiBullet: {
    fontSize: 13,
    lineHeight: 19,
  },
  metricRow: {
    gap: 6,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  metricFill: {
    height: 8,
    borderRadius: 999,
  },
});
