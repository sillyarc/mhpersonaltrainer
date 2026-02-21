'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { firestoreHelpers, formatDate, useCollectionData } from '@/lib/firestoreHooks';
import { ensureConversation, findPersonalByCode, listenToConversations } from '@/lib/services/chat';
import type { Conversation } from '@/lib/types/chat';

interface ConversationRow {
  id: string;
  lastMessage?: string;
  updatedAt?: unknown;
  type?: string;
}

interface StudentConversationItem {
  id: string;
  conversationId?: string;
  name: string;
  avatar?: string;
  lastMessage?: string;
  time?: string;
  lastMessageAt?: Date;
  unreadCount?: number;
  isSupport?: boolean;
}

const supportContact: StudentConversationItem = {
  id: 'support',
  name: 'Suporte MH',
  isSupport: true,
};

const formatChatTime = (value?: Date) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(value);
};

const getInitial = (name?: string) => {
  if (!name) return '?';
  return name.trim().charAt(0).toUpperCase() || '?';
};

const IconSearch = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

const IconSpark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M12 3l1.8 4.6L18 9.3l-4.2 1.7L12 16l-1.8-5-4.2-1.7 4.2-1.7L12 3z" />
    <path d="M5 17l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
  </svg>
);

export default function ChatPage() {
  const { user, role } = useAuth();
  const router = useRouter();
  const isStudent = role === 'aluno';
  const [studentSearch, setStudentSearch] = useState('');
  const [studentLoading, setStudentLoading] = useState(true);
  const [studentConversations, setStudentConversations] = useState<Conversation[]>([]);
  const [studentPersonalContact, setStudentPersonalContact] = useState<StudentConversationItem | null>(null);

  const constraints = useMemo(
    () => (user?.uid ? [firestoreHelpers.where('participants', 'array-contains', user.uid)] : []),
    [user?.uid]
  );
  const { data: portalConversations } = useCollectionData<ConversationRow>(['conversations'], constraints);

  useEffect(() => {
    if (!isStudent || !user?.uid) {
      setStudentConversations([]);
      return;
    }
    const unsubscribe = listenToConversations(user.uid, (items) => {
      setStudentConversations(items);
    });
    return () => unsubscribe();
  }, [isStudent, user?.uid]);

  useEffect(() => {
    if (!isStudent) {
      setStudentLoading(false);
      setStudentPersonalContact(null);
      return;
    }
    if (!user?.uid) {
      setStudentLoading(true);
      setStudentPersonalContact(null);
      return;
    }

    let active = true;
    setStudentLoading(true);
    findPersonalByCode(user.codigoPersonal)
      .then((personal) => {
        if (!active) return;
        if (!personal) {
          setStudentPersonalContact(null);
          return;
        }
        setStudentPersonalContact({
          id: personal.id,
          name: personal.name,
          avatar: personal.photoUrl,
        });
      })
      .catch(() => {
        if (!active) return;
        setStudentPersonalContact(null);
      })
      .finally(() => {
        if (!active) return;
        setStudentLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isStudent, user?.uid, user?.codigoPersonal]);

  const studentContacts = useMemo(() => {
    if (!isStudent) return [] as StudentConversationItem[];
    const items: StudentConversationItem[] = [];
    if (studentPersonalContact) {
      items.push(studentPersonalContact);
    }
    items.push(supportContact);
    return items;
  }, [isStudent, studentPersonalContact]);

  const studentConversationItems = useMemo(() => {
    if (!isStudent || !user?.uid) return [] as StudentConversationItem[];
    return studentConversations
      .filter((conversation) => conversation.type !== 'ai')
      .map((conversation) => {
        const otherId = conversation.participants.find((item) => item !== user.uid);
        if (!otherId) return null;
        const info = conversation.participantInfo?.[otherId];
        const isSupport = conversation.type === 'support' || otherId === supportContact.id;
        return {
          id: otherId,
          conversationId: conversation.id,
          name: info?.name || (isSupport ? supportContact.name : 'Conversa'),
          avatar: info?.photoUrl,
          lastMessage: conversation.lastMessage?.content || 'Sem mensagens',
          time: formatChatTime(conversation.lastMessageAt),
          lastMessageAt: conversation.lastMessageAt,
          unreadCount: conversation.unreadCount?.[user.uid] || 0,
          isSupport,
        } as StudentConversationItem;
      })
      .filter(Boolean) as StudentConversationItem[];
  }, [isStudent, studentConversations, user?.uid]);

  const studentMergedContacts = useMemo(() => {
    if (!isStudent) return [] as StudentConversationItem[];
    const merged = new Map<string, StudentConversationItem>();

    studentConversationItems.forEach((item) => {
      merged.set(item.id, item);
    });

    studentContacts.forEach((item) => {
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
      merged.set(item.id, item);
    });

    return Array.from(merged.values()).sort((a, b) => {
      const timeA = a.lastMessageAt?.getTime?.() || 0;
      const timeB = b.lastMessageAt?.getTime?.() || 0;
      if (timeA !== timeB) return timeB - timeA;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [isStudent, studentContacts, studentConversationItems]);

  const filteredStudentContacts = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return studentMergedContacts;
    return studentMergedContacts.filter((item) => item.name.toLowerCase().includes(query));
  }, [studentMergedContacts, studentSearch]);

  const handleOpenStudentConversation = async (item: StudentConversationItem) => {
    if (!user?.uid) return;
    if (item.conversationId) {
      router.push(`/chat/${item.conversationId}`);
      return;
    }

    try {
      const conversation = await ensureConversation({
        userId: user.uid,
        userName: user.displayName,
        userPhoto: user.photoUrl,
        otherUserId: item.id,
        otherName: item.name,
        otherPhoto: item.avatar,
        type: item.isSupport ? 'support' : 'direct',
      });
      router.push(`/chat/${conversation.id}`);
    } catch (error) {
      console.error('Nao foi possivel abrir conversa:', error);
    }
  };

  const typeLabel = (type?: string) => {
    if (type === 'support') return 'Suporte';
    if (type === 'ai') return 'IA';
    return 'Aluno';
  };

  if (isStudent) {
    return (
      <section className="student-chat student-chat--list">
        <header className="student-card student-card--hero student-chat-hero">
          <p className="student-home-kicker">Chat</p>
          <h1>Conversas</h1>
          <p className="student-home-sub">Converse com seu personal, suporte e IA.</p>
        </header>

        <div className="student-card student-chat-search-card">
          <label className="student-chat-search" aria-label="Buscar conversa">
            <IconSearch />
            <input
              type="search"
              placeholder="Buscar conversa"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
            />
          </label>
        </div>

        <Link href="/chat/ai" className="student-card student-chat-ai-row">
          <div className="student-chat-ai-icon">
            <IconSpark />
          </div>
          <div className="student-chat-ai-meta">
            <strong>Assistente IA</strong>
            <span>Peca ajuda para montar treinos e tirar duvidas.</span>
          </div>
          <span className="student-chat-ai-next">{'>'}</span>
        </Link>

        <div className="student-card student-chat-list-card">
          <div className="student-chat-list-head">
            <strong>Minhas conversas</strong>
            <span>{studentLoading ? '-' : `${filteredStudentContacts.length} contatos`}</span>
          </div>
          <div className="student-chat-list">
            {studentLoading ? (
              <div className="student-chat-loading">
                <p className="student-home-kicker">Carregando conversas</p>
                <p className="student-home-sub">Preparando seus contatos.</p>
              </div>
            ) : filteredStudentContacts.length ? (
              filteredStudentContacts.map((item) => {
                const hasUnread = (item.unreadCount || 0) > 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="student-chat-item"
                    onClick={() => handleOpenStudentConversation(item)}
                  >
                    <div className="student-chat-avatar">
                      {item.avatar ? (
                        <img src={item.avatar} alt={item.name} />
                      ) : (
                        <span>{item.isSupport ? 'S' : getInitial(item.name)}</span>
                      )}
                    </div>
                    <div className="student-chat-main">
                      <div className="student-chat-head">
                        <div className="student-chat-title">
                          <strong>{item.name}</strong>
                          {item.isSupport ? <span className="student-chat-tag">Suporte</span> : null}
                        </div>
                        <span className="student-chat-time">{item.time || ''}</span>
                      </div>
                      <div className="student-chat-foot">
                        <p>{item.lastMessage || 'Sem mensagens'}</p>
                        {hasUnread ? (
                          <span className="student-chat-unread-dot" aria-label="Mensagens nao lidas" />
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="student-chat-empty">
                <p>Nenhuma conversa encontrada.</p>
                <Link href="/support/ticket" className="student-inline-button">
                  Falar com suporte
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <PageShell title="Chat" description="Conversas com alunos e grupos.">
      <div className="chat-shell">
        <div className="chat-list">
          {portalConversations.length ? (
            portalConversations.map((row) => (
              <Link key={row.id} href={`/chat/${row.id}`} className="chat-card">
                <div>
                  <strong>{typeLabel(row.type)}</strong>
                  <p>{row.lastMessage || 'Sem mensagens ainda.'}</p>
                </div>
                <div className="chat-meta">
                  <span>{typeLabel(row.type)}</span>
                  <span>{formatDate(row.updatedAt)}</span>
                </div>
              </Link>
            ))
          ) : (
            <div className="chat-empty">
              <p>Nenhuma conversa encontrada.</p>
              <Link href="/support/ticket" className="portal-link">
                Falar com suporte
              </Link>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

