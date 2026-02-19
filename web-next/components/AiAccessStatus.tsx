'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { useAiAccessStatus } from '@/lib/hooks/useAiAccessStatus';

type AiAccessStatusProps = {
  compact?: boolean;
  showManageLink?: boolean;
  className?: string;
};

function PremiumStarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.6l2.7 5.6 6.2.9-4.5 4.4 1 6.2L12 16.8 6.6 19.7l1-6.2L3 9.1l6.2-.9L12 2.6z" />
    </svg>
  );
}

export default function AiAccessStatus({
  compact = false,
  showManageLink = true,
  className,
}: AiAccessStatusProps) {
  const access = useAiAccessStatus();
  const progress = access.premium
    ? 100
    : access.dailyLimit > 0
    ? Math.min(100, Math.round((access.usedToday / access.dailyLimit) * 100))
    : 0;

  return (
    <div className={clsx('ai-access-status', { 'is-compact': compact }, className)}>
      <div className="ai-access-head">
        <span className="ai-premium-chip">
          <PremiumStarIcon />
          Premium
        </span>
        {access.premium ? (
          <span className="ai-access-mode">Ilimitado</span>
        ) : (
          <span className={clsx('ai-access-mode', { 'is-warning': access.exhausted })}>
            {access.loading ? 'Atualizando...' : `${access.remaining} restantes`}
          </span>
        )}
      </div>

      <strong className="ai-access-title">
        {access.premium ? 'Todos os recursos de IA liberados' : 'Recursos de IA com credito diario'}
      </strong>
      <p className="ai-access-text">
        {access.premium
          ? 'Sua conta Premium tem uso ilimitado dos recursos com IA.'
          : `${access.usedToday}/${access.dailyLimit} creditos usados hoje.`}
      </p>

      {!access.premium && (
        <div className="ai-access-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}

      {!access.premium && showManageLink && (
        <Link href="/profile/subscription" className="ai-access-link">
          Desbloquear Premium
        </Link>
      )}
    </div>
  );
}

