---
id: ADR-0001
type: decision
title: One Next.js app with SQLite and a JSONL trace, run locally for the take; no Postgres, no Vercel for the judged run
status: active
scope: project
components: app, store, trace
triggers: 
evidence: ARCHITECTURE.md#Key-decisions, lib/db.ts, lib/trace.ts
verified_at: 2026-10-18@54f4c56
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: 73a9b2f48d448e07
created: 2026-10-18
source: unknown
---

Context: the event asks for a video, a write-up, a run trace and a run count; no live link.
Decision: one deployable, one SQLite file plus an append-only JSONL trace that doubles as the exported artifact.
Alternatives rejected: Postgres on Vercel (no live link needed; adds an account and a cold start); files only (no queries for the run count).
Consequences: single local user; data/ is gitignored; the trace export is a file read.
Revisit when: a second user or a hosted demo is needed.