import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, G, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { addDoc, collection, doc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useAuthStore } from '../../src/store/authStore';
import { Card, Button, Loading } from '../../src/components/common';
import { useAiAccessStatus } from '../../src/hooks/useAiAccessStatus';
import { getFirebaseDb } from '../../src/services/firebase';
import { fetchUserWorkouts, fetchWorkoutProgress } from '../../src/services/workouts';
import { fetchEvaluations, getEvaluationTypeLabel } from '../../src/services/evaluations';
import {
  generateStudentEvolutionInsights,
  isPremiumUserRecord,
  StudentEvolutionInsights,
} from '../../src/services/ai';
import { PhysicalEvaluation } from '../../src/types/evaluation';
import { UserWorkout, WorkoutProgress } from '../../src/types/workout';
import { showAlert } from '@utils/alert';

type BodyLog = {
  id: string;
  weightKg?: number;
  heightCm?: number;
  objective?: string;
  createdAt?: Date | null;
};

type ChartPoint = { label: string; value: number };
type PiePoint = { label: string; value: number; color: string };

type CachedAiReport = {
  hash: string;
  createdAt: string;
  data: StudentEvolutionInsights;
};

const GOAL_PRESETS = ['Perder gordura', 'Ganhar massa muscular', 'Definicao', 'Performance', 'Condicionamento'];

const toDateSafe = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value?: Date | null) => {
  if (!value) return '--';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(value);
};

const formatShortDate = (value?: Date | null) => {
  if (!value) return '--';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(value);
};

const parseMetricNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseWeightKg = (value: unknown) => {
  const parsed = parseMetricNumber(value);
  if (parsed === null) return null;
  return Math.max(35, Math.min(260, parsed));
};

const parseHeightCm = (value: unknown) => {
  const parsed = parseMetricNumber(value);
  if (parsed === null) return null;
  let cm = parsed;
  if (cm > 0 && cm < 3) cm *= 100;
  if (cm >= 3 && cm < 30) cm *= 10;
  return Math.max(120, Math.min(230, cm));
};

const getDateKey = (value: Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
};

