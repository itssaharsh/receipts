import { z } from 'zod';
import { TaskCategorySchema, type Contact, type TaskCategory } from './types';

/**
 * The drafter: one sentence in, the task's fields and its check out, for the person to look at and edit before sending.
 * Two drafters, the same shape: a model over an OpenAI-compatible route (Vercel AI Gateway by default), and a plain
 * reading of the words that needs no network. The rules never see a draft; they evaluate what the person confirmed.
 */

export const DraftPostconditionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('calendar_event'),
    titleContains: z.string().trim().min(1).max(120),
    /** The person's local wall time, the same shape a datetime-local field holds. The browser adds its own offset. */
    startLocal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
      .transform((v) => v.slice(0, 16)),
    windowMinutes: z.number().int().positive().max(24 * 60).default(30),
  }),
  z.object({ kind: z.literal('none') }),
]);

export const DraftSchema = z.object({
  counterparty: z.string().trim().max(200),
  category: TaskCategorySchema,
  amountCents: z.number().int().nonnegative().max(100_000_00),
  postcondition: DraftPostconditionSchema,
  /** One sentence for the person: who Fo will contact and what will be checked. */
  summary: z.string().trim().max(300),
});
export type Draft = z.infer<typeof DraftSchema>;

export type DraftSource = 'model' | 'words';
export type DraftResult = { draft: Draft; source: DraftSource; model: string | null; ms: number; note: string | null };

export type DraftContext = {
  /** 'YYYY-MM-DDTHH:MM' in the person's own zone (the browser's clock), so "Thursday 3pm" lands on their Thursday. */
  nowLocal: string;
  timeZone?: string | null;
  contacts: Pick<Contact, 'name'>[];
};

// ---- the words ----------------------------------------------------------------------------------------------------

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const NOT_A_NAME = new Set([...WEEKDAYS, ...WEEKDAYS.map((d) => d.slice(0, 3)), ...MONTHS, 'today', 'tomorrow', 'next', 'book', 'email', 'call', 'order', 'cancel', 'pay', 'ask', 'tell', 'text', 'send', 'please', 'fo', 'thursday', 'the', 'my', 'me', 'i']);

type Wall = { y: number; m: number; d: number; hh: number; mi: number };

