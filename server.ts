import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";
const MONGODB_URI = process.env.MONGODB_URI;

// MongoDB Connection
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("MongoDB connection error:", err));
} else {
  console.warn("MONGODB_URI not found in environment variables. Database features will fail.");
}

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const sessionSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  topic: String,
  title: String,
  description: String,
  date: String,
  time: String,
  duration: Number,
  real_users_count: Number,
  ai_participants_count: Number,
  language: String,
  difficulty: String,
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

const transcriptSchema = new mongoose.Schema({
  session_id: { type: String, required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', null: true },
  username: String,
  text: String,
  sentiment: String,
  audio: String,
  timestamp: { type: Date, default: Date.now }
});

const reportSchema = new mongoose.Schema({
  session_id: { type: String, unique: true, required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  analysis_json: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Session = mongoose.model('Session', sessionSchema);
const Transcript = mongoose.model('Transcript', transcriptSchema);
const Report = mongoose.model('Report', reportSchema);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());

  // Auth Middleware
  const authenticate = async (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).select('username');
      if (!user) {
        return res.status(401).json({ error: "User no longer exists" });
      }
      req.user = user;
      next();
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // Auth Routes
  app.post("/api/auth/register", async (req, res) => {
    const { username, password } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({ username, password: hashedPassword });
      await user.save();
      const token = jwt.sign({ id: user._id, username }, JWT_SECRET);
      res.json({ token, user: { id: user._id, username } });
    } catch (err) {
      res.status(400).json({ error: "Username already exists" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    try {
      const user = await User.findOne({ username });
      if (user && await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ id: user._id, username }, JWT_SECRET);
        res.json({ token, user: { id: user._id, username } });
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Session Routes
  app.post("/api/sessions", authenticate, async (req: any, res) => {
    const { 
      topic, title, description, date, time, duration, 
      realUsersCount, aiParticipantsCount, language, difficulty 
    } = req.body;

    const userId = req.user._id;
    const sessionId = Math.random().toString(36).substring(2, 10);
    try {
      const session = new Session({
        id: sessionId,
        topic,
        title,
        description,
        date,
        time,
        duration,
        real_users_count: realUsersCount,
        ai_participants_count: aiParticipantsCount,
        language,
        difficulty,
        created_by: userId
      });
      await session.save();

      res.json({ 
        id: sessionId, topic, title, description, date, time, duration, 
        realUsersCount, aiParticipantsCount, language, difficulty,
        status: 'active',
        created_by: userId,
        created_at: session.createdAt
      });
    } catch (err: any) {
      console.error("Session creation error:", err);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  app.get("/api/sessions", authenticate, async (req: any, res) => {
    const userId = req.user._id;
    try {
      const sessions = await Session.find({ created_by: userId }).sort({ createdAt: -1 });
      const reports = await Report.find({ user_id: userId });
      const reportsMap = new Map(reports.map(r => [r.session_id, r.analysis_json]));

      const sessionsWithReports = sessions.map((s: any) => ({
        ...s.toObject(),
        analysis: reportsMap.has(s.id) ? JSON.parse(reportsMap.get(s.id)!) : null
      }));
      
      res.json(sessionsWithReports);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  app.get("/api/sessions/:id", authenticate, async (req, res) => {
    try {
      const session = await Session.findOne({ id: req.params.id });
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/sessions/:id/transcripts", authenticate, async (req, res) => {
    try {
      const transcripts = await Transcript.find({ session_id: req.params.id }).sort({ timestamp: 1 });
      res.json(transcripts);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete("/api/sessions/:id", authenticate, async (req, res) => {
    try {
      await Report.deleteOne({ session_id: req.params.id });
      await Transcript.deleteMany({ session_id: req.params.id });
      await Session.deleteOne({ id: req.params.id, created_by: (req as any).user._id });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/sessions/:id/report", authenticate, async (req, res) => {
    try {
      const report = await Report.findOne({ session_id: req.params.id });
      res.json(report ? JSON.parse(report.analysis_json!) : null);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/sessions/:id/report", authenticate, async (req, res) => {
    const { analysis } = req.body;
    try {
      const session = await Session.findOne({ id: req.params.id });
      if (!session) throw new Error("Session not found");

      await Report.findOneAndUpdate(
        { session_id: req.params.id },
        { user_id: (req as any).user._id, analysis_json: JSON.stringify(analysis) },
        { upsert: true }
      );
      
      session.status = 'completed';
      await session.save();
      
      res.json({ success: true });
    } catch (err: any) {
      const status = err.message === "Session not found" ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  // WebSocket for Real-time sync
  const rooms = new Map<string, Map<WebSocket, any>>();
  const sessionStates = new Map<string, { started: boolean }>();

  wss.on("connection", (ws, req) => {
    let currentSessionId: string | null = null;
    let currentUser: any = null;

    ws.on("message", async (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === "join") {
        currentSessionId = message.sessionId;
        currentUser = message.user;
        if (!rooms.has(currentSessionId!)) {
          rooms.set(currentSessionId!, new Map());
        }
        rooms.get(currentSessionId!)?.set(ws, currentUser);
        
        const uniqueParticipants = Array.from(
          new Map(Array.from(rooms.get(currentSessionId!)!.values()).map(p => [p.username, p])).values()
        );

        ws.send(JSON.stringify({
          type: "participants_list",
          participants: uniqueParticipants
        }));

        if (sessionStates.get(currentSessionId!)?.started) {
          ws.send(JSON.stringify({
            type: "session_started",
            timestamp: new Date().toISOString()
          }));
        }

        broadcast(currentSessionId!, {
          type: "user_joined",
          user: currentUser,
          timestamp: new Date().toISOString()
        });
      }

      if (message.type === "start_session") {
        if (!sessionStates.has(currentSessionId!)) {
          sessionStates.set(currentSessionId!, { started: true });
        } else {
          sessionStates.get(currentSessionId!)!.started = true;
        }
        
        broadcast(currentSessionId!, {
          type: "session_started",
          timestamp: new Date().toISOString()
        });
      }

      if (message.type === "transcript") {
        const { text, sentiment, sessionId, user: msgUser } = message;
        const targetSessionId = sessionId || currentSessionId;
        const targetUser = msgUser || currentUser;

        if (!targetSessionId || !targetUser) return;

        try {
          const session = await Session.findOne({ id: targetSessionId });
          if (!session) return;

          const dbUserId = (!targetUser.id || targetUser.id <= 0) ? null : targetUser.id;

          const transcript = new Transcript({
            session_id: targetSessionId,
            user_id: dbUserId,
            username: targetUser.username,
            text,
            sentiment,
            audio: message.audio
          });
          await transcript.save();
          
          broadcast(targetSessionId, {
            type: "transcript",
            id: transcript._id,
            user: targetUser,
            username: targetUser.username,
            text,
            sentiment,
            audio: message.audio,
            timestamp: transcript.timestamp
          });
        } catch (err: any) {
          console.error("Transcript save error:", err);
        }
      }
    });

    ws.on("close", () => {
      if (currentSessionId && rooms.has(currentSessionId)) {
        rooms.get(currentSessionId)?.delete(ws);
        broadcast(currentSessionId, {
          type: "user_left",
          user: currentUser,
          timestamp: new Date().toISOString()
        });
      }
    });
  });

  function broadcast(sessionId: string, data: any) {
    const clientsMap = rooms.get(sessionId);
    if (clientsMap) {
      const payload = JSON.stringify(data);
      clientsMap.forEach((user, client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    }
  }

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
