# VAP - Vendor agreement approval workflow

All paths are under the repo root. R = backend/routes/vendorAgreementRoutes.js, S = backend/services/vendorAgreementService.js, N = backend/services/VendorAgreementNotificationService.js.

## Summary

Three approval mechanisms coexist on `vendor_agreements.approval_status`:

1. Legacy dual approval (vendor + owner): `/approve`, `/reject` (R:895, R:944).
2. Three-stage workflow (vendor, manager, governance): `/vendor-action`, `/manager-action`, `/manager-handle-rejection`, `/manager-handle-governance-rejection`, `/governance-action`.
3. Configurable N-step approval chain (max 5 steps, per-step quorum): `/approval-chain` GET/PUT, `/submit-for-approval`, `/step-decision`, `/step-decisions`.

Plus read-only history endpoints `/approvals` and `/changes`. The frontend chooses the panel by whether `approval_chain_config.steps` is non-empty: DynamicApprovalPanel if so, otherwise ThreeStageApprovalPanel (src/pages/VendorAgreements.jsx:3125-3149). `handleApprove` and `handleReject` (VendorAgreements.jsx:1493, :1514) call `/approve` and `/reject` (lines 1498, 1524) but are defined and never called by any code in src/, so the legacy endpoints are not reachable from the current UI. The frontend loads approvals, changes and step_decisions from `GET /api/vendor-agreements/:id/full` (VendorAgreements.jsx:261-268), not from `/approvals`, `/changes` or `/step-decisions`; no FE code calls GET approval-chain either (ApprovalChainConfig.jsx:156 calls only PUT approval-chain).

Allowed `approval_status` values (DB CHECK): draft, pending_vendor_acceptance, vendor_accepted, vendor_rejected, pending_manager_approval, manager_approved, manager_rejected, pending_governance_approval, governance_approved, governance_rejected, fully_approved, rejected, changes_pending, pending_approval (backend/migrations/addApprovalChainToVendorAgreements.js:39-55). "Final approved" for downstream use is `governance_approved` or `fully_approved` (backend/utils/vendorAgreementApprovalStatus.js:7-10).

Shared gate for all 14 endpoints, `checkAgreementAccess` (R:105-177):
- `:id` must parse as int, else 400 `Invalid agreement ID` (R:107-111). Missing agreement gives 404 (R:115-117).
- Admin (`userHasAdminAccess`) is granted with isAdmin (R:138).
- Otherwise the user needs a relationship: `agreement.vendor_user_id === user.id` gives isVendor (R:147); `file_owner_user_id` gives isOwner (R:150); email equal to `primary_contact_email` or `secondary_contact_email` gives isVendor (R:154-155); listed in any chain step's `approver_user_ids` gives isChainApprover (R:159-166); `created_by` gives isCreator (R:169). Otherwise 403 `Access denied` (R:171).
- Permissions `vendor_agreements:approve` and `:read` are computed as flags only (R:125-126) and "do not grant access" (R:123).
- Internal errors give 500 `Failed to verify access` (R:175).
- Not in this list: manager_contact email and governance_manager_user_id (see Flags).

Multer error handler: `router.use(handleMulterError)` at R:2244 is a trailing error middleware, so it handles errors passed on by every earlier route in this router, including the `approvalDocUpload` routes. `handleMulterError` (R:22-43): `LIMIT_FILE_SIZE` gives 413 with "File too large. Maximum file size is 10 KB for approval documents." (the text says 10 KB, the configured limit is 10 MB, R:85); `LIMIT_FILE_COUNT` gives 400 "Too many files. Maximum 5 documents allowed per submission."; any other MulterError gives 400 with `err.message`; any other error with a message (including the file-extension filter error, R:95) gives 400 with that message; otherwise `next(err)`.

## Entry points

