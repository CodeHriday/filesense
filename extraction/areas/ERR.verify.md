# ERR verification

Verdict: PASS

Written by the orchestrator from the verifier's reply; the verifier itself declined to write this file.

- 40+ claims checked: 0 wrong, 0 unsupported, 0 missed entry points.
- Coverage: all 9 HTTP endpoints (inventory.md:395-403; router lines 23, 166, 335, 382, 418, 555, 695, 868, 1050) and the FE route /error-review (src/App.jsx:375). The mount at server.js:5328 is authenticateToken, errorReviewRoutes. No /:id route can shadow the others.
- Confirmed (backend/routes/errorReview.js unless noted): parseProjectId; the job_id predicates; the access subquery; the search and joins; the 500 details leaks (:158, :327, :547, :687, :1122); every detail of endpoints #2 through #9; permissionHelpers.js; the FE (ErrorReview.jsx page sizes, fetches, downloads, the bulkDeleteViolations import; errorReviewService.js:16-35 calling nonexistent routes); auditMiddleware.js:86; the unused userRoles variables.

## Minor missed details (do not change the verdict)
1. Invalid date_from/date_to are cast with ::date unvalidated (:485, :490, :623, :628, :768, :943), so a bad date returns 500, not 400.
2. limit=0 gives totalPages = Infinity (:153 and the matching lines).
3. #2: `LEFT JOIN visual_mapping_executions vme ON vme.job_id = tj.job_id` (:259) can return several rows per job, duplicating violation rows and inflating the count.
4. #6: GROUP BY includes COALESCE(p.id, tj_p.id) (:664) but the total is COUNT(DISTINCT job_id) (:643), so a job spanning several projects shows as several groups and the pagination totals don't match.
5. The FE per-group download (ErrorReview.jsx:196-200) sends only format, id and label, ignoring the active status, severity and search filters.
