'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import DataTable from '@/components/data/DataTable';
import UserScopePicker from '@/components/data/UserScopePicker';
import { formatDate, useCollectionData, useUserScope } from '@/lib/firestoreHooks';
import { useAuth } from '@/lib/auth';
import { chatWithAI } from '@/lib/services/ai';

interface OnlineRow {
  id: string;
  createdAt?: any;
  data?: any;
  status?: string;
}

type AssistantEvaluation = {
  titulo: string;
  objetivo?: string;
  itens: string[];
};

const basicFields = [
  { label: 'Peso (kg)', placeholder: '78' },
  { label: 'Altura (cm)', placeholder: '175' },
  { label: 'IMC', placeholder: '25.4' },
  { label: 'Percentual de gordura (%)', placeholder: '18' },
];

const compositionFields = [
  { label: 'Massa magra (kg)', placeholder: '62' },
  { label: 'Massa gorda (kg)', placeholder: '16' },
  { label: 'Densidade corporal', placeholder: '1.05' },
  { label: 'Taxa metabolica basal', placeholder: '1600' },
];

const circumferenceFields = [
  { label: 'Pescoco', placeholder: '40' },
  { label: 'Ombro', placeholder: '112' },
  { label: 'Torax', placeholder: '98' },
  { label: 'Cintura', placeholder: '82' },
  { label: 'Quadril', placeholder: '100' },
  { label: 'Braco direito', placeholder: '33' },
  { label: 'Braco esquerdo', placeholder: '33' },
  { label: 'Antebraco direito', placeholder: '28' },
  { label: 'Antebraco esquerdo', placeholder: '28' },
  { label: 'Punho direito', placeholder: '18' },
  { label: 'Punho esquerdo', placeholder: '18' },
  { label: 'Coxa direita', placeholder: '58' },
  { label: 'Coxa esquerda', placeholder: '58' },
  { label: 'Panturrilha direita', placeholder: '36' },
  { label: 'Panturrilha esquerda', placeholder: '36' },
];

const photoPositions = [
  { key: 'frente', label: 'Frente' },
  { key: 'costas', label: 'Costas' },
  { key: 'ladoDireito', label: 'Lado dir.' },
  { key: 'ladoEsquerdo', label: 'Lado esq.' },
];

const assistantPrompts = [
  'Crie uma avaliacao online para aluno iniciante com foco em emagrecimento.',
  'Monte uma avaliacao online para aluno que quer hipertrofia.',
  'Checklist de avaliacao online com foco em postura e rotina.',
];

const toLocalDate = (value: string) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatEvaluationClipboard = (evaluation: AssistantEvaluation) => {
  const lines = evaluation.itens.map((item, index) => `${index + 1}. ${item}`);
  return [evaluation.titulo, evaluation.objetivo, ...lines].filter(Boolean).join('\n');
};

