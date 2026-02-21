'use client';

import PageShell from '@/components/PageShell';
import DataTable from '@/components/data/DataTable';
import UserScopePicker from '@/components/data/UserScopePicker';
import { formatDate, useCollectionData, useUserScope } from '@/lib/firestoreHooks';

interface FisicaRow {
  id: string;
  createdAt?: any;
  data?: any;
  status?: string;
}

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

const protocolOptions = [
  'Faulkner 4 dobras',
  'Pollock 7 dobras',
  'Pollock 3 dobras',
  'Siri/Brozek 4 dobras',
  'Yuhasz 6 dobras',
  'Petroski 4 dobras',
  'Guedes 3 dobras',
  'Guedes 2 criancas',
  'Penrose-Cote 2 dobras',
  'Weltman obesos 2',
];

const skinfoldFields = [
  'Tricipital',
  'Bicipital',
  'Subescapular',
  'Suprailiaca',
  'Abdominal',
  'Peitoral',
  'Coxa medial',
  'Axilar media',
  'Panturrilha medial',
];

const testExamples = [
  { name: 'Flexao de bracos', description: 'Repeticoes maximas', unit: 'reps' },
  { name: 'Agachamento livre', description: 'Carga maxima', unit: 'kg' },
];

export default function AvaliacaoFisicaPage() {
  const { userId } = useUserScope();
  const { data } = useCollectionData<FisicaRow>(['users', userId, 'avaliacoesFisicas']);

  return (
    <PageShell
      title="Avaliacao fisica"
      description="Registre medidas corporais e indicadores de performance."
      breadcrumbs={[{ label: 'Avaliacoes', href: '/evaluations' }]}
    >
      <UserScopePicker />
      <div className="evaluation-form-grid">
        <div className="portal-card evaluation-section">
          <div>
            <h3>Medidas e circunferencias</h3>
            <p className="subtle">Base para calcular composicao corporal e evolucao.</p>
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
            <h3>Dobras cutaneas e protocolos</h3>
            <p className="subtle">Selecione o protocolo e preencha as medidas.</p>
          </div>
          <label>
            Protocolo de dobras
            <select className="evaluation-select">
              {protocolOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <div className="evaluation-field-grid">
            <label>
              Idade
              <input className="evaluation-input" placeholder="30" />
            </label>
            <label>
              Sexo
              <select className="evaluation-select">
                <option>Masculino</option>
                <option>Feminino</option>
              </select>
            </label>
            <label>
              Maturacao
              <select className="evaluation-select">
                <option>Pre-puber</option>
                <option>Puber</option>
                <option>Pos-puber</option>
              </select>
            </label>
            <label>
              Etnia
              <select className="evaluation-select">
                <option>Branco</option>
                <option>Negro</option>
                <option>Outro</option>
              </select>
            </label>
          </div>
          <h4>Dobras cutaneas</h4>
          <div className="evaluation-field-grid">
            {skinfoldFields.map((label) => (
              <label key={label}>
                {label}
                <input className="evaluation-input" placeholder="mm" />
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
            {testExamples.map((test) => (
              <div key={test.name} className="portal-card evaluation-section">
                <strong>{test.name}</strong>
                <span className="subtle">{test.description}</span>
                <label>
                  Unidade
                  <input className="evaluation-input" placeholder={test.unit} />
                </label>
                <label>
                  Resultado
                  <select className="evaluation-select">
                    <option>Bom</option>
                    <option>Medio</option>
                    <option>Ruim</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
          <div className="evaluation-inline-actions">
            <button className="button secondary" type="button">
              Adicionar teste
            </button>
          </div>
        </div>
      </div>

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
