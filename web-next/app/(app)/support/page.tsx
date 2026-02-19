'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import PageShell from '@/components/PageShell';
import UserScopePicker from '@/components/data/UserScopePicker';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/lib/auth';
import { firestoreHelpers, useCollectionData, useUserScope } from '@/lib/firestoreHooks';
import { doc } from 'firebase/firestore';
import type { Message } from '@/lib/types/chat';
import { ensureConversation, listenToMessages, markConversationAsRead, sendMessage } from '@/lib/services/chat';
import styles from './page.module.css';

type SupportTicketRow = {
  id: string;
  titulo?: string;
  priority?: string;
  status?: string;
  resposta?: string;
  userId?: string;
  user?: { id?: string } | null;
  data?: unknown;
  d?: unknown;
};

const QUICK_GUIDES = [
  {
    title: 'Criar treino do zero',
    description: 'Estruture blocos, series e objetivos em poucos minutos.',
    href: '/workout/create',
    cta: 'Abrir criacao',
  },
  {
    title: 'Organizar agenda',
    description: 'Configure horarios fixos e encaixes sem conflito.',
    href: '/schedule',
    cta: 'Abrir agenda',
  },
  {
    title: 'Avaliacao completa',
    description: 'Registre avaliacao fisica, postural e online no mesmo fluxo.',
    href: '/evaluations',
    cta: 'Ver avaliacoes',
  },
];

const LEARNING_TOPICS = [
  {
    title: 'Primeiros passos no portal',
    audience: 'Novo personal',
    summary: 'Como configurar seu perfil e preparar a conta para atender alunos.',
    steps: ['Complete seu perfil', 'Revise agenda e notificacoes', 'Valide seu codigo de personal'],
    href: '/profile',
    cta: 'Ir para perfil',
  },
  {
    title: 'Fluxo de treinos sem retrabalho',
    audience: 'Rotina diaria',
    summary: 'Crie uma base de treinos e reutilize estruturas por aluno.',
    steps: ['Monte templates', 'Atribua aos alunos', 'Acompanhe ajuste por feedback'],
    href: '/workouts',
    cta: 'Abrir treinos',
  },
  {
    title: 'Avaliacoes e evolucao',
    audience: 'Acompanhamento',
    summary: 'Registre resultados para tomar decisao com dados.',
    steps: ['Escolha tipo de avaliacao', 'Salve medidas e observacoes', 'Use historico para comparar'],
    href: '/evaluations',
    cta: 'Abrir avaliacoes',
  },
  {
    title: 'Financeiro sem duvida',
    audience: 'Recebimentos',
    summary: 'Organize cobrancas e acompanhe assinatura e repasses.',
    steps: ['Revise plano ativo', 'Acompanhe pendencias', 'Abra ticket financeiro quando necessario'],
    href: '/financeiro',
    cta: 'Abrir financeiro',
  },
];

const SUPPORT_QUEUES = [
  {
    key: 'administrativo',
    title: 'Falar com administracao',
    description: 'Conta, cadastro, permissao e politicas internas.',
    meta: 'Retorno medio: ate 24h uteis',
  },
  {
    key: 'financeiro',
    title: 'Falar com financeiro',
    description: 'Pagamentos, repasses, assinatura e cobrancas.',
    meta: 'Retorno medio: ate 1 dia util',
  },
  {
    key: 'tecnico',
    title: 'Suporte tecnico',
    description: 'Erros no app, falhas de sincronizacao e bugs.',
    meta: 'Retorno medio: ate 8h uteis',
  },
];

const priorityScore = (value?: string | null) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'critica') return 4;
  if (normalized === 'alta') return 3;
  if (normalized === 'media') return 2;
  return 1;
};

