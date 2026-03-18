/**
 * Audit Logger for NanoClaw
 *
 * Writes structured audit entries to three sinks:
 *   1. ~/.config/nanoclaw/audit.jsonl  — append-only JSONL file (never in a container mount)
 *   2. pino logger at 'info' level     — captured by stdout/systemd
 *   3. SQLite audit_log table          — queryable by dashboard / CLI
 *
 * Security guarantees:
 *   - Message content is truncated to CONTENT_PREVIEW_LEN chars before logging
 *   - The JSONL file path is outside the project root (never accessible to agents)
 *   - insertAuditLog is wrapped in try/catch so pre-init calls fail silently
 */
import fs from 'fs';
import path from 'path';

import { AUDIT_LOG_PATH } from './config.js';
import { insertAuditLog } from './db.js';
import { logger } from './logger.js';
import {
  AuditEntry,
  AuditEventType,
  AuditQueryFilters,
  AUDIT_EVENT_TYPES,
} from './types.js';

// Re-export so callers can import everything from audit.ts
export type { AuditEntry, AuditEventType, AuditQueryFilters };
export { AUDIT_EVENT_TYPES };

export const CONTENT_PREVIEW_LEN = 100;

// Module-level path — overridable in tests via _setAuditLogPath
let auditLogPath: string = AUDIT_LOG_PATH;
let dirEnsured = false;

/** @internal - for tests only. */
export function _setAuditLogPath(p: string): void {
  auditLogPath = p;
  dirEnsured = false;
}

/** @internal - for tests only. Resets path to production default. */
export function _resetAuditLogPath(): void {
  auditLogPath = AUDIT_LOG_PATH;
  dirEnsured = false;
}

function ensureDir(): void {
  if (dirEnsured) return;
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true });
  dirEnsured = true;
}

/**
 * Truncate a string to the first n characters for privacy.
 * Used to log message previews without full content.
 */
export function truncateContent(s: string, n = CONTENT_PREVIEW_LEN): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/**
 * Write an audit event to all configured sinks.
 * Never throws — failures are swallowed with a warning.
 */
export function audit(entry: Omit<AuditEntry, 'timestamp'>): void {
  const full: AuditEntry = { timestamp: new Date().toISOString(), ...entry };

  // 1. Append to JSONL file (source of truth, always outside container mounts)
  try {
    ensureDir();
    fs.appendFileSync(auditLogPath, JSON.stringify(full) + '\n');
  } catch (err) {
    logger.warn({ err }, 'audit: failed to write to JSONL file');
  }

  // 2. Emit via pino so it appears in structured logs / systemd journal
  logger.info({ audit: full }, `AUDIT ${full.event_type}`);

  // 3. Insert into SQLite for dashboard queries (may fail before DB init)
  try {
    insertAuditLog(full);
  } catch {
    // Silently ignore — DB may not be initialized yet (early startup calls)
  }
}

/**
 * Query audit entries from the JSONL file directly.
 * Useful in tests and for offline inspection. Prefer queryAuditLogs() (DB)
 * for production queries — it is much faster on large logs.
 */
export function queryAuditLogFile(
  filters: AuditQueryFilters = {},
  logPath?: string,
): AuditEntry[] {
  const filePath = logPath ?? auditLogPath;
  if (!fs.existsSync(filePath)) return [];

  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  const entries: AuditEntry[] = [];

  for (const line of lines) {
    let entry: AuditEntry;
    try {
      entry = JSON.parse(line) as AuditEntry;
    } catch {
      continue;
    }

    if (filters.event_type && entry.event_type !== filters.event_type) continue;
    if (filters.group_folder && entry.group_folder !== filters.group_folder)
      continue;
    if (filters.from && entry.timestamp < filters.from) continue;
    if (filters.to && entry.timestamp > filters.to) continue;

    entries.push(entry);
  }

  return filters.limit ? entries.slice(-filters.limit) : entries;
}
