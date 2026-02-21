import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';

const faqItems = [
  {
    title: 'Como criar uma rotina de treino?',
    description: 'Use o menu Treinos para montar series e salvar seus treinos.',
  },
  {
    title: 'Como cancelar uma assinatura?',
    description: 'Acesse Perfil > Assinatura e clique em cancelar.',
  },
  {
    title: 'Problemas com pagamentos',
    description: 'Confira o Financeiro e fale com o suporte se houver erro.',
  },
  {
    title: 'Como atualizar meus dados pessoais?',
    description: 'Abra Perfil > Editar para atualizar suas informacoes.',
  },
];

const contactItems = [
  {
    icon: 'mail-outline',
    title: 'E-mail',
    detail: 'suporte@mhpersonaltrainer.com',
    action: 'mailto:suporte@mhpersonaltrainer.com',
  },
  {
    icon: 'call-outline',
    title: 'Telefone',
    detail: '33 8859-5922 / 33 3212-1610',
    action: 'tel:+553388595922',
  },
  {
    icon: 'logo-whatsapp',
    title: 'WhatsApp',
    detail: 'Fale com nossa equipe',
    action: 'https://wa.me/553388595922',
  },
];

export default function HelpCenterScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const [query, setQuery] = useState('');

  const filteredFaq = useMemo(() => {
    if (!query.trim()) return faqItems;
    const value = query.toLowerCase();
    return faqItems.filter((item) =>
      item.title.toLowerCase().includes(value) || item.description.toLowerCase().includes(value)
    );
  }, [query]);

  const handleOpenLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      // ignore
    }
  };

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
            Central de ajuda
          </Text>
          <Text style={[{ color: colors.secondaryText }, typography.bodyMedium]}>
            Encontre respostas rapidas ou abra um ticket.
          </Text>

          <View style={[styles.searchBox, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}>
            <Ionicons name="search-outline" size={18} color={colors.secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: colors.primaryText }]}
              placeholder="Buscar ajuda..."
              placeholderTextColor={colors.secondaryText}
              value={query}
              onChangeText={setQuery}
            />
          </View>

          <View style={[styles.sectionCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}>
            <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>Perguntas frequentes</Text>
            {filteredFaq.map((item) => (
              <View key={item.title} style={styles.faqItem}>
                <Text style={[{ color: colors.primaryText }, typography.bodyMedium]}>{item.title}</Text>
                <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>{item.description}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.sectionCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}>
            <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>Canais de atendimento</Text>
            {contactItems.map((item) => (
              <TouchableOpacity
                key={item.title}
                style={styles.contactRow}
                onPress={() => handleOpenLink(item.action)}
              >
                <Ionicons name={item.icon as any} size={22} color={colors.primary} />
                <View style={styles.contactInfo}>
                  <Text style={[{ color: colors.primaryText }, typography.bodyMedium]}>{item.title}</Text>
                  <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>{item.detail}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.ticketCard, { backgroundColor: colors.secondary, borderRadius: borderRadius.lg }]}
            onPress={() => router.push('/support/ticket')}
          >
            <View>
              <Text style={[{ color: colors.info }, typography.titleMedium]}>
                Ainda precisa de ajuda?
              </Text>
              <Text style={[{ color: colors.info }, typography.bodySmall]}>
                Abra um ticket e fale com nossa equipe.
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={colors.info} />
          </TouchableOpacity>
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
  },
  sectionCard: {
    padding: 16,
    gap: 12,
  },
  faqItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E3E7',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  contactInfo: {
    flex: 1,
  },
  ticketCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
});
