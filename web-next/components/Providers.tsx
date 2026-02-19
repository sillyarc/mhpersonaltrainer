'use client';

import { AuthProvider } from '@/lib/auth';
import type { ReactNode } from 'react';
import AppErrorReporter from '@/components/AppErrorReporter';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <AppErrorReporter />
    </AuthProvider>
  );
}