export default function SupportHomePage() {
  const { user, role } = useAuth();
  const { userId } = useUserScope();
  const userRef = useMemo(() => (userId ? doc(db, 'users', userId) : null), [userId]);
  const ticketPath = userId ? ['supporte'] : ['supporte', undefined];
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [liveConversationId, setLiveConversationId] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [liveInput, setLiveInput] = useState('');
  const [liveSending, setLiveSending] = useState(false);
  const [liveReady, setLiveReady] = useState(false);
  const [liveError, setLiveError] = useState('');

  const userIdConstraints = useMemo(
    () => (userId ? [firestoreHelpers.where('userId', '==', userId)] : []),
    [userId]
  );
  const userRefConstraints = useMemo(
    () => (userRef ? [firestoreHelpers.where('user', '==', userRef)] : []),
    [userRef]
  );

  const { data: userIdRows } = useCollectionData<SupportTicketRow>(ticketPath, userIdConstraints);
  const { data: userRefRows } = useCollectionData<SupportTicketRow>(ticketPath, userRefConstraints);

  const tickets = useMemo(() => {
    const map = new Map<string, SupportTicketRow>();
    [...userIdRows, ...userRefRows].forEach((row) => {
      map.set(row.id, row);
    });
    return Array.from(map.values());
  }, [userIdRows, userRefRows]);

  const stats = useMemo(() => {
    const total = tickets.length;
    const resolvidos = tickets.filter((item) => {
      const status = String(item.status || '')
        .trim()
        .toLowerCase();
      if (status === 'resolvido' || status === 'fechado') return true;
      return Boolean(String(item.resposta || '').trim());
    }).length;
    const abertos = Math.max(total - resolvidos, 0);
    const urgentes = tickets.filter((item) => priorityScore(item.priority) >= 3).length;
    return { total, abertos, resolvidos, urgentes };
  }, [tickets]);

  const roleLabel =
    role === 'personal' || role === 'professor'
      ? 'Atendimento profissional'
      : role === 'academy'
        ? 'Atendimento para academia'
        : role === 'admin'
          ? 'Painel interno de suporte'
          : 'Atendimento ao usuario';

  useEffect(() => {
    if (!user?.uid) {
      setLiveConversationId(null);
      setLiveMessages([]);
      setLiveReady(false);
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | null = null;
    setLiveError('');
    setLiveReady(false);

    const bootLiveChat = async () => {
      try {
        const conversation = await ensureConversation({
          userId: user.uid,
          userName: user.displayName || user.email || 'Usuario',
          userPhoto: user.photoUrl,
          otherUserId: 'support',
          otherName: 'Suporte MH',
          type: 'support',
        });
        if (!active) return;
        setLiveConversationId(conversation.id);
        unsubscribe = listenToMessages(conversation.id, (items) => {
          if (!active) return;
          setLiveMessages(items.slice(-40));
        });
        await markConversationAsRead(conversation.id, user.uid);
        if (!active) return;
        setLiveReady(true);
      } catch (error) {
        console.error('Erro ao iniciar chat ao vivo:', error);
        if (!active) return;
        setLiveError('Nao foi possivel iniciar o chat ao vivo agora.');
        setLiveReady(true);
      }
    };

    bootLiveChat();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [user?.uid, user?.displayName, user?.email, user?.photoUrl]);

  useEffect(() => {
    const node = chatScrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [liveMessages]);

  const handleLiveSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const safeMessage = liveInput.trim();
    if (!safeMessage || !user?.uid || !liveConversationId) return;
    setLiveSending(true);
    setLiveError('');
    setLiveInput('');
    try {
      await sendMessage({
        conversationId: liveConversationId,
        senderId: user.uid,
        senderName: user.displayName || user.email || 'Usuario',
        senderPhoto: user.photoUrl,
        content: safeMessage,
      });
      await markConversationAsRead(liveConversationId, user.uid);
    } catch (error) {
      console.error('Erro ao enviar mensagem no suporte:', error);
      setLiveError('Falha ao enviar mensagem. Tente novamente.');
      setLiveInput(safeMessage);
    } finally {
      setLiveSending(false);
    }
  };

  return (
    <PageShell
      title="Central de suporte"
      description="Fluxo moderno para ajuda rapida, guias do app e abertura de ticket."
      breadcrumbs={[{ label: 'Suporte' }]}
    >
      <UserScopePicker />
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={styles.eyebrow}>{roleLabel}</span>
          <h2>Suporte direto para personal, academia e time interno.</h2>
          <p>
            Abra tickets detalhados para falar com administracao, financeiro ou tecnico e acompanhe o historico
            sem sair do portal.
          </p>
          <div className={styles.heroActions}>
            <Link href="/support/ticket" className="button">
              Abrir novo ticket
            </Link>
            <Link href="/chat" className="button secondary">
              Falar via chat
            </Link>
          </div>
        </div>
        <div className={styles.heroStats}>
          <article>
            <span>Tickets totais</span>
            <strong>{stats.total}</strong>
          </article>
          <article>
            <span>Em aberto</span>
            <strong>{stats.abertos}</strong>
          </article>
          <article>
            <span>Resolvidos</span>
            <strong>{stats.resolvidos}</strong>
          </article>
          <article>
            <span>Alta prioridade</span>
            <strong>{stats.urgentes}</strong>
          </article>
        </div>
      </section>

      <section className={styles.queues}>
        <div className={styles.sectionHead}>
          <h3>Escolha o canal ideal</h3>
          <p>Encaminhe seu chamado para o time certo e acelere a resposta.</p>
        </div>
        <div className={styles.queueGrid}>
          {SUPPORT_QUEUES.map((queue) => (
            <article key={queue.key} className={styles.queueCard}>
              <h4>{queue.title}</h4>
              <p>{queue.description}</p>
              <span>{queue.meta}</span>
              <Link href={`/support/ticket?queue=${queue.key}`} className="button secondary sm">
                Abrir ticket
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.realtime}>
        <div className={styles.sectionHead}>
          <h3>Atendimento em tempo real</h3>
          <p>Converse com o suporte sem sair da central.</p>
        </div>

        <div className={styles.realtimeLayout}>
          <article className={styles.chatCard}>
            <header className={styles.chatHeader}>
              <div>
                <h4>Canal ao vivo com suporte MH</h4>
                <p>Mensagens em tempo real para duvidas rapidas.</p>
              </div>
              <span className={styles.livePill}>Online</span>
            </header>

            <div className={styles.chatFeed} ref={chatScrollRef}>
              {!liveReady ? (
                <div className={styles.chatEmpty}>Conectando chat...</div>
              ) : liveMessages.length ? (
                liveMessages.map((message) => {
                  const mine = message.senderId === user?.uid;
                  return (
                    <div key={message.id} className={`${styles.chatBubble} ${mine ? styles.chatBubbleMine : styles.chatBubbleOther}`}>
                      <span>{message.content}</span>
                      <small>{message.createdAt?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>
                    </div>
                  );
                })
              ) : (
                <div className={styles.chatEmpty}>Sem mensagens ainda. Inicie o atendimento abaixo.</div>
              )}
            </div>

            <form className={styles.chatForm} onSubmit={handleLiveSubmit}>
              <input
                type="text"
                value={liveInput}
                onChange={(event) => setLiveInput(event.target.value)}
                placeholder="Digite sua mensagem para o suporte..."
              />
              <button className="button sm" type="submit" disabled={liveSending || !liveConversationId}>
                {liveSending ? 'Enviando...' : 'Enviar'}
              </button>
            </form>
            {liveError ? <p className={styles.chatError}>{liveError}</p> : null}
          </article>

          <aside className={styles.realtimeAside}>
            <h4>Quando usar chat vs ticket</h4>
            <ul>
              <li>Chat: duvidas pontuais e orientacao rapida.</li>
              <li>Ticket: problemas com impacto, financeiro ou tecnico.</li>
              <li>Ticket: quando precisar de historico e protocolo formal.</li>
            </ul>
            <Link href="/support/ticket" className="button secondary">
              Abrir ticket formal
            </Link>
          </aside>
        </div>
      </section>

      <section className={styles.guides}>
        <div className={styles.sectionHead}>
          <h3>Guias rapidos</h3>
          <p>Atalhos para resolver demandas comuns antes de abrir chamado.</p>
        </div>
        <div className={styles.guideGrid}>
          {QUICK_GUIDES.map((guide) => (
            <article key={guide.title} className={styles.guideCard}>
              <span>Guia rapido</span>
              <h4>{guide.title}</h4>
              <p>{guide.description}</p>
              <Link href={guide.href} className="button secondary sm">
                {guide.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.topics}>
        <div className={styles.sectionHead}>
          <h3>Topicos para aprender o app</h3>
          <p>Conteudo objetivo para o personal dominar o fluxo de trabalho.</p>
        </div>
        <div className={styles.topicGrid}>
          {LEARNING_TOPICS.map((topic) => (
            <article key={topic.title} className={styles.topicCard}>
              <span>{topic.audience}</span>
              <h4>{topic.title}</h4>
              <p>{topic.summary}</p>
              <ol>
                {topic.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <Link href={topic.href} className="button secondary sm">
                {topic.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
