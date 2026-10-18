# Receipts · GSD Hackathon submission (Wajo × Claude, 17–19 October 2026)

This file holds the form answers (items C to G) and the X post text. Items A (the X link) and B (the team's email) are filled when the post goes out.

## Write-up

**Who it is for.** Someone who has just asked Wajo's Fo agent to book, email or buy something, at the two moments that matter: when they would be asked to approve it, and when Fo says it is done.

**What it does.** You ask in one sentence. A drafter proposes the fields and the check ("an event containing Dental around Thursday 15:00"); you edit anything, then send. Receipts sends your errands to Fo under rules you wrote once (who Fo may contact, how much it may spend, what always waits for you). Tasks inside the rules go to Fo without asking; anything else waits for one tap: approve once, approve and add a rule, or decline. Every task carries a postcondition. When Fo says done, Receipts reads your own Google Calendar and marks the receipt verified only if the event is there; otherwise it asks Fo once more, then offers a manual tick that is shown as "confirmed by you", never as verified. Every Fo tool call, rule decision and calendar check is logged, and the run count is reported as it is.

**What was built at the event.** All of it: the rules evaluator, the held queue, the Fo MCP client with OAuth (dynamic client registration, PKCE, refresh), the runner that polls Fo and answers its confirmation question from the approval, the Google Calendar oracle, the ledger UI with the two-part receipt (Fo's claim beside the calendar record), the trace drawer and export, the tests. Repository: see the README. First commit 2026-10-18 08:47 UTC, after hacking opened on 17 October 10:30 PT.

**What existed before.** Nothing of this entry. The idea research that chose it was finished on 18 October, after hacking opened, and is kept outside the repository. Two patterns echo earlier projects by the same builder (a hold-for-approval queue; grading an agent's claim against the real record), re-implemented here with no code copied.

**What is mocked or hard-coded.** In the recorded run: nothing. Fo is live from the builder's own Wajo account; the calendar check is live against the builder's own Google Calendar. The drafter that turns the sentence into fields is a small model over Vercel's AI Gateway (gemini-2.5-flash-lite by default; the status line names whichever model answered), with a rules-based reading of the words as the fallback; the model proposes, the person confirms, the rules decide on the confirmed fields only, and the draft is logged in the trace. The clinic in the demo task ("Northfield Dental") is a second mailbox the builder controls, named on the receipt. For development and tests only, `FO_MODE=fake` and `ORACLE_MODE=fake` switch in an in-process simulated Fo and a simulated calendar; every such row says "Simulated Fo" and those runs are left out of the run count below. The three default rules and the two demo contacts are seeded on an empty database.

## Build note

**Tools the agent uses.** Fo's MCP server at `https://mcp.api.wajo.ai/fo`: `ask_fo` (the task, with its counterparty, amount and expected result as context), `get_fo_reply` (polled every few seconds; Fo's progress lines are shown verbatim), `get_fo_conversation` (Fo's own account of what it did, read as the claim), and `ask_fo` again to answer Fo's confirmation question or to re-ask after an empty check. `tools/list` is read at connect time and logged; the name of `ask_fo`'s text argument is resolved from the live schema.

**What the team added on top.** A one-sentence intake whose drafter proposes the fields and the postcondition for the person to confirm (a model when one answers in time, the words otherwise, and the trace says which), a deterministic rules evaluator (categories that always wait, an amount cap, a contacts-only gate with "approve and add a rule"), an OAuth 2.1 client so Receipts drives Fo from the person's own account rather than through a chat app, a postcondition per task checked against the person's own Google Calendar (the receipt is verified from the world, not from Fo's reply), a decision-and-receipt ledger, an append-only JSONL trace with token redaction, and a simulated Fo over the SDK's in-memory transport so the failure paths (401, a never-completing task, a declined task that must never reach Fo) are tested.

**One thing that did not work.** A scripted take against the development server kept failing: Next's hot reload restarted the page mid-click, and the simulated calendar's event was pinned to one time zone while the browser filled the demo time in its own, so the check never matched. Both were fixed by recording against the production build and by defining the simulated event in the machine's own wall time; the live calendar has no such problem because the person's own calendar and browser share a zone. A fresh review then found two things the simulated Fo could never show: the 3-second poll loop could overlap live `get_fo_reply` calls (which block for up to 40 s), so Fo's confirmation question could have been answered twice, and a task Fo had not accepted was being re-sent every 3 s. Both are fixed (one call in flight per task; a task is sent again only when the person asks) and tested; no live run was made before the fix.

## Run trace

`submission/trace-<run>.jsonl`: the log of the recorded run, one event per line (rule decision, `ask_fo`, each `get_fo_reply`, `get_fo_conversation`, the calendar check with the event id, the user's decisions). Exported from the ledger's "Export trace" button; tokens are removed before anything is written.

## Run count

Live runs of the demo task (the dentist booking) through the real Fo, from the builder's own Wajo account, on 18 October: 2 attempted, 1 succeeded. The first stopped at a question ("Which Northfield Dental is your dentist, or can you share its email address?") because Receipts had not passed the clinic's details from the contacts; that was fixed, and the second run booked the appointment and emailed the clinic (the builder's own second mailbox) in about 1 minute 40 seconds. The outcome was verified through the Google Calendar API and the inbox by the builder (event "Dentist check-up at Northfield Dental", Thu 22 Oct 15:00 IST; email from fo@wajo.ai at 15:00 UTC); the app's own calendar check was not yet connected during these two runs, so their receipts read "no calendar connected; confirm by hand". The recorded take's run is added here when it is made.

Simulated runs during the build (simulated Fo and simulated calendar, not counted on the form): 8 attempted, 8 succeeded (the backup take, four consecutive scripted QA runs, the last one after the review fixes, one unprepared-input run that ended unverified by design and was confirmed by hand, two seed runs). The reviewer's hand runs on the simulated Fo are not counted.

## X post (under 280 characters)

Fo says done. Receipts checks your own calendar before believing it.

One sentence in. Your rules decide what waits for a tap. When Fo books it, the receipt is verified from your own Google Calendar.

One unedited take ↓ @wajo_ai + Claude. https://github.com/itssaharsh/receipts

## Links

- Repository: https://github.com/itssaharsh/receipts
- Public demo (simulated Fo and calendar, labelled; the drafter is live): https://receipts-lack-toes.vercel.app
- Video: attached to the X post, one unedited take. The backup take (2 min 20 s, recorded 18 Oct against the simulated Fo and calendar, both labelled on screen) is one uncut recording at real speed with a narration track and captions added over it, nothing cut, sped up or re-ordered; the live take replaces it when the real run is recorded.
- Trace file: `submission/trace-<run>.jsonl`.
