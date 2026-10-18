import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { SqliteOAuthProvider } from '@/lib/fo/oauth';
import { FoClient } from '@/lib/fo/client';

const SERVER = 'https://mcp.example.test/fo';
const REDIRECT = 'http://localhost:3000/api/fo/callback';

/** A fake Wajo: protected-resource metadata, AS metadata, dynamic registration, token endpoint and the MCP endpoint. */
function fakeWajo(opts: { validTokens: Set<string>; refreshable: Record<string, string> }) {
  const calls: Array<{ method: string; path: string; auth: string | null; body: string | null }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? {});
    const body = typeof init?.body === 'string' ? init.body : init?.body ? String(init.body) : null;
    calls.push({ method, path: url.pathname, auth: headers.get('authorization'), body });
    const json = (o: unknown, status = 200, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...extra } });

    if (url.pathname === '/.well-known/oauth-protected-resource/fo' || url.pathname === '/.well-known/oauth-protected-resource') {
      return json({ authorization_servers: ['https://mcp.example.test'], bearer_methods_supported: ['header'], resource: 'https://mcp.example.test/fo', scopes_supported: ['mcp'] });
    }
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return json({
        issuer: 'https://mcp.example.test',
        authorization_endpoint: 'https://mcp.example.test/oauth/authorize',
        token_endpoint: 'https://mcp.example.test/oauth/token',
        registration_endpoint: 'https://mcp.example.test/oauth/register',
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        scopes_supported: ['mcp'],
      });
    }
    if (url.pathname.startsWith('/.well-known/')) return new Response('not found', { status: 404 });
    if (url.pathname === '/oauth/register' && method === 'POST') {
      const meta = JSON.parse(body ?? '{}');
      return json({ client_id: 'cid-receipts', client_id_issued_at: 1, ...meta }, 201);
    }
    if (url.pathname === '/oauth/token' && method === 'POST') {
      const params = new URLSearchParams(body ?? '');
      if (params.get('grant_type') === 'authorization_code' && params.get('code') === 'code-1') {
        opts.validTokens.add('at-1');
        return json({ access_token: 'at-1', token_type: 'Bearer', expires_in: 3600, refresh_token: 'rt-1', scope: 'mcp' });
      }
      if (params.get('grant_type') === 'refresh_token' && opts.refreshable[params.get('refresh_token') ?? '']) {
        const next = opts.refreshable[params.get('refresh_token')!];
        opts.validTokens.add(next);
        return json({ access_token: next, token_type: 'Bearer', expires_in: 3600, refresh_token: 'rt-2', scope: 'mcp' });
      }
      return json({ error: 'invalid_grant' }, 400);
    }
    if (url.pathname === '/fo') {
      const token = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!opts.validTokens.has(token)) {
        return json({ error: 'unauthorized' }, 401, {
          'www-authenticate': 'Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/fo"',
        });
      }
      if (method === 'GET') return new Response(null, { status: 405 });
      if (method === 'DELETE') return new Response(null, { status: 200 });
      const msg = JSON.parse(body ?? '{}');
      if (msg.method === 'initialize') {
        return json(
          {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: { tools: { listChanged: true } },
              serverInfo: { name: 'wajo-fo-fake', version: '0.0.1' },
              instructions: '# Fo (fake)',
            },
          },
          200,
          { 'mcp-session-id': 'sess-1' },
        );
      }
      if (msg.method === 'tools/list') {
        return json({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'ask_fo', description: 'ask', inputSchema: { type: 'object' } }] } });
      }
      return new Response(null, { status: 202 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('SqliteOAuthProvider', () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('round-trips client information, tokens and the code verifier, and stores the authorization URL', async () => {
    const p = new SqliteOAuthProvider(db, { redirectUrl: REDIRECT });
    expect(await p.clientInformation()).toBeUndefined();
    await p.saveClientInformation({ client_id: 'cid-1', redirect_uris: [REDIRECT] });
    expect((await p.clientInformation())?.client_id).toBe('cid-1');
    await p.saveTokens({ access_token: 'a', token_type: 'Bearer', refresh_token: 'r' });
    expect((await p.tokens())?.refresh_token).toBe('r');
    await p.saveCodeVerifier('verifier-xyz');
    expect(await p.codeVerifier()).toBe('verifier-xyz');
    await p.redirectToAuthorization(new URL('https://mcp.example.test/oauth/authorize?client_id=cid-1&code_challenge=abc'));
    expect(p.pendingAuthorizationUrl()).toContain('code_challenge=abc');
    await p.invalidateCredentials('tokens');
    expect(await p.tokens()).toBeUndefined();
    expect((await p.clientInformation())?.client_id).toBe('cid-1');
    expect(p.clientMetadata.redirect_uris).toEqual([REDIRECT]);
    expect(p.clientMetadata.token_endpoint_auth_method).toBe('none');
  });
});

describe('FoClient live OAuth flow against a fake Wajo (AC-12)', () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('with no tokens, connect() registers the client and returns the authorization URL instead of connecting', async () => {
    const wajo = fakeWajo({ validTokens: new Set(), refreshable: {} });
    const fo = new FoClient(db, { mode: 'live', url: SERVER, redirectUrl: REDIRECT, fetch: wajo.fetchImpl });
    const r = await fo.connect();
    expect(r.connected).toBe(false);
    if (r.connected) throw new Error('unreachable');
    const u = new URL(r.authorizationUrl);
    expect(u.origin + u.pathname).toBe('https://mcp.example.test/oauth/authorize');
    expect(u.searchParams.get('client_id')).toBe('cid-receipts');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(wajo.calls.some((c) => c.path === '/oauth/register' && c.method === 'POST')).toBe(true);
    await fo.close();
  });

  it('finishAuth(code) exchanges the code and stores the tokens; the next connect() succeeds', async () => {
    const wajo = fakeWajo({ validTokens: new Set(), refreshable: {} });
    const fo = new FoClient(db, { mode: 'live', url: SERVER, redirectUrl: REDIRECT, fetch: wajo.fetchImpl });
    const r = await fo.connect();
    expect(r.connected).toBe(false);
    await fo.finishAuth('code-1');
    const provider = new SqliteOAuthProvider(db, { redirectUrl: REDIRECT });
    expect((await provider.tokens())?.access_token).toBe('at-1');
    await fo.close();
    const fo2 = new FoClient(db, { mode: 'live', url: SERVER, redirectUrl: REDIRECT, fetch: wajo.fetchImpl });
    const r2 = await fo2.connect();
    expect(r2.connected).toBe(true);
    await fo2.close();
  });

  it('an expired access token is refreshed once and the connection proceeds', async () => {
    const wajo = fakeWajo({ validTokens: new Set(['at-new']), refreshable: { 'rt-1': 'at-new' } });
    const provider = new SqliteOAuthProvider(db, { redirectUrl: REDIRECT });
    await provider.saveClientInformation({ client_id: 'cid-receipts', redirect_uris: [REDIRECT] });
    await provider.saveTokens({ access_token: 'at-old', token_type: 'Bearer', refresh_token: 'rt-1' });
    const fo = new FoClient(db, { mode: 'live', url: SERVER, redirectUrl: REDIRECT, fetch: wajo.fetchImpl });
    const r = await fo.connect();
    expect(r.connected).toBe(true);
    const refresh = wajo.calls.find((c) => c.path === '/oauth/token' && (c.body ?? '').includes('grant_type=refresh_token'));
    expect(refresh).toBeTruthy();
    expect((await provider.tokens())?.access_token).toBe('at-new');
    await fo.close();
  });
});
