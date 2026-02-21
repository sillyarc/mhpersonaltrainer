'use client';

import { useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/PageShell';
import { fetchExerciseById } from '@/lib/services/workouts';
import { usePathname } from 'next/navigation';

export default function ExerciseDetailPage({ params }: { params: { id: string } }) {
  const pathname = usePathname();
  const exerciseId = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    return last && last !== 'exercise' ? last : params.id;
  }, [pathname, params.id]);
  const [exercise, setExercise] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const result = await fetchExerciseById(exerciseId);
      if (!active) return;
      if (result.data) {
        setExercise(result.data);
      } else {
        setError(result.error || 'Exercicio nao encontrado.');
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [exerciseId]);

  return (
    <PageShell
      title={exercise?.nomeDoTreino || `Exercicio ${exerciseId}`}
      description="Detalhes tecnicos, series e observacoes."
      breadcrumbs={[{ label: 'Treinos', href: '/workouts' }]}
    >
      {loading && <p className="subtle">Carregando exercicio...</p>}
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {exercise && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div className="card">
            <h3>Descricao</h3>
            <p className="subtle" style={{ marginTop: 8 }}>
              Colecao: {exercise.colecao || 'geral'}
            </p>
            {exercise.fotoDoTreino && (
              <img
                src={exercise.fotoDoTreino}
                alt={exercise.nomeDoTreino}
                style={{ marginTop: 16, borderRadius: 12, width: '100%' }}
              />
            )}
          </div>
          <div className="card">
            <h3>Series e descanso</h3>
            <div className="grid" style={{ marginTop: 16, gap: 12 }}>
              <div className="card">
                <strong>Series/rep</strong>
                <p className="subtle">{exercise.seriesRep ?? '-'}</p>
              </div>
              <div className="card">
                <strong>Descanso</strong>
                <p className="subtle">{exercise.intervalo ?? '-'}</p>
              </div>
            </div>
            {exercise.videoUrl && (
              <a href={exercise.videoUrl} target="_blank" rel="noreferrer" style={{ marginTop: 16, display: 'inline-flex' }}>
                Ver video
              </a>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
