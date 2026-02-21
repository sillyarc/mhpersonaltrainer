'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import AdminGate from '@/components/AdminGate';
import PageShell from '@/components/PageShell';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/lib/auth';
import { formatDate, useCollectionData } from '@/lib/firestoreHooks';
import styles from './page.module.css';

type TicketStatus = 'aberto' | 'em_andamento' | 'respondido' | 'resolvido';

type SupportTicketRow = {
  id: string;
  titulo?: string;
  texto?: string;
  categoria?: string;
  priority?: string;
  status?: string;
  resposta?: string;
  destino?: string;
  userId?: string;
  user?: { id?: string } | null;
  criadoPorNome?: string;
  respostaPorNome?: string;
  data?: unknown;
  d?: unknown;
  createdAt?: unknown;
  respostaEm?: unknown;
};

const PRIORITY_ORDER: Record<string, number> = {
  critica: 4,
  alta: 3,
  media: 2,
  baixa: 1,
};

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    const parsed = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizePriority = (value?: string | null) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'critica') return 'critica';
  if (normalized === 'alta') return 'alta';
  if (normalized === 'media') return 'media';
  return 'baixa';
};

const normalizeStatus = (ticket: SupportTicketRow): TicketStatus => {
  const status = String(ticket.status || '')
    .trim()
    .toLowerCase();
  if (status === 'resolvido' || status === 'fechado') return 'resolvido';
  if (status === 'respondido') return 'respondido';
  if (status === 'em_andamento' || status === 'em andamento') return 'em_andamento';
  if (String(ticket.resposta || '').trim()) return 'respondido';
  return 'aberto';
};

const queueLabel = (value?: string | null) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'tecnico') return 'Tecnico';
  if (normalized === 'financeiro') return 'Financeiro';
  if (normalized === 'produto') return 'Produto';
  if (normalized === 'administrativo') return 'Administracao';
  return 'Administracao';
};

