'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import PageShell from '@/components/PageShell';
import AcademyGate from '@/components/AcademyGate';
import { useAuth } from '@/lib/auth';
import { useAcademyData } from '@/lib/hooks/useAcademyData';
import { createPaymentForUser } from '@/lib/services/financeiro';
import { getFirebaseDb } from '@/lib/services/firebase';
import {
  fetchStripeConnectStatus,
  formatCurrency,
  StripeConnectStatus,
  submitStripeConnectOnboarding,
} from '@/lib/services/payments';

const normalizeConnectError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'Nao foi possivel conectar ao servico de recebimentos.';
  }
  if (normalized.includes('permission') || normalized.includes('unauthorized')) {
    return 'Sem permissao para acessar o servico de recebimentos.';
  }
  if (normalized.includes('stripe') || normalized.includes('api url')) {
    return 'Servico de recebimentos nao configurado.';
  }
  return message;
};

const initialConnectForm = {
  email: '',
  firstName: '',
  lastName: '',
  cpf: '',
  dobDay: '',
  dobMonth: '',
  dobYear: '',
  addressLine1: '',
  addressCity: '',
  addressState: '',
  addressPostalCode: '',
  phone: '',
  productDescription: '',
  routingNumber: '',
  accountNumber: '',
  documentFront: '',
  documentBack: '',
};

