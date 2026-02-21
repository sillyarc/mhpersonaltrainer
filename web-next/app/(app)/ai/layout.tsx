'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AiAccessStatus from '@/components/AiAccessStatus';
import { useAiAccessStatus } from '@/lib/hooks/useAiAccessStatus';

export default function AiLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const aiAccess = useAiAccessStatus();
  const allowFreeRoute = pathname === '/ai/assistant';
  const isLocked = !aiAccess.loading && !aiAccess.premium && !allowFreeRoute;

  return (
    <div className="ai-route-shell">
      <AiAccessStatus className="ai-route-access" />
      {isLocked ? (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Recurso Premium</h3>
          <p className="subtle" style={{ marginTop: 6 }}>
            Recursos avancados de IA (insights e analise postural por imagem) sao exclusivos do
            plano Premium.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <Link href="/profile/subscription" className="button">
              Ver assinatura
            </Link>
            <Link href="/ai/assistant" className="button secondary">
              Abrir chat IA
            </Link>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
