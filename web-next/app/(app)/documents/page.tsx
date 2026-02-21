'use client';

import { useMemo } from 'react';
import PageShell from '@/components/PageShell';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import UserScopePicker from '@/components/data/UserScopePicker';
import DataTable from '@/components/data/DataTable';
import { formatDate, useCollectionData, useUserScope } from '@/lib/firestoreHooks';

interface DocumentRow {
  id: string;
  titulo?: string;
  nome?: string;
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

export default function DocumentsPage() {
  const { userId } = useUserScope();
  const { data } = useCollectionData<DocumentRow>(['users', userId, 'arquivos']);
  const router = useRouter();

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

  const assistantPrompts = [
    'Resuma um laudo para o aluno em linguagem simples.',
    'Crie orientacoes com base no documento enviado.',
    'Liste os proximos passos a partir deste exame.',
  ];

  const handleAssistantPrompt = (prompt: string) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('mh-assistant-prompt', prompt);
    }
    router.push('/ai/assistant');
  };

  const latestDateLabel = latestDocument
    ? formatDate(latestDocument.createdAt ?? latestDocument.data)
    : '-';

  return (
    <PageShell
      title="Documentos"
      description="Arquivos, laudos e anexos dos alunos."
      actions={[{ label: 'Enviar documento', href: '/documents/upload' }]}
    >
      <UserScopePicker />

      <div className="documents-layout">
        <div className="portal-card portal-card--highlight documents-hero">
          <div className="documents-hero-copy">
            <p className="portal-pill">Biblioteca do aluno</p>
            <h2>Centralize laudos, exames e anexos em um so lugar.</h2>
            <p className="subtle">
              Envie arquivos para o aluno, acompanhe o historico e use o MH Assistente para gerar
              resumos e orientacoes em segundos.
            </p>
            <div className="documents-hero-actions">
              <Link href="/documents/upload" className="button">
                Enviar documento
              </Link>
              <Link href="/documents/aluno" className="button secondary">
                Ver arquivos do aluno
              </Link>
            </div>
            <div className="documents-hero-tags">
              <span className="portal-tag">Compartilhado automaticamente</span>
              <span className="portal-tag">PDF, imagens e laudos</span>
              <span className="portal-tag">Historico organizado</span>
            </div>
          </div>
          <div className="portal-metrics documents-metrics">
            <div className="portal-metric-card">
              <strong>{data.length}</strong>
              <span>Documentos cadastrados</span>
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
              <strong>{userId ? 'Ativo' : '-'}</strong>
              <span>Destino configurado</span>
            </div>
          </div>
        </div>

        <div className="portal-section">
          <div className="portal-section-header">
            <div>
              <h2>Acoes rapidas</h2>
              <p className="subtle">Envie e acompanhe os arquivos do aluno sem perder tempo.</p>
            </div>
          </div>
          <div className="portal-actions documents-actions">
            <Link href="/documents/upload" className="portal-action-card">
              <div>
                <strong>Enviar documento</strong>
                <span>Upload rapido com compartilhamento automatico.</span>
              </div>
              <span className="portal-action-arrow">-&gt;</span>
            </Link>
            <Link href="/documents/aluno" className="portal-action-card">
              <div>
                <strong>Arquivos do aluno</strong>
                <span>Veja tudo o que ja foi enviado.</span>
              </div>
              <span className="portal-action-arrow">-&gt;</span>
            </Link>
            <Link href="/ai/assistant" className="portal-action-card">
              <div>
                <strong>MH Assistente</strong>
                <span>Resuma documentos e gere orientacoes.</span>
              </div>
              <span className="portal-action-arrow">-&gt;</span>
            </Link>
          </div>
        </div>

        <div className="portal-grid portal-grid--2 documents-secondary-grid">
          <div className="portal-card documents-assistant-card">
            <div>
              <p className="portal-pill">MH Assistente</p>
              <h3>Transforme documentos em planos de acao.</h3>
              <p className="subtle" style={{ marginTop: 6 }}>
                Copie o conteudo do laudo e gere orientacoes claras para o aluno.
              </p>
            </div>
            <div className="documents-assistant-actions">
              <button type="button" className="button" onClick={() => router.push('/ai/assistant')}>
                Abrir assistente
              </button>
              <Link href="/documents/upload" className="button secondary">
                Enviar novo
              </Link>
            </div>
            <div className="documents-assistant-prompts">
              {assistantPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="documents-assistant-chip"
                  onClick={() => handleAssistantPrompt(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="portal-card documents-share-card">
            <div className="documents-share-header">
              <div>
                <p className="portal-pill">Visivel no aluno</p>
                <h3>O aluno recebe tudo automaticamente.</h3>
                <p className="subtle" style={{ marginTop: 6 }}>
                  Vincule o arquivo ao aluno e ele aparece no app com data e descricao.
                </p>
              </div>
              <Link href="/documents/aluno" className="button secondary sm">
                Ver biblioteca
              </Link>
            </div>
            <ul className="documents-checklist">
              <li>Upload vinculado ao aluno selecionado.</li>
              <li>Disponivel no app do aluno em segundos.</li>
              <li>Historico organizado por data e titulo.</li>
            </ul>
          </div>
        </div>

        <div className="portal-card portal-card--table documents-table-card">
          <div className="documents-table-header">
            <div>
              <h3>Biblioteca de documentos</h3>
              <p className="subtle">Acompanhe o que ja foi compartilhado com o aluno.</p>
            </div>
            <Link href="/documents/upload" className="button secondary sm">
              Enviar arquivo
            </Link>
          </div>
          {userId ? (
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
              emptyMessage="Nenhum documento encontrado."
            />
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
