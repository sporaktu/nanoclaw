# NanoClaw Web Dashboard Design

## Overview

Enhance the existing web UI from a simple chat viewer into a full dashboard inspired by OpenClaw's Control UI and Claude Desktop's chat management. Tab-based navigation with 4 top-level views: Chats, Tasks, Skills, System.

## Layout

Top navigation bar with tab buttons. Content area below fills the viewport. Dark theme consistent with current UI (GitHub-like color scheme). No external UI framework — pure CSS.

```
┌──────────────────────────────────────────────────┐
│  NanoClaw    [Chats] [Tasks] [Skills] [System]   │
├──────────────────────────────────────────────────┤
│                                                    │
│              Tab-specific content                  │
│                                                    │
└──────────────────────────────────────────────────┘
```

## Tab 1: Chats (Claude Desktop-inspired)

### Layout
Two-panel: chat list (left, ~280px) + chat view (right, fill).

### Chat List (Left Panel)
- "New Chat" button at top
- Search/filter input
- Channel filter chips: All | WhatsApp | Slack | Web | Terminal
- Chat items: name, channel badge, last activity time, preview text
- Active/archived toggle (default: active)
- Right-click or kebab menu per chat: Rename, Archive, Delete

### Chat View (Right Panel)
- Header: chat name (editable on click), channel badge, group info
- Message list: current MessageBubble component with markdown rendering
- "Load older messages" pagination button
- Message input at bottom (current MessageInput component)
- Typing indicator

### Chat Management
- **Create**: "New Chat" button generates a new `{slug}@web` JID, lightweight thread
- **Rename**: Inline edit on chat name, persists to `chats.display_name`
- **Archive**: Soft-delete, sets `chats.archived = 1`, hidden from default view
- **Delete**: Hard-delete messages + chat metadata (with confirmation)

### Data Model Changes
```sql
ALTER TABLE chats ADD COLUMN display_name TEXT;
ALTER TABLE chats ADD COLUMN archived INTEGER DEFAULT 0;
```

## Tab 2: Tasks (OpenClaw Cron-inspired)

### Layout
Two-panel: task list (left) + task detail/form (right).

### Task List
- "New Task" button
- Filter by status: All | Active | Paused | Completed
- Filter by group
- Each item: task prompt preview, schedule badge (cron/interval/once), status indicator, next run time

### Task Detail Panel
- Full prompt text
- Schedule: type + value (human-readable for cron)
- Group assignment
- Context mode (isolated/group)
- Last run: time, duration, result preview
- Action buttons: Pause/Resume, Run Now, Edit, Cancel

### Task Create/Edit Form
- Prompt (textarea)
- Schedule type (radio: cron/interval/once)
- Schedule value (text input with help text)
- Target group (dropdown of registered groups)
- Target chat JID (dropdown)
- Context mode (radio: isolated/group)

### Run History (below detail)
- Table: run time, duration, status (success/error), result preview
- Click to expand full result text

### API Endpoints
```
GET    /api/tasks                    - List all tasks
GET    /api/tasks/:id                - Get task detail
POST   /api/tasks                    - Create task
PATCH  /api/tasks/:id                - Update task
DELETE /api/tasks/:id                - Delete task
POST   /api/tasks/:id/run            - Trigger immediate run
GET    /api/tasks/:id/runs           - Get run history
```

## Tab 3: Skills

### Layout
Single-panel list with expandable detail.

### Skill List
- Each skill: name, description (first line of SKILL.md)
- Click to expand: full SKILL.md content rendered as markdown
- File listing within the skill directory
- Read-only — skills are managed on disk

### API Endpoints
```
GET    /api/skills                   - List all skills with metadata
GET    /api/skills/:name             - Get skill detail + file listing
```

## Tab 4: System

### Layout
Dashboard cards + expandable sections.

### Registered Groups Card
- Table: name, folder, channel, trigger pattern, requires trigger, container config
- Click to expand: mount configuration, session ID

### Status Card
- Active containers: count + names
- Queue: pending messages/tasks per group
- Uptime, message loop status

### Sessions Card
- Table: group folder → session ID
- Last activity per session

### API Endpoints
```
GET    /api/system/groups            - Registered groups with config
GET    /api/system/status            - Active containers, queue, uptime
GET    /api/system/sessions          - Session IDs per group
```

## WebSocket Events (New)

```typescript
// Server → Client
{ type: 'taskUpdate', task: ScheduledTask }     // Task status change
{ type: 'taskRun', run: TaskRunLog }            // Task execution completed
{ type: 'chatUpdate', chat: ChatMetadata }      // Chat renamed/archived
```

## Frontend Architecture

### New Files
```
web/src/
├── components/
│   ├── NavBar.tsx           - Top tab navigation
│   ├── ChatsTab.tsx         - Chat list + view (refactored from App.tsx)
│   ├── TasksTab.tsx         - Task management
│   ├── TaskForm.tsx         - Create/edit task form
│   ├── SkillsTab.tsx        - Skills list
│   ├── SystemTab.tsx        - System dashboard
│   └── StatusCard.tsx       - Reusable status display card
├── hooks/
│   ├── useTasks.ts          - Task CRUD operations
│   ├── useSkills.ts         - Skills data fetching
│   └── useSystem.ts         - System status polling
└── types.ts                 - Extended with Task, Skill, System types
```

### Routing
Simple state-based tab switching (no react-router needed). URL hash for tab persistence: `#chats`, `#tasks`, `#skills`, `#system`.

## Excluded (YAGNI)
- Config JSON editor
- Skill installation/management from UI
- Container log streaming
- Group registration from web UI
- Authentication/multi-user
