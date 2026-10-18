import { type NextRequest } from 'next/server';
import { getDeps } from '@/lib/deps';
import { currentRunId } from '@/lib/store';
import { eventsForRun, exportRun } from '@/lib/trace';

export const dynamic = 'force-dynamic';

/** GET /api/trace/export?run=<id> -> the run's trace as a JSONL download (form item F). Tokens were redacted at write time. */
export async function GET(req: NextRequest) {
  const { db } = getDeps();
  const requested = req.nextUrl.searchParams.get('run');
  const runId = requested && /^[\w.-]{1,80}$/.test(requested) ? requested : currentRunId(db);
  if (eventsForRun(db, runId).length === 0) {
    return new Response(JSON.stringify({ error: `Run ${runId} has no events to export.` }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
  const body = exportRun(db, runId);
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'content-disposition': `attachment; filename="trace-${runId}.jsonl"`,
      'cache-control': 'no-store',
    },
  });
}
