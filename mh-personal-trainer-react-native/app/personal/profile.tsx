import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { firestoreService, PersonalProfile } from '../../src/services/firestoreService';
import { fetchFeedbacksByPersonalCode } from '../../src/services/feedback';
import { Card, Loading, Button, Avatar } from '../../src/components/common';
import { spacing, borderRadius } from '../../src/theme';

export default function PersonalProfileScreen() {
  const { colors } = useTheme();
  const { code, uid } = useLocalSearchParams<{ code?: string; uid?: string }>();
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
            especializacao: userDoc.especializacao,
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Perfil do personal</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Loading />
        </View>
      ) : profile ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.profileHeader}>
            <Avatar source={profile.photoUrl} name={profile.displayName} size="xlarge" />
            <Text style={[styles.profileName, { color: colors.text }]}>{profile.displayName}</Text>
            {profile.especializacao ? (
              <Text style={[styles.profileSubtitle, { color: colors.textSecondary }]}>
                {profile.especializacao}
              </Text>
            ) : null}
            {ratingAverage !== null && (
              <View style={styles.ratingRow}>
                <View style={styles.starsRow}>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Ionicons
                      key={`star-${index}`}
                      name={index < Math.round(ratingAverage) ? 'star' : 'star-outline'}
                      size={16}
                      color={colors.warning}
                    />
                  ))}
                </View>
                <Text style={[styles.ratingText, { color: colors.textSecondary }]}>
                  {ratingAverage} ({ratingCount})
                </Text>
              </View>
            )}
          </View>

          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="key-outline" size={18} color={colors.primary} />
              <Text style={[styles.infoLabel, { color: colors.text }]}>Codigo</Text>
              <Text style={[styles.infoValue, { color: colors.textSecondary }]}
              >{profile.codigoPersonal ?? '--'}</Text>
            </View>
            {profile.phoneNumber ? (
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={18} color={colors.primary} />
                <Text style={[styles.infoLabel, { color: colors.text }]}>Telefone</Text>
                <Text style={[styles.infoValue, { color: colors.textSecondary }]}
                >{profile.phoneNumber}</Text>
              </View>
            ) : null}
            {(profile.cidade || profile.estado) ? (
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={18} color={colors.primary} />
                <Text style={[styles.infoLabel, { color: colors.text }]}>Localizacao</Text>
                <Text style={[styles.infoValue, { color: colors.textSecondary }]}>
                  {[profile.cidade, profile.estado].filter(Boolean).join(' - ')}
                </Text>
              </View>
            ) : null}
            {profile.bio ? (
              <View style={styles.bioSection}>
                <Text style={[styles.bioTitle, { color: colors.text }]}>Sobre</Text>
                <Text style={[styles.bioText, { color: colors.textSecondary }]}>
                  {profile.bio}
                </Text>
              </View>
            ) : null}
          </Card>

          {profile.servicos && profile.servicos.length > 0 ? (
            <Card style={styles.infoCard}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Servicos</Text>
              {profile.servicos.map((service, index) => (
                <View key={`${service.servicos}-${index}`} style={styles.serviceRow}>
                  <View style={styles.serviceInfo}>
                    <Text style={[styles.serviceName, { color: colors.text }]}>{service.servicos}</Text>
                    {service.descricao ? (
                      <Text style={[styles.serviceDesc, { color: colors.textSecondary }]}>{service.descricao}</Text>
                    ) : null}
                  </View>
                  {service.valor ? (
                    <Text style={[styles.servicePrice, { color: colors.primary }]}>
                      {service.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </Text>
                  ) : null}
                </View>
              ))}
            </Card>
          ) : null}

          {profile.horarioAtendimento &&
          Object.values(profile.horarioAtendimento).some((value) => value) ? (
            <Card style={styles.infoCard}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Horario de atendimento</Text>
              <View style={styles.scheduleRow}>
                <Text style={[styles.scheduleLabel, { color: colors.textSecondary }]}>Seg-Sex</Text>
                <Text style={[styles.scheduleValue, { color: colors.text }]}>
                  {formatHorario(profile.horarioAtendimento.inicioSegSex, profile.horarioAtendimento.terminioSegSex)}
                </Text>
              </View>
              <View style={styles.scheduleRow}>
                <Text style={[styles.scheduleLabel, { color: colors.textSecondary }]}>Sabado</Text>
                <Text style={[styles.scheduleValue, { color: colors.text }]}>
                  {formatHorario(profile.horarioAtendimento.inicioSab, profile.horarioAtendimento.terminioSab)}
                </Text>
              </View>
              <View style={styles.scheduleRow}>
                <Text style={[styles.scheduleLabel, { color: colors.textSecondary }]}>Domingo</Text>
                <Text style={[styles.scheduleValue, { color: colors.text }]}>
                  {formatHorario(profile.horarioAtendimento.inicioDom, profile.horarioAtendimento.terminioDom)}
                </Text>
              </View>
            </Card>
          ) : null}

          <Button
            title="Abrir chat"
            onPress={() => router.push('/(tabs)/chat' as any)}
            fullWidth
            size="large"
            style={{ marginTop: spacing.lg }}
          />
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="person-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Personal não encontrado</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Confira o codigo informado.</Text>
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
    padding: spacing.base,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingText: {
    fontSize: 13,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  profileSubtitle: {
    fontSize: 14,
    marginTop: spacing.xs,
  },
  infoCard: {
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    marginLeft: 'auto',
  },
  bioSection: {
    marginTop: spacing.sm,
  },
  bioTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  bioText: {
    fontSize: 13,
    lineHeight: 20,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '600',
  },
  serviceDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  servicePrice: {
    fontSize: 12,
    fontWeight: '600',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  scheduleLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  scheduleValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
});
