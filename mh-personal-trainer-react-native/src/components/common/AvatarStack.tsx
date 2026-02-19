import React from 'react';
import { View, Text, StyleSheet, Image, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

type AvatarSize = 'small' | 'medium' | 'large' | 'xlarge';

interface AvatarStackProps {
  primarySource?: string;
  primaryName?: string;
  secondarySource?: string;
  secondaryName?: string;
  size?: AvatarSize;
  sizePx?: number;
}

const getSize = (size?: AvatarSize) => {
  switch (size) {
    case 'small':
      return 32;
    case 'medium':
      return 48;
    case 'large':
      return 72;
    case 'xlarge':
      return 120;
    default:
      return 48;
  }
};

const getInitials = (name?: string) => {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name[0].toUpperCase();
};

export function AvatarStack({
  primarySource,
  primaryName,
  secondarySource,
  secondaryName,
  size = 'medium',
  sizePx,
}: AvatarStackProps) {
  const { colors } = useTheme();
  const baseSize = sizePx ?? getSize(size);
  const overlaySize = Math.round(baseSize * 0.55);
  const overlayOffset = Math.max(2, Math.round(baseSize * 0.06));
  const baseFontSize = Math.max(10, Math.round(baseSize * 0.38));
  const overlayFontSize = Math.max(8, Math.round(overlaySize * 0.42));
  const showSecondary = Boolean(secondarySource || secondaryName);

  const renderAvatar = ({
    source,
    name,
    sizeValue,
    fontSize,
    borderColor,
    borderWidth,
    style,
  }: {
    source?: string;
    name?: string;
    sizeValue: number;
    fontSize: number;
    borderColor: string;
    borderWidth: number;
    style?: StyleProp<ViewStyle>;
  }) => (
    <View
      style={[
        styles.avatar,
        {
          width: sizeValue,
          height: sizeValue,
          borderRadius: sizeValue / 2,
          borderColor,
          borderWidth,
          backgroundColor: colors.primary,
        },
        style,
      ]}
    >
      {source ? (
        <Image source={{ uri: source }} style={[styles.image, { borderRadius: sizeValue / 2 }]} />
      ) : (
        <Text style={[styles.initials, { fontSize }]}>{getInitials(name)}</Text>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { width: baseSize + overlayOffset, height: baseSize + overlayOffset }]}>
      {renderAvatar({
        source: primarySource,
        name: primaryName,
        sizeValue: baseSize,
        fontSize: baseFontSize,
        borderColor: colors.border,
        borderWidth: 1,
        style: styles.base,
      })}
      {showSecondary
        ? renderAvatar({
            source: secondarySource,
            name: secondaryName,
            sizeValue: overlaySize,
            fontSize: overlayFontSize,
            borderColor: colors.primaryBackground,
            borderWidth: 2,
            style: [
              styles.overlay,
              {
                right: -overlayOffset,
                bottom: -overlayOffset,
              },
            ],
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  avatar: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initials: {
    fontWeight: '600',
    color: '#ffffff',
  },
  base: {
    zIndex: 1,
  },
  overlay: {
    position: 'absolute',
    zIndex: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
  },
});
