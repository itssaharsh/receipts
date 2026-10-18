import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { googleFromEnv } from '@/lib/google';

export const dynamic = 'force-dynamic';

/**
 * GET /api/google/connect        -> { configured, connected, authorizationUrl? }
 * GET /api/google/connect?go=1   -> redirects the browser to Google's consent screen
 * GET /api/google/connect?disconnect=1 -> forgets the stored tokens
 */
export async function GET(req: NextRequest) {
  const db = getDb();
  const auth = googleFromEnv(db);
  if (!auth) {
    return NextResponse.json({ configured: false, connected: false, error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set in .env.local' }, { status: 409 });
  }
  if (req.nextUrl.searchParams.get('disconnect') === '1') {
    auth.disconnect();
    return NextResponse.redirect(new URL('/connect?google=disconnected', req.url));
  }
  if (auth.connected()) return NextResponse.json({ configured: true, connected: true });
  const url = auth.authorizationUrl();
  if (req.nextUrl.searchParams.get('go') === '1') return NextResponse.redirect(url);
  return NextResponse.json({ configured: true, connected: false, authorizationUrl: url });
}
