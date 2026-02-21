'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const navItems = [
  { href: '/app', label: 'Inicio', short: 'I' },
  { href: '/workouts', label: 'Treinos', short: 'T' },
  { href: '/students', label: 'Alunos', short: 'A' },
  { href: '/schedule', label: 'Agenda', short: 'G' },
  { href: '/profile', label: 'Perfil', short: 'P' },
];

const routeAliases: Record<string, string[]> = {
  '/app': ['/app'],
  '/workouts': ['/workouts', '/workout'],
  '/students': ['/students', '/student'],
  '/schedule': ['/schedule'],
  '/profile': ['/profile'],
};

function isNavRouteActive(pathname: string, href: string): boolean {
  const prefixes = routeAliases[href] ?? [href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function PersonalBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="personal-bottom-nav" aria-label="Navegacao principal do personal">
      {navItems.map((item) => {
        const isActive = isNavRouteActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx('personal-nav-link', { active: isActive })}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="personal-nav-icon">{item.short}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
