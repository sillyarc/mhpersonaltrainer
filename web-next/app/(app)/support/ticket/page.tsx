'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { addDoc, collection, doc, Timestamp } from 'firebase/firestore';
import PageShell from '@/components/PageShell';
import UserScopePicker from '@/components/data/UserScopePicker';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebaseClient';
import { firestoreHelpers, formatDate, useCollectionData, useUserScope } from '@/lib/firestoreHooks';
import styles from './page.module.css';

type TicketPriority = 'baixa' | 'media' | 'alta' | 'critica';
type TicketQueue = 'administrativo' | 'financeiro' | 'tecnico' | 'produto';
type TicketContact = 'chat' | 'email' | 'telefone';

type TicketRow = {
  id: string;
  titulo?: string;
  texto?: string;
  categoria?: string;
  priority?: string;
  status?: string;
  resposta?: string;
  destino?: TicketQueue | string;
  data?: unknown;
  d?: unknown;
  createdAt?: unknown;
  userId?: string;
  user?: { id?: string } | null;
};

const PRIORITY_OPTIONS: Array<{ value: TicketPriority; label: string; note: string }> = [
  { value: 'baixa', label: 'Baixa', note: 'Nao bloqueia operacao.' },
  { value: 'media', label: 'Media', note: 'Impacta rotina, sem queda total.' },
  { value: 'alta', label: 'Alta', note: 'Afeta alunos e operacao.' },
  { value: 'critica', label: 'Critica', note: 'Bloqueia atividade principal.' },
];

const QUEUE_OPTIONS: Array<{ value: TicketQueue; label: string; hint: string }> = [
  { value: 'administrativo', label: 'Administracao', hint: 'Conta, permissao, regras e cadastro.' },
  { value: 'financeiro', label: 'Financeiro', hint: 'Assinatura, repasses, pagamento e cobranca.' },
  { value: 'tecnico', label: 'Tecnico', hint: 'Erro no app, bug, lentidao e sincronizacao.' },
  { value: 'produto', label: 'Produto', hint: 'Sugestao de melhoria e novas funcionalidades.' },
];

const CATEGORY_OPTIONS = [
  'Conta',
  'Treinos',
  'Avaliacoes',
  'Agenda',
  'Financeiro',
  'Chat',
  'Notificacoes',
  'Integracoes',
  'Outro',
];

const TEMPLATE_OPTIONS = [
  {
    label: 'Falha ao salvar treino',
    queue: 'tecnico' as TicketQueue,
    category: 'Treinos',
    priority: 'alta' as TicketPriority,
    title: 'Erro ao salvar treino',
    description:
      'Ao tentar salvar um treino, a tela retorna erro e o aluno nao recebe atualizacao. Preciso de validacao tecnica.',
  },
  {
    label: 'Duvida de repasse',
    queue: 'financeiro' as TicketQueue,
    category: 'Financeiro',
    priority: 'alta' as TicketPriority,
    title: 'Duvida sobre repasse financeiro',
    description:
      'Preciso confirmar valores e datas de repasse. O painel mostra divergencia entre o recebido e o previsto.',
  },
  {
    label: 'Permissao de equipe',
    queue: 'administrativo' as TicketQueue,
    category: 'Conta',
    priority: 'media' as TicketPriority,
    title: 'Ajuste de permissao da conta',
    description:
      'Solicito revisao de permissao na conta para liberar acesso de membros da equipe ao modulo correto.',
  },
  {
    label: 'Sugestao de melhoria',
    queue: 'produto' as TicketQueue,
    category: 'Outro',
    priority: 'baixa' as TicketPriority,
    title: 'Sugestao para melhoria do fluxo',
    description:
      'Gostaria de sugerir melhoria no fluxo para reduzir cliques em tarefas repetitivas no dia a dia do personal.',
  },
];

const CONTACT_OPTIONS: Array<{ value: TicketContact; label: string }> = [
  { value: 'chat', label: 'Chat no app' },
  { value: 'email', label: 'Email' },
  { value: 'telefone', label: 'Telefone' },
];

