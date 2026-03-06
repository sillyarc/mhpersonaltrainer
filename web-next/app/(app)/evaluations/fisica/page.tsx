'use client';

import { useState, type FormEvent } from 'react';
import PageShell from '@/components/PageShell';
import DataTable from '@/components/data/DataTable';
import UserScopePicker from '@/components/data/UserScopePicker';
import { formatDate, useCollectionData, useUserScope } from '@/lib/firestoreHooks';
import {
  SKINFOLD_PROTOCOL_OPTIONS,
  calculateIMC,
  createPhysicalTestEvaluation,
} from '@/lib/services/evaluations';
import type {
  Circumferences,
  PhysicalTest,
  SkinFolds,
  SkinfoldEtnia,
  SkinfoldMaturacao,
  SkinfoldProtocolId,
  TestResult,
} from '@/lib/types/evaluation';

interface FisicaRow {
  id: string;
  createdAt?: unknown;
  data?: unknown;
  status?: string;
}

interface TestDraft {
  id: string;
  nome: string;
  descricao: string;
  unidade: string;
  valor: string;
  classificacao: string;
}

const basicFields = [
  { key: 'peso', label: 'Peso (kg)', placeholder: '78' },
  { key: 'altura', label: 'Altura (cm)', placeholder: '175' },
  { key: 'imc', label: 'IMC', placeholder: '25.4' },
  { key: 'percentualGordura', label: 'Percentual de gordura (%)', placeholder: '18' },
] as const;

const compositionFields = [
  { key: 'massaMagra', label: 'Massa magra (kg)', placeholder: '62' },
  { key: 'massaGorda', label: 'Massa gorda (kg)', placeholder: '16' },
  { key: 'densidadeCorporal', label: 'Densidade corporal', placeholder: '1.05' },
  { key: 'taxaMetabolicaBasal', label: 'Taxa metabolica basal', placeholder: '1600' },
] as const;

const circumferenceFields = [
  { key: 'pescoco', label: 'Pescoco', placeholder: '40' },
  { key: 'ombro', label: 'Ombro', placeholder: '112' },
  { key: 'torax', label: 'Torax', placeholder: '98' },
  { key: 'cintura', label: 'Cintura', placeholder: '82' },
  { key: 'quadril', label: 'Quadril', placeholder: '100' },
  { key: 'bracoDireito', label: 'Braco direito', placeholder: '33' },
  { key: 'bracoEsquerdo', label: 'Braco esquerdo', placeholder: '33' },
  { key: 'antebracoDireito', label: 'Antebraco direito', placeholder: '28' },
  { key: 'antebracoEsquerdo', label: 'Antebraco esquerdo', placeholder: '28' },
  { key: 'punhoDireito', label: 'Punho direito', placeholder: '18' },
  { key: 'punhoEsquerdo', label: 'Punho esquerdo', placeholder: '18' },
  { key: 'coxaDireita', label: 'Coxa direita', placeholder: '58' },
  { key: 'coxaEsquerda', label: 'Coxa esquerda', placeholder: '58' },
  { key: 'panturrilhaDireita', label: 'Panturrilha direita', placeholder: '36' },
  { key: 'panturrilhaEsquerda', label: 'Panturrilha esquerda', placeholder: '36' },
] as const;

const skinfoldFields = [
  { key: 'triceps', label: 'Tricipital', placeholder: 'mm' },
  { key: 'biceps', label: 'Bicipital', placeholder: 'mm' },
  { key: 'subescapular', label: 'Subescapular', placeholder: 'mm' },
  { key: 'suprailiacas', label: 'Suprailiaca', placeholder: 'mm' },
  { key: 'abdominal', label: 'Abdominal', placeholder: 'mm' },
  { key: 'peitoral', label: 'Peitoral', placeholder: 'mm' },
  { key: 'coxaMedial', label: 'Coxa medial', placeholder: 'mm' },
  { key: 'axilarMedia', label: 'Axilar media', placeholder: 'mm' },
  { key: 'panturrilhaMedial', label: 'Panturrilha medial', placeholder: 'mm' },
] as const;

