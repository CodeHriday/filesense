---
name: Api-server restart after backend changes
description: Node.js api-server must be restarted after any backend code change; until restarted it serves old SQL queries and 304 responses mask the problem.
---

## Rule
After ANY backend code change is merged or applied, restart the `api-server` workflow before testing or declaring the fix working.

**Why:** The api-server is a long-running Node.js process (`node server.js`). Code changes do not hot-reload it. Until it is restarted it continues serving the old SQL queries and old response shapes. Express ETag caching compounds this: identical (old) response bodies produce matching ETags, so every browser request returns 304 — which looks like a browser cache issue but is actually a stale server process.

**How to apply:** After editing any file under `backend/`, call `WorkflowsRestart({ name: "api-server" })` immediately and wait for it to confirm running before checking logs or asking the user to test. Then verify the first relevant API request returns 200 (not 304) in the proxy logs.
