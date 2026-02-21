'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebaseClient';
import { useDocumentData, useUserScope } from '@/lib/firestoreHooks';
import { registerForPushNotificationsAsync, savePushToken } from '@/lib/services/notifications';
import styles from './page.module.css';

type NotificationForm = {
  enabled: boolean;
  workout: boolean;
  agenda: boolean;
  students: boolean;
  payments: boolean;
  product: boolean;
  system: boolean;
  pushWeb: boolean;
  email: boolean;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
};

const DEFAULT_FORM: NotificationForm = {
  enabled: true,
  workout: true,
  agenda: true,
  students: true,
  payments: true,
  product: false,
  system: true,
  pushWeb: true,
  email: false,
  quietHours: false,
  quietStart: '22:00',
  quietEnd: '07:00',
};

const getBool = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  return fallback;
};

const NotificationSwitch = ({
  checked,
  label,
  hint,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  label: string;
  hint: string;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) => (
  <label className={`${styles.switchRow} ${disabled ? styles.switchRowDisabled : ''}`}>
    <div>
      <strong>{label}</strong>
      <span>{hint}</span>
    </div>
    <button
      type="button"
      className={`${styles.switchControl} ${checked ? styles.switchControlOn : ''}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      aria-label={label}
      aria-pressed={checked}
    >
      <span />
    </button>
  </label>
);

export default function NotificationsProfilePage() {
  const { user, role } = useAuth();
  const { userId } = useUserScope();
  const { data } = useDocumentData<Record<string, any>>(['users', userId]);

  const [form, setForm] = useState<NotificationForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: getBool(data.notificationsEnabled, DEFAULT_FORM.enabled),
      workout: getBool(data.notificationsWorkout, DEFAULT_FORM.workout),
      agenda: getBool(data.notificationsAgenda, DEFAULT_FORM.agenda),
      students: getBool(data.notificationsStudents, DEFAULT_FORM.students),
      payments: getBool(data.notificationsPayments, DEFAULT_FORM.payments),
      product: getBool(data.notificationsProduct, DEFAULT_FORM.product),
      system: getBool(data.notificationsSystem, DEFAULT_FORM.system),
      pushWeb: getBool(data.notificationsPushWeb, DEFAULT_FORM.pushWeb),
      email: getBool(data.notificationsEmail, DEFAULT_FORM.email),
      quietHours: getBool(data.notificationsQuietHours, DEFAULT_FORM.quietHours),
      quietStart:
        typeof data.notificationsQuietStart === 'string'
          ? data.notificationsQuietStart
          : DEFAULT_FORM.quietStart,
      quietEnd:
        typeof data.notificationsQuietEnd === 'string'
          ? data.notificationsQuietEnd
          : DEFAULT_FORM.quietEnd,
    });
  }, [data]);

  const activeCount = useMemo(() => {
    if (!form.enabled) return 0;
    return [
      form.workout,
      form.agenda,
      form.students,
      form.payments,
      form.product,
      form.system,
      form.pushWeb,
      form.email,
    ].filter(Boolean).length;
  }, [form]);

  const roleLabel =
    role === 'admin'
      ? 'Admin'
      : role === 'personal' || role === 'professor'
        ? 'Personal'
        : role === 'academy'
          ? 'Academia'
          : 'Aluno';

  const updateField = <K extends keyof NotificationForm>(key: K, value: NotificationForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage('');
    setError('');
  };

  const activatePush = async () => {
    if (!user?.uid) return;
    setPushLoading(true);
    setMessage('');
    setError('');
    try {
      const token = await registerForPushNotificationsAsync();
      if (!token) {
        setError('Permissao de notificacao nao concedida no navegador.');
        return;
      }
      await savePushToken(user.uid, token);
      setForm((current) => ({ ...current, pushWeb: true }));
      setMessage('Push web habilitado no navegador atual.');
    } catch (pushError) {
      console.error('Erro ao ativar push:', pushError);
      setError('Nao foi possivel ativar notificacoes push agora.');
    } finally {
      setPushLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) {
      setError('Usuario nao identificado.');
      return;
    }
    setLoading(true);
    setMessage('');
    setError('');
    try {
      await updateDoc(doc(db, 'users', userId), {
        notificationsEnabled: form.enabled,
        notificationsWorkout: form.workout,
        notificationsAgenda: form.agenda,
        notificationsStudents: form.students,
        notificationsPayments: form.payments,
        notificationsProduct: form.product,
        notificationsSystem: form.system,
        notificationsPushWeb: form.pushWeb,
        notificationsEmail: form.email,
        notificationsQuietHours: form.quietHours,
        notificationsQuietStart: form.quietStart,
        notificationsQuietEnd: form.quietEnd,
        notificationsUpdatedAt: serverTimestamp(),
      });
      setMessage('Preferencias salvas com sucesso.');
    } catch (saveError) {
      console.error('Erro ao salvar preferencias:', saveError);
      setError('Nao foi possivel salvar agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      title="Notificacoes do perfil"
      description="Controle alertas, canais e horario de silencio do seu perfil."
      breadcrumbs={[{ label: 'Perfil', href: '/profile' }]}
    >
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={styles.kicker}>Preferencias pessoais</span>
          <h2>Painel de notificacoes do {roleLabel}</h2>
          <p>
            Defina quais alertas voce recebe no dia a dia e evite ruido fora do seu horario de trabalho.
          </p>
        </div>
        <div className={styles.heroStats}>
          <article>
            <span>Alertas ativos</span>
            <strong>{activeCount}</strong>
          </article>
          <article>
            <span>Push web</span>
            <strong>{form.pushWeb ? 'Ativo' : 'Desativado'}</strong>
          </article>
          <article>
            <span>Modo silencio</span>
            <strong>{form.quietHours ? 'Ligado' : 'Desligado'}</strong>
          </article>
        </div>
      </section>

      <form className={styles.layout} onSubmit={handleSubmit}>
        <div className={styles.mainColumn}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>Controle geral</h3>
              <p>Ative ou pause todas as notificacoes com um toque.</p>
            </div>
            <NotificationSwitch
              checked={form.enabled}
              label="Notificacoes do perfil"
              hint="Quando desativado, os demais alertas ficam pausados."
              onChange={(next) => updateField('enabled', next)}
            />
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>Tipos de alerta</h3>
              <p>Escolha somente o que realmente importa na sua rotina.</p>
            </div>
            <div className={styles.switchList}>
              <NotificationSwitch
                checked={form.workout}
                label="Treinos e execucao"
                hint="Novos treinos, ajustes e feedback de treino."
                onChange={(next) => updateField('workout', next)}
                disabled={!form.enabled}
              />
              <NotificationSwitch
                checked={form.agenda}
                label="Agenda e lembretes"
                hint="Compromissos, confirmacoes e alteracoes de horario."
                onChange={(next) => updateField('agenda', next)}
                disabled={!form.enabled}
              />
              <NotificationSwitch
                checked={form.students}
                label="Alunos e vinculacoes"
                hint="Novos alunos, mudanca de status e vinculos."
                onChange={(next) => updateField('students', next)}
                disabled={!form.enabled}
              />
              <NotificationSwitch
                checked={form.payments}
                label="Financeiro"
                hint="Cobrancas, repasses e avisos de assinatura."
                onChange={(next) => updateField('payments', next)}
                disabled={!form.enabled}
              />
              <NotificationSwitch
                checked={form.system}
                label="Sistema e seguranca"
                hint="Alertas de acesso, atualizacoes e avisos operacionais."
                onChange={(next) => updateField('system', next)}
                disabled={!form.enabled}
              />
              <NotificationSwitch
                checked={form.product}
                label="Novidades do produto"
                hint="Melhorias, recursos novos e comunicados gerais."
                onChange={(next) => updateField('product', next)}
                disabled={!form.enabled}
              />
            </div>
          </section>
        </div>

        <aside className={styles.sideColumn}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>Canais de entrega</h3>
              <p>Escolha por onde deseja receber os alertas.</p>
            </div>
            <div className={styles.switchList}>
              <NotificationSwitch
                checked={form.pushWeb}
                label="Push no navegador"
                hint="Recebe alerta mesmo fora da tela atual."
                onChange={(next) => updateField('pushWeb', next)}
                disabled={!form.enabled}
              />
              <NotificationSwitch
                checked={form.email}
                label="Resumo por email"
                hint="Envia avisos relevantes para o seu email."
                onChange={(next) => updateField('email', next)}
                disabled={!form.enabled}
              />
            </div>
            <button
              className="button secondary sm"
              type="button"
              onClick={activatePush}
              disabled={pushLoading || !form.enabled}
            >
              {pushLoading ? 'Ativando push...' : 'Ativar push neste navegador'}
            </button>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>Horario de silencio</h3>
              <p>Defina um periodo sem interrupcao.</p>
            </div>
            <NotificationSwitch
              checked={form.quietHours}
              label="Usar modo silencio"
              hint="Pausa alertas nao criticos no periodo configurado."
              onChange={(next) => updateField('quietHours', next)}
              disabled={!form.enabled}
            />
            <div className={styles.timeGrid}>
              <label>
                Inicio
                <input
                  type="time"
                  value={form.quietStart}
                  onChange={(event) => updateField('quietStart', event.target.value)}
                  disabled={!form.enabled || !form.quietHours}
                />
              </label>
              <label>
                Fim
                <input
                  type="time"
                  value={form.quietEnd}
                  onChange={(event) => updateField('quietEnd', event.target.value)}
                  disabled={!form.enabled || !form.quietHours}
                />
              </label>
            </div>
          </section>
        </aside>

        <div className={styles.actions}>
          {error ? <p className={styles.error}>{error}</p> : null}
          {message ? <p className={styles.success}>{message}</p> : null}
          <button className="button" type="submit" disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar preferencias'}
          </button>
        </div>
      </form>
    </PageShell>
  );
}
