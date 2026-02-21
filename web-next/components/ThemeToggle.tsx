'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mh-theme';

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
  iconOnly?: boolean;
};

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <path d="M4.9 4.9l2.2 2.2" />
      <path d="M16.9 16.9l2.2 2.2" />
      <path d="M4.9 19.1l2.2-2.2" />
      <path d="M16.9 7.1l2.2-2.2" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5z" />
    </svg>
  );
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeToggle({ className, compact = false, iconOnly = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = stored === 'dark' || stored === 'light' ? stored : getSystemTheme();
    applyTheme(initial);
    setTheme(initial);
    setReady(true);
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    localStorage.setItem(STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      className={`theme-toggle-button${compact ? ' is-compact' : ''}${iconOnly ? ' is-icon-only' : ''}${
        className ? ` ${className}` : ''
      }`}
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo noturno'}
      title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo noturno'}
    >
      <span className="theme-toggle-icon" aria-hidden>
        {ready && theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </span>
      <span className="theme-toggle-label">{ready && theme === 'dark' ? 'Claro' : 'Noturno'}</span>
    </button>
  );
}
