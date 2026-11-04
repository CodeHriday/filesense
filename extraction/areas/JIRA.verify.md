# JIRA verification (final, after fix round 2)

Verdict: PASS

Counts: checked 52, wrong 0, unsupported 0, missing 0.

## Round-2 changes
- connectionId = uuidv4() at jiraRoutes.js:232, inserted into connection_id at :244-246: CORRECT.
- PUT status note cites :306 (`status || null`): CORRECT.
- DQ-abort flag: CORRECT.
  - DQ_ABORT is set at jobExecutionEngine.js:3913 and rethrown at :3948.
  - processFile's outer catch (:4819-4826) logs and rethrows.
  - The only processFile call is :2100, inside the per-file try. Its catch (:2170-2195) swallows the error and does not rethrow.
  - The test comment at qualityRuleNames.test.js:551-554 matches.
  - The only DQ_ABORT references outside tests are :2342, :2358, :3913 and :3948.
  - So the trigger at :2357-2369 is effectively dead, as the notes say.
- archived/WorkflowBuilder.jsx:1332 as a third GET caller: CORRECT. Jobs.jsx:33 and IncidentIntegration.jsx:154 are also confirmed.

## Other claims checked, all CORRECT
- Mount at server.js:13935-13936.
- Migration at server.js:5950.
- jobs.js:167 selects jira_issue_key.
- requireAdmin (:102-107).
- GET: shape, fallbacks, ORDER BY created_at DESC, 500 message.
- test endpoint: 404, 400 messages, URL taken from storage, validation order, always HTTP 200 result.
- POST: required fields, email_display regex, non-string email gives 500, 201 response.
- PUT: merge rules, COALESCE, 404, no validation of status.
- DELETE: hard delete, 404 on rowCount 0.
- JiraService:
  - isPrivateIp and the SSRF agent pinned to results[0].
  - getJiraConnection ORDER BY created_at ASC.
  - _decodeConfig.
  - testConnection timeout 8000 and maxRedirects 0.
  - createIssueForAbortedJob: summary, Bug/High, ADF, appBaseUrl never passed, UPDATE failure ignored.
  - createIssueFromWorkflow: connection override, skipped result, accountId assignee, `String(detail)` error.
- visualWorkflowExecutor:
  - Dispatch at :276-286.
  - executeJiraTicket: allOk uses only executionErrors.size, and `.replace` replaces only the first occurrence.
  - generateExecutionSummary: skipped, success and failed counting.
- Schema-drift trigger (jobExecutionEngine.js:1598-1657): the anomaly INSERT is wrapped in its own try/catch, and the Jira call follows the job update.
- Jobs.jsx:33-37 uses `[0]` of the newest-first list.

## Minor notes (not errors)
- The dispatch cite "(:274-276)" actually spans the comment at :274-275 and the condition at :276. This is harmless.
- The SECURITY inference about `[::ffff:7f00:1]` and the Node 20 autoSelectFamily worry are labelled untested in the notes. That is acceptable.

## Coverage
All 5 HTTP entry points have subsections. The three internal triggers are covered.
