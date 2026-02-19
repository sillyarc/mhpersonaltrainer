import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { G, Circle } from 'react-native-svg';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { Card, Button, Loading } from '../../src/components/common';
import { firestoreService } from '../../src/services/firestoreService';
import {
  fetchEvaluations,
  calculateIMC,
  getEvaluationTypeLabel,
} from '../../src/services/evaluations';
import {
  PhysicalEvaluation,
  OnlineEvaluation,
  PhysicalTestEvaluation,
  PersonalizedEvaluation,
  PosturalEvaluation,
  EvaluationType,
} from '../../src/types/evaluation';
import {
  EvaluationInsightMetric,
  StudentEvolutionInsights,
  generateStudentEvolutionInsights,
  isPremiumUserRecord,
} from '../../src/services/ai';
import { useAuthStore } from '../../src/store/authStore';
import { borderRadius, spacing } from '../../src/theme';

type PieSegment = EvaluationInsightMetric & { color: string };

const formatDate = (date?: Date | null) => {
  if (!date) return '--';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatNumber = (value?: number | null, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  const fixed = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(digits);
  return fixed.replace('.', ',');
};

const sortByDateDesc = (a: PhysicalEvaluation, b: PhysicalEvaluation) =>
  (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);

const isOnline = (evaluation: PhysicalEvaluation): evaluation is OnlineEvaluation =>
  evaluation.type === 'online';

const isFisica = (evaluation: PhysicalEvaluation): evaluation is PhysicalTestEvaluation =>
  evaluation.type === 'fisica';

const isPostural = (evaluation: PhysicalEvaluation): evaluation is PosturalEvaluation =>
  evaluation.type === 'postural';

const isPersonalizada = (evaluation: PhysicalEvaluation): evaluation is PersonalizedEvaluation =>
  evaluation.type === 'personalizada';

const buildPieSegments = (
  base: EvaluationInsightMetric[],
  fallback: EvaluationInsightMetric[],
  colors: string[]
): PieSegment[] => {
  const source = base.length ? base : fallback;
  return source.map((segment, index) => ({
    ...segment,
    color: colors[index % colors.length],
  }));
};

const PieChart = ({
  size,
  strokeWidth,
  segments,
  backgroundColor,
  iconColor,
}: {
  size: number;
  strokeWidth: number;
  segments: PieSegment[];
  backgroundColor: string;
  iconColor: string;
}) => {
  const total = segments.reduce((sum, segment) => sum + (segment.value || 0), 0);
  if (total <= 0) {
    return (
      <View
        style={[
          styles.piePlaceholder,
          { width: size, height: size, backgroundColor },
        ]}
      >
        <Ionicons name="pie-chart-outline" size={28} color={iconColor} />
      </View>
    );
  }

  const radius = size / 2 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <Svg width={size} height={size}>
      <G rotation="-90" originX={size / 2} originY={size / 2}>
        {segments.map((segment) => {
          const value = Math.max(0, segment.value || 0);
          const length = (value / total) * circumference;
          const offset = -(cumulative / total) * circumference;
          cumulative += value;
          return (
            <Circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={segment.color}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          );
        })}
      </G>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius - strokeWidth / 2}
        fill={backgroundColor}
      />
    </Svg>
  );
};

