import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type FoStatus = 'working' | 'complete' | 'failed' | 'waiting_for_user';

export interface FoReply {
  status: FoStatus;
  conversationId: string | null;
  /** Fo's latest progress line (or its question, when waiting for the user), verbatim. */
  progress: string | null;
  /** Fo's reply text when complete or failed, verbatim. */
  text: string | null;
  raw: unknown;
}

export interface FoConversationMessage {
  role: 'user' | 'fo' | 'other';
  text: string;
  ts?: string;
}

export interface FoConversation {
  conversationId: string;
  messages: FoConversationMessage[];
  raw: unknown;
}

export function normalizeStatus(v: unknown): FoStatus | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['working', 'in_progress', 'running', 'pending', 'busy'].includes(s)) return 'working';
  if (['complete', 'completed', 'done', 'finished', 'success', 'succeeded'].includes(s)) return 'complete';
  if (['failed', 'error', 'errored', 'cancelled', 'canceled'].includes(s)) return 'failed';
  if (['waiting', 'waiting_for_user', 'needs_input', 'input_required', 'awaiting_user', 'awaiting_input', 'question'].includes(s)) return 'waiting_for_user';
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function textBlocks(result: CallToolResult): string[] {
  return (result.content ?? [])
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && typeof (c as { text?: unknown }).text === 'string')
    .map((c) => c.text);
}

function asObject(result: CallToolResult): Record<string, unknown> | null {
  const sc = result.structuredContent;
  if (sc && typeof sc === 'object') return sc as Record<string, unknown>;
  const first = textBlocks(result)[0];
  if (first) {
    try {
      const j = JSON.parse(first);
      if (j && typeof j === 'object' && !Array.isArray(j)) return j as Record<string, unknown>;
    } catch {
      /* prose */
    }
  }
  return null;
}

/**
 * Read a Fo tool result into one shape. Fo's real schema is read at runtime from tools/list and logged, so this
 * accepts structured content, a JSON text block, or prose, in that order.
 */
export function parseFoReply(result: CallToolResult): FoReply {
  const texts = textBlocks(result);
  const text = texts.length ? texts.join('\n') : null;
  const obj = asObject(result);
  if (obj) {
    const status = normalizeStatus(obj.status) ?? (result.isError ? 'failed' : 'complete');
    const conversationId = str(obj.conversationId ?? obj.conversation_id ?? obj.conversationID ?? obj.id);
    const progress = str(obj.progress ?? obj.question ?? obj.message ?? obj.status_message);
    const reply = str(obj.reply ?? obj.text ?? obj.answer ?? obj.result ?? obj.message);
    return { status, conversationId, progress, text: reply ?? (obj === result.structuredContent ? text : null), raw: result };
  }
  const lower = (text ?? '').toLowerCase();
  let status: FoStatus = 'complete';
  if (result.isError) status = 'failed';
  else if (/waiting for (your|the user'?s?) (answer|reply|confirmation)|shall i|do you want me to|should i/.test(lower)) status = 'waiting_for_user';
  else if (/\b(failed|could not|couldn't|unable to|cannot)\b/.test(lower)) status = 'failed';
  else if (/\b(working|still on it|in progress|on it|one moment)\b/.test(lower)) status = 'working';
  const idMatch = (text ?? '').match(/conversation(?:\s*id|Id|_id)?\s*[:=]\s*["']?([\w-]{4,})/i);
  return { status, conversationId: idMatch?.[1] ?? null, progress: text, text, raw: result };
}

export function parseFoConversation(result: CallToolResult, fallbackId: string): FoConversation {
  const obj = asObject(result);
  const messagesRaw = obj && Array.isArray(obj.messages) ? (obj.messages as unknown[]) : [];
  const messages: FoConversationMessage[] = messagesRaw.map((m) => {
    const r = (m ?? {}) as Record<string, unknown>;
    const roleRaw = typeof r.role === 'string' ? r.role.toLowerCase() : '';
    const role: FoConversationMessage['role'] = roleRaw === 'user' ? 'user' : roleRaw === 'fo' || roleRaw === 'assistant' || roleRaw === 'agent' ? 'fo' : 'other';
    return { role, text: str(r.text ?? r.content ?? r.message) ?? JSON.stringify(m), ts: str(r.ts ?? r.timestamp ?? r.createdAt) ?? undefined };
  });
  if (messages.length === 0) {
    const text = textBlocks(result).join('\n');
    if (text) messages.push({ role: 'other', text });
  }
  return { conversationId: str(obj?.conversationId ?? obj?.conversation_id) ?? fallbackId, messages, raw: result };
}

export interface FoToolInfo {
  name: string;
  description?: string;
  inputSchema: unknown;
}

/** Which argument of ask_fo carries the request text. Read from the live schema; 'request' until then. */
export function resolveAskArgName(tools: FoToolInfo[]): string {
  const ask = tools.find((t) => t.name === 'ask_fo');
  const schema = (ask?.inputSchema ?? {}) as { properties?: Record<string, { type?: string }>; required?: string[] };
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const candidates = ['request', 'message', 'text', 'prompt', 'query', 'input', 'task', 'content'];
  for (const c of candidates) if (c in props && (props[c].type === 'string' || props[c].type === undefined)) return c;
  const firstRequiredString = required.find((r) => props[r]?.type === 'string');
  return firstRequiredString ?? 'request';
}
