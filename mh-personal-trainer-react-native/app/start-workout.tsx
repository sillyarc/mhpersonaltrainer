import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Keyboard, Platform, TouchableWithoutFeedback, Image, Animated, Dimensions, PanResponder } from 'react-native';
import { showAlert } from '@utils/alert';
import {
  buildExerciseNameLookup,
  resolveExerciseVideoUrlByName,
} from '@utils/exerciseLookup';
import {
  coerceMetricValue,
  formatMetricText,
  toNumericMetric,
} from '@utils/workoutMetrics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTheme } from '../src/hooks/useTheme';
import { Button } from '../src/components/common';
import { ExerciseCard } from '../src/components/workout/ExerciseCard';
import { WorkoutTimer } from '../src/components/workout/WorkoutTimer';
import { spacing, borderRadius } from '../src/theme';
import { WorkoutExercise, SetProgress, ExerciseProgress } from '../src/types/workout';
import { fetchAvailableExercises, fetchUserWorkoutById, updateUserWorkout } from '../src/services/workouts';
import { useAuthStore } from '../src/store/authStore';
import { submitWorkoutFeedback } from '../src/services/feedback';
import * as Location from 'expo-location';
import {
  WorkoutPartyLocation,
  WorkoutPartyPresence,
  computeWorkoutPartyScore,
  leaveWorkoutPartyPresence,
  rankWorkoutPartyPresence,
  upsertWorkoutPartyPresence,
  watchWorkoutPartyPresence,
} from '../src/services/workoutParty';

interface ActiveWorkout {
  id: string;
  name: string;
  exercises: WorkoutExercise[];
}

const hasValidPersonalCode = (code?: string | number | null) => {
  if (code === null || code === undefined) return false;
  if (typeof code === 'number') return code > 0;
  if (typeof code === 'string') {
    const trimmed = code.trim();
    return trimmed.length > 0 && trimmed !== '0';
  }
  return false;
};

const PARTY_MAX_DISTANCE_METERS = 450;
const PARTY_STALE_SECONDS = 90;
const PARTY_SYNC_INTERVAL_MS = 12000;
const PARTY_FLOATING_WIDTH = 78;
const PARTY_FLOATING_HEIGHT = 94;

const normalizeWeight = (value: number) => {
  const sanitized = Math.max(0, Number.isFinite(value) ? value : 0);
  return Math.round(sanitized * 10) / 10;
};

const formatWeightKg = (value: number) => {
  const normalized = normalizeWeight(value);
  if (normalized === 0) return '0kg';
  if (Number.isInteger(normalized)) return `${normalized.toFixed(0)}kg`;
  return `${normalized.toFixed(1)}kg`;
};

const clampValue = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getPartyFloatingBounds = () => {
  const { width, height } = Dimensions.get('window');
  const minX = spacing.sm;
  const maxX = Math.max(minX, width - PARTY_FLOATING_WIDTH - spacing.sm);
  const minY = Platform.OS === 'ios' ? 116 : 92;
  const maxY = Math.max(minY, height - PARTY_FLOATING_HEIGHT - 148);
  return { minX, maxX, minY, maxY };
};

const getPartyFloatingDefault = () => {
  const { maxX } = getPartyFloatingBounds();
  return {
    x: maxX,
    y: Platform.OS === 'ios' ? 156 : 134,
  };
};

