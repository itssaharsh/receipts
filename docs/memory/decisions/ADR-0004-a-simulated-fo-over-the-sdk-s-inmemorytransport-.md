---
id: ADR-0004
type: decision
title: A simulated Fo over the SDK's InMemoryTransport for tests and development, labelled on screen and excluded from the run count
status: active
scope: project
components: fo, tests
triggers: 
evidence: lib/fo/fake-server.ts, tests/fo-client.test.ts, lib/view.ts
verified_at: 2026-10-18@53c1eb8
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: 9e370b1aa3d2ca10
created: 2026-10-18
source: unknown
---

Context: the live Fo needs the user's OAuth, which arrives late in a solo build.
Decision: the same five tool names with scripted scenarios (complete, confirmation question, never, fail); FO_MODE=fake; every row says Simulated Fo; runCount.simulated flags it.
Alternatives rejected: mocking fetch (does not exercise the MCP client); waiting for OAuth (no tests until then).
Consequences: the recorded take must run FO_MODE=live.
Revisit when: Fo's real tool schema differs from the assumed one (resolveAskArgName adapts the text argument name).