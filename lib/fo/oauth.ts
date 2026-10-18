import crypto from 'node:crypto';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Db } from '../db';

type Row = {
  provider: string;
  client_information: string | null;
  tokens: string | null;
  code_verifier: string | null;
  state: string | null;
  discovery: string | null;
  updated_at: string;
};

type PendingState = { state?: string; pendingAuthUrl?: string };

/**
 * The MCP SDK's OAuthClientProvider backed by the `oauth` table: dynamic client registration, PKCE, tokens.
 * `redirectToAuthorization` cannot redirect from a server process, so it stores the URL for the UI to open.
 */
export class SqliteOAuthProvider implements OAuthClientProvider {
  private readonly key: string;

  constructor(
    private readonly db: Db,
    private readonly opts: { redirectUrl: string; provider?: string },
  ) {
    this.key = opts.provider ?? 'fo';
  }

  get redirectUrl(): string {
    return this.opts.redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Receipts',
      client_uri: 'https://github.com/saharsh7002',
      redirect_uris: [this.opts.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'mcp',
    };
  }

  state(): string {
    const s = crypto.randomBytes(16).toString('hex');
    this.patchState({ state: s });
    return s;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    const r = this.row();
    return r?.client_information ? (JSON.parse(r.client_information) as OAuthClientInformationMixed) : undefined;
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    this.upsert({ client_information: JSON.stringify(info) });
  }

  tokens(): OAuthTokens | undefined {
    const r = this.row();
    return r?.tokens ? (JSON.parse(r.tokens) as OAuthTokens) : undefined;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.upsert({ tokens: JSON.stringify(tokens) });
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.patchState({ pendingAuthUrl: authorizationUrl.toString() });
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.upsert({ code_verifier: codeVerifier });
  }

  codeVerifier(): string {
    const r = this.row();
    if (!r?.code_verifier) throw new Error('No PKCE code verifier saved; start the connection again from /connect.');
    return r.code_verifier;
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
    if (scope === 'all') {
      this.upsert({ client_information: null, tokens: null, code_verifier: null, state: null, discovery: null });
      return;
    }
    if (scope === 'client') this.upsert({ client_information: null });
    if (scope === 'tokens') this.upsert({ tokens: null });
    if (scope === 'verifier') this.upsert({ code_verifier: null });
    if (scope === 'discovery') this.upsert({ discovery: null });
  }

  // ---- extras used by the routes --------------------------------------------
  pendingAuthorizationUrl(): string | null {
    return this.readState().pendingAuthUrl ?? null;
  }

  expectedState(): string | null {
    return this.readState().state ?? null;
  }

  clearPendingAuthorization(): void {
    this.upsert({ state: null });
  }

  hasTokens(): boolean {
    return !!this.tokens()?.access_token;
  }

  // ---- storage ------------------------------------------------------------------
  private row(): Row | undefined {
    return this.db.prepare('select * from oauth where provider = ?').get(this.key) as Row | undefined;
  }

  private readState(): PendingState {
    const r = this.row();
    return r?.state ? (JSON.parse(r.state) as PendingState) : {};
  }

  private patchState(patch: PendingState): void {
    this.upsert({ state: JSON.stringify({ ...this.readState(), ...patch }) });
  }

  private upsert(patch: Partial<Omit<Row, 'provider' | 'updated_at'>>): void {
    const cur = this.row() ?? { provider: this.key, client_information: null, tokens: null, code_verifier: null, state: null, discovery: null, updated_at: '' };
    const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
    this.db
      .prepare(
        `insert into oauth (provider, client_information, tokens, code_verifier, state, discovery, updated_at)
         values (@provider, @client_information, @tokens, @code_verifier, @state, @discovery, @updated_at)
         on conflict(provider) do update set client_information = excluded.client_information, tokens = excluded.tokens,
           code_verifier = excluded.code_verifier, state = excluded.state, discovery = excluded.discovery, updated_at = excluded.updated_at`,
      )
      .run(next);
  }
}
