import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { FoClient } from '@/lib/fo/client';
import { FakeCalendarOracle, NoOracle } from '@/lib/oracle';
import { confirmByUser, createTask, poll, runCount, type RunnerDeps } from '@/lib/runner';
import { ensureDefaults } from '@/lib/store';
import { eventsForTask } from '@/lib/trace';
import type { TaskInput } from '@/lib/types';

const dentist: TaskInput = {
  text: 'Book my dentist check-up: email Northfield Dental to confirm Thursday 3pm and put it on my calendar',
  counterparty: 'Northfield Dental',
  amountCents: 0,
  category: 'booking',
  postcondition: { kind: 'calendar_event', titleContains: 'Dental', startISO: '2026-10-22T15:00:00+01:00', windowMinutes: 30 },
};

async function settle(deps: RunnerDeps, id: string, max = 12) {
  let t = await poll(deps, id);
  for (let i = 0; i < max && ['dispatched', 'working', 'claimed', 'checking'].includes(t.status); i++) t = await poll(deps, id);
  return t;
}

describe('task runner (AC-1, AC-4, AC-5, AC-6, AC-7)', () => {
  let db: Db;
  let fo: FoClient;
  beforeEach(() => {
    db = openDb(':memory:');
    ensureDefaults(db, { clinicEmail: 'clinic@example.com' });
    fo = new FoClient(db, { mode: 'fake', url: 'inmemory://fo', redirectUrl: 'http://localhost:3000/api/fo/callback' });
  });
  afterEach(async () => {
    await fo.close();
    db.close();
  });

  it('an allowed task is dispatched, polled to completion and verified from the calendar', async () => {
    const oracle = new FakeCalendarOracle([{ id: 'ev-7kq', summary: 'Northfield Dental check-up', start: '2026-10-22T15:00:00+01:00' }]);
    const deps: RunnerDeps = { db, fo, oracle };
    const created = await createTask(deps, dentist);
    expect(created.decision?.outcome).toBe('allowed');
    expect(created.allowedByRuleId).toBe('R1');
    expect(['dispatched', 'working']).toContain(created.status);
    expect(created.foConversationId).toBeTruthy();
    expect(created.dispatchedAt).toBeTruthy();

    const done = await settle(deps, created.id);
    expect(done.status).toBe('verified');
    expect(done.verifiedBy).toBe('calendar');
    expect(done.checkResult?.found).toBe(true);
    expect(done.checkResult?.eventId).toBe('ev-7kq');
    expect(done.foClaim).toMatch(/Booked/);
    expect(done.foProgress.length).toBeGreaterThan(1);
    expect(done.simulated).toBe(true);

    const kinds = eventsForTask(db, created.id).map((e) => e.kind);
    expect(kinds[0]).toBe('decision');
    expect(kinds[1]).toBe('ask_fo');
    expect(kinds).toContain('get_fo_reply');
    expect(kinds).toContain('get_fo_conversation');
    expect(kinds[kinds.length - 1]).toBe('check');
    const rule = db.prepare('select use_count from rules where id = ?').get('R1') as { use_count: number };
    expect(rule.use_count).toBe(1);
  });

  it('a confirmation question from Fo is answered from the approval, once, and the task completes', async () => {
    const deps: RunnerDeps = { db, fo, oracle: new FakeCalendarOracle([]) };
    const created = await createTask(deps, { text: 'Order a book for Mum', counterparty: 'Mum', amountCents: 2000, category: 'purchase', postcondition: { kind: 'none' } });
    expect(created.decision?.outcome).toBe('allowed');
    const done = await settle(deps, created.id);
    expect(done.status).toBe('unverified');
    expect(done.checkResult?.reason).toMatch(/no check defined/);
    expect(done.foClaim).toMatch(/Ordered/);
    const events = eventsForTask(db, created.id);
    expect(events.some((e) => e.kind === 'note' && /confirmation answered/.test(e.summary))).toBe(true);
    expect(events.filter((e) => e.kind === 'ask_fo')).toHaveLength(2);
  });

  it('when the calendar has nothing, Fo is re-asked once, then the task is unverified and the user can confirm by hand', async () => {
    const deps: RunnerDeps = { db, fo, oracle: new FakeCalendarOracle([]) };
    const created = await createTask(deps, dentist);
    const done = await settle(deps, created.id, 24);
    expect(done.status).toBe('unverified');
    expect(done.reaskCount).toBe(1);
    expect(done.checkResult?.found).toBe(false);
    const events = eventsForTask(db, created.id);
    expect(events.filter((e) => e.kind === 'reask')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'check')).toHaveLength(2);

    const confirmed = confirmByUser(deps, created.id);
    expect(confirmed.status).toBe('confirmed_by_user');
    expect(confirmed.verifiedBy).toBe('user');
    expect(eventsForTask(db, created.id).some((e) => e.kind === 'manual')).toBe(true);
  });

  it('with no calendar connected, the receipt is unverified and says so', async () => {
    const deps: RunnerDeps = { db, fo, oracle: new NoOracle() };
    const created = await createTask(deps, dentist);
    const done = await settle(deps, created.id, 24);
    expect(done.status).toBe('unverified');
    expect(done.checkResult?.reason).toMatch(/no calendar connected/);
  });

  it('a failed errand ends failed with Fo\'s words and no check runs', async () => {
    const deps: RunnerDeps = { db, fo, oracle: new FakeCalendarOracle([]) };
    const created = await createTask(deps, { ...dentist, text: 'Please fail: email Northfield Dental at a clinic that no longer exists' });
    const done = await settle(deps, created.id);
    expect(done.status).toBe('failed');
    expect(done.error).toMatch(/could not/i);
    expect(eventsForTask(db, created.id).some((e) => e.kind === 'check')).toBe(false);
  });

  it('the run count reports sent, verified, unverified, withheld and failed, and flags simulated runs', async () => {
    const deps: RunnerDeps = { db, fo, oracle: new FakeCalendarOracle([{ id: 'ev-1', summary: 'Dental', start: '2026-10-22T15:00:00+01:00' }]) };
    const a = await createTask(deps, dentist);
    await settle(deps, a.id);
    const held = await createTask(deps, { text: 'Order flowers for $45 to Mum', counterparty: 'Mum', amountCents: 4500, category: 'purchase', postcondition: { kind: 'none' } });
    expect(held.status).toBe('held');
    const rc = runCount(db, a.runId);
    expect(rc.sent).toBe(1);
    expect(rc.verified).toBe(1);
    expect(rc.withheld).toBe(0);
    expect(rc.simulated).toBe(true);
  });
});

