'use client';

import PageShell from '@/components/PageShell';
import Link from 'next/link';
import DataTable from '@/components/data/DataTable';
import UserScopePicker from '@/components/data/UserScopePicker';
import { formatDate, useCollectionData, useUserScope } from '@/lib/firestoreHooks';

interface PersonalizadaRow {
  id: string;
  createdAt?: any;
  data?: any;
  status?: string;
}

const questionSamples = [
  {
    id: '1',
    label: 'Pergunta 1',
    placeholder: 'Escreva a pergunta',
    type: 'Texto livre',
  },
  {
    id: '2',
    label: 'Pergunta 2',
    placeholder: 'Escreva a pergunta',
    type: 'Sim/Nao',
  },
];

const recommendationSamples = ['Melhorar mobilidade', 'Fortalecer core', 'Reavaliar em 30 dias'];

export default function PersonalizadaPage() {
  const { userId } = useUserScope();
  const { data } = useCollectionData<PersonalizadaRow>(['users', userId, 'avaliacaoPersonalizada']);

  return (
    <PageShell
      title="Avaliacao personalizada"
      description="Questionario completo com metas e objetivos do aluno."
      breadcrumbs={[{ label: 'Avaliacoes', href: '/evaluations' }]}
      actions={[{ label: 'Ver resultado', href: '/evaluations/personalizada/resultado' }]}
    >
      <UserScopePicker />
      <div className="evaluation-form-grid">
        <div className="portal-card evaluation-section">
          <div>
            <h3>Prazo</h3>
            <p className="subtle">Defina a data limite para o aluno responder.</p>
          </div>
          <label>
            Data limite
            <input className="evaluation-input" placeholder="DD/MM/AAAA" />
          </label>
          <div className="evaluation-inline-actions">
            <button className="button secondary" type="button">
              Enviar lembrete
            </button>
          </div>
        </div>

        <div className="portal-card evaluation-section">
          <div>
            <h3>Questionario</h3>
            <p className="subtle">Adicione perguntas para personalizar a avaliacao.</p>
          </div>
          <div className="evaluation-field-grid evaluation-field-grid--wide">
            {questionSamples.map((question) => (
              <div key={question.id} className="portal-card evaluation-section">
                <label>
                  {question.label}
                  <input className="evaluation-input" placeholder={question.placeholder} />
                </label>
                <label>
                  Tipo da pergunta
                  <select className="evaluation-select">
                    <option>{question.type}</option>
                    <option>Numero</option>
                    <option>Dropdown</option>
                  </select>
                </label>
                <label>
                  Opcoes (separadas por virgula)
                  <input className="evaluation-input" placeholder="Ex: Iniciante, Intermediario" />
                </label>
              </div>
            ))}
          </div>
          <div className="evaluation-inline-actions">
            <button className="button secondary" type="button">
              Adicionar pergunta
            </button>
            <Link href="/ai/assistant" className="button">
              Abrir assistente
            </Link>
          </div>
        </div>

        <div className="portal-card evaluation-section">
          <div>
            <h3>Resultado</h3>
            <p className="subtle">Resumo do plano e metas do aluno.</p>
          </div>
          <label>
            Resultado
            <textarea className="evaluation-textarea" placeholder="Resumo da avaliacao..." />
          </label>
          <h4>Recomendacoes</h4>
          <div className="evaluation-field-grid">
            {recommendationSamples.map((value) => (
              <label key={value}>
                Recomendacao
                <input className="evaluation-input" placeholder={value} />
              </label>
            ))}
          </div>
          <div className="evaluation-inline-actions">
            <button className="button secondary" type="button">
              Adicionar recomendacao
            </button>
            <Link href="/workout/create" className="button">
              Criar treino
            </Link>
          </div>
        </div>
      </div>

      <div className="portal-card portal-card--table" style={{ marginTop: 24 }}>
        <h3>Avaliacoes personalizadas</h3>
        {userId ? (
          <DataTable
            rows={data}
            columns={[
              { key: 'id', label: 'ID' },
              { key: 'status', label: 'Status' },
              { key: 'createdAt', label: 'Criado em', render: (row) => formatDate(row.createdAt ?? row.data) },
            ]}
            emptyMessage="Nenhuma avaliacao personalizada encontrada."
          />
        ) : (
          <p className="subtle">Informe um UID para listar avaliacoes.</p>
        )}
      </div>
    </PageShell>
  );
}
