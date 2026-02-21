'use client';

import { useEffect, useState } from 'react';
import { useUserScope } from '@/lib/firestoreHooks';
import { useAuth } from '@/lib/auth';

export default function UserScopePicker() {
  const { role } = useAuth();
  const { userId, setUserId } = useUserScope();
  const [value, setValue] = useState(userId);

  useEffect(() => {
    setValue(userId);
  }, [userId]);

  if (role !== 'admin') {
    return null;
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <p className="pill">Filtro por usuario</p>
      <p className="subtle" style={{ marginTop: 8 }}>
        Informe o UID do usuario para carregar subcolecoes (avaliacoes, pagamentos, documentos, etc.).
      </p>
      <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="UID do usuario"
          style={{ flex: 1, minWidth: 220, padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
        />
        <button
          className="button"
          type="button"
          onClick={() => setUserId(value.trim())}
        >
          Aplicar
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setValue('');
            setUserId('');
          }}
        >
          Limpar
        </button>
      </div>
      {userId && (
        <p className="subtle" style={{ marginTop: 10 }}>
          Usuario atual: {userId}
        </p>
      )}
    </div>
  );
}
