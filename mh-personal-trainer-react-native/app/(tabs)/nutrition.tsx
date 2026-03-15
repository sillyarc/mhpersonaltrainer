import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pedometer } from 'expo-sensors';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useAuthStore } from '../../src/store/authStore';
import { User } from '../../src/types/user';
import { generateText } from '../../src/services/ai';
import { showAlert } from '../../src/utils/alert';

type Meal = { id: string; name: string; kcal: number; protein: number; carbs: number; fat: number };
type WeatherSnapshot = {
  city: string;
  summary: string;
  temperatureC: number | null;
  precipitationProbability: number | null;
  isHot: boolean;
  isRainRisk: boolean;
  fetchedAt: string;
};
type DailyState = {
  waterMl: number;
  stepsToday: number;
  meals: Meal[];
  aiInsight: string;
  aiInsightUpdatedAt: string | null;
  weatherSnapshot?: WeatherSnapshot | null;
};
type WeeklyPoint = { key: string; label: string; waterMl: number; stepsToday: number; kcal: number };
type FoodCatalogItem = {
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
  source?: 'base' | 'community';
};
type FoodCatalogSnapshot = { items: FoodCatalogItem[]; updatedAt?: string | null };

const STORAGE_PREFIX = '@mh:nutri:v4';
const FOOD_CATALOG_STORAGE_PREFIX = '@mh:nutri:food-catalog';
const FOOD_CACHE_LIMIT = 320;
const FOOD_SEARCH_MIN_ITEMS = 12;
const WATER_STEP = 250;
const WATER_GOAL = 2500;
const STEPS_GOAL = 8000;

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

const dateKey = () => new Date().toISOString().slice(0, 10);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const dayLabel = (d: Date) => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][d.getDay()] || '--';
const formatTemp = (v: number | null) => (v === null ? '--' : `${Math.round(v)}Â°C`);
const parseMacroValue = (value: any) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 10) / 10);
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

const buildFoodItemId = (name: string, fallback: string = 'food') => {
  const normalized = normalizeFoodNameKey(name);
  if (normalized.length > 0) return `food-${normalized}`;
  return `${fallback}-${hashFoodKey(name)}`;
};

const foodMatchesTokens = (food: FoodCatalogItem, tokens: string[]) => {
  if (!tokens.length) return true;
  const haystack = normalizeSearchText(`${food.name} ${food.category}`);
  return tokens.every((token) => haystack.includes(token));
};

