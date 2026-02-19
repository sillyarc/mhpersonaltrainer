import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { firestoreService } from '../../src/services/firestoreService';
import {
  fetchFeedbacksByPersonalCode,
  fetchFeedbacksByUser,
  respondToFeedback,
} from '../../src/services/feedback';
import { FeedbackItem } from '../../src/types/feedback';
import { spacing, borderRadius } from '../../src/theme';

export default function FeedbacksScreen() {
  const { colors, typography } = useTheme();
  const { user, role } = useAuthStore();
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [responseText, setResponseText] = useState('');
  const [responding, setResponding] = useState(false);

  const isPersonal = role === 'personal' || role === 'professor';

  const loadFeedbacks = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
      if (!user?.uid) {
        setFeedbacks([]);
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
        if (isPersonal) {
          const codigo = await firestoreService.getCodigoPersonal(user.uid);
          const codigoNumero = Number(codigo);
          if (!codigo || Number.isNaN(codigoNumero)) {
            setFeedbacks([]);
            return;
          }
          const result = await fetchFeedbacksByPersonalCode(codigoNumero);
          setFeedbacks(result.data || []);
        } else {
          const result = await fetchFeedbacksByUser(user.uid);
          setFeedbacks(result.data || []);
        }
      } finally {
        if (mode === 'initial') {
          setLoading(false);
        } else if (mode === 'refresh') {
          setRefreshing(false);
        }
      }
    },
    [user?.uid, isPersonal]
  );

  useEffect(() => {
    loadFeedbacks('initial');
  }, [loadFeedbacks]);

  const openResponse = (feedback: FeedbackItem) => {
    setSelectedFeedback(feedback);
    setResponseText(feedback.respostaDoProf || '');
  };

  const handleSendResponse = async () => {
    if (!selectedFeedback?.refPath) return;
    if (!responseText.trim()) return;
    setResponding(true);
    const result = await respondToFeedback(selectedFeedback.refPath, responseText.trim());
    setResponding(false);
    if (!result.error) {
      setSelectedFeedback(null);
      setResponseText('');
      loadFeedbacks('silent');
    }
  };

  const renderStars = (value?: number) => {
    const rating = Math.round(value || 0);
    return (
      <View style={styles.starsRow}>
        {Array.from({ length: 5 }).map((_, idx) => (
          <Ionicons
            key={idx}
            name={idx < rating ? 'star' : 'star-outline'}
            size={14}
            color={colors.warning}
          />
        ))}
      </View>
    );
  };

  const formatDate = (value?: Date) => {
    if (!value) return '--';
    return value.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
  };

  const formatDuration = (totalSeconds?: number) => {
    if (typeof totalSeconds !== 'number' || totalSeconds <= 0) return '';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const renderItem = ({ item }: { item: FeedbackItem }) => (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardIdentity}>
          <View style={[styles.cardAvatar, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.cardAvatarText, { color: colors.primary }]}>
              {(item.yourName || 'A')[0]?.toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {item.yourName || 'Aluno'}
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
              {formatDate(item.horaDeTermino)}
            </Text>
          </View>
        </View>
        <View style={styles.cardMeta}>
          {renderStars(item.estrela)}
          <View style={[styles.statusPill, { backgroundColor: item.respostaDoProf ? colors.success + '20' : colors.warning + '20' }]}>
            <Text style={[styles.statusText, { color: item.respostaDoProf ? colors.success : colors.warning }]}>
              {item.respostaDoProf ? 'Respondido' : 'Pendente'}
            </Text>
          </View>
        </View>
      </View>

      {item.comentarioDoAluno ? (
        <Text style={[styles.cardBody, { color: colors.textSecondary }]}
        >{item.comentarioDoAluno}</Text>
      ) : null}

      {typeof item.tempoDoTreino === 'number' && item.tempoDoTreino > 0 ? (
        <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>
          Tempo do treino: {formatDuration(item.tempoDoTreino)}
        </Text>
      ) : null}

      {item.respostaDoProf ? (
        <View style={[styles.responseBox, { backgroundColor: colors.primary + '10' }]}
        >
          <Text style={[styles.responseLabel, { color: colors.primary }]}>Resposta</Text>
          <Text style={[styles.responseText, { color: colors.text }]}>
            {item.respostaDoProf}
          </Text>
        </View>
      ) : null}

      {isPersonal && !item.respostaDoProf ? (
        <TouchableOpacity
          style={[styles.replyButton, { borderColor: colors.border }]}
          onPress={() => openResponse(item)}
        >
          <Text style={[styles.replyText, { color: colors.primary }]}>Responder</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Meus feedbacks</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={feedbacks}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={() => loadFeedbacks('refresh')}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubble-outline" size={64} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}
            >{loading ? 'Carregando...' : 'Nenhum feedback encontrado.'}</Text>
          </View>
        }
      />

      <Modal visible={!!selectedFeedback} animationType="slide" transparent>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.modalContent, { backgroundColor: colors.secondaryBackground }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Responder feedback
              </Text>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]}
                placeholder="Digite sua resposta"
                placeholderTextColor={colors.textMuted}
                value={responseText}
                onChangeText={setResponseText}
                multiline
                numberOfLines={4}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, { borderColor: colors.border }]}
                  onPress={() => setSelectedFeedback(null)}
                  disabled={responding}
                >
                  <Text style={[styles.modalButtonText, { color: colors.textSecondary }]}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.primary }]}
                  onPress={handleSendResponse}
                  disabled={responding}
                >
                  <Text style={[styles.modalButtonText, { color: colors.info }]}>
                    {responding ? 'Enviando...' : 'Enviar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
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
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  card: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  cardIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  cardMeta: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  cardAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAvatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  cardMetaText: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  responseBox: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  responseLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  responseText: {
    fontSize: 13,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  replyButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.full,
  },
  replyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
  },
  emptyText: {
    fontSize: 14,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  modalButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  modalButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
