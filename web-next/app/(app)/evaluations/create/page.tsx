'use client';

import PageShell from '@/components/PageShell';
import UserScopePicker from '@/components/data/UserScopePicker';
import { useAuth } from '@/lib/auth';
import { useUserScope } from '@/lib/firestoreHooks';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useState, type FormEvent } from 'react';

const COLLECTIONS: Record<string, string> = {
  postural: 'avaliacaoPostural',
  fisica: 'avaliacoesFisicas',
  personalizada: 'avaliacaoPersonalizada',
};

export default function EvaluationCreatePage() {
  const { user, role } = useAuth();
  const { userId } = useUserScope();
  const isPersonal = role === 'personal' || role === 'professor';
  const [tipo, setTipo] = useState<'postural' | 'fisica' | 'personalizada'>('postural');
  const [aluno, setAluno] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'users', userId, COLLECTIONS[tipo]), {
        aluno,
        observacoes,
        status: 'pendente',
        ...(isPersonal && user?.uid ? { personalId: user.uid } : {}),
        createdAt: Timestamp.now(),
        tipo,
      });
      setAluno('');
      setObservacoes('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell
      title="Nova avaliacao"
      description="Crie uma avaliacao fisica, postural ou personalizada."
      breadcrumbs={[{ label: 'Avaliacoes', href: '/evaluations' }]}
    >
      <div className="card">
        <UserScopePicker />
        <form style={{ display: 'grid', gap: 12 }} onSubmit={handleSubmit}>
          <label>
            Tipo de avaliacao
            <select
              value={tipo}
              onChange={(event) => setTipo(event.target.value as 'postural' | 'fisica' | 'personalizada')}
              style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            >
              <option value="postural">Postural</option>
              <option value="fisica">Fisica</option>
              <option value="personalizada">Personalizada</option>
            </select>
          </label>
          <label>
            Aluno
            <input
              type="text"
              value={aluno}
              onChange={(event) => setAluno(event.target.value)}
              placeholder="Nome do aluno"
              style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
          <label>
            Observacoes iniciais
            <textarea
              rows={4}
              value={observacoes}
              onChange={(event) => setObservacoes(event.target.value)}
              placeholder="Observacoes"
              style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
          <button className="button" type="submit" disabled={saving || !userId}>
            {saving ? 'Salvando...' : 'Criar avaliacao'}
          </button>
        </form>
      </div>
    </PageShell>
  );
}
