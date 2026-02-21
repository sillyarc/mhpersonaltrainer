'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import UserScopePicker from '@/components/data/UserScopePicker';
import { useAuth } from '@/lib/auth';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { formatDate, useCollectionData, useUserScope } from '@/lib/firestoreHooks';
import { createPaymentForUser, updatePaymentForUser } from '@/lib/services/financeiro';
import {
  createStripeCheckoutSession,
  fetchStripeConnectStatus,
  formatCurrency,
  type StripeConnectStatus,
} from '@/lib/services/payments';
import type { PaymentRecord } from '@/lib/types/finance';

const STRIPE_FEE_RATE = 0.1;

interface PaymentRow {
  id: string;
  valorDaCombranca?: number;
  valor?: number;
  todoDiaDoMes?: number;
  descricao?: string;
  pago?: boolean;
  Pago?: boolean;
  repetirPMes?: number;
  diaDoPagamento?: number;
  datas?: any[];
  checkoutUrl?: string;
  checkout_url?: string;
  stripeStatus?: string;
  status?: string;
  createdAt?: any;
  data?: any;
}

const normalizePayment = (row: PaymentRow): PaymentRecord => {
  const rawStatus = String(row.status ?? row.stripeStatus ?? '').toLowerCase();
  const paidByStatus = rawStatus === 'paid' || rawStatus === 'pago' || rawStatus === 'succeeded';
  const dates = Array.isArray(row.datas)
    ? row.datas
        .map((item) => (item?.toDate ? item.toDate() : item ? new Date(item) : null))
        .filter(Boolean)
    : [];

  return {
    id: row.id,
    valorDaCombranca: row.valorDaCombranca ?? row.valor ?? 0,
    todoDiaDoMes: row.todoDiaDoMes ?? row.diaDoPagamento ?? undefined,
    descricao: row.descricao ?? 'Cobranca',
    pago: row.Pago ?? row.pago ?? paidByStatus,
    repetirPMes: row.repetirPMes,
    diaDoPagamento: row.diaDoPagamento,
    datas: dates as Date[],
    checkoutUrl: row.checkoutUrl ?? row.checkout_url,
    stripeStatus: row.stripeStatus ?? row.status,
  };
};

