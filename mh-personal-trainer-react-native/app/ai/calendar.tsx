import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { fetchAppointments, getAppointmentStatusLabel } from '../../src/services/scheduling';
import { Appointment } from '../../src/types/scheduling';
import { isPremiumUserRecord } from '../../src/services/ai';

export default function GPTCalendarScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { user, role } = useAuthStore();
  const hasPremiumAiAccess = isPremiumUserRecord((user || {}) as Record<string, any>);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAppointments = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
      if (!user?.uid) {
        setAppointments([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (mode === 'initial') {
        setLoading(true);
      } else if (mode === 'refresh') {
        setRefreshing(true);
      }
      try {
        const result = await fetchAppointments(user.uid, role === 'personal' || role === 'professor');
        setAppointments(result.data || []);
      } finally {
        if (mode === 'initial') {
          setLoading(false);
        } else if (mode === 'refresh') {
          setRefreshing(false);
        }
      }
    },
    [user?.uid, role]
  );

  useEffect(() => {
    loadAppointments('initial');
  }, [loadAppointments]);

  if (!hasPremiumAiAccess) {
    return (
      <LinearGradient
        colors={[colors.primaryBackground, colors.alternate]}
        start={{ x: 0.85, y: 0 }}
        end={{ x: 0.15, y: 1 }}
        style={styles.container}
      >
        <SafeAreaView style={styles.safeArea}>
          <View style={[styles.header, { padding: spacing.lg }]}>
            <Text style={[{ color: colors.primaryText }, typography.headlineLarge]}>
              Agenda inteligente
            </Text>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.secondaryBackground,
                borderRadius: borderRadius.lg,
                marginHorizontal: spacing.lg,
              },
            ]}
          >
            <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
              Recurso Premium
            </Text>
            <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
              A agenda inteligente com IA esta disponivel apenas para assinantes Premium.
            </Text>
            <TouchableOpacity
              style={[styles.unlockButton, { backgroundColor: colors.primary, borderRadius: borderRadius.lg }]}
              onPress={() => router.push('/profile/subscription' as any)}
            >
              <Text style={[{ color: colors.info }, typography.titleSmall]}>Ver planos Premium</Text>
            </TouchableOpacity>
          </View>
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
        <View style={[styles.header, { padding: spacing.lg }]}>
          <Text style={[{ color: colors.primaryText }, typography.headlineLarge]}>
            Agenda inteligente
          </Text>
          <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
            Seus compromissos e treinos agendados.
          </Text>
        </View>

        <FlatList
          data={appointments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingHorizontal: spacing.lg }]}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                <Text style={[{ color: colors.primaryText }, typography.titleSmall]}>
                  {item.tipo ? item.tipo.toUpperCase() : 'TREINO'}
                </Text>
              </View>
              <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                {item.data ? item.data.toLocaleDateString('pt-BR') : '--'} {item.horaInicio || ''}
              </Text>
              <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                {item.alunoNome || item.personalNome || 'Sessao'}
              </Text>
              <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
                Status: {getAppointmentStatusLabel(item.status)}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={[styles.emptyContainer, { paddingVertical: spacing['4xl'] }]}>
              <Ionicons name="calendar-outline" size={64} color={colors.secondaryText} />
              <Text style={[{ color: colors.secondaryText, marginTop: spacing.md }, typography.bodyLarge]}>
                {loading ? 'Carregando agenda...' : 'Nenhum compromisso encontrado'}
              </Text>
            </View>
          }
          refreshing={refreshing}
          onRefresh={() => loadAppointments('refresh')}
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
    gap: 4,
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unlockButton: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