describe('questions in Fo\'s words (live server shape)', () => {
  it('a reply that asks something is a question whatever its status, and Receipts answers only what it may', async () => {
    const { isQuestion, autoAnswer } = await import('@/lib/runner');
    expect(isQuestion('Which Northfield Dental is your dentist, or can you share its email address?')).toBe(true);
    expect(isQuestion('Booked Thu 22 Oct 15:00 with Northfield Dental and emailed the clinic to confirm.')).toBe(false);
    const base = { counterparty: 'Northfield Dental', userDecision: null, allowedByRuleId: 'R1' } as unknown as import('@/lib/types').Task;
    const contacts = [{ id: 'c1', name: 'Northfield Dental', email: 'clinic@example.com', phone: null }];
    expect(autoAnswer('Which Northfield Dental is your dentist, or can you share its email address?', base, contacts)).toEqual({ answer: 'Use Northfield Dental: email clinic@example.com. Go ahead.', basis: 'contacts' });
    expect(autoAnswer('This comes to $45. Shall I go ahead?', base, contacts)).toEqual({ answer: 'Yes, go ahead.', basis: 'approval' });
    expect(autoAnswer('What time on Friday works for you?', base, contacts)).toBeNull(); // the person answers
    const held = { ...base, allowedByRuleId: null } as unknown as import('@/lib/types').Task;
    expect(autoAnswer('Shall I go ahead?', held, [])).toBeNull(); // nothing approved, nothing answered
  });
});
