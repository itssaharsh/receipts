'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FixtureState } from '@/lib/fixtures';
import type { Contact, Rule, RuleInput, RunCount, Task, TaskInput, UserDecision } from '@/lib/types';
import { ACTIVE_STATUSES } from '@/lib/view';
import { Compose } from './Compose';
import { HeldCard } from './HeldCard';
import { ReceiptRow } from './ReceiptRow';
import { RulesStrip } from './RulesStrip';
import { TopBar, type ConnStatus } from './TopBar';

export interface LedgerInitial {
  tasks: Task[];
  rules: Rule[];
  contacts: Contact[];
  runCount: RunCount;
  status: ConnStatus;
}

async function api<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const res = await fetch(path, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${method} ${path} failed (${res.status})`);
  return data;
}

export function Ledger({ initial, fixture, record, demo }: { initial: LedgerInitial; fixture: FixtureState | null; record: boolean; demo?: boolean }) {
  const live = fixture === null;
  const [tasks, setTasks] = useState<Task[]>(initial.tasks);
  const [rules, setRules] = useState<Rule[]>(initial.rules);
  const [contacts] = useState<Contact[]>(initial.contacts);
  const [runCount, setRunCount] = useState<RunCount>(initial.runCount);
  const [status, setStatus] = useState<ConnStatus>(initial.status);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const foChipRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.record = record ? '1' : '';
  }, [record]);

  const upsert = useCallback((t: Task, isNew = false) => {
    setTasks((prev) => {
      const i = prev.findIndex((x) => x.id === t.id);
      if (i === -1) return [t, ...prev];
      const next = prev.slice();
      next[i] = t;
      return next;
    });
    if (isNew) setNewIds((s) => new Set(s).add(t.id));
  }, []);

  const refreshMeta = useCallback(async () => {
    if (!live) return;
    try {
      const [runs, st, rs] = await Promise.all([
        api<{ current: RunCount }>('/api/runs'),
        api<{ mode: 'live' | 'fake'; fo: { connected: boolean; simulated: boolean }; google: { connected: boolean } }>('/api/status'),
        api<{ rules: Rule[] }>('/api/rules'),
      ]);
      setRunCount(runs.current);
      setStatus({ mode: st.mode, foConnected: st.fo.connected, foSimulated: st.fo.simulated, googleConnected: st.google.connected });
      setRules(rs.rules);
    } catch {
      /* keep what we have */
    }
  }, [live]);

  // Poll active tasks every 3 s; refresh the chips every 10 s.
  useEffect(() => {
    if (!live) return;
    let stopped = false;
    const tick = async () => {
      const active = tasks.filter((t) => ACTIVE_STATUSES.has(t.status));
      for (const t of active) {
        try {
          const { task } = await api<{ task: Task }>(`/api/tasks/${t.id}/poll`, {});
          if (!stopped) upsert(task);
        } catch (err) {
          if (!stopped) setNotice((err as Error).message);
        }
      }
    };
    const id = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [live, tasks, upsert]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(refreshMeta, 10000);
    return () => clearInterval(id);
  }, [live, refreshMeta]);

  // ?demo=1 on an empty ledger: run the demo task once against the simulated Fo (refused in live mode).
  useEffect(() => {
    if (!live || !demo || seeded.current || tasks.length > 0) return;
    seeded.current = true;
    api<{ task: Task }>('/api/demo/seed', {})
      .then(({ task }) => {
        upsert(task, true);
        refreshMeta();
      })
      .catch((err) => setNotice((err as Error).message));
  }, [live, demo, tasks.length, upsert, refreshMeta]);

  // Alt+Shift+R resets the demo ledger; Alt+Shift+P is the replay (T06).
  useEffect(() => {
    if (!live) return;
    const onKey = async (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === 'KeyR') {
        e.preventDefault();
        try {
          await api('/api/demo/reset', {});
          window.location.reload();
        } catch (err) {
          setNotice((err as Error).message);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live]);

  const blockedReason = !status.foConnected ? 'Connect Fo first' : null;

  async function send(input: TaskInput) {
    const { task } = await api<{ task: Task }>('/api/tasks', input);
    upsert(task, true);
    refreshMeta();
  }

  async function decide(task: Task, decision: UserDecision) {
    const { task: t } = await api<{ task: Task }>(`/api/tasks/${task.id}/decide`, { decision });
    upsert(t);
    refreshMeta();
  }

  async function confirm(task: Task) {
    const { task: t } = await api<{ task: Task }>(`/api/tasks/${task.id}/confirm`, {});
    upsert(t);
    refreshMeta();
  }

  async function answer(task: Task, text: string) {
    const { task: t } = await api<{ task: Task }>(`/api/tasks/${task.id}/answer`, { answer: text });
    upsert(t);
  }

  async function retry(task: Task) {
    const { task: t } = await api<{ task: Task }>(`/api/tasks/${task.id}/poll`, {});
    upsert(t);
  }

  async function addRule(input: RuleInput) {
    const { rule } = await api<{ rule: Rule }>('/api/rules', input);
    setRules((rs) => [...rs, rule]);
  }

  const held = tasks.filter((t) => t.status === 'held');
  const rows = tasks.filter((t) => t.status !== 'held');

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1">
      <div ref={foChipRef}>
        <TopBar runCount={runCount} status={status} />
      </div>
      <p className="px-4 sm:px-6 pt-3 pb-1 text-[14px] text-ink-muted">What Fo did, checked in your own calendar and inbox.</p>
      <RulesStrip rules={rules} onAdd={live ? addRule : undefined} readOnly={!live} />
      <Compose
        contacts={contacts}
        onSend={send}
        blockedReason={live ? blockedReason : null}
        onBlockedClick={() => {
          const chip = foChipRef.current?.querySelector<HTMLAnchorElement>('a[href="/connect"]');
          chip?.focus();
        }}
      />
      {notice && (
        <p className="mx-4 sm:mx-6 mt-2 text-[13px] text-warning" role="status">
          {notice}
        </p>
      )}
      {held.map((t) => (
        <HeldCard key={t.id} task={t} rules={rules} onDecide={(d) => decide(t, d)} />
      ))}
      <section aria-label="Receipts">
        <h1 className="sr-only">Receipts</h1>
        {rows.length === 0 ? (
          <p className="px-4 sm:px-6 py-10 text-ink-muted">No receipts yet. Ask Fo for something above.</p>
        ) : (
          <ol>
            {rows.map((t) => (
              <ReceiptRow key={t.id} task={t} rules={rules} isNew={newIds.has(t.id)} onConfirm={live ? confirm : undefined} onAnswer={live ? answer : undefined} onRetry={live ? retry : undefined} />
            ))}
          </ol>
        )}
      </section>
      <div role="status" aria-live="polite" className="sr-only">
        {tasks.find((t) => t.status === 'verified') ? 'A receipt was verified from your calendar.' : ''}
      </div>
    </main>
  );
}
