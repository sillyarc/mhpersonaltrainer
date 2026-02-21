export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  personalPhotoUrl?: string;
  phoneNumber?: string;
  birthday?: string;
  genero?: string;
  createdTime: Date;
  lastActiveTime?: Date;
  professorAccount: boolean;
  admin: boolean;
  assinatura: boolean;
  tipoDeAssinatura?: string;
  planoChatGPT: boolean;
  acessoSuspenso: boolean;
  codigoPersonal?: number;
  personalAccountId?: string;
  nameDoSeuPersonal?: string;
  objetivoNoApp?: string;
  experiencia?: string;
  equipamento?: string;
  tempoPorSessao?: string;
  diasDeTreino?: string;
  limitacao?: string;
  peso?: string;
  altura?: string;
  nivelDeAtividade?: string;
  alunoDesde?: Date;
  metodoDePagamento?: string;
  chavePixDoPersonal?: string;
  cpfCnpj?: string;
  customer?: string;
  subscribeId?: string;
  stripeAtivo?: boolean;
  stripeAccountId?: string;
  bio?: string;
  cref?: string;
  instagram?: string;
  linkedin?: string;
  cidade?: string;
  estado?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  especializacao?: string | string[];
  servicos?: Service[];
  horarioAtendimento?: Schedule;
  alunos?: string[];
  treinos?: string[];
  rotinaDeTreino?: string[];
}

export interface Service {
  nome: string;
  descricao?: string;
  preco?: number;
  duracao?: number;
}

export interface Schedule {
  inicioSegSex?: Date | string;
  terminioSegSex?: Date | string;
  inicioSab?: Date | string;
  terminioSab?: Date | string;
  inicioDom?: Date | string;
  terminioDom?: Date | string;
}

export interface TimeSlot {
  inicio: string;
  fim: string;
  disponivel: boolean;
}

export type UserRole = 'aluno' | 'personal' | 'professor' | 'admin';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole | null;
}
