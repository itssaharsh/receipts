import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from './db';
import { getFo } from './fo/client';
import { getOracle } from './oracle';
import { FoNotConnectedError, type RunnerDeps } from './runner';
import { ensureDefaults } from './store';

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

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
