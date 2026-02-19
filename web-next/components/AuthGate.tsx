'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, role, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [studentViewportAllowed, setStudentViewportAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      const redirect = pathname ? `?redirect=${encodeURIComponent(pathname)}` : '';
      const loginPath = pathname?.startsWith('/academy') ? '/academy-login' : '/login';
      router.replace(`${loginPath}${redirect}`);
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  useEffect(() => {
    const updateViewport = () => {
      if (typeof window === 'undefined') return;
      setStudentViewportAllowed(window.innerWidth < 1000);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="container" style={{ padding: '80px 0' }}>
        <div className="card">
          <h2>Carregando...</h2>
          <p className="subtle" style={{ marginTop: 8 }}>
            Preparando seu painel.
          </p>
        </div>
      </div>
    );
  }

  if (role === 'aluno') {
    if (studentViewportAllowed === null) {
      return (
        <div className="container" style={{ padding: '80px 0' }}>
          <div className="card">
            <h2>Carregando...</h2>
            <p className="subtle" style={{ marginTop: 8 }}>
              Verificando dispositivo.
            </p>
          </div>
        </div>
      );
    }
    if (!studentViewportAllowed) {
      return (
        <div className="container" style={{ padding: '80px 0' }}>
          <div className="card">
            <h2>Acesso do aluno apenas no celular</h2>
            <p className="subtle" style={{ marginTop: 8 }}>
              Abra este painel em um dispositivo com largura menor que 1000px.
            </p>
            <button className="button" type="button" onClick={() => logout()} style={{ marginTop: 16 }}>
              Sair
            </button>
          </div>
        </div>
      );
    }
    return (
      <>{children}</>
    );
  }

  return <>{children}</>;
}
