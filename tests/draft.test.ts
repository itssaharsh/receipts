import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { amountFromWords, categoryFromWords, counterpartyFromWords, draft, draftFromWords, reconcile, whenFromWords, type DraftContext, type ModelOptions } from '@/lib/draft';
import { getDb } from '@/lib/db';
import { resetFo } from '@/lib/fo/client';
import { ensureDefaults } from '@/lib/store';
import { eventsForTask } from '@/lib/trace';
import { POST as postTask } from '@/app/api/tasks/route';
import { POST as postDraft } from '@/app/api/draft/route';

const ctx: DraftContext = { nowLocal: '2026-10-18T16:10', timeZone: 'Asia/Kolkata', contacts: [{ name: 'Northfield Dental' }, { name: 'Mum' }] }; // a Sunday afternoon
const DENTIST = 'Book my dentist check-up: email Northfield Dental to confirm Thursday 3pm and put it on my calendar';

describe('drafting from the words alone (T13, no model)', () => {
  it('reads the demo sentence: the clinic, a booking, no money, a calendar check on the coming Thursday at 15:00', () => {
    const d = draftFromWords(DENTIST, ctx);
    expect(d.counterparty).toBe('Northfield Dental');
    expect(d.category).toBe('booking');
    expect(d.amountCents).toBe(0);
    expect(d.postcondition).toEqual({ kind: 'calendar_event', titleContains: 'Dent', startLocal: '2026-10-22T15:00', windowMinutes: 30 });
    expect(d.summary).toMatch(/Northfield Dental/);
    expect(d.summary).toMatch(/Thu 22 Oct 15:00/);
  });

  it('reads a purchase, an email to a stranger and a cancellation', () => {
    const flowers = draftFromWords('Order flowers for $45 to Mum', ctx);
    expect(flowers).toMatchObject({ counterparty: 'Mum', category: 'purchase', amountCents: 4500, postcondition: { kind: 'none' } });
    const rent = draftFromWords('Email my new landlord Jordan Lee that the rent will be late', ctx);
    expect(rent).toMatchObject({ counterparty: 'Jordan Lee', category: 'email', amountCents: 0, postcondition: { kind: 'none' } });
    const gym = draftFromWords('Cancel my gym membership', ctx);
    expect(gym.category).toBe('cancellation');
    expect(gym.counterparty).toBe('');
    expect(gym.summary).toMatch(/by hand/);
  });

  it('resolves days and times in the person\'s own clock', () => {
    const f = (s: string) => {
      const w = whenFromWords(s, ctx.nowLocal);
      return w ? `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}T${String(w.hh).padStart(2, '0')}:${String(w.mi).padStart(2, '0')}` : null;
    };
    expect(f('tomorrow at 9am')).toBe('2026-10-19T09:00');
    expect(f('Sunday 2pm')).toBe('2026-10-25T14:00'); // today is Sunday and 14:00 has passed
    expect(f('next Monday 14:30')).toBe('2026-10-19T14:30');
    expect(f('22 Oct 3pm')).toBe('2026-10-22T15:00');
    expect(f('Oct 22 at noon')).toBe('2026-10-22T12:00');
    expect(f('on 3 January')).toBe('2027-01-03T09:00');
    expect(f('no time here')).toBeNull();
    expect(amountFromWords('pay £12.50 to the window cleaner')).toBe(1250);
    expect(amountFromWords('send 20 dollars')).toBe(2000);
    expect(categoryFromWords('Call the plumber about the leak')).toBe('call');
    expect(counterpartyFromWords('Ask Dr Patel for a repeat prescription', [])).toBe('Dr Patel');
  });
});

function fakeFetch(content: string, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ model: 'anthropic/claude-haiku-4.5', choices: [{ message: { role: 'assistant', content } }] }), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}
const opts = (fetchImpl: typeof fetch, timeoutMs = 2000): ModelOptions => ({ baseUrl: 'https://gateway.test/v1', model: 'anthropic/claude-haiku-4.5', apiKey: 'k', timeoutMs, fetch: fetchImpl });

