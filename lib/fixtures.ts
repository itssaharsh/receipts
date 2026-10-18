import type { Rule, Task, TraceEvent } from './types';

/**
 * Hand-written tasks for every row state, so `?state=<x>` renders without Fo or Google (AC-9).
 * Labelled "fixture" on screen; never counted in a run.
 */
export const FIXTURE_RULES: Rule[] = [
  { id: 'R1', kind: 'allow_counterparties', label: 'Contacts only', params: {}, useCount: 3, createdAt: '2026-10-18T09:00:00Z' },
  { id: 'R2', kind: 'max_amount', label: 'Up to $25 a task', params: { maxCents: 2500 }, useCount: 1, createdAt: '2026-10-18T09:00:00Z' },
  { id: 'R3', kind: 'hold_categories', label: 'Cancellations wait for me', params: { categories: ['cancellation'] }, useCount: 0, createdAt: '2026-10-18T09:00:00Z' },
];

export const FIXTURE_STATES = ['allowed', 'dispatched', 'working', 'awaiting', 'claimed', 'verified', 'unverified', 'manual', 'withheld', 'failed', 'held', 'nocalendar', 'empty', 'disconnected'] as const;
export type FixtureState = (typeof FIXTURE_STATES)[number];

const base = (over: Partial<Task>): Task => ({
  id: 'fx-' + (over.status ?? 'x'),
  runId: 'run-fixture',
  text: 'Book my dentist check-up: email Northfield Dental to confirm Thursday 3pm and put it on my calendar',
  counterparty: 'Northfield Dental',
  amountCents: 0,
  category: 'booking',
  postcondition: { kind: 'calendar_event', titleContains: 'Dental', startISO: '2026-10-22T15:00:00+01:00', windowMinutes: 30 },
  status: 'allowed',
  decision: { outcome: 'allowed', ruleId: 'R1', reason: 'allowed by R1 Contacts only: Northfield Dental is in your contacts', checked: ['R3', 'R2', 'R1'] },
  userDecision: null,
  allowedByRuleId: 'R1',
  foConversationId: 'conv-fx',
  foProgress: [],
  foClaim: null,
  foQuestion: null,
  checkResult: null,
  verifiedBy: null,
  reaskCount: 0,
  error: null,
  simulated: false,
  createdAt: '2026-10-18T09:40:12Z',
  updatedAt: '2026-10-18T09:40:12Z',
  dispatchedAt: '2026-10-18T09:40:12Z',
  checkedAt: null,
  ...over,
});

const FOUND = {
  kind: 'calendar_event' as const,
  found: true,
  eventId: '7kq2m0v9p1',
  title: 'Northfield Dental check-up',
  start: '2026-10-22T15:00:00+01:00',
  queried: { timeMin: '2026-10-22T13:30:00.000Z', timeMax: '2026-10-22T14:30:00.000Z', q: 'Dental' },
  reason: 'found "Northfield Dental check-up" at Thu 22 Oct 15:00 in your calendar',
};

