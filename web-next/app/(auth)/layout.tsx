import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
    nosnippet: true,
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="container auth-grid">
        <aside className="auth-hero">
          <Link href="/" className="auth-brand">
            MH PERSONAL
          </Link>
          <span className="auth-eyebrow">Plataforma completa</span>
          <h1 className="auth-title">Treinos, avaliacoes e agenda no mesmo lugar.</h1>
          <p className="auth-lead">
            Tudo o que aluno, personal e academia precisam para evoluir: IA para treinos,
            avaliacao completa, chat direto e relatorios de progresso.
          </p>
          <div className="auth-pill-row">
            <span className="auth-pill">Web</span>
            <span className="auth-pill">Android</span>
            <span className="auth-pill">iOS</span>
          </div>
          <div className="auth-highlight-grid">
            <div className="auth-highlight-card">
              <strong>Aluno engajado</strong>
              <span>Plano claro, notificacoes e progresso visivel.</span>
            </div>
            <div className="auth-highlight-card">
              <strong>Personal eficiente</strong>
              <span>IA para montar treinos e avaliar rapido.</span>
            </div>
            <div className="auth-highlight-card">
              <strong>Academia no controle</strong>
              <span>Gestao, repasses e indicadores em tempo real.</span>
            </div>
          </div>
        </aside>

        <div className="auth-panel">
          {children}
          <p className="auth-note">Seus dados ficam protegidos e sincronizados em todos os dispositivos.</p>
        </div>
      </div>
    </div>
  );
}
