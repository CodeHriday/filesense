# SLA - Vendor SLA monitoring

## Summary
Vendor agreements (`vendor_agreements`) with `sla_enabled = true` describe when a file is expected (frequency pattern, time of day, days, grace threshold). A worker checks them every 15 minutes and is meant to write rows to `vendor_sla_violations` and `alert_events`. Four HTTP endpoints under `/api/vendor-sla` feed a dashboard (`/sla-monitoring`).

Most important finding: as written, the worker can never record a violation and the dashboard status endpoint always reports `unknown` (see BUG-1, BUG-2). Nothing in this area edits SLA settings on an agreement; those columns are set elsewhere (not traced here).

No earlier SLA.md existed; this was written fresh.

## Entry points

Common to all HTTP entry points: mounted as `app.use('/api/vendor-sla', authenticateToken, vendorSLARoutes)` (server.js:13891). Auth is JWT only. There are no role checks and no ownership/tenant checks in the router (backend/routes/vendorSLARoutes.js, whole file). Errors are returned as 500 `{success:false, error:<error.message>}`.

### 1. GET /api/vendor-sla/status (vendorSLARoutes.js:9)
- Inputs (query): `vendor_id`, `agreement_id`, `status_filter`. No validation; ids are passed as bound parameters (:17-27).
- Selects agreements where `va.sla_enabled = true` (:13), joined to vendors and projects, ordered by `agreement_code` (:65). Does not filter on `va.status`, so non-active agreements are included.
- Per row subqueries (:43-60):
  - `last_file_arrival` = MAX(files.created_at) where same project and `filename LIKE '%' || va.file_name || '%'`.
  - `active_violations` = violations with `resolved_at IS NULL`.
  - `violations_last_30_days` = violations with `created_at >= NOW() - INTERVAL '30 days'`.
- Per row it calls `calculateNextArrival` (:72) and `getArrivalWindow` (:78) and derives `compliance_status` (:85-107). Values: `unknown` (default), `violated`, `compliant`, `no_data` (window present and no file).
- `status_filter` is an exact match on `compliance_status`, applied in memory (:129-132).
- Response: `{success, data:[{agreement_id, agreement_code, file_name, vendor_name, project_name, frequency_pattern, arrival_time, arrival_days, alert_threshold_minutes, expected_arrival, last_file_arrival, compliance_status, delay_minutes, active_violations, violations_last_30_days, arrival_window}], total}` (:109-134).
- Side effects: none.

### 2. GET /api/vendor-sla/violations (vendorSLARoutes.js:141)
- Inputs (query): `vendor_id` (matched on `va.vendor_id`), `agreement_id` (matched on `vsv.agreement_id`), `resolved`, `limit` (default 100), `offset` (default 0) (:143).
- `resolved`: if the parameter is present, `'true'` gives `resolved_at IS NOT NULL`; any other value gives `resolved_at IS NULL` (:161-167).
- `limit` and `offset` go through `parseInt` with no maximum (:169-172). A non-numeric value gives NaN, which would most likely fail in the DB and return 500. This is not tested.
- Ordered by `vsv.created_at DESC` (:193). A separate count query runs in parallel (:197-207).
- Response: `{success, data, total, limit, offset}` (:209-215). Rows include the `metadata` JSON.

### 3. POST /api/vendor-sla/test-check (vendorSLARoutes.js:222)
- Body: `agreement_id`. A missing value gives 400 "agreement_id is required" (:226-228). An unknown id gives 404 "Agreement not found" (:250-252). An agreement with `sla_enabled` false gives 400 (:256-261).
- Loads the agreement (:230-248). It selects `va.expected_arrival_time`, not `arrival_time`.
- Calls `slaMonitorService.checkAgreementSLA(agreement)` (:263), the same function the worker uses. This can write violations and alert events (see entry point 5).
- It does not check `va.status = 'active'`, unlike the worker.
- Logs "Manual SLA check triggered" (:265). Response `{success:true, data:checkResult}`.
- Any authenticated user can call it (see SECURITY-1).

