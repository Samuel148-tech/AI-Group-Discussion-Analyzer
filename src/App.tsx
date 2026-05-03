import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  Mic, 
  MicOff, 
  MessageSquare, 
  BarChart3, 
  LogOut, 
  Plus, 
  Play, 
  FileText, 
  BrainCircuit,
  TrendingUp,
  Award,
  ChevronRight,
  ShieldCheck,
  Zap,
  Trash2,
  Target,
  Video,
  Link,
  Copy,
  Check,
  Volume2,
  VolumeX
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { cn, formatTime, formatDuration } from './utils';
import { User, Session, Transcript, AnalysisResult } from './types';
import { analyzeTranscript, getAIParticipantResponse, generateAudio } from './services/geminiService';

// --- Components ---

const Card = ({ children, className, title, icon: Icon }: { children: React.ReactNode, className?: string, title?: string, icon?: any }) => (
  <div className={cn("glass-card p-6", className)}>
    {title && (
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white/90">{title}</h3>
        </div>
        {Icon && <Icon className="w-5 h-5 text-brand-accent" />}
      </div>
    )}
    {children}
  </div>
);

const AVAILABLE_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

const Button = ({ children, onClick, variant = 'primary', className, disabled, icon: Icon, type = 'button' }: any) => {
  const variants = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    danger: "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30",
    ghost: "bg-transparent text-white/60 hover:bg-white/5"
  };
  return (
    <button 
      type={type}
      onClick={onClick} 
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant as keyof typeof variants],
        className
      )}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
};

const Input = ({ label, className, ...props }: any) => (
  <div className="space-y-1.5 w-full">
    {label && <label className="text-sm font-medium text-white/60">{label}</label>}
    <input 
      {...props} 
      className={cn("input-field w-full", className)}
    />
  </div>
);