const toDateValue = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as any)?.toDate === 'function') return (value as any).toDate();
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const normalizePriorityLabel = (value?: string | null) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'critica') return 'Critica';
  if (normalized === 'alta') return 'Alta';
  if (normalized === 'media') return 'Media';
  return 'Baixa';
};

const resolveStatus = (ticket: TicketRow) => {
  const explicit = String(ticket.status || '')
    .trim()
    .toLowerCase();
  if (explicit === 'resolvido' || explicit === 'fechado') return 'resolvido';
  if (explicit === 'em_andamento' || explicit === 'em andamento') return 'andamento';
  if (String(ticket.resposta || '').trim()) return 'respondido';
  return 'aberto';
};

const queueLabelMap: Record<TicketQueue, string> = {
  administrativo: 'Administracao',
  financeiro: 'Financeiro',
  tecnico: 'Tecnico',
  produto: 'Produto',
};

const priorityClassMap: Record<string, string> = {
  Baixa: styles.priorityLow,
  Media: styles.priorityMedium,
  Alta: styles.priorityHigh,
  Critica: styles.priorityCritical,
};

const statusClassMap: Record<string, string> = {
  aberto: styles.statusOpen,
  andamento: styles.statusProgress,
  respondido: styles.statusAnswered,
  resolvido: styles.statusResolved,
};

