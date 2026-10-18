'use client';

import { useState } from 'react';
import type { Contact, TaskCategory, TaskInput } from '@/lib/types';

export const DEMO_TASK: TaskInput = {
  text: 'Book my dentist check-up: email Northfield Dental to confirm Thursday 3pm and put it on my calendar',
  counterparty: 'Northfield Dental',
  amountCents: 0,
  category: 'booking',
  postcondition: { kind: 'calendar_event', titleContains: 'Dental', startISO: '2026-10-22T15:00:00+01:00', windowMinutes: 30 },
};

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

export function Compose({
  contacts,
  onSend,
  blockedReason,
  onBlockedClick,
}: {
  contacts: Contact[];
  onSend: (input: TaskInput) => Promise<void>;
  blockedReason: string | null;
  onBlockedClick: () => void;
}) {
  const [text, setText] = useState('');
  const [who, setWho] = useState(contacts[0]?.name ?? '');
  const [other, setOther] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<TaskCategory>('booking');
  const [check, setCheck] = useState<'calendar' | 'none'>('calendar');
  const [title, setTitle] = useState('Dental');
  const [when, setWhen] = useState('2026-10-22T15:00');
  const [windowMin, setWindowMin] = useState('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counterparty = who === '__other' ? other : who;

  function fillDemo() {
    setText(DEMO_TASK.text);
    setWho(contacts.some((c) => c.name === 'Northfield Dental') ? 'Northfield Dental' : '__other');
    setOther('Northfield Dental');
    setAmount('');
    setCategory('booking');
    setCheck('calendar');
    setTitle('Dental');
    setWhen('2026-10-22T15:00');
    setWindowMin('30');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (blockedReason) {
      onBlockedClick();
      setError(blockedReason);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input: TaskInput = {
        text: text.trim(),
        counterparty: counterparty.trim(),
        amountCents: amount ? Math.round(Number(amount) * 100) : 0,
        category,
        postcondition: check === 'calendar' ? { kind: 'calendar_event', titleContains: title.trim(), startISO: localToISO(when), windowMinutes: Number(windowMin) || 30 } : { kind: 'none' },
      };
      await onSend(input);
      setText('');
      setAmount('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="px-4 sm:px-6 py-4 border-b border-line flex flex-col gap-3" aria-label="Ask Fo">
      <div className="flex flex-col sm:flex-row gap-3">
        <label className="flex-1 flex flex-col gap-1">
          <span className="label">Ask Fo to…</span>
          <input className="field w-full" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Fo to…" required maxLength={2000} />
        </label>
        <label className="flex flex-col gap-1 sm:w-[200px]">
          <span className="label">Who it involves</span>
          <select className="field" value={who} onChange={(e) => setWho(e.target.value)} required>
            {contacts.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
            <option value="__other">Someone else…</option>
          </select>
        </label>
        {who === '__other' && (
          <label className="flex flex-col gap-1 sm:w-[200px]">
            <span className="label">Their name</span>
            <input className="field" value={other} onChange={(e) => setOther(e.target.value)} required placeholder="Jordan Lee" />
          </label>
        )}
        <label className="flex flex-col gap-1 sm:w-[120px]">
          <span className="label">Amount, if any</span>
          <input className="field num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$0" />
        </label>
        <div className="flex flex-col gap-1 justify-end">
          <span className="label" aria-hidden="true">
            &nbsp;
          </span>
          <button type="submit" className="btn btn-primary h-11" aria-disabled={busy}>
            {busy ? 'Sending…' : 'Send to Fo'}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="label">Kind</span>
          <select className="field field-sm" value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
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
          <select className="field field-sm" value={check} onChange={(e) => setCheck(e.target.value as 'calendar' | 'none')}>
            <option value="calendar">an event in my calendar</option>
            <option value="none">no check</option>
          </select>
        </label>
        {check === 'calendar' && (
          <>
            <label className="flex flex-col gap-1">
              <span className="label">Title contains</span>
              <input className="field field-sm w-[160px]" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Starts</span>
              <input className="field field-sm" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Give or take, minutes</span>
              <input className="field field-sm w-[90px] num" inputMode="numeric" value={windowMin} onChange={(e) => setWindowMin(e.target.value)} />
            </label>
          </>
        )}
        <button type="button" className="btn btn-text" onClick={fillDemo}>
          Fill the demo task
        </button>
        {error && (
          <p className="text-danger text-sm basis-full" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
