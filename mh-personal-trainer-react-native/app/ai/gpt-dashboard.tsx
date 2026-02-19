import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { isPremiumUserRecord } from '../../src/services/ai';

export default function GPTDashboardScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { user } = useAuthStore();
  const hasPremiumAiAccess = isPremiumUserRecord((user || {}) as Record<string, any>);

  if (!hasPremiumAiAccess) {
    return (
      <LinearGradient
        colors={[colors.primaryBackground, colors.alternate]}
        start={{ x: 0.85, y: 0 }}
        end={{ x: 0.15, y: 1 }}
        style={styles.container}
      >
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
            <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
              <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
                Recurso Premium
              </Text>
              <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                O painel de IA e exclusivo para assinantes Premium.
              </Text>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.primary, borderRadius: borderRadius.lg }]}
                onPress={() => router.push('/profile/subscription' as any)}
              >
                <Text style={[{ color: colors.info }, typography.titleSmall]}>Ver planos Premium</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
          <Text style={[{ color: colors.primaryText }, typography.headlineLarge]}>
            Painel IA
          </Text>
          <Text style={[{ color: colors.secondaryText }, typography.bodyMedium]}>
            Configure intensidade, foco e acompanhe dicas inteligentes.
          </Text>

          <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
            <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
              Foco do treino
            </Text>
            <View style={styles.tagRow}>
              {['Forca', 'Resistencia', 'Mobilidade', 'Condicionamento'].map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: colors.surface, borderRadius: borderRadius.full }]}>
                  <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
            <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
              Intensidade sugerida
            </Text>
            <View style={styles.metricRow}>
              <Ionicons name="flame-outline" size={20} color={colors.warning} />
              <Text style={[{ color: colors.primaryText }, typography.bodyMedium]}>
                Intermediario
              </Text>
            </View>
            <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
              Ajuste o ritmo com base no seu tempo disponivel e energia do dia.
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
            <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
              Dicas do dia
            </Text>
            <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
              Lembre-se de aquecer bem e manter a postura durante os exercicios.
            </Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primary, borderRadius: borderRadius.lg }]}
              onPress={() => router.push('/ai/assistant')}
            >
              <Text style={[{ color: colors.info }, typography.titleSmall]}>Perguntar a IA</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.secondary, borderRadius: borderRadius.lg }]}
              onPress={() => router.push('/ai/image-analysis')}
            >
              <Text style={[{ color: colors.info }, typography.titleSmall]}>Analisar postura</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
  content: {
    gap: 16,
  },
  card: {
    padding: 16,
    gap: 10,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
});