### 1. POST /api/vendor-agreements/:id/approve (R:895)
- Trigger: `handleApprove` (VendorAgreements.jsx:1493, calls at :1498) exists but nothing in src/ calls it. Legacy dual approval; not reachable from the current UI.
- Who: passes the gate, then needs hasApprovePermission, isAdmin, isVendor or isOwner, else 403 (R:901-903).
- Input: body `comments`, `approver_type`. If admin or hasApprovePermission, `approver_type` must be `vendor` or `owner`, else 400 (R:908-913). Otherwise it is derived: isVendor gives vendor, isOwner gives owner (R:914-917).
- Service `approveAgreement` (S:1279), one transaction:
  - Service authorization is skipped only if `isAdmin` (S:1306). For vendor: `vendors.vendor_user_id` equals user, or user email equals primary or secondary contact (S:1309-1322). For owner: `file_owner_user_id` equals user (S:1330).
  - A second approval of the same type gives the error "already approved" (S:1336-1342). The agreement status is NOT checked.
  - Inserts `vendor_agreement_approvals` with action 'approved', `agreement_version`, ip, user agent (S:1345).
  - Sets `vendor_approved_at/by` or `owner_approved_at/by`. If the other side is already approved, status becomes `fully_approved`, `is_locked = true`, `locked_at` set, and a `vendor_agreement_changes` row of type 'locked' ("Agreement locked after dual approval") is written (S:1357-1404). Otherwise status becomes `vendor_approved` (S:1369) or `owner_approved` (S:1384). Those two values are not in the current `vendor_agreements_approval_status_check` list (see Summary and BUG B12), so that write fails.
- Output: `{success, approvalStatus, fullyApproved, isLocked}`. Errors give 400 with the message (R:936).
- No emails or in-app notifications.

### 2. POST /api/vendor-agreements/:id/reject (R:944)
- Same gate as /approve. Not called by the UI (`handleReject`, VendorAgreements.jsx:1514, is never called). `comments` required, else 400 (R:954). `approver_type` rules as /approve.
- Service `rejectAgreement` (S:1434): same authorization as approve (S:1465-1492). Inserts an approvals row with action 'rejected'. Sets `approval_status = 'rejected'` (S:1504). Does not clear `vendor_approved_at` or `owner_approved_at`, and does not check the current status.
- Output: `{success, approvalStatus: 'rejected'}`.

### 3. GET /api/vendor-agreements/:id/approval-chain (R:1004)
- Who: anyone passing the gate. Calls `getApprovalChainConfig` (S:3291).
- Output: `{success, approval_chain_config, current_approval_step, approval_status, step_decisions}`. `step_decisions` is only loaded when status is `pending_approval` and a current step exists, filtered to the current step and current `version`, ordered by `decided_at` ASC (S:3304-3315).
- Errors: 404 only if the message is exactly 'Agreement not found', else 500 (R:1011).

### 4. PUT /api/vendor-agreements/:id/approval-chain (R:1022)
- Who: route requires isAdmin, isOwner or hasApprovePermission, else 403 (R:1027). Service then requires admin or `file_owner_user_id === userId` (S:3365). The route passes only `isAdmin` (R:1038).
- Input: body `{steps:[{name, approver_user_ids:[int], require_all:bool}]}`. Validation `_validateChainConfig` (S:3262-3286): body must be an object; `steps` a non-empty array; max 5 steps ("A maximum of 5 approval steps is supported"); each step has a non-empty `approver_user_ids` of positive integers (strict `Number.isInteger`, so numeric strings are rejected at save); `require_all` must be boolean.
- Normalisation (S:3336-3341): `step_number` is 1-based, `name` defaults to `Step N`, ids are cast with `Number`.
- All approver ids must exist in `users`, else error "Approver user IDs not found" (S:3347-3355).
- Order of checks: validation (S:3332) and the "approver ids exist" query (S:3347-3355) run before the owner/admin check (S:3365) and the locked check (S:3368). A caller who will fail the owner/admin check but passed the route check therefore gets validation or "ids not found" errors first, which reveals which user ids exist.
- Blocked if `is_locked` and not admin (S:3368), or if status is `pending_approval` (S:3371, applies to admins too).
- Side effect: UPDATE `approval_chain_config` (JSON) and `updated_at` (S:3375). No audit row.
- Output: `{success, approval_chain_config}`. All errors give 400.

