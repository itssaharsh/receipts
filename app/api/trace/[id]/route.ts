import { NextResponse, type NextRequest } from 'next/server';
import { getDeps } from '@/lib/deps';
import { getTask } from '@/lib/store';
import { eventsForTask } from '@/lib/trace';

export const dynamic = 'force-dynamic';

/** GET /api/trace/[id] -> {task, events}: one receipt's events, in the order they happened. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = getDeps();
  const task = getTask(db, id);
  if (!task) return NextResponse.json({ error: `No task ${id}` }, { status: 404 });
  return NextResponse.json({ task, events: eventsForTask(db, id) });
}
