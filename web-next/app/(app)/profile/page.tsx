'use client';

import { useEffect, useState } from 'react';
import PageShell from '@/components/PageShell';
import UserScopePicker from '@/components/data/UserScopePicker';
import ProfileEditBottomSheet from '@/components/profile/ProfileEditBottomSheet';
import { formatDate, useDocumentData, useUserScope } from '@/lib/firestoreHooks';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

const IconChevron = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

const IconStar = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M12 3l2.8 5.8 6.2.9-4.5 4.3 1 6.1L12 17l-5.5 3.1 1-6.1L3 9.7l6.2-.9L12 3z" />
  </svg>
);

const IconUser = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <circle cx="12" cy="8" r="4" />
    <path d="M20 20a8 8 0 10-16 0" />
  </svg>
);

const IconBell = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
    <path d="M13.7 21a2 2 0 01-3.4 0" />
  </svg>
);

const IconCard = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 9h18" />
  </svg>
);

const IconKey = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <circle cx="8" cy="14" r="3" />
    <path d="M11 14h10m0 0v-3m0 3v3" />
  </svg>
);

const IconGlobe = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 010 18" />
    <path d="M12 3a15 15 0 000 18" />
  </svg>
);

const IconHelp = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 115 0c0 2-2.5 2-2.5 4" />
    <path d="M12 17h.01" />
  </svg>
);

const IconDoc = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v5h5" />
  </svg>
);

const IconShield = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3z" />
  </svg>
);

const IconLogout = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
    <path d="M12 19H5a2 2 0 01-2-2V7a2 2 0 012-2h7" />
  </svg>
);

