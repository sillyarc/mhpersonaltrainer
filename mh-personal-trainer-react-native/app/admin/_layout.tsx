import React from 'react';
import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="users" />
      <Stack.Screen name="manage-students" />
      <Stack.Screen name="students" />
      <Stack.Screen name="student/[id]" />
      <Stack.Screen name="exercises" />
      <Stack.Screen name="reports" />
    </Stack>
  );
}
