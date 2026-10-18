'use client';

import { useEffect, useRef, useState } from 'react';
import type { Contact, DraftMeta, TaskCategory, TaskInput } from '@/lib/types';

/** The demo task's words; its time is filled as a local wall time below (Thu 22 Oct 2026, 15:00) so the browser's zone applies. */
const DEMO_TEXT = 'Book my dentist check-up: email Northfield Dental to confirm Thursday 3pm and put it on my calendar';

/** "2026-10-22T15:00" from a datetime-local field -> an ISO string with the browser's offset for that instant. */
export function localToISO(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return local;
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  return `${local}:00${sign}${hh}:${mm}`;
}

/** The browser's own wall clock as 'YYYY-MM-DDTHH:MM', so "Thursday 3pm" resolves in the person's zone. */
function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "anthropic/claude-haiku-4.5" -> "Claude Haiku 4.5". */
function modelLabel(model: string | null): string {
  if (!model) return 'no model';
  const name = model.split('/').pop() ?? model;
  return name
    .split('-')
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

type DraftPostcondition = { kind: 'calendar_event'; titleContains: string; startLocal: string; windowMinutes: number } | { kind: 'none' };
type DraftResponse = {
  draft: { counterparty: string; category: TaskCategory; amountCents: number; postcondition: DraftPostcondition; summary: string };
  source: 'model' | 'words';
  model: string | null;
  ms: number;
  note: string | null;
};
type DraftState = { status: 'idle' } | { status: 'drafting' } | { status: 'drafted'; forText: string; meta: DraftMeta } | { status: 'failed'; message: string };

type Field = 'who' | 'amount' | 'category' | 'check' | 'title' | 'when' | 'window';

export function Compose({
  contacts,
  onSend,
  blockedReason,
  onBlockedClick,
}: {
  contacts: Contact[];
  onSend: (input: TaskInput & { draft?: DraftMeta }) => Promise<void>;
  blockedReason: string | null;
  onBlockedClick: () => void;
}) {
  const [text, setText] = useState('');
  const [who, setWho] = useState('');
  const [other, setOther] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<TaskCategory>('booking');
  const [check, setCheck] = useState<'calendar' | 'none'>('none');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [windowMin, setWindowMin] = useState('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>({ status: 'idle' });
  const [flash, setFlash] = useState(false);

  // fields the person set by hand since the sentence last changed; a draft never overwrites those
  const touched = useRef<Set<Field>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftedFor = useRef<string>(''); // the sentence the current fields were drafted from

  const counterparty = who === '__other' ? other : who;

  function touch(f: Field) {
    touched.current.add(f);
  }

  function applyDraft(r: DraftResponse) {
    const d = r.draft;
    const t = touched.current;
    if (!t.has('who')) {
      if (d.counterparty && contacts.some((c) => c.name === d.counterparty)) {
        setWho(d.counterparty);
      } else {
        setWho(d.counterparty ? '__other' : '');
        setOther(d.counterparty);
      }
    }
    if (!t.has('amount')) setAmount(d.amountCents ? String(d.amountCents / 100) : '');
    if (!t.has('category')) setCategory(d.category);
    if (!t.has('check')) setCheck(d.postcondition.kind === 'calendar_event' ? 'calendar' : 'none');
    if (d.postcondition.kind === 'calendar_event') {
      if (!t.has('title')) setTitle(d.postcondition.titleContains);
      if (!t.has('when')) setWhen(d.postcondition.startLocal);
      if (!t.has('window')) setWindowMin(String(d.postcondition.windowMinutes));
    }
    setFlash(true);
    setTimeout(() => setFlash(false), 1300);
  }

  /** Ask the drafter for this sentence. Resolves to the draft meta, or null when it could not draft. */
  async function runDraft(forText: string): Promise<DraftMeta | null> {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setDraft({ status: 'drafting' });
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ text: forText, nowLocal: nowLocal(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null }),
      });
      if (!res.ok) throw new Error(`the drafter answered ${res.status}`);
      const r = (await res.json()) as DraftResponse;
      if (controller.signal.aborted) return null;
      const meta: DraftMeta = { source: r.source, model: r.model, ms: r.ms, summary: r.draft.summary, note: r.note };
      applyDraft(r);
      draftedFor.current = forText;
      setDraft({ status: 'drafted', forText, meta });
      return meta;
    } catch (err) {
      if (controller.signal.aborted) return null;
      setDraft({ status: 'failed', message: (err as Error).message });
      return null;
    }
  }

  // draft when the person pauses after typing a sentence
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const t = text.trim();
    if (t.length < 12 || t === draftedFor.current) return;
    timerRef.current = setTimeout(() => void runDraft(t), 800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function onText(v: string) {
    setText(v);
    touched.current = new Set(); // a new sentence: the next draft may fill every field again
    if (draft.status === 'drafted' && v.trim() !== draft.forText) setDraft({ status: 'idle' });
  }

  function fillDemo() {
    abortRef.current?.abort();
    setText(DEMO_TEXT);
    draftedFor.current = DEMO_TEXT;
    touched.current = new Set<Field>(['who', 'amount', 'category', 'check', 'title', 'when', 'window']);
    setWho(contacts.some((c) => c.name === 'Northfield Dental') ? 'Northfield Dental' : '__other');
    setOther('Northfield Dental');
    setAmount('');
    setCategory('booking');
    setCheck('calendar');
    setTitle('Dental');
    setWhen('2026-10-22T15:00');
    setWindowMin('30');
    setDraft({ status: 'idle' });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (blockedReason) {
      onBlockedClick();
      setError(blockedReason);
      return;
    }
    setError(null);
    const t = text.trim();
    // nothing chosen yet: draft first and stop, so the person sees what will be sent and checked
    if (!counterparty.trim()) {
      if (timerRef.current) clearTimeout(timerRef.current);
      const meta = draft.status === 'drafting' ? null : await runDraft(t);
      if (draft.status !== 'drafting' && (!meta || !/Fo will contact (?!whoever)/.test(meta.summary))) {
        setError('Say who this involves, in the sentence or in the details.');
      }
      return;
    }
    setBusy(true);
    try {
      const input: TaskInput & { draft?: DraftMeta } = {
        text: t,
        counterparty: counterparty.trim(),
        amountCents: amount ? Math.round(Number(amount) * 100) : 0,
        category,
        postcondition: check === 'calendar' ? { kind: 'calendar_event', titleContains: title.trim(), startISO: localToISO(when), windowMinutes: Number(windowMin) || 30 } : { kind: 'none' },
      };
      if (draft.status === 'drafted' && draft.forText === t) input.draft = draft.meta;
      await onSend(input);
      setText('');
      setAmount('');
      setWho('');
      setOther('');
      setCheck('none');
      setTitle('');
      setWhen('');
      draftedFor.current = '';
      touched.current = new Set();
      setDraft({ status: 'idle' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const statusLine = (() => {
    switch (draft.status) {
      case 'drafting':
        return 'Reading your sentence…';
      case 'drafted': {
        const m = draft.meta;
        const by = m.source === 'model' ? `Drafted by ${modelLabel(m.model)} in ${(m.ms / 1000).toFixed(1)} s` : 'Drafted from your words, no model';
        const note = m.note ? ` (${m.note})` : '';
        return `${by}${note} · ${m.summary} Edit anything, then send.`;
      }
      case 'failed':
        return `Could not draft the details (${draft.message}); fill them in below.`;
      default:
        return null;
    }
  })();

  const details = (
    <div className={`flex flex-wrap items-end gap-3 ${flash ? 'drafted' : ''}`}>
      <label className="flex flex-col gap-1">
        <span className="label">Who it involves</span>
        <select
          className="field field-sm"
          value={who}
          onChange={(e) => {
            touch('who');
            setWho(e.target.value);
          }}
        >
          <option value="">Who it involves…</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
          <option value="__other">Someone else…</option>
        </select>
      </label>
      {who === '__other' && (
        <label className="flex flex-col gap-1">
          <span className="label">Their name</span>
          <input
            className="field field-sm"
            value={other}
            onChange={(e) => {
              touch('who');
              setOther(e.target.value);
            }}
            placeholder="Jordan Lee"
          />
        </label>
      )}
      <label className="flex flex-col gap-1 w-[110px]">
        <span className="label">Amount, if any</span>
        <input
          className="field field-sm num"
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            touch('amount');
            setAmount(e.target.value);
          }}
          placeholder="$0"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Kind</span>
        <select
          className="field field-sm"
          value={category}
          onChange={(e) => {
            touch('category');
            setCategory(e.target.value as TaskCategory);
          }}
        >
          <option value="booking">booking</option>
          <option value="email">email</option>
          <option value="call">call</option>
          <option value="purchase">purchase</option>
          <option value="cancellation">cancellation</option>
          <option value="other">other</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Check</span>
        <select
          className="field field-sm"
          value={check}
          onChange={(e) => {
            touch('check');
            setCheck(e.target.value as 'calendar' | 'none');
          }}
        >
          <option value="calendar">an event in my calendar</option>
          <option value="none">no check</option>
        </select>
      </label>
      {check === 'calendar' && (
        <>
          <label className="flex flex-col gap-1">
            <span className="label">Title contains</span>
            <input
              className="field field-sm w-[140px]"
              value={title}
              onChange={(e) => {
                touch('title');
                setTitle(e.target.value);
              }}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">Starts</span>
            <input
              className="field field-sm"
              type="datetime-local"
              value={when}
              onChange={(e) => {
                touch('when');
                setWhen(e.target.value);
              }}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">Give or take, minutes</span>
            <input
              className="field field-sm w-[80px] num"
              inputMode="numeric"
              value={windowMin}
              onChange={(e) => {
                touch('window');
                setWindowMin(e.target.value);
              }}
            />
          </label>
        </>
      )}
      <button type="button" className="btn btn-text" onClick={fillDemo}>
        Fill the demo task
      </button>
    </div>
  );

  return (
    <form onSubmit={submit} className="px-4 sm:px-6 py-3 border-b border-line flex flex-col gap-3" aria-label="Ask Fo">
      <div className="flex gap-2 sm:gap-3 items-end">
        <label className="flex-1 flex flex-col gap-1 min-w-0">
          <span className="label">Ask Fo to…</span>
          <input
            className="field w-full"
            value={text}
            onChange={(e) => onText(e.target.value)}
            placeholder="Ask Fo to… (one sentence; the details below are drafted from it)"
            required
            maxLength={2000}
            aria-describedby="draft-status"
          />
        </label>
        <button type="submit" className="btn btn-primary h-11" aria-disabled={busy}>
          {busy ? 'Sending…' : 'Send to Fo'}
        </button>
      </div>
      <p id="draft-status" className="text-[13px] text-ink-muted min-h-[1.25rem] -mt-1" aria-live="polite">
        {statusLine}
      </p>
      <div className="hidden sm:block">{details}</div>
      <details className="sm:hidden">
        <summary className="text-[13px] text-ink-muted cursor-pointer">
          Details: {counterparty || 'who it involves'}, {amount ? `$${amount}` : 'no amount'}, {category}
          {check === 'calendar' ? `, expected in your calendar` : ''}
        </summary>
        <div className="pt-3">{details}</div>
      </details>
      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
