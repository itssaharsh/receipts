import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { resetFo } from '@/lib/fo/client';
import { ensureDefaults } from '@/lib/store';
import { GET as getTasks, POST as postTask } from '@/app/api/tasks/route';
import { POST as pollTask } from '@/app/api/tasks/[id]/poll/route';
import { GET as getTrace } from '@/app/api/trace/[id]/route';
import { GET as exportTrace } from '@/app/api/trace/export/route';
import { GET as getRuns } from '@/app/api/runs/route';
import { GET as getRules } from '@/app/api/rules/route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (url: string, body: unknown) => new NextRequest(`http://localhost:3000${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const get = (url: string) => new NextRequest(`http://localhost:3000${url}`);

describe('API routes: tasks, trace, export, runs (AC-10)', () => {
  beforeAll(() => {
    process.env.ORACLE_MODE = 'fake';
    ensureDefaults(getDb(), { clinicEmail: 'clinic@example.com' });
  });
  afterAll(async () => {
    await resetFo();
  });

  it('rejects an invalid task with the field named', async () => {
    const res = await postTask(post('/api/tasks', { text: '', counterparty: 'x' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body.issues)).toMatch(/text/);
  });

  it('creates a task, polls it to a final state, and serves its trace and the run export', async () => {
    const res = await postTask(
      post('/api/tasks', {
        text: 'Book my dentist check-up: email Northfield Dental to confirm Thursday 3pm and put it on my calendar',
        counterparty: 'Northfield Dental',
        amountCents: 0,
        category: 'booking',
        postcondition: { kind: 'calendar_event', titleContains: 'Dental', startISO: '2026-10-22T15:00:00+01:00', windowMinutes: 30 },
      }),
    );
    expect(res.status).toBe(201);
    const { task } = await res.json();
    expect(task.decision.outcome).toBe('allowed');

    let current = task;
    for (let i = 0; i < 12 && ['dispatched', 'working', 'claimed', 'checking'].includes(current.status); i++) {
      const r = await pollTask(post(`/api/tasks/${task.id}/poll`, {}), ctx(task.id));
      expect(r.status).toBe(200);
      current = (await r.json()).task;
    }
    expect(current.status).toBe('verified');
    expect(current.simulated).toBe(true);

    const tr = await getTrace(get(`/api/trace/${task.id}`), ctx(task.id));
    const { events } = await tr.json();
    expect(events[0].kind).toBe('decision');
    expect(events.some((e: { kind: string }) => e.kind === 'ask_fo')).toBe(true);
    expect(events[events.length - 1].kind).toBe('check');

    const ex = await exportTrace(get(`/api/trace/export?run=${task.runId}`));
    expect(ex.status).toBe(200);
    expect(ex.headers.get('content-type')).toMatch(/jsonl|json|text/);
    expect(ex.headers.get('content-disposition')).toMatch(/attachment/);
    const text = await ex.text();
    const lines = text.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(events.length);
    expect(() => lines.map((l) => JSON.parse(l))).not.toThrow();

    const runs = await getRuns();
    const { current: rc } = await runs.json();
    expect(rc.sent).toBeGreaterThanOrEqual(1);
    expect(rc.verified).toBeGreaterThanOrEqual(1);
    expect(rc.simulated).toBe(true);

    const list = await getTasks(get('/api/tasks'));
    const { tasks } = await list.json();
    expect(tasks.find((t: { id: string }) => t.id === task.id)).toBeTruthy();

    const rules = await getRules();
    const { rules: rs } = await rules.json();
    expect(rs.map((r: { id: string }) => r.id)).toContain('R1');
  });
});
