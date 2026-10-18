import Link from 'next/link';
import { Mark } from '../components/TopBar';

export const metadata = {
  title: 'About Receipts',
  description: "Fo says done. Receipts checks your own calendar before believing it.",
};

/** The landing layer (UI-SPEC §9): product copy for a stranger. The README's first screen reuses it word for word. */
export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-4 sm:px-6 py-8">
      <Link href="/" className="inline-flex items-center gap-2 text-ink">
        <Mark />
        <span className="wordmark">Receipts</span>
      </Link>

      <h1 className="mt-8 text-[30px] leading-[1.15] font-semibold" style={{ fontFamily: 'var(--ff-display)' }}>
        Fo says done. Receipts checks your own calendar before believing it.
      </h1>
      <p className="mt-3 text-[17px] text-ink-muted">
        Receipts sends your errands to Wajo&rsquo;s Fo agent under rules you wrote once, then reads your own Google Calendar to confirm the result landed.
      </p>

      <section className="mt-8">
        <h2 className="font-semibold">What you see</h2>
        <ul className="mt-2 flex flex-col gap-2 text-[15px]">
          <li>Every receipt shows Fo&rsquo;s claim beside what your calendar actually holds.</li>
          <li>Tasks inside your three rules go without asking; anything else waits for one tap.</li>
          <li>Each run is logged with Fo&rsquo;s tool calls, and the run count is reported as it is: sent, verified, withheld.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">How it works</h2>
        <ol className="mt-2 flex flex-col gap-2 text-[15px] list-decimal pl-5">
          <li>Write three rules once: who Fo may contact, how much it may spend, what always waits for you.</li>
          <li>Ask Fo for something. Receipts sends it if the rules allow, or holds it for your tap.</li>
          <li>When Fo says done, Receipts looks in your calendar and marks the receipt verified, or asks Fo again.</li>
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">Limits</h2>
        <p className="mt-2 text-[15px] text-ink-muted">
          Receipts verifies calendar bookings today; email confirmations are next. The clinic in the demo is a second mailbox we control. Receipts runs no model of its own; Fo is the agent. A manual tick is shown as &ldquo;confirmed by you&rdquo;, never as verified.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">Built at the GSD Hackathon</h2>
        <p className="mt-2 text-[15px] text-ink-muted">
          Wajo &times; Claude, 17 to 19 October 2026. Everything here was written during the event; the research that chose the idea was finished on 18 October, after hacking opened. Fo is Wajo&rsquo;s action agent, driven over MCP from the person&rsquo;s own account.
        </p>
      </section>

      <p className="mt-10 text-[14px]">
        <Link href="/" className="underline">
          Open the ledger
        </Link>
      </p>
    </main>
  );
}
