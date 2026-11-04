# SLA - Vendor SLA monitoring

## Summary
Vendor agreements (`vendor_agreements`) with `sla_enabled = true` describe when a file is expected (frequency pattern, time of day, days, grace threshold). A worker checks them every 15 minutes and is meant to write rows to `vendor_sla_violations` and `alert_events`. Four HTTP endpoints under `/api/vendor-sla` feed a dashboard (`/sla-monitoring`).

Most important finding: as written, the worker can never record a violation and the dashboard status endpoint never returns a status other than `unknown` (and returns 500 if any SLA-enabled agreement has a NULL `frequency_pattern`); the manual `test-check` endpoint always fails with 500 (see BUG-1, BUG-2, BUG-9). The agreement SLA fields are edited in src/pages/VendorAgreements.jsx and the form saves the SLA time to a column the monitor does not read (see BUG-13, BUG-14 and Data touched).

No earlier SLA.md existed; this was written fresh.

## Entry points

Common to all HTTP entry points: mounted as `app.use('/api/vendor-sla', authenticateToken, vendorSLARoutes)` (server.js:13891). Auth is JWT only. There are no role checks and no ownership/tenant checks in the router (backend/routes/vendorSLARoutes.js, whole file). Errors are returned as 500 `{success:false, error:<error.message>}`. The service `slaMonitorService` is registered by auto-discovery in backend/di/services.js:21-34.

### 1. GET /api/vendor-sla/status (vendorSLARoutes.js:9)
- Inputs (query): `vendor_id`, `agreement_id`, `status_filter`. No validation; ids are passed as bound parameters (:17-27).
- Selects agreements where `va.sla_enabled = true` (:13), joined to vendors and projects, ordered by `agreement_code` (:65). Does not filter on `va.status`, so non-active agreements are included.
- Per row subqueries (:43-60):
  - `last_file_arrival` = MAX(files.created_at) where same project and `filename LIKE '%' || va.file_name || '%'`.
  - `active_violations` = violations with `resolved_at IS NULL`.
  - `violations_last_30_days` = violations with `created_at >= NOW() - INTERVAL '30 days'`.
- Per row it calls `calculateNextArrival` (:72) and `getArrivalWindow` (:78) and derives `compliance_status` (:85-107). Values: `unknown` (default), `violated`, `compliant`, `no_data` (window present and no file).
- `expected_arrival` in the response is computed correctly by `calculateNextArrival` (:72); only `arrival_window` is always null (see BUG-1).
- If any SLA-enabled agreement has a NULL/undefined `frequency_pattern`, `getArrivalWindow` throws on destructuring inside the `Promise.all` map (:71, :78; calc:251-256) and the whole call returns 500 (see BUG-1).
- `status_filter` is an exact match on `compliance_status`, applied in memory (:129-132).
- Response: `{success, data:[{agreement_id, agreement_code, file_name, vendor_name, project_name, frequency_pattern, arrival_time, arrival_days, alert_threshold_minutes, expected_arrival, last_file_arrival, compliance_status, delay_minutes, active_violations, violations_last_30_days, arrival_window}], total}` (:109-134).
- Side effects: none.

### 2. GET /api/vendor-sla/violations (vendorSLARoutes.js:141)
- Inputs (query): `vendor_id` (matched on `va.vendor_id`), `agreement_id` (matched on `vsv.agreement_id`), `resolved`, `limit` (default 100), `offset` (default 0) (:143).
- `resolved`: if the parameter is present, `'true'` gives `resolved_at IS NOT NULL`; any other value gives `resolved_at IS NULL` (:161-167).
- `limit` and `offset` go through `parseInt` with no maximum (:169-172). A non-numeric value gives NaN and a negative limit is invalid in SQL; both would fail in the DB and return 500.
- Ordered by `vsv.created_at DESC` (:193). A separate count query runs in parallel using `params.slice(0,-2)` (:197-207).
- Response: `{success, data, total, limit, offset}` (:209-215). Rows include the `metadata` JSON and the fields `expected_arrival_time` and `actual_arrival_time` (:178-179).

