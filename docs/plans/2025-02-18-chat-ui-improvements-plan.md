# Chat UI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix chat responses (use built-in web channel) and add typing indicators, message status, timestamp grouping, and unread badges.

**Architecture:** NanoClaw's built-in web channel (`src/channels/web.ts`, port 3420) already has full agent invocation, typing events, and message delivery. The frontend just needs to handle these WS events and add UI enhancements. The standalone `nanoclaw-web-app` repo is deprecated.

**Tech Stack:** React 19, TypeScript, pure CSS, WebSocket

---

### Task 1: Wire typing indicator from WebSocket events

The backend already broadcasts `{ type: 'typing', jid, value }` but the frontend ignores it.

**Files:**
- Modify: `web/src/App.tsx:39-50`
- Modify: `web/src/components/ChatsTab.tsx:1-70`

**Step 1: Update App.tsx to pass typing events to ChatsTab**

In `web/src/App.tsx`, add a typing callback ref and handle the `typing` WS event:

```tsx
// Add after line 22
const typingRef = useRef<((jid: string, value: boolean) => void) | null>(null);
```

In `handleWsMessage`, add after the `chatUpdate` handler (line 49):

```tsx
if (msg.type === 'typing' && msg.jid !== undefined && msg.value !== undefined) {
  typingRef.current?.(msg.jid, msg.value);
}
```

Pass `typingRef` to ChatsTab:

```tsx
<ChatsTab
  send={send}
  connected={connected}
  addMessageRef={addMessageRef}
  refreshRef={refreshChatsRef}
  typingRef={typingRef}
/>
```

**Step 2: Update ChatsTab to receive typing events**

In `web/src/components/ChatsTab.tsx`, add `typingRef` to Props:

```tsx
interface Props {
  send: (data: Record<string, unknown>) => void;
  connected: boolean;
  addMessageRef: MutableRefObject<((msg: Message) => void) | null>;
  refreshRef: MutableRefObject<(() => void) | null>;
  typingRef: MutableRefObject<((jid: string, value: boolean) => void) | null>;
}
```

Add effect to wire the typing callback:

```tsx
useEffect(() => {
  typingRef.current = (jid: string, value: boolean) => {
    setTypingJids((prev) => {
      const next = new Set(prev);
      if (value) next.add(jid);
      else next.delete(jid);
      return next;
    });
  };
}, [typingRef]);
```

**Step 3: Build and verify**

Run: `cd web && npx tsc --noEmit && npm run build`

**Step 4: Commit**

```bash
git add web/src/App.tsx web/src/components/ChatsTab.tsx
git commit -m "feat(web): wire typing indicator from WebSocket events"
```

---

### Task 2: Add message status indicators (sending/sent)

Show a clock icon while sending, single check after server echo.

**Files:**
- Modify: `web/src/types.ts:11-20`
- Modify: `web/src/hooks/useMessages.ts`
- Modify: `web/src/components/ChatsTab.tsx`
- Modify: `web/src/components/MessageBubble.tsx`
- Modify: `web/src/components/ChatPanel.css`
- Modify: `web/src/channels/web.ts:382-405`

**Step 1: Add status to Message type**

In `web/src/types.ts`, update Message interface:

```ts
export interface Message {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me?: boolean | number;
  is_bot_message?: boolean | number;
  status?: 'sending' | 'sent';
}
```

Add `messageAck` to WsMessage:

```ts
export interface WsMessage {
  type: 'newMessage' | 'typing' | 'taskUpdate' | 'taskRun' | 'chatUpdate' | 'messageAck';
  message?: Message;
  jid?: string;
  value?: boolean;
  task?: ScheduledTask;
  taskRun?: TaskRunLog;
  messageId?: string;
}
```

**Step 2: Add optimistic insert to useMessages**

In `web/src/hooks/useMessages.ts`, add a new function:

```ts
const addOptimistic = useCallback((msg: Message) => {
  setMessages((prev) => [...prev, { ...msg, status: 'sending' }]);
}, []);

const ackMessage = useCallback((id: string) => {
  setMessages((prev) =>
    prev.map((m) => m.id === id ? { ...m, status: 'sent' } : m),
  );
}, []);
```

Return `addOptimistic` and `ackMessage` alongside existing exports.

Update `addMessage` to skip if a message with that ID already exists (prevent double-add from server echo):

