import { Stack } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';

export default function ScheduleLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
