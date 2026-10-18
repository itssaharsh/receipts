import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';
import { listTasks } from './store';
import { eventsForRun } from './trace';
import type { Task, TraceEvent } from './types';

/** A recorded real run, saved so the ledger can replay it when Fo or the network is down during a demo. */
export interface ReplaySnapshot {
  runId: string;
  savedAt: string;
  tasks: Task[];
  events: TraceEvent[];
}

export function replayPath(): string {
  return process.env.REPLAY_PATH ?? path.join(process.cwd(), 'data', 'replay-run.json');
}

export function snapshotRun(db: Db, runId: string, file: string = replayPath()): ReplaySnapshot {
  const tasks = listTasks(db, runId);
  if (tasks.length === 0) throw new Error(`Run ${runId} has no tasks to snapshot.`);
  const snap: ReplaySnapshot = { runId, savedAt: new Date().toISOString(), tasks, events: eventsForRun(db, runId) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(snap, null, 2));
  return snap;
}

export function loadReplay(file: string = replayPath()): ReplaySnapshot | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as ReplaySnapshot;
  } catch {
    return null;
  }
}
