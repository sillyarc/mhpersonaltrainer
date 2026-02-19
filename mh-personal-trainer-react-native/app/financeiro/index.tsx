import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { useResponsive } from '../../src/hooks/useResponsive';

export default function FinanceiroHomeScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { role } = useAuthStore();
  const { padding } = useResponsive();

  const isPersonal = role === 'personal' || role === 'professor';
  const isAdmin = role === 'admin';

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, { paddingHorizontal: padding, paddingVertical: spacing.md }]}>
          <Text style={[{ color: colors.primaryText }, typography.headlineLarge]}>
            Financeiro
          </Text>
        </View>

        <View style={[styles.content, { paddingHorizontal: padding }]}>
          {(isPersonal || isAdmin) && (
            <TouchableOpacity
              style={[
                styles.card,
                { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg },
              ]}
              onPress={() => router.push('/financeiro/personal')}
            >
              <Ionicons name="people-outline" size={24} color={colors.primary} />
              <View style={styles.cardText}>
                <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
                  Financeiro do aluno
                </Text>
                <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                  Cobrancas, vencimentos e status
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.card,
              { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg },
            ]}
            onPress={() => router.push('/financeiro/aluno')}
          >
            <Ionicons name="wallet-outline" size={24} color={colors.success} />
            <View style={styles.cardText}>
              <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
                Minhas faturas
              </Text>
              <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                Pagamentos pendentes e historico
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          {(isPersonal || isAdmin) && (
            <TouchableOpacity
              style={[
                styles.card,
                { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg },
              ]}
              onPress={() => router.push('/financeiro/plans')}
            >
              <Ionicons name="ribbon-outline" size={24} color={colors.warning} />
              <View style={styles.cardText}>
                <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
                  Planos de assinatura
                </Text>
                <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                  Escolha o plano ideal para você
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.card,
              { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg },
            ]}
            onPress={() => router.push('/financeiro/subscription')}
          >
            <Ionicons name="document-text-outline" size={24} color={colors.tertiary} />
            <View style={styles.cardText}>
              <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
                Detalhes da assinatura
              </Text>
              <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                Status e historico de pagamentos
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>
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
    alignItems: 'center',
  },
  content: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardText: {
    flex: 1,
  },
});
