import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius } from '../../theme';

interface WorkoutTimerProps {
  initialSeconds?: number;
  onComplete?: () => void;
  onTimeUpdate?: (seconds: number) => void;
  autoStart?: boolean;
  showControls?: boolean;
  mode?: 'countdown' | 'stopwatch';
  size?: 'small' | 'medium' | 'large';
}

export function WorkoutTimer({
  initialSeconds = 60,
  onComplete,
  onTimeUpdate,
  autoStart = false,
  showControls = true,
  mode = 'countdown',
  size = 'medium',
}: WorkoutTimerProps) {
  const { colors } = useTheme();
  const [seconds, setSeconds] = useState(mode === 'countdown' ? initialSeconds : 0);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [isPaused, setIsPaused] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onTimeUpdateRef = useRef(onTimeUpdate);

  const formatTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onComplete, onTimeUpdate]);

  useEffect(() => {
    setSeconds(mode === 'countdown' ? initialSeconds : 0);
  }, [initialSeconds, mode]);

  useEffect(() => {
    if (isRunning && !isPaused) {
      startPulse();
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => {
          const newValue = mode === 'countdown' ? prev - 1 : prev + 1;
          onTimeUpdateRef.current?.(newValue);

          if (mode === 'countdown' && newValue <= 0) {
            clearInterval(intervalRef.current!);
            setIsRunning(false);
            stopPulse();
            Vibration.vibrate([0, 500, 200, 500]);
            onCompleteRef.current?.();
            return 0;
          }

          return newValue;
        });
      }, 1000);
    } else {
      stopPulse();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, isPaused, mode, startPulse, stopPulse]);

  const handleStart = () => {
    setIsRunning(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleResume = () => {
    setIsPaused(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsPaused(false);
    setSeconds(mode === 'countdown' ? initialSeconds : 0);
  };

  const handleSkip = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setIsRunning(false);
    setIsPaused(false);
    stopPulse();
    onComplete?.();
  };

  const getTimerSize = () => {
    switch (size) {
      case 'small':
        return { container: 80, text: 20 };
      case 'medium':
        return { container: 120, text: 32 };
      case 'large':
        return { container: 180, text: 48 };
      default:
        return { container: 120, text: 32 };
    }
  };

  const timerSize = getTimerSize();
  const isLowTime = mode === 'countdown' && seconds <= 10 && seconds > 0;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.timerContainer,
          {
            width: timerSize.container,
            height: timerSize.container,
            backgroundColor: isLowTime ? colors.error + '20' : colors.surface,
            borderColor: isRunning && !isPaused 
              ? (isLowTime ? colors.error : colors.primary)
              : colors.border,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <Text
          style={[
            styles.timerText,
            {
              fontSize: timerSize.text,
              color: isLowTime ? colors.error : colors.text,
            },
          ]}
        >
          {formatTime(seconds)}
        </Text>
        <Text style={[styles.modeLabel, { color: colors.textMuted }]}>
          {mode === 'countdown' ? 'Descanso' : 'Tempo'}
        </Text>
      </Animated.View>

      {showControls && (
        <View style={styles.controls}>
          {!isRunning ? (
            <TouchableOpacity
              style={[styles.controlButton, { backgroundColor: colors.primary }]}
              onPress={handleStart}
            >
              <Ionicons name="play" size={24} color="#fff" />
            </TouchableOpacity>
          ) : isPaused ? (
            <TouchableOpacity
              style={[styles.controlButton, { backgroundColor: colors.primary }]}
              onPress={handleResume}
            >
              <Ionicons name="play" size={24} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.controlButton, { backgroundColor: colors.warning }]}
              onPress={handlePause}
            >
              <Ionicons name="pause" size={24} color="#fff" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.controlButton, { backgroundColor: colors.surface }]}
            onPress={handleReset}
          >
            <Ionicons name="refresh" size={24} color={colors.text} />
          </TouchableOpacity>

          {mode === 'countdown' && isRunning && (
            <TouchableOpacity
              style={[styles.controlButton, { backgroundColor: colors.success }]}
              onPress={handleSkip}
            >
              <Ionicons name="play-skip-forward" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  timerContainer: {
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  timerText: {
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  modeLabel: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  controls: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
