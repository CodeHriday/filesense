# JIRA - Jira incident integration

## Summary
Jira connections are rows in `storage_connections` with `type='jira'` (backend/routes/jiraRoutes.js:114-118, :242-247). The router is mounted at `/api/jira` behind `authenticateToken` (server.js:13935-13936). Five HTTP endpoints manage the connections. `JiraService` (backend/services/JiraService.js) creates Jira Cloud REST v3 issues from three internal triggers: DQ abort, schema-drift abort, and the workflow "jira_ticket" node. Of the two abort triggers, only the schema-drift one can actually fire (see Flags). Credentials are encrypted at rest with `encrypt`/`decrypt`. Outbound calls use DNS-pinned SSRF protection.

## Entry points

Common to the five endpoints: JWT auth via `authenticateToken` (server.js:13936). `requireAdmin` calls `userHasAdminAccess(req.user)` and returns 403 `{error:'Admin access required'}` (jiraRoutes.js:102-107).

### 1. GET /api/jira/connections (jiraRoutes.js:112)
- Auth: any authenticated user (comment :109-111). No admin check.
- Reads all `type='jira'` rows, `ORDER BY created_at DESC` (:114-119).
- Returns an array of `{connection_id, name, status, instance_url, project_key, email_display, default_labels, has_api_token, created_at, updated_at}`. `email_display` falls back to `'(encrypted)'`, `default_labels` to `[]` (:123-134). The route returns `default_labels` as stored, whereas `_decodeConfig` coerces a non-array to `[]` (JiraService.js:140).
- Errors: 500 `Failed to list Jira connections` (:140).
- Frontend callers: IncidentIntegration.jsx:154; Jobs.jsx:33-37 (uses `res.data[0].instance_url`, the newest connection regardless of status); src/pages/archived/WorkflowBuilder.jsx:1332.

### 2. POST /api/jira/connections/test (jiraRoutes.js:149)
- Auth: admin.
- Inputs: `email`, `apiToken`, `connectionId`, and `instanceUrl` (new connections only) (:150, :181).
- If `connectionId` is given:
  - It loads the stored config, 404 `Jira connection not found` if absent (:161-167).
  - The URL always comes from storage (:172).
  - Email and token use the body value if supplied, otherwise the decrypted stored value (:173-174).
  - A load or decrypt failure returns 500 (:175-178).
- Otherwise the URL comes from `req.body.instanceUrl` (:181).
- Missing fields return 400 (:184-190). The message is `Connection credentials are incomplete` with a connectionId, otherwise `instanceUrl, email, and apiToken are required`.
- `validateJiraInstanceUrl` is applied to the resolved URL (:195-198). It requires HTTPS and blocks local names and private IPv4/IPv6 ranges (:41-99).
- Calls `JiraService.testConnection`, which does GET `<url>/rest/api/3/myself` with Basic auth, `timeout: 8000`, `maxRedirects: 0` (JiraService.js:163-178).
- Response: always HTTP 200 with the service result. Success is `{success:true, accountId, displayName}`. Failure is `{success:false, error:'HTTP <status>: <detail>'}` (JiraService.js:179-187). SSRF-guard errors have no response status, so they come back as `HTTP undefined: <message>` (JiraService.js:185-187).
- The `await JiraService.testConnection` call is outside try/catch, but the service itself never throws.

### 3. POST /api/jira/connections (jiraRoutes.js:210)
- Auth: admin.
- Required: `name, instanceUrl, email, apiToken, projectKey`, otherwise 400 (:221-225). `defaultLabels` defaults to `[]` (:218).
- URL validation as above (:227-230).
- Stored config (:232-240):
  - `connectionId = uuidv4()` (:232), inserted into the `connection_id` column (:244-246); status `'active'`.
  - `instance_url` has one trailing `/` stripped.
  - `email` and `api_token` are encrypted.
  - `email_display = email.replace(/(.{2}).*(@.*)/, '$1***$2')` (:237). A non-string `email` makes `.replace` throw, which gives a 500 rather than a 400.
  - `default_labels` is stored as given, with no type validation.
