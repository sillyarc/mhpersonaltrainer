'use client';

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebaseClient';
import { useDocumentData } from '@/lib/firestoreHooks';
import styles from './AdminProfileCompletionSheet.module.css';

type AdminProfileFormState = {
  displayName: string;
  roleTitle: string;
  phone: string;
  cidade: string;
  estado: string;
  bio: string;
};

const EMPTY_FORM: AdminProfileFormState = {
  displayName: '',
  roleTitle: '',
  phone: '',
  cidade: '',
  estado: '',
  bio: '',
};

const toText = (value: unknown) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

export default function AdminProfileCompletionSheet() {
  const { user, role, refreshUser } = useAuth();
  const adminUid = role === 'admin' ? user?.uid || '' : '';
  const { data } = useDocumentData<Record<string, any>>(['users', adminUid]);

  const [form, setForm] = useState<AdminProfileFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);

  const currentDisplayName = useMemo(
    () => toText(data?.display_name ?? data?.displayName ?? user?.displayName),
    [data?.display_name, data?.displayName, user?.displayName]
  );

  const hasDisplayName = currentDisplayName.length > 0;
  const requiresProfileCompletion = role === 'admin' && Boolean(adminUid) && !hasDisplayName;
  const isOpen = requiresProfileCompletion && !dismissed;

  useEffect(() => {
    if (!requiresProfileCompletion) return;
    const roleTitle = toText(
      data?.funcaoAdmin ?? data?.funcao_admin ?? data?.funcao ?? data?.cargo ?? data?.roleTitle
    );
    setForm({
      displayName: toText(data?.display_name ?? data?.displayName ?? user?.displayName),
      roleTitle,
      phone: toText(data?.phone_number ?? data?.phoneNumber ?? user?.phoneNumber),
      cidade: toText(data?.cidade ?? data?.city ?? user?.cidade),
      estado: toText(data?.estado ?? data?.uf ?? data?.state ?? user?.estado),
      bio: toText(data?.bio ?? user?.bio),
    });
  }, [
    data?.bio,
    data?.cargo,
    data?.cidade,
    data?.city,
    data?.displayName,
    data?.display_name,
    data?.estado,
    data?.funcao,
    data?.funcaoAdmin,
    data?.funcao_admin,
    data?.phoneNumber,
    data?.phone_number,
    data?.roleTitle,
    data?.state,
    data?.uf,
    requiresProfileCompletion,
    user?.bio,
    user?.cidade,
    user?.displayName,
    user?.estado,
    user?.phoneNumber,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const body = document.body;
    const originalOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (requiresProfileCompletion) return;
    setDismissed(false);
  }, [requiresProfileCompletion]);

  const setField =
    (field: keyof AdminProfileFormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
    };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!adminUid) {
      setError('Usuario admin nao identificado.');
      return;
    }

    const normalizedName = form.displayName.trim();
    if (!normalizedName) {
      setError('Preencha o nome completo.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const roleTitle = form.roleTitle.trim();
      const phone = form.phone.trim();
      const cidade = form.cidade.trim();
      const estado = form.estado.trim();
      const bio = form.bio.trim();

      await updateDoc(doc(db, 'users', adminUid), {
        display_name: normalizedName,
        displayName: normalizedName,
        funcaoAdmin: roleTitle,
        funcao_admin: roleTitle,
        funcao: roleTitle,
        cargo: roleTitle,
        phone_number: phone,
        phoneNumber: phone,
        cidade,
        city: cidade,
        estado,
        uf: estado,
        state: estado,
        bio,
        adminProfileCompletedAt: serverTimestamp(),
        admin_profile_completed_at: serverTimestamp(),
      });

      await refreshUser();
      setMessage('Perfil admin atualizado com sucesso.');
    } catch (submitError) {
      setError('Nao foi possivel salvar o perfil agora.');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    if (loading) return;
    setDismissed(true);
    setError('');
    setMessage('');
  };

  if (!isOpen) return null;

  return (
    <div className={styles.sheet}>
      <button
        type="button"
        className={styles.overlay}
        onClick={handleDismiss}
        aria-label="Fechar cadastro por agora"
      />
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="admin-profile-sheet-title">
        <div className={styles.handle} />
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <span className={styles.kicker}>Cadastro admin</span>
            <button type="button" className="button secondary sm" onClick={handleDismiss} disabled={loading}>
              Fechar
            </button>
          </div>
          <h2 id="admin-profile-sheet-title" className={styles.title}>
            Complete seu cadastro para continuar
          </h2>
          <p className={styles.description}>
            Para continuar no painel administrativo, preencha os dados basicos da sua conta.
          </p>
        </div>

        <div className={styles.layout}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span>
                  Nome completo <strong className={styles.required}>*</strong>
                </span>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={setField('displayName')}
                  placeholder="Seu nome no painel admin"
                />
              </label>
              <label className={styles.field}>
                <span>Funcao</span>
                <input
                  type="text"
                  value={form.roleTitle}
                  onChange={setField('roleTitle')}
                  placeholder="Coordenacao, suporte, financeiro..."
                />
              </label>
              <label className={styles.field}>
                <span>Telefone</span>
                <input
                  type="text"
                  value={form.phone}
                  onChange={setField('phone')}
                  placeholder="(11) 99999-9999"
                />
              </label>
              <label className={styles.field}>
                <span>Cidade</span>
                <input
                  type="text"
                  value={form.cidade}
                  onChange={setField('cidade')}
                  placeholder="Sao Paulo"
                />
              </label>
              <label className={styles.field}>
                <span>Estado</span>
                <input
                  type="text"
                  value={form.estado}
                  onChange={setField('estado')}
                  placeholder="SP"
                />
              </label>
            </div>
            <label className={styles.field}>
              <span>Bio curta</span>
              <textarea
                value={form.bio}
                onChange={setField('bio')}
                placeholder="Resumo rapido sobre sua atuacao no time admin."
              />
            </label>

            <p className={styles.hint}>
              Campo obrigatorio: nome completo. Os demais ajudam na organizacao interna da equipe.
            </p>

            {error ? <p className={`${styles.alert} ${styles.alertError}`}>{error}</p> : null}
            {message ? <p className={`${styles.alert} ${styles.alertSuccess}`}>{message}</p> : null}

            <div className={styles.actions}>
              <button type="submit" className="button" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar perfil admin'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
