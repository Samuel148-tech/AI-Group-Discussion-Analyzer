import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let isMySQL = !!(process.env.MYSQL_URL || process.env.DATABASE_URL || process.env.MYSQLHOST);
let db: any;
let pool: mysql.Pool | null = null;

async function setupDatabase() {
  if (isMySQL) {
    try {
      const connectionString = process.env.MYSQL_URL || process.env.DATABASE_URL;
      if (connectionString) {
        pool = mysql.createPool(connectionString);
      } else {
        pool = mysql.createPool({
          host: process.env.MYSQLHOST,
          user: process.env.MYSQLUSER,
          password: process.env.MYSQLPASSWORD,
          database: process.env.MYSQLDATABASE,
          port: parseInt(process.env.MYSQLPORT || "3306"),
          connectTimeout: 5000,
        });
      }
      
      // Test the connection
      await pool.query("SELECT 1");
      console.log("Successfully connected to MySQL database");
    } catch (err) {
      console.error("Failed to connect to MySQL, falling back to SQLite:", err instanceof Error ? err.message : String(err));
      isMySQL = false;
      if (pool) {
        await pool.end();
        pool = null;
      }
    }
  }

  if (!isMySQL) {
    db = new Database("discussion.db");
    db.exec("PRAGMA foreign_keys = ON");
    console.log("Using SQLite database");
  }

  await initDb();
}

const dbQuery = {
  get: async (sql: string, params: any[] = []) => {
    if (isMySQL && pool) {
      const [rows]: any = await pool.execute(sql, params);
      return rows[0];
    }
    return db.prepare(sql).get(...params);
  },
  all: async (sql: string, params: any[] = []) => {
    if (isMySQL && pool) {
      const [rows]: any = await pool.execute(sql, params);
      return rows;
    }
    return db.prepare(sql).all(...params);
  },
  run: async (sql: string, params: any[] = []) => {
    if (isMySQL && pool) {
      const [result]: any = await pool.execute(sql, params);
      return { lastInsertRowid: result.insertId, changes: result.affectedRows };
    }
    const info = db.prepare(sql).run(...params);
    return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
  },
  exec: async (sql: string) => {
    if (isMySQL && pool) {
      // Basic split for setup script, MySQL pool.execute doesn't support multiple statements by default
      const statements = sql.split(';').filter(s => s.trim());
      for (const statement of statements) {
        await pool.execute(statement);
      }
    } else {
      db.exec(sql);
    }
  }
};

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

