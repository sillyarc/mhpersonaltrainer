'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { firestoreService } from '@/lib/services/firestoreService';

export default function PersonalProfilePage() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!code) {
        setLoading(false);
        setError('Codigo nao informado.');
        return;
      }
      setLoading(true);
      const result = await firestoreService.getPersonalProfileByCode(code);
      if (!active) return;
      if (result) {
        setProfile(result);
      } else {
        setError('Personal nao encontrado.');
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [code]);

  return (
    <PageShell
      title="Perfil do personal"
      description="Detalhes e informacoes do personal."
      breadcrumbs={[{ label: 'Painel', href: '/app' }]}
    >
      {loading && <p className="subtle">Carregando perfil...</p>}
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {profile && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div className="card">
            <h3>{profile.displayName}</h3>
            <p className="subtle" style={{ marginTop: 8 }}>{profile.bio || 'Sem bio.'}</p>
            <p className="subtle" style={{ marginTop: 8 }}>Codigo: {profile.codigoPersonal || '-'}</p>
          </div>
          <div className="card">
            <h3>Contato</h3>
            <p className="subtle" style={{ marginTop: 8 }}>Instagram: {profile.instagram || '-'}</p>
            <p className="subtle" style={{ marginTop: 8 }}>LinkedIn: {profile.linkedin || '-'}</p>
          </div>
        </div>
      )}
    </PageShell>
  );
}
