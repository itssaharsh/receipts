import { NextResponse } from 'next/server';
import { getDeps } from '@/lib/deps';
import { deleteAllTasks, startNewRun } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** POST /api/demo/reset -> {runId}: clears the ledger and starts a new run (Alt+Shift+R or ?reset=1). Local, single user. */
export async function POST() {
  const { db } = getDeps();
  deleteAllTasks(db);
  const runId = startNewRun(db);
  return NextResponse.json({ ok: true, runId });
}
