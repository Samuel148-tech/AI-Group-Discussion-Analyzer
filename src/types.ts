export interface User {
  id: number;
  username: string;
}

export interface Session {
  id: string;
  topic: string;
  created_by: number;
  status: string;
  created_at: string;
  title?: string;
  description?: string;
  date?: string;
  time?: string;
  duration?: number;
  realUsersCount?: number;
  aiParticipantsCount?: number;
  real_users_count?: number;
  ai_participants_count?: number;
  language?: string;
  difficulty?: string;
}

export interface Transcript {
  id: number;
  session_id: string;
  user_id: number;
  username: string;
  text: string;
  sentiment: string;
  timestamp: string;
}

export interface AnalysisResult {
  relevanceScore: number;
  coherenceScore: number;
  vocabularyRichness: number;
  fillerWordCount: number;
  fluencyScore: number;
  sentiment: "Positive" | "Neutral" | "Negative";
  confidence: number;
  assertiveness: number;
  politeness: number;
  summary: string;
  suggestions: string[];
  sentimentTrend: { time: string, score: number }[];
  actualDuration?: number;
  userSpeakingTime?: number;
}

// Keep the new types if they are used elsewhere
export interface Participant {
  id: string;
  name: string;
  isAI: boolean;
}

export interface TranscriptSegment {
  id: string;
  participantId: string;
  text: string;
  timestamp: number;
  sentiment?: 'Positive' | 'Neutral' | 'Negative';
}

export interface SessionConfig {
  topic: string;
  language: string;
  includeAI: boolean;
}

export interface SessionMetrics {
  topicRelevance: number;
  coherence: number;
  fillerWords: number;
  vocabularyRichness: number;
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  participantMetrics: Record<string, {
    speakingDuration: number;
    wordCount: number;
    confidence: number;
    assertiveness: number;
    politeness: number;
  }>;
}

export interface DiscussionSession {
  id: string;
  date: number;
  config: SessionConfig;
  participants: Participant[];
  transcripts: TranscriptSegment[];
  metrics?: SessionMetrics;
}
