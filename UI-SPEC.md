---
name: Receipts
scope: sprint
one_line: "Receipts proves Fo's errands landed, from your own calendar"
ambition: L1            # tabular, text-first rows about real-world actions and money; the hero object is the user's own calendar strip drawn inside each receipt, not a scene
registers: { workspace: productive, verified: celebratory (quiet), held: serious, trace: system, about: expressive }
direction: "derived: canvas white (a calendar page and a courier's proof-of-delivery slip) · ink #141A16 (ballpoint) · accent #106B4F stamp-pad green, meaning 'landed', used for the one primary button and the verified state · display Sofia Sans Semi Condensed 700 (the printed headings of a bank's standing-order mandate and a delivery slip; candidates: Sofia Sans Semi Condensed, IBM Plex Sans Condensed, Saira Semi Condensed) · body Albert Sans · mono Fragment Mono (the trace only). Checked against prod-ui/directions.jsonl: differs from leak-gate (2026-10-12) on accent, display, layout, signature; from dibs (2026-10-10) on accent, display, layout, signature; from clearance, peppolsmith, setledger and marshal on canvas, accent, display, layout and signature. Display moved off Archivo because two ledger entries already use it."
personality: precise
dials: { variance: 4, motion: 3, density: 6 }
stack: { framework: "Next.js 16 App Router (API routes for the Fo MCP client, OAuth callback, the checker and the trace; one deployable)", styling: "Tailwind 4 with the role tokens below (no component kit: four components, each used once or twice)", motion: "CSS transitions only; one Motion (motion/react) layout animation for the receipt row unfolding", fonts: "next/font/google: Sofia Sans Semi Condensed, Albert Sans, Fragment Mono", data: "better-sqlite3 (rules, tasks, decisions, receipts) and a JSONL trace file" }
archetype: dashboard/queue (one work surface: the receipts ledger, with a rules strip above and a trace drawer at right)
viewports: [390x844, 1024x768, 1440x900]
signature: { interaction: "When a receipt verifies, its proof half unfolds a strip of the user's own calendar with the found event highlighted, and the hollow status disc fills green", visual: "Each receipt is a two-part slip: Fo's claim on the left, the world's proof on the right, split by a perforated counterfoil edge" }
mockup: {}                # the Design artifact type was not used: Sprint scope with about two hours of UI time; the treatment table in §5 is the build's target (deviation logged)
wow: "Fo's reply says done → the receipt's proof half reads 'checking your calendar…' with a moving dot → the calendar strip unfolds under it with the found event highlighted and the disc fills green (0.8 s) → the row keeps the strip and the 'verified from your calendar 09:41' line → the trace drawer shows check:calendar_event_exists with the event id"
demo: { seed: "./seed/earlier-run.json (a real earlier run of the demo task, labelled 'earlier run' on the row)", flag: "?demo=1", state_param: "?state=", reset: "alt+shift+r (e.code KeyR)", replay: "alt+shift+p (e.code KeyP): replays the recorded real run, labelled 'Replay · run of <date time>'", record: "?record=1 (docks toasts to the bottom-left, hides the connection chips' hover tooltips)", guest: true }
live_vs_simulated: [ "Fo: live over MCP from the user's own account", "calendar check: live, Google Calendar API read-only", "inbox check: live when connected, otherwise not shown", "manual tick: real user action, shown as 'confirmed by you', never as verified", "the clinic address: a second mailbox the builder controls, labelled on the row", "the seed row: a real earlier run, labelled" ]
deviations:
  - "No Claude Design mockup: Sprint scope, about two hours of UI time; the §5 treatment table is the target."
  - "Phone layout is a stacked single column with the trace behind a bottom sheet; the event is judged from a 1440 recording and a form, and no live link is required."
  - "Rules are edited in a plain form, not a visual builder: three fields, one screen."
  - "A hairline (dashed) motif appears once, as the perforated counterfoil edge inside each receipt; it is the signature visual derived from a tear-off slip, not a global style."
  - "Sample labels are on the row ('earlier run, 18 Oct 09:40'), not in the top bar."
---

## 0. Brief + context profile

