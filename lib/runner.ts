import type { DraftMeta } from './types';
import crypto from 'node:crypto';
import { runPostconditionCheck, fmtWall } from './check';
import type { Db } from './db';
import { nowISO } from './db';
import { lastFoText, type FoClient } from './fo/client';
import type { FoReply } from './fo/types';
import type { Oracle } from './oracle';
import { evaluate, formatMoney } from './rules';
import { bumpRuleUse, createRule, currentRunId, getRule, insertTask, listContacts, listRules, mustGetTask, updateTask } from './store';
import { writeEvent } from './trace';
import { TaskInputSchema, type RuleInput, type Task, type TaskInput, type UserDecision } from './types';

export { runCount } from './store';

export interface RunnerDeps {
  db: Db;
  fo: FoClient;
  oracle: Oracle;
  /** How many times to ask Fo again when the oracle finds nothing. Default 1. */
  maxReasks?: number;
}

export class FoNotConnectedError extends Error {
  constructor(public readonly authorizationUrl: string) {
    super('Fo is not connected. Open /connect first.');
  }
}

const APPROVAL_ANSWER = 'Yes, go ahead.';
const ANSWERED_MARK = 'Receipts answered: ';

const trace = (t: Task) => ({ runId: t.runId, taskId: t.id });

// One step at a time per task: a live get_fo_reply can block for 40 s, and a second poll meanwhile would duplicate
// trace events, overwrite progress and could answer Fo's confirmation twice.
type GlobalWithLocks = typeof globalThis & { __receiptsTaskLocks?: Map<string, Promise<Task>> };
function locks(): Map<string, Promise<Task>> {
  const g = globalThis as GlobalWithLocks;
  if (!g.__receiptsTaskLocks) g.__receiptsTaskLocks = new Map();
  return g.__receiptsTaskLocks;
}
async function withTaskLock(taskId: string, fn: () => Promise<Task>, ifBusy: () => Task): Promise<Task> {
  const l = locks();
  const running = l.get(taskId);
  if (running) return ifBusy();
  const p = fn().finally(() => {
    if (l.get(taskId) === p) l.delete(taskId);
  });
  l.set(taskId, p);
  return p;
}

/** Evaluate a new task against the rules; dispatch it when allowed, hold it otherwise. */
export async function createTask(deps: RunnerDeps, raw: TaskInput, meta: { draft?: DraftMeta } = {}): Promise<Task> {
  const input = TaskInputSchema.parse(raw);
  const { db } = deps;
  const decision = evaluate(input, listRules(db), listContacts(db));
  const now = nowISO();
  const task: Task = {
    ...input,
    id: 'task-' + crypto.randomUUID().slice(0, 8),
    runId: currentRunId(db),
    status: decision.outcome === 'allowed' ? 'allowed' : 'held',
    decision,
    userDecision: null,
    allowedByRuleId: decision.outcome === 'allowed' ? decision.ruleId : null,
    foConversationId: null,
    foProgress: [],
    foClaim: null,
    foQuestion: null,
    checkResult: null,
    verifiedBy: null,
    reaskCount: 0,
    error: null,
    simulated: deps.fo.mode === 'fake',
    createdAt: now,
    updatedAt: now,
    dispatchedAt: null,
    checkedAt: null,
  };
  insertTask(db, task);
  if (meta.draft) {
    // how the fields were proposed; the rules below evaluate what the person confirmed, never the draft
    const d = meta.draft;
    writeEvent(db, {
      ...trace(task),
      kind: 'draft',
      summary: d.source === 'model' ? `fields drafted by ${d.model ?? 'a model'} in ${d.ms} ms, confirmed by you: ${d.summary}` : `fields drafted from the words (no model), confirmed by you: ${d.summary}`,
      payload: { draft: d },
    });
  }
  writeEvent(db, {
    ...trace(task),
    kind: 'decision',
    summary: decision.outcome === 'allowed' ? decision.reason : `held: ${decision.reason}`,
    payload: { decision, input },
  });
  if (decision.outcome === 'allowed') {
    if (decision.ruleId) bumpRuleUse(db, decision.ruleId);
    return dispatch(deps, task);
  }
  return task;
}

