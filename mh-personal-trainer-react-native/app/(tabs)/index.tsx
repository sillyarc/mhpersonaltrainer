import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
  Share,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';
import { router, usePathname } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pedometer } from 'expo-sensors';
import { addDoc, collection, doc, getDoc, getDocs, increment, limit, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useAiAccessStatus } from '../../src/hooks/useAiAccessStatus';
import { useDashboardData } from '../../src/hooks/useDashboardData';
import { useAdminDashboardData } from '../../src/hooks/useAdminDashboardData';
import { Card, Button, AvatarStack } from '../../src/components/common';
import { firestoreService, PersonalAccount, PersonalProfile } from '../../src/services/firestoreService';
import type { AdminUserSummary } from '../../src/services/firestoreService';
import { getFirebaseDb } from '../../src/services/firebase';
import { countPendingNotificationsForUser } from '../../src/services/notificationCenter';
import { setBadgeCount } from '../../src/services/notifications';
import { ensureConversation } from '../../src/services/chat';
import {
  createPersonalizedEvaluation,
  fetchEvaluationsForStudents,
  getEvaluationTypeLabel,
} from '../../src/services/evaluations';
import { FREE_DAILY_AI_CREDITS, generateText } from '../../src/services/ai';
import { getSubscriptionStatus, formatCurrency } from '../../src/services/payments';
import { fetchPaymentsForUser } from '../../src/services/financeiro';
import { format } from 'date-fns';
import { EvaluationQuestion, PersonalizedEvaluation } from '../../src/types/evaluation';
import { PaymentRecord } from '../../src/types/finance';
import { ptBR } from 'date-fns/locale';
import { getWorkoutStatusPresentation } from '../../src/utils/workoutStatus';
import { getLanguageTag } from '../../src/i18n';
import { getCleanPalette } from '../../src/theme/cleanPalette';
import { spacing as themeSpacing, borderRadius as themeBorderRadius, fontFamilies } from '../../src/theme';
import { useResolvedPersonalAccess } from '../../src/hooks/useResolvedPersonalAccess';

const hasValidPersonalCode = (code?: string | number | null) => {
  if (code === null || code === undefined) return false;
  if (typeof code === 'number') return code > 0;
  if (typeof code === 'string') {
    const trimmed = code.trim();
    return trimmed.length > 0 && trimmed !== '0';
  }
  return false;
};

const DEFAULT_PERSONAL_INVITE_BASE = 'https://mhpersonaltrainer.com.br/invite';

const buildPersonalInviteLink = (base: string, code: string) => {
  const trimmedBase = base.trim();
  const trimmedCode = code.trim();
  if (!trimmedBase || !trimmedCode) return '';
  const normalizedBase = trimmedBase.endsWith('/') ? trimmedBase.slice(0, -1) : trimmedBase;
  const joiner = normalizedBase.includes('?') ? '&' : '?';
  return `${normalizedBase}${joiner}code=${encodeURIComponent(trimmedCode)}`;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);

const DARK_MODE_ACCENT = '#194784';
const DARK_MODE_ACCENT_ALT = '#133864';
const DARK_MODE_ACCENT_DEEP = '#0A2A52';
const DARK_MODE_ACCENT_TEXT = '#E6EEF8';
const DARK_MODE_ACCENT_TEXT_MUTED = 'rgba(230,238,248,0.84)';
const DARK_MODE_ACCENT_TEXT_SOFT = 'rgba(230,238,248,0.74)';
const DARK_MODE_ACCENT_SURFACE = 'rgba(25,71,132,0.16)';
const DARK_MODE_ACCENT_SURFACE_STRONG = 'rgba(25,71,132,0.24)';
const DARK_MODE_ACCENT_BORDER = 'rgba(25,71,132,0.42)';
const DARK_MODE_ACCENT_BORDER_SOFT = 'rgba(25,71,132,0.28)';
const CLEAN_SURFACE = '#FFFFFF';
const CLEAN_SURFACE_ALT = '#F8FAFC';
const CLEAN_SURFACE_SOFT = '#EEF3F8';
const CLEAN_BORDER = '#E0E3E7';
const CLEAN_TEXT = '#14181B';
const CLEAN_TEXT_MUTED = '#57636C';
const CLEAN_TEXT_SOFT = '#6B7280';
const CLEAN_SURFACE_GRADIENT = [CLEAN_SURFACE, CLEAN_SURFACE, CLEAN_SURFACE] as const;
const CLEAN_SURFACE_ALT_GRADIENT = [CLEAN_SURFACE_ALT, CLEAN_SURFACE_ALT, CLEAN_SURFACE_ALT] as const;

const formatSubscriptionDateLabel = (value?: any) => {
  if (!value) return '-';
  if (typeof value?.toDate === 'function') return value.toDate().toLocaleDateString('pt-BR');
  if (value instanceof Date) return value.toLocaleDateString('pt-BR');
  if (typeof value === 'number') {
    const millis = value < 1000000000000 ? value * 1000 : value;
    return new Date(millis).toLocaleDateString('pt-BR');
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('pt-BR');
};

const formatSubscriptionAmountLabel = (value?: any, currency: string = 'BRL') => {
  if (value === undefined || value === null) return '-';
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return '-';
  const amount = parsed > 1000 ? parsed / 100 : parsed;
  return formatCurrency(amount, currency ? String(currency).toUpperCase() : 'BRL');
};

const formatSubscriptionStatusLabel = (value?: string) => {
  if (!value) return '-';
  const normalized = String(value).toLowerCase();
  const labels: Record<string, string> = {
    active: 'Ativa',
    trialing: 'Em teste',
    past_due: 'Pagamento pendente',
    canceled: 'Cancelada',
    unpaid: 'Não paga',
    incomplete: 'Incompleta',
    incomplete_expired: 'Incompleta expirada',
  };
  return labels[normalized] || normalized.replace(/_/g, ' ');
};

const isBillingPending = (payment: PaymentRecord) => {
  if (payment.pago === true) return false;
  const status = String(payment.stripeStatus || '').toLowerCase();
  if (!status) return true;
  return !['paid', 'succeeded', 'completed', 'complete', 'canceled', 'cancelled'].includes(status);
};

const sanitizeBillingTitle = (value?: string) => {
  const text = String(value || '').trim();
  if (!text) return 'Mensalidade';
  const cleaned = text.replace(/\(agf:[^)]+\)/gi, '').replace(/\s+/g, ' ').trim();
  return cleaned || text;
};

const inferAiEvaluationType = (title?: string, summary?: string) => {
  const normalized = `${String(title || '')} ${String(summary || '')}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('postural') || normalized.includes('postura')) return 'postural';
  if (normalized.includes('fisica') || normalized.includes('fisico')) return 'fisica';
  if (
    normalized.includes('personalizada') ||
    normalized.includes('questionario') ||
    normalized.includes('perguntas')
  ) {
    return 'personalizada';
  }
  return undefined;
};

type PromoThemeKey = 'oceano' | 'energia' | 'grafite';
type PromoFormatKey = 'feed' | 'story' | 'square';
type PromoTextStyleKey = 'clean' | 'impacto' | 'neon';
type PromoTextAlignKey = 'left' | 'center';

const PROMO_THEME_COLORS: Record<
  PromoThemeKey,
  {
    bgStart: string;
    bgEnd: string;
    accent: string;
    text: string;
    muted: string;
  }
> = {
  oceano: {
    bgStart: '#031327',
    bgEnd: '#123d72',
    accent: '#59b8ff',
    text: '#eff6ff',
    muted: 'rgba(239, 246, 255, 0.84)',
  },
  energia: {
    bgStart: '#1f123f',
    bgEnd: '#b32f6d',
    accent: '#ffd36c',
    text: '#fff9ee',
    muted: 'rgba(255, 249, 238, 0.86)',
  },
  grafite: {
    bgStart: '#131821',
    bgEnd: '#37445a',
    accent: '#8ad0ff',
    text: '#f6fbff',
    muted: 'rgba(246, 251, 255, 0.84)',
  },
};

const PROMO_THEME_LABELS: Record<PromoThemeKey, string> = {
  oceano: 'Oceano',
  energia: 'Energia',
  grafite: 'Grafite',
};

const PROMO_FORMAT_LABELS: Record<PromoFormatKey, string> = {
  feed: 'Post feed',
  story: 'Post story',
  square: 'Post quadrado',
};

const PROMO_TEXT_STYLE_LABELS: Record<PromoTextStyleKey, string> = {
  clean: 'Clean',
  impacto: 'Impacto',
  neon: 'Neon',
};

const PROMO_TEXT_ALIGN_LABELS: Record<PromoTextAlignKey, string> = {
  left: 'Esquerda',
  center: 'Centro',
};

const PROMO_COPY_PRESETS: Array<{
  id: string;
  label: string;
  title: string;
  subtitle: string;
  cta: string;
}> = [
  {
    id: 'convite',
    label: 'Convite',
    title: 'Treine comigo no MH Personal Trainer',
    subtitle: 'Entre no app com meu código e receba treinos personalizados.',
    cta: 'Use o código e comece hoje',
  },
  {
    id: 'resultado',
    label: 'Resultados',
    title: 'Chegou a hora de acelerar seus resultados',
    subtitle: 'Acompanhamento real, treinos objetivos e evolução semanal.',
    cta: 'Entre agora com meu código',
  },
  {
    id: 'desafio',
    label: 'Desafio',
    title: 'Topa 30 dias de foco total?',
    subtitle: 'Plano alinhado ao seu objetivo com suporte no app.',
    cta: 'Ative seu acesso com meu código',
  },
];

const PROMO_COLOR_SWATCHES = [
  '#031327',
  '#123D72',
  '#59B8FF',
  '#1F123F',
  '#B32F6D',
  '#FFD36C',
  '#131821',
  '#37445A',
  '#8AD0FF',
  '#0C4A6E',
  '#065F46',
  '#DC2626',
];

const normalizeHexColor = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const sanitized = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(sanitized)) {
    return null;
  }
  const full =
    sanitized.length === 3
      ? sanitized
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : sanitized;
  return `#${full.toUpperCase()}`;
};

const SOLO_HOME_STORAGE_PREFIX = '@mh:solo-home';
const SOLO_DAILY_WATER_GOAL = 8;
const SOLO_DAILY_KCAL_GOAL = 2200;
const SOLO_CALENDAR_DAYS = 7;
const SOLO_AI_SUGGESTIONS_LIMIT = 40;
const SOLO_FOOD_CATALOG_STORAGE_PREFIX = '@mh:solo-food-catalog';
const SOLO_SHARED_FOOD_COLLECTION = 'publicFoodCatalogIndex';
const SOLO_FOOD_CACHE_LIMIT = 320;
const SOLO_FOOD_SEARCH_MIN_ITEMS = 12;
const SOLO_DAILY_STEPS_GOAL = 8000;
const SOLO_AI_EVALUATION_BASE_INTERVAL_DAYS = 21;
const SOLO_AI_EVALUATION_ACTIVE_INTERVAL_DAYS = 10;
const SOLO_AI_EVALUATION_ACTIVE_WORKOUTS = 4;

type SoloGoalProfile = 'lose-fat' | 'gain-muscle' | 'recomp' | 'performance' | 'maintain';

const clampNumber = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const parseMetricNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const parseWeightKg = (value: unknown) => {
  const parsed = parseMetricNumber(value);
  if (parsed === null) return null;
  return clampNumber(parsed, 35, 260);
};

const parseHeightCm = (value: unknown) => {
  const parsed = parseMetricNumber(value);
  if (parsed === null) return null;
  let cm = parsed;
  if (cm > 0 && cm < 3) {
    cm *= 100;
  } else if (cm >= 3 && cm < 30) {
    cm *= 10;
  }
  return clampNumber(cm, 120, 230);
};

const normalizeGoalText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const resolveGoalProfile = (goalText: string): SoloGoalProfile => {
  const goal = normalizeGoalText(goalText);
  if (!goal) return 'maintain';
  if (goal.includes('recomp')) return 'recomp';
  if (
    goal.includes('ganhar') ||
    goal.includes('massa') ||
    goal.includes('hipertrof') ||
    goal.includes('bulk')
  ) {
    return 'gain-muscle';
  }
  if (
    goal.includes('perder') ||
    goal.includes('emagrec') ||
    goal.includes('secar') ||
    goal.includes('deficit') ||
    goal.includes('gordura')
  ) {
    return 'lose-fat';
  }
  if (
    goal.includes('performance') ||
    goal.includes('resist') ||
    goal.includes('corr') ||
    goal.includes('atlet') ||
    goal.includes('energia')
  ) {
    return 'performance';
  }
  if (goal.includes('manter') || goal.includes('manutenc')) {
    return 'maintain';
  }
  return 'maintain';
};

const roundToNearest = (value: number, step: number) => {
  return Math.round(value / step) * step;
};

const estimatePersonalizedDailyTargets = (input: {
  weightKg?: number | null;
  heightCm?: number | null;
  goalText?: string;
}) => {
  const weightKg = clampNumber(input.weightKg ?? 70, 35, 220);
  const heightCm = clampNumber(input.heightCm ?? 170, 140, 220);
  const goalProfile = resolveGoalProfile(input.goalText || '');

  const bmrMale = 10 * weightKg + 6.25 * heightCm - 5 * 24 + 5;
  const bmrFemale = 10 * weightKg + 6.25 * heightCm - 5 * 24 - 161;
  const baseKcal = ((bmrMale + bmrFemale) / 2) * 1.45;

  const goalMultiplier: Record<SoloGoalProfile, number> = {
    'lose-fat': 0.85,
    'gain-muscle': 1.12,
    recomp: 0.96,
    performance: 1.08,
    maintain: 1,
  };

  const kcalGoal = clampNumber(roundToNearest(baseKcal * goalMultiplier[goalProfile], 50), 1300, 4200);

  const goalWaterBoostMl: Record<SoloGoalProfile, number> = {
    'lose-fat': 350,
    'gain-muscle': 450,
    recomp: 280,
    performance: 500,
    maintain: 200,
  };

  const waterMlGoal = clampNumber(Math.round(weightKg * 35 + goalWaterBoostMl[goalProfile]), 1700, 5000);
  const waterCupsGoal = clampNumber(Math.round(waterMlGoal / 250), Math.max(4, SOLO_DAILY_WATER_GOAL - 2), 20);

  return {
    kcalGoal,
    waterMlGoal,
    waterCupsGoal,
  };
};

type SoloAiEvaluationNeed = {
  needed: boolean;
  reason: string;
  nextWindowDays?: number;
};

const buildSoloAiEvaluationQuestions = (goalText?: string): EvaluationQuestion[] => {
  const goal = goalText?.trim() || 'seu objetivo atual';
  const now = Date.now();
  return [
    {
      id: `mh-q-energy-${now}`,
      pergunta: 'Como esteve seu nivel de energia nos ultimos 7 dias? (0 a 10)',
      tipo: 'escala',
      obrigatoria: true,
    },
    {
      id: `mh-q-pain-${now}`,
      pergunta: 'Sentiu dor articular ou muscular fora do normal nessa semana?',
      tipo: 'sim_nao',
      obrigatoria: true,
    },
    {
      id: `mh-q-goal-${now}`,
      pergunta: `O que mais está dificultando sua evolução em ${goal}?`,
      tipo: 'texto',
      obrigatoria: true,
    },
    {
      id: `mh-q-sleep-${now}`,
      pergunta: 'Seu sono esta ajudando sua recuperacao?',
      tipo: 'multipla_escolha',
      opcoes: ['Ruim', 'Regular', 'Bom', 'Excelente'],
      obrigatoria: true,
    },
    {
      id: `mh-q-focus-${now}`,
      pergunta: 'Qual foco da proxima semana?',
      tipo: 'multipla_escolha',
      opcoes: ['Tecnica', 'Forca', 'Resistencia', 'Mobilidade', 'Constancia'],
      obrigatoria: true,
    },
  ];
};

const resolveAiEvaluationNeed = (params: {
  lastEvaluationAt?: Date | null;
  completedWorkoutsLast7d: number;
  totalEvaluations: number;
}): SoloAiEvaluationNeed => {
  const { lastEvaluationAt, completedWorkoutsLast7d, totalEvaluations } = params;
  if (!lastEvaluationAt || totalEvaluations <= 0) {
    return {
      needed: true,
      reason: 'Primeira avaliação recomendada para calibrar seu plano.',
    };
  }

  const now = new Date();
  const millis = now.getTime() - lastEvaluationAt.getTime();
  const daysSinceLastEvaluation = Math.max(0, Math.floor(millis / (1000 * 60 * 60 * 24)));
  const acceleratedWindow = completedWorkoutsLast7d >= SOLO_AI_EVALUATION_ACTIVE_WORKOUTS;
  const requiredDays = acceleratedWindow
    ? SOLO_AI_EVALUATION_ACTIVE_INTERVAL_DAYS
    : SOLO_AI_EVALUATION_BASE_INTERVAL_DAYS;

  if (daysSinceLastEvaluation >= requiredDays) {
    return {
      needed: true,
      reason: acceleratedWindow
        ? 'Seu volume de treino esta alto, vale reavaliar para ajustar carga e foco.'
        : 'Já passou o intervalo recomendado, hora de uma nova avaliação.',
    };
  }

  return {
    needed: false,
    reason: 'Pelos seus dados atuais, você ainda não precisa de nova avaliação.',
    nextWindowDays: Math.max(1, requiredDays - daysSinceLastEvaluation),
  };
};

const SOLO_BODY_GOAL_OPTIONS = [
  {
    id: 'lose-fat',
    label: 'Perder gordura',
    summary: 'Secar com preservacao muscular',
  },
  {
    id: 'gain-muscle',
    label: 'Ganhar massa muscular',
    summary: 'Aumentar volume com qualidade',
  },
  {
    id: 'recomp',
    label: 'Recomposicao corporal',
    summary: 'Reduzir gordura e ganhar massa',
  },
  {
    id: 'performance',
    label: 'Melhorar performance',
    summary: 'Mais energia e resistencia',
  },
  {
    id: 'maintain',
    label: 'Manter o peso',
    summary: 'Estabilidade com saude',
  },
] as const;

type SoloMealFood = {
  name: string;
  portion: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  imageUrl?: string;
};

type SoloMealAnalysis = {
  foods: SoloMealFood[];
  totals: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  notes: string;
  source?: 'catalog' | 'ai';
};

type SoloMealEntry = {
  id: string;
  description: string;
  kcal: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  foods?: SoloMealFood[];
  imageUrl?: string;
  notes?: string;
  estimatedByAi: boolean;
  createdAt: string;
};

type SoloHomeSnapshot = {
  waterCups: number;
  stepsGoal?: number;
  stepsToday?: number;
  meals: SoloMealEntry[];
  latestWeightKg?: number;
  latestHeightCm?: number;
  latestGoal?: string;
};

type SoloFoodCatalogItem = {
  id: string;
  name: string;
  category: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  imageUrl?: string;
  popularity?: number;
  lastSeenAt?: string;
  source?: 'base' | 'ai' | 'community';
};

type SoloFoodCatalogSnapshot = {
  items: SoloFoodCatalogItem[];
  updatedAt?: string;
};

type SoloAiSuggestionType = 'treino' | 'avaliacao';

type SoloAiSuggestion = {
  id: string;
  type: SoloAiSuggestionType;
  title: string;
  summary: string;
  dateKey: string;
  createdAt: string;
  reason: 'weekly' | 'workout';
  unread?: boolean;
  evaluationId?: string;
  evaluationType?: 'personalizada' | 'postural' | 'fisica' | 'online';
};

type SoloAiPlannerSnapshot = {
  lastReviewAt?: string;
  lastWorkoutCompletionAt?: string;
  suggestions: SoloAiSuggestion[];
};

type SoloCalendarEventType = SoloAiSuggestionType | 'fatura';

type SoloCalendarEvent = {
  id: string;
  type: SoloCalendarEventType;
  title: string;
  subtitle: string;
  dateKey: string;
  source: 'base' | 'ai' | 'financeiro';
  workoutId?: string;
  evaluationId?: string;
  evaluationType?: 'personalizada' | 'postural' | 'fisica' | 'online';
  paymentId?: string;
  checkoutUrl?: string;
};

const parseMacroValue = (value: any) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 10) / 10);
};

const extractFirstJsonObject = (text: string) => {
  if (!text || typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const maybe = text.slice(start, end + 1);
  try {
    return JSON.parse(maybe);
  } catch (_) {
    return null;
  }
};

const buildFoodImageUrl = (description: string) => {
  const querySeed = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(',');
  const query = querySeed || 'healthy,food,meal';
  return `https://source.unsplash.com/featured/640x480/?${encodeURIComponent(query)}`;
};

const analyzeMealFromCatalogSelection = (
  selectedItems: SoloFoodCatalogItem[]
): SoloMealAnalysis => {
  const foods = selectedItems
    .slice(0, 12)
    .map((item) => ({
      name: item.name,
      portion: '100 g',
      kcal: Math.max(0, Math.round(Number(item.kcalPer100g || 0))),
      protein: parseMacroValue(item.proteinPer100g),
      carbs: parseMacroValue(item.carbsPer100g),
      fat: parseMacroValue(item.fatPer100g),
      imageUrl: item.imageUrl || buildFoodImageUrl(item.name),
    }));

  const totals = foods.reduce(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      protein: parseMacroValue(acc.protein + item.protein),
      carbs: parseMacroValue(acc.carbs + item.carbs),
      fat: parseMacroValue(acc.fat + item.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const notes =
    foods.length <= 1
      ? 'Estimativa calculada com base no item selecionado no catalogo.'
      : `Estimativa calculada com base em ${foods.length} itens selecionados (100 g cada).`;

  return {
    foods,
    totals: {
      kcal: Math.max(0, Math.round(totals.kcal)),
      protein: parseMacroValue(totals.protein),
      carbs: parseMacroValue(totals.carbs),
      fat: parseMacroValue(totals.fat),
    },
    notes,
    source: 'catalog',
  };
};

const getFoodCategoryIcon = (category: string) => {
  const normalized = String(category || '').toLowerCase();
  if (normalized.includes('prote')) return 'barbell-outline';
  if (normalized.includes('fruta')) return 'nutrition-outline';
  if (normalized.includes('verd') || normalized.includes('legume')) return 'leaf-outline';
  if (normalized.includes('carbo') || normalized.includes('grao') || normalized.includes('massa')) return 'restaurant-outline';
  if (normalized.includes('latic') || normalized.includes('leite') || normalized.includes('iog')) return 'cafe-outline';
  if (normalized.includes('snack') || normalized.includes('doce')) return 'ice-cream-outline';
  return 'fast-food-outline';
};

const normalizeFoodNameKey = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

const hashFoodKey = (value: string) => {
  let hash = 0;
  const input = String(value || '');
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
};

const buildStableFoodDocId = (value: string) => {
  const normalized = normalizeFoodNameKey(value);
  if (normalized.length > 0) return normalized;
  return `food-${hashFoodKey(value)}`;
};

const normalizeSearchText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const tokenizeFoodSearch = (value: string) =>
  normalizeSearchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .slice(0, 6);

const buildFoodItemId = (name: string, fallback: string = 'food') => {
  const normalized = normalizeFoodNameKey(name);
  if (normalized.length > 0) return `food-${normalized}`;
  return `${fallback}-${hashFoodKey(name)}`;
};

const foodMatchesTokens = (food: SoloFoodCatalogItem, tokens: string[]) => {
  if (!tokens.length) return true;
  const haystack = normalizeSearchText(`${food.name} ${food.category}`);
  return tokens.every((token) => haystack.includes(token));
};

const buildFoodSearchRank = (food: SoloFoodCatalogItem, tokens: string[]) => {
  const normalizedName = normalizeSearchText(food.name);
  const normalizedCategory = normalizeSearchText(food.category);
  const popularityScore = Number(food.popularity || 0);
  let score = popularityScore;
  tokens.forEach((token) => {
    if (normalizedName === token) score += 150;
    else if (normalizedName.startsWith(token)) score += 95;
    else if (normalizedName.includes(token)) score += 55;
    if (normalizedCategory.includes(token)) score += 18;
  });
  return score;
};

const mergeFoodCatalogItems = (
  current: SoloFoodCatalogItem[],
  incoming: SoloFoodCatalogItem[],
  options?: { popularityBoost?: number; source?: 'base' | 'ai' | 'community' }
) => {
  const nextMap = new Map<string, SoloFoodCatalogItem>();
  const popularityBoost = Math.max(1, Number(options?.popularityBoost || 1));
  const source = options?.source || 'community';

  const upsert = (item: SoloFoodCatalogItem) => {
    const name = String(item.name || '').trim();
    if (!name) return;
    const key = buildStableFoodDocId(name);
    const existing = nextMap.get(key);
    const currentPopularity = Number(existing?.popularity || 0);
    const incomingPopularity = Number(item.popularity || 0);

    const merged: SoloFoodCatalogItem = {
      id: existing?.id || item.id || buildFoodItemId(name),
      name,
      category: String(item.category || existing?.category || 'geral').trim(),
      kcalPer100g: Math.max(0, Math.round(Number(item.kcalPer100g || existing?.kcalPer100g || 0))),
      proteinPer100g: parseMacroValue(item.proteinPer100g ?? existing?.proteinPer100g),
      carbsPer100g: parseMacroValue(item.carbsPer100g ?? existing?.carbsPer100g),
      fatPer100g: parseMacroValue(item.fatPer100g ?? existing?.fatPer100g),
      imageUrl: item.imageUrl || existing?.imageUrl || buildFoodImageUrl(name),
      popularity: Math.max(0, currentPopularity + Math.max(incomingPopularity, popularityBoost)),
      lastSeenAt: new Date().toISOString(),
      source: item.source || existing?.source || source,
    };
    nextMap.set(key, merged);
  };

  current.forEach(upsert);
  incoming.forEach(upsert);

  return Array.from(nextMap.values())
    .sort((left, right) => Number(right.popularity || 0) - Number(left.popularity || 0))
    .slice(0, SOLO_FOOD_CACHE_LIMIT);
};

const SOLO_FAMOUS_PRODUCTS_SEED: SoloFoodCatalogItem[] = [
  { id: 'food-iogurte-danone-natural', name: 'Iogurte Danone Natural', category: 'laticinios', kcalPer100g: 62, proteinPer100g: 3.4, carbsPer100g: 7.1, fatPer100g: 2.1, imageUrl: buildFoodImageUrl('iogurte danone natural'), popularity: 40, source: 'base' },
  { id: 'food-iogurte-grego-yopro', name: 'YoPRO Iogurte Grego', category: 'laticinios', kcalPer100g: 74, proteinPer100g: 10.0, carbsPer100g: 5.3, fatPer100g: 0.2, imageUrl: buildFoodImageUrl('yopro iogurte grego'), popularity: 36, source: 'base' },
  { id: 'food-leite-ninho-integral', name: 'Leite Ninho Integral', category: 'laticinios', kcalPer100g: 63, proteinPer100g: 3.3, carbsPer100g: 5.0, fatPer100g: 3.5, imageUrl: buildFoodImageUrl('leite ninho integral'), popularity: 30, source: 'base' },
  { id: 'food-frango-grelhado', name: 'Frango grelhado', category: 'proteinas', kcalPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6, imageUrl: buildFoodImageUrl('frango grelhado'), popularity: 38, source: 'base' },
  { id: 'food-ovo-cozido', name: 'Ovo cozido', category: 'proteinas', kcalPer100g: 155, proteinPer100g: 13, carbsPer100g: 1.1, fatPer100g: 11, imageUrl: buildFoodImageUrl('ovo cozido'), popularity: 35, source: 'base' },
  { id: 'food-whey-growth', name: 'Whey Protein Growth', category: 'suplementos', kcalPer100g: 392, proteinPer100g: 79, carbsPer100g: 8.2, fatPer100g: 6.1, imageUrl: buildFoodImageUrl('whey protein growth'), popularity: 39, source: 'base' },
  { id: 'food-whey-max', name: 'Whey Max Titanium', category: 'suplementos', kcalPer100g: 402, proteinPer100g: 76, carbsPer100g: 11, fatPer100g: 6.2, imageUrl: buildFoodImageUrl('whey max titanium'), popularity: 34, source: 'base' },
  { id: 'food-arroz-integral', name: 'Arroz integral cozido', category: 'carboidratos', kcalPer100g: 124, proteinPer100g: 2.6, carbsPer100g: 25.8, fatPer100g: 1.0, imageUrl: buildFoodImageUrl('arroz integral cozido'), popularity: 32, source: 'base' },
  { id: 'food-feijao-carioca', name: 'Feijao carioca cozido', category: 'carboidratos', kcalPer100g: 76, proteinPer100g: 4.8, carbsPer100g: 13.6, fatPer100g: 0.5, imageUrl: buildFoodImageUrl('feijao carioca cozido'), popularity: 31, source: 'base' },
  { id: 'food-pao-wickbold', name: 'Pao integral Wickbold', category: 'industrializados', kcalPer100g: 247, proteinPer100g: 9.2, carbsPer100g: 44.9, fatPer100g: 4.2, imageUrl: buildFoodImageUrl('pao integral wickbold'), popularity: 28, source: 'base' },
  { id: 'food-banana-prata', name: 'Banana prata', category: 'frutas', kcalPer100g: 98, proteinPer100g: 1.3, carbsPer100g: 26, fatPer100g: 0.1, imageUrl: buildFoodImageUrl('banana prata'), popularity: 33, source: 'base' },
  { id: 'food-maca-gala', name: 'Maca gala', category: 'frutas', kcalPer100g: 56, proteinPer100g: 0.3, carbsPer100g: 14.8, fatPer100g: 0.2, imageUrl: buildFoodImageUrl('maca gala'), popularity: 26, source: 'base' },
];

const mapAiErrorMessage = (error: any, fallback: string) => {
  const raw = String(error?.message || '').trim();
  const normalized = raw.toLowerCase();
  if (normalized.includes('user not found')) {
    const loaded = String(process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '')
      .trim()
      .replace(/^['"]|['"]$/g, '');
    const suffix = loaded.length >= 4 ? loaded.slice(-4) : '----';
    return `A chave carregada no app (final ${suffix}) foi rejeitada pelo OpenRouter. Se você já trocou a chave, reinicie com "npx expo start -c". Em dev build, se persistir, refaça o build porque o eas.json pode estar com chave antiga embutida.`;
  }
  if (normalized.includes('faca login') || normalized.includes('conta nao encontrada')) {
    return 'Sua sessão expirou. Entre novamente para usar os recursos de IA.';
  }
  return raw || fallback;
};

const toDateKey = (date: Date) => format(date, 'yyyy-MM-dd');

const dateFromDateKey = (value?: string) => {
  const raw = String(value || '').trim();
  const parts = raw.split('-').map((item) => Number(item));
  if (parts.length !== 3 || parts.some((item) => !Number.isFinite(item))) {
    return new Date();
  }
  const [year, month, day] = parts;
  return new Date(year, month - 1, day, 9, 0, 0, 0);
};

const toDateSafe = (value: any) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') {
    const converted = value.toDate();
    return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeWeekday = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const weekdayKeyFromDate = (date: Date) => {
  const map = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  return map[date.getDay()] || '';
};

const workoutMatchesWeekday = (diasDaSemana: string[] | undefined, date: Date) => {
  if (!Array.isArray(diasDaSemana) || diasDaSemana.length === 0) return false;
  const dayKey = weekdayKeyFromDate(date);
  return diasDaSemana.some((value) => {
    const normalized = normalizeWeekday(value);
    if (!normalized) return false;
    if (normalized.includes(dayKey)) return true;
    if (dayKey === 'terca' && normalized.includes('ter')) return true;
    if (dayKey === 'quinta' && normalized.includes('qui')) return true;
    if (dayKey === 'sabado' && normalized.includes('sab')) return true;
    if (dayKey === 'domingo' && normalized.includes('dom')) return true;
    if (dayKey === 'segunda' && normalized.includes('seg')) return true;
    if (dayKey === 'quarta' && normalized.includes('qua')) return true;
    if (dayKey === 'sexta' && normalized.includes('sex')) return true;
    return false;
  });
};

export default function HomeScreen() {
  const { colors, spacing, typography } = useTheme();
  const { user, role } = useAuthStore();
  const { isPersonal: hasPersonalAccess, isChecking: isCheckingPersonalAccess } =
    useResolvedPersonalAccess();
  const { padding } = useResponsive();
  const dashboard = useDashboardData();
  const adminDashboard = useAdminDashboardData(role === 'admin');
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = role === 'admin';
  const isPersonal = hasPersonalAccess;
  const hasPersonal = hasValidPersonalCode(user?.codigoPersonal);
  const isSuspended = !!user?.acessoSuspenso;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isAdmin) {
      await adminDashboard.refresh();
    } else {
      await dashboard.refresh();
    }
    setRefreshing(false);
  }, [adminDashboard, dashboard, isAdmin]);

  if (
    (!isAdmin && isCheckingPersonalAccess) ||
    (dashboard.loading && !dashboard.hasLoadedOnce && !isAdmin) ||
    (adminDashboard.loading && isAdmin)
  ) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.primaryBackground }]}>
        <ActivityIndicator size="large" color={colors.customColor3} />
        <Text style={[{ color: colors.secondaryText, marginTop: spacing.md }, typography.bodyMedium]}>
          Carregando dados...
        </Text>
      </View>
    );
  }

  if (isAdmin) {
    return (
      <AdminHomeScreen
        padding={padding}
        refreshing={refreshing}
        onRefresh={onRefresh}
        error={adminDashboard.error}
        overview={adminDashboard.overview}
      />
    );
  }

  if (isPersonal) {
    return (
      <PersonalHomeScreen
        padding={padding}
        refreshing={refreshing}
        onRefresh={onRefresh}
        alunos={dashboard.alunos}
        stats={dashboard.stats}
        error={dashboard.error}
      />
    );
  }

  if (isSuspended) {
    return (
      <SuspendedHomeScreen
        padding={padding}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    );
  }

  if (!hasPersonal) {
    return (
      <NoPersonalHomeScreen
        padding={padding}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <AlunoHomeScreen
      padding={padding}
      refreshing={refreshing}
      onRefresh={onRefresh}
      treinos={dashboard.treinos}
      avaliacoes={dashboard.avaliacoes}
      error={dashboard.error}
    />
  );
}

