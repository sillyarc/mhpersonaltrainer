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
    title: 'Aceitação dos termos',
    body:
      'Ao usar o app MH Personal, você concorda com estes termos. Se não concordar, não use o app.',
  },
  {
    title: 'Conta e acesso',
    body:
      'Você é responsável pelas informações da sua conta e por manter seu acesso seguro.',
  },
  {
    title: 'Uso do app',
    body:
      'O app oferece ferramentas para treinos, avaliação e comunicação. Você concorda em usar o app de forma legal e respeitosa.',
  },
  {
    title: 'Conteúdo e dados',
    body:
      'Você pode criar e enviar dados de treino. Esse conteúdo deve respeitar as regras do app e da comunidade.',
  },
  {
    title: 'Atualizações',
    body:
      'Podemos atualizar estes termos para melhorar o serviço. Notificaremos mudanças relevantes no app.',
  },
];

export default function TermsScreen() {
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
            Termos de uso
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
          <Text style={[{ color: colors.secondaryText }, typography.bodyMedium]}>
            Leia com atenção antes de usar o app.
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
              title="Ver política de privacidade"
              onPress={() => router.push('/privacy')}
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
