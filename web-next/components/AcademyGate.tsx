'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function AcademyGate({ children }: { children: ReactNode }) {
  const { role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="card" style={{ marginBottom: 24 }}>
        <h3>Carregando...</h3>
        <p className="subtle" style={{ marginTop: 6 }}>
          Validando acesso da academia.
        </p>
      </div>
    );
  }

  if (role !== 'academy') {
    return (
      <div className="card" style={{ marginBottom: 24 }}>
        <h3>Acesso restrito</h3>
        <p className="subtle" style={{ marginTop: 6 }}>
          Esta area e exclusiva para contas de academia.
        </p>
        <Link href="/academy-login" className="button secondary" style={{ marginTop: 12 }}>
          Entrar como academia
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="academy-beta-banner">
        <span className="academy-beta-pill">Beta</span>
        <div className="academy-beta-text">
          <strong>Portal da academia em beta</strong>
          <span>Recursos podem mudar enquanto finalizamos a experiencia.</span>
        </div>
      </div>
      {children}
    </>
  );
}
