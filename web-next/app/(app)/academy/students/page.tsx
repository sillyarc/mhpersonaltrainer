'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  collection,
  doc,
  getDocs,
  limit,
  query as firestoreQuery,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import PageShell from '@/components/PageShell';
import AcademyGate from '@/components/AcademyGate';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/firestoreHooks';
import { useAcademyData } from '@/lib/hooks/useAcademyData';
import { firestoreService } from '@/lib/services/firestoreService';
import { getFirebaseApp, getFirebaseDb, getSecondaryAuth } from '@/lib/services/firebase';
import { getMobileAppUrl } from '@/lib/mobileApp';

const normalizePersonalCode = (code?: string) => {
  if (!code) return null;
  const trimmed = code.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && String(numeric) === trimmed) {
    return numeric;
  }
  return trimmed;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const generatePassword = (length = 10) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)];
  }
  return output;
};

const getAuthErrorMessage = (code?: string) => {
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'Este email ja esta em uso.',
    'auth/invalid-email': 'Email invalido.',
    'auth/operation-not-allowed': 'Operacao nao permitida.',
    'auth/weak-password': 'Senha muito fraca. Use pelo menos 6 caracteres.',
    'auth/network-request-failed': 'Erro de conexao. Verifique sua internet.',
  };
  return messages[code || ''] || 'Erro ao criar aluno.';
};

const getInitials = (name?: string) => {
  if (!name) return 'AL';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '');
  return letters.join('') || 'AL';
};

const REGION = 'southamerica-east1';

const buildStudentInviteMessage = ({
  studentName,
  academyName,
  email,
  password,
  appLink,
  webLink,
}: {
  studentName: string;
  academyName?: string;
  email: string;
  password: string;
  appLink?: string;
  webLink?: string;
}) => {
  const greeting = studentName ? `Oi ${studentName},` : 'Oi!';
  const originLine = academyName
    ? `Seu acesso ao MH Personal Trainer foi criado pela ${academyName}.`
    : 'Seu acesso ao MH Personal Trainer foi criado pela sua academia.';
  const lines = [
    greeting,
    originLine,
    `Login: ${email}`,
    `Senha: ${password}`,
    appLink ? `Instale o app: ${appLink}` : null,
    webLink ? `Ou acesse pela web: ${webLink}` : null,
  ].filter(Boolean);
  return lines.join('\n');
};

