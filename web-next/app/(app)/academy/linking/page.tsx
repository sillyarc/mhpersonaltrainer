'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import PageShell from '@/components/PageShell';
import AcademyGate from '@/components/AcademyGate';
import { useAuth } from '@/lib/auth';
import { useAcademyData } from '@/lib/hooks/useAcademyData';
import { getFirebaseDb } from '@/lib/services/firebase';
import { firestoreService, type PersonalProfile } from '@/lib/services/firestoreService';
import styles from './page.module.css';

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

const hasNegativeTone = (value: string) =>
  /(erro|inval|nao|atingiu|selecione|informe)/i.test(value);

export default function AcademyLinkingPage() {
  const { user } = useAuth();
  const {
    academyCodeRaw,
    personals,
    students,
    loadingAcademy,
    academyError,
    reloadAcademy,
  } = useAcademyData();

  const [allPersonals, setAllPersonals] = useState<PersonalProfile[]>([]);
  const [loadingAllPersonals, setLoadingAllPersonals] = useState(false);
  const [linkPersonalId, setLinkPersonalId] = useState('');
  const [linkPersonalMessage, setLinkPersonalMessage] = useState('');
  const [linkPersonalLoading, setLinkPersonalLoading] = useState(false);

  const [linkStudentId, setLinkStudentId] = useState('');
  const [linkPersonalSelect, setLinkPersonalSelect] = useState('');
  const [linkPersonalCodeInput, setLinkPersonalCodeInput] = useState('');
  const [linkStudentMessage, setLinkStudentMessage] = useState('');
  const [linkStudentLoading, setLinkStudentLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingAllPersonals(true);
    firestoreService
      .fetchPersonals(200)
      .then((data) => {
        if (!active) return;
        setAllPersonals(data);
      })
      .finally(() => {
        if (active) setLoadingAllPersonals(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!linkPersonalSelect) return;
    const selected = personals.find((item) => item.id === linkPersonalSelect);
    if (selected?.codigoPersonal) {
      setLinkPersonalCodeInput(String(selected.codigoPersonal));
    }
  }, [linkPersonalSelect, personals]);

  const availablePersonals = useMemo(() => {
    const existing = new Set(personals.map((item) => item.id));
    return allPersonals.filter((item) => !existing.has(item.id));
  }, [allPersonals, personals]);

  const availableCount = availablePersonals.length;
  const unassignedCount = students.filter((student) => !student.codigoPersonal).length;
  const assignedCount = students.length - unassignedCount;

  const handleLinkPersonal = async () => {
    if (!linkPersonalId) {
      setLinkPersonalMessage('Selecione um personal.');
      return;
    }

    setLinkPersonalLoading(true);
    setLinkPersonalMessage('');
    try {
      const db = getFirebaseDb();
      const payload: Record<string, any> = {
        academyId: user?.uid || null,
        academyLinkedAt: serverTimestamp(),
      };
      if (academyCodeRaw) payload.codigoAcademia = academyCodeRaw;
      await updateDoc(doc(db, 'users', linkPersonalId), payload);
      setLinkPersonalMessage('Personal vinculado com sucesso.');
      setLinkPersonalId('');
      await reloadAcademy();
    } catch (err: any) {
      setLinkPersonalMessage(err.message || 'Erro ao vincular personal.');
    } finally {
      setLinkPersonalLoading(false);
    }
  };

  const handleLinkStudent = async () => {
    if (!linkStudentId) {
      setLinkStudentMessage('Selecione um aluno.');
      return;
    }
    if (!linkPersonalCodeInput.trim()) {
      setLinkStudentMessage('Informe o codigo do personal.');
      return;
    }

    const personalCode = normalizePersonalCode(linkPersonalCodeInput);
    if (!personalCode) {
      setLinkStudentMessage('Codigo do personal invalido.');
      return;
    }

    const student = students.find((item) => item.id === linkStudentId);
    const selectedPersonal = personals.find((item) => item.id === linkPersonalSelect);

    setLinkStudentLoading(true);
    setLinkStudentMessage('');
    try {
      const capacity = await firestoreService.getPersonalStudentCapacityByCode(personalCode, {
        excludeUserId: linkStudentId,
      });
      if (!capacity.allowed) {
        setLinkStudentMessage(
          capacity.reason === 'personal_not_found'
            ? 'Codigo do personal nao encontrado.'
            : 'Esse personal atingiu o limite de 4 alunos no plano gratuito. Peca para ele assinar o Premium para liberar alunos ilimitados.'
        );
        return;
      }

      const db = getFirebaseDb();
      const payload: Record<string, any> = {
        academyId: user?.uid || null,
        codigoPersonal: personalCode,
        vinculadoPorAcademia: true,
        personalVinculadoEm: serverTimestamp(),
        nameDoSeuPersonal: selectedPersonal?.displayName || capacity.personalName || undefined,
      };
      if (academyCodeRaw) payload.codigoAcademia = academyCodeRaw;
      await updateDoc(doc(db, 'users', linkStudentId), payload);
      setLinkStudentMessage(
        `Aluno ${student?.name || ''} vinculado ao personal ${selectedPersonal?.displayName || ''}.`
      );
      setLinkStudentId('');
      setLinkPersonalSelect('');
      setLinkPersonalCodeInput('');
      await reloadAcademy();
    } catch (err: any) {
      setLinkStudentMessage(err.message || 'Erro ao vincular aluno.');
    } finally {
      setLinkStudentLoading(false);
    }
  };

  return (
    <PageShell
      title="Vinculos da academia"
      description="Distribua alunos e personais com origem registrada."
    >
      <AcademyGate>
        <div className={styles.page}>
          {academyError && (
            <div className={`academy-alert is-danger ${styles.alert}`}>
              <div>
                <strong>Erro ao carregar</strong>
                <span>{academyError}</span>
              </div>
            </div>
          )}

          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.kicker}>Vinculos oficiais</p>
              <h2>Conecte personais e alunos com origem clara no painel.</h2>
              <p className={styles.heroLead}>
                Quando a academia cria o vinculo, o aluno fica marcado como origem oficial para
                acompanhamento e historico.
              </p>

              <div className={styles.heroActions}>
                <Link href="/academy/ai" className={`button ${styles.heroButton}`}>
                  Vincular com IA
                </Link>
                <Link href="/academy" className={`button secondary ${styles.heroButton}`}>
                  Voltar ao painel
                </Link>
              </div>

              <div className={styles.heroTags}>
                <span>{user?.displayName || 'Academia'}</span>
                <span>{loadingAcademy ? '...' : `${unassignedCount} sem personal`}</span>
                <span>{loadingAcademy ? '...' : `${availableCount} personais livres`}</span>
              </div>
            </div>

            <div className={styles.heroStats}>
              <article>
                <span>Personais ativos</span>
                <strong>{loadingAcademy ? '...' : personals.length}</strong>
                <small>No portal da academia</small>
              </article>
              <article>
                <span>Alunos ativos</span>
                <strong>{loadingAcademy ? '...' : students.length}</strong>
                <small>Base monitorada</small>
              </article>
              <article>
                <span>Alunos com personal</span>
                <strong>{loadingAcademy ? '...' : assignedCount}</strong>
                <small>Com vinculo registrado</small>
              </article>
              <article>
                <span>Pendentes</span>
                <strong>{loadingAcademy ? '...' : unassignedCount}</strong>
                <small>Aguardando definicao</small>
              </article>
            </div>
          </section>

          <section className={styles.steps}>
            <article className={styles.stepCard}>
              <header className={styles.stepHeader}>
                <div>
                  <p className={styles.stepLabel}>Etapa 1</p>
                  <h3>Vincular personal</h3>
                  <p>Adicione o personal ao painel oficial da academia.</p>
                </div>
                <span className={styles.stepPill}>{availableCount} disponiveis</span>
              </header>

              <div className={styles.formArea}>
                <label className={styles.field}>
                  <span>Selecionar personal</span>
                  <select
                    className={styles.control}
                    value={linkPersonalId}
                    onChange={(event) => setLinkPersonalId(event.target.value)}
                  >
                    <option value="">Selecione um personal</option>
                    {availablePersonals.map((personal) => (
                      <option key={personal.id} value={personal.id}>
                        {personal.displayName} - Codigo {personal.codigoPersonal ?? '--'}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className={`button ${styles.submitButton}`}
                  onClick={handleLinkPersonal}
                  disabled={linkPersonalLoading || loadingAllPersonals}
                >
                  {linkPersonalLoading ? 'Vinculando...' : 'Vincular personal'}
                </button>

                {loadingAllPersonals && <p className={styles.muted}>Carregando personais...</p>}
                {linkPersonalMessage && (
                  <p
                    className={`${styles.feedback} ${
                      hasNegativeTone(linkPersonalMessage) ? styles.feedbackError : styles.feedbackSuccess
                    }`}
                  >
                    {linkPersonalMessage}
                  </p>
                )}
              </div>
            </article>

            <article className={styles.stepCard}>
              <header className={styles.stepHeader}>
                <div>
                  <p className={styles.stepLabel}>Etapa 2</p>
                  <h3>Vincular aluno ao personal</h3>
                  <p>Defina o responsavel pelo aluno e registre a origem oficial.</p>
                </div>
                <span className={styles.stepPill}>{unassignedCount} sem personal</span>
              </header>

              <div className={styles.formArea}>
                <label className={styles.field}>
                  <span>Aluno</span>
                  <select
                    className={styles.control}
                    value={linkStudentId}
                    onChange={(event) => setLinkStudentId(event.target.value)}
                  >
                    <option value="">Selecione um aluno</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}{' '}
                        {student.codigoPersonal ? `- Personal ${student.codigoPersonal}` : '- Sem personal'}
                      </option>
                    ))}
                  </select>
                </label>

                <div className={styles.inlineFields}>
                  <label className={styles.field}>
                    <span>Personal da academia</span>
                    <select
                      className={styles.control}
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

                  <label className={styles.field}>
                    <span>Codigo do personal</span>
                    <input
                      className={styles.control}
                      type="text"
                      placeholder="Ex: 12345"
                      value={linkPersonalCodeInput}
                      onChange={(event) => setLinkPersonalCodeInput(event.target.value)}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className={`button ${styles.submitButton}`}
                  onClick={handleLinkStudent}
                  disabled={linkStudentLoading || loadingAcademy}
                >
                  {linkStudentLoading ? 'Vinculando...' : 'Vincular aluno'}
                </button>

                {linkStudentMessage && (
                  <p
                    className={`${styles.feedback} ${
                      hasNegativeTone(linkStudentMessage) ? styles.feedbackError : styles.feedbackSuccess
                    }`}
                  >
                    {linkStudentMessage}
                  </p>
                )}
              </div>
            </article>
          </section>

          <section className={styles.guide}>
            <div className={styles.guideHeader}>
              <h3>Boas praticas</h3>
              <p>
                Vinculos feitos pela academia marcam o aluno como oficial. Quando o personal usa
                o proprio codigo, o aluno aparece como particular.
              </p>
            </div>

            <div className={styles.guideGrid}>
              <article>
                <span>Vinculo oficial</span>
                <strong>Academia registra a origem</strong>
                <p>Aluno aparece como vinculado pela academia no painel.</p>
              </article>
              <article>
                <span>Vinculo particular</span>
                <strong>Personal usa o proprio codigo</strong>
                <p>Aluno aparece como particular no painel do personal.</p>
              </article>
            </div>
          </section>
        </div>
      </AcademyGate>
    </PageShell>
  );
}
