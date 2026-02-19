import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { createSupportTicket, fetchAllSupportTickets, fetchSupportTicketsForUser, updateSupportTicketResponse } from '../../src/services/support';
import { SupportTicket } from '../../src/types/support';

const categoryOptions = [
  'Problema tecnico',
  'Duvida sobre produto',
  'Solicitacao de recurso',
  'Problema de cobranca',
  'Outro',
];

const priorityOptions = ['Baixa', 'Media', 'Alta', 'Urgente'];

export default function TicketSupportScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { user, role } = useAuthStore();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState(categoryOptions[0]);
  const [priority, setPriority] = useState(priorityOptions[1]);
  const [responseDraft, setResponseDraft] = useState<Record<string, string>>({});

  const isAdmin = role === 'admin';

  const loadTickets = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
      if (!user?.uid) {
        setTickets([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (mode === 'initial') {
        setLoading(true);
      } else if (mode === 'refresh') {
        setRefreshing(true);
      }
      try {
        const result = isAdmin
          ? await fetchAllSupportTickets()
          : await fetchSupportTicketsForUser(user.uid);
        setTickets(result.data || []);
      } finally {
        if (mode === 'initial') {
          setLoading(false);
        } else if (mode === 'refresh') {
          setRefreshing(false);
        }
      }
    },
    [isAdmin, user?.uid]
  );

  useEffect(() => {
    loadTickets('initial');
  }, [loadTickets]);

  const handleCreateTicket = async () => {
    if (!user?.uid) return;
    if (!title.trim() || !message.trim()) {
      showAlert('Atencao', 'Informe titulo e descricao.');
      return;
    }
    const result = await createSupportTicket(user.uid, {
      titulo: title.trim(),
      texto: message.trim(),
      categoria: category,
      priority,
    });
    if (result.error) {
      showAlert('Erro', result.error);
      return;
    }
    setTitle('');
    setMessage('');
    setCategory(categoryOptions[0]);
    setPriority(priorityOptions[1]);
    loadTickets('silent');
  };

  const handleSaveResponse = async (ticketId: string) => {
    const responseText = responseDraft[ticketId];
    if (!responseText || !responseText.trim()) {
      showAlert('Atencao', 'Digite uma resposta.');
      return;
    }
    const result = await updateSupportTicketResponse(ticketId, responseText.trim());
    if (result.error) {
      showAlert('Erro', result.error);
      return;
    }
    setResponseDraft((prev) => ({ ...prev, [ticketId]: '' }));
    loadTickets('silent');
  };

  const summaryText = useMemo(() => {
    if (loading) return 'Carregando tickets...';
    if (!tickets.length) return 'Nenhum ticket encontrado';
    return `${tickets.length} ticket(s)`;
  }, [loading, tickets.length]);

  const renderTicket = ({ item }: { item: SupportTicket }) => (
    <View
      style={[
        styles.ticketCard,
        {
          backgroundColor: colors.secondaryBackground,
          borderRadius: borderRadius.lg,
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
      ]}
    >
      <View style={styles.ticketHeader}>
        <Text style={[{ color: colors.primaryText }, typography.titleSmall]}>
          {item.titulo}
        </Text>
        <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
          {item.data ? item.data.toLocaleDateString('pt-BR') : '--'}
        </Text>
      </View>
      <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
        {item.texto}
      </Text>
      <View style={styles.tagRow}>
        <Text style={[styles.tag, { backgroundColor: colors.surface, color: colors.secondaryText }]}>
          {item.categoria || 'Outro'}
        </Text>
        <Text style={[styles.tag, { backgroundColor: colors.surface, color: colors.secondaryText }]}>
          {item.priority || 'Baixa'}
        </Text>
      </View>
      {item.resposta ? (
        <View style={[styles.responseBox, { backgroundColor: colors.surface, borderRadius: borderRadius.md }]}>
          <Text style={[{ color: colors.primaryText }, typography.bodySmall]}>
            Resposta: {item.resposta}
          </Text>
        </View>
      ) : null}

      {isAdmin && (
        <View style={styles.responseForm}>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.primaryText }]}
            placeholder="Responder ticket..."
            placeholderTextColor={colors.secondaryText}
            value={responseDraft[item.id] || ''}
            onChangeText={(text) => setResponseDraft((prev) => ({ ...prev, [item.id]: text }))}
          />
          <TouchableOpacity
            style={[styles.responseButton, { backgroundColor: colors.primary, borderRadius: borderRadius.md }]}
            onPress={() => handleSaveResponse(item.id)}
          >
            <Text style={[{ color: colors.info }, typography.labelMedium]}>Enviar resposta</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, { padding: spacing.lg }]}>
          <Text style={[{ color: colors.primaryText }, typography.headlineLarge]}>
            Ticket de suporte
          </Text>
          <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
            {summaryText}
          </Text>
        </View>

        {!isAdmin && (
          <View style={[styles.formCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
            <Text style={[{ color: colors.primaryText }, typography.titleSmall]}>
              Criar ticket
            </Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.primaryText }]}
              placeholder="Titulo do ticket"
              placeholderTextColor={colors.secondaryText}
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={[styles.input, styles.textarea, { borderColor: colors.border, color: colors.primaryText }]}
              placeholder="Descreva seu problema"
              placeholderTextColor={colors.secondaryText}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
            />

            <View style={styles.optionGroup}>
              <Text style={[{ color: colors.primaryText }, typography.labelSmall]}>Categoria</Text>
              <View style={styles.optionRow}>
                {categoryOptions.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.optionChip,
                      {
                        backgroundColor: category === option ? colors.primary : colors.surface,
                        borderRadius: borderRadius.full,
                      },
                    ]}
                    onPress={() => setCategory(option)}
                  >
                    <Text
                      style={[
                        typography.labelSmall,
                        { color: category === option ? colors.info : colors.secondaryText },
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.optionGroup}>
              <Text style={[{ color: colors.primaryText }, typography.labelSmall]}>Prioridade</Text>
              <View style={styles.optionRow}>
                {priorityOptions.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.optionChip,
                      {
                        backgroundColor: priority === option ? colors.primary : colors.surface,
                        borderRadius: borderRadius.full,
                      },
                    ]}
                    onPress={() => setPriority(option)}
                  >
                    <Text
                      style={[
                        typography.labelSmall,
                        { color: priority === option ? colors.info : colors.secondaryText },
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: colors.primary, borderRadius: borderRadius.lg }]}
              onPress={handleCreateTicket}
            >
              <Text style={[{ color: colors.info }, typography.titleSmall]}>Enviar ticket</Text>
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          data={tickets}
          renderItem={renderTicket}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { padding: spacing.lg }]}
          refreshing={refreshing}
          onRefresh={() => loadTickets('refresh')}
          ListEmptyComponent={
            <View style={[styles.emptyContainer, { paddingVertical: spacing['4xl'] }]}>
              <Ionicons name="help-circle-outline" size={64} color={colors.secondaryText} />
              <Text style={[{ color: colors.secondaryText, marginTop: spacing.md }, typography.bodyLarge]}>
                {summaryText}
              </Text>
            </View>
          }
        />
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
    gap: 4,
  },
  formCard: {
    marginHorizontal: 16,
    padding: 16,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textarea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  optionGroup: {
    gap: 6,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  submitButton: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  listContent: {
    flexGrow: 1,
  },
  ticketCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
  },
  responseBox: {
    padding: 10,
    marginTop: 8,
  },
  responseForm: {
    marginTop: 10,
    gap: 8,
  },
  responseButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