### 4. GET /api/vendor-sla/summary (vendorSLARoutes.js:280)
- No inputs. A single SQL statement (:282-306) computes:
  - `total_agreements`: agreements with `sla_enabled = true`.
  - `active_agreements`: of those, `status = 'active'`.
  - `total_violations`, `active_violations` (`resolved_at IS NULL`), `violations_last_7_days`, `violations_last_30_days`. These are over ALL rows in `vendor_sla_violations`.
- `compliance_rate` = `((total_agreements - active_violations) / total_agreements * 100).toFixed(2)`, or the number `100` when `total_agreements` is 0 (:320-322). See BUG-4.

### 5. Worker: SLAMonitorWorker (backend/workers/slaMonitorWorker.js)
- Trigger: constructed and started in server.js (:33, :63-68; the 15 minute interval is per inventory server.js:68). Stopped on shutdown (server.js:14227). Default `intervalMs = 900000` (worker:14). It runs once immediately at start (:31), then on `setInterval` (:34-36).
- Overlap guard: skips if `isProcessing` is already true (:45-48).
- Calls `slaMonitorService.processVendorSLAs()` (:53). It logs a summary only when `processed > 0` (:55), and a warning with details for `status === 'violation'` entries (:64-77). It catches and logs all errors (:79-83).
- `processVendorSLAs` (slaMonitorService.js:17):
  - Selects agreements with `sla_enabled = true AND status = 'active' AND frequency_pattern IS NOT NULL AND expected_arrival_time IS NOT NULL` (:43-46).
  - Checks each agreement sequentially. A failure on one agreement is logged and added to `errors`, and the loop continues (:57-78).
  - `processed` is incremented for every non-throwing check, including `skipped` and `pending` results (:60). Only `violation` and `compliant` have their own counters (:63-67).
- `checkAgreementSLA(agreement)` (:104):
  1. `getArrivalWindow(agreement, now)` (:108). A null window returns `status:'skipped'` (:110-117).
  2. If `!window.isViolated` it returns `status:'pending'` with no DB writes (:120-128).
  3. Otherwise `checkFileArrival` looks for a file (:131-136).
     - Match rule: project_id equal, `created_at` between expected time and deadline (inclusive), and filename. `*` is replaced by `%` and matched with `LIKE`; with no `*` the match is `filename = $4` (:181-193). The newest file wins (`LIMIT 1`).
     - Any query error is logged and returns null, so the agreement is treated as "no file" (:198-205). See BUG-5.
  4. If a file was found, `resolveViolation` runs and the result is `status:'compliant'` (:138-152).
     - The update sets `resolved=true`, `resolved_at=now`, `file_id`, `actual_arrival_time`, `updated_at` where `agreement_id` and `expected_arrival_time` match and `resolved=false` (:364-376).
     - Update errors are swallowed (:393-398).
  5. If no file was found, `recordViolation` runs and the result is `status:'violation'` (:155-167).
     - It looks for an existing unresolved row with the same `agreement_id` and `expected_arrival_time` and returns it if found (:219-235).
     - Otherwise it inserts a row with `alert_sent=false`, `resolved=false`, `delay_minutes = calculateDelay(expected, now)` (whole minutes, floor, minimum 0) and metadata JSON of agreement_code, file_name, project_name, frequency_pattern and alert_threshold_minutes (:238-272).
     - It then calls `createAlertEvent` (:284).
  6. `createAlertEvent` inserts into `alert_events` with `entity_type='vendor_sla'`, `entity_id=agreement.id` as a string, `event_type='sla_violation'`, `status='failure'`, `vendor_sla_violation_id`, metadata (including a message) and `occurred_at = violation_detected_at` (:303-340). Errors are swallowed (:347-353).
  - Who sends the e-mail is not in this area. The comment at :268 says "alert_sent will be set by alert integration". Nothing in the files read sets `alert_sent` to true.

