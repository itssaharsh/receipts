# Delivery report — Receipts (hackathon, 2026-10-18, updated 11:30 UTC)

## Built
- J1 (ask → rules → send or hold → Fo works → claim → calendar check → receipt): complete, with the held card's three decisions, the auto-answer of Fo's confirmation question from the approval, one re-ask after an empty check, and the manual tick shown as "confirmed by you".
- J2 (connect Fo over MCP with OAuth 2.1, DCR and PKCE; connect Google Calendar read-only): complete at `/connect`; tokens live in SQLite, never in a page.
- J3 (the trace drawer per task, the run count per run, the JSONL export for form item F, the replay of a saved run): complete.
- M10 (one-sentence intake, built in the afternoon from C1): a drafter proposes counterparty, kind, amount and the postcondition from the sentence (google/gemini-2.5-flash-lite over Vercel's AI Gateway in about a second; a deterministic reading of the words when the model is off, slow or over budget); the status line names the drafter; the person edits and sends; the rules evaluate only the confirmed fields; the draft is the first trace event (ADR-0006 supersedes ADR-0005).
- T14 (public demo): PUBLIC_DEMO mode (banner, simulated chips, nothing to connect, a model-draft budget per minute, same-origin by host) and Node's built-in SQLite instead of the native module, deployed to Vercel.
- Cut to a later horizon: inbox verification (S1), weekly spend caps (C3).

## Architecture
- One Next.js 16 app, one SQLite file plus an append-only JSONL trace, run locally for the take (ADR-0001). Receipts is the MCP client to Fo with the SDK's OAuth provider backed by SQLite (ADR-0002). The oracle is the person's own Google Calendar, never Fo's reply; a manual tick is its own state (ADR-0003). A simulated Fo over the SDK's in-memory transport serves tests and development, labelled on every row and left out of the run count (ADR-0004).
- Deliberately not built: a server deployment (both OAuth redirects are localhost and the judged run is a screen recording), a queue or a second datastore, any model call.

## Verification
- Unit and route suite: 59 tests passed after the review fixes [E0110]; typecheck [E0109]; production build [E0106]; lint clean [E0063].
- RED-first runs for the rules, trace, Fo client, OAuth, check, runner, decisions, routes, states, Google oracle and replay: RED as expected [E0001, E0009, E0010, E0017, E0018, E0019, E0020, E0032, E0043, E0048].
- One real call to the live Fo MCP endpoint (unauthenticated probe, 401 with the OAuth metadata as expected) [E0016].
- Scripted demo run against the production build, four consecutive passes on the simulated Fo and calendar [E0081, E0082, E0083, E0097]; the backup take recorded (35 s) [E0074].
- Accessibility (axe, 0 violations) [E0075]; keyboard path [E0079]; unprepared inputs [E0080]; first screen measured with foldcheck at 1440x900 and 390x844 [E0084, E0086].
- Fresh review and bug hunt: 4 blocking and 16 minor findings, all blocking and 13 minors fixed with regression tests [E0097].
- Security gate: dependency audit clean at high, no secret-shaped string, no data/ or env file tracked [E0107, E0108, E0111].
- Submission check: NOT READY as expected; it failed only on the four event rules that a person must attest or that need the real run, every repository-side item ok [E0112]; window check passed [E0115].
- Intake drafter: 66 tests including the words-only drafter, the model adapter with a fake fetch (invented names dropped, timeout, errors), the route and the trace event [E0116]; typecheck, build and lint [E0117, E0118, E0119]; live against the gateway and in a browser on the dev server, fields filled in 1.3 s, trace holds the draft event, nobody-named sentence stops before sending [E0120].
- Public demo mode: tests, typecheck and build [E0121, E0122, E0123]; the same production build with PUBLIC_DEMO=1 on :3101 passed the scripted take, axe (0 violations) and a console check [E0124].
- Live run with the real Fo and the real calendar: not run; it needs the person's Wajo and Google accounts (T12).

## Deployment
- Public demo (simulated Fo and calendar, labelled; the drafter live through the gateway's OIDC token): https://receipts-lack-toes.vercel.app, Vercel team lack-toes, project receipts, deployment receipts-7lfb75499, Ready [E0124]. It answers 302 to Vercel Authentication until the person sets Deployment Protection to preview-only (a security setting auto mode refused to change for the agent), so the smoke of the public URL is not run; the same build and env were smoked on :3101 [E0124]. The judged run itself is a local screen recording on http://localhost:3100 with localhost OAuth redirects. Rollback: `vercel rollback` to the previous deployment, or set PUBLIC_DEMO off.

## Bugs found and fixed
- Scripted take against `next dev` broke on hot reload; recorded against `next start` instead (F-0001) [E0069, E0073].
- Simulated calendar event pinned to +01:00 never matched the browser's local demo time: foldcheck failed on the unverified row [E0078]; defined in local wall time, then passed (F-0002) [E0084].
- Overlapping 3-second polls could duplicate live `get_fo_reply` calls and answer Fo's confirmation twice; a per-task lock and one poll in flight per task, with a concurrency test [E0097, E0110].
- A task Fo did not accept was re-sent every 3 s; it now ends "failed, not sent" and is sent again only by the person, with a test [E0097, E0110].
- Documented port 3000 against a server on 3100 would have broken both OAuth redirects; one port everywhere, printed from APP_URL on `/connect` [E0097].
- OAuth callbacks accepted a code with no stored state; they now fail closed [E0097].
- The tracked-data check failed under pipefail although nothing was tracked; the check is a negated grep [E0104, E0108].

## Known limitations
- The public URL is behind Vercel Authentication until the person flips Deployment Protection; the GitHub repository https://github.com/itssaharsh/receipts does not exist until the person runs `gh repo create` (both are public-surface actions the agent may not take); the README, the banner and SUBMISSION.md already carry both links.
- The drafter's gateway token in .env.local lasts 12 hours (`vercel env pull .env.local` refreshes it); without it the words draft and the status line says so. A Claude model on the gateway needs paid credits.
- The Vercel project named receipts existed before (two deployments from early October); this deploy replaced its production. If that project was something else of yours, say so and it can be moved to a new project name.
- No live run yet: the run count on the form is 0 attempted until the person connects their accounts and records the take. The simulated runs are reported separately and labelled.
- Verifies calendar bookings only; a task with no postcondition ends "no check defined; confirm by hand".
- No timeout on a long errand: the row keeps polling (30 s backoff after a failure) until Fo answers or the person acts; an errand the clinic answers tomorrow is a legitimate long run.
- Fo's token format is unknown, so redaction of Fo tokens relies on key names (Bearer, JWT, Google patterns are matched by value).
- Evidence missing: the live take and its trace (T12); a judge opening the video, repository and live link signed out (there is no live link by design).

## Cleanup
- Removed: the scaffold svgs under public/ (grep proved them unreferenced, commit 97d2141); the stale demo constant in Compose.tsx; a no-op ternary in page.tsx; the never-read transport field and its import in the Fo client (commit 54f4c56); qa logs untracked. Dependencies removed: none (none unused).

## Optimization
- None needed: the ledger is a single server-rendered page with one client bundle; the first screen passed foldcheck at both sizes [E0086].

## Memory
- ADR-0001, ADR-0002, ADR-0003, ADR-0004, ADR-0005 (superseded by ADR-0006), ADR-0006, F-0001, F-0002 | global candidates: record scripted takes against a production build, never a dev server with hot reload; define simulated times in the machine's own wall time when the browser fills a local time.

## Next steps
- The person, first: Vercel Deployment Protection to preview-only; `gh repo create receipts --public --source=. --remote=origin --push`.
- The person: Wajo account above Fo Mini with Google Calendar connected inside Wajo; a Google Cloud OAuth client with redirect http://localhost:3100/api/google/callback; `.env.local`; the live take per take-script.md; export the trace into submission/, update the run count, confirm the four rules, post on X by 2026-10-19 10:15 AM PT, fill the form by 2026-10-20 10:15 AM PT.
- Then: push the repository to a public remote and put its URL and the video URL in SUBMISSION.md and the README.
