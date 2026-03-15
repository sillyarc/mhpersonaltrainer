'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { fetchInvitePersonalProfile } from '@/lib/services/inviteService';
import {
  buildMobileAuthHandoffUrl,
  startMobileAuthHandoff,
} from '@/lib/services/mobileAuthHandoff';
import type { PersonalProfile } from '@/lib/services/firestoreService';
import { isValidEmailInput, normalizeEmailInput } from '@/lib/utils/email';

const normalizeCode = (value?: string | null) => (value ? value.trim() : '');

const resolveCodigoPersonal = (code: string) => {
  const numeric = Number(code);
  return Number.isNaN(numeric) ? null : numeric;
};

const buildInviteLoginHref = (code: string) => {
  const trimmedCode = normalizeCode(code);
  if (!trimmedCode) return '/login-aluno';
  const redirectTo = `/invite?code=${encodeURIComponent(trimmedCode)}`;
  return `/login-aluno?redirect=${encodeURIComponent(redirectTo)}`;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Nao foi possivel abrir o app.';
};

const ANDROID_APP_PACKAGE = 'com.mycompany.mfitfitnessapp';

const getIsAndroid = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
};

const buildSchemeDeepLink = (path: string, query?: Record<string, string>) => {
  const normalizedPath = path.replace(/^\/+/, '');
  const search = new URLSearchParams(query || {}).toString();
  return `mhpersonaltrainer:///${normalizedPath}${search ? `?${search}` : ''}`;
};

const buildIntentDeepLink = (path: string, query?: Record<string, string>) => {
  const normalizedPath = path.replace(/^\/+/, '');
  const search = new URLSearchParams(query || {}).toString();
  const suffix = search ? `?${search}` : '';
  return `intent://${normalizedPath}${suffix}#Intent;scheme=mhpersonaltrainer;package=${ANDROID_APP_PACKAGE};end`;
};

const buildInviteAppDeepLink = (code: string) => {
  const normalized = normalizeCode(code);
  const query = normalized ? { code: normalized } : undefined;
  const schemeUrl = buildSchemeDeepLink('invite', query);
  const androidIntentUrl = buildIntentDeepLink('invite', query);
  return {
    schemeUrl,
    openUrl: getIsAndroid() ? androidIntentUrl : schemeUrl,
  };
};

const buildAuthenticatedAppDeepLink = (handoffId: string) => {
  const query = { handoff: handoffId };
  const schemeUrl = buildMobileAuthHandoffUrl(handoffId);
  const androidIntentUrl = buildIntentDeepLink('mobile-auth', query);
  return {
    schemeUrl,
    openUrl: getIsAndroid() ? androidIntentUrl : schemeUrl,
  };
};