describe('drafting with a model (T13)', () => {
  it('takes the model\'s fields, says which model, and never a counterparty the sentence does not hold', async () => {
    const reply =
      'Here you go: {"counterparty":"Northfield Dental","category":"booking","amountCents":0,"postcondition":{"kind":"calendar_event","titleContains":"Dental","startLocal":"2026-10-22T15:00","windowMinutes":30},"summary":"Fo emails Northfield Dental; verified when a Dental event appears Thu 22 Oct 15:00."}';
    const r = await draft(DENTIST, ctx, opts(fakeFetch(reply)));
    expect(r.source).toBe('model');
    expect(r.model).toBe('anthropic/claude-haiku-4.5');
    expect(r.draft.postcondition).toEqual({ kind: 'calendar_event', titleContains: 'Dent', startLocal: '2026-10-22T15:00', windowMinutes: 30 }); // the stem, not the model's phrase
    expect(r.draft.summary).toMatch(/Fo will contact Northfield Dental; verified when an event containing “Dent” appears around Thu 22 Oct 15:00/); // our sentence, not the model's

    const nobody = reconcile({ counterparty: 'Northfield Dental', category: 'cancellation', amountCents: 0, postcondition: { kind: 'none' } }, draftFromWords('Cancel my gym membership', ctx), 'Cancel my gym membership', ctx);
    expect(nobody.counterparty).toBe(''); // a contact the sentence never mentions is still an invention

    const invented = reconcile({ counterparty: 'Acme Corp', category: 'weird', amountCents: '4500', postcondition: { kind: 'calendar_event' } }, draftFromWords('Order flowers for $45 to Mum', ctx), 'Order flowers for $45 to Mum', ctx);
    expect(invented.counterparty).toBe('Mum'); // Acme Corp is not in the sentence
    expect(invented.category).toBe('purchase'); // not a category we know
    expect(invented.amountCents).toBe(4500); // a numeric string is accepted
    expect(invented.postcondition).toEqual({ kind: 'none' }); // a broken postcondition falls back to the words
  });

  it('falls back to the words, and says so, when the model errors or does not answer in time', async () => {
    const broken = await draft(DENTIST, ctx, opts(fakeFetch('{"error":"nope"}', 500)));
    expect(broken.source).toBe('words');
    expect(broken.model).toBeNull();
    expect(broken.note).toMatch(/did not answer/);
    expect(broken.draft.counterparty).toBe('Northfield Dental');

    const never: typeof fetch = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })) as unknown as typeof fetch;
    const slow = await draft(DENTIST, ctx, opts(never, 30));
    expect(slow.source).toBe('words');
    expect(slow.note).toMatch(/no answer in 30 ms/);
    expect(slow.ms).toBeLessThan(1500);

    const off = await draft(DENTIST, ctx, null);
    expect(off.source).toBe('words');
    expect(off.note).toBeNull();
  });
});

describe('draft route and the draft in the trace (T13)', () => {
  const post = (url: string, body: unknown) => new NextRequest(`http://localhost:3100${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

  it('POST /api/draft answers from the words when no model is configured, and rejects a missing clock', async () => {
    ensureDefaults(getDb(), { clinicEmail: 'clinic@example.com' });
    const res = await postDraft(post('/api/draft', { text: DENTIST, nowLocal: '2026-10-18T16:10', timeZone: 'Asia/Kolkata' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('words');
    expect(body.draft.counterparty).toBe('Northfield Dental');
    expect(body.draft.postcondition.startLocal).toBe('2026-10-22T15:00');
    const bad = await postDraft(post('/api/draft', { text: DENTIST }));
    expect(bad.status).toBe(400);
  });

  it('a task sent with its draft meta logs the draft first, then the rule decision', async () => {
    ensureDefaults(getDb(), { clinicEmail: 'clinic@example.com' });
    const res = await postTask(
      post('/api/tasks', {
        text: 'Cancel my gym membership',
        counterparty: 'PureGym',
        amountCents: 0,
        category: 'cancellation',
        postcondition: { kind: 'none' },
        draft: { source: 'model', model: 'anthropic/claude-haiku-4.5', ms: 900, summary: 'Fo will contact PureGym; no automatic check.', note: null },
      }),
    );
    expect(res.status).toBe(201);
    const { task } = await res.json();
    expect(task.status).toBe('held');
    const kinds = eventsForTask(getDb(), task.id).map((e) => e.kind);
    expect(kinds.slice(0, 2)).toEqual(['draft', 'decision']);
    const ev = eventsForTask(getDb(), task.id)[0];
    expect(ev.summary).toMatch(/drafted by anthropic\/claude-haiku-4.5 in 900 ms, confirmed by you/);
    await resetFo();
  });
});
