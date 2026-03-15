import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { useResponsive } from '../../src/hooks/useResponsive';
import { firestoreService, PersonalProfile } from '../../src/services/firestoreService';
import { fetchStripeConnectStatus } from '../../src/services/payments';
import { spacing, borderRadius } from '../../src/theme';

const LOCATION_STORAGE_KEY = '@mh-agenda-fit:selected-location:v1';

const STATE_ALIASES: Record<string, string> = {
  ac: 'ac',
  acre: 'ac',
  al: 'al',
  alagoas: 'al',
  ap: 'ap',
  amapa: 'ap',
  am: 'am',
  amazonas: 'am',
  ba: 'ba',
  bahia: 'ba',
  ce: 'ce',
  ceara: 'ce',
  df: 'df',
  'distrito federal': 'df',
  es: 'es',
  'espirito santo': 'es',
  go: 'go',
  goias: 'go',
  ma: 'ma',
  maranhao: 'ma',
  mt: 'mt',
  'mato grosso': 'mt',
  ms: 'ms',
  'mato grosso do sul': 'ms',
  mg: 'mg',
  'minas gerais': 'mg',
  pa: 'pa',
  para: 'pa',
  pb: 'pb',
  paraiba: 'pb',
  pr: 'pr',
  parana: 'pr',
  pe: 'pe',
  pernambuco: 'pe',
  pi: 'pi',
  piaui: 'pi',
  rj: 'rj',
  'rio de janeiro': 'rj',
  rn: 'rn',
  'rio grande do norte': 'rn',
  rs: 'rs',
  'rio grande do sul': 'rs',
  ro: 'ro',
  rondonia: 'ro',
  rr: 'rr',
  roraima: 'rr',
  sc: 'sc',
  'santa catarina': 'sc',
  sp: 'sp',
  'sao paulo': 'sp',
  se: 'se',
  sergipe: 'se',
  to: 'to',
  tocantins: 'to',
};

const normalizeText = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const normalizeState = (value?: string | null) => {
  const normalized = normalizeText(value).replace(/\s+/g, ' ');
  return STATE_ALIASES[normalized] || normalized.replace(/\s+/g, '');
};

const formatLocationLabel = (city?: string, state?: string) => {
  const parts = [city, state].map((value) => String(value || '').trim()).filter(Boolean);
  return parts.length ? parts.join(' - ') : 'Todos os locais';
};

