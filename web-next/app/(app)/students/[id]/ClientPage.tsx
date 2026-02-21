'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import AiInsightsPanel from '@/components/AiInsightsPanel';
import { useAuth } from '@/lib/auth';
import { formatDate, useDocumentData } from '@/lib/firestoreHooks';
import { doc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebaseClient';
import { getStorageErrorMessage } from '@/lib/services/firebaseErrors';
import { firestoreService } from '@/lib/services/firestoreService';

interface StudentDoc {
  id: string;
  display_name?: string;
  email?: string;
  photo_url?: string;
  personal_photo_url?: string;
  phone_number?: string;
  cidade?: string;
  estado?: string;
  objetivoNoApp?: string;
  alunoDesde?: any;
  created_time?: any;
  last_active_time?: any;
  acessoSuspenso?: boolean;
  codigoPersonal?: string | number;
}

export default function StudentDetailPage({ params }: { params: { id: string } }) {
  const { user, role } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const studentId = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    return last && last !== 'students' ? last : params.id;
  }, [pathname, params.id]);
  const { data, loading } = useDocumentData<StudentDoc>(['users', studentId]);
  const isPersonal = role === 'personal' || role === 'professor';
  const [personalPhotoFile, setPersonalPhotoFile] = useState<File | null>(null);
  const [personalPhotoPreview, setPersonalPhotoPreview] = useState<string | null>(null);
  const [personalPhotoError, setPersonalPhotoError] = useState('');
  const [personalPhotoSuccess, setPersonalPhotoSuccess] = useState('');
  const [personalPhotoSaving, setPersonalPhotoSaving] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const name = data?.display_name || data?.email?.split('@')[0] || 'Aluno';
  const status = data?.acessoSuspenso ? 'inativo' : 'ativo';
  const createdAt = data?.alunoDesde ?? data?.created_time;
  const lastActive = data?.last_active_time;
  const personalPhotoUrl = data?.personal_photo_url;
  const personalPhotoDisplay = personalPhotoPreview || personalPhotoUrl || '';

  const handleOpenChat = async () => {
    if (!user?.uid || !data) return;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('mh:open-chat', {
          detail: {
            userId: studentId,
            name,
            photoUrl: data.photo_url,
          },
        })
      );
    }
  };

  const handleToggleStatus = async () => {
    if (!isPersonal || !user?.uid || !data) return;
    const isInactive = status === 'inativo';
    if (!isInactive) {
      const confirmed = window.confirm('Deseja desativar este aluno? Ele nao acessara o app.');
      if (!confirmed) return;
    }
    setActionLoading(true);
    setActionError('');
    setActionMessage('');
    try {
      await firestoreService.updateStudentStatus(
        studentId,
        isInactive,
        !isInactive
          ? {
              actorRole: 'personal',
              personalId: user.uid,
              personalName: user.displayName,
            }
          : undefined
      );
      setActionMessage(isInactive ? 'Aluno ativado.' : 'Aluno desativado.');
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao atualizar status.');
    } finally {
      setActionLoading(false);
      setTimeout(() => setActionMessage(''), 2200);
    }
  };

  const handleRemoveStudent = async () => {
    if (!isPersonal || !user?.uid || !data) return;
    const confirmed = window.confirm(
      'Deseja excluir este aluno da sua lista? A conta dele continuara ativa.'
    );
    if (!confirmed) return;
    setActionLoading(true);
    setActionError('');
    setActionMessage('');
    try {
      await firestoreService.removeStudentFromPersonal(user.uid, studentId);
      setActionMessage('Aluno removido da sua lista.');
      router.push('/students');
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao remover aluno.');
    } finally {
      setActionLoading(false);
      setTimeout(() => setActionMessage(''), 2200);
    }
  };

  useEffect(() => {
    if (!personalPhotoFile) {
      setPersonalPhotoPreview(null);
      return;
    }
    const preview = URL.createObjectURL(personalPhotoFile);
    setPersonalPhotoPreview(preview);
    return () => {
      URL.revokeObjectURL(preview);
    };
  }, [personalPhotoFile]);

  const handleSavePersonalPhoto = async () => {
    if (!isPersonal || !user?.uid || !personalPhotoFile) return;
    setPersonalPhotoSaving(true);
    setPersonalPhotoError('');
    setPersonalPhotoSuccess('');
    try {
      const safeName = name.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'aluno';
      const storageRef = ref(
        storage,
        `users/${studentId}/personal-photo/${user.uid}/${safeName}-${Date.now()}-${personalPhotoFile.name}`
      );
      const upload = await uploadBytes(storageRef, personalPhotoFile);
      const url = await getDownloadURL(upload.ref);
      await updateDoc(doc(db, 'users', studentId), {
        personal_photo_url: url,
        personal_photo_updated_at: serverTimestamp(),
        personal_photo_updated_by: user.uid,
      });
      setPersonalPhotoSuccess('Foto personalizada salva.');
      setPersonalPhotoFile(null);
    } catch (err: any) {
      setPersonalPhotoError(getStorageErrorMessage(err, 'Erro ao enviar foto.'));
    } finally {
      setPersonalPhotoSaving(false);
    }
  };

  const handleRemovePersonalPhoto = async () => {
    if (!isPersonal || !user?.uid || !personalPhotoUrl) return;
    setPersonalPhotoSaving(true);
    setPersonalPhotoError('');
    setPersonalPhotoSuccess('');
    try {
      await updateDoc(doc(db, 'users', studentId), {
        personal_photo_url: deleteField(),
        personal_photo_updated_at: serverTimestamp(),
        personal_photo_updated_by: user.uid,
      });
      setPersonalPhotoSuccess('Foto personalizada removida.');
    } catch (err: any) {
      setPersonalPhotoError(err.message || 'Erro ao remover foto.');
    } finally {
      setPersonalPhotoSaving(false);
    }
  };

  return (
    <PageShell
      title={name}
      description="Informacoes do aluno e atalhos rapidos."
      breadcrumbs={[{ label: 'Alunos', href: '/students' }]}
    >
      {loading && (
        <div className="card">
          <p className="subtle">Carregando...</p>
        </div>
      )}
      {!loading && !data && (
        <div className="card">
          <p className="subtle">Aluno nao encontrado.</p>
        </div>
      )}
      {!loading && data && (
        <div className="student-profile">
          <div className="portal-card portal-card--highlight student-profile-hero">
            <div className="student-profile-hero-main">
              <div className="student-profile-avatar-stack">
                <div className="student-profile-avatar is-student">
                  {data.photo_url ? (
                    <img src={data.photo_url} alt={name} />
                  ) : (
                    <span>{name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="student-profile-avatar is-personal">
                  {personalPhotoDisplay ? (
                    <img src={personalPhotoDisplay} alt={`${name} personalizado`} />
                  ) : (
                    <span>{name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
              </div>
              <div className="student-profile-identity">
                <div className="student-profile-title-row">
                  <p className="pill">Aluno</p>
                  <span className={`students-status is-${status}`}>{status}</span>
                  {data.codigoPersonal && (
                    <span className="portal-tag">Personal {String(data.codigoPersonal)}</span>
                  )}
                </div>
                <h2>{name}</h2>
                <p className="subtle">{data.email || 'Email nao informado'}</p>
                <div className="student-profile-avatar-legend">
                  <span className="student-profile-avatar-dot is-personal">Personal</span>
                  <span className="student-profile-avatar-dot is-student">Aluno real</span>
                </div>
              </div>
              <div className="student-profile-hero-actions">
                <Link
                  href={`/workout/create?studentId=${studentId}`}
                  className="button"
                >
                  Adicionar treino
                </Link>
                <Link href="/evaluations/create" className="button secondary">
                  Nova avaliacao
                </Link>
                {isPersonal && (
                  <button type="button" className="button secondary" onClick={handleOpenChat}>
                    Abrir chat
                  </button>
                )}
                {isPersonal && (
                  <div className="student-profile-actions-menu">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => setActionMenuOpen((prev) => !prev)}
                    >
                      Acoes
                    </button>
                    {actionMenuOpen && (
                      <div className="student-profile-actions-popover">
                        <button
                          type="button"
                          className={`button ghost sm ${
                            status === 'inativo' ? 'is-success' : 'is-warning'
                          }`}
                          onClick={() => {
                            setActionMenuOpen(false);
                            handleToggleStatus();
                          }}
                          disabled={actionLoading}
                        >
                          {actionLoading ? 'Salvando...' : status === 'inativo' ? 'Ativar' : 'Desativar'}
                        </button>
                        <button
                          type="button"
                          className="button ghost sm is-danger"
                          onClick={() => {
                            setActionMenuOpen(false);
                            handleRemoveStudent();
                          }}
                          disabled={actionLoading}
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {(actionMessage || actionError) && (
                  <span className={`student-profile-action-feedback ${actionError ? 'is-error' : ''}`}>
                    {actionError || actionMessage}
                  </span>
                )}
              </div>
            </div>
            <div className="student-profile-hero-metrics">
              <div className="student-profile-metric">
                <span>Telefone</span>
                <strong>{data.phone_number || '-'}</strong>
              </div>
              <div className="student-profile-metric">
                <span>Cidade</span>
                <strong>
                  {[data.cidade, data.estado].filter(Boolean).join(' / ') || '-'}
                </strong>
              </div>
              <div className="student-profile-metric">
                <span>Objetivo</span>
                <strong>{data.objetivoNoApp || '-'}</strong>
              </div>
              <div className="student-profile-metric">
                <span>Aluno desde</span>
                <strong>{formatDate(createdAt)}</strong>
              </div>
              <div className="student-profile-metric">
                <span>Ultimo acesso</span>
                <strong>{formatDate(lastActive)}</strong>
              </div>
              <div className="student-profile-metric">
                <span>UID do aluno</span>
                <strong>{studentId}</strong>
              </div>
            </div>
          </div>

          <div className="student-profile-grid">
            <div className="student-profile-main">
              <div className="portal-card student-profile-card student-profile-actions-card">
                <div className="student-profile-section-header">
                  <div>
                    <h3>Operacoes do aluno</h3>
                    <p className="subtle">
                      Treinos, avaliacoes, documentos e insights para evoluir o aluno.
                    </p>
                  </div>
                </div>
                <div className="student-profile-actions-grid">
                  <Link
                    href={`/workouts?studentId=${studentId}`}
                    className="student-profile-action"
                  >
                    Treinos do aluno
                    <span>Veja rotina ativa e historico.</span>
                  </Link>
                  <Link href="/evaluations" className="student-profile-action">
                    Avaliacoes
                    <span>Acesse o historico e status.</span>
                  </Link>
                  <Link href="/documents/aluno" className="student-profile-action">
                    Documentos
                    <span>Arquivos, laudos e anexos.</span>
                  </Link>
                  <Link href="/progress" className="student-profile-action">
                    Progresso
                    <span>Graficos de evolucao do aluno.</span>
                  </Link>
                  <Link
                    href={`/ai/assistant?prompt=${encodeURIComponent(
                      `Resumo rapido da evolucao do aluno ${name}.`
                    )}`}
                    className="student-profile-action"
                  >
                    Assistente IA
                    <span>Gere resumos e planos inteligentes.</span>
                  </Link>
                </div>
              </div>

              <AiInsightsPanel
                initialStudentId={studentId}
                studentLabel={name}
                lockStudent
                className="student-profile-ai"
              />
            </div>

            <div className="student-profile-side">
              <div className="portal-card student-profile-card student-profile-photo-card">
                <div className="student-profile-section-header">
                  <div>
                    <h3>Foto definida pelo personal</h3>
                    <p className="subtle">
                      Essa foto aparece na lista de alunos e no seu painel inicial.
                    </p>
                  </div>
                </div>
                <div className="student-profile-photo-preview">
                  <div className="student-profile-avatar-stack is-compact">
                    <div className="student-profile-avatar is-student">
                      {data.photo_url ? (
                        <img src={data.photo_url} alt={name} />
                      ) : (
                        <span>{name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="student-profile-avatar is-personal">
                      {personalPhotoDisplay ? (
                        <img src={personalPhotoDisplay} alt={`${name} personalizado`} />
                      ) : (
                        <span>{name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                  </div>
                  <div className="student-profile-photo-info">
                    <strong>
                      {personalPhotoDisplay ? 'Foto personalizada ativa' : 'Sem foto personalizada'}
                    </strong>
                    <span className="subtle">
                      {personalPhotoFile
                        ? `${personalPhotoFile.name} - ${(personalPhotoFile.size / 1024 / 1024).toFixed(2)} MB`
                        : 'Envie uma imagem para destacar este aluno.'}
                    </span>
                    <div className="student-profile-avatar-legend">
                      <span className="student-profile-avatar-dot is-personal">Personal</span>
                      <span className="student-profile-avatar-dot is-student">Aluno real</span>
                    </div>
                  </div>
                </div>
                {isPersonal ? (
                  <>
                    <input
                      className="student-profile-file"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        setPersonalPhotoFile(event.target.files?.[0] || null);
                        setPersonalPhotoError('');
                        setPersonalPhotoSuccess('');
                      }}
                      disabled={personalPhotoSaving}
                    />
                    <div className="student-profile-photo-actions">
                      <button
                        className="button"
                        type="button"
                        onClick={handleSavePersonalPhoto}
                        disabled={!personalPhotoFile || personalPhotoSaving}
                      >
                        {personalPhotoSaving ? 'Salvando...' : 'Salvar foto'}
                      </button>
                      {personalPhotoUrl && (
                        <button
                          className="button secondary"
                          type="button"
                          onClick={handleRemovePersonalPhoto}
                          disabled={personalPhotoSaving}
                        >
                          Remover foto
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="subtle">Somente o personal pode enviar uma foto personalizada.</p>
                )}
                {personalPhotoError && <p className="student-profile-error">{personalPhotoError}</p>}
                {personalPhotoSuccess && <p className="student-profile-success">{personalPhotoSuccess}</p>}
              </div>

              <div className="portal-card student-profile-card student-profile-summary-card">
                <div className="student-profile-section-header">
                  <div>
                    <h3>Resumo rapido</h3>
                    <p className="subtle">Informacoes chave para acompanhar o aluno.</p>
                  </div>
                </div>
                <div className="student-profile-summary-grid">
                  <div>
                    <span>Status</span>
                    <strong className={`students-status is-${status}`}>{status}</strong>
                  </div>
                  <div>
                    <span>Aluno desde</span>
                    <strong>{formatDate(createdAt)}</strong>
                  </div>
                  <div>
                    <span>Ultimo acesso</span>
                    <strong>{formatDate(lastActive)}</strong>
                  </div>
                  <div>
                    <span>Objetivo</span>
                    <strong>{data.objetivoNoApp || '-'}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
