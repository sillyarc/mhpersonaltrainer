'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import AiAccessStatus from '@/components/AiAccessStatus';
import { useAuth } from '@/lib/auth';
import {
  cancelSubscription,
  formatCurrency,
  getSubscriptionStatus,
  subscriptionPlans,
} from '@/lib/services/payments';

type FeedbackState = {
  type: 'error' | 'success';
  text: string;
} | null;

const paymentLinkEnvByPlanId: Record<string, string> = {
  mensal: 'NEXT_PUBLIC_STRIPE_PAYMENT_LINK_MENSAL',
  bimestral: 'NEXT_PUBLIC_STRIPE_PAYMENT_LINK_BIMESTRAL',
  semestral: 'NEXT_PUBLIC_STRIPE_PAYMENT_LINK_SEMESTRAL',
  anual: 'NEXT_PUBLIC_STRIPE_PAYMENT_LINK_ANUAL',
};

const activeSubscriptionStatuses = new Set(['active', 'trialing', 'past_due']);

const formatDateLabel = (value?: any) => {
  if (!value) return '-';
  if (typeof value?.toDate === 'function') return value.toDate().toLocaleDateString('pt-BR');
  if (value instanceof Date) return value.toLocaleDateString('pt-BR');
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

const formatStatusLabel = (value?: string) => {
  if (!value) return '-';
  const normalized = String(value).toLowerCase();
  const labels: Record<string, string> = {
    active: 'Ativa',
    trialing: 'Em teste',
    past_due: 'Pagamento pendente',
    canceled: 'Cancelada',
    unpaid: 'Nao paga',
    incomplete: 'Incompleta',
    incomplete_expired: 'Incompleta expirada',
  };
  if (labels[normalized]) return labels[normalized];
  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export default function ProfileSubscriptionPage() {
  const { user, refreshUser } = useAuth();
  const freeCreditsPerDay = Number(process.env.NEXT_PUBLIC_AI_DAILY_FREE_CREDITS || '20') || 20;
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<any | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState('');
  const [syncingSubscription, setSyncingSubscription] = useState(false);

  const highlightPlan = useMemo(
    () => subscriptionPlans.find((plan) => plan.highlight) || subscriptionPlans[0],
    []
  );

  const loadSubscriptionStatus = useCallback(
    async (silent: boolean = false) => {
      if (!user?.uid) {
        setSubscriptionStatus(null);
        setSubscriptionError('');
        setSubscriptionLoading(false);
        setSyncingSubscription(false);
        return;
      }
      if (silent) {
        setSyncingSubscription(true);
      } else {
        setSubscriptionLoading(true);
      }
      const result = await getSubscriptionStatus(user.uid);
      if (result.data && result.data.status !== 'not_found') {
        setSubscriptionStatus(result.data);
        setSubscriptionError('');
      } else {
        setSubscriptionStatus(null);
        setSubscriptionError(result.error || '');
      }
      setSubscriptionLoading(false);
      setSyncingSubscription(false);
    },
    [user?.uid]
  );

  useEffect(() => {
    loadSubscriptionStatus(false);
  }, [loadSubscriptionStatus]);

  useEffect(() => {
    const onFocus = () => {
      loadSubscriptionStatus(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadSubscriptionStatus(true);
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadSubscriptionStatus]);

  const subscriptionStatusValue =
    subscriptionStatus?.status || subscriptionStatus?.subscriptionStatus || '';
  const hasSubscriptionData = Boolean(subscriptionStatus?.subscriptionId);
  const isStripeActive = activeSubscriptionStatuses.has(
    String(subscriptionStatusValue || '').toLowerCase()
  );
  const isSubscribed = Boolean(user?.assinatura || hasSubscriptionData || isStripeActive);
  const currentPlanLabel =
    subscriptionStatus?.planName ||
    subscriptionStatus?.plan?.nickname ||
    subscriptionStatus?.plan ||
    subscriptionStatus?.price?.nickname ||
    user?.tipoDeAssinatura ||
    'Premium';
  const currentRenewDate =
    subscriptionStatus?.currentPeriodEnd ||
    subscriptionStatus?.current_period_end ||
    subscriptionStatus?.renovacao;
  const currentAmount =
    subscriptionStatus?.amount ||
    subscriptionStatus?.planAmount ||
    subscriptionStatus?.price?.unit_amount;
  const currentCurrency =
    subscriptionStatus?.currency || subscriptionStatus?.planCurrency || 'BRL';
  const resolvedSubscriptionId = user?.subscribeId || subscriptionStatus?.subscriptionId;

  const openPaymentLink = async (url?: string) => {
    if (!url) return false;
    const separator = url.includes('?') ? '&' : '?';
    const prefilledEmail = user?.email
      ? `${separator}prefilled_email=${encodeURIComponent(user.email)}`
      : '';
    const finalUrl = prefilledEmail ? `${url}${prefilledEmail}` : url;
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
    return true;
  };

  const handleSelectPlan = async (plan: (typeof subscriptionPlans)[number]) => {
    setFeedback(null);
    setLoadingPlanId(plan.id);
    try {
      const opened = await openPaymentLink(plan.paymentLink);
      if (!opened) {
        const missingEnv = paymentLinkEnvByPlanId[plan.id] || 'NEXT_PUBLIC_STRIPE_PAYMENT_LINK_*';
        setFeedback({
          type: 'error',
          text: `Checkout do plano ${plan.name} nao configurado. Defina ${missingEnv} no web-next/.env.local e reinicie o servidor.`,
        });
        return;
      }
      setFeedback({
        type: 'success',
        text: `Checkout de ${plan.name} aberto em nova aba. Apos concluir o pagamento, volte e clique em "Atualizar assinatura".`,
      });
    } catch (error: any) {
      setFeedback({
        type: 'error',
        text: error?.message || 'Nao foi possivel abrir o checkout do plano.',
      });
    } finally {
      setLoadingPlanId(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!resolvedSubscriptionId) {
      setFeedback({
        type: 'error',
        text: 'Nao foi possivel localizar o ID da assinatura para cancelar.',
      });
      return;
    }

    const confirmed = window.confirm('Tem certeza que deseja cancelar sua assinatura?');
    if (!confirmed) return;

    setFeedback(null);
    setCanceling(true);
    try {
      const result = await cancelSubscription(resolvedSubscriptionId);
      if (!result.success) {
        throw new Error(result.error || 'Erro ao cancelar assinatura.');
      }
      await refreshUser();
      await loadSubscriptionStatus(false);
      setFeedback({
        type: 'success',
        text: 'Assinatura cancelada com sucesso.',
      });
    } catch (error: any) {
      setFeedback({
        type: 'error',
        text: error?.message || 'Nao foi possivel cancelar a assinatura.',
      });
    } finally {
      setCanceling(false);
    }
  };

  return (
    <PageShell
      title="Assinatura"
      description="Gerencie sua assinatura Premium."
      breadcrumbs={[{ label: 'Perfil', href: '/profile' }]}
    >
      <section className="profile-subscription">
        <div className="profile-subscription-hero">
          <span className="profile-subscription-badge">Premium</span>
          <h2>Transforme seus resultados com o Premium</h2>
          <p>
            Desbloqueie mais alunos, automacoes e avaliacoes completas em um unico lugar.
          </p>
          <p className="subtle" style={{ marginTop: 8 }}>
            Plano gratuito: {freeCreditsPerDay} creditos de IA por dia e cada solicitacao no chat IA
            consome 1 credito. Premium: uso ilimitado com insights, relatorios e analise postural por IA.
          </p>
          <div className="profile-subscription-price-row">
            <div>
              <strong>
                {highlightPlan ? formatCurrency(highlightPlan.price) : '--'}
              </strong>
              <span>{highlightPlan?.interval || ''}</span>
            </div>
            {isSubscribed && <span className="profile-subscription-active">Ativo</span>}
          </div>
          <div className="profile-subscription-features">
            <span>IA para treinos</span>
            <span>Insights IA apenas no Premium</span>
            <span>Relatorios IA apenas no Premium</span>
            <span>Postura por IA apenas no Premium</span>
            <span>Avaliacoes completas</span>
            <span>Cobranca automatica</span>
          </div>
          {!isSubscribed && highlightPlan && (
            <button
              type="button"
              className="button"
              onClick={() => handleSelectPlan(highlightPlan)}
              disabled={Boolean(loadingPlanId)}
            >
              {loadingPlanId === highlightPlan.id ? 'Processando...' : 'Assinar Premium'}
            </button>
          )}
        </div>

        <div className="profile-subscription-trust">
          <span>Pagamento seguro</span>
          <span>Cancele quando quiser</span>
          <span>Suporte prioritario</span>
        </div>

        <AiAccessStatus />

        {feedback && (
          <p
            className={`subscription-alert ${feedback.type === 'error' ? 'is-error' : ''}`}
          >
            {feedback.text}
          </p>
        )}

        {(isSubscribed || subscriptionLoading || hasSubscriptionData) && (
          <div className="profile-subscription-current card">
            <h3>Detalhes da assinatura</h3>
            {subscriptionLoading && (
              <p className="subtle" style={{ marginTop: 6 }}>
                Carregando dados da assinatura...
              </p>
            )}
            {!subscriptionLoading && subscriptionError && (
              <p className="subscription-alert is-error" style={{ marginTop: 8 }}>
                {subscriptionError}
              </p>
            )}
            {!subscriptionLoading && !subscriptionError && hasSubscriptionData && (
              <>
                <p className="subtle" style={{ marginTop: 6 }}>
                  Plano: {currentPlanLabel}
                </p>
                <p className="subtle" style={{ marginTop: 4 }}>
                  Status: {formatStatusLabel(subscriptionStatusValue)}
                </p>
                <p className="subtle" style={{ marginTop: 4 }}>
                  Renovacao: {formatDateLabel(currentRenewDate)}
                </p>
                <p className="subtle" style={{ marginTop: 4 }}>
                  Valor: {formatAmount(currentAmount, currentCurrency)}
                </p>
              </>
            )}
            {!subscriptionLoading && !subscriptionError && !hasSubscriptionData && (
              <p className="subtle" style={{ marginTop: 6 }}>
                Nenhuma assinatura ativa encontrada.
              </p>
            )}
            <button
              type="button"
              className="button secondary"
              style={{ marginTop: 12 }}
              onClick={() => loadSubscriptionStatus(true)}
              disabled={syncingSubscription || subscriptionLoading}
            >
              {syncingSubscription ? 'Atualizando...' : 'Atualizar assinatura'}
            </button>
            <button
              type="button"
              className="button secondary"
              style={{ marginTop: 12 }}
              onClick={handleCancelSubscription}
              disabled={canceling || !resolvedSubscriptionId}
            >
              {canceling ? 'Cancelando...' : 'Cancelar Assinatura'}
            </button>
          </div>
        )}

        <div>
          <h3>{isSubscribed ? 'Mudar de Plano' : 'Escolha seu Plano'}</h3>
          <p className="subtle" style={{ marginTop: 6 }}>
            Escolha o plano ideal para seu momento.
          </p>
        </div>

        <div className="subscription-plan-grid">
          {subscriptionPlans.map((plan) => (
            <article
              key={plan.id}
              className={`subscription-plan-card ${plan.highlight ? 'is-featured' : ''}`}
            >
              {plan.highlight && <span className="subscription-tag">Mais popular</span>}
              <div className="subscription-plan-header">
                <strong>{plan.name}</strong>
                <span>
                  {formatCurrency(plan.price)} {plan.interval}
                </span>
              </div>
              <ul className="subscription-plan-features">
                {plan.features.map((feature) => (
                  <li key={`${plan.id}-${feature}`}>{feature}</li>
                ))}
              </ul>
              <button
                type="button"
                className={`button ${plan.highlight ? '' : 'secondary'}`}
                onClick={() => handleSelectPlan(plan)}
                disabled={Boolean(loadingPlanId)}
              >
                {loadingPlanId === plan.id
                  ? 'Processando...'
                  : isSubscribed
                  ? 'Mudar para este plano'
                  : 'Assinar'}
              </button>
            </article>
          ))}
        </div>

        <div className="profile-subscription-footnote">
          <span>Problemas para assinar/cancelar?</span>
          <Link href="/support/ticket">Abrir suporte</Link>
        </div>
      </section>
    </PageShell>
  );
}
