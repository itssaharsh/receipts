import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';
import type { TraceEvent, TraceEventInput } from './types';

const SECRET_KEY = /(token|secret|authorization|password|cookie|api[_-]?key|verifier)/i;
const SECRET_VALUE = [
  /^Bearer\s+\S+/i,
  /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/, // a JWT
  /^ya29\./, // Google access tokens
  /^1\/\/0/, // Google refresh tokens
  /^GOCSPX-/, // Google client secrets
];

/** Replace token-like values anywhere in a payload with "[redacted]". Keys that name a secret are redacted whatever they hold. */
export function redact(value: unknown): unknown {
  if (typeof value === 'string') return SECRET_VALUE.some((re) => re.test(value)) ? '[redacted]' : value;
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) && v != null && v !== '' ? '[redacted]' : redact(v);
    }
    return out;
  }
  return value;
}

/** Token-like words inside free text (a summary quoting a reply) are replaced too. */
export function redactText(s: string): string {
  return s
    .replace(/Bearer\s+[\w.~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted]')
    .replace(/ya29\.[\w.-]+/g, '[redacted]')
    .replace(/1\/\/0[\w-]+/g, '[redacted]')
    .replace(/GOCSPX-[\w-]+/g, '[redacted]');
}

export function tracePath(): string {
  return process.env.TRACE_PATH ?? path.join(process.cwd(), 'data', 'trace.jsonl');
}

/** Append one event to SQLite and to the JSONL file. The file is the second copy; a file error never loses the row. */
export function writeEvent(db: Db, input: TraceEventInput): TraceEvent {
  const ev: TraceEvent = {
    id: crypto.randomUUID(),
    runId: input.runId,
    taskId: input.taskId,
    ts: new Date().toISOString(),
    kind: input.kind,
    summary: redactText(input.summary),
    payload: redact(input.payload ?? {}),
  };
  db.prepare(
    'insert into trace_events (id, run_id, task_id, ts, kind, summary, payload) values (?, ?, ?, ?, ?, ?, ?)',
  ).run(ev.id, ev.runId, ev.taskId, ev.ts, ev.kind, ev.summary, JSON.stringify(ev.payload));
  try {
    const file = tracePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(ev) + '\n');
  } catch (err) {
    console.error('trace: JSONL append failed', (err as Error).message);
  }
  return ev;
}

type Row = { id: string; run_id: string; task_id: string | null; ts: string; kind: string; summary: string; payload: string };

function rowToEvent(r: Row): TraceEvent {
  return {
    id: r.id,
    runId: r.run_id,
    taskId: r.task_id,
    ts: r.ts,
    kind: r.kind as TraceEvent['kind'],
    summary: r.summary,
    payload: JSON.parse(r.payload),
  };
}

export function eventsForTask(db: Db, taskId: string): TraceEvent[] {
  const rows = db.prepare('select * from trace_events where task_id = ? order by seq').all(taskId) as Row[];
  return rows.map(rowToEvent);
}

export function eventsForRun(db: Db, runId: string): TraceEvent[] {
  const rows = db.prepare('select * from trace_events where run_id = ? order by seq').all(runId) as Row[];
  return rows.map(rowToEvent);
}

/** One run's events as JSONL, in the order they happened, redacted at write time. */
export function exportRun(db: Db, runId: string): string {
  return eventsForRun(db, runId)
    .map((e) => JSON.stringify(e))
    .join('\n') + '\n';
}
