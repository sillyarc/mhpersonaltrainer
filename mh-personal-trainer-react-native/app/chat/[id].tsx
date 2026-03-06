import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { showAlert, AlertButton } from '@utils/alert';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { Avatar, Loading } from '../../src/components/common';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import { ChatInput } from '../../src/components/chat/ChatInput';
import { spacing } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import {
  ensureConversation,
  fetchConversation,
  getParticipantInfo,
  listenToMessages,
  clearConversationMessages,
  markConversationAsRead,
  sendMessage,
  updateMessageReaction,
} from '../../src/services/chat';
import { firestoreService } from '../../src/services/firestoreService';
import { sendPushNotificationToUser } from '../../src/services/notifications';
import { Message, ReplyInfo } from '../../src/types/chat';

const emoji = (...codePoints: number[]) => String.fromCodePoint(...codePoints);
const REACTION_OPTIONS = [
  emoji(0x1f44d),
  emoji(0x2764, 0xfe0f),
  emoji(0x1f602),
  emoji(0x1f62e),
  emoji(0x1f622),
  emoji(0x1f64f),
];
const EXTRA_REACTION_OPTIONS = [
  emoji(0x1f44f),
  emoji(0x1f525),
  emoji(0x1f389),
  emoji(0x1f60d),
  emoji(0x1f914),
  emoji(0x1f4aa),
  emoji(0x1f605),
  emoji(0x1f621),
  emoji(0x1f440),
  emoji(0x2705),
  emoji(0x274c),
  emoji(0x2b50),
];

