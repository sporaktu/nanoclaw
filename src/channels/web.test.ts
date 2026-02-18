import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebChannel } from './web.js';
import { _initTestDatabase, storeMessage, storeChatMetadata, setOnMessageStored } from '../db.js';
import WebSocket from 'ws';
import type { RegisteredGroup, NewMessage } from '../types.js';

let channel: WebChannel;

function createChannel() {
  const registeredGroups: Record<string, RegisteredGroup> = {};
  const messages: NewMessage[] = [];

  channel = new WebChannel({
    onMessage: (_jid, msg) => messages.push(msg),
    onChatMetadata: () => {},
    registeredGroups: () => registeredGroups,
    registerGroup: (jid, group) => { registeredGroups[jid] = group; },
    port: 0, // OS assigns available port
  });

  return { registeredGroups, messages };
}

describe('WebChannel', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  afterEach(async () => {
    setOnMessageStored(null);
    if (channel) await channel.disconnect();
  });

  it('starts HTTP server and serves API', async () => {
    createChannel();
    await channel.connect();
    const port = channel.getPort();

    const res = await fetch(`http://localhost:${port}/api/conversations`);
    expect(res.ok).toBe(true);
    const data: any = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('ownsJid returns true for @web JIDs', () => {
    createChannel();
    expect(channel.ownsJid('test@web')).toBe(true);
    expect(channel.ownsJid('group@g.us')).toBe(false);
  });

  it('broadcasts new messages via WebSocket', async () => {
    createChannel();
    await channel.connect();
    const port = channel.getPort();

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const received: any[] = [];
    ws.on('message', (data) => received.push(JSON.parse(data.toString())));

    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');
    storeMessage({
      id: 'test-1',
      chat_jid: 'group@g.us',
      sender: 'user',
      sender_name: 'User',
      content: 'hello from whatsapp',
      timestamp: '2024-01-01T00:00:01.000Z',
      is_from_me: false,
    });

    await new Promise((r) => setTimeout(r, 100));

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('newMessage');
    expect(received[0].message.content).toBe('hello from whatsapp');

    ws.close();
  });

  it('returns message history via REST', async () => {
    createChannel();
    await channel.connect();
    const port = channel.getPort();

    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');
    storeMessage({
      id: 'hist-1', chat_jid: 'group@g.us', sender: 'user', sender_name: 'User',
      content: 'test message', timestamp: '2024-01-01T00:00:01.000Z', is_from_me: false,
    });

    const res = await fetch(`http://localhost:${port}/api/conversations/group%40g.us/messages`);
    expect(res.ok).toBe(true);
    const data: any = await res.json();
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].content).toBe('test message');
  });
});
