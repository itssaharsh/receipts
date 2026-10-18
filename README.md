# Receipts

**Fo says done. Receipts checks your own calendar before believing it.**

Receipts sends your errands to Wajo's Fo agent under rules you wrote once, then reads your own Google Calendar to confirm the result landed.

![The Receipts ledger: a verified receipt with Fo's claim on the left and the calendar record on the right](public/screenshot-ledger.png)

Built at the GSD (Get Sh\*t Done) Hackathon, Wajo × Claude, 17 to 19 October 2026. Everything here, including the planning notes kept outside this repository, was written during the event; the research package that chose the idea was finished on 18 October, after hacking opened.

Demo video: one unedited take, about 35 seconds, attached to the X post (form item A). The run trace and the run count are in `SUBMISSION.md`.

## What you see

- Every receipt shows Fo's claim beside what your calendar actually holds.
- Tasks inside your three rules go without asking; anything else waits for one tap.
- Each run is logged with Fo's tool calls, and the run count is reported as it is: sent, verified, withheld.

## How it works

1. Write three rules once: who Fo may contact, how much it may spend, what always waits for you.
2. Ask Fo for something. Receipts sends it if the rules allow, or holds it for your tap (approve once, approve and add a rule, decline).
3. When Fo says done, Receipts looks in your calendar and marks the receipt verified, or asks Fo again, then offers a manual tick that is shown as "confirmed by you", never as verified.

## What is real and what is simulated

| Part | In the recorded run |
|---|---|
| Fo (Wajo's action agent) | live, over MCP from the person's own Wajo account (OAuth with PKCE and dynamic client registration) |
| The calendar check | live, Google Calendar API, read-only, the person's own primary calendar |
| The rules evaluator, the held queue, the ledger, the trace | plain code in this repository; no model runs in Receipts |
| The clinic in the demo task | a second mailbox the builder controls, named on the receipt |
| `FO_MODE=fake` and `ORACLE_MODE=fake` | an in-process simulated Fo and a simulated calendar for development and tests; every such row says "Simulated Fo" and those runs are left out of the run count |

## Run it

```bash
cp .env.example .env.local      # fill GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; set FO_MODE=live
npm install
npm run dev                     # port 3100; then open http://localhost:3100/connect to connect Fo and Google Calendar
```

For a look without any account: `FO_MODE=fake ORACLE_MODE=fake npm run dev` and open `http://localhost:3100/?demo=1`. Every row state is also reachable with `?state=verified|held|working|unverified|manual|withheld|failed|awaiting|empty|disconnected`.

Shortcuts: `Alt+Shift+R` clears the ledger and starts a new run; `Alt+Shift+P` replays the recorded real run (saved with `POST /api/replay`). `?record=1` docks notices away from the receipts for screen recording.

## Verify

```bash
npm test            # rules, trace, Fo client and OAuth against a fake Wajo, runner, decisions, calendar check, Google oracle, routes, states, replay
npm run typecheck
npm run build
```

## Architecture

One Next.js app, SQLite plus an append-only JSONL trace, an MCP client to `https://mcp.api.wajo.ai/fo`, a read-only Google Calendar oracle. See `ARCHITECTURE.md`. The judged path and the event's criteria are in `.prod-build/contract.md` §12.

## Tools used to build it

Claude Code (the Claude agent) wrote the code, tests and documents with the builder; the plan, contract and evidence ledger are in `.prod-build/`. Fo was never asked by a page load: only the person's own send.