export default function AcademyStudentsPage() {
  const { user } = useAuth();
  const {
    students,
    summary,
    personals,
    academyCodeRaw,
    loadingAcademy,
    academyError,
    reloadAcademy,
  } = useAcademyData();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [linkEmail, setLinkEmail] = useState('');
  const [linkPersonalSelect, setLinkPersonalSelect] = useState('');
  const [linkPersonalCodeInput, setLinkPersonalCodeInput] = useState('');
  const [linkByEmailMessage, setLinkByEmailMessage] = useState('');
  const [linkByEmailLoading, setLinkByEmailLoading] = useState(false);

  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPersonalSelect, setCreatePersonalSelect] = useState('');
  const [createPersonalCodeInput, setCreatePersonalCodeInput] = useState('');
  const [createMessage, setCreateMessage] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<null | { email: string; password: string }>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteFeedback, setInviteFeedback] = useState('');
  const [inviteEmailStatus, setInviteEmailStatus] = useState('');

  const functions = useMemo(() => getFunctions(getFirebaseApp(), REGION), []);
  const sendStudentInvite = useMemo(
    () => httpsCallable(functions, 'academySendStudentInvite'),
    [functions]
  );

  useEffect(() => {
    if (!linkPersonalSelect) return;
    const selected = personals.find((item) => item.id === linkPersonalSelect);
    if (selected?.codigoPersonal) {
      setLinkPersonalCodeInput(String(selected.codigoPersonal));
    }
  }, [linkPersonalSelect, personals]);

  useEffect(() => {
    if (!createPersonalSelect) return;
    const selected = personals.find((item) => item.id === createPersonalSelect);
    if (selected?.codigoPersonal) {
      setCreatePersonalCodeInput(String(selected.codigoPersonal));
    }
  }, [createPersonalSelect, personals]);

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    let result = students;
    if (statusFilter === 'ativo') {
      result = result.filter((student) => student.status === 'ativo');
    }
    if (statusFilter === 'inativo') {
      result = result.filter((student) => student.status === 'inativo');
    }
    if (statusFilter === 'sem-personal') {
      result = result.filter((student) => !student.codigoPersonal);
    }
    if (!term) return result;
    return result.filter((student) => {
      const name = student.name.toLowerCase();
      const email = (student.email || '').toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [searchQuery, students, statusFilter]);

  const handleGeneratePassword = () => {
    const password = generatePassword();
    setCreatePassword(password);
    setCreateMessage('');
  };

  const closeInviteModal = () => {
    setInviteModalOpen(false);
    setInviteFeedback('');
    setInviteEmailStatus('');
  };

  const handleCopyInvite = async () => {
    if (!inviteMessage) return;
    try {
      await navigator.clipboard.writeText(inviteMessage);
      setInviteFeedback('Mensagem copiada!');
    } catch (_) {
      setInviteFeedback('Nao foi possivel copiar a mensagem.');
    } finally {
      window.setTimeout(() => setInviteFeedback(''), 2200);
    }
  };

  const handleLinkByEmail = async () => {
    const email = normalizeEmail(linkEmail);
    if (!email) {
      setLinkByEmailMessage('Informe o email do aluno.');
      return;
    }

    const personalCode = normalizePersonalCode(linkPersonalCodeInput);
    if (linkPersonalSelect && !personalCode) {
      setLinkByEmailMessage('Codigo do personal invalido.');
      return;
    }

    setLinkByEmailLoading(true);
    setLinkByEmailMessage('');
    try {
      const db = getFirebaseDb();
      const snapshot = await getDocs(
        firestoreQuery(collection(db, 'users'), where('email', '==', email), limit(1))
      );
      if (snapshot.empty) {
        setLinkByEmailMessage('Aluno nao encontrado. Crie o aluno abaixo.');
        return;
      }

      const docSnap = snapshot.docs[0];
      const data = docSnap.data();
      if (data?.professorAccount || data?.academyAccount || data?.admin) {
        setLinkByEmailMessage('Este email pertence a outra conta.');
        return;
      }

      const selectedPersonal = personals.find((item) => item.id === linkPersonalSelect);
      let personalNameFromCapacity = '';
      if (personalCode) {
        const capacity = await firestoreService.getPersonalStudentCapacityByCode(personalCode, {
          excludeUserId: docSnap.id,
        });
        if (!capacity.allowed) {
          setLinkByEmailMessage(
            capacity.reason === 'personal_not_found'
              ? 'Codigo do personal nao encontrado.'
              : 'Esse personal atingiu o limite de 4 alunos no plano gratuito. Peca para ele assinar o Premium para liberar alunos ilimitados.'
          );
          return;
        }
        personalNameFromCapacity = capacity.personalName;
      }

      const updates: Record<string, any> = {
        academyId: user?.uid || null,
        vinculadoPorAcademia: true,
        personalVinculadoEm: serverTimestamp(),
      };
      if (academyCodeRaw) updates.codigoAcademia = academyCodeRaw;
      if (personalCode) updates.codigoPersonal = personalCode;
      if (selectedPersonal?.displayName || personalNameFromCapacity) {
        updates.nameDoSeuPersonal = selectedPersonal?.displayName || personalNameFromCapacity;
      }

      await updateDoc(doc(db, 'users', docSnap.id), updates);
      setLinkByEmailMessage('Aluno vinculado com sucesso.');
      setLinkEmail('');
      setLinkPersonalSelect('');
      setLinkPersonalCodeInput('');
      await reloadAcademy();
    } catch (err: any) {
      setLinkByEmailMessage(err?.message || 'Erro ao vincular aluno.');
    } finally {
      setLinkByEmailLoading(false);
    }
  };

  const handleCreateStudent = async () => {
    const name = createName.trim();
    const email = normalizeEmail(createEmail);
    const password = createPassword.trim();
    if (!name) {
      setCreateMessage('Informe o nome do aluno.');
      return;
    }
    if (!email) {
      setCreateMessage('Informe o email do aluno.');
      return;
    }
    if (!password) {
      setCreateMessage('Defina uma senha para o aluno.');
      return;
    }

    const personalCode = normalizePersonalCode(createPersonalCodeInput);
    if (createPersonalSelect && !personalCode) {
      setCreateMessage('Codigo do personal invalido.');
      return;
    }

    let secondaryAuth: ReturnType<typeof getSecondaryAuth> | null = null;
    setCreateLoading(true);
    setCreateMessage('');
    setCreatedCredentials(null);
    try {
      const db = getFirebaseDb();
      const existing = await getDocs(
        firestoreQuery(collection(db, 'users'), where('email', '==', email), limit(1))
      );
      if (!existing.empty) {
        setCreateMessage('Este email ja existe. Use a opcao de vinculo por email.');
        return;
      }

      const selectedPersonal = personals.find((item) => item.id === createPersonalSelect);
      let personalNameFromCapacity = '';
      if (personalCode) {
        const capacity = await firestoreService.getPersonalStudentCapacityByCode(personalCode);
        if (!capacity.allowed) {
          setCreateMessage(
            capacity.reason === 'personal_not_found'
              ? 'Codigo do personal nao encontrado.'
              : 'Esse personal atingiu o limite de 4 alunos no plano gratuito. Peca para ele assinar o Premium para liberar alunos ilimitados.'
          );
          return;
        }
        personalNameFromCapacity = capacity.personalName;
      }

      secondaryAuth = getSecondaryAuth();
      const result = await createUserWithEmailAndPassword(secondaryAuth, email, password);

      const payload: Record<string, any> = {
        uid: result.user.uid,
        email,
        display_name: name,
        created_time: serverTimestamp(),
        last_active_time: serverTimestamp(),
        professorAccount: false,
        academyAccount: false,
        admin: false,
        assinatura: false,
        planoChatGPT: false,
        acessoSuspenso: false,
        academyId: user?.uid || null,
        vinculadoPorAcademia: true,
        personalVinculadoEm: serverTimestamp(),
        alunoDesde: serverTimestamp(),
      };
      if (academyCodeRaw) payload.codigoAcademia = academyCodeRaw;
      if (personalCode) payload.codigoPersonal = personalCode;
      if (selectedPersonal?.displayName || personalNameFromCapacity) {
        payload.nameDoSeuPersonal = selectedPersonal?.displayName || personalNameFromCapacity;
      }

      await setDoc(doc(db, 'users', result.user.uid), payload);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const webLink = origin ? `${origin}/login-aluno` : '';
      const appLink = getMobileAppUrl('/login');
      const academyLabel = user?.displayName || user?.email || '';
      const inviteText = buildStudentInviteMessage({
        studentName: name,
        academyName: academyLabel,
        email,
        password,
        appLink: appLink || undefined,
        webLink: webLink || undefined,
      });
      setInviteMessage(inviteText);
      setInviteFeedback('');
      setInviteEmailStatus('');
      setInviteModalOpen(true);

      let emailFeedback = '';
      try {
        setInviteEmailStatus('Enviando email para o aluno...');
        await sendStudentInvite({
          to: email,
          subject: 'Seu acesso ao MH Personal Trainer',
          text: inviteText,
        });
        setInviteEmailStatus('Email enviado para o aluno.');
        emailFeedback = 'Email enviado ao aluno.';
      } catch (err: any) {
        setInviteEmailStatus('Nao foi possivel enviar o email automaticamente.');
        emailFeedback = 'Email nao enviado. Copie a mensagem.';
      }

      setCreateMessage(
        emailFeedback
          ? `Aluno criado e vinculado com sucesso. ${emailFeedback}`
          : 'Aluno criado e vinculado com sucesso.'
      );
      setCreatedCredentials({ email, password });
      setCreateName('');
      setCreateEmail('');
      setCreatePassword('');
      setCreatePersonalSelect('');
      setCreatePersonalCodeInput('');
      await reloadAcademy();
    } catch (err: any) {
      setCreateMessage(getAuthErrorMessage(err?.code));
    } finally {
      if (secondaryAuth) {
        await signOut(secondaryAuth);
      }
      setCreateLoading(false);
    }
  };

  return (
    <PageShell
      title="Alunos da academia"
      description="Crie acessos, vincule por email e acompanhe a base de alunos."
      actions={[
        { label: 'Criar aluno', href: '#create-student' },
        { label: 'Vincular por email', href: '#link-student' },
        { label: 'Vincular com personal', href: '/academy/linking' },
      ]}
    >
      <AcademyGate>
        {academyError && (
          <div className="academy-alert is-danger" style={{ marginBottom: 20 }}>
            <div>
              <strong>Erro ao carregar</strong>
              <span>{academyError}</span>
            </div>
          </div>
        )}

        {inviteModalOpen && (
          <div className="academy-invite-overlay" onClick={closeInviteModal}>
            <div className="academy-invite-modal" onClick={(event) => event.stopPropagation()}>
              <div className="academy-invite-header">
                <div>
                  <span>Login criado</span>
                  <h3>Mensagem pronta para o aluno</h3>
                  <p className="subtle">
                    Copie a frase completa com o link para instalar o app ou abrir na web.
                  </p>
                </div>
                <button type="button" className="academy-invite-close" onClick={closeInviteModal}>
                  Fechar
                </button>
              </div>
              <div className="academy-invite-body">
                <label className="academy-invite-label">
                  <span>Mensagem</span>
                  <textarea
                    className="academy-invite-textarea"
                    value={inviteMessage}
                    readOnly
                    rows={6}
                  />
                </label>
                {inviteEmailStatus && (
                  <span className="academy-invite-status">{inviteEmailStatus}</span>
                )}
                {inviteFeedback && <span className="academy-copy-feedback">{inviteFeedback}</span>}
              </div>
              <div className="academy-invite-actions">
                <button
                  type="button"
                  className="button"
                  onClick={handleCopyInvite}
                  disabled={!inviteMessage}
                >
                  Copiar mensagem
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={closeInviteModal}
                >
                  Concluir
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="academy-dashboard academy-revamp academy-students-page academy-enroll">
          <section className="academy-enroll-hero">
            <div className="academy-enroll-hero-main">
              <p className="academy-enroll-kicker">Operacao de alunos</p>
              <h2>Gestao completa de cadastro, vinculo e acesso</h2>
              <p className="subtle">
                Crie alunos, vincule por email e acompanhe status em uma tela operacional direta para a
                recepcao.
              </p>
              <div className="academy-enroll-metrics">
                <div>
                  <span>Total de alunos</span>
                  <strong>{loadingAcademy ? '...' : summary.totalStudents}</strong>
                </div>
                <div>
                  <span>Ativos</span>
                  <strong>{loadingAcademy ? '...' : summary.activeStudents}</strong>
                </div>
                <div>
                  <span>Sem personal</span>
                  <strong>{loadingAcademy ? '...' : summary.unassignedStudents}</strong>
                </div>
                <div>
                  <span>Personais</span>
                  <strong>{loadingAcademy ? '...' : personals.length}</strong>
                </div>
              </div>
            </div>
            <aside className="academy-enroll-hero-side">
              <div className="academy-enroll-quick-actions">
                <a href="#create-student" className="button">
                  Criar aluno
                </a>
                <a href="#link-student" className="button secondary">
                  Vincular por email
                </a>
                <Link href="/academy/linking" className="button secondary">
                  Gerenciar vinculos
                </Link>
              </div>
            </aside>
          </section>
          <section className="academy-enroll-workflow">
            <article id="create-student" className="academy-enroll-panel">
              <header className="academy-enroll-panel-head">
                <p className="academy-enroll-kicker">Novo aluno</p>
                <h3>Criar login e acesso imediato</h3>
                <p className="subtle">Gera email e senha inicial para o aluno entrar no app.</p>
              </header>
              <div className="academy-enroll-form">
                <div className="academy-enroll-form-row">
                  <label>
                    <span>Nome do aluno</span>
                    <input
                      value={createName}
                      onChange={(event) => setCreateName(event.target.value)}
                      placeholder="Ex: Maria Silva"
                    />
                  </label>
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={createEmail}
                      onChange={(event) => setCreateEmail(event.target.value)}
                      placeholder="maria@email.com"
                    />
                  </label>
                </div>
                <label>
                  <span>Senha inicial</span>
                  <div className="academy-enroll-inline-input">
                    <input
                      value={createPassword}
                      onChange={(event) => setCreatePassword(event.target.value)}
                      placeholder="Minimo 6 caracteres"
                    />
                    <button
                      type="button"
                      className="button secondary sm"
                      onClick={handleGeneratePassword}
                    >
                      Gerar senha
                    </button>
                  </div>
                </label>
                <div className="academy-enroll-form-row">
                  <label>
                    <span>Personal da academia</span>
                    <select
                      value={createPersonalSelect}
                      onChange={(event) => setCreatePersonalSelect(event.target.value)}
                    >
                      <option value="">Selecionar personal</option>
                      {personals.map((personal) => (
                        <option key={personal.id} value={personal.id}>
                          {personal.displayName} - {personal.codigoPersonal ?? '--'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Codigo do personal</span>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={createPersonalCodeInput}
                      onChange={(event) => setCreatePersonalCodeInput(event.target.value)}
                    />
                  </label>
                </div>
                <div className="academy-enroll-form-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={handleCreateStudent}
                    disabled={createLoading}
                  >
                    {createLoading ? 'Criando...' : 'Criar aluno'}
                  </button>
                  <span className="academy-enroll-help">
                    Compartilhe email e senha com o aluno para o primeiro acesso.
                  </span>
                </div>
                {createMessage && <span className="academy-form-feedback">{createMessage}</span>}
                {createdCredentials && (
                  <div className="academy-credential-card">
                    <strong>Login criado</strong>
                    <span>Email: {createdCredentials.email}</span>
                    <span>Senha: {createdCredentials.password}</span>
                  </div>
                )}
              </div>
            </article>
            <article id="link-student" className="academy-enroll-panel">
              <header className="academy-enroll-panel-head">
                <p className="academy-enroll-kicker">Vinculo rapido</p>
                <h3>Conectar aluno ja existente</h3>
                <p className="subtle">Busca por email e conecta o aluno ao painel da academia.</p>
              </header>
              <div className="academy-enroll-form">
                <label>
                  <span>Email do aluno</span>
                  <input
                    type="email"
                    value={linkEmail}
                    onChange={(event) => setLinkEmail(event.target.value)}
                    placeholder="aluno@email.com"
                  />
                </label>
                <div className="academy-enroll-form-row">
                  <label>
                    <span>Personal da academia</span>
                    <select
                      value={linkPersonalSelect}
                      onChange={(event) => setLinkPersonalSelect(event.target.value)}
                    >
                      <option value="">Selecionar personal</option>
                      {personals.map((personal) => (
                        <option key={personal.id} value={personal.id}>
                          {personal.displayName} - {personal.codigoPersonal ?? '--'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Codigo do personal</span>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={linkPersonalCodeInput}
                      onChange={(event) => setLinkPersonalCodeInput(event.target.value)}
                    />
                  </label>
                </div>
                <div className="academy-enroll-form-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={handleLinkByEmail}
                    disabled={linkByEmailLoading}
                  >
                    {linkByEmailLoading ? 'Vinculando...' : 'Vincular aluno'}
                  </button>
                </div>
                {linkByEmailMessage && (
                  <span className="academy-form-feedback">{linkByEmailMessage}</span>
                )}
              </div>
            </article>
          </section>
          <section className="academy-enroll-registry">
            <header className="academy-enroll-registry-head">
              <div>
                <p className="academy-enroll-kicker">Base de alunos</p>
                <h3>Controle de status e vinculos</h3>
                <p className="subtle">Acompanhe cada aluno com filtros operacionais.</p>
              </div>
              <div className="academy-enroll-registry-filters">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar por nome ou email"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="ativo">Ativos</option>
                  <option value="inativo">Inativos</option>
                  <option value="sem-personal">Sem personal</option>
                </select>
              </div>
            </header>
            <span className="academy-enroll-count">
              {loadingAcademy ? 'Carregando alunos...' : `Mostrando ${filtered.length} de ${students.length}`}
            </span>
            {loadingAcademy ? (
              <p className="subtle">Carregando alunos...</p>
            ) : filtered.length ? (
              <div className="academy-enroll-students">
                {filtered.map((student) => {
                  const lastActivity = student.lastActive || student.personalVinculadoEm || student.createdAt;
                  return (
                    <article key={student.id} className="academy-enroll-student">
                      <div className="academy-enroll-student-main">
                        <div className="academy-enroll-avatar">
                          {student.photoUrl ? (
                            <img src={student.photoUrl} alt={student.name} />
                          ) : (
                            <span>{getInitials(student.name)}</span>
                          )}
                        </div>
                        <div className="academy-enroll-student-copy">
                          <strong>{student.name}</strong>
                          <span>{student.email || 'Email nao informado'}</span>
                          <small>
                            Ultima atividade: {lastActivity ? formatDate(lastActivity) : 'Sem dados'}
                          </small>
                        </div>
                      </div>
                      <div className="academy-enroll-student-status">
                        <span className={`academy-pill ${student.status === 'ativo' ? 'is-paid' : 'is-pending'}`}>
                          {student.status === 'ativo' ? 'Ativo' : 'Inativo'}
                        </span>
                        <span className="academy-pill">
                          {student.vinculadoPorAcademia ? 'Academia' : 'Externo'}
                        </span>
                        <span className={`academy-pill ${student.codigoPersonal ? '' : 'is-pending'}`}>
                          {student.codigoPersonal ? `Personal ${student.codigoPersonal}` : 'Sem personal'}
                        </span>
                        {student.goal && <span className="academy-pill">Objetivo {student.goal}</span>}
                        {student.level && <span className="academy-pill">Nivel {student.level}</span>}
                      </div>
                      <div className="academy-enroll-student-meta">
                        <span>
                          Vinculado: {student.personalVinculadoEm ? formatDate(student.personalVinculadoEm) : 'Sem data'}
                        </span>
                      </div>
                      <div className="academy-enroll-student-actions">
                        <Link href={`/students/${student.id}`} className="button secondary sm">
                          Ver aluno
                        </Link>
                        <Link href="/academy/linking" className="button secondary sm">
                          Vincular
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="subtle">Nenhum aluno encontrado.</p>
            )}
          </section>
        </div>
      </AcademyGate>
    </PageShell>
  );
}
