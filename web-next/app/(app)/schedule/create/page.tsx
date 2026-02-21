'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { createAppointment } from '@/lib/services/scheduling';

export default function ScheduleCreatePage() {
  const router = useRouter();
  const { user, role } = useAuth();
  const [tipo, setTipo] = useState('treino');
  const [data, setData] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFim, setHoraFim] = useState('');
  const [descricao, setDescricao] = useState('');
  const [otherId, setOtherId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.uid) {
      setError('Usuario nao encontrado.');
      return;
    }
    if (!data || !horaInicio || !horaFim) {
      setError('Informe data, inicio e fim.');
      return;
    }
    if (!otherId) {
      setError('Informe o UID da outra pessoa.');
      return;
    }
    setLoading(true);
    setError('');
    const isPersonal = role === 'personal' || role === 'professor';
    const result = await createAppointment({
      alunoId: isPersonal ? otherId : user.uid,
      personalId: isPersonal ? user.uid : otherId,
      alunoNome: isPersonal ? undefined : user.displayName,
      personalNome: isPersonal ? user.displayName : undefined,
      data: new Date(data),
      horaInicio,
      horaFim,
      tipo: tipo as any,
      status: 'agendado',
      observacoes: descricao,
      createdAt: new Date(),
    } as any);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace('/schedule');
  };

  return (
    <PageShell
      title="Criar horario"
      description="Agende aulas e eventos."
      breadcrumbs={[{ label: 'Agenda', href: '/schedule' }]}
    >
      <div className="card">
        <form style={{ display: 'grid', gap: 12 }} onSubmit={handleSubmit}>
          <label>
            Tipo de agendamento
            <select
              value={tipo}
              onChange={(event) => setTipo(event.target.value)}
              style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            >
              <option value="treino">Treino</option>
              <option value="avaliacao">Avaliacao</option>
              <option value="consulta">Consulta</option>
              <option value="acompanhamento">Acompanhamento</option>
              <option value="online">Online</option>
              <option value="presencial">Presencial</option>
            </select>
          </label>
          <label>
            UID do {role === 'personal' || role === 'professor' ? 'aluno' : 'personal'}
            <input
              type="text"
              value={otherId}
              onChange={(event) => setOtherId(event.target.value)}
              style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
          <label>
            Data
            <input
              type="date"
              value={data}
              onChange={(event) => setData(event.target.value)}
              style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
          <label>
            Hora inicio
            <input
              type="time"
              value={horaInicio}
              onChange={(event) => setHoraInicio(event.target.value)}
              style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
          <label>
            Hora fim
            <input
              type="time"
              value={horaFim}
              onChange={(event) => setHoraFim(event.target.value)}
              style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
          <label>
            Observacoes
            <textarea
              rows={3}
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </label>
          {error && <p style={{ color: '#c0392b' }}>{error}</p>}
          <button className="button" type="submit" disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar horario'}
          </button>
        </form>
      </div>
    </PageShell>
  );
}
