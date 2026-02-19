'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import type { User } from '@/lib/types/user';

const parsePersonalCode = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isNaN(numeric) || !Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
};

export default function RegisterAlunoPage() {
  const { register, isAuthenticated } = useAuth();
  const router = useRouter();

  const [mobileAllowed, setMobileAllowed] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [personalCode, setPersonalCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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

  const validate = () => {
    if (!name) {
      setError('Nome obrigatorio.');
      return false;
    }
    if (!email) {
      setError('Email obrigatorio.');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
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
    if (personalCode.trim() && parsePersonalCode(personalCode) === null) {
      setError('Codigo do personal invalido.');
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setLoading(true);
    const codigoPersonal = parsePersonalCode(personalCode);
    const extraData: Partial<User> = {
      alunoDesde: new Date(),
    };
    if (codigoPersonal !== null) {
      extraData.codigoPersonal = codigoPersonal;
    }
    const result = await register(email, password, name, extraData);
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
          <h1>Cadastro apenas no celular</h1>
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
        <p className="auth-kicker">Aluno</p>
        <h1>Crie sua conta de aluno</h1>
        <p className="subtle">
          Cadastro rapido para acessar seus treinos e progresso no celular.
        </p>
      </div>
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
        <label className="auth-field">
          <span>Codigo do personal (opcional)</span>
          <input
            type="text"
            placeholder="Ex: 1234"
            value={personalCode}
            onChange={(event) => setPersonalCode(event.target.value)}
            className="auth-input"
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        {success ? (
          <button type="button" className="auth-submit" onClick={() => router.replace('/app')}>
            Ir para o painel
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
