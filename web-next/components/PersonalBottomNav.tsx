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

export default function PersonalBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="personal-bottom-nav" aria-label="Navegacao principal do personal">
      {navItems.map((item) => {
        const isActive = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href));
        return (
          <Link key={item.href} href={item.href} className={clsx('personal-nav-link', { active: isActive })}>
            <span className="personal-nav-icon">{item.short}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
