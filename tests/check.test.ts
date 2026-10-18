import { describe, expect, it } from 'vitest';
import { runPostconditionCheck } from '@/lib/check';
import { FakeCalendarOracle, NoOracle } from '@/lib/oracle';
import type { Postcondition } from '@/lib/types';

const pc: Postcondition = { kind: 'calendar_event', titleContains: 'Dental', startISO: '2026-10-22T15:00:00+01:00', windowMinutes: 30 };

describe('postcondition check against the calendar oracle (AC-6)', () => {
  it('finds an event whose title contains the words inside the window', async () => {
    const oracle = new FakeCalendarOracle([{ id: 'ev-7kq', summary: 'Northfield Dental check-up', start: '2026-10-22T15:00:00+01:00' }]);
    const r = await runPostconditionCheck(pc, oracle);
    expect(r.found).toBe(true);
    expect(r.eventId).toBe('ev-7kq');
    expect(r.title).toBe('Northfield Dental check-up');
    expect(r.queried?.timeMin).toBe('2026-10-22T13:30:00.000Z');
    expect(r.queried?.timeMax).toBe('2026-10-22T14:30:00.000Z');
    expect(r.reason).toMatch(/found "Northfield Dental check-up"/);
  });

  it('ignores an event outside the window', async () => {
    const oracle = new FakeCalendarOracle([{ id: 'ev-late', summary: 'Northfield Dental check-up', start: '2026-10-22T17:00:00+01:00' }]);
    const r = await runPostconditionCheck(pc, oracle);
    expect(r.found).toBe(false);
    expect(r.eventId).toBeNull();
    expect(r.reason).toMatch(/nothing in your calendar/);
  });

  it('ignores an event whose title does not contain the words', async () => {
    const oracle = new FakeCalendarOracle([{ id: 'ev-other', summary: 'Haircut', start: '2026-10-22T15:00:00+01:00' }]);
    const r = await runPostconditionCheck(pc, oracle);
    expect(r.found).toBe(false);
  });

  it('matches the title case-insensitively', async () => {
    const oracle = new FakeCalendarOracle([{ id: 'ev-1', summary: 'DENTAL appointment', start: '2026-10-22T14:50:00+01:00' }]);
    const r = await runPostconditionCheck(pc, oracle);
    expect(r.found).toBe(true);
  });

  it('a postcondition of kind none has nothing to check', async () => {
    const r = await runPostconditionCheck({ kind: 'none' }, new FakeCalendarOracle([]));
    expect(r.kind).toBe('none');
    expect(r.found).toBe(false);
    expect(r.reason).toMatch(/no check defined/);
  });

  it('with no calendar connected, the reason says so and nothing is found', async () => {
    const r = await runPostconditionCheck(pc, new NoOracle());
    expect(r.found).toBe(false);
    expect(r.reason).toMatch(/no calendar connected/);
  });
});
