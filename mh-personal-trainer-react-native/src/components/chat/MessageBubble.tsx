import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius } from '../../theme';

interface WorkoutData {
  nomeDaRotina: string;
  objetivoDaRotina: string;
  treino: string[];
}

interface FeedbackData {
  title: string;
  rating?: number;
  comment?: string;
  progresso?: string;
  dificuldade?: string;
  melhoria?: string;
  resposta?: string;
  tempoDoTreino?: number;
}

interface MessageBubbleProps {
  content: string;
  isUser: boolean;
  isAI?: boolean;
  timestamp?: Date;
  workoutData?: WorkoutData;
  feedbackData?: FeedbackData;
  reactions?: Record<string, string>;
  replyTo?: {
    senderName?: string;
    content: string;
  };
  action?: {
    label: string;
    route: string;
  };
  showReactionPicker?: boolean;
  reactionOptions?: string[];
  extraReactionOptions?: string[];
  showAllReactions?: boolean;
  onLongPress?: () => void;
  onReact?: (emoji: string) => void;
  onReply?: () => void;
  onShowMoreEmojis?: () => void;
}

const emoji = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

export function MessageBubble({
  content,
  isUser,
  isAI = false,
  timestamp,
  workoutData,
  feedbackData,
  reactions,
  replyTo,
  action,
  showReactionPicker = false,
  reactionOptions,
  extraReactionOptions,
  showAllReactions = false,
  onLongPress,
  onReact,
  onReply,
  onShowMoreEmojis,
}: MessageBubbleProps) {
  const { colors } = useTheme();

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (totalSeconds?: number) => {
    if (typeof totalSeconds !== 'number' || totalSeconds <= 0) return '';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const reactionEntries = React.useMemo(() => {
    if (!reactions) return [];
    const counts: Record<string, number> = {};
    Object.values(reactions).forEach((emoji) => {
      if (!emoji) return;
      counts[emoji] = (counts[emoji] || 0) + 1;
    });
    return Object.entries(counts);
  }, [reactions]);

  const emojiOptions =
    reactionOptions && reactionOptions.length > 0
      ? reactionOptions
      : [
          emoji(0x1f44d),
          emoji(0x2764, 0xfe0f),
          emoji(0x1f602),
          emoji(0x1f62e),
          emoji(0x1f622),
          emoji(0x1f64f),
        ];
  const extraEmojis =
    extraReactionOptions && extraReactionOptions.length > 0
      ? extraReactionOptions
      : [
          emoji(0x1f44f),
          emoji(0x1f525),
          emoji(0x1f389),
          emoji(0x1f60d),
          emoji(0x1f914),
          emoji(0x1f4aa),
          emoji(0x1f605),
          emoji(0x1f621),
          emoji(0x1f440),
          emoji(0x2705),
          emoji(0x274c),
          emoji(0x2b50),
        ];

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.otherContainer]}>
      {!isUser && isAI && (
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Ionicons name="sparkles" size={16} color="#fff" />
        </View>
      )}
      <View
        style={[
          styles.bubbleStack,
          isUser ? styles.bubbleStackUser : styles.bubbleStackOther,
          showReactionPicker ? styles.bubbleStackActive : null,
        ]}
      >
        {showReactionPicker && onReact ? (
          <View
            style={[
              styles.reactionWrapper,
              isUser ? styles.reactionWrapperUser : styles.reactionWrapperOther,
            ]}
          >
            <View
              style={[
                styles.reactionPicker,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              {emojiOptions.map((emoji, index) => (
                <TouchableOpacity
                  key={`${emoji}-${index}`}
                  onPress={() => onReact(emoji)}
                  style={styles.reactionOption}
                >
                  <Text style={[styles.reactionOptionText, { color: colors.text }]}>
                    {emoji}
                  </Text>
                </TouchableOpacity>
              ))}
              {onShowMoreEmojis ? (
                <TouchableOpacity onPress={onShowMoreEmojis} style={styles.reactionOption}>
                  <Text style={[styles.reactionOptionText, { color: colors.text }]}>+</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {showAllReactions ? (
              <View
                style={[
                  styles.reactionPicker,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {extraEmojis.map((emoji, index) => (
                  <TouchableOpacity
                    key={`${emoji}-${index}`}
                    onPress={() => onReact(emoji)}
                    style={styles.reactionOption}
                  >
                    <Text style={[styles.reactionOptionText, { color: colors.text }]}>
                      {emoji}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {onReply ? (
              <TouchableOpacity
                onPress={onReply}
                style={[
                  styles.replyAction,
                  isUser ? styles.replyActionUser : styles.replyActionOther,
                  { backgroundColor: colors.card },
                ]}
              >
                <Ionicons name="return-down-back" size={14} color={colors.text} />
                <Text style={[styles.replyActionText, { color: colors.text }]}>
                  Responder
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={200}
          style={[
            styles.bubble,
            isUser
              ? [styles.userBubble, { backgroundColor: colors.primary }]
              : [
                  styles.otherBubble,
                  { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                ],
          ]}
        >
          {replyTo ? (
            <View
              style={[
                styles.replyPreview,
                {
                  borderLeftColor: isUser ? 'rgba(255,255,255,0.45)' : colors.primary,
                  backgroundColor: isUser ? 'rgba(255,255,255,0.12)' : colors.surface,
                },
              ]}
            >
              <Text
                style={[
                  styles.replyAuthor,
                  { color: isUser ? '#fff' : colors.text },
                ]}
              >
                {replyTo.senderName || 'Mensagem'}
              </Text>
              <Text
                style={[
                  styles.replyText,
                  { color: isUser ? 'rgba(255,255,255,0.9)' : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {replyTo.content}
              </Text>
            </View>
          ) : null}
          <Text
            style={[
              styles.content,
              { color: isUser ? '#fff' : colors.text },
            ]}
          >
            {content}
          </Text>
          
          {workoutData && (
            <View style={[styles.workoutContainer, { borderTopColor: isUser ? 'rgba(255,255,255,0.2)' : colors.border }]}>
              <View style={styles.workoutHeader}>
                <Ionicons
                  name="fitness"
                  size={18}
                  color={isUser ? '#fff' : colors.primary}
                />
                <Text
                  style={[
                    styles.workoutTitle,
                    { color: isUser ? '#fff' : colors.text },
                  ]}
                >
                  {workoutData.nomeDaRotina}
                </Text>
              </View>
              {workoutData.objetivoDaRotina && (
                <Text
                  style={[
                    styles.workoutObjective,
                    { color: isUser ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
                  ]}
                >
                  {workoutData.objetivoDaRotina}
                </Text>
              )}
              <View style={styles.exerciseList}>
                {workoutData.treino.map((exercise, index) => (
                  <View key={index} style={styles.exerciseItem}>
                    <Text
                      style={[
                        styles.exerciseNumber,
                        { color: isUser ? 'rgba(255,255,255,0.6)' : colors.textMuted },
                      ]}
                    >
                      {index + 1}.
                    </Text>
                    <Text
                      style={[
                        styles.exerciseText,
                        { color: isUser ? '#fff' : colors.text },
                      ]}
                    >
                      {exercise}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {feedbackData && (
            <View style={[styles.feedbackContainer, { borderTopColor: isUser ? 'rgba(255,255,255,0.2)' : colors.border }]}>
              <View style={styles.feedbackHeader}>
                <Ionicons
                  name="chatbubble-ellipses"
                  size={18}
                  color={isUser ? '#fff' : colors.primary}
                />
                <Text
                  style={[
                    styles.feedbackTitle,
                    { color: isUser ? '#fff' : colors.text },
                  ]}
                >
                  {feedbackData.title}
                </Text>
              </View>
              {typeof feedbackData.rating === 'number' && (
                <Text
                  style={[
                    styles.feedbackLine,
                    { color: isUser ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
                  ]}
                >
                  Nota: {feedbackData.rating}/5
                </Text>
              )}
              {typeof feedbackData.tempoDoTreino === 'number' && feedbackData.tempoDoTreino > 0 ? (
                <Text
                  style={[
                    styles.feedbackLine,
                    { color: isUser ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
                  ]}
                >
                  Tempo do treino: {formatDuration(feedbackData.tempoDoTreino)}
                </Text>
              ) : null}
              {feedbackData.comment ? (
                <Text
                  style={[
                    styles.feedbackLine,
                    { color: isUser ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
                  ]}
                >
                  Comentario: {feedbackData.comment}
                </Text>
              ) : null}
              {feedbackData.progresso ? (
                <Text
                  style={[
                    styles.feedbackLine,
                    { color: isUser ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
                  ]}
                >
                  Progresso: {feedbackData.progresso}
                </Text>
              ) : null}
              {feedbackData.dificuldade ? (
                <Text
                  style={[
                    styles.feedbackLine,
                    { color: isUser ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
                  ]}
                >
                  Dificuldade: {feedbackData.dificuldade}
                </Text>
              ) : null}
              {feedbackData.melhoria ? (
                <Text
                  style={[
                    styles.feedbackLine,
                    { color: isUser ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
                  ]}
                >
                  Melhoria: {feedbackData.melhoria}
                </Text>
              ) : null}
              {feedbackData.resposta ? (
                <Text
                  style={[
                    styles.feedbackLine,
                    { color: isUser ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
                  ]}
                >
                  Resposta: {feedbackData.resposta}
                </Text>
              ) : null}
            </View>
          )}

          {action ? (
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  borderColor: isUser ? 'rgba(255,255,255,0.4)' : colors.primary,
                },
              ]}
              onPress={() => router.push(action.route as any)}
            >
              <Ionicons
                name="arrow-forward"
                size={16}
                color={isUser ? '#fff' : colors.primary}
              />
              <Text
                style={[
                  styles.actionText,
                  { color: isUser ? '#fff' : colors.primary },
                ]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ) : null}
          
          {timestamp && (
            <Text
              style={[
                styles.timestamp,
                { color: isUser ? 'rgba(255,255,255,0.6)' : colors.textMuted },
              ]}
            >
              {formatTime(timestamp)}
            </Text>
          )}
        </Pressable>
        {reactionEntries.length > 0 ? (
          <View
            style={[
              styles.reactionSummary,
              isUser ? styles.reactionSummaryUser : styles.reactionSummaryOther,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {reactionEntries.map(([emoji, count], index) => (
              <Text key={`${emoji}-${index}`} style={[styles.reactionText, { color: colors.text }]}>
                {emoji}
                {count > 1 ? ` ${count}` : ''}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.base,
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  otherContainer: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    alignSelf: 'flex-end',
  },
  bubble: {
    maxWidth: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  userBubble: {
    borderBottomRightRadius: borderRadius.sm,
  },
  otherBubble: {
    borderBottomLeftRadius: borderRadius.sm,
  },
  content: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleStack: {
    flexShrink: 1,
    maxWidth: '80%',
  },
  bubbleStackUser: {
    alignItems: 'flex-end',
  },
  bubbleStackOther: {
    alignItems: 'flex-start',
  },
  bubbleStackActive: {
    zIndex: 3,
    elevation: 3,
  },
  reactionWrapper: {
    alignItems: 'flex-start',
  },
  reactionWrapperUser: {
    alignItems: 'flex-end',
  },
  reactionWrapperOther: {
    alignItems: 'flex-start',
  },
  reactionPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  replyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  replyActionUser: {
    alignSelf: 'flex-end',
  },
  replyActionOther: {
    alignSelf: 'flex-start',
  },
  replyActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reactionOption: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  reactionOptionText: {
    fontSize: 18,
    fontFamily: Platform.OS === 'android' ? 'sans-serif' : undefined,
  },
  reactionSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  reactionSummaryUser: {
    alignSelf: 'flex-end',
  },
  reactionSummaryOther: {
    alignSelf: 'flex-start',
  },
  reactionText: {
    fontSize: 12,
    marginRight: spacing.xs,
  },
  replyPreview: {
    borderLeftWidth: 3,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  replyAuthor: {
    fontSize: 12,
    fontWeight: '600',
  },
  replyText: {
    fontSize: 12,
    marginTop: 2,
  },
  timestamp: {
    fontSize: 11,
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
  },
  workoutContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  feedbackContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  feedbackTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: spacing.sm,
    flex: 1,
  },
  feedbackLine: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  actionButton: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  workoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  workoutTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  workoutObjective: {
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  exerciseList: {
    marginTop: spacing.xs,
  },
  exerciseItem: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  exerciseNumber: {
    fontSize: 13,
    width: 20,
  },
  exerciseText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});
