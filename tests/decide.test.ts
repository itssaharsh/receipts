import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { FoClient } from '@/lib/fo/client';
import { FakeCalendarOracle } from '@/lib/oracle';
import { createTask, decide, type RunnerDeps } from '@/lib/runner';
import { ensureDefaults, listRules } from '@/lib/store';
import { eventsForTask } from '@/lib/trace';

describe('decisions on held tasks (AC-2, AC-3)', () => {
  let db: Db;
  let fo: FoClient;
  let deps: RunnerDeps;
  beforeEach(() => {
    db = openDb(':memory:');
    ensureDefaults(db, { clinicEmail: 'clinic@example.com' });
    fo = new FoClient(db, { mode: 'fake', url: 'inmemory://fo', redirectUrl: 'http://localhost:3000/api/fo/callback' });
    deps = { db, fo, oracle: new FakeCalendarOracle([]) };
  });
  afterEach(async () => {
    await fo.close();
    db.close();
  });

  it('a task to a counterparty outside the contacts is held with the rule and the reason, and Fo is not called', async () => {
    const t = await createTask(deps, { text: 'Email my new landlord Jordan Lee that the rent will be late', counterparty: 'Jordan Lee', amountCents: 0, category: 'email', postcondition: { kind: 'none' } });
    expect(t.status).toBe('held');
    expect(t.decision?.ruleId).toBe('R1');
    expect(t.decision?.reason).toBe('R1 Contacts only: Jordan Lee is not in your contacts.');
    expect(t.foConversationId).toBeNull();
    expect(eventsForTask(db, t.id).map((e) => e.kind)).toEqual(['decision']);
  });

  it('approve and add a rule creates the rule, records the decision and dispatches', async () => {
    const t = await createTask(deps, { text: 'Email my new landlord Jordan Lee that the rent will be late', counterparty: 'Jordan Lee', amountCents: 0, category: 'email', postcondition: { kind: 'none' } });
    const after = await decide(deps, t.id, 'approve_with_rule');
    expect(after.userDecision).toBe('approve_with_rule');
    expect(after.allowedByRuleId).toBe('R4');
    expect(['dispatched', 'working']).toContain(after.status);
    const r4 = listRules(db).find((r) => r.id === 'R4');
    expect(r4?.kind).toBe('allow_counterparties');
    expect(r4?.params.names).toEqual(['Jordan Lee']);
    expect(r4?.useCount).toBe(1);
    const kinds = eventsForTask(db, t.id).map((e) => e.kind);
    expect(kinds).toEqual(['decision', 'user_decision', 'ask_fo']);
  });

  it('approve once dispatches without creating a rule', async () => {
    const t = await createTask(deps, { text: 'Email my new landlord Jordan Lee that the rent will be late', counterparty: 'Jordan Lee', amountCents: 0, category: 'email', postcondition: { kind: 'none' } });
    const before = listRules(db).length;
    const after = await decide(deps, t.id, 'approve_once');
    expect(after.userDecision).toBe('approve_once');
    expect(after.allowedByRuleId).toBeNull();
    expect(['dispatched', 'working']).toContain(after.status);
    expect(listRules(db).length).toBe(before);
  });

  it('decline records withheld and never calls Fo', async () => {
    const t = await createTask(deps, { text: 'Order flowers for $45 to Mum', counterparty: 'Mum', amountCents: 4500, category: 'purchase', postcondition: { kind: 'none' } });
    expect(t.status).toBe('held');
    expect(t.decision?.reason).toBe('R2 Up to $25 a task: this is $45.00.');
    const after = await decide(deps, t.id, 'decline');
    expect(after.status).toBe('withheld');
    expect(after.userDecision).toBe('decline');
    expect(after.foConversationId).toBeNull();
    expect(eventsForTask(db, t.id).map((e) => e.kind)).toEqual(['decision', 'user_decision']);
  });

  it('deciding a task that is not held is refused', async () => {
    const t = await createTask(deps, { text: 'Order flowers for $45 to Mum', counterparty: 'Mum', amountCents: 4500, category: 'purchase', postcondition: { kind: 'none' } });
    await decide(deps, t.id, 'decline');
    await expect(decide(deps, t.id, 'approve_once')).rejects.toThrow(/not waiting/);
  });
});

describe('review fixes (T09)', () => {
  it('approve and add a rule is refused for a category that always waits, even with a rule in the body', async () => {
    const db = openDb(':memory:');
    ensureDefaults(db, { clinicEmail: 'clinic@example.com' });
    const fo = new FoClient(db, { mode: 'fake', url: 'inmemory://fo', redirectUrl: 'http://localhost:3100/api/fo/callback' });
    const deps: RunnerDeps = { db, fo, oracle: new FakeCalendarOracle([]) };
    const t = await createTask(deps, { text: 'Cancel my gym membership', counterparty: 'PureGym', amountCents: 0, category: 'cancellation', postcondition: { kind: 'none' } });
    expect(t.status).toBe('held');
    await expect(decide(deps, t.id, 'approve_with_rule', { kind: 'allow_counterparties', label: 'PureGym allowed', params: { names: ['PureGym'] } })).rejects.toThrow(/always wait/);
    const once = await decide(deps, t.id, 'approve_once');
    expect(['dispatched', 'working']).toContain(once.status);
    await fo.close();
    db.close();
  });
});
