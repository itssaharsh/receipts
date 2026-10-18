import crypto from 'node:crypto';
import type { Db } from './db';
import { nowISO } from './db';
import type { Contact, Rule, RuleInput, RunCount, Task } from './types';

// ---- rules ---------------------------------------------------------------------
type RuleRow = { id: string; kind: string; label: string; params: string; use_count: number; created_at: string };

function rowToRule(r: RuleRow): Rule {
  return { id: r.id, kind: r.kind as Rule['kind'], label: r.label, params: JSON.parse(r.params), useCount: r.use_count, createdAt: r.created_at };
}

export function listRules(db: Db): Rule[] {
  const rows = db.prepare('select * from rules order by created_at, id').all() as RuleRow[];
  return rows.map(rowToRule);
}

export function getRule(db: Db, id: string): Rule | null {
  const r = db.prepare('select * from rules where id = ?').get(id) as RuleRow | undefined;
  return r ? rowToRule(r) : null;
}

export function nextRuleId(db: Db): string {
  const rows = db.prepare('select id from rules').all() as Array<{ id: string }>;
  let max = 0;
  for (const { id } of rows) {
    const m = /^R(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `R${max + 1}`;
}

export function createRule(db: Db, input: RuleInput, id: string = nextRuleId(db)): Rule {
  const rule: Rule = { id, kind: input.kind, label: input.label, params: input.params ?? {}, useCount: 0, createdAt: nowISO() };
  db.prepare('insert into rules (id, kind, label, params, use_count, created_at) values (?, ?, ?, ?, 0, ?)').run(
    rule.id,
    rule.kind,
    rule.label,
    JSON.stringify(rule.params),
    rule.createdAt,
  );
  return rule;
}

export function bumpRuleUse(db: Db, id: string): void {
  db.prepare('update rules set use_count = use_count + 1 where id = ?').run(id);
}

// ---- contacts ----------------------------------------------------------------
type ContactRow = { id: string; name: string; email: string | null; phone: string | null };

export function listContacts(db: Db): Contact[] {
  return db.prepare('select * from contacts order by name').all() as ContactRow[];
}

export function addContact(db: Db, c: Omit<Contact, 'id'>): Contact {
  const contact: Contact = { id: 'c-' + crypto.randomUUID().slice(0, 8), ...c };
  db.prepare('insert into contacts (id, name, email, phone) values (?, ?, ?, ?)').run(contact.id, contact.name, contact.email, contact.phone);
  return contact;
}

/** The three standing rules and the demo contacts, created once on an empty database. Idempotent. */
export function ensureDefaults(db: Db, opts: { clinicEmail?: string | null } = {}): void {
  if (listRules(db).length === 0) {
    createRule(db, { kind: 'allow_counterparties', label: 'Contacts only', params: {} }, 'R1');
    createRule(db, { kind: 'max_amount', label: 'Up to $25 a task', params: { maxCents: 2500 } }, 'R2');
    createRule(db, { kind: 'hold_categories', label: 'Cancellations wait for me', params: { categories: ['cancellation'] } }, 'R3');
  }
  if (listContacts(db).length === 0) {
    addContact(db, { name: 'Northfield Dental', email: opts.clinicEmail ?? process.env.DEMO_CLINIC_EMAIL ?? null, phone: null });
    addContact(db, { name: 'Mum', email: null, phone: null });
  }
}

// ---- runs ---------------------------------------------------------------------
export function currentRunId(db: Db): string {
  const row = db.prepare("select value from meta where key = 'run_id'").get() as { value: string } | undefined;
  if (row) return row.value;
  return startNewRun(db);
}

export function startNewRun(db: Db): string {
  const id = `run-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex')}`;
  db.prepare("insert into meta (key, value) values ('run_id', ?) on conflict(key) do update set value = excluded.value").run(id);
  return id;
}

export function listRunIds(db: Db): string[] {
  const rows = db.prepare('select distinct run_id from tasks order by run_id desc').all() as Array<{ run_id: string }>;
  return rows.map((r) => r.run_id);
}

export function runCount(db: Db, runId: string): RunCount {
  const tasks = listTasks(db, runId);
  return {
    runId,
    sent: tasks.filter((t) => t.dispatchedAt !== null).length,
    verified: tasks.filter((t) => t.status === 'verified').length,
    unverified: tasks.filter((t) => t.status === 'unverified').length,
    confirmedByUser: tasks.filter((t) => t.status === 'confirmed_by_user').length,
    withheld: tasks.filter((t) => t.status === 'withheld').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
    simulated: tasks.some((t) => t.simulated),
  };
}

// ---- tasks ---------------------------------------------------------------------
type TaskRow = {
  id: string;
  run_id: string;
  text: string;
  counterparty: string;
  amount_cents: number;
  category: string;
  postcondition: string;
  status: string;
  decision: string | null;
  user_decision: string | null;
  allowed_by_rule_id: string | null;
  fo_conversation_id: string | null;
  fo_progress: string;
  fo_claim: string | null;
  fo_question: string | null;
  check_result: string | null;
  verified_by: string | null;
  reask_count: number;
  error: string | null;
  simulated: number;
  created_at: string;
  updated_at: string;
  dispatched_at: string | null;
  checked_at: string | null;
};

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    runId: r.run_id,
    text: r.text,
    counterparty: r.counterparty,
    amountCents: r.amount_cents,
    category: r.category as Task['category'],
    postcondition: JSON.parse(r.postcondition),
    status: r.status as Task['status'],
    decision: r.decision ? JSON.parse(r.decision) : null,
    userDecision: (r.user_decision as Task['userDecision']) ?? null,
    allowedByRuleId: r.allowed_by_rule_id,
    foConversationId: r.fo_conversation_id,
    foProgress: JSON.parse(r.fo_progress),
    foClaim: r.fo_claim,
    foQuestion: r.fo_question,
    checkResult: r.check_result ? JSON.parse(r.check_result) : null,
    verifiedBy: (r.verified_by as Task['verifiedBy']) ?? null,
    reaskCount: r.reask_count,
    error: r.error,
    simulated: r.simulated === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    dispatchedAt: r.dispatched_at,
    checkedAt: r.checked_at,
  };
}