function parseWall(s: string): Wall | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3], hh: +m[4], mi: +m[5] };
}
/** Wall-clock arithmetic with no zone: the wall is treated as UTC and never converted. */
function wallToMs(w: Wall): number {
  return Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mi);
}
function msToWall(ms: number): Wall {
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mi: d.getUTCMinutes() };
}
function fmtWall(w: Wall): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${w.y}-${p(w.m)}-${p(w.d)}T${p(w.hh)}:${p(w.mi)}`;
}
function weekdayOf(w: Wall): number {
  return new Date(wallToMs(w)).getUTCDay();
}

export function amountFromWords(text: string): number {
  const m = /(?:\$|£|€|usd\s?|rs\.?\s?|₹)\s?(\d+(?:[.,]\d{1,2})?)/i.exec(text) ?? /(\d+(?:\.\d{1,2})?)\s?(?:dollars|bucks|usd|quid|pounds|euros|rupees)\b/i.exec(text);
  if (!m) return 0;
  return Math.round(parseFloat(m[1].replace(',', '.')) * 100);
}

export function categoryFromWords(text: string): TaskCategory {
  const t = text.toLowerCase();
  if (/\bcancel/.test(t)) return 'cancellation';
  if (/\b(buy|order|purchase|pay|renew|subscribe|top up|send (?:\$|money))\b/.test(t) || /(?:\$|£|€|₹)\s?\d/.test(t)) return 'purchase';
  if (/\b(book|appointment|reserve|reservation|schedule|reschedule|check-?up|table for|slot)\b/.test(t)) return 'booking';
  if (/\b(call|phone|ring)\b/.test(t)) return 'call';
  if (/\b(email|e-mail|mail|write to|message|text|tell|let .{1,40} know|ask)\b/.test(t)) return 'email';
  return 'other';
}

export function counterpartyFromWords(text: string, contacts: Pick<Contact, 'name'>[]): string {
  const lower = text.toLowerCase();
  let best: { name: string; at: number } | null = null;
  for (const c of contacts) {
    const name = c.name.trim();
    if (!name) continue;
    const at = lower.indexOf(name.toLowerCase());
    if (at >= 0 && (!best || at < best.at)) best = { name, at };
  }
  if (best) return best.name;
  // A run of capitalised words that is not at the start of the sentence and is not a day or a month.
  const re = /\b([A-Z][a-zA-Z'&.-]+(?:\s+[A-Z][a-zA-Z'&.-]+)*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index === 0) {
      // the sentence's first word is capitalised for free: drop it, keep any names that follow it
      const rest = m[1].split(/\s+/).slice(1).filter((w) => !NOT_A_NAME.has(w.toLowerCase()));
      if (rest.length === 0) continue;
      return rest.join(' ');
    }
    const words = m[1].split(/\s+/).filter((w) => !NOT_A_NAME.has(w.toLowerCase()));
    if (words.length === 0) continue;
    const name = words.join(' ');
    if (name.length >= 3) return name;
  }
  return '';
}

/** "Thursday 3pm", "tomorrow at 9:30", "next Monday 14:00", "22 Oct 3pm", "Oct 22 at noon" -> a local wall time, or null. */
export function whenFromWords(text: string, nowLocal: string): Wall | null {
  const now = parseWall(nowLocal);
  if (!now) return null;
  const t = text.toLowerCase();

  let hh: number | null = null;
  let mi = 0;
  const tm = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)\b/.exec(t) ?? /\b(\d{1,2}):(\d{2})\b/.exec(t);
  if (tm) {
    hh = +tm[1];
    mi = tm[2] ? +tm[2] : 0;
    const ap = tm[3]?.replace(/\./g, '');
    if (ap === 'pm' && hh < 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    if (hh > 23 || mi > 59) hh = null;
  } else if (/\bnoon\b|\bmidday\b/.test(t)) hh = 12;
  else if (/\bmorning\b/.test(t)) hh = 9;
  else if (/\bafternoon\b/.test(t)) hh = 14;
  else if (/\bevening\b/.test(t)) hh = 18;

  let day: Wall | null = null;
  const dm = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.exec(t) ?? /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(t);
  if (dm) {
    const dayNum = /^\d/.test(dm[1]) ? +dm[1] : +dm[2];
    const mon = MONTHS.indexOf((/^\d/.test(dm[1]) ? dm[2] : dm[1]).slice(0, 3)) + 1;
    if (mon > 0 && dayNum >= 1 && dayNum <= 31) {
      day = { y: now.y, m: mon, d: dayNum, hh: 0, mi: 0 };
      if (wallToMs(day) < wallToMs({ ...now, hh: 0, mi: 0 })) day.y += 1;
    }
  }
  if (!day) {
    if (/\btoday\b/.test(t)) day = { ...now };
    else if (/\btomorrow\b/.test(t)) day = msToWall(wallToMs(now) + 86_400_000);
    else {
      const wd = /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/.exec(t);
      if (wd) {
        const target = WEEKDAYS.findIndex((w) => w.startsWith(wd[2].slice(0, 3)));
        let ahead = (target - weekdayOf(now) + 7) % 7;
        if (ahead === 0 && (hh === null || hh * 60 + mi <= now.hh * 60 + now.mi)) ahead = 7;
        if (wd[1] && ahead < 7) ahead += 0; // "next Thursday" this week still means the coming Thursday in everyday speech
        day = msToWall(wallToMs(now) + ahead * 86_400_000);
      }
    }
  }
  if (!day && hh === null) return null;
  if (!day) {
    // a time with no day: today if still ahead, else tomorrow
    const minutes = (hh ?? 0) * 60 + mi;
    day = minutes > now.hh * 60 + now.mi ? { ...now } : msToWall(wallToMs(now) + 86_400_000);
  }
  return { y: day.y, m: day.m, d: day.d, hh: hh ?? 9, mi: hh === null ? 0 : mi };
}

const TITLE_STEMS: [RegExp, string][] = [
  [/\bdent(ist|al)\b/i, 'Dent'],
  [/\b(doctor|gp|clinic|physio|physiotherap)/i, 'Appointment'],
  [/\bvet\b/i, 'Vet'],
  [/\b(haircut|barber|salon|hairdresser)\b/i, 'Hair'],
  [/\b(dinner|lunch|table|restaurant|brunch)\b/i, 'Dinner'],
  [/\bmeeting\b/i, 'Meeting'],
  [/\binterview\b/i, 'Interview'],
  [/\bflight\b/i, 'Flight'],
  [/\bhotel\b/i, 'Hotel'],
  [/\b(mot|service|garage|mechanic)\b/i, 'Car'],
];

export function titleFromWords(text: string, counterparty: string): string {
  for (const [re, stem] of TITLE_STEMS) if (re.test(text)) return stem;
  const first = counterparty.split(/\s+/)[0];
  return first && first.length >= 3 ? first : 'Appointment';
}

export function prettyLocal(startLocal: string): string {
  const w = parseWall(startLocal);
  if (!w) return startLocal;
  const d = new Date(wallToMs(w));
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day} ${String(w.hh).padStart(2, '0')}:${String(w.mi).padStart(2, '0')}`;
}

