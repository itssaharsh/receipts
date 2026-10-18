import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, getDeps } from '@/lib/deps';
import { confirmByUser } from '@/lib/runner';

export const dynamic = 'force-dynamic';

/** POST /api/tasks/[id]/confirm -> {task}: the manual tick, shown as "confirmed by you", never as verified. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const task = confirmByUser(getDeps(), id);
    return NextResponse.json({ task });
  } catch (err) {
    return errorResponse(err);
  }
}
