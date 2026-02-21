'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { useUserScope } from '@/lib/firestoreHooks';
import { useAuth } from '@/lib/auth';
import { firestoreService, type Aluno } from '@/lib/services/firestoreService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebaseClient';
import { createUserDocument } from '@/lib/services/documents';

export default function DocumentsUploadPage() {
  const { user, role } = useAuth();
  const { userId: adminUserId, setUserId: setAdminUserId } = useUserScope();
  const [titulo, setTitulo] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [adminValue, setAdminValue] = useState(adminUserId);
  const isTrainer = role === 'personal' || role === 'professor';
  const isAdmin = role === 'admin';

  const selectedStudent = useMemo(
    () =>
      students.find((student) => (student.uid || student.id) === selectedStudentId) ||
      students.find((student) => student.id === selectedStudentId) ||
      null,
    [students, selectedStudentId]
  );

  const targetUserId = isTrainer
    ? selectedStudentId
    : isAdmin
      ? adminUserId
      : user?.uid || '';

  const targetLabel = isTrainer
    ? selectedStudent?.nome || selectedStudent?.email || ''
    : isAdmin
      ? adminUserId
      : user?.displayName || user?.email || '';

  const fileMeta = useMemo(() => {
    if (!file) return '';
    const sizeMb = (file.size / 1024 / 1024).toFixed(2);
    return `${file.name} - ${sizeMb} MB`;
  }, [file]);

  useEffect(() => {
    setAdminValue(adminUserId);
  }, [adminUserId]);

  useEffect(() => {
    if (!isTrainer) {
      setStudents([]);
      return;
    }
    if (!user?.uid) return;
    let active = true;
    firestoreService.getAlunosDoPersonal(user.uid).then((data) => {
      if (!active) return;
      setStudents(data);
      if (!selectedStudentId && data.length) {
        setSelectedStudentId(data[0].uid || data[0].id);
      }
    });
    return () => {
      active = false;
    };
  }, [isTrainer, selectedStudentId, user?.uid]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!targetUserId || !titulo || !file) {
      setError('Preencha o nome, selecione o aluno e envie um arquivo.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const storageRef = ref(storage, `users/${targetUserId}/documents/${Date.now()}-${file.name}`);
      const upload = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(upload.ref);
      await createUserDocument(targetUserId, {
        nome: titulo.trim(),
        arquivos: url,
      });
      setTitulo('');
      setFile(null);
      setSuccess(`Documento enviado para ${targetLabel || 'o aluno'}.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell
      title="Enviar documentos"
      description="Faca upload de arquivos e compartilhe com o aluno."
      breadcrumbs={[{ label: 'Documentos', href: '/documents' }]}
    >
      <div className="documents-upload-layout">
        <div className="portal-card documents-upload-card">
          <div className="documents-upload-header">
            <div>
              <p className="portal-pill">Envio rapido</p>
              <h2>Compartilhe arquivos com o aluno</h2>
              <p className="subtle">
                Escolha o aluno, envie o arquivo e ele aparece automaticamente na biblioteca.
              </p>
            </div>
            <Link href="/documents" className="button secondary sm">
              Ver documentos
            </Link>
          </div>

          <form className="documents-upload-form" onSubmit={handleSubmit}>
            <div className="documents-upload-section">
              <div className="documents-upload-section-header">
                <div>
                  <h3>Destino do arquivo</h3>
                  <p className="subtle">Selecione o aluno que vai receber o documento.</p>
                </div>
                {isTrainer && (
                  <Link href="/students" className="button secondary sm">
                    Ver alunos
                  </Link>
                )}
              </div>

              {isTrainer ? (
                <label className="documents-upload-label">
                  Aluno
                  <select
                    className="documents-upload-input"
                    value={selectedStudentId}
                    onChange={(event) => setSelectedStudentId(event.target.value)}
                  >
                    <option value="">Selecione um aluno</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.uid || student.id}>
                        {student.nome} - {student.email}
                      </option>
                    ))}
                  </select>
                </label>
              ) : isAdmin ? (
                <div className="documents-upload-admin">
                  <label className="documents-upload-label">
                    UID do aluno
                    <input
                      className="documents-upload-input"
                      type="text"
                      value={adminValue}
                      onChange={(event) => setAdminValue(event.target.value)}
                      placeholder="UID do aluno"
                    />
                  </label>
                  <div className="documents-upload-admin-actions">
                    <button
                      type="button"
                      className="button"
                      onClick={() => setAdminUserId(adminValue.trim())}
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        setAdminValue('');
                        setAdminUserId('');
                      }}
                    >
                      Limpar
                    </button>
                  </div>
                </div>
              ) : (
                <label className="documents-upload-label">
                  Aluno
                  <input
                    className="documents-upload-input"
                    type="text"
                    value={targetLabel}
                    disabled
                  />
                </label>
              )}

              {isTrainer && !students.length && (
                <p className="subtle">
                  Nenhum aluno vinculado ao seu codigo. Convide alunos no menu de estudantes.
                </p>
              )}
              {targetUserId && (
                <div className="documents-upload-target">
                  <span>Destino selecionado:</span>
                  <strong>{targetLabel || targetUserId}</strong>
                </div>
              )}
            </div>

            <div className="documents-upload-section">
              <div className="documents-upload-section-header">
                <div>
                  <h3>Detalhes do documento</h3>
                  <p className="subtle">Informe um nome claro para o arquivo.</p>
                </div>
              </div>
              <label className="documents-upload-label">
                Nome do documento
                <input
                  className="documents-upload-input"
                  type="text"
                  value={titulo}
                  onChange={(event) => setTitulo(event.target.value)}
                  placeholder="Ex: Laudo cardiologico"
                />
              </label>
              <label className={`documents-upload-label documents-upload-drop${file ? ' has-file' : ''}`}>
                <input
                  type="file"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <div>
                  <strong>{file ? 'Arquivo selecionado' : 'Clique para enviar o arquivo'}</strong>
                  <span>PDF, imagens ou laudos com detalhes do aluno.</span>
                </div>
              </label>
              {fileMeta && <p className="documents-upload-meta">{fileMeta}</p>}
            </div>

            {error && <p className="documents-upload-error">{error}</p>}
            {success && <p className="documents-upload-success">{success}</p>}

            <div className="documents-upload-actions">
              <button className="button" type="submit" disabled={saving || !targetUserId}>
                {saving ? 'Enviando...' : 'Enviar documento'}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setTitulo('');
                  setFile(null);
                  setError('');
                  setSuccess('');
                }}
                disabled={saving}
              >
                Limpar
              </button>
            </div>
          </form>
        </div>

        <div className="documents-upload-side">
          <div className="portal-card documents-upload-summary">
            <p className="portal-pill">Resumo</p>
            <h3>O aluno recebe automaticamente</h3>
            <p className="subtle">
              O arquivo fica disponivel na biblioteca do aluno e pode ser consultado sempre que precisar.
            </p>
            <ul className="documents-checklist">
              <li>Compartilhamento instantaneo no app do aluno.</li>
              <li>Organizado por data e titulo.</li>
              <li>Consulta rapida no painel web.</li>
            </ul>
          </div>

          <div className="portal-card documents-upload-assistant">
            <p className="portal-pill">MH Assistente</p>
            <h3>Resuma laudos e gere orientacoes</h3>
            <p className="subtle">
              Use a IA para explicar o documento em linguagem simples e criar um plano de acao.
            </p>
            <Link href="/ai/assistant" className="button secondary sm">
              Abrir assistente
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
