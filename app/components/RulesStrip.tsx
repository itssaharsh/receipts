'use client';

import { useState } from 'react';
import type { Rule, RuleInput } from '@/lib/types';

export function RulesStrip({ rules, onAdd, readOnly }: { rules: Rule[]; onAdd?: (input: RuleInput) => Promise<void>; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RuleInput['kind']>('allow_counterparties');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!onAdd) return;
    setBusy(true);
    setError(null);
    try {
      const params: Record<string, unknown> =
        kind === 'allow_counterparties'
          ? { names: value.split(',').map((s) => s.trim()).filter(Boolean) }
          : kind === 'max_amount'
            ? { maxCents: Math.round(Number(value) * 100) }
            : { categories: value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) };
      await onAdd({ kind, label: label || defaultLabel(kind, value), params });
      setOpen(false);
      setLabel('');
      setValue('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Standing rules" className="px-4 sm:px-6 py-3 border-b border-line">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <h2 className="label uppercase tracking-[0.08em]">Your rules</h2>
        {rules.length === 0 && <p className="text-ink-muted">No rules yet: everything waits for you.</p>}
        {rules.map((r) => (
          <div key={r.id} className="flex items-baseline gap-2">
            <span className="rule-id">{r.id}</span>
            <span className="text-[14px]">{r.label}</span>
            <span className="num text-[13px] text-ink-muted">used {r.useCount}</span>
          </div>
        ))}
        {!readOnly && (
          <button type="button" className="btn btn-text ml-auto" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Close' : 'Add a rule'}
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="label">Kind</span>
            <select className="field field-sm" value={kind} onChange={(e) => setKind(e.target.value as RuleInput['kind'])}>
              <option value="allow_counterparties">Allow these people</option>
              <option value="max_amount">Cap the amount per task</option>
              <option value="hold_categories">Always wait for these kinds</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 min-w-[220px]">
            <span className="label">{kind === 'allow_counterparties' ? 'Names, comma-separated' : kind === 'max_amount' ? 'Dollars per task' : 'Categories, comma-separated'}</span>
            <input className="field field-sm" value={value} onChange={(e) => setValue(e.target.value)} required placeholder={kind === 'max_amount' ? '25' : kind === 'allow_counterparties' ? 'Jordan Lee' : 'cancellation'} />
          </label>
          <label className="flex flex-col gap-1 min-w-[200px]">
            <span className="label">Label (optional)</span>
            <input className="field field-sm" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={defaultLabel(kind, value || '…')} />
          </label>
          <button type="submit" className="btn btn-tonal" aria-disabled={busy}>
            {busy ? 'Adding…' : 'Add the rule'}
          </button>
          {error && <p className="text-danger text-sm basis-full">{error}</p>}
        </form>
      )}
    </section>
  );
}

export function defaultLabel(kind: RuleInput['kind'], value: string): string {
  if (kind === 'allow_counterparties') return `${value} allowed`;
  if (kind === 'max_amount') return `Up to $${value} a task`;
  return `${value} tasks wait for me`;
}
