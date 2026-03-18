import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _resetAuditLogPath,
  _setAuditLogPath,
  audit,
  CONTENT_PREVIEW_LEN,
  queryAuditLogFile,
  truncateContent,
} from './audit.js';
import { _initTestDatabase, queryAuditLogs } from './db.js';

let tmpDir: string;
let tmpLogPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
  tmpLogPath = path.join(tmpDir, 'audit.jsonl');
  _setAuditLogPath(tmpLogPath);
  _initTestDatabase();
});

afterEach(() => {
  _resetAuditLogPath();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('truncateContent', () => {
  it('returns the string unchanged when short enough', () => {
    const short = 'hello world';
    expect(truncateContent(short)).toBe(short);
  });

  it('truncates to CONTENT_PREVIEW_LEN chars and appends ellipsis', () => {
    const long = 'a'.repeat(CONTENT_PREVIEW_LEN + 50);
    const result = truncateContent(long);
    expect(result.length).toBe(CONTENT_PREVIEW_LEN + 1); // 100 chars + '…'
    expect(result.endsWith('…')).toBe(true);
    expect(result.slice(0, CONTENT_PREVIEW_LEN)).toBe('a'.repeat(CONTENT_PREVIEW_LEN));
  });

  it('returns empty string for falsy input', () => {
    expect(truncateContent('')).toBe('');
  });

  it('respects a custom limit', () => {
    const s = 'abcdefgh';
    expect(truncateContent(s, 4)).toBe('abcd…');
  });
});

describe('audit() — log format', () => {
  it('writes a valid JSON line to the JSONL file', () => {
    audit({
      event_type: 'MESSAGE_RECEIVED',
      group_folder: 'family',
      user: '+1234567890',
      action: 'Message received',
      details: { chat_jid: 'jid@g.us', preview: 'hello' },
      success: true,
    });

    const lines = fs.readFileSync(tmpLogPath, 'utf-8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.event_type).toBe('MESSAGE_RECEIVED');
    expect(entry.group_folder).toBe('family');
    expect(entry.user).toBe('+1234567890');
    expect(entry.action).toBe('Message received');
    expect(entry.success).toBe(true);
    expect(typeof entry.timestamp).toBe('string');
    // Timestamp should be a valid ISO date
    expect(() => new Date(entry.timestamp)).not.toThrow();
  });

  it('appends multiple entries (append-only)', () => {
    audit({ event_type: 'CONTAINER_STARTED', action: 'first', success: true });
    audit({ event_type: 'CONTAINER_STOPPED', action: 'second', success: true });

    const lines = fs.readFileSync(tmpLogPath, 'utf-8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);

    const types = lines.map((l) => JSON.parse(l).event_type);
    expect(types).toEqual(['CONTAINER_STARTED', 'CONTAINER_STOPPED']);
  });

  it('also inserts into SQLite audit_log', () => {
    audit({
      event_type: 'TASK_CREATED',
      group_folder: 'work',
      action: 'Task created',
      success: true,
    });

    const rows = queryAuditLogs({ event_type: 'TASK_CREATED' });
    expect(rows).toHaveLength(1);
    expect(rows[0].group_folder).toBe('work');
    expect(rows[0].success).toBe(true);
  });
});

describe('queryAuditLogFile()', () => {
  beforeEach(() => {
    audit({ event_type: 'MESSAGE_RECEIVED', group_folder: 'g1', action: 'a', success: true });
    audit({ event_type: 'MESSAGE_SENT', group_folder: 'g1', action: 'b', success: true });
    audit({ event_type: 'CONTAINER_STARTED', group_folder: 'g2', action: 'c', success: true });
  });

  it('returns all entries when no filters applied', () => {
    const entries = queryAuditLogFile({}, tmpLogPath);
    expect(entries).toHaveLength(3);
  });

  it('filters by event_type', () => {
    const entries = queryAuditLogFile({ event_type: 'MESSAGE_RECEIVED' }, tmpLogPath);
    expect(entries).toHaveLength(1);
    expect(entries[0].event_type).toBe('MESSAGE_RECEIVED');
  });

  it('filters by group_folder', () => {
    const entries = queryAuditLogFile({ group_folder: 'g2' }, tmpLogPath);
    expect(entries).toHaveLength(1);
    expect(entries[0].group_folder).toBe('g2');
  });

  it('respects limit', () => {
    const entries = queryAuditLogFile({ limit: 2 }, tmpLogPath);
    expect(entries).toHaveLength(2);
  });

  it('returns empty array when log file does not exist', () => {
    const entries = queryAuditLogFile({}, path.join(tmpDir, 'nonexistent.jsonl'));
    expect(entries).toEqual([]);
  });

  it('filters by from/to timestamps', () => {
    const all = queryAuditLogFile({}, tmpLogPath);
    const first = all[0].timestamp;
    const entries = queryAuditLogFile({ from: first, to: first }, tmpLogPath);
    // Should include the first entry (inclusive bounds)
    expect(entries.some((e) => e.timestamp === first)).toBe(true);
  });
});

describe('content truncation in audit details', () => {
  it('previews are truncated to CONTENT_PREVIEW_LEN before storing', () => {
    const longMessage = 'x'.repeat(500);
    const preview = truncateContent(longMessage);

    audit({
      event_type: 'MESSAGE_RECEIVED',
      group_folder: 'g1',
      action: 'Message received',
      details: { preview },
      success: true,
    });

    const entries = queryAuditLogFile({}, tmpLogPath);
    const stored = entries[0].details?.preview as string;
    expect(stored.length).toBeLessThanOrEqual(CONTENT_PREVIEW_LEN + 1); // +1 for '…'
    expect(stored.endsWith('…')).toBe(true);
  });
});
