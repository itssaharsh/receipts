import type { Contact, Decision, Rule, TaskInput } from './types';

/**
 * Deterministic rules evaluator. No model anywhere in here.
 * Order: categories that always wait → the amount cap → who the task involves.
 * The first rule that holds the task decides; otherwise the counterparty rule that let it through is the allowing rule.
 */
export function evaluate(task: TaskInput, rules: Rule[], contacts: Contact[]): Decision {
  const checked: string[] = [];
  if (rules.length === 0) {
    return { outcome: 'held', ruleId: null, reason: 'No rules yet: everything waits for you.', checked };
  }

  for (const r of rules.filter((x) => x.kind === 'hold_categories')) {
    checked.push(r.id);
    const cats = asStringList(r.params.categories).map(norm);
    if (cats.includes(norm(task.category))) {
      return {
        outcome: 'held',
        ruleId: r.id,
        reason: `${r.id} ${r.label}: ${task.category} tasks always wait for you.`,
        checked,
      };
    }
  }

  for (const r of rules.filter((x) => x.kind === 'max_amount')) {
    checked.push(r.id);
    const max = typeof r.params.maxCents === 'number' ? r.params.maxCents : Number.POSITIVE_INFINITY;
    if (task.amountCents > max) {
      return {
        outcome: 'held',
        ruleId: r.id,
        reason: `${r.id} ${r.label}: this is ${formatMoney(task.amountCents)}.`,
        checked,
      };
    }
  }

  const counterpartyRules = rules.filter((x) => x.kind === 'allow_counterparties');
  if (counterpartyRules.length === 0) {
    return { outcome: 'allowed', ruleId: null, reason: 'allowed: no rule limits who a task may involve', checked };
  }

  for (const r of counterpartyRules) {
    checked.push(r.id);
    const names = asStringList(r.params.names);
    if (names.length === 0) {
      const hit = matchContact(task.counterparty, contacts);
      if (hit) {
        return {
          outcome: 'allowed',
          ruleId: r.id,
          reason: `allowed by ${r.id} ${r.label}: ${hit.name} is in your contacts`,
          checked,
        };
      }
    } else if (names.map(norm).includes(norm(task.counterparty))) {
      return {
        outcome: 'allowed',
        ruleId: r.id,
        reason: `allowed by ${r.id} ${r.label}: ${task.counterparty} is named in the rule`,
        checked,
      };
    }
  }

  const first = counterpartyRules[0];
  return {
    outcome: 'held',
    ruleId: first.id,
    reason: `${first.id} ${first.label}: ${task.counterparty} is not in your contacts.`,
    checked,
  };
}

/** A contact matches by name (case-insensitive), by email, or by phone digits. */
export function matchContact(counterparty: string, contacts: Contact[]): Contact | null {
  const want = norm(counterparty);
  const wantDigits = digits(counterparty);
  for (const c of contacts) {
    if (norm(c.name) === want) return c;
    if (c.email && norm(c.email) === want) return c;
    if (c.phone && wantDigits.length >= 7 && digits(c.phone) === wantDigits) return c;
  }
  return null;
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function digits(s: string): string {
  return s.replace(/\D/g, '');
}

function asStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