### 3. POST /api/vendor-sla/test-check (vendorSLARoutes.js:222)
- Body: `agreement_id`. A missing value gives 400 "agreement_id is required" (:226-228). An unknown id gives 404 "Agreement not found" (:250-252). An agreement with `sla_enabled` false gives 400 (:256-261).
- Loads the agreement (:230-248). It selects `va.expected_arrival_time`, not `arrival_time`.
- Calls `slaMonitorService.checkAgreementSLA(agreement)` (:263). The route gets `slaMonitorService` from `require('../services/slaMonitorService')` (:5), but that module exports the class (`module.exports = SLAMonitorService`, slaMonitorService.js:402; class declared at :9), and `checkAgreementSLA` is an instance method. The call therefore throws a TypeError, the catch returns 500, and every request that passes the 400 and 404 checks fails. It never writes violations or alert events, and the "Manual SLA check triggered" log (:265) is never reached (see BUG-9). This is not the same call the worker makes: the worker uses an instance.
- It does not check `va.status = 'active'`, unlike the worker (moot, since the call fails).
- Intended response `{success:true, data:checkResult}` is never returned.
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
  6. `createAlertEvent` inserts into `alert_events` with `entity_type='vendor_sla'`, `entity_id=agreement.id` as a string, `event_type='sla_violation'`, `status='failure'`, `vendor_sla_violation_id`, metadata (including a message) and `occurred_at = violation_detected_at` (:303-340). Errors are swallowed (:347-353). `alert_events.vendor_sla_violation_id` exists (migrations/addVendorSLAToAlertScope.js:43; prod dump :4112).
  - Who sends the e-mail is not in this area. The comment at :268 says "alert_sent will be set by alert integration". Nothing in the files read sets `alert_sent` to true.

### 6. Frontend: /sla-monitoring (src/pages/SLAMonitoring.jsx; src/hooks/useSLAMonitoring.js; src/api/slaService.js)
- Route `/sla-monitoring` is at src/App.jsx:411.
- `useSLAMonitoring` fetches summary, status and `violations({resolved:false, limit:50})` in parallel (hook:8-20). Auto-polling is disabled (`refetchInterval:false`, hook:28). It refetches on mount (:30), and the Refresh button calls `refetch` (page:88).
- The three requests are combined with `Promise.all` (hook:9-13), so one failing request rejects the whole query (see BUG-15).
- `useManualSLACheck` runs `runManualSLACheck` (the POST test-check) and then invalidates the query (hook:35-45). The page has `checkingAgreementId` state (page:10). The "Check Now" button calls `handleManualCheck(item.agreement_id)` (page:224-231), is disabled while checking, and shows alerts on success and failure (page:20-31). Because test-check always returns 500 (BUG-9), the button always ends in the "Failed to run SLA check" alert.
- The page filters in memory by `filter` (default `'all'`) against `compliance_status`, plus a search term (page:60-61). The status filter dropdown has no `unknown` option (page:159-163). It highlights `violated` rows (page:195). It shows `summary.compliance_rate` followed by "%" (page:111).
- The "Recent Violations" table reads `violation.expected_arrival` and `violation.actual_arrival` (page:271-272), but the API returns `expected_arrival_time` and `actual_arrival_time` (route:178-179), so those columns always show "Never" (see BUG-11). The list only ever contains unresolved rows (see BUG-16).
- src/api/slaService.js was read: four axios wrappers over `/api/vendor-sla/{status,violations,test-check,summary}`. `resolved` is sent whenever it is not `undefined`, so `resolved=false` is sent (slaService.js:25). `limit` and `offset` are only sent when truthy (so `offset=0` is not sent; `limit` is sent when set; :26-27). Errors are logged and rethrown. This matches the description above.

### Cross-reference: how the agreement SLA fields are saved (other area)
- The form in src/pages/VendorAgreements.jsx calls `axios.post('/api/vendor-agreements', ...)` (:1235) on create and `axios.put('/api/vendor-agreements/:id', ...)` (:1263, :1332, :1394) on update.
- These are handled by `router.post('/')` (backend/routes/vendorAgreementRoutes.js:183) and `router.put('/:id')` (:841), mounted at server.js:13886.
- They are persisted by backend/services/vendorAgreementService.js: INSERT at :300-329 (columns `sla_enabled, frequency_pattern, arrival_time, arrival_days, alert_threshold_minutes` at :310) and UPDATE at :961-994.
- Create defaults: `sla_enabled || false`, `frequency_pattern || 'daily'`, `arrival_time || '09:00'`, `arrival_days || null`, `alert_threshold_minutes || 60` (:324). Update sets `alert_threshold_minutes` whenever it is not `undefined` (:989-994), so an explicit 0 is kept on update but becomes 60 on create (see BUG-17).

