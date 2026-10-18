import { z } from 'zod';

// ---- rules ---------------------------------------------------------------
export const RuleKindSchema = z.enum(['allow_counterparties', 'max_amount', 'hold_categories']);
export type RuleKind = z.infer<typeof RuleKindSchema>;

export const RuleSchema = z.object({
  id: z.string().min(1),
  kind: RuleKindSchema,
  label: z.string().min(1).max(80),
  // allow_counterparties: { names?: string[] } (empty = the contacts list) · max_amount: { maxCents: number } · hold_categories: { categories: string[] }
  params: z.record(z.string(), z.unknown()),
  useCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type Rule = z.infer<typeof RuleSchema>;

export const RuleInputSchema = z
  .object({
    kind: RuleKindSchema,
    label: z.string().trim().min(1).max(80),
    params: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((r, ctx) => {
    const p = r.params as Record<string, unknown>;
    if (r.kind === 'max_amount' && !(typeof p.maxCents === 'number' && Number.isInteger(p.maxCents) && p.maxCents >= 0)) {
      ctx.addIssue({ code: 'custom', path: ['params', 'maxCents'], message: 'a cap in cents (a whole number, 0 or more) is required' });
    }
    if (r.kind === 'hold_categories' && !(Array.isArray(p.categories) && p.categories.length > 0 && p.categories.every((c) => typeof c === 'string' && c.trim()))) {
      ctx.addIssue({ code: 'custom', path: ['params', 'categories'], message: 'at least one category name is required' });
    }
    if (r.kind === 'allow_counterparties' && p.names !== undefined && !(Array.isArray(p.names) && p.names.every((n) => typeof n === 'string' && n.trim()))) {
      ctx.addIssue({ code: 'custom', path: ['params', 'names'], message: 'names must be a list of non-empty strings (leave it out to mean the contacts list)' });
    }
  });
export type RuleInput = z.infer<typeof RuleInputSchema>;

// ---- contacts -------------------------------------------------------------
export const ContactSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});
export type Contact = z.infer<typeof ContactSchema>;

// ---- tasks ----------------------------------------------------------------
export const TaskCategorySchema = z.enum(['booking', 'email', 'call', 'purchase', 'cancellation', 'other']);
export type TaskCategory = z.infer<typeof TaskCategorySchema>;

export const PostconditionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('calendar_event'),
    titleContains: z.string().trim().min(1).max(120),
    startISO: z
      .string()
      .min(10)
      .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'the start must be a date and time' }),
    windowMinutes: z.number().int().positive().max(24 * 60).default(30),
  }),
  z.object({ kind: z.literal('none') }),
]);
export type Postcondition = z.infer<typeof PostconditionSchema>;

export const TaskInputSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  counterparty: z.string().trim().min(1).max(200),
  amountCents: z.number().int().nonnegative().max(100_000_00).default(0),
  category: TaskCategorySchema,
  postcondition: PostconditionSchema,
});
export type TaskInput = z.infer<typeof TaskInputSchema>;

/** How the fields of a task were proposed before the person confirmed them (logged in the trace; never used by the rules). */
export const DraftMetaSchema = z.object({
  source: z.enum(['model', 'words']),
  model: z.string().max(120).nullable(),
  ms: z.number().int().nonnegative(),
  summary: z.string().trim().max(300),
  note: z.string().max(300).nullable().optional(),
});
export type DraftMeta = z.infer<typeof DraftMetaSchema>;

export const TaskStatusSchema = z.enum([
  'held', // waiting for the user's decision
  'withheld', // declined; never sent to Fo
  'allowed', // decided; about to dispatch
  'dispatched', // ask_fo sent
  'working', // Fo reported progress
  'awaiting_user', // Fo asked a question we could not answer from the approval
  'claimed', // Fo says done
  'checking', // the oracle is running
  'verified', // the oracle found the outcome
  'unverified', // the oracle found nothing (re-ask or manual tick next)
  'confirmed_by_user', // manual tick; never shown as verified
  'failed', // Fo could not finish
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const DecisionSchema = z.object({
  outcome: z.enum(['allowed', 'held']),
  ruleId: z.string().nullable(),
  reason: z.string(),
  checked: z.array(z.string()),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const UserDecisionSchema = z.enum(['approve_once', 'approve_with_rule', 'decline']);
export type UserDecision = z.infer<typeof UserDecisionSchema>;

export const CheckResultSchema = z.object({
  kind: z.enum(['calendar_event', 'none']),
  found: z.boolean(),
  eventId: z.string().nullable(),
  title: z.string().nullable(),
  start: z.string().nullable(),
  queried: z.object({ timeMin: z.string(), timeMax: z.string(), q: z.string() }).nullable(),
  reason: z.string(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const TaskSchema = TaskInputSchema.extend({
  id: z.string().min(1),
  runId: z.string().min(1),
  status: TaskStatusSchema,
  decision: DecisionSchema.nullable(),
  userDecision: UserDecisionSchema.nullable(),
  allowedByRuleId: z.string().nullable(),
  foConversationId: z.string().nullable(),
  foProgress: z.array(z.string()),
  foClaim: z.string().nullable(),
  foQuestion: z.string().nullable(),
  checkResult: CheckResultSchema.nullable(),
  verifiedBy: z.enum(['calendar', 'inbox', 'user']).nullable(),
  reaskCount: z.number().int().nonnegative(),
  error: z.string().nullable(),
  simulated: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  dispatchedAt: z.string().nullable(),
  checkedAt: z.string().nullable(),
});
export type Task = z.infer<typeof TaskSchema>;

// ---- trace ----------------------------------------------------------------
export const TraceKindSchema = z.enum([
  'draft',
  'decision',
  'user_decision',
  'list_tools',
  'ask_fo',
  'get_fo_reply',
  'get_fo_conversation',
  'check',
  'reask',
  'manual',
  'error',
  'note',
]);
export type TraceKind = z.infer<typeof TraceKindSchema>;

export const TraceEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  taskId: z.string().nullable(),
  ts: z.string(),
  kind: TraceKindSchema,
  summary: z.string(),
  payload: z.unknown(),
});
export type TraceEvent = z.infer<typeof TraceEventSchema>;

export type TraceEventInput = {
  runId: string;
  taskId: string | null;
  kind: TraceKind;
  summary: string;
  payload: unknown;
};

// ---- views -----------------------------------------------------------------
export const RunCountSchema = z.object({
  runId: z.string(),
  sent: z.number().int(),
  verified: z.number().int(),
  unverified: z.number().int(),
  confirmedByUser: z.number().int(),
  withheld: z.number().int(),
  failed: z.number().int(),
  simulated: z.boolean(),
});
export type RunCount = z.infer<typeof RunCountSchema>;
