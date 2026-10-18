import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, forbidden, getDeps, sameOrigin } from '@/lib/deps';
import { seedDemo } from '@/lib/seed';

export const dynamic = 'force-dynamic';

/** POST /api/demo/seed -> {task}: one demo run against the simulated Fo (refused with the live Fo). Same origin only. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  try {
    const task = await seedDemo(getDeps());
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    const message = (err as Error).message;
    if (/simulated Fo/.test(message)) return NextResponse.json({ error: message }, { status: 409 });
    return errorResponse(err);
  }
}
