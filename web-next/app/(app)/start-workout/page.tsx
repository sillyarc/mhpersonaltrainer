'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useUserScope } from '@/lib/firestoreHooks';
import { useAuth } from '@/lib/auth';
import { fetchAvailableExercises, fetchUserWorkoutById, fetchUserWorkouts, updateUserWorkout } from '@/lib/services/workouts';
import type { UserWorkout } from '@/lib/types/workout';

const IconClose = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M18 6l-12 12" />
    <path d="M6 6l12 12" />
  </svg>
);

const IconPause = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon is-fill">
    <path d="M7 6h4v12H7z" />
    <path d="M13 6h4v12h-4z" />
  </svg>
);

const IconPlay = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon is-fill">
    <path d="M8 5l11 7-11 7V5z" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M5 12l4 4 10-10" />
  </svg>
);

const IconVolumeOn = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M3 9v6h4l5 4V5L7 9H3z" />
    <path d="M16 8a4 4 0 0 1 0 8" />
    <path d="M19 5a7 7 0 0 1 0 14" />
  </svg>
);

const IconVolumeOff = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M3 9v6h4l5 4V5L7 9H3z" />
    <path d="M16 9l5 5" />
    <path d="M21 9l-5 5" />
  </svg>
);

const formatDuration = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const normalizeName = (value: string) => value.trim().toLowerCase();

