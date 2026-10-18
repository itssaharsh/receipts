import Link from 'next/link';
import type { RunCount } from '@/lib/types';

export type ConnStatus = { mode: 'live' | 'fake'; foConnected: boolean; foSimulated: boolean; googleConnected: boolean };

export function Mark({ size = 22 }: { size?: number }) {
  // A counterfoil: a slip with a perforated cut and the verified disc on the stub.
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Receipts mark" className="shrink-0">
      <rect x="4" y="10" width="40" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M30 10v4M30 18v4M30 26v4M30 34v4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="37" cy="24" r="4" fill="var(--accent)" />
    </svg>
  );
}

export function runChipText(rc: RunCount): string {
  const parts = [`${rc.sent} sent`, `${rc.verified} verified`];
  if (rc.unverified) parts.push(`${rc.unverified} unverified`);
  if (rc.confirmedByUser) parts.push(`${rc.confirmedByUser} confirmed by you`);
  if (rc.withheld) parts.push(`${rc.withheld} withheld`);
  if (rc.failed) parts.push(`${rc.failed} failed`);
  return `Runs: ${parts.join(', ')}${rc.simulated ? ' (simulated)' : ''}`;
}

export function TopBar({ runCount, status, onRunsClick }: { runCount: RunCount; status: ConnStatus; onRunsClick?: () => void }) {
  return (
    <header className="flex items-center gap-4 h-[52px] border-b border-line px-4 sm:px-6">
      <Link href="/" className="flex items-center gap-2 text-ink">
        <Mark />
        <span className="wordmark">Receipts</span>
      </Link>
      <Link href="/about" className="text-sm text-ink-muted hover:text-ink">
        About
      </Link>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <button type="button" onClick={onRunsClick} className="num rounded-md bg-surface-2 px-3 h-8 text-[13px] text-ink hidden sm:inline-flex items-center" title="Open the run count and the trace">
          {runChipText(runCount)}
        </button>
        <Chip label="Fo" connected={status.foConnected} simulated={status.foSimulated} />
        <Chip label="Calendar" connected={status.googleConnected} />
      </div>
    </header>
  );
}

function Chip({ label, connected, simulated }: { label: string; connected: boolean; simulated?: boolean }) {
  const title = simulated ? 'Simulated Fo for development; the recorded run uses the live Fo' : connected ? `${label} connected` : `${label} not connected: open /connect`;
  return (
    <Link href="/connect" className="inline-flex items-center gap-2 h-8 rounded-md border border-line px-2.5 text-[13px] text-ink" data-tooltip={title} title={title} aria-label={title}>
      <span className="disc" data-kind={connected ? (simulated ? 'awaiting' : 'verified') : 'allowed'} aria-hidden="true" />
      {label}
      {simulated && <span className="text-ink-muted">simulated</span>}
    </Link>
  );
}
