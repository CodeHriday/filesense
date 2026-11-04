# SLA verification (final re-verify after fix round 2)

Verdict: FIX (one missed finding; nothing else wrong of substance)

Counts: about 75 claims checked, 1 WRONG (minor citation), 0 UNSUPPORTED, 1 missed (substantive) plus 2 minor omissions.

## Coverage
All 6 entry points are present: 4 HTTP routes (vendorSLARoutes.js:9, :141, :222, :280), the SLAMonitorWorker, and the /sla-monitoring frontend (App.jsx:411). No entry point is missing. The full-file rewrite lost nothing from the previous version. All BUG-1 to BUG-17 (BUG-10 intentionally dropped), the DUP, DEAD, SEC and UNCLEAR flags, and the Domain terms section are present.

## Round-2 changes
- Entry 6 (slaService.js:25, `resolved !== undefined`): CORRECT. :26-27 `limit` and `offset` are sent only when truthy: CORRECT.
- DEAD-4 reworded: CORRECT. The route reads `expected_arrival_time` aliased as `arrival_time` (route:35). `arrival_time` is written by the form and by the service INSERT (:310, :324) and UPDATE (:975-980).
- BUG-13: CORRECT. The form's SLA time is `type=time` with name `arrival_time` (VendorAgreements.jsx:2878-2888). The free-text `expected_arrival_time` has placeholder "9:00 AM EST" (:2767-2776) and a sanitizer at :1002. The service reads `expected_arrival_time` (service:35, :46). "9:00 AM".split(':') gives "00 AM", so minutes are NaN and calc:24-28 returns null.
- BUG-14: CORRECT in substance. The weekly input is text with placeholder "1,3,5" and a 0=Sunday helper (:2893-2907). The monthly pattern has no input (`arrival_days` is rendered only for weekly, :2893). `custom` is an option (:2872).
  - WRONG (minor citation): the note says the null window comes from "calc:47-50". In fact "1,3,5" fails JSON.parse and returns null at calc:82-85, and "1" parses to a number and returns null at calc:87-90. Both are inside `_calculateWeeklyArrival`, not the outer catch. The calc:81-99 range cited in the same bullet is fine.
- BUG-15: CORRECT. The hook uses `Promise.all` (hook:9-13). On error `data` is undefined, so the page renders the "No SLA monitoring configured yet" text (page:190) and the "No active violations" box. Not noted: react-query's default retries delay the failure state. This is a minor omission.
- BUG-16: CORRECT. The hook sends `resolved:false` (hook:12); the badge branch is at page:276-277.
- BUG-17: CORRECT. Create uses `alert_threshold_minutes || 60` (service:324). Update uses `!== undefined` (:989-994). The form allows min=0 (:2922).
- alert_events FK ON DELETE SET NULL: CORRECT (dump :7310; migration addVendorSLAToAlertScope.js:44 agrees).
- Cross-reference subsection: CORRECT.
  - Form POST at :1235 and PUTs at :1263, :1332, :1394.
  - Routes `router.post('/')` at vendorAgreementRoutes.js:183 and `router.put('/:id')` at :841, mounted at server.js:13886.
  - INSERT at service:300-329 with the column list at :310.
  - UPDATE at :961-994.
  - Defaults at :324.
- BUG-1 `'daily'` default (:324): CORRECT.
- Open questions renumbered: fine. Question 4 is partly answerable, since both columns are written; the form's `arrival_time` is always populated.

## Spot-checked and CORRECT (not exhaustive)
- Route:
  - `/status`: filters at :13-27, subqueries :43-60, ordering :65, in-memory status_filter :129-132, response :109-134.
  - `/violations`: `resolved` handling :161-167, limit/offset :169-172, count query with `params.slice(0,-2)` :206.
  - `/summary`: SQL :282-306, `compliance_rate` :320-322.
  - `/test-check`: 400 at :226-228, 404 at :250-252, 400 at :256-261.
  - BUG-9: the route requires the class (route:5; service:402 `module.exports = SLAMonitorService`) and calls an instance method (:263), so it throws a TypeError.
  - DEAD-6: `pool` is unused (:3).
- Worker and server:
  - server.js:33, :63-68, :14227; worker defaults and flow at :14, :31, :34-36, :45-48, :53, :55, :64-77, :79-83.
  - DI auto-discovery at di/services.js:21-34. slaCalculationService exports an instance, so it is skipped by the `typeof === 'function'` check.
- slaMonitorService:
  - Query at :43-46; loop at :57-78; counters at :60-67; window/pending/violation flow at :108-168.
  - `checkFileArrival` at :181-193 and :198-205.
  - `resolveViolation` at :364-376 and :393-398.
  - `recordViolation` at :219-235 and :238-272.
  - `createAlertEvent` at :303-340 and :347-353.
- slaCalculationService:
  - :11, :24-28, :43-45, :57-67, :73-127, :134-193, :199-209, :218, :233-242, :250-280, :255, :270, :289.
  - BUG-2: every `calculateNextArrival` branch returns a time strictly after `fromDate`, so `isViolated` is false for thresholds >= 0.
  - BUG-6: `null` threshold gives 0.
  - BUG-7: `day.toLowerCase` on a number is caught by the outer catch at :47-50.
  - BUG-12: `setMonth` runs before `setDate(1)` (:185-186).
  - DEAD-3: the weekly `nextArrival` is unused (:109-110).
- Frontend: page:10, :20-31, :60-61, :88, :111, :159-163, :195, :224-231, :271-272, :276-277; hook:28, :30, :35-45.
- Schema:
  - Migration: columns :26-79, `alert_threshold_minutes` :74, violations table :83-98 (ON DELETE CASCADE at :85), `down()` leaves `arrival_time` (:166-171).
  - Other migrations and dump: enhanceVendorManagement.js:64 (`expected_arrival_time` VARCHAR(50)); dump :6812, :6827, :6828, :6895-6914, :7905, :4112.
  - dashboard.js:437.

## MISSED (substantive)
1. `alert_events.run_id` is `int4 NOT NULL` with an FK to `alert_runs(id)` in the prod dump (attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql:4104, :7309). `createAlertEvent` (slaMonitorService.js:303-340) inserts no `run_id`.
   - Against the prod schema every insert would fail with a NOT NULL violation. The catch at :347-353 swallows it, so no `sla_violation` alert event could ever be stored. This holds even if BUG-2 were fixed.
   - It also explains UNCLEAR-2 and Open question 2: nothing links these events to a run.
   - The notes only say "Errors are swallowed" and cite the dump for `vendor_sla_violation_id`. A new BUG should be added: the insert is incompatible with the dump's `alert_events` (`run_id` NOT NULL). The dump is the source for this claim. The createEmailAlertingSystem migration defines `run_id` differently, as VARCHAR UNIQUE on another table, so the migrations and the dump disagree.

## Minor omissions (not blocking)
- `/status` reads `va.expected_arrival_time` and returns it as `arrival_time`, so the response field is not the `arrival_time` column. DEAD-4 mentions this; Domain terms does too.
- `selectedAgreement` state in SLAMonitoring.jsx:9 is unused (trivial dead code).
