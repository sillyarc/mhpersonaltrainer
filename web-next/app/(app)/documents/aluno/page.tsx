'use client';

import { useMemo } from 'react';
import PageShell from '@/components/PageShell';
import DataTable from '@/components/data/DataTable';
import UserScopePicker from '@/components/data/UserScopePicker';
import { formatDate, useCollectionData, useUserScope } from '@/lib/firestoreHooks';
import Link from 'next/link';

interface DocumentRow {
  id: string;
  nome?: string;
  titulo?: string;
  createdAt?: any;
  data?: any;
}

const getDateValue = (row: DocumentRow) => {
  const value = row.createdAt ?? row.data;
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate() as Date;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default function DocumentsAlunoPage() {
  const { userId } = useUserScope();
  const { data } = useCollectionData<DocumentRow>(['users', userId, 'arquivos']);
  const hasUser = Boolean(userId);
  const hasData = data.length > 0;

  const latestDocument = useMemo(() => {
    if (!data.length) return null;
    return [...data].sort((a, b) => {
      const aTime = getDateValue(a)?.getTime?.() ?? 0;
      const bTime = getDateValue(b)?.getTime?.() ?? 0;
      return bTime - aTime;
    })[0];
  }, [data]);

  const recentCount = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return data.filter((row) => {
      const date = getDateValue(row);
      return date ? date.getTime() >= cutoff : false;
    }).length;
  }, [data]);

  const latestDateLabel = latestDocument
    ? formatDate(latestDocument.createdAt ?? latestDocument.data)
    : '-';

  return (
    <PageShell
      title="Arquivos do aluno"
      description="Documentos enviados e compartilhados com o aluno."
      breadcrumbs={[{ label: 'Documentos', href: '/documents' }]}
    >
      <UserScopePicker />
      <div className="documents-layout">
        <div className="portal-card portal-card--highlight documents-hero">
          <div className="documents-hero-copy">
            <p className="portal-pill">Biblioteca do aluno</p>
            <h2>Arquivos organizados para o aluno acessar quando precisar.</h2>
            <p className="subtle">
              Tudo que voce envia aparece no app do aluno, com data e titulo.
            </p>
            <div className="documents-hero-actions">
              <Link href="/documents/upload" className="button">
                Enviar arquivo
              </Link>
              <Link href="/documents" className="button secondary">
                Voltar documentos
              </Link>
            </div>
            <div className="documents-hero-tags">
              <span className="portal-tag">Visivel no app do aluno</span>
              <span className="portal-tag">Historico completo</span>
              <span className="portal-tag">Upload rapido</span>
            </div>
            <div className={`documents-student-meta${hasUser ? '' : ' is-empty'}`}>
              {hasUser ? (
                <>
                  <span>Aluno selecionado</span>
                  <strong>Nome do aluno</strong>
                </>
              ) : (
                <span>Selecione um aluno para carregar os arquivos.</span>
              )}
            </div>
          </div>
          <div className="portal-metrics documents-metrics">
            <div className="portal-metric-card">
              <strong>{data.length}</strong>
              <span>Total de documentos</span>
            </div>
            <div className="portal-metric-card">
              <strong>{recentCount}</strong>
              <span>Ultimos 7 dias</span>
            </div>
            <div className="portal-metric-card">
              <strong>{latestDateLabel}</strong>
              <span>Ultimo envio</span>
            </div>
            <div className="portal-metric-card">
              <strong>{hasUser ? 'Ativo' : '-'}</strong>
              <span>Destino configurado</span>
            </div>
          </div>
        </div>

        <div className="portal-grid portal-grid--2 documents-secondary-grid">
          <div className="portal-card documents-share-card">
            <div className="documents-share-header">
              <div>
                <p className="portal-pill">Como funciona</p>
                <h3>O aluno recebe e visualiza instantaneamente.</h3>
                <p className="subtle" style={{ marginTop: 6 }}>
                  Envie exames, laudos e anexos e mantenha o historico organizado.
                </p>
              </div>
              <Link href="/documents/upload" className="button secondary sm">
                Enviar arquivo
              </Link>
            </div>
            <ul className="documents-checklist">
              <li>Disponivel no app do aluno logo apos o envio.</li>
              <li>Organizado por data e nome do documento.</li>
              <li>Facil de consultar durante os atendimentos.</li>
            </ul>
          </div>

          <div className="portal-card documents-assistant-card">
            <div>
              <p className="portal-pill">MH Assistente</p>
              <h3>Resuma laudos e gere orientacoes.</h3>
              <p className="subtle" style={{ marginTop: 6 }}>
                Use o assistente para explicar o documento em linguagem simples.
              </p>
            </div>
            <div className="documents-assistant-actions">
              <Link href="/ai/assistant" className="button">
                Abrir assistente
              </Link>
              <Link href="/documents/upload" className="button secondary">
                Enviar novo
              </Link>
            </div>
          </div>
        </div>

        <div className="portal-card portal-card--table documents-table-card">
          <div className="documents-table-header">
            <div>
              <h3>Biblioteca do aluno</h3>
              <p className="subtle">Todos os arquivos compartilhados para consulta no app.</p>
            </div>
            <Link href="/documents/upload" className="button secondary sm">
              Enviar arquivo
            </Link>
          </div>
          {hasUser ? (
            hasData ? (
              <DataTable
                rows={data}
                columns={[
                  {
                    key: 'titulo',
                    label: 'Documento',
                    render: (row) => <Link href={`/documents/view/${row.id}`}>{row.titulo ?? row.nome ?? '-'}</Link>,
                  },
                  { key: 'createdAt', label: 'Data', render: (row) => formatDate(row.createdAt ?? row.data) },
                ]}
              />
            ) : (
              <div className="portal-empty">
                <strong>Nenhum documento encontrado.</strong>
                <span>Envie um arquivo para alimentar a biblioteca do aluno.</span>
              </div>
            )
          ) : (
            <div className="portal-empty">
              <strong>Informe um UID para listar documentos.</strong>
              <span>Selecione o aluno para carregar os arquivos enviados.</span>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
