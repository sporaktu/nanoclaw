import fs from 'fs';
import net from 'net';
import path from 'path';

import { ASSISTANT_NAME, MAIN_GROUP_FOLDER, STORE_DIR } from '../config.js';
import { logger } from '../logger.js';
import { Channel, OnInboundMessage, OnChatMetadata, RegisteredGroup } from '../types.js';

const TERMINAL_JID = 'main@terminal';
const SOCK_PATH = path.join(STORE_DIR, 'nanoclaw.sock');

export interface TerminalChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
}

export class TerminalChannel implements Channel {
  name = 'terminal';

  private server: net.Server | null = null;
  private client: net.Socket | null = null;
  private connected = false;
  private opts: TerminalChannelOpts;
  private lineBuffer = '';

  constructor(opts: TerminalChannelOpts) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    // Remove stale socket file from previous runs
    try {
      fs.unlinkSync(SOCK_PATH);
    } catch {
      // doesn't exist — fine
    }

    // Ensure store directory exists
    fs.mkdirSync(path.dirname(SOCK_PATH), { recursive: true });

    this.server = net.createServer((socket) => {
      // Last connection wins — disconnect previous client
      if (this.client) {
        logger.info('New terminal client connected, disconnecting previous');
        this.client.destroy();
      }

      this.client = socket;
      this.lineBuffer = '';
      logger.info('Terminal client connected');

      // Auto-register the main group for terminal if not already registered
      const groups = this.opts.registeredGroups();
      if (!groups[TERMINAL_JID]) {
        this.opts.registerGroup(TERMINAL_JID, {
          name: 'Terminal',
          folder: MAIN_GROUP_FOLDER,
          trigger: ASSISTANT_NAME,
          added_at: new Date().toISOString(),
          requiresTrigger: false,
        });
      }

      socket.on('data', (data) => {
        this.lineBuffer += data.toString();
        let newlineIdx: number;
        while ((newlineIdx = this.lineBuffer.indexOf('\n')) !== -1) {
          const line = this.lineBuffer.slice(0, newlineIdx).trim();
          this.lineBuffer = this.lineBuffer.slice(newlineIdx + 1);
          if (!line) continue;

          try {
            const parsed = JSON.parse(line);
            this.handleClientMessage(parsed);
          } catch (err) {
            logger.warn({ line, err }, 'Invalid JSON from terminal client');
          }
        }
      });

      socket.on('close', () => {
        if (this.client === socket) {
          this.client = null;
          logger.info('Terminal client disconnected');
        }
      });

      socket.on('error', (err) => {
        logger.debug({ err }, 'Terminal client socket error');
        if (this.client === socket) {
          this.client = null;
        }
      });
    });

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(SOCK_PATH, () => {
        this.connected = true;
        logger.info({ path: SOCK_PATH }, 'Terminal socket server listening');
        resolve();
      });

      this.server!.on('error', (err) => {
        logger.error({ err }, 'Terminal socket server error');
        reject(err);
      });
    });
  }

  async sendMessage(_jid: string, text: string): Promise<void> {
    this.writeLine({ type: 'text', content: text });
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid === TERMINAL_JID;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    // Clean up socket file
    try {
      fs.unlinkSync(SOCK_PATH);
    } catch {
      // already gone
    }
  }

  async setTyping(_jid: string, isTyping: boolean): Promise<void> {
    this.writeLine({ type: 'typing', value: isTyping });
  }

  private writeLine(obj: Record<string, unknown>): void {
    if (!this.client || this.client.destroyed) return;
    try {
      this.client.write(JSON.stringify(obj) + '\n');
    } catch (err) {
      logger.debug({ err }, 'Failed to write to terminal client');
    }
  }

  private handleClientMessage(msg: { type: string; content?: string }): void {
    if (msg.type !== 'message' || !msg.content) return;

    const timestamp = new Date().toISOString();

    this.opts.onChatMetadata(TERMINAL_JID, timestamp);
    this.opts.onMessage(TERMINAL_JID, {
      id: `terminal-${Date.now()}`,
      chat_jid: TERMINAL_JID,
      sender: 'terminal-user',
      sender_name: 'User',
      content: msg.content,
      timestamp,
      is_from_me: false,
      is_bot_message: false,
    });
  }
}