- Inserts into `storage_connections` (:242-247). Logs creation (:249). Update and delete also log `req.user?.id`.
- Returns 201 `{connection_id, name, status:'active'}`. Errors return 500 `Failed to create Jira connection`.
- `storage_connections` has a UNIQUE index on `lower(name)` (idx_connections_name_unique_lower, FileSence_prod_schema_Jan_05_1767780691950.sql:6130), so a duplicate name (case-insensitive) fails the INSERT and returns 500.
- The INSERT does not set `connection_user` or `authentication_method`; they rely on the table defaults and CHECK constraints (schema dump :6126-6127; defaults 'Internal' and 'key-based').

### 4. PUT /api/jira/connections/:id (jiraRoutes.js:260)
- Auth: admin.
- Inputs: `name, instanceUrl, email, apiToken, projectKey, defaultLabels, status` (:263).
- 404 if the id is not found with `type='jira'` (:265-272).
- A supplied `instanceUrl` is validated (:280-285).
- Merge rules (:287-297):
  - The old config is copied.
  - Truthy `instanceUrl`, `projectKey`, `email` and `apiToken` overwrite.
  - `defaultLabels` overwrites if it is `!== undefined`.
  - Email and token are re-encrypted. Only supplied credentials are re-encrypted. A non-string truthy `email` throws at :293 and gives a 500.
- SQL: `name=COALESCE($1,name)`, `status=COALESCE($3,status)`, `updated_at=NOW()` (:299-307).
- `status` is not validated against any set of values (:306). `status` is passed as `status || null` (jiraRoutes.js:306), so an empty string is ignored.
- No re-test of the connection is done after a URL change.
- A rename to an existing name (case-insensitive) violates the `lower(name)` unique index and returns 500 (schema dump :6130).
- Returns `{success:true}`. Errors return 500.

### 5. DELETE /api/jira/connections/:id (jiraRoutes.js:318)
- Auth: admin.
- Deletes the row where `type='jira'` (:321-324). 404 if `rowCount===0` (:326-328). Returns `{success:true}`. It is a hard delete; the table has an `is_deleted` column that the Jira queries ignore (schema dump :6108-6133).
- Does not check whether the connection is referenced by workflow nodes (no code found; see Open questions).

### Internal triggers (not HTTP)
A. DQ abort. In jobExecutionEngine.js:2357-2369, when `error.code === 'DQ_ABORT'`, `setImmediate` runs `createIssueForAbortedJob` with `abortReason:'dq_abort'`. Rule names come from `error.notificationMetadata?.violatedRuleNames || []` and the count from `dqViolationCount || 0`. Errors are swallowed with `.catch(()=>{})`. In practice this trigger does not fire; see the DEAD/BUG flag.

B. Schema drift. In jobExecutionEngine.js:1647-1657, fire-and-forget with `abortReason:'schema_drift'`, no rules, count 0. This is the only abort trigger that works: the anomaly INSERT at :1598-1618 is in its own try/catch (:1621) that only logs a warning, so execution continues to the `schema_drift_handling === 'abort'` branch (:1625), updates the job, calls Jira, then returns. The ticket is created even if the anomaly record fails. The job name passed is `mapping?.mapping_name || 'Unknown'`.

