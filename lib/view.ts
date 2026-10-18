import type { Rule, Task } from './types';

export type DiscKind = 'verified' | 'working' | 'held' | 'withheld' | 'failed' | 'claimed' | 'unverified' | 'confirmed' | 'allowed' | 'awaiting';
export type ProofKind = 'waiting' | 'checking' | 'found' | 'unverified' | 'manual' | 'never' | 'no_calendar' | 'question' | 'failed' | 'held';

export interface RowView {
  statusWord: string;
  disc: DiscKind;
  /** Which rule decided, in the copy deck's words. */
  ruleLine: string;
  /** Fo's latest progress line, or its claim, verbatim behind "Fo:". */
  claimLine: string | null;
  proofKind: ProofKind;
  proofLine: string;
  proofAction: 'confirm' | 'answer' | 'retry' | null;
  /** hh:mm of the last change. */
  time: string;
  simulatedLabel: string | null;
  active: boolean;
}

export const STATUS_WORDS: Record<Task['status'], string> = {
  held: 'Held',
  withheld: 'Withheld',
  allowed: 'Sending',
  dispatched: 'Sent',
  working: 'Working',
  awaiting_user: 'Question',
  claimed: 'Fo says done',
  checking: 'Checking',
  verified: 'Verified',
  unverified: 'Unverified',
  confirmed_by_user: 'Confirmed by you',
  failed: 'Failed',
};

/** Statuses the UI polls: 'allowed' while the app sends in the background; 'failed' waits for the person. */
export const ACTIVE_STATUSES: ReadonlySet<Task['status']> = new Set(['allowed', 'dispatched', 'working', 'claimed', 'checking']);

export function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function ruleLabel(rules: Rule[], id: string | null): string {
  if (!id) return '';
  const r = rules.find((x) => x.id === id);
  return r ? `${r.id} ${r.label}` : id;
}

export function describeTask(t: Task, rules: Rule[]): RowView {
  const time = hhmm(t.updatedAt);
  const simulatedLabel = t.simulated ? 'Simulated Fo' : null;

  // the rule line
  let ruleLine = '';
  if (t.status === 'held') ruleLine = t.decision?.reason ?? 'waiting for you';
  else if (t.status === 'withheld') ruleLine = `held by ${ruleLabel(rules, t.decision?.ruleId ?? null) || 'you'}, declined ${time}`;
  else if (t.userDecision === 'approve_with_rule') ruleLine = `approved, and ${t.allowedByRuleId ?? 'a rule'} added`;
  else if (t.userDecision === 'approve_once') ruleLine = 'approved once';
  else if (t.allowedByRuleId) ruleLine = `allowed by ${ruleLabel(rules, t.allowedByRuleId)}`;
  else ruleLine = t.decision?.reason ?? '';

  // the claim line
  let claimLine: string | null = null;
  const lastProgress = t.foProgress.length ? t.foProgress[t.foProgress.length - 1] : null;
  if (t.status === 'failed' && !t.dispatchedAt) claimLine = t.error ?? 'Fo did not accept the task';
  else if (t.status === 'failed') claimLine = `Fo could not finish: ${t.error ?? 'no reason given'}`;
  else if ((t.status === 'working' || t.status === 'dispatched') && t.error) claimLine = t.error;
  else if (t.status === 'allowed' && !t.error) claimLine = 'sending to Fo…';
  else if (t.status === 'claimed' || t.status === 'checking' || t.status === 'verified' || t.status === 'unverified' || t.status === 'confirmed_by_user') {
    claimLine = t.foClaim ? `Fo says done: "${t.foClaim}"` : 'Fo says done';
  } else if (t.status === 'awaiting_user') claimLine = t.foQuestion ? `Fo asks: "${t.foQuestion}"` : 'Fo has a question';
  else if (t.status === 'dispatched') claimLine = t.dispatchedAt ? `sent to Fo ${hhmm(t.dispatchedAt)}` : 'sent to Fo';
  else if (t.status === 'working') claimLine = lastProgress ? `Fo: "${lastProgress}"` : 'Fo is working';
  else if (t.error && t.status === 'allowed') claimLine = t.error;

  // the proof half
  let proofKind: ProofKind = 'waiting';
  let proofLine = 'waiting for Fo';
  let proofAction: RowView['proofAction'] = null;
  switch (t.status) {
    case 'held':
      proofKind = 'held';
      proofLine = 'waiting for you';
      break;
    case 'withheld':
      proofKind = 'never';
      proofLine = 'never sent to Fo';
      break;
    case 'failed':
      proofKind = 'failed';
      proofLine = t.dispatchedAt ? 'nothing to check' : 'not sent';
      proofAction = t.dispatchedAt ? null : 'retry';
      break;
    case 'awaiting_user':
      proofKind = 'question';
      proofLine = t.foQuestion ?? 'Fo has a question';
      proofAction = 'answer';
      break;
    case 'claimed':
    case 'checking':
      proofKind = 'checking';
      proofLine = 'checking your calendar…';
      break;
    case 'verified':
      proofKind = 'found';
      proofLine = `verified from your calendar ${hhmm(t.checkedAt ?? t.updatedAt)}`;
      break;
    case 'confirmed_by_user':
      proofKind = 'manual';
      proofLine = `confirmed by you ${hhmm(t.checkedAt ?? t.updatedAt)}`;
      break;
    case 'unverified': {
      const reason = t.checkResult?.reason ?? 'nothing in your calendar yet';
      if (/no calendar connected/.test(reason)) {
        proofKind = 'no_calendar';
        proofLine = 'no calendar connected; confirm by hand';
      } else if (/no check defined/.test(reason)) {
        proofKind = 'unverified';
        proofLine = 'no check defined; confirm by hand if it happened';
      } else {
        proofKind = 'unverified';
        proofLine = t.reaskCount > 0 ? `${reason}; asked Fo again; confirm by hand if it happened` : `${reason}; confirm by hand if it happened`;
      }
      proofAction = 'confirm';
      break;
    }
    default:
      break;
  }

  const disc: DiscKind =
    t.status === 'verified' ? 'verified'
    : t.status === 'working' || t.status === 'dispatched' || t.status === 'checking' ? 'working'
    : t.status === 'held' ? 'held'
    : t.status === 'withheld' ? 'withheld'
    : t.status === 'failed' ? 'failed'
    : t.status === 'claimed' ? 'claimed'
    : t.status === 'unverified' ? 'unverified'
    : t.status === 'confirmed_by_user' ? 'confirmed'
    : t.status === 'awaiting_user' ? 'awaiting'
    : 'allowed';

  return { statusWord: STATUS_WORDS[t.status], disc, ruleLine, claimLine, proofKind, proofLine, proofAction, time, simulatedLabel, active: ACTIVE_STATUSES.has(t.status) };
}

/** The found event's day column: the hour rows around it, for the calendar strip. */
export function stripHours(startISO: string): { label: string; hours: Array<{ hour: string; isEvent: boolean }> } {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(startISO);
  if (!m) return { label: startISO, hours: [] };
  const [, y, mo, d, h] = m;
  const day = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12));
  const label = `${day.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${Number(d)} ${day.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
  const hh = Number(h);
  const hours = [hh - 1, hh, hh + 1].map((x) => ({ hour: `${String(((x % 24) + 24) % 24).padStart(2, '0')}:00`, isEvent: x === hh }));
  return { label, hours };
}