interface BaseHomeProps {
  padding: number;
  refreshing: boolean;
  onRefresh: () => void;
}

interface AlunoHomeProps extends BaseHomeProps {
  treinos: any[];
  avaliacoes: any[];
  error: string | null;
}

function AlunoHomeScreen({ padding, refreshing, onRefresh, treinos, avaliacoes, error }: AlunoHomeProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const { colors, typography, spacing, borderRadius, isDark } = useTheme();
  const aiAccess = useAiAccessStatus();
  const cleanPalette = getCleanPalette(isDark);
  const {
    surface: CLEAN_SURFACE,
    surfaceAlt: CLEAN_SURFACE_ALT,
    surfaceSoft: CLEAN_SURFACE_SOFT,
    border: CLEAN_BORDER,
    text: CLEAN_TEXT,
    textMuted: CLEAN_TEXT_MUTED,
    textSoft: CLEAN_TEXT_SOFT,
    surfaceGradient: CLEAN_SURFACE_GRADIENT,
    surfaceAltGradient: CLEAN_SURFACE_ALT_GRADIENT,
  } = cleanPalette;

  const languageTag = getLanguageTag(i18n.resolvedLanguage);
  const firstName = user?.displayName?.split(' ')[0] || t('profile.userFallback');
  const today = new Date();
  const ultimaAvaliacao = avaliacoes.length > 0 ? avaliacoes[0] : null;
  const isTreinoDoDia = (treino: any) => workoutMatchesWeekday(treino?.diasDaSemana, today);
  const isTreinoConcluidoHoje = (treino: any) => {
    if (!treino?.lastCompletedAt) return false;
    const completed = new Date(treino.lastCompletedAt);
    return (
      completed.getFullYear() === today.getFullYear() &&
      completed.getMonth() === today.getMonth() &&
      completed.getDate() === today.getDate()
    );
  };
  const getTreinoStatus = (treino?: any) =>
    getWorkoutStatusPresentation({
      lastCompletedAt: treino?.lastCompletedAt,
      lastSessionAt: treino?.lastSessionAt,
      lastSessionStatus: treino?.lastSessionStatus,
      lastSessionRemainingExercises: treino?.lastSessionRemainingExercises,
    });
  const treinosDoDia = treinos.filter(isTreinoDoDia);
  const treinosConcluidosHoje = treinos.filter(isTreinoConcluidoHoje).length;
  const treinoPrincipal = treinosDoDia[0] || treinos[0] || null;
  const treinoPrincipalStatus = treinoPrincipal ? getTreinoStatus(treinoPrincipal) : null;
  const treinoPrincipalHasWarning = treinoPrincipalStatus?.status === 'partial';
  const treinoConcluidoHoje = treinoPrincipal ? isTreinoConcluidoHoje(treinoPrincipal) : false;
  const hasPersonal = hasValidPersonalCode(user?.codigoPersonal);
  const hasIndividualPlan = Boolean(user?.planoChatGPT || aiAccess.premium);
  const aiDailyLimit = aiAccess.dailyLimit || FREE_DAILY_AI_CREDITS;
  const aiRemaining = aiAccess.loading ? aiDailyLimit : Math.max(0, aiAccess.remaining ?? aiDailyLimit);
  const [personalProfile, setPersonalProfile] = useState<PersonalProfile | null>(null);
  const [notificationBadge, setNotificationBadge] = useState(0);

  const refreshNotificationBadge = useCallback(async () => {
    if (!user?.uid) {
      setNotificationBadge(0);
      await setBadgeCount(0);
      return;
    }

    try {
      const result = await countPendingNotificationsForUser(user.uid);
      const total = Math.max(0, Number(result.data || 0));
      setNotificationBadge(total);
      await setBadgeCount(total);
    } catch (_) {
      setNotificationBadge(0);
      await setBadgeCount(0);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      void refreshNotificationBadge();
    }, [refreshNotificationBadge])
  );

  useEffect(() => {
    let mounted = true;
    const loadPersonal = async () => {
      const personalCode = user?.codigoPersonal;
      if (!hasValidPersonalCode(personalCode)) {
        setPersonalProfile(null);
        return;
      }
      const profile = await firestoreService.getPersonalProfileByCode(personalCode as string | number);
      if (mounted) {
        setPersonalProfile(profile);
      }
    };
    loadPersonal();
    return () => {
      mounted = false;
    };
  }, [user?.codigoPersonal]);

  const personalName = personalProfile?.displayName || user?.nameDoSeuPersonal || t('profile.yourPersonal');
  const personalCode = personalProfile?.codigoPersonal ?? user?.codigoPersonal ?? '-';
  const ultimaAvaliacaoDate = toDateSafe(ultimaAvaliacao?.createdAt || ultimaAvaliacao?.data);
  const ultimaAvaliacaoLabel = ultimaAvaliacaoDate
    ? new Intl.DateTimeFormat(languageTag, { day: '2-digit', month: '2-digit' }).format(ultimaAvaliacaoDate)
    : t('home.noRecords');
  const treinoStatusLabel = treinoPrincipal ? treinoPrincipalStatus?.label || t('home.noWorkout') : t('home.noWorkout');
  const treinoStatusDescription = treinoPrincipal
    ? treinoPrincipalStatus?.description || t('home.openWorkoutDetails')
    : t('home.noWorkoutToday');
  const workoutPreview = treinos.filter((item) => item.id !== treinoPrincipal?.id).slice(0, 3);

  const handleOpenPersonalChat = async () => {
    if (!user?.uid) return;
    if (!personalProfile?.uid) {
      router.push('/(tabs)/chat' as any);
      return;
    }
    try {
      const convo = await ensureConversation({
        userId: user.uid,
        userName: user.displayName,
        userPhoto: user.photoUrl,
        otherUserId: personalProfile.uid,
        otherName: personalProfile.displayName,
        otherPhoto: personalProfile.photoUrl,
        type: 'direct',
      });
      router.push({
        pathname: '/chat/[id]',
        params: { id: convo.id, name: personalProfile.displayName, avatar: personalProfile.photoUrl || '' },
      });
    } catch (_) {
      router.push('/(tabs)/chat' as any);
    }
  };

  const handleOpenFeaturedWorkout = () => {
    if (!treinoPrincipal) {
      router.push('/(tabs)/workouts' as any);
      return;
    }
    if (treinoConcluidoHoje) {
      router.push({
        pathname: '/workout/[id]',
        params: { id: treinoPrincipal.id },
      } as any);
      return;
    }
    router.push({
      pathname: '/start-workout',
      params: { workoutId: treinoPrincipal.id },
    } as any);
  };

  const handleOpenWorkoutDetails = () => {
    if (!treinoPrincipal) {
      router.push('/(tabs)/workouts' as any);
      return;
    }
    router.push({
      pathname: '/workout/[id]',
      params: { id: treinoPrincipal.id },
    } as any);
  };

  const quickActions = [
    {
      id: 'chat-personal',
      title: t('home.chatWithTrainerTitle'),
      subtitle: personalName
        ? t('home.chatWithTrainerSubtitleWithName', { name: personalName })
        : t('home.chatWithTrainerSubtitleDefault'),
      icon: 'chatbubble-ellipses-outline',
      ctaIcon: 'arrow-forward',
      accent: ['#60A5FA', '#2563EB'],
      onPress: handleOpenPersonalChat,
    },
    {
      id: 'assistente',
      title: t('home.assistantTitle'),
      subtitle: t('home.assistantSubtitle', { count: aiRemaining, limit: aiDailyLimit }),
      icon: 'sparkles-outline',
      ctaIcon: 'arrow-forward',
      accent: ['#A78BFA', '#4F46E5'],
      onPress: () => router.push('/chat/ai' as any),
      badgeLabel: !hasIndividualPlan ? `${aiRemaining}` : undefined,
      badgeBg: 'rgba(167,139,250,0.22)',
      badgeColor: '#5B21B6',
    },
    {
      id: 'treinos',
      title: t('workout.myWorkouts'),
      subtitle: treinoPrincipal
        ? treinoPrincipal.nome
        : t('home.workoutsSubtitleCount', { count: treinos.length }),
      icon: 'barbell-outline',
      ctaIcon: 'arrow-forward',
      accent: ['#22D3EE', '#0E7490'],
      onPress: () => router.push('/(tabs)/workouts' as any),
      badgeLabel: treinos.length > 0 ? `${treinos.length}` : undefined,
      badgeBg: 'rgba(34,211,238,0.22)',
      badgeColor: '#155E75',
    },
    {
      id: 'avaliacoes',
      title: t('navigation.evaluations'),
      subtitle: ultimaAvaliacaoDate
        ? t('home.evaluationsSubtitleWithDate', { date: ultimaAvaliacaoLabel })
        : t('home.evaluationsSubtitleDefault'),
      icon: 'analytics-outline',
      ctaIcon: 'arrow-forward',
      accent: ['#4ADE80', '#166534'],
      onPress: () => router.push('/evaluations' as any),
    },
    {
      id: 'agenda-fit',
      title: t('home.agendaTitle'),
      subtitle: t('home.agendaSubtitle'),
      icon: 'calendar-outline',
      ctaIcon: 'arrow-forward',
      accent: ['#38BDF8', '#0284C7'],
      onPress: () => router.push('/mh-agenda-fit' as any),
    },
    {
      id: 'progresso',
      title: t('navigation.progress'),
      subtitle: t('home.progressSubtitle'),
      icon: 'trending-up-outline',
      ctaIcon: 'arrow-forward',
      accent: ['#F59E0B', '#B45309'],
      onPress: () => router.push('/progress' as any),
    },
    {
      id: 'financeiro',
      title: t('home.financeTitle'),
      subtitle: t('home.financeSubtitle'),
      icon: 'wallet-outline',
      ctaIcon: 'arrow-forward',
      accent: ['#FB7185', '#BE123C'],
      onPress: () => router.push('/financeiro' as any),
    },
    {
      id: 'notificacoes',
      title: t('profile.notifications'),
      subtitle:
        notificationBadge > 0
          ? t('home.notificationsSubtitlePending', { count: notificationBadge })
          : t('home.notificationsSubtitleDefault'),
      icon: 'notifications-outline',
      ctaIcon: 'arrow-forward',
      accent: ['#93C5FD', '#1D4ED8'],
      onPress: () => router.push('/notifications' as any),
      badgeLabel: notificationBadge > 0 ? (notificationBadge > 99 ? '99+' : `${notificationBadge}`) : undefined,
      badgeBg: 'rgba(147,197,253,0.2)',
      badgeColor: '#1E3A8A',
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.primaryBackground }]}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing['3xl'] }]}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <SafeAreaView edges={['top']}>
        <View style={[styles.section, { paddingHorizontal: padding, marginTop: 0 }]}>
          <LinearGradient
            colors={CLEAN_SURFACE_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.soloHeroCard,
              {
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                borderColor: CLEAN_BORDER,
              },
            ]}
          >
            <View style={styles.soloHeroTopRow}>
              <Text style={[{ color: CLEAN_TEXT_MUTED }, typography.bodySmall]}>
                {t('home.greeting', { name: firstName })}
              </Text>
              <View style={styles.soloHeroHeaderActions}>
                <TouchableOpacity
                  style={[
                    styles.soloHeroAvatarButton,
                    {
                      borderRadius: borderRadius.full,
                      backgroundColor: CLEAN_SURFACE_ALT,
                      borderColor: CLEAN_BORDER,
                    },
                  ]}
                  onPress={() => router.push('/profile/edit' as any)}
                >
                  {user?.photoUrl ? (
                    <Image source={{ uri: user.photoUrl }} style={[styles.avatarImage, { borderRadius: borderRadius.full }]} />
                  ) : (
                    <Ionicons name="person-circle-outline" size={28} color={CLEAN_TEXT} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.soloHeroCopy, { marginTop: spacing.xs }]}>
              <Text
                style={[styles.soloHeroTitle, { color: CLEAN_TEXT }]}
                android_hyphenationFrequency="none"
                textBreakStrategy="simple"
              >
                {t('home.heroTitle')}
              </Text>
              <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.xs }, typography.bodySmall]}>
                {treinoPrincipal
                  ? t('home.heroSubtitleWithWorkout')
                  : t('home.heroSubtitleWithoutWorkout')}
              </Text>
            </View>

            <View style={[styles.soloHeroBadgeRow, { marginTop: spacing.md }]}>
              <View style={[styles.soloHeroPlanPill, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                <Ionicons
                  name={hasPersonal ? 'shield-checkmark-outline' : 'link-outline'}
                  size={13}
                  color={colors.primary}
                />
                <Text style={[styles.soloHeroPlanPillText, { color: CLEAN_TEXT }, typography.labelSmall]}>
                  {hasPersonal ? t('home.personalConnected') : t('home.noPersonal')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.soloHeroSubscriptionCta, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}
                onPress={() => (hasPersonal ? handleOpenPersonalChat() : router.push('/personal/change-code' as any))}
              >
                <Ionicons
                  name={hasPersonal ? 'chatbubble-ellipses-outline' : 'add-circle-outline'}
                  size={14}
                  color={CLEAN_TEXT}
                />
                <Text style={[styles.soloHeroSubscriptionCtaText, { color: CLEAN_TEXT }, typography.labelSmall]}>
                  {hasPersonal ? t('home.openChat') : t('home.addCode')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.soloMetricsRow, { marginTop: spacing.md }]}>
              <LinearGradient
                colors={CLEAN_SURFACE_ALT_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.soloMetricCard, { borderRadius: borderRadius.md, borderColor: CLEAN_BORDER }]}
              >
                <View style={styles.soloMetricHeaderRow}>
                  <View style={[styles.soloMetricIconWrap, { backgroundColor: `${colors.primary}12` }]}>
                    <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
                  </View>
                  <Text style={[styles.soloMetricTitle, { color: CLEAN_TEXT_MUTED }, typography.labelSmall]}>
                    {t('home.credits')}
                  </Text>
                </View>
                <Text style={[styles.soloMetricValue, { marginTop: spacing.xs, color: CLEAN_TEXT }, typography.titleMedium]}>
                  {aiRemaining}/{aiDailyLimit}
                </Text>
              </LinearGradient>
              <LinearGradient
                colors={CLEAN_SURFACE_ALT_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.soloMetricCard, { borderRadius: borderRadius.md, borderColor: CLEAN_BORDER }]}
              >
                <View style={styles.soloMetricHeaderRow}>
                  <View style={[styles.soloMetricIconWrap, { backgroundColor: `${colors.tertiary}12` }]}>
                    <Ionicons name="barbell-outline" size={14} color={colors.tertiary} />
                  </View>
                  <Text style={[styles.soloMetricTitle, { color: CLEAN_TEXT_MUTED }, typography.labelSmall]}>
                    {t('navigation.workouts')}
                  </Text>
                </View>
                <Text style={[styles.soloMetricValue, { marginTop: spacing.xs, color: CLEAN_TEXT }, typography.titleMedium]}>
                  {treinos.length}
                </Text>
              </LinearGradient>
              <LinearGradient
                colors={CLEAN_SURFACE_ALT_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.soloMetricCard, { borderRadius: borderRadius.md, borderColor: CLEAN_BORDER }]}
              >
                <View style={styles.soloMetricHeaderRow}>
                  <View style={[styles.soloMetricIconWrap, { backgroundColor: `${colors.success}12` }]}>
                    <Ionicons name="analytics-outline" size={14} color={colors.success} />
                  </View>
                  <Text style={[styles.soloMetricTitle, { color: CLEAN_TEXT_MUTED }, typography.labelSmall]}>
                    {t('navigation.evaluations')}
                  </Text>
                </View>
                <Text style={[styles.soloMetricValue, { marginTop: spacing.xs, color: CLEAN_TEXT }, typography.titleMedium]}>
                  {avaliacoes.length}
                </Text>
              </LinearGradient>
            </View>
          </LinearGradient>
        </View>
      </SafeAreaView>

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: colors.error + '20', margin: padding, padding: spacing.md, borderRadius: borderRadius.md }]}>
          <Text style={[{ color: colors.error }, typography.bodySmall]}>{error}</Text>
        </View>
      )}

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <View style={styles.soloQuickHeader}>
          <Text style={[{ color: colors.primaryText }, typography.titleLarge]}>
            {t('home.smartShortcuts')}
          </Text>
          <Text style={[{ color: colors.secondaryText, marginTop: 2 }, typography.bodySmall]}>
            {t('home.smartShortcutsSubtitle')}
          </Text>
        </View>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.soloQuickGrid}
        >
          {quickActions.map((tile, index) => (
            <TouchableOpacity
              key={tile.id}
              style={[styles.soloQuickCard, index === quickActions.length - 1 ? styles.soloQuickCardLast : null]}
              onPress={tile.onPress}
              activeOpacity={0.9}
            >
              <View
                style={[
                  styles.soloQuickCardInner,
                  {
                    borderRadius: borderRadius.lg,
                    borderColor: CLEAN_BORDER,
                    backgroundColor: CLEAN_SURFACE,
                  },
                ]}
              >
                <View style={[styles.soloQuickAccentBar, { backgroundColor: tile.accent[0] }]} />
                <View style={styles.soloQuickTopRow}>
                  <View
                    style={[
                      styles.soloQuickIconWrap,
                      {
                        backgroundColor: `${tile.accent[0]}18`,
                        borderColor: `${tile.accent[1]}30`,
                      },
                    ]}
                  >
                    <Ionicons name={tile.icon as any} size={18} color={tile.accent[1]} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {tile.badgeLabel ? (
                      <View
                        style={[
                          styles.soloAiTag,
                          {
                            backgroundColor: tile.badgeBg || CLEAN_SURFACE_SOFT,
                            borderWidth: 1,
                            borderColor: `${tile.accent[1]}26`,
                          },
                        ]}
                      >
                        <Text style={[styles.soloAiTagText, { color: tile.badgeColor || tile.accent[1] }]}>
                          {tile.badgeLabel}
                        </Text>
                      </View>
                    ) : null}
                    <Ionicons name={tile.ctaIcon as any} size={14} color={CLEAN_TEXT_SOFT} />
                  </View>
                </View>
                <Text style={[styles.soloQuickLabel, { color: CLEAN_TEXT }, typography.labelMedium]}>
                  {tile.title}
                </Text>
                <Text style={[styles.soloQuickHint, { color: CLEAN_TEXT_MUTED }, typography.bodySmall]}>
                  {tile.subtitle}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <LinearGradient
          colors={CLEAN_SURFACE_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.soloCalendarPremiumCard, { borderRadius: borderRadius.lg, padding: spacing.lg, borderColor: CLEAN_BORDER }]}
        >
          <View style={styles.sectionHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.soloPersonalTitleRow}>
                <View style={[styles.soloPersonalTitleIcon, { backgroundColor: `${colors.primary}12` }]}>
                  <Ionicons name="person-outline" size={15} color={colors.primary} />
                </View>
                <Text style={[{ color: CLEAN_TEXT }, typography.titleLarge]}>Seu personal</Text>
              </View>
              <Text style={[{ color: CLEAN_TEXT, marginTop: spacing.xs }, typography.titleMedium]}>
                {personalName}
              </Text>
              <Text style={[styles.soloCalendarSubtitle, { color: CLEAN_TEXT_MUTED }, typography.bodySmall]}>
                Acompanhamento ativo, chat rápido e agenda no mesmo lugar.
              </Text>
            </View>
            {(personalProfile?.codigoPersonal || user?.codigoPersonal) ? (
              <TouchableOpacity
                style={[styles.soloCalendarOpenButton, { borderRadius: borderRadius.full, borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}
                onPress={() =>
                  router.push(
                    `/personal/profile?code=${personalProfile?.codigoPersonal ?? user?.codigoPersonal ?? ''}` as any
                  )
                }
              >
                <Ionicons name="person-outline" size={13} color={CLEAN_TEXT} />
                <Text style={[styles.soloCalendarOpenButtonText, { color: CLEAN_TEXT }, typography.labelSmall]}>Ver perfil</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={[styles.soloCalendarMetaRow, { marginTop: spacing.sm }]}>
            <View style={[styles.soloCalendarMetaChip, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Text style={[styles.soloCalendarMetaLabel, { color: CLEAN_TEXT_MUTED }]}>Código</Text>
              <Text style={[styles.soloCalendarMetaValue, { color: CLEAN_TEXT }]}>{String(personalCode)}</Text>
            </View>
            <View style={[styles.soloCalendarMetaChip, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Text style={[styles.soloCalendarMetaLabel, { color: CLEAN_TEXT_MUTED }]}>Status</Text>
              <View style={styles.soloStatusValueRow}>
                <View
                  style={[
                    styles.soloStatusDot,
                    { backgroundColor: hasPersonal ? colors.success : colors.warning },
                  ]}
                />
                <Text style={[styles.soloCalendarMetaValue, { color: CLEAN_TEXT }]}>{hasPersonal ? 'Conectado' : 'Pendente'}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.soloSectionActions, { marginTop: spacing.md }]}>
            <TouchableOpacity
              style={[styles.soloPremiumActionButton, styles.soloDarkActionButton, { borderRadius: borderRadius.md, borderColor: `${colors.primary}28`, backgroundColor: `${colors.primary}10` }]}
              onPress={handleOpenPersonalChat}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
              <Text style={[styles.soloPremiumActionText, { color: CLEAN_TEXT }]}>
                Abrir chat
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.soloPremiumActionButton, styles.soloLightActionButton, { borderRadius: borderRadius.md, borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}
              onPress={() => router.push('/personal/change-code' as any)}
            >
              <Ionicons name="create-outline" size={16} color={CLEAN_TEXT} />
              <Text style={[styles.soloPremiumActionText, { color: CLEAN_TEXT }]}>
                Alterar código
              </Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <LinearGradient
          colors={CLEAN_SURFACE_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.soloProgressPremiumCard, { borderRadius: borderRadius.lg, padding: spacing.lg, borderColor: CLEAN_BORDER }]}
        >
          <View style={styles.soloProgressPremiumHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: CLEAN_TEXT }, typography.titleLarge]}>Treino em destaque</Text>
              <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.xs }, typography.bodySmall]}>
                {treinoPrincipal
                  ? `${treinoPrincipal.nome}${treinoPrincipalHasWarning ? ' • retomar sessão' : ''}`
                  : 'Nenhum treino liberado no momento.'}
              </Text>
            </View>
            <View
              style={[
                styles.soloAiTag,
                {
                  backgroundColor: treinoConcluidoHoje
                    ? '#E8F7EE'
                    : treinoPrincipalHasWarning
                      ? '#FFF8DD'
                      : CLEAN_SURFACE_SOFT,
                },
              ]}
            >
              <Text
                style={[
                  styles.soloAiTagText,
                  {
                    color: treinoConcluidoHoje
                      ? '#1F7A63'
                      : treinoPrincipalHasWarning
                        ? '#8A6500'
                        : CLEAN_TEXT,
                  },
                ]}
              >
                {treinoConcluidoHoje
                  ? 'Concluído'
                  : treinoPrincipalHasWarning
                    ? 'Retomar'
                    : treinosDoDia.length > 0
                      ? 'Hoje'
                      : treinoPrincipal
                        ? 'Próximo'
                        : 'Aguardando'}
              </Text>
            </View>
          </View>
          <View style={[styles.soloProgressPremiumStatsRow, { marginTop: spacing.md }]}>
            <View style={[styles.soloProgressPremiumStatCard, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Text style={[styles.soloProgressPremiumStatValue, { color: CLEAN_TEXT }]}>{treinos.length}</Text>
              <Text style={[styles.soloProgressPremiumStatLabel, { color: CLEAN_TEXT_MUTED }]}>No app</Text>
            </View>
            <View style={[styles.soloProgressPremiumStatCard, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Text style={[styles.soloProgressPremiumStatValue, { color: CLEAN_TEXT }]}>{treinosDoDia.length}</Text>
              <Text style={[styles.soloProgressPremiumStatLabel, { color: CLEAN_TEXT_MUTED }]}>Hoje</Text>
            </View>
            <View style={[styles.soloProgressPremiumStatCard, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Text style={[styles.soloProgressPremiumStatValue, { color: CLEAN_TEXT }]} numberOfLines={1}>
                {treinoStatusLabel}
              </Text>
              <Text style={[styles.soloProgressPremiumStatLabel, { color: CLEAN_TEXT_MUTED }]}>Status</Text>
            </View>
          </View>
          <View
            style={{
              marginTop: spacing.md,
              borderRadius: borderRadius.md,
              borderWidth: 1,
              borderColor: CLEAN_BORDER,
              backgroundColor: CLEAN_SURFACE_ALT,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <Text style={[{ color: CLEAN_TEXT_MUTED }, typography.bodySmall]}>
              {treinoStatusDescription}
            </Text>
          </View>
          <View style={[styles.soloSectionActions, { marginTop: spacing.md }]}>
            <TouchableOpacity
              style={[styles.soloPremiumActionButton, styles.soloDarkActionButton, { borderRadius: borderRadius.md, borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}
              onPress={handleOpenWorkoutDetails}
            >
              <Ionicons name="eye-outline" size={16} color={CLEAN_TEXT} />
              <Text style={[styles.soloPremiumActionText, { color: CLEAN_TEXT }]}>
                {treinoPrincipal ? 'Abrir treino' : 'Ver todos'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.soloPremiumActionButton, styles.soloLightActionButton, { borderRadius: borderRadius.md, borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}
              onPress={handleOpenFeaturedWorkout}
            >
              <Ionicons
                name={treinoConcluidoHoje ? 'refresh-outline' : 'play-outline'}
                size={16}
                color={CLEAN_TEXT}
              />
              <Text style={[styles.soloPremiumActionText, { color: CLEAN_TEXT }]}>
                {!treinoPrincipal ? 'Ver treinos' : treinoConcluidoHoje ? 'Rever treino' : 'Iniciar agora'}
              </Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {workoutPreview.length > 0 && (
          <View style={{ marginTop: spacing.md }}>
            {workoutPreview.map((treino) => {
              const treinoStatus = getTreinoStatus(treino);
              return (
                <TouchableOpacity
                  key={treino.id}
                  style={[
                    styles.treinoCard,
                    {
                      backgroundColor: CLEAN_SURFACE,
                      borderRadius: borderRadius.lg,
                      marginBottom: spacing.md,
                      padding: spacing.md,
                      borderWidth: 1,
                      borderColor: CLEAN_BORDER,
                    },
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: '/workout/[id]',
                      params: { id: treino.id },
                    } as any)
                  }
                >
                  <View style={styles.treinoCardContent}>
                    <View
                      style={[
                        styles.treinoIcon,
                        {
                          backgroundColor: `${colors.primary}16`,
                          borderRadius: borderRadius.full,
                        },
                      ]}
                    >
                      <Ionicons name="barbell-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.treinoInfo}>
                      <Text style={[{ color: CLEAN_TEXT, flexShrink: 1 }, typography.titleMedium]} numberOfLines={1}>
                        {treino.nome}
                      </Text>
                      <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.xs }, typography.bodySmall]}>
                        {treinoStatus.label}: {treinoStatus.description}
                      </Text>
                    </View>
                    <View style={styles.treinoAction}>
                      <Ionicons name="chevron-forward" size={18} color={CLEAN_TEXT_SOFT} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <LinearGradient
          colors={CLEAN_SURFACE_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.soloProgressPremiumCard, { borderRadius: borderRadius.lg, padding: spacing.lg, borderColor: CLEAN_BORDER }]}
        >
          <View style={styles.soloProgressPremiumHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: CLEAN_TEXT }, typography.titleLarge]}>Avaliações e progresso</Text>
              <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.xs }, typography.bodySmall]}>
                {ultimaAvaliacaoDate
                  ? `Última avaliação em ${ultimaAvaliacaoLabel}. Continue acompanhando sua evolução.`
                  : 'Seu histórico de acompanhamento aparece aqui conforme novas avaliações forem criadas.'}
              </Text>
            </View>
            {notificationBadge > 0 ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push('/evaluations' as any)}
                style={[styles.soloAiPulseBadge, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}
              >
                <Ionicons name="notifications-outline" size={14} color={CLEAN_TEXT} />
                <Text style={[styles.soloAiPulseText, { color: CLEAN_TEXT }]}>{notificationBadge} novo(s)</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={[styles.soloProgressPremiumStatsRow, { marginTop: spacing.md }]}>
            <View style={[styles.soloProgressPremiumStatCard, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Text style={[styles.soloProgressPremiumStatValue, { color: CLEAN_TEXT }]}>{avaliacoes.length}</Text>
              <Text style={[styles.soloProgressPremiumStatLabel, { color: CLEAN_TEXT_MUTED }]}>Avaliações</Text>
            </View>
            <View style={[styles.soloProgressPremiumStatCard, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Text style={[styles.soloProgressPremiumStatValue, { color: CLEAN_TEXT }]}>{treinosConcluidosHoje}</Text>
              <Text style={[styles.soloProgressPremiumStatLabel, { color: CLEAN_TEXT_MUTED }]}>Concluídos hoje</Text>
            </View>
            <View style={[styles.soloProgressPremiumStatCard, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Text style={[styles.soloProgressPremiumStatValue, { color: CLEAN_TEXT }]}>{notificationBadge}</Text>
              <Text style={[styles.soloProgressPremiumStatLabel, { color: CLEAN_TEXT_MUTED }]}>Alertas</Text>
            </View>
          </View>
          <View style={[styles.soloSectionActions, { marginTop: spacing.md }]}>
            <TouchableOpacity
              style={[styles.soloPremiumActionButton, styles.soloDarkActionButton, { borderRadius: borderRadius.md, borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}
              onPress={() => router.push('/evaluations' as any)}
            >
              <Ionicons name="clipboard-outline" size={16} color={CLEAN_TEXT} />
              <Text style={[styles.soloPremiumActionText, { color: CLEAN_TEXT }]}>
                Ver avaliações
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.soloPremiumActionButton, styles.soloLightActionButton, { borderRadius: borderRadius.md, borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}
              onPress={() => router.push('/progress' as any)}
            >
              <Ionicons name="trending-up-outline" size={16} color={CLEAN_TEXT} />
              <Text style={[styles.soloPremiumActionText, { color: CLEAN_TEXT }]}>
                Meu progresso
              </Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {!hasIndividualPlan && (
        <View style={[styles.section, { paddingHorizontal: padding }]}>
          <LinearGradient
            colors={CLEAN_SURFACE_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.soloPremiumBanner, { borderRadius: borderRadius.lg, padding: spacing.lg, borderColor: CLEAN_BORDER }]}
          >
            <View style={styles.soloPlanBannerHeader}>
              <View style={[styles.soloPlanBadge, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                <Ionicons name="diamond-outline" size={14} color={colors.primary} />
                <Text style={[styles.soloPlanBadgeText, { color: CLEAN_TEXT }]}>Plano individual</Text>
              </View>
              <Text style={[styles.soloPlanPrice, { color: CLEAN_TEXT }, typography.titleMedium]}>R$ 24,99/mês</Text>
            </View>
            <Text style={[{ color: CLEAN_TEXT, marginTop: spacing.sm }, typography.titleLarge]}>
              Premium para acelerar sua rotina
            </Text>
            <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.xs }, typography.bodySmall]}>
              Libera assistente completo, analise nutricional avancada e mais autonomia mesmo fora do chat com personal.
            </Text>
            <View style={[styles.soloPlanFeatureList, { marginTop: spacing.md }]}>
              <View style={styles.soloPlanFeatureItem}>
                <Ionicons name="checkmark-circle" size={15} color={colors.primary} />
                <Text style={[styles.soloPlanFeatureText, { color: CLEAN_TEXT_MUTED }]}>Treinos e avaliações com suporte de IA</Text>
              </View>
              <View style={styles.soloPlanFeatureItem}>
                <Ionicons name="checkmark-circle" size={15} color={colors.primary} />
                <Text style={[styles.soloPlanFeatureText, { color: CLEAN_TEXT_MUTED }]}>Mais créditos diários para consultas e ajustes</Text>
              </View>
              <View style={styles.soloPlanFeatureItem}>
                <Ionicons name="checkmark-circle" size={15} color={colors.primary} />
                <Text style={[styles.soloPlanFeatureText, { color: CLEAN_TEXT_MUTED }]}>Nutricao e rotina com mais autonomia no app</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.soloPlanCtaButton, { marginTop: spacing.md, borderRadius: borderRadius.md, backgroundColor: CLEAN_SURFACE_ALT, borderWidth: 1, borderColor: CLEAN_BORDER }]}
              onPress={() => router.push('/profile/subscription' as any)}
            >
              <Ionicons name="rocket-outline" size={16} color={CLEAN_TEXT} />
              <Text style={[styles.soloPlanCtaText, { color: CLEAN_TEXT }, typography.labelMedium]}>Ativar plano individual</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      )}

    </ScrollView>
  );
}

interface PersonalHomeProps extends BaseHomeProps {
  alunos: any[];
  stats: any;
  error: string | null;
}

function PersonalHomeScreen({ padding, refreshing, onRefresh, alunos, stats, error }: PersonalHomeProps) {
  const { colors: themeColors, typography, spacing, borderRadius, isDark } = useTheme();
  const colors = useMemo(
    () => ({
      ...themeColors,
      primary: isDark ? '#87B4C7' : '#5D92A8',
      secondary: isDark ? '#6D94A8' : '#769AAE',
      tertiary: isDark ? '#96A9C4' : '#8EA6C0',
      alternate: isDark ? '#19222D' : '#EDF3F7',
      primaryText: isDark ? '#F4F7FB' : '#13212B',
      secondaryText: isDark ? '#9BAEBF' : '#60717E',
      text: isDark ? '#F4F7FB' : '#13212B',
      textSecondary: isDark ? '#9BAEBF' : '#60717E',
      textMuted: isDark ? '#7E92A4' : '#7B8B96',
      primaryBackground: isDark ? '#0C1218' : '#F5F8FA',
      secondaryBackground: isDark ? '#141D26' : '#FFFFFF',
      background: isDark ? '#0C1218' : '#F5F8FA',
      accent1: isDark ? '#4D87B4C7' : '#4D5D92A8',
      accent2: isDark ? '#4D6D94A8' : '#4D769AAE',
      accent3: isDark ? '#4D96A9C4' : '#4D8EA6C0',
      success: isDark ? '#7BA58B' : '#608D73',
      warning: isDark ? '#C69759' : '#B78346',
      error: isDark ? '#D06E61' : '#C45E54',
      info: isDark ? '#0C1218' : '#FFFFFF',
      customColor3: isDark ? '#6D94A8' : '#769AAE',
      customColor4: isDark ? '#87B4C7' : '#5D92A8',
      border: isDark ? '#253240' : '#D7E2E8',
      card: isDark ? '#141D26' : '#FFFFFF',
      surface: isDark ? '#1A2430' : '#EEF3F7',
      gradient: {
        primary: isDark ? ['#97C0D1', '#739BAF'] : ['#7EAABF', '#5D92A8'],
        secondary: isDark ? ['#1A2430', '#141D26'] : ['#F5F8FA', '#FFFFFF'],
      },
    }),
    [isDark, themeColors]
  );
  const { user, updateUser } = useAuthStore();
  const [personalCode, setPersonalCode] = useState('');
  const [notificationBadge, setNotificationBadge] = useState(0);
  const [upcomingEvaluations, setUpcomingEvaluations] = useState<Array<{
    id: string;
    studentId: string;
    nome: string;
    tipo: string;
    horario: string;
    photoUrl?: string;
    personalPhotoUrl?: string;
  }>>([]);

  const now = new Date();
  const totalAlunos = stats?.totalAlunos ?? alunos.length;
  const alunosAtivos = stats?.alunosAtivos ?? alunos.filter((aluno) => aluno.status === 'ativo').length;
  const alunosInativos = Math.max(0, totalAlunos - alunosAtivos);
  const treinosRecentes = alunos.filter((aluno) => {
    if (!aluno?.ultimoTreino) return false;
    const lastTraining = new Date(aluno.ultimoTreino);
    const diff = now.getTime() - lastTraining.getTime();
    return diff <= 1000 * 60 * 60 * 24 * 7;
  }).length;
  const frequencia = totalAlunos > 0 ? Math.round((treinosRecentes / totalAlunos) * 100) : 0;
  const alunosComTreino = alunos.filter((aluno) => (aluno?.treinosConcluidos || 0) > 0).length;
  const evolucao = totalAlunos > 0 ? Math.round((alunosComTreino / totalAlunos) * 100) : 0;
  const firstName = user?.displayName?.split(' ')[0] || 'Personal';
  const recentAlunos = alunos.slice(0, 5);
  const inviteLink = useMemo(
    () =>
      buildPersonalInviteLink(
        process.env.EXPO_PUBLIC_APP_INVITE_URL || DEFAULT_PERSONAL_INVITE_BASE,
        personalCode
      ),
    [personalCode]
  );
  const personalLandingUrl = String(process.env.EXPO_PUBLIC_WEB_LANDING_URL || '')
    .trim()
    .replace(/\/$/, '');
  const personalInviteCardText = useMemo(() => {
    if (!personalCode) {
      return 'Gerando seu código de personal. Se não aparecer em alguns segundos, abra Perfil e volte para atualizar.';
    }

    if (inviteLink) {
      return inviteLink;
    }

    if (personalLandingUrl) {
      return personalLandingUrl;
    }

    return 'Use esse código no cadastro ou no perfil do app.';
  }, [inviteLink, personalCode, personalLandingUrl]);
  const personalInviteMessage = useMemo(() => {
    if (!personalCode) return '';

    const lines = [
      'Treine comigo no MH Personal Trainer.',
      `Use meu código: ${personalCode}.`,
    ];

    if (inviteLink) {
      lines.push(inviteLink);
    } else if (personalLandingUrl) {
      lines.push(`Acesse: ${personalLandingUrl}`);
    } else {
      lines.push('Use esse código no cadastro ou no perfil do app.');
    }

    return lines.join('\n');
  }, [inviteLink, personalCode, personalLandingUrl]);
  const personalHeaderGradient = isDark
    ? (['#172331', '#101820'] as const)
    : (['#FFFFFF', '#EEF7FA'] as const);
  const personalInviteGradient = isDark
    ? (['#141D26', '#111A23'] as const)
    : (['#FFFFFF', '#F8FBFD'] as const);

  const refreshNotificationBadge = useCallback(async () => {
    if (!user?.uid) {
      setNotificationBadge(0);
      await setBadgeCount(0);
      return;
    }

    try {
      const result = await countPendingNotificationsForUser(user.uid);
      const total = Math.max(0, Number(result.data || 0));
      setNotificationBadge(total);
      await setBadgeCount(total);
    } catch (_) {
      setNotificationBadge(0);
      await setBadgeCount(0);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      void refreshNotificationBadge();
    }, [refreshNotificationBadge])
  );

  useEffect(() => {
    if (!user?.uid) {
      setPersonalCode('');
      return;
    }

    let active = true;
    firestoreService.ensurePersonalCode(user.uid)
      .then((code) => {
        if (!active) return;
        const resolved = String(code ?? user?.codigoPersonal ?? '').trim();
        setPersonalCode(resolved && resolved !== '0' ? resolved : '');
        const parsed = Number(resolved);
        if (resolved && resolved !== '0' && Number.isFinite(parsed) && parsed > 0) {
          updateUser({
            professorAccount: true,
            codigoPersonal: parsed,
          });
        }
      })
      .catch(() => {
        if (!active) return;
        const fallback = String(user?.codigoPersonal ?? '').trim();
        setPersonalCode(fallback && fallback !== '0' ? fallback : '');
      });

    return () => {
      active = false;
    };
  }, [updateUser, user?.codigoPersonal, user?.uid]);

  const handleShareInviteLink = useCallback(async () => {
    if (!personalInviteMessage) {
      showAlert('Convite do personal', 'Seu código ainda não está disponível para compartilhar.');
      return;
    }
    try {
      await Share.share({
        title: 'Convite do personal',
        message: personalInviteMessage,
        url: inviteLink || personalLandingUrl || undefined,
      });
    } catch (err: any) {
      showAlert('Convite do personal', err?.message || 'Não foi possível compartilhar agora.');
    }
  }, [inviteLink, personalInviteMessage, personalLandingUrl]);

  const formatUpcomingDate = (date: Date) => {
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startTomorrow = new Date(startToday);
    startTomorrow.setDate(startTomorrow.getDate() + 1);
    const startAfterTomorrow = new Date(startTomorrow);
    startAfterTomorrow.setDate(startAfterTomorrow.getDate() + 1);

    if (date >= startToday && date < startTomorrow) {
      return `Hoje ${format(date, 'HH:mm', { locale: ptBR })}`;
    }
    if (date >= startTomorrow && date < startAfterTomorrow) {
      return `Amanha ${format(date, 'HH:mm', { locale: ptBR })}`;
    }
    return format(date, 'dd/MM', { locale: ptBR });
  };

  useEffect(() => {
    let active = true;

    const loadUpcoming = async () => {
      if (!alunos.length) {
        if (active) setUpcomingEvaluations([]);
        return;
      }

      const result = await fetchEvaluationsForStudents(alunos.map((aluno) => aluno.id));
      if (!active) return;

      if (result.error || !result.data) {
        setUpcomingEvaluations([]);
        return;
      }

      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const studentMap = new Map(alunos.map((aluno) => [aluno.id, aluno]));

      const items: Array<{
        id: string;
        studentId: string;
        nome: string;
        tipo: string;
        horario: string;
        photoUrl?: string;
        personalPhotoUrl?: string;
        date: Date;
      }> = [];

      result.data
        .filter((evaluation) => evaluation.status !== 'cancelada')
        .forEach((evaluation) => {
          const student = studentMap.get(evaluation.userId);
          const date =
            evaluation.type === 'personalizada'
              ? (evaluation as PersonalizedEvaluation).prazoResposta || evaluation.date
              : evaluation.date;
          if (!date) return;

          items.push({
            id: `${evaluation.type}-${evaluation.id}`,
            studentId: evaluation.userId,
            nome: student?.nome || 'Aluno',
            tipo: getEvaluationTypeLabel(evaluation.type),
            horario: formatUpcomingDate(date),
            photoUrl: student?.photoUrl,
            personalPhotoUrl: student?.personalPhotoUrl,
            date,
          });
        });

      items.sort((a, b) => a.date.getTime() - b.date.getTime());

      const upcoming = items.filter((item) => item.date >= startToday).slice(0, 5);
      const fallback = items.slice(-5).reverse();
      const finalItems = (upcoming.length ? upcoming : fallback).map(({ date, ...rest }) => rest);
      setUpcomingEvaluations(finalItems);
    };

    loadUpcoming();

    return () => {
      active = false;
    };
  }, [alunos]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.primaryBackground }]}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing['3xl'] }]}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <SafeAreaView edges={['top']}>
        <View style={[styles.section, { paddingHorizontal: padding, marginTop: spacing.sm }]}>
          <LinearGradient
            colors={personalHeaderGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.personalHeaderCard,
              {
                borderColor: colors.border,
                borderRadius: borderRadius.lg,
                shadowColor: isDark ? '#000000' : '#6D94A8',
              },
            ]}
          >
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View style={[styles.personalHeaderKicker, { backgroundColor: colors.primary + '16' }]}>
                  <Ionicons name="barbell-outline" size={13} color={colors.primary} />
                  <Text style={[styles.personalHeaderKickerText, { color: colors.primary }]}>
                    Personal trainer
                  </Text>
                </View>
                <Text style={[styles.personalHeaderTitle, { color: colors.primaryText }, typography.headlineMedium]}>
                  Olá, {firstName}
                </Text>
                <Text style={[{ color: colors.secondaryText, marginTop: spacing.xs }, typography.bodySmall]}>
                  Painel do personal trainer
                </Text>
                <View style={styles.personalHeaderMetrics}>
                  <View
                    style={[
                      styles.personalHeaderMetric,
                      {
                        backgroundColor: colors.primary + '10',
                        borderColor: colors.primary + '26',
                      },
                    ]}
                  >
                    <Text style={[styles.personalHeaderMetricValue, { color: colors.primaryText }]}>
                      {alunosAtivos}/{totalAlunos}
                    </Text>
                    <Text style={[styles.personalHeaderMetricLabel, { color: colors.secondaryText }]}>ativos</Text>
                  </View>
                  <View
                    style={[
                      styles.personalHeaderMetric,
                      {
                        backgroundColor: colors.success + '12',
                        borderColor: colors.success + '28',
                      },
                    ]}
                  >
                    <Text style={[styles.personalHeaderMetricValue, { color: colors.primaryText }]}>
                      {frequencia}%
                    </Text>
                    <Text style={[styles.personalHeaderMetricLabel, { color: colors.secondaryText }]}>semana</Text>
                  </View>
                </View>
              </View>
              <View style={styles.headerRight}>
                <TouchableOpacity
                  style={[
                    styles.iconButton,
                    styles.personalHeaderIconButton,
                    {
                      backgroundColor: colors.secondaryBackground,
                      borderColor: colors.border,
                      borderRadius: borderRadius.full,
                    },
                  ]}
                  onPress={() => router.push('/notifications' as any)}
                >
                  <Ionicons name="notifications-outline" size={22} color={colors.primaryText} />
                  {notificationBadge > 0 ? (
                    <View
                      style={[
                        styles.badgeDot,
                        {
                          backgroundColor: colors.error || colors.primary,
                          borderRadius: borderRadius.full,
                        },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: '#fff' }]}>
                        {notificationBadge > 99 ? '99+' : notificationBadge}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.iconButton,
                    styles.personalHeaderIconButton,
                    {
                      backgroundColor: colors.secondaryBackground,
                      borderColor: colors.border,
                      borderRadius: borderRadius.full,
                      marginLeft: spacing.sm,
                    },
                  ]}
                  onPress={() => router.push('/profile/personal-edit' as any)}
                >
                  {user?.photoUrl ? (
                    <Image source={{ uri: user.photoUrl }} style={[styles.avatarImage, { borderRadius: borderRadius.full }]} />
                  ) : (
                    <Ionicons name="person-circle-outline" size={28} color={colors.primaryText} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </View>
      </SafeAreaView>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <LinearGradient
          colors={personalInviteGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.sectionCard,
            styles.personalDashboardCard,
            styles.personalInviteCard,
            {
              borderColor: colors.border,
              borderRadius: borderRadius.lg,
              shadowColor: isDark ? '#000000' : '#6D94A8',
            },
          ]}
        >
          <View style={styles.personalInviteHeader}>
            <View style={[styles.personalInviteHeaderIcon, { backgroundColor: colors.primary + '16' }]}>
              <Ionicons name="link-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.personalInviteHeaderText}>
              <Text style={[{ color: colors.primaryText }, typography.titleLarge]}>Link do personal</Text>
              <Text style={[{ color: colors.secondaryText, marginTop: spacing.xs }, typography.bodySmall]}>
                Compartilhe com novos alunos para eles entrarem no app usando seu código.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.iconButton,
                styles.personalInviteShareButton,
                {
                  backgroundColor: colors.primary + '12',
                  borderColor: colors.primary + '24',
                  borderRadius: borderRadius.full,
                },
              ]}
              onPress={handleShareInviteLink}
            >
              <Ionicons name="share-social-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.personalInviteCodeCard,
              {
                backgroundColor: isDark ? colors.primaryBackground : '#F4F8FB',
                borderColor: colors.primary + '26',
                borderRadius: borderRadius.md,
              },
            ]}
          >
            <View style={styles.personalInviteCodeTopRow}>
              <Text style={[styles.personalInviteCodeLabel, { color: colors.secondaryText }]}>Código do personal</Text>
              <View style={[styles.personalInviteStatusPill, { backgroundColor: colors.success + '14' }]}>
                <Ionicons name="checkmark-circle-outline" size={13} color={colors.success} />
                <Text style={[styles.personalInviteStatusText, { color: colors.success }]}>Ativo</Text>
              </View>
            </View>
            <Text style={[styles.personalInviteCodeValue, { color: colors.primaryText }]}>
              {personalCode || '--'}
            </Text>
            <View
              style={[
                styles.personalInviteLinkRow,
                {
                  backgroundColor: colors.secondaryBackground,
                  borderColor: colors.border,
                  borderRadius: borderRadius.sm,
                },
              ]}
            >
              <Ionicons name="globe-outline" size={15} color={colors.primary} />
              <Text style={[styles.personalInviteLinkText, { color: colors.secondaryText }]} numberOfLines={2}>
                {personalInviteCardText}
              </Text>
            </View>
          </View>

          <View style={styles.personalInviteActionRow}>
            <TouchableOpacity
              style={[
                styles.personalInviteActionButton,
                styles.personalInvitePrimaryButton,
                { backgroundColor: colors.primary, borderRadius: borderRadius.md },
              ]}
              onPress={handleShareInviteLink}
            >
              <Ionicons name="send-outline" size={16} color={colors.info} />
              <Text style={[styles.personalInviteActionText, { color: colors.info }]}>Compartilhar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.personalInviteActionButton,
                styles.personalInviteSecondaryButton,
                {
                  backgroundColor: colors.secondaryBackground,
                  borderColor: colors.border,
                  borderRadius: borderRadius.md,
                },
              ]}
              onPress={() => router.push({ pathname: '/personal/profile', params: { uid: user?.uid || '' } } as any)}
              disabled={!user?.uid}
            >
              <Ionicons name="person-outline" size={16} color={colors.primaryText} />
              <Text style={[styles.personalInviteSecondaryText, { color: colors.primaryText }]}>Ver perfil</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: colors.error + '20', margin: padding, padding: spacing.md, borderRadius: borderRadius.md }]}>
          <Text style={[{ color: colors.error }, typography.bodySmall]}>{error}</Text>
        </View>
      )}

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <TouchableOpacity
          style={[
            styles.sectionCard,
            styles.personalDashboardCard,
            styles.personalSummaryCard,
            {
              backgroundColor: colors.secondaryBackground,
              borderColor: colors.border,
              borderRadius: borderRadius.lg,
              shadowColor: isDark ? '#000000' : '#6D94A8',
            },
          ]}
          onPress={() => router.push('/personal/summary' as any)}
        >
          <View style={[styles.sectionHeader, styles.personalSummaryHeader]}>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: colors.primaryText }, typography.titleLarge]}>Resumo</Text>
              <Text style={[{ color: colors.secondaryText, marginTop: 2 }, typography.bodySmall]}>
                Visão geral dos alunos
              </Text>
            </View>
            <View style={[styles.personalOpenPill, { backgroundColor: colors.primary + '12' }]}>
              <Text style={[styles.personalOpenPillText, { color: colors.primary }, typography.labelMedium]}>Abrir</Text>
              <Ionicons name="chevron-forward" size={15} color={colors.primary} />
            </View>
          </View>
          <View style={[styles.summaryStatsRow, styles.personalSummaryStatsRow, { marginTop: spacing.md }]}>
            <View
              style={[
                styles.summaryStat,
                styles.personalSummaryStatCard,
                { backgroundColor: colors.primary + '10', borderColor: colors.primary + '24' },
              ]}
            >
              <Ionicons name="people-outline" size={18} color={colors.primary} />
              <Text style={[styles.personalSummaryStatValue, { color: colors.primaryText }]}>{totalAlunos}</Text>
              <Text style={[styles.personalSummaryStatLabel, { color: colors.secondaryText }]}>Total alunos</Text>
            </View>
            <View
              style={[
                styles.summaryStat,
                styles.personalSummaryStatCard,
                { backgroundColor: colors.success + '10', borderColor: colors.success + '24' },
              ]}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
              <Text style={[styles.personalSummaryStatValue, { color: colors.primaryText }]}>{alunosAtivos}</Text>
              <Text style={[styles.personalSummaryStatLabel, { color: colors.secondaryText }]}>Ativos</Text>
            </View>
            <View
              style={[
                styles.summaryStat,
                styles.personalSummaryStatCard,
                { backgroundColor: colors.tertiary + '12', borderColor: colors.tertiary + '26' },
              ]}
            >
              <Ionicons name="pause-circle-outline" size={18} color={colors.tertiary} />
              <Text style={[styles.personalSummaryStatValue, { color: colors.primaryText }]}>{alunosInativos}</Text>
              <Text style={[styles.personalSummaryStatLabel, { color: colors.secondaryText }]}>Inativos</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.actionSquare,
              styles.personalActionSquare,
              {
                backgroundColor: colors.secondaryBackground,
                borderColor: colors.border,
                borderRadius: borderRadius.lg,
              },
            ]}
            onPress={() => router.push('/(tabs)/students' as any)}
          >
            <View style={[styles.personalActionIconWrap, { backgroundColor: colors.primary + '14' }]}>
              <Ionicons name="people-outline" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.personalActionLabel, { color: colors.primaryText }, typography.labelSmall]}>
              Alunos
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.secondaryText} style={styles.personalActionChevron} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionSquare,
              styles.personalActionSquare,
              {
                backgroundColor: colors.secondaryBackground,
                borderColor: colors.border,
                borderRadius: borderRadius.lg,
              },
            ]}
            onPress={() => router.push('/evaluations/create' as any)}
          >
            <View style={[styles.personalActionIconWrap, { backgroundColor: colors.primary + '14' }]}>
              <Ionicons name="clipboard-outline" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.personalActionLabel, { color: colors.primaryText }, typography.labelSmall]}>
              Nova avaliação
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.secondaryText} style={styles.personalActionChevron} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionSquare,
              styles.personalActionSquare,
              {
                backgroundColor: colors.secondaryBackground,
                borderColor: colors.border,
                borderRadius: borderRadius.lg,
              },
            ]}
            onPress={() => router.push('/profile/subscription' as any)}
          >
            <View style={[styles.personalActionIconWrap, { backgroundColor: colors.primary + '14' }]}>
              <Ionicons name="cash-outline" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.personalActionLabel, { color: colors.primaryText }, typography.labelSmall]}>
              Assinatura
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.secondaryText} style={styles.personalActionChevron} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <View style={styles.sectionHeader}>
          <Text style={[{ color: colors.primaryText }, typography.titleLarge]}>
            Alunos recentes
          </Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/students' as any)}>
            <Text style={[{ color: colors.primary }, typography.labelMedium]}>Ver todos</Text>
          </TouchableOpacity>
        </View>
        {recentAlunos.length === 0 ? (
          <View
            style={[
              styles.emptyState,
              styles.personalEmptyState,
              {
                backgroundColor: colors.secondaryBackground,
                borderColor: colors.border,
                borderRadius: borderRadius.lg,
                padding: spacing.xl,
              },
            ]}
          >
            <Ionicons name="people-outline" size={44} color={colors.secondaryText} />
            <Text style={[{ color: colors.secondaryText, marginTop: spacing.sm, textAlign: 'center' }, typography.bodySmall]}>
              Nenhum aluno cadastrado ainda.
            </Text>
          </View>
        ) : (
          recentAlunos.map((aluno) => {
            const alunoStatus = String(aluno.status || 'ativo');
            const alunoAtivo = alunoStatus.toLowerCase() === 'ativo';

            return (
              <TouchableOpacity
                key={aluno.id}
                style={[
                  styles.alunoCard,
                  styles.personalStudentCard,
                  {
                    backgroundColor: colors.secondaryBackground,
                    borderColor: colors.border,
                    borderRadius: borderRadius.lg,
                    shadowColor: isDark ? '#000000' : '#6D94A8',
                    marginBottom: spacing.md,
                  },
                ]}
                onPress={() => router.push(`/student/${aluno.id}` as any)}
              >
                <View style={styles.alunoCardContent}>
                  <AvatarStack
                    primarySource={aluno.photoUrl}
                    primaryName={aluno.nome}
                    secondarySource={aluno.personalPhotoUrl}
                    secondaryName={aluno.nome}
                    sizePx={50}
                    accentColor={colors.primary}
                    borderColor={colors.border}
                    overlayBorderColor={colors.primaryBackground}
                  />
                  <View style={styles.alunoInfoBlock}>
                    <View style={styles.personalStudentTitleRow}>
                      <Text
                        style={[styles.personalStudentName, { color: colors.primaryText }, typography.titleMedium]}
                        numberOfLines={1}
                      >
                        {aluno.nome}
                      </Text>
                      <View
                        style={[
                          styles.personalStudentStatusChip,
                          {
                            backgroundColor: (alunoAtivo ? colors.success : colors.tertiary) + '14',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.personalStudentStatusText,
                            { color: alunoAtivo ? colors.success : colors.tertiary },
                          ]}
                        >
                          {alunoStatus}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.personalStudentMetaRow}>
                      <Ionicons name="fitness-outline" size={14} color={colors.primary} />
                      <Text style={[styles.personalStudentMetaText, { color: colors.secondaryText }]}>
                        {Number(aluno.treinosConcluidos || 0)} treinos concluídos
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <View style={[styles.sectionHeader, { marginBottom: spacing.md }]}>
          <Text style={[{ color: colors.primaryText }, typography.titleLarge]}>
            Próximas avaliações
          </Text>
          <TouchableOpacity onPress={() => router.push('/evaluations' as any)}>
            <Text style={[{ color: colors.primary }, typography.labelMedium]}>Ver todas</Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.sectionCard,
            styles.evaluationPanel,
            { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg, padding: spacing.lg },
          ]}
        >
          <View style={[styles.evaluationPanelHeader, { marginBottom: spacing.md }]}>
            <Text style={[styles.evaluationPanelTitle, { color: colors.primaryText }]}>Fila de acompanhamento</Text>
            <View style={[styles.evaluationCountChip, { backgroundColor: colors.primary + '1F' }]}>
              <Text style={[styles.evaluationCountText, { color: colors.primary }]}>{upcomingEvaluations.length}</Text>
            </View>
          </View>

          {upcomingEvaluations.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="clipboard-outline" size={40} color={colors.secondaryText} />
              <Text style={[{ color: colors.secondaryText, marginTop: spacing.sm, textAlign: 'center' }, typography.bodySmall]}>
                Nenhuma avaliação agendada no momento.
              </Text>
              <TouchableOpacity
                style={[styles.inlineButton, { backgroundColor: colors.primary, borderRadius: borderRadius.md, marginTop: spacing.md }]}
                onPress={() => router.push('/evaluations/create' as any)}
              >
                <Text style={[{ color: colors.info }, typography.labelMedium]}>Criar avaliação</Text>
              </TouchableOpacity>
            </View>
          ) : (
            upcomingEvaluations.map((avaliacao, index) => {
              const horarioNormalizado = (avaliacao.horario || '').toLowerCase();
              const isHoje = horarioNormalizado.includes('hoje');
              const isAmanha = horarioNormalizado.includes('amanha');
              const dateBg = isHoje
                ? colors.success + '20'
                : isAmanha
                  ? colors.warning + '20'
                  : colors.primary + '18';
              const dateColor = isHoje ? colors.success : isAmanha ? colors.warning : colors.primary;

              return (
                <View
                  key={avaliacao.id}
                  style={[
                    styles.evaluationCard,
                    {
                      backgroundColor: colors.primaryBackground,
                      borderColor: colors.border,
                      marginBottom: index === upcomingEvaluations.length - 1 ? 0 : spacing.md,
                    },
                  ]}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.evaluationCardTop}
                    onPress={() => router.push(`/student/${avaliacao.studentId}` as any)}
                  >
                    <AvatarStack
                      primarySource={avaliacao.photoUrl}
                      primaryName={avaliacao.nome}
                      secondarySource={avaliacao.personalPhotoUrl}
                      secondaryName={avaliacao.nome}
                      sizePx={50}
                      accentColor={colors.primary}
                      borderColor={colors.border}
                      overlayBorderColor={colors.primaryBackground}
                    />
                    <View style={styles.evaluationInfo}>
                      <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>{avaliacao.nome}</Text>
                      <View style={styles.evaluationMetaRow}>
                        <View style={[styles.evaluationTypeChip, { backgroundColor: colors.primary + '15' }]}>
                          <Text style={[styles.evaluationTypeText, { color: colors.primary }]}>{avaliacao.tipo}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.evaluationDateChip, { backgroundColor: dateBg }]}>
                      <Text style={[styles.evaluationDateText, { color: dateColor }]}>{avaliacao.horario}</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.evaluationActionRow}>
                    <TouchableOpacity
                      style={[styles.evaluationActionButton, { borderColor: colors.border, backgroundColor: colors.secondaryBackground }]}
                      onPress={() => router.push(`/student/${avaliacao.studentId}` as any)}
                    >
                      <Ionicons name="person-outline" size={14} color={colors.primaryText} />
                      <Text style={[styles.evaluationActionText, { color: colors.primaryText }]}>Abrir aluno</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.evaluationActionButton, { borderColor: colors.primary, backgroundColor: colors.primary + '16' }]}
                      onPress={() => router.push(`/evaluations/create?studentId=${avaliacao.studentId}` as any)}
                    >
                      <Ionicons name="add-circle-outline" size={14} color={colors.primary} />
                      <Text style={[styles.evaluationActionText, { color: colors.primary }]}>Nova avaliação</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>

      <View style={[styles.section, { paddingHorizontal: padding, paddingBottom: spacing['3xl'] }]}>
        <Text style={[{ color: colors.primaryText, marginBottom: spacing.md }, typography.titleLarge]}>
          Desempenho dos alunos
        </Text>
        <View style={styles.performanceRow}>
          <View style={[styles.performanceCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}>
            <Text style={[styles.performanceValue, { color: colors.success }]}>{alunosAtivos > 0 && totalAlunos > 0 ? Math.round((alunosAtivos / totalAlunos) * 100) : 0}%</Text>
            <Text style={[styles.performanceLabel, { color: colors.secondaryText }]}>Meta atingida</Text>
          </View>
          <View style={[styles.performanceCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}>
            <Text style={[styles.performanceValue, { color: colors.primary }]}>{frequencia}%</Text>
            <Text style={[styles.performanceLabel, { color: colors.secondaryText }]}>Frequencia</Text>
          </View>
          <View style={[styles.performanceCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}>
            <Text style={[styles.performanceValue, { color: colors.tertiary }]}>{evolucao}%</Text>
            <Text style={[styles.performanceLabel, { color: colors.secondaryText }]}>Evolucao</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

interface AdminHomeProps extends BaseHomeProps {
  overview: any;
  error: string | null;
}

function AdminHomeScreen({ padding, refreshing, onRefresh, overview, error }: AdminHomeProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();

  const quickActions = [
    { id: '1', title: 'Usuarios', icon: 'people', color: colors.primary, route: '/admin/users' },
    { id: '2', title: 'Admin dashboard', icon: 'analytics', color: colors.secondary, route: '/admin/dashboard' },
    { id: '3', title: 'Gerenciar alunos', icon: 'school', color: colors.success, route: '/admin/manage-students' },
    { id: '4', title: 'Notificações', icon: 'notifications', color: colors.warning, route: '/notifications' },
  ];

  const handleRecentUserPress = (user: AdminUserSummary) => {
    if (user.role === 'aluno') {
      router.push(`/admin/student/${user.id}` as any);
      return;
    }

    if (user.role === 'personal') {
      const codigoPersonal = String(user.codigoPersonal || '').trim();
      router.push(
        codigoPersonal
          ? ({
              pathname: '/personal/profile',
              params: { code: codigoPersonal },
            } as any)
          : ({
              pathname: '/personal/profile',
              params: { uid: user.id },
            } as any)
      );
      return;
    }

    showAlert(
      'Perfil indisponivel',
      'Ainda nao existe uma tela de visualizacao para perfis admin.'
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.primaryBackground }]}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <SafeAreaView edges={['top']}>
        <View style={[styles.adminHeader, { padding }]}>
          <Text style={[{ color: colors.primaryText }, typography.headlineMedium]}>
            Painel admin
          </Text>
          <Text style={[{ color: colors.secondaryText, marginTop: spacing.xs }, typography.bodyMedium]}>
            Visão geral e ações rápidas
          </Text>
        </View>
      </SafeAreaView>

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: colors.error + '20', margin: padding, padding: spacing.md, borderRadius: borderRadius.md }]}>
          <Text style={[{ color: colors.error }, typography.bodySmall]}>{error}</Text>
        </View>
      )}

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <Text style={[{ color: colors.primaryText, marginBottom: spacing.md }, typography.titleLarge]}>
          Resumo
        </Text>
        <View style={[styles.actionsGrid, { gap: spacing.md }]}>
          <Card style={{ width: '48%' }}>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>
              {overview?.totalUsers ?? 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Usuarios</Text>
          </Card>
          <Card style={{ width: '48%' }}>
            <Text style={[styles.summaryValue, { color: colors.tertiary }]}>
              {overview?.totalAlunos ?? 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Alunos</Text>
          </Card>
          <Card style={{ width: '48%' }}>
            <Text style={[styles.summaryValue, { color: colors.success }]}>
              {overview?.totalPersonals ?? 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Personals</Text>
          </Card>
          <Card style={{ width: '48%' }}>
            <Text style={[styles.summaryValue, { color: colors.warning }]}>
              {overview?.totalAdmins ?? 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Admins</Text>
          </Card>
        </View>
      </View>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <Text style={[{ color: colors.primaryText, marginBottom: spacing.md }, typography.titleLarge]}>
          Ações rápidas
        </Text>
        <View style={[styles.actionsGrid, { gap: spacing.md }]}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={[
                styles.actionCard,
                {
                  backgroundColor: colors.secondaryBackground,
                  borderRadius: borderRadius.lg,
                  width: '48%',
                },
              ]}
              onPress={() => router.push(action.route as any)}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: action.color + '20', borderRadius: borderRadius.md }]}>
                <Ionicons name={action.icon as any} size={28} color={action.color} />
              </View>
              <Text style={[{ color: colors.primaryText, marginTop: spacing.sm, textAlign: 'center' }, typography.labelMedium]}>
                {action.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.section, { paddingHorizontal: padding, paddingBottom: spacing['3xl'] }]}>
        <Text style={[{ color: colors.primaryText, marginBottom: spacing.md }, typography.titleLarge]}>
          Usuarios recentes
        </Text>
        {overview?.recentUsers?.length ? (
          overview.recentUsers.slice(0, 6).map((user: AdminUserSummary) => (
            <Card
              key={user.id}
              style={{ marginBottom: spacing.md }}
              onPress={() => handleRecentUserPress(user)}
            >
              <View style={styles.recentUserRow}>
                <View style={styles.recentUserInfo}>
                  <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>{user.name}</Text>
                  <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>{user.email}</Text>
                </View>
                <View style={styles.recentUserRight}>
                  <View style={styles.recentUserMeta}>
                    <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>{user.role}</Text>
                    {user.createdAt && (
                      <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
                        {format(user.createdAt, 'dd/MM/yyyy', { locale: ptBR })}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
                </View>
              </View>
            </Card>
          ))
        ) : (
          <View style={[styles.emptyState, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg, padding: spacing.xl }]}>
            <Ionicons name="people-outline" size={48} color={colors.secondaryText} />
            <Text style={[{ color: colors.secondaryText, marginTop: spacing.md, textAlign: 'center' }, typography.bodyMedium]}>
              Nenhum usuário encontrado.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function ChatGPTPlanHomeScreen({ padding, refreshing, onRefresh }: BaseHomeProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { user } = useAuthStore();

  const planActions = [
    { id: 'avaliacao', title: 'Avaliação completa', icon: 'analytics', route: '/evaluations/create' },
    { id: 'assistente', title: 'Assistente', icon: 'sparkles', route: '/chat/ai' },
    { id: 'treinos', title: 'Treinos populares', icon: 'barbell', route: '/workout/categories' },
    { id: 'perfil', title: 'Meu perfil', icon: 'person', route: '/(tabs)/profile' },
  ];

  const popularWorkouts = ['Hipertrofia', 'Emagrecimento', 'Resistencia', 'Mobilidade'];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.primaryBackground }]}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <SafeAreaView edges={['top']}>
        <View style={[styles.section, { paddingHorizontal: padding }]}>
          <View style={[styles.sectionCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg, padding: spacing.lg }]}>
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <Text style={[{ color: colors.primaryText }, typography.headlineMedium]}>
                  Bem-vindo ao MH Personal Trainer
                </Text>
                <Text style={[{ color: colors.secondaryText, marginTop: spacing.xs }, typography.bodyMedium]}>
                  Descubra treinos personalizados e recursos exclusivos
                </Text>
              </View>
              <View style={styles.headerRight}>
                <TouchableOpacity
                  style={[styles.iconButton, { backgroundColor: colors.primaryBackground, borderRadius: borderRadius.full }]}
                  onPress={() => router.push('/profile/edit' as any)}
                >
                  {user?.photoUrl ? (
                    <Image source={{ uri: user.photoUrl }} style={[styles.avatarImage, { borderRadius: borderRadius.full }]} />
                  ) : (
                    <Ionicons name="person-circle-outline" size={28} color={colors.primaryText} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <Text style={[{ color: colors.primaryText, marginBottom: spacing.md }, typography.titleLarge]}>
          Funções
        </Text>
        <View style={styles.planActionsRow}>
          {planActions.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={[styles.actionSquare, styles.planActionSquare, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}
              onPress={() => router.push(action.route as any)}
            >
              <Ionicons name={action.icon as any} size={26} color={colors.primary} />
              <Text style={[{ color: colors.primaryText, marginTop: spacing.sm, textAlign: 'center' }, typography.labelSmall]}>
                {action.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <Text style={[{ color: colors.primaryText, marginBottom: spacing.md }, typography.titleLarge]}>
          Treinos populares
        </Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg, padding: spacing.lg }]}>
          <View style={styles.chipRow}>
            {popularWorkouts.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.chip, { backgroundColor: colors.primaryBackground, borderRadius: borderRadius.full }]}
                onPress={() => router.push('/workout/categories' as any)}
              >
                <Text style={[{ color: colors.primaryText }, typography.labelSmall]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={[styles.section, { paddingHorizontal: padding, paddingBottom: spacing['3xl'] }]}>
        <TouchableOpacity
          style={[styles.sectionCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg, padding: spacing.lg }]}
          onPress={() => router.push('/profile/subscription' as any)}
        >
          <Text style={[{ color: colors.primaryText }, typography.titleLarge]}>
            Fazer upgrade para Premium
          </Text>
          <Text style={[{ color: colors.secondaryText, marginTop: spacing.xs }, typography.bodySmall]}>
            Desbloqueie recursos completos do app
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function SuspendedHomeScreen({ padding, refreshing, onRefresh }: BaseHomeProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.primaryBackground }]}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <SafeAreaView edges={['top']}>
        <View style={[styles.section, { paddingHorizontal: padding }]}>
          <View style={[styles.sectionCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg, padding: spacing.lg }]}>
            <Text style={[{ color: colors.primaryText }, typography.headlineMedium]}>
              Acesso suspenso
            </Text>
            <Text style={[{ color: colors.secondaryText, marginTop: spacing.sm }, typography.bodyMedium]}>
              Entre em contato com o suporte para regularizar sua conta.
            </Text>
            <Button
              title="Falar com suporte"
              onPress={() => router.push('/support' as any)}
              size="large"
              style={{ marginTop: spacing.lg }}
            />
          </View>
        </View>
      </SafeAreaView>
    </ScrollView>
  );
}