`createIssueForAbortedJob` (JiraService.js:207-308):
- It takes the first active connection, `ORDER BY created_at ASC LIMIT 1` (:117). There is no per-mapping or per-job selection.
- No connection returns null with a debug log (:217-221).
- A config missing any of url, project, email or token returns null (:142, :224-227). `default_labels` that is not an array becomes `[]` (:140).
- Summary is `"<Schema Drift|DQ Violation>: <mappingName||jobName||jobId>"` (:231-232).
- Fixed fields: `issuetype:{name:'Bug'}`, `priority:{name:'High'}`, labels = connection `default_labels` (:250-262). Labels containing spaces are rejected by Jira at send time, and the failure is only logged.
- The description is a single ADF paragraph containing the job id, an ISO timestamp, the violation count and the rule list. The rule list is `(no specific rules identified)` when empty (:235-245).
- `deepLink` is built only if `appBaseUrl` is passed. Neither caller passes it, so the link is never added (:233; callers :1649-1655, :2360-2367).
- It POSTs to `<url>/rest/api/3/issue` with `timeout: 10000`, `maxRedirects: 0` (:268-281).
- It then runs `UPDATE transformation_jobs SET jira_issue_key=$1 WHERE job_id=$2` (:287-290). A failure of this update is logged and ignored (:291-295). The column is created at server.js:5950 as `VARCHAR(50)`; it is not in the Jan 05 prod schema dump and exists only through that startup migration.
- Returns the issue key, or null on any error (:300-307).
- No deduplication: each abort creates a new issue (no check found).
- Failures in all three create paths are logged through systemLogger only; no retry, user feedback or dead-letter was found.

C. Workflow node. Dispatched in `executeNode` at visualWorkflowExecutor.js:276-286, before the asset checks. It accepts both `jira_ticket` and `jiraTicket` (:274-276). `executeJiraTicket` (:777-819) calls `createIssueFromWorkflow` (JiraService.js:325-414):
- The node is not gated on upstream failure. `allOk` comes only from `this.executionErrors.size` (:786, :789); upstream nodes that returned `success:false` in `executionResults` are not counted. So the ticket can say "Completed" while nodes failed (:790).
- The `completed` list used for the description excludes skipped results (:784).
- Summary and description support `{status}` and `{workflowId}` placeholders. Only the first occurrence is replaced, because `.replace` is called with a string (visualWorkflowExecutor.js:793-799).
- Defaults: `issueType 'Task'`, `priority 'Medium'`, summary `'Workflow execution — {status}'` (visualWorkflowExecutor.js:797, :805-806; JiraService.js:329-330).
- Connection: `connectionIdOverride` selects an active connection of type jira. Otherwise the first active connection is used (:338-346).
- No connection returns `{success:false, skipped:true, reason}` (:348-350). In `generateExecutionSummary` a skipped result counts as skipped (:833-834), so the workflow is not failed in that case. An incomplete config returns `{success:false, error}` (:352-355).
- A real Jira failure returns `{success:false, error}` without `skipped`. `generateExecutionSummary` counts it in `failedFromResults` (:837-839) and adds it to `failedCount` (:842), so the workflow summary fails. The comment at :775 ("downstream nodes continue") holds for execution, not for the summary.
- On failure the error string is `String(detail || err.message)`, where `detail` may be the Jira `errors` object, so it can render as `[object Object]` (JiraService.js:410-412).
- `projectKeyOverride` replaces the connection's project key (:358).
- The request is the same as in A and B (`timeout: 10000`, `maxRedirects: 0`).
- Assignee is sent as `{accountId: assignee}` (:379-382). `issueUrl = <instanceUrl>/browse/<key>` (:403).
- Does not write to `transformation_jobs`.

SSRF protection (JiraService.js:65-106): HTTPS only; `dns.lookup(all:true)`; reject if ANY address is private (`isPrivateIp` :26-47); a pinned `https.Agent` uses the first validated IP (`results[0]`, :98-100). Applied in testConnection and in both create paths.

