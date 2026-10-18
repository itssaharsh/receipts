<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
## AI tools used

Claude Code (Anthropic's Claude agent) wrote the code, the tests and the documents together with the builder, Saharsh Tibrewala, during the GSD Hackathon on 17 to 19 October 2026. Inside the product, the only model is the drafter (`google/gemini-2.5-flash-lite` over Vercel's AI Gateway), which proposes a task's fields for the person to confirm; the rules, the checks and the ledger are plain code. Fo, the agent that performs the errands, is Wajo's, driven over MCP from the person's own account.
