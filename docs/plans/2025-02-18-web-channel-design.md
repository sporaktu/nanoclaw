# Web Channel — Unified Chat UI for NanoClaw

## Problem

NanoClaw currently has a CLI (`npm run cli`) that connects via Unix socket for single-conversation plain-text chat. Users want a local web interface with multiple conversations, rich message rendering, and visibility into all channels (WhatsApp, Slack, web-only) from one place.

## Design Decisions

- **Approach**: WebChannel reads from existing SQLite DB + real-time hook on `storeMessage` (not an event bus refactor)
- **Frontend**: React with Vite
- **Auth**: Localhost-only for now, designed so auth can be added later
- **Channel model**: Unified inbox — see all channels' conversations in one UI, plus create web-only conversations

## Architecture

```
Browser (React)  ←WebSocket/REST→  WebChannel (src/channels/web.ts)  →  NanoClaw core
                                         ↓
                                   SQLite (existing DB)
```

WebChannel is a new `Channel` implementation that serves a React frontend, exposes a REST API for history, and runs a WebSocket server for real-time messaging.

Real-time: `storeMessage` in `db.ts` gets a notification callback. When any channel stores a message, it broadcasts to connected WebSocket clients. Zero changes to WhatsApp/Slack/Terminal channels.

## Backend — `src/channels/web.ts`

### HTTP API (Express)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/conversations` | GET | List all registered groups + recent chats |
| `/api/conversations/:jid/messages` | GET | Paginated message history |
| `/api/groups/available` | GET | Unregistered WhatsApp groups |
| `/api/groups/:jid/register` | POST | Register a group from the web |
| `/*` | GET | Static files from `web/dist/` |

### WebSocket Protocol

**Client → Server:**
- `{ type: "message", jid: string, content: string }` — send a message

**Server → Client:**
- `{ type: "newMessage", message: NewMessage }` — real-time message broadcast
- `{ type: "typing", jid: string, value: boolean }` — typing indicators

### Channel Interface

- `ownsJid(jid)` — true for `*@web` JIDs
- `sendMessage(jid, text)` — broadcasts to WebSocket clients
- `setTyping(jid, isTyping)` — broadcasts typing state
- Port: configurable via `WEB_PORT` env var, default `3420`

### Web-Only Conversations

Users create new conversations from the UI. JID format: `web-{name}@web`. Registered as a group with its own folder — same isolation as any other group.

## Frontend — `web/`

### Layout

Two-panel design:
- **Left sidebar**: Conversation list across all channels, sorted by last activity. Shows group name, channel icon (WhatsApp/Slack/Web), last message preview, unread indicator.
- **Right panel**: Chat view with message history, markdown rendering, code blocks with syntax highlighting, typing indicator, input box.

### Libraries

- `react-markdown` + `remark-gfm` — rich message rendering
- `highlight.js` or `shiki` — code syntax highlighting
- Native browser WebSocket — real-time connection
- Vite — dev/build

### Message Flow

1. On load: `GET /api/conversations` → populate sidebar
2. Click conversation: `GET /api/conversations/:jid/messages` → render history
3. WebSocket: new messages stream in, append to view and update sidebar
4. Send: WebSocket message → input clears, typing indicator, response streams back

### Styling

Clean, minimal dark theme. CSS modules or Tailwind. PWA manifest for standalone install.

## Integration Points

### 1. Real-time hook in `db.ts`

Add optional `onMessageStored` callback to `storeMessage`. WebChannel registers it on startup. ~5 lines changed.

### 2. Registration in `src/index.ts`

Same pattern as Slack — create WebChannel and push to `channels[]`. Always enabled (no tokens needed).

### 3. Cross-channel sending

Messages sent to WhatsApp JIDs from the web UI go through `routeOutbound(channels, jid, text)` — existing router finds the WhatsApp channel via `ownsJid` and delivers.

### 4. Build pipeline

- `web/package.json` with Vite + React
- `npm run build:web` in root package.json
- `web/dist/` gitignored, built on demand
- Dev: Vite dev server with proxy to WebChannel API

## Scope Estimate

| Component | Files | Size |
|-----------|-------|------|
| WebChannel backend | `src/channels/web.ts` (new) | ~200 lines |
| DB hook | `src/db.ts` (edit) | ~5 lines |
| Index registration | `src/index.ts` (edit) | ~10 lines |
| React frontend | `web/` (new directory) | ~500 lines |
| Build config | `web/package.json`, `web/vite.config.ts` | Config only |
