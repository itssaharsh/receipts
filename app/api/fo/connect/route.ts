import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { getFo, resetFo } from '@/lib/fo/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/fo/connect           -> { connected, authorizationUrl?, mode }
 * GET /api/fo/connect?go=1      -> redirects the browser to Wajo's authorization page when a connection is needed
 * GET /api/fo/connect?reset=1   -> forgets the cached client and tries again (after a token change)
 */
export async function GET(req: NextRequest) {
  if (process.env.PUBLIC_DEMO === '1') return NextResponse.json({ error: 'The public demo runs a simulated Fo and calendar; there is nothing to connect. Run Receipts locally to connect your own accounts.' }, { status: 409 });
  const db = getDb();
  if (req.nextUrl.searchParams.get('reset') === '1') await resetFo();
  const fo = getFo(db);
  try {
    const r = await fo.connect();
    if (r.connected) return NextResponse.json({ connected: true, mode: fo.mode });
    if (req.nextUrl.searchParams.get('go') === '1') return NextResponse.redirect(r.authorizationUrl);
    return NextResponse.json({ connected: false, authorizationUrl: r.authorizationUrl, mode: fo.mode });
  } catch (err) {
    return NextResponse.json({ connected: false, error: (err as Error).message, mode: fo.mode }, { status: 502 });
  }
}
