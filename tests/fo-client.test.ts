import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { FoClient } from '@/lib/fo/client';
import { eventsForTask } from '@/lib/trace';

const trace = { runId: 'run-t', taskId: 'task-1' };

describe('FoClient against the fake Fo (AC-4, AC-5, M8)', () => {
  let db: Db;
  let fo: FoClient;
  beforeEach(async () => {
    db = openDb(':memory:');
    fo = new FoClient(db, { mode: 'fake', url: 'inmemory://fo', redirectUrl: 'http://localhost:3000/api/fo/callback' });
  });
  afterEach(async () => {
    await fo.close();
    db.close();
  });

  it('connects and lists the five Fo tools', async () => {
    const c = await fo.connect();
    expect(c.connected).toBe(true);
    const tools = await fo.listTools(trace);
    expect(tools.map((t) => t.name).sort()).toEqual(['ask_fo', 'get_fo_conversation', 'get_fo_reply', 'list_fo_conversations', 'start_fo_call']);
  });

  it('asks Fo, polls until complete, and logs every call with a timestamp', async () => {
    await fo.connect();
    const first = await fo.askFo({ request: 'Book my dentist check-up: email Northfield Dental to confirm Thursday 3pm and put it on my calendar' }, trace);
    expect(first.status).toBe('working');
    expect(first.conversationId).toBeTruthy();
    let reply = first;
    for (let i = 0; i < 10 && reply.status === 'working'; i++) {
      reply = await fo.getFoReply(first.conversationId!, trace);
    }
    expect(reply.status).toBe('complete');
    expect(reply.text).toMatch(/Booked/);
    const conv = await fo.getFoConversation(first.conversationId!, trace);
    expect(conv.messages.length).toBeGreaterThan(1);
    const kinds = eventsForTask(db, 'task-1').map((e) => e.kind);
    expect(kinds[0]).toBe('ask_fo');
    expect(kinds).toContain('get_fo_reply');
    expect(kinds).toContain('get_fo_conversation');
    for (const e of eventsForTask(db, 'task-1')) expect(e.ts).toMatch(/^\d{4}-/);
  });

  it('surfaces a confirmation question and continues when answered through ask_fo', async () => {
    await fo.connect();
    const first = await fo.askFo({ request: 'Order flowers for $45 to Mum' }, trace);
    let reply = first;
    for (let i = 0; i < 5 && reply.status === 'working'; i++) reply = await fo.getFoReply(first.conversationId!, trace);
    expect(reply.status).toBe('waiting_for_user');
    expect(reply.progress).toMatch(/\$45/);
    const answered = await fo.askFo({ request: 'Yes, go ahead.', conversationId: first.conversationId! }, trace);
    expect(answered.conversationId).toBe(first.conversationId);
    let after = answered;
    for (let i = 0; i < 5 && after.status === 'working'; i++) after = await fo.getFoReply(first.conversationId!, trace);
    expect(after.status).toBe('complete');
  });

  it('reports a failed errand as failed with Fo\'s words', async () => {
    await fo.connect();
    const first = await fo.askFo({ request: 'Please fail: call the clinic that no longer exists' }, trace);
    let reply = first;
    for (let i = 0; i < 5 && reply.status === 'working'; i++) reply = await fo.getFoReply(first.conversationId!, trace);
    expect(reply.status).toBe('failed');
    expect(reply.text).toMatch(/could not/i);
  });

  it('a never-completing errand stays working across polls', async () => {
    await fo.connect();
    const first = await fo.askFo({ request: 'never finish this one' }, trace);
    let reply = first;
    for (let i = 0; i < 5; i++) reply = await fo.getFoReply(first.conversationId!, trace);
    expect(reply.status).toBe('working');
  });
});