export default function MHAgendaFitScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { isDesktop, isTablet } = useResponsive();
  const [personals, setPersonals] = useState<PersonalProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [locationLoaded, setLocationLoaded] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [draftCity, setDraftCity] = useState('');
  const [draftState, setDraftState] = useState('');

  const getDistanceKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const hasActiveReceiving = useCallback(async (personal: PersonalProfile) => {
    const accountId = String(personal.stripeAccountId || '').trim();
    if (!accountId) return false;

    const status = await fetchStripeConnectStatus(personal.uid, accountId);
    if (!status.data) {
      return Boolean(personal.stripeAtivo);
    }
    return Boolean(status.data?.chargesEnabled) && status.data?.detailsSubmitted !== false;
  }, []);

  const loadPersonals = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const result = await firestoreService.fetchPersonals();
      const checks = await Promise.allSettled(
        result.map(async (personal) => ((await hasActiveReceiving(personal)) ? personal : null))
      );
      const onlyActive = checks
        .filter((item): item is PromiseFulfilledResult<PersonalProfile | null> => item.status === 'fulfilled')
        .map((item) => item.value)
        .filter((item): item is PersonalProfile => Boolean(item));
      setPersonals(onlyActive);
    } finally {
      if (mode === 'initial') {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [hasActiveReceiving]);

  useEffect(() => {
    loadPersonals('initial');
  }, [loadPersonals]);

  useEffect(() => {
    let active = true;

    const loadStoredLocation = async () => {
      try {
        const stored = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
        if (!active) return;

        if (stored) {
          const parsed = JSON.parse(stored);
          setSelectedCity(String(parsed?.city || ''));
          setSelectedState(String(parsed?.state || ''));
        } else {
          setSelectedCity(user?.cidade || '');
          setSelectedState(user?.estado || '');
        }
      } catch {
        if (!active) return;
        setSelectedCity(user?.cidade || '');
        setSelectedState(user?.estado || '');
      } finally {
        if (active) {
          setLocationLoaded(true);
        }
      }
    };

    loadStoredLocation();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const saveSelectedLocation = useCallback(async (city: string, state: string) => {
    try {
      await AsyncStorage.setItem(
        LOCATION_STORAGE_KEY,
        JSON.stringify({
          city: city.trim(),
          state: state.trim(),
        })
      );
    } catch {
      // Ignore write errors so UX is not blocked.
    }
  }, []);

  const applySelectedLocation = useCallback(
    async (city: string, state: string) => {
      const nextCity = city.trim();
      const nextState = state.trim();
      setSelectedCity(nextCity);
      setSelectedState(nextState);
      setLocationModalVisible(false);
      await saveSelectedLocation(nextCity, nextState);
    },
    [saveSelectedLocation]
  );

  const openLocationModal = useCallback(() => {
    setDraftCity(selectedCity || user?.cidade || '');
    setDraftState(selectedState || user?.estado || '');
    setLocationModalVisible(true);
  }, [selectedCity, selectedState, user?.cidade, user?.estado]);

  const locationSuggestions = useMemo(() => {
    const map = new Map<
      string,
      {
        city: string;
        state: string;
        count: number;
      }
    >();

    personals.forEach((item) => {
      const city = String(item.cidade || '').trim();
      const state = String(item.estado || '').trim();
      if (!city && !state) return;

      const key = `${normalizeText(city)}|${normalizeState(state)}`;
      const current = map.get(key);
      if (current) {
        current.count += 1;
        return;
      }
      map.set(key, {
        city,
        state,
        count: 1,
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [personals]);

  const selectedLocationLabel = useMemo(() => {
    if (selectedCity.trim() || selectedState.trim()) {
      return formatLocationLabel(selectedCity, selectedState);
    }
    if (user?.cidade || user?.estado) {
      return `${formatLocationLabel(user?.cidade, user?.estado)} (perfil)`;
    }
    return 'Todos os locais';
  }, [selectedCity, selectedState, user?.cidade, user?.estado]);

  const locationIsFiltered = Boolean(selectedCity.trim() || selectedState.trim());

  const filterByLocation = useCallback((list: PersonalProfile[], cityNorm: string, stateNorm: string) => {
    return list.filter((item) => {
      const itemCity = normalizeText(item.cidade);
      const itemState = normalizeState(item.estado);
      const cityMatches = cityNorm
        ? itemCity === cityNorm || itemCity.includes(cityNorm) || cityNorm.includes(itemCity)
        : true;
      const stateMatches = stateNorm ? itemState === stateNorm : true;
      return cityMatches && stateMatches;
    });
  }, []);

  const filtered = useMemo(() => {
    const selectedCityNorm = normalizeText(selectedCity);
    const selectedStateNorm = normalizeState(selectedState);
    const userCityNorm = normalizeText(user?.cidade);
    const userStateNorm = normalizeState(user?.estado);
    const base = personals.filter((item) => item.uid !== user?.uid);
    if (!base.length) return [];

    let nearby: PersonalProfile[] = base;

    if (selectedCityNorm || selectedStateNorm) {
      nearby = filterByLocation(base, selectedCityNorm, selectedStateNorm);

      if (!nearby.length && selectedStateNorm) {
        nearby = filterByLocation(base, '', selectedStateNorm);
      }
      if (!nearby.length) {
        nearby = base;
      }
    } else if (userCityNorm || userStateNorm) {
      nearby = filterByLocation(base, userCityNorm, userStateNorm);

      if (!nearby.length && userStateNorm) {
        nearby = filterByLocation(base, '', userStateNorm);
      }
      if (!nearby.length && user?.location) {
        const byDistance = base.filter((item) =>
          item.location ? getDistanceKm(user.location!, item.location) <= 80 : false
        );
        nearby = byDistance.length ? byDistance : base;
      }
      if (!nearby.length) {
        nearby = base;
      }
    } else if (user?.location) {
      const byDistance = base.filter((item) =>
        item.location ? getDistanceKm(user.location!, item.location) <= 80 : false
      );
      nearby = byDistance.length ? byDistance : base;
    }

    const normalizedQuery = normalizeText(query);
    const searched = !normalizedQuery
      ? nearby
      : nearby.filter((item) => {
          const name = normalizeText(item.displayName);
          const speciality = normalizeText(item.especializacao || '');
          const city = normalizeText(item.cidade || '');
          return (
            name.includes(normalizedQuery) ||
            speciality.includes(normalizedQuery) ||
            city.includes(normalizedQuery)
          );
        });

    const referenceCity = selectedCityNorm || userCityNorm;
    const referenceState = selectedStateNorm || userStateNorm;

    return [...searched].sort((a, b) => {
      const score = (item: PersonalProfile) => {
        let value = 0;
        if (referenceCity && normalizeText(item.cidade) === referenceCity) value += 2;
        if (referenceState && normalizeState(item.estado) === referenceState) value += 1;
        return value;
      };
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return String(a.displayName || '').localeCompare(String(b.displayName || ''));
    });
  }, [
    personals,
    query,
    selectedCity,
    selectedState,
    user?.cidade,
    user?.estado,
    user?.location,
    user?.uid,
    filterByLocation,
  ]);

  const resultLabel = useMemo(() => {
    if (loading && !locationLoaded) return 'Carregando locais...';
    if (!filtered.length && !loading) {
      return locationIsFiltered
        ? 'Nenhum personal no local selecionado.'
        : 'Nenhum personal encontrado.';
    }
    const suffix = filtered.length === 1 ? '' : 's';
    return `${filtered.length} personal${suffix} encontrado${suffix}`;
  }, [filtered.length, loading, locationIsFiltered, locationLoaded]);

  const renderItem = ({ item }: { item: PersonalProfile }) => {
    const services = item.servicos || [];
    const locationText = [item.cidade, item.estado].filter(Boolean).join(' - ');

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}
        onPress={() => router.push(`/mh-agenda-fit/${item.uid}` as any)}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={['rgba(72,170,255,0.18)', 'rgba(18,45,73,0.08)', 'rgba(0,0,0,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardGlow}
        />
        <View style={styles.cardHeader}>
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {item.displayName?.[0]?.toUpperCase() || 'P'}
              </Text>
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {item.displayName}
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.especializacao || 'Personal trainer'}
            </Text>
            {!!locationText && (
              <View style={styles.locationInline}>
                <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                <Text style={[styles.cardSubtitle, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
                  {locationText}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.cardMetaRow}>
          <View style={[styles.metaBadge, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '3D' }]}>
            <Ionicons name="shield-checkmark-outline" size={12} color={colors.primary} />
            <Text style={[styles.metaBadgeText, { color: colors.primary }]}>Personal</Text>
          </View>
          {item.codigoPersonal ? (
            <View style={[styles.metaBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="key-outline" size={12} color={colors.textSecondary} />
              <Text style={[styles.metaBadgeText, { color: colors.textSecondary }]}>#{item.codigoPersonal}</Text>
            </View>
          ) : null}
        </View>
        {services.length > 0 ? (
          <View style={styles.serviceList}>
            {services.slice(0, 3).map((service, index) => (
              <View
                key={`${service.servicos}-${index}`}
                style={[styles.serviceTag, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={[styles.serviceTagText, { color: colors.text }]} numberOfLines={1}>
                  {service.servicos}
                </Text>
              </View>
            ))}
            {services.length > 3 ? (
              <Text style={[styles.moreText, { color: colors.textSecondary }]}>
                +{services.length - 3}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.cardBio, { color: colors.textSecondary }]} numberOfLines={2}>
            Sem servicos cadastrados.
          </Text>
        )}
        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={[styles.footerGhostButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => router.push(`/mh-agenda-fit/${item.uid}` as any)}
          >
            <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.footerGhostText, { color: colors.textSecondary }]}>Ver perfil</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerPrimaryButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push(`/mh-agenda-fit/${item.uid}` as any)}
          >
            <Ionicons name="calendar-outline" size={14} color={colors.info} />
            <Text style={[styles.footerPrimaryText, { color: colors.info }]}>Agendar</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Agenda Fit</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.heroWrap}>
          <LinearGradient
            colors={['#08172A', '#103150', '#1B5788']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroCard, { borderRadius: borderRadius.lg }]}
          >
            <View style={styles.heroGlowPrimary} />
            <View style={styles.heroGlowSecondary} />
            <Text style={[styles.heroEyebrow, { color: 'rgba(220,240,255,0.88)' }]}>
              REDE MH
            </Text>
            <Text style={[styles.heroTitle, { color: '#F5FBFF' }]}>
              MH Agenda Fit
            </Text>
            <Text style={[styles.heroSubtitle, { color: 'rgba(224,242,255,0.86)' }]}>
              Encontre um profissional na sua regiao e agende seu acompanhamento em poucos toques.
            </Text>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatChip}>
                <Ionicons name="people-outline" size={13} color="#9FDCFF" />
                <Text style={styles.heroStatText}>{filtered.length} no seu filtro</Text>
              </View>
              <View style={styles.heroStatChip}>
                <Ionicons name="location-outline" size={13} color="#9FDCFF" />
                <Text style={styles.heroStatText} numberOfLines={1}>
                  {selectedLocationLabel}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View
          style={[
            styles.filterShell,
            {
              backgroundColor: colors.secondaryBackground,
              borderRadius: borderRadius.lg,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderRadius: borderRadius.md, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              placeholder="Buscar personal, especialidade ou cidade..."
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text }]}
              value={query}
              onChangeText={setQuery}
            />
          </View>

          <View style={styles.locationBar}>
            <View style={styles.locationInfo}>
              <View style={[styles.locationIconWrap, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="location-outline" size={17} color={colors.primary} />
              </View>
              <View style={styles.locationTextWrap}>
                <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>
                  Local da aula
                </Text>
                <Text style={[styles.locationValue, { color: colors.text }]} numberOfLines={1}>
                  {selectedLocationLabel}
                </Text>
              </View>
            </View>
            <View style={styles.locationActions}>
              <TouchableOpacity
                style={[styles.locationActionButton, { backgroundColor: colors.primary + '20' }]}
                onPress={openLocationModal}
              >
                <Text style={[styles.locationActionText, { color: colors.primary }]}>Alterar</Text>
              </TouchableOpacity>
              {locationIsFiltered ? (
                <TouchableOpacity
                  onPress={() => {
                    void applySelectedLocation('', '');
                  }}
                  style={styles.clearLocationButton}
                >
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.resultRow}>
          <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
          <Text style={[styles.resultText, { color: colors.textSecondary }]}>{resultLabel}</Text>
        </View>

        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.uid}
          numColumns={isDesktop || isTablet ? 2 : 1}
          columnWrapperStyle={isDesktop || isTablet ? styles.gridRow : undefined}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={() => loadPersonals('refresh')}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {loading
                  ? 'Carregando...'
                  : locationIsFiltered
                  ? 'Nenhum personal disponivel para o local escolhido.'
                  : 'Nenhum personal disponivel no momento.'}
              </Text>
            </View>
          }
        />

        <Modal
          visible={locationModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLocationModalVisible(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setLocationModalVisible(false)}>
            <Pressable
              style={[styles.modalCard, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
              onPress={() => {}}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Escolha seu local
                </Text>
                <TouchableOpacity onPress={() => setLocationModalVisible(false)}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Defina cidade e estado para buscar personais perto de voce.
              </Text>

              <View style={[styles.modalInputWrap, { backgroundColor: colors.surface }]}>
                <Ionicons name="business-outline" size={16} color={colors.textMuted} />
                <TextInput
                  placeholder="Cidade"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.modalInput, { color: colors.text }]}
                  value={draftCity}
                  onChangeText={setDraftCity}
                  autoCapitalize="words"
                />
              </View>

              <View style={[styles.modalInputWrap, { backgroundColor: colors.surface }]}>
                <Ionicons name="map-outline" size={16} color={colors.textMuted} />
                <TextInput
                  placeholder="Estado (UF ou nome)"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.modalInput, { color: colors.text }]}
                  value={draftState}
                  onChangeText={setDraftState}
                  autoCapitalize="characters"
                />
              </View>

              {locationSuggestions.length > 0 ? (
                <View style={styles.suggestionsSection}>
                  <Text style={[styles.suggestionsTitle, { color: colors.textSecondary }]}>
                    Sugestoes rapidas
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsRow}>
                    {locationSuggestions.map((suggestion) => {
                      const label = formatLocationLabel(suggestion.city, suggestion.state);
                      return (
                        <TouchableOpacity
                          key={`${suggestion.city}-${suggestion.state}`}
                          style={[styles.suggestionChip, { backgroundColor: colors.primary + '14' }]}
                          onPress={() => {
                            setDraftCity(suggestion.city);
                            setDraftState(suggestion.state);
                          }}
                        >
                          <Text style={[styles.suggestionText, { color: colors.primary }]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.modalHelperActions}>
                <TouchableOpacity
                  style={[styles.helperActionButton, { borderColor: colors.border }]}
                  onPress={() => {
                    setDraftCity(user?.cidade || '');
                    setDraftState(user?.estado || '');
                  }}
                >
                  <Text style={[styles.helperActionText, { color: colors.text }]}>
                    Usar meu perfil
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.helperActionButton, { borderColor: colors.border }]}
                  onPress={() => {
                    setDraftCity('');
                    setDraftState('');
                  }}
                >
                  <Text style={[styles.helperActionText, { color: colors.text }]}>
                    Mostrar todos
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.applyButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  void applySelectedLocation(draftCity, draftState);
                }}
              >
                <Text style={[styles.applyButtonText, { color: colors.info }]}>
                  Aplicar local
                </Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
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
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  heroWrap: {
    paddingHorizontal: spacing.base,
  },
  heroCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(176,224,255,0.25)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  heroGlowPrimary: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -68,
    right: -62,
    backgroundColor: 'rgba(95,195,255,0.25)',
  },
  heroGlowSecondary: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    bottom: -56,
    left: -44,
    backgroundColor: 'rgba(83,148,255,0.2)',
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  heroTitle: {
    marginTop: spacing.xs,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
  },
  heroSubtitle: {
    marginTop: spacing.xs,
    fontSize: 13,
    lineHeight: 18,
  },
  heroStatsRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroStatChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(167,221,255,0.28)',
    backgroundColor: 'rgba(9,32,54,0.45)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  heroStatText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#E6EEF8',
  },
  filterShell: {
    marginTop: spacing.md,
    marginHorizontal: spacing.base,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  locationIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  locationTextWrap: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 11,
  },
  locationValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
  },
  locationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  locationActionButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
  },
  locationActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  clearLocationButton: {
    padding: 2,
  },
  resultRow: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  resultText: {
    fontSize: 12,
    fontWeight: '500',
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  gridRow: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  card: {
    flex: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(183,225,255,0.22)',
    overflow: 'hidden',
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  cardMetaRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  metaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  serviceList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  serviceTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  serviceTagText: {
    fontSize: 11,
    maxWidth: 92,
  },
  moreText: {
    fontSize: 11,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  locationInline: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardBio: {
    marginTop: spacing.sm,
    fontSize: 12,
    lineHeight: 18,
  },
  cardFooter: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  footerGhostButton: {
    flex: 1,
    height: 36,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerGhostText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footerPrimaryButton: {
    flex: 1,
    height: 36,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
  },
  emptyText: {
    fontSize: 14,
    marginTop: spacing.md,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#000000AA',
    justifyContent: 'center',
    padding: spacing.base,
  },
  modalCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 13,
    marginBottom: spacing.md,
  },
  modalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalInput: {
    flex: 1,
    fontSize: 14,
  },
  suggestionsSection: {
    marginTop: spacing.xs,
  },
  suggestionsTitle: {
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  suggestionsRow: {
    gap: spacing.xs,
  },
  suggestionChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  suggestionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalHelperActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  helperActionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  helperActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  applyButton: {
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
