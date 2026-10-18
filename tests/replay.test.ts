import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, type Db } from '@/lib/db';
import { loadReplay, snapshotRun } from '@/lib/replay';
import { insertTask } from '@/lib/store';
import { fixtureTasks } from '@/lib/fixtures';
import { writeEvent } from '@/lib/trace';

describe('replay snapshot of a recorded run (T06)', () => {
  let db: Db;
  let dir: string;
  beforeEach(() => {
    db = openDb(':memory:');
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-replay-'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes a run\'s tasks and events to a file and reads them back with the saved time', () => {
    const t = { ...fixtureTasks('verified')[0], runId: 'run-real-1', id: 'task-real-1', simulated: false };
    insertTask(db, t);
    writeEvent(db, { runId: 'run-real-1', taskId: 'task-real-1', kind: 'ask_fo', summary: 'ask_fo', payload: {} });
    writeEvent(db, { runId: 'run-real-1', taskId: 'task-real-1', kind: 'check', summary: 'check', payload: {} });
    const file = path.join(dir, 'replay-run.json');
    const snap = snapshotRun(db, 'run-real-1', file);
    expect(snap.runId).toBe('run-real-1');
    expect(snap.tasks).toHaveLength(1);
    expect(snap.events).toHaveLength(2);
    expect(fs.existsSync(file)).toBe(true);
    const loaded = loadReplay(file);
    expect(loaded?.savedAt).toMatch(/^\d{4}-/);
    expect(loaded?.tasks[0].id).toBe('task-real-1');
    expect(loaded?.events.map((e) => e.kind)).toEqual(['ask_fo', 'check']);
  });

  it('refuses to snapshot a run with no tasks and returns null when no file exists', () => {
    expect(() => snapshotRun(db, 'run-empty', path.join(dir, 'x.json'))).toThrow(/no tasks/);
    expect(loadReplay(path.join(dir, 'missing.json'))).toBeNull();
  });
});
