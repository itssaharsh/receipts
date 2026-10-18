import crypto from 'node:crypto';
import type { Db } from './db';
import { type CalendarEventLite, type Oracle, registerLiveOracle } from './oracle';

/**
 * Google OAuth (authorization code, offline) and the read-only Calendar oracle.
 * Plain fetch, no SDK: two endpoints and one list call. Tokens live in the `oauth` table under provider 'google'.
 */
export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  /** epoch ms when the access token expires */
  expiry: number;
  scope?: string;
  token_type?: string;
}

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

type Row = { tokens: string | null; state: string | null };

export class GoogleAuth {
  constructor(
    private readonly db: Db,
    private readonly opts: { clientId: string; clientSecret: string; redirectUrl: string; fetch?: typeof fetch; now?: () => number },
  ) {}

  private get fetchFn(): typeof fetch {
    return this.opts.fetch ?? fetch;
  }
  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private row(): Row | undefined {
    return this.db.prepare('select tokens, state from oauth where provider = ?').get('google') as Row | undefined;
  }

  private upsert(patch: Partial<Row>): void {
    const cur = this.row() ?? { tokens: null, state: null };
    const next = { ...cur, ...patch };
    this.db
      .prepare(
        `insert into oauth (provider, tokens, state, updated_at) values ('google', @tokens, @state, @updated_at)
         on conflict(provider) do update set tokens = excluded.tokens, state = excluded.state, updated_at = excluded.updated_at`,
      )
      .run({ ...next, updated_at: new Date().toISOString() });
  }

  /** Where to send the browser. The state is stored so the callback can check it. */
  authorizationUrl(): string {
    const state = crypto.randomBytes(16).toString('hex');
    this.upsert({ state });
    const u = new URL(AUTH_URL);
    u.searchParams.set('client_id', this.opts.clientId);
    u.searchParams.set('redirect_uri', this.opts.redirectUrl);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', CALENDAR_SCOPE);
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('prompt', 'consent');
    u.searchParams.set('include_granted_scopes', 'true');
    u.searchParams.set('state', state);
    return u.toString();
  }

  expectedState(): string | null {
    return this.row()?.state ?? null;
  }

  tokens(): GoogleTokens | null {
    const r = this.row();
    return r?.tokens ? (JSON.parse(r.tokens) as GoogleTokens) : null;
  }

  saveTokens(t: GoogleTokens): void {
    this.upsert({ tokens: JSON.stringify(t) });
  }

  connected(): boolean {
    return !!this.tokens()?.access_token;
  }

  disconnect(): void {
    this.upsert({ tokens: null, state: null });
  }

  private async tokenRequest(params: Record<string, string>): Promise<GoogleTokens> {
    const body = new URLSearchParams({ client_id: this.opts.clientId, client_secret: this.opts.clientSecret, ...params });
    const res = await this.fetchFn(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof data.access_token !== 'string') {
      const desc = typeof data.error_description === 'string' ? data.error_description : typeof data.error === 'string' ? data.error : `HTTP ${res.status}`;
      throw new Error(`Google token request failed: ${desc}`);
    }
    const prev = this.tokens();
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    const next: GoogleTokens = {
      access_token: data.access_token,
      refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : prev?.refresh_token,
      expiry: this.now() + expiresIn * 1000,
      scope: typeof data.scope === 'string' ? data.scope : prev?.scope,
      token_type: typeof data.token_type === 'string' ? data.token_type : 'Bearer',
    };
    this.saveTokens(next);
    return next;
  }

  async exchangeCode(code: string): Promise<GoogleTokens> {
    const t = await this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: this.opts.redirectUrl });
    this.upsert({ state: null });
    return t;
  }

  /** A fresh access token: refreshed when within 60 s of expiry. Throws when there is nothing to refresh with. */
  async accessToken(force = false): Promise<string> {
    const t = this.tokens();
    if (!t) throw new Error('no calendar connected');
    if (!force && t.expiry - 60_000 > this.now()) return t.access_token;
    if (!t.refresh_token) {
      this.disconnect();
      throw new Error('no calendar connected: the Google session expired and cannot be refreshed');
    }
    try {
      const next = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
      return next.access_token;
    } catch (err) {
      this.disconnect();
      throw new Error(`no calendar connected: ${(err as Error).message} (revoked or expired; connect again)`);
    }
  }
}

export class GoogleCalendarOracle implements Oracle {
  readonly kind = 'calendar' as const;
  constructor(
    private readonly auth: GoogleAuth,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async connected(): Promise<boolean> {
    return this.auth.connected();
  }

  describe(): string {
    return 'Google Calendar (read-only), the primary calendar';
  }

  async listEvents(q: { timeMin: string; timeMax: string; q?: string }): Promise<CalendarEventLite[]> {
    const run = async (token: string) => {
      const u = new URL(EVENTS_URL);
      u.searchParams.set('timeMin', q.timeMin);
      u.searchParams.set('timeMax', q.timeMax);
      // Google's q matches whole words ("Dent" finds nothing in "Dentist"); the window is small, so list it all and match the title here
      u.searchParams.set('singleEvents', 'true');
      u.searchParams.set('orderBy', 'startTime');
      u.searchParams.set('maxResults', '20');
      return this.fetchFn(u.toString(), { headers: { authorization: `Bearer ${token}` } });
    };
    let res = await run(await this.auth.accessToken());
    if (res.status === 401) res = await run(await this.auth.accessToken(true));
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google Calendar answered ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }
    const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
    return (data.items ?? []).map((it) => {
      const start = (it.start ?? {}) as { dateTime?: string; date?: string };
      const end = (it.end ?? {}) as { dateTime?: string; date?: string };
      return {
        id: String(it.id ?? ''),
        summary: typeof it.summary === 'string' ? it.summary : '(no title)',
        start: start.dateTime ?? start.date ?? '',
        end: end.dateTime ?? end.date,
        htmlLink: typeof it.htmlLink === 'string' ? it.htmlLink : undefined,
      };
    });
  }
}

export function googleFromEnv(db: Db, fetchFn?: typeof fetch): GoogleAuth | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3100').replace(/\/$/, '');
  return new GoogleAuth(db, { clientId, clientSecret, redirectUrl: `${appUrl}/api/google/callback`, fetch: fetchFn });
}

/** Make the Google oracle the live one whenever a connected Google session exists. */
export function registerGoogleOracle(): void {
  registerLiveOracle((db) => {
    const auth = googleFromEnv(db);
    return auth && auth.connected() ? new GoogleCalendarOracle(auth) : null;
  });
}