export default function ProfilePage() {
  const { user, role, logout } = useAuth();
  const { userId } = useUserScope();
  const { data } = useDocumentData<any>(['users', userId]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedSheet = searchParams.get('sheet');
  const [professionalSheetOpen, setProfessionalSheetOpen] = useState(false);

  const toText = (value: unknown, fallback = '-') => {
    if (value === undefined || value === null) return fallback;
    const text = String(value).trim();
    return text ? text : fallback;
  };

  const displayName = data?.display_name || data?.displayName || user?.displayName || 'Sem nome';
  const email = data?.email || user?.email || 'Sem email';
  const avatarLabel = displayName.trim().charAt(0).toUpperCase() || 'U';
  const avatarUrl = data?.photo_url || data?.photoUrl || user?.photoUrl;
  const phone = toText(data?.phone_number || data?.phoneNumber || user?.phoneNumber);
  const bio = toText(data?.bio || user?.bio, 'Sem bio.');
  const city = data?.cidade || data?.city || user?.cidade || '';
  const state = data?.estado || data?.uf || data?.state || user?.estado || '';
  const locationLabel = toText([city, state].filter(Boolean).join(' / '));
  const objective = toText(data?.objetivoNoApp || user?.objetivoNoApp);
  const experience = toText(data?.experiencia || data?.expericencia || user?.experiencia);
  const equipment = toText(data?.equipamento || user?.equipamento);
  const sessionTime = toText(data?.tempoPorSessao || user?.tempoPorSessao);
  const trainingDays = toText(data?.diasDeTreino || user?.diasDeTreino);
  const limitation = toText(data?.limitacao || user?.limitacao);
  const specializationRaw = data?.especializacao ?? user?.especializacao;
  const specializationLabel = Array.isArray(specializationRaw)
    ? toText(specializationRaw.filter(Boolean).join(', '))
    : toText(specializationRaw);
  const cref = toText(data?.cref || user?.cref);
  const instagram = toText(data?.instagram || user?.instagram);
  const linkedin = toText(data?.linkedin || user?.linkedin);
  const personalName = toText(data?.nameDoSeuPersonal || user?.nameDoSeuPersonal);
  const createdAt = data?.created_time || data?.createdAt || user?.createdTime;
  const lastActive = data?.last_active_time || data?.lastActiveTime || user?.lastActiveTime;
  const planLabel = user?.assinatura
    ? user?.tipoDeAssinatura
      ? `Ativa (${user.tipoDeAssinatura})`
      : 'Ativa'
    : 'Sem assinatura';

  const formatCode = (value?: string | number | null) => {
    if (value === undefined || value === null) return '';
    const text = String(value).trim();
    if (!text || text === '0') return '';
    return text;
  };

  const personalCode = formatCode(data?.codigoPersonal ?? user?.codigoPersonal);
  const isProfessional = role === 'personal' || role === 'professor' || role === 'admin';
  const isAcademy = role === 'academy';
  const isStudent = role === 'aluno' || !role;
  const subscriptionRoute = '/profile/subscription';

  useEffect(() => {
    if (requestedSheet === 'professional' && isProfessional) {
      setProfessionalSheetOpen(true);
      return;
    }
    setProfessionalSheetOpen(false);
  }, [isProfessional, requestedSheet]);

  const openProfessionalSheet = () => {
    setProfessionalSheetOpen(true);
    if (requestedSheet !== 'professional') {
      router.replace('/profile?sheet=professional', { scroll: false });
    }
  };

  const closeProfessionalSheet = () => {
    setProfessionalSheetOpen(false);
    if (requestedSheet === 'professional') {
      router.replace('/profile', { scroll: false });
    }
  };
  const roleLabel =
    role === 'admin'
      ? 'Administrador'
      : role === 'academy'
        ? 'Academia'
      : role === 'professor'
        ? 'Professor'
        : role === 'personal'
          ? 'Personal'
          : 'Aluno';
  const codeBadge = personalCode
      ? isProfessional
        ? `Codigo ${personalCode}`
        : `Personal ${personalCode}`
      : '';
  const personalCodeLabel = personalCode ? `Personal ${personalCode}` : 'Sem personal';
  const stats = isStudent
    ? [
        { label: 'Personal', value: personalCode || '-' },
        { label: 'Objetivo', value: objective },
        { label: 'Telefone', value: phone },
        { label: 'Cidade', value: locationLabel },
        { label: 'Conta criada', value: formatDate(createdAt) },
        { label: 'Ultimo acesso', value: formatDate(lastActive) },
      ]
    : isAcademy
      ? [
          { label: 'Telefone', value: phone },
          { label: 'Cidade', value: locationLabel },
          { label: 'Assinatura', value: planLabel },
          { label: 'Conta criada', value: formatDate(createdAt) },
          { label: 'Ultimo acesso', value: formatDate(lastActive) },
        ]
      : [
          { label: 'Codigo', value: personalCode || '-' },
          { label: 'Especialidade', value: specializationLabel },
          { label: 'CREF', value: cref },
          { label: 'Telefone', value: phone },
          { label: 'Cidade', value: locationLabel },
          { label: 'Ultimo acesso', value: formatDate(lastActive) },
        ];

  if (isStudent) {
    const editRoute = '/profile/edit';
    const menuItems = [
      { icon: <IconUser />, label: 'Editar perfil', route: editRoute },
      { icon: <IconBell />, label: 'Notificacoes', route: '/profile/notifications' },
      { icon: <IconCard />, label: 'Assinatura', route: subscriptionRoute },
      { icon: <IconKey />, label: 'Codigo do personal', route: '/personal/change-code' },
      { icon: <IconGlobe />, label: 'Idioma', route: '/profile/language' },
      { icon: <IconHelp />, label: 'Central de ajuda', route: '/help' },
      { icon: <IconDoc />, label: 'Termos de uso', route: '/terms' },
      { icon: <IconShield />, label: 'Politica de privacidade', route: '/privacy' },
    ];
    const handleLogout = async () => {
      if (typeof window === 'undefined') return;
      const confirmLogout = window.confirm('Tem certeza que deseja sair?');
      if (!confirmLogout) return;
      await logout();
    };
    return (
      <section className="student-self-page">
        <header className="student-self-header">
          <p className="student-home-kicker">Perfil</p>
          <h1>Perfil</h1>
          <p className="student-home-sub">Seu perfil, preferencias e atalhos.</p>
        </header>

        <div className="student-card student-card--hero student-self-card">
          <Link className="student-self-row" href={editRoute}>
            <div className="student-self-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : <span>{avatarLabel}</span>}
            </div>
            <div className="student-self-info">
              <strong>{displayName}</strong>
              <span>{email}</span>
              <div className="student-self-badges">
                <span className="student-pill">ALUNO</span>
                <span className="student-pill is-link">{personalCodeLabel}</span>
              </div>
            </div>
            <span className="student-self-chevron">
              <IconChevron />
            </span>
          </Link>
        </div>

        {user?.assinatura && (
          <Link href={subscriptionRoute} className="student-card student-self-card student-self-subscription">
            <div className="student-self-subscription-icon">
              <IconStar />
            </div>
            <div>
              <strong>Plano {user?.tipoDeAssinatura || 'Premium'}</strong>
              <span>Ativo</span>
            </div>
            <span className="student-self-chevron">
              <IconChevron />
            </span>
          </Link>
        )}

        <div className="student-card student-self-card student-self-menu">
          {menuItems.map((item) => (
            <Link key={item.label} href={item.route} className="student-self-menu-item">
              <span className="student-self-menu-icon">{item.icon}</span>
              <span className="student-self-menu-label">{item.label}</span>
              <span className="student-self-chevron">
                <IconChevron />
              </span>
            </Link>
          ))}
        </div>

        <button type="button" className="student-self-logout" onClick={handleLogout}>
          <IconLogout />
          Sair
        </button>

        <div className="student-self-footer">
          <span>Versao 8.9.42+111</span>
          <span>Desenvolvido por Nagazaki Software</span>
        </div>
      </section>
    );
  }

  const advancedProfileRoute = isProfessional
    ? '/profile?sheet=professional'
    : isAcademy
      ? '/profile/edit-advanced'
      : '/personal/change-code';
  const advancedProfileLabel = isProfessional
    ? 'Perfil profissional'
    : isAcademy
      ? 'Perfil avancado'
      : 'Codigo do personal';

  const quickActions = [
    {
      href: '/profile/edit',
      title: 'Editar perfil',
      description: 'Dados pessoais e contato.',
    },
    {
      href: advancedProfileRoute,
      title: advancedProfileLabel,
      description: isProfessional
        ? 'Especialidades, registro e redes.'
        : isAcademy
          ? 'Dados operacionais da academia.'
          : 'Troca do codigo de vinculacao.',
    },
    {
      href: '/profile/notifications',
      title: 'Notificacoes',
      description: 'Alertas e lembretes do app.',
    },
    {
      href: subscriptionRoute,
      title: 'Assinatura',
      description: 'Plano atual e cobrancas.',
    },
    {
      href: '/profile/language',
      title: 'Idioma',
      description: 'Preferencia de idioma.',
    },
    {
      href: '/help',
      title: 'Central de ajuda',
      description: 'Suporte e orientacoes.',
    },
  ];

  return (
    <PageShell title="Perfil" description="Seu perfil, preferencias e atalhos.">
      <UserScopePicker />
      <section className="profile-panel profile-v3">
        <div className="profile-v3-hero">
          <div className="profile-v3-identity">
            <div className="profile-avatar profile-v3-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : <span>{avatarLabel}</span>}
            </div>
            <div className="profile-v3-identity-copy">
              <div className="profile-badges profile-v3-badges">
                <span className="profile-role-pill profile-v3-role">{roleLabel}</span>
                {codeBadge ? <span className="profile-code-pill profile-v3-code">{codeBadge}</span> : null}
              </div>
              <h2>{displayName}</h2>
              <p className="profile-v3-email">{email}</p>
              <p className="profile-bio profile-v3-bio">{bio}</p>
              <div className="profile-v3-actions">
                <Link className="button" href="/profile/edit">
                  Editar perfil
                </Link>
                {isProfessional ? (
                  <button type="button" className="button secondary" onClick={openProfessionalSheet}>
                    {advancedProfileLabel}
                  </button>
                ) : (
                  <Link className="button secondary" href={advancedProfileRoute}>
                    {advancedProfileLabel}
                  </Link>
                )}
                <Link className="button secondary" href="/profile/notifications">
                  Notificacoes
                </Link>
                <Link className="button secondary" href={subscriptionRoute}>
                  Assinatura
                </Link>
              </div>
            </div>
          </div>
          <div className="profile-v3-account">
            <p className="profile-v3-account-kicker">Resumo da conta</p>
            <div className="profile-v3-account-grid">
              <div className="profile-v3-account-item">
                <span>Perfil</span>
                <strong>{roleLabel}</strong>
              </div>
              <div className="profile-v3-account-item">
                <span>{isAcademy ? 'Conta criada' : 'Codigo'}</span>
                <strong>{isAcademy ? formatDate(createdAt) : personalCode || '-'}</strong>
              </div>
              <Link href={subscriptionRoute} className="profile-v3-account-item is-link">
                <span>Assinatura</span>
                <strong>{planLabel}</strong>
              </Link>
              <div className="profile-v3-account-item">
                <span>Ultimo acesso</span>
                <strong>{formatDate(lastActive)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="profile-v3-metrics">
          {stats.map((item) => (
            <div key={item.label} className="profile-v3-metric">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="profile-v3-layout">
          <div className="profile-main profile-v3-main">
            <div className="portal-card profile-card profile-v3-card">
              <div className="profile-section-header profile-v3-card-header">
                <div>
                  <p className="profile-v3-card-kicker">Dados base</p>
                  <h3>Informacoes pessoais</h3>
                  <p className="subtle">Contato, localizacao e dados de acesso da conta.</p>
                </div>
                <Link className="button secondary sm" href="/profile/edit">
                  Editar
                </Link>
              </div>
              <div className="profile-info-grid profile-v3-info-grid">
                <div className="profile-info-item profile-v3-info-item">
                  <span>Email</span>
                  <strong>{email}</strong>
                </div>
                <div className="profile-info-item profile-v3-info-item">
                  <span>Telefone</span>
                  <strong>{phone}</strong>
                </div>
                <div className="profile-info-item profile-v3-info-item">
                  <span>Cidade</span>
                  <strong>{locationLabel}</strong>
                </div>
                <div className="profile-info-item profile-v3-info-item">
                  <span>Conta criada</span>
                  <strong>{formatDate(createdAt)}</strong>
                </div>
                <div className="profile-info-item profile-v3-info-item">
                  <span>Ultimo acesso</span>
                  <strong>{formatDate(lastActive)}</strong>
                </div>
                <div className="profile-info-item profile-v3-info-item">
                  <span>Assinatura</span>
                  <strong>{planLabel}</strong>
                </div>
              </div>
              <div className="profile-bio-card profile-v3-bio-card">
                <span>Bio</span>
                <p>{bio}</p>
              </div>
            </div>

            {isProfessional ? (
              <div className="portal-card profile-card profile-v3-card">
                <div className="profile-section-header profile-v3-card-header">
                  <div>
                    <p className="profile-v3-card-kicker">Profissional</p>
                    <h3>Perfil profissional</h3>
                    <p className="subtle">Especialidade, registro e canais publicos.</p>
                  </div>
                  <button type="button" className="button secondary sm" onClick={openProfessionalSheet}>
                    Atualizar
                  </button>
                </div>
                <div className="profile-info-grid profile-v3-info-grid">
                  <div className="profile-info-item profile-v3-info-item">
                    <span>Especialidade</span>
                    <strong>{specializationLabel}</strong>
                  </div>
                  <div className="profile-info-item profile-v3-info-item">
                    <span>Registro profissional</span>
                    <strong>{cref}</strong>
                  </div>
                  <div className="profile-info-item profile-v3-info-item">
                    <span>Instagram</span>
                    <strong>{instagram}</strong>
                  </div>
                  <div className="profile-info-item profile-v3-info-item">
                    <span>LinkedIn</span>
                    <strong>{linkedin}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="portal-card profile-card profile-v3-card">
                <div className="profile-section-header profile-v3-card-header">
                  <div>
                    <p className="profile-v3-card-kicker">Operacao</p>
                    <h3>Resumo da conta</h3>
                    <p className="subtle">Indicadores principais de acesso e cadastro.</p>
                  </div>
                </div>
                <div className="profile-info-grid profile-v3-info-grid">
                  <div className="profile-info-item profile-v3-info-item">
                    <span>Telefone</span>
                    <strong>{phone}</strong>
                  </div>
                  <div className="profile-info-item profile-v3-info-item">
                    <span>Cidade</span>
                    <strong>{locationLabel}</strong>
                  </div>
                  <div className="profile-info-item profile-v3-info-item">
                    <span>Assinatura</span>
                    <strong>{planLabel}</strong>
                  </div>
                  <div className="profile-info-item profile-v3-info-item">
                    <span>Conta criada</span>
                    <strong>{formatDate(createdAt)}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="profile-side profile-v3-side">
            <div className="portal-card profile-card profile-v3-card profile-v3-shortcuts">
              <div className="profile-section-header profile-v3-card-header">
                <div>
                  <p className="profile-v3-card-kicker">Acoes</p>
                  <h3>Atalhos rapidos</h3>
                  <p className="subtle">Acesso direto ao que voce mais usa.</p>
                </div>
              </div>
              <div className="profile-v3-action-list">
                {quickActions.map((item) => (
                  <Link key={item.href} href={item.href} className="profile-v3-action-row">
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                    </div>
                    <span className="profile-v3-arrow" aria-hidden="true">
                      <IconChevron />
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="portal-card profile-card profile-v3-card">
              <div className="profile-section-header profile-v3-card-header">
                <div>
                  <p className="profile-v3-card-kicker">Legal</p>
                  <h3>Privacidade e termos</h3>
                  <p className="subtle">Documentos oficiais e controles da conta.</p>
                </div>
              </div>
              <div className="profile-link-list profile-v3-link-list">
                <Link href="/terms" className="profile-link-row profile-v3-link-row">
                  Termos de uso
                </Link>
                <Link href="/privacy" className="profile-link-row profile-v3-link-row">
                  Politica de privacidade
                </Link>
                <Link href="/account-deletion" className="profile-link-row profile-v3-link-row">
                  Exclusao de conta
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
      {isProfessional ? (
        <ProfileEditBottomSheet open={professionalSheetOpen} onClose={closeProfessionalSheet} />
      ) : null}
    </PageShell>
  );
}