export default function AcademyBillingPage() {
  const { user } = useAuth();
  const {
    academyCodeRaw,
    plans,
    academyStudents,
    invoices,
    loadingPlans,
    loadingInvoices,
    invoicesError,
    reloadPlans,
    reloadInvoices,
  } = useAcademyData();

  const [planName, setPlanName] = useState('');
  const [planValue, setPlanValue] = useState('');
  const [planCycle, setPlanCycle] = useState('Mensal');
  const [planDescription, setPlanDescription] = useState('');
  const [planMessage, setPlanMessage] = useState('');
  const [planLoading, setPlanLoading] = useState(false);

  const [invoiceStudent, setInvoiceStudent] = useState('');
  const [invoicePlan, setInvoicePlan] = useState('');
  const [invoiceValue, setInvoiceValue] = useState('');
  const [invoiceDescription, setInvoiceDescription] = useState('');
  const [invoiceDueDay, setInvoiceDueDay] = useState('');
  const [invoiceMessage, setInvoiceMessage] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'all' | 'paid' | 'open'>('all');

  const [connectStatus, setConnectStatus] = useState<StripeConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectMessage, setConnectMessage] = useState('');
  const [connectFormMessage, setConnectFormMessage] = useState('');
  const [connectSubmitting, setConnectSubmitting] = useState(false);
  const [connectForm, setConnectForm] = useState(initialConnectForm);
  const [connectRedirectUrl, setConnectRedirectUrl] = useState('');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const invoiceOptions = useMemo(() => {
    return plans.map((plan) => ({
      label: `${plan.nome} - ${formatCurrency(plan.valor)}`,
      value: plan.id,
      valor: plan.valor,
    }));
  }, [plans]);

  const totals = useMemo(() => {
    const paid = invoices.filter((item) => item.pago);
    const pending = invoices.filter((item) => !item.pago);
    const totalPaid = paid.reduce((sum, item) => sum + (item.valorDaCombranca || 0), 0);
    const totalPending = pending.reduce((sum, item) => sum + (item.valorDaCombranca || 0), 0);
    return { totalPaid, totalPending, total: invoices.length };
  }, [invoices]);

  const paidCount = useMemo(() => invoices.filter((item) => item.pago).length, [invoices]);
  const pendingCount = useMemo(() => invoices.filter((item) => !item.pago).length, [invoices]);
  const paidRate = useMemo(
    () => (totals.total ? Math.round((paidCount / totals.total) * 100) : 0),
    [totals.total, paidCount]
  );
  const avgTicket = useMemo(() => {
    if (!totals.total) return 0;
    return (totals.totalPaid + totals.totalPending) / totals.total;
  }, [totals]);
  const activePlans = useMemo(() => plans.filter((plan) => plan.ativo).length, [plans]);
  const pendingStudentsTotal = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((invoice) => {
      if (!invoice.pago && invoice.studentId) set.add(invoice.studentId);
    });
    return set.size;
  }, [invoices]);
  const { overdueCount, upcomingCount } = useMemo(() => {
    const today = new Date();
    const todayDay = today.getDate();
    const upcomingLimit = Math.min(todayDay + 7, 31);
    let overdue = 0;
    let upcoming = 0;
    invoices.forEach((invoice) => {
      if (invoice.pago) return;
      const dueDay = Number(invoice.todoDiaDoMes ?? invoice.diaDoPagamento);
      if (!dueDay || Number.isNaN(dueDay)) return;
      if (dueDay < todayDay) {
        overdue += 1;
      } else if (dueDay <= upcomingLimit) {
        upcoming += 1;
      }
    });
    return { overdueCount: overdue, upcomingCount: upcoming };
  }, [invoices]);

  const studentsById = useMemo(() => {
    const map = new Map<string, string>();
    academyStudents.forEach((student) => {
      map.set(student.id, student.name);
    });
    return map;
  }, [academyStudents]);

  const topPendingStudents = useMemo(() => {
    const map = new Map<string, { id: string; amount: number; count: number }>();
    invoices.forEach((invoice) => {
      if (invoice.pago || !invoice.studentId) return;
      const current = map.get(invoice.studentId) || {
        id: invoice.studentId,
        amount: 0,
        count: 0,
      };
      current.amount += invoice.valorDaCombranca || 0;
      current.count += 1;
      map.set(invoice.studentId, current);
    });
    return Array.from(map.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        name: studentsById.get(item.id) || 'Aluno',
      }));
  }, [invoices, studentsById]);

  const filteredInvoices = useMemo(() => {
    const term = invoiceQuery.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (invoiceStatusFilter === 'paid' && !invoice.pago) return false;
      if (invoiceStatusFilter === 'open' && invoice.pago) return false;
      if (!term) return true;
      const studentName = (invoice.studentId ? studentsById.get(invoice.studentId) : '') || '';
      const description = invoice.planName || invoice.descricao || '';
      return (
        studentName.toLowerCase().includes(term) ||
        description.toLowerCase().includes(term)
      );
    });
  }, [invoiceQuery, invoiceStatusFilter, invoices, studentsById]);

  const connectReady = useMemo(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_URL || '';
    const functionsUrl =
      process.env.NEXT_PUBLIC_STRIPE_FUNCTIONS_URL || process.env.EXPO_PUBLIC_STRIPE_FUNCTIONS_URL || '';
    return Boolean(functionsUrl) || (Boolean(apiUrl) && !apiUrl.includes('api.stripe.com'));
  }, []);

  const connectActive =
    Boolean(connectStatus?.chargesEnabled) && connectStatus?.detailsSubmitted !== false;
  const connectDeadline = useMemo(() => {
    if (!connectStatus?.requirements?.currentDeadline) return null;
    return new Date(connectStatus.requirements.currentDeadline * 1000);
  }, [connectStatus]);

  useEffect(() => {
    if (!user) return;
    setConnectForm((prev) => {
      let changed = false;
      const next = { ...prev };
      if (!prev.email && user.email) {
        next.email = user.email;
        changed = true;
      }
      if ((!prev.firstName || !prev.lastName) && user.displayName) {
        const parts = user.displayName.trim().split(/\s+/);
        if (!prev.firstName && parts[0]) {
          next.firstName = parts[0];
          changed = true;
        }
        if (!prev.lastName && parts.length > 1) {
          next.lastName = parts.slice(1).join(' ');
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [user]);

  useEffect(() => {
    let active = true;
    if (!user?.uid || !connectReady) {
      if (active) {
        setConnectStatus(null);
        setConnectMessage(connectReady ? '' : 'Servico de recebimentos nao configurado.');
      }
      return () => {
        active = false;
      };
    }
    setConnectLoading(true);
    fetchStripeConnectStatus(user.uid, user.stripeAccountId)
      .then((result) => {
        if (!active) return;
        if (result.data) setConnectStatus(result.data);
        if (result.error) {
          setConnectMessage(normalizeConnectError(result.error));
        } else {
          setConnectMessage('');
        }
      })
      .finally(() => {
        if (active) setConnectLoading(false);
      });
    return () => {
      active = false;
    };
  }, [connectReady, user?.stripeAccountId, user?.uid]);

  useEffect(() => {
    if (!isSheetOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSheetOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [isSheetOpen]);

  const handleScrollTo = (id: string) => {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCreatePlan = async () => {
    if (!user?.uid) return;
    if (!planName.trim() || !planValue.trim()) {
      setPlanMessage('Informe nome e valor do plano.');
      return;
    }

    const parsedValue = Number(planValue.replace(',', '.'));
    if (Number.isNaN(parsedValue) || parsedValue <= 0) {
      setPlanMessage('Valor do plano invalido.');
      return;
    }

    setPlanLoading(true);
    setPlanMessage('');
    try {
      const db = getFirebaseDb();
      await addDoc(collection(db, 'users', user.uid, 'academyPlans'), {
        nome: planName.trim(),
        valor: parsedValue,
        ciclo: planCycle,
        descricao: planDescription.trim(),
        ativo: true,
        createdAt: serverTimestamp(),
      });
      setPlanName('');
      setPlanValue('');
      setPlanDescription('');
      setPlanMessage('Plano criado com sucesso.');
      await reloadPlans();
    } catch (err: any) {
      setPlanMessage(err.message || 'Erro ao criar plano.');
    } finally {
      setPlanLoading(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!invoiceStudent) {
      setInvoiceMessage('Selecione um aluno.');
      return;
    }
    const amount = Number(invoiceValue.replace(',', '.'));
    if (Number.isNaN(amount) || amount <= 0) {
      setInvoiceMessage('Informe um valor valido.');
      return;
    }

    const dueDay = invoiceDueDay ? Number(invoiceDueDay) : undefined;
    if (dueDay && (Number.isNaN(dueDay) || dueDay < 1 || dueDay > 31)) {
      setInvoiceMessage('Dia de vencimento invalido.');
      return;
    }

    const selectedStudent = academyStudents.find((item) => item.id === invoiceStudent);
    const selectedPlan = plans.find((item) => item.id === invoicePlan);

    setInvoiceLoading(true);
    setInvoiceMessage('');
    try {
      const result = await createPaymentForUser(invoiceStudent, {
        valorDaCombranca: amount,
        descricao: invoiceDescription || selectedPlan?.nome || 'Cobranca',
        todoDiaDoMes: dueDay,
        pago: false,
        repetirPMes: 1,
        datas: [new Date()],
        academyCode: academyCodeRaw || undefined,
        personalCode: selectedStudent?.codigoPersonal,
        planName: selectedPlan?.nome,
        createdByAcademy: true,
        academyId: user?.uid,
      });
      if (result.error || !result.data) {
        throw new Error(result.error || 'Erro ao criar fatura.');
      }
      setInvoiceMessage('Fatura criada com sucesso.');
      setInvoiceStudent('');
      setInvoicePlan('');
      setInvoiceValue('');
      setInvoiceDescription('');
      setInvoiceDueDay('');
      await reloadInvoices();
    } catch (err: any) {
      setInvoiceMessage(err.message || 'Erro ao criar fatura.');
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleToggleInvoicePaid = async (invoiceId: string) => {
    const target = invoices.find((item) => item.id === invoiceId);
    if (!target?.paymentPath) {
      setInvoiceMessage('Nao foi possivel atualizar esta fatura.');
      return;
    }
    try {
      const db = getFirebaseDb();
      await updateDoc(doc(db, target.paymentPath), {
        Pago: !target.pago,
        stripeStatus: !target.pago ? 'paid' : 'pending',
        updatedAt: serverTimestamp(),
      });
      await reloadInvoices();
    } catch (err: any) {
      setInvoiceMessage(err?.message || 'Erro ao atualizar status da fatura.');
    }
  };

  const handleConnectFormChange =
    (field: keyof typeof connectForm) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setConnectForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleSubmitConnectForm = async () => {
    setConnectFormMessage('');
    if (!connectReady) {
      setConnectFormMessage('Servico de recebimentos nao configurado.');
      return;
    }
    if (!user?.uid) {
      setConnectFormMessage('Conta nao encontrada.');
      return;
    }
    setConnectRedirectUrl('');

    const requiredFields: Array<[keyof typeof connectForm, string]> = [
      ['email', 'email'],
      ['firstName', 'nome'],
      ['lastName', 'sobrenome'],
      ['cpf', 'cpf'],
      ['dobDay', 'dia de nascimento'],
      ['dobMonth', 'mes de nascimento'],
      ['dobYear', 'ano de nascimento'],
      ['addressLine1', 'endereco'],
      ['addressCity', 'cidade'],
      ['addressState', 'estado'],
      ['addressPostalCode', 'cep'],
      ['phone', 'telefone'],
      ['productDescription', 'descricao do servico'],
      ['routingNumber', 'agencia'],
      ['accountNumber', 'conta'],
    ];
    const missing = requiredFields.find(([key]) => !connectForm[key]?.trim());
    if (missing) {
      setConnectFormMessage(`Preencha ${missing[1]}.`);
      return;
    }

    const day = Number(connectForm.dobDay);
    const month = Number(connectForm.dobMonth);
    const year = Number(connectForm.dobYear);
    if (Number.isNaN(day) || day < 1 || day > 31) {
      setConnectFormMessage('Dia de nascimento invalido.');
      return;
    }
    if (Number.isNaN(month) || month < 1 || month > 12) {
      setConnectFormMessage('Mes de nascimento invalido.');
      return;
    }
    if (Number.isNaN(year) || year < 1900) {
      setConnectFormMessage('Ano de nascimento invalido.');
      return;
    }

    setConnectSubmitting(true);
    try {
      const result = await submitStripeConnectOnboarding({
        ...connectForm,
        userId: user.uid,
        accountId: user.stripeAccountId,
      });
      if (result.error || !result.data?.success) {
        throw new Error(result.error || 'Erro ao enviar questionario.');
      }
      if (result.data?.accountId && user?.uid) {
        const db = getFirebaseDb();
        await updateDoc(doc(db, 'users', user.uid), {
          stripeAccountId: result.data.accountId,
        });
      }
      if (result.data?.url) {
        setConnectRedirectUrl(result.data.url);
      }
      setConnectFormMessage('Questionario enviado. Aguarde a aprovacao.');
    } catch (err: any) {
      const message = String(err.message || 'Erro ao enviar questionario.');
      setConnectFormMessage(normalizeConnectError(message));
    } finally {
      setConnectSubmitting(false);
    }
  };

  const openSheet = () => {
    setConnectFormMessage('');
    setIsSheetOpen(true);
  };

  const closeSheet = () => setIsSheetOpen(false);

  return (
    <PageShell title="Faturas e planos" description="Recebimentos e cobrancas da academia.">
      <AcademyGate>
        <div className="academy-billing-v10">
          <header className="billing-v10-hero">
            <div className="billing-v10-hero-text">
              <span className="billing-v10-kicker">Faturamento</span>
              <h2>Faturas da academia</h2>
              <p>Crie cobrancas, acompanhe pagamentos e mantenha o caixa organizado.</p>
            </div>
            <div className="billing-v10-hero-actions">
              <button
                type="button"
                className="button"
                onClick={() => handleScrollTo('academy-create-invoice')}
              >
                Criar fatura
              </button>
              <button type="button" className="button secondary" onClick={openSheet}>
                Configurar recebimentos
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={() => handleScrollTo('academy-create-plan')}
              >
                Criar plano
              </button>
            </div>
          </header>

          <section className="billing-v10-kpis">
            <div className="billing-v10-kpi" data-tone="success">
              <span>Recebido</span>
              <strong>{loadingInvoices ? '...' : formatCurrency(totals.totalPaid)}</strong>
              <small>Faturas pagas</small>
            </div>
            <div className="billing-v10-kpi" data-tone="warning">
              <span>Pendente</span>
              <strong>{loadingInvoices ? '...' : formatCurrency(totals.totalPending)}</strong>
              <small>Em aberto</small>
            </div>
            <div className="billing-v10-kpi" data-tone="danger">
              <span>Atrasadas</span>
              <strong>{loadingInvoices ? '...' : overdueCount}</strong>
              <small>Vencidas</small>
            </div>
            <div className="billing-v10-kpi" data-tone="info">
              <span>Taxa de pagamento</span>
              <strong>{loadingInvoices ? '...' : `${paidRate}%`}</strong>
              <small>Nos ultimos registros</small>
            </div>
          </section>

          <section className="billing-v10-layout">
            <div className="billing-v10-card is-invoices">
              <div className="billing-v10-card-header">
                <div className="billing-v10-card-title">
                  <span className="billing-v10-card-kicker">Faturas</span>
                  <h3>Historico de cobrancas</h3>
                  <p>Filtre por status e aluno para operar rapido.</p>
                </div>
              </div>
              {invoicesError && <p className="billing-v10-alert">{invoicesError}</p>}
              <div className="billing-v10-summary">
                <div className="billing-v10-chip">
                  <span>Total</span>
                  <strong>{loadingInvoices ? '...' : totals.total}</strong>
                </div>
                <div className="billing-v10-chip">
                  <span>Pagos</span>
                  <strong>{loadingInvoices ? '...' : paidCount}</strong>
                </div>
                <div className="billing-v10-chip">
                  <span>Pendentes</span>
                  <strong>{loadingInvoices ? '...' : pendingCount}</strong>
                </div>
                <div className="billing-v10-chip">
                  <span>Ticket medio</span>
                  <strong>{loadingInvoices ? '...' : formatCurrency(avgTicket)}</strong>
                </div>
              </div>
              <div className="billing-v10-toolbar">
                <label className="billing-v10-field">
                  <span>Buscar fatura</span>
                  <input
                    value={invoiceQuery}
                    onChange={(event) => setInvoiceQuery(event.target.value)}
                    placeholder="Aluno ou descricao"
                  />
                </label>
                <label className="billing-v10-field">
                  <span>Status</span>
                  <select
                    value={invoiceStatusFilter}
                    onChange={(event) =>
                      setInvoiceStatusFilter(event.target.value as 'all' | 'paid' | 'open')
                    }
                  >
                    <option value="all">Todos</option>
                    <option value="open">Pendentes</option>
                    <option value="paid">Pagos</option>
                  </select>
                </label>
                <div className="billing-v10-field is-action">
                  <span>Acoes rapidas</span>
                  <div className="billing-v10-toolbar-actions">
                    <button
                      type="button"
                      className="button secondary sm"
                      onClick={reloadInvoices}
                      disabled={loadingInvoices}
                    >
                      Atualizar lista
                    </button>
                    <button
                      type="button"
                      className="button sm"
                      onClick={() => handleScrollTo('academy-create-invoice')}
                    >
                      Nova fatura
                    </button>
                  </div>
                </div>
              </div>
              <div className="billing-v10-table">
                <div className="billing-v10-table-head">
                  <span>Aluno/Descricao</span>
                  <span>Vencimento</span>
                  <span>Status</span>
                  <span>Valor</span>
                  <span></span>
                </div>
                {loadingInvoices ? (
                  <p className="billing-v10-muted">Carregando faturas...</p>
                ) : filteredInvoices.length ? (
                  filteredInvoices.map((invoice) => {
                    const dueDay = invoice.todoDiaDoMes ?? invoice.diaDoPagamento;
                    const dueLabel = dueDay ? `Dia ${dueDay}` : 'Sem vencimento';
                    return (
                      <div key={invoice.id} className="billing-v10-row">
                        <div className="billing-v10-cell is-main">
                          <strong>{invoice.planName || invoice.descricao || 'Cobranca'}</strong>
                          <span className="billing-v10-muted">
                            {(invoice.studentId ? studentsById.get(invoice.studentId) : '') || 'Aluno'}
                          </span>
                        </div>
                        <div className="billing-v10-cell">{dueLabel}</div>
                        <div className="billing-v10-cell">
                          <span className={`billing-v10-pill ${invoice.pago ? 'is-paid' : 'is-pending'}`}>
                            {invoice.pago ? 'Pago' : 'Pendente'}
                          </span>
                        </div>
                        <div className="billing-v10-cell">{formatCurrency(invoice.valorDaCombranca || 0)}</div>
                        <div className="billing-v10-cell is-action">
                          <button
                            type="button"
                            className="button secondary sm"
                            onClick={() => handleToggleInvoicePaid(invoice.id)}
                            disabled={!invoice.paymentPath}
                          >
                            {invoice.pago ? 'Marcar pendente' : 'Marcar pago'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="billing-v10-muted">Nenhuma fatura encontrada com esse filtro.</p>
                )}
              </div>
            </div>

            <aside className="billing-v10-aside">
              <div className="billing-v10-card is-create" id="academy-create-invoice">
                <div className="billing-v10-card-header">
                  <div className="billing-v10-card-title">
                    <span className="billing-v10-card-kicker">Nova cobranca</span>
                    <h3>Criar fatura</h3>
                    <p>Envie cobrancas diretas para os alunos.</p>
                  </div>
                </div>
                <div className="academy-form billing-v10-form">
                  <label>
                    <span>Aluno</span>
                    <select
                      value={invoiceStudent}
                      onChange={(event) => setInvoiceStudent(event.target.value)}
                    >
                      <option value="">Selecione um aluno</option>
                      {academyStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!academyStudents.length && (
                    <span className="academy-form-feedback">
                      Nenhum aluno registrado pela academia para faturar.
                    </span>
                  )}
                  <div className="academy-form-row">
                    <label>
                      <span>Plano (opcional)</span>
                      <select
                        value={invoicePlan}
                        onChange={(event) => {
                          const next = event.target.value;
                          setInvoicePlan(next);
                          const plan = plans.find((item) => item.id === next);
                          if (plan) setInvoiceValue(String(plan.valor));
                        }}
                      >
                        <option value="">Selecionar plano</option>
                        {invoiceOptions.map((plan) => (
                          <option key={plan.value} value={plan.value}>
                            {plan.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Valor</span>
                      <input
                        type="text"
                        value={invoiceValue}
                        placeholder="200"
                        onChange={(event) => setInvoiceValue(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="academy-form-row">
                    <label>
                      <span>Descricao</span>
                      <input
                        type="text"
                        value={invoiceDescription}
                        placeholder="Mensalidade de treino"
                        onChange={(event) => setInvoiceDescription(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Dia de vencimento</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={invoiceDueDay}
                        placeholder="5"
                        onChange={(event) => setInvoiceDueDay(event.target.value)}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="button"
                    onClick={handleCreateInvoice}
                    disabled={invoiceLoading || !academyStudents.length}
                  >
                    {invoiceLoading ? 'Criando...' : 'Criar fatura'}
                  </button>
                  {invoiceMessage && <span className="academy-form-feedback">{invoiceMessage}</span>}
                </div>
              </div>

              <div className="billing-v10-card is-connect">
                <div className="billing-v10-card-header">
                  <div className="billing-v10-card-title">
                    <span className="billing-v10-card-kicker">Recebimentos</span>
                    <h3>Conta e repasses</h3>
                    <p>Estado da integracao e dados principais.</p>
                  </div>
                  <span className={`billing-v10-status ${connectActive ? 'is-active' : 'is-pending'}`}>
                    {connectLoading ? 'Verificando' : connectActive ? 'Ativo' : 'Pendente'}
                  </span>
                </div>
                <div className="billing-v10-grid">
                  <div className="billing-v10-line">
                    <span>Conta vinculada</span>
                    <strong>{connectStatus?.accountId ? 'Configurada' : 'Nao informada'}</strong>
                  </div>
                  <div className="billing-v10-line">
                    <span>Prazo de ajuste</span>
                    <strong>
                      {connectDeadline
                        ? new Intl.DateTimeFormat('pt-BR').format(connectDeadline)
                        : 'Sem prazo'}
                    </strong>
                  </div>
                </div>
                <div className="billing-v10-actions">
                  <button type="button" className="button" onClick={openSheet}>
                    Abrir questionario
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!connectReady || connectLoading}
                    onClick={() => {
                      setConnectMessage('');
                      setConnectLoading(true);
                      if (!user?.uid) {
                        setConnectLoading(false);
                        return;
                      }
                      fetchStripeConnectStatus(user.uid, user.stripeAccountId)
                        .then((result) => {
                          if (result.data) setConnectStatus(result.data);
                          if (result.error) {
                            setConnectMessage(normalizeConnectError(result.error));
                          }
                        })
                        .finally(() => setConnectLoading(false));
                    }}
                  >
                    Verificar status
                  </button>
                </div>
                {connectMessage && <p className="billing-v10-note">{connectMessage}</p>}
              </div>

              <div className="billing-v10-card is-pending">
                <div className="billing-v10-card-header">
                  <div className="billing-v10-card-title">
                    <span className="billing-v10-card-kicker">Pendencias</span>
                    <h3>Alunos com cobranca em aberto</h3>
                    <p>Priorize quem precisa de contato imediato.</p>
                  </div>
                  <div className="billing-v10-badge">
                    {loadingInvoices ? '...' : `${pendingStudentsTotal} alunos`}
                  </div>
                </div>
                <div className="billing-v10-list">
                  {loadingInvoices ? (
                    <p className="billing-v10-muted">Carregando pendencias...</p>
                  ) : topPendingStudents.length ? (
                    topPendingStudents.map((item) => (
                      <div key={item.id} className="billing-v10-list-item">
                        <div>
                          <strong>{item.name}</strong>
                          <span className="billing-v10-muted">{item.count} cobranca(s) pendente(s)</span>
                        </div>
                        <div className="billing-v10-list-meta">
                          <span className="billing-v10-pill is-pending">{item.count}x</span>
                          <strong>{formatCurrency(item.amount)}</strong>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="billing-v10-empty">
                      <div>
                        <strong>Nenhuma pendencia registrada</strong>
                        <span className="billing-v10-muted">Quando houver, elas aparecem aqui com prioridade.</span>
                      </div>
                      <button
                        type="button"
                        className="button secondary sm"
                        onClick={() => handleScrollTo('academy-create-invoice')}
                      >
                        Criar cobranca
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </section>

          <section className="billing-v10-card is-plan" id="academy-create-plan">
            <div className="billing-v10-card-header">
              <div className="billing-v10-card-title">
                <span className="billing-v10-card-kicker">Planos</span>
                <h3>Planos e recorrencias</h3>
                <p>Crie planos e acompanhe a base ativa de cobrancas.</p>
              </div>
            </div>
            <div className="billing-v10-split">
              <div className="academy-form billing-v10-form">
                <div className="academy-form-row">
                  <label>
                    <span>Nome do plano</span>
                    <input
                      type="text"
                      value={planName}
                      placeholder="Plano mensal"
                      onChange={(event) => setPlanName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Valor</span>
                    <input
                      type="text"
                      value={planValue}
                      placeholder="150"
                      onChange={(event) => setPlanValue(event.target.value)}
                    />
                  </label>
                </div>
                <div className="academy-form-row">
                  <label>
                    <span>Ciclo</span>
                    <select value={planCycle} onChange={(event) => setPlanCycle(event.target.value)}>
                      <option value="Mensal">Mensal</option>
                      <option value="Bimestral">Bimestral</option>
                      <option value="Trimestral">Trimestral</option>
                      <option value="Semestral">Semestral</option>
                      <option value="Anual">Anual</option>
                    </select>
                  </label>
                  <label>
                    <span>Descricao</span>
                    <input
                      type="text"
                      value={planDescription}
                      placeholder="Treinos + suporte"
                      onChange={(event) => setPlanDescription(event.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="button"
                  onClick={handleCreatePlan}
                  disabled={planLoading}
                >
                  {planLoading ? 'Salvando...' : 'Criar plano'}
                </button>
                {planMessage && <span className="academy-form-feedback">{planMessage}</span>}
              </div>
              <div className="billing-v10-list">
                {loadingPlans ? (
                  <p className="billing-v10-muted">Carregando planos...</p>
                ) : plans.length ? (
                  plans.map((plan) => (
                    <div key={plan.id} className="billing-v10-list-item">
                      <div>
                        <strong>{plan.nome}</strong>
                        <span className="billing-v10-muted">{plan.descricao || 'Sem descricao'}</span>
                      </div>
                      <div className="billing-v10-list-meta">
                        <span className="billing-v10-pill is-active">{plan.ciclo}</span>
                        <strong>{formatCurrency(plan.valor)}</strong>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="billing-v10-muted">Nenhum plano criado ainda.</p>
                )}
              </div>
            </div>
          </section>
        </div>        {isSheetOpen && (
          <div className="billing-sheet">
            <button type="button" className="billing-sheet-overlay" onClick={closeSheet} aria-label="Fechar" />
            <div className="billing-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="billing-sheet-title">
              <div className="billing-sheet-header">
                <div>
                  <h3 id="billing-sheet-title">Questionario de recebimentos</h3>
                  <p className="subtle">Preencha os dados obrigatorios para liberar cobrancas e repasses.</p>
                </div>
                <button type="button" className="billing-sheet-close" onClick={closeSheet}>
                  Fechar
                </button>
              </div>
              <div className="billing-sheet-body academy-form">
                <div className="billing-sheet-section">
                  <h4>Dados pessoais</h4>
                  <div className="academy-form-row">
                    <label>
                      <span>Nome</span>
                      <input
                        type="text"
                        value={connectForm.firstName}
                        placeholder="Lucas"
                        onChange={handleConnectFormChange('firstName')}
                      />
                    </label>
                    <label>
                      <span>Sobrenome</span>
                      <input
                        type="text"
                        value={connectForm.lastName}
                        placeholder="Silva"
                        onChange={handleConnectFormChange('lastName')}
                      />
                    </label>
                  </div>
                  <div className="academy-form-row">
                    <label>
                      <span>Email</span>
                      <input
                        type="email"
                        value={connectForm.email}
                        placeholder="contato@email.com"
                        onChange={handleConnectFormChange('email')}
                      />
                    </label>
                    <label>
                      <span>Telefone</span>
                      <input
                        type="text"
                        value={connectForm.phone}
                        placeholder="11 99999-0000"
                        onChange={handleConnectFormChange('phone')}
                      />
                    </label>
                  </div>
                  <div className="academy-form-row">
                    <label>
                      <span>CPF</span>
                      <input
                        type="text"
                        value={connectForm.cpf}
                        placeholder="00000000000"
                        onChange={handleConnectFormChange('cpf')}
                      />
                    </label>
                    <label>
                      <span>Dia</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={connectForm.dobDay}
                        placeholder="10"
                        onChange={handleConnectFormChange('dobDay')}
                      />
                    </label>
                    <label>
                      <span>Mes</span>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={connectForm.dobMonth}
                        placeholder="08"
                        onChange={handleConnectFormChange('dobMonth')}
                      />
                    </label>
                    <label>
                      <span>Ano</span>
                      <input
                        type="number"
                        min="1900"
                        max="2100"
                        value={connectForm.dobYear}
                        placeholder="1992"
                        onChange={handleConnectFormChange('dobYear')}
                      />
                    </label>
                  </div>
                </div>

                <div className="billing-sheet-section">
                  <h4>Endereco</h4>
                  <div className="academy-form-row">
                    <label>
                      <span>Rua e numero</span>
                      <input
                        type="text"
                        value={connectForm.addressLine1}
                        placeholder="Rua Exemplo, 120"
                        onChange={handleConnectFormChange('addressLine1')}
                      />
                    </label>
                    <label>
                      <span>Cidade</span>
                      <input
                        type="text"
                        value={connectForm.addressCity}
                        placeholder="Sao Paulo"
                        onChange={handleConnectFormChange('addressCity')}
                      />
                    </label>
                  </div>
                  <div className="academy-form-row">
                    <label>
                      <span>Estado (UF)</span>
                      <input
                        type="text"
                        value={connectForm.addressState}
                        placeholder="SP"
                        onChange={handleConnectFormChange('addressState')}
                      />
                    </label>
                    <label>
                      <span>CEP</span>
                      <input
                        type="text"
                        value={connectForm.addressPostalCode}
                        placeholder="00000000"
                        onChange={handleConnectFormChange('addressPostalCode')}
                      />
                    </label>
                  </div>
                </div>

                <div className="billing-sheet-section">
                  <h4>Dados bancarios</h4>
                  <div className="academy-form-row">
                    <label>
                      <span>Agencia</span>
                      <input
                        type="text"
                        value={connectForm.routingNumber}
                        placeholder="0001"
                        onChange={handleConnectFormChange('routingNumber')}
                      />
                    </label>
                    <label>
                      <span>Conta</span>
                      <input
                        type="text"
                        value={connectForm.accountNumber}
                        placeholder="12345-6"
                        onChange={handleConnectFormChange('accountNumber')}
                      />
                    </label>
                  </div>
                  <label>
                    <span>Descricao do servico</span>
                    <input
                      type="text"
                      value={connectForm.productDescription}
                      placeholder="Planos de treino e acompanhamento"
                      onChange={handleConnectFormChange('productDescription')}
                    />
                  </label>
                </div>

                <div className="billing-sheet-section">
                  <h4>Documento (opcional)</h4>
                  <div className="academy-form-row">
                    <label>
                      <span>Frente (link)</span>
                      <input
                        type="text"
                        value={connectForm.documentFront}
                        placeholder="https://"
                        onChange={handleConnectFormChange('documentFront')}
                      />
                    </label>
                    <label>
                      <span>Verso (link)</span>
                      <input
                        type="text"
                        value={connectForm.documentBack}
                        placeholder="https://"
                        onChange={handleConnectFormChange('documentBack')}
                      />
                    </label>
                  </div>
                </div>

                <div className="billing-sheet-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={handleSubmitConnectForm}
                    disabled={connectSubmitting}
                  >
                    {connectSubmitting ? 'Enviando...' : 'Enviar questionario'}
                  </button>
                  {connectRedirectUrl && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => window.open(connectRedirectUrl, '_blank', 'noopener,noreferrer')}
                    >
                      Continuar cadastro
                    </button>
                  )}
                </div>
                {connectFormMessage && <span className="billing-note">{connectFormMessage}</span>}
              </div>
            </div>
          </div>
        )}
      </AcademyGate>
    </PageShell>
  );
}







