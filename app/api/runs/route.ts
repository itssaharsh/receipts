import { NextResponse } from 'next/server';
import { getDeps } from '@/lib/deps';
import { currentRunId, listRunIds, runCount } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** GET /api/runs -> {current: RunCount, runs: RunCount[]} (form item G comes from here). */
export async function GET() {
  const { db } = getDeps();
  const current = currentRunId(db);
  const ids = Array.from(new Set([current, ...listRunIds(db)]));
  return NextResponse.json({ current: runCount(db, current), runs: ids.map((id) => runCount(db, id)) });
}