export default function InvitePage() {
  const { register, isAuthenticated } = useAuth();
  const searchParams = useSearchParams();
  const codeParam =
    searchParams.get('code') ??
    searchParams.get('codigo') ??
    searchParams.get('codigoPersonal') ??
    searchParams.get('personalCode');
  const code = normalizeCode(codeParam);
  const [mobileAllowed, setMobileAllowed] = useState<boolean | null>(null);

  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [appOpenError, setAppOpenError] = useState('');
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffDeepLink, setHandoffDeepLink] = useState('');
  const appOpenStartedRef = useRef(false);
  const handoffStartedRef = useRef(false);

  const codigoPersonal = useMemo(() => resolveCodigoPersonal(code), [code]);
  const loginHref = useMemo(() => buildInviteLoginHref(code), [code]);
  const inviteDeepLink = useMemo(() => buildInviteAppDeepLink(code), [code]);

  useEffect(() => {
    appOpenStartedRef.current = false;
    handoffStartedRef.current = false;
    setAppOpenError('');
    setHandoffDeepLink('');
    setHandoffLoading(false);
  }, [code]);

  useEffect(() => {
    const updateViewport = () => {
      if (typeof window === 'undefined') return;
      setMobileAllowed(window.innerWidth < 1000);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (mobileAllowed !== true) {
      return () => {
        active = false;
      };
    }
    if (!code) {
      setProfile(null);
      setProfileLoading(false);
      setProfileError('Codigo nao informado.');
      return;
    }
    setProfileLoading(true);
    setProfileError('');
    void (async () => {
      let result: PersonalProfile | null = null;
      try {
        result = await fetchInvitePersonalProfile(code);
      } catch (endpointError) {
        console.error('Error loading invite profile from server:', endpointError);
        if (!active) return;
        setProfile(null);
        setProfileError('Nao foi possivel validar o convite.');
        setProfileLoading(false);
        return;
      }

      if (!active) return;
      if (result) {
        setProfile(result);
      } else {
        setProfile(null);
        setProfileError('Personal nao encontrado.');
      }
      setProfileLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [code, mobileAllowed]);

  useEffect(() => {
    if (mobileAllowed !== true || !inviteDeepLink.openUrl || appOpenStartedRef.current || isAuthenticated) {
      return;
    }

    appOpenStartedRef.current = true;
    setAppOpenError('');
    const timer = window.setTimeout(() => {
      try {
        window.location.href = inviteDeepLink.openUrl;
      } catch (openError) {
        setAppOpenError(getErrorMessage(openError));
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [inviteDeepLink.openUrl, isAuthenticated, mobileAllowed]);

  useEffect(() => {
    let active = true;

    if (!isAuthenticated || !code || codigoPersonal === null || handoffStartedRef.current) {
      return () => {
        active = false;
      };
    }

    handoffStartedRef.current = true;
    setHandoffLoading(true);
    setAppOpenError('');

    void (async () => {
      try {
        const result = await startMobileAuthHandoff({ code });
        if (!active) return;
        const deeplink = buildAuthenticatedAppDeepLink(result.handoffId);
        setHandoffDeepLink(deeplink.openUrl);
        setHandoffLoading(false);
        window.setTimeout(() => {
          window.location.href = deeplink.openUrl;
        }, 120);
      } catch (handoffError) {
        if (!active) return;
        handoffStartedRef.current = false;
        setHandoffLoading(false);
        setAppOpenError(getErrorMessage(handoffError));
      }
    })();

    return () => {
      active = false;
    };
  }, [code, codigoPersonal, isAuthenticated]);

  const validate = () => {
    const normalizedEmail = normalizeEmailInput(email);
    if (!code || codigoPersonal === null) {
      setError('Codigo do convite nao encontrado.');
      return false;
    }
    if (!profile) {
      setError(profileError || 'Personal nao encontrado.');
      return false;
    }
    if (!name) {
      setError('Nome obrigatorio.');
      return false;
    }
    if (!normalizedEmail) {
      setError('Email obrigatorio.');
      return false;
    }
    if (!isValidEmailInput(normalizedEmail)) {
      setError('Email invalido.');
      return false;
    }
    if (!password) {
      setError('Senha obrigatoria.');
      return false;
    }
    if (password.length < 6) {
      setError('Senha deve ter pelo menos 6 caracteres.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Senhas nao coincidem.');
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setLoading(true);
    const normalizedEmail = normalizeEmailInput(email);
    const result = await register(normalizedEmail, password, name, {
      codigoPersonal: codigoPersonal ?? undefined,
      nameDoSeuPersonal: profile?.displayName || undefined,
    });
    setLoading(false);
    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error || 'Erro ao cadastrar.');
    }
  };

  if (mobileAllowed === null) {
    return (
      <div className="auth-card auth-card--student">
        <div className="auth-card-header">
          <p className="auth-kicker">Convite</p>
          <h1>Verificando dispositivo</h1>
          <p className="subtle">Aguarde um momento.</p>
        </div>
      </div>
    );
  }

  if (!mobileAllowed) {
    return (
      <div className="auth-card auth-card--student">
        <div className="auth-card-header">
          <p className="auth-kicker">Convite</p>
          <h1>Acesso apenas no celular</h1>
          <p className="subtle">
            Para criar a conta de aluno, abra este link em um dispositivo com largura menor que 1000px.
          </p>
        </div>
        <div className="auth-links">
          <Link href="/login" className="auth-link">
            Entrar como personal
          </Link>
          <Link href={loginHref} className="auth-link">
            Entrar como aluno
          </Link>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="auth-card auth-card--student">
        <div className="auth-card-header">
          <p className="auth-kicker">Convite</p>
          <h1>Abrindo seu app</h1>
          <p className="subtle">
            Seu convite ja esta pronto. Toque abaixo para voltar ao app via deeplink.
          </p>
        </div>

        {profile && (
          <div className="invite-personal">
            <div className="invite-personal-avatar">
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt={profile.displayName} />
              ) : (
                <span>{profile.displayName?.charAt(0).toUpperCase() || 'P'}</span>
              )}
            </div>
            <div className="invite-personal-meta">
              <strong>{profile.displayName}</strong>
              <span>{profile.especializacao || 'Personal trainer'}</span>
              <span className="invite-personal-code">
                Codigo {profile.codigoPersonal ?? code}
              </span>
            </div>
          </div>
        )}

        {appOpenError && <p className="auth-error">{appOpenError}</p>}
        {handoffLoading && <p className="subtle">Preparando seu login no app...</p>}

        <div className="auth-links">
          <button
            type="button"
            className="auth-submit"
            onClick={() => {
              if (handoffDeepLink && typeof window !== 'undefined') {
                window.location.href = handoffDeepLink;
              }
            }}
            disabled={!handoffDeepLink}
          >
            Abrir app agora
          </button>
        </div>

        <div className="auth-links">
          <Link href="/app" className="auth-link">
            Continuar na web
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-card auth-card--student">
      <div className="auth-card-header">
        <p className="auth-kicker">Convite</p>
        <h1>Crie sua conta de aluno</h1>
        <p className="subtle">
          Seu acesso sera vinculado ao personal que enviou o convite. Se voce ja tem o app, ele sera aberto automaticamente.
        </p>
      </div>

      <div className="auth-links">
        <button
          type="button"
          className="auth-submit"
          onClick={() => {
            if (inviteDeepLink.openUrl && typeof window !== 'undefined') {
              window.location.href = inviteDeepLink.openUrl;
            }
          }}
          disabled={!inviteDeepLink.openUrl}
        >
          Abrir no app
        </button>
      </div>
      {appOpenError ? <p className="auth-error">{appOpenError}</p> : null}

      {profileLoading && <p className="subtle">Carregando dados do personal...</p>}
      {profileError && <p className="auth-error">{profileError}</p>}
      {profile && (
        <div className="invite-personal">
          <div className="invite-personal-avatar">
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt={profile.displayName} />
            ) : (
              <span>{profile.displayName?.charAt(0).toUpperCase() || 'P'}</span>
            )}
          </div>
          <div className="invite-personal-meta">
            <strong>{profile.displayName}</strong>
            <span>{profile.especializacao || 'Personal trainer'}</span>
            {(profile.cidade || profile.estado) && (
              <span>
                {[profile.cidade, profile.estado].filter(Boolean).join(' - ')}
              </span>
            )}
            <span className="invite-personal-code">
              Codigo {profile.codigoPersonal ?? code}
            </span>
          </div>
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <span>Nome completo</span>
          <input
            type="text"
            placeholder="Seu nome"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="auth-input"
          />
        </label>
        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            placeholder="seuemail@mhpersonal.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="auth-input"
          />
        </label>
        <label className="auth-field">
          <span>Senha</span>
          <input
            type="password"
            placeholder="********"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="auth-input"
          />
        </label>
        <label className="auth-field">
          <span>Confirmar senha</span>
          <input
            type="password"
            placeholder="********"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="auth-input"
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        {success ? (
          <button
            type="button"
            className="auth-submit"
            onClick={() => {
              if (inviteDeepLink.openUrl && typeof window !== 'undefined') {
                window.location.href = inviteDeepLink.openUrl;
                return;
              }
              window.location.href = '/app';
            }}
          >
            Abrir app
          </button>
        ) : (
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Salvando...' : 'Criar conta'}
          </button>
        )}
      </form>

      <div className="auth-links">
        <span className="subtle">Ja tem conta?</span>
        <Link href={loginHref} className="auth-link">
          Entrar
        </Link>
      </div>
      <div className="auth-links">
        <Link href="/register-aluno" className="auth-link">
          Criar conta sem convite
        </Link>
      </div>
    </div>
  );
}