// Initialize DB (Modified for MySQL compatibility)
const initDb = async () => {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id ${isMySQL ? 'INT AUTO_INCREMENT' : 'INTEGER'} PRIMARY KEY ${isMySQL ? '' : 'AUTOINCREMENT'},
      username VARCHAR(255) UNIQUE,
      password TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(255) PRIMARY KEY,
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
      created_by INT,
      status VARCHAR(50) DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transcripts (
      id ${isMySQL ? 'INT AUTO_INCREMENT' : 'INTEGER'} PRIMARY KEY ${isMySQL ? '' : 'AUTOINCREMENT'},
      session_id VARCHAR(255),
      user_id INT,
      username VARCHAR(255),
      text TEXT,
      sentiment VARCHAR(50),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reports (
      id ${isMySQL ? 'INT AUTO_INCREMENT' : 'INTEGER'} PRIMARY KEY ${isMySQL ? '' : 'AUTOINCREMENT'},
      session_id VARCHAR(255) UNIQUE,
      user_id INT,
      analysis_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await dbQuery.exec(schema);
};

await setupDatabase();

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
      const user = await dbQuery.get("SELECT id, username FROM users WHERE id = ?", [decoded.id]);
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
      const info = await dbQuery.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword]);
      const token = jwt.sign({ id: info.lastInsertRowid, username }, JWT_SECRET);
      res.json({ token, user: { id: info.lastInsertRowid, username } });
    } catch (err) {
      console.error("Register error:", err);
      res.status(400).json({ error: "Username already exists or database error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    const user: any = await dbQuery.get("SELECT * FROM users WHERE username = ?", [username]);
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ id: user.id, username }, JWT_SECRET);
      res.json({ token, user: { id: user.id, username } });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Session Routes
  app.post("/api/sessions", authenticate, async (req: any, res) => {
    const { 
      topic, title, description, date, time, duration, 
      realUsersCount, aiParticipantsCount, language, difficulty 
    } = req.body;

    const userId = req.user.id;
    const sessionId = Math.random().toString(36).substring(2, 10);
    try {
      await dbQuery.run(`
        INSERT INTO sessions (
          id, topic, title, description, date, time, duration, 
          real_users_count, ai_participants_count, language, difficulty, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        sessionId, topic, title, description, date, time, duration, 
        realUsersCount, aiParticipantsCount, language, difficulty, userId
      ]);
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

  app.get("/api/sessions", authenticate, async (req: any, res) => {
    const userId = req.user.id;
    const sessions = await dbQuery.all(`
      SELECT s.*, r.analysis_json 
      FROM sessions s 
      LEFT JOIN reports r ON s.id = r.session_id 
      WHERE s.created_by = ? 
      ORDER BY s.created_at DESC
    `, [userId]);
    
    // Parse analysis_json for each session
    const sessionsWithReports = sessions.map((s: any) => ({
      ...s,
      analysis: s.analysis_json ? JSON.parse(s.analysis_json) : null
    }));
    
    res.json(sessionsWithReports);
  });

  app.get("/api/sessions/:id", authenticate, async (req, res) => {
    const session = await dbQuery.get("SELECT * FROM sessions WHERE id = ?", [req.params.id]);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  app.get("/api/sessions/:id/transcripts", authenticate, async (req, res) => {
    const transcripts = await dbQuery.all("SELECT * FROM transcripts WHERE session_id = ? ORDER BY timestamp ASC", [req.params.id]);
    res.json(transcripts);
  });

  app.delete("/api/sessions/:id", authenticate, async (req, res) => {
    try {
      // In a real production app with MySQL, you'd use a transaction here.
      // For simplicity in this demo, we'll run them sequentially.
      await dbQuery.run("DELETE FROM reports WHERE session_id = ?", [req.params.id]);
      await dbQuery.run("DELETE FROM transcripts WHERE session_id = ?", [req.params.id]);
      await dbQuery.run("DELETE FROM sessions WHERE id = ? AND created_by = ?", [req.params.id, (req as any).user.id]);
      res.json({ success: true });
    } catch (err) {
      console.error("Delete session error:", err);
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  app.get("/api/sessions/:id/report", authenticate, async (req, res) => {
    const report = await dbQuery.get("SELECT * FROM reports WHERE session_id = ?", [req.params.id]);
    res.json(report ? JSON.parse(report.analysis_json) : null);
  });

  app.post("/api/sessions/:id/report", authenticate, async (req, res) => {
    const { analysis } = req.body;
    try {
      const session = await dbQuery.get("SELECT 1 FROM sessions WHERE id = ?", [req.params.id]);
      if (!session) throw new Error("Session not found");

      const userExists = await dbQuery.get("SELECT 1 FROM users WHERE id = ?", [(req as any).user.id]);
      if (!userExists) throw new Error("User not found");

      // MySQL equivalent of INSERT OR REPLACE is slightly different, but since we have a UNIQUE constraint on session_id:
      if (isMySQL) {
        await dbQuery.run(
          "INSERT INTO reports (session_id, user_id, analysis_json) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE analysis_json = VALUES(analysis_json)",
          [req.params.id, (req as any).user.id, JSON.stringify(analysis)]
        );
      } else {
        await dbQuery.run("INSERT OR REPLACE INTO reports (session_id, user_id, analysis_json) VALUES (?, ?, ?)", 
          [req.params.id, (req as any).user.id, JSON.stringify(analysis)]);
      }
      
      await dbQuery.run("UPDATE sessions SET status = 'completed' WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Report generation error:", err);
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

        (async () => {
          try {
            const sessionExists = await dbQuery.get("SELECT 1 FROM sessions WHERE id = ?", [targetSessionId]);
            if (!sessionExists) return;

            // Use null for user_id if it's a virtual/AI user (id <= 0) to avoid foreign key constraint failures
            const dbUserId = (!targetUser.id || targetUser.id <= 0) ? null : targetUser.id;

            const info = await dbQuery.run("INSERT INTO transcripts (session_id, user_id, username, text, sentiment) VALUES (?, ?, ?, ?, ?)", 
              [targetSessionId, dbUserId, targetUser.username, text, sentiment]);
            
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
            console.error("Transcript save error:", err);
          }
        })();
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

  const PORT = parseInt(process.env.PORT || "3000");
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

// Add global error handlers to prevent crashing
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();
