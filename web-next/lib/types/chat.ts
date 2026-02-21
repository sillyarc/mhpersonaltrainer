export interface Conversation {
  id: string;
  participants: string[];
  lastMessage?: Message;
  lastMessageAt?: Date;
  createdAt: Date;
  unreadCount: Record<string, number>;
  type: ConversationType;
  participantInfo?: Record<string, ParticipantInfo>;
}

export type ConversationType = 'direct' | 'group' | 'ai' | 'support';

export interface ParticipantInfo {
  name?: string;
  photoUrl?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  senderPhoto?: string;
  content: string;
  type: MessageType;
  mediaUrl?: string;
  aiGenerated?: boolean;
  workoutData?: AIWorkoutMessage;
  feedbackData?: FeedbackMessageData;
  reactions?: Record<string, string>;
  replyTo?: ReplyInfo;
  action?: {
    label: string;
    route: string;
  };
  createdAt: Date;
  readBy: string[];
}

export interface ReplyInfo {
  id: string;
  senderId: string;
  senderName?: string;
  content: string;
}

export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'workout' | 'feedback';

export interface AIWorkoutMessage {
  nomeDaRotina: string;
  objetivoDaRotina: string;
  treino: string[];
}

export interface FeedbackMessageData {
  title: string;
  rating?: number;
  comment?: string;
  progresso?: string;
  dificuldade?: string;
  melhoria?: string;
  resposta?: string;
}

export interface ChatState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  isSending: boolean;
}

export interface AIAssistantConfig {
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
}