```ts
const addMessage = useCallback((msg: Message) => {
  if (msg.chat_jid !== jidRef.current) return;
  setMessages((prev) => {
    if (prev.some((m) => m.id === msg.id)) {
      // Already exists (optimistic insert) — update status to 'sent'
      return prev.map((m) => m.id === msg.id ? { ...msg, status: 'sent' } : m);
    }
    return [...prev, msg];
  });
}, []);
```

**Step 3: Update ChatsTab to use optimistic send**

In `web/src/components/ChatsTab.tsx`, update `handleSend`:

```tsx
const addOptimisticRef = useRef<((msg: Message) => void) | null>(null);

const handleSend = useCallback((jid: string, content: string) => {
  const id = `web-${Date.now()}`;
  const msg: Message = {
    id,
    chat_jid: jid,
    sender: 'web-user',
    sender_name: 'User',
    content,
    timestamp: new Date().toISOString(),
    is_from_me: false,
    is_bot_message: false,
    status: 'sending',
  };
  addOptimisticRef.current?.(msg);
  send({ type: 'message', jid, content, id });
}, [send]);
```

Pass `addOptimisticRef` to ChatPanel via `onAddOptimistic`.

**Step 4: Update App.tsx to handle messageAck**

In `handleWsMessage`:

```tsx
if (msg.type === 'messageAck' && msg.messageId) {
  ackMessageRef.current?.(msg.messageId);
}
```

**Step 5: Add ack broadcast to backend**

In `src/channels/web.ts`, update `handleClientMessage` (line 382) to broadcast an ack after storing:

```ts
private handleClientMessage(_ws: WebSocket, msg: { type: string; jid?: string; content?: string; id?: string }): void {
  if (msg.type !== 'message' || !msg.jid || !msg.content) return;

  const jid = msg.jid;
  const timestamp = new Date().toISOString();
  const id = msg.id || `web-${Date.now()}`;

  // ... existing auto-register and onChatMetadata code ...

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

  // Acknowledge receipt
  this.broadcast({ type: 'messageAck', messageId: id });
}
```

**Step 6: Add status icons to MessageBubble**

In `web/src/components/MessageBubble.tsx`, add status display for user messages:

```tsx
{!isBot && message.status && (
  <span className="message-status">
    {message.status === 'sending' ? '○' : '✓'}
  </span>
)}
```

Add to `web/src/components/ChatPanel.css`:

```css
.message-status {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 6px;
}
```

**Step 7: Build and verify**

Run: `cd web && npx tsc --noEmit && npm run build`

**Step 8: Commit**

```bash
git add web/src/types.ts web/src/hooks/useMessages.ts web/src/components/ChatsTab.tsx web/src/components/MessageBubble.tsx web/src/components/ChatPanel.css web/src/App.tsx src/channels/web.ts
git commit -m "feat(web): add message status indicators (sending/sent)"
```

---

### Task 3: Add timestamp grouping (date dividers)

Group messages by date with dividers: "Today", "Yesterday", or formatted date.

**Files:**
- Modify: `web/src/components/ChatPanel.tsx`
- Modify: `web/src/components/ChatPanel.css`

**Step 1: Add date grouping helper and render dividers**

In `web/src/components/ChatPanel.tsx`, add a helper function before the component:

```tsx
function formatDateDivider(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function getDateKey(timestamp: string): string {
  return new Date(timestamp).toDateString();
}
```

In the render, replace the plain `messages.map(...)` with grouped rendering:

```tsx
{messages.map((msg, i) => {
  const showDivider = i === 0 || getDateKey(msg.timestamp) !== getDateKey(messages[i - 1].timestamp);
  return (
    <div key={msg.id}>
      {showDivider && (
        <div className="date-divider">
          <span>{formatDateDivider(msg.timestamp)}</span>
        </div>
      )}
      <MessageBubble message={msg} />
    </div>
  );
})}
```

**Step 2: Add CSS for date dividers**

In `web/src/components/ChatPanel.css`:

```css
.date-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0 8px;
}

.date-divider::before,
.date-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.date-divider span {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}
```

**Step 3: Build and verify**

Run: `cd web && npx tsc --noEmit && npm run build`

**Step 4: Commit**

```bash
git add web/src/components/ChatPanel.tsx web/src/components/ChatPanel.css
git commit -m "feat(web): add date dividers between message groups"
```

---

### Task 4: Add unread count badges to sidebar

Track last-read timestamp per conversation in localStorage and show unread counts.

