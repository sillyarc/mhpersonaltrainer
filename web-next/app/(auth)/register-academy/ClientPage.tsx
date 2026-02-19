'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const generateAcademyCode = () => Math.floor(10000 + Math.random() * 90000);

export default function RegisterAcademyPage() {
  const { register, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/academy';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [academyCode, setAcademyCode] = useState<number | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, redirectTo, router]);

  const validate = () => {
    if (!name) {
      setError('Nome da academia obrigatorio.');
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
    const code = generateAcademyCode();
    const result = await register(email, password, name, {
      academyAccount: true,
      admin: false,
      professorAccount: false,
      codigoAcademia: code,
    });
    setLoading(false);
    if (result.success) {
      setSuccess(true);
      setAcademyCode(code);
    } else {
      setError(result.error || 'Erro ao cadastrar.');
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <p className="auth-kicker">Cadastro da academia</p>
        <h1>Crie o acesso ao painel da academia</h1>
        <p className="subtle">
          Cadastre o email principal da academia para liberar o painel.
        </p>
      </div>
      {academyCode && (
        <div className="auth-code">
          <span>Codigo da academia</span>
          <strong>{academyCode}</strong>
        </div>
      )}
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <span>Nome da academia</span>
          <input
            type="text"
            placeholder="Nome da sua academia"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="auth-input"
          />
        </label>
        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            placeholder="contato@mhpersonal.com"
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
          <button type="button" className="auth-submit" onClick={() => router.replace(redirectTo)}>
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
        <Link href="/academy-login" className="auth-link">
          Entrar no painel
        </Link>
      </div>
    </div>
  );
}
