'use client';

import { useEffect } from 'react';

export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    const hostname = window.location.hostname;
    const isLocalhost =
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

    // Never keep service worker caches in local development/start sessions.
    if (process.env.NODE_ENV !== 'production' || isLocalhost) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      if ('caches' in window) {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
      }
      return;
    }

    navigator.serviceWorker.register('/sw.js?v=2').catch(() => {
      // Falha no registro nao deve quebrar a pagina.
    });
  }, []);

  return null;
}