## Calculation rules (backend/services/slaCalculationService.js)
All rules apply to the single exported instance (:305).
- Supported `frequency_pattern` values: daily, weekly, monthly, hourly, compared case-insensitively. 'custom' is "not yet supported" (:11); any other value returns null with a warning (:43-45).
- `arrivalTime` is "HH:MM" split on ":" (:24). NaN returns null (:25-28).
- Daily: today at HH:MM, or tomorrow if that time is `<=` fromDate (:57-67).
- Hourly: this hour at minute MM, or next hour if `<=` fromDate. The hour part of the time is ignored (:199-209).
- Weekly: `arrival_days` is a JSON string or array of English day names, case-insensitive. Invalid or empty returns null. It scans 14 days ahead for the first matching weekday whose time is strictly `>` fromDate (:73-127).
- Monthly: `arrival_days` is an array of day numbers. Values outside 1-31 are dropped. Days are clamped to the last day of the month (for example 31 becomes 30 or 28). It returns the next date strictly in the future, in this month or else the next month using the smallest date (:134-193). See BUG-12 for an overflow when run on the 29th to 31st.
- Time zone: everything uses server local time (`setHours`, `getDay`, `getDate`). No time zone is stored or configurable. The columns are `TIMESTAMP` without time zone (migration:86).
- Window (`getArrivalWindow(agreement, fromDate)`, :250-280): `alert_threshold_minutes` defaults to 60 (:255). The deadline is expected + threshold minutes. `isViolated = fromDate > deadline` (:270).
- `isViolated(expected, thresholdMinutes=60, currentTime)` (:218) and `checkCompliance` (:289) are helpers with a different parameter order from what the route passes.
- `calculateDelay(expected, actual)` returns floor of the difference in minutes, minimum 0 (:233-242).

## Data touched
- `vendor_agreements` (read): `id, agreement_code, file_name, frequency_pattern, expected_arrival_time, arrival_days, alert_threshold_minutes, project_id, vendor_id, status, sla_enabled`.
  - The migration (backend/migrations/addSLAMonitoringToVendorAgreements.js:26-79) adds `sla_enabled` (default false), `frequency_pattern` VARCHAR(50), `arrival_time` VARCHAR(10), `arrival_days` TEXT, and `alert_threshold_minutes` INTEGER default 60 (nullable: migration :74; prod dump :6827 `NULL`).
  - `expected_arrival_time` VARCHAR(50) comes from a different migration (backend/migrations/enhanceVendorManagement.js:64). `arrival_time` is not read by any SLA code in this area, but it is written: the form's SLA time field saves into it (BUG-13). The prod dump has both columns (attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql:6812, :6828). The migration's `down()` never drops `arrival_time` (:166-171).
  - The SLA columns are edited in src/pages/VendorAgreements.jsx (defaults `sla_enabled: false`, `frequency_pattern: 'daily'`, `alert_threshold_minutes: 60` at :130-134, :829-833, :943-947; form fields at :2844-2863). backend/routes/dashboard.js also references `sla_enabled` (:437, `WHERE va.sla_enabled = true AND va.status = 'active'`).
- `vendor_sla_violations` (read and write), defined at migration:83-98: `id, agreement_id` (FK, ON DELETE CASCADE), `expected_arrival_time, violation_detected_at, alert_sent, alert_sent_at, resolved, resolved_at, file_id` VARCHAR(255)`, actual_arrival_time, delay_minutes, metadata` JSONB, `created_at, updated_at`. The prod dump agrees with the migration (dump :6895-6914, :7905), including ON DELETE CASCADE.
- `alert_events` (write): see entry point 5. The foreign key from `alert_events.vendor_sla_violation_id` is `ON DELETE SET NULL` (prod dump :7310).
- `files` (read): `project_id, filename, created_at, file_id, id`.
- `vendors` and `projects` (read, joins).

## Flags

