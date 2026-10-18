---
id: F-0004
type: failure
title: Live take recorded in a UTC browser: the drafted 3pm became 15:00Z, the real event sat at 15:00 IST, the receipt went unverified and re-asked Fo
status: active
scope: project
components: compose, draft, check, qa
triggers: timezone, UTC, recorder, Chromium, TZ, unverified, nothing in your calendar, startISO offset, localToISO
evidence: app/components/Compose.tsx, lib/check.ts, hackathon-idea/gsd-wajo-fo-mcp/video/README.md
verified_at: 2026-10-18@22461f6
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: 244a2176b89ee196
created: 2026-10-18
source: unknown
---

The scripted take drives a headless Chromium from WSL, whose zone is UTC. The drafter resolves 'Thursday 3pm' from the browser's clock and Compose adds the browser's offset, so the postcondition left as 2026-10-22T15:00:00Z while Fo, working in the person's Wajo account (IST), created the event at 15:00+05:30 (09:30Z). The check queried 14:30Z to 15:30Z, found nothing, re-asked Fo once (which insisted the event was there, correctly) and ended unverified; the recorder then waited forever for a verified row. The product behaved honestly; the recording environment lied about where the person lives. Fix: run the recorder with TZ=Asia/Kolkata (Chromium reads TZ on Linux); the API rehearsals had passed +05:30 explicitly, which is why they verified. Lesson: anything that reads the browser's clock must be recorded in the person's own time zone, and a rehearsal through the UI, not only the API, would have shown it.