import { create } from 'zustand';
import { DiscussionSession, Participant } from '../types';

interface AppState {
  user: Participant | null;
  sessions: DiscussionSession[];
  currentSession: DiscussionSession | null;
  login: (name: string) => void;
  logout: () => void;
  addSession: (session: DiscussionSession) => void;
  updateSession: (id: string, updates: Partial<DiscussionSession>) => void;
  setCurrentSession: (session: DiscussionSession | null) => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  sessions: [],
  currentSession: null,
  login: (name) => set({ user: { id: 'user-1', name, isAI: false } }),
  logout: () => set({ user: null, currentSession: null }),
  addSession: (session) => set((state) => ({ sessions: [...state.sessions, session] })),
  updateSession: (id, updates) => set((state) => ({
    sessions: state.sessions.map((s) => s.id === id ? { ...s, ...updates } : s),
    currentSession: state.currentSession?.id === id ? { ...state.currentSession, ...updates } : state.currentSession
  })),
  setCurrentSession: (session) => set({ currentSession: session }),
}));
