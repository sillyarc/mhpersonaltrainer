'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebaseClient';
import { useDocumentData, useUserScope } from '@/lib/firestoreHooks';
import styles from './ProfileInfoEditor.module.css';

type EditorTab = 'personal' | 'professional';

type ProfileInfoEditorProps = {
  includeProfessionalFields?: boolean;
  initialTab?: EditorTab;
  variant?: 'card' | 'plain';
};

type ProfileFormState = {
  displayName: string;
  phone: string;
  bio: string;
  cidade: string;
  estado: string;
  especializacao: string;
  cref: string;
  instagram: string;
  linkedin: string;
};

const EMPTY_FORM: ProfileFormState = {
  displayName: '',
  phone: '',
  bio: '',
  cidade: '',
  estado: '',
  especializacao: '',
  cref: '',
  instagram: '',
  linkedin: '',
};

const toText = (value: unknown) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const toSpecializationText = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).join(', ');
  }
  return toText(value);
};

export default function ProfileInfoEditor({
  includeProfessionalFields = false,
  initialTab = 'personal',
  variant = 'card',
}: ProfileInfoEditorProps) {
  const { user } = useAuth();
  const { userId } = useUserScope();
  const { data } = useDocumentData<Record<string, any>>(['users', userId]);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [activeTab, setActiveTab] = useState<EditorTab>(
    includeProfessionalFields && initialTab === 'professional' ? 'professional' : 'personal'
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!data && !user) return;
    setForm({
      displayName: toText(data?.display_name ?? data?.displayName ?? user?.displayName),
      phone: toText(data?.phone_number ?? data?.phoneNumber ?? user?.phoneNumber),
      bio: toText(data?.bio ?? user?.bio),
      cidade: toText(data?.cidade ?? data?.city ?? user?.cidade),
      estado: toText(data?.estado ?? data?.uf ?? data?.state ?? user?.estado),
      especializacao: toSpecializationText(data?.especializacao ?? user?.especializacao),
      cref: toText(data?.cref ?? user?.cref),
      instagram: toText(data?.instagram ?? user?.instagram),
      linkedin: toText(data?.linkedin ?? user?.linkedin),
    });
  }, [data, user]);

  const setField =
    (field: keyof ProfileFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
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
    const payload: Record<string, unknown> = {
      display_name: form.displayName.trim(),
      displayName: form.displayName.trim(),
      phone_number: form.phone.trim(),
      phoneNumber: form.phone.trim(),
      bio: form.bio.trim(),
      cidade: form.cidade.trim(),
      city: form.cidade.trim(),
      estado: form.estado.trim(),
      uf: form.estado.trim(),
      state: form.estado.trim(),
    };
    if (includeProfessionalFields) {
      payload.especializacao = form.especializacao.trim();
      payload.cref = form.cref.trim();
      payload.instagram = form.instagram.trim();
      payload.linkedin = form.linkedin.trim();
    }
    try {
      await updateDoc(doc(db, 'users', userId), payload);
      setMessage('Informacoes atualizadas com sucesso.');
    } catch (saveError) {
      console.error('Erro ao salvar perfil:', saveError);
      setError('Nao foi possivel salvar agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const showPersonalTab = !includeProfessionalFields || activeTab === 'personal';
  const showProfessionalTab = includeProfessionalFields && activeTab === 'professional';

  return (
    <div className={variant === 'card' ? `card ${styles.editor}` : styles.editor}>
      {includeProfessionalFields && (
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'personal' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('personal')}
          >
            Informacoes pessoais
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'professional' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('professional')}
          >
            Perfil profissional
          </button>
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        {showPersonalTab && (
          <section className={styles.section}>
            <h3>Informacoes do usuario</h3>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Nome completo</span>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={setField('displayName')}
                  placeholder="Seu nome"
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
                <input type="text" value={form.cidade} onChange={setField('cidade')} placeholder="Sao Paulo" />
              </label>
              <label className={styles.field}>
                <span>Estado</span>
                <input type="text" value={form.estado} onChange={setField('estado')} placeholder="SP" />
              </label>
            </div>
            <label className={styles.field}>
              <span>Bio</span>
              <textarea
                rows={4}
                value={form.bio}
                onChange={setField('bio')}
                placeholder="Conte um pouco sobre voce"
              />
            </label>
          </section>
        )}

        {showProfessionalTab && (
          <section className={styles.section}>
            <h3>Dados profissionais</h3>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Especialidade</span>
                <input
                  type="text"
                  value={form.especializacao}
                  onChange={setField('especializacao')}
                  placeholder="Hipertrofia, emagrecimento..."
                />
              </label>
              <label className={styles.field}>
                <span>Registro profissional</span>
                <input
                  type="text"
                  value={form.cref}
                  onChange={setField('cref')}
                  placeholder="CREF 000000"
                />
              </label>
              <label className={styles.field}>
                <span>Instagram</span>
                <input
                  type="text"
                  value={form.instagram}
                  onChange={setField('instagram')}
                  placeholder="@seuusuario"
                />
              </label>
              <label className={styles.field}>
                <span>LinkedIn</span>
                <input
                  type="text"
                  value={form.linkedin}
                  onChange={setField('linkedin')}
                  placeholder="linkedin.com/in/seuusuario"
                />
              </label>
            </div>
          </section>
        )}

        {message ? <p className={styles.success}>{message}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.actions}>
          <button className="button" type="submit" disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar alteracoes'}
          </button>
        </div>
      </form>
    </div>
  );
}
