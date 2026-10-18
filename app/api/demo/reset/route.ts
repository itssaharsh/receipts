import { NextResponse } from 'next/server';
import { getDeps } from '@/lib/deps';
import { resetLedger, startNewRun } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** POST /api/demo/reset -> {runId}: clears the ledger, restores the default rules and starts a new run (Alt+Shift+R). Local, single user. */
export async function POST() {
  const { db } = getDeps();
  resetLedger(db);
  const runId = startNewRun(db);
  return NextResponse.json({ ok: true, runId });
}
