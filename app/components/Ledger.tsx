'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fixtureEvents, type FixtureState } from '@/lib/fixtures';
import type { Contact, Rule, RuleInput, RunCount, Task, TaskInput, TraceEvent, UserDecision, DraftMeta } from '@/lib/types';
import { ACTIVE_STATUSES } from '@/lib/view';
import { Compose } from './Compose';
import { HeldCard } from './HeldCard';
import { ReceiptRow } from './ReceiptRow';
import { RulesStrip } from './RulesStrip';
import { TopBar, type ConnStatus } from './TopBar';
import { TraceDrawer } from './TraceDrawer';

export interface LedgerInitial {
  tasks: Task[];
  rules: Rule[];
  contacts: Contact[];
  runCount: RunCount;
  status: ConnStatus;
}

type Replay = { runId: string; savedAt: string; tasks: Task[]; events: TraceEvent[] };

async function api<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const res = await fetch(path, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; issues?: { path?: (string | number)[]; message: string }[] };
  if (!res.ok) {
    const first = data.issues?.[0];
    const field = first?.path?.length ? String(first.path[first.path.length - 1]) : null;
    throw new Error(first ? `${field ? field + ': ' : ''}${first.message}` : (data.error ?? `${method} ${path} failed (${res.status})`));
  }
  return data;
}