const buildFoodSearchRank = (food: FoodCatalogItem, tokens: string[]) => {
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
  current: FoodCatalogItem[],
  incoming: FoodCatalogItem[],
  options?: { popularityBoost?: number; source?: 'base' | 'community' }
) => {
  const nextMap = new Map<string, FoodCatalogItem>();
  const popularityBoost = Math.max(1, Number(options?.popularityBoost || 1));
  const source = options?.source || 'community';

  const upsert = (item: FoodCatalogItem) => {
    const name = String(item.name || '').trim();
    if (!name) return;

    const key = normalizeFoodNameKey(name) || `food-${hashFoodKey(name)}`;
    const existing = nextMap.get(key);
    const currentPopularity = Number(existing?.popularity || 0);
    const incomingPopularity = Number(item.popularity || 0);

    const merged: FoodCatalogItem = {
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
    .slice(0, FOOD_CACHE_LIMIT);
};

const FOOD_SEED: FoodCatalogItem[] = [
  { id: 'food-iogurte-danone-natural', name: 'Iogurte Danone Natural', category: 'laticinios', kcalPer100g: 62, proteinPer100g: 3.4, carbsPer100g: 7.1, fatPer100g: 2.1, imageUrl: buildFoodImageUrl('iogurte danone natural'), popularity: 40, source: 'base' },
  { id: 'food-iogurte-grego-yopro', name: 'YoPRO Iogurte Grego', category: 'laticinios', kcalPer100g: 74, proteinPer100g: 10, carbsPer100g: 5.3, fatPer100g: 0.2, imageUrl: buildFoodImageUrl('yopro iogurte grego'), popularity: 36, source: 'base' },
  { id: 'food-leite-ninho-integral', name: 'Leite Ninho Integral', category: 'laticinios', kcalPer100g: 63, proteinPer100g: 3.3, carbsPer100g: 5, fatPer100g: 3.5, imageUrl: buildFoodImageUrl('leite ninho integral'), popularity: 30, source: 'base' },
  { id: 'food-frango-grelhado', name: 'Frango grelhado', category: 'proteinas', kcalPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6, imageUrl: buildFoodImageUrl('frango grelhado'), popularity: 38, source: 'base' },
  { id: 'food-ovo-cozido', name: 'Ovo cozido', category: 'proteinas', kcalPer100g: 155, proteinPer100g: 13, carbsPer100g: 1.1, fatPer100g: 11, imageUrl: buildFoodImageUrl('ovo cozido'), popularity: 35, source: 'base' },
  { id: 'food-whey-growth', name: 'Whey Protein Growth', category: 'suplementos', kcalPer100g: 392, proteinPer100g: 79, carbsPer100g: 8.2, fatPer100g: 6.1, imageUrl: buildFoodImageUrl('whey protein growth'), popularity: 39, source: 'base' },
  { id: 'food-whey-max', name: 'Whey Max Titanium', category: 'suplementos', kcalPer100g: 402, proteinPer100g: 76, carbsPer100g: 11, fatPer100g: 6.2, imageUrl: buildFoodImageUrl('whey max titanium'), popularity: 34, source: 'base' },
  { id: 'food-arroz-integral', name: 'Arroz integral cozido', category: 'carboidratos', kcalPer100g: 124, proteinPer100g: 2.6, carbsPer100g: 25.8, fatPer100g: 1, imageUrl: buildFoodImageUrl('arroz integral cozido'), popularity: 32, source: 'base' },
  { id: 'food-feijao-carioca', name: 'Feijao carioca cozido', category: 'carboidratos', kcalPer100g: 76, proteinPer100g: 4.8, carbsPer100g: 13.6, fatPer100g: 0.5, imageUrl: buildFoodImageUrl('feijao carioca cozido'), popularity: 31, source: 'base' },
  { id: 'food-pao-wickbold', name: 'Pao integral Wickbold', category: 'industrializados', kcalPer100g: 247, proteinPer100g: 9.2, carbsPer100g: 44.9, fatPer100g: 4.2, imageUrl: buildFoodImageUrl('pao integral wickbold'), popularity: 28, source: 'base' },
  { id: 'food-banana-prata', name: 'Banana prata', category: 'frutas', kcalPer100g: 98, proteinPer100g: 1.3, carbsPer100g: 26, fatPer100g: 0.1, imageUrl: buildFoodImageUrl('banana prata'), popularity: 33, source: 'base' },
  { id: 'food-maca-gala', name: 'Maca gala', category: 'frutas', kcalPer100g: 56, proteinPer100g: 0.3, carbsPer100g: 14.8, fatPer100g: 0.2, imageUrl: buildFoodImageUrl('maca gala'), popularity: 26, source: 'base' },
];

const weatherLabel = (code: number | null) => {
  if (code === null) return 'clima variavel';
  if ([0].includes(code)) return 'ceu limpo';
  if ([1, 2].includes(code)) return 'parcialmente nublado';
  if ([3].includes(code)) return 'nublado';
  if ([61, 63, 65, 80, 81, 82].includes(code)) return 'chuva';
  return 'clima instavel';
};

const fetchWeatherSnapshot = async (user: User | null): Promise<WeatherSnapshot | null> => {
  const lat = user?.location?.latitude;
  const lon = user?.location?.longitude;
  const cityLabel = [user?.cidade, user?.estado].filter(Boolean).join(' - ');
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=precipitation_probability_max&timezone=auto`
  );
  if (!response.ok) return null;

  const payload = await response.json();
  const temperature = Number.isFinite(Number(payload?.current?.temperature_2m)) ? Number(payload.current.temperature_2m) : null;
  const code = Number.isFinite(Number(payload?.current?.weather_code)) ? Number(payload.current.weather_code) : null;
  const precip = Array.isArray(payload?.daily?.precipitation_probability_max) && Number.isFinite(Number(payload.daily.precipitation_probability_max[0]))
    ? Number(payload.daily.precipitation_probability_max[0])
    : null;

  return {
    city: cityLabel || 'sua regiao',
    summary: weatherLabel(code),
    temperatureC: temperature,
    precipitationProbability: precip,
    isHot: (temperature ?? 0) >= 31,
    isRainRisk: (precip ?? 0) >= 50,
    fetchedAt: new Date().toISOString(),
  };
};

const buildInsightFallback = (params: {
  waterMl: number;
  stepsToday: number;
  kcal: number;
  mealsCount: number;
  weather: WeatherSnapshot | null;
}) => {
  const { waterMl, stepsToday, kcal, mealsCount, weather } = params;
  const hydration = Math.round((waterMl / WATER_GOAL) * 100);
  const stepsPct = Math.round((stepsToday / STEPS_GOAL) * 100);
  const lines = [
    `Resumo do dia: agua ${hydration}% da meta e passos ${stepsToday.toLocaleString('pt-BR')} (${stepsPct}%).`,
    `${kcal} kcal registradas em ${mealsCount} refeicoes.`,
  ];
  if (weather) {
    lines.push(`Clima em ${weather.city}: ${weather.summary}, ${formatTemp(weather.temperatureC)}.`);
    if (weather.isHot) lines.push('Dia quente: reduza corrida no sol e hidrate mais.');
    else if (weather.isRainRisk) lines.push('Risco de chuva: prefira treino indoor.');
  }
  if (hydration < 60) lines.push('Ajuste: aumente ingestao de agua ainda hoje.');
  if (mealsCount === 0) lines.push('Ajuste: registre ao menos 2 refeicoes para a IA te orientar melhor.');
  return lines.join('\n');
};

export default function NutritionTabScreen() {
  const { colors, typography } = useTheme();
  const { padding } = useResponsive();
  const { user } = useAuthStore();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadingAi, setLoadingAi] = useState(false);
  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [mealLoading, setMealLoading] = useState(false);

  const [waterMl, setWaterMl] = useState(0);
  const [stepsToday, setStepsToday] = useState(0);
  const [pedometerAvailable, setPedometerAvailable] = useState(false);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [aiInsight, setAiInsight] = useState('');
  const [aiInsightUpdatedAt, setAiInsightUpdatedAt] = useState<string | null>(null);
  const [weatherSnapshot, setWeatherSnapshot] = useState<WeatherSnapshot | null>(null);
  const [todayStamp, setTodayStamp] = useState(dateKey());
  const [weeklyPoints, setWeeklyPoints] = useState<WeeklyPoint[]>([]);

  const [foodCatalog, setFoodCatalog] = useState<FoodCatalogItem[]>([]);
  const [foodCatalogLoading, setFoodCatalogLoading] = useState(false);
  const [foodCatalogUpdatedAt, setFoodCatalogUpdatedAt] = useState<Date | null>(null);
  const [foodSearchLoading, setFoodSearchLoading] = useState(false);
  const [foodSearchTerm, setFoodSearchTerm] = useState('');
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<FoodCatalogItem[]>([]);

  const pedometerBaseRef = useRef(0);
  const lastFoodSearchRequestRef = useRef('');

  const storageKey = useMemo(() => (user?.uid ? `${STORAGE_PREFIX}:${user.uid}:${todayStamp}` : null), [user?.uid, todayStamp]);
  const foodCatalogStorageKey = useMemo(
    () => (user?.uid ? `${FOOD_CATALOG_STORAGE_PREFIX}:${user.uid}` : null),
    [user?.uid]
  );
  const hasPremium = Boolean(user?.assinatura || user?.planoChatGPT || user?.tipoDeAssinatura);

  const cups = Math.round(waterMl / WATER_STEP);
  const cupsGoal = Math.round(WATER_GOAL / WATER_STEP);
  const waterProgress = Math.min(100, Math.round((waterMl / WATER_GOAL) * 100));
  const stepsProgress = Math.min(100, Math.round((stepsToday / Math.max(1, STEPS_GOAL)) * 100));
  const kcal = meals.reduce((sum, meal) => sum + meal.kcal, 0);
  const protein = meals.reduce((sum, meal) => sum + meal.protein, 0);
  const carbs = meals.reduce((sum, meal) => sum + meal.carbs, 0);
  const fat = meals.reduce((sum, meal) => sum + meal.fat, 0);
  const walkingDistanceKm = ((stepsToday * 0.75) / 1000).toFixed(2);
  const walkingCalories = Math.round(stepsToday * 0.045);
  const weeklyAvgWater = useMemo(() => (weeklyPoints.length ? Math.round(weeklyPoints.reduce((s, p) => s + p.waterMl, 0) / weeklyPoints.length) : 0), [weeklyPoints]);
  const weeklyAvgSteps = useMemo(() => (weeklyPoints.length ? Math.round(weeklyPoints.reduce((s, p) => s + p.stepsToday, 0) / weeklyPoints.length) : 0), [weeklyPoints]);
  const weeklyTotalKcal = useMemo(() => weeklyPoints.reduce((s, p) => s + p.kcal, 0), [weeklyPoints]);
  const weeklyScore = useMemo(() => {
    if (!weeklyPoints.length) return 0;
    const total = weeklyPoints.reduce((sum, point) => {
      const w = Math.min(100, Math.round((point.waterMl / WATER_GOAL) * 100));
      const s = Math.min(100, Math.round((point.stepsToday / STEPS_GOAL) * 100));
      return sum + Math.round(w * 0.45 + s * 0.55);
    }, 0);
    return Math.round(total / weeklyPoints.length);
  }, [weeklyPoints]);

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

  const weeklyDisplay = useMemo(() => {
    if (weeklyPoints.length) return weeklyPoints;
    const now = new Date();
    return Array.from({ length: 7 }).map((_, idx) => {
      const day = new Date(now);
      day.setDate(now.getDate() - (6 - idx));
      return { key: day.toISOString().slice(0, 10), label: dayLabel(day), waterMl: 0, stepsToday: 0, kcal: 0 };
    });
  }, [weeklyPoints]);

  const requestFoodsFromPublicSearch = useCallback(async (searchTerm: string) => {
    const url = `https://br.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
      searchTerm
    )}&search_simple=1&action=process&json=1&page_size=120&fields=product_name,product_name_pt,brands,categories,categories_pt,countries,countries_tags,lang,lc,nutriments,image_front_url,image_url`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Nao foi possivel consultar produtos agora.');
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
        const kcalValue =
          Number(nutriments?.['energy-kcal_100g']) ||
          Number(nutriments?.energy_kcal_100g) ||
          Number(nutriments?.['energy-kcal']) ||
          (Number(nutriments?.energy_100g) > 0 ? Number(nutriments?.energy_100g) / 4.184 : 0);

        return {
          id: buildFoodItemId(name, 'food-public'),
          name,
          category: categories || 'geral',
          kcalPer100g: Math.max(0, Math.round(Number(kcalValue || 0))),
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
      .slice(0, 80) as FoodCatalogItem[];
  }, []);

  const handleSearchFoods = useCallback(async (forceRemote: boolean = false) => {
    const searchTerm = foodSearchTerm.trim();
    if (!searchTerm) {
      showAlert('Busca de alimentos', 'Digite um produto para buscar.');
      return;
    }
    if (foodSearchLoading) return;

    const searchTokens = tokenizeFoodSearch(searchTerm);
    const normalizedRequest = `${normalizeFoodNameKey(searchTerm)}:${forceRemote ? '1' : '0'}`;
    if (!forceRemote && lastFoodSearchRequestRef.current === normalizedRequest) {
      const alreadyHasVisibleResults = foodCatalog.some((item) => foodMatchesTokens(item, searchTokens));
      if (alreadyHasVisibleResults) return;
    }

    setFoodSearchLoading(true);
    try {
      const localMatchesCount = foodCatalog.filter((item) => foodMatchesTokens(item, searchTokens)).length;
      let publicItems: FoodCatalogItem[] = [];

      if (forceRemote || localMatchesCount < FOOD_SEARCH_MIN_ITEMS || searchTerm.length >= 2) {
        publicItems = await requestFoodsFromPublicSearch(searchTerm);
        if (publicItems.length > 0) {
          setFoodCatalog((prev) => mergeFoodCatalogItems(prev, publicItems, { popularityBoost: 4, source: 'community' }));
        }
      }

      if (localMatchesCount === 0 && publicItems.length === 0) {
        showAlert('Busca de alimentos', 'Nenhum produto encontrado para esse termo. Tente outra busca.');
      }

      setFoodCatalogUpdatedAt(new Date());
      lastFoodSearchRequestRef.current = normalizedRequest;
    } catch (error: any) {
      showAlert('Busca de alimentos', error?.message || 'Nao foi possivel buscar produtos agora.');
    } finally {
      setFoodSearchLoading(false);
    }
  }, [foodSearchTerm, foodSearchLoading, foodCatalog, requestFoodsFromPublicSearch]);

  const handleToggleFoodItem = useCallback((food: FoodCatalogItem) => {
    setSelectedCatalogItems((prev) => {
      const exists = prev.some((item) => item.id === food.id);
      if (exists) return prev.filter((item) => item.id !== food.id);
      return [food, ...prev].slice(0, 30);
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTodayStamp((current) => {
        const now = dateKey();
        return current === now ? current : now;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!storageKey) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as DailyState;
          if (!cancelled) {
            setWaterMl(Math.max(0, Number(parsed?.waterMl || 0)));
            setStepsToday(Math.max(0, Number(parsed?.stepsToday || 0)));
            setMeals(Array.isArray(parsed?.meals) ? parsed.meals : []);
            setAiInsight(String(parsed?.aiInsight || ''));
            setAiInsightUpdatedAt(parsed?.aiInsightUpdatedAt || null);
            setWeatherSnapshot(parsed?.weatherSnapshot || null);
          }
        } else if (!cancelled) {
          setWaterMl(0);
          setStepsToday(0);
          setMeals([]);
          setAiInsight('');
          setAiInsightUpdatedAt(null);
          setWeatherSnapshot(null);
        }
      } catch (_) {
        if (!cancelled) showAlert('Nutri', 'Nao foi possivel carregar seus dados.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    run();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || loading) return;
    const payload: DailyState = { waterMl, stepsToday, meals, aiInsight, aiInsightUpdatedAt, weatherSnapshot };
    AsyncStorage.setItem(storageKey, JSON.stringify(payload)).catch(() => undefined);
  }, [storageKey, loading, waterMl, stepsToday, meals, aiInsight, aiInsightUpdatedAt, weatherSnapshot]);

  useEffect(() => {
    let active = true;

    const loadCatalog = async () => {
      setFoodCatalogLoading(true);
      try {
        if (!foodCatalogStorageKey) {
          if (active) {
            setFoodCatalog(mergeFoodCatalogItems([], FOOD_SEED, { popularityBoost: 6, source: 'base' }));
            setFoodCatalogUpdatedAt(null);
          }
          return;
        }

        const raw = await AsyncStorage.getItem(foodCatalogStorageKey);
        if (!active) return;

        if (!raw) {
          setFoodCatalog(mergeFoodCatalogItems([], FOOD_SEED, { popularityBoost: 6, source: 'base' }));
          setFoodCatalogUpdatedAt(null);
          return;
        }

        const parsed = JSON.parse(raw) as FoodCatalogSnapshot;
        const storedItems = Array.isArray(parsed?.items) ? parsed.items.slice(0, FOOD_CACHE_LIMIT) : [];
        setFoodCatalog(mergeFoodCatalogItems(storedItems, FOOD_SEED, { popularityBoost: 6, source: 'base' }));
        setFoodCatalogUpdatedAt(parsed?.updatedAt ? new Date(parsed.updatedAt) : null);
      } catch (_) {
        if (active) {
          setFoodCatalog(mergeFoodCatalogItems([], FOOD_SEED, { popularityBoost: 6, source: 'base' }));
          setFoodCatalogUpdatedAt(null);
        }
      } finally {
        if (active) setFoodCatalogLoading(false);
      }
    };

    loadCatalog().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [foodCatalogStorageKey]);

  useEffect(() => {
    if (!foodCatalogStorageKey) return;
    const payload: FoodCatalogSnapshot = {
      items: foodCatalog.slice(0, FOOD_CACHE_LIMIT),
      updatedAt: foodCatalogUpdatedAt?.toISOString() || null,
    };
    AsyncStorage.setItem(foodCatalogStorageKey, JSON.stringify(payload)).catch(() => undefined);
  }, [foodCatalogStorageKey, foodCatalog, foodCatalogUpdatedAt]);

  useEffect(() => {
    let mounted = true;
    let sub: { remove: () => void } | null = null;

    const run = async () => {
      try {
        const available = await Pedometer.isAvailableAsync();
        if (!mounted) return;
        setPedometerAvailable(available);
        if (!available) return;

        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const counted = await Pedometer.getStepCountAsync(start, new Date());
        if (!mounted) return;

        pedometerBaseRef.current = Math.max(0, Number(counted?.steps || 0));
        setStepsToday(pedometerBaseRef.current);

        sub = Pedometer.watchStepCount((result) => {
          setStepsToday(pedometerBaseRef.current + Math.max(0, Number(result?.steps || 0)));
        }) as { remove: () => void };
      } catch (_) {
        if (mounted) setPedometerAvailable(false);
      }
    };

    run();
    return () => {
      mounted = false;
      if (sub) sub.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadWeek = async () => {
      if (!user?.uid) {
        if (!cancelled) setWeeklyPoints([]);
        return;
      }

      const now = new Date();
      const list: WeeklyPoint[] = [];
      for (let i = 6; i >= 0; i -= 1) {
        const day = new Date(now);
        day.setDate(now.getDate() - i);
        day.setHours(12, 0, 0, 0);
        const key = day.toISOString().slice(0, 10);
        const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}:${user.uid}:${key}`);
        const parsed = raw ? (JSON.parse(raw) as DailyState) : null;
        const dayMeals = Array.isArray(parsed?.meals) ? parsed.meals : [];
        list.push({
          key,
          label: dayLabel(day),
          waterMl: Math.max(0, Number(parsed?.waterMl || 0)),
          stepsToday: Math.max(0, Number(parsed?.stepsToday || 0)),
          kcal: dayMeals.reduce((sum, meal) => sum + Number(meal?.kcal || 0), 0),
        });
      }
      if (!cancelled) setWeeklyPoints(list);
    };

    loadWeek().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.uid, storageKey]);

  useEffect(() => {
    const today = dateKey();
    setWeeklyPoints((prev) => {
      if (!prev.length) return prev;
      let changed = false;
      const next = prev.map((point) => {
        if (point.key !== today) return point;
        changed = true;
        return { ...point, waterMl, stepsToday, kcal };
      });
      return changed ? next : prev;
    });
  }, [waterMl, stepsToday, kcal]);

  useEffect(() => {
    if (!mealModalOpen) return;
    const searchTerm = foodSearchTerm.trim();
    if (searchTerm.length < 2) return;
    const timer = setTimeout(() => {
      void handleSearchFoods(false);
    }, 480);
    return () => clearTimeout(timer);
  }, [mealModalOpen, foodSearchTerm, handleSearchFoods]);

  useEffect(() => {
    let cancelled = false;

    const autoRefreshInsight = async () => {
      if (!storageKey || loading || loadingAi) return;
      const generatedToday = aiInsightUpdatedAt?.slice(0, 10) === todayStamp && String(aiInsight || '').trim().length > 0;
      if (generatedToday) return;

      try {
        setLoadingAi(true);
        const weather = await fetchWeatherSnapshot(user);
        if (!cancelled) setWeatherSnapshot(weather);

        const fallback = buildInsightFallback({
          waterMl,
          stepsToday,
          kcal,
          mealsCount: meals.length,
          weather,
        });

        let finalInsight = fallback;
        try {
          const weatherLine = weather
            ? `${weather.summary}, ${formatTemp(weather.temperatureC)} em ${weather.city}.`
            : 'Sem dados de clima para a regiao.';
          const prompt = [
            'Voce e especialista em nutricao esportiva e saude.',
            'Responda em portugues-BR com resumo + 3 ajustes + 2 proximos passos.',
            `Data: ${todayStamp}`,
            `Clima: ${weatherLine}`,
            `Agua: ${waterMl}/${WATER_GOAL}ml`,
            `Passos: ${stepsToday}/${STEPS_GOAL}`,
            `Refeicoes: ${meals.length}`,
            `Kcal: ${kcal}, P:${protein}g C:${carbs}g G:${fat}g`,
          ].join('\n');
          const response = await generateText(prompt);
          const aiText = String(response || '').trim();
          if (aiText) finalInsight = aiText;
        } catch (_) {
          // fallback local
        }

        if (!cancelled) {
          setAiInsight(finalInsight);
          setAiInsightUpdatedAt(new Date().toISOString());
        }
      } finally {
        if (!cancelled) setLoadingAi(false);
      }
    };

    autoRefreshInsight().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    storageKey,
    loading,
    loadingAi,
    todayStamp,
    user,
    aiInsight,
    aiInsightUpdatedAt,
    waterMl,
    stepsToday,
    kcal,
    meals.length,
    protein,
    carbs,
    fat,
  ]);

  const addPresetMeal = (name: string, kcalValue: number, proteinValue: number, carbsValue: number, fatValue: number) => {
    const item: Meal = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      kcal: kcalValue,
      protein: proteinValue,
      carbs: carbsValue,
      fat: fatValue,
    };
    setMeals((prev) => [item, ...prev].slice(0, 40));
  };

  const removeMeal = (mealId: string) => setMeals((prev) => prev.filter((item) => item.id !== mealId));

  const addMealFromSelection = () => {
    if (!selectedCatalogItems.length) {
      showAlert('Refeicao', 'Selecione pelo menos 1 produto para registrar sua refeicao.');
      return;
    }

    setMealLoading(true);
    try {
      const mealDescription = selectedCatalogItems
        .slice(0, 4)
        .map((item) => item.name)
        .join(', ');
      const mealEntry: Meal = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: mealDescription,
        kcal: Math.max(0, Math.round(selectedCatalogItems.reduce((sum, item) => sum + Number(item.kcalPer100g || 0), 0))),
        protein: parseMacroValue(selectedCatalogItems.reduce((sum, item) => sum + Number(item.proteinPer100g || 0), 0)),
        carbs: parseMacroValue(selectedCatalogItems.reduce((sum, item) => sum + Number(item.carbsPer100g || 0), 0)),
        fat: parseMacroValue(selectedCatalogItems.reduce((sum, item) => sum + Number(item.fatPer100g || 0), 0)),
      };

      setMeals((prev) => [mealEntry, ...prev].slice(0, 40));
      const learnedFoods = selectedCatalogItems.map((item) => ({
        ...item,
        popularity: Math.max(2, Number(item.popularity || 0) + 2),
      }));
      setFoodCatalog((prev) => mergeFoodCatalogItems(prev, learnedFoods, { popularityBoost: 2, source: 'community' }));
      setFoodCatalogUpdatedAt(new Date());
      setSelectedCatalogItems([]);
      setFoodSearchTerm('');
      setMealModalOpen(false);
    } finally {
      setMealLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: padding, paddingBottom: 14 }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={['#08172B', '#0D3B6E', '#1A69BE']} style={styles.hero}>
          <View style={styles.heroGlowPrimary} />
          <View style={styles.heroGlowSecondary} />
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroOverline}>{hasPremium ? 'MH Nutri Pro' : 'MH Nutri inteligente'}</Text>
              <Text style={[styles.heroTitle, typography.headlineSmall]}>Evolucao de verdade</Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons name={hasPremium ? 'shield-checkmark-outline' : 'sparkles-outline'} size={13} color="#9DDCFF" />
              <Text style={styles.heroBadgeText}>{hasPremium ? 'Premium ativo' : 'Plano free'}</Text>
            </View>
          </View>
          <Text style={styles.heroSubtitle}>Agua, passos, refeicoes e insights diarios no mesmo painel.</Text>
          <View style={styles.heroStats}>
            <HeroStat label="Agua" value={`${cups}/${cupsGoal}`} />
            <HeroStat label="Passos" value={stepsToday.toLocaleString('pt-BR')} />
            <HeroStat label="Refeicoes" value={`${meals.length}`} />
          </View>
          <View style={styles.heroQuickRow}>
            <HeroQuickAction icon="water-outline" label="+250ml" onPress={() => setWaterMl((prev) => clamp(prev + WATER_STEP, 0, 9000))} />
            <HeroQuickAction icon="restaurant-outline" label="Nova refeicao" onPress={() => setMealModalOpen(true)} />
            <HeroQuickAction icon="sparkles-outline" label="Atualizar IA" onPress={() => setAiInsightUpdatedAt(null)} loading={loadingAi} />
          </View>
        </LinearGradient>

        <LinearGradient colors={['#101A2A', '#15283F', '#1A3452']} style={styles.weeklyCard}>
          <LinearGradient colors={[DARK_MODE_ACCENT_ALT, DARK_MODE_ACCENT]} style={styles.weeklyAccent} />
          <View style={styles.weeklyHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.weeklyTitle}>Desempenho semanal</Text>
              <Text style={styles.weeklySubtitle}>Pontuacao combinada de agua e passos</Text>
            </View>
            <View style={styles.weeklyScoreBadge}>
              <Text style={styles.weeklyScoreValue}>{weeklyScore}</Text>
              <Text style={styles.weeklyScoreLabel}>score</Text>
            </View>
          </View>
          <View style={styles.weeklyBars}>
            {weeklyDisplay.map((point) => {
              const water = Math.min(100, Math.round((point.waterMl / WATER_GOAL) * 100));
              const steps = Math.min(100, Math.round((point.stepsToday / Math.max(1, STEPS_GOAL)) * 100));
              const score = clamp(Math.round(water * 0.45 + steps * 0.55), 0, 100);
              return <WeeklyBar key={point.key} label={point.label} value={score} active={point.key === todayStamp} empty={point.waterMl === 0 && point.stepsToday === 0 && point.kcal === 0} />;
            })}
          </View>
          <View style={styles.chipRow}>
            <MetricChip label="Media agua" value={`${weeklyAvgWater}ml`} />
            <MetricChip label="Media passos" value={weeklyAvgSteps.toLocaleString('pt-BR')} />
            <MetricChip label="Kcal semana" value={weeklyTotalKcal.toLocaleString('pt-BR')} />
          </View>
        </LinearGradient>

        <SectionCard title="Passos" subtitle={pedometerAvailable ? 'Sensor em tempo real' : 'Sensor indisponivel no aparelho'} value={stepsToday.toLocaleString('pt-BR')} icon="walk-outline" iconColor={DARK_MODE_ACCENT_TEXT} gradient={['#0E1C2D', '#163552', '#1D4F76']}>
          <Progress progress={stepsProgress} color={DARK_MODE_ACCENT} track="rgba(255,255,255,0.2)" />
          <View style={styles.chipRow}>
            <MetricChip label="Meta" value={STEPS_GOAL.toLocaleString('pt-BR')} />
            <MetricChip label="Distancia" value={`${walkingDistanceKm} km`} />
            <MetricChip label="Gasto" value={`${walkingCalories} kcal`} />
          </View>
          <View style={styles.autoStepHintWrap}>
            <Ionicons name="information-circle-outline" size={14} color={DARK_MODE_ACCENT_TEXT} />
            <Text style={styles.autoStepHint}>Passos atualizam automaticamente pelo sensor do aparelho.</Text>
          </View>
        </SectionCard>

        <SectionCard title="Hidratacao" subtitle="Controle de agua diario" value={`${waterMl}ml`} icon="water-outline" iconColor={DARK_MODE_ACCENT_TEXT} gradient={['#0B2949', '#13426E', '#1F6CB8']}>
          <View style={styles.hydrationBody}>
            <View style={styles.bottleWrap}>
              <View style={styles.bottleCap} />
              <View style={styles.bottleNeck} />
              <View style={styles.bottleBody}>
                <View style={styles.bottleGloss} />
                <LinearGradient colors={[DARK_MODE_ACCENT_ALT, DARK_MODE_ACCENT, DARK_MODE_ACCENT_DEEP]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[styles.bottleWater, { height: `${Math.max(waterProgress, waterMl > 0 ? 8 : 0)}%` }]} />
                <View style={styles.bottleIconWrap}><Ionicons name="water" size={18} color={DARK_MODE_ACCENT_TEXT} /></View>
              </View>
            </View>
            <View style={styles.hydrationInfo}>
              <Text style={styles.hydrationLead}>{waterProgress}% da meta</Text>
              <Progress progress={waterProgress} color={DARK_MODE_ACCENT} track="rgba(255,255,255,0.2)" />
              <View style={[styles.chipRow, { marginTop: 8 }]}>
                <MetricChip label="Copos" value={`${cups}/${cupsGoal}`} />
                <MetricChip label="Meta" value={`${WATER_GOAL} ml`} />
                <MetricChip label="Status" value={`${waterProgress}%`} />
              </View>
              <View style={[styles.row, { marginTop: 6 }]}>
                <TouchableOpacity style={styles.hydrationActionBtn} onPress={() => setWaterMl((prev) => clamp(prev - WATER_STEP, 0, 9000))}><Text style={styles.hydrationActionText}>- 250ml</Text></TouchableOpacity>
                <TouchableOpacity style={styles.hydrationActionBtn} onPress={() => setWaterMl((prev) => clamp(prev + WATER_STEP, 0, 9000))}><Text style={styles.hydrationActionText}>+ 250ml</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </SectionCard>

        <SectionCard title="Refeicoes" subtitle="Macros e calorias do dia" value={`${meals.length}`} icon="restaurant-outline" iconColor="#FFD8BF" gradient={['#32120F', '#5A2016', '#A33A25']}>
          <View style={styles.chipRow}>
            <MetricChip label="Kcal" value={`${kcal}`} />
            <MetricChip label="P" value={`${Math.round(protein)}g`} />
            <MetricChip label="C" value={`${Math.round(carbs)}g`} />
            <MetricChip label="G" value={`${Math.round(fat)}g`} />
          </View>
          <View style={styles.quickMealRow}>
            <TouchableOpacity style={styles.quickMealBtn} onPress={() => addPresetMeal('Cafe da manha', 360, 18, 39, 11)}><Text style={styles.quickMealLabel}>Cafe</Text></TouchableOpacity>
            <TouchableOpacity style={styles.quickMealBtn} onPress={() => addPresetMeal('Almoco base', 520, 32, 48, 16)}><Text style={styles.quickMealLabel}>Almoco</Text></TouchableOpacity>
            <TouchableOpacity style={styles.quickMealBtn} onPress={() => addPresetMeal('Jantar leve', 420, 30, 28, 14)}><Text style={styles.quickMealLabel}>Jantar</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.primaryBtn, styles.lightButton]} onPress={() => setMealModalOpen(true)}>
            <Ionicons name="add-circle-outline" size={16} color="#06213B" />
            <Text style={styles.primaryBtnLabel}>Nova refeicao</Text>
          </TouchableOpacity>
          {meals.length === 0 ? <Text style={styles.cardHint}>Nenhuma refeicao registrada hoje.</Text> : meals.slice(0, 4).map((item) => (
            <View key={item.id} style={styles.mealRow}>
              <Text style={styles.mealText}>{item.name}</Text>
              <View style={styles.mealActions}>
                <Text style={styles.mealKcal}>{item.kcal} kcal</Text>
                <TouchableOpacity style={styles.mealDeleteBtn} onPress={() => removeMeal(item.id)}><Ionicons name="trash-outline" size={13} color="#F9C4B7" /></TouchableOpacity>
              </View>
            </View>
          ))}
        </SectionCard>

        <SectionCard title="Insight IA" subtitle={aiInsightUpdatedAt ? `Atualizacao automatica ${new Date(aiInsightUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Aguardando primeira atualizacao'} value={hasPremium ? 'PRO' : 'FREE'} icon="sparkles-outline" iconColor="#C6B6FF" gradient={['#111B33', '#1D2F4F', '#273C5F']}>
          {loadingAi ? <View style={styles.autoInsightLoading}><ActivityIndicator size="small" color={DARK_MODE_ACCENT} /><Text style={styles.autoInsightLoadingText}>Atualizando insight automaticamente...</Text></View> : null}
          {weatherSnapshot ? <View style={styles.weatherTag}><Ionicons name={weatherSnapshot.isHot ? 'sunny-outline' : weatherSnapshot.isRainRisk ? 'rainy-outline' : 'partly-sunny-outline'} size={14} color={DARK_MODE_ACCENT_TEXT} /><Text style={styles.weatherTagText}>{weatherSnapshot.city}: {weatherSnapshot.summary} ({formatTemp(weatherSnapshot.temperatureC)})</Text></View> : null}
          {aiInsight ? <View style={styles.insightBubble}><Text style={styles.cardHint}>{aiInsight}</Text></View> : <Text style={styles.cardHint}>A IA monta automaticamente seus insights diarios.</Text>}
          {!hasPremium ? <TouchableOpacity style={styles.outlinePremiumBtn} onPress={() => router.push('/profile/subscription' as any)}><Ionicons name="rocket-outline" size={14} color={DARK_MODE_ACCENT_TEXT} /><Text style={styles.outlinePremiumLabel}>Upgrade para insights ilimitados</Text></TouchableOpacity> : null}
        </SectionCard>

        {!hasPremium ? (
          <LinearGradient colors={['#15233A', '#1A335A', '#245CA0']} style={styles.upgradeCard}>
            <View style={styles.upgradeHeader}><View style={styles.upgradeIconWrap}><Ionicons name="flash-outline" size={16} color={DARK_MODE_ACCENT_TEXT} /></View><Text style={styles.upgradeTitle}>Quer destravar o modo premium?</Text></View>
            <Text style={styles.upgradeText}>Plano individual com IA ampliada, analises detalhadas e mais precisao nas recomendacoes.</Text>
            <TouchableOpacity style={styles.upgradeButton} onPress={() => router.push('/profile/subscription' as any)}><Text style={styles.upgradeButtonText}>Ver planos e assinar</Text></TouchableOpacity>
          </LinearGradient>
        ) : null}
      </ScrollView>

      <Modal visible={mealModalOpen} transparent animationType="slide" onRequestClose={() => setMealModalOpen(false)}>
        <KeyboardAvoidingView
          style={[styles.soloSheetBackdrop, { paddingBottom: 0 }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setMealModalOpen(false)} />
          <LinearGradient colors={['#200C0A', '#31110D', '#4A1A12']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.soloNutritionSheetCard}>
            <View style={styles.soloSheetHandle} />
            <View style={styles.soloNutritionSheetHeader}>
              <View style={styles.soloNutritionSheetTitleWrap}>
                <Text style={[{ color: '#FFF1EA' }, typography.titleLarge]}>Registrar refeicao</Text>
                <Text style={[{ color: 'rgba(255,218,201,0.9)', marginTop: 4 }, typography.bodySmall]}>
                  Busque os produtos consumidos e finalize sua refeicao.
                </Text>
              </View>
              <TouchableOpacity style={styles.soloNutritionSheetCloseTopButton} onPress={() => setMealModalOpen(false)}>
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
              {foodCatalogUpdatedAt ? (
                <View style={styles.soloNutritionTopMetaPill}>
                  <Ionicons name="time-outline" size={12} color="#FFC3A7" />
                  <Text style={styles.soloNutritionTopMetaText}>{foodCatalogUpdatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.soloFoodSearchInputWrap, styles.soloNutritionSearchBar]}>
              <Ionicons name="search-outline" size={18} color="#FFCDB7" />
              <TextInput
                value={foodSearchTerm}
                onChangeText={setFoodSearchTerm}
                placeholder="Buscar alimento ou marca (ex.: Danone, frango, whey)"
                placeholderTextColor="rgba(255,203,183,0.68)"
                style={[styles.soloFoodSearchInput, { color: '#FFF1EA' }]}
                returnKeyType="search"
                onSubmitEditing={() => void handleSearchFoods(true)}
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
                    Sua refeicao ({selectedCatalogItems.length} itens)
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
                  Toque nos produtos abaixo para montar a refeicao.
                </Text>
              </View>
            )}

            <View style={styles.soloNutritionResultsHeader}>
              <Text style={[{ color: 'rgba(255,206,187,0.82)' }, typography.labelSmall]}>
                {filteredFoodCatalog.length} resultado(s)
              </Text>
              <TouchableOpacity onPress={() => void handleSearchFoods(true)} disabled={foodSearchLoading}>
                {foodSearchLoading ? (
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
                    {foodCatalogLoading ? 'Sincronizando produtos...' : 'Nada encontrado para essa busca.'}
                  </Text>
                  <TouchableOpacity
                    style={[styles.soloSearchEmptyButton, { backgroundColor: 'rgba(255,123,84,0.14)', borderColor: 'rgba(255,165,135,0.45)' }]}
                    onPress={() => void handleSearchFoods(true)}
                    disabled={foodSearchLoading}
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
                  { backgroundColor: '#C44A2C', opacity: mealLoading || selectedCatalogItems.length === 0 ? 0.6 : 1 },
                ]}
                onPress={addMealFromSelection}
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
    </SafeAreaView>
  );
}

function SectionCard({ title, subtitle, value, icon, iconColor, gradient, children }: { title: string; subtitle: string; value: string; icon: keyof typeof Ionicons.glyphMap; iconColor: string; gradient: [string, string, string]; children: React.ReactNode; }) {
  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <LinearGradient colors={[DARK_MODE_ACCENT_ALT, DARK_MODE_ACCENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cardAccent} />
      <View style={styles.cardHead}>
        <View style={styles.cardTitleWrap}>
          <View style={styles.cardIconWrap}><Ionicons name={icon} size={14} color={iconColor} /></View>
          <View><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardSubtitle}>{subtitle}</Text></View>
        </View>
        <Text style={styles.cardValue}>{value}</Text>
      </View>
      {children}
    </LinearGradient>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return <View style={styles.heroStat}><Text style={styles.heroStatLabel}>{label}</Text><Text style={styles.heroStatValue}>{value}</Text></View>;
}

function HeroQuickAction({ icon, label, onPress, loading = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; loading?: boolean; }) {
  return <TouchableOpacity style={styles.heroQuickBtn} onPress={onPress} disabled={loading}>{loading ? <ActivityIndicator size="small" color={DARK_MODE_ACCENT_TEXT} /> : <Ionicons name={icon} size={14} color={DARK_MODE_ACCENT_TEXT} />}<Text style={styles.heroQuickLabel}>{label}</Text></TouchableOpacity>;
}

function WeeklyBar({ label, value, active, empty }: { label: string; value: number; active: boolean; empty: boolean }) {
  const safe = clamp(value, 0, 100);
  return <View style={styles.weeklyBarItem}><View style={[styles.weeklyBarTrack, active && styles.weeklyBarTrackActive]}><View style={[styles.weeklyBarFill, { height: `${Math.max(safe, empty ? 6 : 10)}%`, backgroundColor: active ? DARK_MODE_ACCENT_ALT : empty ? 'rgba(172,205,231,0.2)' : DARK_MODE_ACCENT }]} /></View><Text style={[styles.weeklyBarLabel, active && styles.weeklyBarLabelActive]}>{label}</Text></View>;
}

function Progress({ progress, color, track }: { progress: number; color: string; track: string }) {
  const safe = clamp(progress, 0, 100);
  return <View style={[styles.track, { backgroundColor: track }]}><View style={[styles.fill, { width: `${safe}%`, backgroundColor: color }]} /></View>;
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return <View style={styles.metricChip}><Text style={styles.metricChipLabel}>{label}</Text><Text style={styles.metricChipValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 12, gap: 14 },
  hero: { borderRadius: 22, padding: 16, gap: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(149,214,255,0.26)' },
  heroGlowPrimary: { position: 'absolute', right: -34, top: -22, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(147,227,255,0.18)' },
  heroGlowSecondary: { position: 'absolute', left: -46, bottom: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(73,176,255,0.18)' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  heroOverline: { color: '#CFE6FF', fontSize: 13, fontWeight: '700', marginBottom: 5 },
  heroTitle: { color: '#F6FBFF', fontSize: 34, fontWeight: '800' },
  heroSubtitle: { color: '#D7EAFE', fontSize: 14, lineHeight: 20, maxWidth: '92%' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, borderColor: DARK_MODE_ACCENT_BORDER, backgroundColor: 'rgba(0,0,0,0.24)', paddingHorizontal: 9, paddingVertical: 6 },
  heroBadgeText: { color: '#CBEAFC', fontSize: 11, fontWeight: '700' },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: 4 },
  heroQuickRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  heroQuickBtn: { flex: 1, height: 38, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(195,231,255,0.34)', backgroundColor: 'rgba(6,19,34,0.34)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  heroQuickLabel: { color: '#D9EEFF', fontSize: 12, fontWeight: '700' },
  heroStat: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', padding: 9, backgroundColor: 'rgba(6, 19, 34, 0.24)' },
  heroStatLabel: { color: '#CFE6FF', fontSize: 12 },
  heroStatValue: { color: '#F6FBFF', fontSize: 17, fontWeight: '700' },
  weeklyCard: { borderRadius: 18, padding: 14, gap: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  weeklyAccent: { position: 'absolute', left: 0, right: 0, top: 0, height: 3 },
  weeklyHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weeklyTitle: { color: DARK_MODE_ACCENT_TEXT, fontSize: 20, fontWeight: '700' },
  weeklySubtitle: { color: DARK_MODE_ACCENT_TEXT_MUTED, fontSize: 12, marginTop: 1 },
  weeklyScoreBadge: { minWidth: 74, borderRadius: 13, borderWidth: 1, borderColor: DARK_MODE_ACCENT_BORDER, backgroundColor: 'rgba(6,19,34,0.35)', paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center' },
  weeklyScoreValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', lineHeight: 24 },
  weeklyScoreLabel: { color: DARK_MODE_ACCENT_TEXT, fontSize: 11, fontWeight: '700', marginTop: 1 },
  weeklyBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 7, marginTop: 2 },
  weeklyBarItem: { flex: 1, alignItems: 'center', gap: 6 },
  weeklyBarTrack: { width: '100%', height: 84, borderRadius: 12, justifyContent: 'flex-end', overflow: 'hidden', borderWidth: 1, borderColor: DARK_MODE_ACCENT_BORDER_SOFT, backgroundColor: 'rgba(2,8,16,0.35)', paddingHorizontal: 5, paddingBottom: 5 },
  weeklyBarTrackActive: { borderColor: DARK_MODE_ACCENT_BORDER, backgroundColor: 'rgba(14,40,63,0.5)' },
  weeklyBarFill: { width: '100%', borderRadius: 8 },
  weeklyBarLabel: { color: DARK_MODE_ACCENT_TEXT_SOFT, fontSize: 11, fontWeight: '700' },
  weeklyBarLabelActive: { color: DARK_MODE_ACCENT_TEXT },
  card: { borderRadius: 18, padding: 14, gap: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  cardAccent: { position: 'absolute', left: 0, right: 0, top: 0, height: 3 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: DARK_MODE_ACCENT_BORDER, backgroundColor: DARK_MODE_ACCENT_SURFACE },
  cardTitle: { color: DARK_MODE_ACCENT_TEXT, fontSize: 20, fontWeight: '700' },
  cardSubtitle: { color: DARK_MODE_ACCENT_TEXT_MUTED, fontSize: 12, marginTop: 1 },
  cardValue: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  track: { height: 8, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%' },
  row: { flexDirection: 'row', gap: 10 },
  autoStepHintWrap: { borderWidth: 1, borderColor: DARK_MODE_ACCENT_BORDER_SOFT, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  autoStepHint: { color: DARK_MODE_ACCENT_TEXT, fontSize: 12, flex: 1 },
  hydrationBody: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  bottleWrap: { width: 95, alignItems: 'center', justifyContent: 'center' },
  bottleCap: { width: 34, height: 7, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: 'rgba(230,238,248,0.58)' },
  bottleNeck: { width: 24, height: 10, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: 'rgba(25,71,132,0.35)', marginBottom: 4 },
  bottleBody: { width: 82, height: 170, borderRadius: 28, borderWidth: 2, borderColor: 'rgba(25,71,132,0.55)', backgroundColor: 'rgba(4, 20, 35, 0.4)', overflow: 'hidden', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 12 },
  bottleWater: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bottleGloss: { position: 'absolute', left: 12, top: 18, width: 12, height: 92, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.24)' },
  bottleIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: DARK_MODE_ACCENT_BORDER_SOFT },
  hydrationInfo: { flex: 1, gap: 8, justifyContent: 'space-between' },
  hydrationLead: { color: DARK_MODE_ACCENT_TEXT, fontSize: 14, fontWeight: '700' },
  hydrationActionBtn: { flex: 1, height: 40, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center' },
  hydrationActionText: { color: DARK_MODE_ACCENT_TEXT, fontSize: 14, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricChip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', backgroundColor: 'rgba(6,18,32,0.32)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 7, minWidth: 74 },
  metricChipLabel: { color: DARK_MODE_ACCENT_TEXT_SOFT, fontSize: 11, fontWeight: '600' },
  metricChipValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', marginTop: 2 },
  cardHint: { color: DARK_MODE_ACCENT_TEXT_MUTED, fontSize: 13, lineHeight: 18 },
  quickMealRow: { flexDirection: 'row', gap: 8 },
  quickMealBtn: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', borderRadius: 10, paddingVertical: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  quickMealLabel: { color: '#FFE9DD', fontSize: 12, fontWeight: '700' },
  primaryBtn: { height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  primaryBtnLabel: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  lightButton: { backgroundColor: DARK_MODE_ACCENT },
  mealRow: { borderWidth: 1, borderRadius: 10, borderColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  mealText: { color: '#F4FAFF', fontSize: 14, fontWeight: '700', flex: 1 },
  mealActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 10 },
  mealKcal: { color: DARK_MODE_ACCENT_TEXT, fontSize: 12, fontWeight: '700', marginLeft: 8 },
  mealDeleteBtn: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(249,196,183,0.34)', backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  autoInsightLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: DARK_MODE_ACCENT_BORDER_SOFT, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 10, paddingVertical: 8 },
  autoInsightLoadingText: { color: DARK_MODE_ACCENT_TEXT, fontSize: 12 },
  weatherTag: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: DARK_MODE_ACCENT_BORDER_SOFT, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.24)', paddingHorizontal: 10, paddingVertical: 8 },
  weatherTagText: { color: DARK_MODE_ACCENT_TEXT, fontSize: 12, flex: 1 },
  insightBubble: { borderWidth: 1, borderColor: 'rgba(198,182,255,0.32)', backgroundColor: 'rgba(12,20,36,0.5)', borderRadius: 11, padding: 10 },
  outlinePremiumBtn: { height: 40, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(176,224,255,0.35)', backgroundColor: 'rgba(0,0,0,0.26)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  outlinePremiumLabel: { color: DARK_MODE_ACCENT_TEXT, fontSize: 13, fontWeight: '700' },
  upgradeCard: { borderRadius: 18, borderWidth: 1, borderColor: DARK_MODE_ACCENT_BORDER_SOFT, padding: 14, gap: 10 },
  upgradeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  upgradeIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: DARK_MODE_ACCENT_BORDER, backgroundColor: DARK_MODE_ACCENT_SURFACE },
  upgradeTitle: { color: DARK_MODE_ACCENT_TEXT, fontSize: 17, fontWeight: '800', flex: 1 },
  upgradeText: { color: DARK_MODE_ACCENT_TEXT_MUTED, fontSize: 13, lineHeight: 18 },
  upgradeButton: { height: 42, borderRadius: 10, backgroundColor: DARK_MODE_ACCENT, alignItems: 'center', justifyContent: 'center' },
  upgradeButtonText: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  soloSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 10,
  },
  soloSheetHandle: {
    width: 50,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  soloFoodSearchInputWrap: {
    borderWidth: 1,
    borderColor: 'rgba(255,186,158,0.25)',
    backgroundColor: 'rgba(28,8,7,0.76)',
    borderRadius: 12,
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
  soloPremiumSaveText: {
    fontSize: 13,
    fontWeight: '700',
  },
  soloNutritionSheetCard: {
    width: '100%',
    flex: 1,
    marginTop: 72,
    borderWidth: 1,
    borderRadius: 18,
    borderColor: 'rgba(255,186,158,0.28)',
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
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});

