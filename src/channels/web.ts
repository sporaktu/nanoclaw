import express from 'express';
import { createServer, Server } from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

import crypto from 'crypto';
import fs from 'fs';

import { ASSISTANT_NAME, GROUPS_DIR } from '../config.js';
import {
  getAllChats, getMessagesForChat, setOnMessageStored,
  renameChat, archiveChat, unarchiveChat, deleteChat,
  getAllTasks, getTaskById, createTask, updateTask, deleteTask, getTaskRunLogs,
  getAllSessions, getAllRegisteredGroups,
  storeChatMetadata,
} from '../db.js';
import { logger } from '../logger.js';
import { Channel, NewMessage, OnChatMetadata, OnInboundMessage, RegisteredGroup, ScheduledTask } from '../types.js';

export interface WebChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
  getSessions?: () => Record<string, string>;
  getQueueStatus?: () => { activeContainers: number; groups: Record<string, { pending: boolean }> };
  port?: number;
}

export class WebChannel implements Channel {
  name = 'web';

  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private connected = false;
  private opts: WebChannelOpts;
  private port: number;

  constructor(opts: WebChannelOpts) {
    this.opts = opts;
    this.port = opts.port ?? parseInt(process.env.WEB_PORT || '3420', 10);
  }

  getPort(): number {
    const addr = this.server?.address();
    if (addr && typeof addr === 'object') return addr.port;
    return this.port;
  }