export default function AdminSupportPage() {
  const { user } = useAuth();
  const { data, loading, error } = useCollectionData<SupportTicketRow>(['supporte']);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [queueFilter, setQueueFilter] = useState<'all' | 'administrativo' | 'financeiro' | 'tecnico' | 'produto'>(
    'all'
  );
  const [selectedId, setSelectedId] = useState('');
  const [responseText, setResponseText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const normalized = useMemo(() => {
    return data
      .map((ticket) => {
        const createdDate =
          parseDate(ticket.data) || parseDate(ticket.d) || parseDate(ticket.createdAt) || null;
        return {
          ...ticket,
          normalizedPriority: normalizePriority(ticket.priority),
          normalizedStatus: normalizeStatus(ticket),
          createdDate,
        };
      })
      .sort((a, b) => {
        const aTime = a.createdDate?.getTime() || 0;
        const bTime = b.createdDate?.getTime() || 0;
        if (aTime !== bTime) return bTime - aTime;
        return PRIORITY_ORDER[b.normalizedPriority] - PRIORITY_ORDER[a.normalizedPriority];
      });
  }, [data]);

  const stats = useMemo(() => {
    const total = normalized.length;
    const aberto = normalized.filter((item) => item.normalizedStatus === 'aberto').length;
    const andamento = normalized.filter((item) => item.normalizedStatus === 'em_andamento').length;
    const resolvido = normalized.filter((item) => item.normalizedStatus === 'resolvido').length;
    return { total, aberto, andamento, resolvido };
  }, [normalized]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return normalized.filter((ticket) => {
      if (statusFilter !== 'all' && ticket.normalizedStatus !== statusFilter) return false;
      if (
        queueFilter !== 'all' &&
        String(ticket.destino || 'administrativo')
          .trim()
          .toLowerCase() !== queueFilter
      ) {
        return false;
      }
      if (!term) return true;
      const requester = (
        ticket.criadoPorNome ||
        ticket.userId ||
        ticket.user?.id ||
        ''
      ).toLowerCase();
      return (
        String(ticket.titulo || '').toLowerCase().includes(term) ||
        String(ticket.texto || '').toLowerCase().includes(term) ||
        String(ticket.categoria || '').toLowerCase().includes(term) ||
        requester.includes(term)
      );
    });
  }, [normalized, query, statusFilter, queueFilter]);

  const selected = useMemo(() => {
    const inList = filtered.find((ticket) => ticket.id === selectedId);
    if (inList) return inList;
    return normalized.find((ticket) => ticket.id === selectedId) || filtered[0] || null;
  }, [filtered, normalized, selectedId]);

  useEffect(() => {
    if (!selected || selectedId) return;
    setSelectedId(selected.id);
    setResponseText(selected.resposta || '');
  }, [selected, selectedId]);

  const selectTicket = (ticket: (typeof normalized)[number]) => {
    setSelectedId(ticket.id);
    setResponseText(ticket.resposta || '');
    setMessage('');
    setActionError('');
  };

  const updateTicket = async (status: TicketStatus) => {
    if (!selected || !user?.uid) return;
    setSaving(true);
    setMessage('');
    setActionError('');
    try {
      const payload: Record<string, unknown> = {
        status,
        updatedAt: serverTimestamp(),
      };
      if (responseText.trim()) {
        payload.resposta = responseText.trim();
        payload.respostaPor = user.uid;
        payload.respostaPorNome = user.displayName || user.email || 'Admin';
        payload.respostaEm = serverTimestamp();
      }
      await updateDoc(doc(db, 'supporte', selected.id), payload);
      setMessage(status === 'resolvido' ? 'Ticket marcado como resolvido.' : 'Resposta enviada.');
    } catch (errorSave) {
      console.error('Erro ao atualizar ticket:', errorSave);
      setActionError('Nao foi possivel atualizar o ticket agora.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell
      title="Suporte admin"
      description="Fila de tickets com resposta, acompanhamento e resolucao."
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Suporte' },
      ]}
      actions={[{ label: 'Central de suporte', href: '/support' }]}
    >
      <AdminGate>
        <section className={styles.wrap}>
          <header className={styles.hero}>
            <div>
              <span className={styles.kicker}>Operacao</span>
              <h2>Painel de tickets</h2>
              <p>Visualize chamados, responda usuarios e finalize demandas sem sair do admin.</p>
            </div>
            <div className={styles.stats}>
              <article>
                <span>Total</span>
                <strong>{stats.total}</strong>
              </article>
              <article>
                <span>Abertos</span>
                <strong>{stats.aberto}</strong>
              </article>
              <article>
                <span>Em andamento</span>
                <strong>{stats.andamento}</strong>
              </article>
              <article>
                <span>Resolvidos</span>
                <strong>{stats.resolvido}</strong>
              </article>
            </div>
          </header>

          <div className={styles.controls}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por titulo, descricao, categoria ou usuario"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">Todos os status</option>
              <option value="aberto">Abertos</option>
              <option value="em_andamento">Em andamento</option>
              <option value="respondido">Respondidos</option>
              <option value="resolvido">Resolvidos</option>
            </select>
            <select value={queueFilter} onChange={(event) => setQueueFilter(event.target.value as typeof queueFilter)}>
              <option value="all">Todas as filas</option>
              <option value="administrativo">Administracao</option>
              <option value="financeiro">Financeiro</option>
              <option value="tecnico">Tecnico</option>
              <option value="produto">Produto</option>
            </select>
          </div>

          {error && <p className={styles.error}>{error.message || 'Erro ao carregar tickets.'}</p>}

          <div className={styles.grid}>
            <div className={styles.list}>
              {loading ? <p className="subtle">Carregando tickets...</p> : null}
              {!loading && !filtered.length ? (
                <div className={styles.empty}>
                  <h3>Nenhum ticket encontrado</h3>
                  <p>Ajuste os filtros ou aguarde novos chamados.</p>
                </div>
              ) : null}
              {!loading &&
                filtered.map((ticket) => {
                  const priority = normalizePriority(ticket.priority);
                  const status = ticket.normalizedStatus;
                  const requester = ticket.criadoPorNome || ticket.userId || ticket.user?.id || 'Sem usuario';
                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      className={`${styles.item} ${selected?.id === ticket.id ? styles.itemActive : ''}`}
                      onClick={() => selectTicket(ticket)}
                    >
                      <div className={styles.itemTop}>
                        <strong>{ticket.titulo || 'Ticket sem titulo'}</strong>
                        <span className={`${styles.badge} ${styles[`priority_${priority}`]}`}>{priority}</span>
                      </div>
                      <p>{ticket.texto || 'Sem descricao.'}</p>
                      <div className={styles.itemMeta}>
                        <span>{queueLabel(ticket.destino)}</span>
                        <span className={`${styles.badge} ${styles[`status_${status}`]}`}>
                          {status.replace('_', ' ')}
                        </span>
                        <span>{formatDate(ticket.createdDate)}</span>
                        <span>{requester}</span>
                      </div>
                    </button>
                  );
                })}
            </div>

            <aside className={styles.detail}>
              {!selected ? (
                <div className={styles.empty}>
                  <h3>Selecione um ticket</h3>
                  <p>Escolha um chamado na lista para responder.</p>
                </div>
              ) : (
                <>
                  <div className={styles.detailHead}>
                    <div>
                      <h3>{selected.titulo || 'Ticket sem titulo'}</h3>
                      <p>{selected.texto || 'Sem descricao.'}</p>
                    </div>
                    <div className={styles.detailBadges}>
                      <span className={`${styles.badge} ${styles[`priority_${selected.normalizedPriority}`]}`}>
                        {selected.normalizedPriority}
                      </span>
                      <span className={`${styles.badge} ${styles[`status_${selected.normalizedStatus}`]}`}>
                        {selected.normalizedStatus.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className={styles.detailMeta}>
                    <div>
                      <span>Fila</span>
                      <strong>{queueLabel(selected.destino)}</strong>
                    </div>
                    <div>
                      <span>Categoria</span>
                      <strong>{selected.categoria || 'Sem categoria'}</strong>
                    </div>
                    <div>
                      <span>Abertura</span>
                      <strong>{formatDate(selected.createdDate)}</strong>
                    </div>
                    <div>
                      <span>Solicitante</span>
                      <strong>{selected.criadoPorNome || selected.userId || selected.user?.id || '-'}</strong>
                    </div>
                  </div>

                  <label className={styles.replyLabel}>
                    Resposta do admin
                    <textarea
                      rows={8}
                      value={responseText}
                      onChange={(event) => setResponseText(event.target.value)}
                      placeholder="Escreva a resposta com passos claros para o usuario."
                    />
                  </label>

                  {actionError ? <p className={styles.error}>{actionError}</p> : null}
                  {message ? <p className={styles.success}>{message}</p> : null}

                  <div className={styles.actions}>
                    <button className="button" type="button" disabled={saving} onClick={() => updateTicket('respondido')}>
                      {saving ? 'Salvando...' : 'Responder ticket'}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={saving}
                      onClick={() => updateTicket('em_andamento')}
                    >
                      Marcar em andamento
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={saving}
                      onClick={() => updateTicket('resolvido')}
                    >
                      Resolver ticket
                    </button>
                    <Link className="button secondary" href="/chat">
                      Abrir chat
                    </Link>
                  </div>
                </>
              )}
            </aside>
          </div>
        </section>
      </AdminGate>
    </PageShell>
  );
}
