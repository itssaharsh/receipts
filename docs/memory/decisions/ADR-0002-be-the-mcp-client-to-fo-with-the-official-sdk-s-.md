---
id: ADR-0002
type: decision
title: Be the MCP client to Fo with the official SDK's OAuth provider backed by SQLite (DCR, PKCE, refresh), localhost redirect
status: active
scope: project
components: fo
triggers: 
evidence: lib/fo/oauth.ts, lib/fo/client.ts, tests/fo-auth.test.ts
verified_at: 2026-10-18@53c1eb8
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: dc002de9d46a6d69
created: 2026-10-18
source: unknown
---

Context: Fo's MCP server advertises OAuth 2.1 with dynamic client registration and PKCE; the entry must gate and verify Fo's actions from its own backend.
Decision: implement OAuthClientProvider over the oauth table; redirectToAuthorization stores the URL for the UI to open; finishAuth on the callback.
Alternatives rejected: Claude.ai or Claude Desktop as the client (shows Fo, adds nothing of ours); a hand-rolled OAuth (the SDK already handles discovery, 401 and refresh).
Consequences: tokens live in data/receipts.db; the app URL and port must match the registered redirect URI.
Revisit when: Wajo publishes client credentials or a different auth method.