import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { GoogleAuth, GoogleCalendarOracle, googleFromEnv } from '@/lib/google';

const REDIRECT = 'http://localhost:3000/api/google/callback';

function fakeGoogle(opts: { valid: Set<string>; refreshTo: string | null }) {
  const calls: Array<{ method: string; url: string; auth: string | null; body: string | null }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const u = new URL(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? {});
    const body = typeof init?.body === 'string' ? init.body : init?.body ? String(init.body) : null;
    calls.push({ method, url, auth: headers.get('authorization'), body });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    if (u.host === 'oauth2.googleapis.com' && u.pathname === '/token' && method === 'POST') {
      const p = new URLSearchParams(body ?? '');
      if (p.get('grant_type') === 'authorization_code' && p.get('code') === 'code-g') {
        opts.valid.add('ga-1');
        return json({ access_token: 'ga-1', refresh_token: 'gr-1', expires_in: 3600, scope: 'https://www.googleapis.com/auth/calendar.readonly', token_type: 'Bearer' });
      }
      if (p.get('grant_type') === 'refresh_token' && p.get('refresh_token') === 'gr-1' && opts.refreshTo) {
        opts.valid.add(opts.refreshTo);
        return json({ access_token: opts.refreshTo, expires_in: 3600, token_type: 'Bearer' });
      }
      return json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
    }
    if (u.host === 'www.googleapis.com' && u.pathname === '/calendar/v3/calendars/primary/events') {
      const token = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!opts.valid.has(token)) return json({ error: { code: 401, message: 'Invalid Credentials' } }, 401);
      return json({
        items: [
          { id: 'ev-7kq', summary: 'Northfield Dental check-up', start: { dateTime: '2026-10-22T15:00:00+01:00' }, end: { dateTime: '2026-10-22T15:30:00+01:00' }, htmlLink: 'https://calendar.google.com/event?eid=1' },
          { id: 'ev-allday', summary: 'Dental hygiene day', start: { date: '2026-10-22' } },
        ],
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('Google Calendar oracle (AC-6, T05)', () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('builds an authorization URL for read-only calendar access with offline refresh', () => {
    const g = new GoogleAuth(db, { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'GOCSPX-x', redirectUrl: REDIRECT });
    const u = new URL(g.authorizationUrl());
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('client_id')).toBe('cid.apps.googleusercontent.com');
    expect(u.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.readonly');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('state')).toBe(g.expectedState());
    expect(g.connected()).toBe(false);
  });

  it('exchanges the code, stores the tokens and reads events with the access token', async () => {
    const goog = fakeGoogle({ valid: new Set(), refreshTo: null });
    const g = new GoogleAuth(db, { clientId: 'cid', clientSecret: 's', redirectUrl: REDIRECT, fetch: goog.fetchImpl });
    await g.exchangeCode('code-g');
    expect(g.connected()).toBe(true);
    const oracle = new GoogleCalendarOracle(g, goog.fetchImpl);
    expect(await oracle.connected()).toBe(true);
    const events = await oracle.listEvents({ timeMin: '2026-10-22T13:30:00.000Z', timeMax: '2026-10-22T14:30:00.000Z', q: 'Dental' });
    expect(events.map((e) => e.id)).toEqual(['ev-7kq', 'ev-allday']);
    expect(events[0].start).toBe('2026-10-22T15:00:00+01:00');
    expect(events[1].start).toBe('2026-10-22');
    const call = goog.calls.find((c) => c.url.includes('/calendar/v3/'));
    expect(call?.auth).toBe('Bearer ga-1');
    const q = new URL(call!.url).searchParams;
    expect(q.get('timeMin')).toBe('2026-10-22T13:30:00.000Z');
    expect(q.get('q')).toBe('Dental');
    expect(q.get('singleEvents')).toBe('true');
    expect(oracle.describe()).toMatch(/Google Calendar/);
  });

  it('refreshes an expired token once before reading, and retries once on a 401', async () => {
    const goog = fakeGoogle({ valid: new Set(['ga-2']), refreshTo: 'ga-2' });
    const g = new GoogleAuth(db, { clientId: 'cid', clientSecret: 's', redirectUrl: REDIRECT, fetch: goog.fetchImpl, now: () => Date.parse('2026-10-18T12:00:00Z') });
    g.saveTokens({ access_token: 'ga-old', refresh_token: 'gr-1', expiry: Date.parse('2026-10-18T11:00:00Z'), token_type: 'Bearer' });
    const oracle = new GoogleCalendarOracle(g, goog.fetchImpl);
    const events = await oracle.listEvents({ timeMin: '2026-10-22T13:30:00.000Z', timeMax: '2026-10-22T14:30:00.000Z' });
    expect(events).toHaveLength(2);
    expect(goog.calls.filter((c) => c.url.includes('/token')).length).toBe(1);
    expect(g.tokens()?.access_token).toBe('ga-2');

    // a token that looks valid but is rejected: one refresh, one retry
    const goog2 = fakeGoogle({ valid: new Set(['ga-3']), refreshTo: 'ga-3' });
    const g2 = new GoogleAuth(db, { clientId: 'cid', clientSecret: 's', redirectUrl: REDIRECT, fetch: goog2.fetchImpl, now: () => Date.parse('2026-10-18T12:00:00Z') });
    g2.saveTokens({ access_token: 'ga-rejected', refresh_token: 'gr-1', expiry: Date.parse('2026-10-18T13:00:00Z'), token_type: 'Bearer' });
    const o2 = new GoogleCalendarOracle(g2, goog2.fetchImpl);
    const ev2 = await o2.listEvents({ timeMin: '2026-10-22T13:30:00.000Z', timeMax: '2026-10-22T14:30:00.000Z' });
    expect(ev2).toHaveLength(2);
    expect(goog2.calls.filter((c) => c.url.includes('/calendar/v3/')).length).toBe(2);
  });

  it('when the refresh is revoked, the oracle reports no calendar connected', async () => {
    const goog = fakeGoogle({ valid: new Set(), refreshTo: null });
    const g = new GoogleAuth(db, { clientId: 'cid', clientSecret: 's', redirectUrl: REDIRECT, fetch: goog.fetchImpl, now: () => Date.parse('2026-10-18T12:00:00Z') });
    g.saveTokens({ access_token: 'ga-old', refresh_token: 'gr-1', expiry: 0, token_type: 'Bearer' });
    const oracle = new GoogleCalendarOracle(g, goog.fetchImpl);
    await expect(oracle.listEvents({ timeMin: '2026-10-22T13:30:00.000Z', timeMax: '2026-10-22T14:30:00.000Z' })).rejects.toThrow(/no calendar connected|revoked/i);
    expect(g.connected()).toBe(false);
  });

  it('with no client configured there is no Google auth', () => {
    const saved = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(googleFromEnv(db)).toBeNull();
    if (saved.id) process.env.GOOGLE_CLIENT_ID = saved.id;
    if (saved.secret) process.env.GOOGLE_CLIENT_SECRET = saved.secret;
  });
});
