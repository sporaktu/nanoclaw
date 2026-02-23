# Web Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the existing chat-only web UI into a tabbed dashboard with Chats, Tasks, Skills, and System views — inspired by OpenClaw's Control UI and Claude Desktop's chat management.

**Architecture:** Tab-based SPA using hash routing (#chats, #tasks, #skills, #system). Backend adds REST endpoints on the existing Express server in src/channels/web.ts. Frontend extends the existing React 19 + Vite app. No new dependencies — pure CSS, no UI framework.

**Tech Stack:** React 19, TypeScript, Vite, Express, better-sqlite3, WebSocket

---

## Task 1: Database migrations for chat management

**Files:**
- Modify: `src/db.ts:16-105` (createSchema function + add new query functions)

**Step 1: Add display_name and archived columns**

Add after the existing is_bot_message migration (after line 104):

```typescript
  try {
    database.exec(`ALTER TABLE chats ADD COLUMN display_name TEXT`);
  } catch { /* column already exists */ }
  try {
    database.exec(`ALTER TABLE chats ADD COLUMN archived INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }
```

**Step 2: Add chat management + task run log query functions**

Add after getMessagesForChat (after line 311):

```typescript
export function renameChat(jid: string, displayName: string): void {
  db.prepare('UPDATE chats SET display_name = ? WHERE jid = ?').run(displayName, jid);
}

export function archiveChat(jid: string): void {
  db.prepare('UPDATE chats SET archived = 1 WHERE jid = ?').run(jid);
}

export function unarchiveChat(jid: string): void {
  db.prepare('UPDATE chats SET archived = 0 WHERE jid = ?').run(jid);
}

export function deleteChat(jid: string): void {
  db.prepare('DELETE FROM messages WHERE chat_jid = ?').run(jid);
  db.prepare('DELETE FROM chats WHERE jid = ?').run(jid);
}

export function getTaskRunLogs(taskId: string, limit = 20): TaskRunLog[] {
  return db
    .prepare('SELECT * FROM task_run_logs WHERE task_id = ? ORDER BY run_at DESC LIMIT ?')
    .all(taskId, limit) as TaskRunLog[];
}
```

**Step 3: Update ChatInfo interface and getAllChats**

```typescript
export interface ChatInfo {
  jid: string;
  name: string;
  display_name: string | null;
  last_message_time: string;
  archived: number;
}

