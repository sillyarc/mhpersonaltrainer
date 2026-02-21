import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { FREE_DAILY_AI_CREDITS, isPremiumUserRecord } from '../../src/services/ai';

export default function AIHubScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { user } = useAuthStore();
  const hasPremiumAiAccess = isPremiumUserRecord((user || {}) as Record<string, any>);

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
            IA do MH Personal
          </Text>
          <Text style={[{ color: colors.secondaryText }, typography.bodyMedium]}>
            Chat IA disponivel para todos. Recursos avancados exigem Premium.
          </Text>

          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}
            onPress={() => router.push('/ai/assistant')}
          >
            <Ionicons name="sparkles-outline" size={28} color={colors.primary} />
            <View style={styles.cardText}>
              <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
                MH Assistente
              </Text>
              <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                Converse com a IA e crie treinos personalizados.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          {hasPremiumAiAccess ? (
            <>
              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}
                onPress={() => router.push('/ai/gpt-home')}
              >
                <Ionicons name="barbell-outline" size={28} color={colors.success} />
                <View style={styles.cardText}>
                  <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
                    Treinos com IA
                  </Text>
                  <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                    Descubra treinos populares e rotinas guiadas.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}
                onPress={() => router.push('/ai/image-analysis')}
              >
                <Ionicons name="camera-outline" size={28} color={colors.warning} />
                <View style={styles.cardText}>
                  <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
                    Analise de imagem
                  </Text>
                  <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                    Envie uma foto para analise postural.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}
                onPress={() => router.push('/ai/feedback')}
              >
                <Ionicons name="star-outline" size={28} color={colors.tertiary} />
                <View style={styles.cardText}>
                  <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
                    Feedback da IA
                  </Text>
                  <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                    Avalie o treino e diga o que achou.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}
                onPress={() => router.push('/ai/calendar')}
              >
                <Ionicons name="calendar-outline" size={28} color={colors.primary} />
                <View style={styles.cardText}>
                  <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
                    Agenda inteligente
                  </Text>
                  <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                    Veja compromissos e metas da semana.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.lockedCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}
              onPress={() => router.push('/profile/subscription')}
            >
              <Ionicons name="lock-closed-outline" size={22} color={colors.primary} />
              <View style={styles.cardText}>
                <Text style={[{ color: colors.primaryText }, typography.titleSmall]}>
                  Recursos IA Premium
                </Text>
                <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                  No plano gratuito voce tem {FREE_DAILY_AI_CREDITS} creditos/dia no chat. Insights e avaliacao postural por IA sao Premium.
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
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
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  lockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(91, 183, 255, 0.3)',
  },
  cardText: {
    flex: 1,
  },
});