### 6. Frontend: /sla-monitoring (src/pages/SLAMonitoring.jsx; src/hooks/useSLAMonitoring.js)
- Route `/sla-monitoring` is at src/App.jsx:411 (per inventory).
- `useSLAMonitoring` fetches summary, status and `violations({resolved:false, limit:50})` in parallel (hook:8-20). Auto-polling is disabled (`refetchInterval:false`, hook:28). It refetches on mount (:30), and the Refresh button calls `refetch` (page:88).
- `useManualSLACheck` runs `runManualSLACheck` (the POST test-check) and then invalidates the query (hook:35-45). The page has `checkingAgreementId` state (page:10). The wiring of the button was not read in detail.
- The page filters in memory by `filter` (default `'all'`) against `compliance_status`, plus a search term (page:60-61). It highlights `violated` rows (page:195). It shows `summary.compliance_rate` followed by "%" (page:111).
- The page's own backend calls go through src/api/slaService (`getSLAStatus`, `getSLAViolations`, `getSLASummary`, `runManualSLACheck`); that file was not read.

## Calculation rules (backend/services/slaCalculationService.js)
All rules apply to the single exported instance (:305).
- Supported `frequency_pattern` values: daily, weekly, monthly, hourly, compared case-insensitively. 'custom' is "not yet supported" (:11); any other value returns null with a warning (:43-45).
- `arrivalTime` is "HH:MM" split on ":" (:24). NaN returns null (:25-28).
- Daily: today at HH:MM, or tomorrow if that time is `<=` fromDate (:57-67).
- Hourly: this hour at minute MM, or next hour if `<=` fromDate. The hour part of the time is ignored (:199-209).
- Weekly: `arrival_days` is a JSON string or array of English day names, case-insensitive. Invalid or empty returns null. It scans 14 days ahead for the first matching weekday whose time is strictly `>` fromDate (:73-127).
- Monthly: `arrival_days` is an array of day numbers. Values outside 1-31 are dropped. Days are clamped to the last day of the month (for example 31 becomes 30 or 28). It returns the next date strictly in the future, in this month or else the next month using the smallest date (:134-193).
- Time zone: everything uses server local time (`setHours`, `getDay`, `getDate`). No time zone is stored or configurable. The columns are `TIMESTAMP` without time zone (migration:86).
- Window (`getArrivalWindow(agreement, fromDate)`, :250-280): `alert_threshold_minutes` defaults to 60 (:255). The deadline is expected + threshold minutes. `isViolated = fromDate > deadline` (:270).
- `isViolated(expected, thresholdMinutes=60, currentTime)` (:218) and `checkCompliance` (:289) are helpers with a different parameter order from what the route passes.
- `calculateDelay(expected, actual)` returns floor of the difference in minutes, minimum 0 (:233-242).

## Data touched
- `vendor_agreements` (read): `id, agreement_code, file_name, frequency_pattern, expected_arrival_time, arrival_days, alert_threshold_minutes, project_id, vendor_id, status, sla_enabled`.
  - The migration (backend/migrations/addSLAMonitoringToVendorAgreements.js:26-79) adds `sla_enabled` (default false), `frequency_pattern` VARCHAR(50), `arrival_time` VARCHAR(10), `arrival_days` TEXT, and `alert_threshold_minutes` INTEGER default 60.
  - `expected_arrival_time` VARCHAR(50) comes from a different migration (backend/migrations/enhanceVendorManagement.js:64). `arrival_time` is not read by any SLA code in this area.
- `vendor_sla_violations` (read and write), defined at migration:83-98: `id, agreement_id` (FK, ON DELETE CASCADE), `expected_arrival_time, violation_detected_at, alert_sent, alert_sent_at, resolved, resolved_at, file_id` VARCHAR(255)`, actual_arrival_time, delay_minutes, metadata` JSONB, `created_at, updated_at`.
- `alert_events` (write): see entry point 5.
- `files` (read): `project_id, filename, created_at, file_id, id`.
- `vendors` and `projects` (read, joins).

