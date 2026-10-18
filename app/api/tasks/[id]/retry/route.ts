import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, getDeps } from '@/lib/deps';
import { retryDispatch } from '@/lib/runner';

export const dynamic = 'force-dynamic';

/** POST /api/tasks/[id]/retry -> {task}: the person asks to send a task Fo did not accept. One ask_fo, never automatic. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const task = await retryDispatch(getDeps(), id);
    return NextResponse.json({ task });
  } catch (err) {
    return errorResponse(err);
  }
}
