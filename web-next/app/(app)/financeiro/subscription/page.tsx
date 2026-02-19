'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { getSubscriptionStatus, subscriptionPlans, formatCurrency } from '@/lib/services/payments';

const formatDateLabel = (value?: any) => {
  if (!value) return '-';
  if (typeof value?.toDate === 'function') {
    return value.toDate().toLocaleDateString('pt-BR');
  }
  if (value instanceof Date) {
    return value.toLocaleDateString('pt-BR');
  }
  if (typeof value === 'number') {
    const millis = value < 1000000000000 ? value * 1000 : value;
    return new Date(millis).toLocaleDateString('pt-BR');
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('pt-BR');
};

const formatAmount = (value?: any, currency: string = 'BRL') => {
  if (value === undefined || value === null) return '-';
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return '-';
  const amount = parsed > 1000 ? parsed / 100 : parsed;
  const normalized = currency ? String(currency).toUpperCase() : 'BRL';
  return formatCurrency(amount, normalized);
};

export default function SubscriptionPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const result = await getSubscriptionStatus(user.uid);
      if (!active) return;
      if (result.data) {
        setStatus(result.data);
      } else if (result.error) {
        setError(result.error);
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const planLabel =
    status?.planName ||
    status?.plan?.nickname ||
    status?.plan ||
    status?.price?.nickname ||
    status?.priceId ||
    'Plano ativo';
  const statusLabel = status?.status || status?.subscriptionStatus || 'Ativa';
  const renewDate = status?.currentPeriodEnd || status?.current_period_end || status?.renovacao;
  const createdAt = status?.created || status?.createdAt || status?.startDate;
  const amountValue = status?.amount || status?.planAmount || status?.price?.unit_amount;
  const currency = status?.currency || status?.planCurrency || 'BRL';
  const invoicesCount = status?.invoicesCount || status?.invoices?.length || 0;

  const statusItems = useMemo(
    () => [
      { label: 'Status', value: statusLabel },
      { label: 'Plano', value: planLabel },
      { label: 'Inicio', value: formatDateLabel(createdAt) },
      { label: 'Renovacao', value: formatDateLabel(renewDate) },
      { label: 'Valor', value: formatAmount(amountValue, currency) },
      { label: 'Faturas', value: invoicesCount ? String(invoicesCount) : '-' },
    ],
    [amountValue, createdAt, currency, invoicesCount, planLabel, renewDate, statusLabel]
  );

  return (
    <PageShell
      title="Assinatura do assistente"
      description="Assinatura via Stripe e renovacoes automaticas."
      breadcrumbs={[{ label: 'Financeiro', href: '/financeiro' }]}
    >
      <div className="subscription-layout">
        <section className="portal-card portal-card--highlight subscription-hero">
          <div className="subscription-hero-copy">
            <p className="portal-pill">Stripe</p>
            <h2>Controle sua assinatura do assistente em um painel claro.</h2>
            <p className="subtle">
              Veja status, renovacoes e escolha o plano ideal para manter os recursos de IA ativos.
            </p>
            <div className="subscription-hero-actions">
              <Link href="/financeiro/plans" className="button">
                Ver planos
              </Link>
              <Link href="/support/ticket" className="button secondary">
                Suporte
              </Link>
            </div>
          </div>
          <div className="subscription-status-card">
            <div>
              <h3>Resumo rapido</h3>
              <p className="subtle">Informacoes principais do Stripe.</p>
            </div>
            {loading && <p className="subtle">Carregando assinatura...</p>}
            {error && <p className="subscription-alert is-error">{error}</p>}
            {!loading && !error && (
              <div className="subscription-metrics">
                {statusItems.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            )}
            <div className="subscription-note">
              O pagamento e as faturas sao processados pelo Stripe.
            </div>
          </div>
        </section>

        <div className="subscription-plan-grid">
          {subscriptionPlans.map((plan) => (
            <div
              key={plan.id}
              className={`subscription-plan-card ${plan.highlight ? 'is-featured' : ''}`}
            >
              {plan.highlight && <span className="subscription-tag">Mais escolhido</span>}
              <div className="subscription-plan-header">
                <strong>{plan.name}</strong>
                <span>{formatCurrency(plan.price)} {plan.interval}</span>
              </div>
              <ul className="subscription-plan-features">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {plan.paymentLink && (
                <a
                  href={plan.paymentLink}
                  target="_blank"
                  rel="noreferrer"
                  className="button secondary"
                >
                  Assinar com Stripe
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

