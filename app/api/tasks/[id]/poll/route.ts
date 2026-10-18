import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, getDeps } from '@/lib/deps';
import { poll } from '@/lib/runner';

export const dynamic = 'force-dynamic';

/** POST /api/tasks/[id]/poll -> {task}: one step forward (one get_fo_reply, or the dispatch, or the check). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const task = await poll(getDeps(), id);
    return NextResponse.json({ task });
  } catch (err) {
    return errorResponse(err);
  }
}