### Frontend (src/components/IncidentIntegration.jsx)
- Lists Jira connections from the backend (:154-175) and merges them with other integration types from localStorage key `dfo-incident-integrations` (:180-192).
- Create (:444-450) always posts `name, instanceUrl, email, apiToken, projectKey`. Update (:427) sends `email` and `apiToken` only if typed (:422-425); the test call also sends credentials conditionally. Neither create nor update sends `defaultLabels` or `status`, so the UI cannot set labels or disable a connection.
- Failures on create, update and delete are only `console.error`'d, with no user message (:431, :453, :501).
- Delete is at :497. Test is at :550.
- Jobs.jsx:445-458 shows the `jira_issue_key` badge linked to `${jiraInstanceUrl}/browse/<key>`. `jiraInstanceUrl` comes from `res.data[0].instance_url` of the GET list (Jobs.jsx:33-37), the newest connection (list is `created_at DESC`) regardless of status, while backend tickets use the oldest active connection (JiraService.js:117). With several connections the link can point to the wrong host. backend/routes/jobs.js:167 selects the key.

## Data touched
- `storage_connections` (connection_id, name, type='jira', status, config JSON, created_at, updated_at): read, insert, update and delete. `config` is `jsonb NOT NULL`; unique index on `lower(name)`; no constraint on `type` or `status` (schema dump :6108-6133).
- `config` JSON keys: `instance_url, project_key, email (enc), email_display, api_token (enc), default_labels`.
- `transformation_jobs.jira_issue_key` VARCHAR(50): written by the abort flow, read by jobs.js:167. Created by the server.js:5950 startup migration, not in the Jan 05 dump.
- Browser localStorage `dfo-incident-integrations`: used for non-Jira integrations only.
- External: Jira Cloud `/rest/api/3/myself` and `/rest/api/3/issue`.

## Flags
- DUPLICATE: the private-IP regex lists exist twice, in `validateJiraInstanceUrl` (jiraRoutes.js:65-96) and in `isPrivateIp` (JiraService.js:27-46). They differ in two ways:
  - The route's IPv6 handling is a separate list of IPv4-mapped patterns (`::ffff:127`, `::ffff:10`, and so on) and does not cover `::ffff:100.64/10` or `::ffff:0.`, while the service recurses into any `::ffff:` address.
  - The route checks only the literal hostname, while the service resolves DNS.
- DUPLICATE: the two issue-creation methods (JiraService.js:207 and :325) repeat the connection load, decode and POST logic. They differ in:
  - Fixed Bug/High versus configurable Task/Medium.
  - Persisting the issue key versus not.
  - Return shapes (key or null versus an object).
  - Assignee support (workflow only).
  - Connection selection (workflow can pick one by id).