### 5. POST /api/vendor-agreements/:id/submit-for-approval (R:1053)
- Who: admin, owner, approve-permission holder, or `created_by === user.id` (R:1057-1065). A hasApprovePermission holder skips the created_by check at the route. Service re-checks: admin, `file_owner_user_id` or `created_by` (S:3421). Note: hasApprovePermission passes the route but fails the service unless the user is also owner or creator.
- Service `submitForApprovalChain` (S:3390), transaction with `SELECT ... FOR UPDATE`:
  - Requires `approval_chain_config` present, else error "No approval chain configured..." (S:3408). Re-validates the config (S:3413).
  - Allowed current statuses: draft, pending_vendor_acceptance, vendor_rejected, manager_rejected, governance_rejected, rejected (S:3416). Otherwise "Cannot submit for approval in current status".
  - Sets status `pending_approval`, `current_approval_step = 1`, `version = version + 1` (S:3429-3437). The version bump gives each round distinct decisions. The UPDATE does not touch `vendor_approved_*`, `owner_approved_*`, `is_locked` or `locked_at` (S:3429-3437). A `rejected` agreement that was closed by manager "close" has `is_locked = true` (S:2341-2345); submit is allowed from `rejected`, so it can enter `pending_approval` still locked.
  - Inserts an approvals row: approver_type 'manager', action 'approved', comment 'Submitted for configurable approval chain', stage 'chain_submission', new version (S:3442-3449).
  - In-app notification `vendor_contract_approval_requested` to each step-1 approver (S:3454). Observers (`additional_stakeholder_user_ids`) not in step 1 get `vendor_contract_status_update` (S:3476-3495). The `includes` check at S:3480 is strict. See B6 for when this matters.
  - After commit, fire-and-forget email `sendChainStepApprovalRequest` (S:3510).
- Output: `{success, message, approval_status:'pending_approval', current_approval_step:1}`. Errors give 400.

### 6. POST /api/vendor-agreements/:id/step-decision (R:1086)
- multipart: `action` (`approve` or `reject`), `comments`, `documents[]` (max 5). Upload filter: extensions .zip .gz .7z .pdf .txt .doc .docx .xls .xlsx; limit 10 MB per file (R:82-98). Upload errors reach the trailing `handleMulterError` (R:2244): oversize file gives 413 with the text "Maximum file size is 10 KB" (wrong text, limit is 10 MB), more than 5 files gives 400, a disallowed extension gives 400 with "Allowed types: PDF, Word (.doc/.docx), Excel (.xls/.xlsx), ZIP" (R:22-43, R:95).
- Who: any user passing the gate. The route has no role check. The route returns 400 "action is required (approve or reject)" if `action` is missing, before the service call (R:1091-1093). The service requires the caller to be a configured approver of the current step (comparison via `parseInt`), or admin (S:3586-3591). An admin who is not a configured approver can vote.
- Validation: action in [approve, reject] (S:3545); comments required for reject (S:3548). Status must be `pending_approval` (S:3566). The config and step must exist.
- Process (S:3544+), transaction with row lock:
  - Round start = MAX(`approval_timestamp`) of approvals with stage 'chain_submission' (S:3596).
  - Lazy version bump: if decisions exist for the current version older than the round start, the version is incremented (S:3609-3624).
  - Duplicate vote within the round gives "You have already submitted your decision for this step" (S:3629-3640). DB UNIQUE (agreement_id, step_number, approver_user_id, agreement_version) (migration:73).
  - Inserts into `vendor_approval_step_decisions` (S:3643). Inserts an audit row in `vendor_agreement_approvals`, approver_type 'manager', stage `chain_step_<n>` (S:3651). Documents are stored as base64 in `vendor_agreement_documents.file_path` (S:3664-3680).
  - Reject: status becomes `rejected`, `current_approval_step = NULL`, `is_locked = false` (S:3688-3696). Notifies file owner, creator and stakeholders except the rejecter, type `vendor_contract_rejected` (S:3701-3729). Email `sendChainRejected`. One rejection by any approver ends the chain regardless of `require_all`.
  - Approve, quorum: `require_all` true means every configured approver has an approve decision in this round; false means at least 1 approve (S:3774-3780). `approvedUserIds` is built from all approve decisions in the round, including an admin's who is not a configured approver (S:3774). So with `require_all` false, one admin vote advances or finalises the step; with `require_all` true an admin vote adds nothing to the `every` check over configured approvers (S:3779). If not met, commits and returns `quorum_met:false` with a message "N more approval(s) required". With `require_all` false the quorum is always met after one approval, so that branch is unreachable for it.
  - Not last step: `current_approval_step + 1`, notify next-step approvers and observers, email (S:3800-3881).
  - Last step (`currentStep >= steps.length`): status `fully_approved`, `is_locked = true`, `locked_at`, a 'locked' change row ("...configurable approval chain completed"), notifications `vendor_contract_approved_final` to owner, creator and stakeholders (the approver is not excluded), and email `sendChainFullyApproved` (S:3885-3945).
