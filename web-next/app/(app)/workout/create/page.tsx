'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { useUserScope } from '@/lib/firestoreHooks';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { createUserWorkout, createWorkout } from '@/lib/services/workouts';

const weekOptions = [
  { id: 'seg', label: 'Seg' },
  { id: 'ter', label: 'Ter' },
  { id: 'qua', label: 'Qua' },
  { id: 'qui', label: 'Qui' },
  { id: 'sex', label: 'Sex' },
  { id: 'sab', label: 'Sab' },
  { id: 'dom', label: 'Dom' },
];

export default function WorkoutCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, role } = useAuth();
  const { userId: scopedUserId } = useUserScope();
  const dashboard = useDashboardData();
  const isPersonal = role === 'personal' || role === 'professor';
  const isAdmin = role === 'admin';
  const [nome, setNome] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [duracao, setDuracao] = useState('');
  const [dias, setDias] = useState<string[]>([]);
  const [scope, setScope] = useState<'user' | 'public'>('user');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const paramStudentId = searchParams.get('studentId') || '';

  const toggleDay = (id: string) => {
    setDias((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  useEffect(() => {
    if (!isPersonal) return;
    if (!paramStudentId) return;
    const exists = dashboard.alunos.some((aluno) => aluno.id === paramStudentId);
    if (exists) {
      setSelectedStudentId(paramStudentId);
    }
  }, [dashboard.alunos, isPersonal, paramStudentId]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!targetUserId && scopedUserId) {
      setTargetUserId(scopedUserId);
    }
  }, [isAdmin, scopedUserId, targetUserId]);

  const selectedStudent = useMemo(
    () => dashboard.alunos.find((aluno) => aluno.id === selectedStudentId) || null,
    [dashboard.alunos, selectedStudentId]
  );

  const templateOptions = [
    {
      title: 'Hipertrofia 4x',
      description: 'Volume moderado + progressao.',
      nome: 'Hipertrofia 4x - Base',
      objetivo: 'Ganho de massa com foco em basicos',
      duracao: '55 min',
      dias: ['Seg', 'Ter', 'Qui', 'Sex'],
    },
    {
      title: 'Emagrecimento 3x',
      description: 'Circuito e cardio curto.',
      nome: 'Emagrecimento 3x - Circuito',
      objetivo: 'Queima calorica e resistencia',
      duracao: '40 min',
      dias: ['Seg', 'Qua', 'Sex'],
    },
    {
      title: 'Funcional 2x',
      description: 'Mobilidade e core.',
      nome: 'Funcional 2x - Mobilidade',
      objetivo: 'Mobilidade e estabilidade',
      duracao: '35 min',
      dias: ['Ter', 'Sab'],
    },
  ];

  const applyTemplate = (template: (typeof templateOptions)[number]) => {
    setNome(template.nome);
    setObjetivo(template.objetivo);
    setDuracao(template.duracao);
    setDias(template.dias);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.uid) {
      setError('Usuario nao autenticado.');
      return;
    }
    if (!nome) {
      setError('Informe o nome do treino.');
      return;
    }
    if (scope === 'user' && isPersonal && !selectedStudentId) {
      setError('Selecione um aluno para vincular o treino.');
      return;
    }
    if (scope === 'user' && isAdmin && !targetUserId.trim()) {
      setError('Informe o UID do usuario para vincular o treino.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      if (scope === 'public') {
        const result = await createWorkout({
          nomeDoTreino: nome,
          uid: user.uid,
          uidTreinos: user.uid,
          colecao: objetivo || 'geral',
          objetivo,
          duracao,
          diasDaSemana: dias,
        } as any);
        if (result.error || !result.data) {
          throw new Error(result.error || 'Erro ao criar treino.');
        }
        router.replace(`/workout/${result.data.id}`);
        return;
      }

      const targetId = isPersonal ? selectedStudentId : isAdmin ? targetUserId.trim() : user.uid;
      const result = await createUserWorkout(targetId, {
        nomeDoTreino: nome,
        obsInstrucao: objetivo,
        personalId: isPersonal ? user.uid : undefined,
        treino: [],
        diasDaSemana: dias,
        arquivos: false,
        intervalo: duracao ? [duracao] : [],
      });
      if (result.error || !result.data) {
        throw new Error(result.error || 'Erro ao criar treino.');
      }
      router.replace(`/workout/${result.data.id}`);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar treino.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      title="Criar treino"
      description="Monte treinos completos com blocos e exercicios."
      breadcrumbs={[{ label: 'Treinos', href: '/workouts' }]}
    >
      <div className="workout-create">
        <div className="workout-create-grid">
          <div className="card workout-create-form-card">
            <div className="workout-create-header">
              <div>
                <h3>Informacoes do treino</h3>
                <p className="subtle">Preencha o basico e deixe a estrutura pronta para ajustes.</p>
              </div>
              <span className="pill">Novo treino</span>
            </div>
            <form className="workout-create-form" onSubmit={handleSubmit}>
              {isPersonal && scope === 'user' && (
                <label className="workout-create-label">
                  Aluno
                  {dashboard.loading ? (
                    <p className="subtle workout-create-helper">Carregando alunos...</p>
                  ) : dashboard.alunos.length ? (
                    <select
                      className="workout-create-input"
                      value={selectedStudentId}
                      onChange={(event) => setSelectedStudentId(event.target.value)}
                    >
                      <option value="">Selecione um aluno</option>
                      {dashboard.alunos.map((aluno) => (
                        <option key={aluno.id} value={aluno.id}>
                          {aluno.nome}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="workout-create-empty">
                      <p className="subtle">Nenhum aluno conectado.</p>
                      <Link href="/students" className="students-action">
                        Gerar link de convite
                      </Link>
                    </div>
                  )}
                </label>
              )}
              {isAdmin && scope === 'user' && (
                <label className="workout-create-label">
                  UID do usuario
                  <input
                    type="text"
                    value={targetUserId}
                    onChange={(event) => setTargetUserId(event.target.value)}
                    placeholder="UID do usuario"
                    className="workout-create-input"
                  />
                  <span className="workout-create-helper">
                    Use a lista em <Link href="/admin/users">Usuarios</Link> para copiar o UID.
                  </span>
                </label>
              )}
              <label className="workout-create-label">
                Nome do treino
                <input
                  type="text"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  placeholder="Treino A - Superior"
                  className="workout-create-input"
                />
              </label>
              <label className="workout-create-label">
                Objetivo
                <input
                  type="text"
                  value={objetivo}
                  onChange={(event) => setObjetivo(event.target.value)}
                  placeholder="Hipertrofia, condicionamento..."
                  className="workout-create-input"
                />
              </label>
              <label className="workout-create-label">
                Duracao estimada
                <input
                  type="text"
                  value={duracao}
                  onChange={(event) => setDuracao(event.target.value)}
                  placeholder="50 min"
                  className="workout-create-input"
                />
              </label>
              <label className="workout-create-label">
                Dias sugeridos
                <div className="workout-create-days">
                  {weekOptions.map((day) => (
                    <button
                      key={day.id}
                      type="button"
                      className={`workout-create-day ${dias.includes(day.label) ? 'is-active' : ''}`}
                      onClick={() => toggleDay(day.label)}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </label>
              <label className="workout-create-label">
                Tipo de treino
                <select
                  value={scope}
                  onChange={(event) => setScope(event.target.value as 'user' | 'public')}
                  className="workout-create-input"
                >
                  <option value="user">Treino do aluno</option>
                  <option value="public">Treino geral</option>
                </select>
                <span className="workout-create-helper">
                  {scope === 'public'
                    ? 'Treinos gerais ficam disponiveis como base.'
                    : 'Treino exclusivo para o aluno selecionado.'}
                </span>
              </label>
              {error && <p className="workout-create-error">{error}</p>}
              <div className="workout-create-actions">
                <button className="button" type="submit" disabled={loading}>
                  {loading ? 'Salvando...' : 'Salvar treino'}
                </button>
                <Link className="button secondary" href="/ai/assistant">
                  Abrir assistente
                </Link>
              </div>
            </form>
          </div>

          <div className="workout-create-side">
            <div className="card workout-create-preview">
              <div className="workout-create-header">
                <div>
                  <h3>Resumo do treino</h3>
                  <p className="subtle">Preview do que o aluno vai receber.</p>
                </div>
                <span className="pill">Ao vivo</span>
              </div>
              <div className="workout-create-summary">
                <div>
                  <span>Aluno</span>
                  <strong>
                    {scope === 'public'
                      ? 'Treino geral'
                      : isPersonal
                      ? selectedStudent?.nome || 'Selecione um aluno'
                      : 'Voce'}
                  </strong>
                </div>
                <div>
                  <span>Nome</span>
                  <strong>{nome || 'Treino sem titulo'}</strong>
                </div>
                <div>
                  <span>Objetivo</span>
                  <strong>{objetivo || 'Defina o objetivo principal'}</strong>
                </div>
                <div>
                  <span>Duracao</span>
                  <strong>{duracao || 'Tempo livre'}</strong>
                </div>
              </div>
              <div className="workout-create-badges">
                {dias.length ? (
                  dias.map((dia) => (
                    <span key={dia} className="workout-create-badge">
                      {dia}
                    </span>
                  ))
                ) : (
                  <span className="subtle">Nenhum dia selecionado.</span>
                )}
              </div>
            </div>

            <div className="card workout-create-next">
              <h3>Proximos passos</h3>
              <p className="subtle">Depois de salvar, refine o treino com blocos e exercicios.</p>
              <ul className="workout-create-list">
                <li>Crie blocos por objetivo (forca, cardio, core).</li>
                <li>Adicione cargas, series e repeticoes.</li>
                <li>Marque dias sugeridos para guiar o aluno.</li>
              </ul>
              <div className="workout-create-tips">
                <strong>Dica rapida</strong>
                <p className="subtle">
                  Se o aluno for iniciante, comece com 2 a 3 exercicios por bloco.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card workout-create-templates">
          <div className="workout-create-templates-header">
            <div>
              <h3>Modelos rapidos</h3>
              <p className="subtle">Comece com uma base pronta e ajuste depois.</p>
            </div>
            <span className="pill">Sugestoes</span>
          </div>
          <div className="workout-create-template-grid">
            {templateOptions.map((template) => (
              <button
                key={template.title}
                type="button"
                className="workout-create-template"
                onClick={() => applyTemplate(template)}
              >
                <strong>{template.title}</strong>
                <span>{template.description}</span>
                <p>{template.dias.join(', ')}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
