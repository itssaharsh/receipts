import { NextResponse, type NextRequest } from 'next/server';
import { badRequest, errorResponse, getDeps, readJson } from '@/lib/deps';
import { createRule, listContacts, listRules } from '@/lib/store';
import { RuleInputSchema } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/rules -> {rules, contacts} */
export async function GET() {
  const { db } = getDeps();
  return NextResponse.json({ rules: listRules(db), contacts: listContacts(db) });
}

/** POST /api/rules {RuleInput} -> 201 {rule} */
export async function POST(req: NextRequest) {
  const parsed = RuleInputSchema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest('invalid rule', parsed.error.issues);
  try {
    const rule = createRule(getDeps().db, parsed.data);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
