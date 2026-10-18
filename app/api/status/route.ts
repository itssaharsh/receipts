import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { foOptionsFromEnv } from '@/lib/fo/client';
import { SqliteOAuthProvider } from '@/lib/fo/oauth';

export const dynamic = 'force-dynamic';

/** What is connected, and whether Fo is live or simulated. Never returns a token. */
export async function GET() {
  const db = getDb();
  const opts = foOptionsFromEnv();
  const fo = new SqliteOAuthProvider(db, { redirectUrl: opts.redirectUrl });
  const google = db.prepare('select tokens from oauth where provider = ?').get('google') as { tokens: string | null } | undefined;
  return NextResponse.json({
    mode: opts.mode,
    fo: { connected: opts.mode === 'fake' ? true : fo.hasTokens(), simulated: opts.mode === 'fake', pendingAuthorization: !!fo.pendingAuthorizationUrl() },
    google: { connected: process.env.ORACLE_MODE === 'fake' ? true : !!google?.tokens, simulated: process.env.ORACLE_MODE === 'fake' },
    publicDemo: process.env.PUBLIC_DEMO === '1',
    now: new Date().toISOString(),
  });
}
