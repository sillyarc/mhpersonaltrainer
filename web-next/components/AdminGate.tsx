'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function AdminGate({ children }: { children: ReactNode }) {
  const { role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="card" style={{ marginBottom: 24 }}>
        <h3>Carregando...</h3>
        <p className="subtle" style={{ marginTop: 6 }}>
          Validando acesso administrativo.
        </p>
      </div>
    );
  }

  if (role !== 'admin') {
    return (
      <div className="card" style={{ marginBottom: 24 }}>
        <h3>Acesso restrito</h3>
        <p className="subtle" style={{ marginTop: 6 }}>
          Esta area e exclusiva para administradores.
        </p>
        <Link href="/app" className="button secondary" style={{ marginTop: 12 }}>
          Voltar ao painel
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