/** The user's answer to a held card. */
export async function decide(deps: RunnerDeps, taskId: string, userDecision: UserDecision, ruleInput?: RuleInput): Promise<Task> {
  const { db } = deps;
  const task = mustGetTask(db, taskId);
  if (task.status !== 'held') throw new Error(`Task ${taskId} is not waiting for a decision (status ${task.status}).`);

  if (userDecision === 'decline') {
    const t = updateTask(db, taskId, { status: 'withheld', userDecision });
    writeEvent(db, { ...trace(t), kind: 'user_decision', summary: `declined: withheld by ${t.decision?.ruleId ?? 'you'}, never sent to Fo`, payload: { userDecision } });
    return t;
  }

  let allowedByRuleId: string | null = null;
  if (userDecision === 'approve_with_rule') {
    const heldBy = task.decision?.ruleId ? getRule(db, task.decision.ruleId) : null;
    if (heldBy?.kind === 'hold_categories') {
      throw new Error(`${heldBy.id} ${heldBy.label}: ${task.category} tasks always wait; approve this one once instead of adding a rule.`);
    }
    const input = ruleInput ?? defaultRuleFor(deps, task);
    const rule = createRule(db, input);
    bumpRuleUse(db, rule.id);
    allowedByRuleId = rule.id;
    writeEvent(db, { ...trace(task), kind: 'user_decision', summary: `approved, and ${rule.id} added: ${rule.label}`, payload: { userDecision, rule } });
  } else {
    writeEvent(db, { ...trace(task), kind: 'user_decision', summary: 'approved once', payload: { userDecision } });
  }
  const t = updateTask(db, taskId, { status: 'allowed', userDecision, allowedByRuleId, error: null });
  return dispatch(deps, t);
}

function defaultRuleFor(deps: RunnerDeps, task: Task): RuleInput {
  const held = task.decision?.ruleId ? getRule(deps.db, task.decision.ruleId) : null;
  if (held?.kind === 'max_amount') {
    return { kind: 'max_amount', label: `Up to ${formatMoney(task.amountCents)} a task`, params: { maxCents: task.amountCents } };
  }
  if (held?.kind === 'hold_categories') {
    throw new Error(`${held.id} ${held.label}: ${task.category} tasks always wait; approve this one once instead of adding a rule.`);
  }
  return { kind: 'allow_counterparties', label: `${task.counterparty} allowed`, params: { names: [task.counterparty] } };
}

function contextFor(task: Task): string {
  const parts = [`Counterparty: ${task.counterparty}.`, `Category: ${task.category}.`];
  if (task.amountCents > 0) parts.push(`Amount: ${formatMoney(task.amountCents)}.`);
  if (task.postcondition.kind === 'calendar_event') {
    parts.push(`Expected result: an event containing "${task.postcondition.titleContains}" on ${fmtWall(task.postcondition.startISO)} in my calendar.`);
  }
  return parts.join(' ');
}

/**
 * One ask_fo per task, never retried on its own: a second ask would be a second errand. Idempotent on dispatchedAt;
 * a dispatch that Fo did not accept ends `failed` and waits for the person's explicit "Try sending again".
 */
export async function dispatch(deps: RunnerDeps, task: Task): Promise<Task> {
  const { db, fo } = deps;
  if (task.dispatchedAt) return task;
  return withTaskLock(
    task.id,
    async () => {
      const fresh = mustGetTask(db, task.id);
      if (fresh.dispatchedAt) return fresh;
      const conn = await fo.connect();
      if (!conn.connected) throw new FoNotConnectedError(conn.authorizationUrl);
      let reply: FoReply;
      try {
        reply = await fo.askFo({ request: fresh.text, context: contextFor(fresh), newConversation: true }, trace(fresh));
      } catch (err) {
        return updateTask(db, fresh.id, { status: 'failed', error: `Fo did not accept the task: ${(err as Error).message}` });
      }
      const t = updateTask(db, fresh.id, {
        status: 'dispatched',
        dispatchedAt: nowISO(),
        foConversationId: reply.conversationId,
        foProgress: reply.progress ? [reply.progress] : [],
        error: null,
      });
      if (reply.status === 'working') return t;
      return applyReply(deps, t, reply);
    },
    () => mustGetTask(db, task.id),
  );
}

