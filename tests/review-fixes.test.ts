import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { openDb, type Db } from '@/lib/db';
import { FoClient } from '@/lib/fo/client';
import { FakeCalendarOracle } from '@/lib/oracle';
import { createTask, poll, retryDispatch, type RunnerDeps } from '@/lib/runner';
import { ensureDefaults } from '@/lib/store';
import { eventsForTask } from '@/lib/trace';
import type { TaskInput } from '@/lib/types';
import { GET as exportTrace } from '@/app/api/trace/export/route';

const dentist: TaskInput = {
  text: 'Book my dentist check-up: email Northfield Dental to confirm Thursday 3pm and put it on my calendar',
  counterparty: 'Northfield Dental',
  amountCents: 0,
  category: 'booking',
  postcondition: { kind: 'calendar_event', titleContains: 'Dental', startISO: '2026-10-22T15:00:00+01:00', windowMinutes: 30 },
};

describe('review fixes: one ask_fo, one poll at a time (review-T09 B1, B2)', () => {
  let db: Db;
  let fo: FoClient;
  let deps: RunnerDeps;
  beforeEach(() => {
    db = openDb(':memory:');
    ensureDefaults(db, { clinicEmail: 'clinic@example.com' });
    fo = new FoClient(db, { mode: 'fake', url: 'inmemory://fo', redirectUrl: 'http://localhost:3100/api/fo/callback' });
    deps = { db, fo, oracle: new FakeCalendarOracle([]) };
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fo.close();
    db.close();
  });

  it('a dispatch Fo did not accept ends failed and is never retried by polling; only the person sends it again', async () => {
    const ask = vi.spyOn(fo, 'askFo').mockRejectedValueOnce(new Error('socket hang up'));
    const t = await createTask(deps, dentist);
    expect(t.status).toBe('failed');
    expect(t.dispatchedAt).toBeNull();
    expect(t.error).toMatch(/did not accept/);
    expect(ask).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 3; i++) await poll(deps, t.id);
    expect(ask).toHaveBeenCalledTimes(1);
    expect((await poll(deps, t.id)).status).toBe('failed');

    const again = await retryDispatch(deps, t.id);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(['dispatched', 'working', 'claimed', 'checking', 'verified', 'unverified']).toContain(again.status);
    expect(again.dispatchedAt).toBeTruthy();
    const kinds = eventsForTask(db, t.id).map((e) => e.kind);
    expect(kinds.filter((k) => k === 'ask_fo')).toHaveLength(1);
    expect(kinds).toContain('note');
    await expect(retryDispatch(deps, t.id)).rejects.toThrow(/cannot be sent again/);
  });

  it('three concurrent polls of one working task make one get_fo_reply call', async () => {
    const t = await createTask(deps, dentist);
    expect(['dispatched', 'working']).toContain(t.status);
    const original = fo.getFoReply.bind(fo);
    const reply = vi.spyOn(fo, 'getFoReply').mockImplementation(async (...args) => {
      await new Promise((r) => setTimeout(r, 40));
      return original(...args);
    });
    const results = await Promise.all([poll(deps, t.id), poll(deps, t.id), poll(deps, t.id)]);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(eventsForTask(db, t.id).filter((e) => e.kind === 'get_fo_reply')).toHaveLength(1);
  });
});

describe('review fixes: export of an unknown run', () => {
  it('is a 404, not an empty file', async () => {
    const res = await exportTrace(new NextRequest('http://localhost:3100/api/trace/export?run=run-that-never-was'));
    expect(res.status).toBe(404);
    const bad = await exportTrace(new NextRequest('http://localhost:3100/api/trace/export?run=a%22b%0d%0ac'));
    expect([200, 404]).toContain(bad.status);
    expect(bad.headers.get('content-disposition') ?? '').not.toMatch(/"b/);
  });
});
