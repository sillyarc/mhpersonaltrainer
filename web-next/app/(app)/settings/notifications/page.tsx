'use client';

import { useState, type FormEvent } from 'react';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { registerForPushNotificationsAsync, savePushToken } from '@/lib/services/notifications';

export default function SettingsNotificationsPage() {
  const { user } = useAuth();
  const [workoutAlerts, setWorkoutAlerts] = useState(true);
  const [paymentsAlerts, setPaymentsAlerts] = useState(true);
  const [productAlerts, setProductAlerts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.uid) return;
    setSaving(true);
    setMessage('');

    const token = await registerForPushNotificationsAsync();
    if (token) {
      await savePushToken(user.uid, token);
    }

    await updateDoc(doc(db, 'users', user.uid), {
      notificationsWorkout: workoutAlerts,
      notificationsPayments: paymentsAlerts,
      notificationsProduct: productAlerts,
    });

    setSaving(false);
    setMessage('Preferencias salvas.');
  };

  return (
    <PageShell
      title="Configuracao de notificacoes"
      description="Escolha quais alertas deseja receber."
      breadcrumbs={[{ label: 'Configuracoes', href: '/settings' }]}
    >
      <div className="card">
        <form style={{ display: 'grid', gap: 12 }} onSubmit={handleSubmit}>
          <label>
            <input
              type="checkbox"
              checked={workoutAlerts}
              onChange={(event) => setWorkoutAlerts(event.target.checked)}
            />{' '}
            Alertas de treino
          </label>
          <label>
            <input
              type="checkbox"
              checked={paymentsAlerts}
              onChange={(event) => setPaymentsAlerts(event.target.checked)}
            />{' '}
            Pagamentos e assinaturas
          </label>
          <label>
            <input
              type="checkbox"
              checked={productAlerts}
              onChange={(event) => setProductAlerts(event.target.checked)}
            />{' '}
            Novidades do produto
          </label>
          {message && <p style={{ color: '#1b7f3b' }}>{message}</p>}
          <button className="button" type="submit" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar preferencias'}
          </button>
        </form>
      </div>
    </PageShell>
  );
}
