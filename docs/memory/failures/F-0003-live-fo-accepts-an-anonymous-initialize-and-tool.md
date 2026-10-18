---
id: F-0003
type: failure
title: Live Fo accepts an anonymous initialize and tools/list; the 401 comes at the first tool call, so connect() reported connected and never offered the OAuth link
status: active
scope: project
components: fo
triggers: wajo, 401, UnauthorizedError, connected true, authorizationUrl missing, list_fo_conversations, message argument, waitSeconds
evidence: lib/fo/client.ts, .prod-build/logs/E0101.log
verified_at: 2026-10-18@440935d
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: 4f458c7123a20a35
created: 2026-10-18
source: unknown
---

Probe on 2026-10-18 14:45 UTC with the app's own FoClient against https://mcp.api.wajo.ai/fo: initialize succeeded with no token, tools/list returned ask_fo(message, conversationId, newConversation), get_fo_conversation(conversationId), get_fo_reply(conversationId, waitSeconds), list_fo_conversations(), start_fo_call(); the first tool call raised 401, the SDK registered a client and prepared the authorization URL, and call() turned it into 'Fo needs reconnecting'. Root cause: connect() treated a successful initialize as a connection. Fix: when no tokens are stored, connect() probes with list_fo_conversations and returns {connected:false, authorizationUrl} on UnauthorizedError; askFo uses the schema's argument name (message) and folds the context into the message when the schema has no context argument; get_fo_reply passes waitSeconds=20 when offered; the simulated server now speaks the same schema. Lesson: a server's initialize is not proof of access; probe the cheapest authenticated call before saying connected.