## Flags

### BUG
- BUG-1: `/status` can never return anything but `unknown`. The route calls `getArrivalWindow(frequency_pattern, arrival_time, arrival_days, alert_threshold_minutes)` with four positional arguments (route:78-83). The function takes `(agreement, fromDate)` (calc:250). The first argument is a string, so every destructured field is undefined and `calculateNextArrival` returns null (calc:19-21). That makes `arrivalWindow` null, so no status other than `unknown` is possible (route:85-107). The route also calls `isViolated(lastArrival, expectedArrival, deadline)` (route:90) against the signature `(expected, thresholdMinutes, currentTime)` (calc:218), which is also wrong, though it is not reached.
- BUG-2: the worker can never detect a violation. `calculateNextArrival` always returns a time strictly after `fromDate` (calc:62-64, 121, 204-206, monthly :178). `getArrivalWindow` is called with fromDate = now (service:108), so the deadline is later than now and `isViolated = fromDate > deadline` is always false (calc:270). `checkAgreementSLA` therefore always returns `pending` (service:120-128). `checkFileArrival`, `recordViolation`, `createAlertEvent` and `resolveViolation` are unreachable in practice, unless the data is such that this reasoning is wrong; this was not tested at runtime. Consequence: `vendor_sla_violations` and `alert_events` of type `sla_violation` would not be written by the worker. This also applies to the manual `test-check`.
- BUG-3: the file-arrival window is evaluated against a future expected time, so even if BUG-2 were fixed the logic would look for files created after an expected time that is still in the future (service:131-136, with `created_at >= expectedTime` at :188). It never looks at the most recent past slot.
- BUG-4: `compliance_rate` mixes units. It subtracts the count of all unresolved violations (any agreement, including agreements no longer SLA-enabled, and several violations per agreement) from the count of SLA agreements (route:320-322). It can therefore go negative. It returns a string from `toFixed(2)` in one branch and the number `100` in the other.
- BUG-5: a DB error in `checkFileArrival` returns null (service:198-205). The agreement is then treated as "file not arrived" and a violation (plus alert event) would be created for what was really a query failure.
- BUG-6: `alert_threshold_minutes = 60` in `getArrivalWindow` is a destructuring default (calc:255). It applies only to `undefined`. A database NULL arrives as `null`, which gives a threshold of 0 minutes (`null * 60 * 1000`). Whether the column can be NULL for existing rows was not checked.
- BUG-7: weekly `arrival_days` given as numbers (as the monthly format is) makes `day.toLowerCase()` throw (calc:99). The outer catch turns that into a null window (calc:47-50), so the agreement is silently skipped.
- BUG-8: `processed` counts `skipped` and `pending` results as processed (service:60), so the worker log "processed" is not the number of agreements actually evaluated.

### DUPLICATE
- DUP-1: compliance / violation logic is implemented twice. The route computes status itself using `last_file_arrival` and `isViolated` (route:85-107); the worker uses window `isViolated` plus `checkFileArrival` (service:104-168). They use different status vocabularies (`violated`/`compliant`/`no_data`/`unknown` vs `violation`/`compliant`/`pending`/`skipped`).
- DUP-2: filename matching differs. `/status` uses `filename LIKE '%' || file_name || '%'` (a contains match, `*` not converted, and `%` or `_` inside `file_name` act as wildcards) (route:47). The worker converts `*` to `%` and otherwise requires an exact `filename =` (service:181-193).
- DUP-3: "resolved" is stored twice, as `resolved` (boolean) and `resolved_at`. The worker filters on `resolved` (service:224, 374). The routes filter on `resolved_at` (route:53, 163-165, 293). They agree only while the worker sets both together (service:367-368).
- DUP-4: `isViolated` and `checkCompliance` in the calculation service duplicate the deadline arithmetic in `getArrivalWindow`.