- DEAD / BUG: the DQ-abort Jira trigger (jobExecutionEngine.js:2358-2369) is effectively unreachable. `DQ_ABORT` is thrown at :3913-3919 and rethrown at :3948 inside `processFile` (def :2852). `processFile`'s outer catch (jobExecutionEngine.js:4819-4826) logs and rethrows, so the error still reaches the caller. Its only call site is `await processFile(...)` at :2100, inside the per-file try, whose `catch (fileError)` (:2170) swallows the error: it adds to `totalRowsFailed`, emits node status, and logs (jobExecutionEngine.js:2170-2195). A test comment corroborates this: "DQ_ABORT is re-thrown from processFile but caught by the file-loop catch block in executeTransformationJob (which does NOT re-throw)" (backend/tests/jobExecutionEngine.qualityRuleNames.test.js:551-554). `grep DQ_ABORT` finds only :2342, :2358, :3913 and :3948. No other source of `DQ_ABORT` was found, so `createIssueForAbortedJob` with `dq_abort` is not reached.
- BUG: `appBaseUrl` is never passed by either caller, so the "View job runs" deep link in the description is dead in practice (JiraService.js:233, :245).
- BUG: the PUT validation does not re-check a stored URL. Only a supplied URL is checked. Legacy or invalid stored URLs are caught only at test or send time.
- BUG: the UI swallows create, update and delete errors with only `console.error` (IncidentIntegration.jsx:431, :453, :501).
- BUG: the workflow node's status wording uses only `executionErrors.size` (visualWorkflowExecutor.js:786-790), so a ticket can say "Completed" while nodes returned `success:false`.
- BUG: Jobs.jsx `jiraInstanceUrl` is the newest connection (Jobs.jsx:33-37) while tickets use the oldest active connection (JiraService.js:117), so the badge link can use the wrong host.
- BUG (minor): `{status}` and `{workflowId}` are replaced only once (visualWorkflowExecutor.js:794, :798-799).
- BUG (minor): `createIssueFromWorkflow` can return `[object Object]` as the error (JiraService.js:410-412).
- BUG (minor): a non-string `email` on POST or PUT gives a 500 instead of a 400 (jiraRoutes.js:237, :293).
- BUG (minor): a duplicate or case-variant connection name gives a generic 500 from the `lower(name)` unique index (schema dump :6130).
- SECURITY (likely bypass, untested): `https://[::ffff:127.0.0.1]/` is normalised by `new URL` to hostname `[::ffff:7f00:1]`. The route regexes such as `^::ffff:127\.` do not match the hex form. In the service, the recursion `isPrivateIp('7f00:1')` returns false, and `dns.lookup` of an IP literal returns it as is. So both layers appear to let it through. This is inference from the code; it was not run. The earlier "non-dotted IPv4 forms" worry is probably moot because `new URL` normalises them.
- UNCLEAR (unverified): on Node 20+ with `autoSelectFamily`, the net layer may call the pinned `lookup` (JiraService.js:98-100) with `all:true` and expect an array; the single-address callback might then fail with "Invalid IP address". Not run.
- SECURITY: the GET list is open to every authenticated user, so `instance_url`, `project_key`, `email_display` and `default_labels` are visible to all. Credentials are not returned (jiraRoutes.js:123-134). This is intentional per the comment at :109-110.
- SECURITY: `PUT status` and `default_labels` have no validation of type or value (jiraRoutes.js:290, :306). The database has no constraint on `type` or `status` either (schema dump :6108-6133).
- SECURITY: the test endpoint for new credentials takes an arbitrary admin-supplied HTTPS URL. This is mitigated by the URL check and the DNS-pinned agent (jiraRoutes.js:195, JiraService.js:168).
- SECURITY (positive evidence): no redirects are followed (`maxRedirects:0` at JiraService.js:177, :279, :398), and the stored URL is always used when testing an existing connection (jiraRoutes.js:172).
- UNCLEAR: with several active connections, abort tickets always use the oldest active one (JiraService.js:117). Whether that is intended is unknown.
- UNCLEAR: `project_key` is not validated against Jira.

## Domain terms
- Jira connection, Jira integration, incident integration: all refer to `storage_connections` with type 'jira' (the frontend calls them integrations).
- DQ abort (`DQ_ABORT`), schema drift (`schema_drift`): the two abort reasons.
- `email_display`: the masked email.
- Jira Ticket node (`jira_ticket`, also `jiraTicket`): the workflow node type.
- `username`: the frontend form field for the Jira email.
- `instanceUrl` / `instance_url`, `projectKey` / `project_key`.
- Issue key, for example "DQ-456".

## Open questions
1. How `userHasAdminAccess` decides admin: it is outside this area (utils/permissionHelpers).
2. Is a connection used by workflow nodes (`connectionId`) protected on delete? No check was found, so a node would get `skipped` at run time.
3. Is there any retry or dedup for repeated aborts of the same job or mapping? None was found.
4. Whether the `[::ffff:7f00:1]` bypass and the Node 20 `autoSelectFamily` lookup issue occur at runtime was not tested.
5. Whether a Jira node with no incoming edges can run in the first batch and report 0 nodes is an inference (the compiler exempts `jiraTicket` from the orphan check, visualMappingCompiler.js:162); not traced.
6. The `database_ddl_*` dumps were not checked for `storage_connections` constraints; only the Jan 05 prod dump was used.
