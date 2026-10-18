'use client';

import { useEffect, useRef } from 'react';
import type { RunCount, Task, TraceEvent } from '@/lib/types';

function hhmmss(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const KIND_WORD: Record<TraceEvent['kind'], string> = {
  decision: 'rule',
  user_decision: 'you',
  list_tools: 'tools/list',
  ask_fo: 'ask_fo',
  get_fo_reply: 'get_fo_reply',
  get_fo_conversation: 'get_fo_conversation',
  check: 'check',
  reask: 'reask',
  manual: 'manual',
  error: 'error',
  note: 'note',
};

export function RunCountTable({ rc }: { rc: RunCount }) {
  const rows: Array<[string, number]> = [
    ['sent to Fo', rc.sent],
    ['verified from the calendar', rc.verified],
    ['unverified', rc.unverified],
    ['confirmed by you', rc.confirmedByUser],
    ['withheld', rc.withheld],
    ['failed', rc.failed],
  ];
  return (
    <table className="w-full text-[14px]">
      <caption className="text-left text-[12px] text-ink-muted mb-1">
        Run count for {rc.runId}
        {rc.simulated ? ' (simulated Fo; not counted on the form)' : ''}
      </caption>
      <tbody>
        {rows.map(([k, n]) => (
          <tr key={k} className="border-t border-line">
            <th scope="row" className="text-left font-normal py-1">
              {k}
            </th>
            <td className="num text-right py-1">{n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TraceDrawer({
  task,
  events,
  loading,
  runCount,
  exportHref,
  onClose,
  returnFocusTo,
}: {
  task: Task | null;
  events: TraceEvent[];
  loading: boolean;
  runCount: RunCount;
  exportHref: string | null;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      returnFocusTo?.focus();
    };
  }, [onClose, returnFocusTo]);

  return (
    <aside className="drawer" role="dialog" aria-modal="false" aria-labelledby="trace-title">
      <div className="flex items-start gap-3 p-4 border-b border-line">
        <div className="min-w-0 flex-1">
          <h2 id="trace-title" className="font-semibold text-[16px]">
            {task ? 'Trace for this receipt' : 'Run count'}
          </h2>
          {task && <p className="text-[13px] text-ink-muted truncate">{task.text}</p>}
        </div>
        <button ref={closeRef} type="button" className="btn btn-text text-ink" onClick={onClose} aria-label="Close the trace">
          Close
        </button>
      </div>
      <div className="p-4 flex flex-col gap-5 overflow-y-auto">
        {task && (
          <section aria-label="Events">
            {loading ? (
              <p className="text-ink-muted text-[14px]">Loading the trace…</p>
            ) : events.length === 0 ? (
              <p className="text-ink-muted text-[14px]">No events yet.</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {events.map((e) => (
                  <li key={e.id} className="trace-line flex gap-3">
                    <time dateTime={e.ts} className="text-ink-muted shrink-0 num">
                      {hhmmss(e.ts)}
                    </time>
                    <span className={`shrink-0 ${['ask_fo', 'get_fo_reply', 'get_fo_conversation', 'list_tools'].includes(e.kind) ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{KIND_WORD[e.kind]}</span>
                    <span className="min-w-0 break-words">{e.summary}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
        <RunCountTable rc={runCount} />
        <div className="flex flex-wrap gap-2">
          {exportHref ? (
            <a className="btn btn-tonal" href={exportHref} download>
              Export trace
            </a>
          ) : (
            <span className="text-[13px] text-ink-muted">Export is available once the run has events.</span>
          )}
        </div>
        <p className="text-[12px] text-ink-muted">Every Fo tool call, rule decision and calendar check, in the order it happened. Tokens are removed before anything is written.</p>
      </div>
    </aside>
  );
}
