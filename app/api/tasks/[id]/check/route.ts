import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, getDeps } from '@/lib/deps';
import { check } from '@/lib/runner';

export const dynamic = 'force-dynamic';

/** POST /api/tasks/[id]/check -> {task}: run the postcondition against the user's calendar now. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const task = await check(getDeps(), id);
    return NextResponse.json({ task });
  } catch (err) {
    return errorResponse(err);
  }
}
