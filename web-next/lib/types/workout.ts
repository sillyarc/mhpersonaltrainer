export interface Exercise {
  id: string;
  nomeDoTreino: string;
  colecao: string;
  videoUrl?: string | null;
  videoUrl1080?: string | null;
  videoUrl720?: string | null;
  fotoDoTreino?: string | null;
  seriesRep?: WorkoutMetricValue | null;
  carga?: WorkoutMetricValue | null;
  intervalo?: WorkoutMetricValue | null;
  adicionados?: number;
}

export interface Workout {
  id: string;
  nomeDoTreino: string;
  uid: string;
  uidTreinos: string;
  colecao?: string;
  videoUrl?: string;
  exercicios?: WorkoutExercise[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type WorkoutMetricValue = number | string;

export interface UserWorkout {
  id: string;
  nomeDoTreino: string;
  obsInstrucao?: string;
  treino: string[];
  seriesRep?: WorkoutMetricValue[];
  repeticoes?: WorkoutMetricValue[];
  carga?: WorkoutMetricValue[];
  intervalo?: WorkoutMetricValue[];
  videoUrls?: string[];
  arquivos?: boolean;
  diasDaSemana?: string[];
  data?: Date;
  lastCompletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AerobicWorkout {
  id: string;
  treino?: string;
  treinos?: string[];
  items?: AerobicWorkoutItem[];
  aquecimento?: string;
  voltaacalma?: string;
  observacoes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AerobicWorkoutItem {
  nome: string;
  series?: number;
  repeticoes?: number;
  carga?: number;
}

export interface WorkoutExercise {
  exerciseId: string;
  nome: string;
  series: WorkoutMetricValue;
  repeticoes: WorkoutMetricValue;
  carga?: WorkoutMetricValue;
  intervalo?: WorkoutMetricValue;
  observacao?: string;
  videoUrl?: string;
}

export interface WorkoutRoutine {
  id: string;
  nome: string;
  descricao?: string;
  objetivo?: string;
  diasDaSemana: string[];
  treinos: Workout[];
  userId: string;
  personalId?: string;
  ativo: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface AIGeneratedWorkout {
  id: string;
  nomeDaRotina: string;
  objetivoDaRotina: string;
  treino: string[];
  daRotina: boolean;
  createdAt: Date;
  userId: string;
}

export interface SeriesRep {
  series: WorkoutMetricValue;
  repeticoes: string;
  carga?: WorkoutMetricValue;
  descanso?: WorkoutMetricValue;
}

export interface WorkoutProgress {
  id: string;
  workoutId: string;
  date: Date;
  completed: boolean;
  exercises: ExerciseProgress[];
  duration?: number;
  notes?: string;
}

export interface ExerciseProgress {
  exerciseId: string;
  sets: SetProgress[];
  completed: boolean;
}

export interface SetProgress {
  setNumber: number;
  reps: number;
  weight?: number;
  completed: boolean;
}

export type ExerciseCategory = 
  | 'peitoral'
  | 'costas'
  | 'ombro'
  | 'biceps'
  | 'triceps'
  | 'pernas'
  | 'abdomen'
  | 'aerobico'
  | 'funcional';
