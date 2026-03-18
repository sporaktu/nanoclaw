import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || '/data/messages.db';
const SKILLS_DIR = process.env.SKILLS_DIR || '/skills';
const PORT = parseInt(process.env.PORT || '3030');
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '2000');
const START_TIME = Date.now();

// ─── Database ────────────────────────────────────────────────────────────────

function openDb(): Database.Database {
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = WAL');
  return db;
}

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) db = openDb();
  return db;
}

// ─── App ─────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Serve built React frontend from /public
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

// ─── REST API ────────────────────────────────────────────────────────────────

// GET /health
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: Math.floor((Date.now() - START_TIME) / 1000) });
});

// GET /api/conversations
app.get('/api/conversations', (req, res) => {
  try {
    const archived = req.query['archived'] === '1' ? 1 : 0;
    const rows = getDb()
      .prepare(
        `SELECT
          c.jid,
          c.name,
          c.display_name,
          c.channel,
          c.is_group,
          c.archived,
          c.last_message_time AS lastActivity,
          rg.folder
        FROM chats c
        LEFT JOIN registered_groups rg ON rg.jid = c.jid
        WHERE c.archived = ?
        ORDER BY c.last_message_time DESC`,
      )
      .all(archived);
    res.json(rows);
  } catch (err) {
    console.error('/api/conversations error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// GET /api/conversations/:jid/messages
app.get('/api/conversations/:jid/messages', (req, res) => {
  try {
    const { jid } = req.params;
    const limit = Math.min(parseInt(String(req.query['limit'] ?? '50')), 200);
    const before = req.query['before'] as string | undefined;

    let stmt: Database.Statement;
    let rows: unknown[];
    if (before) {
      stmt = getDb().prepare(
        `SELECT * FROM messages
         WHERE chat_jid = ? AND timestamp < ?
         ORDER BY timestamp DESC
         LIMIT ?`,
      );
      rows = stmt.all(jid, before, limit);
    } else {
      stmt = getDb().prepare(
        `SELECT * FROM messages
         WHERE chat_jid = ?
         ORDER BY timestamp DESC
         LIMIT ?`,
      );
      rows = stmt.all(jid, limit);
    }

    const messages = (rows as Record<string, unknown>[]).reverse();
    const hasMore = rows.length === limit;
    res.json({ messages, hasMore });
  } catch (err) {
    console.error('/api/conversations/:jid/messages error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// GET /api/tasks
app.get('/api/tasks', (_req, res) => {
  try {
    const rows = getDb()
      .prepare(`SELECT * FROM scheduled_tasks ORDER BY created_at DESC`)
      .all();
    res.json(rows);
  } catch (err) {
    console.error('/api/tasks error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// GET /api/tasks/:id
app.get('/api/tasks/:id', (req, res) => {
  try {
    const row = getDb()
      .prepare(`SELECT * FROM scheduled_tasks WHERE id = ?`)
      .get(req.params['id']);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (err) {
    console.error('/api/tasks/:id error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// GET /api/tasks/:id/runs
app.get('/api/tasks/:id/runs', (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query['limit'] ?? '20')), 100);
    const rows = getDb()
      .prepare(
        `SELECT * FROM task_run_logs WHERE task_id = ? ORDER BY run_at DESC LIMIT ?`,
      )
      .all(req.params['id'], limit);
    res.json(rows);
  } catch (err) {
    console.error('/api/tasks/:id/runs error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// GET /api/system/groups
app.get('/api/system/groups', (_req, res) => {
  try {
    const rows = getDb()
      .prepare(`SELECT jid, name, folder, trigger_pattern, channel FROM registered_groups`)
      .all();
    const groups = (rows as Record<string, unknown>[]).map((r) => ({
      name: r['name'],
      folder: r['folder'],
      trigger: r['trigger_pattern'],
      channel: r['channel'] ?? 'unknown',
    }));
    res.json(groups);
  } catch (err) {
    console.error('/api/system/groups error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// GET /api/system/sessions
app.get('/api/system/sessions', (_req, res) => {
  try {
    const rows = getDb().prepare(`SELECT * FROM sessions`).all() as Record<
      string,
      unknown
    >[];
    const sessions: Record<string, string> = {};
    for (const row of rows) {
      sessions[String(row['group_folder'])] = String(row['session_id']);
    }
    res.json(sessions);
  } catch (err) {
    console.error('/api/system/sessions error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// GET /api/system/status
app.get('/api/system/status', (_req, res) => {
  try {
    const groups = getDb()
      .prepare(
        `SELECT rg.jid, rg.name, rg.folder, rg.trigger_pattern, c.channel
         FROM registered_groups rg
         LEFT JOIN chats c ON c.jid = rg.jid`,
      )
      .all() as Record<string, unknown>[];

    res.json({
      activeContainers: 0, // read-only: can't inspect running containers
      connectedClients: wss ? wss.clients.size : 0,
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      groups: groups.map((g) => ({
        name: g['name'],
        folder: g['folder'],
        trigger: g['trigger_pattern'],
        channel: g['channel'] ?? 'unknown',
      })),
      sessions: {},
    });
  } catch (err) {
    console.error('/api/system/status error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// GET /api/skills
app.get('/api/skills', (_req, res) => {
  try {
    if (!fs.existsSync(SKILLS_DIR)) return res.json([]);
    const entries = fs.readdirSync(SKILLS_DIR);
    const skills = entries
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const name = f.replace(/\.md$/, '');
        const content = fs.readFileSync(path.join(SKILLS_DIR, f), 'utf-8');
        const descMatch = content.match(/^description:\s*(.+)$/m);
        return {
          name,
          description: descMatch ? descMatch[1]!.trim() : '',
        };
      });
    res.json(skills);
  } catch (err) {
    console.error('/api/skills error:', err);
    res.status(500).json({ error: 'fs error' });
  }
});

// GET /api/skills/:name
app.get('/api/skills/:name', (req, res) => {
  try {
    const safeName = path.basename(req.params['name']!);
    const filePath = path.join(SKILLS_DIR, `${safeName}.md`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' });
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ name: safeName, content, files: [] });
  } catch (err) {
    console.error('/api/skills/:name error:', err);
    res.status(500).json({ error: 'fs error' });
  }
});

// 403 for any mutating requests — dashboard is read-only
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(403).json({ error: 'dashboard is read-only' });
  }
  next();
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ─── WebSocket ────────────────────────────────────────────────────────────────

const server = createServer(app);
let wss: WebSocketServer;

function broadcast(msg: unknown): void {
  const payload = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

// Watermarks for detecting new rows
let lastMessageRowid = 0;
let lastTaskRun = '';
let lastTaskUpdate = '';

function initWatermarks(): void {
  try {
    const row = getDb()
      .prepare(`SELECT MAX(rowid) AS max_rowid FROM messages`)
      .get() as { max_rowid: number | null };
    lastMessageRowid = row.max_rowid ?? 0;

    const taskRow = getDb()
      .prepare(`SELECT MAX(last_run) AS last_run FROM scheduled_tasks`)
      .get() as { last_run: string | null };
    lastTaskRun = taskRow.last_run ?? '';

    const taskUpdateRow = getDb()
      .prepare(`SELECT MAX(created_at) AS max_created FROM scheduled_tasks`)
      .get() as { max_created: string | null };
    lastTaskUpdate = taskUpdateRow.max_created ?? '';
  } catch {
    // DB may not exist yet
  }
}

function pollForChanges(): void {
  try {
    // Check for new messages
    const newMsgs = getDb()
      .prepare(
        `SELECT * FROM messages WHERE rowid > ? ORDER BY rowid ASC LIMIT 50`,
      )
      .all(lastMessageRowid) as Record<string, unknown>[];

    for (const msg of newMsgs) {
      broadcast({ type: 'newMessage', message: msg });
      lastMessageRowid = (msg['rowid'] as number) ?? lastMessageRowid;
    }

    if (newMsgs.length > 0) {
      broadcast({ type: 'chatUpdate', action: 'updated' });
    }

    // Check for new task runs
    const latestRunRow = getDb()
      .prepare(`SELECT MAX(run_at) AS latest FROM task_run_logs`)
      .get() as { latest: string | null };
    const latestRun = latestRunRow.latest ?? '';
    if (latestRun && latestRun > lastTaskRun) {
      lastTaskRun = latestRun;
      broadcast({ type: 'taskRun' });
    }

    // Check for task status changes
    const latestTaskRow = getDb()
      .prepare(
        `SELECT MAX(last_run) AS latest FROM scheduled_tasks WHERE last_run IS NOT NULL`,
      )
      .get() as { latest: string | null };
    const latestTask = latestTaskRow.latest ?? '';
    if (latestTask && latestTask > lastTaskUpdate) {
      lastTaskUpdate = latestTask;
      broadcast({ type: 'taskUpdate' });
    }
  } catch {
    // DB may be temporarily locked or unavailable
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

function waitForDb(maxWaitMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function attempt() {
      if (fs.existsSync(DB_PATH)) {
        resolve();
        return;
      }
      if (Date.now() - start > maxWaitMs) {
        reject(new Error(`DB not found at ${DB_PATH} after ${maxWaitMs}ms`));
        return;
      }
      setTimeout(attempt, 1000);
    }
    attempt();
  });
}

async function main(): Promise<void> {
  console.log(`Waiting for DB at ${DB_PATH}...`);
  await waitForDb();
  console.log('DB found, starting server...');

  initWatermarks();
  setInterval(pollForChanges, POLL_INTERVAL_MS);

  wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    // Read-only: ignore any messages from clients
    ws.on('message', () => {});
    ws.on('error', () => {});
  });

  server.listen(PORT, () => {
    console.log(`NanoClaw dashboard listening on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
