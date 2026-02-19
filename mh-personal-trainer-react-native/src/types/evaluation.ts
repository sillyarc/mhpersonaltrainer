export interface PhysicalEvaluation {
  id: string;
  type: EvaluationType;
  userId: string;
  personalId?: string;
  date: Date;
  status: EvaluationStatus;
  createdAt: Date;
  updatedAt?: Date;
}

export type EvaluationType = 'online' | 'personalizada' | 'postural' | 'fisica';
export type EvaluationStatus =
  | 'pendente'
  | 'agendada'
  | 'em_andamento'
  | 'concluida'
  | 'cancelada'
  | 'nao_realizada';

export type SkinfoldProtocolId =
  | 'faulkner_1968_4'
  | 'pollock_1984_7'
  | 'pollock_1984_3'
  | 'siri_brozek_4'
  | 'yuhasz_6'
  | 'petroski_1995_4'
  | 'guedes_1994_3'
  | 'guedes_2_criancas'
  | 'penrose_cote_2'
  | 'weltman_obesos_2';

export type SkinfoldMaturacao = 'prepuber' | 'puber' | 'pospuber';
export type SkinfoldEtnia = 'branco' | 'negro' | 'outro';

export interface OnlineEvaluation extends PhysicalEvaluation {
  type: 'online';
  peso?: number;
  altura?: number;
  imc?: number;
  circunferencias?: Circumferences;
  fotos?: EvaluationPhotos;
  observacoes?: string;
  resultado?: string;
}

export interface PersonalizedEvaluation extends PhysicalEvaluation {
  type: 'personalizada';
  perguntas: EvaluationQuestion[];
  respostas?: EvaluationAnswer[];
  prazoResposta?: Date | null;
  respondidoEm?: Date;
  confirmadoEm?: Date;
  feedbackEnviado?: boolean;
  resultado?: string;
  recomendacoes?: string[];
}

export interface PosturalEvaluation extends PhysicalEvaluation {
  type: 'postural';
  fotosPostura: PosturePhotos;
  analise?: PostureAnalysis;
  recomendacoes?: string[];
}

export interface PhysicalTestEvaluation extends PhysicalEvaluation {
  type: 'fisica';
  testes: PhysicalTest[];
  resultados?: TestResult[];
  composicaoCorporal?: BodyComposition;
  sexo?: 'masculino' | 'feminino';
  idade?: number;
}

export interface Circumferences {
  pescoco?: number;
  ombro?: number;
  torax?: number;
  cintura?: number;
  abdominal?: number;
  quadril?: number;
  bracoDireito?: number;
  bracoEsquerdo?: number;
  antebracoDireito?: number;
  antebracoEsquerdo?: number;
  punhoDireito?: number;
  punhoEsquerdo?: number;
  coxaDireita?: number;
  coxaEsquerda?: number;
  panturrilhaDireita?: number;
  panturrilhaEsquerda?: number;
}

export interface EvaluationPhotos {
  frente?: string;
  costas?: string;
  ladoDireito?: string;
  ladoEsquerdo?: string;
}

export interface PosturePhotos {
  anterior?: string;
  posterior?: string;
  lateralDireita?: string;
  lateralEsquerda?: string;
}

export interface PostureAnalysis {
  cabeca?: string;
  ombros?: string;
  coluna?: string;
  quadril?: string;
  joelhos?: string;
  pes?: string;
  observacoes?: string;
}

export interface EvaluationQuestion {
  id: string;
  pergunta: string;
  tipo: 'texto' | 'multipla_escolha' | 'escala' | 'sim_nao';
  opcoes?: string[];
  obrigatoria: boolean;
}

export interface EvaluationAnswer {
  questionId: string;
  resposta: string | number | boolean;
}

export interface PhysicalTest {
  id: string;
  nome: string;
  descricao?: string;
  unidade?: string;
}

export interface TestResult {
  testId: string;
  valor: number | string;
  classificacao?: string;
}

export interface BodyComposition {
  peso: number;
  altura: number;
  imc: number;
  percentualGordura?: number;
  percentualGorduraSiri?: number;
  percentualGorduraBrozek?: number;
  densidadeCorporal?: number;
  massaMagra?: number;
  massaGorda?: number;
  taxaMetabolicaBasal?: number;
  dobrasCutaneas?: SkinFolds;
  protocoloDobras?: SkinfoldProtocolId;
  dobrasMaturacao?: SkinfoldMaturacao;
  dobrasEtnia?: SkinfoldEtnia;
  circunferencias?: Circumferences;
}

export interface SkinFolds {
  triceps?: number;
  biceps?: number;
  subescapular?: number;
  suprailiacas?: number;
  abdominal?: number;
  peitoral?: number;
  coxaMedial?: number;
  axilarMedia?: number;
  panturrilhaMedial?: number;
}
