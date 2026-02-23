import { App } from '@slack/bolt';

import { ASSISTANT_NAME } from '../config.js';
import { logger } from '../logger.js';
import { Channel, OnInboundMessage, OnChatMetadata, RegisteredGroup } from '../types.js';

export interface SlackChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  botToken: string;
  appToken: string;
}

export class SlackChannel implements Channel {
  name = 'slack';

  private app: App;
  private connected = false;
  private opts: SlackChannelOpts;
  // Cache user display names to avoid rate-limiting users.info
  private userNameCache: Map<string, string> = new Map();

  constructor(opts: SlackChannelOpts) {
    this.opts = opts;

    this.app = new App({
      token: opts.botToken,
      appToken: opts.appToken,
      socketMode: true,
      // Suppress Bolt's default console logging — we use pino
      logger: {
        debug: (...args) => logger.debug(args, 'bolt'),
        info: (...args) => logger.debug(args, 'bolt'),
        warn: (...args) => logger.warn(args, 'bolt'),
        error: (...args) => logger.error(args, 'bolt'),
        getLevel: () => 'DEBUG' as any,
        setLevel: () => {},
        setName: () => {},
      },
    });

    this.setupMessageHandler();
  }

  async connect(): Promise<void> {
    await this.app.start();
    this.connected = true;
    logger.info('Connected to Slack (Socket Mode)');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    const channel = jid.replace(/@slack$/, '');
    try {
      await this.app.client.chat.postMessage({
        channel,
        text: `${ASSISTANT_NAME}: ${text}`,
      });
      logger.info({ jid, length: text.length }, 'Slack message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Slack message');
      throw err;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.endsWith('@slack');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    await this.app.stop();
    logger.info('Disconnected from Slack');
  }

  private setupMessageHandler(): void {
    this.app.message(async ({ message }) => {
      // Cast to access properties — Bolt's union types make direct access difficult
      const msg = message as unknown as Record<string, unknown>;

      // Skip subtypes (system messages like joins, topic changes, etc.)
      if (msg.subtype) return;
      // Skip bot messages to avoid loops
      if (msg.bot_id) return;

      const channelId = msg.channel as string;
      const chatJid = `${channelId}@slack`;
      const ts = msg.ts as string;
      const timestamp = new Date(parseFloat(ts) * 1000).toISOString();

      // Always notify about chat metadata for discovery
      this.opts.onChatMetadata(chatJid, timestamp);

      // Only deliver full message for registered groups
      const groups = this.opts.registeredGroups();
      if (!groups[chatJid]) return;

      const userId = (msg.user as string) || '';
      const senderName = await this.resolveUserName(userId);
      const content = (msg.text as string) || '';

      this.opts.onMessage(chatJid, {
        id: ts,
        chat_jid: chatJid,
        sender: userId,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
        is_bot_message: false,
      });
    });
  }

  private async resolveUserName(userId: string): Promise<string> {
    if (!userId) return 'unknown';

    const cached = this.userNameCache.get(userId);
    if (cached) return cached;

    try {
      const result = await this.app.client.users.info({ user: userId });
      const name =
        result.user?.profile?.display_name ||
        result.user?.real_name ||
        result.user?.name ||
        userId;
      this.userNameCache.set(userId, name);
      return name;
    } catch (err) {
      logger.debug({ userId, err }, 'Failed to resolve Slack user name');
      return userId;
    }
  }
}