- Output: `{success, message, approval_status, current_approval_step, quorum_met}`. Errors give 400.

### 7. GET /api/vendor-agreements/:id/step-decisions (R:1114)
- Gate only. `getStepDecisions` (S:3970): all decisions for the agreement joined to users, ORDER BY step_number, decided_at. Across all versions and rounds, with no round filter. Output `{success, decisions}`. Errors give 500 `Failed to fetch step decisions`. Not called by the FE (which uses `/:id/full`).

### 8. POST /api/vendor-agreements/:id/vendor-action (R:1133)
- multipart `action` (`accept` or `reject`), `comments`, `documents[]`.
- Who: route requires isVendor, isAdmin or hasApprovePermission, else 403 (R:1139). The service gets `isAdmin = req.isAdmin || req.hasApprovePermission` (R:1161), so its own vendor authorization is bypassed for approve-permission holders.
- Documents are mapped to `{name, path: base64, type:'approval_document', ...}` (R:1144-1151).
- `vendorAcceptReject` (S:1536): action must be accept or reject (S:1542). Status must be one of draft, pending_vendor_acceptance, manager_rejected, changes_pending (S:1562); note `vendor_rejected` is not allowed. Non-admin must be the vendor user or a primary/secondary contact (S:1568-1585). Reject requires comments (S:1588).
- Writes: approvals row (approver_type 'vendor', stage 'vendor_acceptance'); documents into `vendor_agreement_documents`. Accept sets status `vendor_accepted`, `vendor_approved_at/by`. Reject sets `vendor_rejected` and clears `vendor_approved_at/by`.
- Notifications: accept notifies `file_owner_user_id` (`vendor_contract_pending_manager`); reject notifies the owner (`vendor_contract_rejected_vendor`) (S:1644-1676). Emails via `sendVendorAcceptanceNotification` or `sendVendorRejectionNotification` after commit (S:1683-1757).
- Output `{success, approvalStatus, approvalId}`. Errors give 400.

### 9. POST /api/vendor-agreements/:id/manager-action (R:1176)
- Who: route: admin or `req.user.email === req.agreement.manager_contact` (R:1182). Service: admin or `file_owner_user_id === userId` (S:1805).
- `managerApproveReject` (S:1777): action approve or reject; status must be `vendor_accepted` or `governance_rejected` (S:1800); reject needs comments.
- Writes: approvals row (approver_type 'manager', stage 'manager_approval'); documents. Approve sets `manager_approved` and `owner_approved_at/by`. Reject sets `manager_rejected` and clears `owner_approved_at/by`.
- Notifications: approve notifies `governance_manager_user_id` (`vendor_contract_pending_governance`); reject notifies `vendor_approved_by` (`vendor_contract_rejected_manager`) and emails stakeholders via `sendManagerRejectionNotification` (the call is made before COMMIT, S:1918). Approve emails via `sendManagerApprovalNotification` after commit.
- Output `{success, approvalStatus, approvalId}`.

### 10. POST /api/vendor-agreements/:id/manager-handle-rejection (R:1220)
- Who: same route check as 9; service: admin or file owner (S:2053).
- `managerHandleVendorRejection` (S:2025): action `send-to-vendor` or `override-and-approve`; status must be `vendor_rejected`; comments required. Approvals row action is stored as 'revoked' (send) or 'approved' (override) "to satisfy the check constraint" (S:2062), stage `send_to_vendor` or `manager_override`.
- send-to-vendor: status `pending_vendor_acceptance`, clears vendor approval. Notifies `vendor_approved_by`, else the latest vendor approver in history, else the user matching `primary_contact_email` (S:2094-2118).
- override-and-approve: status `manager_approved`, sets BOTH vendor and owner approved fields to the manager's id (S:2159-2169). Notifies the governance manager. No email.

### 11. POST /api/vendor-agreements/:id/manager-handle-governance-rejection (R:1264)
- Who: route as 9. Service has no admin bypass: requires `agreement.file_owner_user_id === approverUserId` (S:2229). Takes the agreement from `req.agreement` (loaded at the middleware), with no re-read or row lock.
- `managerHandleGovernanceRejection` (S:2213): action `resubmit`, `close` or `send-to-vendor`; status must be `governance_rejected`; comments required.
- resubmit: `manager_approved`, notifies governance manager. send-to-vendor: `pending_vendor_acceptance`, clears vendor and owner approvals, notifies `vendor_approved_by`. close: status `rejected`, `is_locked = true`, `locked_at` (S:2341-2345).
- Approvals row actions: close = 'revoked', send-to-vendor = 'rejected', resubmit = 'approved'. No ip or user agent is recorded.

