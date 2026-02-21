'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const isDesktopExeRuntime = () => {
  if (typeof window === 'undefined') return false;
  const globalWindow = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  const userAgent = window.navigator.userAgent || '';
  return Boolean(globalWindow.__TAURI__ || globalWindow.__TAURI_INTERNALS__) || /tauri/i.test(userAgent);
};

export default function DesktopExeLoginRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (!isDesktopExeRuntime()) return;
    router.replace('/login');
  }, [router]);

  return null;
}

