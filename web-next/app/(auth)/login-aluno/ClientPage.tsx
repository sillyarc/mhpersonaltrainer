'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const resolveRedirect = (redirectParam: string | null) => {
  if (!redirectParam) return '/app';
  if (redirectParam.startsWith('/admin') || redirectParam.startsWith('/academy')) {
    return '/app';
  }
  return redirectParam;
};

export default function LoginAlunoPage() {
  const { login, loginWithGoogle, loginWithApple, isAuthenticated, role, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');
  const redirectTo = resolveRedirect(redirectParam);

  const [mobileAllowed, setMobileAllowed] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [error, setError] = useState('');

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
    if (!isAuthenticated || !role) return;
    if (role !== 'aluno') {
      setError('Este acesso e exclusivo para aluno.');
      logout();
      return;
    }
    router.replace(redirectTo);
  }, [isAuthenticated, role, redirectTo, router, logout]);

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

  if (mobileAllowed === null) {
    return (
      <div className="auth-card auth-card--student">
        <div className="auth-card-header">
          <p className="auth-kicker">Aluno</p>
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
          <p className="auth-kicker">Aluno</p>
          <h1>Acesso apenas no celular</h1>
          <p className="subtle">
            Este login e liberado somente em dispositivos com largura menor que 1000px.
          </p>
        </div>
        <div className="auth-links">
          <Link href="/login" className="auth-link">
            Entrar como personal
          </Link>
          <Link href="/register-aluno" className="auth-link">
            Criar conta de aluno
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-card auth-card--student">
      <div className="auth-card-header">
        <p className="auth-kicker">Aluno</p>
        <h1>Entrar no painel do aluno</h1>
        <p className="subtle">Acesse seus treinos, progresso e mensagens pelo celular.</p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            placeholder="aluno@mhpersonal.com"
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

      <div className="auth-links">
        <Link href="/forgot-password" className="auth-link">
          Esqueci a senha
        </Link>
        <Link href="/register-aluno" className="auth-link">
          Criar conta de aluno
        </Link>
      </div>
      <div className="auth-links">
        <Link href="/invite" className="auth-link">
          Tenho convite
        </Link>
        <Link href="/login" className="auth-link">
          Entrar como personal
        </Link>
      </div>
    </div>
  );
}
