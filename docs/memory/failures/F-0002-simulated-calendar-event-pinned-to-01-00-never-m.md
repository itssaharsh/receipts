---
id: F-0002
type: failure
title: Simulated calendar event pinned to +01:00 never matched the browser's local demo time
status: active
scope: project
components: oracle, seed, compose
triggers: timezone, unverified, fake calendar, localWallISO
evidence: commit:e8b27b4, lib/oracle.ts, lib/seed.ts, .prod-build/logs/E0078.log
verified_at: 2026-10-18@53c1eb8
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: f784df545e5f4586
created: 2026-10-18
source: unknown
---

Attempted: the demo task via 'Fill the demo task' and via the seed against the fake oracle.
Error signature: the receipt stayed unverified: 'nothing in your calendar for Thu 22 Oct 15:00 with Dental yet'; foldcheck could not find 'verified from your calendar'.
Root cause: the fake event's start was a fixed '+01:00' instant while datetime-local in the browser and the seed used other zones; the 30-minute window missed by an hour.
Fix: fakeCalendarDefault() and DEMO_TASK build the time with localWallISO (the machine's own zone); tests use the same helper.
Lesson: a simulated oracle and the inputs that must match it have to be built in the same clock; the live calendar and browser share the user's zone.
Early check: compare the postcondition startISO offset with the simulated event's offset before a take.