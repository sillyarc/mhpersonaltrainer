'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import PageShell from '@/components/PageShell';
import AdminGate from '@/components/AdminGate';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/firestoreHooks';
import { useAdminDashboardData } from '@/lib/hooks/useAdminDashboardData';
import { getFirebaseDb } from '@/lib/services/firebase';
import { firestoreService, type PersonalProfile } from '@/lib/services/firestoreService';
import { formatCurrency } from '@/lib/services/payments';
import { fetchAllSupportTickets } from '@/lib/services/support';
import type { PaymentRecord } from '@/lib/types/finance';
import type { SupportTicket } from '@/lib/types/support';

type EntryCounts = {
  total: number | null;
  personals: number | null;
  alunos: number | null;
};

const mapPayment = (id: string, data: any): PaymentRecord => ({
  id,
  valorDaCombranca: data.valorDaCombranca ?? 0,
  todoDiaDoMes: data.todoDiaDoMes,
  descricao: data.descricao || 'Cobranca',
  pago: data.Pago ?? data.pago ?? false,
  repetirPMes: data.repetirPMes,
  diaDoPagamento: data.diaDoPagamento ?? data.todoDiaDoMes,
  datas: (data.datas || []).map((item: any) => (item?.toDate ? item.toDate() : new Date(item))),
  checkoutUrl: data.checkoutUrl || data.checkout_url,
  stripeSessionId: data.stripeSessionId || data.stripe_session_id,
  stripePaymentIntentId: data.stripePaymentIntentId || data.paymentIntentId,
  stripeStatus: data.stripeStatus || data.status,
});

const getPaymentDate = (payment: PaymentRecord) => {
  if (!payment.datas?.length) return null;
  const last = payment.datas[payment.datas.length - 1];
  if (!last) return null;
  const date = last instanceof Date ? last : new Date(last);
  return Number.isNaN(date.getTime()) ? null : date;
};

