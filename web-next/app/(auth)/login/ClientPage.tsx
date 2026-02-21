'use client';

import Link from 'next/link';
import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { isMobileOrTablet } from '@/lib/device';
import { getMobileAppUrl } from '@/lib/mobileApp';

export default function LoginPage() {
  const { login, loginWithGoogle, loginWithApple, isAuthenticated, role } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');
  const getDefaultRedirect = (currentRole: typeof role) => {
    if (currentRole === 'admin') return '/admin';
    if (currentRole === 'academy') return '/academy';
    return '/app';
  };
  const resolveRedirect = (currentRole: typeof role) => {
    if (!redirectParam) return getDefaultRedirect(currentRole);
    if (redirectParam.startsWith('/academy') && currentRole !== 'academy') {
      return getDefaultRedirect(currentRole);
    }
    if (redirectParam.startsWith('/admin') && currentRole !== 'admin') {
      return getDefaultRedirect(currentRole);
    }
    return redirectParam;
  };
  const redirectTo = resolveRedirect(role);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const mobileUrl = getMobileAppUrl('/login');
    if (mobileUrl && isMobileOrTablet()) {
      window.location.replace(mobileUrl);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && role) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, redirectTo, role, router]);

  const validate = () => {
    if (!email || !password) {
      setError('Informe email e senha.');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Email invalido.');
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Erro ao fazer login.');
    }
  };

  const handleGoogle = async () => {
    setSocialLoading(true);
    const result = await loginWithGoogle();
    setSocialLoading(false);
    if (!result.success) {
      setError(result.error || 'Falha ao entrar com Google.');
    }
  };

  const handleApple = async () => {
    setSocialLoading(true);
    const result = await loginWithApple();
    setSocialLoading(false);
    if (!result.success) {
      setError(result.error || 'Falha ao entrar com Apple.');
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <p className="auth-kicker">Portal profissional</p>
        <h1>Entrar no painel</h1>
        <p className="subtle">
          Acesso para personal, admin e academia. Aluno entra pelo painel mobile.
        </p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            placeholder="personal@mhpersonal.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            className="auth-input"
          />
        </label>
        <label className="auth-field">
          <span>Senha</span>
          <div className="auth-password">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="********"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="auth-input"
            />
            <button
              type="button"
              className="auth-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="auth-submit" disabled={loading || socialLoading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <div className="auth-divider">
        <span>ou</span>
      </div>

      <div className="auth-form">
        <button
          type="button"
          className="auth-secondary"
          onClick={handleGoogle}
          disabled={loading || socialLoading}
        >
          {socialLoading ? 'Conectando...' : 'Entrar com Google'}
        </button>
        <button
          type="button"
          className="auth-secondary"
          onClick={handleApple}
          disabled={loading || socialLoading}
        >
          {socialLoading ? 'Conectando...' : 'Entrar com Apple'}
        </button>
      </div>

      <section className="auth-access">
        <div className="auth-access-header">
          <span className="subtle">Outras opcoes de acesso</span>
          <Link href="/forgot-password" className="auth-link">
            Esqueci a senha
          </Link>
        </div>

        <div className="auth-access-list">
          <div className="auth-access-item">
            <div>
              <p className="auth-access-title">Personal</p>
              <p className="subtle">Conta profissional no painel web.</p>
            </div>
            <div className="auth-access-actions">
              <Link href="/register" className="auth-link auth-link-chip">
                Criar conta de personal
              </Link>
            </div>
          </div>

          <div className="auth-access-item">
            <div>
              <p className="auth-access-title">Academia</p>
              <p className="subtle">Acesso de gestao para equipes e operacao.</p>
            </div>
            <div className="auth-access-actions">
              <Link href="/academy-login" className="auth-link auth-link-chip">
                Entrar
              </Link>
              <Link href="/register-academy" className="auth-link auth-link-chip">
                Criar conta
              </Link>
            </div>
          </div>

          <div className="auth-access-item">
            <div>
              <p className="auth-access-title">Aluno (mobile)</p>
              <p className="subtle">Fluxo focado no app para acompanhamento diario.</p>
            </div>
            <div className="auth-access-actions">
              <Link href="/login-aluno" className="auth-link auth-link-chip">
                Entrar
              </Link>
              <Link href="/register-aluno" className="auth-link auth-link-chip">
                Criar conta
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
