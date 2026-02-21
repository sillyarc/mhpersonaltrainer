import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAppStore } from '../../src/store/appStore';
import { changeLanguage, supportedLanguages } from '../../src/i18n';
import { spacing, borderRadius } from '../../src/theme';

export default function LanguageScreen() {
  const { colors } = useTheme();
  const { language, setLanguage } = useAppStore();

  const handleSelect = (code: string) => {
    setLanguage(code);
    changeLanguage(code);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Idioma</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {supportedLanguages.map((lang) => {
          const isSelected = language === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.languageItem,
                {
                  borderColor: colors.border,
                  backgroundColor: isSelected ? colors.primary + '15' : colors.surface,
                },
              ]}
              onPress={() => handleSelect(lang.code)}
            >
              <Text style={[styles.languageLabel, { color: colors.text }]}>{lang.name}</Text>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
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
  content: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  languageLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
});