export function fixtureTasks(state: FixtureState): Task[] {
  switch (state) {
    case 'empty':
    case 'disconnected':
      return [];
    case 'allowed':
      return [base({ status: 'allowed', dispatchedAt: null, foConversationId: null })];
    case 'dispatched':
      return [base({ status: 'dispatched', foProgress: ['Fo is on it: Reading your request'] })];
    case 'working':
      return [base({ status: 'working', foProgress: ['Fo is on it: Reading your request', 'Emailing Northfield Dental to confirm Thursday 3pm'], updatedAt: '2026-10-18T09:40:52Z' })];
    case 'awaiting':
      return [
        base({
          id: 'fx-awaiting',
          status: 'awaiting_user',
          text: 'Order a book for Mum',
          counterparty: 'Mum',
          amountCents: 2000,
          category: 'purchase',
          postcondition: { kind: 'none' },
          foProgress: ['Checking the bookshop'],
          foQuestion: 'Two editions are in stock, paperback $18 or hardback $24. Which one?',
          updatedAt: '2026-10-18T09:41:10Z',
        }),
      ];
    case 'claimed':
      return [base({ status: 'claimed', foProgress: ['Fo is on it: Reading your request', 'Emailing Northfield Dental to confirm Thursday 3pm', 'Adding the appointment to your calendar'], foClaim: 'Booked Thu 22 Oct 15:00 with Northfield Dental and emailed the clinic to confirm.', updatedAt: '2026-10-18T09:41:30Z' })];
    case 'verified':
      return [
        base({
          status: 'verified',
          foProgress: ['Fo is on it: Reading your request', 'Emailing Northfield Dental to confirm Thursday 3pm', 'Adding the appointment to your calendar'],
          foClaim: 'Booked Thu 22 Oct 15:00 with Northfield Dental and emailed the clinic to confirm.',
          checkResult: FOUND,
          verifiedBy: 'calendar',
          updatedAt: '2026-10-18T09:41:31Z',
          checkedAt: '2026-10-18T09:41:31Z',
        }),
      ];
    case 'unverified':
      return [
        base({
          status: 'unverified',
          foClaim: 'Booked Thu 22 Oct 15:00 with Northfield Dental and emailed the clinic to confirm.',
          reaskCount: 1,
          checkResult: { ...FOUND, found: false, eventId: null, title: null, start: null, reason: 'nothing in your calendar for Thu 22 Oct 15:00 with "Dental" yet' },
          updatedAt: '2026-10-18T09:43:02Z',
          checkedAt: '2026-10-18T09:43:02Z',
        }),
      ];
    case 'manual':
      return [
        base({
          status: 'confirmed_by_user',
          foClaim: 'Booked Thu 22 Oct 15:00 with Northfield Dental and emailed the clinic to confirm.',
          reaskCount: 1,
          checkResult: { ...FOUND, found: false, eventId: null, title: null, start: null, reason: 'nothing in your calendar for Thu 22 Oct 15:00 with "Dental" yet' },
          verifiedBy: 'user',
          updatedAt: '2026-10-18T09:52:00Z',
          checkedAt: '2026-10-18T09:52:00Z',
        }),
      ];
    case 'withheld':
      return [
        base({
          id: 'fx-withheld',
          status: 'withheld',
          text: 'Order flowers for $45 to Mum',
          counterparty: 'Mum',
          amountCents: 4500,
          category: 'purchase',
          postcondition: { kind: 'none' },
          decision: { outcome: 'held', ruleId: 'R2', reason: 'R2 Up to $25 a task: this is $45.00.', checked: ['R3', 'R2'] },
          userDecision: 'decline',
          allowedByRuleId: null,
          foConversationId: null,
          dispatchedAt: null,
          updatedAt: '2026-10-18T09:52:40Z',
        }),
      ];
    case 'failed':
      return [base({ status: 'failed', foProgress: ['Calling the clinic'], error: 'Fo could not reach Northfield Dental: the number rang out twice.', updatedAt: '2026-10-18T09:45:00Z' })];
    case 'held':
      return [
        base({
          id: 'fx-held',
          status: 'held',
          text: 'Email my new landlord Jordan Lee that the rent will be late',
          counterparty: 'Jordan Lee',
          category: 'email',
          postcondition: { kind: 'none' },
          decision: { outcome: 'held', ruleId: 'R1', reason: 'R1 Contacts only: Jordan Lee is not in your contacts.', checked: ['R3', 'R2', 'R1'] },
          allowedByRuleId: null,
          foConversationId: null,
          dispatchedAt: null,
          updatedAt: '2026-10-18T09:50:00Z',
        }),
        ...fixtureTasks('verified'),
      ];
    case 'nocalendar':
      return [
        base({
          status: 'unverified',
          foClaim: 'Booked Thu 22 Oct 15:00 with Northfield Dental and emailed the clinic to confirm.',
          checkResult: { kind: 'calendar_event', found: false, eventId: null, title: null, start: null, queried: null, reason: 'no calendar connected; confirm by hand' },
          updatedAt: '2026-10-18T09:41:35Z',
          checkedAt: '2026-10-18T09:41:35Z',
        }),
      ];
  }
}

export function fixtureEvents(task: Task): TraceEvent[] {
  const mk = (ts: string, kind: TraceEvent['kind'], summary: string, payload: unknown = {}): TraceEvent => ({ id: `${task.id}-${kind}-${ts}`, runId: task.runId, taskId: task.id, ts, kind, summary, payload });
  const events: TraceEvent[] = [mk('2026-10-18T09:40:12.010Z', 'decision', task.decision?.outcome === 'allowed' ? task.decision.reason : `held: ${task.decision?.reason}`, { decision: task.decision })];
  if (task.dispatchedAt) {
    events.push(mk('2026-10-18T09:40:12.420Z', 'ask_fo', `ask_fo "${task.text.slice(0, 59)}…" -> working (conversation ${task.foConversationId})`, { args: { request: task.text } }));
    task.foProgress.forEach((p, i) => events.push(mk(`2026-10-18T09:40:${String(20 + i * 12).padStart(2, '0')}.000Z`, 'get_fo_reply', `get_fo_reply -> working: "${p}"`)));
  }
  if (task.foClaim) {
    events.push(mk('2026-10-18T09:41:30.100Z', 'get_fo_reply', `get_fo_reply -> complete`));
    events.push(mk('2026-10-18T09:41:30.400Z', 'get_fo_conversation', `get_fo_conversation -> 5 messages; claim: "${task.foClaim.slice(0, 60)}"`));
  }
  if (task.checkResult) {
    events.push(
      mk(
        '2026-10-18T09:41:31.050Z',
        'check',
        task.checkResult.found
          ? `check:calendar_event_exists -> found event ${task.checkResult.eventId} "${task.checkResult.title}" at ${task.checkResult.start}`
          : `check:calendar_event_exists -> ${task.checkResult.reason}`,
        { result: task.checkResult, oracle: 'Google Calendar (read-only)' },
      ),
    );
  }
  if (task.status === 'confirmed_by_user') events.push(mk('2026-10-18T09:52:00.000Z', 'manual', 'confirmed by you (no calendar record)'));
  if (task.status === 'withheld') events.push(mk('2026-10-18T09:52:40.000Z', 'user_decision', `declined: withheld by ${task.decision?.ruleId}, never sent to Fo`));
  return events;
}
