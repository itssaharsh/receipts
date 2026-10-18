import { NextResponse, type NextRequest } from 'next/server';
import { badRequest, errorResponse, getDeps, readJson } from '@/lib/deps';
import { createTask } from '@/lib/runner';
import { currentRunId, listTasks } from '@/lib/store';
import { DraftMetaSchema, TaskInputSchema } from '@/lib/types';

const CreateBodySchema = TaskInputSchema.extend({ draft: DraftMetaSchema.optional() });

export const dynamic = 'force-dynamic';

/** GET /api/tasks?run=<id> -> the run's tasks, newest first (the current run by default). */
export async function GET(req: NextRequest) {
  const deps = getDeps();
  const runId = req.nextUrl.searchParams.get('run') ?? currentRunId(deps.db);
  return NextResponse.json({ runId, tasks: listTasks(deps.db, runId) });
}

/** POST /api/tasks {TaskInput} -> 201 {task}: evaluated against the rules; dispatched to Fo when allowed, held otherwise. */
export async function POST(req: NextRequest) {
  const parsed = CreateBodySchema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest('invalid task', parsed.error.issues);
  try {
    const { draft, ...input } = parsed.data;
    const task = await createTask(getDeps(), input, { draft });
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
