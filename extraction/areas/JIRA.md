# JIRA - Jira incident integration

## Summary
Jira connections are rows in `storage_connections` with `type='jira'` (backend/routes/jiraRoutes.js:114-118, :242-247). The router is mounted at `/api/jira` behind `authenticateToken` (server.js:13935-13936). Five HTTP endpoints manage the connections. `JiraService` (backend/services/JiraService.js) creates Jira Cloud REST v3 issues from three internal triggers: DQ abort, schema-drift abort, and the workflow "jira_ticket" node. Credentials are encrypted at rest with `encrypt`/`decrypt`. Outbound calls use DNS-pinned SSRF protection.

## Entry points

Common to the five endpoints: JWT auth via `authenticateToken` (server.js:13936). `requireAdmin` calls `userHasAdminAccess(req.user)` and returns 403 `{error:'Admin access required'}` (jiraRoutes.js:102-107).

### 1. GET /api/jira/connections (jiraRoutes.js:112)
- Auth: any authenticated user (comment :109-111). No admin check.
- Reads all `type='jira'` rows, `ORDER BY created_at DESC` (:114-119).
- Returns an array of `{connection_id, name, status, instance_url, project_key, email_display, default_labels, has_api_token, created_at, updated_at}`. `email_display` falls back to `'(encrypted)'`, `default_labels` to `[]` (:123-134).
- Errors: 500 `Failed to list Jira connections` (:140).
- Frontend caller: IncidentIntegration.jsx:154.

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
- Response: always HTTP 200 with the service result. Success is `{success:true, accountId, displayName}`. Failure is `{success:false, error:'HTTP <status>: <detail>'}` (JiraService.js:179-187).
- The `await JiraService.testConnection` call is outside try/catch, but the service itself never throws.

### 3. POST /api/jira/connections (jiraRoutes.js:210)
- Auth: admin.
- Required: `name, instanceUrl, email, apiToken, projectKey`, otherwise 400 (:221-225). `defaultLabels` defaults to `[]` (:218).
- URL validation as above (:227-230).
- Stored config (:232-240):
  - `id = uuidv4()`, status `'active'`.
  - `instance_url` has one trailing `/` stripped.
  - `email` and `api_token` are encrypted.
  - `email_display = email.replace(/(.{2}).*(@.*)/, '$1***$2')`.
  - `default_labels` is stored as given, with no type validation.
- Inserts into `storage_connections` (:242-247). Logs creation (:249).
- Returns 201 `{connection_id, name, status:'active'}`. Errors return 500.

### 4. PUT /api/jira/connections/:id (jiraRoutes.js:260)
- Auth: admin.
- Inputs: `name, instanceUrl, email, apiToken, projectKey, defaultLabels, status` (:263).
- 404 if the id is not found with `type='jira'` (:265-272).
- A supplied `instanceUrl` is validated (:280-285).
- Merge rules (:287-297):
  - The old config is copied.
  - Truthy `instanceUrl`, `projectKey`, `email` and `apiToken` overwrite.
  - `defaultLabels` overwrites if it is `!== undefined`.
  - Email and token are re-encrypted.
- SQL: `name=COALESCE($1,name)`, `status=COALESCE($3,status)`, `updated_at=NOW()` (:299-307).
- `status` is not validated against any set of values (:306).
- Returns `{success:true}`. Errors return 500.

### 5. DELETE /api/jira/connections/:id (jiraRoutes.js:318)
- Auth: admin.
- Deletes the row where `type='jira'` (:321-324). 404 if `rowCount===0` (:326-328). Returns `{success:true}`.
- Does not check whether the connection is referenced by workflow nodes (no code found; see Open questions).

### Internal triggers (not HTTP)
A. DQ abort. In jobExecutionEngine.js:2357-2369, when `error.code === 'DQ_ABORT'`, `setImmediate` runs `createIssueForAbortedJob` with `abortReason:'dq_abort'`. Rule names come from `error.notificationMetadata?.violatedRuleNames || []` and the count from `dqViolationCount || 0`. Errors are swallowed with `.catch(()=>{})`.

B. Schema drift. In jobExecutionEngine.js:1647-1657, fire-and-forget with `abortReason:'schema_drift'`, no rules, count 0.

`createIssueForAbortedJob` (JiraService.js:207-308):
- It takes the first active connection, `ORDER BY created_at ASC LIMIT 1` (:117). There is no per-mapping or per-job selection.
- No connection returns null with a debug log (:217-221).
- A config missing any of url, project, email or token returns null (:142, :224-227).
- Summary is `"<Schema Drift|DQ Violation>: <mappingName||jobName||jobId>"` (:231-232).
- Fixed fields: `issuetype:{name:'Bug'}`, `priority:{name:'High'}`, labels = connection `default_labels` (:250-262).
- The description is a single ADF paragraph containing the job id, an ISO timestamp, the violation count and the rule list. The rule list is `(no specific rules identified)` when empty (:235-245).
- `deepLink` is built only if `appBaseUrl` is passed. Neither caller passes it, so the link is never added (:233; callers :1649-1655, :2360-2367).
- It POSTs to `<url>/rest/api/3/issue` with `timeout: 10000`, `maxRedirects: 0` (:268-281).
- It then runs `UPDATE transformation_jobs SET jira_issue_key=$1 WHERE job_id=$2` (:287-290). A failure of this update is logged and ignored (:291-295). The column is created at server.js:5950 as `VARCHAR(50)`.
- Returns the issue key, or null on any error (:300-307).
- No deduplication: each abort creates a new issue (no check found).

