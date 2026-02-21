'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const navItems = [
  { href: '/app', label: 'Inicio', short: 'I' },
  { href: '/workouts', label: 'Treinos', short: 'T' },
  { href: '/evaluations', label: 'Avaliacoes', short: 'A' },
  { href: '/chat', label: 'Chat', short: 'C' },
  { href: '/profile', label: 'Perfil', short: 'R' },
];

const routeAliases: Record<string, string[]> = {
  '/app': ['/app'],
  '/workouts': ['/workouts', '/workout'],
  '/evaluations': ['/evaluations', '/evaluation'],
  '/chat': ['/chat'],
  '/profile': ['/profile'],
};

function isNavRouteActive(pathname: string, href: string): boolean {
  const prefixes = routeAliases[href] ?? [href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function StudentBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="student-bottom-nav">
      {navItems.map((item) => {
        const isActive = isNavRouteActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx('student-nav-link', { active: isActive })}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="student-nav-icon">{item.short}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
