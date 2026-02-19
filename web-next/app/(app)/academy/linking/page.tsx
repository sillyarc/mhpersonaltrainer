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
import { useAcademyData } from '@/lib/hooks/useAcademyData';
import { getFirebaseDb } from '@/lib/services/firebase';
import { firestoreService, type PersonalProfile } from '@/lib/services/firestoreService';

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

export default function AcademyLinkingPage() {
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

  const handleLinkPersonal = async () => {
    if (!linkPersonalId) {
      setLinkPersonalMessage('Selecione um personal.');
      return;
    }
    if (!academyCodeRaw) {
      setLinkPersonalMessage('Codigo da academia nao encontrado.');
      return;
    }

    setLinkPersonalLoading(true);
    setLinkPersonalMessage('');
    try {
      const db = getFirebaseDb();
      await updateDoc(doc(db, 'users', linkPersonalId), {
        codigoAcademia: academyCodeRaw,
        academyLinkedAt: serverTimestamp(),
      });
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
    if (!academyCodeRaw) {
      setLinkStudentMessage('Codigo da academia nao encontrado.');
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
      await updateDoc(doc(db, 'users', linkStudentId), {
        codigoPersonal: personalCode,
        codigoAcademia: academyCodeRaw,
        vinculadoPorAcademia: true,
        personalVinculadoEm: serverTimestamp(),
        nameDoSeuPersonal: selectedPersonal?.displayName || capacity.personalName || undefined,
      });
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
        {academyError && (
          <div className="academy-alert is-danger" style={{ marginBottom: 20 }}>
            <div>
              <strong>Erro ao carregar</strong>
              <span>{academyError}</span>
            </div>
          </div>
        )}

        <div className="academy-linking">
          <section className="academy-linking-hero">
            <div className="academy-linking-hero-content">
              <p className="academy-linking-kicker">Vinculos oficiais</p>
              <h2>Conecte personais e alunos sem perder o controle da origem.</h2>
              <p className="subtle">
                Quando a academia vincula o aluno, ele aparece como origem oficial. Use o codigo da
                academia para padronizar a operacao.
              </p>
              <div className="academy-linking-actions">
                <Link href="/academy/ai" className="button">
                  Vincular com IA
                </Link>
                <Link href="/academy" className="button secondary">
                  Voltar ao painel
                </Link>
              </div>
              <div className="academy-linking-badges">
                <span className="academy-badge">Academia {academyCodeRaw || '--'}</span>
                <span className="academy-badge is-alert">Sem personal {unassignedCount}</span>
                <span className="academy-badge">Personais livres {availableCount}</span>
              </div>
            </div>
            <div className="academy-linking-hero-cards">
              <div className="academy-linking-code">
                <span>Codigo da academia</span>
                <strong>{academyCodeRaw || '--'}</strong>
                <p>Compartilhe com personais novos para entrar como vinculo oficial.</p>
              </div>
              <div className="academy-linking-mini">
                <div>
                  <span>Personais ativos</span>
                  <strong>{loadingAcademy ? '...' : personals.length}</strong>
                </div>
                <div>
                  <span>Alunos ativos</span>
                  <strong>{loadingAcademy ? '...' : students.length}</strong>
                </div>
                <div>
                  <span>Sem personal</span>
                  <strong>{loadingAcademy ? '...' : unassignedCount}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="academy-linking-grid">
            <div className="academy-linking-card">
              <div className="academy-linking-card-header">
                <div>
                  <p className="academy-linking-step">Etapa 1</p>
                  <h3>Vincular personal</h3>
                  <p className="subtle">Adicione o personal ao codigo da academia.</p>
                </div>
                <span className="academy-linking-pill">{availableCount} disponiveis</span>
              </div>
              <div className="academy-linking-form">
                <label className="academy-linking-label">
                  <span>Selecionar personal</span>
                  <select
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
                  className="button"
                  onClick={handleLinkPersonal}
                  disabled={linkPersonalLoading || loadingAllPersonals}
                >
                  {linkPersonalLoading ? 'Vinculando...' : 'Vincular personal'}
                </button>
                {loadingAllPersonals && <span className="subtle">Carregando personais...</span>}
                {linkPersonalMessage && (
                  <span className="academy-linking-feedback">{linkPersonalMessage}</span>
                )}
              </div>
            </div>

            <div className="academy-linking-card">
              <div className="academy-linking-card-header">
                <div>
                  <p className="academy-linking-step">Etapa 2</p>
                  <h3>Vincular aluno ao personal</h3>
                  <p className="subtle">Defina o personal responsavel e registre a origem.</p>
                </div>
                <span className="academy-linking-pill">{unassignedCount} sem personal</span>
              </div>
              <div className="academy-linking-form">
                <label className="academy-linking-label">
                  <span>Aluno</span>
                  <select
                    value={linkStudentId}
                    onChange={(event) => setLinkStudentId(event.target.value)}
                  >
                    <option value="">Selecione um aluno</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name} {student.codigoPersonal ? `- Personal ${student.codigoPersonal}` : '- Sem personal'}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="academy-linking-row">
                  <label className="academy-linking-label">
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
                  <label className="academy-linking-label">
                    <span>Codigo do personal</span>
                    <input
                      type="text"
                      placeholder="Ex: 12345"
                      value={linkPersonalCodeInput}
                      onChange={(event) => setLinkPersonalCodeInput(event.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="button"
                  onClick={handleLinkStudent}
                  disabled={linkStudentLoading || loadingAcademy}
                >
                  {linkStudentLoading ? 'Vinculando...' : 'Vincular aluno'}
                </button>
                {linkStudentMessage && (
                  <span className="academy-linking-feedback">{linkStudentMessage}</span>
                )}
              </div>
            </div>
          </section>

          <section className="academy-linking-guide">
            <div>
              <h3>Boas praticas</h3>
              <p className="subtle">
                Vinculos feitos pela academia marcam o aluno como oficial. Caso o personal use o
                proprio codigo, o aluno aparece como particular.
              </p>
            </div>
            <div className="academy-linking-guide-grid">
              <div>
                <span>Vinculo oficial</span>
                <strong>Academia registra a origem</strong>
                <p>Aluno aparece como vinculado pela academia no painel.</p>
              </div>
              <div>
                <span>Vinculo particular</span>
                <strong>Personal usa o proprio codigo</strong>
                <p>Aluno aparece como particular no painel do personal.</p>
              </div>
            </div>
          </section>
        </div>
      </AcademyGate>
    </PageShell>
  );
}
