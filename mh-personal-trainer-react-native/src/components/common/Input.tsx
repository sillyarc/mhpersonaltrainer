import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius } from '../../theme';

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'decimal-pad' | 'numbers-and-punctuation';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  numberOfLines?: number;
  autoGrow?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  onBlur?: () => void;
  onFocus?: () => void;
  onPressIn?: () => void;
}

export function Input({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  multiline = false,
  numberOfLines = 1,
  autoGrow = false,
  disabled = false,
  readOnly = false,
  icon,
  style,
  inputStyle,
  onBlur,
  onFocus,
  onPressIn,
}: InputProps) {
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const minMultilineHeight = useMemo(() => Math.max(1, numberOfLines) * 24, [numberOfLines]);
  const [multilineHeight, setMultilineHeight] = useState(minMultilineHeight);

  useEffect(() => {
    if (multiline && autoGrow) {
      setMultilineHeight(minMultilineHeight);
    }
  }, [autoGrow, minMultilineHeight, multiline]);

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
  };

  const getBorderColor = () => {
    if (error) return colors.error;
    if (isFocused) return colors.primary;
    return colors.border;
  };

  const handleContentSizeChange = (
    event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>
  ) => {
    if (!multiline || !autoGrow) return;
    const contentHeight = Math.ceil(event.nativeEvent.contentSize.height);
    if (!Number.isFinite(contentHeight) || contentHeight <= 0) return;
    setMultilineHeight(Math.max(minMultilineHeight, contentHeight + spacing.sm));
  };

  return (
    <View style={[styles.container, style]}>
      {label && (
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      )}
      <View
        style={[
          styles.inputContainer,
          {
            borderColor: getBorderColor(),
            backgroundColor: colors.surface,
            alignItems: multiline ? 'flex-start' : 'center',
          },
          disabled && styles.disabled,
        ]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={colors.textSecondary}
            style={styles.icon}
          />
        )}
        <TextInput
          style={[
            styles.input,
            { color: colors.text },
            multiline && {
              minHeight: minMultilineHeight,
              height: autoGrow ? multilineHeight : minMultilineHeight,
              textAlignVertical: 'top',
            },
            inputStyle,
          ]}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry && !showPassword}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          numberOfLines={numberOfLines}
          onContentSizeChange={handleContentSizeChange}
          editable={!disabled && !readOnly}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPressIn={onPressIn}
        />
        {secureTextEntry && (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeIcon}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
      {error && (
        <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.base,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  eyeIcon: {
    padding: spacing.sm,
  },
  error: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  disabled: {
    opacity: 0.6,
  },
});