export default function AvaliacaoOnlinePage() {
  const { userId } = useUserScope();
  const { role } = useAuth();
  const { data } = useCollectionData<OnlineRow>(['users', userId, 'avaliacaoOnline']);
  const [photos, setPhotos] = useState<Record<string, string | null>>({
    frente: null,
    costas: null,
    ladoDireito: null,
    ladoEsquerdo: null,
  });
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantDate, setAssistantDate] = useState('');
  const [assistantResult, setAssistantResult] = useState<AssistantEvaluation | null>(null);
  const [assistantFallback, setAssistantFallback] = useState('');
  const [assistantExpanded, setAssistantExpanded] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const openRouterKey =
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
  const hasOpenRouter = Boolean(openRouterKey);
  const agendaBase = role === 'academy' ? '/academy/agenda' : '/schedule';
  const agendaDate = toLocalDate(assistantDate);
  const agendaLabel = agendaDate ? formatDate(agendaDate) : '';
  const photosRef = useRef(photos);

  useEffect(() => {
    const previous = photosRef.current;
    Object.keys(photos).forEach((key) => {
      const prevUrl = previous[key];
      if (prevUrl && prevUrl !== photos[key]) {
        URL.revokeObjectURL(prevUrl);
      }
    });
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      Object.values(photosRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  useEffect(() => {
    if (!copyMessage) return;
    const timer = window.setTimeout(() => setCopyMessage(''), 2000);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  const visibleItems = assistantResult
    ? assistantExpanded
      ? assistantResult.itens
      : assistantResult.itens.slice(0, 6)
    : [];

  const handlePhotoChange = (key: string, file?: File | null) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setPhotos((prev) => ({ ...prev, [key]: previewUrl }));
  };

  const buildAssistantPrompt = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return [
      'Crie uma avaliacao online.',
      `Objetivo: ${trimmed}.`,
      'Inclua perguntas sobre medidas, fotos, habitos e rotina.',
      'Use perguntas claras e organizadas por topico.',
    ].join(' ');
  };

  const submitAssistantPrompt = async (rawPrompt: string) => {
    const trimmed = rawPrompt.trim();
    if (!trimmed) {
      setAssistantError('Descreva o objetivo da avaliacao.');
      return;
    }
    if (!hasOpenRouter) {
      setAssistantError('Conecte o OpenRouter para gerar avaliacoes com IA.');
      return;
    }
    setAssistantLoading(true);
    setAssistantError('');
    setAssistantFallback('');
    setAssistantResult(null);
    try {
      const { evaluation, text } = await chatWithAI(buildAssistantPrompt(trimmed));
      const items = evaluation?.itens?.map((item) => String(item || '').trim()).filter(Boolean) || [];
      if (evaluation && items.length) {
        setAssistantResult({
          titulo: evaluation.titulo || 'Avaliacao online',
          objetivo: evaluation.objetivo,
          itens: items,
        });
        setAssistantExpanded(false);
      } else {
        setAssistantFallback(text || '');
        setAssistantError('Nao foi possivel gerar uma avaliacao estruturada.');
      }
    } catch (err: any) {
      setAssistantError(err?.message || 'Erro ao gerar avaliacao.');
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleAssistantSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitAssistantPrompt(assistantPrompt);
  };

  return (
    <PageShell
      title="Avaliacao online"
      description="Medidas, fotos e observacoes para acompanhar a evolucao."
      titleAddon={
        <>
          <label className="page-title-date">
            Agenda
            <input
              type="date"
              className="page-title-input"
              value={assistantDate}
              onChange={(event) => setAssistantDate(event.target.value)}
            />
          </label>
          {assistantDate ? (
            <span className="subtle">Data selecionada: {agendaLabel || assistantDate}</span>
          ) : null}
        </>
      }
      breadcrumbs={[{ label: 'Avaliacoes', href: '/evaluations' }]}
    >
      <UserScopePicker />

      <div className="evaluation-form-grid">
        <div className="portal-card evaluation-section">
          <div>
            <h3>Medidas e circunferencias</h3>
            <p className="subtle">Registre peso, altura e composicao corporal.</p>
          </div>
          <div className="evaluation-field-grid">
            {basicFields.map((field) => (
              <label key={field.label}>
                {field.label}
                <input className="evaluation-input" placeholder={field.placeholder} />
              </label>
            ))}
          </div>

          <h4>Composicao corporal</h4>
          <div className="evaluation-field-grid">
            {compositionFields.map((field) => (
              <label key={field.label}>
                {field.label}
                <input className="evaluation-input" placeholder={field.placeholder} />
              </label>
            ))}
          </div>

          <h4>Circunferencias</h4>
          <div className="evaluation-field-grid evaluation-field-grid--wide">
            {circumferenceFields.map((field) => (
              <label key={field.label}>
                {field.label}
                <input className="evaluation-input" placeholder={field.placeholder} />
              </label>
            ))}
          </div>
        </div>

        <div className="portal-card evaluation-section">
          <div>
            <h3>Fotos da avaliacao</h3>
            <p className="subtle">Adicione fotos para acompanhar a evolucao do aluno.</p>
          </div>
          <div className="evaluation-photo-grid">
            {photoPositions.map((position) => {
              const preview = photos[position.key];
              return (
                <label
                  key={position.key}
                  className={`evaluation-photo-slot${preview ? ' is-filled' : ''}`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => handlePhotoChange(position.key, event.target.files?.[0])}
                  />
                  {preview ? (
                    <img
                      src={preview}
                      alt={`Foto ${position.label}`}
                      className="evaluation-photo-preview"
                    />
                  ) : (
                    <span>{position.label}</span>
                  )}
                </label>
              );
            })}
          </div>

          <label>
            Observacoes
            <textarea className="evaluation-textarea" placeholder="Notas adicionais..." />
          </label>
        </div>

        <div className="portal-card evaluations-assistant-card">
          <div>
            <p className="pill">MH Assistente</p>
            <h3>Avaliacao online com IA</h3>
            <p className="subtle" style={{ marginTop: 6 }}>
              Descreva o objetivo e gere um roteiro de avaliacao online.
            </p>
          </div>
          <p className="subtle">{hasOpenRouter ? 'IA ativa com OpenRouter.' : 'IA indisponivel.'}</p>
          <form className="ai-form assistant-form" onSubmit={handleAssistantSubmit}>
            <label>
              Objetivo da avaliacao
              <textarea
                rows={4}
                value={assistantPrompt}
                onChange={(event) => setAssistantPrompt(event.target.value)}
                placeholder="Ex: aluno com foco em emagrecimento e rotina sedentaria."
              />
            </label>
            <div className="evaluations-assistant-actions">
              <button className="button" type="submit" disabled={assistantLoading}>
                {assistantLoading ? 'Gerando...' : 'Gerar avaliacao'}
              </button>
              <Link href="/ai/assistant" className="button secondary">
                Assistente completo
              </Link>
            </div>
          </form>
          {assistantError && <p className="ai-alert">{assistantError}</p>}
          {assistantResult && (
            <div className="ai-workout-card">
              <div className="ai-workout-header">
                <div>
                  <span className="ai-workout-tag">Avaliacao IA</span>
                  <h4>{assistantResult.titulo || 'Avaliacao online'}</h4>
                  {assistantResult.objetivo && (
                    <p className="ai-workout-objective">{assistantResult.objetivo}</p>
                  )}
                </div>
                {assistantResult.itens.length > 6 && (
                  <button
                    type="button"
                    className="ai-workout-toggle"
                    onClick={() => setAssistantExpanded((prev) => !prev)}
                  >
                    {assistantExpanded ? 'Mostrar menos' : 'Ver avaliacao'}
                  </button>
                )}
              </div>
              <ul className="ai-workout-list">
                {visibleItems.map((item, index) => (
                  <li key={`${assistantResult.titulo}-${index}`}>
                    <span>{index + 1}.</span>
                    <p>{item}</p>
                  </li>
                ))}
              </ul>
              {assistantResult.itens.length > 6 && !assistantExpanded && (
                <span className="ai-workout-hint">+{assistantResult.itens.length - 6} itens ocultos</span>
              )}
              <div className="ai-workout-actions">
                <button
                  type="button"
                  className="button secondary sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(formatEvaluationClipboard(assistantResult));
                      setCopyMessage('Avaliacao copiada!');
                    } catch {
                      setCopyMessage('Nao foi possivel copiar.');
                    }
                  }}
                >
                  Copiar avaliacao
                </button>
              </div>
              {copyMessage && <p className="subtle">{copyMessage}</p>}
            </div>
          )}
          {!assistantResult && assistantFallback && (
            <div className="ai-response-card">
              <p className="ai-response-text">{assistantFallback}</p>
            </div>
          )}
          <div className="evaluations-assistant-prompts">
            {assistantPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="evaluations-assistant-chip"
                onClick={() => {
                  setAssistantPrompt(prompt);
                  submitAssistantPrompt(prompt);
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="portal-card portal-card--table" style={{ marginTop: 24 }}>
        <h3>Avaliacoes online</h3>
        {userId ? (
          <DataTable
            rows={data}
            columns={[
              { key: 'id', label: 'ID' },
              { key: 'status', label: 'Status' },
              { key: 'createdAt', label: 'Criado em', render: (row) => formatDate(row.createdAt ?? row.data) },
            ]}
            emptyMessage="Nenhuma avaliacao online encontrada."
          />
        ) : (
          <p className="subtle">Informe um UID para listar avaliacoes.</p>
        )}
      </div>
    </PageShell>
  );
}