### BUG
- BUG-1: `/status` never computes `arrival_window`, so no status other than `unknown` is possible, and it can crash the whole endpoint. The route calls `getArrivalWindow(frequency_pattern, arrival_time, arrival_days, alert_threshold_minutes)` with four positional arguments (route:78-83). The function takes `(agreement, fromDate)` (calc:250) and destructures its first argument (calc:251-256).
  - For a non-null string `frequency_pattern`, every destructured field is undefined and `calculateNextArrival` returns null (calc:19-21). `arrivalWindow` is null, so only `unknown` results (route:85-107). `expected_arrival` in the response is computed correctly (route:72); only `arrival_window` is always null.
  - If `frequency_pattern` is NULL or undefined, the destructuring throws `TypeError: Cannot destructure ... of null`. The throw is inside the `Promise.all` map (route:71), so the whole `/status` call returns 500. `frequency_pattern` is nullable (migration :41; the worker's own query filters `IS NOT NULL`, service:45). One SLA-enabled agreement with no pattern breaks the dashboard.
  - From the UI this NULL path is hard to reach: the create path writes `frequency_pattern || 'daily'` (vendorAgreementService.js:324), so a NULL can only come from legacy rows or from an update that sets it to null (the update code is at :961-994).
  - The route also calls `isViolated(lastArrival, expectedArrival, deadline)` (route:90) against the signature `(expected, thresholdMinutes, currentTime)` (calc:218), which is also wrong, though it is not reached.
- BUG-2: the worker can never detect a violation (for thresholds of 0 or more). `calculateNextArrival` always returns a time strictly after `fromDate` (calc:62-64, 121, 204-206, monthly :178). `getArrivalWindow` is called with fromDate = now (service:108), so the deadline is later than now and `isViolated = fromDate > deadline` is always false (calc:270). `checkAgreementSLA` therefore always returns `pending` (service:120-128). `checkFileArrival`, `recordViolation`, `createAlertEvent` and `resolveViolation` are unreachable in practice, unless the data is such that this reasoning is wrong; this was not tested at runtime. A negative `alert_threshold_minutes` makes `isViolated` reachable (calc:269-270). Consequence: `vendor_sla_violations` and `alert_events` of type `sla_violation` would not be written by the worker.
- BUG-3: the file-arrival window is evaluated against a future expected time, so even if BUG-2 were fixed the logic would look for files created after an expected time that is still in the future (service:131-136, with `created_at >= expectedTime` at :188). It never looks at the most recent past slot.
- BUG-4: `compliance_rate` mixes units. It subtracts the count of all unresolved violations (any agreement, including agreements no longer SLA-enabled, and several violations per agreement) from the count of SLA agreements (route:320-322). It can therefore go negative. It returns a string from `toFixed(2)` in one branch and the number `100` in the other.
- BUG-5: a DB error in `checkFileArrival` returns null (service:198-205). The agreement is then treated as "file not arrived" and a violation (plus alert event) would be created for what was really a query failure.
- BUG-6: `alert_threshold_minutes = 60` in `getArrivalWindow` is a destructuring default (calc:255). It applies only to `undefined`. A database NULL arrives as `null`, which gives a threshold of 0 minutes (`null * 60 * 1000`, calc:269). The column is `INTEGER DEFAULT 60` and nullable (migration :74; dump :6827), so an explicit NULL is possible.
- BUG-7: weekly `arrival_days` given as numbers (as the monthly format is) makes `day.toLowerCase()` throw (calc:99). The outer catch turns that into a null window (calc:47-50), so the agreement is silently skipped.
- BUG-8: `processed` counts `skipped` and `pending` results as processed (service:60), so the worker log "processed" is not the number of agreements actually evaluated.
- BUG-9: `POST /test-check` can never run a check. vendorSLARoutes.js:5 requires the class (slaMonitorService.js:402 exports the class) and :263 calls an instance method on it, giving a TypeError and a 500 for every request that passes validation. The frontend "Check Now" button therefore always fails.
- BUG-11: frontend field mismatch. SLAMonitoring.jsx:271-272 reads `expected_arrival` and `actual_arrival`, but `/violations` returns `expected_arrival_time` and `actual_arrival_time` (route:178-179). The dates always show "Never".
- BUG-12: monthly overflow at calc:185-186. `setMonth(+1)` runs before `setDate(1)`. On the 29th to 31st, when no target date remains this month, `setMonth` rolls over a short month: Jan 31 becomes Feb 31, which becomes Mar 3, then `setDate(1)` gives Mar 1, so February is skipped. The comment "Set to 1st first to avoid overflow" says the opposite of the actual order.
- BUG-13: the SLA time entered in the agreement form is saved to a column the monitor does not read. The form's SLA time field is `arrival_time`, `type=time`, so HH:MM (VendorAgreements.jsx:2878-2888), and it is saved to the `arrival_time` column (vendorAgreementService.js:310, :324, update :975-980). The monitor reads `expected_arrival_time` (service:35, :46; route:35, :236), which is a different form field: free text with placeholder "9:00 AM EST" (VendorAgreements.jsx:2767-2776; input handler :1002). A value such as "9:00 AM" is split on ":" into "9" and "00 AM", the minute is NaN, and the calculator returns null (calc:24-28), so the agreement is skipped. Only a bare "HH:MM" typed into that free-text field gives a usable time.
- BUG-14: the form's `arrival_days` and `frequency_pattern` inputs do not match what the calculator accepts.
  - Weekly `arrival_days` is a free-text field with placeholder "1,3,5" and a helper text naming 0=Sunday (VendorAgreements.jsx:2893-2907). The calculator wants a JSON array of day names (calc:81-99). "1,3,5" is not valid JSON and "1" parses to a number, not an array, so the window is null (calc:47-50) and the agreement is skipped.
  - The `arrival_days` input is shown only for the weekly pattern (:2893). Monthly requires `arrival_days` (calc:135-138) but the form has no input for it, so monthly agreements from the UI give a null window.
  - The form offers `custom` as a frequency pattern (:2872), which the calculator rejects (calc:43-45).
- BUG-15: one failing request blanks the whole dashboard. `fetchSLAData` uses `Promise.all` (hook:9-13), so a 500 from `/status` (BUG-1) rejects the whole query. `data` is undefined, the summary and violations are not shown either, and the page shows the empty "No SLA monitoring configured yet" state. There is no error UI.
- BUG-16: "Recent Violations" only ever shows unresolved rows. The hook requests `resolved:false` (hook:12), so the "Resolved" badge branch (page:276-277) cannot show on this page.
- BUG-17 (minor): on create, `alert_threshold_minutes || 60` (vendorAgreementService.js:324) turns an explicit threshold of 0 into 60. On update the value is saved as given (:989-994).

### DUPLICATE
- DUP-1: compliance / violation logic is implemented twice. The route computes status itself using `last_file_arrival` and `isViolated` (route:85-107); the worker uses window `isViolated` plus `checkFileArrival` (service:104-168). They use different status vocabularies (`violated`/`compliant`/`no_data`/`unknown` vs `violation`/`compliant`/`pending`/`skipped`).
- DUP-2: filename matching differs. `/status` uses `filename LIKE '%' || file_name || '%'` (a contains match, `*` not converted, and `%` or `_` inside `file_name` act as wildcards) (route:47). The worker converts `*` to `%` and otherwise requires an exact `filename =` (service:181-193).
- DUP-3: "resolved" is stored twice, as `resolved` (boolean) and `resolved_at`. The worker filters on `resolved` (service:224, 374). The routes filter on `resolved_at` (route:53, 163-165, 293). They agree only while the worker sets both together (service:367-368).
- DUP-4: `isViolated` and `checkCompliance` in the calculation service duplicate the deadline arithmetic in `getArrivalWindow`.

### DEAD
- DEAD-1: `slaCalculationService.checkCompliance` (calc:289) is not called in the area files read. This was not searched repo-wide.
- DEAD-2: in the files read, `isViolated` (calc:218) is only called from the route (:90), which is not reached (BUG-1).
- DEAD-3: the unused `nextArrival` local in the weekly calculation (calc:109-110) has no effect. In the monthly function `nextArrival` is used and returned (calc:165-192).
- DEAD-4: the `arrival_time` column added by the migration (migration:49-52) is not read by the worker, `test-check` or the status route. The route reads `expected_arrival_time` and renames it `arrival_time` in the response (route:35). The column is written, though: the form's SLA time field saves into it (BUG-13), so the SLA time the user enters is stored but never used by the monitor.
- DEAD-5 (conditional on BUG-2): `checkFileArrival`, `recordViolation`, `createAlertEvent` and `resolveViolation`.
- DEAD-6: the `pool` import in the route file (route:3) is unused. `systemLogger`, `slaMonitorService` (broken, see BUG-9) and `slaCalculationService` (used at :72, :78, :90, :98) are used.

### SECURITY
- SEC-1: no role or ownership checks on any endpoint. Any authenticated user can read all vendors' SLA status and violations and can call `POST /test-check`, which as written always fails with 500 (BUG-9); if it worked, it would run the check that writes violations and alert events (server.js:13891; route file has no permission code).
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
2. Which component consumes `alert_events` of type `sla_violation` and sends e-mails, and which sets `alert_sent`?
3. What time zone does the production server run in? All schedule times depend on it.
4. Does the `arrival_time` column hold data, or is `expected_arrival_time` the only populated one? Both columns exist in the prod dump; which code populates `expected_arrival_time` is in VendorAgreements.jsx (not traced).
5. Are `deleted` or archived files excluded from the `files` queries? No such condition exists in the SQL read.
