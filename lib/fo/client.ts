import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Db } from '../db';
import { writeEvent } from '../trace';
import { connectFakeFo } from './fake-server';
import { SqliteOAuthProvider } from './oauth';
import { parseFoConversation, parseFoReply, resolveAskArgName, type FoConversation, type FoReply, type FoToolInfo } from './types';

export type FoMode = 'live' | 'fake';

export interface FoClientOptions {
  mode: FoMode;
  url: string;
  redirectUrl: string;
  fetch?: typeof fetch;
}

export type ConnectResult = { connected: true } | { connected: false; authorizationUrl: string };

export interface TraceRef {
  runId: string;
  taskId: string | null;
}

export interface AskArgs {
  request: string;
  context?: string;
  conversationId?: string;
  newConversation?: boolean;
}

const DEFAULT_URL = 'https://mcp.api.wajo.ai/fo';

/** Drives Fo over MCP (live, from the user's own account) or the in-process fake, and logs every call. */
/** get_fo_reply long-polls this long on the live server (its schema offers waitSeconds); the UI's own poll is every 3 s. */
const REPLY_WAIT_SECONDS = 20;

export class FoClient {
  readonly provider: SqliteOAuthProvider;
  private client: Client | null = null;
  private pendingTransport: StreamableHTTPClientTransport | null = null;
  private askHasContext = false;
  private replyHasWait = false;
  private tools: FoToolInfo[] | null = null;
  private askArg = 'request';

  constructor(
    private readonly db: Db,
    readonly opts: FoClientOptions,
  ) {
    this.provider = new SqliteOAuthProvider(db, { redirectUrl: opts.redirectUrl });
  }

  get mode(): FoMode {
    return this.opts.mode;
  }

  get isConnected(): boolean {
    return this.client !== null;
  }

  private newTransport(): StreamableHTTPClientTransport {
    return new StreamableHTTPClientTransport(new URL(this.opts.url), { authProvider: this.provider, fetch: this.opts.fetch });
  }

  async connect(): Promise<ConnectResult> {
    if (this.client) return { connected: true };
    const client = new Client({ name: 'receipts', version: '0.1.0' });
    if (this.opts.mode === 'fake') {
      const t = await connectFakeFo();
      await client.connect(t);
      this.client = client;
      return { connected: true };
    }
    const t = this.newTransport();
    try {
      await client.connect(t);
      if (!this.provider.hasTokens()) {
        // Wajo's server lets anyone initialize and list tools; the 401 comes at the first call, and the SDK then
        // registers the client and prepares the authorization URL. Probe with the cheapest read before claiming a connection.
        await client.callTool({ name: 'list_fo_conversations', arguments: {} });
      }
      this.client = client;
      this.provider.clearPendingAuthorization();
      return { connected: true };
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        const url = this.provider.pendingAuthorizationUrl();
        if (url) {
          this.pendingTransport = t;
          return { connected: false, authorizationUrl: url };
        }
      }
      throw err;
    }
  }

  /** Complete the OAuth code exchange after the user comes back from Wajo. */
  async finishAuth(code: string): Promise<void> {
    const t = this.pendingTransport ?? this.newTransport();
    await t.finishAuth(code);
    this.pendingTransport = null;
    this.provider.clearPendingAuthorization();
  }

  private need(): Client {
    if (!this.client) throw new Error('Fo is not connected. Open /connect first.');
    return this.client;
  }

  async listTools(trace: TraceRef): Promise<FoToolInfo[]> {
    const res = await this.need().listTools();
    this.tools = res.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    this.askArg = resolveAskArgName(this.tools);
    const props = (name: string) => Object.keys(((this.tools?.find((t) => t.name === name)?.inputSchema ?? {}) as { properties?: Record<string, unknown> }).properties ?? {});
    this.askHasContext = props('ask_fo').includes('context');
    this.replyHasWait = props('get_fo_reply').includes('waitSeconds');
    writeEvent(this.db, {
      runId: trace.runId,
      taskId: null, // a connection-level event: it belongs to the run, not to one task
      kind: 'list_tools',
      summary: `tools/list -> ${this.tools.map((t) => t.name).join(', ')} (ask_fo text argument: ${this.askArg})`,
      payload: { tools: this.tools, mode: this.opts.mode },
    });
    return this.tools;
  }

  private async ensureTools(trace: TraceRef): Promise<void> {
    if (!this.tools) await this.listTools(trace);
  }

  private async call(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    try {
      const res = await this.need().callTool({ name, arguments: args });
      return res as CallToolResult;
    } catch (err) {
      if (err instanceof UnauthorizedError || /401|unauthori[sz]ed/i.test((err as Error).message ?? '')) {
        // the token was refused and the refresh did not help: forget the session so connect() asks for a new one
        this.client = null;
        this.tools = null;
        throw new Error('Fo needs reconnecting: open /connect and connect Fo again.');
      }
      throw err;
    }
  }

  async askFo(args: AskArgs, trace: TraceRef): Promise<FoReply> {
    await this.ensureTools(trace);
    // the live schema has no context argument: the context travels inside the message, which is what a person would do
    const text = args.context && !this.askHasContext ? `${args.request}\n\nContext: ${args.context}` : args.request;
    const toolArgs: Record<string, unknown> = { [this.askArg]: text };
    if (args.context && this.askHasContext) toolArgs.context = args.context;
    if (args.conversationId) toolArgs.conversationId = args.conversationId;
    if (args.newConversation) toolArgs.newConversation = true;
    try {
      const res = await this.call('ask_fo', toolArgs);
      const reply = parseFoReply(res);
      if (!reply.conversationId && args.conversationId) reply.conversationId = args.conversationId;
      writeEvent(this.db, {
        runId: trace.runId,
        taskId: trace.taskId,
        kind: 'ask_fo',
        summary: `ask_fo "${short(args.request)}" -> ${reply.status}${reply.conversationId ? ` (conversation ${short(reply.conversationId, 12)})` : ''}`,
        payload: { args: toolArgs, result: res, mode: this.opts.mode },
      });
      return reply;
    } catch (err) {
      writeEvent(this.db, { runId: trace.runId, taskId: trace.taskId, kind: 'error', summary: `ask_fo failed: ${(err as Error).message}`, payload: { args: toolArgs } });
      throw err;
    }
  }

  async getFoReply(conversationId: string, trace: TraceRef): Promise<FoReply> {
    await this.ensureTools(trace);
    try {
      const replyArgs: Record<string, unknown> = this.replyHasWait ? { conversationId, waitSeconds: REPLY_WAIT_SECONDS } : { conversationId };
      const res = await this.call('get_fo_reply', replyArgs);
      const reply = parseFoReply(res);
      if (!reply.conversationId) reply.conversationId = conversationId;
      writeEvent(this.db, {
        runId: trace.runId,
        taskId: trace.taskId,
        kind: 'get_fo_reply',
        summary: `get_fo_reply -> ${reply.status}${reply.progress ? `: "${short(reply.progress, 80)}"` : ''}`,
        payload: { args: replyArgs, result: res, mode: this.opts.mode },
      });
      return reply;
    } catch (err) {
      writeEvent(this.db, { runId: trace.runId, taskId: trace.taskId, kind: 'error', summary: `get_fo_reply failed: ${(err as Error).message}`, payload: { conversationId } });
      throw err;
    }
  }

  async getFoConversation(conversationId: string, trace: TraceRef): Promise<FoConversation> {
    await this.ensureTools(trace);
    const res = await this.call('get_fo_conversation', { conversationId });
    const conv = parseFoConversation(res, conversationId);
    writeEvent(this.db, {
      runId: trace.runId,
      taskId: trace.taskId,
      kind: 'get_fo_conversation',
      summary: `get_fo_conversation -> ${conv.messages.length} messages; claim: "${short(lastFoText(conv) ?? '', 80)}"`,
      payload: { args: { conversationId }, result: res, mode: this.opts.mode },
    });
    return conv;
  }

  async close(): Promise<void> {
    try {
      await this.client?.close();
    } catch {
      /* already closed */
    }
    this.client = null;
    this.tools = null;
  }
}

