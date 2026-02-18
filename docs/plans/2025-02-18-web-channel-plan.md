# Web Channel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a local web UI to NanoClaw with a unified inbox across all channels, rich message rendering, and real-time updates.

**Architecture:** A new `WebChannel` class implements the `Channel` interface using Express for REST + `ws` for WebSocket. A notification hook in `storeMessage` broadcasts to connected web clients in real-time. The React frontend (Vite) renders a two-panel chat UI served as static files.

**Tech Stack:** Express, ws, React 19, Vite, react-markdown, highlight.js

---

### Task 1: Add express and ws dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install dependencies**

Run:
```bash
npm install express ws
npm install -D @types/express @types/ws
```

**Step 2: Verify installation**

Run: `node -e "require('express'); require('ws'); console.log('ok')"`
Expected: `ok`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add express and ws dependencies for web channel"
```

---

### Task 2: Add message notification hook to db.ts

**Files:**
- Modify: `src/db.ts:209-222`
- Test: `src/db.test.ts`

**Step 1: Write the failing test**

Add to `src/db.test.ts`:

```typescript
describe('onMessageStored callback', () => {
  it('calls registered callback when a message is stored', () => {
    const { setOnMessageStored } = await import('./db.js');
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    const received: NewMessage[] = [];
    setOnMessageStored((msg) => received.push(msg));

    store({
      id: 'cb-1',
      chat_jid: 'group@g.us',
      sender: 'user@s.whatsapp.net',
      sender_name: 'User',
      content: 'hello',
      timestamp: '2024-01-01T00:00:01.000Z',
    });

    expect(received).toHaveLength(1);
    expect(received[0].content).toBe('hello');
  });

  it('works when no callback is registered', () => {
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    // Should not throw
    store({
      id: 'cb-2',
      chat_jid: 'group@g.us',
      sender: 'user@s.whatsapp.net',
      sender_name: 'User',
      content: 'no callback',
      timestamp: '2024-01-01T00:00:02.000Z',
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — `setOnMessageStored` not exported

**Step 3: Implement the notification hook**

In `src/db.ts`, add near the top (after the `let db` line):

```typescript
let onMessageStoredCallback: ((msg: NewMessage) => void) | null = null;

export function setOnMessageStored(cb: ((msg: NewMessage) => void) | null): void {
  onMessageStoredCallback = cb;
}
```

Then modify `storeMessage` to call it at the end:

```typescript
export function storeMessage(msg: NewMessage): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
  );
  onMessageStoredCallback?.(msg);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/db.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add onMessageStored callback hook to db"
```

---

### Task 3: Add getMessagesForChat query to db.ts

The web UI needs paginated message history. The existing `getMessagesSince` filters out bot messages (it's for the agent). We need a query that returns ALL messages for a conversation.

**Files:**
- Modify: `src/db.ts`
- Test: `src/db.test.ts`

**Step 1: Write the failing test**

Add to `src/db.test.ts`:

```typescript
describe('getMessagesForChat', () => {
  it('returns all messages for a chat in chronological order', () => {
    const { getMessagesForChat } = await import('./db.js');
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    store({ id: 'm1', chat_jid: 'group@g.us', sender: 'a', sender_name: 'A', content: 'first', timestamp: '2024-01-01T00:00:01.000Z' });
    store({ id: 'm2', chat_jid: 'group@g.us', sender: 'b', sender_name: 'B', content: 'second', timestamp: '2024-01-01T00:00:02.000Z' });
    store({ id: 'm3', chat_jid: 'group@g.us', sender: 'a', sender_name: 'A', content: 'third', timestamp: '2024-01-01T00:00:03.000Z' });

    const messages = getMessagesForChat('group@g.us', 50);
    expect(messages).toHaveLength(3);
    expect(messages[0].content).toBe('first');
    expect(messages[2].content).toBe('third');
  });

  it('includes bot messages (unlike getMessagesSince)', () => {
    const { getMessagesForChat } = await import('./db.js');
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    storeMessage({
      id: 'bot-1', chat_jid: 'group@g.us', sender: 'bot', sender_name: 'Bot',
      content: 'Andy: hello', timestamp: '2024-01-01T00:00:01.000Z',
      is_from_me: true, is_bot_message: true,
    });
    store({ id: 'user-1', chat_jid: 'group@g.us', sender: 'user', sender_name: 'User', content: 'hi', timestamp: '2024-01-01T00:00:02.000Z' });

    const messages = getMessagesForChat('group@g.us', 50);
    expect(messages).toHaveLength(2);
  });

  it('respects limit parameter and returns most recent', () => {
    const { getMessagesForChat } = await import('./db.js');
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    for (let i = 0; i < 10; i++) {
      store({ id: `m${i}`, chat_jid: 'group@g.us', sender: 'a', sender_name: 'A', content: `msg-${i}`, timestamp: `2024-01-01T00:00:${String(i).padStart(2, '0')}.000Z` });
    }

    const messages = getMessagesForChat('group@g.us', 3);
    expect(messages).toHaveLength(3);
    expect(messages[0].content).toBe('msg-7');
    expect(messages[2].content).toBe('msg-9');
  });

  it('supports before cursor for pagination', () => {
    const { getMessagesForChat } = await import('./db.js');
    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');

    for (let i = 0; i < 5; i++) {
      store({ id: `m${i}`, chat_jid: 'group@g.us', sender: 'a', sender_name: 'A', content: `msg-${i}`, timestamp: `2024-01-01T00:00:0${i}.000Z` });
    }

    const messages = getMessagesForChat('group@g.us', 2, '2024-01-01T00:00:03.000Z');
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('msg-1');
    expect(messages[1].content).toBe('msg-2');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL

**Step 3: Implement**

Add to `src/db.ts`:

```typescript
export function getMessagesForChat(
  chatJid: string,
  limit: number,
  before?: string,
): NewMessage[] {
  if (before) {
    return db
      .prepare(
        `SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message
         FROM messages WHERE chat_jid = ? AND timestamp < ?
         ORDER BY timestamp DESC LIMIT ?`,
      )
      .all(chatJid, before, limit)
      .reverse() as NewMessage[];
  }
  return db
    .prepare(
      `SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message
       FROM messages WHERE chat_jid = ?
       ORDER BY timestamp DESC LIMIT ?`,
    )
    .all(chatJid, limit)
    .reverse() as NewMessage[];
}
```

**Step 4: Run tests**

Run: `npx vitest run src/db.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add getMessagesForChat for paginated history"
```

---

### Task 4: Implement WebChannel backend

**Files:**
- Create: `src/channels/web.ts`
- Test: `src/channels/web.test.ts`

**Step 1: Write the test**

Create `src/channels/web.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebChannel } from './web.js';
import { _initTestDatabase, storeMessage, storeChatMetadata, setOnMessageStored } from '../db.js';
import WebSocket from 'ws';
import type { RegisteredGroup, NewMessage } from '../types.js';

// Use a random port for tests
const TEST_PORT = 0; // OS assigns available port

let channel: WebChannel;
let actualPort: number;

function createChannel(overrides: Partial<Parameters<typeof WebChannel['prototype']['connect']>[0]> = {}) {
  const registeredGroups: Record<string, RegisteredGroup> = {};
  const messages: NewMessage[] = [];

  channel = new WebChannel({
    onMessage: (_jid, msg) => messages.push(msg),
    onChatMetadata: () => {},
    registeredGroups: () => registeredGroups,
    registerGroup: (jid, group) => { registeredGroups[jid] = group; },
    port: TEST_PORT,
    ...overrides,
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
    actualPort = channel.getPort();

    const res = await fetch(`http://localhost:${actualPort}/api/conversations`);
    expect(res.ok).toBe(true);
    const data = await res.json();
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
    actualPort = channel.getPort();

    const ws = new WebSocket(`ws://localhost:${actualPort}`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const received: any[] = [];
    ws.on('message', (data) => received.push(JSON.parse(data.toString())));

    // Simulate a message being stored (from any channel)
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

    // Wait for broadcast
    await new Promise((r) => setTimeout(r, 100));

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('newMessage');
    expect(received[0].message.content).toBe('hello from whatsapp');

    ws.close();
  });

  it('receives messages from WebSocket clients', async () => {
    const { messages } = createChannel();
    await channel.connect();
    actualPort = channel.getPort();

    // Pre-register a web group
    const { registeredGroups } = createChannel();
    // Actually use the channel's register
    channel['opts'].registerGroup('web-test@web', {
      name: 'Test',
      folder: 'web-test',
      trigger: 'Andy',
      added_at: new Date().toISOString(),
      requiresTrigger: false,
    });

    const ws = new WebSocket(`ws://localhost:${actualPort}`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'message', jid: 'web-test@web', content: 'hello from web' }));

    await new Promise((r) => setTimeout(r, 100));
    ws.close();
  });

  it('returns message history via REST', async () => {
    createChannel();
    await channel.connect();
    actualPort = channel.getPort();

    storeChatMetadata('group@g.us', '2024-01-01T00:00:00.000Z');
    storeMessage({
      id: 'hist-1', chat_jid: 'group@g.us', sender: 'user', sender_name: 'User',
      content: 'test message', timestamp: '2024-01-01T00:00:01.000Z', is_from_me: false,
    });

    const res = await fetch(`http://localhost:${actualPort}/api/conversations/group%40g.us/messages`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].content).toBe('test message');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/channels/web.test.ts`
Expected: FAIL — module not found

**Step 3: Implement WebChannel**

Create `src/channels/web.ts`:

```typescript
import express from 'express';
import { createServer, Server } from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

import { ASSISTANT_NAME, MAIN_GROUP_FOLDER } from '../config.js';
import { getAllChats, getAllRegisteredGroups, getMessagesForChat, setOnMessageStored } from '../db.js';
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
    app.get('*', (_req, res) => {
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

  private handleClientMessage(ws: WebSocket, msg: { type: string; jid?: string; content?: string }): void {
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
```

**Step 4: Run tests**

Run: `npx vitest run src/channels/web.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/channels/web.ts src/channels/web.test.ts
git commit -m "feat: implement WebChannel with REST API and WebSocket"
```

---

### Task 5: Register WebChannel in index.ts

**Files:**
- Modify: `src/index.ts:447-454`

**Step 1: Add WebChannel import and registration**

In `src/index.ts`, add import at top:

```typescript
import { WebChannel } from './channels/web.js';
```

In `main()`, add WebChannel creation after the TerminalChannel block (around line 454) and before the WhatsApp channel:

```typescript
  // Create web channel (always enabled — serves UI at localhost)
  const web = new WebChannel({
    onMessage: (chatJid, msg) => storeMessage(msg),
    onChatMetadata: (chatJid, timestamp) => storeChatMetadata(chatJid, timestamp),
    registeredGroups: () => registeredGroups,
    registerGroup,
  });
  channels.push(web);
  await web.connect();
```

**Step 2: Build to verify no type errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: register WebChannel in main startup"
```

---

### Task 6: Scaffold React frontend with Vite

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/App.css`
- Modify: `package.json` (add `build:web` script)
- Modify: `.gitignore` (add `web/dist/`)

**Step 1: Initialize web directory**

Run:
```bash
mkdir -p web/src
```

**Step 2: Create `web/package.json`**

```json
{
  "name": "nanoclaw-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "highlight.js": "^11.10.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

**Step 3: Create `web/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3420',
      '/ws': {
        target: 'ws://localhost:3420',
        ws: true,
      },
    },
  },
});
```

**Step 4: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**Step 5: Create `web/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NanoClaw</title>
    <link rel="manifest" href="/manifest.json" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 6: Create `web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './App.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Step 7: Create `web/src/App.tsx` (placeholder)**

```tsx
export default function App() {
  return (
    <div className="app">
      <h1>NanoClaw</h1>
      <p>Web UI loading...</p>
    </div>
  );
}
```

**Step 8: Create `web/src/App.css` (minimal)**

```css
:root {
  --bg: #0d1117;
  --bg-secondary: #161b22;
  --border: #30363d;
  --text: #e6edf3;
  --text-muted: #8b949e;
  --accent: #58a6ff;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text);
}

.app {
  display: flex;
  height: 100vh;
}
```

**Step 9: Install dependencies and verify build**

Run:
```bash
cd web && npm install && npm run build && cd ..
```
Expected: `web/dist/` created with `index.html` and JS bundle

**Step 10: Add `build:web` script to root package.json**

Add to `scripts` in `package.json`:
```json
"build:web": "cd web && npm run build"
```

**Step 11: Add `web/dist/` and `web/node_modules/` to `.gitignore`**

**Step 12: Commit**

```bash
git add web/package.json web/package-lock.json web/tsconfig.json web/vite.config.ts web/index.html web/src/ package.json .gitignore
git commit -m "feat: scaffold React frontend with Vite"
```

---

### Task 7: Build conversation sidebar component

**Files:**
- Create: `web/src/components/Sidebar.tsx`
- Create: `web/src/components/Sidebar.css`
- Create: `web/src/hooks/useWebSocket.ts`
- Create: `web/src/hooks/useConversations.ts`
- Create: `web/src/types.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.css`

**Step 1: Create shared types**

Create `web/src/types.ts`:

```typescript
export interface Conversation {
  jid: string;
  name: string;
  folder: string;
  channel: 'whatsapp' | 'slack' | 'web' | 'terminal';
  lastActivity: string;
}

export interface Message {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me?: boolean | number;
  is_bot_message?: boolean | number;
}

export interface WsMessage {
  type: 'newMessage' | 'typing';
  message?: Message;
  jid?: string;
  value?: boolean;
}
```

**Step 2: Create WebSocket hook**

Create `web/src/hooks/useWebSocket.ts`:

```typescript
import { useEffect, useRef, useCallback, useState } from 'react';
import type { WsMessage } from '../types';

type MessageHandler = (msg: WsMessage) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(onMessage);
  handlersRef.current = onMessage;

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 2s
      setTimeout(() => wsRef.current === ws && window.location.reload(), 2000);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WsMessage;
        handlersRef.current(msg);
      } catch { /* ignore */ }
    };

    return () => { ws.close(); };
  }, []);

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send, connected };
}
```

**Step 3: Create conversations hook**

Create `web/src/hooks/useConversations.ts`:

```typescript
import { useState, useEffect } from 'react';
import type { Conversation } from '../types';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch('/api/conversations');
      const data = await res.json();
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  return { conversations, loading, refresh };
}
```

**Step 4: Create Sidebar component**

Create `web/src/components/Sidebar.tsx`:

```tsx
import type { Conversation } from '../types';
import './Sidebar.css';

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: 'WA',
  slack: 'SL',
  web: 'WB',
  terminal: 'TM',
};

interface Props {
  conversations: Conversation[];
  selected: string | null;
  onSelect: (jid: string) => void;
}

export default function Sidebar({ conversations, selected, onSelect }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>NanoClaw</h1>
      </div>
      <div className="sidebar-list">
        {conversations.map((c) => (
          <button
            key={c.jid}
            className={`sidebar-item ${c.jid === selected ? 'active' : ''}`}
            onClick={() => onSelect(c.jid)}
          >
            <span className={`channel-badge ${c.channel}`}>
              {CHANNEL_ICONS[c.channel] || '??'}
            </span>
            <div className="sidebar-item-text">
              <span className="sidebar-item-name">{c.name}</span>
              <span className="sidebar-item-time">
                {c.lastActivity ? new Date(c.lastActivity).toLocaleDateString() : ''}
              </span>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
```

**Step 5: Create Sidebar.css**

Create `web/src/components/Sidebar.css`:

```css
.sidebar {
  width: 280px;
  min-width: 280px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.sidebar-header h1 {
  font-size: 18px;
  font-weight: 600;
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.sidebar-item:hover { background: rgba(255,255,255,0.04); }
.sidebar-item.active { background: rgba(88,166,255,0.1); }

.channel-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 5px;
  border-radius: 4px;
  background: var(--border);
  flex-shrink: 0;
}

.channel-badge.whatsapp { background: #25d366; color: #000; }
.channel-badge.slack { background: #e01e5a; color: #fff; }
.channel-badge.web { background: var(--accent); color: #000; }

.sidebar-item-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sidebar-item-name {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-item-time {
  font-size: 11px;
  color: var(--text-muted);
}
```

**Step 6: Update App.tsx**

```tsx
import { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import { useConversations } from './hooks/useConversations';
import { useWebSocket } from './hooks/useWebSocket';
import type { WsMessage } from './types';
import './App.css';

export default function App() {
  const { conversations, refresh } = useConversations();
  const [selectedJid, setSelectedJid] = useState<string | null>(null);

  const handleWsMessage = useCallback((_msg: WsMessage) => {
    // Will be wired up in the chat panel task
    refresh();
  }, [refresh]);

  const { send, connected } = useWebSocket(handleWsMessage);

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        selected={selectedJid}
        onSelect={setSelectedJid}
      />
      <main className="chat-area">
        {selectedJid ? (
          <div className="chat-placeholder">Chat view coming next...</div>
        ) : (
          <div className="chat-placeholder">Select a conversation</div>
        )}
      </main>
    </div>
  );
}
```

**Step 7: Update App.css — add chat-area styles**

Append to `web/src/App.css`:

```css
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 16px;
}
```

**Step 8: Build and verify**

Run: `cd web && npm run build && cd ..`
Expected: Builds successfully

**Step 9: Commit**

```bash
git add web/src/
git commit -m "feat: add conversation sidebar with WebSocket hook"
```

---

### Task 8: Build chat panel with markdown rendering

**Files:**
- Create: `web/src/components/ChatPanel.tsx`
- Create: `web/src/components/ChatPanel.css`
- Create: `web/src/components/MessageBubble.tsx`
- Create: `web/src/components/MessageInput.tsx`
- Create: `web/src/hooks/useMessages.ts`
- Modify: `web/src/App.tsx`

**Step 1: Create useMessages hook**

Create `web/src/hooks/useMessages.ts`:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Message } from '../types';

export function useMessages(jid: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const jidRef = useRef(jid);

  // Reset when jid changes
  useEffect(() => {
    jidRef.current = jid;
    if (!jid) {
      setMessages([]);
      return;
    }
    setLoading(true);
    fetch(`/api/conversations/${encodeURIComponent(jid)}/messages?limit=50`)
      .then((r) => r.json())
      .then((data) => {
        if (jidRef.current === jid) {
          setMessages(data.messages);
          setHasMore(data.hasMore);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [jid]);

  const addMessage = useCallback((msg: Message) => {
    if (msg.chat_jid !== jidRef.current) return;
    setMessages((prev) => [...prev, msg]);
  }, []);

  const loadMore = useCallback(async () => {
    if (!jid || messages.length === 0 || !hasMore) return;
    const oldest = messages[0].timestamp;
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(jid)}/messages?limit=50&before=${encodeURIComponent(oldest)}`,
    );
    const data = await res.json();
    setMessages((prev) => [...data.messages, ...prev]);
    setHasMore(data.hasMore);
  }, [jid, messages, hasMore]);

  return { messages, loading, hasMore, loadMore, addMessage };
}
```

**Step 2: Create MessageBubble component**

Create `web/src/components/MessageBubble.tsx`:

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../types';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isBot = message.is_bot_message;
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`message ${isBot ? 'bot' : 'user'}`}>
      <div className="message-header">
        <span className="message-sender">{message.sender_name}</span>
        <span className="message-time">{time}</span>
      </div>
      <div className="message-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
    </div>
  );
}
```

**Step 3: Create MessageInput component**

Create `web/src/components/MessageInput.tsx`:

```tsx
import { useState, useRef, KeyboardEvent } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function MessageInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="message-input">
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled}
        rows={1}
      />
      <button onClick={handleSend} disabled={disabled || !text.trim()}>
        Send
      </button>
    </div>
  );
}
```

**Step 4: Create ChatPanel component**

Create `web/src/components/ChatPanel.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import { useMessages } from '../hooks/useMessages';
import type { Conversation, Message } from '../types';
import './ChatPanel.css';

interface Props {
  conversation: Conversation;
  onSend: (jid: string, content: string) => void;
  typing: boolean;
}

export default function ChatPanel({ conversation, onSend, typing }: Props) {
  const { messages, loading, hasMore, loadMore, addMessage } = useMessages(conversation.jid);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Expose addMessage for parent to call on WebSocket events
  useEffect(() => {
    (window as any).__addMessage = addMessage;
    return () => { delete (window as any).__addMessage; };
  }, [addMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typing]);

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h2>{conversation.name}</h2>
        <span className="chat-channel">{conversation.channel}</span>
      </div>
      <div className="chat-messages" ref={containerRef}>
        {hasMore && (
          <button className="load-more" onClick={loadMore}>
            Load older messages
          </button>
        )}
        {loading && <div className="chat-loading">Loading...</div>}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {typing && (
          <div className="typing-indicator">Thinking...</div>
        )}
        <div ref={bottomRef} />
      </div>
      <MessageInput onSend={(text) => onSend(conversation.jid, text)} />
    </div>
  );
}
```

**Step 5: Create ChatPanel.css**

Create `web/src/components/ChatPanel.css`:

```css
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-header h2 { font-size: 16px; font-weight: 600; }
.chat-channel { font-size: 12px; color: var(--text-muted); }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--bg-secondary);
}

.message.bot { align-self: flex-start; }
.message.user { align-self: flex-end; background: rgba(88,166,255,0.12); }

.message-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 4px;
}

.message-sender { font-size: 12px; font-weight: 600; color: var(--accent); }
.message-time { font-size: 11px; color: var(--text-muted); }

.message-content {
  font-size: 14px;
  line-height: 1.5;
}

.message-content pre {
  background: var(--bg);
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  margin: 8px 0;
}

.message-content code {
  font-family: 'SF Mono', Menlo, monospace;
  font-size: 13px;
}

.message-content p + p { margin-top: 8px; }

.typing-indicator {
  color: var(--text-muted);
  font-style: italic;
  padding: 8px 0;
}

.message-input {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.message-input textarea {
  flex: 1;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  resize: none;
  outline: none;
}

.message-input textarea:focus { border-color: var(--accent); }

.message-input button {
  background: var(--accent);
  color: #000;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-weight: 600;
  cursor: pointer;
}

.message-input button:disabled { opacity: 0.4; cursor: default; }

.load-more {
  align-self: center;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
  margin-bottom: 8px;
}

.chat-loading { text-align: center; color: var(--text-muted); padding: 16px; }
```

**Step 6: Update App.tsx to wire everything together**

Replace `web/src/App.tsx`:

```tsx
import { useState, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import { useConversations } from './hooks/useConversations';
import { useWebSocket } from './hooks/useWebSocket';
import type { WsMessage } from './types';
import './App.css';

export default function App() {
  const { conversations, refresh } = useConversations();
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [typingJids, setTypingJids] = useState<Set<string>>(new Set());

  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'newMessage' && msg.message) {
      (window as any).__addMessage?.(msg.message);
      refresh();
    }
    if (msg.type === 'typing' && msg.jid !== undefined) {
      setTypingJids((prev) => {
        const next = new Set(prev);
        if (msg.value) next.add(msg.jid!);
        else next.delete(msg.jid!);
        return next;
      });
    }
  }, [refresh]);

  const { send, connected } = useWebSocket(handleWsMessage);

  const handleSend = useCallback((jid: string, content: string) => {
    send({ type: 'message', jid, content });
  }, [send]);

  const selectedConversation = conversations.find((c) => c.jid === selectedJid);

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        selected={selectedJid}
        onSelect={setSelectedJid}
      />
      <main className="chat-area">
        {selectedConversation ? (
          <ChatPanel
            conversation={selectedConversation}
            onSend={handleSend}
            typing={typingJids.has(selectedConversation.jid)}
          />
        ) : (
          <div className="chat-placeholder">
            {connected ? 'Select a conversation' : 'Connecting...'}
          </div>
        )}
      </main>
    </div>
  );
}
```

**Step 7: Build and verify**

Run: `cd web && npm run build && cd ..`
Expected: Builds successfully

**Step 8: Commit**

```bash
git add web/src/
git commit -m "feat: add chat panel with markdown rendering and message input"
```

---

### Task 9: Add PWA manifest

**Files:**
- Create: `web/public/manifest.json`

**Step 1: Create manifest**

Create `web/public/manifest.json`:

```json
{
  "name": "NanoClaw",
  "short_name": "NanoClaw",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0d1117",
  "theme_color": "#0d1117"
}
```

**Step 2: Commit**

```bash
git add web/public/
git commit -m "feat: add PWA manifest for standalone install"
```

---

### Task 10: End-to-end smoke test

**Step 1: Build everything**

Run:
```bash
cd web && npm run build && cd .. && npm run build
```

**Step 2: Start NanoClaw**

Run: `npm run dev` (in a separate terminal)

**Step 3: Verify web UI loads**

Open `http://localhost:3420` in a browser. Should see the sidebar with existing conversations and the chat area.

**Step 4: Verify real-time messages**

Send a WhatsApp message to a registered group. It should appear in the web UI within 1 second.

**Step 5: Verify sending from web**

Select a web-only conversation and send a message. The agent should respond.

**Step 6: Commit any fixes from smoke test**

```bash
git add -A
git commit -m "fix: smoke test fixes for web channel"
```