function NoPersonalHomeScreen({ padding, refreshing, onRefresh }: BaseHomeProps) {
  const { colors, typography, spacing } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.primaryBackground }]}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <SafeAreaView edges={['top']}>
        <View style={[styles.section, { paddingHorizontal: padding }]}>
          <Text style={[{ color: colors.primaryText }, typography.headlineMedium]}>
            Você ainda não tem personal
          </Text>
          <Text style={[{ color: colors.secondaryText, marginTop: spacing.sm }, typography.bodyMedium]}>
            Para desbloquear treinos e avaliações, conecte-se a um personal.
          </Text>
        </View>
      </SafeAreaView>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <Card>
          <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>Como liberar o acesso</Text>
          <Text style={[{ color: colors.secondaryText, marginTop: spacing.sm }, typography.bodySmall]}>
            1. Peça o código do seu personal.
          </Text>
          <Text style={[{ color: colors.secondaryText, marginTop: spacing.xs }, typography.bodySmall]}>
            2. Adicione o código no seu perfil.
          </Text>
          <Text style={[{ color: colors.secondaryText, marginTop: spacing.xs }, typography.bodySmall]}>
            3. Aguarde a confirmacao no app.
          </Text>
          <Button
            title="Adicionar código"
            onPress={() => router.push('/personal/change-code' as any)}
            size="large"
            style={{ marginTop: spacing.lg }}
          />
        </Card>
      </View>
    </ScrollView>
  );
}

