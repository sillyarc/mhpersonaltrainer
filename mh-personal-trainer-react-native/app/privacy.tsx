import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { Card, Button } from '../src/components/common';

const sections = [
  {
    title: 'Dados coletados',
    body:
      'Coletamos dados de conta, perfil e uso do app para oferecer recursos como treinos, notificacoes e suporte.',
  },
  {
    title: 'Uso das informacoes',
    body:
      'Usamos seus dados para personalizar a experiencia, melhorar o servico e garantir seguranca.',
  },
  {
    title: 'Compartilhamento',
    body:
      'Nao vendemos seus dados. Compartilhamos apenas quando necessario para o funcionamento do app ou por exigencia legal.',
  },
  {
    title: 'Seus direitos',
    body:
      'Voce pode solicitar atualizacao, exportacao ou exclusao dos seus dados dentro do app ou via suporte.',
  },
  {
    title: 'Seguranca',
    body:
      'Aplicamos medidas de seguranca para proteger suas informacoes, mas nenhum sistema e 100% seguro.',
  },
];

export default function PrivacyScreen() {
  const { colors, spacing, typography } = useTheme();

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
          </TouchableOpacity>
          <Text style={[{ color: colors.primaryText }, typography.titleLarge]}>
            Política de privacidade
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
          <Text style={[{ color: colors.secondaryText }, typography.bodyMedium]}>
            Saiba como cuidamos das suas informacoes.
          </Text>

          {sections.map((section) => (
            <Card key={section.title} style={{ marginBottom: spacing.md }}>
              <Text style={[{ color: colors.primaryText }, typography.titleSmall]}>
                {section.title}
              </Text>
              <Text style={[{ color: colors.secondaryText, marginTop: spacing.sm }, typography.bodySmall]}>
                {section.body}
              </Text>
            </Card>
          ))}

          <View style={styles.actionsRow}>
            <Button
              title="Ver termos de uso"
              onPress={() => router.push('/terms')}
              variant="outline"
              fullWidth
            />
            <Button
              title="Termos e políticas"
              onPress={() => router.push('/policies')}
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
});
