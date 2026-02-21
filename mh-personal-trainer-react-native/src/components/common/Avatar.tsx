import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

interface AvatarProps {
  source?: string;
  name?: string;
  size?: 'small' | 'medium' | 'large' | 'xlarge';
}

export function Avatar({ source, name, size = 'medium' }: AvatarProps) {
  const { colors } = useTheme();

  const getSize = () => {
    switch (size) {
      case 'small': return 32;
      case 'medium': return 48;
      case 'large': return 72;
      case 'xlarge': return 120;
      default: return 48;
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'small': return 12;
      case 'medium': return 18;
      case 'large': return 28;
      case 'xlarge': return 44;
      default: return 18;
    }
  };

  const avatarSize = getSize();
  const fontSize = getFontSize();

  const getInitials = () => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name[0].toUpperCase();
  };

  if (source) {
    return (
      <Image
        source={{ uri: source }}
        style={[
          styles.avatar,
          { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatar,
        styles.placeholder,
        {
          width: avatarSize,
          height: avatarSize,
          borderRadius: avatarSize / 2,
          backgroundColor: colors.primary,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize, color: '#ffffff' }]}>
        {getInitials()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: 'hidden',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '600',
  },
});
