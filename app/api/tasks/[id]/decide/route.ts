import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { badRequest, errorResponse, getDeps, readJson } from '@/lib/deps';
import { decide } from '@/lib/runner';
import { RuleInputSchema, UserDecisionSchema } from '@/lib/types';

export const dynamic = 'force-dynamic';

const Body = z.object({ decision: UserDecisionSchema, rule: RuleInputSchema.optional() });

/** POST /api/tasks/[id]/decide {decision: approve_once | approve_with_rule | decline, rule?} -> {task} */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return badRequest('invalid decision', parsed.error.issues);
  try {
    const task = await decide(getDeps(), id, parsed.data.decision, parsed.data.rule);
    return NextResponse.json({ task });
  } catch (err) {
    return errorResponse(err);
  }
}
