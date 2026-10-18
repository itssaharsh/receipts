import { describe, expect, it } from 'vitest';
import { evaluate } from '@/lib/rules';
import type { Contact, Rule, TaskInput } from '@/lib/types';

const contacts: Contact[] = [
  { id: 'c1', name: 'Northfield Dental', email: 'clinic@example.com', phone: null },
  { id: 'c2', name: 'Mum', email: null, phone: '+44 7700 900000' },
];

const rules: Rule[] = [
  { id: 'R1', kind: 'allow_counterparties', label: 'Contacts only', params: {}, useCount: 0, createdAt: '2026-10-18T09:00:00Z' },
  { id: 'R2', kind: 'max_amount', label: 'Up to $25 a task', params: { maxCents: 2500 }, useCount: 0, createdAt: '2026-10-18T09:00:00Z' },
  { id: 'R3', kind: 'hold_categories', label: 'Cancellations wait for me', params: { categories: ['cancellation'] }, useCount: 0, createdAt: '2026-10-18T09:00:00Z' },
];

function task(over: Partial<TaskInput> = {}): TaskInput {
  return {
    text: 'Book my dentist check-up: email Northfield Dental to confirm Thursday 3pm and put it on my calendar',
    counterparty: 'Northfield Dental',
    amountCents: 0,
    category: 'booking',
    postcondition: { kind: 'calendar_event', titleContains: 'Dental', startISO: '2026-10-22T15:00:00+01:00', windowMinutes: 30 },
    ...over,
  };
}

describe('rules evaluator (AC-1, AC-2)', () => {
  it('allows a task whose counterparty is in contacts, amount within the cap, category not held', () => {
    const d = evaluate(task(), rules, contacts);
    expect(d.outcome).toBe('allowed');
    expect(d.ruleId).toBe('R1');
    expect(d.reason).toMatch(/Northfield Dental is in your contacts/);
    expect(d.checked).toEqual(['R3', 'R2', 'R1']);
  });

  it('holds a task to a counterparty outside the contacts, naming the rule and the counterparty', () => {
    const d = evaluate(task({ text: 'Email my new landlord Jordan Lee that the rent will be late', counterparty: 'Jordan Lee', category: 'email' }), rules, contacts);
    expect(d.outcome).toBe('held');
    expect(d.ruleId).toBe('R1');
    expect(d.reason).toBe('R1 Contacts only: Jordan Lee is not in your contacts.');
  });

  it('holds a task over the amount cap, stating the amount', () => {
    const d = evaluate(task({ text: 'Order flowers for $45 to Mum', counterparty: 'Mum', amountCents: 4500, category: 'purchase' }), rules, contacts);
    expect(d.outcome).toBe('held');
    expect(d.ruleId).toBe('R2');
    expect(d.reason).toBe('R2 Up to $25 a task: this is $45.00.');
  });

  it('holds a category that always waits, before any other rule', () => {
    const d = evaluate(task({ text: 'Cancel my gym membership', counterparty: 'PureGym', category: 'cancellation' }), rules, contacts);
    expect(d.outcome).toBe('held');
    expect(d.ruleId).toBe('R3');
    expect(d.reason).toBe('R3 Cancellations wait for me: cancellation tasks always wait for you.');
  });

  it('matches contacts case-insensitively and by email', () => {
    const byCase = evaluate(task({ counterparty: 'northfield dental' }), rules, contacts);
    expect(byCase.outcome).toBe('allowed');
    const byEmail = evaluate(task({ counterparty: 'clinic@example.com' }), rules, contacts);
    expect(byEmail.outcome).toBe('allowed');
  });

  it('with no rules, everything is held with a plain reason', () => {
    const d = evaluate(task(), [], contacts);
    expect(d.outcome).toBe('held');
    expect(d.ruleId).toBeNull();
    expect(d.reason).toBe('No rules yet: everything waits for you.');
  });

  it('an added counterparty rule lets a previously held task through', () => {
    const r4: Rule = { id: 'R4', kind: 'allow_counterparties', label: 'Jordan Lee allowed', params: { names: ['Jordan Lee'] }, useCount: 0, createdAt: '2026-10-18T09:30:00Z' };
    const d = evaluate(task({ counterparty: 'Jordan Lee', category: 'email' }), [...rules, r4], contacts);
    expect(d.outcome).toBe('allowed');
    expect(d.ruleId).toBe('R4');
  });
});

describe('input validation (review fixes)', () => {
  it('a max_amount rule needs a cap, a hold rule needs a category, and a task needs real words and a real time', async () => {
    const { RuleInputSchema, TaskInputSchema } = await import('@/lib/types');
    expect(RuleInputSchema.safeParse({ kind: 'max_amount', label: 'cap', params: {} }).success).toBe(false);
    expect(RuleInputSchema.safeParse({ kind: 'max_amount', label: 'cap', params: { maxCents: 2500 } }).success).toBe(true);
    expect(RuleInputSchema.safeParse({ kind: 'hold_categories', label: 'wait', params: { categories: [] } }).success).toBe(false);
    expect(TaskInputSchema.safeParse({ text: '   ', counterparty: 'x', category: 'other', postcondition: { kind: 'none' } }).success).toBe(false);
    expect(TaskInputSchema.safeParse({ text: 'Book it', counterparty: '  ', category: 'other', postcondition: { kind: 'none' } }).success).toBe(false);
    expect(TaskInputSchema.safeParse({ text: 'Book it', counterparty: 'Mum', category: 'booking', postcondition: { kind: 'calendar_event', titleContains: 'x', startISO: 'not a date', windowMinutes: 30 } }).success).toBe(false);
  });
});
