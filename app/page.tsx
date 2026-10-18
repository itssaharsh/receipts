import { getDeps } from '@/lib/deps';
import { foOptionsFromEnv } from '@/lib/fo/client';
import { SqliteOAuthProvider } from '@/lib/fo/oauth';
import { FIXTURE_RULES, FIXTURE_STATES, fixtureTasks, type FixtureState } from '@/lib/fixtures';
import { currentRunId, listContacts, listRules, listTasks, runCount } from '@/lib/store';
import { Ledger, type LedgerInitial } from './components/Ledger';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const record = one(sp.record) === '1';
  const stateParam = one(sp.state);
  const fixture = stateParam && (FIXTURE_STATES as readonly string[]).includes(stateParam) ? (stateParam as FixtureState) : null;

  if (fixture) {
    const initial: LedgerInitial = {
      tasks: fixtureTasks(fixture),
      rules: FIXTURE_RULES,
      contacts: [
        { id: 'c1', name: 'Northfield Dental', email: null, phone: null },
        { id: 'c2', name: 'Mum', email: null, phone: null },
      ],
      runCount: { runId: 'run-fixture', sent: 4, verified: 3, unverified: 0, confirmedByUser: 0, withheld: 1, failed: 0, simulated: false },
      status: { mode: 'live', foConnected: fixture !== 'disconnected', foSimulated: false, googleConnected: fixture !== 'disconnected' && fixture !== 'nocalendar' },
    };
    return <Ledger initial={initial} fixture={fixture} record={record} />;
  }

  const { db } = getDeps();
  const opts = foOptionsFromEnv();
  const provider = new SqliteOAuthProvider(db, { redirectUrl: opts.redirectUrl });
  const google = db.prepare('select tokens from oauth where provider = ?').get('google') as { tokens: string | null } | undefined;
  const runId = currentRunId(db);
  const initial: LedgerInitial = {
    tasks: listTasks(db, runId),
    rules: listRules(db),
    contacts: listContacts(db),
    runCount: runCount(db, runId),
    status: {
      mode: opts.mode,
      foConnected: opts.mode === 'fake' ? true : provider.hasTokens(),
      foSimulated: opts.mode === 'fake',
      googleConnected: process.env.ORACLE_MODE === 'fake' ? true : !!google?.tokens,
    },
  };
  return <Ledger initial={initial} fixture={null} record={record} demo={one(sp.demo) === '1'} />;
}