  async connect(): Promise<void> {
    const app = express();
    app.use(express.json());

    // --- REST API ---

    // --- Conversations ---

    app.get('/api/conversations', (req, res) => {
      const groups = this.opts.registeredGroups();
      const chats = getAllChats();
      const showArchived = req.query.archived === '1';

      const conversations = Object.entries(groups).map(([jid, group]) => {
        const chat = chats.find((c) => c.jid === jid);
        return {
          jid,
          name: chat?.display_name || group.name,
          folder: group.folder,
          channel: this.channelTypeForJid(jid),
          lastActivity: chat?.last_message_time || group.added_at,
          display_name: chat?.display_name || null,
          archived: chat?.archived || 0,
        };
      });

      const filtered = conversations.filter((c) => showArchived ? c.archived === 1 : c.archived === 0);
      filtered.sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''));
      res.json(filtered);
    });

    app.get('/api/conversations/:jid/messages', (req, res) => {
      const jid = req.params.jid;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const before = req.query.before as string | undefined;

      const messages = getMessagesForChat(jid, limit, before);
      res.json({ messages, hasMore: messages.length === limit });
    });

    // --- Chat management ---

    app.post('/api/chats', (req, res) => {
      const name = (req.body.name as string)?.trim();
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const jid = `${slug}@web`;
      const timestamp = new Date().toISOString();

      // Register the group so it appears as a conversation
      if (!this.opts.registeredGroups()[jid]) {
        this.opts.registerGroup(jid, { name, folder: slug, trigger: '', added_at: timestamp, requiresTrigger: false });
      }
      storeChatMetadata(jid, timestamp, name);

      this.broadcast({ type: 'chatUpdate', action: 'created', jid });
      res.json({ jid, name, folder: slug });
    });

    app.patch('/api/chats/:jid', (req, res) => {
      const jid = req.params.jid;
      if (req.body.display_name !== undefined) {
        renameChat(jid, req.body.display_name);
      }
      if (req.body.archived === true) {
        archiveChat(jid);
      } else if (req.body.archived === false) {
        unarchiveChat(jid);
      }
      this.broadcast({ type: 'chatUpdate', action: 'updated', jid });
      res.json({ ok: true });
    });

    app.delete('/api/chats/:jid', (req, res) => {
      const jid = req.params.jid;
      deleteChat(jid);
      this.broadcast({ type: 'chatUpdate', action: 'deleted', jid });
      res.json({ ok: true });
    });

    // --- Tasks CRUD ---

    app.get('/api/tasks', (_req, res) => {
      res.json(getAllTasks());
    });

    app.get('/api/tasks/:id', (req, res) => {
      const task = getTaskById(req.params.id);
      if (!task) { res.status(404).json({ error: 'not found' }); return; }
      res.json(task);
    });

    app.post('/api/tasks', (req, res) => {
      const { prompt, schedule_type, schedule_value, group_folder, context_mode } = req.body;
      if (!prompt || !schedule_type || !schedule_value || !group_folder) {
        res.status(400).json({ error: 'prompt, schedule_type, schedule_value, group_folder are required' });
        return;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      // Find chat_jid for the group folder
      const groups = this.opts.registeredGroups();
      const entry = Object.entries(groups).find(([, g]) => g.folder === group_folder);
      const chat_jid = entry ? entry[0] : `${group_folder}@web`;

      const task: Omit<ScheduledTask, 'last_run' | 'last_result'> = {
        id,
        group_folder,
        chat_jid,
        prompt,
        schedule_type,
        schedule_value,
        context_mode: context_mode || 'isolated',
        next_run: now,
        status: 'active',
        created_at: now,
      };

      createTask(task);
      this.broadcast({ type: 'taskUpdate', task: getTaskById(id) });
      res.json(getTaskById(id));
    });

    app.patch('/api/tasks/:id', (req, res) => {
      const task = getTaskById(req.params.id);
      if (!task) { res.status(404).json({ error: 'not found' }); return; }

      const updates: Partial<Pick<ScheduledTask, 'prompt' | 'schedule_type' | 'schedule_value' | 'next_run' | 'status'>> = {};
      if (req.body.prompt !== undefined) updates.prompt = req.body.prompt;
      if (req.body.schedule_type !== undefined) updates.schedule_type = req.body.schedule_type;
      if (req.body.schedule_value !== undefined) updates.schedule_value = req.body.schedule_value;
      if (req.body.next_run !== undefined) updates.next_run = req.body.next_run;
      if (req.body.status !== undefined) updates.status = req.body.status;

      updateTask(req.params.id, updates);
      const updated = getTaskById(req.params.id);
      this.broadcast({ type: 'taskUpdate', task: updated });
      res.json(updated);
    });

    app.delete('/api/tasks/:id', (req, res) => {
      deleteTask(req.params.id);
      this.broadcast({ type: 'taskUpdate', taskId: req.params.id, deleted: true });
      res.json({ ok: true });
    });

    app.get('/api/tasks/:id/runs', (req, res) => {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      res.json(getTaskRunLogs(req.params.id, limit));
    });

    // --- Skills (read-only) ---

    app.get('/api/skills', (_req, res) => {
      const skillsDir = path.resolve(import.meta.dirname, '../../container/skills');
      try {
        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        const skills = entries
          .filter((e) => e.isDirectory())
          .map((e) => {
            const skillMd = path.join(skillsDir, e.name, 'SKILL.md');
            let description = '';
            try {
              const content = fs.readFileSync(skillMd, 'utf-8');
              // First non-header, non-empty line
              const lines = content.split('\n');
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
                  description = trimmed;
                  break;
                }
              }
            } catch { /* no SKILL.md */ }
            return { name: e.name, description };
          });
        res.json(skills);
      } catch {
        res.json([]);
      }
    });

    app.get('/api/skills/:name', (req, res) => {
      const skillsDir = path.resolve(import.meta.dirname, '../../container/skills');
      const skillDir = path.join(skillsDir, req.params.name);
      try {
        const files = fs.readdirSync(skillDir);
        const skillMd = path.join(skillDir, 'SKILL.md');
        let content = '';
        try { content = fs.readFileSync(skillMd, 'utf-8'); } catch { /* missing */ }
        res.json({ name: req.params.name, files, content });
      } catch {
        res.status(404).json({ error: 'skill not found' });
      }
    });

    // --- System ---

    app.get('/api/system/groups', (_req, res) => {
      const groups = getAllRegisteredGroups();
      const result = Object.entries(groups).map(([jid, g]) => ({
        jid,
        name: g.name,
        folder: g.folder,
        trigger: g.trigger,
        channel: this.channelTypeForJid(jid),
      }));
      res.json(result);
    });

    app.get('/api/system/sessions', (_req, res) => {
      res.json(this.opts.getSessions?.() ?? getAllSessions());
    });

    app.get('/api/system/status', (_req, res) => {
      const queueStatus = this.opts.getQueueStatus?.() ?? { activeContainers: 0, groups: {} };
      res.json({
        activeContainers: queueStatus.activeContainers,
        connectedClients: this.clients.size,
        uptime: process.uptime(),
        groups: queueStatus.groups,
      });
    });

    // Serve static frontend files
    const staticDir = path.resolve(import.meta.dirname, '../../web/dist');
    app.use(express.static(staticDir));
    // SPA fallback — serve index.html for non-API routes
    app.get('{*path}', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });

    // --- HTTP + WebSocket server ---

    this.server = createServer(app);
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      logger.info({ clientCount: this.clients.size }, 'Web client connected');

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleClientMessage(ws, msg);
        } catch (err) {
          logger.warn({ err }, 'Invalid WebSocket message from web client');
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.debug({ clientCount: this.clients.size }, 'Web client disconnected');
      });
    });

    // Register for real-time message notifications from all channels
    setOnMessageStored((msg) => this.broadcast({ type: 'newMessage', message: msg }));

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(this.port, () => {
        this.connected = true;
        const actualPort = this.getPort();
        logger.info({ port: actualPort }, 'Web UI available at http://localhost:' + actualPort);
        resolve();
      });

      this.server!.on('error', (err) => {
        logger.error({ err }, 'Web server error');
        reject(err);
      });
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    this.broadcast({
      type: 'newMessage',
      message: {
        id: `web-out-${Date.now()}`,
        chat_jid: jid,
        sender: 'assistant',
        sender_name: ASSISTANT_NAME,
        content: text,
        timestamp: new Date().toISOString(),
        is_from_me: true,
        is_bot_message: true,
      },
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.endsWith('@web');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    setOnMessageStored(null);
    for (const ws of this.clients) {
      ws.close();
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    this.broadcast({ type: 'typing', jid, value: isTyping });
  }

  private broadcast(data: Record<string, unknown>): void {
    const json = JSON.stringify(data);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    }
  }

  private handleClientMessage(_ws: WebSocket, msg: { type: string; jid?: string; content?: string; id?: string }): void {
    if (msg.type !== 'message' || !msg.jid || !msg.content) return;

    const jid = msg.jid;
    const id = msg.id || `web-${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Auto-register new web conversations so they appear in the sidebar
    if (jid.endsWith('@web') && !this.opts.registeredGroups()[jid]) {
      const name = jid.replace(/@web$/, '');
      this.opts.registerGroup(jid, { name, folder: name, trigger: '', added_at: timestamp, requiresTrigger: false });
    }

    this.opts.onChatMetadata(jid, timestamp);
    this.opts.onMessage(jid, {
      id,
      chat_jid: jid,
      sender: 'web-user',
      sender_name: 'User',
      content: msg.content,
      timestamp,
      is_from_me: false,
      is_bot_message: false,
    });
    this.broadcast({ type: 'messageAck', messageId: id });
  }

  private channelTypeForJid(jid: string): string {
    if (jid.endsWith('@web')) return 'web';
    if (jid.endsWith('@terminal')) return 'terminal';
    if (jid.startsWith('slack-')) return 'slack';
    return 'whatsapp';
  }
}