// Update getAllChats SELECT to include display_name, archived
```

**Step 4: Build and commit**

```
npm run build
git add src/db.ts
git commit -m "feat(db): add chat management columns and task run log queries"
```

---

## Task 2: Backend REST API endpoints

**Files:**
- Modify: `src/channels/web.ts`

**Step 1: Add imports**

Add to existing imports: renameChat, archiveChat, unarchiveChat, deleteChat, getAllTasks, getTaskById, createTask, updateTask, deleteTask, getTaskRunLogs, getAllSessions from db.js. Add CronExpressionParser, TIMEZONE, GROUPS_DIR, crypto, fs.

**Step 2: Extend WebChannelOpts**

Add to interface:
```typescript
getSessions?: () => Record<string, string>;
getQueueStatus?: () => { activeContainers: number; groups: Record<string, { pending: boolean }> };
```

**Step 3: Add endpoints after line 72 (before static file serving)**

Chat management:
- `POST /api/chats` — create new web chat (generates slug@web JID, auto-registers)
- `PATCH /api/chats/:jid` — rename (display_name) or archive/unarchive
- `DELETE /api/chats/:jid` — hard delete chat + messages

Task CRUD:
- `GET /api/tasks` — list all tasks
- `GET /api/tasks/:id` — single task
- `POST /api/tasks` — create task (validates fields, computes next_run, broadcasts taskUpdate)
- `PATCH /api/tasks/:id` — update task fields
- `DELETE /api/tasks/:id` — delete task
- `GET /api/tasks/:id/runs` — run history

Skills (read-only):
- `GET /api/skills` — list skills from container/skills/ (name + first non-header line of SKILL.md)
- `GET /api/skills/:name` — skill detail (full SKILL.md content + file listing)

System:
- `GET /api/system/groups` — registered groups with config
- `GET /api/system/sessions` — session IDs per group
- `GET /api/system/status` — active containers, queue status, uptime, connected clients

**Step 4: Update /api/conversations to include display_name, archived, filter param**

**Step 5: Build and commit**

```
npm run build
git add src/channels/web.ts
git commit -m "feat(api): add REST endpoints for chats, tasks, skills, system"
```

---

## Task 3: Frontend types and hooks

**Files:**
- Modify: `web/src/types.ts`
- Create: `web/src/hooks/useTasks.ts`
- Create: `web/src/hooks/useSkills.ts`
- Create: `web/src/hooks/useSystem.ts`

**Step 1: Extend types.ts**

Add: ScheduledTask, TaskRunLog, Skill, SkillDetail, SystemStatus, RegisteredGroupInfo interfaces. Extend WsMessage with taskUpdate/taskRun/chatUpdate types. Add archived field to Conversation.

**Step 2: Create useTasks hook**

CRUD operations: fetch all, create, update, delete, getRunLogs. Each operation calls the REST API and refreshes the list.

**Step 3: Create useSkills hook**

Fetch skill list on mount. getDetail(name) fetches individual skill.

**Step 4: Create useSystem hook**

Parallel fetch of /api/system/status, /api/system/groups, /api/system/sessions. Auto-refresh every 10 seconds.

**Step 5: Verify types compile and commit**

```
cd web && npx tsc --noEmit
git add web/src/types.ts web/src/hooks/
git commit -m "feat(web): add types and hooks for tasks, skills, system"
```

---

## Task 4: NavBar and tab routing

**Files:**
- Create: `web/src/components/NavBar.tsx` + `NavBar.css`
- Modify: `web/src/App.tsx` + `web/src/App.css`

**Step 1: Create NavBar**

Brand name, 4 tab buttons (Chats/Tasks/Skills/System), connection status indicator. Active tab highlighted with accent color.

**Step 2: Rewrite App.tsx**

Hash-based tab routing. getInitialTab() reads window.location.hash. Tab switch updates hash. hashchange listener for browser back/forward. Renders the active tab component. Passes WebSocket refs down to ChatsTab and TasksTab for real-time updates.

**Step 3: Update App.css**

Change .app from flex row to flex column (navbar on top, content below). Add --bg-tertiary, --danger, --success, --warning CSS vars.

**Step 4: Commit**

```
git add web/src/components/NavBar.tsx web/src/components/NavBar.css web/src/App.tsx web/src/App.css
git commit -m "feat(web): add NavBar with tab routing"
```

---

## Task 5: ChatsTab (refactored from current App + Sidebar)

**Files:**
- Create: `web/src/components/ChatsTab.tsx` + `ChatsTab.css`
- Modify: `web/src/components/Sidebar.tsx` + `Sidebar.css`
- Modify: `web/src/hooks/useConversations.ts`

**Step 1: Update useConversations**

Add: showArchived state, createChat, renameChat, archiveChat, deleteChat methods. Pass ?archived= query param.

**Step 2: Enhance Sidebar**

- New Chat button at top
- Channel filter chips (All/WA/SL/WB/TM)
- Kebab menu per chat item (Rename/Archive/Delete)
- Inline rename input on edit
- Archive toggle in footer
- Context menu with absolute positioning

**Step 3: Create ChatsTab**

Wraps Sidebar + ChatPanel (same two-panel layout as before). Owns selectedJid state. Wires up all chat management callbacks. Exposes refresh to parent via ref callback for WebSocket updates.

**Step 4: Commit**

```
git add web/src/components/ChatsTab.tsx web/src/components/ChatsTab.css web/src/components/Sidebar.tsx web/src/components/Sidebar.css web/src/hooks/useConversations.ts
git commit -m "feat(web): add ChatsTab with new chat, rename, archive, delete"
```

---

## Task 6: TasksTab with CRUD

**Files:**
- Create: `web/src/components/TasksTab.tsx` + `TasksTab.css`
- Create: `web/src/components/TaskForm.tsx`

**Step 1: Create TaskForm**

Form fields: prompt (textarea), schedule_type (select: cron/interval/once), schedule_value (input), group (select from registered groups), context_mode (select: isolated/group). Submit/Cancel buttons.

**Step 2: Create TasksTab**

Two-panel: task list (left 360px) + detail/form (right fill).
- Task list: filter chips (all/active/paused/completed), task items with status dot + prompt preview + schedule meta
- Detail panel: full prompt, schedule info, status, context mode, group, next/last run, last result, pause/resume + delete buttons, run history table
- New Task button switches right panel to TaskForm
- WebSocket taskUpdate events trigger refresh

**Step 3: Commit**

```
git add web/src/components/TasksTab.tsx web/src/components/TasksTab.css web/src/components/TaskForm.tsx
git commit -m "feat(web): add TasksTab with full CRUD and run history"
```

---

## Task 7: SkillsTab

**Files:**
- Create: `web/src/components/SkillsTab.tsx` + `SkillsTab.css`

**Step 1: Create SkillsTab**

Two-panel: skill list (left 300px) + detail (right fill).
- List: skill name + description preview
- Detail: skill name header, file listing, full SKILL.md content in pre block
- Read-only

**Step 2: Commit**

```
git add web/src/components/SkillsTab.tsx web/src/components/SkillsTab.css
git commit -m "feat(web): add SkillsTab with skill list and detail view"
```

---

## Task 8: SystemTab

**Files:**
- Create: `web/src/components/SystemTab.tsx` + `SystemTab.css`

**Step 1: Create SystemTab**

Dashboard cards layout:
- Status card: active containers, web clients, uptime (stat grid with big numbers)
- Registered Groups card: table with name, folder, trigger, channel columns
- Sessions card: table with group folder, session ID (truncated)
- Auto-refreshes every 10s via useSystem hook

**Step 2: Commit**

```
git add web/src/components/SystemTab.tsx web/src/components/SystemTab.css
git commit -m "feat(web): add SystemTab with status, groups, and sessions"
```

---

## Task 9: Wire system status from orchestrator

**Files:**
- Modify: `src/index.ts` (WebChannel construction)
- Modify: `src/group-queue.ts` (add getter methods)

**Step 1: Add getActiveCount() and getGroupStates() to GroupQueue**

**Step 2: Pass getSessions and getQueueStatus to WebChannel opts in index.ts**

**Step 3: Build and commit**

```
npm run build
git add src/index.ts src/group-queue.ts
git commit -m "feat: wire system status through WebChannel to frontend"
```

---

## Task 10: Build and smoke test

**Step 1:** `npm run build:web` — Vite compiles frontend
**Step 2:** `npm run build` — TypeScript compiles backend
**Step 3:** `npm run dev` — Manual smoke test all 4 tabs
**Step 4:** Final commit with any fixes

```
git add -A
git commit -m "feat(web): complete dashboard with chats, tasks, skills, system tabs"
```
