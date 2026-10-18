'use client';

import { useState } from 'react';
import type { Rule, Task } from '@/lib/types';
import { describeTask, stripHours } from '@/lib/view';

export function CalendarStrip({ start, title }: { start: string; title: string }) {
  const s = stripHours(start);
  const time = /T(\d{2}:\d{2})/.exec(start)?.[1] ?? '';
  return (
    <div className="strip mt-2" role="img" aria-label={`Your calendar, ${s.label}: ${title} at ${time}`}>
      <div className="strip-head">Found in your calendar: {s.label}</div>
      {s.hours.map((h) => (
        <div className="strip-row" key={h.hour}>
          <span className="strip-hour">{h.hour}</span>
          {h.isEvent ? (
            <span className="strip-event">
              <span>{title}</span>
              <time dateTime={start}>{time}</time>
            </span>
          ) : (
            <span />
          )}
        </div>
      ))}
    </div>
  );
}

export function ReceiptRow({
  task,
  rules,
  isNew,
  replayLabel,
  onTrace,
  onConfirm,
  onAnswer,
  onRetry,
}: {
  task: Task;
  rules: Rule[];
  isNew?: boolean;
  replayLabel?: string | null;
  onTrace?: (task: Task, from: HTMLElement | null) => void;
  onConfirm?: (task: Task) => Promise<void>;
  onAnswer?: (task: Task, answer: string) => Promise<void>;
  onRetry?: (task: Task) => Promise<void>;
}) {
  const v = describeTask(task, rules);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const found = task.status === 'verified' && task.checkResult?.found && task.checkResult.start;

  async function run(fn?: () => Promise<void>) {
    if (!fn) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`px-4 sm:px-6 py-3 border-b border-line ${isNew ? 'row-enter' : ''}`} data-status={task.status} data-task-id={task.id}>
      <div className="flex flex-col md:grid md:grid-cols-[120px_minmax(0,1fr)_0px_minmax(0,0.72fr)_auto] md:items-start gap-x-4 gap-y-2">
        {/* status */}
        <div className="flex items-center gap-2 pt-0.5">
          <span className="disc" data-kind={v.disc} aria-hidden="true" />
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em]">{v.statusWord}</span>
        </div>

        {/* the claim half */}
        <div className="min-w-0">
          <p className="text-[15px] font-medium">{task.text}</p>
          <p className="text-[13px] text-ink-muted">{v.ruleLine}</p>
          {v.claimLine && <p className="text-[14px] mt-1">{v.claimLine}</p>}
          {task.status === 'working' && task.foProgress.length > 1 && (
            <p className="text-[12px] text-ink-muted">{task.foProgress.length} steps so far</p>
          )}
          {task.postcondition.kind === 'calendar_event' && (
            <p className="text-[12px] text-ink-muted mt-1">
              Expected in your calendar: &ldquo;{task.postcondition.titleContains}&rdquo; around {stripHours(task.postcondition.startISO).label} {/T(\d{2}:\d{2})/.exec(task.postcondition.startISO)?.[1]}
            </p>
          )}
        </div>

        {/* the perforated counterfoil edge */}
        <div className="perf hidden md:block" aria-hidden="true" />

        {/* the proof half */}
        <div className="min-w-0 md:pl-4 border-t border-dashed border-line-input pt-2 md:border-t-0 md:pt-0">
          <p className={`text-[14px] ${v.proofKind === 'found' ? 'text-accent font-semibold' : v.proofKind === 'checking' ? 'checking' : v.proofKind === 'unverified' || v.proofKind === 'no_calendar' || v.proofKind === 'question' ? 'text-warning' : v.proofKind === 'never' || v.proofKind === 'failed' ? 'text-ink-muted' : 'text-ink-muted'}`}>
            {v.proofLine}
          </p>
          <div className="unfold" data-open={found ? 'true' : 'false'}>
            <div>{found && <CalendarStrip start={task.checkResult!.start!} title={task.checkResult!.title ?? task.postcondition.kind === 'calendar_event' ? (task.checkResult!.title ?? '') : ''} />}</div>
          </div>
          {v.proofAction === 'confirm' && onConfirm && (
            <button type="button" className="btn btn-text mt-1 -ml-2 text-ink" aria-disabled={busy} onClick={() => run(() => onConfirm(task))}>
              Confirm by hand
            </button>
          )}
          {v.proofAction === 'retry' && onRetry && (
            <button type="button" className="btn btn-text mt-1 -ml-2 text-ink" aria-disabled={busy} onClick={() => run(() => onRetry(task))}>
              Try sending again
            </button>
          )}
          {v.proofAction === 'answer' && onAnswer && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (answer.trim()) run(() => onAnswer(task, answer.trim())).then(() => setAnswer(''));
              }}
            >
              <input className="field field-sm flex-1" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer to Fo" aria-label="Your answer to Fo" />
              <button type="submit" className="btn btn-tonal h-9" aria-disabled={busy}>
                Answer
              </button>
            </form>
          )}
        </div>

        {/* time + trace */}
        <div className="flex md:flex-col items-center md:items-end gap-2 text-[12px] text-ink-muted num">
          <time dateTime={task.updatedAt}>{v.time}</time>
          {v.simulatedLabel && <span>{v.simulatedLabel}</span>}
          {task.runId === 'run-fixture' && <span>fixture</span>}
          {replayLabel && <span className="text-right">{replayLabel}</span>}
          {onTrace && (
            <button type="button" className="btn btn-text h-7 px-2" onClick={(e) => onTrace(task, e.currentTarget)}>
              Trace
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