### 12. POST /api/vendor-agreements/:id/governance-action (R:1306)
- Who: route: admin or `agreement.governance_manager_user_id === user.id` (R:1314). Service: same (S:2405).
- `governanceApproveReject` (S:2377): action approve or reject; status must be `manager_approved`; reject needs comments.
- Approve: `governance_approved`, `is_locked = true`, `locked_at`, and a 'locked' change row ("Agreement locked after governance approval"). Reject: `governance_rejected`, `is_locked = false`, `locked_at = NULL`.
- Notifies `vendor_approved_by`, `owner_approved_by`, `file_owner_user_id` (types `vendor_contract_approved_final` or `vendor_contract_rejected_governance`). The list is built at S:2478-2482 with only a null/undefined filter and no deduplication, so the same user gets 2 or 3 notifications when ids coincide (e.g. `owner_approved_by` equal to `file_owner_user_id`, or `vendor_approved_by`). Emails `sendGovernanceApprovalNotification` or `sendGovernanceRejectionNotification`.
- Output `{success, approvalStatus, approvalId, isLocked, fullyApproved}`.

### 13. GET /api/vendor-agreements/:id/approvals (R:1352)
- Gate only. `getApprovalHistory` (S:2934): approvals joined to users (inner JOIN), newest first, each with its documents (metadata only, not file content). Documents are fetched with one query per approval (N+1). Errors give 500. Not called by the FE.

### 14. GET /api/vendor-agreements/:id/changes (R:1369)
- Gate only. `getChangeHistory` (S:2987): `vendor_agreement_changes` joined to users, newest first. Errors give 500. Not called by the FE.

## Email recipients and provider (N)
- `getStakeholders` (N:32-152) resolves: primary and secondary contact email; `manager_contact` (treated as a raw email, role "Vendor Manager"); the governance manager user; `additional_stakeholder_user_ids`; members of `additional_stakeholder_group_ids`. The last two are restricted to `users.internal_user = true`. Deduplicated by lowercase email. Vendor contacts (external) are included. File owner and creator are not included unless they are also stakeholders.
- Chain emails: step requests go to the step's approvers (`_getStepApproverEmails`, internal_user only, N:1426-1433). `sendChainFullyApproved` and `sendChainRejected` use `getStakeholders`, so chain approvers receive them only if also stakeholders.
- Email provider: `default_email_connection_id` setting, else the first active email-type `storage_connections` row (N:339-372).

## Data touched
- `vendor_agreements`: approval_status, current_approval_step, approval_chain_config (JSON), version, is_locked, locked_at, vendor_approved_at/by, owner_approved_at/by, governance_manager_user_id, manager_contact, additional_stakeholder_user_ids (JSONB array, backend/migrations/addAdditionalStakeholdersToVendorAgreements.js:24)/group_ids.
- `vendor_agreement_approvals`, `vendor_approval_step_decisions` (migration:62), `vendor_agreement_documents` (file content as base64 in `file_path`), `vendor_agreement_changes`, `notifications`, `vendors` (vendor_user_id), `users`.
- Env: `APP_URL`, default 'https://your-app-url.replit.app' (S:1705 and others).
- Emails go through N, via `getEmailProvider` (N:339).

## Flags

