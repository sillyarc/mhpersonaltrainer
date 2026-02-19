'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { firestoreService, type Treino, type Aluno, type Avaliacao, type DashboardStats } from '@/lib/services/firestoreService';
import { fetchUserWorkouts } from '@/lib/services/workouts';
import type { UserWorkout } from '@/lib/types/workout';

interface DashboardData {
  treinos: Treino[];
  alunos: Aluno[];
  avaliacoes: Avaliacao[];
  stats: DashboardStats;
  loading: boolean;
  hasLoadedOnce: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDashboardData(): DashboardData {
  const { user, role } = useAuth();
  const [treinos, setTreinos] = useState<Treino[]>([]);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalTreinos: 0,
    treinosConcluidos: 0,
    sequenciaAtual: 0,
    taxaConclusao: 0,
  });
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const realtimeRef = useRef(false);

  const isPersonal = role === 'personal' || role === 'professor';
  const isAdmin = role === 'admin';
  const isAcademy = role === 'academy';

  const mapUserWorkoutToTreino = (workout: UserWorkout): Treino => {
    const intervalos = workout.intervalo || [];
    return {
      id: workout.id,
      nome: workout.nomeDoTreino || 'Treino',
      tipo: 'Musculacao',
      duracao: intervalos.length ? `${intervalos.length * 2} min` : undefined,
      exercicios: Array.isArray(workout.treino) ? workout.treino.length : 0,
      concluido: Boolean(workout.lastCompletedAt),
      dataCriacao: workout.createdAt,
      diasDaSemana: workout.diasDaSemana || [],
      lastCompletedAt: workout.lastCompletedAt,
    };
  };

  const fetchData = useCallback(async () => {
    if (!user?.uid || isAdmin || isAcademy) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (isPersonal) {
        const fetchedAlunos = await firestoreService.getAlunosDoPersonal(user.uid);
        if (!realtimeRef.current) {
          setAlunos(fetchedAlunos);
          const personalStats = await firestoreService.getDashboardStatsForPersonal(user.uid, fetchedAlunos);
          setStats(personalStats);
        }
      } else {
        const [workoutsResult, fetchedAvaliacoes] = await Promise.all([
          fetchUserWorkouts(user.uid, false),
          firestoreService.getAvaliacoesDoAluno(user.uid),
        ]);

        let fetchedTreinos = workoutsResult.data?.map(mapUserWorkoutToTreino) || [];
        if (!fetchedTreinos.length) {
          fetchedTreinos = await firestoreService.getTreinosDoAluno(user.uid);
        }

        setTreinos(fetchedTreinos);
        setAvaliacoes(fetchedAvaliacoes);

        const alunoStats = await firestoreService.getDashboardStatsForAluno(user.uid, fetchedTreinos);
        setStats(alunoStats);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
      if (user?.uid) {
        setHasLoadedOnce(true);
      }
    }
  }, [user?.uid, isPersonal, isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!user?.uid || isAdmin || isAcademy || !isPersonal) {
      realtimeRef.current = false;
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | null = null;

    const startListener = async () => {
      try {
        const stop = await firestoreService.listenToAlunosDoPersonal(
          user.uid,
          async (items) => {
            if (!active) return;
            realtimeRef.current = true;
            setAlunos(items);
            const personalStats = await firestoreService.getDashboardStatsForPersonal(user.uid, items);
            if (!active) return;
            setStats(personalStats);
          },
          () => {
            if (active) {
              setError('Erro ao atualizar alunos em tempo real.');
            }
          }
        );
        if (!active) {
          stop();
          return;
        }
        unsubscribe = stop;
      } catch (err) {
        if (active) {
          setError('Erro ao iniciar atualizacao em tempo real.');
        }
      }
    };

    startListener();

    return () => {
      active = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user?.uid, isAdmin, isAcademy, isPersonal]);

  return {
    treinos,
    alunos,
    avaliacoes,
    stats,
    loading,
    hasLoadedOnce,
    error,
    refresh: fetchData,
  };
}