export function Ledger({ initial, fixture, record, demo }: { initial: LedgerInitial; fixture: FixtureState | null; record: boolean; demo?: boolean }) {
  const [replay, setReplay] = useState<Replay | null>(null);
  const live = fixture === null && replay === null;
  const [tasks, setTasks] = useState<Task[]>(initial.tasks);
  const [rules, setRules] = useState<Rule[]>(initial.rules);
  const [contacts] = useState<Contact[]>(initial.contacts);
  const [runCount, setRunCount] = useState<RunCount>(initial.runCount);
  const [status, setStatus] = useState<ConnStatus>(initial.status);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [trace, setTrace] = useState<{ task: Task | null; events: TraceEvent[]; loading: boolean } | null>(null);
  const lastTraceButton = useRef<HTMLElement | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);
  const inFlight = useRef<Set<string>>(new Set());

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
    setTrace((tr) => (tr && tr.task?.id === t.id ? { ...tr, task: t } : tr));
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
      // one poll in flight per task: a live get_fo_reply can take up to 40 s
      // and after a failed poll ("Fo is not answering"), wait 30 s before the next try
      const active = tasks.filter(
        (t) => ACTIVE_STATUSES.has(t.status) && !inFlight.current.has(t.id) && !(t.error && Date.now() - Date.parse(t.updatedAt) < 30_000),
      );
      for (const t of active) {
        inFlight.current.add(t.id);
        api<{ task: Task }>(`/api/tasks/${t.id}/poll`, {})
          .then(({ task }) => {
            if (!stopped) upsert(task);
          })
          .catch((err) => {
            if (!stopped) setNotice((err as Error).message);
          })
          .finally(() => inFlight.current.delete(t.id));
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

  // The open trace follows its task while it runs.
  useEffect(() => {
    if (!live || !trace?.task) return;
    const id = trace.task.id;
    let cancelled = false;
    api<{ events: TraceEvent[] }>(`/api/trace/${id}`)
      .then(({ events }) => {
        if (!cancelled) setTrace((tr) => (tr && tr.task?.id === id ? { ...tr, events, loading: false } : tr));
      })
      .catch(() => {
        if (!cancelled) setTrace((tr) => (tr && tr.task?.id === id ? { ...tr, loading: false } : tr));
      });
    return () => {
      cancelled = true;
    };
  }, [live, trace?.task?.id, trace?.task?.status, trace?.task?.updatedAt, trace?.task]);

  // ?demo=1 on an empty ledger: run the demo task once against the simulated Fo (refused with the live Fo).
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

  // Alt+Shift+R resets the demo ledger; Alt+Shift+P replays the recorded real run.
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey) return;
      if (e.code === 'KeyR' && fixture === null) {
        e.preventDefault();
        try {
          await api('/api/demo/reset', {});
          window.location.href = window.location.pathname + window.location.search.replace(/[?&]demo=1/, '');
        } catch (err) {
          setNotice((err as Error).message);
        }
      }
      if (e.code === 'KeyP' && fixture === null) {
        e.preventDefault();
        if (replay) {
          setReplay(null);
          setTasks(initial.tasks);
          setRunCount(initial.runCount);
          setNotice(null);
          return;
        }
        try {
          const snap = await api<Replay>('/api/replay');
          setReplay(snap);
          setTasks(snap.tasks);
          setRunCount({ ...initial.runCount, runId: snap.runId });
          setNotice(`Replay · run of ${new Date(snap.savedAt).toLocaleString('en-GB')} (recorded earlier; nothing is live)`);
        } catch (err) {
          setNotice((err as Error).message);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fixture, replay, initial.tasks, initial.runCount]);

  const blockedReason = !status.foConnected ? 'Connect Fo first' : null;

  async function send(input: TaskInput & { draft?: DraftMeta }) {
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
    const { task: t } = await api<{ task: Task }>(`/api/tasks/${task.id}/retry`, {});
    upsert(t);
  }
  async function addRule(input: RuleInput) {
    const { rule } = await api<{ rule: Rule }>('/api/rules', input);
    setRules((rs) => [...rs, rule]);
  }

  function openTrace(task: Task | null, from?: HTMLElement | null) {
    lastTraceButton.current = from ?? (document.activeElement as HTMLElement | null);
    if (!task) {
      setTrace({ task: null, events: [], loading: false });
      return;
    }
    if (fixture !== null) {
      setTrace({ task, events: fixtureEvents(task), loading: false });
      return;
    }
    if (replay) {
      setTrace({ task, events: replay.events.filter((e) => e.taskId === task.id), loading: false });
      return;
    }
    setTrace({ task, events: [], loading: true });
  }
  const closeTrace = useCallback(() => setTrace(null), []);

  const held = tasks.filter((t) => t.status === 'held');
  const rows = tasks.filter((t) => t.status !== 'held');
  const exportHref = fixture !== null || !tasks.some((t) => t.runId === runCount.runId) ? null : `/api/trace/export?run=${encodeURIComponent(runCount.runId)}`;

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 relative">
      <div ref={topRef}>
        <TopBar runCount={runCount} status={status} onRunsClick={() => openTrace(null)} />
      </div>
      <p className="px-4 sm:px-6 pt-3 pb-1 text-[14px] text-ink-muted">What Fo did, checked in your own calendar.</p>
      <RulesStrip rules={rules} onAdd={live ? addRule : undefined} readOnly={!live} />
      <Compose
        contacts={contacts}
        onSend={send}
        blockedReason={live ? blockedReason : fixture === 'disconnected' ? 'Connect Fo first' : replay ? 'Replay mode: press Alt+Shift+P to leave it' : null}
        onBlockedClick={() => {
          topRef.current?.querySelector<HTMLAnchorElement>('a[href="/connect"]')?.focus();
        }}
      />
      {notice && (
        <p className={`text-[13px] text-warning ${record ? 'notice-docked' : 'mx-4 sm:mx-6 mt-2'}`} role="status">
          {notice}
        </p>
      )}
      {held.map((t) => (
        <HeldCard key={t.id} task={t} rules={rules} onDecide={live ? (d) => decide(t, d) : async () => setNotice('Decisions are off in this view.')} />
      ))}
      <section aria-label="Receipts">
        <h1 className="sr-only">Receipts</h1>
        {rows.length === 0 ? (
          <p className="px-4 sm:px-6 py-10 text-ink-muted">No receipts yet. Ask Fo for something above.</p>
        ) : (
          <ol>
            {rows.map((t) => (
              <ReceiptRow
                key={t.id}
                task={t}
                rules={rules}
                isNew={newIds.has(t.id)}
                replayLabel={
                  replay
                    ? `Replay · run of ${new Date(replay.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`
                    : live && t.runId !== runCount.runId
                      ? `earlier run, ${new Date(t.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                      : null
                }
                onTrace={(task, el) => openTrace(task, el)}
                onConfirm={live ? confirm : undefined}
                onAnswer={live ? answer : undefined}
                onRetry={live ? retry : undefined}
              />
            ))}
          </ol>
        )}
      </section>
      <div role="status" aria-live="polite" className="sr-only">
        {tasks.find((t) => t.status === 'verified') ? 'A receipt was verified from your calendar.' : ''}
      </div>
      {trace && <TraceDrawer task={trace.task} events={trace.events} loading={trace.loading} runCount={runCount} exportHref={exportHref} onClose={closeTrace} returnFocusTo={lastTraceButton} />}
    </main>
  );
}
