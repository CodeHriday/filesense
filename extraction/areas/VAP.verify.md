# VAP verification, round 2 (after fix round 1)

Verdict: PASS

Counts: 62 claims checked, 0 WRONG, 0 UNSUPPORTED, 0 missing entry points. All 14 entry points in inventory.md:634-647 have a subsection (entries 1-14).

R = backend/routes/vendorAgreementRoutes.js, S = backend/services/vendorAgreementService.js, N = backend/services/VendorAgreementNotificationService.js.

## Round-1 changes, checked against code
- handleMulterError at R:2244 (`router.use(handleMulterError)`, last statement before module.exports): CORRECT. The handler body is R:22-43 as described. The 10 KB text (R:26) against the 10 MB limit (R:85) is CORRECT. The extension error at R:95 is caught by the "err.message" branch (R:37-40), CORRECT. Summary, entry 6, S4 and DE2 are consistent.
- /approve and /reject not called from the UI: CORRECT. The only matches in src/ for handleApprove and handleReject are the definitions at VendorAgreements.jsx:1493 and :1514. The axios calls are at :1498 and :1524. Nothing passes them as props. DE4, U1 and entries 1-2 are CORRECT.
- B6 hedge: CORRECT. S:997-1004 stores the array with no element type check. S:3480 and S:3838 use strict `includes`. S:3278 and S:3339 force numbers on approver ids. S:3586-3587 uses parseInt.
- B12: CORRECT. S:1369 and S:1384 write `vendor_approved` and `owner_approved`. The CHECK list at addApprovalChainToVendorAgreements.js:39-55 lacks both. The repair migration list (lines 13-28) is identical. addGovernanceWorkflow.js:45 and :57 migrate the values away. Only createVendorManagement.js:82 and the addGovernanceWorkflow.js:233 down() list include them.
- B13: CORRECT. N:147 is `return;`. N:564 and N:1533 read `stakeholders.length`. Both sit inside try blocks.
- B14, B15, B16, S7: CORRECT.
  - B14: S:3589 admin bypass, S:3774 `approvedUserIds` includes every approve row.
  - B15: S:3429-3437 leaves is_locked alone. S:3416 allows `rejected`. S:2341-2345 sets is_locked=true.
  - B16: S:2478-2482 filters only null and undefined.
  - S7: S:3332 and S:3347-3355 run before S:3365.
- PUT approval-chain order note: CORRECT. The error list for validation and the ids-exist query is accurate.
- R:1091 400: CORRECT (R:1091-1093).
- FE data source `/:id/full`: CORRECT. VendorAgreements.jsx:261-268 destructures approvals, changes and step_decisions (plus chain_users). Panel selection at :3125-3149 is CORRECT. ApprovalChainConfig.jsx:156 is PUT only. No FE caller of GET approval-chain was found.
- DE1: CORRECT. The grep finds the two names only in addGovernanceWorkflow.js:70/73, addApprovalChainToVendorAgreements.js:45/48/132/135, repairApprovalStatusConstraintForApprovalChain.js:18/21 and the attached_assets prod schema SQL (line 6832).
- "Email recipients and provider" section:
  - getStakeholders N:32-152 matches. internal_user=true applies to additional users (N:88) and group members (N:121). Contacts, manager_contact and the governance manager are not filtered, as stated. File owner and creator are not added.
  - `_getStepApproverEmails` N:1426-1433 is CORRECT.
  - getEmailProvider N:339-372 is CORRECT.
  - sendChainFullyApproved at N:1525-1533 uses getStakeholders, CORRECT.

## Spot-checked cites the fixer had not opened (all CORRECT)
- N:564, N:1533: both are the `stakeholders.length` reads.
- N:1426-1433: matches.
- N:339-372: matches. The type list is smtp, gmail_oauth2, outlook_oauth2, sendgrid, ses, azure_email, gcp_email.
- ThreeStageApprovalPanel.jsx:42 (vendor_id match; it also matches contact emails), :47-48 (case-insensitive manager_contact), :51 (governance), :61-63 (manager buttons).
- DynamicApprovalPanel.jsx:68-110: String compare for isOwner and isCreator, parseInt in hasVoted, canSubmit as described.
- Migration CHECK lists and the UNIQUE constraint at migration:73.
- addAdditionalStakeholdersToVendorAgreements.js:24 is a JSONB column.

## Other claims verified (CORRECT)
- Gate R:105-177, including R:107-111, R:138, R:147, R:150, R:154-155, R:159-166, R:169, R:171, R:175, and the permission flags at R:125-126.
- Entry 1: R:901-917, S:1306-1342, S:1357-1404, and the fact that the status is not checked.
- Entry 2: R:954, S:1465-1492, S:1504. Neither the status nor the approved_at timestamps are touched.
- Entry 3: S:3304-3315 and R:1011.
- Entry 4: R:1027, S:3262-3286, S:3336-3341, S:3347-3355, S:3365-3373, S:3375.
- Entry 5: R:1057-1065, S:3408-3449, S:3454, S:3476-3495, S:3510.
- Entry 6: S:3545-3548, S:3566, S:3586-3591, S:3596, S:3609-3624, S:3629-3640, S:3643, S:3651, S:3662-3680, S:3688-3696, S:3701-3729, S:3774-3787, S:3800-3881, S:3885-3945.
- Entries 7, 13 and 14: S:3970, S:2934 (inner JOIN, N+1 document queries) and S:2987.
- Entry 8: R:1139, R:1161, S:1542, S:1562, S:1567-1585, S:1588, S:1644-1676.
- Entries 9-12: R:1182, R:1226, R:1271, R:1314. S:1800, S:1805, S:1918 (before COMMIT at S:1951), S:2048-2062, S:2094-2118, S:2159-2169. S:2224-2231, S:2238-2250, S:2341-2345. S:2400-2405, S:2441-2474, S:2478-2482.
- B1, B2, B3, B4, B5, B7, B8, B10 and B11 all match the code.
- Env var and fallback URL: S:1705 and the other lines of the grep.

## Not lost in the rewrite
Domain terms, the stage list, the status list with its source, and the Flags, Dead and Unclear sections are all present. Old claims on entries 1-14 are all still present.

## Minor omissions (not counted as missing; optional)
1. The FE gates differently from the API. DynamicApprovalPanel `canSubmit` requires `!is_locked` and `canVote` has no admin bypass (DynamicApprovalPanel.jsx:83-112, comment at :106-107). So B14 (admin vote) and B15 (locked `rejected` submit) are API-only paths, not UI-reachable. Adding this would help calibrate severity.
2. The gate returns on the first match (R:147, 150, 154-155). A file owner whose email also equals primary_contact_email, or who is the vendor user, gets isVendor and not isOwner. PUT approval-chain and the manager and chain flows keyed on isOwner can then 403 at the route. Edge case.
3. The legacy `/approve` as owner on a `vendor_accepted` agreement (vendor_approved_at set by vendor-action) takes the "other side approved" branch at S:1377 and sets `fully_approved` plus a lock. This skips manager and governance. Entry 1 and B12 imply it but do not say it.
4. Chain rejection (S:3688-3696) clears is_locked but leaves locked_at and vendor/owner approved fields unchanged. This is a small detail.
