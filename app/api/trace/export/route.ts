import { type NextRequest } from 'next/server';
import { getDeps } from '@/lib/deps';
import { currentRunId } from '@/lib/store';
import { exportRun } from '@/lib/trace';

export const dynamic = 'force-dynamic';

/** GET /api/trace/export?run=<id> -> the run's trace as a JSONL download (form item F). Tokens were redacted at write time. */
export async function GET(req: NextRequest) {
  const { db } = getDeps();
  const runId = req.nextUrl.searchParams.get('run') ?? currentRunId(db);
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