export function summarise(d: Omit<Draft, 'summary'>): string {
  const who = d.counterparty ? `Fo will contact ${d.counterparty}` : 'Fo will contact whoever the sentence names';
  if (d.postcondition.kind === 'calendar_event') {
    return `${who}; verified when an event containing “${d.postcondition.titleContains}” appears around ${prettyLocal(d.postcondition.startLocal)}.`;
  }
  return `${who}; no automatic check for this one, you confirm it by hand.`;
}

/** The plain reading of the words. Deterministic, no network, under a millisecond. */
export function draftFromWords(text: string, ctx: DraftContext): Draft {
  const counterparty = counterpartyFromWords(text, ctx.contacts);
  const category = categoryFromWords(text);
  const amountCents = amountFromWords(text);
  const when = whenFromWords(text, ctx.nowLocal);
  const wantsCalendar = category === 'booking' || /\b(calendar|appointment|meeting|book|reserve|schedule)/i.test(text);
  const postcondition: Draft['postcondition'] =
    when && wantsCalendar ? { kind: 'calendar_event', titleContains: titleFromWords(text, counterparty), startLocal: fmtWall(when), windowMinutes: 30 } : { kind: 'none' };
  const base = { counterparty, category, amountCents, postcondition };
  return { ...base, summary: summarise(base) };
}

// ---- the model ----------------------------------------------------------------------------------------------------

export type ModelOptions = {
  baseUrl: string;
  model: string;
  apiKey: string | null;
  timeoutMs: number;
  fetch?: typeof fetch;
};

/** Settings from the environment. DRAFT_PROVIDER=none turns the model off; the words still draft. */
export function modelOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): ModelOptions | null {
  if ((env.DRAFT_PROVIDER ?? 'openai') === 'none') return null;
  const apiKey = env.DRAFT_API_KEY || env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || null;
  return {
    baseUrl: (env.DRAFT_BASE_URL ?? 'https://ai-gateway.vercel.sh/v1').replace(/\/$/, ''),
    // the free tier of the gateway serves this one in about a second and gets the weekday right; a Claude model needs paid credits there
    model: env.DRAFT_MODEL ?? 'google/gemini-2.5-flash-lite',
    apiKey,
    timeoutMs: Number(env.DRAFT_TIMEOUT_MS ?? 8000) || 8000,
  };
}

const SYSTEM_PROMPT = `You turn one errand, written by a person for their assistant Fo, into the fields of a task for a rules engine, and you propose how to check afterwards that it was really done.
Output one JSON object and nothing else, with exactly these keys:
- counterparty: the person or business Fo will contact, exactly as the sentence names them (or the matching name from the contacts list). Empty string if the sentence names nobody. Never invent one.
- category: one of booking, email, call, purchase, cancellation, other.
- amountCents: integer cents of money the errand spends; 0 when none.
- postcondition: {"kind":"calendar_event","titleContains":"<a short word likely to appear in the calendar event's title>","startLocal":"YYYY-MM-DDTHH:MM","windowMinutes":30} only when the errand books or schedules something at a time that should appear in the person's calendar; otherwise {"kind":"none"}.
- summary: one plain sentence for the person: who Fo will contact and what will be checked.
Dates are in the person's local time; resolve weekdays from the given "now". Keep titleContains short (one word if possible) so it matches how a business would title the event.`;

