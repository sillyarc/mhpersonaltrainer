'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { firestoreHelpers, useCollectionData } from '@/lib/firestoreHooks';
import { getParticipantInfo, markConversationAsRead, sendMessage } from '@/lib/services/chat';

interface MessageRow {
  id: string;
  senderId?: string;
  senderName?: string;
  senderPhoto?: string;
  content?: string;
  createdAt?: unknown;
}

const buildDayKey = (value?: Date) => {
  if (!value) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDayLabel = (value?: Date) => {
  if (!value) return '';
  const now = new Date();
  const sameYear = value.getFullYear() === now.getFullYear();
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return formatter.format(value);
};

const formatTime = (value?: Date) => {
  if (!value) return '--';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(value);
};

const resolveDate = (value?: unknown) => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const getInitial = (name?: string) => {
  if (!name) return '?';
  return name.trim().charAt(0).toUpperCase() || '?';
};

const IconBack = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

const IconSend = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M3 11.5l18-8-6.5 18-2.7-7.3L3 11.5z" />
  </svg>
);

export default function ChatDetailPage({ params }: { params: { id: string } }) {
  const { user, role } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isStudent = role === 'aluno';
  const conversationId = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    return last && last !== 'chat' ? last : params.id;
  }, [pathname, params.id]);

  const messagesQuery = useMemo(() => [firestoreHelpers.orderBy('createdAt', 'asc')], []);
  const { data } = useCollectionData<MessageRow>(['conversations', conversationId, 'messages'], messagesQuery);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [headerName, setHeaderName] = useState('Conversa');
  const [headerAvatar, setHeaderAvatar] = useState<string | undefined>(undefined);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.uid || !conversationId) return;
    getParticipantInfo(conversationId).then((info) => {
      if (!info) return;
      const otherId = Object.keys(info).find((item) => item !== user.uid);
      if (!otherId) return;
      const participant = info[otherId];
      if (participant?.name) {
        setHeaderName(participant.name);
      }
      if (participant?.photoUrl) {
        setHeaderAvatar(participant.photoUrl);
      }
    });
  }, [conversationId, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !conversationId) return;
    markConversationAsRead(conversationId, user.uid);
  }, [conversationId, data.length, user?.uid]);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [data.length]);

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.uid || !message.trim()) return;
    setSending(true);
    try {
      await sendMessage({
        conversationId,
        senderId: user.uid,
        senderName: user.displayName,
        senderPhoto: user.photoUrl,
        content: message.trim(),
      });
      setMessage('');
    } finally {
      setSending(false);
    }
  };

  if (isStudent) {
    return (
      <section className="student-chat-detail">
        <header className="student-chat-detail-header">
          <button type="button" className="student-chat-back" onClick={() => router.back()}>
            <IconBack />
          </button>
          <div className="student-chat-detail-avatar">
            {headerAvatar ? (
              <img src={headerAvatar} alt={headerName} />
            ) : (
              <span>{getInitial(headerName)}</span>
            )}
          </div>
          <div className="student-chat-detail-meta">
            <strong>{headerName}</strong>
            <span>Conversa em tempo real</span>
          </div>
        </header>

        <div className="student-chat-detail-thread" ref={threadRef}>
          {data.length ? (
            data.map((row, index) => {
              const createdAt = resolveDate(row.createdAt);
              const dayKey = buildDayKey(createdAt);
              const previousDate = resolveDate(data[index - 1]?.createdAt);
              const previousKey = buildDayKey(previousDate);
              const showDay = index === 0 || dayKey !== previousKey;
              const isOwn = row.senderId === user?.uid;
              return (
                <Fragment key={row.id}>
                  {showDay ? <div className="student-chat-day">{formatDayLabel(createdAt)}</div> : null}
                  <div className={`student-chat-bubble${isOwn ? ' is-own' : ''}`}>
                    {!isOwn ? <strong>{row.senderName || headerName}</strong> : null}
                    <p>{row.content || ''}</p>
                    <span>{formatTime(createdAt)}</span>
                  </div>
                </Fragment>
              );
            })
          ) : (
            <div className="student-empty-state">
              <p>Nenhuma mensagem ainda.</p>
            </div>
          )}
        </div>

        <form className="student-chat-compose" onSubmit={handleSend}>
          <input
            type="text"
            placeholder="Digite sua mensagem..."
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button type="submit" disabled={sending || !message.trim()}>
            <IconSend />
          </button>
        </form>
      </section>
    );
  }

  return (
    <PageShell
      title={`Conversa ${conversationId}`}
      description="Mensagens e anexos da conversa."
      breadcrumbs={[{ label: 'Chat', href: '/chat' }]}
    >
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        {data.length ? (
          data.map((item, index) => {
            const createdAt = resolveDate(item.createdAt);
            const dayKey = buildDayKey(createdAt);
            const previousDate = resolveDate(data[index - 1]?.createdAt);
            const previousKey = buildDayKey(previousDate);
            const showDay = index === 0 || dayKey !== previousKey;
            return (
              <Fragment key={item.id}>
                {showDay && <div className="chat-date-divider">{formatDayLabel(createdAt)}</div>}
                <div className="card chat-message-card">
                  <strong>{item.senderName || 'Usuario'}</strong>
                  <p className="subtle" style={{ marginTop: 6 }}>
                    {item.content}
                  </p>
                  <p className="subtle" style={{ marginTop: 6 }}>
                    {formatTime(createdAt)}
                  </p>
                </div>
              </Fragment>
            );
          })
        ) : (
          <p className="subtle">Sem mensagens ainda.</p>
        )}
      </div>
      <form style={{ marginTop: 16, display: 'flex', gap: 12 }} onSubmit={handleSend}>
        <input
          type="text"
          placeholder="Digite sua mensagem"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
        />
        <button className="button" type="submit" disabled={sending || !message.trim()}>
          {sending ? 'Enviando...' : 'Enviar'}
        </button>
      </form>
    </PageShell>
  );
}
