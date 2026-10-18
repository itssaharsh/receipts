import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { badRequest, errorResponse, getDeps, readJson } from '@/lib/deps';
import { answerQuestion } from '@/lib/runner';

export const dynamic = 'force-dynamic';

const Body = z.object({ answer: z.string().min(1).max(1000) });

/** POST /api/tasks/[id]/answer {answer} -> {task}: the user answers a question Fo asked that the rules could not. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return badRequest('invalid answer', parsed.error.issues);
  try {
    const task = await answerQuestion(getDeps(), id, parsed.data.answer);
    return NextResponse.json({ task });
  } catch (err) {
    return errorResponse(err);
  }
}