export default function TicketSupportPage() {
  const { user, role } = useAuth();
  const { userId } = useUserScope();
  const searchParams = useSearchParams();
  const requestedQueue = searchParams.get('queue');

  const [queue, setQueue] = useState<TicketQueue>('administrativo');
  const [category, setCategory] = useState('Treinos');
  const [priority, setPriority] = useState<TicketPriority>('media');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState('');
  const [contextLink, setContextLink] = useState('');
  const [preferredContact, setPreferredContact] = useState<TicketContact>('chat');
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  const userRef = useMemo(() => (userId ? doc(db, 'users', userId) : null), [userId]);
  const ticketPath = userId ? ['supporte'] : ['supporte', undefined];
  const userIdConstraints = useMemo(
    () => (userId ? [firestoreHelpers.where('userId', '==', userId)] : []),
    [userId]
  );
  const userRefConstraints = useMemo(
    () => (userRef ? [firestoreHelpers.where('user', '==', userRef)] : []),
    [userRef]
  );

  const { data: userIdRows, loading: loadingById } = useCollectionData<TicketRow>(ticketPath, userIdConstraints);
  const { data: userRefRows, loading: loadingByRef } = useCollectionData<TicketRow>(ticketPath, userRefConstraints);

  const tickets = useMemo(() => {
    const map = new Map<string, TicketRow>();
    [...userIdRows, ...userRefRows].forEach((row) => {
      map.set(row.id, row);
    });
    return Array.from(map.values()).sort((a, b) => {
      const aDate =
        toDateValue(a.data)?.getTime() ||
        toDateValue(a.d)?.getTime() ||
        toDateValue(a.createdAt)?.getTime() ||
        0;
      const bDate =
        toDateValue(b.data)?.getTime() ||
        toDateValue(b.d)?.getTime() ||
        toDateValue(b.createdAt)?.getTime() ||
        0;
      return bDate - aDate;
    });
  }, [userIdRows, userRefRows]);

  useEffect(() => {
    if (!requestedQueue) return;
    const isKnownQueue = QUEUE_OPTIONS.some((item) => item.value === requestedQueue);
    if (isKnownQueue) {
      setQueue(requestedQueue as TicketQueue);
    }
  }, [requestedQueue]);

  const summary = useMemo(() => {
    const total = tickets.length;
    const abertos = tickets.filter((ticket) => resolveStatus(ticket) === 'aberto').length;
    const andamento = tickets.filter((ticket) => resolveStatus(ticket) === 'andamento').length;
    const resolvidos = tickets.filter((ticket) => resolveStatus(ticket) === 'resolvido').length;
    return { total, abertos, andamento, resolvidos };
  }, [tickets]);

  const applyTemplate = (template: (typeof TEMPLATE_OPTIONS)[number]) => {
    setQueue(template.queue);
    setCategory(template.category);
    setPriority(template.priority);
    setTitle(template.title);
    setDescription(template.description);
    setSubmitError('');
    setSubmitSuccess('');
  };

  const resetForm = () => {
    setCategory('Treinos');
    setPriority('media');
    setTitle('');
    setDescription('');
    setImpact('');
    setContextLink('');
    setPreferredContact('chat');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) {
      setSubmitError('Usuario nao identificado. Faca login novamente.');
      return;
    }

    const safeTitle = title.trim();
    const safeDescription = description.trim();
    if (safeTitle.length < 6) {
      setSubmitError('Informe um assunto com pelo menos 6 caracteres.');
      return;
    }
    if (safeDescription.length < 20) {
      setSubmitError('Descreva o problema com pelo menos 20 caracteres.');
      return;
    }

    const now = Timestamp.now();
    const priorityLabel = normalizePriorityLabel(priority);
    setSending(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      const payload = {
        titulo: safeTitle,
        texto: safeDescription,
        categoria: category,
        priority: priorityLabel,
        priorityLevel: priority,
        status: 'aberto',
        destino: queue,
        impacto: impact.trim(),
        contextoLink: contextLink.trim(),
        canalRetorno: preferredContact,
        data: now,
        d: now,
        createdAt: now,
        updatedAt: now,
        userId,
        user: doc(db, 'users', userId),
        solicitanteRole: role || 'aluno',
        criadoPorNome: user?.displayName || user?.email || 'Usuario',
        resposta: '',
      };
      const created = await addDoc(collection(db, 'supporte'), payload);
      setSubmitSuccess(`Ticket criado com sucesso. Protocolo #${created.id.slice(0, 8).toUpperCase()}.`);
      resetForm();
    } catch (error) {
      console.error('Erro ao criar ticket:', error);
      setSubmitError('Nao foi possivel enviar agora. Tente novamente em instantes.');
    } finally {
      setSending(false);
    }
  };

  return (
    <PageShell
      title="Abertura de ticket"
      description="Canal oficial para personal e equipe contatarem administracao, financeiro e suporte tecnico."
      breadcrumbs={[
        { label: 'Suporte', href: '/support' },
        { label: 'Tickets' },
      ]}
      actions={[{ label: 'Voltar para central', href: '/support' }]}
    >
      <UserScopePicker />

      <section className={styles.layout}>
        <div className={styles.formCard}>
          <header className={styles.formHeader}>
            <div>
              <p className={styles.kicker}>Ticket profissional</p>
              <h2>Abra um chamado com contexto completo.</h2>
              <p>
                Quanto mais detalhado o ticket, mais rapido o admin consegue atuar e responder com acao objetiva.
              </p>
            </div>
          </header>

          <div className={styles.templateRow}>
            {TEMPLATE_OPTIONS.map((template) => (
              <button key={template.label} type="button" className={styles.templateButton} onClick={() => applyTemplate(template)}>
                {template.label}
              </button>
            ))}
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.fieldGrid}>
              <label>
                Encaminhar para
                <select value={queue} onChange={(event) => setQueue(event.target.value as TicketQueue)}>
                  {QUEUE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <small>{QUEUE_OPTIONS.find((item) => item.value === queue)?.hint}</small>
              </label>

              <label>
                Categoria
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {CATEGORY_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Prioridade
                <select value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)}>
                  {PRIORITY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <small>{PRIORITY_OPTIONS.find((item) => item.value === priority)?.note}</small>
              </label>

              <label>
                Canal preferencial de retorno
                <select value={preferredContact} onChange={(event) => setPreferredContact(event.target.value as TicketContact)}>
                  {CONTACT_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Assunto
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex: Falha ao salvar treino do aluno"
              />
            </label>

            <label>
              Descricao detalhada
              <textarea
                rows={6}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Informe o que aconteceu, quando ocorreu, para quem ocorreu e o que voce ja tentou fazer."
              />
            </label>

            <div className={styles.fieldGrid}>
              <label>
                Impacto no seu trabalho
                <input
                  type="text"
                  value={impact}
                  onChange={(event) => setImpact(event.target.value)}
                  placeholder="Ex: 12 alunos sem acesso aos treinos"
                />
              </label>
              <label>
                Link ou referencia (opcional)
                <input
                  type="text"
                  value={contextLink}
                  onChange={(event) => setContextLink(event.target.value)}
                  placeholder="URL da tela, ID do aluno ou print"
                />
              </label>
            </div>

            {submitError ? <p className={styles.error}>{submitError}</p> : null}
            {submitSuccess ? <p className={styles.success}>{submitSuccess}</p> : null}

            <div className={styles.formActions}>
              <button className="button" type="submit" disabled={sending}>
                {sending ? 'Enviando...' : 'Criar ticket'}
              </button>
              <Link className="button secondary" href="/chat">
                Abrir chat
              </Link>
            </div>
          </form>
        </div>

        <aside className={styles.sideCard}>
          <h3>Painel rapido</h3>
          <div className={styles.sideStats}>
            <article>
              <span>Total</span>
              <strong>{summary.total}</strong>
            </article>
            <article>
              <span>Abertos</span>
              <strong>{summary.abertos}</strong>
            </article>
            <article>
              <span>Em andamento</span>
              <strong>{summary.andamento}</strong>
            </article>
            <article>
              <span>Resolvidos</span>
              <strong>{summary.resolvidos}</strong>
            </article>
          </div>
          <div className={styles.sideTips}>
            <h4>Checklist para resposta rapida</h4>
            <ul>
              <li>Informe horario exato do problema.</li>
              <li>Inclua aluno, treino ou modulo afetado.</li>
              <li>Explique impacto na rotina ou no faturamento.</li>
              <li>Use prioridade alta apenas para bloqueios reais.</li>
            </ul>
          </div>
        </aside>
      </section>

      <section className={styles.listSection}>
        <div className={styles.sectionHeader}>
          <h3>Historico de tickets</h3>
          <p>Acompanhe retorno do admin e andamento dos chamados.</p>
        </div>

        {loadingById || loadingByRef ? (
          <div className={styles.emptyState}>Carregando tickets...</div>
        ) : tickets.length ? (
          <div className={styles.ticketList}>
            {tickets.map((ticket) => {
              const priorityLabel = normalizePriorityLabel(ticket.priority);
              const status = resolveStatus(ticket);
              const queueLabel = queueLabelMap[(ticket.destino as TicketQueue) || 'administrativo'] || 'Administracao';
              const createdDate =
                toDateValue(ticket.data) || toDateValue(ticket.d) || toDateValue(ticket.createdAt);
              return (
                <article key={ticket.id} className={styles.ticketCard}>
                  <header>
                    <div>
                      <span className={styles.protocol}>#{ticket.id.slice(0, 8).toUpperCase()}</span>
                      <h4>{ticket.titulo || 'Ticket sem titulo'}</h4>
                    </div>
                    <div className={styles.badges}>
                      <span className={`${styles.priorityBadge} ${priorityClassMap[priorityLabel]}`}>{priorityLabel}</span>
                      <span className={`${styles.statusBadge} ${statusClassMap[status]}`}>{status}</span>
                    </div>
                  </header>
                  <p>{ticket.texto || 'Sem descricao registrada.'}</p>
                  <footer>
                    <span>{ticket.categoria || 'Sem categoria'}</span>
                    <span>{queueLabel}</span>
                    <span>{formatDate(createdDate)}</span>
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h4>Nenhum ticket encontrado</h4>
            <p>Crie seu primeiro ticket para conversar com o time administrativo.</p>
          </div>
        )}
      </section>
    </PageShell>
  );
}
