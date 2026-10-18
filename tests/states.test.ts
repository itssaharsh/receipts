import { describe, expect, it } from 'vitest';
import { FIXTURE_RULES, FIXTURE_STATES, fixtureEvents, fixtureTasks } from '@/lib/fixtures';
import { describeTask, stripHours } from '@/lib/view';

describe('row view model: every state has its words (AC-9, AC-7, AC-13)', () => {
  it('every fixture state resolves to a status word and a proof line', () => {
    for (const s of FIXTURE_STATES) {
      for (const t of fixtureTasks(s)) {
        const v = describeTask(t, FIXTURE_RULES);
        expect(v.statusWord.length).toBeGreaterThan(0);
        expect(v.proofLine.length).toBeGreaterThan(0);
      }
    }
  });

  it('verified reads from the calendar, with the rule that allowed it', () => {
    const v = describeTask(fixtureTasks('verified')[0], FIXTURE_RULES);
    expect(v.statusWord).toBe('Verified');
    expect(v.disc).toBe('verified');
    expect(v.ruleLine).toBe('allowed by R1 Contacts only');
    expect(v.claimLine).toMatch(/^Fo says done: "Booked/);
    expect(v.proofKind).toBe('found');
    expect(v.proofLine).toMatch(/^verified from your calendar \d\d:\d\d$/);
    expect(v.proofAction).toBeNull();
  });

  it('a manual tick is "confirmed by you", never verified', () => {
    const v = describeTask(fixtureTasks('manual')[0], FIXTURE_RULES);
    expect(v.statusWord).toBe('Confirmed by you');
    expect(v.disc).toBe('confirmed');
    expect(v.proofLine).toMatch(/^confirmed by you/);
    expect(v.proofLine).not.toMatch(/verified/);
  });

  it('held and withheld carry the rule and its reason; withheld was never sent', () => {
    const held = describeTask(fixtureTasks('held')[0], FIXTURE_RULES);
    expect(held.statusWord).toBe('Held');
    expect(held.ruleLine).toBe('R1 Contacts only: Jordan Lee is not in your contacts.');
    expect(held.proofLine).toBe('waiting for you');
    const withheld = describeTask(fixtureTasks('withheld')[0], FIXTURE_RULES);
    expect(withheld.statusWord).toBe('Withheld');
    expect(withheld.ruleLine).toMatch(/^held by R2 Up to \$25 a task, declined \d\d:\d\d$/);
    expect(withheld.proofLine).toBe('never sent to Fo');
  });

  it('unverified offers the manual tick and says Fo was asked again; no calendar says so', () => {
    const u = describeTask(fixtureTasks('unverified')[0], FIXTURE_RULES);
    expect(u.proofAction).toBe('confirm');
    expect(u.proofLine).toMatch(/asked Fo again/);
    const n = describeTask(fixtureTasks('nocalendar')[0], FIXTURE_RULES);
    expect(n.proofKind).toBe('no_calendar');
    expect(n.proofLine).toBe('no calendar connected; confirm by hand');
  });

  it('working shows Fo\'s latest progress line verbatim; a question is surfaced with an answer action', () => {
    const w = describeTask(fixtureTasks('working')[0], FIXTURE_RULES);
    expect(w.claimLine).toBe('Fo: "Emailing Northfield Dental to confirm Thursday 3pm"');
    expect(w.active).toBe(true);
    const q = describeTask(fixtureTasks('awaiting')[0], FIXTURE_RULES);
    expect(q.proofAction).toBe('answer');
    expect(q.proofLine).toMatch(/paperback/);
  });

  it('a simulated task is labelled so; a live one is not', () => {
    const sim = describeTask({ ...fixtureTasks('verified')[0], simulated: true }, FIXTURE_RULES);
    expect(sim.simulatedLabel).toBe('Simulated Fo');
    expect(describeTask(fixtureTasks('verified')[0], FIXTURE_RULES).simulatedLabel).toBeNull();
  });

  it('the calendar strip shows the day and the hour rows around the event', () => {
    const s = stripHours('2026-10-22T15:00:00+01:00');
    expect(s.label).toBe('Thu 22 Oct');
    expect(s.hours.map((h) => h.hour)).toEqual(['14:00', '15:00', '16:00']);
    expect(s.hours[1].isEvent).toBe(true);
  });

  it('fixture traces end on the check for a verified row', () => {
    const ev = fixtureEvents(fixtureTasks('verified')[0]);
    expect(ev[0].kind).toBe('decision');
    expect(ev[ev.length - 1].kind).toBe('check');
    expect(ev[ev.length - 1].summary).toMatch(/found event 7kq2m0v9p1/);
  });
});


describe('long live progress lines', () => {
  it('shows the note Fo wrote, not the whole status sentence', async () => {
    const { tidyProgress } = await import('@/lib/view');
    expect(tidyProgress('Working for 51s: working in the user\'s Wajo account (Sending Northfield Dental your confirmation), 5 steps so far. Fo\'s last note: "The event is already on your calendar, sending the email now."')).toBe('The event is already on your calendar, sending the email now.');
    expect(tidyProgress('Fo is on it: Emailing Northfield Dental')).toBe('Fo is on it: Emailing Northfield Dental');
  });
});