function taskToRow(t: Task): TaskRow {
  return {
    id: t.id,
    run_id: t.runId,
    text: t.text,
    counterparty: t.counterparty,
    amount_cents: t.amountCents,
    category: t.category,
    postcondition: JSON.stringify(t.postcondition),
    status: t.status,
    decision: t.decision ? JSON.stringify(t.decision) : null,
    user_decision: t.userDecision,
    allowed_by_rule_id: t.allowedByRuleId,
    fo_conversation_id: t.foConversationId,
    fo_progress: JSON.stringify(t.foProgress),
    fo_claim: t.foClaim,
    fo_question: t.foQuestion,
    check_result: t.checkResult ? JSON.stringify(t.checkResult) : null,
    verified_by: t.verifiedBy,
    reask_count: t.reaskCount,
    error: t.error,
    simulated: t.simulated ? 1 : 0,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    dispatched_at: t.dispatchedAt,
    checked_at: t.checkedAt,
  };
}

const COLS = [
  'id', 'run_id', 'text', 'counterparty', 'amount_cents', 'category', 'postcondition', 'status', 'decision', 'user_decision',
  'allowed_by_rule_id', 'fo_conversation_id', 'fo_progress', 'fo_claim', 'fo_question', 'check_result', 'verified_by', 'reask_count',
  'error', 'simulated', 'created_at', 'updated_at', 'dispatched_at', 'checked_at',
] as const;

export function insertTask(db: Db, task: Task): Task {
  const row = taskToRow(task);
  db.prepare(`insert into tasks (${COLS.join(', ')}) values (${COLS.map((c) => '@' + c).join(', ')})`).run(row);
  return task;
}

export function getTask(db: Db, id: string): Task | null {
  const r = db.prepare('select * from tasks where id = ?').get(id) as TaskRow | undefined;
  return r ? rowToTask(r) : null;
}

export function mustGetTask(db: Db, id: string): Task {
  const t = getTask(db, id);
  if (!t) throw new Error(`No task ${id}`);
  return t;
}

export function updateTask(db: Db, id: string, patch: Partial<Task>): Task {
  const cur = mustGetTask(db, id);
  const next: Task = { ...cur, ...patch, id, updatedAt: nowISO() };
  const row = taskToRow(next);
  db.prepare(`update tasks set ${COLS.filter((c) => c !== 'id').map((c) => `${c} = @${c}`).join(', ')} where id = @id`).run(row);
  return next;
}

export function listTasks(db: Db, runId?: string): Task[] {
  const rows = (
    runId
      ? db.prepare('select * from tasks where run_id = ? order by created_at desc').all(runId)
      : db.prepare('select * from tasks order by created_at desc').all()
  ) as TaskRow[];
  return rows.map(rowToTask);
}

export function deleteAllTasks(db: Db): void {
  db.prepare('delete from tasks').run();
  db.prepare('delete from trace_events').run();
}
