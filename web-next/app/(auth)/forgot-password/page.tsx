'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email) {
      setError('Informe seu email.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Email invalido.');
      return;
    }
    setError('');
    setLoading(true);
    const result = await resetPassword(email);
    setLoading(false);
    if (result.success) {
      setMessage('Link enviado para seu email.');
    } else {
      setError(result.error || 'Erro ao enviar link.');
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <p className="auth-kicker">Recuperar acesso</p>
        <h1>Recuperar senha</h1>
        <p className="subtle">Enviaremos um link de recuperacao para seu email.</p>
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
        {message && <p className="auth-success">{message}</p>}
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Enviando...' : 'Enviar link'}
        </button>
      </form>
      <div className="auth-links">
        <span className="subtle">Voltar para</span>
        <Link href="/login" className="auth-link">
          login
        </Link>
      </div>
    </div>
  );
}