SECURITY
- S1. vendor-action: `isAdmin = req.isAdmin || req.hasApprovePermission` is passed to the service (R:1161), which skips the vendor-identity check for such users (S:1567). Any user associated with the agreement (e.g. creator or chain approver) holding `vendor_agreements:approve` can accept or reject as vendor.
- S2. The gate does not grant access to the designated manager (`manager_contact` email) or governance manager (`governance_manager_user_id`) unless they also match another relationship (R:138-169). Those stage routes can return 403 before their own check. UNCLEAR whether other paths make them associated.
- S3. Manager routes authorize by `user.email === manager_contact` (R:1182) but the service by `file_owner_user_id` (S:1805, 2053, 2229). Different identities. The FE agrees with the route: ThreeStageApprovalPanel decides the manager by `currentUser.email === agreement.manager_contact`, case-insensitive (ThreeStageApprovalPanel.jsx:47-48, 61-63), so a manager_contact who is not the file owner is shown manager buttons and the service rejects them.
- S4. Approval documents are stored as base64 in a DB column (S:1613). The extension allow-list is on the filename only, with no content check (R:87-97). The oversize error text says 10 KB (R:26, R:81) while the limit is 10 MB (R:85). `handleMulterError` is attached (R:2244) and returns 413 with the wrong 10 KB text.
- S5. step-decisions, approvals, changes and approval-chain GET expose all approver details (username, email, comments) to anyone passing the gate, including a vendor contact.
- S6. approve/reject use non-parameterised interpolation of `newStatus` into SQL (S:1365 etc.), but the value is a hard-coded literal, so not exploitable.
- S7. PUT approval-chain runs validation and the user-id existence query before the owner/admin check (S:3332-3355 vs 3365), so a caller who will be denied can still learn which user ids exist.

BUG
- B1. `/approve` and `/reject` (legacy) do not check the current `approval_status`. An agreement in `pending_approval` or `governance_approved` can be rejected (status set to 'rejected', but `is_locked` is not cleared and approver timestamps remain) (S:1504).
- B2. `managerHandleGovernanceRejection`: the route lets admins through (R:1271) but the service has no admin bypass (S:2229), so admins get 400 unless they are file owner. It also uses a stale `req.agreement` with no lock (S:2213).
- B3. PUT approval-chain and submit-for-approval: the route allows hasApprovePermission holders, but the service rejects them unless they are admin or owner/creator (S:3365, 3421). The route returns 400 rather than 403.
- B4. `managerApproveReject` rejection emails are sent before COMMIT (S:1900-1949) using the transaction client, and the status-reset query reads uncommitted state. If the commit later failed, emails may already have been queued (async, not awaited).
- B5. The quorum "N more approval(s) required" message gives 0 for `require_all=false` (unreachable, S:3785-3787).
- B6. Step-decision observer check uses strict `includes(observerId)` (S:3480, 3838) against `approver_user_ids`, whose ids are saved as numbers (S:3278, S:3339), while the authorization check uses `parseInt` (S:3586-3587). `observerId` comes from `additional_stakeholder_user_ids`, a JSONB array (migration addAdditionalStakeholdersToVendorAgreements.js:24) that the service stores from the request without element type checks (S:997-1004), so the element type depends on what the client sends. If an observer id is a string, the check does not match and the user would get both the approver and the observer notification. Whether strings occur in practice was not checked.
- B7. Final-approval notification list does not exclude the actor, unlike the rejection list (S:3706 vs 3907).
- B8. `vendorAcceptReject` does not allow status `vendor_rejected`, but `managerHandleVendorRejection` resets to `pending_vendor_acceptance` first, so that path still works (S:1562).
- B9. A manager approving after `governance_rejected` (S:1800) overwrites `owner_approved_at`. Intent: UNCLEAR.
- B10. Versioning: `submitForApprovalChain` bumps `version` on every submission (S:3433), which also changes the version recorded for legacy approvals. The lazy bump in recordStepDecision (S:3609) is a compatibility hack.
- B11. Fallback agreement URL is a placeholder 'https://your-app-url.replit.app' (several, e.g. S:1705).
- B12. Legacy `approveAgreement` sets `approval_status` to `vendor_approved` (S:1369) or `owner_approved` (S:1384) when only one side has approved. Neither value is in `vendor_agreements_approval_status_check` (addApprovalChainToVendorAgreements.js:39-55; the repair migration has the same list; addGovernanceWorkflow.js:45, 57 migrates them away). The first legacy approval therefore fails with a constraint violation, returned as 400, unless the other side was already approved. Only the "second approval gives fully_approved" path can succeed.
- B13. `getStakeholders` runs `return;` (N:147) when the additional-stakeholder group-members query fails, so it returns `undefined` instead of the stakeholder list. Callers read `stakeholders.length` (e.g. N:564, N:1533), throw inside their own try, and the email is silently skipped.
- B14. An admin who is not a configured approver can vote in a chain (S:3589), and the vote counts toward `approvedUserIds` (S:3774), so one admin vote meets quorum when `require_all` is false.
- B15. Submitting a chain does not clear `is_locked` or `locked_at` (S:3429-3437), and is allowed from `rejected`, including a `rejected` set by manager "close" which sets `is_locked = true` (S:2341-2345). A closed, locked agreement can enter `pending_approval` while still locked.
- B16. Governance-action notifications are not deduplicated (S:2478-2482). See entry 12.

