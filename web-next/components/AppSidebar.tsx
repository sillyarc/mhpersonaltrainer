'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth';
import ThemeToggle from '@/components/ThemeToggle';
import { useAiAccessStatus } from '@/lib/hooks/useAiAccessStatus';
import type { UserRole } from '@/lib/types/user';

type SidebarItem = {
  href: string;
  label: string;
  premium?: boolean;
};

type SidebarSection = {
  title: string;
  items: SidebarItem[];
};

const sidebarRouteAliases: Record<string, string[]> = {
  '/app': ['/app'],
  '/workouts': ['/workouts', '/workout'],
  '/students': ['/students', '/student'],
  '/schedule': ['/schedule'],
  '/evaluations': ['/evaluations', '/evaluation'],
  '/documents': ['/documents', '/document'],
  '/financeiro': ['/financeiro'],
  '/notifications': ['/notifications'],
  '/chat': ['/chat'],
  '/profile': ['/profile'],
  '/support': ['/support'],
  '/academy': ['/academy'],
  '/academy/students': ['/academy/students'],
  '/academy/personals': ['/academy/personals'],
  '/academy/agenda': ['/academy/agenda'],
  '/academy/billing': ['/academy/billing'],
  '/academy/linking': ['/academy/linking'],
  '/academy/checkins': ['/academy/checkins'],
  '/academy/access': ['/academy/access'],
  '/academy/registrar-entrada': ['/academy/registrar-entrada'],
  '/academy/ai': ['/academy/ai'],
  '/admin': ['/admin'],
  '/admin/users': ['/admin/users'],
  '/admin/support': ['/admin/support'],
  '/admin/instagram': ['/admin/instagram'],
  '/admin/emails': ['/admin/emails'],
  '/notifications/admin': ['/notifications/admin'],
  '/admin/treinors': ['/admin/treinors'],
};