export default function StudentEvolutionScreen() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { colors, spacing: themeSpacing, typography } = useTheme();
  const { user } = useAuthStore();
  const { padding } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any | null>(null);
  const [evaluations, setEvaluations] = useState<PhysicalEvaluation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<StudentEvolutionInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const hasPremiumAiAccess = isPremiumUserRecord((user || {}) as Record<string, any>);

  const loadData = useCallback(async () => {
    if (!studentId) {
      setError('Aluno nao encontrado.');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const doc = await firestoreService.getUserDocument(studentId);
      setStudent(doc);
      const evalResult = await fetchEvaluations(studentId);
      const evals = evalResult.data ? [...evalResult.data] : [];
      evals.sort(sortByDateDesc);
      setEvaluations(evals);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar dados do aluno.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const evaluationSummary = useMemo(() => {
    const grouped = {
      online: evaluations.filter(isOnline).sort(sortByDateDesc),
      fisica: evaluations.filter(isFisica).sort(sortByDateDesc),
      postural: evaluations.filter(isPostural).sort(sortByDateDesc),
      personalizada: evaluations.filter(isPersonalizada).sort(sortByDateDesc),
    };
    const latest = evaluations[0] || null;
    const lastStamp = evaluations.reduce((max, evaluation) => {
      const stamp = evaluation.updatedAt || evaluation.createdAt || evaluation.date;
      const value = stamp ? stamp.getTime() : 0;
      return Math.max(max, value);
    }, 0);
    return {
      grouped,
      latest,
      lastStamp,
      total: evaluations.length,
    };
  }, [evaluations]);

  const latestOnline = evaluationSummary.grouped.online[0];
  const firstOnline = evaluationSummary.grouped.online[evaluationSummary.grouped.online.length - 1];
  const latestFisica = evaluationSummary.grouped.fisica[0];
  const firstFisica = evaluationSummary.grouped.fisica[evaluationSummary.grouped.fisica.length - 1];
  const latestPostural = evaluationSummary.grouped.postural[0];
  const latestPersonalizada = evaluationSummary.grouped.personalizada[0];

  const latestWeight =
    latestFisica?.composicaoCorporal?.peso || latestOnline?.peso || undefined;
  const firstWeight =
    firstFisica?.composicaoCorporal?.peso || firstOnline?.peso || undefined;
  const weightDelta =
    typeof latestWeight === 'number' && typeof firstWeight === 'number'
      ? latestWeight - firstWeight
      : null;

  const latestHeight =
    latestFisica?.composicaoCorporal?.altura || latestOnline?.altura || undefined;
  const latestImc =
    latestFisica?.composicaoCorporal?.imc || latestOnline?.imc ||
    (latestWeight && latestHeight ? calculateIMC(latestWeight, latestHeight) : undefined);

  const firstImc =
    firstFisica?.composicaoCorporal?.imc || firstOnline?.imc ||
    (firstWeight && latestHeight ? calculateIMC(firstWeight, latestHeight) : undefined);
  const imcDelta =
    typeof latestImc === 'number' && typeof firstImc === 'number'
      ? latestImc - firstImc
      : null;

  const bodyFat = latestFisica?.composicaoCorporal?.percentualGordura;
  const weightForComposition = latestFisica?.composicaoCorporal?.peso || latestOnline?.peso;
  const massaGorda =
    latestFisica?.composicaoCorporal?.massaGorda ||
    (bodyFat && weightForComposition ? (bodyFat / 100) * weightForComposition : undefined);
  const massaMagra =
    latestFisica?.composicaoCorporal?.massaMagra ||
    (weightForComposition && massaGorda !== undefined
      ? weightForComposition - massaGorda
      : undefined);

  const compositionSegments: EvaluationInsightMetric[] = useMemo(() => {
    if (typeof bodyFat === 'number' && bodyFat > 0 && bodyFat < 100) {
      return [
        { label: 'Gordura', value: Number(bodyFat.toFixed(1)) },
        { label: 'Massa magra', value: Number((100 - bodyFat).toFixed(1)) },
      ];
    }
    if (typeof massaMagra === 'number' && typeof massaGorda === 'number') {
      const total = massaMagra + massaGorda;
      if (total > 0) {
        return [
          { label: 'Massa magra', value: Number(((massaMagra / total) * 100).toFixed(1)) },
          { label: 'Gordura', value: Number(((massaGorda / total) * 100).toFixed(1)) },
        ];
      }
    }
    return [];
  }, [bodyFat, massaGorda, massaMagra]);

  const circumferenceItems = useMemo(() => {
    const circ = latestOnline?.circunferencias;
    if (!circ) return [];
    const items = [
      { label: 'Pescoco', value: circ.pescoco },
      { label: 'Ombro', value: circ.ombro },
      { label: 'Torax', value: circ.torax },
      { label: 'Cintura', value: circ.cintura },
      { label: 'Quadril', value: circ.quadril },
      { label: 'Braco D', value: circ.bracoDireito },
      { label: 'Braco E', value: circ.bracoEsquerdo },
      { label: 'Antebraco D', value: circ.antebracoDireito },
      { label: 'Antebraco E', value: circ.antebracoEsquerdo },
      { label: 'Coxa D', value: circ.coxaDireita },
      { label: 'Coxa E', value: circ.coxaEsquerda },
      { label: 'Panturrilha D', value: circ.panturrilhaDireita },
      { label: 'Panturrilha E', value: circ.panturrilhaEsquerda },
    ];
    return items.filter((item) => typeof item.value === 'number' && Number(item.value) > 0);
  }, [latestOnline]);

  const percentItems = [
    { label: 'IMC', value: latestImc, suffix: '' },
    { label: '% Gordura', value: bodyFat, suffix: '%' },
    { label: 'Massa magra', value: massaMagra, suffix: 'kg' },
    { label: 'Massa gorda', value: massaGorda, suffix: 'kg' },
  ].filter((item) => typeof item.value === 'number' && Number(item.value) > 0);

  const pieSegments = useMemo(() => {
    const palette = [colors.primary, colors.tertiary, colors.success, colors.warning];
    return buildPieSegments(insights?.pizza || [], compositionSegments, palette);
  }, [colors, compositionSegments, insights?.pizza]);

  const cacheKey = studentId ? `student-evolution:${studentId}` : '';
  const cacheVersion = useMemo(() => {
    if (!evaluationSummary.total) return '';
    return `${evaluationSummary.total}:${evaluationSummary.lastStamp}`;
  }, [evaluationSummary.lastStamp, evaluationSummary.total]);

  const buildInsightsContext = useCallback(() => {
    const lines = [];
    lines.push(`Aluno: ${student?.displayName || 'Aluno'}`);
    lines.push(`Total de avaliacoes: ${evaluationSummary.total}`);
    lines.push(
      `Online: ${evaluationSummary.grouped.online.length} | Fisica: ${evaluationSummary.grouped.fisica.length} | Postural: ${evaluationSummary.grouped.postural.length} | Personalizada: ${evaluationSummary.grouped.personalizada.length}`
    );
    if (evaluationSummary.latest?.date) {
      lines.push(`Ultima avaliacao: ${formatDate(evaluationSummary.latest.date)}`);
    }
    if (latestOnline) {
      lines.push(
        `Online (${formatDate(latestOnline.date)}): peso ${formatNumber(latestOnline.peso)} kg, altura ${formatNumber(latestOnline.altura)} cm, IMC ${formatNumber(latestOnline.imc)}.`
      );
    }
    if (latestFisica?.composicaoCorporal) {
      const comp = latestFisica.composicaoCorporal;
      lines.push(
        `Fisica (${formatDate(latestFisica.date)}): peso ${formatNumber(comp.peso)} kg, IMC ${formatNumber(comp.imc)}, % gordura ${formatNumber(comp.percentualGordura)}.`
      );
    }
    if (latestPostural) {
      const fotosCount = Object.values(latestPostural.fotosPostura || {}).filter(Boolean).length;
      lines.push(
        `Postural (${formatDate(latestPostural.date)}): fotos ${fotosCount}, recomendacoes ${latestPostural.recomendacoes?.length || 0}.`
      );
    }
    if (latestPersonalizada) {
      lines.push(
        `Personalizada (${formatDate(latestPersonalizada.date)}): perguntas ${latestPersonalizada.perguntas?.length || 0}, respostas ${latestPersonalizada.respostas?.length || 0}.`
      );
    }
    if (weightDelta !== null) {
      lines.push(`Evolucao do peso: ${weightDelta.toFixed(1)} kg desde a primeira avaliacao.`);
    }
    if (imcDelta !== null) {
      lines.push(`Evolucao do IMC: ${imcDelta.toFixed(1)} desde a primeira avaliacao.`);
    }
    return lines.join('\n');
  }, [
    evaluationSummary.grouped.fisica.length,
    evaluationSummary.grouped.online.length,
    evaluationSummary.grouped.personalizada.length,
    evaluationSummary.grouped.postural.length,
    evaluationSummary.latest?.date,
    evaluationSummary.total,
    imcDelta,
    latestFisica,
    latestOnline,
    latestPersonalizada,
    latestPostural,
    student?.displayName,
    weightDelta,
  ]);

  const loadInsights = useCallback(
    async (force = false) => {
      if (!cacheKey || !cacheVersion) return;
      if (!hasPremiumAiAccess) {
        setInsights(null);
        setInsightsError('Insights de IA e avaliacao postural por IA estao disponiveis apenas no Premium.');
        return;
      }
      setInsightsError(null);

      if (!force) {
        try {
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached) as { version?: string; data?: StudentEvolutionInsights };
            if (parsed?.version === cacheVersion && parsed?.data) {
              setInsights(parsed.data);
              return;
            }
          }
        } catch (err) {
          setInsightsError('Falha ao ler o cache local.');
        }
      }

      setInsightsLoading(true);
      try {
        const context = buildInsightsContext();
        const aiResult = await generateStudentEvolutionInsights({ context });
        setInsights(aiResult);
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({ version: cacheVersion, data: aiResult })
        );
      } catch (err: any) {
        setInsightsError(err.message || 'Falha ao gerar insights com IA.');
      } finally {
        setInsightsLoading(false);
      }
    },
    [buildInsightsContext, cacheKey, cacheVersion, hasPremiumAiAccess]
  );

  useEffect(() => {
    if (hasPremiumAiAccess && evaluationSummary.total > 0) {
      loadInsights();
    }
  }, [evaluationSummary.total, hasPremiumAiAccess, loadInsights]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
        <View style={[styles.header, { paddingHorizontal: padding }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Evolucao do aluno</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const summaryCards = [
    {
      label: 'Avaliacoes',
      value: evaluationSummary.total,
      icon: 'clipboard-outline',
      color: colors.primary,
    },
    {
      label: 'Peso atual',
      value: latestWeight ? `${formatNumber(latestWeight)} kg` : '--',
      icon: 'barbell-outline',
      color: colors.tertiary,
    },
    {
      label: 'IMC atual',
      value: latestImc ? formatNumber(latestImc) : '--',
      icon: 'pulse-outline',
      color: colors.success,
    },
  ];

  const evolutionMetrics = [
    {
      label: 'Variacao de peso',
      value: weightDelta,
      suffix: 'kg',
      color: weightDelta !== null && weightDelta < 0 ? colors.success : colors.warning,
    },
    {
      label: 'Variacao de IMC',
      value: imcDelta,
      suffix: '',
      color: imcDelta !== null && imcDelta < 0 ? colors.success : colors.warning,
    },
    {
      label: '% Gordura',
      value: bodyFat,
      suffix: '%',
      color: colors.tertiary,
    },
  ];

  const pieLegend = pieSegments.map((segment) => ({
    label: segment.label,
    value: segment.value,
    color: segment.color,
  }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: themeSpacing['3xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingHorizontal: padding }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Evolucao do aluno</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={{ paddingHorizontal: padding, marginTop: themeSpacing.md }}>
          <LinearGradient colors={colors.gradient.primary} style={styles.heroCard}>
            <View style={styles.heroContent}>
              <Text style={[styles.heroTitle, { color: colors.info }]}>
                {student?.displayName || 'Aluno'}
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.info }]}>
                Relatorio completo da evolucao e indicadores principais.
              </Text>
              <View style={styles.heroBadgeRow}>
                <View style={[styles.heroBadge, { backgroundColor: colors.info + '30' }]}>
                  <Ionicons name="calendar-outline" size={14} color={colors.info} />
                  <Text style={[styles.heroBadgeText, { color: colors.info }]}>
                    Ultima avaliacao: {formatDate(evaluationSummary.latest?.date)}
                  </Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View style={[styles.section, { paddingHorizontal: padding }]}>
          <View style={styles.summaryRow}>
            {summaryCards.map((item) => (
              <View
                key={item.label}
                style={[
                  styles.summaryCard,
                  { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg },
                ]}
              >
                <View
                  style={[
                    styles.summaryIcon,
                    { backgroundColor: item.color + '20' },
                  ]}
                >
                  <Ionicons name={item.icon as any} size={18} color={item.color} />
                </View>
                <Text style={[styles.summaryValue, { color: colors.text }]}>{item.value}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.section, { paddingHorizontal: padding }]}>
          <Card style={styles.cardBase}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Painel geral</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                  Percentuais, metragem e progresso comparado.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  hasPremiumAiAccess
                    ? loadInsights(true)
                    : router.push('/profile/subscription' as any)
                }
              >
                <Ionicons
                  name={hasPremiumAiAccess ? 'sparkles' : 'lock-closed'}
                  size={22}
                  color={colors.primary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.metricList}>
              {evolutionMetrics.map((metric) => (
                <View key={metric.label} style={styles.metricRow}>
                  <View style={styles.metricHeader}>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                      {metric.label}
                    </Text>
                    <Text style={[styles.metricValue, { color: colors.text }]}>
                      {metric.value === null || metric.value === undefined
                        ? '--'
                        : `${formatNumber(metric.value)}${metric.suffix ? ` ${metric.suffix}` : ''}`}
                    </Text>
                  </View>
                  <View style={[styles.metricTrack, { backgroundColor: colors.surface }]}>
                    <View
                      style={[
                        styles.metricFill,
                        {
                          backgroundColor: metric.color,
                          width: metric.value === null || metric.value === undefined
                            ? '0%'
                            : `${Math.min(100, Math.abs(metric.value) * 10)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        </View>

        {hasPremiumAiAccess ? (
          <>
            <View style={[styles.section, { paddingHorizontal: padding }]}>
              <Card style={styles.cardBase}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Graficos de evolucao</Text>
                  {insightsLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="analytics-outline" size={20} color={colors.primary} />
                  )}
                </View>
                {insightsError && (
                  <Text style={[styles.errorText, { color: colors.error }]}>
                    {insightsError}
                  </Text>
                )}
                <View style={styles.metricList}>
                  {(insights?.graficos || []).length ? (
                    insights?.graficos.map((metric) => (
                      <View key={metric.label} style={styles.metricRow}>
                        <View style={styles.metricHeader}>
                          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                            {metric.label}
                          </Text>
                          <Text style={[styles.metricValue, { color: colors.text }]}>
                            {Math.round(metric.value)}%
                          </Text>
                        </View>
                        <View style={[styles.metricTrack, { backgroundColor: colors.surface }]}>
                          <View
                            style={[
                              styles.metricFill,
                              {
                                backgroundColor: colors.primary,
                                width: `${Math.min(100, Math.max(0, metric.value))}%`,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                      Sem graficos inteligentes ainda.
                    </Text>
                  )}
                </View>
              </Card>
            </View>

            <View style={[styles.section, { paddingHorizontal: padding }]}>
              <Card style={styles.cardBase}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Grafico pie</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                    Composicao corporal e distribuicao.
                  </Text>
                </View>
                <View style={styles.pieRow}>
                  <PieChart
                    size={140}
                    strokeWidth={14}
                    segments={pieSegments}
                    backgroundColor={colors.secondaryBackground}
                    iconColor={colors.textSecondary}
                  />
                  <View style={styles.pieLegend}>
                    {pieLegend.length ? (
                      pieLegend.map((segment) => (
                        <View key={segment.label} style={styles.pieLegendRow}>
                          <View style={[styles.pieDot, { backgroundColor: segment.color }]} />
                          <Text style={[styles.pieLabel, { color: colors.textSecondary }]}>
                            {segment.label}
                          </Text>
                          <Text style={[styles.pieValue, { color: colors.text }]}>
                            {Math.round(segment.value)}%
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                        Sem dados suficientes para o grafico pie.
                      </Text>
                    )}
                  </View>
                </View>
              </Card>
            </View>
          </>
        ) : (
          <View style={[styles.section, { paddingHorizontal: padding }]}>
            <Card style={styles.cardBase}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Recursos IA Premium
              </Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                Insights de IA e avaliacao postural por IA estao disponiveis apenas para assinantes Premium.
              </Text>
              <Button
                title="Ver planos Premium"
                onPress={() => router.push('/profile/subscription' as any)}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          </View>
        )}

        <View style={[styles.section, { paddingHorizontal: padding }]}>
          <Card style={styles.cardBase}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Metragens e percentuais
            </Text>
            {percentItems.length > 0 ? (
              <View style={styles.detailList}>
                {percentItems.map((item) => (
                  <View key={item.label} style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {formatNumber(item.value)}{item.suffix ? ` ${item.suffix}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                Sem percentuais registrados ainda.
              </Text>
            )}

            {circumferenceItems.length > 0 ? (
              <View style={styles.detailList}>
                {circumferenceItems.map((item) => (
                  <View key={item.label} style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {formatNumber(item.value)} cm
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                Sem metragem detalhada registrada.
              </Text>
            )}
          </Card>
        </View>

        {hasPremiumAiAccess && (
          <View style={[styles.section, { paddingHorizontal: padding }]}>
            <Card style={styles.cardBase}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Insights da IA
              </Text>
              {insights?.resumo ? (
                <Text style={[styles.insightsSummary, { color: colors.textSecondary }]}>
                  {insights.resumo}
                </Text>
              ) : (
                <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                  Gere os insights para ver o resumo completo.
                </Text>
              )}
              <View style={styles.insightsRow}>
                <View style={styles.insightsColumn}>
                  <Text style={[styles.insightsTitle, { color: colors.text }]}>
                    Destaques
                  </Text>
                  {(insights?.destaques || []).map((item) => (
                    <Text key={item} style={[styles.insightsItem, { color: colors.textSecondary }]}>
                      - {item}
                    </Text>
                  ))}
                </View>
                <View style={styles.insightsColumn}>
                  <Text style={[styles.insightsTitle, { color: colors.text }]}>
                    Proximos passos
                  </Text>
                  {(insights?.proximosPassos || []).map((item) => (
                    <Text key={item} style={[styles.insightsItem, { color: colors.textSecondary }]}>
                      - {item}
                    </Text>
                  ))}
                </View>
              </View>
              {(insights?.alertas || []).length > 0 && (
                <View style={styles.alertBox}>
                  <Text style={[styles.insightsTitle, { color: colors.text }]}>
                    Alertas
                  </Text>
                  {insights?.alertas.map((item) => (
                    <Text key={item} style={[styles.insightsItem, { color: colors.textSecondary }]}>
                      - {item}
                    </Text>
                  ))}
                </View>
              )}
              <Button
                title={insightsLoading ? 'Gerando insights...' : 'Atualizar insights'}
                onPress={() => loadInsights(true)}
                disabled={insightsLoading}
              />
            </Card>
          </View>
        )}

        <View style={[styles.section, { paddingHorizontal: padding }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Resumo por avaliacao
          </Text>
          {[latestOnline, latestFisica, latestPostural, latestPersonalizada]
            .filter(Boolean)
            .map((evaluation) => {
              const type = evaluation!.type as EvaluationType;
              const label = getEvaluationTypeLabel(type);
              const meta =
                type === 'online'
                  ? `Peso ${formatNumber((evaluation as OnlineEvaluation).peso)} kg - IMC ${formatNumber((evaluation as OnlineEvaluation).imc)}`
                  : type === 'fisica'
                  ? `Peso ${formatNumber((evaluation as PhysicalTestEvaluation).composicaoCorporal?.peso)} kg - % gordura ${formatNumber((evaluation as PhysicalTestEvaluation).composicaoCorporal?.percentualGordura)}`
                  : type === 'postural'
                  ? `${Object.values((evaluation as PosturalEvaluation).fotosPostura || {}).filter(Boolean).length} fotos analisadas`
                  : `${(evaluation as PersonalizedEvaluation).perguntas?.length || 0} perguntas respondidas`;

              return (
                <Card key={`${type}-${evaluation!.id}`} style={styles.cardBase}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>{label}</Text>
                    <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                      {formatDate(evaluation!.date)}
                    </Text>
                  </View>
                  <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                    {meta}
                  </Text>
                </Card>
              );
            })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  heroCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  heroContent: {
    gap: spacing.sm,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 14,
  },
  heroBadgeRow: {
    marginTop: spacing.sm,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  section: {
    marginTop: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    padding: spacing.md,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  summaryLabel: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  cardBase: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  metricList: {
    gap: spacing.md,
  },
  metricRow: {
    gap: spacing.xs,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontSize: 13,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  metricTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  metricFill: {
    height: '100%',
    borderRadius: 999,
  },
  pieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  pieLegend: {
    flex: 1,
    gap: spacing.sm,
  },
  pieLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pieDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pieLabel: {
    flex: 1,
    fontSize: 12,
  },
  pieValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  piePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  detailList: {
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 12,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  insightsSummary: {
    fontSize: 13,
    lineHeight: 18,
  },
  insightsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  insightsColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  insightsTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  insightsItem: {
    fontSize: 12,
    lineHeight: 16,
  },
  alertBox: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: '#FF596314',
    gap: spacing.xs,
  },
  emptyHint: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
});
