import React from 'react';
import { View, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius, shadows } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padding?: 'none' | 'small' | 'medium' | 'large';
  shadow?: boolean;
}

export function Card({
  children,
  onPress,
  style,
  padding = 'medium',
  shadow = true,
}: CardProps) {
  const { colors } = useTheme();

  const getPadding = () => {
    switch (padding) {
      case 'none': return 0;
      case 'small': return spacing.sm;
      case 'medium': return spacing.base;
      case 'large': return spacing.xl;
      default: return spacing.base;
    }
  };

  const cardStyle = [
    styles.card,
    {
      backgroundColor: colors.card,
      padding: getPadding(),
    },
    shadow && shadows.md,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={cardStyle}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
});