export default function StartWorkoutScreen() {
  const { colors } = useTheme();
  const { user, role } = useAuthStore();
  const { workoutId, id, studentId } = useLocalSearchParams<{ workoutId?: string; id?: string; studentId?: string }>();

  const [workout, setWorkout] = useState<ActiveWorkout | null>(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [exerciseProgress, setExerciseProgress] = useState<Map<string, ExerciseProgress>>(new Map());
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [workoutStartTime, setWorkoutStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [exerciseWeightOverrides, setExerciseWeightOverrides] = useState<Record<string, number>>({});
  const [showWeightEditModal, setShowWeightEditModal] = useState(false);
  const [weightDraft, setWeightDraft] = useState('');
  const [currentLocation, setCurrentLocation] = useState<WorkoutPartyLocation | undefined>(undefined);
  const [partyParticipants, setPartyParticipants] = useState<WorkoutPartyPresence[]>([]);
  const [partyPosition, setPartyPosition] = useState<number | null>(null);
  const [showPartyRankingModal, setShowPartyRankingModal] = useState(false);
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);
  const [partyFloatingCoords, setPartyFloatingCoords] = useState(getPartyFloatingDefault());
  const workoutStartTimeRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  const pausedTotalMsRef = useRef(0);
  const isPausedRef = useRef(false);
  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const presenceSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const persistedWorkoutLoadRef = useRef<Record<string, number>>({});
  const elapsedSecondsRef = useRef(0);
  const totalCargaKgRef = useRef(0);
  const completedSetCountRef = useRef(0);
  const currentLocationRef = useRef<WorkoutPartyLocation | undefined>(undefined);
  const partyFloatingPosition = useRef(
    new Animated.ValueXY(getPartyFloatingDefault())
  ).current;
  const partyFloatingStartRef = useRef(getPartyFloatingDefault());

  const targetUserId = studentId || user?.uid;
  const resolvedWorkoutId = workoutId || id;
  const partyPanelLayout = useMemo(() => {
    const { width, height } = Dimensions.get('window');
    const panelWidth = Math.min(width - spacing.base * 2, 320);
    const rawLeft = partyFloatingCoords.x + PARTY_FLOATING_WIDTH - panelWidth - 2;
    const left = clampValue(rawLeft, spacing.base, width - panelWidth - spacing.base);
    const rawTop = partyFloatingCoords.y - 8;
    const top = clampValue(rawTop, Platform.OS === 'ios' ? 108 : 86, height - 300);
    return { panelWidth, left, top };
  }, [partyFloatingCoords.x, partyFloatingCoords.y]);

  useEffect(() => {
    const listenerId = partyFloatingPosition.addListener((value) => {
      setPartyFloatingCoords({ x: value.x, y: value.y });
    });
    return () => {
      partyFloatingPosition.removeListener(listenerId);
    };
  }, [partyFloatingPosition]);

  const partyPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () =>
          role === 'aluno' && partyParticipants.length > 1 && !!partyPosition,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
        onPanResponderGrant: () => {
          partyFloatingPosition.stopAnimation((value) => {
            partyFloatingStartRef.current = value;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const bounds = getPartyFloatingBounds();
          const nextX = clampValue(
            partyFloatingStartRef.current.x + gestureState.dx,
            bounds.minX,
            bounds.maxX
          );
          const nextY = clampValue(
            partyFloatingStartRef.current.y + gestureState.dy,
            bounds.minY,
            bounds.maxY
          );
          partyFloatingPosition.setValue({ x: nextX, y: nextY });
        },
        onPanResponderRelease: (_, gestureState) => {
          const movedDistance =
            Math.abs(gestureState.dx) + Math.abs(gestureState.dy);
          if (movedDistance < 8) {
            setShowPartyRankingModal((prev) => !prev);
          }
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [partyFloatingPosition, partyParticipants.length, partyPosition, role]
  );
  const clearPartyPresence = useCallback(() => {
    if (!user?.uid) return;
    if (presenceSyncRef.current) {
      clearInterval(presenceSyncRef.current);
      presenceSyncRef.current = null;
    }
    void leaveWorkoutPartyPresence(user.uid);
  }, [user?.uid]);

  useEffect(() => {
    if (user?.location?.latitude && user?.location?.longitude) {
      setCurrentLocation({
        latitude: Number(user.location.latitude),
        longitude: Number(user.location.longitude),
      });
    }
  }, [user?.location?.latitude, user?.location?.longitude]);

  useEffect(() => {
    if (!(role === 'aluno' && partyParticipants.length > 1 && partyPosition)) return;
    partyFloatingPosition.stopAnimation((value) => {
      const bounds = getPartyFloatingBounds();
      const nextX = clampValue(value.x, bounds.minX, bounds.maxX);
      const nextY = clampValue(value.y, bounds.minY, bounds.maxY);
      partyFloatingPosition.setValue({ x: nextX, y: nextY });
    });
  }, [partyFloatingPosition, partyParticipants.length, partyPosition, role]);

  useEffect(() => {
    if (partyParticipants.length <= 1 && showPartyRankingModal) {
      setShowPartyRankingModal(false);
    }
  }, [partyParticipants.length, showPartyRankingModal]);

  useEffect(() => {
    const loadWorkout = async () => {
      if (!resolvedWorkoutId || !targetUserId) {
        setIsLoading(false);
        return;
      }
      const result = await fetchUserWorkoutById(targetUserId, resolvedWorkoutId);
      const loadedWorkout = result.data;
      if (loadedWorkout) {
        const storedVideoUrls = loadedWorkout.videoUrls || [];
        const normalizedStoredVideoUrls = storedVideoUrls.map((item) =>
          typeof item === 'string' ? item.trim() : ''
        );
        let exerciseLookup = buildExerciseNameLookup([]);
        const workoutEntries = loadedWorkout.treino || [];
        if (workoutEntries.length > 0) {
          const exercisesResult = await fetchAvailableExercises();
          if (exercisesResult.data) {
            exerciseLookup = buildExerciseNameLookup(exercisesResult.data);
          }
        }
        const resolvedVideoUrls: string[] = [];
        const exercises: WorkoutExercise[] = workoutEntries.map((rawName, index) => {
          const name = typeof rawName === 'string' ? rawName : String(rawName || '');
          const resolvedVideoUrl = resolveExerciseVideoUrlByName(
            name,
            normalizedStoredVideoUrls[index] || '',
            exerciseLookup
          );
          resolvedVideoUrls[index] = resolvedVideoUrl || '';
          return {
            videoUrl: resolvedVideoUrl,
            exerciseId: `${loadedWorkout.id}-${index}`,
            nome: name,
            series: coerceMetricValue(loadedWorkout.seriesRep?.[index], 3),
            repeticoes: coerceMetricValue(loadedWorkout.repeticoes?.[index], 12),
            carga: coerceMetricValue(loadedWorkout.carga?.[index], 0),
            intervalo: coerceMetricValue(loadedWorkout.intervalo?.[index], 60),
          };
        });
        const shouldSyncVideoUrls =
          resolvedVideoUrls.length > 0 &&
          resolvedVideoUrls.some((url, index) => url !== (normalizedStoredVideoUrls[index] || ''));
        if (shouldSyncVideoUrls) {
          void updateUserWorkout(targetUserId, loadedWorkout.id, {
            videoUrls: resolvedVideoUrls,
          });
        }
        const initialOverrides = exercises.reduce<Record<string, number>>((acc, exercise) => {
          acc[exercise.exerciseId] = normalizeWeight(toNumericMetric(exercise.carga, 0));
          return acc;
        }, {});
        persistedWorkoutLoadRef.current = initialOverrides;
        setExerciseWeightOverrides(initialOverrides);
        setWorkout({ id: loadedWorkout.id, name: loadedWorkout.nomeDoTreino, exercises });
        const startTime = Date.now();
        workoutStartTimeRef.current = startTime;
        pausedAtRef.current = null;
        pausedTotalMsRef.current = 0;
        setElapsedSeconds(0);
        setWorkoutStartTime(startTime);
      }
      setIsLoading(false);
    };
    loadWorkout();
  }, [targetUserId, resolvedWorkoutId]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const calculateElapsedSeconds = useCallback((now = Date.now()) => {
    const startTime = workoutStartTimeRef.current;
    if (!startTime) return 0;
    const pausedMs =
      pausedTotalMsRef.current +
      (isPausedRef.current && pausedAtRef.current ? now - pausedAtRef.current : 0);
    const elapsed = Math.max(0, Math.floor((now - startTime - pausedMs) / 1000));
    setElapsedSeconds(elapsed);
    return elapsed;
  }, []);

  useEffect(() => {
    if (!workoutStartTime) return;
    calculateElapsedSeconds();
    const timer = setInterval(() => {
      calculateElapsedSeconds();
    }, 1000);
    return () => clearInterval(timer);
  }, [workoutStartTime, calculateElapsedSeconds]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        calculateElapsedSeconds();
      }
    });
    return () => subscription.remove();
  }, [calculateElapsedSeconds]);

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resolveExerciseWeight = useCallback(
    (exercise?: WorkoutExercise) => {
      if (!exercise) return 0;
      const override = exerciseWeightOverrides[exercise.exerciseId];
      if (override !== undefined) return normalizeWeight(override);
      return normalizeWeight(toNumericMetric(exercise.carga, 0));
    },
    [exerciseWeightOverrides]
  );

  const buildCargaPayloadFromOverrides = useCallback(
    (overrides: Record<string, number>) => {
      if (!workout) return [];
      return workout.exercises.map((exercise) =>
        normalizeWeight(
          overrides[exercise.exerciseId] !== undefined
            ? overrides[exercise.exerciseId]
            : toNumericMetric(exercise.carga, 0)
        )
      );
    },
    [workout]
  );

  const persistWorkoutCarga = useCallback(
    async (nextOverrides: Record<string, number>) => {
      if (!workout || !targetUserId) return;
      const changedKeys = Object.keys(nextOverrides);
      if (!changedKeys.length) return;

      const hasAnyChange = changedKeys.some(
        (key) => normalizeWeight(nextOverrides[key]) !== normalizeWeight(persistedWorkoutLoadRef.current[key] ?? 0)
      );
      if (!hasAnyChange) return;

      const payload = buildCargaPayloadFromOverrides(nextOverrides);
      await updateUserWorkout(targetUserId, workout.id, { carga: payload });
      persistedWorkoutLoadRef.current = { ...nextOverrides };
    },
    [buildCargaPayloadFromOverrides, targetUserId, workout]
  );

  const currentExercise = workout?.exercises[currentExerciseIndex];
  const totalExercises = workout?.exercises.length || 0;
  const completedExercises = Array.from(exerciseProgress.values()).filter((p) => p.completed).length;
  const progress = totalExercises > 0 ? (completedExercises / totalExercises) * 100 : 0;
  const currentSeriesCount = toNumericMetric(currentExercise?.series, 1);
  const currentRepsLabel = formatMetricText(currentExercise?.repeticoes);
  const currentSeriesLabel = formatMetricText(currentExercise?.series);
  const currentWeightKg = resolveExerciseWeight(currentExercise);
  const currentCargaLabel = currentExercise ? formatWeightKg(currentWeightKg) : '';
  const currentIntervalLabel = formatMetricText(currentExercise?.intervalo);
  const currentIntervalSeconds = toNumericMetric(
    currentExercise?.intervalo,
    currentIntervalLabel ? 0 : 60
  );
  const completedSetCount = Array.from(exerciseProgress.values()).reduce(
    (total, progressItem) => total + progressItem.sets.length,
    0
  );
  const totalCargaKg = Array.from(exerciseProgress.values()).reduce((total, progressItem) => {
    const setCarga = progressItem.sets.reduce(
      (setTotal, setItem) => setTotal + Math.max(0, Number(setItem.weight || 0)),
      0
    );
    return total + setCarga;
  }, 0);
  const partyScore = computeWorkoutPartyScore(elapsedSeconds, totalCargaKg, completedSetCount);
  const currentExerciseDetails = (() => {
    const parts: string[] = [];
    if (currentSeriesLabel && currentRepsLabel) {
      parts.push(`${currentSeriesLabel} series x ${currentRepsLabel} reps`);
    } else if (currentSeriesLabel) {
      parts.push(currentSeriesLabel);
    } else if (currentRepsLabel) {
      parts.push(currentRepsLabel);
    }
    if (currentCargaLabel) parts.push(currentCargaLabel);
    return parts.join(' - ');
  })();

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
    totalCargaKgRef.current = totalCargaKg;
    completedSetCountRef.current = completedSetCount;
    currentLocationRef.current = currentLocation;
  }, [completedSetCount, currentLocation, elapsedSeconds, totalCargaKg]);

  const applyCurrentExerciseWeight = useCallback(
    (nextWeight: number) => {
      if (!currentExercise) return;
      const sanitized = normalizeWeight(nextWeight);
      setExerciseProgress((prev) => {
        const existing = prev.get(currentExercise.exerciseId);
        if (!existing || existing.sets.length === 0) return prev;
        const updated = new Map(prev);
        updated.set(currentExercise.exerciseId, {
          ...existing,
          sets: existing.sets.map((setItem) => ({
            ...setItem,
            weight: sanitized,
          })),
        });
        return updated;
      });
      setExerciseWeightOverrides((prev) => {
        const next = {
          ...prev,
          [currentExercise.exerciseId]: sanitized,
        };
        void persistWorkoutCarga(next);
        return next;
      });
    },
    [currentExercise, persistWorkoutCarga]
  );

  const handleDecreaseWeight = () => {
    if (!currentExercise) return;
    applyCurrentExerciseWeight(Math.max(0, currentWeightKg - 2.5));
  };

  const handleIncreaseWeight = () => {
    if (!currentExercise) return;
    applyCurrentExerciseWeight(currentWeightKg + 2.5);
  };

  const handleOpenWeightModal = () => {
    if (!currentExercise) return;
    setWeightDraft(String(currentWeightKg || 0));
    setShowWeightEditModal(true);
  };

  const handleSaveWeightModal = () => {
    const normalizedInput = weightDraft.replace(',', '.');
    const parsed = Number(normalizedInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      showAlert('Carga', 'Informe uma carga valida em kg.');
      return;
    }
    applyCurrentExerciseWeight(parsed);
    setShowWeightEditModal(false);
  };

  const syncPartyPresenceNow = useCallback(async () => {
    if (!workout || !user?.uid || role !== 'aluno') return;
    if (!workoutStartTimeRef.current) return;

    try {
      await upsertWorkoutPartyPresence({
        userId: user.uid,
        workoutId: workout.id,
        workoutName: workout.name,
        userName: user.displayName || 'Aluno',
        photoUrl: user.photoUrl,
        role: role || 'aluno',
        startedAtMs: workoutStartTimeRef.current,
        elapsedSeconds: elapsedSecondsRef.current,
        totalCargaKg: totalCargaKgRef.current,
        completedSets: completedSetCountRef.current,
        isPaused: isPausedRef.current,
        isActive: true,
        location: currentLocationRef.current,
      });
    } catch (_) {
      // Silent: party sync should not block workout flow.
    }
  }, [role, user?.displayName, user?.photoUrl, user?.uid, workout]);

  useEffect(() => {
    if (!workout || role !== 'aluno') return;
    let cancelled = false;

    const setupLocation = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (permission.status !== 'granted') {
          setLocationPermissionDenied(true);
          return;
        }
        setLocationPermissionDenied(false);
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setCurrentLocation({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          });
        }
        locationWatcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 20,
            timeInterval: 15000,
          },
          (position) => {
            setCurrentLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          }
        );
      } catch (_) {
        setLocationPermissionDenied(true);
      }
    };

    setupLocation();

    return () => {
      cancelled = true;
      if (locationWatcherRef.current) {
        locationWatcherRef.current.remove();
        locationWatcherRef.current = null;
      }
    };
  }, [role, workout]);

  useEffect(() => {
    if (!workout || !user?.uid || role !== 'aluno') return;
    const unsubscribe = watchWorkoutPartyPresence(
      workout.id,
      (items) => {
        const ranked = rankWorkoutPartyPresence(items, {
          myUserId: user.uid,
          myLocation: currentLocation,
          maxDistanceMeters: PARTY_MAX_DISTANCE_METERS,
          staleAfterSeconds: PARTY_STALE_SECONDS,
        });
        setPartyParticipants(ranked.participants);
        setPartyPosition(ranked.myPosition);
      },
      () => {
        setPartyParticipants([]);
        setPartyPosition(null);
      }
    );

    return () => unsubscribe();
  }, [currentLocation, role, user?.uid, workout]);

  useEffect(() => {
    if (!workout || !user?.uid || role !== 'aluno') return;
    void syncPartyPresenceNow();

    if (presenceSyncRef.current) {
      clearInterval(presenceSyncRef.current);
    }

    presenceSyncRef.current = setInterval(() => {
      void syncPartyPresenceNow();
    }, PARTY_SYNC_INTERVAL_MS);

    return () => {
      clearPartyPresence();
    };
  }, [clearPartyPresence, role, syncPartyPresenceNow, user?.uid, workout]);

  const handleCompleteSet = useCallback(() => {
    if (!currentExercise) return;

    const exerciseId = currentExercise.exerciseId;
    const repsValue = toNumericMetric(currentExercise.repeticoes, 0);
    const weightValue = resolveExerciseWeight(currentExercise);
    const totalSets = toNumericMetric(currentExercise.series, 1);
    const intervalLabel = formatMetricText(currentExercise.intervalo);
    const restSeconds = toNumericMetric(
      currentExercise.intervalo,
      intervalLabel ? 0 : 60
    );
    const currentProgress = exerciseProgress.get(exerciseId) || {
      exerciseId,
      sets: [],
      completed: false,
    };
    if (currentProgress.completed) {
      if (currentExerciseIndex < totalExercises - 1) {
        setCurrentExerciseIndex((prev) => prev + 1);
        setCurrentSetIndex(0);
      } else {
        handleFinishWorkout();
      }
      return;
    }

    const newSet: SetProgress = {
      setNumber: currentSetIndex + 1,
      reps: repsValue,
      weight: weightValue,
      completed: true,
    };

    const updatedSets = [...currentProgress.sets, newSet];
    const isExerciseComplete = updatedSets.length >= totalSets;

    setExerciseProgress((prev) => {
      const updated = new Map(prev);
      updated.set(exerciseId, {
        ...currentProgress,
        sets: updatedSets,
        completed: isExerciseComplete,
      });
      return updated;
    });
    void syncPartyPresenceNow();

    if (isExerciseComplete) {
      if (currentExerciseIndex < totalExercises - 1) {
        setShowRestTimer(true);
      } else {
        handleFinishWorkout();
      }
    } else {
      setCurrentSetIndex((prev) => prev + 1);
      if (restSeconds > 0) {
        setShowRestTimer(true);
      }
    }
  }, [
    currentExercise,
    currentExerciseIndex,
    currentSetIndex,
    exerciseProgress,
    resolveExerciseWeight,
    syncPartyPresenceNow,
    totalExercises,
  ]);

  const handleSelectExercise = useCallback(
    (index: number) => {
      if (!workout) return;
      const boundedIndex = Math.max(0, Math.min(index, workout.exercises.length - 1));
      const selectedExercise = workout.exercises[boundedIndex];
      if (!selectedExercise) return;

      const totalSets = toNumericMetric(selectedExercise.series, 1);
      const completedSets = exerciseProgress.get(selectedExercise.exerciseId)?.sets.length || 0;
      const nextSetIndex =
        completedSets >= totalSets ? Math.max(0, totalSets - 1) : completedSets;

      setShowRestTimer(false);
      setCurrentExerciseIndex(boundedIndex);
      setCurrentSetIndex(nextSetIndex);
    },
    [exerciseProgress, workout]
  );

  const handleRestComplete = () => {
    setShowRestTimer(false);
    const currentProgress = exerciseProgress.get(currentExercise?.exerciseId || '');

    if (currentProgress?.completed && currentExerciseIndex < totalExercises - 1) {
      handleSelectExercise(currentExerciseIndex + 1);
    }
  };

  const handlePreviousExercise = () => {
    if (currentExerciseIndex <= 0) return;
    handleSelectExercise(currentExerciseIndex - 1);
  };

  const handleSkipExercise = () => {
    if (currentExerciseIndex < totalExercises - 1) {
      handleSelectExercise(currentExerciseIndex + 1);
    } else {
      handleFinishWorkout();
    }
  };

  const handleTogglePause = () => {
    if (!workoutStartTimeRef.current) return;
    const now = Date.now();
    if (isPausedRef.current) {
      if (pausedAtRef.current) {
        pausedTotalMsRef.current += now - pausedAtRef.current;
        pausedAtRef.current = null;
      }
      isPausedRef.current = false;
      setIsPaused(false);
    } else {
      pausedAtRef.current = now;
      isPausedRef.current = true;
      setIsPaused(true);
    }
    calculateElapsedSeconds(now);
    void syncPartyPresenceNow();
  };

  const markWorkoutCompleted = useCallback(async () => {
    if (!workout || !targetUserId) return;
    await updateUserWorkout(targetUserId, workout.id, {
      lastCompletedAt: new Date(),
    });
  }, [targetUserId, workout]);

  const handleFinishWorkout = () => {
    calculateElapsedSeconds();
    const shouldCollectFeedback = role === 'aluno' && hasValidPersonalCode(user?.codigoPersonal);
    if (shouldCollectFeedback) {
      setShowFeedbackModal(true);
      return;
    }
    markWorkoutCompleted().finally(() => {
      clearPartyPresence();
      showAlert(
        'Finalizar treino',
        `ParabÃƒÆ’Ã‚Â©ns! VoÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âª completou ${completedExercises} de ${totalExercises} exercÃƒÆ’Ã‚Â­cios em ${formatDuration(elapsedSeconds)}.`,
        [
          {
            text: 'Ver resumo',
            onPress: () => router.back(),
          },
        ]
      );
    });
  };

  const handleSubmitFeedback = async () => {
    if (!user?.uid || !workout) return;
    if (!rating) {
      showAlert('Feedback', 'Selecione uma nota para concluir.');
      return;
    }
    const workoutSeconds = calculateElapsedSeconds();
    const result = await submitWorkoutFeedback({
      userId: user.uid,
      codigoDoPersonal: Number(user.codigoPersonal || 0),
      yourName: user.displayName || 'Aluno',
      comentarioDoAluno: feedbackText.trim(),
      estrela: rating,
      nomeDoTreino: workout.name,
      tempoDoTreino: workoutSeconds,
    });
    if (result.error) {
      showAlert('Erro', result.error);
      return;
    }
    await markWorkoutCompleted();
    clearPartyPresence();
    setShowFeedbackModal(false);
    showAlert(
      'Treino concluÃƒÆ’Ã‚Â­do',
      `ParabÃƒÆ’Ã‚Â©ns! VoÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âª completou ${completedExercises} de ${totalExercises} exercÃƒÆ’Ã‚Â­cios em ${formatDuration(elapsedSeconds)}.`,
      [{ text: 'Fechar', onPress: () => router.back() }]
    );
  };

  const handleCancelWorkout = () => {
    showAlert(
      'Cancelar treino',
      'Tem certeza que deseja cancelar o treino? Seu progresso serÃƒÆ’Ã‚Â¡ perdido.',
      [
        { text: 'Continuar', style: 'cancel' },
        {
          text: 'Cancelar treino',
          style: 'destructive',
          onPress: () => {
            clearPartyPresence();
            router.back();
          },
        },
      ]
    );
  };

  if (isLoading || !workout) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.primaryText }]}>
            Carregando treino...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleCancelWorkout} style={styles.headerButton}>
          <Ionicons name="close" size={24} color={colors.error} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.primaryText }]} numberOfLines={1}>
            {workout.name}
          </Text>
          <Text style={[styles.headerTime, { color: colors.primary }]}>
            {formatDuration(elapsedSeconds)}
          </Text>
        </View>
        <TouchableOpacity onPress={handleTogglePause} style={styles.headerButton}>
          <Ionicons name={isPaused ? 'play' : 'pause'} size={24} color={colors.primaryText} />
        </TouchableOpacity>
      </View>

      {role === 'aluno' && partyParticipants.length > 1 && partyPosition ? (
        <Animated.View
          style={[
            styles.partyFloating,
            {
              backgroundColor: colors.secondaryBackground,
              borderColor: colors.border,
              transform: partyFloatingPosition.getTranslateTransform(),
            },
          ]}
          {...partyPanResponder.panHandlers}
        >
          <View style={[styles.partyFloatingAvatarWrap, { borderColor: colors.primary }]}>
            {user?.photoUrl ? (
              <Image source={{ uri: user.photoUrl }} style={styles.partyFloatingAvatar} />
            ) : (
              <View style={[styles.partyFloatingAvatarFallback, { backgroundColor: colors.primary + '26' }]}>
                <Text style={[styles.partyFloatingAvatarInitial, { color: colors.primary }]}>
                  {(user?.displayName || 'A')[0]?.toUpperCase() || 'A'}
                </Text>
              </View>
            )}
          </View>
          <View style={[styles.partyFloatingRank, { backgroundColor: colors.primary }]}>
            <Text style={[styles.partyFloatingRankText, { color: colors.info }]}>#{partyPosition}</Text>
            <Text style={[styles.partyFloatingSubText, { color: colors.info }]}>
              {partyParticipants.length} ao vivo
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {role === 'aluno' && showPartyRankingModal && partyParticipants.length > 1 ? (
        <View
          style={[
            styles.partyAnchorPanel,
            {
              top: partyPanelLayout.top,
              left: partyPanelLayout.left,
              width: partyPanelLayout.panelWidth,
              backgroundColor: colors.secondaryBackground,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.partyAnchorHeader}>
            <View>
              <Text style={[styles.partyAnchorTitle, { color: colors.primaryText }]}>Disputa ao vivo</Text>
              <Text style={[styles.partyAnchorSubtitle, { color: colors.secondaryText }]}>
                Ranking perto de voce
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowPartyRankingModal(false)} style={styles.headerButton}>
              <Ionicons name="close" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>

          {locationPermissionDenied ? (
            <View style={[styles.partyWarning, { backgroundColor: colors.warning + '20' }]}>
              <Text style={[styles.partyWarningText, { color: colors.warning }]}>
                Ative a localizacao para filtrar apenas alunos proximos.
              </Text>
            </View>
          ) : null}

          <ScrollView
            style={styles.partyAnchorList}
            contentContainerStyle={styles.partyAnchorListContent}
            showsVerticalScrollIndicator={false}
          >
            {partyParticipants.map((item, index) => {
              const isMe = item.userId === user?.uid;
              return (
                <View
                  key={item.userId}
                  style={[
                    styles.partyRankingItem,
                    {
                      backgroundColor: isMe ? colors.primary + '14' : colors.surface,
                      borderColor: isMe ? colors.primary + '3a' : colors.border,
                    },
                  ]}
                >
                  <View style={[styles.partyRankBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.partyRankBadgeText, { color: colors.info }]}>#{index + 1}</Text>
                  </View>
                  <View style={styles.partyPlayerAvatarWrap}>
                    {item.photoUrl ? (
                      <Image source={{ uri: item.photoUrl }} style={styles.partyPlayerAvatar} />
                    ) : (
                      <View style={[styles.partyPlayerAvatarFallback, { backgroundColor: colors.primary + '26' }]}>
                        <Text style={[styles.partyPlayerAvatarInitial, { color: colors.primary }]}>
                          {(item.userName || 'A')[0]?.toUpperCase() || 'A'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.partyPlayerInfo}>
                    <Text style={[styles.partyPlayerName, { color: colors.primaryText }]}>
                      {item.userName} {isMe ? '(voce)' : ''}
                    </Text>
                    <Text style={[styles.partyPlayerMeta, { color: colors.secondaryText }]}>
                      {formatDuration(item.elapsedSeconds)} Ãƒâ€šÃ‚Â· {formatWeightKg(item.totalCargaKg)} Ãƒâ€šÃ‚Â· {item.completedSets} series
                    </Text>
                  </View>
                  <View>
                    <Text style={[styles.partyPlayerScore, { color: colors.primary }]}>{item.score}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {currentExercise?.videoUrl ? (
        <View style={[styles.videoCard, { backgroundColor: colors.card }]}>
          <ExerciseVideo
            key={`${currentExercise.exerciseId}:${currentExercise.videoUrl}`}
            uri={currentExercise.videoUrl}
          />
        </View>
      ) : null}

      <View style={[styles.progressBar, { backgroundColor: colors.surface }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: colors.primary, width: `${progress}%` },
          ]}
        />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {currentExercise && (
          <View style={[styles.currentExerciseCard, { backgroundColor: colors.card }]}>
            <View style={styles.exerciseHeader}>
              <View style={[styles.exerciseNumber, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.exerciseNumberText, { color: colors.primary }]}>
                  {currentExerciseIndex + 1}
                </Text>
              </View>
              <View style={styles.exerciseInfo}>
                <Text style={[styles.exerciseName, { color: colors.primaryText }]}>
                  {currentExercise.nome}
                </Text>
                <Text style={[styles.exerciseDetails, { color: colors.secondaryText }]}>
                  {currentExerciseDetails}
                </Text>
              </View>
            </View>

            <View style={[styles.loadEditorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.loadEditorHeader}>
                <View>
                  <Text style={[styles.loadEditorTitle, { color: colors.primaryText }]}>Carga atual</Text>
                  <Text style={[styles.loadEditorHint, { color: colors.secondaryText }]}>
                    Ajuste a carga para metrica do personal e IA.
                  </Text>
                </View>
                <Text style={[styles.loadEditorValue, { color: colors.primary }]}>
                  {formatWeightKg(currentWeightKg)}
                </Text>
              </View>
              <View style={styles.loadEditorActions}>
                <TouchableOpacity
                  style={[styles.loadEditorButton, { borderColor: colors.border }]}
                  onPress={handleDecreaseWeight}
                >
                  <Ionicons name="remove" size={18} color={colors.primaryText} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.loadEditorButton, { borderColor: colors.border }]}
                  onPress={handleOpenWeightModal}
                >
                  <Text style={[styles.loadEditorButtonText, { color: colors.primaryText }]}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.loadEditorButton, { borderColor: colors.border }]}
                  onPress={handleIncreaseWeight}
                >
                  <Ionicons name="add" size={18} color={colors.primaryText} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.partyStatsRow, { backgroundColor: colors.surface }]}>
              <View style={styles.partyStatItem}>
                <Text style={[styles.partyStatLabel, { color: colors.secondaryText }]}>Score</Text>
                <Text style={[styles.partyStatValue, { color: colors.primaryText }]}>{partyScore}</Text>
              </View>
              <View style={styles.partyStatDivider} />
              <View style={styles.partyStatItem}>
                <Text style={[styles.partyStatLabel, { color: colors.secondaryText }]}>Carga total</Text>
                <Text style={[styles.partyStatValue, { color: colors.primaryText }]}>{formatWeightKg(totalCargaKg)}</Text>
              </View>
              <View style={styles.partyStatDivider} />
              <View style={styles.partyStatItem}>
                <Text style={[styles.partyStatLabel, { color: colors.secondaryText }]}>Series</Text>
                <Text style={[styles.partyStatValue, { color: colors.primaryText }]}>{completedSetCount}</Text>
              </View>
            </View>

            <View style={styles.setsContainer}>
              <Text style={[styles.setsTitle, { color: colors.secondaryText }]}>SÃƒÆ’Ã‚Â©ries</Text>
              <View style={styles.setsGrid}>
                {Array.from({ length: currentSeriesCount }).map((_, index) => {
                  const progressItem = exerciseProgress.get(currentExercise.exerciseId);
                  const setCompleted = progressItem?.sets.some((s) => s.setNumber === index + 1);
                  const isCurrent = index === currentSetIndex;

                  return (
                    <View
                      key={index}
                      style={[
                        styles.setCircle,
                        {
                          backgroundColor: setCompleted
                            ? colors.success
                            : isCurrent
                            ? colors.primary + '30'
                            : colors.surface,
                          borderColor: isCurrent ? colors.primary : 'transparent',
                        },
                      ]}
                    >
                      {setCompleted ? (
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      ) : (
                        <Text style={[styles.setNumber, { color: isCurrent ? colors.primary : colors.secondaryText }]}>
                          {index + 1}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.actionButtons}>
              <Button
                title="completar sess\u00E3o"
                onPress={handleCompleteSet}
                fullWidth
                size="large"
                icon={
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color="#fff"
                    style={{ marginRight: spacing.sm }}
                  />
                }
              />
              <View style={styles.navigationRow}>
                <TouchableOpacity
                  style={[
                    styles.previousButton,
                    { borderColor: colors.border },
                    currentExerciseIndex <= 0 && styles.navButtonDisabled,
                  ]}
                  onPress={handlePreviousExercise}
                  disabled={currentExerciseIndex <= 0}
                >
                  <Text style={[styles.skipButtonText, { color: colors.secondaryText }]}>
                    voltar exercicio
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.skipButton, { borderColor: colors.border }]}
                  onPress={handleSkipExercise}
                >
                  <Text style={[styles.skipButtonText, { color: colors.secondaryText }]}>
                    pular exercicio
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={styles.upcomingSection}>
          <Text style={[styles.upcomingTitle, { color: colors.primaryText }]}>
            PrÃƒÆ’Ã‚Â³ximos exercÃƒÆ’Ã‚Â­cios
          </Text>
          {workout.exercises.map((exercise, index) => {
            const progressItem = exerciseProgress.get(exercise.exerciseId);
            return (
              <ExerciseCard
                key={exercise.exerciseId}
                exercise={exercise}
                index={index}
                isCompleted={progressItem?.completed}
                isActive={index === currentExerciseIndex}
                onPress={() => handleSelectExercise(index)}
              />
            );
          })}
          {currentExerciseIndex >= totalExercises - 1 && (
            <View style={[styles.lastExercise, { backgroundColor: colors.surface }]}>
              <Ionicons name="flag" size={32} color={colors.success} />
              <Text style={[styles.lastExerciseText, { color: colors.secondaryText }]}>
                Este ? o ÃƒÆ’Ã…Â¡ltimo exercÃƒÆ’Ã‚Â­cio!
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={showFeedbackModal} animationType="fade" transparent>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView
            style={styles.feedbackOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.feedbackCard, { backgroundColor: colors.secondaryBackground }]}>
              <Text style={[styles.feedbackTitle, { color: colors.primaryText }]}>
                Como foi o treino?
              </Text>
              <Text style={[styles.feedbackSubtitle, { color: colors.secondaryText }]}>
                Sua avaliaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o ajuda seu personal.
              </Text>
              <View style={styles.starsRow}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <TouchableOpacity key={`rate-${index}`} onPress={() => setRating(index + 1)}>
                    <Ionicons
                      name={index < rating ? 'star' : 'star-outline'}
                      size={28}
                      color={colors.warning}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.feedbackInput, { color: colors.primaryText, borderColor: colors.border }]}
                placeholder="Conte como foi o treino..."
                placeholderTextColor={colors.secondaryText}
                value={feedbackText}
                onChangeText={setFeedbackText}
                multiline
              />
              <View style={styles.feedbackActions}>
                <TouchableOpacity
                  style={[styles.feedbackButton, { borderColor: colors.border }]}
                  onPress={() => {
                    markWorkoutCompleted().finally(() => {
                      clearPartyPresence();
                      setShowFeedbackModal(false);
                      router.back();
                    });
                  }}
                >
                  <Text style={[styles.feedbackButtonText, { color: colors.secondaryText }]}>
                    Pular
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.feedbackButton, { backgroundColor: colors.primary }]}
                  onPress={handleSubmitFeedback}
                >
                  <Text style={[styles.feedbackButtonText, { color: colors.info }]}>
                    Enviar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={showRestTimer}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={handleRestComplete}
      >
        <SafeAreaView style={[styles.restModal, { backgroundColor: colors.primaryBackground }]}>
          <View style={styles.restModalContent}>
            <Text style={[styles.restTitle, { color: colors.primaryText }]}>Tempo de descanso</Text>
            <Text style={[styles.restSubtitle, { color: colors.secondaryText }]}>
              Prepare-se para a prÃƒÆ’Ã‚Â³xima sÃƒÆ’Ã‚Â©rie
            </Text>

            <View style={styles.timerContainer}>
              <WorkoutTimer
                initialSeconds={currentIntervalSeconds}
                onComplete={handleRestComplete}
                autoStart
                size="large"
                mode="countdown"
              />
            </View>

            <Button title="Pular descanso" onPress={handleRestComplete} variant="outline" fullWidth />
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={showWeightEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWeightEditModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            style={styles.feedbackOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.weightEditCard, { backgroundColor: colors.secondaryBackground }]}>
              <Text style={[styles.weightEditTitle, { color: colors.primaryText }]}>Editar carga</Text>
              <Text style={[styles.weightEditSubtitle, { color: colors.secondaryText }]}>
                Informe a carga atual em kg para este exercicio.
              </Text>
              <TextInput
                value={weightDraft}
                onChangeText={setWeightDraft}
                keyboardType="decimal-pad"
                placeholder="Ex: 22.5"
                placeholderTextColor={colors.secondaryText}
                style={[styles.weightEditInput, { borderColor: colors.border, color: colors.primaryText }]}
              />
              <View style={styles.feedbackActions}>
                <TouchableOpacity
                  style={[styles.feedbackButton, { borderColor: colors.border }]}
                  onPress={() => setShowWeightEditModal(false)}
                >
                  <Text style={[styles.feedbackButtonText, { color: colors.secondaryText }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.feedbackButton, { backgroundColor: colors.primary }]}
                  onPress={handleSaveWeightModal}
                >
                  <Text style={[styles.feedbackButtonText, { color: colors.info }]}>Salvar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerButton: {
    padding: spacing.sm,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  partyFloating: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PARTY_FLOATING_WIDTH,
    minHeight: PARTY_FLOATING_HEIGHT,
    zIndex: 30,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  partyFloatingAvatarWrap: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  partyFloatingAvatar: {
    width: '100%',
    height: '100%',
  },
  partyFloatingAvatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyFloatingAvatarInitial: {
    fontSize: 16,
    fontWeight: '700',
  },
  partyFloatingRank: {
    borderRadius: borderRadius.md,
    width: '100%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  partyFloatingRankText: {
    fontSize: 14,
    fontWeight: '800',
  },
  partyFloatingSubText: {
    fontSize: 10,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTime: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  progressBar: {
    height: 4,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  videoCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  videoSurface: {
    width: '100%',
    height: 220,
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  currentExerciseCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  exerciseNumber: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  exerciseNumberText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: '600',
  },
  exerciseDetails: {
    fontSize: 14,
    marginTop: spacing.xs,
  },
  loadEditorCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  loadEditorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  loadEditorTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  loadEditorHint: {
    fontSize: 12,
    marginTop: 2,
  },
  loadEditorValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  loadEditorActions: {
    marginTop: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  loadEditorButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadEditorButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  partyStatsRow: {
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  partyStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  partyStatLabel: {
    fontSize: 11,
  },
  partyStatValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '700',
  },
  partyStatDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  setsContainer: {
    marginBottom: spacing.lg,
  },
  setsTitle: {
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  setsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  setCircle: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  setNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtons: {
    gap: spacing.md,
  },
  navigationRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  previousButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
  },
  skipButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
  },
  navButtonDisabled: {
    opacity: 0.45,
  },
  skipButtonText: {
    fontSize: 14,
  },
  upcomingSection: {
    marginTop: spacing.md,
  },
  upcomingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.base,
  },
  lastExercise: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  lastExerciseText: {
    fontSize: 14,
    marginTop: spacing.sm,
  },
  feedbackOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  feedbackCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  feedbackTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  feedbackSubtitle: {
    fontSize: 13,
  },
  starsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  feedbackInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  feedbackActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  feedbackButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  feedbackButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  restModal: {
    flex: 1,
  },
  restModalContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  restTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  restSubtitle: {
    fontSize: 16,
    marginBottom: spacing['3xl'],
  },
  timerContainer: {
    marginBottom: spacing['3xl'],
  },
  partyAnchorPanel: {
    position: 'absolute',
    zIndex: 26,
    maxHeight: 300,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  partyAnchorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  partyAnchorTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  partyAnchorSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  partyAnchorList: {
    marginTop: spacing.sm,
  },
  partyAnchorListContent: {
    paddingBottom: spacing.xs,
  },
  partyWarning: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  partyWarningText: {
    fontSize: 12,
  },
  partyRankingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  partyRankBadge: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  partyRankBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  partyPlayerAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginRight: spacing.sm,
  },
  partyPlayerAvatar: {
    width: '100%',
    height: '100%',
  },
  partyPlayerAvatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyPlayerAvatarInitial: {
    fontSize: 14,
    fontWeight: '700',
  },
  partyPlayerInfo: {
    flex: 1,
  },
  partyPlayerName: {
    fontSize: 14,
    fontWeight: '600',
  },
  partyPlayerMeta: {
    marginTop: 2,
    fontSize: 11,
  },
  partyPlayerScore: {
    fontSize: 16,
    fontWeight: '800',
    minWidth: 40,
    textAlign: 'right',
  },
  partyEmptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  weightEditCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  weightEditTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  weightEditSubtitle: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  weightEditInput: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    fontWeight: '600',
  },
});

function ExerciseVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri, useCaching: true }, (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  return (
    <View style={styles.videoSurface}>
      <VideoView style={styles.video} player={player} contentFit="contain" />
    </View>
  );
}