export default function ChatDetailScreen() {
  const { colors } = useTheme();
  const { user, role } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { id, name, avatar } = useLocalSearchParams<{ id: string; name?: string; avatar?: string }>();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [headerName, setHeaderName] = useState(name || 'Conversa');
  const [headerAvatar, setHeaderAvatar] = useState<string | undefined>(
    typeof avatar === 'string' && avatar.length > 0 ? avatar : undefined
  );
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [otherParticipantId, setOtherParticipantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);
  const [expandedReactionMessageId, setExpandedReactionMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 80);
  }, []);

  useEffect(() => {
    let isActive = true;
    const resolveConversation = async () => {
      if (!id || !user?.uid) return;
      setIsLoading(true);
      try {
        const existing = await fetchConversation(id);
        if (existing) {
          if (!isActive) return;
          setConversationId(id);
          const otherId = existing.participants.find((item) => item !== user.uid) || null;
          setOtherParticipantId(otherId);
          return;
        }

        const otherUser = await firestoreService.getUserDocument(id);
        const otherName =
          otherUser?.displayName || (typeof name === 'string' ? name : 'Conversa');
        const otherPhoto =
          otherUser?.photoUrl ||
          (typeof avatar === 'string' && avatar.length > 0 ? avatar : undefined);

        const convo = await ensureConversation({
          userId: user.uid,
          userName: user.displayName,
          userPhoto: user.photoUrl,
          otherUserId: id,
          otherName,
          otherPhoto,
          type: 'direct',
        });

        if (!isActive) return;
        setConversationId(convo.id);
        setOtherParticipantId(id);
        setHeaderName(otherName);
        setHeaderAvatar(otherPhoto);
      } catch (error) {
        console.error('Erro ao carregar conversa:', error);
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    resolveConversation();
    return () => {
      isActive = false;
    };
  }, [id, user?.uid, name, avatar]);

  useEffect(() => {
    if (!conversationId) return;
    const unsubscribe = listenToMessages(conversationId, (items) => {
      setMessages(items);
      setIsLoading(false);
      scrollToBottom();
    });
    return () => unsubscribe();
  }, [conversationId, scrollToBottom]);

  useEffect(() => {
    if (!conversationId || !user?.uid) return;
    markConversationAsRead(conversationId, user.uid);
  }, [conversationId, user?.uid, messages.length]);

  useEffect(() => {
    setReplyTo(null);
    setActiveReactionMessageId(null);
    setExpandedReactionMessageId(null);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !user?.uid) return;
    getParticipantInfo(conversationId).then((info) => {
      if (!info) return;
      const otherId = Object.keys(info).find((item) => item !== user.uid);
      if (!otherId) return;
      const meta = info[otherId];
      if (meta?.name) setHeaderName(meta.name);
      if (meta?.photoUrl) setHeaderAvatar(meta.photoUrl);
    });
  }, [conversationId, user?.uid]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', scrollToBottom);
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setTimeout(() => scrollToBottom(), 60);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scrollToBottom]);

  const handleMenuPress = () => {
    if (!conversationId) return;
    const buttons: AlertButton[] = [];
    if (role === 'professor' && otherParticipantId) {
      buttons.push({
        text: 'Ver aluno',
        onPress: () => router.push(`/student/${otherParticipantId}` as any),
      });
    }
    buttons.push({
      text: 'Limpar conversa',
      style: 'destructive',
      onPress: async () => {
        try {
          await clearConversationMessages(conversationId);
        } catch (error: any) {
          showAlert('Erro', error?.message || 'Nao foi possivel limpar a conversa.');
        }
      },
    });
    buttons.push({ text: 'Cancelar', style: 'cancel' });
    showAlert('Opcoes do chat', 'O que deseja fazer?', buttons);
  };

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!user?.uid || !trimmed) return;
    setIsSending(true);
    setActiveReactionMessageId(null);
    setExpandedReactionMessageId(null);
    try {
      let activeConversationId = conversationId;
      const targetId =
        otherParticipantId || (typeof id === 'string' ? id : null);

      if (!activeConversationId && targetId) {
        const convo = await ensureConversation({
          userId: user.uid,
          userName: user.displayName,
          userPhoto: user.photoUrl,
          otherUserId: targetId,
          otherName: headerName,
          otherPhoto: headerAvatar,
          type: 'direct',
        });
        activeConversationId = convo.id;
        setConversationId(convo.id);
        setOtherParticipantId(targetId);
      }

      if (!activeConversationId) {
        throw new Error('Conversa não encontrada.');
      }

      await sendMessage({
        conversationId: activeConversationId,
        senderId: user.uid,
        senderName: user.displayName,
        senderPhoto: user.photoUrl,
        content: trimmed,
        replyTo: replyTo || undefined,
      });
      setReplyTo(null);
      if (otherParticipantId && otherParticipantId !== user.uid) {
        sendPushNotificationToUser(otherParticipantId, {
          title: user.displayName || 'Nova mensagem',
          body: trimmed,
          data: { type: 'chat', conversationId: activeConversationId },
        }).catch(() => {});
      }
      scrollToBottom();
    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      showAlert('Erro', error?.message || 'Nao foi possivel enviar a mensagem.');
    } finally {
      setIsSending(false);
    }
  };

  const handleReact = useCallback(
    async (messageId: string, emoji: string) => {
      if (!conversationId || !user?.uid) return;
      const message = messages.find((item) => item.id === messageId);
      const current = message?.reactions?.[user.uid];
      const nextReaction = current === emoji ? null : emoji;
      await updateMessageReaction({
        conversationId,
        messageId,
        userId: user.uid,
        reaction: nextReaction,
      });
      setActiveReactionMessageId(null);
      setExpandedReactionMessageId(null);
    },
    [conversationId, messages, user?.uid]
  );

  const handleReply = useCallback(
    (message: Message) => {
      setReplyTo({
        id: message.id,
        senderId: message.senderId,
        senderName: message.senderName,
        content: message.content,
      });
      setActiveReactionMessageId(null);
      setExpandedReactionMessageId(null);
    },
    []
  );

  const dismissReactions = useCallback(() => {
    setActiveReactionMessageId(null);
    setExpandedReactionMessageId(null);
  }, []);

  const renderMessage = ({ item }: { item: Message }) => (
    <MessageBubble
      content={item.content}
      isUser={item.senderId === user?.uid}
      timestamp={item.createdAt}
      workoutData={item.workoutData || undefined}
      feedbackData={item.feedbackData || undefined}
      action={item.action}
      reactions={item.reactions}
      replyTo={item.replyTo}
      showReactionPicker={activeReactionMessageId === item.id}
      reactionOptions={REACTION_OPTIONS}
      extraReactionOptions={EXTRA_REACTION_OPTIONS}
      showAllReactions={expandedReactionMessageId === item.id}
      onLongPress={() =>
        setActiveReactionMessageId((current) => (current === item.id ? null : item.id))
      }
      onReact={(emoji) => handleReact(item.id, emoji)}
      onReply={() => handleReply(item)}
      onShowMoreEmojis={() => {
        setActiveReactionMessageId(item.id);
        setExpandedReactionMessageId((current) => (current === item.id ? null : item.id));
      }}
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Avatar source={headerAvatar} name={headerName} size="small" />
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {headerName}
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
              Conversa em tempo real
            </Text>
          </View>
          <TouchableOpacity style={styles.menuButton} onPress={handleMenuPress}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <Loading />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={[
              styles.messagesList,
              { paddingBottom: spacing.md + insets.bottom + 8 },
            ]}
            onContentSizeChange={scrollToBottom}
            onScrollBeginDrag={dismissReactions}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Nenhuma mensagem ainda
                </Text>
                <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                  Envie uma mensagem para iniciar a conversa
                </Text>
              </View>
            }
          />
        )}

        <ChatInput
          onSend={handleSend}
          onAfterSend={scrollToBottom}
          disabled={isSending}
          loading={isSending}
          placeholder="Digite sua mensagem..."
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  menuButton: {
    padding: spacing.sm,
  },
  messagesList: {
    paddingVertical: spacing.md,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
  },
  emptyText: {
    fontSize: 16,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
