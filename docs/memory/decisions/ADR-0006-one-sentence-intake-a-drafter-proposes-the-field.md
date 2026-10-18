---
id: ADR-0006
type: decision
title: One-sentence intake: a drafter proposes the fields and the check, the person confirms, the rules decide; the model never decides policy
status: active
scope: project
components: compose, draft, rules
triggers: drafter, model, gateway, one sentence, postcondition proposal, DRAFT_PROVIDER
evidence: lib/draft.ts, app/api/draft/route.ts, app/components/Compose.tsx, tests/draft.test.ts
verified_at: 2026-10-18@5a114ec
relates: 
supersedes: ADR-0005
helpful: 0
harmful: 0
cite_hash: dc231d7e43bc2dda
created: 2026-10-18
source: unknown
---

ADR-0005 kept every model out of the entry because the builder had no Claude API credits. Vercel's AI Gateway (free tier on the team lack-toes; OIDC token locally via vercel env pull, automatic on a deployment) serves google/gemini-2.5-flash-lite in about a second and resolves weekdays correctly; Claude models there need paid credits, Bedrock in the user's AWS account refuses invocations (model access), Pollinations is keyless but 13 s and 1 reply per 30 s per IP. So: one OpenAI-compatible call drafts counterparty, kind, amount and the postcondition from the sentence; a deterministic reading of the words is the fallback and the baseline in tests; reconcile() drops any counterparty the sentence does not hold, prefers a title stem (Dent) over the model's phrase, and always writes our own summary so no check is promised that does not exist. The draft is a trace event ('draft') before the decision event; the rules evaluate only the confirmed fields. Trust by design is kept: the model proposes, the person confirms, deterministic code decides.