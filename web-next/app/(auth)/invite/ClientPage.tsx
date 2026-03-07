'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { firestoreService, type PersonalProfile } from '@/lib/services/firestoreService';

const normalizeCode = (value?: string | null) => (value ? value.trim() : '');

const resolveCodigoPersonal = (code: string) => {
  const numeric = Number(code);
  return Number.isNaN(numeric) ? null : numeric;
};

export default function InvitePage() {
  const { register, isAuthenticated } = useAuth();
  const router = useRouter();
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

  const codigoPersonal = useMemo(() => resolveCodigoPersonal(code), [code]);

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
    if (isAuthenticated) {
      router.replace('/app');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    let active = true;
    if (mobileAllowed !== true) {
      return () => {
        active = false;
      };
    }
    if (!code) {
      setProfile(null);
      setProfileError('Codigo nao informado.');
      return;
    }
    setProfileLoading(true);
    setProfileError('');
    firestoreService.getPersonalProfileByCode(code).then((result) => {
      if (!active) return;
      if (result) {
        setProfile(result);
      } else {
        setProfile(null);
        setProfileError('Personal nao encontrado.');
      }
      setProfileLoading(false);
    });
    return () => {
      active = false;
    };
  }, [code, mobileAllowed]);

  const validate = () => {
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
    if (!email) {
      setError('Email obrigatorio.');
      return false;
    }
    if (!/\\S+@\\S+\\.\\S+/.test(email)) {
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
    const result = await register(email, password, name, {
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
          <Link href="/login-aluno" className="auth-link">
            Entrar como aluno
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
          Seu acesso sera vinculado ao personal que enviou o convite.
        </p>
      </div>

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
          <button type="button" className="auth-submit" onClick={() => router.replace('/app')}>
            Entrar agora
          </button>
        ) : (
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Salvando...' : 'Criar conta'}
          </button>
        )}
      </form>

      <div className="auth-links">
        <span className="subtle">Ja tem conta?</span>
        <Link href="/login-aluno" className="auth-link">
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
