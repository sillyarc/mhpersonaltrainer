import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius } from '../../theme';
import { WorkoutExercise } from '../../types/workout';
import { isGifMediaUrl } from '../../utils/exerciseLookup';
import { formatMetricText, formatMetricWithSuffix } from '../../utils/workoutMetrics';

interface ExerciseCardProps {
  exercise: WorkoutExercise;
  index: number;
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  showDragHandle?: boolean;
  onDragHandlePressIn?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onVideoPress?: () => void;
  showActions?: boolean;
  isCompleted?: boolean;
  isActive?: boolean;
  statusLabel?: string;
  statusTone?: 'success' | 'warning' | 'neutral';
}

export function ExerciseCard({
  exercise,
  index,
  onPress,
  onLongPress,
  delayLongPress,
  showDragHandle = false,
  onDragHandlePressIn,
  onEdit,
  onDelete,
  onVideoPress,
  showActions = false,
  isCompleted = false,
  isActive = false,
  statusLabel,
  statusTone = 'neutral',
}: ExerciseCardProps) {
  const { colors } = useTheme();
  const seriesLabel = formatMetricText(exercise.series);
  const repsLabel = formatMetricText(exercise.repeticoes);
  const cargaLabel = formatMetricWithSuffix(exercise.carga, ' kg');
  const intervaloLabel = formatMetricWithSuffix(exercise.intervalo, 's');
  const isCardPressEnabled = Boolean(onPress || onLongPress);
  const activeMediaUrl = exercise.videoUrl || exercise.gifUrl || '';
  const isGif = exercise.mediaType === 'gif' || isGifMediaUrl(activeMediaUrl);
  const statusColor =
    statusTone === 'warning'
      ? colors.warning
      : statusTone === 'success'
      ? colors.success
      : colors.textMuted;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { 
          backgroundColor: colors.card,
          borderColor: isActive ? colors.primary : 'transparent',
          borderWidth: isActive ? 2 : 0,
        },
        isCompleted && styles.completedContainer,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={!isCardPressEnabled && !onVideoPress}
      activeOpacity={isCardPressEnabled ? 0.7 : 1}
    >
      <View style={styles.content}>
        {showDragHandle && (
          <TouchableOpacity
            style={[styles.dragHandle, { backgroundColor: colors.surface }]}
            onPressIn={onDragHandlePressIn}
            disabled={!onDragHandlePressIn}
          >
            <Ionicons name="reorder-three-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
        <View
          style={[
            styles.indexBadge,
            { 
              backgroundColor: isCompleted 
                ? colors.success + '20' 
                : isActive 
                  ? colors.primary + '20' 
                  : colors.surface,
            },
          ]}
        >
          {isCompleted ? (
            <Ionicons name="checkmark" size={18} color={colors.success} />
          ) : (
            <Text
              style={[
                styles.indexText,
                { color: isActive ? colors.primary : colors.textSecondary },
              ]}
            >
              {index + 1}
            </Text>
          )}
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text
              style={[
                styles.name,
                { color: colors.text },
                isCompleted && styles.completedText,
              ]}
              numberOfLines={1}
            >
              {exercise.nome}
            </Text>
            {statusLabel ? (
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
                <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                  {statusLabel}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.details}>
            <View style={styles.detailItem}>
              <Ionicons name="repeat-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.detailText, { color: colors.textMuted }]}>
                {seriesLabel}
                {seriesLabel && repsLabel ? ' x ' : ''}
                {repsLabel}
              </Text>
            </View>
            {cargaLabel && (
              <View style={styles.detailItem}>
                <Ionicons name="barbell-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.detailText, { color: colors.textMuted }]}>
                  {cargaLabel}
                </Text>
              </View>
            )}
            {intervaloLabel && (
              <View style={styles.detailItem}>
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.detailText, { color: colors.textMuted }]}>
                  {intervaloLabel}
                </Text>
              </View>
            )}
          </View>
          {exercise.observacao && (
            <Text
              style={[styles.observation, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {exercise.observacao}
            </Text>
          )}
        </View>

        {showActions && (
          <View style={styles.actions}>
            {onEdit && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.surface }]}
                onPress={onEdit}
              >
                <Ionicons name="pencil-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.error + '15' }]}
                onPress={onDelete}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {!showActions && onPress && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.textMuted}
          />
        )}
      </View>

      {activeMediaUrl ? (
        <TouchableOpacity
          style={[styles.videoIndicator, { backgroundColor: colors.primary + '15' }]}
          onPress={onVideoPress}
          disabled={!onVideoPress}
          activeOpacity={onVideoPress ? 0.75 : 1}
        >
          <Ionicons
            name={isGif ? 'images-outline' : 'play-circle-outline'}
            size={14}
            color={colors.primary}
          />
          <Text style={[styles.videoText, { color: colors.primary }]}>{isGif ? 'GIF' : 'Video'}</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  completedContainer: {
    opacity: 0.7,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
  },
  indexBadge: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  dragHandle: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  indexText: {
    fontSize: 14,
    fontWeight: '600',
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  completedText: {
    textDecorationLine: 'line-through',
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailText: {
    fontSize: 12,
  },
  observation: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  videoText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