const getWeekStart = (value: Date) => {
  const date = new Date(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getWeekKey = (value: Date) => getWeekStart(value).toISOString().slice(0, 10);

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return String(Math.abs(hash));
};

const hasPersonalLinked = (user: Record<string, any> | null | undefined) => {
  if (!user) return false;
  const code = user.codigoPersonal;
  const hasCode =
    typeof code === 'number'
      ? code > 0
      : typeof code === 'string'
      ? code.trim().length > 0 && code.trim() !== '0'
      : false;
  return Boolean(hasCode || user.personalAccountId || user.nameDoSeuPersonal);
};

function LineChart({
  points,
  width,
  height,
  lineColor,
  muted,
  border,
}: {
  points: ChartPoint[];
  width: number;
  height: number;
  lineColor: string;
  muted: string;
  border: string;
}) {
  if (points.length === 0) {
    return (
      <View style={[styles.chartEmpty, { width, height }]}> 
        <Ionicons name="analytics-outline" size={18} color={muted} />
        <Text style={[styles.chartEmptyText, { color: muted }]}>Sem dados de peso.</Text>
      </View>
    );
  }

  const p = 16;
  const values = points.map((x) => x.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const innerW = width - p * 2;
  const innerH = height - p * 2;
  const x = (i: number) => p + (points.length === 1 ? innerW / 2 : (innerW / (points.length - 1)) * i);
  const y = (value: number) => p + innerH - ((value - min) / range) * innerH;

  return (
    <View>
      <Svg width={width} height={height}>
        {[0, 1, 2, 3].map((row) => {
          const yLine = p + (innerH / 3) * row;
          return <Polyline key={`line-${row}`} points={`0,${yLine} ${width},${yLine}`} stroke={border} strokeWidth={1} fill="none" />;
        })}
        <Polyline
          points={points.map((item, index) => `${x(index)},${y(item.value)}`).join(' ')}
          stroke={lineColor}
          strokeWidth={3}
          fill="none"
        />
        {points.map((item, index) => (
          <Circle key={`${item.label}-${index}`} cx={x(index)} cy={y(item.value)} r={4} fill={lineColor} />
        ))}
      </Svg>
      <View style={styles.chartLabelsRow}>
        {points.map((item, index) => (
          <Text key={`${item.label}-${index}`} style={[styles.chartLabel, { color: muted }]}>{item.label}</Text>
        ))}
      </View>
    </View>
  );
}

function ColumnChart({
  points,
  width,
  height,
  barColor,
  muted,
}: {
  points: ChartPoint[];
  width: number;
  height: number;
  barColor: string;
  muted: string;
}) {
  if (points.length === 0) {
    return (
      <View style={[styles.chartEmpty, { width, height }]}> 
        <Ionicons name="bar-chart-outline" size={18} color={muted} />
        <Text style={[styles.chartEmptyText, { color: muted }]}>Sem sessoes concluidas.</Text>
      </View>
    );
  }

  const pad = 16;
  const max = Math.max(1, ...points.map((x) => x.value));
  const base = height - pad;
  const innerW = width - pad * 2;
  const gap = 10;
  const barW = Math.max(14, (innerW - gap * (points.length - 1)) / points.length);

  return (
    <View>
      <Svg width={width} height={height}>
        {points.map((item, index) => {
          const barH = ((height - pad * 2) * item.value) / max;
          const x = pad + index * (barW + gap);
          const y = base - barH;
          return (
            <G key={`${item.label}-${index}`}>
              <Rect x={x} y={y} width={barW} height={barH} rx={6} ry={6} fill={barColor} />
              <SvgText x={x + barW / 2} y={y - 6} fontSize={10} textAnchor="middle" fill={muted}>{item.value}</SvgText>
            </G>
          );
        })}
      </Svg>
      <View style={styles.chartLabelsRow}>
        {points.map((item, index) => (
          <Text key={`${item.label}-${index}`} style={[styles.chartLabel, { color: muted }]}>{item.label}</Text>
        ))}
      </View>
    </View>
  );
}

function PieChart({ segments, size, trackColor }: { segments: PiePoint[]; size: number; trackColor: string }) {
  const strokeWidth = 20;
  const radius = size / 2 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);

  if (total <= 0) {
    return (
      <View style={[styles.pieEmpty, { width: size, height: size, backgroundColor: trackColor }]}> 
        <Ionicons name="pie-chart-outline" size={22} color="#8FA8C8" />
      </View>
    );
  }

  let cumulative = 0;

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="transparent" />
      <G rotation="-90" originX={size / 2} originY={size / 2}>
        {segments.map((segment) => {
          const value = Math.max(0, segment.value);
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
    </Svg>
  );
}

export default function ProgressScreen() {
  const { colors, spacing, borderRadius } = useTheme();
  const { user, updateUser } = useAuthStore();
  const { width, padding } = useResponsive();
  const aiAccess = useAiAccessStatus();

  const userId = user?.uid || null;
  const hasPersonal = hasPersonalLinked((user || {}) as Record<string, any>);
  const hasPremiumAi = isPremiumUserRecord((user || {}) as Record<string, any>);
  const aiCacheKey = userId ? `@mh:progress-ai-report:${userId}` : null;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workouts, setWorkouts] = useState<UserWorkout[]>([]);
  const [logs, setLogs] = useState<WorkoutProgress[]>([]);
  const [evaluations, setEvaluations] = useState<PhysicalEvaluation[]>([]);
  const [bodyLogs, setBodyLogs] = useState<BodyLog[]>([]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiReport, setAiReport] = useState<StudentEvolutionInsights | null>(null);
  const [aiGeneratedAt, setAiGeneratedAt] = useState<Date | null>(null);

  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [heightInput, setHeightInput] = useState('');
  const [goalInput, setGoalInput] = useState('');

  const loadBodyLogs = useCallback(async (uid: string) => {
    const db = getFirebaseDb();
    const ref = collection(db, 'users', uid, 'bodyMetricsLogs');
    try {
      const snapshot = await getDocs(query(ref, orderBy('createdAt', 'desc')));
      return snapshot.docs.map((docItem) => {
        const data = docItem.data() as Record<string, unknown>;
        return {
          id: docItem.id,
          weightKg: parseWeightKg(data.peso) || undefined,
          heightCm: parseHeightCm(data.altura) || undefined,
          objective: typeof data.objetivo === 'string' ? data.objetivo : undefined,
          createdAt: toDateSafe(data.createdAt),
        } as BodyLog;
      });
    } catch {
      const snapshot = await getDocs(ref);
      return snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as Record<string, unknown>;
          return {
            id: docItem.id,
            weightKg: parseWeightKg(data.peso) || undefined,
            heightCm: parseHeightCm(data.altura) || undefined,
            objective: typeof data.objetivo === 'string' ? data.objetivo : undefined,
            createdAt: toDateSafe(data.createdAt),
          } as BodyLog;
        })
        .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    }
  }, []);

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (!userId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const [workoutsResult, logsResult, evalResult, bodyResult] = await Promise.all([
          fetchUserWorkouts(userId),
          fetchWorkoutProgress(userId),
          fetchEvaluations(userId),
          loadBodyLogs(userId),
        ]);

        setWorkouts(workoutsResult.data || []);
        setLogs(logsResult.data || []);
        setEvaluations(evalResult.data || []);
        setBodyLogs(bodyResult);
        setError(workoutsResult.error || logsResult.error || evalResult.error || null);
      } catch (loadError: any) {
        setError(loadError?.message || 'Nao foi possivel carregar o progresso.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId, loadBodyLogs]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => (toDateSafe(b.date)?.getTime() || 0) - (toDateSafe(a.date)?.getTime() || 0)),
    [logs]
  );

  const latestBodyLog = useMemo(() => bodyLogs.find((x) => x.weightKg || x.heightCm || x.objective), [bodyLogs]);
  const latestWeight = latestBodyLog?.weightKg ?? parseWeightKg(user?.peso) ?? undefined;
  const latestHeight = latestBodyLog?.heightCm ?? parseHeightCm(user?.altura) ?? undefined;
  const latestObjective = latestBodyLog?.objective || user?.objetivoNoApp || '';

  useEffect(() => {
    setWeightInput(latestWeight ? String(Math.round(latestWeight * 10) / 10) : '');
    setHeightInput(latestHeight ? String(Math.round(latestHeight)) : '');
    setGoalInput(latestObjective || '');
  }, [latestWeight, latestHeight, latestObjective]);

  const workoutNameMap = useMemo(() => {
    const map = new Map<string, string>();
    workouts.forEach((item) => map.set(item.id, item.nomeDoTreino || 'Treino'));
    return map;
  }, [workouts]);

  const totalWorkouts = workouts.length;
  const completedLogs = sortedLogs.filter((item) => item.completed);
  const completedSessions = completedLogs.length;
  const trackedSessions = sortedLogs.length;
  const completionRate = trackedSessions > 0 ? Math.round((completedSessions / trackedSessions) * 100) : 0;

  const streak = useMemo(() => {
    const dayKeys = Array.from(
      new Set(
        completedLogs
          .map((item) => toDateSafe(item.date))
          .filter((date): date is Date => Boolean(date))
          .map((date) => getDateKey(date))
      )
    ).sort((a, b) => b.localeCompare(a));

    if (dayKeys.length === 0) return 0;
    let value = 1;
    for (let index = 1; index < dayKeys.length; index += 1) {
      const prev = new Date(dayKeys[index - 1]);
      const current = new Date(dayKeys[index]);
      const diff = Math.round((prev.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
      if (diff === 1) value += 1;
      else break;
    }
    return value;
  }, [completedLogs]);

  const weightHistory = useMemo<ChartPoint[]>(() => {
    const fromLogs = bodyLogs
      .filter((item): item is BodyLog & { weightKg: number; createdAt: Date } => Boolean(item.weightKg) && Boolean(item.createdAt))
      .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0))
      .slice(-7)
      .map((item) => ({ label: formatShortDate(item.createdAt), value: item.weightKg }));

    if (fromLogs.length > 0) return fromLogs;
    return latestWeight ? [{ label: 'Hoje', value: latestWeight }] : [];
  }, [bodyLogs, latestWeight]);

  const weeklySessions = useMemo<ChartPoint[]>(() => {
    const now = new Date();
    const weekStarts = Array.from({ length: 6 }, (_, idx) => {
      const date = getWeekStart(now);
      date.setDate(date.getDate() - (5 - idx) * 7);
      return date;
    });

    const countByWeek = new Map<string, number>();
    completedLogs.forEach((item) => {
      const date = toDateSafe(item.date);
      if (!date) return;
      const key = getWeekKey(date);
      countByWeek.set(key, (countByWeek.get(key) || 0) + 1);
    });

    return weekStarts.map((start) => {
      const key = getWeekKey(start);
      return { label: formatShortDate(start), value: countByWeek.get(key) || 0 };
    });
  }, [completedLogs]);

  const bestWorkouts = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    completedLogs.forEach((item) => {
      const id = item.workoutId || 'sem-id';
      const name = workoutNameMap.get(id) || 'Treino sem nome';
      const prev = map.get(id) || { name, count: 0 };
      map.set(id, { name: prev.name, count: prev.count + 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 4);
  }, [completedLogs, workoutNameMap]);

  const recentRows = useMemo(
    () =>
      sortedLogs.slice(0, 5).map((item) => ({
        id: item.id,
        title: workoutNameMap.get(item.workoutId) || 'Treino sem nome',
        date: formatDate(toDateSafe(item.date)),
        completed: Boolean(item.completed),
      })),
    [sortedLogs, workoutNameMap]
  );

  const piePoints = useMemo<PiePoint[]>(() => {
    const pending = Math.max(0, totalWorkouts - completedSessions);
    return [
      { label: 'Concluidos', value: completedSessions, color: '#38B6FF' },
      { label: 'Pendentes', value: pending, color: '#23CBA7' },
      { label: 'Avaliacoes', value: evaluations.length, color: '#F7B55E' },
    ].filter((item) => item.value > 0);
  }, [completedSessions, totalWorkouts, evaluations.length]);

  const aiContext = useMemo(() => {
    return JSON.stringify(
      {
        user: {
          hasPersonal,
          premium: hasPremiumAi,
          objective: latestObjective || null,
          weightKg: latestWeight || null,
          heightCm: latestHeight || null,
        },
        metrics: {
          totalWorkouts,
          trackedSessions,
          completedSessions,
          completionRate,
          streak,
          evaluations: evaluations.length,
        },
        weeklySessions,
        weightHistory,
        workouts: workouts.slice(0, 20).map((item) => ({ id: item.id, nomeDoTreino: item.nomeDoTreino, exercicios: item.treino?.length || 0 })),
        logs: sortedLogs.slice(0, 40).map((item) => ({ workoutId: item.workoutId, completed: item.completed, duration: Number(item.duration || 0), date: toDateSafe(item.date)?.toISOString() || null })),
        evaluations: evaluations.slice(0, 20).map((item) => ({ type: item.type, status: item.status, date: item.date?.toISOString?.() || null })),
      },
      null,
      2
    );
  }, [hasPersonal, hasPremiumAi, latestObjective, latestWeight, latestHeight, totalWorkouts, trackedSessions, completedSessions, completionRate, streak, evaluations, weeklySessions, weightHistory, workouts, sortedLogs]);

  const aiContextHash = useMemo(() => hashString(aiContext), [aiContext]);

  useEffect(() => {
    let active = true;
    if (!aiCacheKey) return;

    AsyncStorage.getItem(aiCacheKey)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as CachedAiReport;
        if (parsed?.hash !== aiContextHash || !parsed?.data) return;
        setAiReport(parsed.data);
        setAiGeneratedAt(toDateSafe(parsed.createdAt));
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [aiCacheKey, aiContextHash]);

  const aiPie = useMemo<PiePoint[]>(() => {
    const palette = ['#38B6FF', '#23CBA7', '#F7B55E', '#9B8CFF'];
    const fromAi = aiReport?.pizza || [];
    if (fromAi.length === 0) return piePoints;
    return fromAi
      .filter((item) => Number(item.value) > 0)
      .slice(0, 4)
      .map((item, index) => ({ label: item.label, value: Math.round(item.value), color: palette[index % palette.length] }));
  }, [aiReport?.pizza, piePoints]);

  const suggestions = useMemo(() => {
    const items: string[] = [];
    if (completionRate < 60) items.push('Aumente a constancia semanal para pelo menos 3 sessoes completas.');
    if (streak < 3) items.push('Trabalhe uma sequencia minima de 3 dias para acelerar o ritmo.');
    if (!latestWeight || !latestHeight || !latestObjective) items.push('Atualize o check-in corporal para analise mais precisa.');
    (aiReport?.alertas || []).forEach((item) => item && items.push(item));
    (aiReport?.proximosPassos || []).forEach((item) => item && items.push(item));
    return Array.from(new Set(items)).slice(0, 5);
  }, [completionRate, streak, latestWeight, latestHeight, latestObjective, aiReport?.alertas, aiReport?.proximosPassos]);

  const handleGenerateAi = useCallback(async () => {
    if (!userId) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await generateStudentEvolutionInsights({ context: aiContext });
      setAiReport(result);
      const now = new Date();
      setAiGeneratedAt(now);
      if (aiCacheKey) {
        const payload: CachedAiReport = { hash: aiContextHash, createdAt: now.toISOString(), data: result };
        await AsyncStorage.setItem(aiCacheKey, JSON.stringify(payload));
      }
    } catch (generateError: any) {
      const message = generateError?.message || 'Nao foi possivel gerar o relatorio de IA.';
      setAiError(message);
      showAlert('Relatorio IA', message);
    } finally {
      setAiLoading(false);
    }
  }, [userId, aiContext, aiCacheKey, aiContextHash]);

  const handleSaveCheckin = useCallback(async () => {
    if (!userId) return;
    const weight = parseWeightKg(weightInput);
    const height = parseHeightCm(heightInput);
    const goal = goalInput.trim();

    if (!weight || !height || !goal) {
      showAlert('Check-in corporal', 'Informe peso, altura e objetivo.');
      return;
    }

    setCheckinSaving(true);
    try {
      const db = getFirebaseDb();
      await setDoc(doc(db, 'users', userId), { peso: weight, altura: height, objetivoNoApp: goal, lastBodyCheckInAt: new Date() }, { merge: true });
      await addDoc(collection(db, 'users', userId, 'bodyMetricsLogs'), { peso: weight, altura: height, objetivo: goal, createdAt: new Date() });
      updateUser({ peso: String(Math.round(weight * 10) / 10), altura: String(Math.round(height)), objetivoNoApp: goal });
      await loadData(true);
      setCheckinOpen(false);
      showAlert('Check-in corporal', 'Dados atualizados com sucesso.');
    } catch (saveError: any) {
      showAlert('Check-in corporal', saveError?.message || 'Nao foi possivel salvar agora.');
    } finally {
      setCheckinSaving(false);
    }
  }, [userId, weightInput, heightInput, goalInput, updateUser, loadData]);

  const chartWidth = Math.max(280, width - padding * 2 - 42);
  const incompleteBodyData = !latestWeight || !latestHeight || !latestObjective;
  const ui = {
    pageStart: '#07101C',
    pageEnd: '#10263D',
    panel: '#0A1626',
    panelSoft: '#0C1E31',
    panelBorder: 'rgba(160, 214, 255, 0.18)',
    heroStart: '#0B1C30',
    heroMiddle: '#144575',
    heroEnd: '#2C7CC3',
    chipBg: 'rgba(208, 235, 255, 0.16)',
    chipText: '#E9F7FF',
  };
  const panelCardStyle = {
    ...styles.panelCard,
    backgroundColor: ui.panel,
    borderColor: ui.panelBorder,
  };
  const panelSoftCardStyle = {
    ...styles.panelCard,
    backgroundColor: ui.panelSoft,
    borderColor: ui.panelBorder,
  };

  if (!userId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}> 
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={26} color={colors.textMuted} />
          <Text style={[styles.centeredTitle, { color: colors.text }]}>Entre para ver seu progresso</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}> 
        <Loading message="Carregando progresso..." />
      </SafeAreaView>
    );
  }

  return (
    <LinearGradient colors={[ui.pageStart, ui.pageEnd]} style={styles.container}>
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing['3xl'] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={colors.primary} />}
        >
        <View style={[styles.header, { paddingHorizontal: padding }]}>
          <TouchableOpacity style={[styles.iconBtn, styles.glassIconBtn]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>Meu progresso</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Painel inteligente de evolucao</Text>
          </View>
          <TouchableOpacity style={[styles.iconBtn, styles.glassIconBtn]} onPress={() => loadData(true)}>
            <Ionicons name="refresh-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { paddingHorizontal: padding }]}>
          <LinearGradient
            colors={[ui.heroStart, ui.heroMiddle, ui.heroEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { borderRadius: borderRadius.lg }]}
          >
            <View style={styles.heroTop}>
              <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>{hasPersonal ? 'Com personal' : 'Sem personal'}</Text></View>
              <TouchableOpacity style={styles.heroAction} onPress={() => setCheckinOpen(true)}>
                <Ionicons name="body-outline" size={14} color="#F5FAFF" />
                <Text style={styles.heroActionText}>Check-in</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.heroTitle}>{completionRate >= 70 ? 'Ritmo excelente' : completionRate >= 40 ? 'Boa evolucao' : 'Hora de acelerar'}</Text>
            <Text style={styles.heroSubtitle}>{hasPersonal ? 'Seu progresso esta sincronizado com acompanhamento ativo.' : 'Preencha seus dados corporais para relatorios mais precisos.'}</Text>
            <View style={styles.heroMetrics}>
              <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{completedSessions}</Text><Text style={styles.heroMetricLabel}>Treinos feitos</Text></View>
              <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{completionRate}%</Text><Text style={styles.heroMetricLabel}>Taxa de entrega</Text></View>
              <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{streak}</Text><Text style={styles.heroMetricLabel}>Dias em sequencia</Text></View>
            </View>
          </LinearGradient>
        </View>

        <View style={[styles.section, { paddingHorizontal: padding }]}> 
          <View style={styles.gridRow}>
            <Card style={{ ...styles.statCard, backgroundColor: ui.panelSoft, borderColor: ui.panelBorder }} shadow={false}><Text style={[styles.statNumber, { color: colors.primary }]}>{totalWorkouts}</Text><Text style={[styles.statText, { color: '#BFE3FF' }]}>Treinos ativos</Text></Card>
            <Card style={{ ...styles.statCard, backgroundColor: ui.panelSoft, borderColor: ui.panelBorder }} shadow={false}><Text style={[styles.statNumber, { color: '#23CBA7' }]}>{completedSessions}</Text><Text style={[styles.statText, { color: '#BFE3FF' }]}>Concluidos</Text></Card>
          </View>
          <View style={styles.gridRow}>
            <Card style={{ ...styles.statCard, backgroundColor: ui.panelSoft, borderColor: ui.panelBorder }} shadow={false}><Text style={[styles.statNumber, { color: '#F7B55E' }]}>{streak}</Text><Text style={[styles.statText, { color: '#BFE3FF' }]}>Sequencia</Text></Card>
            <Card style={{ ...styles.statCard, backgroundColor: ui.panelSoft, borderColor: ui.panelBorder }} shadow={false}><Text style={[styles.statNumber, { color: '#9B8CFF' }]}>{completionRate}%</Text><Text style={[styles.statText, { color: '#BFE3FF' }]}>Aderencia</Text></Card>
          </View>
        </View>

        <View style={[styles.section, { paddingHorizontal: padding }]}> 
          <Card style={panelSoftCardStyle} shadow={false}>
            <View style={styles.rowTitle}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Check-in corporal</Text>
                <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>Peso, altura e objetivo para IA</Text>
              </View>
              <TouchableOpacity onPress={() => setCheckinOpen(true)}><Text style={[styles.link, { color: colors.primary }]}>Atualizar</Text></TouchableOpacity>
            </View>
            <View style={styles.checkinRow}>
              <View style={[styles.checkinBox, { backgroundColor: 'rgba(7,19,32,0.85)', borderColor: ui.panelBorder }]}><Text style={[styles.checkinLabel, { color: '#95C8ED' }]}>Peso</Text><Text style={[styles.checkinValue, { color: '#F1FAFF' }]}>{latestWeight ? `${latestWeight.toFixed(1).replace('.', ',')} kg` : '--'}</Text></View>
              <View style={[styles.checkinBox, { backgroundColor: 'rgba(7,19,32,0.85)', borderColor: ui.panelBorder }]}><Text style={[styles.checkinLabel, { color: '#95C8ED' }]}>Altura</Text><Text style={[styles.checkinValue, { color: '#F1FAFF' }]}>{latestHeight ? `${Math.round(latestHeight)} cm` : '--'}</Text></View>
            </View>
            <Text style={[styles.goal, { color: '#BBDCF8' }]}>Objetivo: <Text style={{ color: '#F4FAFF' }}>{latestObjective || 'Nao definido'}</Text></Text>
            {incompleteBodyData ? <Text style={[styles.warning, { color: '#F7B55E' }]}>Complete os dados para liberar relatorios completos.</Text> : null}
          </Card>
        </View>

        <View style={[styles.section, { paddingHorizontal: padding }]}> 
          <Card style={panelSoftCardStyle} shadow={false}>
            <View style={styles.rowTitle}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Relatorio IA</Text>
                <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>Insights e pontos de melhoria</Text>
              </View>
              <Button title={aiReport ? 'Atualizar IA' : 'Gerar IA'} onPress={handleGenerateAi} loading={aiLoading} size="small" style={{ minWidth: 120 }} />
            </View>
            <Text style={[styles.aiMeta, { color: colors.textSecondary }]}>{hasPremiumAi ? 'Plano premium: IA sem limite.' : `Creditos hoje: ${aiAccess.remaining ?? 0}/${aiAccess.dailyLimit}`}</Text>
            {aiLoading ? (
              <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} /><Text style={[styles.loadingText, { color: colors.textSecondary }]}>Gerando analise...</Text></View>
            ) : aiReport ? (
              <View>
                <Text style={[styles.aiSummary, { color: colors.text }]}>{aiReport.resumo}</Text>
                {aiGeneratedAt ? <Text style={[styles.aiDate, { color: colors.textMuted }]}>Atualizado em {formatDate(aiGeneratedAt)}</Text> : null}
                {(aiReport.destaques || []).slice(0, 4).map((item, index) => (
                  <View key={`destaque-${index}`} style={styles.bulletRow}><Ionicons name="checkmark-circle" size={14} color="#23CBA7" /><Text style={[styles.bulletText, { color: colors.textSecondary }]}>{item}</Text></View>
                ))}
              </View>
            ) : (
              <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>Gere para receber relatorios de IA com graficos e melhorias.</Text>
            )}
            {aiError ? <Text style={[styles.errorText, { color: colors.error }]}>{aiError}</Text> : null}
          </Card>
        </View>

        <View style={[styles.section, { paddingHorizontal: padding }]}> 
          <Card style={panelCardStyle} shadow={false}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Grafico de peso</Text>
            <View style={{ marginTop: spacing.sm }}><LineChart points={weightHistory} width={chartWidth} height={190} lineColor={colors.primary} muted={colors.textMuted} border={colors.border} /></View>
          </Card>
        </View>

        <View style={[styles.section, { paddingHorizontal: padding }]}> 
          <Card style={panelCardStyle} shadow={false}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Treinos por semana</Text>
            <View style={{ marginTop: spacing.sm }}><ColumnChart points={weeklySessions} width={chartWidth} height={200} barColor={colors.primary} muted={colors.textMuted} /></View>
          </Card>
        </View>

        <View style={[styles.section, { paddingHorizontal: padding }]}> 
          <Card style={panelCardStyle} shadow={false}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Distribuicao de progresso</Text>
            <View style={styles.pieRow}>
              <PieChart segments={aiPie} size={170} trackColor={colors.border} />
              <View style={styles.legend}>
                {aiPie.map((item) => (
                  <View key={item.label} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: item.color }]} /><Text style={[styles.legendLabel, { color: colors.textSecondary }]}>{item.label}</Text><Text style={[styles.legendValue, { color: colors.text }]}>{item.value}</Text></View>
                ))}
              </View>
            </View>
          </Card>
        </View>

        <View style={[styles.section, { paddingHorizontal: padding }]}> 
          <Card style={panelCardStyle} shadow={false}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Melhores treinos</Text>
            {bestWorkouts.length === 0 ? <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>Conclua treinos para gerar ranking.</Text> : bestWorkouts.map((item, index) => (
              <View key={`${item.name}-${index}`} style={[styles.listRow, { borderBottomColor: colors.border }]}>
                <View style={styles.listLeft}><View style={[styles.rank, { backgroundColor: 'rgba(12,34,56,0.9)', borderColor: ui.panelBorder }]}><Text style={[styles.rankText, { color: colors.primary }]}>#{index + 1}</Text></View><Text style={[styles.listTitle, { color: colors.text }]}>{item.name}</Text></View>
                <Text style={[styles.listValue, { color: colors.textSecondary }]}>{item.count}x</Text>
              </View>
            ))}
          </Card>
        </View>

        <View style={[styles.section, { paddingHorizontal: padding }]}> 
          <Card style={panelCardStyle} shadow={false}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>O que melhorar</Text>
            {suggestions.length === 0 ? <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>Continue registrando dados para novas sugestoes.</Text> : suggestions.map((item, index) => (
              <View key={`suggest-${index}`} style={styles.bulletRow}><Ionicons name="arrow-forward-circle" size={14} color={colors.primary} /><Text style={[styles.bulletText, { color: colors.textSecondary }]}>{item}</Text></View>
            ))}
          </Card>
        </View>

        <View style={[styles.section, { paddingHorizontal: padding }]}> 
          <Card style={panelCardStyle} shadow={false}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Ultimos treinos</Text>
            {recentRows.length === 0 ? <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>Nenhum treino registrado.</Text> : recentRows.map((item) => (
              <View key={item.id} style={[styles.listRow, { borderBottomColor: colors.border }]}>
                <View>
                  <Text style={[styles.listTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.listSub, { color: colors.textSecondary }]}>{item.date}</Text>
                </View>
                <Text style={{ color: item.completed ? '#23CBA7' : '#F7B55E', fontSize: 12, fontWeight: '700' }}>{item.completed ? 'Concluido' : 'Pendente'}</Text>
              </View>
            ))}
          </Card>
        </View>

        <View style={[styles.section, { paddingHorizontal: padding }]}> 
          <Card style={panelCardStyle} shadow={false}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Avaliacoes recentes</Text>
            {evaluations.slice(0, 4).length === 0 ? <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>Sem avaliacoes registradas.</Text> : evaluations.slice(0, 4).map((item) => (
              <View key={item.id} style={[styles.listRow, { borderBottomColor: colors.border }]}>
                <View>
                  <Text style={[styles.listTitle, { color: colors.text }]}>{getEvaluationTypeLabel(item.type)}</Text>
                  <Text style={[styles.listSub, { color: colors.textSecondary }]}>{formatDate(item.date)}</Text>
                </View>
              </View>
            ))}
          </Card>
        </View>

        {!hasPersonal ? (
          <View style={[styles.section, { paddingHorizontal: padding }]}> 
            <Card style={panelSoftCardStyle} shadow={false}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Plano individual sem personal</Text>
              <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>Use o app sem personal com recursos avancados de IA.</Text>
              <View style={{ marginTop: spacing.md }}><Button title="Ver plano individual" onPress={() => router.push('/financeiro' as any)} fullWidth /></View>
            </Card>
          </View>
        ) : null}

        {error ? (
          <View style={[styles.section, { paddingHorizontal: padding }]}> 
            <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,89,99,0.12)' }]}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.error} />
              <Text style={[styles.errorBannerText, { color: colors.error }]}>{error}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={checkinOpen} transparent animationType="slide" onRequestClose={() => setCheckinOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
          <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]} />
          <View style={[styles.modalCard, { backgroundColor: ui.panelSoft, borderColor: ui.panelBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Check-in corporal</Text>
              <TouchableOpacity style={[styles.iconBtn, styles.glassIconBtn]} onPress={() => setCheckinOpen(false)}>
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>Atualize para IA gerar relatorios mais precisos.</Text>

            <View style={styles.inputRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Peso (kg)</Text>
                <TextInput value={weightInput} onChangeText={setWeightInput} keyboardType="decimal-pad" style={[styles.input, { borderColor: ui.panelBorder, color: colors.text, backgroundColor: 'rgba(7,19,32,0.85)' }]} placeholder="72,5" placeholderTextColor={colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Altura (cm)</Text>
                <TextInput value={heightInput} onChangeText={setHeightInput} keyboardType="decimal-pad" style={[styles.input, { borderColor: ui.panelBorder, color: colors.text, backgroundColor: 'rgba(7,19,32,0.85)' }]} placeholder="168" placeholderTextColor={colors.textMuted} />
              </View>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: spacing.sm }]}>Objetivo</Text>
            <TextInput value={goalInput} onChangeText={setGoalInput} style={[styles.input, { borderColor: ui.panelBorder, color: colors.text, backgroundColor: 'rgba(7,19,32,0.85)' }]} placeholder="Ex: perder gordura" placeholderTextColor={colors.textMuted} />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
              {GOAL_PRESETS.map((item) => {
                const active = goalInput.trim().toLowerCase() === item.toLowerCase();
                return (
                  <TouchableOpacity key={item} onPress={() => setGoalInput(item)} style={[styles.goalChip, { borderColor: active ? colors.primary : ui.panelBorder, backgroundColor: active ? 'rgba(56,182,255,0.14)' : 'rgba(7,19,32,0.85)' }]}>
                    <Text style={{ color: active ? colors.primary : colors.textSecondary, fontSize: 12 }}>{item}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setCheckinOpen(false)} variant="ghost" style={{ flex: 1, borderWidth: 1, borderColor: ui.panelBorder }} />
              <Button title="Salvar check-in" onPress={handleSaveCheckin} loading={checkinSaving} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  centeredTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  header: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  glassIconBtn: {
    backgroundColor: 'rgba(15, 35, 55, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(187, 224, 255, 0.24)',
  },
  title: { fontSize: 28, fontWeight: '700', color: '#F4FAFF' },
  subtitle: { fontSize: 13, marginTop: 2 },
  section: { marginTop: 14 },
  panelCard: {
    borderWidth: 1,
    borderRadius: 16,
  },
  hero: { padding: 16 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBadge: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  heroBadgeText: { color: '#EFF8FF', fontSize: 12, fontWeight: '600' },
  heroAction: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroActionText: { color: '#F5FAFF', fontSize: 12, fontWeight: '600' },
  heroTitle: { marginTop: 12, color: '#F8FCFF', fontSize: 24, fontWeight: '700' },
  heroSubtitle: { marginTop: 6, color: 'rgba(239,248,255,0.92)', fontSize: 13, lineHeight: 18 },
  heroMetrics: { marginTop: 14, flexDirection: 'row', gap: 8 },
  heroMetric: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: 10 },
  heroMetricValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  heroMetricLabel: { marginTop: 2, color: 'rgba(236,247,255,0.88)', fontSize: 11 },
  gridRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: { flex: 1, minHeight: 92, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 14 },
  statNumber: { fontSize: 38, fontWeight: '700', lineHeight: 42 },
  statText: { fontSize: 13 },
  rowTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  sectionDesc: { marginTop: 4, fontSize: 12, lineHeight: 17 },
  link: { fontSize: 13, fontWeight: '700' },
  checkinRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  checkinBox: { flex: 1, borderRadius: 10, padding: 10, borderWidth: 1 },
  checkinLabel: { fontSize: 12 },
  checkinValue: { marginTop: 4, fontSize: 19, fontWeight: '700' },
  goal: { marginTop: 10, fontSize: 13 },
  warning: { marginTop: 6, fontSize: 12, fontWeight: '600' },
  aiMeta: { marginTop: 10, fontSize: 12 },
  loadingRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 12 },
  aiSummary: { marginTop: 10, fontSize: 14, lineHeight: 20 },
  aiDate: { marginTop: 6, fontSize: 11 },
  bulletRow: { marginTop: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 18 },
  placeholderText: { marginTop: 10, fontSize: 13, lineHeight: 18 },
  errorText: { marginTop: 10, fontSize: 12 },
  chartEmpty: { borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 6 },
  chartEmptyText: { fontSize: 12 },
  chartLabelsRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  chartLabel: { fontSize: 10 },
  pieRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  legend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 999 },
  legendLabel: { flex: 1, fontSize: 12 },
  legendValue: { fontSize: 12, fontWeight: '700' },
  pieEmpty: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  listRow: { borderBottomWidth: 1, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listTitle: { fontSize: 14, fontWeight: '600' },
  listSub: { marginTop: 2, fontSize: 12 },
  listValue: { fontSize: 12, fontWeight: '700' },
  rank: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  rankText: { fontSize: 12, fontWeight: '700' },
  errorBanner: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorBannerText: { flex: 1, fontSize: 12 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 24, borderTopWidth: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  modalDesc: { marginTop: 8, fontSize: 13, lineHeight: 18 },
  inputRow: { marginTop: 12, flexDirection: 'row', gap: 10 },
  inputLabel: { fontSize: 12, marginBottom: 6 },
  input: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  goalChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  modalActions: { marginTop: 14, flexDirection: 'row', gap: 10 },
});
