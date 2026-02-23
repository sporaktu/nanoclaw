# Chat UI Improvements Design

**Date**: 2025-02-18
**Status**: Approved

## Context

The standalone web app (`nanoclaw-web-app` repo) duplicates NanoClaw's built-in web channel but has broken IPC — messages never reach the agent. NanoClaw's built-in web channel (`src/channels/web.ts`, port 3420) already works correctly with full message routing, typing indicators, and agent invocation.

**Decision**: Drop the standalone app. Use NanoClaw's built-in web channel exclusively.

## Changes

### 1. Typing Indicator

NanoClaw already calls `setTyping(jid, true)` on the web channel when a container is processing, and the frontend `ChatPanel` already renders `{typing && <div>Thinking...</div>}`. The missing piece is in `ChatsTab.tsx` — `typingJids` state is declared but never populated from WebSocket events.

**Fix**: In `ChatsTab.tsx` (or `App.tsx`), handle `{ type: 'typing', jid, value }` WebSocket messages and update `typingJids` state accordingly.

### 2. Message Status (sent/delivered)

Add visual status indicators to messages:
- **Sending** (clock icon): message sent over WebSocket, no server echo yet
- **Sent** (single check): server stored the message in DB
- **Delivered** (double check): NanoClaw picked up the message (agent container started)

**Implementation**:
- Frontend: optimistic message insert with `status: 'sending'`
- Server: broadcast `{ type: 'messageAck', id }` after storing
- Server: broadcast `{ type: 'messageDelivered', jid }` when container starts for that group
- `MessageBubble` renders status icon for user messages

### 3. Timestamp Grouping

Group messages by date with dividers: "Today", "Yesterday", or formatted date.

**Implementation**: Pure frontend — in `ChatPanel`, compute date groups from messages array and render `<div className="date-divider">` between groups.

### 4. Unread Count Badges

Track which messages the user has seen and show unread counts on sidebar items.

**Implementation**:
- Track `lastReadTimestamp` per conversation in localStorage
- Count messages after that timestamp
- Update `lastReadTimestamp` when a conversation is selected
- Render badge in `Sidebar` conversation items

### 5. Graceful WebSocket Reconnect

Replace the current `window.location.reload()` on disconnect with automatic reconnect that preserves UI state.

**Implementation**: In `useWebSocket`, on close, attempt reconnect with exponential backoff instead of reloading. Re-fetch conversation list on reconnect.

## Files to Modify

| File | Changes |
|------|---------|
| `web/src/App.tsx` | Handle `typing`, `messageAck`, `messageDelivered` WS events |
| `web/src/components/ChatsTab.tsx` | Wire typing state from WS events |
| `web/src/components/ChatPanel.tsx` | Add date dividers between message groups |
| `web/src/components/ChatPanel.css` | Styles for date dividers |
| `web/src/components/MessageBubble.tsx` | Add status icon (sending/sent/delivered) |
| `web/src/components/MessageBubble.css` | Status icon styles |
| `web/src/components/Sidebar.tsx` | Render unread count badges |
| `web/src/components/Sidebar.css` | Badge styles |
| `web/src/hooks/useWebSocket.ts` | Graceful reconnect instead of reload |
| `web/src/hooks/useMessages.ts` | Optimistic insert with 'sending' status |
| `web/src/hooks/useUnread.ts` | NEW: track last-read per conversation |
| `web/src/types.ts` | Add message status types, WS event types |
| `src/channels/web.ts` | Add `messageAck` broadcast, `messageDelivered` on container start |

## Non-Goals

- No changes to the standalone `nanoclaw-web-app` repo (deprecated)
- No changes to the agent container or skills
- No changes to WhatsApp/Terminal/Slack channels
