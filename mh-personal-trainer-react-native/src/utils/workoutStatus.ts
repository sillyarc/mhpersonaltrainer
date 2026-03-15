import { UserWorkout } from '../types/workout';

type WorkoutStatusTone = 'success' | 'warning' | 'neutral';

export interface WorkoutStatusPresentation {
  status: UserWorkout['lastSessionStatus'] | 'pending';
  badgeLabel: string;
  badgeTone: WorkoutStatusTone;
  helperText?: string;
  isLockedToday: boolean;
}

export const isSameDay = (value?: Date | null, compareDate = new Date()) => {
  if (!value) return false;
  const date = new Date(value);
  return (
    date.getFullYear() === compareDate.getFullYear() &&
    date.getMonth() === compareDate.getMonth() &&
    date.getDate() === compareDate.getDate()
  );
};

export const getWorkoutStatusPresentation = (
  workout?: Partial<
    Pick<
      UserWorkout,
      'lastCompletedAt' | 'lastSessionAt' | 'lastSessionRemainingExercises' | 'lastSessionStatus'
    >
  >
): WorkoutStatusPresentation => {
  const sessionStatus = workout?.lastSessionStatus;
  const remainingExercises = Math.max(0, Number(workout?.lastSessionRemainingExercises || 0));
  const sessionDate = workout?.lastSessionAt || workout?.lastCompletedAt;

  if (sessionStatus === 'partial') {
    return {
      status: sessionStatus,
      badgeLabel: 'Concluida',
      badgeTone: 'success',
      helperText: remainingExercises > 0 ? `${remainingExercises} Exercicios Faltando!` : undefined,
      isLockedToday: false,
    };
  }

  if (sessionStatus === 'not_completed') {
    return {
      status: 'pending',
      badgeLabel: 'Pendente',
      badgeTone: 'neutral',
      isLockedToday: false,
    };
  }

  if (sessionStatus === 'completed' || workout?.lastCompletedAt) {
    const completedToday = isSameDay(sessionDate);
    return {
      status: 'completed',
      badgeLabel: 'Concluida',
      badgeTone: 'success',
      isLockedToday: completedToday,
    };
  }

  return {
    status: 'pending',
    badgeLabel: 'Pendente',
    badgeTone: 'neutral',
    isLockedToday: false,
  };
};
