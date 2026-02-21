'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function AcademyLoginPage() {
  const { login, loginWithGoogle, loginWithApple, logout, isAuthenticated, role } = useAuth();
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!role) return;
    if (role === 'aluno') {
      setError('Esta conta nao tem acesso ao painel da academia.');
      logout();
      return;
    }
    router.replace(resolveRedirect(role));
  }, [isAuthenticated, role, redirectParam, router, logout]);

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
        <p className="auth-kicker">Portal da academia</p>
        <h1>Entrar no painel da academia</h1>
        <p className="subtle">
          Use este acesso para academia, personal ou admin.
        </p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
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
          <div className="auth-password">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="********"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
          {loading ? 'Entrando...' : 'Entrar no painel'}
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

      <div className="auth-links">
        <Link href="/forgot-password" className="auth-link">
          Esqueci a senha
        </Link>
        <Link href="/register-academy" className="auth-link">
          Criar conta da academia
        </Link>
      </div>
    </div>
  );
}
