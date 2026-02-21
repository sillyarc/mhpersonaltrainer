import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius } from '../../theme';

export interface SearchableOption {
  id: string;
  label: string;
  description?: string;
}

interface SearchableSelectProps {
  label?: string;
  placeholder?: string;
  options: SearchableOption[];
  value?: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function SearchableSelect({
  label,
  placeholder = 'Selecionar',
  options,
  value,
  onChange,
  disabled = false,
}: SearchableSelectProps) {
  const { colors, typography } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((option) => option.id === value) || null;
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return options;
    return options.filter((option) => {
      const haystack = `${option.label} ${option.description || ''}`.toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [options, query]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <View>
      {label ? (
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      ) : null}
      <TouchableOpacity
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
        onPress={() => !disabled && setOpen(true)}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.valueText,
            { color: selected ? colors.text : colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <View style={styles.overlay}>
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />
          <View style={[styles.modal, { backgroundColor: colors.secondaryBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {label || 'Selecionar'}
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Buscar..."
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.optionRow,
                    { borderBottomColor: colors.border },
                  ]}
                  onPress={() => handleSelect(item.id)}
                >
                  <View style={styles.optionText}>
                    <Text style={[typography.bodyMedium, { color: colors.text }]}>
                      {item.label}
                    </Text>
                    {item.description ? (
                      <Text
                        style={[typography.bodySmall, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                  {value === item.id ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={[typography.bodySmall, { color: colors.textSecondary }]}>
                    Nenhum resultado encontrado.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  field: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  valueText: {
    flex: 1,
    fontSize: 16,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  modal: {
    maxHeight: '80%',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  emptyState: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
});