interface SoloAlunoHomeProps extends BaseHomeProps {
  noPersonalFlow: boolean;
  treinos: any[];
  avaliacoes: any[];
}

function SoloAlunoHomeScreen({ padding, refreshing, onRefresh, noPersonalFlow, treinos, avaliacoes }: SoloAlunoHomeProps) {
  const { colors, typography, spacing, borderRadius, isDark } = useTheme();
  const { user } = useAuthStore();
  const pathname = usePathname();
  const aiAccess = useAiAccessStatus();
  const cleanPalette = getCleanPalette(isDark);
  const {
    surface: CLEAN_SURFACE,
    surfaceAlt: CLEAN_SURFACE_ALT,
    surfaceSoft: CLEAN_SURFACE_SOFT,
    border: CLEAN_BORDER,
    text: CLEAN_TEXT,
    textMuted: CLEAN_TEXT_MUTED,
    textSoft: CLEAN_TEXT_SOFT,
    surfaceGradient: CLEAN_SURFACE_GRADIENT,
    surfaceAltGradient: CLEAN_SURFACE_ALT_GRADIENT,
  } = cleanPalette;

  const [waterCups, setWaterCups] = useState(0);
  const [kcalGoal, setKcalGoal] = useState(SOLO_DAILY_KCAL_GOAL);
  const [stepsGoal, setStepsGoal] = useState(SOLO_DAILY_STEPS_GOAL);
  const [stepsToday, setStepsToday] = useState(0);
  const [pedometerAvailable, setPedometerAvailable] = useState(false);
  const [meals, setMeals] = useState<SoloMealEntry[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [nutritionFormOpen, setNutritionFormOpen] = useState(false);
  const [bodyCheckinOpen, setBodyCheckinOpen] = useState(false);
  const [mealLoading, setMealLoading] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [heightInput, setHeightInput] = useState('');
  const [goalInput, setGoalInput] = useState('');
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  const [bodyCheckinLoading, setBodyCheckinLoading] = useState(false);
  const [foodCatalog, setFoodCatalog] = useState<SoloFoodCatalogItem[]>([]);
  const [foodCatalogLoading, setFoodCatalogLoading] = useState(false);
  const [foodCatalogUpdatedAt, setFoodCatalogUpdatedAt] = useState<Date | null>(null);
  const [foodAiSearchLoading, setFoodAiSearchLoading] = useState(false);
  const [foodSearchTerm, setFoodSearchTerm] = useState('');
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<SoloFoodCatalogItem[]>([]);
  const lastFoodSearchRequestRef = useRef('');
  const seedCatalogInitializedRef = useRef(false);
  const communityCatalogLoadedRef = useRef(false);
  const pedometerBaseStepsRef = useRef(0);
  const pedometerLiveOffsetRef = useRef(0);
  const [selectedDateKey, setSelectedDateKey] = useState(toDateKey(new Date()));
  const [aiPlanner, setAiPlanner] = useState<SoloAiPlannerSnapshot>({ suggestions: [] });
  const [aiPlannerLoading, setAiPlannerLoading] = useState(false);
  const [aiNoticeQueue, setAiNoticeQueue] = useState<SoloAiSuggestion[]>([]);
  const [aiNoticeActive, setAiNoticeActive] = useState<SoloAiSuggestion | null>(null);
  const [aiNoticeOpen, setAiNoticeOpen] = useState(false);
  const [aiNoticeSelectedDateKey, setAiNoticeSelectedDateKey] = useState(toDateKey(new Date()));
  const [aiEvaluationGenerating, setAiEvaluationGenerating] = useState(false);
  const [pendingPayments, setPendingPayments] = useState<PaymentRecord[]>([]);
  const currentPathRef = useRef(pathname);

  useEffect(() => {
    currentPathRef.current = pathname;
  }, [pathname]);

  const dateKey = toDateKey(new Date());
  const storageKey = user?.uid ? `${SOLO_HOME_STORAGE_PREFIX}:${user.uid}:${dateKey}` : null;
  const foodCatalogStorageKey = user?.uid ? `${SOLO_FOOD_CATALOG_STORAGE_PREFIX}:${user.uid}` : null;
  const userRecord = (user || {}) as Record<string, any>;
  const firstName = user?.displayName?.split(' ')[0] || 'Aluno';
  const hasIndividualPlan = Boolean(user?.planoChatGPT || aiAccess.premium);
  const subscriptionStatusValue = String(
    userRecord.stripeSubscriptionStatus ||
      userRecord.subscriptionStatus ||
      userRecord.statusAssinatura ||
      userRecord.assinaturaStatus ||
      ''
  )
    .trim()
    .toLowerCase();
  const subscriptionStatusLabel = formatSubscriptionStatusLabel(
    subscriptionStatusValue || (hasIndividualPlan ? 'active' : '')
  );
  const subscriptionRenewalValue =
    userRecord.currentPeriodEnd ||
    userRecord.current_period_end ||
    userRecord.renovacao ||
    userRecord.renovacaoAssinatura;
  const subscriptionRenewalLabel = formatSubscriptionDateLabel(subscriptionRenewalValue);
  const subscriptionAmountValue =
    userRecord.planAmount ||
    userRecord.subscriptionAmount ||
    userRecord.amount ||
    userRecord.valorAssinatura;
  const subscriptionAmountLabel = formatSubscriptionAmountLabel(
    subscriptionAmountValue,
    userRecord.currency || userRecord.planCurrency || 'BRL'
  );
  const hasSubscriptionMeta = Boolean(
    hasIndividualPlan &&
      (
        subscriptionStatusValue ||
        subscriptionRenewalValue ||
        subscriptionAmountValue ||
        userRecord.subscribeId
      )
  );
  const aiDailyLimit = aiAccess.dailyLimit || FREE_DAILY_AI_CREDITS;
  const aiRemaining = aiAccess.loading ? aiDailyLimit : aiAccess.remaining ?? aiDailyLimit;
  const personalizedTargets = useMemo(
    () =>
      estimatePersonalizedDailyTargets({
        weightKg: parseWeightKg(weightInput) ?? parseWeightKg(user?.peso),
        heightCm: parseHeightCm(heightInput) ?? parseHeightCm(user?.altura),
        goalText: goalInput.trim() || String(user?.objetivoNoApp || ''),
      }),
    [weightInput, heightInput, goalInput, user?.peso, user?.altura, user?.objetivoNoApp]
  );
  const waterGoal = personalizedTargets.waterCupsGoal;
  const waterProgress = waterGoal > 0 ? Math.min(100, Math.round((waterCups / waterGoal) * 100)) : 0;
  const stepsProgress = stepsGoal > 0 ? Math.min(100, Math.round((stepsToday / stepsGoal) * 100)) : 0;
  const kcalConsumed = meals.reduce((sum, meal) => sum + meal.kcal, 0);
  const proteinConsumed = meals.reduce((sum, meal) => sum + parseMacroValue(meal.protein), 0);
  const carbsConsumed = meals.reduce((sum, meal) => sum + parseMacroValue(meal.carbs), 0);
  const fatConsumed = meals.reduce((sum, meal) => sum + parseMacroValue(meal.fat), 0);
  const kcalProgress = kcalGoal > 0 ? Math.min(100, Math.round((kcalConsumed / kcalGoal) * 100)) : 0;
  const walkingDistanceKm = ((stepsToday * 0.75) / 1000).toFixed(2);
  const walkingCalories = Math.round(stepsToday * 0.045);
  const aiUnreadSuggestionsCount = aiPlanner.suggestions.filter((item) => item.unread).length;
  const lastAiReviewDate = aiPlanner.lastReviewAt ? toDateSafe(aiPlanner.lastReviewAt) : null;
  const nextAiSuggestion = useMemo(() => {
    return [...aiPlanner.suggestions]
      .sort((a, b) => {
        const left = toDateSafe(a.dateKey)?.getTime() || 0;
        const right = toDateSafe(b.dateKey)?.getTime() || 0;
        return left - right;
      })
      .find((suggestion) => {
        const date = toDateSafe(suggestion.dateKey);
        return !!date;
      });
  }, [aiPlanner.suggestions]);
  const completedWorkoutsThisWeek = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    return (Array.isArray(treinos) ? treinos : []).reduce((total, treino) => {
      const doneAt = toDateSafe(treino?.lastCompletedAt);
      if (!doneAt) return total;
      return doneAt >= weekAgo ? total + 1 : total;
    }, 0);
  }, [treinos]);
  const totalEvaluations = Array.isArray(avaliacoes) ? avaliacoes.length : 0;
  const latestEvaluationRecord = useMemo(() => {
    const list = Array.isArray(avaliacoes) ? avaliacoes : [];
    return [...list]
      .map((item) => ({
        raw: item,
        date: toDateSafe(item?.data || item?.date || item?.createdAt || item?.updatedAt),
      }))
      .filter((item) => !!item.date)
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))[0];
  }, [avaliacoes]);
  const latestEvaluationDate = latestEvaluationRecord?.date || null;
  const pendingEvaluationRecord = useMemo(() => {
    const list = Array.isArray(avaliacoes) ? avaliacoes : [];
    const pendingStatuses = new Set(['pendente', 'agendada', 'em_andamento']);
    return list.find((item) => pendingStatuses.has(String(item?.status || '').toLowerCase()));
  }, [avaliacoes]);
  const foodSearchTokens = useMemo(() => tokenizeFoodSearch(foodSearchTerm), [foodSearchTerm]);
  const filteredFoodCatalog = useMemo(() => {
    const source = Array.isArray(foodCatalog) ? foodCatalog : [];
    return source
      .filter((food) => foodMatchesTokens(food, foodSearchTokens))
      .sort((left, right) => buildFoodSearchRank(right, foodSearchTokens) - buildFoodSearchRank(left, foodSearchTokens));
  }, [foodCatalog, foodSearchTokens]);
  const visibleFoodCatalog = useMemo(
    () => filteredFoodCatalog.slice(0, foodSearchTerm.trim().length > 0 ? 60 : 20),
    [filteredFoodCatalog, foodSearchTerm]
  );
  const selectedEstimatedKcal = useMemo(
    () =>
      selectedCatalogItems.reduce((sum, item) => {
        return sum + Math.max(0, Number(item.kcalPer100g || 0));
      }, 0),
    [selectedCatalogItems]
  );
  const cleanSurfaceGradient = [CLEAN_SURFACE, CLEAN_SURFACE, CLEAN_SURFACE] as const;
  const cleanSurfaceAltGradient = [CLEAN_SURFACE_ALT, CLEAN_SURFACE_ALT, CLEAN_SURFACE_ALT] as const;
  const calendarDays = useMemo(() => {
    return Array.from({ length: SOLO_CALENDAR_DAYS }, (_, offset) => {
      const day = new Date();
      day.setDate(day.getDate() + offset);
      return {
        id: `${toDateKey(day)}-${offset}`,
        key: toDateKey(day),
        date: day,
        label: format(day, 'EEE', { locale: ptBR }).replace('.', '').slice(0, 3),
        day: format(day, 'dd', { locale: ptBR }),
        fullLabel: format(day, "EEEE, dd 'de' MMMM", { locale: ptBR }),
      };
    });
  }, []);
  const visibleCalendarKeys = useMemo(() => new Set(calendarDays.map((day) => day.key)), [calendarDays]);

  useEffect(() => {
    setKcalGoal((previous) => {
      if (previous === personalizedTargets.kcalGoal) return previous;
      return personalizedTargets.kcalGoal;
    });
  }, [personalizedTargets.kcalGoal]);

  useEffect(() => {
    let active = true;
    const loadSnapshot = async () => {
      if (!storageKey) {
        if (active) {
          setWaterCups(0);
          setMeals([]);
          setStepsGoal(SOLO_DAILY_STEPS_GOAL);
          setStepsToday(0);
          setWeightInput(() => {
            const parsed = parseWeightKg(user?.peso);
            return parsed !== null ? String(Math.round(parsed * 10) / 10) : '';
          });
          setHeightInput(() => {
            const parsed = parseHeightCm(user?.altura);
            return parsed !== null ? String(Math.round(parsed)) : '';
          });
          setGoalInput(user?.objetivoNoApp || '');
          setGoalPickerOpen(false);
          setStorageReady(true);
        }
        return;
      }

      setStorageReady(false);
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!active) return;
        if (!raw) {
          setWaterCups(0);
          setMeals([]);
          setStepsGoal(SOLO_DAILY_STEPS_GOAL);
          setStepsToday(0);
          setWeightInput(() => {
            const parsed = parseWeightKg(user?.peso);
            return parsed !== null ? String(Math.round(parsed * 10) / 10) : '';
          });
          setHeightInput(() => {
            const parsed = parseHeightCm(user?.altura);
            return parsed !== null ? String(Math.round(parsed)) : '';
          });
          setGoalInput(user?.objetivoNoApp || '');
          setGoalPickerOpen(false);
          return;
        }
        const parsed = JSON.parse(raw) as Partial<SoloHomeSnapshot>;
        setWaterCups(Math.max(0, Math.min(24, Number(parsed.waterCups || 0))));
        setStepsGoal(Math.max(2000, Math.min(30000, Number(parsed.stepsGoal || SOLO_DAILY_STEPS_GOAL))));
        setStepsToday(Math.max(0, Number(parsed.stepsToday || 0)));
        setMeals(Array.isArray(parsed.meals) ? parsed.meals.slice(0, 25) : []);
        setWeightInput(() => {
          const parsedWeight =
            parsed.latestWeightKg !== undefined ? parseWeightKg(parsed.latestWeightKg) : parseWeightKg(user?.peso);
          return parsedWeight !== null ? String(Math.round(parsedWeight * 10) / 10) : '';
        });
        setHeightInput(() => {
          const parsedHeight =
            parsed.latestHeightCm !== undefined ? parseHeightCm(parsed.latestHeightCm) : parseHeightCm(user?.altura);
          return parsedHeight !== null ? String(Math.round(parsedHeight)) : '';
        });
        setGoalInput(parsed.latestGoal || user?.objetivoNoApp || '');
        setGoalPickerOpen(false);
      } catch (_) {
        if (!active) return;
        setWaterCups(0);
        setMeals([]);
        setStepsGoal(SOLO_DAILY_STEPS_GOAL);
        setStepsToday(0);
        setWeightInput(() => {
          const parsed = parseWeightKg(user?.peso);
          return parsed !== null ? String(Math.round(parsed * 10) / 10) : '';
        });
        setHeightInput(() => {
          const parsed = parseHeightCm(user?.altura);
          return parsed !== null ? String(Math.round(parsed)) : '';
        });
        setGoalInput(user?.objetivoNoApp || '');
        setGoalPickerOpen(false);
      } finally {
        if (active) {
          setStorageReady(true);
        }
      }
    };
    loadSnapshot();
    return () => {
      active = false;
    };
  }, [storageKey, user?.peso, user?.altura, user?.objetivoNoApp]);

  useEffect(() => {
    if (!storageReady || !storageKey) return;
    const payload: SoloHomeSnapshot = {
      waterCups,
      stepsGoal,
      stepsToday,
      meals,
      latestWeightKg: parseWeightKg(weightInput) || undefined,
      latestHeightCm: parseHeightCm(heightInput) || undefined,
      latestGoal: goalInput.trim() || undefined,
    };
    AsyncStorage.setItem(storageKey, JSON.stringify(payload)).catch(() => undefined);
  }, [storageReady, storageKey, waterCups, stepsGoal, stepsToday, meals, weightInput, heightInput, goalInput]);

  useEffect(() => {
    let active = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let watchSubscription: { remove: () => void } | null = null;
    let appStateSubscription: { remove: () => void } | null = null;
    let firstWatchValue: number | null = null;

    pedometerBaseStepsRef.current = 0;
    pedometerLiveOffsetRef.current = 0;

    const syncStepsFromDevice = async () => {
      try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const now = new Date();
        const result = await Pedometer.getStepCountAsync(startOfDay, now);
        const baseSteps = Math.max(0, Number(result?.steps || 0));
        pedometerBaseStepsRef.current = baseSteps;
        if (active) {
          setStepsToday((prev) => Math.max(prev, baseSteps + pedometerLiveOffsetRef.current));
        }
      } catch (_) {
        // alguns devices nao suportam query historica, segue com watchStepCount
      }
    };

    const startPedometer = async () => {
      try {
        const currentPermission = await Pedometer.getPermissionsAsync();
        let grantedPermission = currentPermission;
        if (!currentPermission.granted && currentPermission.canAskAgain) {
          grantedPermission = await Pedometer.requestPermissionsAsync();
        }
        if (!active) return;
        if (!grantedPermission.granted) {
          setPedometerAvailable(false);
          return;
        }

        const available = await Pedometer.isAvailableAsync();
        if (!active) return;
        setPedometerAvailable(Boolean(available));
        if (!available) return;

        await syncStepsFromDevice();

        watchSubscription = Pedometer.watchStepCount((payload) => {
          const value = Math.max(0, Number(payload?.steps || 0));
          if (firstWatchValue === null) {
            firstWatchValue = value;
            return;
          }
          const delta = Math.max(0, value - firstWatchValue);
          pedometerLiveOffsetRef.current = Math.max(pedometerLiveOffsetRef.current, delta);
          if (active) {
            setStepsToday((prev) => Math.max(prev, pedometerBaseStepsRef.current + pedometerLiveOffsetRef.current));
          }
        });

        intervalId = setInterval(() => {
          void syncStepsFromDevice();
        }, 15000);

        appStateSubscription = AppState.addEventListener('change', (status) => {
          if (status === 'active') {
            void syncStepsFromDevice();
          }
        });
      } catch (_) {
        if (active) {
          setPedometerAvailable(false);
        }
      }
    };

    void startPedometer();

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
      if (watchSubscription) watchSubscription.remove();
      if (appStateSubscription) appStateSubscription.remove();
    };
  }, [dateKey]);

  useEffect(() => {
    if (!visibleCalendarKeys.has(selectedDateKey) && calendarDays.length > 0) {
      setSelectedDateKey(calendarDays[0].key);
    }
  }, [visibleCalendarKeys, selectedDateKey, calendarDays]);

  useEffect(() => {
    let active = true;
    const loadFoodCatalog = async () => {
      if (!foodCatalogStorageKey) {
        if (active) {
          setFoodCatalog(mergeFoodCatalogItems([], SOLO_FAMOUS_PRODUCTS_SEED, { popularityBoost: 6, source: 'base' }));
          setFoodCatalogUpdatedAt(null);
        }
        return;
      }
      try {
        const raw = await AsyncStorage.getItem(foodCatalogStorageKey);
        if (!active) return;
        if (!raw) {
          setFoodCatalog(mergeFoodCatalogItems([], SOLO_FAMOUS_PRODUCTS_SEED, { popularityBoost: 6, source: 'base' }));
          setFoodCatalogUpdatedAt(null);
          return;
        }
        const parsed = JSON.parse(raw) as SoloFoodCatalogSnapshot;
        const storedItems = Array.isArray(parsed.items) ? parsed.items.slice(0, SOLO_FOOD_CACHE_LIMIT) : [];
        setFoodCatalog(
          mergeFoodCatalogItems(storedItems, SOLO_FAMOUS_PRODUCTS_SEED, { popularityBoost: 6, source: 'base' })
        );
        setFoodCatalogUpdatedAt(toDateSafe(parsed.updatedAt));
      } catch (_) {
        if (active) {
          setFoodCatalog(mergeFoodCatalogItems([], SOLO_FAMOUS_PRODUCTS_SEED, { popularityBoost: 6, source: 'base' }));
          setFoodCatalogUpdatedAt(null);
        }
      }
    };
    loadFoodCatalog();
    return () => {
      active = false;
    };
  }, [foodCatalogStorageKey]);

  useEffect(() => {
    if (!foodCatalogStorageKey) return;
    AsyncStorage.setItem(
      foodCatalogStorageKey,
      JSON.stringify({ items: foodCatalog, updatedAt: foodCatalogUpdatedAt?.toISOString() })
    ).catch(() => undefined);
  }, [foodCatalogStorageKey, foodCatalog, foodCatalogUpdatedAt]);

  useEffect(() => {
    if (seedCatalogInitializedRef.current) return;
    seedCatalogInitializedRef.current = true;
    setFoodCatalog((prev) => mergeFoodCatalogItems(prev, SOLO_FAMOUS_PRODUCTS_SEED, { popularityBoost: 8, source: 'base' }));
    setFoodCatalogUpdatedAt((prev) => prev || new Date());
  }, []);

  const loadCommunityPopularFoods = useCallback(async () => {
    if (communityCatalogLoadedRef.current) return;
    communityCatalogLoadedRef.current = true;
    setFoodCatalogLoading(true);
    try {
      const db = getFirebaseDb();
      const snapshot = await getDocs(
        query(collection(db, SOLO_SHARED_FOOD_COLLECTION), orderBy('popularity', 'desc'), limit(140))
      );
      const items: SoloFoodCatalogItem[] = snapshot.docs
        .map((item) => {
          const data = item.data() as any;
          const name = String(data?.name || '').trim();
          if (!name) return null;
          return {
            id: item.id || buildFoodItemId(name, 'community-food'),
            name,
            category: String(data?.category || 'geral').trim(),
            kcalPer100g: Math.max(0, Math.round(Number(data?.kcalPer100g || 0))),
            proteinPer100g: parseMacroValue(data?.proteinPer100g),
            carbsPer100g: parseMacroValue(data?.carbsPer100g),
            fatPer100g: parseMacroValue(data?.fatPer100g),
            imageUrl: data?.imageUrl || buildFoodImageUrl(name),
            popularity: Math.max(1, Number(data?.popularity || data?.searchHits || 1)),
            lastSeenAt: toDateSafe(data?.updatedAt)?.toISOString(),
            source: 'community' as const,
          };
        })
        .filter(Boolean) as SoloFoodCatalogItem[];
      if (items.length > 0) {
        setFoodCatalog((prev) => mergeFoodCatalogItems(prev, items, { popularityBoost: 2, source: 'community' }));
        setFoodCatalogUpdatedAt(new Date());
      }
    } catch (_) {
      // fallback silencioso: segue com cache local + seed
    } finally {
      setFoodCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    void loadCommunityPopularFoods();
  }, [loadCommunityPopularFoods, user?.uid]);

  const fetchAiPlannerData = useCallback(async () => {
    if (!user?.uid) {
      setAiPlanner({ suggestions: [] });
      return;
    }
    setAiPlannerLoading(true);
    try {
      const db = getFirebaseDb();
      const metaRef = doc(db, 'users', user.uid, 'automation', 'aiPlanner');
      const metaSnap = await getDoc(metaRef);
      const metaData = metaSnap.exists() ? metaSnap.data() : {};

      const suggestionsRef = collection(db, 'users', user.uid, 'aiPlannerSuggestions');
      const suggestionsQuery = query(
        suggestionsRef,
        orderBy('scheduledDate', 'asc'),
        limit(SOLO_AI_SUGGESTIONS_LIMIT)
      );
      const suggestionsSnap = await getDocs(suggestionsQuery);
      const mapped: SoloAiSuggestion[] = suggestionsSnap.docs.map((item) => {
        const data = item.data() as any;
        const scheduledDate = toDateSafe(data.scheduledDate) || toDateSafe(data.createdAt) || new Date();
        const createdAt = toDateSafe(data.createdAt) || scheduledDate;
        const evaluationTypeRaw = String(data.evaluationType || '').toLowerCase();
        const evaluationType =
          evaluationTypeRaw === 'personalizada' ||
          evaluationTypeRaw === 'postural' ||
          evaluationTypeRaw === 'fisica' ||
          evaluationTypeRaw === 'online'
            ? evaluationTypeRaw
            : undefined;
        return {
          id: item.id,
          type: data.type === 'avaliacao' ? 'avaliacao' : 'treino',
          title: String(data.title || 'Sugestao IA').trim(),
          summary: String(data.summary || data.subtitle || '').trim(),
          dateKey: String(data.dateKey || toDateKey(scheduledDate)),
          createdAt: createdAt.toISOString(),
          reason: data.reason === 'weekly' ? 'weekly' : 'workout',
          unread: Boolean(data.unread),
          evaluationId: data.evaluationId ? String(data.evaluationId) : undefined,
          evaluationType,
        };
      });

      const unreadQueue = [...mapped]
        .filter((item) => item.unread)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      setAiPlanner({
        lastReviewAt: toDateSafe(metaData?.lastReviewAt)?.toISOString(),
        lastWorkoutCompletionAt: toDateSafe(metaData?.lastWorkoutCompletedAt)?.toISOString(),
        suggestions: mapped,
      });
      setAiNoticeQueue(unreadQueue);
      if (!aiNoticeOpen && !aiNoticeActive && unreadQueue.length > 0) {
        setAiNoticeActive(unreadQueue[0]);
        setAiNoticeOpen(true);
      }
    } catch (error) {
      console.error('Erro ao carregar sugestoes da IA:', error);
    } finally {
      setAiPlannerLoading(false);
    }
  }, [user?.uid, aiNoticeOpen, aiNoticeActive]);

  const fetchPendingPayments = useCallback(async () => {
    if (!user?.uid) {
      setPendingPayments([]);
      return;
    }
    try {
      const result = await fetchPaymentsForUser(user.uid);
      const list = Array.isArray(result.data) ? result.data : [];
      setPendingPayments(list.filter((item) => isBillingPending(item)));
    } catch (error) {
      console.error('Erro ao carregar faturas do calendario:', error);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      void fetchAiPlannerData();
      void fetchPendingPayments();
    }, [fetchAiPlannerData, fetchPendingPayments])
  );

  useEffect(() => {
    if (!aiNoticeActive) return;
    const fallbackDate = calendarDays[0]?.key || toDateKey(new Date());
    const nextDateKey =
      aiNoticeActive.dateKey && visibleCalendarKeys.has(aiNoticeActive.dateKey)
        ? aiNoticeActive.dateKey
        : fallbackDate;
    setAiNoticeSelectedDateKey(nextDateKey);
  }, [aiNoticeActive, visibleCalendarKeys, calendarDays]);

  const consumeAiNoticeQueue = useCallback((consumedId: string) => {
    setAiNoticeQueue((prev) => {
      const rest = prev.filter((item) => item.id !== consumedId);
      if (rest.length > 0) {
        setAiNoticeActive(rest[0]);
        setAiNoticeOpen(true);
      } else {
        setAiNoticeActive(null);
        setAiNoticeOpen(false);
      }
      return rest;
    });
  }, []);

  const handleCloseAiNotice = useCallback(async () => {
    const current = aiNoticeActive;
    if (!current || !user?.uid) {
      setAiNoticeOpen(false);
      return;
    }
    try {
      const db = getFirebaseDb();
      const suggestionRef = doc(db, 'users', user.uid, 'aiPlannerSuggestions', current.id);
      await updateDoc(suggestionRef, {
        unread: false,
        readAt: new Date(),
      });
      setAiPlanner((prev) => ({
        ...prev,
        suggestions: prev.suggestions.map((item) =>
          item.id === current.id ? { ...item, unread: false } : item
        ),
      }));
    } catch (error) {
      console.error('Erro ao marcar aviso de IA como lido:', error);
    } finally {
      consumeAiNoticeQueue(current.id);
    }
  }, [aiNoticeActive, consumeAiNoticeQueue, user?.uid]);

  const handleScheduleAiNotice = useCallback(async () => {
    const current = aiNoticeActive;
    if (!current || !user?.uid) {
      setAiNoticeOpen(false);
      return;
    }

    const selectedKey =
      aiNoticeSelectedDateKey && visibleCalendarKeys.has(aiNoticeSelectedDateKey)
        ? aiNoticeSelectedDateKey
        : current.dateKey;
    const scheduledDate = dateFromDateKey(selectedKey);

    try {
      const db = getFirebaseDb();
      const suggestionRef = doc(db, 'users', user.uid, 'aiPlannerSuggestions', current.id);
      await updateDoc(suggestionRef, {
        dateKey: selectedKey,
        scheduledDate,
        unread: false,
        readAt: new Date(),
      });

      setAiPlanner((prev) => ({
        ...prev,
        suggestions: prev.suggestions.map((item) =>
          item.id === current.id
            ? { ...item, dateKey: selectedKey, unread: false }
            : item
        ),
      }));
      setSelectedDateKey(selectedKey);
      if (current.type === 'avaliacao') {
        if (current.evaluationId) {
          router.push({
            pathname: '/evaluations/[id]',
            params: {
              id: current.evaluationId,
              type: current.evaluationType || 'personalizada',
              userId: user.uid,
            },
          } as any);
        } else {
          router.push('/evaluations' as any);
        }
      } else {
        router.push('/schedule' as any);
      }
    } catch (error: any) {
      showAlert('Agenda IA', error?.message || 'Não foi possível agendar essa sugestão agora.');
    } finally {
      consumeAiNoticeQueue(current.id);
    }
  }, [
    aiNoticeActive,
    aiNoticeSelectedDateKey,
    consumeAiNoticeQueue,
    user?.uid,
    visibleCalendarKeys,
  ]);

  const handleGenerateAiEvaluation = useCallback(async () => {
    if (!user?.uid) return;
    if (aiEvaluationGenerating) return;

    if (pendingEvaluationRecord?.id) {
      showAlert(
        'Avaliação IA',
        'Você já tem uma avaliação pendente para realizar.',
        [
          { text: 'Depois', style: 'cancel' },
          {
            text: 'Abrir avaliação',
            onPress: () =>
              router.push({
                pathname: '/evaluations/[id]',
                params: {
                  id: pendingEvaluationRecord.id,
                  type: pendingEvaluationRecord.type || 'personalizada',
                  userId: pendingEvaluationRecord.userId || user.uid,
                },
              } as any),
          },
        ]
      );
      return;
    }

    const evaluationNeed = resolveAiEvaluationNeed({
      lastEvaluationAt: latestEvaluationDate,
      completedWorkoutsLast7d: completedWorkoutsThisWeek,
      totalEvaluations,
    });
    if (!evaluationNeed.needed) {
      const nextWindowText = evaluationNeed.nextWindowDays
        ? `Nova recomendacao estimada em ${evaluationNeed.nextWindowDays} dia(s).`
        : '';
      showAlert(
        'Avaliação IA',
        `${evaluationNeed.reason}${nextWindowText ? ` ${nextWindowText}` : ''}`
      );
      return;
    }

    setAiEvaluationGenerating(true);
    try {
      const now = new Date();
      const todayKey = toDateKey(now);
      const latestMeal = meals[0];
      const defaultTitle = 'Avaliação IA de progresso';
      const defaultSummary =
        'A IA preparou sua avaliação personalizada para ajustar treino, carga e foco da semana.';
      const defaultQuestions = buildSoloAiEvaluationQuestions(
        goalInput.trim() || user?.objetivoNoApp || ''
      );

      let title = defaultTitle;
      let summary = defaultSummary;
      let generatedQuestions: EvaluationQuestion[] = defaultQuestions;

      try {
        const prompt = [
          'Você é um avaliador físico esportivo do app MH Personal.',
          'Crie uma avaliação curta e objetiva para o aluno com base nos dados abaixo.',
          'Retorne apenas JSON valido no formato:',
          '{"title":"...","summary":"...","questions":[{"pergunta":"...","tipo":"texto|escala|sim_nao|multipla_escolha","opcoes":["..."],"obrigatoria":true}]}',
          'Regras:',
          '- title com no maximo 45 caracteres.',
          '- summary com no maximo 150 caracteres.',
          '- gere entre 4 e 6 perguntas objetivas.',
          '- se tipo for multipla_escolha, inclua opcoes.',
          '- texto em portugues do Brasil.',
          '',
          `Passos hoje: ${stepsToday}`,
          `Meta de passos: ${stepsGoal}`,
          `Kcal hoje: ${kcalConsumed}/${kcalGoal}`,
          `Agua hoje: ${waterCups}/${waterGoal} copos`,
          `Treinos concluidos ultimos 7 dias: ${completedWorkoutsThisWeek}`,
          `Avaliações existentes: ${totalEvaluations}`,
          `Motivo da recomendacao: ${evaluationNeed.reason}`,
          `Última refeição: ${latestMeal?.description || 'não registrada'}`,
          `Objetivo principal: ${goalInput || user?.objetivoNoApp || 'não informado'}`,
        ].join('\n');
        const raw = await generateText(prompt);
        const parsed = extractFirstJsonObject(raw) as any;
        const aiTitle = String(parsed?.title || '').trim();
        const aiSummary = String(parsed?.summary || '').trim();
        if (aiTitle) title = aiTitle.slice(0, 45);
        if (aiSummary) summary = aiSummary.slice(0, 150);
        const parsedQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
        if (parsedQuestions.length > 0) {
          generatedQuestions = parsedQuestions
            .map((question: any, index: number) => {
              const tipoRaw = String(question?.tipo || '').trim().toLowerCase();
              const tipo: EvaluationQuestion['tipo'] =
                tipoRaw === 'escala' || tipoRaw === 'sim_nao' || tipoRaw === 'multipla_escolha'
                  ? tipoRaw
                  : 'texto';
              const pergunta = String(question?.pergunta || '').trim();
              if (!pergunta) return null;
              const opcoes = Array.isArray(question?.opcoes)
                ? question.opcoes
                    .map((item: any) => String(item || '').trim())
                    .filter((item: string) => item.length > 0)
                    .slice(0, 6)
                : [];
              return {
                id: `mh-ai-q-${now.getTime()}-${index}`,
                pergunta,
                tipo,
                opcoes: tipo === 'multipla_escolha' ? opcoes : undefined,
                obrigatoria: question?.obrigatoria !== false,
              } as EvaluationQuestion;
            })
            .filter(Boolean) as EvaluationQuestion[];
        }
      } catch (_) {
        // fallback local para nao bloquear o fluxo caso IA externa falhe
      }

      if (!generatedQuestions.length) {
        generatedQuestions = defaultQuestions;
      }

      const personalizedEvaluation = await createPersonalizedEvaluation({
        type: 'personalizada',
        userId: user.uid,
        date: now,
        status: 'pendente',
        perguntas: generatedQuestions,
        respostas: [],
        prazoResposta: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        resultado: summary,
        recomendacoes: [
          'Realize esta avaliação em ambiente calmo e com foco.',
          'Responda com sinceridade para a IA ajustar seu plano com precisao.',
        ],
      });
      if (personalizedEvaluation.error || !personalizedEvaluation.data?.id) {
        throw new Error(personalizedEvaluation.error || 'Não foi possível criar a avaliação.');
      }

      const db = getFirebaseDb();
      await addDoc(collection(db, 'users', user.uid, 'aiPlannerSuggestions'), {
        type: 'avaliacao',
        title,
        summary,
        reason: 'weekly',
        unread: true,
        dateKey: todayKey,
        scheduledDate: now,
        evaluationId: personalizedEvaluation.data.id,
        evaluationType: 'personalizada',
        createdAt: now,
        status: 'ready',
        source: 'solo-home',
      });
      await setDoc(
        doc(db, 'users', user.uid, 'automation', 'aiPlanner'),
        {
          lastReviewAt: now,
          lastManualEvaluationRequestAt: now,
        },
        { merge: true }
      );

      await fetchAiPlannerData();
      showAlert(
        'Avaliação IA pronta',
        'Sua avaliação personalizada foi criada. Você pode realizá-la agora.',
        [
          { text: 'Depois', style: 'cancel' },
          {
            text: 'Realizar agora',
            onPress: () =>
              router.push({
                pathname: '/evaluations/[id]',
                params: {
                  id: personalizedEvaluation.data!.id,
                  type: 'personalizada',
                  userId: user.uid,
                },
              } as any),
          },
        ]
      );
    } catch (error: any) {
      showAlert('Avaliação IA', error?.message || 'Não foi possível gerar a avaliação agora.');
    } finally {
      setAiEvaluationGenerating(false);
    }
  }, [
    user?.uid,
    user?.objetivoNoApp,
    aiEvaluationGenerating,
    stepsToday,
    stepsGoal,
    kcalConsumed,
    kcalGoal,
    waterCups,
    waterGoal,
    completedWorkoutsThisWeek,
    totalEvaluations,
    latestEvaluationDate,
    pendingEvaluationRecord,
    router,
    meals,
    goalInput,
    fetchAiPlannerData,
  ]);

  const handleOpenProgress = useCallback(() => {
    const initialPath = currentPathRef.current;
    let firstError: unknown = null;
    try {
      router.push('/progress' as any);
    } catch (error) {
      firstError = error;
    }

    setTimeout(() => {
      if (currentPathRef.current !== initialPath) return;
      try {
        router.replace('/progress/index' as any);
      } catch (secondError: any) {
        setTimeout(() => {
          if (currentPathRef.current !== initialPath) return;
          const progressUrl = ExpoLinking.createURL('/progress');
          ExpoLinking.openURL(progressUrl).catch(() => {
            if (!firstError) return;
            const firstMessage =
              firstError instanceof Error ? firstError.message : 'Falha ao abrir progresso';
            const secondMessage =
              secondError?.message || 'Sem detalhes adicionais.';
            showAlert('Navegacao', `${firstMessage}\n${secondMessage}`);
          });
        }, 90);
      }
    }, 80);
  }, []);

  const calendarEvents = useMemo(() => {
    const events: SoloCalendarEvent[] = [];
    const treinosList = Array.isArray(treinos) ? treinos : [];
    const avaliacoesList = Array.isArray(avaliacoes) ? avaliacoes : [];

    treinosList.forEach((treino, index) => {
      const treinoName = treino?.nome || treino?.nomeDoTreino || `Treino ${index + 1}`;
      calendarDays.forEach((day) => {
        if (workoutMatchesWeekday(treino?.diasDaSemana, day.date)) {
          events.push({
            id: `week-${treino?.id || index}-${day.key}`,
            type: 'treino',
            title: treinoName,
            subtitle: 'Treino programado',
            dateKey: day.key,
            source: 'base',
            workoutId: treino?.id,
          });
        }
      });

      const completedAt = toDateSafe(treino?.lastCompletedAt);
      if (completedAt) {
        const completedKey = toDateKey(completedAt);
        if (visibleCalendarKeys.has(completedKey)) {
          events.push({
            id: `done-${treino?.id || index}-${completedKey}`,
            type: 'treino',
            title: treinoName,
            subtitle: 'Treino concluído',
            dateKey: completedKey,
            source: 'base',
            workoutId: treino?.id,
          });
        }
      }
    });

    avaliacoesList.forEach((avaliacao, index) => {
      const date = toDateSafe(avaliacao?.data || avaliacao?.date);
      if (!date) return;
      const dayKey = toDateKey(date);
      if (!visibleCalendarKeys.has(dayKey)) return;
      events.push({
        id: `eval-${avaliacao?.id || index}-${dayKey}`,
        type: 'avaliacao',
        title: `Avaliação ${String(avaliacao?.tipo || '').trim() || ''}`.trim(),
        subtitle: 'Avaliação registrada',
        dateKey: dayKey,
        source: 'base',
        evaluationId: avaliacao?.id,
      });
    });

    pendingPayments.forEach((payment, index) => {
      const dueDay = Number(payment.todoDiaDoMes || payment.diaDoPagamento || 0);
      if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) return;
      calendarDays.forEach((day) => {
        if (day.date.getDate() !== dueDay) return;
        events.push({
          id: `invoice-${payment.id || index}-${day.key}`,
          type: 'fatura',
          title: sanitizeBillingTitle(payment.descricao),
          subtitle: 'Vencimento da assinatura • toque para antecipar',
          dateKey: day.key,
          source: 'financeiro',
          paymentId: payment.id,
          checkoutUrl: payment.checkoutUrl,
        });
      });
    });

    aiPlanner.suggestions.forEach((suggestion) => {
      if (!visibleCalendarKeys.has(suggestion.dateKey)) return;
      events.push({
        id: suggestion.id,
        type: suggestion.type,
        title: suggestion.title,
        subtitle: suggestion.summary,
        dateKey: suggestion.dateKey,
        source: 'ai',
        evaluationId: suggestion.evaluationId,
        evaluationType: suggestion.evaluationType,
      });
    });

    return events;
  }, [treinos, avaliacoes, calendarDays, visibleCalendarKeys, aiPlanner.suggestions, pendingPayments]);

  const eventsByDay = useMemo(() => {
    return calendarEvents.reduce<Record<string, SoloCalendarEvent[]>>((acc, event) => {
      if (!acc[event.dateKey]) acc[event.dateKey] = [];
      acc[event.dateKey].push(event);
      return acc;
    }, {});
  }, [calendarEvents]);

  const selectedDayEvents = eventsByDay[selectedDateKey] || [];
  const selectedDayLabel =
    calendarDays.find((item) => item.key === selectedDateKey)?.fullLabel || "hoje";
  const weeklyEventsCount = useMemo(
    () => Object.values(eventsByDay).reduce((total, dayEvents) => total + (Array.isArray(dayEvents) ? dayEvents.length : 0), 0),
    [eventsByDay]
  );

  const handleOpenAgenda = useCallback(() => {
    router.push('/schedule' as any);
  }, []);

  const handleCalendarEventPress = useCallback(
    (event: SoloCalendarEvent) => {
      if (event.type === 'fatura') {
        router.push('/financeiro/aluno' as any);
        return;
      }

      if (event.type === 'treino') {
        if (event.source === 'ai') {
          router.push('/chat/ai' as any);
          return;
        }
        if (event.workoutId) {
          router.push(`/workout/${event.workoutId}` as any);
          return;
        }
        router.push('/(tabs)/workouts' as any);
        return;
      }

      if (event.type === 'avaliacao') {
        if (event.evaluationId && user?.uid) {
          router.push({
            pathname: '/evaluations/[id]',
            params: {
              id: event.evaluationId,
              type: event.evaluationType || inferAiEvaluationType(event.title, event.subtitle) || 'personalizada',
              userId: user.uid,
            },
          } as any);
          return;
        }
        if (event.evaluationId) {
          router.push('/evaluations' as any);
          return;
        }
        if (event.source === 'ai') {
          showAlert(
            'Avaliação IA',
            'Essa sugestão ainda não possui uma avaliação pronta para realizar. Gere uma nova avaliação IA no card de progresso.'
          );
          return;
        }
        router.push('/evaluations' as any);
      }
    },
    [user?.uid]
  );

  const quickActions = [
    {
      id: 'calendar',
      title: 'Calendário',
      subtitle: 'Ver agenda da semana',
      icon: 'calendar-outline',
      ctaIcon: 'arrow-forward',
      accent: ['#4CC9F0', '#2563EB'],
      onPress: handleOpenAgenda,
    },
    {
      id: 'assistant',
      title: 'MH Assistente',
      subtitle: 'Conversar com IA',
      icon: 'sparkles-outline',
      ctaIcon: 'arrow-forward',
      accent: ['#A78BFA', '#4F46E5'],
      onPress: () => router.push('/chat/ai' as any),
    },
    {
      id: 'workout',
      title: 'Treino IA',
      subtitle: 'Atualizar treino agora',
      icon: 'barbell-outline',
      ctaIcon: 'arrow-forward',
      accent: ['#22D3EE', '#0E7490'],
      onPress: () => router.push('/chat/ai' as any),
    },
    {
      id: 'evaluation',
      title: 'Avaliações',
      subtitle: 'Histórico e progresso',
      icon: 'analytics-outline',
      ctaIcon: 'arrow-forward',
      accent: [DARK_MODE_ACCENT_ALT, DARK_MODE_ACCENT_DEEP],
      onPress: () => router.push('/evaluations' as any),
    },
    {
      id: 'food',
      title: 'Comida',
      subtitle: 'Registrar refeição',
      icon: 'restaurant-outline',
      ctaIcon: 'arrow-forward',
      accent: ['#FDBA74', '#EA580C'],
      onPress: () => setNutritionFormOpen(true),
    },
    {
      id: 'water',
      title: '+1 copo',
      subtitle: `Hidratacao ${waterCups}/${waterGoal}`,
      icon: 'water-outline',
      ctaIcon: 'add',
      accent: [DARK_MODE_ACCENT, DARK_MODE_ACCENT_DEEP],
      onPress: () => setWaterCups((prev) => Math.min(24, prev + 1)),
    },
  ] as const;

  const handleToggleFoodItem = useCallback((food: SoloFoodCatalogItem) => {
    setSelectedCatalogItems((prev) => {
      const exists = prev.some((item) => item.id === food.id);
      if (exists) {
        return prev.filter((item) => item.id !== food.id);
      }
      return [...prev, food].slice(0, 12);
    });
    setFoodCatalog((prev) =>
      prev.map((item) => {
        if (item.id !== food.id) return item;
        return {
          ...item,
          popularity: Math.max(1, Number(item.popularity || 0) + 1),
          lastSeenAt: new Date().toISOString(),
        };
      })
    );
  }, []);

  const analyzeMealWithAi = async (description: string): Promise<SoloMealAnalysis> => {
    const weight = parseWeightKg(weightInput) ?? parseWeightKg(user?.peso) ?? undefined;
    const height = parseHeightCm(heightInput) ?? parseHeightCm(user?.altura) ?? undefined;
    const goal = goalInput.trim() || user?.objetivoNoApp || 'evolução geral';

    const prompt = [
      'Você é um nutricionista esportivo do app MH Personal.',
      'Analise a refeição e retorne apenas JSON válido.',
      'Formato esperado:',
      '{',
      '  "foods":[{"name":"", "portion":"", "kcal":0, "protein":0, "carbs":0, "fat":0}],',
      '  "totals":{"kcal":0, "protein":0, "carbs":0, "fat":0},',
      '  "notes":"resumo curto para o aluno"',
      '}',
      'Regras:',
      '- Liste os alimentos/produtos identificados na refeição com porção estimada.',
      '- Use valores realistas por item.',
      '- Totals devem ser a soma dos itens.',
      '- Responda somente JSON.',
      '',
      `Aluno peso: ${weight || 'não informado'} kg`,
      `Aluno altura: ${height || 'não informado'} cm`,
      `Meta do aluno: ${goal}`,
      `Refeição: ${description}`,
    ].join('\n');

    const raw = await generateText(prompt);
    const parsed = extractFirstJsonObject(raw) as any;
    if (!parsed) {
      throw new Error('A IA não conseguiu analisar essa refeição.');
    }

    const foodsRaw: any[] = Array.isArray(parsed.foods) ? parsed.foods : [];
    const foods: SoloMealFood[] = foodsRaw
      .map((item: any, index: number) => ({
        name: String(item?.name || `Item ${index + 1}`).trim(),
        portion: String(item?.portion || item?.porcao || 'porcao media').trim(),
        kcal: Math.max(0, Math.round(Number(item?.kcal || 0))),
        protein: parseMacroValue(item?.protein),
        carbs: parseMacroValue(item?.carbs),
        fat: parseMacroValue(item?.fat),
        imageUrl: buildFoodImageUrl(String(item?.name || `Item ${index + 1}`)),
      }))
      .filter((item: SoloMealFood) => item.name.length > 0)
      .slice(0, 12);

    const fallbackKcal = foods.reduce((sum: number, item: SoloMealFood) => sum + item.kcal, 0);
    const fallbackProtein = foods.reduce((sum: number, item: SoloMealFood) => sum + item.protein, 0);
    const fallbackCarbs = foods.reduce((sum: number, item: SoloMealFood) => sum + item.carbs, 0);
    const fallbackFat = foods.reduce((sum: number, item: SoloMealFood) => sum + item.fat, 0);

    const totals = {
      kcal: Math.max(0, Math.round(Number(parsed?.totals?.kcal || fallbackKcal))),
      protein: parseMacroValue(parsed?.totals?.protein ?? fallbackProtein),
      carbs: parseMacroValue(parsed?.totals?.carbs ?? fallbackCarbs),
      fat: parseMacroValue(parsed?.totals?.fat ?? fallbackFat),
    };

    return {
      foods,
      totals,
      notes: String(parsed?.notes || '').trim(),
      source: 'ai',
    };
  };

  const loadCommunitySearchMatches = useCallback(async (searchTerm: string) => {
    const searchTokens = tokenizeFoodSearch(searchTerm);
    if (!searchTokens.length) return [] as SoloFoodCatalogItem[];
    const db = getFirebaseDb();
    const snapshot = await getDocs(
      query(collection(db, SOLO_SHARED_FOOD_COLLECTION), orderBy('popularity', 'desc'), limit(180))
    );
    return snapshot.docs
      .map((item) => {
        const data = item.data() as any;
        const name = String(data?.name || '').trim();
        if (!name) return null;
        const mapped: SoloFoodCatalogItem = {
          id: item.id || buildFoodItemId(name, 'community-search'),
          name,
          category: String(data?.category || 'geral').trim(),
          kcalPer100g: Math.max(0, Math.round(Number(data?.kcalPer100g || 0))),
          proteinPer100g: parseMacroValue(data?.proteinPer100g),
          carbsPer100g: parseMacroValue(data?.carbsPer100g),
          fatPer100g: parseMacroValue(data?.fatPer100g),
          imageUrl: data?.imageUrl || buildFoodImageUrl(name),
          popularity: Math.max(1, Number(data?.popularity || data?.searchHits || 1)),
          source: 'community',
          lastSeenAt: toDateSafe(data?.updatedAt)?.toISOString(),
        };
        return foodMatchesTokens(mapped, searchTokens) ? mapped : null;
      })
      .filter(Boolean)
      .slice(0, 80) as SoloFoodCatalogItem[];
  }, []);

  const saveSearchKnowledge = useCallback(async (searchTerm: string, items: SoloFoodCatalogItem[]) => {
    if (!items.length) return;
    const db = getFirebaseDb();
    const normalizedTerm = normalizeFoodNameKey(searchTerm);
    const writeResults = await Promise.allSettled(
      items.slice(0, 32).map(async (item) => {
        const docId = buildStableFoodDocId(item.name);
        const itemRef = doc(db, SOLO_SHARED_FOOD_COLLECTION, docId);
        await setDoc(
          itemRef,
          {
            name: item.name,
            category: item.category,
            kcalPer100g: item.kcalPer100g,
            proteinPer100g: item.proteinPer100g,
            carbsPer100g: item.carbsPer100g,
            fatPer100g: item.fatPer100g,
            imageUrl: item.imageUrl || buildFoodImageUrl(item.name),
            popularity: increment(1),
            searchHits: increment(1),
            updatedAt: new Date(),
            lastSearchTerm: searchTerm,
          },
          { merge: true }
        );
      })
    );
    const hasRemoteWrite = writeResults.some((result) => result.status === 'fulfilled');
    if (!hasRemoteWrite) {
      console.warn('[solo-food] Nenhum item de aprendizado foi salvo remotamente.');
      return;
    }

    if (!normalizedTerm) return;
    try {
      const searchRef = doc(db, `${SOLO_SHARED_FOOD_COLLECTION}_queries`, normalizedTerm);
      const searchSnap = await getDoc(searchRef);
      const count = searchSnap.exists() ? Number((searchSnap.data() as any)?.count || 0) + 1 : 1;
      await setDoc(
        searchRef,
        {
          term: searchTerm,
          count,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    } catch (_) {
      // falha de telemetria nao bloqueia UX
    }
  }, []);

  const requestFoodsFromPublicSearch = useCallback(async (searchTerm: string) => {
    const url = `https://br.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
      searchTerm
    )}&search_simple=1&action=process&json=1&page_size=120&fields=product_name,product_name_pt,brands,categories,categories_pt,countries,countries_tags,lang,lc,nutriments,image_front_url,image_url`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Não foi possível consultar os produtos agora.');
    }
    const payload = await response.json();
    const products: any[] = Array.isArray(payload?.products) ? payload.products : [];
    const termTokens = tokenizeFoodSearch(searchTerm);
    return products
      .map((product: any) => {
        const productNamePt = String(product?.product_name_pt || '').trim();
        const productName = String(product?.product_name || '').trim();
        const baseName = productNamePt || productName;
        const countriesTags: string[] = Array.isArray(product?.countries_tags)
          ? product.countries_tags.map((item: any) => String(item || '').toLowerCase())
          : [];
        const countriesRaw = String(product?.countries || '').toLowerCase();
        const lang = String(product?.lang || product?.lc || '').toLowerCase();
        const isBrazil = countriesTags.includes('en:brazil') || countriesRaw.includes('brasil') || countriesRaw.includes('brazil');
        const isSpanish = lang.startsWith('es');
        if (!isBrazil || isSpanish) return null;
        const searchableName = normalizeSearchText(baseName);
        if (termTokens.length > 0 && !termTokens.every((token) => searchableName.includes(token))) {
          return null;
        }
        const categoryPt = String(product?.categories_pt || '').split(',')[0]?.trim();
        const categoryRaw = String(product?.categories || '').split(',')[0]?.trim();
        if (!baseName) return null;
        const brandRaw = String(product?.brands || '').split(',')[0]?.trim();
        const name = brandRaw ? `${baseName} - ${brandRaw}` : baseName;
        const categories = categoryPt || categoryRaw || 'geral';
        const nutriments = product?.nutriments || {};
        const kcal =
          Number(nutriments?.['energy-kcal_100g']) ||
          Number(nutriments?.energy_kcal_100g) ||
          Number(nutriments?.['energy-kcal']) ||
          (Number(nutriments?.energy_100g) > 0 ? Number(nutriments?.energy_100g) / 4.184 : 0);
        return {
          id: buildFoodItemId(name, 'food-public'),
          name,
          category: categories || 'geral',
          kcalPer100g: Math.max(0, Math.round(Number(kcal || 0))),
          proteinPer100g: parseMacroValue(nutriments?.proteins_100g),
          carbsPer100g: parseMacroValue(nutriments?.carbohydrates_100g),
          fatPer100g: parseMacroValue(nutriments?.fat_100g),
          imageUrl: String(product?.image_front_url || product?.image_url || '').trim() || buildFoodImageUrl(name),
          popularity: 3,
          source: 'community' as const,
          lastSeenAt: new Date().toISOString(),
        };
      })
      .filter(Boolean)
      .slice(0, 80) as SoloFoodCatalogItem[];
  }, []);

  const handleSearchFoodWithAi = useCallback(async (forceAi: boolean = false) => {
    const searchTerm = foodSearchTerm.trim();
    if (!searchTerm) {
      showAlert('Busca de alimentos', 'Digite um produto para buscar.');
      return;
    }
    if (foodAiSearchLoading) return;
    const searchTokens = tokenizeFoodSearch(searchTerm);

    const normalizedRequest = `${normalizeFoodNameKey(searchTerm)}:${forceAi ? '1' : '0'}`;
    if (!forceAi && lastFoodSearchRequestRef.current === normalizedRequest) {
      const alreadyHasVisibleResults = foodCatalog.some((item) => foodMatchesTokens(item, searchTokens));
      if (alreadyHasVisibleResults) {
        return;
      }
    }

    setFoodAiSearchLoading(true);
    try {
      const localMatchesCount = foodCatalog.filter((item) => foodMatchesTokens(item, searchTokens)).length;
      const communityItems = localMatchesCount >= SOLO_FOOD_SEARCH_MIN_ITEMS && !forceAi
        ? []
        : await loadCommunitySearchMatches(searchTerm);

      if (communityItems.length > 0) {
        setFoodCatalog((prev) => mergeFoodCatalogItems(prev, communityItems, { popularityBoost: 2, source: 'community' }));
      }

      const cachedCount = localMatchesCount + communityItems.length;
      // Sempre busca mais resultados externos para enriquecer o catalogo,
      // mesmo quando ja existem itens locais para o termo.
      const shouldCallPublicSearch = forceAi || searchTerm.trim().length >= 2;
      let publicItems: SoloFoodCatalogItem[] = [];

      if (shouldCallPublicSearch) {
        publicItems = await requestFoodsFromPublicSearch(searchTerm);
        if (publicItems.length > 0) {
          setFoodCatalog((prev) => mergeFoodCatalogItems(prev, publicItems, { popularityBoost: 4, source: 'community' }));
          void saveSearchKnowledge(searchTerm, publicItems);
        }
      }

      if (cachedCount === 0 && communityItems.length === 0 && publicItems.length === 0) {
        showAlert('Busca de alimentos', 'Nenhum produto encontrado para esse termo. Tente outra busca.');
      }
      setFoodCatalogUpdatedAt(new Date());
      lastFoodSearchRequestRef.current = normalizedRequest;
    } catch (error: any) {
      showAlert('Busca de alimentos', error?.message || 'Não foi possível buscar os produtos agora.');
    } finally {
      setFoodAiSearchLoading(false);
    }
  }, [
    foodSearchTerm,
    foodAiSearchLoading,
    foodCatalog,
    loadCommunitySearchMatches,
    requestFoodsFromPublicSearch,
    saveSearchKnowledge,
  ]);

  const handleSaveBodyCheckin = async () => {
    if (!user?.uid) return;
    const weight = parseWeightKg(weightInput);
    const height = parseHeightCm(heightInput);
    const goal = goalInput.trim();

    if (!weight || !height || !goal) {
      showAlert('Check-in corporal', 'Informe peso, altura e objetivo para continuar.');
      return;
    }

    setBodyCheckinLoading(true);
    try {
      const db = getFirebaseDb();
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        peso: weight,
        altura: height,
        objetivoNoApp: goal,
        lastBodyCheckInAt: new Date(),
      });
      await addDoc(collection(db, 'users', user.uid, 'bodyMetricsLogs'), {
        peso: weight,
        altura: height,
        objetivo: goal,
        createdAt: new Date(),
      });
      setWeightInput(String(Math.round(weight * 10) / 10));
      setHeightInput(String(Math.round(height)));
      setGoalPickerOpen(false);
      setBodyCheckinOpen(false);
      showAlert('Check-in corporal', 'Dados atualizados com sucesso.');
    } catch (error: any) {
      showAlert('Check-in corporal', error?.message || 'Não foi possível salvar agora.');
    } finally {
      setBodyCheckinLoading(false);
    }
  };

  useEffect(() => {
    if (!nutritionFormOpen) return;
    const searchTerm = foodSearchTerm.trim();
    if (searchTerm.length < 2) return;
    const timer = setTimeout(() => {
      void handleSearchFoodWithAi(false);
    }, 480);
    return () => clearTimeout(timer);
  }, [nutritionFormOpen, foodSearchTerm, handleSearchFoodWithAi]);

  const handleAddMeal = async () => {
    const composedDescription = selectedCatalogItems.map((item) => item.name).join(', ');

    if (!composedDescription) {
      showAlert('Refeição', 'Selecione pelo menos 1 produto para registrar sua refeição.');
      return;
    }

    setMealLoading(true);
    try {
      const analysis = analyzeMealFromCatalogSelection(selectedCatalogItems);
      const totalKcal = analysis.totals.kcal;
      const scaling = 1;
      const shortDescription = selectedCatalogItems
        .slice(0, 4)
        .map((item) => item.name)
        .join(', ');

      const entry: SoloMealEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        description: shortDescription || composedDescription,
        kcal: totalKcal,
        protein: parseMacroValue(analysis.totals.protein * scaling),
        carbs: parseMacroValue(analysis.totals.carbs * scaling),
        fat: parseMacroValue(analysis.totals.fat * scaling),
        foods: analysis.foods.map((item: SoloMealFood) => ({
          ...item,
          kcal: Math.max(0, Math.round(item.kcal * scaling)),
          protein: parseMacroValue(item.protein * scaling),
          carbs: parseMacroValue(item.carbs * scaling),
          fat: parseMacroValue(item.fat * scaling),
          imageUrl: item.imageUrl || buildFoodImageUrl(item.name),
        })),
        imageUrl: buildFoodImageUrl(composedDescription),
        notes: analysis.notes,
        estimatedByAi: analysis.source === 'ai',
        createdAt: new Date().toISOString(),
      };
      setMeals((prev) => [entry, ...prev].slice(0, 25));
      const selectedFoodsForLearning: SoloFoodCatalogItem[] = selectedCatalogItems.map((item) => ({
        ...item,
        popularity: Math.max(2, Number(item.popularity || 0) + 2),
      }));
      const aiFoodsForLearning: SoloFoodCatalogItem[] =
        analysis.source === 'ai'
          ? (analysis.foods || []).map((item, index) => {
              const protein = parseMacroValue(item.protein);
              const carbs = parseMacroValue(item.carbs);
              const fat = parseMacroValue(item.fat);
              const dominantMacro = Math.max(protein, carbs, fat);
              const category =
                dominantMacro === protein
                  ? 'proteinas'
                  : dominantMacro === carbs
                    ? 'carboidratos'
                    : 'gorduras';
              return {
                id: buildFoodItemId(item.name || `alimento-${index + 1}`, `meal-ai-${index}`),
                name: item.name || `Alimento ${index + 1}`,
                category,
                kcalPer100g: Math.max(0, Math.round(Number(item.kcal || 0))),
                proteinPer100g: protein,
                carbsPer100g: carbs,
                fatPer100g: fat,
                imageUrl: item.imageUrl || buildFoodImageUrl(item.name || `alimento-${index + 1}`),
                popularity: 2,
                source: 'ai',
                lastSeenAt: new Date().toISOString(),
              };
            })
          : [];
      const usedFoodsForLearning = mergeFoodCatalogItems(
        selectedFoodsForLearning,
        aiFoodsForLearning,
        { popularityBoost: 2, source: 'ai' }
      );
      if (usedFoodsForLearning.length > 0) {
        setFoodCatalog((prev) =>
          mergeFoodCatalogItems(prev, usedFoodsForLearning, { popularityBoost: 3, source: 'ai' })
        );
        setFoodCatalogUpdatedAt(new Date());
        void saveSearchKnowledge(composedDescription, usedFoodsForLearning);
      }
      setFoodSearchTerm('');
      setSelectedCatalogItems([]);
      setNutritionFormOpen(false);
    } catch (error: any) {
      showAlert('Refeição', error?.message || 'Não foi possível registrar essa refeição.');
    } finally {
      setMealLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.primaryBackground }]}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing['3xl'] }]}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <SafeAreaView edges={['top']}>
        <View style={[styles.section, { paddingHorizontal: padding, marginTop: 0 }]}>
          <LinearGradient
            colors={cleanSurfaceGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.soloHeroCard,
              {
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                borderColor: CLEAN_BORDER,
              },
            ]}
          >
            <View style={styles.soloHeroHeaderRow}>
              <View style={styles.soloHeroCopy}>
                <Text style={[{ color: CLEAN_TEXT_MUTED }, typography.bodySmall]}>
                  Ola, {firstName}
                </Text>
                <Text style={[{ color: CLEAN_TEXT, marginTop: spacing.xs }, typography.displaySmall]}>
                  Seu hub de performance
                </Text>
                <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.xs }, typography.bodySmall]}>
                  {hasIndividualPlan
                    ? 'IA premium ativa com plano ajustado automaticamente.'
                    : 'Treino, nutricao e rotina centralizados em um unico lugar.'}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.soloHeroAvatarButton,
                  {
                    borderRadius: borderRadius.full,
                    backgroundColor: CLEAN_SURFACE_ALT,
                    borderColor: CLEAN_BORDER,
                  },
                ]}
                onPress={() => router.push('/profile/edit' as any)}
              >
                {user?.photoUrl ? (
                  <Image source={{ uri: user.photoUrl }} style={[styles.avatarImage, { borderRadius: borderRadius.full }]} />
                ) : (
                  <Ionicons name="person-circle-outline" size={28} color={CLEAN_TEXT} />
                )}
              </TouchableOpacity>
            </View>

            <View style={[styles.soloHeroBadgeRow, { marginTop: spacing.md }]}>
              <View style={[styles.soloHeroPlanPill, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                <Ionicons
                  name={hasIndividualPlan ? 'diamond-outline' : 'flash-outline'}
                  size={13}
                  color={colors.primary}
                />
                <Text style={[styles.soloHeroPlanPillText, { color: CLEAN_TEXT }, typography.labelSmall]}>
                  {hasIndividualPlan ? 'Plano premium ativo' : 'Plano livre ativo'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.soloHeroSubscriptionCta, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}
                onPress={() => router.push('/profile/subscription' as any)}
              >
                <Text style={[styles.soloHeroSubscriptionCtaText, { color: CLEAN_TEXT }, typography.labelSmall]}>
                  {hasIndividualPlan ? 'Gerenciar assinatura' : 'Ativar premium'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.soloHeroSubscriptionSummary, { marginTop: spacing.sm, borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Ionicons name="sparkles-outline" size={13} color={colors.primary} />
              <Text style={[styles.soloHeroSubscriptionHint, { color: CLEAN_TEXT_MUTED }, typography.bodySmall]}>
                {hasIndividualPlan
                  ? hasSubscriptionMeta
                    ? `Status ${subscriptionStatusLabel} • Renovacao ${subscriptionRenewalLabel} • ${subscriptionAmountLabel}`
                    : 'Premium ativo com assistente completo e ajustes automaticos.'
                  : 'Ative o Premium para ampliar IA, agenda inteligente e análise contínua.'}
              </Text>
            </View>

            <View style={[styles.soloMetricsRow, { marginTop: spacing.md }]}>
              <LinearGradient
                colors={cleanSurfaceAltGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.soloMetricCard, { borderRadius: borderRadius.md, borderColor: CLEAN_BORDER }]}
              >
                <View style={styles.soloMetricHeaderRow}>
                  <View style={styles.soloMetricIconWrap}>
                    <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
                  </View>
                  <Text style={[styles.soloMetricTitle, { color: CLEAN_TEXT_MUTED }, typography.labelSmall]}>Creditos</Text>
                </View>
                <Text style={[styles.soloMetricValue, { marginTop: spacing.xs, color: CLEAN_TEXT }, typography.titleMedium]}>
                  {aiRemaining}/{aiDailyLimit}
                </Text>
              </LinearGradient>
              <LinearGradient
                colors={cleanSurfaceAltGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.soloMetricCard, { borderRadius: borderRadius.md, borderColor: CLEAN_BORDER }]}
              >
                <View style={styles.soloMetricHeaderRow}>
                  <View style={styles.soloMetricIconWrap}>
                    <Ionicons name="flame-outline" size={14} color={colors.tertiary} />
                  </View>
                  <Text style={[styles.soloMetricTitle, { color: CLEAN_TEXT_MUTED }, typography.labelSmall]}>Energia</Text>
                </View>
                <Text style={[styles.soloMetricValue, { marginTop: spacing.xs, color: CLEAN_TEXT }, typography.titleMedium]}>
                  {kcalConsumed}
                </Text>
              </LinearGradient>
              <LinearGradient
                colors={cleanSurfaceAltGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.soloMetricCard, { borderRadius: borderRadius.md, borderColor: CLEAN_BORDER }]}
              >
                <View style={styles.soloMetricHeaderRow}>
                  <View style={styles.soloMetricIconWrap}>
                    <Ionicons name="water-outline" size={14} color={colors.primary} />
                  </View>
                  <Text style={[styles.soloMetricTitle, { color: CLEAN_TEXT_MUTED }, typography.labelSmall]}>Agua</Text>
                </View>
                <Text style={[styles.soloMetricValue, { marginTop: spacing.xs, color: CLEAN_TEXT }, typography.titleMedium]}>
                  {waterCups}/{waterGoal}
                </Text>
              </LinearGradient>
            </View>
          </LinearGradient>
        </View>
      </SafeAreaView>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <View style={styles.soloQuickHeader}>
          <Text style={[{ color: colors.primaryText }, typography.titleLarge]}>Atalhos inteligentes</Text>
          <Text style={[{ color: colors.secondaryText, marginTop: 2 }, typography.bodySmall]}>
            Ações essenciais com visual mais limpo e rápido.
          </Text>
        </View>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.soloQuickGrid}
        >
          {quickActions.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.soloQuickCard, index === quickActions.length - 1 ? styles.soloQuickCardLast : null]}
              onPress={item.onPress}
              activeOpacity={0.9}
            >
                <View
                  style={[
                    styles.soloQuickCardInner,
                    {
                      borderRadius: borderRadius.lg,
                      borderColor: CLEAN_BORDER,
                      backgroundColor: CLEAN_SURFACE,
                    },
                  ]}
                >
                <View style={styles.soloQuickTopRow}>
                  <View
                    style={[
                      styles.soloQuickIconWrap,
                      {
                        backgroundColor: `${item.accent[0]}18`,
                        borderColor: `${item.accent[1]}30`,
                      },
                    ]}
                  >
                    <Ionicons name={item.icon as any} size={18} color={item.accent[1]} />
                  </View>
                  <Ionicons name={item.ctaIcon as any} size={14} color={CLEAN_TEXT_SOFT} />
                </View>
                <Text style={[styles.soloQuickLabel, { color: CLEAN_TEXT }, typography.labelMedium]}>
                  {item.title}
                </Text>
                <Text style={[styles.soloQuickHint, { color: CLEAN_TEXT_MUTED }, typography.bodySmall]}>
                  {item.subtitle}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <LinearGradient
          colors={cleanSurfaceGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.soloCalendarPremiumCard,
            {
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              borderColor: CLEAN_BORDER,
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: CLEAN_TEXT }, typography.titleLarge]}>
                Calendário da semana
              </Text>
              <Text style={[styles.soloCalendarSubtitle, { color: CLEAN_TEXT_MUTED }, typography.bodySmall]}>
                Selecione o dia para ver treinos e avaliações sugeridas.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.soloCalendarOpenButton,
                {
                  borderRadius: borderRadius.full,
                  borderColor: CLEAN_BORDER,
                  backgroundColor: CLEAN_SURFACE_ALT,
                },
              ]}
              onPress={handleOpenAgenda}
            >
              <Ionicons name="calendar-outline" size={13} color={CLEAN_TEXT} />
              <Text style={[styles.soloCalendarOpenButtonText, { color: CLEAN_TEXT }, typography.labelSmall]}>Agenda</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.soloCalendarMetaRow, { marginTop: spacing.sm }]}>
            <View style={[styles.soloCalendarMetaChip, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Text style={[styles.soloCalendarMetaLabel, { color: CLEAN_TEXT_MUTED }]}>Eventos 7d</Text>
              <Text style={[styles.soloCalendarMetaValue, { color: CLEAN_TEXT }]}>{weeklyEventsCount}</Text>
            </View>
            <View style={[styles.soloCalendarMetaChip, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Text style={[styles.soloCalendarMetaLabel, { color: CLEAN_TEXT_MUTED }]}>Dia selecionado</Text>
              <Text style={[styles.soloCalendarMetaValue, { color: CLEAN_TEXT }]}>{selectedDayEvents.length} item(ns)</Text>
            </View>
          </View>
          <View style={[styles.soloCalendarRow, { marginTop: spacing.md }]}>
            {calendarDays.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.soloDayChip,
                  {
                    backgroundColor: selectedDateKey === item.key ? CLEAN_SURFACE_SOFT : CLEAN_SURFACE,
                    borderRadius: borderRadius.md,
                    borderWidth: 1,
                    borderColor: CLEAN_BORDER,
                  },
                ]}
                onPress={() => setSelectedDateKey(item.key)}
              >
                <Text
                  style={[
                    styles.soloDayLabel,
                    { color: selectedDateKey === item.key ? CLEAN_TEXT : CLEAN_TEXT_SOFT },
                  ]}
                >
                  {item.label}
                </Text>
                <Text
                  style={[
                    styles.soloDayNumber,
                    { color: CLEAN_TEXT },
                  ]}
                >
                  {item.day}
                </Text>
                {(eventsByDay[item.key]?.length || 0) > 0 ? (
                  <View
                    style={[
                      styles.soloDayCountBadge,
                      {
                        backgroundColor:
                          selectedDateKey === item.key
                            ? `${colors.primary}12`
                            : CLEAN_SURFACE_ALT,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.soloDayCountText,
                        { color: colors.primary },
                      ]}
                    >
                      {eventsByDay[item.key]?.length || 0}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
          <View
            style={[
              styles.soloDayAgendaCard,
              {
                marginTop: spacing.md,
                borderRadius: borderRadius.md,
                backgroundColor: CLEAN_SURFACE_ALT,
                borderColor: CLEAN_BORDER,
              },
            ]}
          >
            <Text style={[{ color: CLEAN_TEXT }, typography.titleMedium]}>
              Agenda de {selectedDayLabel}
            </Text>
            {aiPlannerLoading ? (
              <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.xs }, typography.labelSmall]}>
                Atualizando sugestoes da IA...
              </Text>
            ) : null}
            {selectedDayEvents.length === 0 ? (
              <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.sm }, typography.bodySmall]}>
                Nenhum item para este dia.
              </Text>
            ) : (
              selectedDayEvents.slice(0, 7).map((event) => (
                <TouchableOpacity
                  key={event.id}
                  style={[styles.soloDayAgendaItem, { borderBottomColor: colors.border }]}
                  onPress={() => handleCalendarEventPress(event)}
                  activeOpacity={0.82}
                >
                  <View
                    style={[
                      styles.soloDayAgendaIcon,
                      {
                        backgroundColor:
                          event.type === 'treino'
                            ? 'rgba(125,220,255,0.18)'
                            : event.type === 'fatura'
                              ? 'rgba(255,154,154,0.2)'
                              : 'rgba(148,163,255,0.18)',
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        event.type === 'treino'
                          ? 'barbell-outline'
                          : event.type === 'fatura'
                            ? 'card-outline'
                            : 'analytics-outline'
                      }
                      size={14}
                      color={
                        event.type === 'treino'
                          ? DARK_MODE_ACCENT
                          : event.type === 'fatura'
                            ? '#FF9898'
                            : '#A8B3FF'
                      }
                    />
                  </View>
                  <View style={styles.soloDayAgendaMeta}>
                    <Text style={[{ color: CLEAN_TEXT }, typography.bodySmall]} numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text style={[{ color: CLEAN_TEXT_MUTED }, typography.labelSmall]} numberOfLines={2}>
                      {event.subtitle}
                    </Text>
                  </View>
                  {event.source === 'ai' ? (
                    <View style={[styles.soloAiTag, { backgroundColor: CLEAN_SURFACE_SOFT }]}>
                      <Text style={[styles.soloAiTagText, { color: CLEAN_TEXT }]}>IA</Text>
                    </View>
                  ) : event.type === 'fatura' ? (
                    <View style={[styles.soloAiTag, { backgroundColor: CLEAN_SURFACE_SOFT }]}>
                      <Text style={[styles.soloAiTagText, { color: CLEAN_TEXT_SOFT }]}>Fatura</Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={14} color={CLEAN_TEXT_SOFT} />
                </TouchableOpacity>
              ))
            )}
          </View>
        </LinearGradient>
      </View>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <LinearGradient
          colors={cleanSurfaceGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.soloNutritionShell,
            {
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              borderColor: CLEAN_BORDER,
            },
          ]}
        >
          <View style={styles.soloNutritionHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: CLEAN_TEXT }, typography.titleLarge]}>Nutricao inteligente</Text>
              <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.xs }, typography.bodySmall]}>
                Rotina diaria com agua, energia, check-in corporal e refeicoes.
              </Text>
            </View>
            <View style={[styles.soloNutritionHeaderBadge, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Ionicons name="sparkles-outline" size={12} color={colors.primary} />
              <Text style={[styles.soloNutritionHeaderBadgeText, { color: CLEAN_TEXT }]}>IA ativa</Text>
            </View>
          </View>

          <LinearGradient
            colors={cleanSurfaceGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.soloStepsCard,
              {
                borderRadius: borderRadius.lg,
                marginTop: spacing.md,
                borderColor: CLEAN_BORDER,
              },
            ]}
          >
            <View style={styles.soloStepsHeader}>
              <View>
                <Text style={[{ color: CLEAN_TEXT_SOFT }, typography.labelMedium]}>Corrida e caminhada</Text>
                <Text style={[{ color: CLEAN_TEXT, marginTop: spacing.xs }, typography.titleMedium]}>
                  {stepsToday.toLocaleString('pt-BR')} passos
                </Text>
              </View>
              <View style={[styles.soloStepsStatusWrap, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                <Ionicons name={pedometerAvailable ? 'walk-outline' : 'alert-circle-outline'} size={14} color={CLEAN_TEXT_SOFT} />
                <Text style={[styles.soloStepsStatusText, { color: CLEAN_TEXT_SOFT }]}>
                  {pedometerAvailable ? 'Tempo real' : 'Sensor indisponível'}
                </Text>
              </View>
            </View>

            <View style={[styles.soloProgressTrack, { marginTop: spacing.sm, backgroundColor: CLEAN_SURFACE_SOFT }]}>
              <View style={[styles.soloProgressFill, { width: `${stepsProgress}%`, backgroundColor: DARK_MODE_ACCENT }]} />
            </View>

            <View style={styles.soloStepsMetaRow}>
              <View style={[styles.soloStepsMetaChip, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                <Text style={[styles.soloStepsMetaLabel, { color: CLEAN_TEXT_MUTED }]}>Meta</Text>
                <Text style={[styles.soloStepsMetaValue, { color: CLEAN_TEXT }]}>{stepsGoal.toLocaleString('pt-BR')}</Text>
              </View>
              <View style={[styles.soloStepsMetaChip, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                <Text style={[styles.soloStepsMetaLabel, { color: CLEAN_TEXT_MUTED }]}>Distancia</Text>
                <Text style={[styles.soloStepsMetaValue, { color: CLEAN_TEXT }]}>{walkingDistanceKm} km</Text>
              </View>
              <View style={[styles.soloStepsMetaChip, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                <Text style={[styles.soloStepsMetaLabel, { color: CLEAN_TEXT_MUTED }]}>Gasto</Text>
                <Text style={[styles.soloStepsMetaValue, { color: CLEAN_TEXT }]}>{walkingCalories} kcal</Text>
              </View>
            </View>
          </LinearGradient>

          <LinearGradient
            colors={cleanSurfaceGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.soloHydrationCard,
              {
                borderRadius: borderRadius.lg,
                marginTop: spacing.md,
                borderWidth: 1,
                borderColor: CLEAN_BORDER,
              },
            ]}
          >
            <View style={styles.soloHydrationHeader}>
              <Text style={[{ color: CLEAN_TEXT_SOFT }, typography.labelMedium]}>Meta de hidratacao</Text>
              <Text style={[{ color: CLEAN_TEXT }, typography.titleMedium]}>
                {waterCups}/{waterGoal} copos
              </Text>
            </View>
            <View style={styles.soloHydrationBody}>
              <View style={styles.soloBottleArtwork}>
                <View style={[styles.soloBottleCap, { backgroundColor: CLEAN_SURFACE_SOFT }]} />
                <View style={[styles.soloBottleNeck, { backgroundColor: CLEAN_SURFACE_SOFT }]} />
                <View style={[styles.soloBottleBody, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                  <View style={[styles.soloBottleGloss, { backgroundColor: CLEAN_SURFACE_SOFT }]} />
                  <LinearGradient
                    colors={['#22D3EE', '#2563EB']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={[
                      styles.soloBottleFill,
                      { height: `${Math.max(waterProgress, waterCups > 0 ? 10 : 0)}%` },
                    ]}
                  />
                  <View style={styles.soloBottleIconWrap}>
                    <Ionicons name="water" size={18} color={CLEAN_TEXT} />
                  </View>
                </View>
              </View>
              <View style={styles.soloHydrationContent}>
                <Text style={[{ color: CLEAN_TEXT_MUTED }, typography.bodySmall]}>
                  {waterProgress}% da meta diaria
                </Text>
                <View style={[styles.soloProgressTrack, { marginTop: spacing.sm, backgroundColor: CLEAN_SURFACE_SOFT }]}>
                  <View style={[styles.soloProgressFill, { width: `${waterProgress}%`, backgroundColor: DARK_MODE_ACCENT }]} />
                </View>
                <View style={[styles.soloHydrationButtons, { marginTop: spacing.md }]}>
                  <TouchableOpacity
                    style={[
                      styles.soloHydrationButton,
                      {
                        backgroundColor: CLEAN_SURFACE_ALT,
                        borderRadius: borderRadius.md,
                        borderWidth: 1,
                        borderColor: CLEAN_BORDER,
                      },
                    ]}
                    onPress={() => setWaterCups((prev) => Math.max(0, prev - 1))}
                  >
                    <Ionicons name="remove" size={18} color={CLEAN_TEXT} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.soloHydrationButton,
                      {
                        backgroundColor: CLEAN_SURFACE_ALT,
                        borderRadius: borderRadius.md,
                        borderWidth: 1,
                        borderColor: CLEAN_BORDER,
                      },
                    ]}
                    onPress={() => setWaterCups((prev) => Math.min(24, prev + 1))}
                  >
                    <Ionicons name="add" size={18} color={CLEAN_TEXT} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={styles.soloHydrationDots}>
              {Array.from({ length: waterGoal }).map((_, index) => {
                const active = index < waterCups;
                return (
                  <View
                    key={`water-dot-${index}`}
                    style={[
                      styles.soloHydrationDot,
                      { backgroundColor: active ? `${colors.primary}16` : CLEAN_SURFACE_SOFT },
                    ]}
                  >
                    <Ionicons name="water" size={12} color={active ? colors.primary : CLEAN_TEXT_SOFT} />
                  </View>
                );
              })}
            </View>
          </LinearGradient>

          <LinearGradient
            colors={cleanSurfaceGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.soloKcalPremiumCard,
              {
                borderRadius: borderRadius.lg,
                marginTop: spacing.md,
                borderColor: CLEAN_BORDER,
              },
            ]}
          >
            <View style={styles.soloKcalHeader}>
              <Text style={[{ color: CLEAN_TEXT_SOFT }, typography.labelMedium]}>Meta de energia</Text>
              <Text style={[{ color: CLEAN_TEXT }, typography.titleMedium]}>
                {kcalConsumed}/{kcalGoal} kcal
              </Text>
            </View>
            <View style={styles.soloKcalBody}>
              <View style={styles.soloKcalArtwork}>
                <View style={[styles.soloKcalDishRing, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                  <LinearGradient
                    colors={['#FB923C', '#F97316', '#DC2626']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={[styles.soloKcalDishFill, { height: `${Math.max(kcalProgress, kcalConsumed > 0 ? 12 : 0)}%` }]}
                  />
                  <View style={[styles.soloKcalDishGloss, { backgroundColor: CLEAN_SURFACE_SOFT }]} />
                  <Ionicons name="restaurant" size={24} color={colors.tertiary} style={styles.soloKcalFoodIcon} />
                </View>
                <Text style={[styles.soloKcalDishPercent, { color: CLEAN_TEXT_SOFT }]}>{kcalProgress}%</Text>
              </View>
              <View style={styles.soloKcalContent}>
                <Text style={[{ color: CLEAN_TEXT_MUTED }, typography.bodySmall]}>
                  {Math.max(0, kcalGoal - kcalConsumed)} kcal restantes hoje
                </Text>
                <View style={[styles.soloProgressTrack, { marginTop: spacing.sm, backgroundColor: CLEAN_SURFACE_SOFT }]}>
                  <View style={[styles.soloProgressFill, { width: `${kcalProgress}%`, backgroundColor: colors.tertiary }]} />
                </View>
                <View style={styles.soloKcalMacroLegendRow}>
                  <Text style={[styles.soloKcalMacroLegendItem, { backgroundColor: CLEAN_SURFACE_ALT, color: CLEAN_TEXT_MUTED }]}>P {proteinConsumed.toFixed(1)}g</Text>
                  <Text style={[styles.soloKcalMacroLegendItem, { backgroundColor: CLEAN_SURFACE_ALT, color: CLEAN_TEXT_MUTED }]}>C {carbsConsumed.toFixed(1)}g</Text>
                  <Text style={[styles.soloKcalMacroLegendItem, { backgroundColor: CLEAN_SURFACE_ALT, color: CLEAN_TEXT_MUTED }]}>G {fatConsumed.toFixed(1)}g</Text>
                </View>
              </View>
            </View>
          </LinearGradient>

          <View style={[styles.soloSectionActions, { marginTop: spacing.md }]}>
            <TouchableOpacity
              style={[
                styles.soloPremiumActionButton,
                styles.soloActionPrimaryButton,
                {
                  borderRadius: borderRadius.md,
                  borderColor: CLEAN_BORDER,
                  backgroundColor: CLEAN_SURFACE_ALT,
                },
              ]}
              onPress={() => setNutritionFormOpen(true)}
            >
              <Ionicons name="restaurant-outline" size={18} color={CLEAN_TEXT} />
              <Text style={[styles.soloPremiumActionText, { color: CLEAN_TEXT }]}>
                Nova refeição
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.soloPremiumActionButton,
                styles.soloActionSecondaryButton,
                {
                  borderRadius: borderRadius.md,
                  borderColor: CLEAN_BORDER,
                  backgroundColor: CLEAN_SURFACE_ALT,
                },
              ]}
              onPress={() => {
                setNutritionFormOpen(true);
                if (foodSearchTerm.trim().length >= 2) {
                  void handleSearchFoodWithAi(true);
                }
              }}
              disabled={foodAiSearchLoading || foodCatalogLoading}
            >
              {foodAiSearchLoading || foodCatalogLoading ? (
                <ActivityIndicator size="small" color={CLEAN_TEXT} />
              ) : (
                <>
                  <Ionicons name="search-outline" size={18} color={CLEAN_TEXT} />
                  <Text style={[styles.soloPremiumActionText, { color: CLEAN_TEXT }]}>Buscar alimentos</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <LinearGradient
            colors={cleanSurfaceGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.soloBodyCheckinSummaryCard,
              {
                borderRadius: borderRadius.lg,
                marginTop: spacing.md,
                borderColor: CLEAN_BORDER,
              },
            ]}
          >
            <View style={styles.soloBodyCheckinSummaryHeader}>
              <View style={[styles.soloBodyCheckinIconWrap, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                <Ionicons name="pulse-outline" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[{ color: CLEAN_TEXT }, typography.titleMedium]}>Check-in corporal IA</Text>
                <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.xs }, typography.bodySmall]}>
                  Atualize peso, altura e objetivo principal para a IA recalibrar treino e avaliação.
                </Text>
              </View>
            </View>
            <View style={[styles.soloBodyCheckinMetaRow, { marginTop: spacing.sm }]}>
              <View style={[styles.soloBodyCheckinMetaChip, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                <Text style={[styles.soloBodyCheckinMetaLabel, { color: CLEAN_TEXT_MUTED }]}>Peso</Text>
                <Text style={[styles.soloBodyCheckinMetaValue, { color: CLEAN_TEXT }]}>{weightInput || '--'} kg</Text>
              </View>
              <View style={[styles.soloBodyCheckinMetaChip, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                <Text style={[styles.soloBodyCheckinMetaLabel, { color: CLEAN_TEXT_MUTED }]}>Altura</Text>
                <Text style={[styles.soloBodyCheckinMetaValue, { color: CLEAN_TEXT }]}>{heightInput || '--'} cm</Text>
              </View>
              <View style={[styles.soloBodyCheckinMetaChip, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                <Text style={[styles.soloBodyCheckinMetaLabel, { color: CLEAN_TEXT_MUTED }]}>Meta principal</Text>
                <Text style={[styles.soloBodyCheckinMetaValue, { color: CLEAN_TEXT }]} numberOfLines={1}>
                  {goalInput || 'Definir'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.soloBodyCheckinOpenButton,
                {
                  borderRadius: borderRadius.md,
                  marginTop: spacing.sm,
                  backgroundColor: CLEAN_SURFACE_ALT,
                  borderWidth: 1,
                  borderColor: CLEAN_BORDER,
                },
              ]}
              onPress={() => {
                setGoalPickerOpen(false);
                setBodyCheckinOpen(true);
              }}
            >
              <Ionicons name="create-outline" size={15} color={CLEAN_TEXT} />
              <Text style={[styles.soloBodyCheckinOpenButtonText, { color: CLEAN_TEXT }, typography.labelMedium]}>
                Abrir check-in
              </Text>
            </TouchableOpacity>
          </LinearGradient>
        </LinearGradient>
      </View>

      <View style={[styles.section, { paddingHorizontal: padding }]}>
        <LinearGradient
          colors={cleanSurfaceGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.soloProgressPremiumCard,
            {
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              borderColor: CLEAN_BORDER,
            },
          ]}
        >
          <View style={styles.soloProgressPremiumHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: CLEAN_TEXT }, typography.titleLarge]}>Avaliações e progresso</Text>
              <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.xs }, typography.bodySmall]}>
                A IA revisa seu progresso toda semana e após treinos concluídos para ajustar seu plano.
              </Text>
            </View>
            <View style={[styles.soloAiPulseBadge, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
              <Text style={[styles.soloAiPulseText, { color: CLEAN_TEXT }]}>{aiUnreadSuggestionsCount} novo(s)</Text>
            </View>
          </View>

          <View style={[styles.soloProgressPremiumStatsRow, { marginTop: spacing.md }]}>
            <View style={[styles.soloProgressPremiumStatCard, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Text style={[styles.soloProgressPremiumStatValue, { color: CLEAN_TEXT }]}>{completedWorkoutsThisWeek}</Text>
              <Text style={[styles.soloProgressPremiumStatLabel, { color: CLEAN_TEXT_MUTED }]}>Treinos 7d</Text>
            </View>
            <View style={[styles.soloProgressPremiumStatCard, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Text style={[styles.soloProgressPremiumStatValue, { color: CLEAN_TEXT }]}>{totalEvaluations}</Text>
              <Text style={[styles.soloProgressPremiumStatLabel, { color: CLEAN_TEXT_MUTED }]}>Avaliações</Text>
            </View>
            <View style={[styles.soloProgressPremiumStatCard, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
              <Text style={[styles.soloProgressPremiumStatValue, { color: CLEAN_TEXT }]}>{aiPlanner.suggestions.length}</Text>
              <Text style={[styles.soloProgressPremiumStatLabel, { color: CLEAN_TEXT_MUTED }]}>Ajustes IA</Text>
            </View>
          </View>

          <View style={[styles.soloAiStatusCard, { marginTop: spacing.md, borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
            <View style={styles.soloAiStatusRow}>
              <Ionicons name="time-outline" size={15} color={colors.primary} />
              <Text style={[styles.soloAiStatusText, { color: CLEAN_TEXT }]}>
                Última análise: {lastAiReviewDate ? format(lastAiReviewDate, 'dd/MM HH:mm', { locale: ptBR }) : 'pendente'}
              </Text>
            </View>
            <View style={[styles.soloAiStatusRow, { marginTop: 6 }]}>
              <Ionicons name="flash-outline" size={15} color={colors.tertiary} />
              <Text style={[styles.soloAiStatusText, { color: CLEAN_TEXT }]} numberOfLines={2}>
                {nextAiSuggestion
                  ? `Próximo ajuste: ${nextAiSuggestion.title}`
                  : 'Sem ajustes pendentes no momento.'}
              </Text>
            </View>
          </View>

          <View style={[styles.soloSectionActions, { marginTop: spacing.md }]}>
            <TouchableOpacity
              style={[styles.soloPremiumActionButton, styles.soloDarkActionButton, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}
              onPress={() => void handleGenerateAiEvaluation()}
              disabled={aiEvaluationGenerating}
            >
              {aiEvaluationGenerating ? (
                <ActivityIndicator size="small" color={CLEAN_TEXT} />
              ) : (
                <>
                  <Ionicons name="sparkles-outline" size={17} color={CLEAN_TEXT} />
                  <Text style={[styles.soloPremiumActionText, { color: CLEAN_TEXT }]}>Gerar avaliação IA</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.soloPremiumActionButton, styles.soloLightActionButton, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}
              onPress={handleOpenProgress}
            >
              <Ionicons name="trending-up-outline" size={17} color={CLEAN_TEXT} />
              <Text style={[styles.soloPremiumActionText, { color: CLEAN_TEXT }]}>Ver progresso</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {!hasIndividualPlan && (
        <View style={[styles.section, { paddingHorizontal: padding }]}>
          <LinearGradient
            colors={cleanSurfaceGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.soloPremiumBanner,
              {
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                borderColor: CLEAN_BORDER,
              },
            ]}
          >
            <View style={styles.soloPlanBannerHeader}>
              <View style={[styles.soloPlanBadge, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                <Ionicons name="diamond-outline" size={14} color={colors.primary} />
                <Text style={[styles.soloPlanBadgeText, { color: CLEAN_TEXT }]}>Plano individual</Text>
              </View>
              <Text style={[styles.soloPlanPrice, { color: CLEAN_TEXT }, typography.titleMedium]}>R$ 24,99/mês</Text>
            </View>
            <Text style={[{ color: CLEAN_TEXT, marginTop: spacing.sm }, typography.titleLarge]}>
              Assinatura Premium sem personal
            </Text>
            <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.xs }, typography.bodySmall]}>
              Libera assistente completo, análise nutricional avançada e 8 créditos diários de IA.
            </Text>
            <View style={[styles.soloPlanFeatureList, { marginTop: spacing.md }]}>
              <View style={styles.soloPlanFeatureItem}>
                <Ionicons name="checkmark-circle" size={15} color={colors.primary} />
                <Text style={[styles.soloPlanFeatureText, { color: CLEAN_TEXT_MUTED }]}>Treinos e avaliações gerados automaticamente</Text>
              </View>
              <View style={styles.soloPlanFeatureItem}>
                <Ionicons name="checkmark-circle" size={15} color={colors.primary} />
                <Text style={[styles.soloPlanFeatureText, { color: CLEAN_TEXT_MUTED }]}>Catálogo de alimentos expandido com IA</Text>
              </View>
              <View style={styles.soloPlanFeatureItem}>
                <Ionicons name="checkmark-circle" size={15} color={colors.primary} />
                <Text style={[styles.soloPlanFeatureText, { color: CLEAN_TEXT_MUTED }]}>Ajuste semanal baseado no seu progresso</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.soloPlanCtaButton,
                {
                  marginTop: spacing.md,
                  borderRadius: borderRadius.md,
                  backgroundColor: CLEAN_SURFACE_ALT,
                  borderWidth: 1,
                  borderColor: CLEAN_BORDER,
                },
              ]}
              onPress={() => router.push('/profile/subscription' as any)}
            >
              <Ionicons name="rocket-outline" size={16} color={CLEAN_TEXT} />
              <Text style={[styles.soloPlanCtaText, { color: CLEAN_TEXT }, typography.labelMedium]}>Ativar plano individual</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      )}

      {noPersonalFlow && (
        <View style={[styles.section, { paddingHorizontal: padding, paddingBottom: spacing['2xl'] }]}>
          <LinearGradient
            colors={cleanSurfaceGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.soloCoachBanner,
              {
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                borderColor: CLEAN_BORDER,
              },
            ]}
          >
            <View style={styles.soloCoachBannerHeader}>
              <View style={[styles.soloCoachIconWrap, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}>
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[{ color: CLEAN_TEXT, flex: 1 }, typography.titleMedium]}>
                MH Agenda Fit para contato profissional
              </Text>
            </View>
            <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.xs }, typography.bodySmall]}>
              Encontre profissionais disponíveis na sua região, converse e agende acompanhamento presencial ou online.
            </Text>
            <View style={[styles.soloCoachFeatureList, { marginTop: spacing.sm }]}>
              <Text style={[styles.soloCoachFeatureText, { color: CLEAN_TEXT_MUTED }]}>Busca por cidade, estado e especialidade</Text>
              <Text style={[styles.soloCoachFeatureText, { color: CLEAN_TEXT_MUTED }]}>Contato rápido com profissionais ativos</Text>
            </View>
            <View style={[styles.soloCoachActionRow, { marginTop: spacing.md }]}>
              <TouchableOpacity
                style={[
                  styles.soloCoachCtaButton,
                  {
                    borderRadius: borderRadius.md,
                    backgroundColor: CLEAN_SURFACE_ALT,
                    borderWidth: 1,
                    borderColor: CLEAN_BORDER,
                  },
                ]}
                onPress={() => router.push('/mh-agenda-fit' as any)}
              >
                <Ionicons name="calendar-clear-outline" size={15} color={CLEAN_TEXT} />
                <Text style={[styles.soloCoachCtaText, { color: CLEAN_TEXT }, typography.labelMedium]}>Abrir MH Agenda Fit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.soloCoachSecondaryButton,
                  {
                    borderRadius: borderRadius.md,
                    borderColor: CLEAN_BORDER,
                    backgroundColor: CLEAN_SURFACE_ALT,
                  },
                ]}
                onPress={() => router.push('/personal/change-code' as any)}
              >
                <Ionicons name="key-outline" size={15} color={CLEAN_TEXT} />
                <Text style={[styles.soloCoachSecondaryText, { color: CLEAN_TEXT }, typography.labelMedium]}>Adicionar código</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      )}

      <Modal
        visible={bodyCheckinOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setGoalPickerOpen(false);
          setBodyCheckinOpen(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.soloSheetBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 12}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={() => {
              setGoalPickerOpen(false);
              setBodyCheckinOpen(false);
            }}
          />
          <LinearGradient
            colors={cleanSurfaceGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.soloBodySheetCard, { borderColor: CLEAN_BORDER, borderRadius: borderRadius.lg }]}
          >
            <View style={styles.soloSheetHandle} />
            <View style={styles.soloNutritionSheetHeader}>
              <View style={styles.soloNutritionSheetTitleWrap}>
                <Text style={[{ color: CLEAN_TEXT }, typography.titleLarge]}>Check-in corporal</Text>
                <Text style={[{ color: CLEAN_TEXT_MUTED, marginTop: spacing.xs }, typography.bodySmall]}>
                  Atualize peso, altura e selecione o objetivo principal para a IA ajustar seu plano.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.soloNutritionSheetCloseTopButton, { borderColor: CLEAN_BORDER, backgroundColor: CLEAN_SURFACE_ALT }]}
                onPress={() => {
                  setGoalPickerOpen(false);
                  setBodyCheckinOpen(false);
                }}
              >
                <Ionicons name="close" size={18} color={CLEAN_TEXT} />
              </TouchableOpacity>
            </View>

            <View style={[styles.soloBodyGrid, { marginTop: spacing.sm }]}>
              <TextInput
                value={weightInput}
                onChangeText={setWeightInput}
                placeholder="Peso (kg)"
                placeholderTextColor={colors.secondaryText}
                keyboardType="decimal-pad"
                style={[
                  styles.soloBodyInput,
                  styles.soloNutritionSheetField,
                  {
                    borderColor: CLEAN_BORDER,
                    color: colors.primaryText,
                    backgroundColor: CLEAN_SURFACE_ALT,
                    marginTop: 0,
                  },
                ]}
              />
              <TextInput
                value={heightInput}
                onChangeText={setHeightInput}
                placeholder="Altura (cm)"
                placeholderTextColor={colors.secondaryText}
                keyboardType="decimal-pad"
                style={[
                  styles.soloBodyInput,
                  styles.soloNutritionSheetField,
                  {
                    borderColor: CLEAN_BORDER,
                    color: colors.primaryText,
                    backgroundColor: CLEAN_SURFACE_ALT,
                    marginTop: 0,
                  },
                ]}
              />
            </View>
            <View style={[styles.soloBodyGoalSection, { marginTop: spacing.sm }]}>
              <Text style={[styles.soloBodyGoalSectionLabel, typography.labelSmall]}>Objetivo principal</Text>
              <TouchableOpacity
                style={[
                  styles.soloBodyGoalDropdownTrigger,
                  {
                    borderColor: CLEAN_BORDER,
                    borderRadius: borderRadius.md,
                    backgroundColor: CLEAN_SURFACE_ALT,
                  },
                ]}
                onPress={() => setGoalPickerOpen((prev) => !prev)}
              >
                <View style={styles.soloBodyGoalDropdownValueWrap}>
                  <Ionicons name="sparkles-outline" size={15} color={DARK_MODE_ACCENT} />
                  <Text
                    style={[
                      styles.soloBodyGoalDropdownValue,
                      { color: goalInput ? DARK_MODE_ACCENT_TEXT : DARK_MODE_ACCENT_TEXT_SOFT },
                    ]}
                    numberOfLines={1}
                  >
                    {goalInput || 'Selecionar objetivo'}
                  </Text>
                </View>
                <Ionicons name={goalPickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={DARK_MODE_ACCENT_TEXT} />
              </TouchableOpacity>

              {goalPickerOpen ? (
                <View style={styles.soloBodyGoalOptionsWrap}>
                  {SOLO_BODY_GOAL_OPTIONS.map((option) => {
                    const selected = goalInput === option.label;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        style={[
                          styles.soloBodyGoalOption,
                          {
                            borderColor: selected ? DARK_MODE_ACCENT : CLEAN_BORDER,
                            backgroundColor: selected ? CLEAN_SURFACE_SOFT : CLEAN_SURFACE_ALT,
                          },
                        ]}
                        onPress={() => {
                          setGoalInput(option.label);
                          setGoalPickerOpen(false);
                        }}
                      >
                        <Text style={[styles.soloBodyGoalOptionTitle, { color: CLEAN_TEXT }]}>
                          {option.label}
                        </Text>
                        <Text style={[styles.soloBodyGoalOptionSummary, { color: CLEAN_TEXT_MUTED }]}>
                          {option.summary}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <View style={styles.soloBodySheetActions}>
              <TouchableOpacity
                style={[
                  styles.soloPremiumSaveButton,
                  {
                    flex: 1,
                    backgroundColor: CLEAN_SURFACE_ALT,
                    borderRadius: borderRadius.md,
                    borderWidth: 1,
                    borderColor: CLEAN_BORDER,
                  },
                ]}
                onPress={handleSaveBodyCheckin}
                disabled={bodyCheckinLoading}
              >
                {bodyCheckinLoading ? (
                  <ActivityIndicator size="small" color={CLEAN_TEXT} />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={16} color={CLEAN_TEXT} />
                    <Text style={[styles.soloPremiumSaveText, { color: CLEAN_TEXT }]}>Salvar check-in</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.soloNutritionSheetCloseButton, { borderRadius: borderRadius.md, borderColor: colors.border }]}
                onPress={() => {
                  setGoalPickerOpen(false);
                  setBodyCheckinOpen(false);
                }}
              >
                <Text style={[{ color: colors.primaryText }, typography.labelMedium]}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={nutritionFormOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setNutritionFormOpen(false)}
      >
        <KeyboardAvoidingView
          style={[styles.soloSheetBackdrop, { paddingBottom: 0 }]}
          behavior="height"
          keyboardVerticalOffset={0}
        >
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setNutritionFormOpen(false)} />
          <LinearGradient
            colors={['#200C0A', '#31110D', '#4A1A12']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.soloNutritionSheetCard,
              {
                borderRadius: borderRadius.lg,
                borderColor: 'rgba(255,186,158,0.28)',
              },
            ]}
          >
            <View style={styles.soloSheetHandle} />
            <View style={styles.soloNutritionSheetHeader}>
              <View style={styles.soloNutritionSheetTitleWrap}>
                <Text style={[{ color: '#FFF1EA' }, typography.titleLarge]}>Registrar refeição</Text>
                <Text style={[{ color: 'rgba(255,218,201,0.9)', marginTop: spacing.xs }, typography.bodySmall]}>
                  Busque os produtos consumidos e finalize sua refeição.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.soloNutritionSheetCloseTopButton}
                onPress={() => setNutritionFormOpen(false)}
              >
                <Ionicons name="close" size={18} color="#FFE9DD" />
              </TouchableOpacity>
            </View>

            <View style={styles.soloNutritionTopMetaRow}>
              <View style={styles.soloNutritionTopMetaPill}>
                <Ionicons name="albums-outline" size={12} color="#FFC3A7" />
                <Text style={styles.soloNutritionTopMetaText}>{foodCatalog.length} produtos</Text>
              </View>
              <View style={styles.soloNutritionTopMetaPill}>
                <Ionicons name="restaurant-outline" size={12} color="#FFC3A7" />
                <Text style={styles.soloNutritionTopMetaText}>{selectedCatalogItems.length} selecionado(s)</Text>
              </View>
            </View>

            <View
              style={[
                styles.soloFoodSearchInputWrap,
                styles.soloNutritionSearchBar,
                {
                  borderColor: 'rgba(255,186,158,0.25)',
                  backgroundColor: 'rgba(28,8,7,0.76)',
                  borderRadius: borderRadius.md,
                },
              ]}
            >
              <Ionicons name="search-outline" size={18} color="#FFCDB7" />
              <TextInput
                value={foodSearchTerm}
                onChangeText={setFoodSearchTerm}
                placeholder="Buscar alimento ou marca (ex.: Danone, frango, whey)"
                placeholderTextColor="rgba(255,203,183,0.68)"
                style={[styles.soloFoodSearchInput, { color: '#FFF1EA' }]}
                returnKeyType="search"
                onSubmitEditing={() => void handleSearchFoodWithAi(true)}
                blurOnSubmit={false}
              />
              {foodSearchTerm.length > 0 ? (
                <TouchableOpacity onPress={() => setFoodSearchTerm('')}>
                  <Ionicons name="close-circle" size={18} color="#FFCDB7" />
                </TouchableOpacity>
              ) : null}
            </View>

            {selectedCatalogItems.length > 0 ? (
              <View style={styles.soloNutritionSelectedCard}>
                <View style={styles.soloNutritionSelectedHeader}>
                  <Text style={[{ color: '#FFF1EA' }, typography.labelMedium]}>
                    Sua refeição ({selectedCatalogItems.length} itens)
                  </Text>
                  <Text style={[{ color: '#FFC3A7' }, typography.labelSmall]}>
                    ~{selectedEstimatedKcal} kcal
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.soloNutritionSelectedScroller}
                >
                  {selectedCatalogItems.map((food) => (
                    <TouchableOpacity
                      key={`sheet-selected-${food.id}`}
                      style={styles.soloNutritionSelectedPill}
                      onPress={() => handleToggleFoodItem(food)}
                    >
                      <Text style={styles.soloNutritionSelectedPillText} numberOfLines={1}>
                        {food.name}
                      </Text>
                      <Ionicons name="close" size={12} color="rgba(255,231,220,0.9)" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <View style={styles.soloNutritionSelectedEmptyCard}>
                <Ionicons name="information-circle-outline" size={14} color="#FFC8AF" />
                <Text style={[styles.soloNutritionSelectedEmptyText, { color: 'rgba(255,217,200,0.88)' }]}>
                  Toque nos produtos abaixo para montar a refeição.
                </Text>
              </View>
            )}

            <View style={styles.soloNutritionResultsHeader}>
              <Text style={[{ color: 'rgba(255,206,187,0.82)' }, typography.labelSmall]}>
                {filteredFoodCatalog.length} resultado(s)
              </Text>
              <TouchableOpacity onPress={() => void handleSearchFoodWithAi(true)} disabled={foodAiSearchLoading}>
                {foodAiSearchLoading ? (
                  <ActivityIndicator size="small" color="#FFB089" />
                ) : (
                  <Text style={[{ color: '#FFB089' }, typography.labelSmall]}>Mais resultados</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.soloNutritionSheetScroller}
              contentContainerStyle={styles.soloNutritionSheetContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {visibleFoodCatalog.length > 0 ? (
                <View style={styles.soloNutritionResultsList}>
                  {visibleFoodCatalog.map((food) => {
                    const selected = selectedCatalogItems.some((item) => item.id === food.id);
                    return (
                      <TouchableOpacity
                        key={`sheet-search-${food.id}`}
                        style={[
                          styles.soloNutritionResultRow,
                          {
                            borderColor: selected ? '#FF8A5B' : 'rgba(255,186,158,0.25)',
                            backgroundColor: selected ? 'rgba(255,112,64,0.16)' : 'rgba(33,10,8,0.74)',
                          },
                        ]}
                        onPress={() => handleToggleFoodItem(food)}
                      >
                        <View style={styles.soloNutritionResultContent}>
                          <Text style={[styles.soloNutritionResultName, { color: '#FFF1EA' }]} numberOfLines={1}>
                            {food.name}
                          </Text>
                          <Text style={[styles.soloNutritionResultCategory, { color: 'rgba(255,206,187,0.8)' }]} numberOfLines={1}>
                            {food.category}
                          </Text>
                          <Text style={styles.soloNutritionResultMacros} numberOfLines={1}>
                            {food.kcalPer100g} kcal | P {food.proteinPer100g}g | C {food.carbsPer100g}g | G {food.fatPer100g}g
                          </Text>
                        </View>
                        <View style={styles.soloNutritionResultAction}>
                          <Ionicons
                            name={selected ? 'checkmark-circle' : 'add-circle-outline'}
                            size={20}
                            color={selected ? '#FFB089' : '#FFCAAE'}
                          />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={[styles.soloSearchEmptyCard, { borderColor: 'rgba(255,186,158,0.25)', backgroundColor: 'rgba(33,10,8,0.72)' }]}>
                  <Text style={[{ color: 'rgba(255,206,187,0.84)' }, typography.labelSmall]}>
                    {foodCatalogLoading
                      ? 'Sincronizando produtos...'
                      : 'Nada encontrado para essa busca.'}
                  </Text>
                  <TouchableOpacity
                    style={[styles.soloSearchEmptyButton, { backgroundColor: 'rgba(255,123,84,0.14)', borderColor: 'rgba(255,165,135,0.45)' }]}
                    onPress={() => void handleSearchFoodWithAi(true)}
                    disabled={foodAiSearchLoading}
                  >
                    <Ionicons name="search-outline" size={14} color="#FFB089" />
                    <Text style={[styles.soloSearchEmptyButtonText, { color: '#FFB089' }]}>Buscar mais resultados</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            <View style={styles.soloNutritionFooter}>
              <View style={styles.soloNutritionFooterMeta}>
                <Text style={styles.soloNutritionFooterMetaValue}>{selectedCatalogItems.length} item(ns)</Text>
                <Text style={styles.soloNutritionFooterMetaLabel}>~{selectedEstimatedKcal} kcal estimadas</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.soloNutritionFooterPrimaryButton,
                  { backgroundColor: '#C44A2C', borderRadius: borderRadius.md },
                ]}
                onPress={handleAddMeal}
                disabled={mealLoading || selectedCatalogItems.length === 0}
              >
                {mealLoading ? (
                  <ActivityIndicator size="small" color="#FFF0E9" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#FFF0E9" />
                    <Text style={[styles.soloPremiumSaveText, { color: '#FFF0E9' }]}>Registrar agora</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={aiNoticeOpen && !!aiNoticeActive}
        transparent
        animationType="fade"
        onRequestClose={handleCloseAiNotice}
      >
        <View style={styles.soloAiNoticeBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={handleCloseAiNotice} />
          <View
            style={[
              styles.soloAiNoticeCard,
              {
                backgroundColor: colors.secondaryBackground,
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
              },
            ]}
          >
            <View style={styles.soloAiNoticeHandle} />
            <View style={styles.soloSheetHeader}>
              <View style={[styles.soloSheetIcon, { backgroundColor: `${colors.primary}22` }]}>
                <Ionicons
                  name={aiNoticeActive?.type === 'avaliacao' ? 'analytics-outline' : 'sparkles-outline'}
                  size={18}
                  color={colors.primary}
                />
              </View>
              <Text style={[{ color: colors.primaryText, flex: 1 }, typography.titleMedium]}>
                Nova sugestão da IA
              </Text>
            </View>
            <Text style={[{ color: colors.primaryText, marginTop: spacing.sm }, typography.bodyMedium]}>
              {aiNoticeActive?.title || 'Atualização do seu plano'}
            </Text>
            <Text style={[{ color: colors.secondaryText, marginTop: spacing.xs }, typography.bodySmall]}>
              {aiNoticeActive?.summary || 'A IA atualizou seu próximo passo com base no seu progresso.'}
            </Text>
            <Text style={[{ color: colors.secondaryText, marginTop: spacing.sm }, typography.labelSmall]}>
              Escolha em qual dia você quer realizar essa sugestão:
            </Text>
            <View style={[styles.soloAiNoticeDateRow, { marginTop: spacing.sm }]}>
              {calendarDays.map((day) => {
                const selected = aiNoticeSelectedDateKey === day.key;
                return (
                  <TouchableOpacity
                    key={`ai-notice-day-${day.key}`}
                    style={[
                      styles.soloAiNoticeDateChip,
                      {
                        borderRadius: borderRadius.md,
                        borderColor: selected ? DARK_MODE_ACCENT_BORDER : 'rgba(196,220,239,0.26)',
                        backgroundColor: selected ? DARK_MODE_ACCENT_SURFACE_STRONG : 'rgba(7,16,27,0.42)',
                      },
                    ]}
                    onPress={() => setAiNoticeSelectedDateKey(day.key)}
                  >
                    <Text style={[styles.soloAiNoticeDateLabel, { color: selected ? DARK_MODE_ACCENT_TEXT : '#BBD3E8' }]}>
                      {day.label}
                    </Text>
                    <Text style={[styles.soloAiNoticeDateNumber, { color: selected ? '#FFFFFF' : DARK_MODE_ACCENT_TEXT }]}>
                      {day.day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {aiNoticeQueue.length > 1 ? (
              <Text style={[{ color: colors.secondaryText, marginTop: spacing.xs }, typography.labelSmall]}>
                Você tem mais {aiNoticeQueue.length - 1} sugestão(ões) pendente(s).
              </Text>
            ) : null}
            <View style={[styles.soloSheetActions, { marginTop: spacing.lg }]}>
              <TouchableOpacity
                style={[styles.inlineButton, { backgroundColor: colors.primary, borderRadius: borderRadius.md }]}
                onPress={() => void handleScheduleAiNotice()}
              >
                <Text style={[{ color: colors.info }, typography.labelMedium]}>
                  {aiNoticeActive?.type === 'avaliacao'
                    ? 'Definir data e realizar avaliação'
                    : 'Agendar e abrir agenda'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inlineButton, { backgroundColor: colors.primaryBackground, borderRadius: borderRadius.md }]}
                onPress={() => void handleCloseAiNotice()}
              >
                <Text style={[{ color: colors.primaryText }, typography.labelMedium]}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerGradient: {
    width: '100%',
  },
  headerContent: {},
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 36,
    height: 36,
  },
  statsRow: {
    flexDirection: 'row',
  },
  alunoFocusCard: {
    borderWidth: 1,
    padding: 14,
  },
  alunoFocusHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alunoFocusCopy: {
    flex: 1,
    paddingRight: 10,
  },
  alunoFocusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: themeSpacing.sm,
  },
  alunoFocusIconWrap: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alunoFocusStatsRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  alunoFocusStatCard: {
    width: '31%',
    minWidth: 88,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  alunoAssistantCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  alunoAssistantTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alunoAssistantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  alunoAssistantBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  alunoAssistantIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  alunoAssistantUsage: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  alunoAssistantUsageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alunoAssistantUsageLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  alunoAssistantUsageValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  alunoAssistantUsageTrack: {
    marginTop: 8,
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
  },
  alunoAssistantUsageFill: {
    height: '100%',
    borderRadius: 999,
  },
  alunoAssistantActions: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  alunoAssistantActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  alunoAssistantActionPrimary: {
    backgroundColor: '#F7FBFF',
    flex: 1,
    minWidth: 150,
    marginRight: 8,
  },
  alunoAssistantActionSecondary: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    flex: 1,
    minWidth: 150,
  },
  alunoAssistantActionText: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  alunoHomeTopCards: {
    flexDirection: 'row',
    gap: 10,
  },
  alunoHomeTopCard: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 104,
  },
  alunoHomeTopIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alunoHomeTopLabel: {
    marginTop: 10,
  },
  alunoHomeTopValue: {
    marginTop: 6,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionCard: {
    alignItems: 'center',
    padding: 16,
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  functionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 4,
  },
  functionTile: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  alunoPromoBanner: {
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  alunoPromoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alunoPromoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  alunoPromoTagText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 6,
  },
  alunoPromoActions: {
    flexDirection: 'row',
    marginTop: 12,
  },
  alunoPromoButtonPrimary: {
    flex: 1,
    backgroundColor: '#F7FBFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginRight: 8,
  },
  alunoPromoButtonGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  alunoQuickHorizontalScroll: {
    paddingLeft: 2,
  },
  alunoQuickSquareCard: {
    width: 136,
    minHeight: 150,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginRight: 10,
  },
  alunoQuickSquareBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  alunoQuickSquareIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  alunoQuickSquareCopy: {
    flex: 1,
  },
  alunoQuickSquareArrow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  alunoQuickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  alunoQuickCard: {
    width: '31.5%',
    minHeight: 106,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alunoQuickIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  alunoQuickLabel: {
    textAlign: 'center',
    lineHeight: 16,
  },
  badgeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionSquare: {
    flex: 1,
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  planActionSquare: {
    width: '48%',
    flexGrow: 0,
  },
  planActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyState: {
    alignItems: 'center',
  },
  heroCard: {},
  heroCardGradient: {
    borderRadius: 16,
  },
  heroCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCardText: {
    flex: 1,
  },
  heroIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroHintRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  personalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  personalAvatar: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalInfo: {
    flex: 1,
    marginLeft: 12,
  },
  alunoPersonalMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    marginBottom: 10,
  },
  alunoPersonalMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    marginBottom: 6,
  },
  personalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  personalGhostButton: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
  },
  treinoCard: {},
  treinoCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  treinoIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  treinoInfo: {
    flex: 1,
  },
  treinoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: themeSpacing.sm,
  },
  treinoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
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
  badge: {},
  treinoAction: {},
  completedBadge: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButton: {},
  avaliacaoCard: {},
  avaliacaoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avaliacaoIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avaliacaoInfo: {
    marginLeft: 12,
    flex: 1,
  },
  avaliacaoStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  avaliacaoStat: {
    alignItems: 'center',
  },
  personalHeader: {},
  adminHeader: {},
  alunoCard: {},
  alunoCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  alunoAvatarLarge: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alunoAvatarImage: {
    width: 50,
    height: 50,
  },
  alunoAvatar: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alunoInfo: {
    marginLeft: 12,
    flex: 1,
  },
  alunoInfoBlock: {
    marginLeft: 12,
    flex: 1,
  },
  alunoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  alunoMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  statusBadge: {},
  errorBanner: {},
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  recentUserRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentUserInfo: {
    flex: 1,
    paddingRight: 12,
  },
  recentUserRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recentUserMeta: {
    alignItems: 'flex-end',
  },
  sectionCard: {},
  personalDashboardCard: {
    borderWidth: 1,
    padding: 18,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  personalHeaderCard: {
    borderWidth: 1,
    padding: 18,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  personalHeaderKicker: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  personalHeaderKickerText: {
    fontSize: 11,
    fontWeight: '700',
  },
  personalHeaderTitle: {
    marginTop: 0,
  },
  personalHeaderMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  personalHeaderMetric: {
    minWidth: 76,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  personalHeaderMetricValue: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
  },
  personalHeaderMetricLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  personalHeaderIconButton: {
    borderWidth: 1,
  },
  personalInviteCard: {
    overflow: 'hidden',
  },
  personalInviteHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  personalInviteHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  personalInviteHeaderText: {
    flex: 1,
    paddingRight: 10,
  },
  personalInviteShareButton: {
    borderWidth: 1,
  },
  personalSummaryCard: {},
  personalSummaryHeader: {
    marginBottom: 0,
  },
  personalOpenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },
  personalOpenPillText: {
    fontWeight: '700',
  },
  personalSummaryStatsRow: {
    gap: 8,
  },
  personalSummaryStatCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 10,
    minHeight: 92,
    justifyContent: 'center',
  },
  personalSummaryStatValue: {
    marginTop: 5,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28,
  },
  personalSummaryStatLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    textAlign: 'center',
  },
  personalActionSquare: {
    position: 'relative',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 118,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  personalActionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalActionLabel: {
    marginTop: 9,
    textAlign: 'left',
    fontWeight: '700',
    lineHeight: 16,
  },
  personalActionChevron: {
    alignSelf: 'flex-end',
  },
  personalEmptyState: {
    borderWidth: 1,
  },
  personalStudentCard: {
    borderWidth: 1,
    padding: 14,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  personalStudentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  personalStudentName: {
    flex: 1,
  },
  personalStudentStatusChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  personalStudentStatusText: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
    textTransform: 'capitalize',
  },
  personalStudentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 7,
  },
  personalStudentMetaText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  premiumCard: {
    overflow: 'hidden',
  },
  premiumGradient: {
    padding: 18,
    overflow: 'hidden',
  },
  premiumContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  premiumTextBlock: {
    flex: 1,
    paddingRight: 12,
  },
  premiumBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  premiumBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  premiumTitle: {
    marginTop: 8,
  },
  premiumSubtitle: {
    marginTop: 6,
    lineHeight: 18,
  },
  premiumCreditPanel: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  premiumCreditHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  premiumCreditLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  premiumCreditCount: {
    fontSize: 14,
    fontWeight: '700',
  },
  premiumCreditTrack: {
    marginTop: 8,
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
  },
  premiumCreditFill: {
    height: '100%',
    borderRadius: 999,
  },
  premiumCreditHint: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 15,
  },
  premiumCta: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  assistantActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  premiumCtaSecondary: {
    alignSelf: 'auto',
  },
  premiumCtaText: {
    fontWeight: '700',
  },
  premiumIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  premiumGlow: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  premiumGlowTwo: {
    position: 'absolute',
    bottom: -50,
    left: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  newBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
  },
  evaluationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  evaluationInfo: {
    flex: 1,
    marginLeft: 12,
  },
  evaluationPanel: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  evaluationPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  evaluationPanelTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  evaluationCountChip: {
    minWidth: 30,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  evaluationCountText: {
    fontSize: 12,
    fontWeight: '800',
  },
  evaluationCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
  },
  evaluationCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  evaluationMetaRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  evaluationTypeChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  evaluationTypeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  evaluationDateChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 10,
  },
  evaluationDateText: {
    fontSize: 11,
    fontWeight: '700',
  },
  evaluationActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  evaluationActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    gap: 6,
  },
  evaluationActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  inlineButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  personalInviteDescription: {
    lineHeight: 18,
  },
  personalInviteLinkBox: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  personalInviteButton: {
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  personalInviteButtonText: {
    fontWeight: '700',
  },
  personalInviteCodeCard: {
    borderWidth: 1,
    padding: 16,
  },
  personalInviteCodeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  personalInviteCodeLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  personalInviteStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  personalInviteStatusText: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  personalInviteCodeValue: {
    fontSize: 38,
    fontWeight: '800',
    marginTop: 8,
    lineHeight: 44,
  },
  personalInviteLinkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginTop: 12,
  },
  personalInviteLinkText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  personalInviteActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  personalInviteActionButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  personalInvitePrimaryButton: {
    borderColor: 'transparent',
  },
  personalInviteSecondaryButton: {},
  personalInviteActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  personalInviteSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  performanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  performanceCard: {
    width: '31%',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  performanceValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  performanceLabel: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  promoEditorChip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  promoEditorChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  promoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  promoPill: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  promoPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  promoPreviewCard: {
    overflow: 'hidden',
  },
  promoPreviewGlow: {
    position: 'absolute',
    top: -50,
    right: -24,
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  promoPreviewGlowBottom: {
    position: 'absolute',
    bottom: -64,
    left: -20,
    width: 170,
    height: 170,
    borderRadius: 85,
  },
  promoPreviewContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'space-between',
  },
  promoBrandChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  promoBrandChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  promoTitle: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 31,
    marginTop: 8,
  },
  promoSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  promoCodeCard: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(7,16,34,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '100%',
  },
  promoCodeLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  promoCodeValue: {
    marginTop: 4,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  promoCta: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  promoLinkText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
  },
  promoFooter: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  promoActionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  promoActionButton: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  promoActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  promoHintText: {
    fontSize: 12,
    lineHeight: 17,
  },
  promoSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  promoSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  promoSheetContainer: {
    maxHeight: '88%',
    minHeight: '62%',
  },
  promoSheetHandle: {
    width: 54,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  promoSectionBlock: {
    gap: 8,
  },
  promoSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  promoMiniButton: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  promoMiniButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  promoColorControl: {
    gap: 6,
  },
  promoColorLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  promoColorInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  promoColorSwatch: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
  },
  promoColorInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  promoApplyButton: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  promoApplyButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  promoSwatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  promoSwatchDot: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  promoPresetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  promoPresetButton: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  promoPresetButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  promoInputLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  promoInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  promoToggleRow: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  promoToggleCheck: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoToggleTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  promoToggleSub: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
  },
  promoModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  promoModalButton: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  promoModalButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  soloQuickHeader: {
    marginBottom: 12,
  },
  soloQuickGrid: {
    flexDirection: 'row',
    paddingRight: 12,
    paddingBottom: 4,
  },
  soloQuickCard: {
    width: 192,
    marginRight: 12,
    flexShrink: 0,
    borderRadius: 14,
    backgroundColor: CLEAN_SURFACE,
    shadowColor: '#101820',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 2,
  },
  soloQuickCardLast: {
    marginRight: 0,
  },
  soloQuickCardInner: {
    minHeight: 122,
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  soloQuickAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  soloQuickTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  soloQuickIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226,245,255,0.24)',
    backgroundColor: 'rgba(226,245,255,0.1)',
  },
  soloQuickLabel: {
    marginTop: 10,
  },
  soloQuickHint: {
    marginTop: 4,
    lineHeight: 16,
  },
  soloHeroCard: {
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(193,234,255,0.22)',
    shadowColor: '#101820',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 2,
  },
  soloHeroGlowPrimary: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    top: -92,
    right: -70,
    backgroundColor: 'rgba(88,205,255,0.24)',
  },
  soloHeroGlowSecondary: {
    position: 'absolute',
    width: 165,
    height: 165,
    borderRadius: 82,
    bottom: -76,
    left: -58,
    backgroundColor: 'rgba(72,140,255,0.22)',
  },
  soloHeroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  soloHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  soloHeroHeaderActions: {
    position: 'absolute',
    top: 0,
    right: 0,
    alignItems: 'center',
    gap: themeSpacing.sm,
    zIndex: 1,
  },
  soloHeroCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 88,
  },
  soloHeroTitle: {
    fontFamily: fontFamilies.outfit,
    fontSize: 30,
    fontWeight: '600',
    lineHeight: 36,
  },
  soloHeroPlanPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
    backgroundColor: CLEAN_SURFACE_ALT,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  soloHeroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  soloHeroPlanPillText: {
    color: CLEAN_TEXT,
    fontWeight: '700',
  },
  soloHeroSubscriptionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
    backgroundColor: CLEAN_SURFACE,
    padding: 10,
  },
  soloHeroSubscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  soloHeroSubscriptionCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
    backgroundColor: CLEAN_SURFACE_ALT,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  soloHeroSubscriptionCtaText: {
    color: CLEAN_TEXT,
    fontWeight: '700',
  },
  soloHeroSubscriptionMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  soloHeroSubscriptionMetaItem: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
    backgroundColor: CLEAN_SURFACE_ALT,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  soloHeroSubscriptionMetaLabel: {
    color: CLEAN_TEXT_SOFT,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  soloHeroSubscriptionMetaValue: {
    color: CLEAN_TEXT,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  soloHeroSubscriptionHint: {
    color: CLEAN_TEXT_MUTED,
    fontSize: 12,
    lineHeight: 16,
  },
  soloHeroSubscriptionSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
    backgroundColor: CLEAN_SURFACE_ALT,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  soloHeroAvatarButton: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  soloMetricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  soloMetricCard: {
    flex: 1,
    minHeight: 82,
    justifyContent: 'space-between',
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: DARK_MODE_ACCENT_BORDER_SOFT,
  },
  soloMetricHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  soloMetricIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  soloMetricTitle: {
    color: DARK_MODE_ACCENT_TEXT_MUTED,
  },
  soloMetricValue: {
    color: '#FFFFFF',
  },
  soloCalendarPremiumCard: {
    borderWidth: 1,
    borderColor: DARK_MODE_ACCENT_BORDER_SOFT,
    overflow: 'hidden',
    backgroundColor: CLEAN_SURFACE,
    shadowColor: '#101820',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 7 },
    shadowRadius: 16,
    elevation: 2,
  },
  soloPersonalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  soloPersonalTitleIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloCalendarSubtitle: {
    marginTop: 4,
    color: DARK_MODE_ACCENT_TEXT_SOFT,
  },
  soloCalendarOpenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: DARK_MODE_ACCENT_BORDER,
    backgroundColor: 'rgba(12,30,49,0.52)',
  },
  soloCalendarOpenButtonText: {
    color: DARK_MODE_ACCENT_TEXT,
    fontWeight: '700',
  },
  soloCalendarMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  soloCalendarMetaChip: {
    flex: 1,
    minHeight: 68,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DARK_MODE_ACCENT_BORDER_SOFT,
    backgroundColor: 'rgba(5,14,24,0.48)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  soloCalendarMetaLabel: {
    color: DARK_MODE_ACCENT_TEXT_SOFT,
    fontSize: 11,
    fontWeight: '600',
  },
  soloCalendarMetaValue: {
    color: '#F4FAFF',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  soloStatusValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  soloStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  soloCalendarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  soloDayChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  soloDayLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
  },
  soloDayNumber: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
  },
  soloDayCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },
  soloDayCountText: {
    fontSize: 11,
    fontWeight: '700',
  },
  soloDayAgendaCard: {
    borderWidth: 1,
    padding: 12,
  },
  soloDayAgendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  soloDayAgendaIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloDayAgendaMeta: {
    flex: 1,
    marginLeft: 10,
    marginRight: 10,
  },
  soloAiTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  soloAiTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  soloWorkoutPreview: {
    marginTop: 8,
    padding: 12,
  },
  soloSectionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  soloPremiumActionButton: {
    minHeight: 48,
    flex: 1,
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  soloPremiumActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  soloActionPrimaryButton: {
    backgroundColor: 'rgba(133,33,18,0.9)',
    borderColor: 'rgba(255,191,162,0.28)',
  },
  soloActionSecondaryButton: {
    backgroundColor: 'rgba(182,54,29,0.9)',
    borderColor: 'rgba(255,201,175,0.34)',
  },
  soloDarkActionButton: {
    backgroundColor: CLEAN_SURFACE_ALT,
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
  },
  soloLightActionButton: {
    backgroundColor: CLEAN_SURFACE_ALT,
  },
  soloMealsPreviewCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,181,153,0.26)',
    backgroundColor: 'rgba(44,12,9,0.58)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  soloMealsPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  soloMealsPreviewTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  soloMealsPreviewTitle: {
    color: '#FFEDE4',
  },
  soloMealsPreviewCountPill: {
    minWidth: 28,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,191,165,0.42)',
    backgroundColor: 'rgba(125,34,20,0.62)',
    paddingHorizontal: 8,
  },
  soloMealsPreviewCountText: {
    color: '#FFD6C5',
    fontWeight: '800',
  },
  soloMealPreviewItem: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,181,153,0.2)',
    borderRadius: 10,
    backgroundColor: 'rgba(62,16,11,0.62)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  soloMealPreviewName: {
    color: '#FFF2EC',
    fontWeight: '700',
  },
  soloMealPreviewMeta: {
    marginTop: 3,
    color: 'rgba(255,212,193,0.82)',
  },
  soloMealPreviewKcal: {
    color: '#FFC2A8',
    fontWeight: '800',
  },
  soloMealsPreviewEmpty: {
    marginTop: 10,
    color: 'rgba(255,212,193,0.82)',
    lineHeight: 18,
  },
  soloProgressPremiumCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
  },
  soloProgressPremiumHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  soloAiPulseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: CLEAN_SURFACE_ALT,
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
  },
  soloAiPulseText: {
    color: CLEAN_TEXT,
    fontSize: 11,
    fontWeight: '700',
  },
  soloProgressPremiumStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  soloProgressPremiumStatCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: CLEAN_SURFACE_ALT,
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
    alignItems: 'center',
  },
  soloProgressPremiumStatValue: {
    color: CLEAN_TEXT,
    fontSize: 20,
    fontWeight: '800',
  },
  soloProgressPremiumStatLabel: {
    marginTop: 2,
    color: CLEAN_TEXT_MUTED,
    fontSize: 11,
    fontWeight: '600',
  },
  soloAiStatusCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
    backgroundColor: CLEAN_SURFACE_ALT,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  soloAiStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  soloAiStatusText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  soloPremiumBanner: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
  },
  soloPlanBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  soloPlanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
    backgroundColor: CLEAN_SURFACE_ALT,
  },
  soloPlanBadgeText: {
    color: CLEAN_TEXT,
    fontSize: 11,
    fontWeight: '700',
  },
  soloPlanPrice: {
    color: CLEAN_TEXT,
    fontWeight: '800',
  },
  soloPlanFeatureList: {
    gap: 6,
  },
  soloPlanFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  soloPlanFeatureText: {
    flex: 1,
    color: CLEAN_TEXT_MUTED,
    fontSize: 12,
    lineHeight: 16,
  },
  soloPlanCtaButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: CLEAN_SURFACE_ALT,
    borderWidth: 1,
    borderColor: CLEAN_BORDER,
  },
  soloPlanCtaText: {
    color: CLEAN_TEXT,
    fontWeight: '800',
  },
  soloCoachBanner: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  soloCoachBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  soloCoachIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,210,191,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,210,191,0.4)',
  },
  soloCoachFeatureList: {
    gap: 5,
  },
  soloCoachFeatureText: {
    color: 'rgba(255,231,221,0.9)',
    fontSize: 12,
    lineHeight: 16,
  },
  soloCoachCtaButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFB894',
  },
  soloCoachCtaText: {
    color: '#422117',
    fontWeight: '800',
  },
  soloCoachActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  soloCoachSecondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,214,195,0.34)',
    backgroundColor: 'rgba(71,35,24,0.6)',
  },
  soloCoachSecondaryText: {
    color: '#FFE6DA',
    fontWeight: '800',
  },
  soloNutritionShell: {
    borderWidth: 1,
    borderColor: 'rgba(191,227,247,0.14)',
    overflow: 'hidden',
  },
  soloNutritionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  soloNutritionHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DARK_MODE_ACCENT_BORDER,
    backgroundColor: 'rgba(6,18,32,0.48)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  soloNutritionHeaderBadgeText: {
    color: DARK_MODE_ACCENT_TEXT,
    fontSize: 11,
    fontWeight: '700',
  },
  soloPanelAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  soloHydrationCard: {
    padding: 14,
  },
  soloHydrationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  soloHydrationBody: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  soloBottleArtwork: {
    width: 78,
    alignItems: 'center',
  },
  soloBottleCap: {
    width: 28,
    height: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  soloBottleNeck: {
    width: 20,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  soloBottleBody: {
    width: 62,
    height: 124,
    marginTop: 2,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'flex-end',
  },
  soloBottleGloss: {
    position: 'absolute',
    top: 14,
    left: 9,
    width: 10,
    height: 84,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    zIndex: 2,
  },
  soloBottleFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  soloBottleIconWrap: {
    alignItems: 'center',
    paddingBottom: 12,
    zIndex: 3,
  },
  soloHydrationContent: {
    flex: 1,
    paddingLeft: 14,
  },
  soloHydrationButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  soloHydrationButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloHydrationDots: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  soloHydrationDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloStepsCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  soloStepsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  soloStepsStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DARK_MODE_ACCENT_BORDER_SOFT,
    backgroundColor: DARK_MODE_ACCENT_SURFACE,
  },
  soloStepsStatusText: {
    color: DARK_MODE_ACCENT_TEXT,
    fontSize: 11,
    fontWeight: '700',
  },
  soloStepsMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  soloStepsMetaChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(6,18,32,0.36)',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  soloStepsMetaLabel: {
    color: 'rgba(226,243,255,0.82)',
    fontSize: 11,
    fontWeight: '600',
  },
  soloStepsMetaValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  soloNutritionCard: {
    borderWidth: 1,
    padding: 12,
  },
  soloKcalPremiumCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,181,152,0.32)',
  },
  soloKcalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  soloKcalBody: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  soloKcalArtwork: {
    width: 88,
    alignItems: 'center',
  },
  soloKcalDishRing: {
    width: 72,
    height: 112,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,225,213,0.58)',
    backgroundColor: 'rgba(48,12,8,0.46)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  soloKcalDishFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  soloKcalDishGloss: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 12,
    height: 62,
    borderRadius: 10,
    backgroundColor: 'rgba(255,230,220,0.24)',
  },
  soloKcalFoodIcon: {
    zIndex: 2,
  },
  soloKcalDishPercent: {
    marginTop: 6,
    color: '#FFD9C8',
    fontSize: 11,
    fontWeight: '800',
  },
  soloKcalContent: {
    flex: 1,
    paddingLeft: 14,
  },
  soloKcalMacroLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 9,
  },
  soloKcalMacroLegendItem: {
    color: 'rgba(255,236,228,0.92)',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(68,16,10,0.55)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  soloNutritionMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  soloNutritionMetaChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  soloMealHeroCard: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 172,
  },
  soloMealHeroImage: {
    width: '100%',
    height: 172,
  },
  soloMealHeroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  soloMacroPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  soloTodayFoodsRow: {
    gap: 8,
    paddingRight: 4,
    marginTop: 6,
  },
  soloTodayFoodChip: {
    width: 136,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(2, 15, 31, 0.56)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  soloTodayFoodImage: {
    width: '100%',
    height: 68,
  },
  soloTodayFoodMeta: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  soloTodayFoodName: {
    color: DARK_MODE_ACCENT_TEXT,
    fontSize: 12,
    fontWeight: '700',
  },
  soloTodayFoodKcal: {
    marginTop: 2,
    color: 'rgba(234,246,255,0.85)',
    fontSize: 11,
  },
  soloTodayFoodChipPlaceholder: {
    minWidth: 184,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(2,15,31,0.56)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  soloTodayFoodPlaceholderText: {
    color: 'rgba(234,246,255,0.88)',
    fontSize: 12,
    fontWeight: '600',
  },
  soloMacroPill: {
    backgroundColor: 'rgba(2, 15, 31, 0.52)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 84,
  },
  soloBodyCheckinSummaryCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  soloBodyCheckinSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  soloBodyCheckinIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: DARK_MODE_ACCENT_BORDER,
    backgroundColor: DARK_MODE_ACCENT_SURFACE,
  },
  soloBodyCheckinMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  soloBodyCheckinMetaChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(184,228,255,0.28)',
    backgroundColor: 'rgba(6,18,32,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 56,
  },
  soloBodyCheckinMetaLabel: {
    color: DARK_MODE_ACCENT_TEXT_SOFT,
    fontSize: 11,
    fontWeight: '600',
  },
  soloBodyCheckinMetaValue: {
    color: DARK_MODE_ACCENT_TEXT,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  soloBodyCheckinOpenButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: DARK_MODE_ACCENT,
  },
  soloBodyCheckinOpenButtonText: {
    color: '#06213B',
    fontWeight: '800',
  },
  soloBodyGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  soloBodyInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 8,
  },
  soloBodyGoalSection: {
    gap: 8,
  },
  soloBodyGoalSectionLabel: {
    color: 'rgba(208,235,252,0.92)',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  soloBodyGoalDropdownTrigger: {
    borderWidth: 1,
    minHeight: 48,
    backgroundColor: 'rgba(6,15,28,0.72)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  soloBodyGoalDropdownValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  soloBodyGoalDropdownValue: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  soloBodyGoalOptionsWrap: {
    gap: 8,
  },
  soloBodyGoalOption: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  soloBodyGoalOptionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  soloBodyGoalOptionSummary: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  soloMealComposerCard: {
    borderWidth: 1,
    padding: 12,
  },
  soloBodySheetCard: {
    width: '100%',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    maxHeight: '76%',
  },
  soloBodySheetActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  soloComposerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  soloComposerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  soloComposerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  soloFoodSearchInputWrap: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    minHeight: 44,
    gap: 8,
  },
  soloFoodSearchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
  },
  soloCategoryChipsRow: {
    gap: 8,
    paddingRight: 4,
  },
  soloCategoryChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    maxWidth: 170,
  },
  soloCategoryChipText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  soloSearchSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  soloSelectedFoodRow: {
    gap: 8,
    paddingRight: 4,
  },
  soloSelectedFoodChip: {
    maxWidth: 180,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  soloSelectedFoodImage: {
    width: 26,
    height: 26,
    borderRadius: 7,
  },
  soloSelectedFoodText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  soloFoodCatalogList: {
    gap: 8,
  },
  soloFoodResultCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    minHeight: 88,
  },
  soloFoodResultImage: {
    width: 88,
    height: '100%',
  },
  soloFoodResultMeta: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  soloFoodResultTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  soloFoodResultMacros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 5,
  },
  soloFoodResultMacroPill: {
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(3,12,24,0.42)',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  soloFoodSelectBadge: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloSearchEmptyCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  soloSearchEmptyButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  soloSearchEmptyButtonText: {
    fontSize: 11,
    fontWeight: '700',
  },
  soloPremiumSaveButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  soloPremiumSaveText: {
    fontSize: 13,
    fontWeight: '700',
  },
  soloNutritionSheetCard: {
    width: '100%',
    flex: 1,
    marginTop: 72,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  soloNutritionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  soloNutritionSheetTitleWrap: {
    flex: 1,
  },
  soloNutritionSheetHeaderRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  soloNutritionSheetCloseTopButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,200,178,0.36)',
    backgroundColor: 'rgba(59,17,12,0.62)',
  },
  soloNutritionSheetBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  soloNutritionSheetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DARK_MODE_ACCENT_BORDER_SOFT,
    backgroundColor: DARK_MODE_ACCENT_SURFACE,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  soloNutritionSheetBadgeText: {
    color: DARK_MODE_ACCENT_TEXT,
    fontSize: 11,
    fontWeight: '700',
  },
  soloNutritionTopMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  soloNutritionTopMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,178,146,0.35)',
    backgroundColor: 'rgba(118,34,20,0.42)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  soloNutritionTopMetaText: {
    color: '#FFD8C7',
    fontSize: 11,
    fontWeight: '700',
  },
  soloNutritionAiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DARK_MODE_ACCENT_BORDER,
    backgroundColor: 'rgba(10,26,44,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  soloNutritionAiButtonText: {
    color: DARK_MODE_ACCENT_TEXT,
    fontSize: 11,
    fontWeight: '700',
  },
  soloNutritionSheetSearchInput: {
    marginTop: 10,
  },
  soloNutritionSearchBar: {
    minHeight: 50,
    marginTop: 10,
  },
  soloNutritionSelectedCard: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,176,146,0.34)',
    backgroundColor: 'rgba(46,14,10,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  soloNutritionSelectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  soloNutritionSelectedScroller: {
    gap: 8,
    marginTop: 8,
    paddingRight: 4,
  },
  soloNutritionSelectedPill: {
    maxWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(91,26,18,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,190,164,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  soloNutritionSelectedPillText: {
    color: '#FFF1EA',
    fontSize: 12,
    fontWeight: '600',
  },
  soloNutritionSelectedEmptyCard: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,182,154,0.26)',
    backgroundColor: 'rgba(45,13,10,0.68)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  soloNutritionSelectedEmptyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  soloNutritionResultsHeader: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  soloNutritionSheetCategoryRow: {
    marginTop: 8,
  },
  soloNutritionSheetScroller: {
    marginTop: 8,
    flex: 1,
  },
  soloNutritionSheetContent: {
    paddingBottom: 10,
  },
  soloNutritionResultsList: {
    gap: 8,
  },
  soloNutritionResultRow: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  soloNutritionResultImage: {
    width: 72,
    height: '100%',
  },
  soloNutritionResultContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  soloNutritionResultName: {
    fontSize: 14,
    fontWeight: '700',
  },
  soloNutritionResultCategory: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  soloNutritionResultMacros: {
    marginTop: 5,
    fontSize: 11,
    color: '#FFC3A6',
    fontWeight: '600',
  },
  soloNutritionResultAction: {
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloNutritionFooter: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,186,158,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  soloNutritionFooterMeta: {
    minWidth: 84,
  },
  soloNutritionFooterMetaValue: {
    color: '#FFF1EA',
    fontSize: 13,
    fontWeight: '800',
  },
  soloNutritionFooterMetaLabel: {
    marginTop: 1,
    color: 'rgba(255,208,190,0.86)',
    fontSize: 11,
    fontWeight: '600',
  },
  soloNutritionFooterPrimaryButton: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  soloNutritionSheetActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  soloNutritionSheetCloseButton: {
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloNutritionSheetField: {
    marginTop: 8,
  },
  soloFoodCatalogCard: {
    borderWidth: 1,
    padding: 12,
  },
  soloFoodCatalogGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  soloFoodCatalogItem: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    minHeight: 180,
  },
  soloFoodCatalogImage: {
    width: '100%',
    height: 92,
  },
  soloFoodCatalogMeta: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  soloFoodCatalogMacroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  soloFoodCatalogMacro: {
    fontSize: 11,
    fontWeight: '700',
  },
  soloMealCard: {
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  soloMealCardImage: {
    width: '100%',
    height: 132,
  },
  soloMealCardBody: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  soloMealTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  soloMealMacroRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8,
  },
  soloMealFoodScroller: {
    marginTop: 9,
    gap: 8,
    paddingRight: 4,
  },
  soloMealFoodChip: {
    width: 132,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  soloMealFoodImage: {
    width: '100%',
    height: 64,
  },
  soloMealFoodMeta: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  soloCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  soloCounterButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloCounterValue: {
    alignItems: 'center',
  },
  soloProgressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  soloProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  soloMealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  soloMealMeta: {
    flex: 1,
    paddingRight: 12,
  },
  soloMealKcalBlock: {
    alignItems: 'flex-end',
  },
  soloMealTag: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  soloSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 10,
  },
  soloSheetCard: {
    width: '100%',
  },
  soloSheetHandle: {
    width: 50,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  soloSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  soloSheetIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  soloSheetActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  soloAiNoticeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  soloAiNoticeCard: {
    width: '100%',
    maxWidth: 520,
    borderWidth: 1,
    borderColor: 'rgba(182,218,242,0.2)',
  },
  soloAiNoticeHandle: {
    width: 54,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  soloAiNoticeDateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  soloAiNoticeDateChip: {
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  soloAiNoticeDateLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  soloAiNoticeDateNumber: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: '800',
  },
});
