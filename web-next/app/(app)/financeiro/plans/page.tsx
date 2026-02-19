'use client';

import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { subscriptionPlans, formatCurrency } from '@/lib/services/payments';

export default function FinancePlansPage() {
  return (
    <PageShell
      title="Planos de assinatura"
      description="Escolha o plano ideal para manter o assistente ativo."
      breadcrumbs={[{ label: 'Financeiro', href: '/financeiro' }]}
    >
      <div className="subscription-plans">
        <section className="portal-card portal-card--highlight subscription-hero">
          <div className="subscription-hero-copy">
            <p className="portal-pill">Assinatura</p>
            <h2>Planos com Stripe e cobranca automatica.</h2>
            <p className="subtle">
              Compare beneficios, escolha o ciclo ideal e ative o plano do assistente.
            </p>
            <div className="subscription-hero-actions">
              <Link href="/financeiro/subscription" className="button secondary">
                Ver status
              </Link>
              <Link href="/support/ticket" className="button">
                Preciso de ajuda
              </Link>
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
