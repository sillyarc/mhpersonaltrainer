import { Stack } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';

export default function NotificationsLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.primaryBackground },
      }}
    />
  );
}
