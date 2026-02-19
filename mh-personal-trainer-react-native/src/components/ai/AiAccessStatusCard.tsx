import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { useAiAccessStatus } from '../../hooks/useAiAccessStatus';

type Props = {
  compact?: boolean;
  showManageLink?: boolean;
};

export function AiAccessStatusCard({ compact = false, showManageLink = true }: Props) {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const access = useAiAccessStatus();
  const progress = access.premium
    ? 100
    : access.dailyLimit > 0
    ? Math.min(100, Math.round((access.usedToday / access.dailyLimit) * 100))
    : 0;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.secondaryBackground,
          borderRadius: borderRadius.xl,
          padding: compact ? spacing.md : spacing.lg,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="sparkles" size={12} color={colors.primary} />
          <Text style={[styles.badgeText, { color: colors.primary }]}>Premium</Text>
        </View>
        {access.premium ? (
          <Text style={[styles.modeText, { color: colors.success }]}>Ilimitado</Text>
        ) : (
          <Text
            style={[
              styles.modeText,
              { color: access.exhausted ? colors.error : colors.textSecondary },
            ]}
          >
            {access.loading ? 'Atualizando...' : `${access.remaining ?? 0} restantes`}
          </Text>
        )}
      </View>

      <Text style={[styles.title, typography.titleMedium, { color: colors.text }]}>
        {access.premium ? 'Todos os recursos de IA liberados' : 'Recursos de IA com credito diario'}
      </Text>
      <Text style={[styles.body, typography.bodySmall, { color: colors.textSecondary }]}>
        {access.premium
          ? 'Sua conta Premium tem uso ilimitado no chat, insights e avaliacao postural por IA.'
          : `${access.usedToday}/${access.dailyLimit} creditos usados hoje. Chat IA consome 1 credito por solicitacao.`}
      </Text>

      {!access.premium && (
        <View style={[styles.meterTrack, { backgroundColor: colors.surface, borderRadius: borderRadius.full }]}>
          <View
            style={[
              styles.meterFill,
              {
                width: `${progress}%`,
                backgroundColor: access.exhausted ? colors.error : colors.primary,
                borderRadius: borderRadius.full,
              },
            ]}
          />
        </View>
      )}

      {!access.premium && showManageLink && (
        <TouchableOpacity
          style={[styles.linkButton, { borderColor: colors.primary, borderRadius: borderRadius.full }]}
          onPress={() => router.push('/profile/subscription' as any)}
        >
          <Text style={[styles.linkText, typography.labelSmall, { color: colors.primary }]}>
            Desbloquear Premium
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    marginTop: 2,
  },
  body: {
    lineHeight: 18,
  },
  meterTrack: {
    height: 8,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
  },
  linkButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  linkText: {
    fontWeight: '700',
  },
});
