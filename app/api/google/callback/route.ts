import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { googleFromEnv } from '@/lib/google';
import { writeEvent } from '@/lib/trace';

export const dynamic = 'force-dynamic';

/** Google redirects here with ?code=&state= after consent. */
export async function GET(req: NextRequest) {
  const db = getDb();
  const back = (q: string) => NextResponse.redirect(new URL(`/connect?${q}`, req.url));
  const auth = googleFromEnv(db);
  if (!auth) return back('google=error&message=' + encodeURIComponent('Google client not configured.'));
  const error = req.nextUrl.searchParams.get('error');
  if (error) return back('google=error&message=' + encodeURIComponent(error));
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (!code) return back('google=error&message=' + encodeURIComponent('Google sent no authorization code.'));
  const expected = auth.expectedState();
  if (expected && state !== expected) return back('google=error&message=' + encodeURIComponent('The state parameter did not match; start again.'));
  try {
    await auth.exchangeCode(code);
    writeEvent(db, { runId: 'system', taskId: null, kind: 'note', summary: 'Google Calendar connected (read-only; tokens stored locally)', payload: {} });
    return back('google=connected');
  } catch (err) {
    writeEvent(db, { runId: 'system', taskId: null, kind: 'error', summary: `Google OAuth exchange failed: ${(err as Error).message}`, payload: {} });
    return back('google=error&message=' + encodeURIComponent((err as Error).message));
  }
}
