import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';

/**
 * A simulated Fo for tests and for building before the user's OAuth exists. Same five tool names as the real
 * server (read from its instructions on 2026-10-18), scripted replies, no network. Every screen that shows a run
 * from this server says "Simulated Fo", and such runs are excluded from the run count.
 */
export type FakeScenario = 'complete' | 'confirm' | 'never' | 'fail';

interface Conv {
  id: string;
  request: string;
  scenario: FakeScenario;
  step: number;
  awaitingAnswer: boolean;
  answered: boolean;
  messages: Array<{ role: 'user' | 'fo'; text: string; ts: string }>;
}

export function pickScenario(text: string): FakeScenario {
  const t = text.toLowerCase();
  if (/\bnever\b/.test(t)) return 'never';
  if (/\bfail\b|no longer exists/.test(t)) return 'fail';
  if (/\$\s?\d|\border\b|\bbuy\b|purchase|flowers/.test(t)) return 'confirm';
  return 'complete';
}

export const FAKE_STEPS = ['Reading your request', 'Emailing Northfield Dental to confirm Thursday 3pm', 'Adding the appointment to your calendar'];

/** The simulated Fo's steps and claim follow the errand's words, so a landlord email does not end "Booked ... Northfield Dental". */
export function fakePlan(request: string): { steps: string[]; reply: string } {
  const t = request.toLowerCase();
  if (/dentist|dental|appointment|check-?up|\bbook\b/.test(t)) return { steps: FAKE_STEPS, reply: FAKE_COMPLETE_REPLY };
  const name = /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/.exec(request)?.[1] ?? (/\bmum\b/i.test(request) ? 'Mum' : 'them');
  if (/\bcancel/.test(t)) {
    return { steps: ['Reading your request', 'Finding the cancellation terms', 'Sending the cancellation notice'], reply: `Sent the cancellation notice from your account; confirmation requested in writing.` };
  }
  if (/email|e-mail|write|tell|message|let .{1,40} know/.test(t)) {
    const gist = request.replace(/^.*?\bthat\b\s*/i, '').replace(/[.!]*$/, '');
    return { steps: ['Reading your request', `Drafting the email to ${name}`, 'Sending it from your account'], reply: `Emailed ${name}: "${gist.charAt(0).toUpperCase() + gist.slice(1)}." Sent from your account; a copy is in your Sent folder.` };
  }
  if (/\bcall\b|phone|ring/.test(t)) {
    return { steps: ['Reading your request', `Calling ${name}`, 'Taking notes from the call'], reply: `Called ${name} and relayed your message; they said they would follow up.` };
  }
  return { steps: ['Reading your request', 'Working through the steps', 'Wrapping up'], reply: `Done: ${request.replace(/[.!]*$/, '')}.` };
}
export const FAKE_COMPLETE_REPLY = 'Booked Thu 22 Oct 15:00 with Northfield Dental and emailed the clinic to confirm.';
export const FAKE_CONFIRM_QUESTION = 'This order comes to $45.00 including delivery. Shall I go ahead?';
export const FAKE_FAIL_REPLY = 'Fo could not reach Northfield Dental: the number rang out twice.';

const replyShape = {
  status: z.enum(['working', 'complete', 'failed', 'waiting_for_user']),
  conversationId: z.string(),
  progress: z.string().nullable(),
  reply: z.string().nullable(),
};
type Reply = { status: 'working' | 'complete' | 'failed' | 'waiting_for_user'; conversationId: string; progress: string | null; reply: string | null };

function out(obj: Reply) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(obj) }], structuredContent: obj };
}
function textOut(obj: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(obj) }] };
}