const parseAmount = (value: string) => {
  const cleaned = value.replace(/[^\d,.-]/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function FinanceiroPersonalPage() {
  const { userId } = useUserScope();
  const { role, user } = useAuth();
  const dashboard = useDashboardData();
  const isPersonal = role === 'personal' || role === 'professor';
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeMessage, setStripeMessage] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceDescription, setInvoiceDescription] = useState('');
  const [invoiceDueDay, setInvoiceDueDay] = useState('');
  const [invoiceRecurring, setInvoiceRecurring] = useState('1');
  const [invoiceCheckoutUrl, setInvoiceCheckoutUrl] = useState('');
  const [invoiceAutoStripe, setInvoiceAutoStripe] = useState(true);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceMessage, setInvoiceMessage] = useState('');
  const [invoiceError, setInvoiceError] = useState('');

  const stripeReady = useMemo(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    return (
      Boolean(process.env.NEXT_PUBLIC_STRIPE_FUNCTIONS_URL) ||
      (Boolean(apiUrl) && !apiUrl.includes('api.stripe.com'))
    );
  }, []);

  useEffect(() => {
    if (!isPersonal) return;
    if (!dashboard.alunos.length) {
      setSelectedStudentId('');
      return;
    }
    if (!selectedStudentId) {
      setSelectedStudentId(dashboard.alunos[0].id);
    }
  }, [dashboard.alunos, isPersonal, selectedStudentId]);

  const selectedStudent = useMemo(
    () => dashboard.alunos.find((aluno) => aluno.id === selectedStudentId) || null,
    [dashboard.alunos, selectedStudentId]
  );

  const targetUserId = isPersonal ? selectedStudentId : userId;
  const { data } = useCollectionData<PaymentRow>(
    targetUserId ? ['users', targetUserId, 'pagamentos'] : []
  );

  const payments = useMemo(() => data.map(normalizePayment), [data]);
  const orderedPayments = useMemo(() => {
    return [...payments].sort((a, b) => {
      const timeA = a.datas?.[0]?.getTime?.() || 0;
      const timeB = b.datas?.[0]?.getTime?.() || 0;
      return timeB - timeA;
    });
  }, [payments]);

  const totalPendente = useMemo(() => {
    return payments.filter((item) => !item.pago).reduce((sum, item) => sum + (item.valorDaCombranca || 0), 0);
  }, [payments]);

  const totalRecebido = useMemo(() => {
    return payments.filter((item) => item.pago).reduce((sum, item) => sum + (item.valorDaCombranca || 0), 0);
  }, [payments]);

  const taxaPlataforma = totalPendente * STRIPE_FEE_RATE;
  const liquidoEstimado = Math.max(totalPendente - taxaPlataforma, 0);

  useEffect(() => {
    if (!isPersonal || !user?.uid || !stripeReady) {
      setStripeStatus(null);
      setStripeMessage(stripeReady ? '' : 'Stripe nao configurado.');
      return;
    }

    let active = true;
    setStripeLoading(true);
    setStripeMessage('');
    fetchStripeConnectStatus(user.uid, user.stripeAccountId)
      .then((result) => {
        if (!active) return;
        setStripeStatus(result.data);
      })
      .catch(() => {
        if (!active) return;
        setStripeStatus(null);
        setStripeMessage('Nao foi possivel verificar o Stripe.');
      })
      .finally(() => {
        if (!active) return;
        setStripeLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isPersonal, stripeReady, user?.stripeAccountId, user?.uid]);

  const stripeConnected = Boolean(stripeStatus?.chargesEnabled) && stripeStatus?.detailsSubmitted !== false;
  const stripeLabel = stripeLoading
    ? 'Verificando Stripe'
    : stripeMessage
    ? stripeMessage
    : stripeConnected
    ? 'Conectado para receber pagamentos'
    : 'Conectar Stripe para cobrar alunos';

  useEffect(() => {
    if (!stripeConnected) {
      setInvoiceAutoStripe(false);
    }
  }, [stripeConnected]);

  const amountPreview = parseAmount(invoiceAmount);

  const handleCreateInvoice = async () => {
    setInvoiceError('');
    setInvoiceMessage('');
    if (!selectedStudentId) {
      setInvoiceError('Selecione um aluno para enviar a fatura.');
      return;
    }
    const amount = parseAmount(invoiceAmount);
    if (!amount || amount <= 0) {
      setInvoiceError('Informe um valor valido.');
      return;
    }
    const description = invoiceDescription.trim() || 'Fatura do personal';
    const dueDay = invoiceDueDay ? Number(invoiceDueDay) : undefined;
    if (dueDay && (Number.isNaN(dueDay) || dueDay < 1 || dueDay > 31)) {
      setInvoiceError('Dia de vencimento invalido.');
      return;
    }

    const recurringValue = Number(invoiceRecurring || 0);
    setInvoiceLoading(true);
    const payload: Omit<PaymentRecord, 'id'> = {
      valorDaCombranca: amount,
      descricao: description,
      todoDiaDoMes: dueDay,
      repetirPMes: recurringValue > 0 ? recurringValue : undefined,
      diaDoPagamento: dueDay,
      datas: [new Date()],
      checkoutUrl: invoiceCheckoutUrl.trim() || undefined,
      personalCode: user?.codigoPersonal,
    };

    const result = await createPaymentForUser(selectedStudentId, payload);
    if (result.error || !result.data) {
      setInvoiceError(result.error || 'Nao foi possivel criar a fatura.');
      setInvoiceLoading(false);
      return;
    }

    let checkoutUrl = invoiceCheckoutUrl.trim();
    if (invoiceAutoStripe && stripeConnected && stripeReady && !checkoutUrl && user?.uid) {
      const stripeAmount = Math.round(amount * 100);
      const feeAmount = Math.round(stripeAmount * STRIPE_FEE_RATE);
      const checkout = await createStripeCheckoutSession({
        amount: stripeAmount,
        currency: 'brl',
        studentId: selectedStudentId,
        personalId: user.uid,
        paymentId: result.data.id,
        destinationAccountId: user?.stripeAccountId,
        applicationFeeAmount: feeAmount,
        description,
      });
      if (checkout.data?.checkoutUrl) {
        checkoutUrl = checkout.data.checkoutUrl;
        await updatePaymentForUser(selectedStudentId, result.data.id, {
          checkoutUrl,
          stripeSessionId: checkout.data.sessionId,
          stripePaymentIntentId: checkout.data.paymentIntentId,
          stripeStatus: checkout.data.status,
        });
      } else if (checkout.error) {
        setInvoiceMessage('Fatura criada, mas o link do Stripe nao foi gerado.');
      }
    }

    setInvoiceMessage(
      checkoutUrl
        ? 'Fatura criada e pronta para pagamento.'
        : 'Fatura criada. O aluno vera no app.'
    );
    setInvoiceAmount('');
    setInvoiceDescription('');
    setInvoiceDueDay('');
    setInvoiceRecurring('1');
    setInvoiceCheckoutUrl('');
    setInvoiceLoading(false);
  };

  return (
    <PageShell
      title="Financeiro do personal"
      description="Envie faturas, acompanhe pagamentos e organize repasses."
      breadcrumbs={[{ label: 'Financeiro', href: '/financeiro' }]}
    >
      <UserScopePicker />
      <div className="finance-personal finance-personal-layout">
        <section className="portal-card portal-card--highlight finance-hero">
          <div className="finance-hero-main">
            <div className="finance-hero-copy">
              <p className="portal-pill">Financeiro</p>
              <h2>Envie faturas completas e acompanhe o caixa.</h2>
              <p className="subtle">
                Gere cobrancas para seus alunos e acompanhe tudo em um painel unico.
              </p>
              <div className="finance-hero-actions">
                <Link href="/financeiro/subscription" className="button secondary">
                  Assinatura
                </Link>
                <Link href="/financeiro/plans" className="button secondary">
                  Ver planos
                </Link>
                <Link href="/students" className="button">
                  Ver alunos
                </Link>
              </div>
            </div>
            <div className="finance-summary-grid finance-summary-grid--hero">
              <div className="finance-summary-card">
                <span>Total pendente</span>
                <strong>{formatCurrency(totalPendente)}</strong>
              </div>
              <div className="finance-summary-card">
                <span>Recebido</span>
                <strong>{formatCurrency(totalRecebido)}</strong>
              </div>
              <div className="finance-summary-card">
                <span>Taxa MH (10%)</span>
                <strong>{formatCurrency(taxaPlataforma)}</strong>
              </div>
              <div className="finance-summary-card">
                <span>Liquido estimado</span>
                <strong>{formatCurrency(liquidoEstimado)}</strong>
              </div>
            </div>
          </div>
        </section>

        <div className="finance-personal-grid">
          <div className="finance-personal-main">
            <div className="portal-card finance-card finance-invoice-card" id="nova-fatura">
              <div className="finance-card-header">
                <div>
                  <h3>Nova fatura</h3>
                  <p className="subtle">Crie cobrancas que aparecem no financeiro do aluno.</p>
                </div>
                {selectedStudent && (
                  <span className="finance-student-chip">
                    {selectedStudent.nome}
                  </span>
                )}
              </div>

              <div className="finance-invoice-form">
                <label className="finance-field">
                  <span>Descricao</span>
                  <input
                    className="finance-input"
                    placeholder="Ex: Mensalidade do plano premium"
                    value={invoiceDescription}
                    onChange={(event) => setInvoiceDescription(event.target.value)}
                  />
                </label>
                <label className="finance-field">
                  <span>Valor</span>
                  <input
                    className="finance-input"
                    placeholder="R$ 120,00"
                    value={invoiceAmount}
                    onChange={(event) => setInvoiceAmount(event.target.value)}
                  />
                </label>
                <label className="finance-field">
                  <span>Dia de vencimento</span>
                  <input
                    className="finance-input"
                    type="number"
                    min={1}
                    max={31}
                    placeholder="Ex: 10"
                    value={invoiceDueDay}
                    onChange={(event) => setInvoiceDueDay(event.target.value)}
                  />
                </label>
                <label className="finance-field">
                  <span>Recorrencia</span>
                  <select
                    className="finance-input"
                    value={invoiceRecurring}
                    onChange={(event) => setInvoiceRecurring(event.target.value)}
                  >
                    <option value="0">Unica</option>
                    <option value="1">Mensal</option>
                    <option value="3">Trimestral</option>
                    <option value="6">Semestral</option>
                    <option value="12">Anual</option>
                  </select>
                </label>
              </div>

              <div className="finance-inline">
                <label className="finance-toggle">
                  <input
                    type="checkbox"
                    checked={invoiceAutoStripe}
                    onChange={(event) => setInvoiceAutoStripe(event.target.checked)}
                    disabled={!stripeConnected}
                  />
                  <span>Gerar link automatico no Stripe</span>
                </label>
                {!invoiceAutoStripe && (
                  <input
                    className="finance-input"
                    placeholder="Link de pagamento (opcional)"
                    value={invoiceCheckoutUrl}
                    onChange={(event) => setInvoiceCheckoutUrl(event.target.value)}
                  />
                )}
              </div>
              {!stripeConnected && (
                <p className="finance-hint">Conecte o Stripe para gerar links automaticos.</p>
              )}

              <div className="finance-invoice-actions">
                <div className="finance-invoice-preview">
                  <span>Resumo da fatura</span>
                  <strong>{formatCurrency(amountPreview)}</strong>
                  <small>Essa cobranca aparece no app do aluno.</small>
                </div>
                <button
                  type="button"
                  className="button"
                  onClick={handleCreateInvoice}
                  disabled={invoiceLoading}
                >
                  {invoiceLoading ? 'Enviando...' : 'Enviar fatura'}
                </button>
              </div>
              {invoiceError && <p className="finance-feedback is-error">{invoiceError}</p>}
              {invoiceMessage && <p className="finance-feedback">{invoiceMessage}</p>}
            </div>

            <div className="portal-card finance-card finance-section">
              <div className="finance-card-header">
                <div>
                  <h3>Cobrancas do aluno</h3>
                  <p className="subtle">Acompanhe status, valores e links enviados.</p>
                </div>
                {selectedStudent && (
                  <Link href={`/students/${selectedStudent.id}`} className="students-action">
                    Ver perfil
                  </Link>
                )}
              </div>
              {isPersonal && !selectedStudentId && (
                <p className="subtle">Selecione um aluno para ver cobrancas.</p>
              )}
              {!isPersonal && !targetUserId && (
                <p className="subtle">Informe um UID para listar pagamentos.</p>
              )}
              {targetUserId && orderedPayments.length === 0 && (
                <p className="subtle">Nenhuma cobranca encontrada.</p>
              )}
              {targetUserId && orderedPayments.length > 0 && (
                <div className="finance-payments-grid">
                  {orderedPayments.map((payment) => (
                    <div key={payment.id} className="finance-payment-card">
                      <div className="finance-payment-header">
                        <div className="finance-payment-title">
                          <span className={`finance-payment-tag ${payment.pago ? 'is-paid' : 'is-pending'}`}>
                            {payment.pago ? 'Pago' : 'Pendente'}
                          </span>
                          <strong>{payment.descricao || 'Cobranca'}</strong>
                        </div>
                        <span className="finance-payment-value">
                          {formatCurrency(payment.valorDaCombranca || 0)}
                        </span>
                      </div>
                      <p className="finance-payment-meta">
                        Vencimento {payment.todoDiaDoMes ? `dia ${payment.todoDiaDoMes}` : '-'}
                      </p>
                      {payment.datas?.[0] && (
                        <p className="finance-payment-meta">Registrado em {formatDate(payment.datas[0])}</p>
                      )}
                      {payment.stripeStatus && (
                        <p className="finance-payment-meta">Stripe: {payment.stripeStatus}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="finance-personal-side">
            <div className="portal-card finance-card finance-student-card">
              <div className="finance-card-header">
                <div>
                  <h3>Selecionar aluno</h3>
                  <p className="subtle">Escolha quem recebe a fatura.</p>
                </div>
              </div>
              {dashboard.alunos.length ? (
                <select
                  className="finance-input"
                  value={selectedStudentId}
                  onChange={(event) => setSelectedStudentId(event.target.value)}
                >
                  {dashboard.alunos.map((aluno) => (
                    <option key={aluno.id} value={aluno.id}>
                      {aluno.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="finance-empty">
                  <p className="subtle">Nenhum aluno vinculado ao seu codigo.</p>
                  <Link href="/students" className="students-action">
                    Gerar convite
                  </Link>
                </div>
              )}
              {selectedStudent && (
                <div className="finance-student-mini">
                  <div className="students-card-avatar">
                    {selectedStudent.photoUrl ? (
                      <img src={selectedStudent.photoUrl} alt={selectedStudent.nome} />
                    ) : (
                      <span>{selectedStudent.nome.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <strong>{selectedStudent.nome}</strong>
                    <p className="subtle">{selectedStudent.email || 'Email nao informado'}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="portal-card finance-card finance-stripe-card">
              <div className="finance-card-header">
                <div>
                  <h3>Status Stripe</h3>
                  <p className="subtle">Configure para receber pagamentos.</p>
                </div>
                <span className={`finance-status-pill ${stripeConnected ? 'is-success' : 'is-warning'}`}>
                  {stripeConnected ? 'Conectado' : 'Pendente'}
                </span>
              </div>
              <p className="finance-status-text">{stripeLabel}</p>
              <div className="finance-actions">
                <Link href="/financeiro/plans" className="button secondary sm">
                  Ver planos
                </Link>
                <Link href="/support/ticket" className="button sm">
                  Abrir suporte
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

