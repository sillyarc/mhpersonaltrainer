import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius, shadows } from '../../theme';
import { 
  PhysicalEvaluation, 
  EvaluationType,
  EvaluationStatus,
} from '../../types/evaluation';
import { 
  getEvaluationTypeLabel, 
  getEvaluationStatusLabel,
  getEvaluationStatusColor,
} from '../../services/evaluations';

interface EvaluationCardProps {
  evaluation: PhysicalEvaluation;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
}

export function EvaluationCard({
  evaluation,
  onPress,
  onEdit,
  onDelete,
  showActions = false,
}: EvaluationCardProps) {
  const { colors } = useTheme();

  const getTypeIcon = (type: EvaluationType): keyof typeof Ionicons.glyphMap => {
    const icons: Record<EvaluationType, keyof typeof Ionicons.glyphMap> = {
      online: 'globe-outline',
      personalizada: 'clipboard-outline',
      postural: 'body-outline',
      fisica: 'fitness-outline',
    };
    return icons[type] || 'document-outline';
  };

  const getTypeColor = (type: EvaluationType): string => {
    const typeColors: Record<EvaluationType, string> = {
      online: '#4361ee',
      personalizada: '#7209b7',
      postural: '#06d6a0',
      fisica: '#f72585',
    };
    return typeColors[type] || colors.primary;
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  };

  const typeColor = getTypeColor(evaluation.type);
  const statusColor = getEvaluationStatusColor(evaluation.status);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: colors.card },
        shadows.md,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: typeColor + '20' }]}>
          <Ionicons
            name={getTypeIcon(evaluation.type)}
            size={24}
            color={typeColor}
          />
        </View>
        
        <View style={styles.info}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              Avaliacao {getEvaluationTypeLabel(evaluation.type)}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {getEvaluationStatusLabel(evaluation.status)}
              </Text>
            </View>
          </View>
          
          <View style={styles.meta}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {formatDate(evaluation.date)}
              </Text>
            </View>
            
            {evaluation.personalId && (
              <View style={styles.metaItem}>
                <Ionicons name="person-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  Personal
                </Text>
              </View>
            )}
          </View>
        </View>
        
        {showActions ? (
          <View style={styles.actions}>
            {onEdit && (
              <TouchableOpacity 
                style={[styles.actionButton, { backgroundColor: colors.primary + '20' }]}
                onPress={onEdit}
              >
                <Ionicons name="pencil" size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity 
                style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
                onPress={onDelete}
              >
                <Ionicons name="trash" size={18} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginLeft: spacing.sm,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: 12,
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
});