export function createFakeFoServer(): McpServer {
  const convs = new Map<string, Conv>();
  const server = new McpServer(
    { name: 'wajo-fo-fake', version: '0.0.1' },
    { instructions: '# Fo (simulated)\nA scripted stand-in for Wajo\'s Fo, used only for tests and development.' },
  );

  server.registerTool(
    'ask_fo',
    {
      description: 'Send the user\'s request to Fo (simulated).',
      inputSchema: {
        request: z.string(),
        context: z.string().optional(),
        conversationId: z.string().optional(),
        newConversation: z.boolean().optional(),
      },
      outputSchema: replyShape,
    },
    async ({ request, conversationId, newConversation }) => {
      const ts = new Date().toISOString();
      const existing = conversationId && !newConversation ? convs.get(conversationId) : undefined;
      if (existing && existing.awaitingAnswer) {
        existing.awaitingAnswer = false;
        existing.answered = true;
        existing.step += 1;
        existing.messages.push({ role: 'user', text: request, ts });
        const progress = 'Thanks. Placing the order now.';
        existing.messages.push({ role: 'fo', text: progress, ts });
        return out({ status: 'working', conversationId: existing.id, progress, reply: null });
      }
      const id = 'conv-' + Math.random().toString(36).slice(2, 8);
      const conv: Conv = { id, request, scenario: pickScenario(request), step: 0, awaitingAnswer: false, answered: false, messages: [{ role: 'user', text: request, ts }] };
      convs.set(id, conv);
      const progress = `Fo is on it: ${fakePlan(request).steps[0]}`;
      conv.messages.push({ role: 'fo', text: progress, ts });
      return out({ status: 'working', conversationId: id, progress, reply: null });
    },
  );

  server.registerTool(
    'get_fo_reply',
    { description: 'Wait for Fo\'s next step (simulated).', inputSchema: { conversationId: z.string() }, outputSchema: replyShape },
    async ({ conversationId }) => {
      const conv = convs.get(conversationId);
      if (!conv) return out({ status: 'failed', conversationId, progress: null, reply: 'Unknown conversation.' });
      const ts = new Date().toISOString();
      const say = (r: Reply) => {
        conv.messages.push({ role: 'fo', text: r.reply ?? r.progress ?? '', ts });
        return out(r);
      };
      if (conv.scenario === 'confirm' && conv.awaitingAnswer) {
        return out({ status: 'waiting_for_user', conversationId, progress: FAKE_CONFIRM_QUESTION, reply: null });
      }
      conv.step += 1;
      switch (conv.scenario) {
        case 'never':
          return say({ status: 'working', conversationId, progress: `Still working on it (step ${conv.step})`, reply: null });
        case 'fail':
          if (conv.step >= 2) return say({ status: 'failed', conversationId, progress: null, reply: FAKE_FAIL_REPLY });
          return say({ status: 'working', conversationId, progress: 'Calling the clinic', reply: null });
        case 'confirm':
          if (!conv.answered) {
            if (conv.step === 1) return say({ status: 'working', conversationId, progress: 'Checking the florist\'s prices and delivery slots', reply: null });
            conv.awaitingAnswer = true;
            return say({ status: 'waiting_for_user', conversationId, progress: FAKE_CONFIRM_QUESTION, reply: null });
          }
          if (conv.step >= 4) return say({ status: 'complete', conversationId, progress: null, reply: 'Ordered flowers for Mum: $45.00, delivery Thursday. Receipt emailed to you.' });
          return say({ status: 'working', conversationId, progress: 'Placing the order with the florist', reply: null });
        default: {
          const plan = fakePlan(conv.request);
          if (conv.step < plan.steps.length) return say({ status: 'working', conversationId, progress: `Fo is on it: ${plan.steps[conv.step]}`, reply: null });
          return say({ status: 'complete', conversationId, progress: null, reply: plan.reply });
        }
      }
    },
  );

  server.registerTool(
    'get_fo_conversation',
    { description: 'Read a conversation (simulated).', inputSchema: { conversationId: z.string() } },
    async ({ conversationId }) => {
      const conv = convs.get(conversationId);
      return textOut({ conversationId, messages: conv?.messages ?? [] });
    },
  );

  server.registerTool('list_fo_conversations', { description: 'List conversations (simulated).', inputSchema: {} }, async () =>
    textOut({ conversations: [...convs.values()].map((c) => ({ conversationId: c.id, title: c.request.slice(0, 60), messages: c.messages.length })) }),
  );

  server.registerTool('start_fo_call', { description: 'Start a voice call link (simulated).', inputSchema: {} }, async () =>
    textOut({ url: 'https://example.invalid/fo-call', expiresInSeconds: 600 }),
  );

  return server;
}

/** A client transport linked to a fresh fake Fo. */
export async function connectFakeFo(): Promise<Transport> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createFakeFoServer();
  await server.connect(serverT);
  return clientT;
}
