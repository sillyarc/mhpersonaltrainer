import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/hooks/useTheme';
import { firestoreService, PersonalProfile } from '../../src/services/firestoreService';
import { fetchFeedbacksByPersonalCode } from '../../src/services/feedback';
import { Card, Loading, Button, Avatar } from '../../src/components/common';
import { spacing, borderRadius } from '../../src/theme';

export default function PersonalProfileScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ code?: string | string[]; uid?: string | string[] }>();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const uid = Array.isArray(params.uid) ? params.uid[0] : params.uid;
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratingAverage, setRatingAverage] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState(0);

  const formatTimeValue = (value: any) => {
    if (!value) return '';
    const date = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const formatHorario = (inicio?: any, fim?: any) => {
    const inicioLabel = formatTimeValue(inicio);
    const fimLabel = formatTimeValue(fim);
    if (!inicioLabel && !fimLabel) return 'Fechado';
    return `${inicioLabel || '--'} - ${fimLabel || '--'}`;
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      if (code) {
        const result = await firestoreService.getPersonalProfileByCode(code);
        setProfile(result);
        setLoading(false);
        return;
      }
      if (uid) {
        const userDoc = await firestoreService.getUserDocument(uid);
        if (userDoc) {
          setProfile({
            id: uid,
            uid,
            displayName: userDoc.displayName || 'Personal',
            photoUrl: userDoc.photoUrl,
            especializacao: Array.isArray(userDoc.especializacao)
              ? userDoc.especializacao.filter(Boolean).join(', ')
              : userDoc.especializacao,
            codigoPersonal: typeof userDoc.codigoPersonal === 'number' ? userDoc.codigoPersonal : undefined,
          });
        }
      }
      setLoading(false);
    };
    loadProfile();
  }, [code, uid]);

  useEffect(() => {
    const loadRatings = async () => {
      if (!profile?.codigoPersonal || profile.codigoPersonal <= 0) {
        setRatingAverage(null);
        setRatingCount(0);
        return;
      }
      const result = await fetchFeedbacksByPersonalCode(profile.codigoPersonal);
      if (result.data) {
        const ratings = result.data.map((item) => Number(item.estrela || 0)).filter((value) => value > 0);
        if (ratings.length === 0) {
          setRatingAverage(null);
          setRatingCount(0);
          return;
        }
        const total = ratings.reduce((acc, value) => acc + value, 0);
        setRatingAverage(Number((total / ratings.length).toFixed(1)));
        setRatingCount(ratings.length);
      }
    };
    loadRatings();
  }, [profile?.codigoPersonal]);

  const locationLabel = useMemo(() => {
    if (!profile) return '';
    return [profile.cidade, profile.estado].filter(Boolean).join(' - ');
  }, [profile]);

  const scheduleItems = useMemo(() => {
    if (!profile?.horarioAtendimento) return [];
    return [
      {
        label: 'Seg-Sex',
        value: formatHorario(profile.horarioAtendimento.inicioSegSex, profile.horarioAtendimento.terminioSegSex),
      },
      {
        label: 'Sabado',
        value: formatHorario(profile.horarioAtendimento.inicioSab, profile.horarioAtendimento.terminioSab),
      },
      {
        label: 'Domingo',
        value: formatHorario(profile.horarioAtendimento.inicioDom, profile.horarioAtendimento.terminioDom),
      },
    ];
  }, [profile?.horarioAtendimento]);

  const hasSchedule = useMemo(() => {
    if (!profile?.horarioAtendimento) return false;
    return Object.values(profile.horarioAtendimento).some((value) => Boolean(value));
  }, [profile?.horarioAtendimento]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.title, { color: colors.text }]}>Perfil do personal</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Servicos, agenda e contato</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Loading />
        </View>
      ) : profile ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.heroCard, { borderColor: colors.border }]}>
            <LinearGradient
              colors={[colors.secondary, colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              <View style={[styles.avatarShell, { borderColor: colors.card }]}>
                <Avatar source={profile.photoUrl} name={profile.displayName} size="xlarge" />
              </View>

              <Text style={styles.profileName}>{profile.displayName}</Text>

              {profile.especializacao ? (
                <View style={styles.specializationBadge}>
                  <Ionicons name="fitness-outline" size={14} color="#FFFFFF" />
                  <Text style={styles.specializationText}>{profile.especializacao}</Text>
                </View>
              ) : null}

              {ratingAverage !== null ? (
                <View style={styles.ratingChip}>
                  <View style={styles.starsRow}>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Ionicons
                        key={`star-${index}`}
                        name={index < Math.round(ratingAverage) ? 'star' : 'star-outline'}
                        size={16}
                        color="#FFD166"
                      />
                    ))}
                  </View>
                  <Text style={styles.ratingText}>
                    {ratingAverage} ({ratingCount})
                  </Text>
                </View>
              ) : (
                <Text style={styles.ratingEmptyText}>Sem avaliacoes ainda</Text>
              )}

              <View style={styles.heroMetaRow}>
                <View style={styles.heroMetaChip}>
                  <Ionicons name="key-outline" size={14} color="#FFFFFF" />
                  <Text style={styles.heroMetaLabel}>Codigo {profile.codigoPersonal ?? '--'}</Text>
                </View>
                {locationLabel ? (
                  <View style={styles.heroMetaChip}>
                    <Ionicons name="location-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.heroMetaLabel}>{locationLabel}</Text>
                  </View>
                ) : null}
              </View>
            </LinearGradient>
          </View>

          <Card style={StyleSheet.flatten([styles.sectionCard, { borderColor: colors.border }])} shadow={false}>
            <View style={styles.sectionHeader}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Informacoes</Text>
            </View>

            <View style={styles.detailsList}>
              <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.iconBadge, { backgroundColor: colors.background }]}>
                  <Ionicons name="key-outline" size={16} color={colors.primary} />
                </View>
                <View style={styles.detailTextBox}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Codigo</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{profile.codigoPersonal ?? '--'}</Text>
                </View>
              </View>

              {profile.phoneNumber ? (
                <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.iconBadge, { backgroundColor: colors.background }]}>
                    <Ionicons name="call-outline" size={16} color={colors.primary} />
                  </View>
                  <View style={styles.detailTextBox}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Telefone</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{profile.phoneNumber}</Text>
                  </View>
                </View>
              ) : null}

              {locationLabel ? (
                <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.iconBadge, { backgroundColor: colors.background }]}>
                    <Ionicons name="location-outline" size={16} color={colors.primary} />
                  </View>
                  <View style={styles.detailTextBox}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Localizacao</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{locationLabel}</Text>
                  </View>
                </View>
              ) : null}
            </View>

            {profile.bio ? (
              <View style={[styles.bioSection, { backgroundColor: colors.background }]}>
                <Text style={[styles.bioTitle, { color: colors.text }]}>Sobre</Text>
                <Text style={[styles.bioText, { color: colors.textSecondary }]}>{profile.bio}</Text>
              </View>
            ) : null}
          </Card>

          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="briefcase-outline" size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Servicos</Text>
            </View>
            {profile.servicos && profile.servicos.length > 0 ? (
              <View style={styles.servicesList}>
                {profile.servicos.map((service, index) => (
                  <View
                    key={`${service.servicos}-${index}`}
                    style={[styles.serviceCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                  >
                    <View style={styles.serviceTitleRow}>
                      <Text style={[styles.serviceName, { color: colors.text }]}>{service.servicos}</Text>
                      {service.valor ? (
                        <Text style={[styles.servicePrice, { color: colors.primary }]}>{formatCurrency(service.valor)}</Text>
                      ) : null}
                    </View>
                    {service.descricao ? (
                      <Text style={[styles.serviceDesc, { color: colors.textSecondary }]}>{service.descricao}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptySectionText, { color: colors.textMuted }]}>Este personal ainda nao cadastrou servicos.</Text>
            )}
          </Card>

          {hasSchedule ? (
            <Card style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={18} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Horario de atendimento</Text>
              </View>
              <View style={styles.scheduleList}>
                {scheduleItems.map((item) => {
                  const isClosed = item.value === 'Fechado';
                  return (
                    <View
                      key={item.label}
                      style={[styles.scheduleCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                    >
                      <Text style={[styles.scheduleLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                      <Text style={[styles.scheduleValue, { color: isClosed ? colors.textMuted : colors.text }]}>
                        {item.value}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}

          <Button
            title="Abrir chat"
            onPress={() => router.push('/(tabs)/chat' as any)}
            fullWidth
            size="large"
            style={styles.chatButton}
            icon={<Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" />}
          />
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="person-remove-outline" size={36} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Personal nao encontrado</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Confira o codigo informado e tente novamente.
          </Text>
          <Button
            title="Voltar"
            variant="outline"
            onPress={() => router.back()}
            style={styles.backButton}
            icon={<Ionicons name="arrow-back" size={18} color={colors.primary} />}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderBottomWidth: 1,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
    gap: spacing.base,
  },
  heroCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroGradient: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarShell: {
    borderWidth: 3,
    borderRadius: borderRadius.full,
  },
  profileName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  specializationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  specializationText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  ratingChip: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(8, 18, 31, 0.22)',
  },
  ratingEmptyText: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  heroMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(8, 18, 31, 0.24)',
  },
  heroMetaLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sectionCard: {
    borderWidth: 1,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  detailsList: {
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTextBox: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  bioSection: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  bioTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  bioText: {
    fontSize: 13,
    lineHeight: 20,
  },
  infoCard: {
    gap: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  servicesList: {
    gap: spacing.sm,
  },
  serviceCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  serviceTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  serviceDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  servicePrice: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptySectionText: {
    fontSize: 13,
  },
  scheduleList: {
    gap: spacing.sm,
  },
  scheduleCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scheduleLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  scheduleValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  chatButton: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyIconBadge: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
  },
  backButton: {
    marginTop: spacing.base,
    paddingHorizontal: spacing.xl,
  },
});
