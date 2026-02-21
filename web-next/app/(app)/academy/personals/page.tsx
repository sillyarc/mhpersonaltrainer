'use client';

import Link from 'next/link';
import PageShell from '@/components/PageShell';
import AcademyGate from '@/components/AcademyGate';
import { formatDate } from '@/lib/firestoreHooks';
import { useAcademyData } from '@/lib/hooks/useAcademyData';

export default function AcademyPersonalsPage() {
  const { personals, students, summary, loadingAcademy, academyError } = useAcademyData();

  const studentsByPersonal = new Map<string, typeof students>();
  students.forEach((student) => {
    if (!student.codigoPersonal) return;
    const key = String(student.codigoPersonal);
    if (!studentsByPersonal.has(key)) {
      studentsByPersonal.set(key, []);
    }
    studentsByPersonal.get(key)?.push(student);
  });

  return (
    <PageShell
      title="Personais da academia"
      description="Equipe, alunos vinculados e origem dos vinculos."
      actions={[
        { label: 'Vincular aluno', href: '/academy/linking' },
        { label: 'Vincular personal', href: '/academy/linking' },
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

        <div className="academy-squad">
          <section className="academy-squad-hero">
            <div className="academy-squad-hero-main">
              <p className="academy-squad-kicker">Equipe da academia</p>
              <h2>Central de personais, alunos e distribuicao de carteira</h2>
              <p className="subtle">
                Visual claro para saber quem atende quem, quais alunos vieram da academia e onde ainda
                falta vinculo.
              </p>
              <div className="academy-squad-actions">
                <Link href="/academy/linking" className="button">
                  Vincular aluno
                </Link>
                <Link href="/academy/linking" className="button secondary">
                  Vincular personal
                </Link>
                <Link href="/academy/ai" className="button secondary">
                  Vincular com IA
                </Link>
              </div>
            </div>

            <aside className="academy-squad-hero-side">
              <div className="academy-squad-stats">
                <div>
                  <span>Personais ativos</span>
                  <strong>{loadingAcademy ? '...' : summary.totalPersonals}</strong>
                </div>
                <div>
                  <span>Alunos vinculados</span>
                  <strong>{loadingAcademy ? '...' : summary.totalStudents}</strong>
                </div>
                <div>
                  <span>Sem personal</span>
                  <strong>{loadingAcademy ? '...' : summary.unassignedStudents}</strong>
                </div>
                <div>
                  <span>Alunos externos</span>
                  <strong>{loadingAcademy ? '...' : summary.externalStudents}</strong>
                </div>
              </div>
            </aside>
          </section>

          <section className="academy-squad-roster">
            <header className="academy-squad-roster-head">
              <div>
                <p className="academy-squad-kicker">Mapa dos personais</p>
                <h3>Carteira de alunos por personal</h3>
                <p className="subtle">Acesso direto ao perfil e controle de origem dos vinculos.</p>
              </div>
              <div className="academy-squad-actions">
                <Link href="/academy/linking" className="button secondary sm">
                  Vincular aluno
                </Link>
                <Link href="/academy/linking" className="button secondary sm">
                  Vincular personal
                </Link>
              </div>
            </header>

            {loadingAcademy ? (
              <p className="subtle">Carregando personais...</p>
            ) : personals.length ? (
              <div className="academy-squad-grid">
                {personals.map((personal) => {
                  const codeKey = String(personal.codigoPersonal || '');
                  const linkedStudents = studentsByPersonal.get(codeKey) || [];
                  const academyLinked = linkedStudents.filter((student) => student.vinculadoPorAcademia).length;
                  const privateLinked = linkedStudents.length - academyLinked;
                  const initial = (personal.displayName || 'P').trim().charAt(0).toUpperCase();
                  const special = Array.isArray(personal.especializacao)
                    ? personal.especializacao.join(', ')
                    : personal.especializacao || 'Nao informado';
                  const lastActive = personal.lastActive ? formatDate(personal.lastActive) : 'Sem acesso';

                  return (
                    <article key={personal.id} className="academy-squad-card">
                      <div className="academy-squad-card-top">
                        <div className="academy-squad-avatar">{initial}</div>
                        <div className="academy-squad-identity">
                          <strong>{personal.displayName}</strong>
                          <span>{personal.email || 'Email nao informado'}</span>
                        </div>
                        <span className="academy-squad-code-pill">
                          Cod {personal.codigoPersonal ?? '--'}
                        </span>
                      </div>

                      <div className="academy-squad-metrics">
                        <div>
                          <span>Alunos</span>
                          <strong>{linkedStudents.length}</strong>
                        </div>
                        <div>
                          <span>Academia</span>
                          <strong>{academyLinked}</strong>
                        </div>
                        <div>
                          <span>Particular</span>
                          <strong>{privateLinked}</strong>
                        </div>
                      </div>

                      <div className="academy-squad-details">
                        <div>
                          <span>Especialidade</span>
                          <strong>{special}</strong>
                        </div>
                        <div>
                          <span>Ultimo acesso</span>
                          <strong>{lastActive}</strong>
                        </div>
                      </div>

                      <div className="academy-squad-students">
                        {linkedStudents.length ? (
                          linkedStudents.slice(0, 3).map((student) => (
                            <div key={student.id} className="academy-squad-student">
                              <span>{student.name}</span>
                              <span
                                className={`academy-squad-tag ${
                                  student.vinculadoPorAcademia ? 'is-academy' : 'is-personal'
                                }`}
                              >
                                {student.vinculadoPorAcademia ? 'Academia' : 'Personal'}
                              </span>
                            </div>
                          ))
                        ) : (
                          <span className="subtle">Sem alunos vinculados.</span>
                        )}
                      </div>

                      <div className="academy-squad-card-actions">
                        <Link
                          href={`/personal/profile?code=${personal.codigoPersonal ?? ''}`}
                          className="button secondary sm"
                        >
                          Ver perfil
                        </Link>
                        <Link href="/academy/linking" className="button sm">
                          Vincular aluno
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="subtle">Nenhum personal vinculado ainda.</p>
            )}
          </section>
        </div>
      </AcademyGate>
    </PageShell>
  );
}
