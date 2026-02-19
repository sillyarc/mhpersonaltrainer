import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useAuthStore } from '../../src/store/authStore';

const hasValidPersonalCode = (code?: string | number | null) => {
  if (code === null || code === undefined) return false;
  if (typeof code === 'number') return code > 0;
  if (typeof code === 'string') {
    const trimmed = code.trim();
    return trimmed.length > 0 && trimmed !== '0';
  }
  return false;
};

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isDesktop } = useResponsive();
  const { user, role } = useAuthStore();
  const isAluno = role === 'aluno' || (!!user && !user.admin && !user.professorAccount);
  const isAlunoWithoutPersonal = isAluno && !hasValidPersonalCode(user?.codigoPersonal);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneContainerStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.secondaryText,
        tabBarStyle: {
          backgroundColor: colors.secondaryBackground,
          borderTopWidth: 0,
          height: isDesktop ? 76 : 64,
          paddingBottom: isDesktop ? 14 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: isDesktop ? 13 : 11,
          fontWeight: '600',
        },
        tabBarItemStyle: {
          marginHorizontal: 4,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('navigation.home'),
          tabBarIcon: ({ color, size, focused }) => (
            <IconBubble icon="home-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: t('navigation.workouts'),
          tabBarIcon: ({ color, size, focused }) => (
            <IconBubble icon="barbell-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: 'Nutri',
          href: isAlunoWithoutPersonal ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <IconBubble icon="restaurant-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="evaluations"
        options={{
          title: t('navigation.evaluations'),
          href: isAlunoWithoutPersonal ? null : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <IconBubble icon="clipboard-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('navigation.chat'),
          href: isAlunoWithoutPersonal ? null : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <IconBubble icon="chatbubbles-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('navigation.profile'),
          tabBarIcon: ({ color, size, focused }) => (
            <IconBubble icon="person-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="students"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

function IconBubble({
  icon,
  color,
  size,
  focused,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  size: number;
  focused: boolean;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        width: 40,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.primary + '1A' : 'transparent',
      }}
    >
      <Ionicons name={icon} size={focused ? size + 2 : size} color={color} />
    </View>
  );
}