const basicInitialState: Record<(typeof basicFields)[number]['key'], string> = {
  peso: '',
  altura: '',
  imc: '',
  percentualGordura: '',
};

const compositionInitialState: Record<(typeof compositionFields)[number]['key'], string> = {
  massaMagra: '',
  massaGorda: '',
  densidadeCorporal: '',
  taxaMetabolicaBasal: '',
};

const circumferenceInitialState: Record<(typeof circumferenceFields)[number]['key'], string> = {
  pescoco: '',
  ombro: '',
  torax: '',
  cintura: '',
  quadril: '',
  bracoDireito: '',
  bracoEsquerdo: '',
  antebracoDireito: '',
  antebracoEsquerdo: '',
  punhoDireito: '',
  punhoEsquerdo: '',
  coxaDireita: '',
  coxaEsquerda: '',
  panturrilhaDireita: '',
  panturrilhaEsquerda: '',
};

const skinfoldInitialState: Record<(typeof skinfoldFields)[number]['key'], string> = {
  triceps: '',
  biceps: '',
  subescapular: '',
  suprailiacas: '',
  abdominal: '',
  peitoral: '',
  coxaMedial: '',
  axilarMedia: '',
  panturrilhaMedial: '',
};

const parseNumber = (value: string): number | undefined => {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const hasNumber = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const buildTestDraft = (base?: Partial<TestDraft>): TestDraft => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  nome: base?.nome || '',
  descricao: base?.descricao || '',
  unidade: base?.unidade || '',
  valor: base?.valor || '',
  classificacao: base?.classificacao || '',
});