const Select = ({ label, options, className, ...props }: any) => (
  <div className="space-y-1.5 w-full">
    {label && <label className="text-sm font-medium text-white/60">{label}</label>}
    <select 
      {...props} 
      className={cn("input-field w-full appearance-none bg-brand-card", className)}
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [view, setView] = useState<'landing' | 'auth' | 'dashboard' | 'create-session' | 'room' | 'report'>('landing');
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [invitedSessionId, setInvitedSessionId] = useState<string | null>(null);

  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session');
      if (sessionId) {
        setInvitedSessionId(sessionId);
      }
    };

    handleUrlChange(); // Check on mount
    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  useEffect(() => {
    if (token) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) setUser(JSON.parse(savedUser));
      
      if (invitedSessionId) {
        // Fetch session and join
        fetch(`/api/sessions/${invitedSessionId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(async res => {
          if (res.status === 401) {
            logout();
            return null;
          }
          return res.json();
        })
        .then(session => {
          if (session && !session.error) {
            setCurrentSession(session);
            setView('room');
            // Clear the URL parameter without refreshing
            const url = new URL(window.location.href);
            url.searchParams.delete('session');
            window.history.replaceState({}, '', url);
            setInvitedSessionId(null);
          } else if (session) {
            setView('dashboard');
          }
        })
        .catch(() => setView('dashboard'));
      } else if (view === 'landing' || view === 'auth') {
        setView('dashboard');
      }
    }
  }, [token, invitedSessionId]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const username = (form.elements.namedItem('username') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;

    const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setView('dashboard');
    } else {
      alert(data.error);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setView('auth');
  };

  if (view === 'landing') {
    return <LandingPage onStart={() => setView(token ? 'dashboard' : 'auth')} invited={!!invitedSessionId} />;
  }

  if (view === 'auth') {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-accent text-white mb-4 shadow-lg shadow-blue-500/20">
              <MessageSquare className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">TalkWise</h1>
            <p className="text-white/60 mt-2">Master your communication skills</p>
            {invitedSessionId && (
              <div className="mt-4 px-4 py-2 bg-brand-accent/20 border border-brand-accent/30 rounded-lg text-brand-accent text-sm font-medium animate-pulse">
                You've been invited to join a session! Please sign in to continue.
              </div>
            )}
          </div>

          <Card className="p-8">
            <form onSubmit={handleAuth} className="space-y-6">
              <Input label="Username" name="username" placeholder="Enter your username" required />
              <Input label="Password" name="password" type="password" placeholder="••••••••" required />
              <Button className="w-full py-3 text-lg" type="submit">
                {isRegistering ? 'Create Account' : 'Sign In'}
              </Button>
            </form>
            <div className="mt-6 text-center">
              <button 
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-sm font-medium text-brand-accent hover:text-blue-400"
              >
                {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register"}
              </button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {/* Header */}
      <header className="bg-brand-bg/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
          <MessageSquare className="w-8 h-8 text-brand-accent" />
          <h2 className="font-bold text-xl text-white tracking-tight">TalkWise</h2>
        </div>
        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-6">
            <button onClick={() => setView('dashboard')} className={cn("text-sm font-medium transition-colors", view === 'dashboard' ? "text-brand-accent" : "text-white/60 hover:text-white")}>Dashboard</button>
            <button className="text-sm font-medium text-white/60 hover:text-white">Analytics</button>
          </nav>
          <div className="flex items-center gap-3 pl-6 border-l border-white/10">
            <div className="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent">
              <Users className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium text-white hidden sm:block">{user?.username}</span>
            <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={logout}>Logout</Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {view === 'dashboard' && (
          <Dashboard 
            user={user!}
            token={token!} 
            onJoinSession={(session) => {
              setCurrentSession(session);
              setView('room');
            }}
            onCreateNew={() => setView('create-session')}
            onViewReport={(session) => {
              setCurrentSession(session);
              setView('report');
            }}
            logout={logout}
          />
        )}
        {view === 'create-session' && (
          <CreateSession 
            token={token!}
            onCancel={() => setView('dashboard')}
            onCreated={(session) => {
              setCurrentSession(session);
              setView('room');
            }}
            logout={logout}
          />
        )}
        {view === 'room' && currentSession && (
          <DiscussionRoom 
            user={user!} 
            session={currentSession} 
            onLeave={() => setView('dashboard')} 
            onFinish={() => setView('report')}
            logout={logout}
          />
        )}
        {view === 'report' && currentSession && (
          <SessionReport
            session={currentSession}
            onBack={() => setView('dashboard')}
            logout={logout}
          />
        )}
      </main>
    </div>
  );
}

// --- Landing Page ---

function LandingPage({ onStart, invited }: { onStart: () => void, invited?: boolean }) {
  const features = [
    { title: "Smart Group Discussions", desc: "Mix real users with AI participants for dynamic conversations", icon: Users },
    { title: "AI-Powered Insights", desc: "Get detailed analysis and feedback on communication skills", icon: BrainCircuit },
    { title: "Real-Time Audio", desc: "Crystal clear voice communication with live transcription", icon: Mic },
    { title: "Performance Analytics", desc: "Track speaking time, engagement, and improvement areas", icon: BarChart3 },
    { title: "Multi-Language Support", desc: "Communicate in multiple languages with real-time translation", icon: Zap },
    { title: "Easy Scheduling", desc: "Schedule sessions and share links with participants", icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-brand-bg text-white">
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-8 h-8 text-brand-accent" />
          <h2 className="font-bold text-xl tracking-tight">TalkWise</h2>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onStart}>Dashboard</Button>
          <Button onClick={onStart}>Login</Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-medium text-brand-accent">
            <Zap className="w-3 h-3" />
            Next-Gen Discussion Platform
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight max-w-4xl mx-auto leading-tight">
            AI-Powered Group <span className="text-brand-accent">Discussions</span>
          </h1>
          {invited && (
            <div className="max-w-md mx-auto p-4 bg-brand-accent/10 border border-brand-accent/20 rounded-xl text-brand-accent font-medium mb-8">
              👋 You have a pending invitation to join a discussion!
            </div>
          )}
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            Practice and improve your communication skills with AI-powered participants. 
            Get real-time feedback, analytics, and insights to become a better communicator.
          </p>
          <div className="flex items-center justify-center gap-4 pt-4">
            <Button className="px-8 py-3 text-lg" onClick={onStart}>Go to Dashboard</Button>
            <Button variant="secondary" className="px-8 py-3 text-lg" onClick={() => alert("Demo video coming soon!")}>Watch Demo</Button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-32">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="glass-card p-8 text-left hover:border-brand-accent/50 transition-all group"
            >
              <f.icon className="w-8 h-8 text-brand-accent mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-2">{f.title}</h3>
              <p className="text-white/60 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-32 pt-20 border-t border-white/5">
          <h2 className="text-3xl font-bold mb-12">Trusted by Professionals Worldwide</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: "Active Users", value: "10K+" },
              { label: "Sessions Completed", value: "50K+" },
              { label: "Languages Supported", value: "25+" },
              { label: "Improvement Rate", value: "95%" },
            ].map(stat => (
              <div key={stat.label}>
                <p className="text-4xl font-bold text-brand-accent mb-2">{stat.value}</p>
                <p className="text-sm text-white/40 uppercase tracking-widest font-bold">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

// --- Create Session Component ---

function CreateSession({ token, onCancel, onCreated, logout }: { token: string, onCancel: () => void, onCreated: (s: Session) => void, logout: () => void }) {
  const [formData, setFormData] = useState({
    title: '',
    topic: '',
    description: '',
    date: '',
    time: '',
    duration: 60,
    realUsers: 2,
    aiParticipants: 2,
    language: 'English',
    difficulty: 'Intermediate'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          topic: formData.topic,
          title: formData.title,
          description: formData.description,
          date: formData.date,
          time: formData.time,
          duration: formData.duration,
          realUsersCount: formData.realUsers,
          aiParticipantsCount: formData.aiParticipants,
          language: formData.language,
          difficulty: formData.difficulty
        })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        if (res.status === 401) {
          logout();
          return;
        }
        throw new Error(errorData.error || "Failed to create session");
      }
      
      const data = await res.json();
      onCreated(data);
    } catch (err: any) {
      console.error("Create session error:", err);
      alert(err.message || "An error occurred while creating the session");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={onCancel} className="text-white/60 hover:text-white flex items-center gap-2 text-sm">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to Dashboard
        </button>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-white">Create New Session</h1>
        <p className="text-white/60">Set up your AI-powered group discussion</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Card title="Session Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input 
              label="Session Title" 
              placeholder="e.g., Leadership Discussion" 
              value={formData.title}
              onChange={(e: any) => setFormData({...formData, title: e.target.value})}
            />
            <Input 
              label="Topic" 
              placeholder="e.g., Artificial Intelligence" 
              value={formData.topic}
              onChange={(e: any) => setFormData({...formData, topic: e.target.value})}
            />
            <div className="md:col-span-2">
              <Input 
                label="Description (Optional)" 
                placeholder="Describe what you'd like to discuss..." 
                value={formData.description}
                onChange={(e: any) => setFormData({...formData, description: e.target.value})}
              />
            </div>
            <Input 
              label="Date" 
              type="date" 
              value={formData.date}
              onChange={(e: any) => setFormData({...formData, date: e.target.value})}
            />
            <Input 
              label="Time" 
              type="time" 
              value={formData.time}
              onChange={(e: any) => setFormData({...formData, time: e.target.value})}
            />
            <Select 
              label="Duration (minutes)" 
              options={[
                { value: 15, label: '15 minutes' },
                { value: 30, label: '30 minutes' },
                { value: 60, label: '60 minutes' },
                { value: 90, label: '90 minutes' },
              ]}
              value={formData.duration}
              onChange={(e: any) => setFormData({...formData, duration: parseInt(e.target.value)})}
            />
          </div>
        </Card>

        <Card title="Participants Configuration">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-brand-accent" />
                  <span className="font-medium">Real Users</span>
                </div>
                <span className="text-brand-accent font-bold">{formData.realUsers}</span>
              </div>
              <div className="flex items-center gap-4 bg-white/5 p-4 rounded-xl">
                <button type="button" onClick={() => setFormData({...formData, realUsers: Math.max(1, formData.realUsers - 1)})} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20">-</button>
                <div className="flex-1 text-center text-sm text-white/60">{formData.realUsers} participants</div>
                <button type="button" onClick={() => setFormData({...formData, realUsers: formData.realUsers + 1})} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20">+</button>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-brand-accent" />
                  <span className="font-medium">AI Participants</span>
                </div>
                <span className="text-brand-accent font-bold">{formData.aiParticipants}</span>
              </div>
              <div className="flex items-center gap-4 bg-white/5 p-4 rounded-xl">
                <button type="button" onClick={() => setFormData({...formData, aiParticipants: Math.max(0, formData.aiParticipants - 1)})} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20">-</button>
                <div className="flex-1 text-center text-sm text-white/60">{formData.aiParticipants} AI bots</div>
                <button type="button" onClick={() => setFormData({...formData, aiParticipants: formData.aiParticipants + 1})} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20">+</button>
              </div>
            </div>
            <Select 
              label="Language" 
              options={[
                { value: 'English', label: 'English' },
                { value: 'Spanish', label: 'Spanish' },
                { value: 'French', label: 'French' },
                { value: 'German', label: 'German' },
              ]}
              value={formData.language}
              onChange={(e: any) => setFormData({...formData, language: e.target.value})}
            />
            <Select 
              label="Difficulty Level" 
              options={[
                { value: 'Beginner', label: 'Beginner' },
                { value: 'Intermediate', label: 'Intermediate' },
                { value: 'Advanced', label: 'Advanced' },
              ]}
              value={formData.difficulty}
              onChange={(e: any) => setFormData({...formData, difficulty: e.target.value})}
            />
          </div>
        </Card>

        <Button type="submit" className="w-full py-4 text-lg">Create Session</Button>

        <Card title="Session Summary">
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2 text-white/60">
              <TrendingUp className="w-4 h-4" />
              {formData.date ? `${formData.date} at ${formData.time || 'not set'}` : 'Date not set'}
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <Zap className="w-4 h-4" />
              {formData.duration} minutes
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <Users className="w-4 h-4" />
              {formData.realUsers + formData.aiParticipants} total participants
            </div>
            <div className="pt-4 border-t border-white/5 flex justify-between">
              <span className="text-white/40">Real Users:</span>
              <span className="font-bold">{formData.realUsers}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">AI Participants:</span>
              <span className="font-bold">{formData.aiParticipants}</span>
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
}
function Dashboard({ user, token, onJoinSession, onCreateNew, onViewReport, logout }: { user: User, token: string, onJoinSession: (s: Session) => void, onCreateNew: () => void, onViewReport: (s: Session) => void, logout: () => void }) {
  const [sessions, setSessions] = useState<(Session & { analysis?: AnalysisResult })[]>([]);
  const [activeTab, setActiveTab] = useState('sessions');

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const errorData = await res.json();
        if (res.status === 401) {
          logout();
          return;
        }
        throw new Error(errorData.error || "Failed to fetch sessions");
      }
      const data = await res.json();
      if (Array.isArray(data)) setSessions(data);
    } catch (err: any) {
      console.error("Fetch sessions error:", err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to deactivate this session?")) return;
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) {
          logout();
          return;
        }
        throw new Error("Failed to delete session");
      }
      fetchSessions();
    } catch (err) {
      console.error("Delete session error:", err);
    }
  };

  // Calculate dynamic stats
  const completedSessions = sessions.filter(s => s.status === 'completed');
  const totalSessions = sessions.length;
  
  const scores = completedSessions
    .map(s => s.analysis)
    .filter(Boolean)
    .map(a => Math.round((a!.relevanceScore + a!.coherenceScore + a!.fluencyScore + a!.confidence) / 4));
  
  const avgRating = scores.length > 0 
    ? (scores.reduce((a, b) => a + b, 0) / scores.length / 20).toFixed(1) // Convert 0-100 to 0-5
    : "0.0";

  const latestScore = scores.length > 0 ? scores[0] : 0;
  const previousScores = scores.slice(1);
  const avgPrevious = previousScores.length > 0 
    ? previousScores.reduce((a, b) => a + b, 0) / previousScores.length 
    : latestScore;
  
  const improvementValue = scores.length >= 2
    ? Math.round(latestScore - avgPrevious)
    : 0;

  const stats = [
    { label: "Total Sessions", value: totalSessions.toString(), icon: TrendingUp },
    { label: "Completed", value: completedSessions.length.toString(), icon: Award },
    { label: "Avg Rating", value: `${avgRating}/5`, icon: BarChart3 },
    { label: "Improvement", value: `${improvementValue > 0 ? '+' : ''}${improvementValue}%`, icon: Zap },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Welcome back, {user?.username}!</h1>
        <p className="text-white/60">Ready to improve your communication skills today?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(s => (
          <Card key={s.label} title={s.label} icon={s.icon}>
            <p className="text-3xl font-bold text-white">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-4 border-b border-white/5 pb-4">
        <button 
          onClick={() => setActiveTab('sessions')}
          className={cn("px-4 py-2 text-sm font-medium transition-colors rounded-lg", activeTab === 'sessions' ? "bg-brand-accent text-white" : "text-white/60 hover:text-white")}
        >
          My Sessions
        </button>
        <button 
          onClick={() => setActiveTab('analytics')}
          className={cn("px-4 py-2 text-sm font-medium transition-colors rounded-lg", activeTab === 'analytics' ? "bg-brand-accent text-white" : "text-white/60 hover:text-white")}
        >
          Analytics
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Discussion Sessions</h2>
        <Button onClick={onCreateNew} icon={Plus}>New Session</Button>
      </div>

      <div className="space-y-4">
        {activeTab === 'analytics' ? (
          <Card title="Overall Analytics" icon={BarChart3}>
            <div className="py-20 text-center text-white/40">
              <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Analytics data will appear here after more sessions.</p>
            </div>
          </Card>
        ) : sessions.length > 0 ? (
          sessions.map(s => (
            <Card key={s.id} className="hover:border-white/20 transition-all">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold text-white">{s.title || s.topic}</h3>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                      s.status === 'completed' ? "bg-emerald-500/20 text-emerald-400" : "bg-brand-accent/20 text-brand-accent"
                    )}>
                      {s.status}
                    </span>
                  </div>
                  <p className="text-sm text-white/60">{s.description || `Discussion about ${s.topic}`}</p>
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {s.date || '15/01/2024'}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <Zap className="w-3.5 h-3.5" />
                      {s.time || '14:00'}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <Users className="w-3.5 h-3.5" />
                      {(s.realUsersCount || s.real_users_count) || 0} users
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <BrainCircuit className="w-3.5 h-3.5" />
                      {(s.aiParticipantsCount || s.ai_participants_count) || 0} AI
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.status === 'completed' ? (
                    <Button variant="secondary" onClick={() => onViewReport(s)}>View Report</Button>
                  ) : (
                    <Button onClick={() => onJoinSession(s)}>Join</Button>
                  )}
                  <Button 
                    variant="ghost" 
                    className="p-2 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors" 
                    title="Delete Session"
                    onClick={(e) => {
                      e.preventDefault();
                      deleteSession(e, s.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-white/20">
            <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg">No sessions found. Create your first one!</p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Discussion Room Component ---

// --- Session Report Component ---

function SessionReport({ session, onBack, logout }: { session: Session, onBack: () => void, logout: () => void }) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState('performance');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await fetch(`/api/sessions/${session.id}/report`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!res.ok) {
          if (res.status === 401) {
            logout();
            return;
          }
          throw new Error("Failed to fetch report");
        }
        const data = await res.json();
        if (data) setAnalysis(data);
      } catch (err) {
        console.error("Fetch report error:", err);
      }
    };
    fetchReport();
  }, [session.id, logout]);

  if (!analysis) return <div className="py-20 text-center text-white/40">Loading report...</div>;

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const stats = [
    { 
      label: "Speaking Time", 
      value: formatTime(analysis.userSpeakingTime || 0), 
      sub: `of ${formatTime(analysis.actualDuration || 0)} total`, 
      icon: TrendingUp, 
      percent: analysis.actualDuration ? Math.min(100, Math.round(((analysis.userSpeakingTime || 0) / analysis.actualDuration) * 100)) : 0 
    },
    { label: "Confidence", value: `${analysis.confidence}%`, sub: "Self-assurance level", icon: Mic, percent: analysis.confidence },
    { label: "Interaction", value: `${analysis.relevanceScore}%`, sub: "Engagement with others", icon: Users, percent: analysis.relevanceScore },
    { label: "Clarity", value: `${analysis.fluencyScore}%`, sub: "Communication clarity", icon: BrainCircuit, percent: analysis.fluencyScore },
  ];

  const overallScore = Math.round((analysis.relevanceScore + analysis.coherenceScore + analysis.fluencyScore + analysis.confidence) / 4);
  const scoreLabel = overallScore > 80 ? "Excellent" : overallScore > 60 ? "Good" : "Needs Improvement";
  const scoreColor = overallScore > 80 ? "text-emerald-400" : overallScore > 60 ? "text-amber-400" : "text-red-400";
  const scoreBg = overallScore > 80 ? "bg-emerald-500/20" : overallScore > 60 ? "bg-amber-500/20" : "bg-red-500/20";
  const scoreBorder = overallScore > 80 ? "border-emerald-500/30" : overallScore > 60 ? "border-amber-500/30" : "border-red-500/30";

  const exportPDF = () => {
    if (!analysis) return;
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text("Discussion Performance Report", 20, 20);
    
    doc.setFontSize(12);
    doc.text(`Topic: ${session.topic}`, 20, 30);
    doc.text(`Session ID: ${session.id}`, 20, 37);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 44);
    
    doc.setFontSize(16);
    doc.text("NLP Metrics", 20, 60);
    
    const metricsData = [
      ["Relevance Score", `${analysis.relevanceScore}%`],
      ["Coherence Score", `${analysis.coherenceScore}%`],
      ["Vocabulary Richness", `${analysis.vocabularyRichness}%`],
      ["Fluency Score", `${analysis.fluencyScore}%`],
      ["Filler Word Count", analysis.fillerWordCount.toString()],
      ["Confidence", `${analysis.confidence}%`],
      ["Assertiveness", `${analysis.assertiveness}%`],
      ["Politeness", `${analysis.politeness}%`],
      ["Overall Sentiment", analysis.sentiment]
    ];
    
    (doc as any).autoTable({
      startY: 65,
      head: [["Metric", "Value"]],
      body: metricsData,
    });
    
    const finalY = (doc as any).lastAutoTable.finalY || 150;
    
    doc.setFontSize(16);
    doc.text(`Executive Summary for ${session.title || session.topic}`, 20, finalY + 15);
    doc.setFontSize(10);
    const splitSummary = doc.splitTextToSize(analysis.summary, 170);
    doc.text(splitSummary, 20, finalY + 25);
    
    doc.setFontSize(16);
    doc.text("Recommendations", 20, finalY + 50);
    doc.setFontSize(10);
    analysis.suggestions.forEach((s, i) => {
      doc.text(`• ${s}`, 20, finalY + 60 + (i * 7));
    });
    
    doc.save(`Report_${session.id}.pdf`);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-white/60 hover:text-white flex items-center gap-2 text-sm">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to Dashboard
        </button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={TrendingUp} onClick={() => alert("Report shared!")}>Share</Button>
          <Button variant="secondary" icon={FileText} onClick={exportPDF}>Export PDF</Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white">{session.title || session.topic}</h1>
          <p className="text-white/60">Session completed on {new Date(session.created_at).toLocaleDateString()}</p>
        </div>
        <div className="text-right">
          <p className="text-6xl font-bold text-brand-accent">{overallScore}</p>
          <p className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Overall Score</p>
          <span className={cn("text-[10px] px-2 py-0.5 rounded border", scoreBg, scoreColor, scoreBorder)}>{scoreLabel}</span>
        </div>
      </div>

      <Card className="bg-brand-accent/5 border-brand-accent/20">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-brand-accent/20 text-brand-accent">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-2">Executive Summary for {session.title || session.topic}</h3>
            <p className="text-sm text-white/70 leading-relaxed italic">
              {analysis.summary}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(s => (
          <Card key={s.label} className="relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <s.icon className="w-5 h-5 text-brand-accent" />
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{s.percent}%</span>
            </div>
            <p className="text-xs text-white/60 mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-white">{s.value}</p>
            <p className="text-[10px] text-white/40 mt-1">{s.sub}</p>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-4 border-b border-white/5 pb-4">
        {['Performance Analysis', 'Key Insights', 'Recommendations'].map(tab => {
          const tabKey = tab.toLowerCase().split(' ')[0];
          return (
            <button 
              key={tab}
              onClick={() => setActiveTab(tabKey)}
              className={cn("px-4 py-2 text-sm font-medium transition-colors rounded-lg", activeTab === tabKey ? "bg-brand-accent text-white" : "text-white/60 hover:text-white")}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {activeTab === 'performance' && (
            <>
              <Card title="Communication Metrics" icon={BarChart3}>
                <div className="space-y-6">
                  {[
                    { label: 'Relevance Score', value: analysis.relevanceScore },
                    { label: 'Coherence Score', value: analysis.coherenceScore },
                    { label: 'Vocabulary Richness', value: analysis.vocabularyRichness },
                    { label: 'Fluency Score', value: analysis.fluencyScore },
                  ].map(m => (
                    <div key={m.label} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">{m.label}</span>
                        <span className="text-white font-bold">{m.value}/100</span>
                      </div>
                      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-accent" style={{ width: `${m.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Sentiment Trend" icon={TrendingUp}>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analysis.sentimentTrend || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis 
                        dataKey="time" 
                        stroke="rgba(255,255,255,0.4)" 
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="rgba(255,255,255,0.4)" 
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        domain={[0, 100]}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1b23', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                        itemStyle={{ color: '#3b82f6' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="score" 
                        stroke="#3b82f6" 
                        strokeWidth={3}
                        dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}

          {activeTab === 'key' && (
            <>
              <Card title={`Executive Summary for ${session.title || session.topic}`} icon={BrainCircuit}>
                <p className="text-sm text-white/60 leading-relaxed italic">
                  "{analysis.summary}"
                </p>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card title="Relevance" icon={Target}>
                  <p className="text-2xl font-bold text-white">{analysis.relevanceScore}%</p>
                </Card>
                <Card title="Coherence" icon={BrainCircuit}>
                  <p className="text-2xl font-bold text-white">{analysis.coherenceScore}%</p>
                </Card>
                <Card title="Fluency" icon={Mic}>
                  <p className="text-2xl font-bold text-white">{analysis.fluencyScore}%</p>
                </Card>
                <Card title="Confidence" icon={Award}>
                  <p className="text-2xl font-bold text-white">{analysis.confidence}%</p>
                </Card>
                <Card title="Assertiveness" icon={Zap}>
                  <p className="text-2xl font-bold text-white">{analysis.assertiveness}%</p>
                </Card>
                <Card title="Politeness" icon={Users}>
                  <p className="text-2xl font-bold text-white">{analysis.politeness}%</p>
                </Card>
              </div>
            </>
          )}

          {activeTab === 'recommendations' && (
            <Card title="Recommendations" icon={Award}>
              <ul className="space-y-4">
                {analysis.suggestions?.map((s, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-white/60">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-8">
          <Card title="Ready for your next session?" className="bg-brand-accent/10 border-brand-accent/20">
            <p className="text-sm text-white/60 mb-6 leading-relaxed">
              Continue improving your communication skills with more AI-powered discussions.
            </p>
            <Button className="w-full" onClick={() => onBack()}>Schedule New Session</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
function DiscussionRoom({ user, session, onLeave, onFinish, logout }: { user: User, session: Session, onLeave: () => void, onFinish: () => void, logout: () => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [participants, setParticipants] = useState<{name: string, isAI: boolean, voice?: string}[]>(() => {
    const base: {name: string, isAI: boolean, voice?: string}[] = [{ name: user.username, isAI: false }];
    const aiCount = session.ai_participants_count || session.aiParticipantsCount || 0;
    
    if (aiCount > 0) {
      for (let i = 0; i < aiCount; i++) {
        base.push({ 
          name: `AI Participant ${i + 1}`, 
          isAI: true,
          voice: AVAILABLE_VOICES[i % AVAILABLE_VOICES.length]
        });
      }
    }
    return base;
  });
  const [isStarted, setIsStarted] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(() => {
    const aiCount = session.ai_participants_count || session.aiParticipantsCount || 0;
    return aiCount > 0;
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [audioStatus, setAudioStatus] = useState<'active' | 'suspended' | 'blocked' | 'unknown'>('unknown');
  const [needsGesture, setNeedsGesture] = useState(false);

  useEffect(() => {
    const initAudio = async () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        audioContextRef.current = ctx;
        setAudioStatus(ctx.state as any);
        if (ctx.state === 'suspended') {
          setNeedsGesture(true);
        }
      } catch (e) {
        console.error("Failed to init audio context:", e);
        setAudioStatus('blocked');
        setNeedsGesture(true);
      }
    };
    initAudio();
  }, []);

  const [localInterim, setLocalInterim] = useState('');

  const inviteLink = `${window.location.origin}?session=${session.id}`;

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  
  const socketRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptsRef = useRef<Transcript[]>([]);
  const isRecordingRef = useRef(isRecording);
  const startAttemptRef = useRef<number>(0);
  const userVoicesRef = useRef<Record<string, string>>({ [user.username]: AVAILABLE_VOICES[0] });
  const lastSentTranscriptRef = useRef<string>('');
  const lastSentTimeRef = useRef<number>(0);
  const lastResultIndexRef = useRef<number>(-1);
  const recentTranscriptsRef = useRef<string[]>([]);
  const lastPlayedAudioRef = useRef<string>('');
  const isAISpeakingRef = useRef<boolean>(false);
  const audioQueueRef = useRef<{base64: string, text?: string}[]>([]);
  const isPlayingQueueRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(0 as any); // Initialize with 0 to detect first run

  const processAudioQueue = async () => {
    if (isPlayingQueueRef.current || audioQueueRef.current.length === 0) return;
    
    isPlayingQueueRef.current = true;
    const { base64, text } = audioQueueRef.current.shift()!;
    
    try {
      if (!audioContextRef.current || (audioContextRef.current as any) === 0) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const pcmLength = Math.floor(bytes.byteLength / 2);
      const int16Array = new Int16Array(bytes.buffer, 0, pcmLength);
      const float32Array = new Float32Array(int16Array.length);
      
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start();
      });
      
      // Small buffer between clips
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error("Error in audio queue:", err);
    } finally {
      isPlayingQueueRef.current = false;
      processAudioQueue();
    }
  };

  const playAudio = (base64Data: string, text?: string) => {
    if (!base64Data) return;
    if (text && text === lastPlayedAudioRef.current) return;
    if (text) lastPlayedAudioRef.current = text;
    
    audioQueueRef.current.push({ base64: base64Data, text });
    processAudioQueue();
  };

  const testAudio = async () => {
    const testText = "Audio connection successful. You can now hear the discussion.";
    const voice = AVAILABLE_VOICES[0];
    const audioBase64 = await generateAudio(testText, voice);
    if (audioBase64) {
      playAudio(audioBase64);
    }
  };

  const safeStartRecognition = async () => {
    if (!recognitionRef.current) return;
    
    try {
      // Reset index on restart to avoid skipping results
      lastResultIndexRef.current = -1;
      
      // Some browsers require a fresh user gesture or an active audio context
      // Priming with getUserMedia often helps bypass "not-allowed" if permission was already granted
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Close the stream immediately
      
      recognitionRef.current.start();
      setNeedsGesture(false);
      startAttemptRef.current = 0;
    } catch (err: any) {
      // If it's already started, we're good - don't log as error
      if (err.name === 'InvalidStateError' || err.message?.includes('already started')) {
        setNeedsGesture(false);
        return;
      }

      console.error("Safe start failed:", err);
      if (err.name === 'NotAllowedError' || err.message?.includes('not-allowed')) {
        setNeedsGesture(true);
      }
    }
  };

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    
    // Only the host manages the silence timer to avoid duplicate AI responses
    const isHost = session.created_by === user.id;
    const aiParticipants = participants.filter(p => p.isAI);
    
    if (isHost && isStarted && aiEnabled && aiParticipants.length > 0) {
      silenceTimerRef.current = setTimeout(async () => {
        const lastTranscripts = transcriptsRef.current.slice(-3).map(t => `${t.username}: ${t.text}`).join('\n');
        const context = lastTranscripts || "The discussion has just started or there is a long silence.";
        
        const botsToSpeak = aiParticipants.length > 2 ? 2 : aiParticipants.length;
        const selectedBots = [...aiParticipants].sort(() => 0.5 - Math.random()).slice(0, botsToSpeak);

        // Parallelize generation for speed
        const results = await Promise.all(selectedBots.map(async bot => {
          const aiResponse = await getAIParticipantResponse(context, session.topic, bot.name);
          const aiAudio = await generateAudio(aiResponse, bot.voice || AVAILABLE_VOICES[0]);
          return { bot, aiResponse, aiAudio };
        }));

        for (const res of results) {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
              type: 'transcript',
              user: { id: 0, username: res.bot.name },
              text: res.aiResponse,
              sentiment: 'Neutral',
              audio: res.aiAudio
            }));
          }
          await new Promise(r => setTimeout(r, 500));
        }
      }, 8000); 
    }
  };

  useEffect(() => {
    transcriptsRef.current = transcripts;
  }, [transcripts]);

  useEffect(() => {
    if (isStarted) {
      resetSilenceTimer();
    }
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [isStarted, aiEnabled]);

  useEffect(() => {
    const handleGesture = async () => {
      // Initialize or resume AudioContext on user gesture
      if (!audioContextRef.current || (audioContextRef.current as any) === 0) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      setAudioStatus(audioContextRef.current.state as any);
      setNeedsGesture(false);

      if (isRecordingRef.current && recognitionRef.current) {
        // Reset index on restart to avoid skipping results
        lastResultIndexRef.current = -1;
        safeStartRecognition();
      }
    };
    
    if (needsGesture) {
      window.addEventListener('click', handleGesture, { once: true });
      window.addEventListener('touchstart', handleGesture, { once: true });
      return () => {
        window.removeEventListener('click', handleGesture);
        window.removeEventListener('touchstart', handleGesture);
      };
    }
  }, [needsGesture]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', sessionId: session.id, user }));
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'transcript') {
        setTranscripts(prev => {
          // Deduplicate by ID from server
          if (data.id && prev.some(t => t.id === data.id)) return prev;
          
          // Enhanced client-side deduplication
          // If we already have this exact text from the same user recently, skip it
          const isRecentDuplicate = prev.slice(-5).some(t => 
            t.username === data.username && 
            (t.text === data.text || t.text.includes(data.text)) && // Only skip if the NEW one is a substring of an OLD one
            Math.abs(new Date(t.timestamp || 0).getTime() - new Date(data.timestamp || 0).getTime()) < 4000
          );
          
          if (isRecentDuplicate) return prev;

          // If the NEW one is longer and contains an OLD one, we might want to replace it
          // but for simplicity in a live chat, we usually just append. 
          // The issue was text.includes(prev) which blocked the longer one.
          
          return [...prev, data];
        });
        setActiveSpeaker(data.username);
        setTimeout(() => setActiveSpeaker(null), 3000);
        resetSilenceTimer();

        // If audio is provided in the message, play it immediately
        // Don't play own voice to avoid echo
        if (data.audio && data.username !== user.username) {
          playAudio(data.audio, data.text);
        }
        
        // Assign a voice if not already assigned
        const voiceKey = data.user?.id && data.user.id > 0 ? data.user.id : data.username;
        
        if (!userVoicesRef.current[voiceKey as any]) {
          const assignedVoices = Object.values(userVoicesRef.current);
          const nextVoice = AVAILABLE_VOICES.find(v => !assignedVoices.includes(v)) || AVAILABLE_VOICES[0];
          userVoicesRef.current[voiceKey as any] = nextVoice;
        }

        // Generate and play AI audio for the transcript if not already provided
        // Don't play own voice as it sounds like an echo/double
        if (!data.audio && data.username !== user.username) {
          const voice = userVoicesRef.current[voiceKey as any];
          const audioBase64 = await generateAudio(data.text, voice);
          if (audioBase64) {
            playAudio(audioBase64, data.text);
          }
        }

        // Only the host should generate AI facilitator responses to avoid duplicates
        // Trigger AI response when a human speaks
        const isHost = user.id === session.created_by;
        const isHuman = data.user?.id && data.user.id > 0;
        const aiParticipants = participants.filter(p => p.isAI);
        
        if (aiEnabled && isHost && isHuman && aiParticipants.length > 0 && !isAISpeakingRef.current) {
          isAISpeakingRef.current = true;
          
          (async () => {
            try {
              const botsToSpeak = aiParticipants.length > 1 ? 2 : 1;
              const selectedBots = [...aiParticipants].sort(() => 0.5 - Math.random()).slice(0, botsToSpeak);

              // Parallelize response generation for "immediate" feel
              const results = await Promise.all(selectedBots.map(async bot => {
                const aiResponse = await getAIParticipantResponse(data.text, session.topic, bot.name);
                const aiAudio = await generateAudio(aiResponse, bot.voice || AVAILABLE_VOICES[0]);
                return { bot, aiResponse, aiAudio };
              }));

              for (const res of results) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'transcript',
                    user: { id: 0, username: res.bot.name },
                    text: res.aiResponse,
                    sentiment: 'Neutral',
                    audio: res.aiAudio
                  }));
                }
                // Minor staggering for transcript rhythm
                await new Promise(r => setTimeout(r, 500));
              }
            } finally {
              setTimeout(() => {
                isAISpeakingRef.current = false;
              }, 2000);
            }
          })();
        }
      } else if (data.type === 'participants_list') {
        const list = data.participants.map((p: any) => ({ name: p.username, isAI: false }));
        setParticipants(prev => {
          const ai = prev.filter(p => p.isAI);
          // Filter out duplicates from the incoming list and also check against existing AI participants
          const uniqueNewParticipants = list.filter((p: any, index: number, self: any[]) => 
            index === self.findIndex((t: any) => t.name === p.name)
          );
          return [...ai, ...uniqueNewParticipants];
        });
      } else if (data.type === 'user_joined') {
        setParticipants(prev => {
          if (prev.some(p => p.name === data.user.username)) return prev;
          return [...prev, { name: data.user.username, isAI: false }];
        });
      } else if (data.type === 'user_left') {
        setParticipants(prev => prev.filter(p => p.name !== data.user.username));
      } else if (data.type === 'session_started') {
        setIsStarted(true);
        setIsRecording(true);
        isRecordingRef.current = true;
        safeStartRecognition();
      }
    };

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      // Set language based on session config
      const langMap: Record<string, string> = {
        'English': 'en-US',
        'Spanish': 'es-ES',
        'French': 'fr-FR',
        'German': 'de-DE'
      };
      recognition.lang = langMap[session.language || 'English'] || 'en-US';

      recognition.onresult = async (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            // Only process this index if we haven't sent it as a final result yet
            if (i > lastResultIndexRef.current) {
              finalTranscript += event.results[i][0].transcript;
              lastResultIndexRef.current = i;
            }
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (interimTranscript) {
          setLocalInterim(interimTranscript);
        }

        if (finalTranscript.trim()) {
          setLocalInterim(''); // Clear interim when we get a final result
          const text = finalTranscript.trim();
          if (!text) return;
          const now = Date.now();
          
          // Enhanced duplicate filtering:
          // 1. Check if this text is a substring of any very recent transcript (last 5 seconds)
          const isDuplicate = recentTranscriptsRef.current.some(prev => {
            return prev.includes(text); // Only skip if the NEW one is already contained in an OLD one
          });

          if (isDuplicate && (now - lastSentTimeRef.current < 3000)) {
            console.log("Filtered duplicate transcript:", text);
            return;
          }
          
          // 2. If it's exactly the same as the last one within a short time, skip.
          if (text === lastSentTranscriptRef.current && (now - lastSentTimeRef.current < 3000)) return;
          
          lastSentTranscriptRef.current = text;
          lastSentTimeRef.current = now;
          
          // Update recent transcripts buffer
          recentTranscriptsRef.current = [text, ...recentTranscriptsRef.current.slice(0, 5)];

          // Pre-generate audio for own speech to make it immediate for others
          const myVoice = userVoicesRef.current[user.username] || AVAILABLE_VOICES[0];
          const myAudio = await generateAudio(text, myVoice);

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'transcript', 
              text, 
              sentiment: "Neutral",
              user: user,
              audio: myAudio
            }));
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'aborted' || event.error === 'no-speech') {
          // These are common and often non-fatal, so we don't log them as errors
          return;
        }

        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
          setNeedsGesture(true);
        } else if (event.error === 'network') {
          // Retry on network error
          setTimeout(() => {
            if (isRecordingRef.current) safeStartRecognition();
          }, 2000);
        } else {
          setIsRecording(false);
          isRecordingRef.current = false;
        }
      };

      recognition.onend = () => {
        if (isRecordingRef.current) {
          // Reset index on restart to avoid skipping results
          lastResultIndexRef.current = -1;
          
          // Exponential backoff for restarts to avoid spamming the browser
          const delay = Math.min(1000 * Math.pow(2, startAttemptRef.current), 10000);
          startAttemptRef.current++;
          
          setTimeout(() => {
            if (isRecordingRef.current) {
              try {
                recognition.start();
                startAttemptRef.current = 0;
              } catch (e: any) {
                if (e.name === 'InvalidStateError' || e.message?.includes('already started')) {
                  // Already started, we're good
                  return;
                }
                if (e.name === 'NotAllowedError') {
                  setNeedsGesture(true);
                }
              }
            }
          }, delay);
        }
      };
      recognitionRef.current = recognition;
    } else {
      console.warn("Speech Recognition API not supported in this browser.");
    }

    return () => {
      ws.close();
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [session.id, user, aiEnabled]);

  useEffect(() => {
    let interval: any;
    if (isStarted) {
      interval = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isStarted]);

  const toggleRecording = () => {
    const nextState = !isRecording;
    setIsRecording(nextState);
    isRecordingRef.current = nextState;
    
    if (nextState) {
      safeStartRecognition();
    } else {
      setLocalInterim('');
      try {
        recognitionRef.current?.stop();
      } catch (e) {
        console.error("Failed to stop recognition", e);
      }
    }
  };

  const startDiscussion = () => {
    setIsStarted(true);
    toggleRecording();
    socketRef.current?.send(JSON.stringify({ type: 'start_session' }));
  };

  const finishDiscussion = async () => {
    setIsAnalyzing(true);
    let result: AnalysisResult;
    
    if (transcripts.length === 0) {
      // ... same mock report logic ...
      result = {
        relevanceScore: 85,
        coherenceScore: 90,
        vocabularyRichness: 88,
        fillerWordCount: 5,
        fluencyScore: 92,
        sentiment: "Positive",
        confidence: 85,
        assertiveness: 80,
        politeness: 95,
        summary: "The participant demonstrated good listening skills but did not actively contribute to the discussion. A mock report was generated because no audio was transcribed.",
        suggestions: [
          "Try to speak up more frequently",
          "Share your opinions confidently",
          "Ask questions to engage others"
        ],
        sentimentTrend: [
          { time: "Start", score: 50 },
          { time: "Middle", score: 60 },
          { time: "End", score: 70 }
        ],
        actualDuration: seconds,
        userSpeakingTime: 0
      };
    } else {
      // ONLY analyze user's words as requested
      const userTranscripts = transcripts.filter(t => t.username === user.username);
      const fullText = userTranscripts.map(t => t.text).join('\n');
      
      try {
        const analysis = await analyzeTranscript(fullText, session.topic, session.title);
        
        // Estimate user speaking time
        const estimatedUserSpeakingTime = userTranscripts.reduce((acc, t) => acc + (t.text.split(' ').length * 0.4), 0);
        
        result = {
          ...analysis,
          actualDuration: seconds,
          userSpeakingTime: Math.min(seconds, Math.round(estimatedUserSpeakingTime))
        };
      } catch (err) {
        console.error(err);
        alert("Analysis failed, but you can still view the session.");
        setIsAnalyzing(false);
        onFinish();
        return;
      }
    }

    try {
      // Save report to DB
      const res = await fetch(`/api/sessions/${session.id}/report`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ analysis: result })
      });
      
      if (!res.ok) {
        if (res.status === 401) {
          logout();
          return;
        }
        throw new Error("Failed to save report");
      }
      
      onFinish();
    } catch (err) {
      console.error(err);
      alert("Failed to save report.");
      onFinish();
    }
    setIsAnalyzing(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">{session.title || session.topic}</h1>
          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[10px] font-bold uppercase tracking-wider border border-amber-500/30">
            {isStarted ? 'Live' : 'Waiting to start'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-white/60 text-sm">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
            {audioStatus === 'active' ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-amber-400 animate-pulse" />
            )}
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-wider",
              audioStatus === 'active' ? "text-emerald-400" : "text-amber-400"
            )}>
              {audioStatus === 'active' ? 'Audio On' : 'Audio Blocked'}
            </span>
            {audioStatus !== 'active' && (
              <button 
                onClick={() => setNeedsGesture(true)}
                className="ml-1 p-1 hover:bg-white/10 rounded text-white"
                title="Enable Audio"
              >
                <Play className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            {participants.length} participants
          </div>
          <Button 
            variant="secondary" 
            className="px-3 py-1.5 text-xs flex items-center gap-2"
            onClick={copyInviteLink}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Invite'}
          </Button>
          <Button variant="ghost" className="p-2"><Zap className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {participants.map((p, index) => (
          <Card 
            key={`${p.name}-${p.isAI ? 'ai' : 'human'}-${index}`} 
            className={cn(
              "aspect-video flex flex-col items-center justify-center relative group transition-all duration-300",
              activeSpeaker === p.name ? "ring-4 ring-brand-accent ring-offset-4 ring-offset-brand-bg scale-[1.02]" : ""
            )}
          >
            <div className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center text-3xl mb-4", 
              p.isAI ? "bg-emerald-500/20" : "bg-brand-accent/20"
            )}>
              {p.isAI ? '🤖' : '👤'}
            </div>
            <div className="absolute bottom-4 left-4 flex items-center gap-2">
              <span className="text-xs font-medium text-white/60">{p.name === user.username ? 'You' : p.name}</span>
              <Mic className={cn("w-3 h-3", activeSpeaker === p.name ? "text-brand-accent animate-pulse" : "text-white/20")} />
            </div>
            {activeSpeaker === p.name && (
              <div className="absolute top-4 left-4">
                <span className="px-2 py-0.5 bg-brand-accent text-white text-[10px] font-bold rounded uppercase">Speaking</span>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="flex justify-center gap-4">
        <Button 
          variant={isRecording ? "primary" : "secondary"} 
          className="rounded-full w-12 h-12 p-0" 
          icon={isRecording ? Mic : MicOff} 
          onClick={toggleRecording} 
        />
        <Button variant="secondary" className="rounded-full w-12 h-12 p-0" icon={Video} />
        {!isStarted ? (
          session.created_by === user.id ? (
            <Button className="px-8 bg-emerald-600 hover:bg-emerald-700" onClick={startDiscussion}>Start Session</Button>
          ) : (
            <div className="px-6 py-3 bg-white/5 rounded-xl text-white/40 text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Waiting for host to start...
            </div>
          )
        ) : (
          <Button className="px-8 bg-red-600 hover:bg-red-700" onClick={finishDiscussion} disabled={isAnalyzing}>
            {isAnalyzing ? "Analyzing..." : "End Discussion"}
          </Button>
        )}
      </div>

      <Card title="Live Transcription" icon={MessageSquare}>
        <div className="h-48 overflow-y-auto space-y-4 text-sm text-white/40 italic">
          {localInterim && (
            <div className="flex gap-2 animate-pulse">
              <span className="font-bold text-brand-accent min-w-[100px]">You (Live):</span>
              <span className="text-white/60 not-italic">{localInterim}</span>
            </div>
          )}
          {transcripts.length > 0 || localInterim ? (
            [...transcripts].reverse().map((t, i) => (
              <div key={i} className="flex gap-2">
                <span className="font-bold text-white/60 min-w-[100px]">{t.username}:</span>
                <span className="text-white/80 not-italic">{t.text}</span>
              </div>
            ))
          ) : (
            <p>Listening for speech...</p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Session Info">
          <div className="space-y-4 text-sm">
            <div className="flex justify-between">
              <span className="text-white/40">Session:</span>
              <span className="text-white font-medium">{session.title || session.topic}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Topic:</span>
              <span className="text-white font-medium">{session.topic}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Duration:</span>
              <span className="text-white font-medium">{formatDuration(seconds)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Participants:</span>
              <span className="text-white font-medium">{participants.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/40">AI Bots:</span>
              <span className="text-white font-medium">{participants.filter(p => p.isAI).length}</span>
            </div>
            <div className="pt-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-[10px] h-8 border-white/10 hover:bg-white/5"
                onClick={testAudio}
                icon={Volume2}
              >
                Test Audio Output
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Quick Actions">
          <div className="space-y-2">
            <button 
              onClick={() => setShowSettings(true)}
              className="w-full p-3 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center gap-2 text-sm transition-all"
            >
              <Mic className="w-4 h-4" /> Audio Settings
            </button>
            <button 
              onClick={() => setShowChat(!showChat)}
              className={cn("w-full p-3 rounded-xl flex items-center justify-center gap-2 text-sm transition-all", showChat ? "bg-brand-accent text-white" : "bg-white/5 hover:bg-white/10")}
            >
              <MessageSquare className="w-4 h-4" /> {showChat ? "Close Chat" : "Open Chat"}
            </button>
            <button 
              onClick={() => alert("Screen sharing started")}
              className="w-full p-3 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center gap-2 text-sm transition-all"
            >
              <TrendingUp className="w-4 h-4" /> Share Screen
            </button>
          </div>
        </Card>
      </div>

      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md bg-brand-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Mic className="w-5 h-5 text-brand-accent" />
                  Audio Settings
                </h3>
                <button onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white">
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/60">Input Device</label>
                  <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-accent">
                    <option>Default - Internal Microphone</option>
                    <option>External USB Mic</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/60">Noise Suppression</label>
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                    <span className="text-sm">Enable AI Noise Reduction</span>
                    <div className="w-10 h-5 bg-brand-accent rounded-full relative cursor-pointer">
                      <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-white/5 flex justify-end">
                <Button onClick={() => setShowSettings(false)}>Save Settings</Button>
              </div>
            </motion.div>
          </div>
        )}

        {showChat && (
          <motion.div 
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="fixed top-24 right-6 w-80 h-[calc(100vh-120px)] bg-brand-card border border-white/10 rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden"
          >
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
              <h3 className="font-bold flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-brand-accent" />
                Session Chat
              </h3>
              <button onClick={() => setShowChat(false)} className="text-white/40 hover:text-white">
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {transcripts.map((t, i) => (
                <div key={i} className={cn("flex flex-col gap-1", t.username === user.username ? "items-end" : "items-start")}>
                  <span className="text-[10px] text-white/40">{t.username}</span>
                  <div className={cn("px-3 py-2 rounded-xl text-sm max-w-[90%]", t.username === user.username ? "bg-brand-accent text-white" : "bg-white/5 text-white/80")}>
                    {t.text}
                  </div>
                </div>
              ))}
              {localInterim && (
                <div className="flex flex-col gap-1 items-end animate-pulse">
                  <span className="text-[10px] text-brand-accent">You (Live)</span>
                  <div className="px-3 py-2 rounded-xl text-sm max-w-[90%] bg-brand-accent/20 text-white/60 border border-brand-accent/30 italic">
                    {localInterim}...
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-white/5">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!chatMessage.trim()) return;
                  socketRef.current?.send(JSON.stringify({ type: 'transcript', text: chatMessage, sentiment: 'Neutral' }));
                  setChatMessage('');
                }}
                className="flex gap-2"
              >
                <input 
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-accent"
                />
                <Button type="submit" className="p-2"><Zap className="w-4 h-4" /></Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {needsGesture && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-6 text-center"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-md w-full glass-card p-10 space-y-6"
            >
              <div className="w-20 h-20 bg-brand-accent/20 rounded-full flex items-center justify-center mx-auto">
                <Volume2 className="w-10 h-10 text-brand-accent animate-pulse" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Enable Session Audio</h2>
                <p className="text-white/60">To hear other participants and the AI facilitator, please click the button below to join the audio stream.</p>
              </div>
              <Button 
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!audioContextRef.current || (audioContextRef.current as any) === 0) {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                  }
                  await audioContextRef.current.resume();
                  setAudioStatus(audioContextRef.current.state as any);
                  setNeedsGesture(false);
                  testAudio(); // Play a test sound to confirm
                }}
                className="w-full py-4 text-lg"
                icon={Volume2}
              >
                Join Audio
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
