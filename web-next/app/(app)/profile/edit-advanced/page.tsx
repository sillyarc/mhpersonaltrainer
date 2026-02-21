'use client';

import { useEffect, useState, type FormEvent } from 'react';
import PageShell from '@/components/PageShell';
import { useDocumentData, useUserScope } from '@/lib/firestoreHooks';
import { firestoreService } from '@/lib/services/firestoreService';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';

export default function ProfileEditAdvancedPage() {
  const { userId } = useUserScope();
  const { data } = useDocumentData<any>(['users', userId]);

  const [codigoPersonal, setCodigoPersonal] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!data) return;
    setCodigoPersonal(data.codigoPersonal ? String(data.codigoPersonal) : '');
    setCidade(data.cidade || data.city || '');
    setEstado(data.estado || data.uf || data.state || '');
    setObjetivo(data.objetivoNoApp || '');
  }, [data]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    const isPersonalAccount = data?.professorAccount === true || data?.professorAccount === 'true';
    const codigoNumero = codigoPersonal ? Number(codigoPersonal) : null;
    if (codigoPersonal && (codigoNumero === null || Number.isNaN(codigoNumero) || codigoNumero <= 0)) {
      setError('Informe um codigo do personal valido.');
      setMessage('');
      return;
    }
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const updates: Record<string, any> = {
        cidade,
        estado,
        objetivoNoApp: objetivo,
      };

      if (!isPersonalAccount && codigoNumero) {
        const capacity = await firestoreService.getPersonalStudentCapacityByCode(codigoNumero, {
          excludeUserId: userId,
        });
        if (!capacity.allowed) {
          setError(
            capacity.reason === 'personal_not_found'
              ? 'Codigo do personal nao encontrado.'
              : 'Esse personal ja atingiu o limite de 4 alunos no plano gratuito. Peca para ele assinar o Premium para liberar alunos ilimitados.'
          );
          return;
        }
        updates.codigoPersonal = codigoNumero;
        if (capacity.personalName) {
          updates.nameDoSeuPersonal = capacity.personalName;
        }
      } else if (!isPersonalAccount) {
        updates.codigoPersonal = codigoNumero;
        updates.nameDoSeuPersonal = '';
      }

      await updateDoc(doc(db, 'users', userId), updates);
      setMessage('Dados atualizados.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      title="Editar perfil avancado"
      description="Dados extras, preferencias e codigo do personal."
      breadcrumbs={[{ label: 'Perfil', href: '/profile' }]}
    >
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div className="card">
          <h3>Informacoes extras</h3>
          <form style={{ marginTop: 12, display: 'grid', gap: 10 }} onSubmit={handleSubmit}>
            <label>
              Codigo do personal
              <input
                type="text"
                value={codigoPersonal}
                onChange={(event) => setCodigoPersonal(event.target.value)}
                placeholder="12345"
                style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
              />
            </label>
            <label>
              Cidade
              <input
                type="text"
                value={cidade}
                onChange={(event) => setCidade(event.target.value)}
                placeholder="Sao Paulo"
                style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
              />
            </label>
            <label>
              Estado
              <input
                type="text"
                value={estado}
                onChange={(event) => setEstado(event.target.value)}
                placeholder="SP"
                style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
              />
            </label>
            <label>
              Objetivo no app
              <input
                type="text"
                value={objetivo}
                onChange={(event) => setObjetivo(event.target.value)}
                placeholder="Emagrecimento, hipertrofia..."
                style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
              />
            </label>
            {message && <p style={{ color: '#1b7f3b' }}>{message}</p>}
            {error && <p style={{ color: '#c0392b' }}>{error}</p>}
            <button className="button" type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </form>
        </div>
        <div className="card">
          <h3>Preferencias</h3>
          <p className="subtle" style={{ marginTop: 8 }}>
            Ajuste seu idioma e estilo de notificacao.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
