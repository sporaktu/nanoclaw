# ── Stage 1: Build React client ──────────────────────────────────────────────
FROM node:22-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --ignore-scripts
COPY client/ ./
RUN npm run build

# ── Stage 2: Build Node server ────────────────────────────────────────────────
FROM node:22-slim AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --ignore-scripts
COPY server/ ./
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:22-slim AS production

RUN addgroup --system --gid 1001 nanoclaw \
 && adduser --system --uid 1001 --ingroup nanoclaw nanoclaw

WORKDIR /app

# Server runtime dependencies only
COPY server/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled server
COPY --from=server-build /app/server/dist ./dist

# Copy built client into server's public dir.
# Server resolves PUBLIC_DIR as path.join(__dirname, '..', 'public')
# where __dirname = /app/dist → PUBLIC_DIR = /app/public
COPY --from=client-build /app/client/dist ./public

USER nanoclaw

ENV NODE_ENV=production \
    PORT=3030 \
    DB_PATH=/data/messages.db \
    SKILLS_DIR=/skills

EXPOSE 3030

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3030/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
