'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const generatePersonalCode = () => Math.floor(1000 + Math.random() * 9000);

export default function RegisterPersonalPage() {
  const { register, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/app';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [personalCode, setPersonalCode] = useState<number | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, redirectTo, router]);

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
    setError('');
    return true;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setLoading(true);
    const code = generatePersonalCode();
    const result = await register(email, password, name, {
      professorAccount: true,
      codigoPersonal: code,
    });
    setLoading(false);
    if (result.success) {
      setPersonalCode(code);
      setSuccess(true);
    } else {
      setError(result.error || 'Erro ao cadastrar.');
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <p className="auth-kicker">Cadastro profissional</p>
        <h1>Crie sua conta de personal</h1>
        <p className="subtle">
          Tenha um painel completo para treinos, avaliacoes, agenda e comunicacao.
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
        {error && <p className="auth-error">{error}</p>}
        {personalCode && (
          <div className="auth-code">
            <span>Seu codigo de personal</span>
            <strong>{personalCode}</strong>
          </div>
        )}
        {success ? (
          <button
            type="button"
            className="auth-submit"
            onClick={() => router.replace(redirectTo)}
          >
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
        <Link href="/personal-login" className="auth-link">
          Entrar
        </Link>
      </div>
    </div>
  );
}
