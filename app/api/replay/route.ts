import { NextResponse, type NextRequest } from 'next/server';
import { getDeps } from '@/lib/deps';
import { loadReplay, snapshotRun } from '@/lib/replay';
import { currentRunId } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** GET /api/replay -> the saved real run (tasks and events), or 404 when none has been recorded yet. */
export async function GET() {
  const snap = loadReplay();
  if (!snap) return NextResponse.json({ error: 'No recorded run to replay yet.' }, { status: 404 });
  return NextResponse.json(snap);
}

/** POST /api/replay?run=<id> -> saves that run (the current one by default) as the replay. */
export async function POST(req: NextRequest) {
  const { db } = getDeps();
  const runId = req.nextUrl.searchParams.get('run') ?? currentRunId(db);
  try {
    const snap = snapshotRun(db, runId);
    return NextResponse.json({ runId: snap.runId, savedAt: snap.savedAt, tasks: snap.tasks.length, events: snap.events.length }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}
