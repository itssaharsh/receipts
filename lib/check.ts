import type { Oracle } from './oracle';
import type { CheckResult, Postcondition } from './types';

/** "Thu 23 Oct 15:00" from an ISO string, keeping the wall time the string carries (no zone conversion). */
export function fmtWall(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, h, mi] = m;
  const weekday = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12)).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const month = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12)).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${weekday} ${Number(d)} ${month} ${h}:${mi}`;
}

const none = (kind: CheckResult['kind'], reason: string): CheckResult => ({ kind, found: false, eventId: null, title: null, start: null, queried: null, reason });

/**
 * Ask the oracle whether the postcondition holds. Deterministic: a window around the expected start and a
 * case-insensitive title match. The result is what the receipt shows and what the trace records.
 */
export async function runPostconditionCheck(pc: Postcondition, oracle: Oracle): Promise<CheckResult> {
  if (pc.kind === 'none') return none('none', 'no check defined for this task; confirm by hand if it happened');
  if (!(await oracle.connected())) return none('calendar_event', 'no calendar connected; confirm by hand');

  const start = Date.parse(pc.startISO);
  if (Number.isNaN(start)) return none('calendar_event', `the expected time "${pc.startISO}" could not be read`);
  const w = pc.windowMinutes * 60_000;
  const queried = { timeMin: new Date(start - w).toISOString(), timeMax: new Date(start + w).toISOString(), q: pc.titleContains };

  let events;
  try {
    events = await oracle.listEvents(queried);
  } catch (err) {
    return { ...none('calendar_event', `the calendar could not be read: ${(err as Error).message}`), queried };
  }

  const needle = pc.titleContains.toLowerCase();
  const hit = events.find((e) => {
    const t = Date.parse(e.start);
    return (e.summary ?? '').toLowerCase().includes(needle) && !Number.isNaN(t) && t >= start - w && t <= start + w;
  });
  if (hit) {
    return {
      kind: 'calendar_event',
      found: true,
      eventId: hit.id,
      title: hit.summary,
      start: hit.start,
      queried,
      reason: `found "${hit.summary}" at ${fmtWall(hit.start)} in your calendar`,
    };
  }
  return { ...none('calendar_event', `nothing in your calendar for ${fmtWall(pc.startISO)} with "${pc.titleContains}" yet`), queried };
}