function matchesSidebarRoute(pathname: string, href: string): boolean {
  const prefixes = sidebarRouteAliases[href] ?? [href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const personalSections: SidebarSection[] = [
  {
    title: 'Principal',
    items: [
      { href: '/app', label: 'Dashboard' },
      { href: '/workouts', label: 'Treinos' },
      { href: '/students', label: 'Alunos' },
      { href: '/profile', label: 'Perfil' },
    ],
  },
  {
    title: 'Gestao',
    items: [
      { href: '/schedule', label: 'Agenda' },
      { href: '/evaluations', label: 'Avaliacoes' },
      { href: '/documents', label: 'Documentos' },
      { href: '/financeiro', label: 'Financeiro' },
      { href: '/notifications', label: 'Notificacoes' },
    ],
  },
  {
    title: 'IA + Extra',
    items: [
      { href: '/ai', label: 'MH Assistente', premium: true },
      { href: '/ai/assistant', label: 'Assistente' },
      { href: '/ai/image-analysis', label: 'Analise de imagem', premium: true },
      { href: '/support', label: 'Suporte' },
    ],
  },
];

const academySections: SidebarSection[] = [
  {
    title: 'Academia',
    items: [
      { href: '/academy', label: 'Painel' },
      { href: '/academy/students', label: 'Alunos' },
      { href: '/academy/personals', label: 'Personais' },
      { href: '/academy/ai', label: 'IA', premium: true },
      { href: '/academy/agenda', label: 'Agenda' },
      { href: '/academy/billing', label: 'Faturas' },
    ],
  },
  {
    title: 'Vinculos',
    items: [{ href: '/academy/linking', label: 'Vincular' }],
  },
  {
    title: 'Controle',
    items: [
      { href: '/academy/registrar-entrada', label: 'Registrar entrada' },
      { href: '/academy/checkins', label: 'Historico de entradas' },
      { href: '/academy/access', label: 'Credenciais' },
    ],
  },
  {
    title: 'Suporte',
    items: [{ href: '/support', label: 'Suporte' }],
  },
  {
    title: 'Conta',
    items: [{ href: '/profile', label: 'Perfil' }],
  },
];

const studentSections: SidebarSection[] = [
  {
    title: 'Aluno',
    items: [
      { href: '/app', label: 'Inicio' },
      { href: '/workouts', label: 'Treinos' },
      { href: '/evaluations', label: 'Avaliacoes' },
      { href: '/progress', label: 'Progresso' },
      { href: '/chat', label: 'Chat' },
      { href: '/financeiro', label: 'Financeiro' },
      { href: '/documents/aluno', label: 'Arquivos' },
      { href: '/profile', label: 'Perfil' },
    ],
  },
];

const adminSections: SidebarSection[] = [
  {
    title: 'Admin',
    items: [
      { href: '/admin', label: 'Resumo' },
      { href: '/admin/users', label: 'Usuarios' },
      { href: '/admin/support', label: 'Suporte' },
      { href: '/admin/instagram', label: 'Posts Instagram (IA)' },
      { href: '/admin/emails', label: 'Emails do dominio' },
      { href: '/notifications/admin', label: 'Notificacoes no app', premium: true },
      { href: '/admin/treinors', label: 'Colecao de Treinos' },
    ],
  },
];

function SidebarPremiumStar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.6l2.7 5.6 6.2.9-4.5 4.4 1 6.2L12 16.8 6.6 19.7l1-6.2L3 9.1l6.2-.9L12 2.6z" />
    </svg>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();
  const { user, role: rawRole, logout } = useAuth();
  const aiAccess = useAiAccessStatus();
  const role = rawRole as UserRole | null;
  const displayName = user?.displayName || user?.email || 'Usuario';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U';
  const roleLabelMap: Record<string, string> = {
    admin: 'Admin',
    professor: 'Professor',
    personal: 'Personal',
    academy: 'Academia',
    aluno: 'Aluno',
  };
  const roleLabel = role ? roleLabelMap[role] || role : 'Perfil';
  const showPersonalCode = role === 'personal' || role === 'professor';
  const personalCodeValue = (() => {
    const value = user?.codigoPersonal === undefined || user?.codigoPersonal === null ? '' : String(user.codigoPersonal).trim();
    return value && value !== '0' ? value : '';
  })();
  const personalCodeLabel = personalCodeValue || '--';

  const premiumStatus = String(
    (user as any)?.stripeSubscriptionStatus ||
      (user as any)?.subscriptionStatus ||
      (user as any)?.statusAssinatura ||
      (user as any)?.assinaturaStatus ||
      ''
  )
    .trim()
    .toLowerCase();
  const hasPremium = Boolean(
    user?.assinatura ||
      user?.planoChatGPT ||
      premiumStatus === 'active' ||
      premiumStatus === 'trialing' ||
      premiumStatus === 'past_due'
  );
  const showMiniAiStatus = role === 'personal' || role === 'professor' || role === 'academy';
  const aiStatusHref = role === 'academy' ? '/academy/billing' : '/profile/subscription';
  const miniAiLabel = aiAccess.premium ? 'Premium' : 'IA';
  const miniAiValue = aiAccess.premium
    ? 'PRO'
    : aiAccess.loading
    ? '...'
    : `${Math.max(0, aiAccess.remaining ?? 0)}/${aiAccess.dailyLimit}`;

  const isAdmin = role === ('admin' as UserRole);
  const isAcademy = role === ('academy' as UserRole);
  const isStudent = role === ('aluno' as UserRole);
  const visibleSections = isAdmin
    ? adminSections
    : isAcademy
    ? academySections
    : isStudent
    ? studentSections
    : personalSections;

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-brand-row">
          <Link href="/" className="sidebar-brand">
            <span className="sidebar-brand-mark">MH</span>
            <span className="sidebar-brand-text">Personal</span>
          </Link>
          {showMiniAiStatus ? (
            <Link
              href={aiStatusHref}
              className={clsx('sidebar-brand-ai-mini', {
                'is-premium': hasPremium || aiAccess.premium,
              })}
              title={
                aiAccess.premium
                  ? 'Plano Premium: IA ilimitada'
                  : aiAccess.loading
                  ? 'Atualizando creditos de IA'
                  : `${Math.max(0, aiAccess.remaining ?? 0)} creditos de IA restantes hoje`
              }
              aria-label="Abrir assinatura e creditos de IA"
            >
              <span className="sidebar-brand-ai-mini-icon">
                <SidebarPremiumStar />
              </span>
              <span className="sidebar-brand-ai-mini-label">{miniAiLabel}</span>
              <span className="sidebar-brand-ai-mini-value">{miniAiValue}</span>
            </Link>
          ) : null}
        </div>
        <span className="sidebar-brand-subtitle">Portal web</span>
        {isAcademy && (
          <div className="sidebar-beta">
            <span className="sidebar-beta-pill">Beta</span>
            <span>Portal da academia</span>
          </div>
        )}
      </div>
      <div className="sidebar-user">
        <div className="sidebar-avatar">
          {user?.photoUrl ? <img src={user.photoUrl} alt={displayName} /> : <span>{initial}</span>}
        </div>
        <div className="sidebar-user-meta">
          <p>{displayName}</p>
          <span>Perfil: {roleLabel}</span>
          {showPersonalCode && <span>Codigo: {personalCodeLabel}</span>}
        </div>
      </div>
      <div className="sidebar-nav">
        {visibleSections.map((section) => (
          <div key={section.title} className="sidebar-section">
            <p className="sidebar-title">{section.title}</p>
            <nav>
              {section.items.map((item) => {
                const isAiPremiumItem =
                  Boolean(item.premium) &&
                  (item.href === '/ai' ||
                    item.href.startsWith('/ai/') ||
                    item.href === '/academy/ai');
                if (isAiPremiumItem && !hasPremium) return null;
                const isActive = matchesSidebarRoute(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx('sidebar-link', { active: isActive })}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span>{item.label}</span>
                    {item.premium && !hasPremium ? (
                      <span className="sidebar-link-premium" title="Recurso premium">
                        <SidebarPremiumStar />
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
      <div className="sidebar-actions">
        <button className="button ghost sidebar-logout" type="button" onClick={() => logout()}>
          Sair
        </button>
        <ThemeToggle compact iconOnly className="sidebar-theme-toggle" />
      </div>
      <div className="sidebar-footer">
        <span>Versao 8.9.42+111</span>
        <span>Desenvolvido por Nagazaki Software</span>
      </div>
    </aside>
  );
}