- **One line:** Receipts proves Fo's errands landed, from your own calendar.
- **User and moment:** someone who has just asked Fo (Wajo's action agent) to book, email or buy, on a laptop, at the moment they would be asked to approve it and the moment Fo says done. The judges are Wajo's founding engineer and an Anthropic applied-AI engineer, reading a video and a form.
- **Promise (from the package):** "Receipts: proof that it landed in your own calendar and inbox" → the first screen is the ledger of receipts, each verified or withheld row naming the check behind it. "Asks you only where your rules say so" → the three standing rules sit at the top with their use counts, and the held card shows what waited.
- **Primary action:** ask (type a task for Fo, with its counterparty and amount, and send it).
- **Hero object:** the receipt slip, whose proof half is a strip of the user's own Google Calendar (the oracle).
- **Product moment:** the proof half flips from "checking your calendar…" to the found event, highlighted, and the disc fills green.
- **Demo moment:** the same thing in the second window: the appointment appears in Google Calendar as the receipt turns verified beside it.
- **Differentiator:** the proof is read from the user's own calendar, not from Fo's reply; the UI proves it by showing Fo's claim and the calendar's record side by side on every receipt, with the check's event id in the trace one click away.
- **Artifact:** the receipt row (verified, with the calendar record) and the exported trace file for the form.
- **World inventory:** a bank standing-order mandate form (payee, amount cap, frequency, signed once) · a courier's proof-of-delivery slip (received by, time, signature) · a cheque-book counterfoil with its perforated edge · a page of the user's own calendar · a parcel-tracking timeline (scan events with timestamps).
- **Moving truth:** Fo's progress lines streaming from get_fo_reply while a task runs; the "checking your calendar…" dot; nothing else moves on its own.
- **Judging (from ideas.json):** judges 50%: "Gets real things done 25 · Trust by design 20 · Pushes the frontier 25 · Agent craft 20 · Real need 10 · Hardware bonus +5"; community 50%: likes on the X quote-repost within 24 hours. Judge wording beyond the labels: not published. Format: "Video / Demo: shows the key action live or in one unedited take"; the form asks for "Run trace: the log of one real run of the demo task, showing the agent's tool calls" and "Run count: how many times they ran the demo task and how many runs succeeded." A judge opens the X post (video and short write-up), then the form; minutes per project unknown; no live link required; card cut unknown (held to 180 characters). No UI prize. Track archetype: sponsor_showcase, also impact. The sponsor asks to see Fo working: Fo is named on every receipt, its progress lines are shown verbatim, and its own reply is the "claim" half.
- **Budget:** about two hours of UI design, then build slices inside prod-build's plan; Next.js on Node 22; no model in the entry; no Claude API credits.

| Factor | This product | What it changes |
|---|---|---|
| Task frequency | a few times a day | rows, not cards; instant feedback; one expressive moment (the verify) |
| Data density | a few to a few dozen receipts | 40px rows, tabular numerals, no filters needed in the MVP |
| Stakes | real-world actions and money | calm, high contrast, explicit states, L1 in every task flow, held = serious register |
| Audience | general, tech-leaning judges | plain words first; the trace one click away for the engineer |
| Use scene | desk, 1440 screen recording, light room | light canvas; 14–16px text; nothing hover-only |
| Emotional target | assured | every state says what was checked and when |
| Personality | precise (forms, slips, timestamps) | ease-out, 120–200ms, no bounce |
| Sponsor / host | Wajo wants Fo seen doing the work | Fo named per row; its progress verbatim; the entry's own UI is allowed (no sponsor UI exists for MCP clients) |

## 1. Judge tests

**5 seconds (first screen, no input):** the wordmark "Receipts", the caption "What Fo did, checked in your own calendar and inbox", three rules with use counts across the top, and a ledger whose first row is a verified receipt showing Fo's claim beside the calendar strip with the found event. A stranger names the user (someone who delegates errands to Fo) and the job (know it really happened).

**30 seconds:** type "Book my dentist check-up: email Northfield Dental to confirm Thursday 3pm and put it on my calendar", pick the counterparty, send → the row appears "allowed by R1 Contacts only" with its postcondition → Fo's progress lines stream → "Fo says done" → "checking your calendar…" → the calendar strip unfolds and the disc fills green. The second task, to a new landlord, is held with the card and its three choices.

**Demo-critical screens:** one, `/` (the ledger). Supporting: the trace drawer (same route), `/about` (the landing layer), `/connect` (first-run connections).

**Three stills:** (1) a verified receipt with its calendar strip; (2) a held card with approve once / approve and add a rule / decline; (3) the trace drawer with the Fo tool calls and the run-count table.

## 2. Demo script (one unedited take, about 2:20)

0:00 identity line over the populated ledger (the seed row from an earlier run, labelled) · 0:08 the three rules read aloud · 0:15 type the dentist task, send; the row shows the allowing rule and the postcondition · 0:30 Fo's progress lines stream; second window: Google Calendar · 0:50–1:30 Fo says done; "checking your calendar…"; the appointment appears in the calendar window; the strip unfolds; the disc fills green (the key action) · 1:30 type the landlord email; held by R1; "approve and add a rule"; it dispatches with R4 logged · 1:50 type the $45 flowers; held by R2; decline; "withheld" · 2:00 open the trace drawer: the Fo tool calls, the check with the event id, the run-count table · 2:15 one limit said aloud: the clinic address is my second mailbox; the oracle is my own calendar. Recording mode `?record=1`.

## 3. Journey + screen inventory

| id | route | why it exists | entered from | primary action | states |
|---|---|---|---|---|---|
| S1 | `/` | the ledger: rules, compose, held cards, receipts; the whole demo | first load | Send to Fo | first-run (no connections) · empty (connected, no receipts) · populated · a row in each receipt state |
| S1.t | `/` + trace drawer | the engineer's view: tool calls per receipt, run count, export | "Trace" on a row, or the run-count chip | Export trace | empty · populated |
| S2 | `/connect` | connect Fo (OAuth) and Google Calendar (OAuth) once | first run, or the connection chips | Connect Fo | disconnected · connecting · connected · error |
| S3 | `/about` | the landing layer for strangers (B17); the README reuses it | top-bar link | Open the ledger | static |

No auth of its own: one local user. No history page: the ledger is the history. No settings beyond the rules.

## 4. Flow map

S2 --connect Fo, connect Calendar--> S1(empty) --Send to Fo--> S1(row: allowed → dispatched → working → claimed → verified | unverified) ; S1 --Send to Fo (out of policy)--> S1(held card) --approve once | approve and add a rule--> dispatched ; --decline--> withheld ; S1 --Trace--> S1.t --Export--> file

## 5. Screen S1: the ledger

**Meaning:** the place you see what Fo did and whether it really happened. The object in the user's head: a slip of paper per errand, torn down the middle: what Fo said, what the world shows. The feeling: assured.

**Blueprint at 1440 (12 columns, 24px gutters, max 1280 content):**
```
Top bar 52: [Receipts wordmark] [About]                      [Runs: 4 sent, 3 verified, 1 withheld] [Fo ●] [Calendar ●]
Caption 28: "What Fo did, checked in your own calendar and inbox."
Rules strip 64: R1 Contacts only · used 3   R2 Up to $25 a task · used 1   R3 Cancellations wait for me · used 0   [Add a rule]
Compose 56: [ Ask Fo to…                                    ] [Counterparty ▾] [$ amount] [Send to Fo]
Held card (only when something is held) 120: "Waiting for you: Email my new landlord…  R1: Jordan Lee is not in your contacts" [Approve once] [Approve and add a rule] [Decline]
Receipts ledger (rows 56 collapsed, 148 when the strip is open):
  ● verified   Book my dentist check-up…        allowed by R1   Fo: "Booked Thu 23 Oct 15:00; emailed Northfield Dental" ┊ Found in your calendar: [Thu 23 Oct ▮ 15:00 Northfield Dental]  09:41   [Trace]
  ○ working    Email my new landlord…           approved once + R4   Fo: "Drafting the email to Jordan Lee…"             ┊ waiting for Fo
  ⊘ withheld   Order flowers for $45            held by R2, declined                                                          ┊ never sent to Fo
Trace drawer 420 (right, over the ledger): events for the selected receipt in Fragment Mono 13px; the run-count table; [Export trace]
```

**Treatment table**

| Element | Tier | Register | Levers (grayscale first) | States | Transition |
|---|---|---|---|---|---|
| Receipts ledger (the rows) | primary | productive | the widest region, edge to edge within the content column; rows on the canvas, no cards; 15px/500 task text in ink; the claim half and the proof half separated by the perforated counterfoil edge (a dashed 1px line with a 6px notch top and bottom) | empty: "No receipts yet. Ask Fo for something above." · a row per state: allowed, held, dispatched, working, claimed, verified, unverified, withheld, failed | a new row enters from y 8 to 0 over 180ms; the proof half unfolds (grid-rows 0fr to 1fr, 320ms, ease-out) when the strip opens |
| The proof half of a verified row (the calendar strip) | primary, inside the row | celebratory, quiet | the one place the accent is a surface: the found event is a 28px block in accent-container with the event title in ink and the time in accent; the strip shows the day's column with two neighbouring hours in surface-2 | checking: "checking your calendar…" with a 1px dot moving along the strip's baseline · verified: the strip with the event block and "verified from your calendar 09:41" · unverified: "nothing in your calendar for Thu 15:00 yet; asking Fo again" in warning · manual: "confirmed by you 09:52" in ink, never green | the strip unfolds over 320ms; the event block fades in at 200ms; the disc fills over 400ms, 100ms after the block |
| Status disc + word (verified ○ ● ⊘) | secondary | productive | 12px disc then the state word in 13px/600 uppercase +0.08em; verified = filled accent disc; working = hollow ink disc with a 1px rotating gap; held = warning disc; withheld and failed = danger ⊘; never color alone | each state has its word | fill: scale 0.6 to 1 over 400ms |
| Rules strip | secondary | productive | three rules as a single row of text groups, not cards: rule id in display face 15px/700, the rule in 14px, "used n" in ink-muted tabular; [Add a rule] as a text button at the end | empty: "No rules yet: everything waits for you." + [Add a rule] | a use count ticks over 200ms when a rule fires |
| Compose bar | interactive | productive | one input (h44, 16px) taking most of the width, a counterparty select (h44, 200px), an amount field (h44, 120px, tabular), then the one filled accent button "Send to Fo" (h44) | idle · typing · blocked (no connection: the button stays enabled and explains: "Connect Fo first") · sending (label "Sending…", width locked) · error (keeps the text; "Fo did not accept the task: <reason>") | none beyond the button's 120ms press |
| Held card | interactive | serious | surface-1 panel above the ledger with a 1px line-input border, warning disc and the word "Waiting for you"; the rule's reason in one plain sentence; three buttons: "Approve once" and "Approve and add a rule" as tonal, "Decline" as text in ink; no red fill anywhere | one card per held task; after a decision the card collapses into its row | the card collapses (grid-rows, 240ms) and the row appears where it will live |
| Top bar | tertiary | system | wordmark in the display face 22px/700 at left; "About" text link; at right the run-count chip (tabular, surface-2) and two connection chips (a 8px disc + "Fo", "Calendar") | connection chips: connected (accent disc) · disconnected (hollow disc, the chip links to /connect) · error (danger disc, tooltip with the reason) | — |
| Caption under the wordmark | tertiary | system | one 14px ink-muted sentence under the top bar: "What Fo did, checked in your own calendar and inbox." | — | — |
| Trace drawer | tertiary | system | 420px panel sliding in from the right over the ledger (not pushing it); events as mono 13px lines: time, tool, summary; the Fo tool names in ink 600; the check line carries the event id; the run-count table (sent, verified, unverified, withheld) in body face tabular; [Export trace] as a tonal button | empty: "Select a receipt to see its trace" · populated | slide in 240ms --ease-drawer; Esc closes and returns focus to the row's Trace button |
| Sample label on the seed row | tertiary | system | 12px ink-muted text at the row's end: "earlier run, 18 Oct 09:40" | — | — |

**First 10 seconds:** the ledger is already populated with the seed row (a real earlier run), the rules strip, and the compose bar. No sign-in, no setup form. If Fo or Calendar is not connected, the chips show hollow and the compose button explains on click; the seed row still shows.

**Data:** live Fo over MCP; live Google Calendar read; the seed row from `seed/earlier-run.json` written by a real run and labelled; nothing simulated on this screen.

**Grid and sizes:** content max-width 1280, side gutters 24 (16 on phone); rows 56 collapsed, 148 with the strip; the perforation sits at 58% of the row width (claim 58, proof 42) at 1440 and the halves stack at <900 with the perforation horizontal.

**Phone (390):** top bar 52 with the wordmark and the run chip; rules as three stacked lines; compose stacked (input, then a row of select + amount + button); receipts stacked with the proof half under the claim half; the trace as a bottom sheet (peek 0, opens to 70%). The primary action "Send to Fo" is visible without scrolling.

## 6. Components (only those with ≥3 states)

### C-01 ReceiptRow (custom)
Purpose: one errand: what Fo said and what the world shows.
Tier / register: primary · productive (verified half celebratory, quiet).
Placement: S1 ledger, one per task, newest first. Mobile: halves stack.
Size: h56 collapsed, h148 with the strip; padding 12 16; gap 12.
Tokens: canvas bg; task text ink 15px/500; rule text ink-muted 13px; claim text 14px ink; perforation `border-left: 1px dashed var(--line-input)` with two 6px notches.
States: allowed (hollow disc, "allowed by R1", proof half "waiting for Fo") · held (the card shows above; the row is not yet in the ledger) · dispatched ("sent to Fo 09:40") · working (Fo's latest progress line verbatim in the claim half, a rotating-gap disc) · claimed ("Fo says done", proof half "checking your calendar…" with the moving dot) · verified (filled disc, strip open, "verified from your calendar 09:41") · unverified (warning: "nothing in your calendar for Thu 15:00 yet; asking Fo again (1 of 1)", then "ask you" with a [Confirm by hand] text button) · withheld (⊘ danger, "held by R2, declined 09:52", proof half "never sent to Fo") · failed (⊘ danger, "Fo could not finish: <Fo's words>").
Transitions: allowed -SENT-> dispatched -PROGRESS-> working -DONE-> claimed -CHECK_OK-> verified ; claimed -CHECK_EMPTY-> unverified -REASK-> working ; unverified -MANUAL-> confirmed by you ; any -FO_FAILED-> failed.
Motion: new row y8→0 180ms; strip unfold 320ms; disc fill 400ms.
Keyboard / a11y: the row is a list item; [Trace] is a button; the status word is text; `role=status` region announces "Dentist check-up verified from your calendar".
Data: `/api/tasks` (SSE for progress), `/api/check/:id`.
Acceptance: `?state=verified|working|held|unverified|withheld|failed` renders each at 390 and 1440.

### C-02 HeldCard (custom)
Purpose: a task the rules would not send without you.
Tier / register: interactive · serious.
Placement: S1, above the ledger, one per held task.
Size: full content width; padding 16; buttons h40.
Tokens: surface-1 bg; 1px line-input border; warning disc; ink text; tonal buttons (surface-2) and one text button.
States: waiting · deciding (the pressed button shows "Sending to Fo…" or "Adding rule…") · decided (collapses into the row) · error (keeps the card; the reason under the buttons).
Keyboard: the first button receives focus when the card appears; Esc does nothing (no accidental decline).
Copy: "Waiting for you" · "R1 Contacts only: Jordan Lee is not in your contacts." · [Approve once] [Approve and add a rule] [Decline].
Acceptance: `?state=held` at 390 and 1440.

### C-03 SendButton (native button)
States: idle "Send to Fo" · blocked (connections missing: stays enabled; on click shows "Connect Fo first" under the bar and focuses the Fo chip) · sending "Sending…" (aria-disabled, width locked) · error ("Try again"; the reason under the bar; the text stays).
Keyboard: Enter in the input sends.

### C-04 ConnectionChip (native link/button)
States: connected (accent disc) · disconnected (hollow disc; links to /connect) · error (danger disc; tooltip and the reason on /connect).

## 7. Choreography

| id | trigger | from → to | what moves | pattern | timing |
|---|---|---|---|---|---|
| T-01 | task sent | compose → new row | the row enters at the top of the ledger | enter | 180ms, y 8→0, ease-out |
| T-02 | Fo progress | working row | the progress line crossfades to the new line | fade through | 150ms |
| T-03 | check passes | claimed → verified | the proof half unfolds the calendar strip; the event block fades in; the disc fills | draw-on onto its cause | strip 320ms; block +200ms; disc 400ms |
| T-04 | decision on a held card | card → row | the card collapses; the row appears where it will sit | container collapse | 240ms |
| T-05 | Trace | row → drawer | the drawer slides in from the right | drawer | 240ms --ease-drawer |
| T-06 | rule fires | rules strip | the use count ticks | number change | 200ms |

Reduced motion: keep the fades and the disc fill; drop the unfold (the strip appears at once) and the moving dot (a static "checking your calendar…").

## 8. State machines

Task: `composed → evaluated{allowed | held} → (held: approved_once | approved_with_rule | declined→withheld) → dispatched → working* → claimed → checking → verified | unverified → reasked (once) → working* → claimed → checking → verified | unverified → manual_confirmed | left_unverified ; any → failed`. Guards: dispatch only with a Fo connection; checking only with a Calendar connection (else the proof half offers the manual tick and says why). Timeouts: polling get_fo_reply up to 40 s per call, up to 15 minutes per task, then "Fo is still working; keeps running if you leave".

## 9. Copy deck (sentence case; no exclamation marks; no em dashes)

- Wordmark: Receipts. Caption: "What Fo did, checked in your own calendar and inbox."
- Rules strip: "R1 Contacts only" · "R2 Up to $25 a task" · "R3 Cancellations wait for me" · "used 3" · "Add a rule" · empty: "No rules yet: everything waits for you."
- Compose: placeholder "Ask Fo to…" · select label "Who it involves" · amount label "Amount, if any" · button "Send to Fo" · sending "Sending…" · blocked "Connect Fo first" · error "Fo did not accept the task: {reason}".
- Row, claim half: "allowed by R1 Contacts only" · "approved once" · "approved, and R4 added" · "sent to Fo 09:40" · Fo's progress lines verbatim · "Fo says done" · "held by R2 Up to $25 a task, declined 09:52".
- Row, proof half: "waiting for Fo" · "checking your calendar…" · "Found in your calendar" · "verified from your calendar 09:41" · "nothing in your calendar for Thu 15:00 yet; asking Fo again" · "still nothing; confirm by hand if it happened" · "confirmed by you 09:52" · "never sent to Fo" · "no calendar connected; confirm by hand".
- Held card: "Waiting for you" · "R1 Contacts only: {name} is not in your contacts." · "R2 Up to $25 a task: this is $45." · "Approve once" · "Approve and add a rule" · "Decline".
- Status words: Allowed · Held · Sent · Working · Fo says done · Verified · Unverified · Withheld · Failed.
- Top bar chips: "Runs: 4 sent, 3 verified, 1 withheld" · "Fo" · "Calendar" · tooltips "Connected as {email}" / "Not connected".
- Trace drawer: "Trace for: {task}" · lines like `09:40:12 ask_fo  conversation 8f3…  "Book my dentist check-up…"` · `09:40:52 get_fo_reply  working  "Emailing Northfield Dental…"` · `09:41:30 get_fo_conversation  claim: "Booked Thu 23 Oct 15:00"` · `09:41:31 check:calendar_event_exists  found event 7kq…  Thu 23 Oct 15:00` · "Run count: 4 sent, 3 verified, 1 withheld, 0 failed" · "Export trace" · empty "Select a receipt to see its trace".
- Connect page: "Connect Fo" · "Receipts asks Fo from your own Wajo account." · "Connect Google Calendar" · "Read-only. Receipts only looks for the events Fo was asked to create." · "Connected as {email}" · errors in Fo's or Google's own words plus "Try again".
- Seed row label: "earlier run, 18 Oct 09:40".
- Landing block (`/about`, and the README's first screen, word for word):
  1. Headline: "Fo says done. Receipts checks your own calendar before believing it."
  2. Subhead: "Receipts sends your errands to Wajo's Fo agent under rules you wrote once, then reads your own Google Calendar to confirm the result landed."
  3. Proof points: "Every receipt shows Fo's claim beside what your calendar actually holds." · "Tasks inside your three rules go without asking; anything else waits for one tap." · "Each run is logged with Fo's tool calls, and the run count is reported as it is: {n} sent, {v} verified."
  4. How it works: "Write three rules once." · "Ask Fo for something; Receipts sends it if the rules allow." · "When Fo says done, Receipts looks in your calendar and marks the receipt verified, or asks again."
  5. Limits: "Receipts verifies calendar bookings today; email confirmations are next. The clinic in the demo is a second mailbox we control. Receipts runs no model of its own; Fo is the agent."
  6. Links: the video (length), the repository, the trace file.

## 10. Brand

Logo idea: a counterfoil stub. Mark: a 48-grid rectangle with a perforated vertical cut (three square notches) and a filled disc in the right half (the verified disc); monogram variant: an "R" whose stem carries the perforation. Wordmark: "Receipts" in Sofia Sans Semi Condensed 700, tracking −0.02em, the dot of the "i" replaced by the verified disc. Favicon: `app/icon.svg` with `prefers-color-scheme`. OG image: the populated ledger and the name.

## 11. Real-product checks

- Value: yes; the receipt answers the question the user actually has after delegating.
- Clarity: yes; the compose bar and the rules are on the first screen; the seed row shows what a result looks like.
- Trust: yes; the calendar record sits beside Fo's claim; the check's event id is in the trace; no confidence numbers; a manual tick is never shown as verified.
- Feedback: yes; the row appears on send; progress lines stream; the disc fills on verification.
- Failure: yes; unverified re-asks once then hands to the user; Fo failures keep the task text; a missing connection explains itself.
- 10× data: the ledger paginates at 50 rows; strips stay collapsed by default past the first screen; the trace drawer loads one receipt's events.
- Maintainability: one Next app, SQLite, one JSONL file, four components, two OAuth clients; every dependency has a reason in `stack:`.

## 12. Don'ts

No stamps or seals landing with a sound; no middle-dot metadata strings; no mono outside the trace; no yellow; no "AI" sparkle or bot icon; no card around each receipt; no confetti; "Verified" never from Fo's words alone; no empty output panel on the first screen; no login wall.

## 13. Acceptance (A8, Sprint)

1. Cut pass: nothing on S1 that the demo script or §3 does not name; the one accessory removed is the connection chips' tooltips in record mode.
2. Anti-slop grep clean; art-direction questions answered; skeptical evaluator: self-reviewed (no time for a fresh agent; mark it so).
3. Accessibility: axe clean at 1440; keyboard path compose → row → Trace → Esc; 320px no sideways scroll.
4. Judge test: the still of a verified row retells the differentiator; `foldcheck.py` passes at 1440×900 and 390×844 with `--action "text=Send to Fo" --result "text=verified from your calendar" --promise calendar inbox rules`; `?record=1` checked once.

## 14. Tokens

```css
:root{
  color-scheme: light;
  --ff-display:"Sofia Sans Semi Condensed",system-ui; --ff-body:"Albert Sans",system-ui; --ff-mono:"Fragment Mono",ui-monospace;
  --canvas:#FFFFFF; --surface-1:#F5F6F3; --surface-2:#E9ECE6; --surface-sunken:#F0F2EE;
  --line:#D3D8CF; --line-input:#7E877C;
  --ink:#141A16; --ink-muted:#566059;
  --accent:#106B4F; --accent-ink:#FFFFFF;
  --accent-hover: oklch(from var(--accent) calc(l - .06) c h);
  --accent-press: oklch(from var(--accent) calc(l - .12) c h);
  --accent-container: color-mix(in oklch, var(--accent) 14%, var(--surface-1));
  --focus: var(--ink);
  --success: var(--accent); --warning:#8A5A00; --danger:#B42318;
  --warning-container: color-mix(in oklch, var(--warning) 12%, var(--surface-1));
  --danger-container: color-mix(in oklch, var(--danger) 10%, var(--surface-1));
  --r-sm:2px; --r-md:4px; --r-lg:6px;
  --shadow-overlay: 0 4px 8px rgb(0 0 0/.06), 0 16px 40px -8px rgb(0 0 0/.22);
  --ease-out:cubic-bezier(.23,1,.32,1); --ease-drawer:cubic-bezier(.32,.72,0,1);
  --dur-press:120ms; --dur-hover:150ms; --dur-enter:180ms; --dur-unfold:320ms; --dur-drawer:240ms;
}
```
Contrast checked (WCAG 2.2 AA, composited): ink on canvas 17.66; ink-muted on canvas 6.54, on surface-1 6.03, on surface-2 5.48; line-input 3.72 on canvas and 3.43 on surface-1; accent as text on canvas 6.49; white on accent 6.49; warning 5.93 / 5.46; danger 6.57 / 6.06; accent on accent-container 5.40; warning on its container 5.13; danger on its container 5.46.
