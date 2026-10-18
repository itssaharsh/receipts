import type { Db } from './db';

/** One event as the oracle sees it. `start` is an ISO instant (Google's dateTime carries an offset). */
export interface CalendarEventLite {
  id: string;
  summary: string;
  start: string;
  end?: string;
  htmlLink?: string;
}

/** Something that can answer "is this in the user's own calendar?" The real one reads Google Calendar (T05). */
export interface Oracle {
  readonly kind: 'calendar';
  connected(): Promise<boolean>;
  listEvents(q: { timeMin: string; timeMax: string; q?: string }): Promise<CalendarEventLite[]>;
  describe(): string;
}

export class FakeCalendarOracle implements Oracle {
  readonly kind = 'calendar' as const;
  constructor(public events: CalendarEventLite[]) {}
  async connected(): Promise<boolean> {
    return true;
  }
  async listEvents(q: { timeMin: string; timeMax: string; q?: string }): Promise<CalendarEventLite[]> {
    const min = Date.parse(q.timeMin);
    const max = Date.parse(q.timeMax);
    const needle = q.q?.toLowerCase();
    return this.events.filter((e) => {
      const t = Date.parse(e.start);
      if (Number.isNaN(t) || t < min || t > max) return false;
      return needle ? e.summary.toLowerCase().includes(needle) : true;
    });
  }
  describe(): string {
    return 'simulated calendar';
  }
}

export class NoOracle implements Oracle {
  readonly kind = 'calendar' as const;
  async connected(): Promise<boolean> {
    return false;
  }
  async listEvents(): Promise<CalendarEventLite[]> {
    throw new Error('no calendar connected');
  }
  describe(): string {
    return 'no calendar connected';
  }
}

/** The event the simulated calendar holds, matching the demo task (Thu 23 Oct 2026, 15:00 London). */
export const FAKE_CALENDAR_DEFAULT: CalendarEventLite[] = [
  { id: 'ev-fake-dental', summary: 'Northfield Dental check-up', start: '2026-10-23T15:00:00+01:00', end: '2026-10-23T15:30:00+01:00' },
];

type OracleFactory = (db: Db) => Oracle | null;
type GlobalWithOracle = typeof globalThis & { __receiptsOracleFactory?: OracleFactory; __receiptsFakeOracle?: FakeCalendarOracle };

/** The live oracle registers itself here (lib/google.ts, T05) so this module never imports it. */
export function registerLiveOracle(factory: OracleFactory): void {
  (globalThis as GlobalWithOracle).__receiptsOracleFactory = factory;
}

export function getOracle(db: Db): Oracle {
  const g = globalThis as GlobalWithOracle;
  if (process.env.ORACLE_MODE === 'fake') {
    if (!g.__receiptsFakeOracle) g.__receiptsFakeOracle = new FakeCalendarOracle([...FAKE_CALENDAR_DEFAULT]);
    return g.__receiptsFakeOracle;
  }
  const live = g.__receiptsOracleFactory?.(db);
  return live ?? new NoOracle();
}
