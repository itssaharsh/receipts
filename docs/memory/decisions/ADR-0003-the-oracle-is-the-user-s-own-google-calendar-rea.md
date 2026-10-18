---
id: ADR-0003
type: decision
title: The oracle is the user's own Google Calendar (read-only), never Fo's reply; a manual tick is a separate state
status: active
scope: project
components: check, oracle, google
triggers: 
evidence: lib/check.ts, lib/google.ts, lib/runner.ts
verified_at: 2026-10-18@54f4c56
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: 6f44e5c4105a5320
created: 2026-10-18
source: unknown
---

Context: the frontier claim of the entry is verification from the world; the hosts grade the final state of the world.
Decision: a postcondition per task (title words, start, window) checked with events.list on the primary calendar; verified only on a match; otherwise one re-ask to Fo, then confirmed_by_user, which the UI never shows as verified.
Alternatives rejected: trusting Fo's completion label; parsing Fo's prose for a booking.
Consequences: Google OAuth client in testing mode; a 30-minute window and case-insensitive title match.
Revisit when: an inbox oracle (Gmail) is added for email tasks.