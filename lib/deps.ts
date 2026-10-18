import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from './db';
import { getFo } from './fo/client';
import { registerGoogleOracle } from './google';
import { getOracle } from './oracle';
import { FoNotConnectedError, type RunnerDeps } from './runner';
import { ensureDefaults } from './store';

registerGoogleOracle();

/** Everything a route needs, built from the environment. Defaults are ensured once per call (idempotent, cheap). */
export function getDeps(): RunnerDeps {
  const db = getDb();
  ensureDefaults(db);
  return { db, fo: getFo(db), oracle: getOracle(db) };
}

export function badRequest(error: string, issues?: unknown) {
  return NextResponse.json({ error, issues }, { status: 400 });
}

/** Turn a thrown error into the response the UI expects. */
export function errorResponse(err: unknown) {
  if (err instanceof FoNotConnectedError) {
    return NextResponse.json({ error: err.message, authorizationUrl: err.authorizationUrl }, { status: 409 });
  }
  if (err instanceof z.ZodError) return badRequest('invalid input', err.issues);
  const message = err instanceof Error ? err.message : String(err);
  const status = /^No task /.test(message) ? 404 : /not waiting|has no open question|cannot be confirmed|always wait/.test(message) ? 409 : 500;
  return NextResponse.json({ error: message }, { status });
}

/** Write routes accept only same-origin requests (a local, single-user app; this keeps a stray page from driving it). */
export function sameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3100').replace(/\/$/, '');
  try {
    const o = new URL(origin);
    const a = new URL(appUrl);
    return o.host === a.host || o.hostname === 'localhost' || o.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function forbidden() {
  return NextResponse.json({ error: 'Only this app may call this from the browser.' }, { status: 403 });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
