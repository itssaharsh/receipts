'use client';

import { useEffect, useRef, useState } from 'react';
import type { Rule, Task, UserDecision } from '@/lib/types';

export function HeldCard({ task, rules, onDecide }: { task: Task; rules: Rule[]; onDecide: (decision: UserDecision) => Promise<void> }) {
  const [busy, setBusy] = useState<UserDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);

  const heldRule = rules.find((r) => r.id === task.decision?.ruleId);
  const canAddRule = heldRule?.kind !== 'hold_categories';

  async function go(d: UserDecision) {
    setBusy(d);
    setError(null);
    try {
      await onDecide(d);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <section aria-label="Waiting for you" className="mx-4 sm:mx-6 my-3 rounded-md border border-line-input bg-surface-1 p-4">
      <div className="flex items-center gap-2">
        <span className="disc" data-kind="held" aria-hidden="true" />
        <h2 className="font-semibold">Waiting for you</h2>
        {task.simulated && <span className="text-[12px] text-ink-muted">Simulated Fo</span>}
      </div>
      <p className="mt-1 text-[15px]">{task.text}</p>
      <p className="mt-1 text-ink-muted">{task.decision?.reason}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button ref={first} type="button" className="btn btn-tonal" aria-disabled={!!busy} onClick={() => go('approve_once')}>
          {busy === 'approve_once' ? 'Sending to Fo…' : 'Approve once'}
        </button>
        {canAddRule && (
          <button type="button" className="btn btn-tonal" aria-disabled={!!busy} onClick={() => go('approve_with_rule')}>
            {busy === 'approve_with_rule' ? 'Adding the rule…' : 'Approve and add a rule'}
          </button>
        )}
        <button type="button" className="btn btn-text text-ink" aria-disabled={!!busy} onClick={() => go('decline')}>
          {busy === 'decline' ? 'Declining…' : 'Decline'}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-danger text-sm" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