export default function AcademyPortalPage() {
  const { role } = useAuth();
  const { overview, loading, error } = useAdminDashboardData(true);
  const [personals, setPersonals] = useState<PersonalProfile[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [financeError, setFinanceError] = useState('');
  const [entries, setEntries] = useState<EntryCounts>({
    total: null,
    personals: null,
    alunos: null,
  });
  const [entriesError, setEntriesError] = useState('');
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [loadingSupport, setLoadingSupport] = useState(false);
  const [loadingPersonals, setLoadingPersonals] = useState(false);

  useEffect(() => {
    if (role !== 'admin') return;
    let active = true;
    setLoadingPersonals(true);
    firestoreService
      .fetchPersonals(8)
      .then((data) => {
        if (!active) return;
        setPersonals(data);
      })
      .finally(() => {
        if (active) setLoadingPersonals(false);
      });
    return () => {
      active = false;
    };
  }, [role]);

  useEffect(() => {
    if (role !== 'admin') return;
    let active = true;
    setLoadingSupport(true);
    fetchAllSupportTickets()
      .then((result) => {
        if (!active) return;
        if (result.data) {
          setSupportTickets(result.data);
        }
      })
      .finally(() => {
        if (active) setLoadingSupport(false);
      });
    return () => {
      active = false;
    };
  }, [role]);

  useEffect(() => {
    if (role !== 'admin') return;
    let active = true;
    setLoadingPayments(true);
    setFinanceError('');
    const loadPayments = async () => {
      try {
        const db = getFirebaseDb();
        const ref = collectionGroup(db, 'pagamentos');
        const snapshot = await getDocs(query(ref, limit(200)));
        if (!active) return;
        const data = snapshot.docs.map((docItem) => mapPayment(docItem.id, docItem.data()));
        setPayments(data);
      } catch (err: any) {
        if (!active) return;
        setFinanceError(err.message || 'Erro ao carregar pagamentos.');
        setPayments([]);
      } finally {
        if (active) setLoadingPayments(false);
      }
    };
    loadPayments();
    return () => {
      active = false;
    };
  }, [role]);

  useEffect(() => {
    if (role !== 'admin') return;
    let active = true;
    setLoadingEntries(true);
    setEntriesError('');
    const loadEntries = async () => {
      try {
        const db = getFirebaseDb();
        const usersRef = collection(db, 'users');
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const snapshot = await getDocs(query(usersRef, where('created_time', '>=', startOfMonth)));
        if (!active) return;
        let total = 0;
        let personalsCount = 0;
        let adminsCount = 0;
        snapshot.forEach((docItem) => {
          const data = docItem.data();
          total += 1;
          if (data.admin) {
            adminsCount += 1;
          } else if (data.professorAccount) {
            personalsCount += 1;
          }
        });
        const alunosCount = Math.max(0, total - personalsCount - adminsCount);
        setEntries({
          total,
          personals: personalsCount,
          alunos: alunosCount,
        });
      } catch (err: any) {
        if (!active) return;
        setEntriesError(err.message || 'Erro ao carregar entradas.');
        setEntries({ total: null, personals: null, alunos: null });
      } finally {
        if (active) setLoadingEntries(false);
      }
    };
    loadEntries();
    return () => {
      active = false;
    };
  }, [role]);

  const totalUsers = overview?.totalUsers ?? 0;
  const totalPersonals = overview?.totalPersonals ?? 0;
  const totalAlunos = overview?.totalAlunos ?? 0;

  const recentAlunos = useMemo(
    () => (overview?.recentUsers || []).filter((user) => user.role === 'aluno').slice(0, 6),
    [overview?.recentUsers]
  );

  const paymentSummary = useMemo(() => {
    const paid = payments.filter((item) => item.pago);
    const pending = payments.filter((item) => !item.pago);
    const totalPaid = paid.reduce((sum, item) => sum + (item.valorDaCombranca || 0), 0);
    const totalPending = pending.reduce((sum, item) => sum + (item.valorDaCombranca || 0), 0);
    const ticketMedio = paid.length ? totalPaid / paid.length : 0;
    const recentPayments = [...payments]
      .sort((a, b) => (getPaymentDate(b)?.getTime() || 0) - (getPaymentDate(a)?.getTime() || 0))
      .slice(0, 6);
    return {
      totalPaid,
      totalPending,
      ticketMedio,
      recentPayments,
    };
  }, [payments]);

  const supportSummary = useMemo(() => {
    const total = supportTickets.length;
    const abertas = supportTickets.filter((ticket) => !ticket.resposta).length;
    const alta = supportTickets.filter((ticket) => ticket.priority === 'Alta').length;
    const recente = supportTickets.slice(0, 5);
    return { total, abertas, alta, recente };
  }, [supportTickets]);

  return (
    <PageShell
      title="Portal da academia"
      description="Gestao completa de alunos, personais, financeiro e suporte."
      actions={[
        { label: 'Usuarios', href: '/admin/users' },
        { label: 'Notificacoes', href: '/notifications/admin' },
      ]}
    >
      <AdminGate>
        {error && (
          <div className="card" style={{ marginBottom: 24 }}>
            <p style={{ color: '#c0392b' }}>{error}</p>
          </div>
        )}

        <div className="academy-panel">
          <section className="academy-hero-card">
            <div className="academy-hero-content">
              <p className="academy-eyebrow">Operacao central</p>
              <h2>Controle total da academia</h2>
              <p className="subtle">
                Acompanhe entradas de alunos e personais, valores recebidos e suporte em um unico painel.
              </p>
              <div className="academy-hero-actions">
                <Link className="button" href="/admin/users">
                  Gerenciar usuarios
                </Link>
                <Link className="button secondary" href="/support/ticket">
                  Central de suporte
                </Link>
              </div>
            </div>
            <div className="academy-hero-metrics">
              <div>
                <span>Alunos ativos</span>
                <strong>{loading ? '...' : totalAlunos}</strong>
              </div>
              <div>
                <span>Personais ativos</span>
                <strong>{loading ? '...' : totalPersonals}</strong>
              </div>
              <div>
                <span>Usuarios totais</span>
                <strong>{loading ? '...' : totalUsers}</strong>
              </div>
            </div>
          </section>

          <section className="academy-kpi-grid">
            <div className="academy-kpi-card">
              <span>Recebido (amostra)</span>
              <strong>{formatCurrency(paymentSummary.totalPaid)}</strong>
              <small>{loadingPayments ? 'Carregando pagamentos...' : 'Ultimos 200 pagamentos'}</small>
            </div>
            <div className="academy-kpi-card">
              <span>Pendente (amostra)</span>
              <strong>{formatCurrency(paymentSummary.totalPending)}</strong>
              <small>Valores aguardando confirmacao</small>
            </div>
            <div className="academy-kpi-card">
              <span>Ticket medio</span>
              <strong>{formatCurrency(paymentSummary.ticketMedio)}</strong>
              <small>Baseado nos pagamentos pagos</small>
            </div>
            <div className="academy-kpi-card">
              <span>Entradas do mes</span>
              <strong>{loadingEntries ? '...' : entries.total ?? '--'}</strong>
              <small>Cadastros desde o inicio do mes</small>
            </div>
          </section>

          <section className="academy-grid">
            <div className="card academy-section">
              <div className="academy-section-header">
                <div>
                  <h3>Fluxo financeiro</h3>
                  <p className="subtle">Entradas e cobrancas recentes.</p>
                </div>
                <Link href="/financeiro" className="personal-link">
                  Ver financeiro
                </Link>
              </div>
              {financeError && <p className="academy-error">{financeError}</p>}
              <div className="academy-finance-grid">
                <div>
                  <span>Recebido</span>
                  <strong>{formatCurrency(paymentSummary.totalPaid)}</strong>
                </div>
                <div>
                  <span>Pendente</span>
                  <strong>{formatCurrency(paymentSummary.totalPending)}</strong>
                </div>
                <div>
                  <span>Pagamentos na base</span>
                  <strong>{payments.length}</strong>
                </div>
              </div>
              <div className="academy-list">
                {paymentSummary.recentPayments.length ? (
                  paymentSummary.recentPayments.map((payment) => (
                    <div key={payment.id} className="academy-list-item">
                      <div>
                        <strong>{payment.descricao || 'Cobranca'}</strong>
                        <span>
                          {getPaymentDate(payment) ? formatDate(getPaymentDate(payment)) : 'Data nao informada'}
                        </span>
                      </div>
                      <div className="academy-list-meta">
                        <span className={`academy-pill ${payment.pago ? 'is-paid' : 'is-pending'}`}>
                          {payment.pago ? 'Pago' : 'Pendente'}
                        </span>
                        <strong>{formatCurrency(payment.valorDaCombranca || 0)}</strong>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="subtle">
                    {loadingPayments ? 'Carregando pagamentos...' : 'Nenhum pagamento encontrado.'}
                  </p>
                )}
              </div>
            </div>

            <div className="card academy-section">
              <div className="academy-section-header">
                <div>
                  <h3>Entradas do mes</h3>
                  <p className="subtle">Novos cadastros por perfil.</p>
                </div>
                <Link href="/admin/users" className="personal-link">
                  Ver usuarios
                </Link>
              </div>
              {entriesError && <p className="academy-error">{entriesError}</p>}
              <div className="academy-entry-grid">
                <div>
                  <span>Alunos</span>
                  <strong>{loadingEntries ? '...' : entries.alunos ?? '--'}</strong>
                </div>
                <div>
                  <span>Personais</span>
                  <strong>{loadingEntries ? '...' : entries.personals ?? '--'}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{loadingEntries ? '...' : entries.total ?? '--'}</strong>
                </div>
              </div>
              <div className="academy-list">
                {overview?.recentUsers?.length ? (
                  overview.recentUsers.slice(0, 6).map((user) => (
                    <div key={user.id} className="academy-list-item">
                      <div>
                        <strong>{user.name}</strong>
                        <span>{user.email || 'Email nao informado'}</span>
                      </div>
                      <div className="academy-list-meta">
                        <span className="academy-pill">{user.role}</span>
                        <strong>{user.createdAt ? formatDate(user.createdAt) : '-'}</strong>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="subtle">{loading ? 'Carregando...' : 'Nenhum cadastro recente.'}</p>
                )}
              </div>
            </div>
          </section>

          <section className="academy-grid">
            <div className="card academy-section">
              <div className="academy-section-header">
                <div>
                  <h3>Personais em destaque</h3>
                  <p className="subtle">Profissionais ativos na base.</p>
                </div>
                <Link href="/admin/users" className="personal-link">
                  Ver todos
                </Link>
              </div>
              <div className="academy-list">
                {personals.length ? (
                  personals.map((personal) => (
                    <div key={personal.id} className="academy-list-item">
                      <div>
                        <strong>{personal.displayName}</strong>
                        <span>
                          {personal.cidade ? `${personal.cidade}${personal.estado ? ` / ${personal.estado}` : ''}` : 'Cidade nao informada'}
                        </span>
                      </div>
                      <div className="academy-list-meta">
                        <span className="academy-pill">Codigo {personal.codigoPersonal ?? '--'}</span>
                        <strong>{personal.servicos?.length || 0} servicos</strong>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="subtle">
                    {loadingPersonals ? 'Carregando personais...' : 'Nenhum personal encontrado.'}
                  </p>
                )}
              </div>
            </div>

            <div className="card academy-section">
              <div className="academy-section-header">
                <div>
                  <h3>Alunos recentes</h3>
                  <p className="subtle">Ultimos alunos cadastrados.</p>
                </div>
                <Link href="/admin/users" className="personal-link">
                  Ver alunos
                </Link>
              </div>
              <div className="academy-list">
                {recentAlunos.length ? (
                  recentAlunos.map((aluno) => (
                    <div key={aluno.id} className="academy-list-item">
                      <div>
                        <strong>{aluno.name}</strong>
                        <span>{aluno.email || 'Email nao informado'}</span>
                      </div>
                      <div className="academy-list-meta">
                        <span className="academy-pill">Aluno</span>
                        <strong>{aluno.createdAt ? formatDate(aluno.createdAt) : '-'}</strong>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="subtle">{loading ? 'Carregando...' : 'Nenhum aluno recente.'}</p>
                )}
              </div>
            </div>
          </section>

          <section className="academy-grid">
            <div className="card academy-section">
              <div className="academy-section-header">
                <div>
                  <h3>Suporte e qualidade</h3>
                  <p className="subtle">Tickets e prioridades.</p>
                </div>
                <Link href="/support/ticket" className="personal-link">
                  Abrir suporte
                </Link>
              </div>
              <div className="academy-support-grid">
                <div>
                  <span>Tickets</span>
                  <strong>{supportSummary.total}</strong>
                </div>
                <div>
                  <span>Em aberto</span>
                  <strong>{supportSummary.abertas}</strong>
                </div>
                <div>
                  <span>Alta prioridade</span>
                  <strong>{supportSummary.alta}</strong>
                </div>
              </div>
              <div className="academy-list">
                {supportSummary.recente.length ? (
                  supportSummary.recente.map((ticket) => (
                    <div key={ticket.id} className="academy-list-item">
                      <div>
                        <strong>{ticket.titulo}</strong>
                        <span>{ticket.categoria || 'Sem categoria'}</span>
                      </div>
                      <div className="academy-list-meta">
                        <span className="academy-pill">{ticket.priority || 'Baixa'}</span>
                        <strong>{ticket.data ? formatDate(ticket.data) : '-'}</strong>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="subtle">
                    {loadingSupport ? 'Carregando tickets...' : 'Nenhum ticket recente.'}
                  </p>
                )}
              </div>
            </div>

            <div className="card academy-section">
              <div className="academy-section-header">
                <div>
                  <h3>Acoes da academia</h3>
                  <p className="subtle">Atalhos de operacao diaria.</p>
                </div>
              </div>
              <div className="academy-actions-grid">
                <Link href="/admin/users" className="academy-action-card">
                  <strong>Gerenciar usuarios</strong>
                  <span>Permissoes, bloqueios e acesso.</span>
                </Link>
                <Link href="/financeiro" className="academy-action-card">
                  <strong>Fluxo financeiro</strong>
                  <span>Pagamentos, repasses e cobrancas.</span>
                </Link>
                <Link href="/workouts" className="academy-action-card">
                  <strong>Treinos da base</strong>
                  <span>Biblioteca e padroes de treino.</span>
                </Link>
                <Link href="/support/ticket" className="academy-action-card">
                  <strong>Central de suporte</strong>
                  <span>Atendimento rapido e tickets.</span>
                </Link>
              </div>
              <div className="academy-split-list">
                <div>
                  <span>Personais cadastrados</span>
                  <strong>{loading ? '...' : totalPersonals}</strong>
                </div>
                <div>
                  <span>Alunos cadastrados</span>
                  <strong>{loading ? '...' : totalAlunos}</strong>
                </div>
                <div>
                  <span>Entradas de personais</span>
                  <strong>{loadingEntries ? '...' : entries.personals ?? '--'}</strong>
                </div>
                <div>
                  <span>Entradas de alunos</span>
                  <strong>{loadingEntries ? '...' : entries.alunos ?? '--'}</strong>
                </div>
              </div>
            </div>
          </section>
        </div>
      </AdminGate>
    </PageShell>
  );
}
