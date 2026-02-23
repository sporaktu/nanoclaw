---
name: web-dashboard
description: Manage the NanoClaw web dashboard — start/stop the server, check health, make code changes, and restart on updates. Use on startup, during heartbeats, and when the user requests dashboard features.
allowed-tools: Bash(web-dashboard:*)
---

# Web Dashboard Management

The NanoClaw web dashboard is a standalone Express + React app that provides a browser UI for managing chats, tasks, skills, and system status.

- **Repo**: `git@github.com:sporaktu/nanoclaw-web-app.git`
- **Local clone**: `/workspace/project/nanoclaw-web-app`
- **Port**: 3421
- **Stack**: Express + better-sqlite3 backend, React 19 + Vite frontend
- **Data**: Reads NanoClaw's SQLite DB at `/workspace/project/store/messages.db`

## Startup

On every agent startup (including heartbeats), ensure the dashboard is running:

```bash
# Clone if not present
if [ ! -d /workspace/project/nanoclaw-web-app ]; then
  git clone git@github.com:sporaktu/nanoclaw-web-app.git /workspace/project/nanoclaw-web-app
fi

# Pull latest
cd /workspace/project/nanoclaw-web-app && git pull --ff-only

# Install deps if needed
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  npm install
fi

# Build frontend if needed
if [ ! -d web/dist ] || [ "$(find web/src -newer web/dist -print -quit)" ]; then
  cd web && npm run build && cd ..
fi

# Build server if needed
if [ ! -d dist ] || [ "$(find server -name '*.ts' -newer dist -print -quit)" ]; then
  npx tsc
fi

# Start if not running
if ! curl -sf http://localhost:3421/api/system/status > /dev/null 2>&1; then
  cd /workspace/project/nanoclaw-web-app
  NANOCLAW_DB_PATH=/workspace/project/store/messages.db \
  NANOCLAW_SKILLS_PATH=/workspace/project/container/skills \
  NANOCLAW_GROUPS_PATH=/workspace/project/groups \
  NANOCLAW_DATA_PATH=/workspace/project/data \
  PORT=3421 \
  nohup node dist/server/index.js > /tmp/dashboard.log 2>&1 &
  sleep 2
fi
```

## Health Check

Run this during every heartbeat to verify the dashboard is alive:

```bash
# Quick health check
STATUS=$(curl -sf http://localhost:3421/api/system/status)
if [ $? -ne 0 ]; then
  echo "Dashboard is DOWN — restarting..."
  # Kill stale process if any
  pkill -f "node dist/server/index.js" 2>/dev/null
  sleep 1
  # Restart (use startup sequence above)
fi
```

If the health check fails twice in a row, check `/tmp/dashboard.log` for errors and report the issue to the user.

## Making Code Changes

When the user requests a new feature or you identify an improvement:

1. **Pull latest** before making changes:
   ```bash
   cd /workspace/project/nanoclaw-web-app && git pull --ff-only
   ```

2. **Edit files** directly in `/workspace/project/nanoclaw-web-app/`
   - Frontend components: `web/src/components/`
   - Frontend hooks: `web/src/hooks/`
   - Frontend types: `web/src/types.ts`
   - Backend routes: `server/routes/`
   - Backend DB layer: `server/db.ts`
   - Backend config: `server/config.ts`
   - Backend entry: `server/index.ts`

3. **Rebuild and restart** after changes:
   ```bash
   cd /workspace/project/nanoclaw-web-app

   # Rebuild frontend (if frontend files changed)
   cd web && npm run build && cd ..

   # Rebuild server (if server files changed)
   npx tsc

   # Restart the server
   pkill -f "node dist/server/index.js" 2>/dev/null
   sleep 1
   NANOCLAW_DB_PATH=/workspace/project/store/messages.db \
   NANOCLAW_SKILLS_PATH=/workspace/project/container/skills \
   NANOCLAW_GROUPS_PATH=/workspace/project/groups \
   NANOCLAW_DATA_PATH=/workspace/project/data \
   PORT=3421 \
   nohup node dist/server/index.js > /tmp/dashboard.log 2>&1 &
   sleep 2

   # Verify it came back up
   curl -sf http://localhost:3421/api/system/status || echo "FAILED TO RESTART"
   ```

4. **Commit and push** the changes:
   ```bash
   cd /workspace/project/nanoclaw-web-app
   git add -A
   git commit -m "description of changes"
   git push origin main
   ```

5. **Verify in browser** using `agent-browser`:
   ```bash
   agent-browser open http://localhost:3421
   agent-browser snapshot -i
   ```

## Inferring Features

When you notice patterns that suggest a useful dashboard improvement, proactively implement it. Examples:

- User frequently asks about task status → add better task status indicators
- User creates many chats → add bulk operations or search
- User mentions wanting to see something → check if the dashboard could show it
- Error patterns in logs → add an error log viewer

Always tell the user what you're adding and why before making changes. If unsure, ask first.

## Architecture Notes

- The dashboard reads NanoClaw's SQLite DB directly (not through NanoClaw's API)
- WebSocket on the same port provides real-time updates via DB polling every 2 seconds
- Frontend uses hash-based routing: `#chats`, `#tasks`, `#skills`, `#system`
- Pure CSS with CSS variables for theming (dark theme, GitHub-like)
- No UI framework — vanilla React components

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Port 3421 in use | `lsof -ti:3421 \| xargs kill` then restart |
| DB locked errors | Check if another process holds the lock; the dashboard opens in WAL mode |
| Frontend build fails | Check `web/src/` for TypeScript errors: `cd web && npx tsc --noEmit` |
| Blank page | Check if `web/dist/` exists; rebuild frontend |
| API 500s | Check `/tmp/dashboard.log` for stack traces |
