import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { Card, Button } from '../src/components/common';

const termsHighlights = [
  'Use o app de forma legal e respeitosa.',
  'Proteja sua conta e seus dados.',
  'Nao compartilhe conteudo inadequado.',
];

const privacyHighlights = [
  'Coletamos dados para personalizar sua experiencia.',
  'Nao vendemos suas informacoes.',
  'Voce pode solicitar exclusao dos dados.',
];

export default function PoliciesScreen() {
  const { colors, spacing, typography } = useTheme();

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.8, y: 0 }}
      end={{ x: 0.2, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
          </TouchableOpacity>
          <Text style={[{ color: colors.primaryText }, typography.titleLarge]}>
            Termos e políticas
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
          <Text style={[{ color: colors.secondaryText }, typography.bodyMedium]}>
            Veja um resumo rapido e acesse os textos completos.
          </Text>

          <Card style={{ marginBottom: spacing.md }}>
            <Text style={[{ color: colors.primaryText }, typography.titleSmall]}>
              Termos de uso
            </Text>
            <View style={{ marginTop: spacing.sm }}>
              {termsHighlights.map((item) => (
                <View key={item} style={styles.bulletRow}>
                  <Text style={[styles.bullet, { color: colors.primaryText }]}>•</Text>
                  <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          <Card style={{ marginBottom: spacing.md }}>
            <Text style={[{ color: colors.primaryText }, typography.titleSmall]}>
              Política de privacidade
            </Text>
            <View style={{ marginTop: spacing.sm }}>
              {privacyHighlights.map((item) => (
                <View key={item} style={styles.bulletRow}>
                  <Text style={[styles.bullet, { color: colors.primaryText }]}>•</Text>
                  <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          <View style={styles.actionsRow}>
            <Button
              title="Ler termos completos"
              onPress={() => router.push('/terms')}
              variant="outline"
              fullWidth
            />
            <Button
              title="Ler politica completa"
              onPress={() => router.push('/privacy')}
              variant="primary"
              fullWidth
            />
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
  header: {
    paddingTop: 8,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    gap: 16,
  },
  actionsRow: {
    gap: 12,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  bullet: {
    fontSize: 14,
    lineHeight: 20,
  },
});
