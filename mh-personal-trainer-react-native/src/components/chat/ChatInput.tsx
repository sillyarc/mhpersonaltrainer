import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius } from '../../theme';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  replyTo?: {
    senderName?: string;
    content: string;
  } | null;
  onCancelReply?: () => void;
}

export function ChatInput({
  onSend,
  disabled = false,
  loading = false,
  placeholder = 'Digite sua mensagem...',
  replyTo,
  onCancelReply,
}: ChatInputProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');

  const handleSend = () => {
    const trimmed = message.trim();
    if (trimmed && !disabled && !loading) {
      onSend(trimmed);
      setMessage('');
    }
  };

  const canSend = message.trim().length > 0 && !disabled && !loading;

  const bottomPadding =
    Platform.OS === 'ios' ? Math.max(insets.bottom, spacing.sm) : 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: bottomPadding,
        },
      ]}
    >
      {replyTo ? (
        <View style={[styles.replyContainer, { backgroundColor: colors.card }]}>
          <View style={[styles.replyBar, { backgroundColor: colors.primary }]} />
          <View style={styles.replyText}>
            <Text style={[styles.replyTitle, { color: colors.text }]}>
              Respondendo a {replyTo.senderName || 'Mensagem'}
            </Text>
            <Text style={[styles.replyContent, { color: colors.textSecondary }]} numberOfLines={1}>
              {replyTo.content}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.replyClose}
            onPress={onCancelReply}
            hitSlop={8}
          >
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={message}
          onChangeText={setMessage}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
          editable={!disabled}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: canSend ? colors.primary : colors.textMuted },
          ]}
          onPress={handleSend}
          disabled={!canSend}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
  },
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  replyBar: {
    width: 3,
    height: '100%',
    borderRadius: borderRadius.full,
  },
  replyText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  replyTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  replyContent: {
    fontSize: 12,
    marginTop: 2,
  },
  replyClose: {
    padding: spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: 0,
    minHeight: 44,
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 100,
    paddingVertical: spacing.xs,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
});
