import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Avatar, Card, Loading } from '../../src/components/common';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { spacing, borderRadius } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { firestoreService, Aluno } from '../../src/services/firestoreService';
import { ensureConversation, findPersonalByCode, listenToConversations } from '../../src/services/chat';
import { Conversation } from '../../src/types/chat';

interface ConversationItem {
  id: string;
  conversationId?: string;
  name: string;
  avatar?: string;
  lastMessage?: string;
  time?: string;
  lastMessageAt?: Date;
  isSupport?: boolean;
  unreadCount?: number;
}

const supportContact = {
  id: 'support',
  name: 'Suporte MH',
  avatar: undefined,
  isSupport: true,
};

export default function ChatScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { padding } = useResponsive();
  const { user, role } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Aluno[]>([]);
  const [personalContact, setPersonalContact] = useState<ConversationItem | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const isPersonal = role === 'personal' || role === 'professor' || role === 'admin';

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = listenToConversations(user.uid, (items) => {
      setConversations(items);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (isPersonal) {
      firestoreService.getAlunosDoPersonal(user.uid).then((data) => {
        setStudents(data);
        setLoading(false);
      });
    } else {
      findPersonalByCode(user.codigoPersonal)
        .then((personal) => {
          if (personal) {
            setPersonalContact({
              id: personal.id,
              name: personal.name,
              avatar: personal.photoUrl,
            });
          }
        })
        .finally(() => setLoading(false));
    }
  }, [user?.uid, user?.codigoPersonal, isPersonal]);

  const getConversationMeta = useCallback(
    (contactId: string) => {
      const convo = conversations.find((item) => item.participants.includes(contactId));
      if (!convo) return {};
      const time = convo.lastMessageAt
        ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(convo.lastMessageAt)
        : undefined;
      return {
        lastMessage: convo.lastMessage?.content || 'Sem mensagens',
        time,
        lastMessageAt: convo.lastMessageAt,
        unreadCount: convo.unreadCount?.[user?.uid || ''] || 0,
      };
    },
    [conversations, user?.uid]
  );

  const handleOpenConversation = async (item: ConversationItem) => {
    if (!user?.uid) return;
    if (item.conversationId) {
      router.push({
        pathname: `/chat/${item.conversationId}`,
        params: { name: item.name, avatar: item.avatar || '' },
      });
      return;
    }
    const convo = await ensureConversation({
      userId: user.uid,
      userName: user.displayName,
      userPhoto: user.photoUrl,
      otherUserId: item.id,
      otherName: item.name,
      otherPhoto: item.avatar,
      type: item.isSupport ? 'support' : 'direct',
    });
    router.push({
      pathname: `/chat/${convo.id}`,
      params: { name: item.name, avatar: item.avatar || '' },
    });
  };

  const contactItems: ConversationItem[] = useMemo(() => {
    if (isPersonal) {
      const items = students.map((student) => ({
        id: student.id,
        name: student.nome,
        avatar: student.photoUrl,
      }));
      items.push(supportContact);
      return items;
    }
    const items = [];
    if (personalContact) items.push(personalContact);
    items.push(supportContact);
    return items;
  }, [isPersonal, students, personalContact]);

  const conversationItems = useMemo(() => {
    if (!user?.uid) return [];
    return conversations
      .filter((convo) => convo.type !== 'ai')
      .map((convo) => {
        const otherId = convo.participants.find((item) => item !== user.uid);
        if (!otherId) return null;
        const info = convo.participantInfo?.[otherId];
        const time = convo.lastMessageAt
          ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
              convo.lastMessageAt
            )
          : undefined;
        return {
          id: otherId,
          conversationId: convo.id,
          name: info?.name || 'Conversa',
          avatar: info?.photoUrl,
          lastMessage: convo.lastMessage?.content || 'Sem mensagens',
          time,
          lastMessageAt: convo.lastMessageAt,
          unreadCount: convo.unreadCount?.[user?.uid || ''] || 0,
        } as ConversationItem;
      })
      .filter(Boolean) as ConversationItem[];
  }, [conversations, user?.uid]);

  const contactsWithMeta = useMemo(() => {
    const merged = new Map<string, ConversationItem>();

    conversationItems.forEach((item) => {
      merged.set(item.id, item);
    });

    contactItems.forEach((item) => {
      const existing = merged.get(item.id);
      if (existing) {
        merged.set(item.id, {
          ...existing,
          name: existing.name || item.name,
          avatar: existing.avatar || item.avatar,
          isSupport: existing.isSupport || item.isSupport,
        });
        return;
      }
      merged.set(item.id, {
        ...item,
        ...getConversationMeta(item.id),
      });
    });

    return Array.from(merged.values());
  }, [contactItems, conversationItems, getConversationMeta]);

  const sortedContacts = useMemo(() => {
    return [...contactsWithMeta].sort((a, b) => {
      const timeA = a.lastMessageAt?.getTime() || 0;
      const timeB = b.lastMessageAt?.getTime() || 0;
      if (timeA !== timeB) return timeB - timeA;
      return a.name.localeCompare(b.name);
    });
  }, [contactsWithMeta]);

  const filteredContacts = sortedContacts.filter((conv) =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderConversation = ({ item }: { item: ConversationItem }) => {
    const meta = {
      lastMessage: item.lastMessage,
      time: item.time,
    };
    const hasUnread = (item.unreadCount || 0) > 0;
    return (
      <TouchableOpacity
        style={[styles.conversationItem, { borderBottomColor: colors.border }]}
        onPress={() => handleOpenConversation(item)}
      >
        <View style={styles.avatarContainer}>
          <Avatar source={item.avatar} name={item.name} size="medium" />
        </View>
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={[styles.conversationName, { color: colors.text }]}>
              {item.name}
            </Text>
            <Text style={[styles.conversationTime, { color: colors.textMuted }]}>
              {meta.time || ''}
            </Text>
          </View>
          <View style={styles.conversationFooter}>
            <Text
              style={[
                styles.lastMessage,
                { color: colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {meta.lastMessage || 'Sem mensagens'}
            </Text>
            {hasUnread && (
              <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <View style={[styles.header, { paddingHorizontal: padding }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('chat.conversations')}
        </Text>
      </View>

      <View style={[styles.searchContainer, { paddingHorizontal: padding }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface }]}>
          <Ionicons name="search-outline" size={20} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t('common.search')}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <Card
        style={[styles.aiCard, { marginHorizontal: padding }]}
        onPress={() => router.push('/chat/ai')}
      >
        <View style={styles.aiCardContent}>
          <View style={[styles.aiIconContainer, { backgroundColor: colors.primary }]}>
            <Ionicons name="sparkles" size={28} color="#fff" />
          </View>
          <View style={styles.aiTextContainer}>
            <Text style={[styles.aiTitle, { color: colors.text }]}>
              {t('chat.aiAssistant')}
            </Text>
            <Text style={[styles.aiSubtitle, { color: colors.textSecondary }]}>
              Peca ajuda para montar treinos e tirar duvidas
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={colors.textMuted} />
        </View>
      </Card>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={filteredContacts}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t('chat.noMessages')}
              </Text>
            </View>
          }
        />
      )}
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
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  searchContainer: {
    paddingBottom: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: spacing.xs,
  },
  aiCard: {
    marginBottom: spacing.md,
  },
  aiCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiIconContainer: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTextContainer: {
    flex: 1,
    marginLeft: spacing.md,
  },
  aiTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  aiSubtitle: {
    fontSize: 13,
    marginTop: spacing.xs,
  },
  listContent: {
    flexGrow: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
  },
  avatarContainer: {
    marginRight: spacing.md,
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
  },
  conversationTime: {
    fontSize: 12,
  },
  conversationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    flex: 1,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: spacing.sm,
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
    textAlign: 'center',
  },
});