C. Workflow node. visualWorkflowExecutor.js:~780-818 calls `createIssueFromWorkflow` (JiraService.js:325-414):
- Summary and description support `{status}` and `{workflowId}` placeholders. Only the first occurrence is replaced, because `.replace` is called with a string (visualWorkflowExecutor.js:793-799).
- Defaults: `issueType 'Task'`, `priority 'Medium'`, summary `'Workflow execution — {status}'` (visualWorkflowExecutor.js:797, :805-806; JiraService.js:329-330).
- Connection: `connectionIdOverride` selects an active connection of type jira. Otherwise the first active connection is used (:338-346).
- No connection returns `{success:false, skipped:true, reason}` (:348-350). An incomplete config returns `{success:false, error}` (:352-355).
- `projectKeyOverride` replaces the connection's project key (:358).
- The request is the same as in A and B (`timeout: 10000`, `maxRedirects: 0`).
- Assignee is sent as `{accountId: assignee}` (:379-382). `issueUrl = <instanceUrl>/browse/<key>` (:403).
- Does not write to `transformation_jobs`.

SSRF protection (JiraService.js:65-106): HTTPS only; `dns.lookup(all:true)`; reject if ANY address is private (`isPrivateIp` :26-47); a pinned `https.Agent` uses the first validated IP. Applied in testConnection and in both create paths.

### Frontend (src/components/IncidentIntegration.jsx)
- Lists Jira connections from the backend (:154-175) and merges them with other integration types from localStorage key `dfo-incident-integrations` (:180-192).
- Create (:444) and update (:427) send the credentials only if typed (:422-425).
- Failures on create, update and delete are only `console.error`'d, with no user message (:431, :453, :501).
- Delete is at :497. Test is at :550.
- Jobs.jsx:445-458 shows the `jira_issue_key` badge linked to `${jiraInstanceUrl}/browse/<key>`. backend/routes/jobs.js:167 selects the key.

## Data touched
- `storage_connections` (connection_id, name, type='jira', status, config JSON, created_at, updated_at): read, insert, update and delete.
- `config` JSON keys: `instance_url, project_key, email (enc), email_display, api_token (enc), default_labels`.
- `transformation_jobs.jira_issue_key` VARCHAR(50): written by the abort flow, read by jobs.js:167.
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
- BUG: `appBaseUrl` is never passed by either caller, so the "View job runs" deep link in the description is dead in practice (JiraService.js:233, :245).
- BUG: the PUT validation does not re-check a stored URL. Only a supplied URL is checked. Legacy or invalid stored URLs are caught only at test or send time.
- BUG: the UI swallows create, update and delete errors with only `console.error` (IncidentIntegration.jsx:431, :453, :501).
- BUG: IPv4 hostnames in non-dotted forms may pass the route check (for example decimal or hex `http`-style encodings). `new URL` normalises these to dotted form, so this probably does not apply. Not verified; see Open questions.
- BUG (minor): `{status}` and `{workflowId}` are replaced only once (visualWorkflowExecutor.js:794, :798-799).
- SECURITY: the GET list is open to every authenticated user, so `instance_url`, `project_key`, `email_display` and `default_labels` are visible to all. Credentials are not returned (jiraRoutes.js:123-134). This is intentional per the comment at :109-110.
- SECURITY: `PUT status` and `default_labels` have no validation of type or value (jiraRoutes.js:290, :306).
- SECURITY: the test endpoint for new credentials takes an arbitrary admin-supplied HTTPS URL. This is mitigated by the URL check and the DNS-pinned agent (jiraRoutes.js:195, JiraService.js:168).
- SECURITY (positive evidence): no redirects are followed (`maxRedirects:0`), and the stored URL is always used when testing an existing connection (jiraRoutes.js:172).
- UNCLEAR: with several active connections, abort tickets always use the oldest active one (JiraService.js:117). Whether that is intended is unknown.
- UNCLEAR: `project_key` is not validated against Jira.
- DEAD: none found.

## Domain terms
- Jira connection, Jira integration, incident integration: all refer to `storage_connections` with type 'jira' (the frontend calls them integrations).
- DQ abort (`DQ_ABORT`), schema drift (`schema_drift`): the two abort reasons.
- `email_display`: the masked email.
- Jira Ticket node (`jira_ticket`): the workflow node type.
- `username`: the frontend form field for the Jira email.
- `instanceUrl` / `instance_url`, `projectKey` / `project_key`.
- Issue key, for example "DQ-456".

## Open questions
1. How `userHasAdminAccess` decides admin: it is outside this area (utils/permissionHelpers).
2. Is a connection used by workflow nodes (`connectionId`) protected on delete? No check was found, so a node would get `skipped` at run time.
3. Does the workflow node execution (visualWorkflowExecutor.js, before :790) gate on workflow status or failure only? Only lines 790-819 were read.
4. `jiraInstanceUrl` in Jobs.jsx: its source was not traced.
5. Does the `storage_connections` DDL constrain `type` or `status`? The inventory already lists this as a gap.
6. Is there any retry or dedup for repeated aborts of the same job or mapping? None was found.
7. Whether exotic IP encodings (octal, hex) bypass the route check was not verified.
