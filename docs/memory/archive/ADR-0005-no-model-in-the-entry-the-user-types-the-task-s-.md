---
id: ADR-0005
type: decision
title: No model in the entry; the user types the task's fields and the postcondition
status: superseded
scope: project
components: compose, rules
triggers: 
evidence: app/components/Compose.tsx, lib/rules.ts
verified_at: 2026-10-18@54f4c56
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: 44b1084053733de4
created: 2026-10-18
source: unknown
superseded_by: ADR-0006
---

Context: no Claude API credits; the evaluator and the checker decide.
Decision: structured fields in the compose form; the rules evaluator and the calendar check are plain code; ai_in_loop false for the entry itself (Fo is the agent).
Alternatives rejected: a free-tier model to extract fields (a dependency and a key the build does not have).
Consequences: one more form row; a 'Fill the demo task' helper for the take.
Revisit when: credits exist and the outsider test shows the form slows people down.