### DEAD
- DEAD-1: `slaCalculationService.checkCompliance` (calc:289) is not called in the area files read. This was not searched repo-wide.
- DEAD-2: in the files read, `isViolated` (calc:218) is only called from the route (:90), which is not reached (BUG-1).
- DEAD-3: the unused `nextArrival` local in the weekly and monthly calculations (calc:109, 165) has no effect (the weekly one is never read).
- DEAD-4: the `arrival_time` column added by the migration (migration:49-52) is not read by the worker or `test-check`. The route reads `expected_arrival_time` and renames it `arrival_time` (route:35).
- DEAD-5 (conditional on BUG-2): `checkFileArrival`, `recordViolation`, `createAlertEvent` and `resolveViolation`.
- DEAD-6: the `systemLogger` and `pool` imports and `slaMonitorService` in the route file (route:3-5) are unused except `slaMonitorService` in `test-check`. `pool` is unused.

### SECURITY
- SEC-1: no role or ownership checks on any endpoint. Any authenticated user can read all vendors' SLA status and violations and can trigger `POST /test-check`, which can write violations and alert events (server.js:13891; route file has no permission code).
- SEC-2: raw `error.message` is returned to clients on 500 (route:137, 218, 276, 327).
- SEC-3: `limit` and `offset` are unbounded (route:169-172). A client could request a very large page.
- SQL is parameterised throughout. No injection was found in this area.

### UNCLEAR
- UNCLEAR-1: the intended meaning of "expected arrival" in the monitor. The window is always the next upcoming slot, so it is unclear whether the design was to evaluate the most recent past slot.
- UNCLEAR-2: who sets `alert_sent` and `alert_sent_at`, and who sends the e-mail for `alert_events` with `event_type='sla_violation'` (service:268; no code found in the files read).
- UNCLEAR-3: the delay value in a violation result is `minutesUntilDeadline * -1` (service:164), which is not the same quantity as the stored `delay_minutes` (expected to now, service:251-254).
- UNCLEAR-4: `/status` includes agreements that are not `active`; the worker and `/summary` `active_agreements` treat status differently (route:13, service:44, route:286).
- UNCLEAR-5: the 30 day and 7 day windows use database `NOW()`, while the worker uses the Node server clock; both are server-side but could differ in zone.

## Domain terms
- SLA: the arrival-time commitment for a vendor file. Terms used for the same idea: "vendor SLA", "SLA monitoring", "file arrival SLA".
- Agreement: `vendor_agreements` row, with `agreement_code`.
- Expected arrival: `expected_arrival_time` (HH:MM text on the agreement; a TIMESTAMP on the violations table), `arrival_time` (the migration column and the API field name), `expected_arrival` (the status response) and `expectedArrivalTime` (code).
- Alert threshold: `alert_threshold_minutes`, the grace period (also "deadline", "alertDeadline", "threshold").
- Violation: a `vendor_sla_violations` row; "violated" is the route status word and "violation" the worker status word.
- Compliance status: `compliant`, `violated`, `no_data`, `unknown` (route); `compliant`, `violation`, `pending`, `skipped` (worker).
- Frequency pattern: daily, weekly, monthly, hourly.
- Arrival days: weekday names (weekly) or day numbers (monthly).
- Resolved: file arrived; `resolved` plus `resolved_at`.

## Open questions
1. Is BUG-2 confirmed at runtime? Static reading shows the worker always returns `pending`; no execution was done.
2. Where are `sla_enabled`, `frequency_pattern`, `arrival_days` and `alert_threshold_minutes` edited (agreement UI/API)? Not traced.
3. Which component consumes `alert_events` of type `sla_violation` and sends e-mails, and which sets `alert_sent`?
4. What are the badge labels and the "run check" button behaviour in src/pages/SLAMonitoring.jsx, and what do the calls in src/api/slaService.js do? Not read.
5. What time zone does the production server run in? All schedule times depend on it.
6. Does the `arrival_time` column hold data, or is `expected_arrival_time` the only populated one?
7. Are `deleted` or archived files excluded from the `files` queries? No such condition exists in the SQL read.