function userPrompt(text: string, ctx: DraftContext): string {
  const contacts = ctx.contacts.map((c) => c.name).filter(Boolean).join(', ') || 'none';
  return `Now: ${ctx.nowLocal}${ctx.timeZone ? ` (${ctx.timeZone})` : ''}, local time.\nContacts: ${contacts}.\nErrand: "${text.replace(/"/g, "'")}"`;
}

function extractJson(s: string): unknown {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in the reply');
  return JSON.parse(s.slice(start, end + 1));
}

/** Make the model's answer fit the shape, falling back field by field to the words. */
export function reconcile(raw: unknown, words: Draft, text: string): Draft {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lower = text.toLowerCase();
  let counterparty = typeof o.counterparty === 'string' ? o.counterparty.trim() : '';
  // never a name the sentence does not hold, contact or not ("Cancel my gym membership" is nobody in particular)
  if (counterparty && !lower.includes(counterparty.toLowerCase())) counterparty = words.counterparty;
  if (!counterparty) counterparty = words.counterparty;
  const cat = TaskCategorySchema.safeParse(o.category);
  const category = cat.success ? cat.data : words.category;
  let amountCents = words.amountCents;
  if (typeof o.amountCents === 'number' && Number.isFinite(o.amountCents) && o.amountCents >= 0) amountCents = Math.round(o.amountCents);
  else if (typeof o.amountCents === 'string' && /^\d+$/.test(o.amountCents)) amountCents = Number(o.amountCents);
  const pc = DraftPostconditionSchema.safeParse(o.postcondition);
  let postcondition: Draft['postcondition'] = pc.success ? pc.data : words.postcondition;
  if (postcondition.kind === 'calendar_event') {
    // "dentist check-up" rarely matches how a business titles the event; a stem ("Dent") matches dentist and dental alike
    const stem = TITLE_STEMS.find(([re]) => re.test(text))?.[1];
    postcondition = { ...postcondition, titleContains: stem ?? postcondition.titleContains.split(/\s+/)[0] };
  }
  const base = { counterparty, category, amountCents, postcondition };
  // our own sentence, always: it says exactly what will be checked, and a model's summary tends to promise checks that do not exist
  return DraftSchema.parse({ ...base, summary: summarise(base) });
}

export async function draftWithModel(text: string, ctx: DraftContext, opts: ModelOptions): Promise<{ draft: Draft; model: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;
    const res = await (opts.fetch ?? fetch)(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model,
        temperature: 0,
        max_tokens: 400,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(text, ctx) },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${body.slice(0, 160)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string | { text?: string }[] } }[]; model?: string };
    const content = data.choices?.[0]?.message?.content;
    const textOut = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c) => c.text ?? '').join('') : '';
    const words = draftFromWords(text, ctx);
    return { draft: reconcile(extractJson(textOut), words, text), model: data.model ?? opts.model };
  } finally {
    clearTimeout(timer);
  }
}

/** The drafter the app calls: the model when it is configured and answers in time, the words otherwise. */
export async function draft(text: string, ctx: DraftContext, opts: ModelOptions | null = modelOptionsFromEnv()): Promise<DraftResult> {
  const t0 = Date.now();
  if (!opts) return { draft: draftFromWords(text, ctx), source: 'words', model: null, ms: Date.now() - t0, note: null };
  try {
    const { draft: d, model } = await draftWithModel(text, ctx, opts);
    return { draft: d, source: 'model', model, ms: Date.now() - t0, note: null };
  } catch (err) {
    const reason = (err as Error).name === 'AbortError' ? `no answer in ${opts.timeoutMs} ms` : (err as Error).message;
    return { draft: draftFromWords(text, ctx), source: 'words', model: null, ms: Date.now() - t0, note: `the model did not answer (${reason.slice(0, 120)})` };
  }
}

/** "anthropic/claude-haiku-4.5" -> "Claude Haiku 4.5", for the status line. */
export function modelLabel(model: string | null): string {
  if (!model) return 'no model';
  const name = model.split('/').pop() ?? model;
  return name
    .split('-')
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