const parseMetricValue = (value: number | string | undefined, fallback: number) => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  if (!text) return fallback;
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return fallback;
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function StartWorkoutPage() {
  const { userId } = useUserScope();
  const { role } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workoutParam = searchParams.get('workoutId') || searchParams.get('id');
  const studentId = searchParams.get('studentId') || '';
  const targetUserId = studentId || userId;
  const isStudent = role === 'aluno';

  const [workout, setWorkout] = useState<UserWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [completedExercises, setCompletedExercises] = useState<Set<number>>(new Set());
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [readyToFinish, setReadyToFinish] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrent, setVideoCurrent] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let active = true;
    const resolveVideoUrls = async (workoutData: UserWorkout) => {
      const stored = workoutData.videoUrls || [];
      const needsFallback = (workoutData.treino || []).some(
        (treino, index) => treino && !stored[index]
      );
      if (!needsFallback) return stored;
      const exercisesResult = await fetchAvailableExercises();
      const videoByName = new Map<string, string>();
      (exercisesResult.data || []).forEach((exercise) => {
        const url = exercise.videoUrl1080 || exercise.videoUrl720 || exercise.videoUrl;
        if (url) {
          videoByName.set(normalizeName(exercise.nomeDoTreino), url);
        }
      });
      return (workoutData.treino || []).map(
        (name, index) => stored[index] || videoByName.get(normalizeName(name || '')) || ''
      );
    };
    const load = async () => {
      if (!targetUserId) {
        setWorkout(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      if (workoutParam) {
        const result = await fetchUserWorkoutById(targetUserId, workoutParam);
        if (!active) return;
        if (result.data) {
          const videoUrls = await resolveVideoUrls(result.data);
          if (!active) return;
          setWorkout({ ...result.data, videoUrls });
        } else {
          setWorkout(null);
        }
        setLoading(false);
        return;
      }
      const result = await fetchUserWorkouts(targetUserId, false);
      if (!active) return;
      if (result.data?.[0]) {
        const videoUrls = await resolveVideoUrls(result.data[0]);
        if (!active) return;
        setWorkout({ ...result.data[0], videoUrls });
      } else {
        setWorkout(null);
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [targetUserId, workoutParam]);

  useEffect(() => {
    if (!workout) return;
    setElapsedSeconds(0);
    setPaused(false);
    setCompletedExercises(new Set());
    setCurrentExerciseIndex(0);
    setCurrentSetIndex(0);
    setReadyToFinish(false);
  }, [workout?.id]);

  useEffect(() => {
    if (!workout || paused) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [paused, workout]);

  const handleVideoToggle = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      try {
        await video.play();
      } catch {
        // Ignore play failures from autoplay restrictions.
      }
    } else {
      video.pause();
    }
  };

  const handleVideoMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setVideoMuted(video.muted);
  };

  const handleVideoSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Number(event.target.value);
    if (!Number.isFinite(next)) return;
    video.currentTime = next;
    setVideoCurrent(next);
  };

  const exerciseItems = useMemo(() => {
    if (!workout?.treino?.length) return [];
    return workout.treino.map((name, index) => ({
      id: `${workout.id}-${index}`,
      name: String(name || '').trim(),
      series: workout.seriesRep?.[index],
      reps: workout.repeticoes?.[index],
      carga: workout.carga?.[index],
      intervalo: workout.intervalo?.[index],
      videoUrl: workout.videoUrls?.[index],
    }));
  }, [workout]);

  const totalExercises = exerciseItems.length;
  const currentExercise = exerciseItems[currentExerciseIndex];
  const currentSeriesCount = parseMetricValue(currentExercise?.series, 1);
  const currentProgress =
    currentExercise && !completedExercises.has(currentExerciseIndex)
      ? currentSetIndex / Math.max(currentSeriesCount, 1)
      : 0;
  const progress = totalExercises
    ? Math.min(100, Math.round(((completedExercises.size + currentProgress) / totalExercises) * 100))
    : 0;
  const videoProgress = videoDuration ? Math.min(100, (videoCurrent / videoDuration) * 100) : 0;
  const videoTimeLabel = videoDuration
    ? `${formatDuration(Math.floor(videoCurrent))} / ${formatDuration(Math.floor(videoDuration))}`
    : '00:00 / 00:00';

  useEffect(() => {
    setVideoDuration(0);
    setVideoCurrent(0);
    setVideoPlaying(false);
    setVideoReady(false);
    setVideoMuted(true);
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
      video.muted = true;
    }
  }, [currentExercise?.videoUrl]);

  const handleCompleteSet = () => {
    if (!currentExercise) return;
    const nextSet = currentSetIndex + 1;
    if (nextSet >= currentSeriesCount) {
      setCompletedExercises((prev) => {
        const next = new Set(prev);
        next.add(currentExerciseIndex);
        return next;
      });
      if (currentExerciseIndex < totalExercises - 1) {
        setCurrentExerciseIndex((prev) => prev + 1);
        setCurrentSetIndex(0);
      } else {
        setCurrentSetIndex(currentSeriesCount);
        setReadyToFinish(true);
      }
    } else {
      setCurrentSetIndex(nextSet);
    }
  };

  const handleSkipExercise = () => {
    if (currentExerciseIndex < totalExercises - 1) {
      setCurrentExerciseIndex((prev) => prev + 1);
      setCurrentSetIndex(0);
    } else {
      setReadyToFinish(true);
    }
  };

  const handleComplete = async () => {
    if (!workout || !targetUserId) return;
    setSaving(true);
    await updateUserWorkout(targetUserId, workout.id, { lastCompletedAt: new Date() });
    setSaving(false);
    router.back();
  };

  if (isStudent) {
    const seriesLabel = currentExercise ? String(currentExercise.series || '').trim() : '';
    const repsLabel = currentExercise ? String(currentExercise.reps || '').trim() : '';
    const cargaLabel = currentExercise ? String(currentExercise.carga || '').trim() : '';
    const intervaloLabel = currentExercise ? String(currentExercise.intervalo || '').trim() : '';
    const details = [
      seriesLabel && repsLabel ? `${seriesLabel} series x ${repsLabel} reps` : seriesLabel || repsLabel,
      cargaLabel ? `${cargaLabel} kg` : '',
      intervaloLabel ? `${intervaloLabel}s` : '',
    ]
      .filter(Boolean)
      .join(' - ');

    return (
      <section className="student-start">
        <header className="student-start-header">
          <button type="button" className="student-start-action" onClick={() => router.back()}>
            <IconClose />
          </button>
          <div className="student-start-title">
            <strong>{workout?.nomeDoTreino || 'Treino'}</strong>
            <span>{formatDuration(elapsedSeconds)}</span>
          </div>
          <button type="button" className="student-start-action" onClick={() => setPaused((prev) => !prev)}>
            {paused ? <IconPlay /> : <IconPause />}
          </button>
        </header>

        <div className="student-start-progress">
          <span style={{ width: `${progress}%` }} />
        </div>

        {currentExercise?.videoUrl && (
          <div className="student-start-video">
            <video
              ref={videoRef}
              src={currentExercise.videoUrl}
              playsInline
              muted={videoMuted}
              autoPlay
              loop
              preload="metadata"
              controlsList="nodownload noplaybackrate noremoteplayback"
              disablePictureInPicture
              onContextMenu={(event) => event.preventDefault()}
              onLoadedMetadata={(event) => {
                const duration = event.currentTarget.duration || 0;
                setVideoDuration(duration);
                setVideoCurrent(event.currentTarget.currentTime || 0);
                setVideoReady(true);
                setVideoMuted(event.currentTarget.muted);
                if (event.currentTarget.muted) {
                  const playPromise = event.currentTarget.play();
                  if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => undefined);
                  }
                }
              }}
              onTimeUpdate={(event) => {
                setVideoCurrent(event.currentTarget.currentTime || 0);
              }}
              onPlay={() => setVideoPlaying(true)}
              onPause={() => setVideoPlaying(false)}
              onEnded={() => setVideoPlaying(false)}
            />
            {!videoReady && (
              <div className="student-video-placeholder">
                <span>Carregando video...</span>
              </div>
            )}
            <div className={`student-video-overlay${videoPlaying ? '' : ' is-visible'}`}>
              <button
                type="button"
                className="student-video-overlay-btn"
                onClick={handleVideoToggle}
                aria-label={videoPlaying ? 'Pausar video' : 'Tocar video'}
              >
                {videoPlaying ? <IconPause /> : <IconPlay />}
              </button>
            </div>
            <div className="student-video-controls">
              <div className="student-video-progress">
                <div className="student-video-progress-track">
                  <span style={{ width: `${videoProgress}%` }} />
                </div>
                <input
                  type="range"
                  min="0"
                  max={videoDuration || 0}
                  step="0.1"
                  value={videoCurrent}
                  onChange={handleVideoSeek}
                  className="student-video-slider"
                  aria-label="Progresso do video"
                />
              </div>
              <div className="student-video-controls-row">
                <button
                  type="button"
                  className="student-video-btn"
                  onClick={handleVideoToggle}
                  aria-label={videoPlaying ? 'Pausar video' : 'Tocar video'}
                >
                  {videoPlaying ? <IconPause /> : <IconPlay />}
                </button>
                <span className="student-video-time">{videoTimeLabel}</span>
                <button
                  type="button"
                  className="student-video-btn"
                  onClick={handleVideoMute}
                  aria-label={videoMuted ? 'Ativar som' : 'Desativar som'}
                >
                  {videoMuted ? <IconVolumeOff /> : <IconVolumeOn />}
                </button>
              </div>
            </div>
          </div>
        )}

        {currentExercise && (
          <div className="student-current-card">
            <div className="student-current-header">
              <div className="student-current-number">{currentExerciseIndex + 1}</div>
              <div className="student-current-info">
                <strong>{currentExercise.name}</strong>
                {details && <span>{details}</span>}
              </div>
            </div>
            <div className="student-current-sets">
              <span className="student-current-sets-title">Series</span>
              <div className="student-current-sets-grid">
                {Array.from({ length: currentSeriesCount }).map((_, index) => {
                  const isCompleted = index < currentSetIndex || completedExercises.has(currentExerciseIndex);
                  const isActive = index === currentSetIndex && !completedExercises.has(currentExerciseIndex);
                  return (
                    <div
                      key={`${currentExercise.id}-set-${index}`}
                      className={`student-set-circle${isCompleted ? ' is-complete' : ''}${isActive ? ' is-active' : ''}`}
                    >
                      {isCompleted ? <IconCheck /> : index + 1}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="student-current-actions">
              <button
                type="button"
                className="student-start-button"
                onClick={handleCompleteSet}
              >
                Completar serie
              </button>
              <button
                type="button"
                className="student-start-skip"
                onClick={handleSkipExercise}
              >
                Pular exercicio
              </button>
            </div>
          </div>
        )}

        <div className="student-start-upcoming">
          <h3>Proximos exercicios</h3>
          {loading ? (
            <div className="student-loading">
              <p className="student-home-kicker">Carregando treino</p>
              <p className="student-home-sub">Preparando exercicios.</p>
            </div>
          ) : exerciseItems.length ? (
            exerciseItems.slice(currentExerciseIndex + 1).map((exercise, index) => (
              <div key={exercise.id} className="student-start-card">
                <div className="student-start-index">
                  <span>{currentExerciseIndex + 2 + index}</span>
                </div>
                <div className="student-start-info">
                  <strong>{exercise.name}</strong>
                  <div className="student-start-meta">
                    {exercise.series || exercise.reps ? (
                      <span>
                        {exercise.series || '-'} x {exercise.reps || '-'}
                      </span>
                    ) : null}
                    {exercise.carga ? <span>{exercise.carga} kg</span> : null}
                    {exercise.intervalo ? <span>{exercise.intervalo}s</span> : null}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="student-workout-empty">
              <p>Nenhum exercicio cadastrado.</p>
            </div>
          )}
        </div>

        {readyToFinish && (
          <div className="student-start-footer">
            <button
              type="button"
              className="student-start-button"
              onClick={handleComplete}
              disabled={saving || !workout}
            >
              {saving ? 'Salvando...' : 'Concluir treino'}
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <PageShell
      title="Iniciar treino"
      description="Comece o treino atual com timer e checklist."
      breadcrumbs={[{ label: 'Treinos', href: '/workouts' }]}
    >
      {loading ? (
        <p className="subtle">Carregando treino...</p>
      ) : workout ? (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div className="card">
            <h3>Treino do dia</h3>
            <p className="subtle" style={{ marginTop: 8 }}>
              {workout.nomeDoTreino ?? 'Nenhum treino encontrado'}
            </p>
            <button className="button" style={{ marginTop: 16 }} onClick={handleComplete} disabled={saving}>
              {saving ? 'Salvando...' : 'Marcar como concluido'}
            </button>
          </div>
          <div className="card">
            <h3>Checklist</h3>
            {workout.treino?.length ? (
              <ul style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {workout.treino.map((item: string, index: number) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="subtle" style={{ marginTop: 8 }}>
                Nenhum exercicio cadastrado.
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="subtle">Nenhum treino encontrado.</p>
      )}
    </PageShell>
  );
}
