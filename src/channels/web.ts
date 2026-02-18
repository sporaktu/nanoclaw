import express from 'express';
import { createServer, Server } from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

import { ASSISTANT_NAME } from '../config.js';
import { getAllChats, getMessagesForChat, setOnMessageStored } from '../db.js';
import { logger } from '../logger.js';
import { Channel, NewMessage, OnChatMetadata, OnInboundMessage, RegisteredGroup } from '../types.js';

export interface WebChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
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

    app.get('/api/conversations', (_req, res) => {
      const groups = this.opts.registeredGroups();
      const chats = getAllChats();

      const conversations = Object.entries(groups).map(([jid, group]) => {
        const chat = chats.find((c) => c.jid === jid);
        return {
          jid,
          name: group.name,
          folder: group.folder,
          channel: this.channelTypeForJid(jid),
          lastActivity: chat?.last_message_time || group.added_at,
        };
      });

      conversations.sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''));
      res.json(conversations);
    });

    app.get('/api/conversations/:jid/messages', (req, res) => {
      const jid = req.params.jid;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const before = req.query.before as string | undefined;

      const messages = getMessagesForChat(jid, limit, before);
      res.json({ messages, hasMore: messages.length === limit });
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

  private handleClientMessage(_ws: WebSocket, msg: { type: string; jid?: string; content?: string }): void {
    if (msg.type !== 'message' || !msg.jid || !msg.content) return;

    const jid = msg.jid;
    const timestamp = new Date().toISOString();

    this.opts.onChatMetadata(jid, timestamp);
    this.opts.onMessage(jid, {
      id: `web-${Date.now()}`,
      chat_jid: jid,
      sender: 'web-user',
      sender_name: 'User',
      content: msg.content,
      timestamp,
      is_from_me: false,
      is_bot_message: false,
    });
  }

  private channelTypeForJid(jid: string): string {
    if (jid.endsWith('@web')) return 'web';
    if (jid.endsWith('@terminal')) return 'terminal';
    if (jid.startsWith('slack-')) return 'slack';
    return 'whatsapp';
  }
}
