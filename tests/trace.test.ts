import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { openDb, type Db } from '@/lib/db';
import { exportRun, redact, writeEvent } from '@/lib/trace';

const tracePath = process.env.TRACE_PATH as string;

describe('trace writer (T01 acceptance)', () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(':memory:');
    fs.rmSync(tracePath, { force: true });
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tracePath, { force: true });
  });

  it('appends an event to SQLite and to the JSONL file with a timestamp', () => {
    const ev = writeEvent(db, {
      runId: 'run-1',
      taskId: 't1',
      kind: 'ask_fo',
      summary: 'ask_fo "Book my dentist check-up"',
      payload: { conversationId: 'conv-8f3', text: 'Book my dentist check-up' },
    });
    expect(ev.id).toBeTruthy();
    expect(ev.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const rows = db.prepare('select * from trace_events where task_id = ?').all('t1') as Array<{ kind: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('ask_fo');
    const lines = fs.readFileSync(tracePath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ runId: 'run-1', taskId: 't1', kind: 'ask_fo' });
  });

  it('redacts token-like strings before writing', () => {
    const payload = {
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      access_token: 'ya29.a0AfH6SMBx-1234567890abcdefghijklmnopqrstuvwxyz',
      refresh_token: '1//0gabcdefghijklmnopqrstuvwxyz0123456789',
      note: 'kept',
      nested: { client_secret: 'GOCSPX-abcdefghijklmnopqrstuvwxyz', fine: 'still here' },
    };
    const r = redact(payload) as Record<string, unknown>;
    expect(r.authorization).toBe('[redacted]');
    expect(r.access_token).toBe('[redacted]');
    expect(r.refresh_token).toBe('[redacted]');
    expect(r.note).toBe('kept');
    expect((r.nested as Record<string, unknown>).client_secret).toBe('[redacted]');
    expect((r.nested as Record<string, unknown>).fine).toBe('still here');
    const ev = writeEvent(db, { runId: 'run-2', taskId: 't2', kind: 'error', summary: 'auth failed', payload });
    expect(JSON.stringify(ev.payload)).not.toContain('ya29.');
    expect(fs.readFileSync(tracePath, 'utf8')).not.toContain('GOCSPX-');
  });

  it('exports one run as JSONL in time order and leaves other runs out', () => {
    writeEvent(db, { runId: 'run-3', taskId: 't3', kind: 'decision', summary: 'allowed by R1', payload: {} });
    writeEvent(db, { runId: 'run-3', taskId: 't3', kind: 'ask_fo', summary: 'ask_fo', payload: {} });
    writeEvent(db, { runId: 'run-other', taskId: 't9', kind: 'ask_fo', summary: 'other run', payload: {} });
    const out = exportRun(db, 'run-3');
    const lines = out.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.kind)).toEqual(['decision', 'ask_fo']);
    expect(out).not.toContain('other run');
  });
});
