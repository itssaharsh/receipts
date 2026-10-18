import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { badRequest, forbidden, getDeps, readJson, sameOrigin } from '@/lib/deps';
import { draft, modelOptionsFromEnv } from '@/lib/draft';
import { listContacts } from '@/lib/store';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  text: z.string().trim().min(3).max(2000),
  /** The browser's local wall clock, 'YYYY-MM-DDTHH:MM', so weekdays resolve in the person's zone. */
  nowLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/),
  timeZone: z.string().max(80).nullable().optional(),
});

/**
 * POST /api/draft {text, nowLocal, timeZone} -> {draft, source, model, ms, note}.
 * Proposes the fields and the check from one sentence. Nothing is sent to Fo and nothing is stored: the person edits,
 * then sends; the rules evaluate what they confirmed. Only the contacts' names leave this computer, never their details.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  const parsed = BodySchema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest('invalid draft request', parsed.error.issues);
  const { db } = getDeps();
  const contacts = listContacts(db).map((c) => ({ name: c.name }));
  const result = await draft(parsed.data.text, { nowLocal: parsed.data.nowLocal.slice(0, 16), timeZone: parsed.data.timeZone ?? null, contacts }, modelOptionsFromEnv());
  return NextResponse.json(result);
}
