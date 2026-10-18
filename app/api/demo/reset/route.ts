import { NextResponse, type NextRequest } from 'next/server';
import { forbidden, getDeps, sameOrigin } from '@/lib/deps';
import { resetLedger, startNewRun } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** POST /api/demo/reset -> {runId}: clears the ledger, restores the default rules and starts a new run (Alt+Shift+R). Local, single user, same origin only. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  const { db } = getDeps();
  resetLedger(db);
  const runId = startNewRun(db);
  return NextResponse.json({ ok: true, runId });
}
