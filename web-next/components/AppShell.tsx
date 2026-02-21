'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import AppSidebar from '@/components/AppSidebar';
import ChatWidget from '@/components/ChatWidget';
import ToastCenter from '@/components/ToastCenter';
import StudentBottomNav from '@/components/StudentBottomNav';
import PersonalBottomNav from '@/components/PersonalBottomNav';
import AdminProfileCompletionSheet from '@/components/admin/AdminProfileCompletionSheet';

export default function AppShell({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const pathname = usePathname();
  const [isThemeDark, setIsThemeDark] = useState(false);
  const isStudent = role === 'aluno';
  const isPersonal = role === 'personal' || role === 'professor';
  const isAdmin = role === 'admin';
  const isAcademy = role === 'academy';
  const isAcademyMenuRoute =
    isAcademy &&
    (pathname === '/academy' ||
      pathname.startsWith('/academy/students') ||
      pathname.startsWith('/academy/personals') ||
      pathname.startsWith('/academy/agenda') ||
      pathname.startsWith('/academy/billing') ||
      pathname.startsWith('/academy/linking') ||
      pathname.startsWith('/academy/checkins') ||
      pathname.startsWith('/academy/access') ||
      pathname === '/support' ||
      pathname.startsWith('/support/') ||
      pathname === '/profile' ||
      pathname.startsWith('/profile/'));
  const useAcademyBlueShell = isAcademyMenuRoute && isThemeDark;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;

    const readTheme = () => {
      const datasetTheme = root.dataset.theme;
      if (datasetTheme === 'dark' || datasetTheme === 'light') {
        setIsThemeDark(datasetTheme === 'dark');
        return;
      }
      const storedTheme = localStorage.getItem('mh-theme');
      if (storedTheme === 'dark' || storedTheme === 'light') {
        setIsThemeDark(storedTheme === 'dark');
        return;
      }
      setIsThemeDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    };

    readTheme();

    const observer = new MutationObserver(() => readTheme());
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => {
      if (!localStorage.getItem('mh-theme')) {
        readTheme();
      }
    };
    media.addEventListener('change', handleMediaChange);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'mh-theme') {
        readTheme();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      observer.disconnect();
      media.removeEventListener('change', handleMediaChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  if (isStudent) {
    return (
      <div className="student-shell">
        <main id="main-content" className="student-content">
          {children}
        </main>
        <StudentBottomNav />
        <ToastCenter />
      </div>
    );
  }

  return (
    <div
      className={clsx('app-shell', {
        'app-shell-personal': isPersonal,
        'app-shell-academy-blue': useAcademyBlueShell,
      })}
    >
      <AppSidebar />
      <main
        id="main-content"
        className={clsx('app-content', {
          'app-content-personal': isPersonal,
          'app-content-academy-blue': useAcademyBlueShell,
        })}
      >
        {children}
      </main>
      {isPersonal ? <PersonalBottomNav /> : null}
      <ChatWidget />
      <ToastCenter />
      {isAdmin ? <AdminProfileCompletionSheet /> : null}
    </div>
  );
}
