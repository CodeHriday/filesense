# GRP verification

Verdict: PASS

Written by the orchestrator from the verifier's reply; the verifier itself declined to write this file.

- About 45 claims checked: 0 wrong, 1 unsupported, 0 missed entry points.
- Coverage: all 27 HTTP entry points (groupRoutes 10, policyRoutes 10, server.js 7), the 3 frontend routes and the startup IIFE.
- Confirmed: every groupRoutes and policyRoutes handler (validation, status codes, transactions, cache invalidation, ON CONFLICT targets vs createProjectsAndGroups.js:216-222). Also the /user/:userId policy bug (agm.user_id = $1 returns every active policy) and the policyEngine.js evaluation semantics (first-match, deny override, context-free cache key, 300 s TTL, unescaped regex). Further confirmed: evaluate's enrichment outside try → 500; the server.js legacy handlers shadowed by mounts at server.js:5364/5393; the authenticate.js group-role query (no project filter, 600 s cache); ProjectPolicyEngine selecting p.policy_name vs column name; enforcePolicies default false; groupsService.js bare fetch without Authorization; and the getUserGroups, addUserToGroup and Groups.jsx details.

## Unsupported (1)
- The claim that the policy/ABAC/SCIM startup migrations receive the pool, so BEGIN/COMMIT may land on different connections. createPolicyEngine.js:21 does call client.query('BEGIN'), but what server.js:5911-5913 passes in was not traced. The notes cross-reference MIG, and MIG's extraction makes the same claim.

## Minor observations
- server.js citations mean the repo-root server.js, not backend/src/server.js.
- The notes don't mention that policyRoutes handlers depend on req.app.locals.pool (server.js:117, :5383).