**Files:**
- Create: `web/src/hooks/useUnread.ts`
- Modify: `web/src/components/Sidebar.tsx`
- Modify: `web/src/components/Sidebar.css`
- Modify: `web/src/components/ChatsTab.tsx`

**Step 1: Create useUnread hook**

Create `web/src/hooks/useUnread.ts`:

```ts
import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'nanoclaw-last-read';

function getLastRead(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function useUnread() {
  const [lastRead, setLastRead] = useState<Record<string, string>>(getLastRead);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lastRead));
  }, [lastRead]);

  const markRead = useCallback((jid: string) => {
    setLastRead((prev) => ({ ...prev, [jid]: new Date().toISOString() }));
  }, []);

  const getLastReadTimestamp = useCallback((jid: string) => {
    return lastRead[jid] || '';
  }, [lastRead]);

  return { markRead, getLastReadTimestamp };
}
```

**Step 2: Integrate into ChatsTab**

In `web/src/components/ChatsTab.tsx`, import and use the hook:

```tsx
import { useUnread } from '../hooks/useUnread';

// Inside ChatsTab:
const { markRead, getLastReadTimestamp } = useUnread();

// When selecting a conversation, mark it as read:
const handleSelect = useCallback((jid: string) => {
  setSelectedJid(jid);
  markRead(jid);
}, [markRead]);
```

Pass `getLastReadTimestamp` to Sidebar as `unreadSince`.

**Step 3: Add unread tracking to Sidebar**

In `web/src/components/Sidebar.tsx`, add the `unreadSince` prop:

```tsx
interface Props {
  // ... existing props ...
  unreadSince?: (jid: string) => string;
}
```

Also track message counts. The simplest approach: the Sidebar gets the conversations list which includes `lastActivity`. Compare `lastActivity > unreadSince(jid)` to determine if there are unread messages. For a count, we need to fetch from the API — but for now, a simple dot indicator is sufficient and avoids extra API calls.

In the sidebar item render, add an unread dot:

```tsx
{unreadSince && c.lastActivity > unreadSince(c.jid) && c.jid !== selected && (
  <span className="unread-dot" />
)}
```

**Step 4: Add CSS for unread dot**

In `web/src/components/Sidebar.css`:

```css
.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  margin-left: auto;
}
```

**Step 5: Build and verify**

Run: `cd web && npx tsc --noEmit && npm run build`

**Step 6: Commit**

```bash
git add web/src/hooks/useUnread.ts web/src/components/Sidebar.tsx web/src/components/Sidebar.css web/src/components/ChatsTab.tsx
git commit -m "feat(web): add unread indicator dots to sidebar"
```

---

### Task 5: Graceful WebSocket reconnect

Replace `window.location.reload()` with automatic reconnect that preserves UI state.

**Files:**
- Modify: `web/src/hooks/useWebSocket.ts`

**Step 1: Implement reconnect with exponential backoff**

Replace the entire `web/src/hooks/useWebSocket.ts`:

```ts
import { useEffect, useRef, useCallback, useState } from 'react';
import type { WsMessage } from '../types';

type MessageHandler = (msg: WsMessage) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(onMessage);
  handlersRef.current = onMessage;
  const retryRef = useRef(0);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryRef.current = 0;
    };

    ws.onclose = () => {
      setConnected(false);
      if (!mountedRef.current) return;
      const delay = Math.min(1000 * 2 ** retryRef.current, 30000);
      retryRef.current++;
      setTimeout(connect, delay);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WsMessage;
        handlersRef.current(msg);
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send, connected };
}
```

**Step 2: Build and verify**

Run: `cd web && npx tsc --noEmit && npm run build`

**Step 3: Commit**

```bash
git add web/src/hooks/useWebSocket.ts
git commit -m "feat(web): graceful WebSocket reconnect with exponential backoff"
```

---

### Task 6: Build frontend and verify in browser

**Step 1: Full build**

```bash
cd web && npm run build
```

**Step 2: Start NanoClaw**

```bash
npm run dev
```

**Step 3: Verify in browser**

Open http://localhost:3420 and verify:
- Typing indicator shows "Thinking..." when agent is processing
- Messages show ○ while sending, ✓ after server ack
- Date dividers appear between messages from different days
- Unread dots appear on conversations with new messages
- WebSocket reconnects gracefully (test by stopping/starting NanoClaw)

**Step 4: Final commit if any fixes needed**
