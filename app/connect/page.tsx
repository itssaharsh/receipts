import Link from 'next/link';
import { getDb } from '@/lib/db';
import { foOptionsFromEnv } from '@/lib/fo/client';
import { SqliteOAuthProvider } from '@/lib/fo/oauth';
import { googleFromEnv } from '@/lib/google';
import { Mark } from '../components/TopBar';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ConnectPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const db = getDb();
  const fo = foOptionsFromEnv();
  const foProvider = new SqliteOAuthProvider(db, { redirectUrl: fo.redirectUrl });
  const foConnected = fo.mode === 'fake' ? true : foProvider.hasTokens();
  const google = googleFromEnv(db);
  const googleConnected = process.env.ORACLE_MODE === 'fake' ? true : !!google?.connected();
  const foMsg = one(sp.fo);
  const gMsg = one(sp.google);
  const message = one(sp.message);

  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-4 sm:px-6 py-8">
      <Link href="/" className="inline-flex items-center gap-2 text-ink">
        <Mark />
        <span className="wordmark">Receipts</span>
      </Link>
      <h1 className="mt-6 text-[22px] font-semibold">Connect your accounts</h1>
      <p className="mt-1 text-ink-muted">Receipts asks Fo from your own Wajo account and reads your own Google Calendar. Both connections are stored on this computer only.</p>

      {(foMsg === 'error' || gMsg === 'error') && message && (
        <p className="mt-4 rounded-md border border-line-input bg-danger-container px-3 py-2 text-danger" role="alert">
          {message}
        </p>
      )}
      {foMsg === 'connected' && (
        <p className="mt-4 rounded-md bg-accent-container px-3 py-2 text-ink" role="status">
          Fo is connected.
        </p>
      )}
      {gMsg === 'connected' && (
        <p className="mt-4 rounded-md bg-accent-container px-3 py-2 text-ink" role="status">
          Google Calendar is connected (read-only).
        </p>
      )}

      <section className="mt-8 rounded-md border border-line p-4">
        <div className="flex items-center gap-2">
          <span className="disc" data-kind={foConnected ? (fo.mode === 'fake' ? 'awaiting' : 'verified') : 'allowed'} aria-hidden="true" />
          <h2 className="font-semibold">Fo (Wajo)</h2>
          {fo.mode === 'fake' && <span className="text-[12px] text-ink-muted">Simulated Fo for development</span>}
        </div>
        <p className="mt-1 text-ink-muted text-[14px]">Receipts asks Fo from your own Wajo account over MCP. Fo Mini does not allow other apps; the event&rsquo;s join code grants access.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {fo.mode === 'fake' ? (
            <span className="text-[14px]">Set FO_MODE=live in .env.local to connect the real Fo.</span>
          ) : foConnected ? (
            <>
              <span className="text-[14px]">Connected.</span>
              <a className="btn btn-text" href="/api/fo/connect?reset=1">
                Check the connection
              </a>
            </>
          ) : (
            <a className="btn btn-primary" href="/api/fo/connect?go=1">
              Connect Fo
            </a>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-md border border-line p-4">
        <div className="flex items-center gap-2">
          <span className="disc" data-kind={googleConnected ? 'verified' : 'allowed'} aria-hidden="true" />
          <h2 className="font-semibold">Google Calendar</h2>
          {process.env.ORACLE_MODE === 'fake' && <span className="text-[12px] text-ink-muted">Simulated calendar for development</span>}
        </div>
        <p className="mt-1 text-ink-muted text-[14px]">Read-only. Receipts only looks for the events Fo was asked to create, in the window you set on each task.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {process.env.ORACLE_MODE === 'fake' ? (
            <span className="text-[14px]">Unset ORACLE_MODE in .env.local to use your real calendar.</span>
          ) : !google ? (
            <span className="text-[14px]">Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local (a Web application OAuth client with {(process.env.APP_URL ?? 'http://localhost:3100').replace(/\/$/, '')}/api/google/callback as a redirect URI, and your account as a test user), then restart.</span>
          ) : googleConnected ? (
            <>
              <span className="text-[14px]">Connected.</span>
              <a className="btn btn-text" href="/api/google/connect?disconnect=1">
                Disconnect
              </a>
            </>
          ) : (
            <a className="btn btn-primary" href="/api/google/connect?go=1">
              Connect Google Calendar
            </a>
          )}
        </div>
      </section>

      <p className="mt-8 text-[14px]">
        <Link href="/" className="underline">
          Back to the ledger
        </Link>
      </p>
    </main>
  );
}
