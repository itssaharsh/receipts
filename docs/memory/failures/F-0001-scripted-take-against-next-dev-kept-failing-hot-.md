---
id: F-0001
type: failure
title: Scripted take against next dev kept failing: hot reload navigated the page mid-click
status: active
scope: project
components: qa
triggers: playwright, next dev, navigation, click timeout
evidence: commit:72d8787, .prod-build/logs/E0069.log, qa/take.py, ARCHITECTURE.md#Key-decisions
verified_at: 2026-10-18@54f4c56
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: 5c231f7497c3cb68
created: 2026-10-18
source: unknown
---

Attempted: python qa/take.py against the dev server (port 3100) right after editing components.
Error signature: Playwright click: 'waiting for navigation to finish... navigated to /?record=1' repeated; 30 s click timeout.
Root cause: Next dev's Fast Refresh and route recompilation reload the page while the script interacts.
Fix: build and run next start on a separate port (3101) for takes and QA (E0073 passed).
Lesson: when recording or measuring, use the production build, never the dev server.
Early check: curl the page twice and confirm no recompilation messages in the dev log before scripting.