/** The person asks to send a task Fo did not accept: back to allowed, then one dispatch. */
export async function retryDispatch(deps: RunnerDeps, taskId: string): Promise<Task> {
  const task = mustGetTask(deps.db, taskId);
  if (task.status !== 'failed' || task.dispatchedAt) throw new Error(`Task ${taskId} cannot be sent again from status ${task.status}.`);
  writeEvent(deps.db, { ...trace(task), kind: 'note', summary: 'you asked to send it again', payload: {} });
  const t = updateTask(deps.db, taskId, { status: 'allowed', error: null });
  return dispatch(deps, t);
}

/** Advance a task by one step. Safe to call repeatedly; the UI calls it every few seconds. */
export async function poll(deps: RunnerDeps, taskId: string): Promise<Task> {
  const { db, fo } = deps;
  const task = mustGetTask(db, taskId);
  if (task.status === 'allowed' && !task.dispatchedAt) return task.error ? task : dispatch(deps, task);
  if (task.status === 'claimed' || task.status === 'checking') return check(deps, taskId);
  if (task.status !== 'dispatched' && task.status !== 'working') return task;
  if (!task.foConversationId) return updateTask(db, taskId, { status: 'failed', error: 'Fo returned no conversation to follow.' });
  return withTaskLock(
    taskId,
    async () => {
      const fresh = mustGetTask(db, taskId);
      if (fresh.status !== 'dispatched' && fresh.status !== 'working') return fresh;
      let reply: FoReply;
      try {
        reply = await fo.getFoReply(fresh.foConversationId!, trace(fresh));
      } catch (err) {
        return updateTask(db, taskId, { error: `Fo is not answering; still trying (${(err as Error).message})` });
      }
      return applyReply(deps, fresh, reply);
    },
    () => mustGetTask(db, taskId),
  );
}

async function applyReply(deps: RunnerDeps, task: Task, reply: FoReply): Promise<Task> {
  const { db, fo } = deps;
  const progress = reply.progress && !task.foProgress.includes(reply.progress) ? [...task.foProgress, reply.progress] : task.foProgress;
  const convPatch = reply.conversationId && reply.conversationId !== task.foConversationId ? { foConversationId: reply.conversationId } : {};

  switch (reply.status) {
    case 'working':
      return updateTask(db, task.id, { ...convPatch, status: 'working', foProgress: progress, error: null });

    case 'failed':
      return updateTask(db, task.id, { ...convPatch, status: 'failed', foProgress: progress, error: reply.text ?? reply.progress ?? 'Fo could not finish.' });

    case 'waiting_for_user': {
      const question = reply.progress ?? reply.text ?? 'Fo has a question for you.';
      const approved = task.userDecision === 'approve_once' || task.userDecision === 'approve_with_rule' || task.allowedByRuleId !== null;
      const alreadyAnswered = task.foProgress.some((p) => p.startsWith(ANSWERED_MARK));
      if (approved && !alreadyAnswered && task.foConversationId) {
        writeEvent(db, {
          ...trace(task),
          kind: 'note',
          summary: `confirmation answered from the approval: Fo asked "${question}"; Receipts answered "${APPROVAL_ANSWER}" (${task.userDecision ?? `allowed by ${task.allowedByRuleId}`})`,
          payload: { question, answer: APPROVAL_ANSWER },
        });
        const withQ = updateTask(db, task.id, { ...convPatch, foProgress: [...progress, `Fo asked: ${question}`, `${ANSWERED_MARK}${APPROVAL_ANSWER}`] });
        const ans = await fo.askFo({ request: APPROVAL_ANSWER, conversationId: withQ.foConversationId ?? undefined }, trace(task));
        return applyReply(deps, withQ, ans);
      }
      return updateTask(db, task.id, { ...convPatch, status: 'awaiting_user', foQuestion: question, foProgress: progress });
    }

    case 'complete': {
      let claim = reply.text ?? reply.progress ?? null;
      const convId = reply.conversationId ?? task.foConversationId;
      if (convId) {
        try {
          const conv = await fo.getFoConversation(convId, trace(task));
          const last = lastFoText(conv);
          if (!claim && last) claim = last;
        } catch {
          /* the claim from the reply is enough */
        }
      }
      const t = updateTask(db, task.id, { ...convPatch, status: 'claimed', foClaim: claim, foProgress: progress, foQuestion: null });
      return checkInner(deps, t.id); // already under this task's lock
    }
  }
}

