import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { getFo, resetFo } from '@/lib/fo/client';
import { writeEvent } from '@/lib/trace';

export const dynamic = 'force-dynamic';

/** Wajo redirects here with ?code=&state= after the user clicks Allow. */
export async function GET(req: NextRequest) {
  const db = getDb();
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');
  const back = (q: string) => NextResponse.redirect(new URL(`/connect?${q}`, req.url));
  if (error) return back(`fo=error&message=${encodeURIComponent(req.nextUrl.searchParams.get('error_description') ?? error)}`);
  if (!code) return back('fo=error&message=' + encodeURIComponent('Wajo sent no authorization code.'));
  const fo = getFo(db);
  const expected = fo.provider.expectedState();
  if (expected && state !== expected) return back('fo=error&message=' + encodeURIComponent('The state parameter did not match; start the connection again.'));
  try {
    await fo.finishAuth(code);
    writeEvent(db, { runId: 'system', taskId: null, kind: 'note', summary: 'Fo connected over OAuth (tokens stored locally)', payload: {} });
    await resetFo();
    return back('fo=connected');
  } catch (err) {
    writeEvent(db, { runId: 'system', taskId: null, kind: 'error', summary: `Fo OAuth exchange failed: ${(err as Error).message}`, payload: {} });
    return back('fo=error&message=' + encodeURIComponent((err as Error).message));
  }
}
