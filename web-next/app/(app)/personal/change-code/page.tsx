'use client';

import { useEffect, useState, type FormEvent } from 'react';
import PageShell from '@/components/PageShell';
import { useUserScope, useDocumentData } from '@/lib/firestoreHooks';
import { firestoreService } from '@/lib/services/firestoreService';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';

export default function PersonalChangeCodePage() {
  const { userId } = useUserScope();
  const { data } = useDocumentData<any>(['users', userId]);
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (data?.codigoPersonal) {
      setCodigo(String(data.codigoPersonal));
    }
  }, [data?.codigoPersonal]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    const isPersonalAccount = data?.professorAccount === true || data?.professorAccount === 'true';
    const codigoNumero = Number(codigo);
    if (Number.isNaN(codigoNumero) || codigoNumero <= 0) {
      setError('Informe um codigo valido.');
      setMessage('');
      return;
    }
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const updates: Record<string, any> = {
        codigoPersonal: codigoNumero,
      };

      if (!isPersonalAccount) {
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
        if (capacity.personalName) {
          updates.nameDoSeuPersonal = capacity.personalName;
        }
      }

      await updateDoc(doc(db, 'users', userId), updates);
      setMessage('Codigo atualizado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      title="Alterar codigo"
      description="Atualize o codigo do personal."
      breadcrumbs={[{ label: 'Painel', href: '/app' }]}
    >
      <div className="card">
        <form style={{ display: 'grid', gap: 12 }} onSubmit={handleSubmit}>
          <label>
            Codigo do personal
            <input
              type="text"
              value={codigo}
              onChange={(event) => setCodigo(event.target.value)}
              placeholder="1234"
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
    </PageShell>
  );
}
