import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("discussion.db");
db.exec("PRAGMA foreign_keys = ON");
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    topic TEXT,
    title TEXT,
    description TEXT,
    date TEXT,
    time TEXT,
    duration INTEGER,
    real_users_count INTEGER,
    ai_participants_count INTEGER,
    language TEXT,
    difficulty TEXT,
    created_by INTEGER,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    user_id INTEGER,
    username TEXT,
    text TEXT,
    sentiment TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE,
    user_id INTEGER,
    analysis_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());

  // Auth Middleware
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      const user = db.prepare("SELECT id, username FROM users WHERE id = ?").get(decoded.id);
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
      const info = db.prepare("INSERT INTO users (username, password) VALUES (?, ?)").run(username, hashedPassword);
      const token = jwt.sign({ id: info.lastInsertRowid, username }, JWT_SECRET);
      res.json({ token, user: { id: info.lastInsertRowid, username } });
    } catch (err) {
      res.status(400).json({ error: "Username already exists" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    const user: any = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ id: user.id, username }, JWT_SECRET);
      res.json({ token, user: { id: user.id, username } });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Session Routes
  app.post("/api/sessions", authenticate, (req: any, res) => {
    const { 
      topic, title, description, date, time, duration, 
      realUsersCount, aiParticipantsCount, language, difficulty 
    } = req.body;

    const userId = req.user.id;
    const sessionId = Math.random().toString(36).substring(2, 10);
    try {
      db.prepare(`
        INSERT INTO sessions (
          id, topic, title, description, date, time, duration, 
          real_users_count, ai_participants_count, language, difficulty, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId, topic, title, description, date, time, duration, 
        realUsersCount, aiParticipantsCount, language, difficulty, userId
      );
      res.json({ 
        id: sessionId, topic, title, description, date, time, duration, 
        realUsersCount, aiParticipantsCount, language, difficulty,
        status: 'active',
        created_by: userId,
        created_at: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("Session creation error:", err);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  app.get("/api/sessions", authenticate, (req: any, res) => {
    const userId = req.user.id;
    const sessions = db.prepare(`
      SELECT s.*, r.analysis_json 
      FROM sessions s 
      LEFT JOIN reports r ON s.id = r.session_id 
      WHERE s.created_by = ? 
      ORDER BY s.created_at DESC
    `).all(userId);
    
    // Parse analysis_json for each session
    const sessionsWithReports = sessions.map((s: any) => ({
      ...s,
      analysis: s.analysis_json ? JSON.parse(s.analysis_json) : null
    }));
    
    res.json(sessionsWithReports);
  });

  app.get("/api/sessions/:id", authenticate, (req, res) => {
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  app.get("/api/sessions/:id/transcripts", authenticate, (req, res) => {
    const transcripts = db.prepare("SELECT * FROM transcripts WHERE session_id = ? ORDER BY timestamp ASC").all(req.params.id);
    res.json(transcripts);
  });

  app.delete("/api/sessions/:id", authenticate, (req, res) => {
    db.transaction(() => {
      db.prepare("DELETE FROM reports WHERE session_id = ?").run(req.params.id);
      db.prepare("DELETE FROM transcripts WHERE session_id = ?").run(req.params.id);
      db.prepare("DELETE FROM sessions WHERE id = ? AND created_by = ?").run(req.params.id, (req as any).user.id);
    })();
    res.json({ success: true });
  });

  app.get("/api/sessions/:id/report", authenticate, (req, res) => {
    const report = db.prepare("SELECT * FROM reports WHERE session_id = ?").get(req.params.id);
    res.json(report ? JSON.parse(report.analysis_json) : null);
  });

  app.post("/api/sessions/:id/report", authenticate, (req, res) => {
    const { analysis } = req.body;
    try {
      db.transaction(() => {
        const session = db.prepare("SELECT 1 FROM sessions WHERE id = ?").get(req.params.id);
        if (!session) throw new Error("Session not found");

        // Ensure user exists before inserting report to avoid FK failure
        const userExists = db.prepare("SELECT 1 FROM users WHERE id = ?").get((req as any).user.id);
        if (!userExists) throw new Error("User not found");

        db.prepare("INSERT OR REPLACE INTO reports (session_id, user_id, analysis_json) VALUES (?, ?, ?)")
          .run(req.params.id, (req as any).user.id, JSON.stringify(analysis));
        db.prepare("UPDATE sessions SET status = 'completed' WHERE id = ?").run(req.params.id);
      })();
      res.json({ success: true });
    } catch (err: any) {
      const status = err.message === "Session not found" || err.message === "User not found" ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  // WebSocket for Real-time sync
  const rooms = new Map<string, Map<WebSocket, any>>();
  const sessionStates = new Map<string, { started: boolean }>();

  wss.on("connection", (ws, req) => {
    let currentSessionId: string | null = null;
    let currentUser: any = null;

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === "join") {
        currentSessionId = message.sessionId;
        currentUser = message.user;
        if (!rooms.has(currentSessionId!)) {
          rooms.set(currentSessionId!, new Map());
        }
        rooms.get(currentSessionId!)?.set(ws, currentUser);
        
        // Send unique participants to the new user
        const uniqueParticipants = Array.from(
          new Map(Array.from(rooms.get(currentSessionId!)!.values()).map(p => [p.username, p])).values()
        );

        ws.send(JSON.stringify({
          type: "participants_list",
          participants: uniqueParticipants
        }));

        // If session already started, notify the new user
        if (sessionStates.get(currentSessionId!)?.started) {
          ws.send(JSON.stringify({
            type: "session_started",
            timestamp: new Date().toISOString()
          }));
        }

        // Broadcast user joined to others
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
          const sessionExists = db.prepare("SELECT 1 FROM sessions WHERE id = ?").get(targetSessionId);
          if (!sessionExists) return;

          // Use null for user_id if it's a virtual/AI user (id <= 0) to avoid foreign key constraint failures
          const dbUserId = (!targetUser.id || targetUser.id <= 0) ? null : targetUser.id;

          const info = db.prepare("INSERT INTO transcripts (session_id, user_id, username, text, sentiment) VALUES (?, ?, ?, ?, ?)")
            .run(targetSessionId, dbUserId, targetUser.username, text, sentiment);
          
          broadcast(targetSessionId, {
            type: "transcript",
            id: info.lastInsertRowid,
            user: targetUser,
            username: targetUser.username,
            text,
            sentiment,
            audio: message.audio,
            timestamp: new Date().toISOString()
          });
        } catch (err: any) {
          // Ignore foreign key errors as they are likely due to race conditions with session deletion
          if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
            console.warn("Foreign key constraint failed for transcript (likely session deleted):", err.message);
            return;
          }
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