/** The user answers a question Receipts could not answer from the approval. */
export async function answerQuestion(deps: RunnerDeps, taskId: string, answer: string): Promise<Task> {
  const { db, fo } = deps;
  const task = mustGetTask(db, taskId);
  if (task.status !== 'awaiting_user' || !task.foConversationId) throw new Error(`Task ${taskId} has no open question.`);
  writeEvent(db, { ...trace(task), kind: 'note', summary: `you answered Fo: "${answer}"`, payload: { question: task.foQuestion, answer } });
  const withA = updateTask(db, taskId, { foProgress: [...task.foProgress, `Fo asked: ${task.foQuestion}`, `You answered: ${answer}`], foQuestion: null, status: 'working' });
  const reply = await fo.askFo({ request: answer, conversationId: task.foConversationId }, trace(task));
  return applyReply(deps, withA, reply);
}

/** The oracle: verified from the calendar, or re-ask Fo once, or unverified. */
export async function check(deps: RunnerDeps, taskId: string): Promise<Task> {
  return withTaskLock(taskId, () => checkInner(deps, taskId), () => mustGetTask(deps.db, taskId));
}

async function checkInner(deps: RunnerDeps, taskId: string): Promise<Task> {
  const { db, fo, oracle } = deps;
  const task = mustGetTask(db, taskId);
  if (!['claimed', 'checking', 'unverified'].includes(task.status)) return task;
  updateTask(db, taskId, { status: 'checking' });

  const result = await runPostconditionCheck(task.postcondition, oracle);
  writeEvent(db, {
    ...trace(task),
    kind: 'check',
    summary: result.found
      ? `check:calendar_event_exists -> found event ${result.eventId} "${result.title}" at ${result.start}`
      : `check:${result.kind === 'none' ? 'none' : 'calendar_event_exists'} -> ${result.reason}`,
    payload: { result, oracle: oracle.describe() },
  });
  const now = nowISO();
  if (result.found) {
    return updateTask(db, taskId, { status: 'verified', verifiedBy: 'calendar', checkResult: result, checkedAt: now });
  }

  const maxReasks = deps.maxReasks ?? 1;
  const canReask = task.postcondition.kind === 'calendar_event' && result.queried !== null && task.reaskCount < maxReasks && !!task.foConversationId;
  if (canReask) {
    const pc = task.postcondition as Extract<Task['postcondition'], { kind: 'calendar_event' }>;
    const msg = `I can't see this in my calendar yet: an event containing "${pc.titleContains}" around ${fmtWall(pc.startISO)}. Did it happen? If so, please add it to my calendar.`;
    writeEvent(db, { ...trace(task), kind: 'reask', summary: `re-asked Fo (${task.reaskCount + 1} of ${maxReasks}): ${result.reason}`, payload: { message: msg } });
    const t2 = updateTask(db, taskId, {
      status: 'working',
      reaskCount: task.reaskCount + 1,
      checkResult: result,
      checkedAt: now,
      foProgress: [...task.foProgress, `Receipts re-asked Fo: ${msg}`],
    });
    const reply = await fo.askFo({ request: msg, conversationId: task.foConversationId ?? undefined }, trace(task));
    return applyReply(deps, t2, reply);
  }
  return updateTask(db, taskId, { status: 'unverified', checkResult: result, checkedAt: now });
}

/** The manual tick. Shown as "confirmed by you", never as verified. */
export function confirmByUser(deps: RunnerDeps, taskId: string): Task {
  const { db } = deps;
  const task = mustGetTask(db, taskId);
  if (!['unverified', 'claimed', 'checking'].includes(task.status)) throw new Error(`Task ${taskId} cannot be confirmed by hand from status ${task.status}.`);
  writeEvent(db, { ...trace(task), kind: 'manual', summary: 'confirmed by you (no calendar record)', payload: {} });
  return updateTask(db, taskId, { status: 'confirmed_by_user', verifiedBy: 'user', checkedAt: nowISO() });
}
