# State — Receipts (GSD hackathon build)

Updated 2026-10-18 09:47 UTC. Clock: start 2026-10-17T17:30Z · freeze 2026-10-19T11:31Z · end 2026-10-19T17:15Z (X post due); form due 2026-10-20T17:15Z.

## Done
- M1 (T01–T04): schema, store, rules evaluator, trace writer; Fo MCP client with SQLite OAuth provider (DCR, PKCE, refresh) tested against a fake Wajo; fake Fo over InMemoryTransport; runner (evaluate → dispatch → poll → confirmation relay → claim → check → verify / re-ask / manual tick); API routes; ledger UI golden path. 54 tests green; build green.
- M2 (T05–T08): Google OAuth + Calendar oracle (refresh, retry) and /connect; trace drawer, run count, export, replay snapshot, record mode, phone compose disclosure; /about, README, OG image, icon; backup take on the simulated Fo: `submission/takes/backup-simulated-20261018-094616.webm` (35 s: J1 verified, J2 approve-and-add-rule, J2 decline, J3 trace).

## Servers
- dev: `FO_MODE=fake ORACLE_MODE=fake ... npm run dev -- -p 3100` (HMR; reloads can break scripted takes; use prod for takes)
- prod demo: `FO_MODE=fake ORACLE_MODE=fake DB_PATH=./data/prod-demo.db ... npm start -- -p 3101`
- Port 3000 is taken by another process on this machine; APP_URL and the OAuth redirect URIs use 3100 (dev) / 3101 (prod).

## Known
- The fake calendar's event is Thu 22 Oct 2026 15:00 in the machine's own zone; `Fill the demo task` uses the same wall time, so the simulated check matches on one machine.
- `Alt+Shift+R` resets tasks and restores the default rules; `Alt+Shift+P` replays `data/replay-run.json` (saved with `POST /api/replay`).
- Fo's real tool schema is read at runtime (tools/list) and the ask_fo text argument name is resolved from it ('request' until the first live connect).

## Next
- T09 QA: axe + screenshots (qa/axe.py), foldcheck on prod, keyboard path, three demo runs with reset, one unprepared input, fresh reviewer + bug hunt.
- T10 security + cleanup (scaffold leftovers in public/, .env.example complete, audit).
- T11 SUBMISSION.md, trace file, run count, X post text, submit check.
- T12 final take with the live Fo and the live calendar: needs the user (Wajo OAuth via join code, Google OAuth client, second mailbox).

## Needs the user
1. Wajo account via wajo.ai/join?code=WAJOCLAUDE (plan above Fo Mini) and Google Calendar connected inside Wajo; then open /connect and Connect Fo (OAuth).
2. A Google Cloud OAuth client (Web application) with redirect URI http://localhost:3100/api/google/callback (dev) or :3101 (prod); the account added as a test user; GOOGLE_CLIENT_ID/SECRET in .env.local.
3. A second mailbox to play "Northfield Dental" (DEMO_CLINIC_EMAIL in .env.local), and Fo given that address as the clinic.
4. The X quote-repost of the founder's 10 AM PT post with the video, and the Discord form.