DUPLICATE
- D1. Three approval mechanisms (legacy dual, three-stage, N-step chain) all write `approval_status`, `is_locked` and the approvals table. Final states differ: `fully_approved` is produced by both legacy dual approval (S:1364) and the chain (S:3886); `governance_approved` only by three-stage (S:2441). `isFinalApprovedAgreementStatus` treats both as final.
- D2. Vendor authorization (vendor_user_id or primary/secondary contact email) is copy-pasted in approveAgreement, rejectAgreement and vendorAcceptReject.
- D3. Documents mapping and insert are copy-pasted across five routes and five service methods. The chain step-decision stores documents with a separate code path (S:3662).
- D4. Notification and email block is duplicated per action. Overlapping stakeholder emails and in-app notifications cover the same events.

DEAD
- DE1. `pending_manager_approval` and `pending_governance_approval` are dead enum values: a repo-wide grep (excluding node_modules and extraction) finds them only in migrations (addGovernanceWorkflow.js:70-73, addApprovalChainToVendorAgreements.js:45-48 and 132-135, repairApprovalStatusConstraintForApprovalChain.js:18-21) and the prod schema SQL CHECK. No code writes them and the frontend never references them.
- DE2. `upload` and `templateUpload` (R:46, R:64) are for schemas/templates, not this area. (`handleMulterError` is attached at R:2244; see Summary.)
- DE3. Route flags `isChainApprover` and `isCreator` (R:165, 169) are set but not read by any approval route code in R:895-1386.
- DE4. `/approve` and `/reject` are not called from the UI: `handleApprove` and `handleReject` (VendorAgreements.jsx:1493, :1514) are defined and never called. Combined with B12, the legacy approve path is mostly non-functional.

UNCLEAR
- U1. Whether anything outside src/ (API clients, scripts) calls legacy `/approve`/`/reject`. Not found in the frontend.
- U2. Comments on the 'approved' action for 'manager' type when the chain is submitted (S:3446): the submission is recorded as an 'approved' action by 'manager'.

## Domain terms
- Vendor agreement / contract / `agreement_code` / `file_name` (contract label).
- Dual approval: vendor approval plus owner approval. Owner = "file owner" = `file_owner_user_id` = "Vendor Manager" (the code comments use all three, e.g. R:189, S:1645).
- Vendor user / vendor contact (primary and secondary contact email).
- Manager (`manager_contact`, `owner_approved_*`), Governance manager (`governance_manager_user_id`).
- Three-stage workflow: vendor_acceptance, manager_approval, governance_approval.
- Approval chain / configurable chain / N-step; step, quorum, `require_all`.
- Stakeholders / observers (`additional_stakeholder_user_ids`).
- Locked (`is_locked`); round (a submission cycle); `agreement_version`.
- Approval stages: vendor_acceptance, manager_approval, send_to_vendor, manager_override, resubmit_to_governance, close_agreement, governance_approval, chain_submission, chain_step_N.

## Open questions
1. Where are `manager_contact` and `governance_manager_user_id` set, and are those users guaranteed another relationship so they pass the gate (S2)?
2. Intended behaviour if an agreement is rejected by legacy `/reject` while in a chain (B1).
3. Is the stated 10 KB document limit intended or the 10 MB value (S4)?
4. Do `additional_stakeholder_user_ids` ever hold string ids in stored data (B6)?
5. `/:id/full` supplies approvals, changes and step_decisions to the FE (VendorAgreements.jsx:261-268). Its gate and payload belong to another area and are not documented here.
6. Frontend panel rules traced only partly: ThreeStageApprovalPanel (manager by `manager_contact` email, governance manager by `governance_manager_user_id` at line 51, vendor by `currentUser.vendor_id === agreement.vendor_id` at line 42); DynamicApprovalPanel (lines 68-110: String compare on owner and created_by for canSubmit, hasVoted for canVote). Other components were not read in full.

Closed (answers): `pending_manager_approval`/`pending_governance_approval` are never written (DE1). Email recipients and provider are in "Email recipients and provider". Panels do not call `/approvals`, `/changes`, `/step-decisions` (Summary).
