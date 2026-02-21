import PageShell from '@/components/PageShell';
import Link from 'next/link';

export default function SettingsPage() {
  return (
    <PageShell
      title="Configuracoes"
      description="Preferencias gerais do app e do perfil."
    >
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Link href="/profile/edit" className="card">
          <h3>Conta</h3>
          <p className="subtle" style={{ marginTop: 8 }}>Email, senha e seguranca.</p>
        </Link>
        <Link href="/settings/notifications" className="card">
          <h3>Notificacoes</h3>
          <p className="subtle" style={{ marginTop: 8 }}>Personalize alertas e lembretes.</p>
        </Link>
        <Link href="/privacy" className="card">
          <h3>Privacidade</h3>
          <p className="subtle" style={{ marginTop: 8 }}>Permissoes e compartilhamento.</p>
        </Link>
      </div>
    </PageShell>
  );
}