/** Fo's own account of the task: its turns after the person's last message, minus the sign-off chatter (invites, referral links). */
export function lastFoText(conv: FoConversation): string | null {
  let lastUser = -1;
  for (let i = 0; i < conv.messages.length; i++) if (conv.messages[i].role === 'user') lastUser = i;
  const after = conv.messages.slice(lastUser + 1).filter((m) => m.role !== 'user').map((m) => m.text);
  const cleaned = cleanClaim(after.join('\n\n'));
  if (cleaned) return cleaned;
  for (let i = conv.messages.length - 1; i >= 0; i--) if (conv.messages[i].role !== 'user') return conv.messages[i].text;
  return null;
}

/** Drop paragraphs that are not about the task (Wajo's invite postscript, referral links); keep the last substantive one and anything before it that reports the result. */
export function cleanClaim(text: string | null | undefined): string | null {
  if (!text) return null;
  const paras = text
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter((x) => x && !/nearly forgot|wajo\.ai\/join|invites? (sitting|left|waiting)|utm_source=referral/i.test(x));
  if (paras.length === 0) return null;
  // the result is usually the last paragraph that says done/booked/sent; keep it and drop earlier running commentary
  const done = [...paras].reverse().find((x) => /\b(done|booked|sent|emailed|confirmed|added|scheduled|ordered|cancelled|canceled|completed)\b/i.test(x));
  return (done ?? paras[paras.length - 1]).slice(0, 600);
}

function short(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---- process-wide instance for the app -------------------------------------------
export function foOptionsFromEnv(): FoClientOptions {
  const mode: FoMode = process.env.FO_MODE === 'fake' ? 'fake' : 'live';
  const appUrl = (process.env.APP_URL ?? 'http://localhost:3100').replace(/\/$/, '');
  return { mode, url: process.env.FO_MCP_URL ?? DEFAULT_URL, redirectUrl: `${appUrl}/api/fo/callback` };
}

type GlobalWithFo = typeof globalThis & { __receiptsFo?: FoClient; __receiptsFoKey?: string };

/** One Fo client per process (the fake keeps its conversations in memory, so it must be shared too). */
export function getFo(db: Db): FoClient {
  const g = globalThis as GlobalWithFo;
  const opts = foOptionsFromEnv();
  const key = JSON.stringify([opts.mode, opts.url, opts.redirectUrl, process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'receipts.db')]);
  if (!g.__receiptsFo || g.__receiptsFoKey !== key) {
    g.__receiptsFo = new FoClient(db, opts);
    g.__receiptsFoKey = key;
  }
  return g.__receiptsFo;
}

/** Drop the cached client so the next call reconnects (after a token change or a transport error). */
export async function resetFo(): Promise<void> {
  const g = globalThis as GlobalWithFo;
  await g.__receiptsFo?.close();
  g.__receiptsFo = undefined;
  g.__receiptsFoKey = undefined;
}