export default function AvaliacaoFisicaPage() {
  const { userId } = useUserScope();
  const { data } = useCollectionData<FisicaRow>(['users', userId, 'avaliacoesFisicas']);
  const [basicValues, setBasicValues] = useState(basicInitialState);
  const [compositionValues, setCompositionValues] = useState(compositionInitialState);
  const [circumferenceValues, setCircumferenceValues] = useState(circumferenceInitialState);
  const [skinfoldValues, setSkinfoldValues] = useState(skinfoldInitialState);
  const [tests, setTests] = useState<TestDraft[]>(() => [buildTestDraft()]);
  const [idade, setIdade] = useState('');
  const [sexo, setSexo] = useState<'' | 'masculino' | 'feminino'>('');
  const [protocoloDobras, setProtocoloDobras] = useState<SkinfoldProtocolId>(
    SKINFOLD_PROTOCOL_OPTIONS[0].id
  );
  const [dobrasMaturacao, setDobrasMaturacao] = useState<'' | SkinfoldMaturacao>('');
  const [dobrasEtnia, setDobrasEtnia] = useState<'' | SkinfoldEtnia>('');
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const updateTest = (id: string, key: keyof Omit<TestDraft, 'id'>, value: string) => {
    setTests((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [key]: value } : item))
    );
  };

  const resetForm = () => {
    setBasicValues(basicInitialState);
    setCompositionValues(compositionInitialState);
    setCircumferenceValues(circumferenceInitialState);
    setSkinfoldValues(skinfoldInitialState);
    setTests([buildTestDraft()]);
    setIdade('');
    setSexo('');
    setProtocoloDobras(SKINFOLD_PROTOCOL_OPTIONS[0].id);
    setDobrasMaturacao('');
    setDobrasEtnia('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) {
      setSaveFeedback({ type: 'error', message: 'Informe o UID do aluno antes de salvar.' });
      return;
    }

    setSaving(true);
    setSaveFeedback(null);

    const peso = parseNumber(basicValues.peso);
    const altura = parseNumber(basicValues.altura);
    const imcManual = parseNumber(basicValues.imc);
    const imc = imcManual ?? (hasNumber(peso) && hasNumber(altura) ? calculateIMC(peso, altura) : undefined);
    const percentualGordura = parseNumber(basicValues.percentualGordura);
    const massaMagra = parseNumber(compositionValues.massaMagra);
    const massaGorda = parseNumber(compositionValues.massaGorda);
    const densidadeCorporal = parseNumber(compositionValues.densidadeCorporal);
    const taxaMetabolicaBasal = parseNumber(compositionValues.taxaMetabolicaBasal);
    const idadeParsed = parseNumber(idade);

    const circunferencias: Circumferences = {
      pescoco: parseNumber(circumferenceValues.pescoco),
      ombro: parseNumber(circumferenceValues.ombro),
      torax: parseNumber(circumferenceValues.torax),
      cintura: parseNumber(circumferenceValues.cintura),
      quadril: parseNumber(circumferenceValues.quadril),
      bracoDireito: parseNumber(circumferenceValues.bracoDireito),
      bracoEsquerdo: parseNumber(circumferenceValues.bracoEsquerdo),
      antebracoDireito: parseNumber(circumferenceValues.antebracoDireito),
      antebracoEsquerdo: parseNumber(circumferenceValues.antebracoEsquerdo),
      punhoDireito: parseNumber(circumferenceValues.punhoDireito),
      punhoEsquerdo: parseNumber(circumferenceValues.punhoEsquerdo),
      coxaDireita: parseNumber(circumferenceValues.coxaDireita),
      coxaEsquerda: parseNumber(circumferenceValues.coxaEsquerda),
      panturrilhaDireita: parseNumber(circumferenceValues.panturrilhaDireita),
      panturrilhaEsquerda: parseNumber(circumferenceValues.panturrilhaEsquerda),
    };

    const dobrasCutaneas: SkinFolds = {
      triceps: parseNumber(skinfoldValues.triceps),
      biceps: parseNumber(skinfoldValues.biceps),
      subescapular: parseNumber(skinfoldValues.subescapular),
      suprailiacas: parseNumber(skinfoldValues.suprailiacas),
      abdominal: parseNumber(skinfoldValues.abdominal),
      peitoral: parseNumber(skinfoldValues.peitoral),
      coxaMedial: parseNumber(skinfoldValues.coxaMedial),
      axilarMedia: parseNumber(skinfoldValues.axilarMedia),
      panturrilhaMedial: parseNumber(skinfoldValues.panturrilhaMedial),
    };

    const hasCircunferencias = Object.values(circunferencias).some(hasNumber);
    const hasDobras = Object.values(dobrasCutaneas).some(hasNumber);
    const hasComposicao =
      hasNumber(peso) ||
      hasNumber(altura) ||
      hasNumber(imc) ||
      hasNumber(percentualGordura) ||
      hasNumber(massaMagra) ||
      hasNumber(massaGorda) ||
      hasNumber(densidadeCorporal) ||
      hasNumber(taxaMetabolicaBasal) ||
      hasCircunferencias ||
      hasDobras;

    const parsedTests = tests
      .map((item): { test: PhysicalTest; result?: TestResult } | null => {
        const nome = item.nome.trim();
        if (!nome) return null;
        const valorNumerico = parseNumber(item.valor);
        const valorTexto = item.valor.trim();
        const classificacao = item.classificacao.trim();
        const result =
          hasNumber(valorNumerico) || valorTexto || classificacao
            ? {
                testId: item.id,
                valor: hasNumber(valorNumerico) ? valorNumerico : valorTexto || '-',
                classificacao: classificacao || undefined,
              }
            : undefined;
        return {
          test: {
            id: item.id,
            nome,
            descricao: item.descricao.trim() || undefined,
            unidade: item.unidade.trim() || undefined,
          },
          result,
        };
      })
      .filter((item): item is { test: PhysicalTest; result?: TestResult } => item !== null);

    const testes = parsedTests.map((item) => item.test);
    const resultados = parsedTests
      .map((item) => item.result)
      .filter((item): item is TestResult => Boolean(item));

    const result = await createPhysicalTestEvaluation({
      type: 'fisica',
      userId,
      date: new Date(),
      status: 'concluida',
      testes,
      resultados,
      composicaoCorporal: hasComposicao
        ? {
            peso: hasNumber(peso) ? peso : 0,
            altura: hasNumber(altura) ? altura : 0,
            imc: hasNumber(imc) ? imc : 0,
            percentualGordura,
            massaMagra,
            massaGorda,
            densidadeCorporal,
            taxaMetabolicaBasal,
            protocoloDobras,
            dobrasMaturacao: dobrasMaturacao || undefined,
            dobrasEtnia: dobrasEtnia || undefined,
            circunferencias: hasCircunferencias ? circunferencias : undefined,
            dobrasCutaneas: hasDobras ? dobrasCutaneas : undefined,
          }
        : undefined,
      sexo: sexo || undefined,
      idade: hasNumber(idadeParsed) ? Math.round(idadeParsed) : undefined,
    });

    if (result.error) {
      setSaveFeedback({ type: 'error', message: result.error });
      setSaving(false);
      return;
    }

    setSaveFeedback({ type: 'success', message: 'Avaliacao fisica salva com sucesso.' });
    resetForm();
    setSaving(false);
  };

  return (
    <PageShell
      title="Avaliacao fisica"
      description="Registre medidas corporais e indicadores de performance."
      breadcrumbs={[{ label: 'Avaliacoes', href: '/evaluations' }]}
    >
      <UserScopePicker />

      <form onSubmit={handleSubmit}>
        <div className="evaluation-form-grid">
          <div className="portal-card evaluation-section">
            <div>
              <h3>Medidas e circunferencias</h3>
              <p className="subtle">Base para calcular composicao corporal e evolucao.</p>
            </div>
            <div className="evaluation-field-grid">
              {basicFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    className="evaluation-input"
                    placeholder={field.placeholder}
                    value={basicValues[field.key]}
                    onChange={(event) =>
                      setBasicValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>

            <h4>Composicao corporal</h4>
            <div className="evaluation-field-grid">
              {compositionFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    className="evaluation-input"
                    placeholder={field.placeholder}
                    value={compositionValues[field.key]}
                    onChange={(event) =>
                      setCompositionValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>

            <h4>Circunferencias</h4>
            <div className="evaluation-field-grid evaluation-field-grid--wide">
              {circumferenceFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    className="evaluation-input"
                    placeholder={field.placeholder}
                    value={circumferenceValues[field.key]}
                    onChange={(event) =>
                      setCircumferenceValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="portal-card evaluation-section">
            <div>
              <h3>Dobras cutaneas e protocolos</h3>
              <p className="subtle">Selecione o protocolo e preencha as medidas.</p>
            </div>
            <label>
              Protocolo de dobras
              <select
                className="evaluation-select"
                value={protocoloDobras}
                onChange={(event) => setProtocoloDobras(event.target.value as SkinfoldProtocolId)}
              >
                {SKINFOLD_PROTOCOL_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="evaluation-field-grid">
              <label>
                Idade
                <input
                  className="evaluation-input"
                  placeholder="30"
                  value={idade}
                  onChange={(event) => setIdade(event.target.value)}
                />
              </label>
              <label>
                Sexo
                <select
                  className="evaluation-select"
                  value={sexo}
                  onChange={(event) => setSexo(event.target.value as '' | 'masculino' | 'feminino')}
                >
                  <option value="">Selecionar</option>
                  <option value="masculino">Masculino</option>
                  <option value="feminino">Feminino</option>
                </select>
              </label>
              <label>
                Maturacao
                <select
                  className="evaluation-select"
                  value={dobrasMaturacao}
                  onChange={(event) =>
                    setDobrasMaturacao(event.target.value as '' | SkinfoldMaturacao)
                  }
                >
                  <option value="">Nao informado</option>
                  <option value="prepuber">Pre-puber</option>
                  <option value="puber">Puber</option>
                  <option value="pospuber">Pos-puber</option>
                </select>
              </label>
              <label>
                Etnia
                <select
                  className="evaluation-select"
                  value={dobrasEtnia}
                  onChange={(event) => setDobrasEtnia(event.target.value as '' | SkinfoldEtnia)}
                >
                  <option value="">Nao informado</option>
                  <option value="branco">Branco</option>
                  <option value="negro">Negro</option>
                  <option value="outro">Outro</option>
                </select>
              </label>
            </div>
            <h4>Dobras cutaneas</h4>
            <div className="evaluation-field-grid">
              {skinfoldFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    className="evaluation-input"
                    placeholder={field.placeholder}
                    value={skinfoldValues[field.key]}
                    onChange={(event) =>
                      setSkinfoldValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="portal-card evaluation-section">
            <div>
              <h3>Testes fisicos</h3>
              <p className="subtle">Adicione testes e registre os resultados.</p>
            </div>
            <div className="evaluation-field-grid evaluation-field-grid--wide">
              {tests.map((test) => (
                <div key={test.id} className="portal-card evaluation-section">
                  <label>
                    Nome do teste
                    <input
                      className="evaluation-input"
                      placeholder="Ex: Flexao de bracos"
                      value={test.nome}
                      onChange={(event) => updateTest(test.id, 'nome', event.target.value)}
                    />
                  </label>
                  <label>
                    Descricao
                    <input
                      className="evaluation-input"
                      placeholder="Ex: Repeticoes maximas"
                      value={test.descricao}
                      onChange={(event) => updateTest(test.id, 'descricao', event.target.value)}
                    />
                  </label>
                  <label>
                    Unidade
                    <input
                      className="evaluation-input"
                      placeholder="reps"
                      value={test.unidade}
                      onChange={(event) => updateTest(test.id, 'unidade', event.target.value)}
                    />
                  </label>
                  <label>
                    Valor
                    <input
                      className="evaluation-input"
                      placeholder="Ex: 20"
                      value={test.valor}
                      onChange={(event) => updateTest(test.id, 'valor', event.target.value)}
                    />
                  </label>
                  <label>
                    Classificacao
                    <select
                      className="evaluation-select"
                      value={test.classificacao}
                      onChange={(event) => updateTest(test.id, 'classificacao', event.target.value)}
                    >
                      <option value="">Selecionar</option>
                      <option value="bom">Bom</option>
                      <option value="medio">Medio</option>
                      <option value="ruim">Ruim</option>
                    </select>
                  </label>
                </div>
              ))}
            </div>
            <div className="evaluation-inline-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setTests((prev) => [...prev, buildTestDraft()])}
              >
                Adicionar teste
              </button>
            </div>
          </div>
        </div>

        <div className="evaluation-inline-actions" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="button secondary" type="button" onClick={resetForm} disabled={saving}>
            Limpar formulario
          </button>
          <button className="button" type="submit" disabled={saving || !userId}>
            {saving ? 'Salvando...' : 'Salvar avaliacao'}
          </button>
        </div>

        {saveFeedback && (
          <p className={saveFeedback.type === 'error' ? 'ai-alert' : 'subtle'} style={{ marginTop: 10 }}>
            {saveFeedback.message}
          </p>
        )}
      </form>

      <div className="portal-card portal-card--table" style={{ marginTop: 24 }}>
        <h3>Avaliacoes fisicas</h3>
        {userId ? (
          <DataTable
            rows={data}
            columns={[
              { key: 'id', label: 'ID' },
              { key: 'status', label: 'Status' },
              { key: 'createdAt', label: 'Criado em', render: (row) => formatDate(row.createdAt ?? row.data) },
            ]}
            emptyMessage="Nenhuma avaliacao fisica encontrada."
          />
        ) : (
          <p className="subtle">Informe um UID para listar avaliacoes.</p>
        )}
      </div>
    </PageShell>
  );
}
