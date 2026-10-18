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

/** "2026-10-22T15:00:00+05:30": the given wall-clock time in this process's own zone, with its offset. */
export function localWallISO(y: number, m: number, d: number, h: number, mi: number): string {
  const dt = new Date(y, m - 1, d, h, mi);
  const off = -dt.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(d)}T${p(h)}:${p(mi)}:00${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}

/** The event the simulated calendar holds: the demo booking, Thu 22 Oct 2026 at 15:00 in this machine's own zone (the browser on the same machine fills the same wall time). */
export function fakeCalendarDefault(): CalendarEventLite[] {
  return [{ id: 'ev-fake-dental', summary: 'Northfield Dental check-up', start: localWallISO(2026, 10, 22, 15, 0), end: localWallISO(2026, 10, 22, 15, 30) }];
}

export const FAKE_CALENDAR_DEFAULT: CalendarEventLite[] = fakeCalendarDefault();

type OracleFactory = (db: Db) => Oracle | null;
type GlobalWithOracle = typeof globalThis & { __receiptsOracleFactory?: OracleFactory; __receiptsFakeOracle?: FakeCalendarOracle };

/** The live oracle registers itself here (lib/google.ts, T05) so this module never imports it. */
export function registerLiveOracle(factory: OracleFactory): void {
  (globalThis as GlobalWithOracle).__receiptsOracleFactory = factory;
}

export function getOracle(db: Db): Oracle {
  const g = globalThis as GlobalWithOracle;
  if (process.env.ORACLE_MODE === 'fake') {
    if (!g.__receiptsFakeOracle) g.__receiptsFakeOracle = new FakeCalendarOracle(fakeCalendarDefault());
    return g.__receiptsFakeOracle;
  }
  const live = g.__receiptsOracleFactory?.(db);
  return live ?? new NoOracle();
}
