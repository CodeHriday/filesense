# VAP - Vendor agreement approval workflow

All paths are under the repo root. R = backend/routes/vendorAgreementRoutes.js, S = backend/services/vendorAgreementService.js, N = backend/services/VendorAgreementNotificationService.js.

## Summary

Three approval mechanisms coexist on `vendor_agreements.approval_status`:

1. Legacy dual approval (vendor + owner): `/approve`, `/reject` (R:895, R:944).
2. Three-stage workflow (vendor, manager, governance): `/vendor-action`, `/manager-action`, `/manager-handle-rejection`, `/manager-handle-governance-rejection`, `/governance-action`.
3. Configurable N-step approval chain (max 5 steps, per-step quorum): `/approval-chain` GET/PUT, `/submit-for-approval`, `/step-decision`, `/step-decisions`.

Plus read-only history endpoints `/approvals` and `/changes`. The frontend chooses the panel by whether `approval_chain_config.steps` is non-empty: DynamicApprovalPanel if so, otherwise ThreeStageApprovalPanel (src/pages/VendorAgreements.jsx:3125-3149). `/approve` and `/reject` are called from VendorAgreements.jsx:1498, 1524.

Allowed `approval_status` values (DB CHECK): draft, pending_vendor_acceptance, vendor_accepted, vendor_rejected, pending_manager_approval, manager_approved, manager_rejected, pending_governance_approval, governance_approved, governance_rejected, fully_approved, rejected, changes_pending, pending_approval (backend/migrations/addApprovalChainToVendorAgreements.js:39-55). "Final approved" for downstream use is `governance_approved` or `fully_approved` (backend/utils/vendorAgreementApprovalStatus.js:7-10).

Shared gate for all 14 endpoints, `checkAgreementAccess` (R:105-177):
- `:id` must parse as int, else 400 `Invalid agreement ID` (R:107-111). Missing agreement gives 404 (R:115-117).
- Admin (`userHasAdminAccess`) is granted with isAdmin (R:138).
- Otherwise the user needs a relationship: `agreement.vendor_user_id === user.id` gives isVendor (R:147); `file_owner_user_id` gives isOwner (R:150); email equal to `primary_contact_email` or `secondary_contact_email` gives isVendor (R:154-155); listed in any chain step's `approver_user_ids` gives isChainApprover (R:159-166); `created_by` gives isCreator (R:169). Otherwise 403 `Access denied` (R:171).
- Permissions `vendor_agreements:approve` and `:read` are computed as flags only (R:125-126) and "do not grant access" (R:123).
- Internal errors give 500 `Failed to verify access` (R:175).
- Not in this list: manager_contact email and governance_manager_user_id (see Flags).

## Entry points

### 1. POST /api/vendor-agreements/:id/approve (R:895)
- Trigger: UI "approve" (VendorAgreements.jsx:1498). Legacy dual approval.
- Who: passes the gate, then needs hasApprovePermission, isAdmin, isVendor or isOwner, else 403 (R:901-903).
- Input: body `comments`, `approver_type`. If admin or hasApprovePermission, `approver_type` must be `vendor` or `owner`, else 400 (R:908-913). Otherwise it is derived: isVendor gives vendor, isOwner gives owner (R:914-917).
- Service `approveAgreement` (S:1279), one transaction:
  - Service authorization is skipped only if `isAdmin` (S:1306). For vendor: `vendors.vendor_user_id` equals user, or user email equals primary or secondary contact (S:1309-1322). For owner: `file_owner_user_id` equals user (S:1330).
  - A second approval of the same type gives the error "already approved" (S:1336-1342). The agreement status is NOT checked.
  - Inserts `vendor_agreement_approvals` with action 'approved', `agreement_version`, ip, user agent (S:1345).
  - Sets `vendor_approved_at/by` or `owner_approved_at/by`. If the other side is already approved, status becomes `fully_approved`, `is_locked = true`, `locked_at` set, and a `vendor_agreement_changes` row of type 'locked' ("Agreement locked after dual approval") is written (S:1357-1404). Otherwise status becomes `vendor_approved` or `owner_approved`.
- Output: `{success, approvalStatus, fullyApproved, isLocked}`. Errors give 400 with the message (R:936).
- No emails or in-app notifications.

### 2. POST /api/vendor-agreements/:id/reject (R:944)
- Same gate as /approve. `comments` required, else 400 (R:954). `approver_type` rules as /approve.
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
- Blocked if `is_locked` and not admin (S:3368), or if status is `pending_approval` (S:3371, applies to admins too).
- Side effect: UPDATE `approval_chain_config` (JSON) and `updated_at` (S:3375). No audit row.
- Output: `{success, approval_chain_config}`. All errors give 400.

### 5. POST /api/vendor-agreements/:id/submit-for-approval (R:1053)
- Who: admin, owner, approve-permission holder, or `created_by === user.id` (R:1057-1065). Service re-checks: admin, `file_owner_user_id` or `created_by` (S:3421). Note: hasApprovePermission passes the route but fails the service unless the user is also owner or creator.
- Service `submitForApprovalChain` (S:3390), transaction with `SELECT ... FOR UPDATE`:
  - Requires `approval_chain_config` present, else error "No approval chain configured..." (S:3408). Re-validates the config (S:3413).
  - Allowed current statuses: draft, pending_vendor_acceptance, vendor_rejected, manager_rejected, governance_rejected, rejected (S:3416). Otherwise "Cannot submit for approval in current status".
  - Sets status `pending_approval`, `current_approval_step = 1`, `version = version + 1` (S:3429-3437). The version bump gives each round distinct decisions.
  - Inserts an approvals row: approver_type 'manager', action 'approved', comment 'Submitted for configurable approval chain', stage 'chain_submission', new version (S:3442-3449).
  - In-app notification `vendor_contract_approval_requested` to each step-1 approver (S:3454). Observers (`additional_stakeholder_user_ids`) not in step 1 get `vendor_contract_status_update` (S:3476-3495). The `includes` check is strict, so a string id would be notified twice.
  - After commit, fire-and-forget email `sendChainStepApprovalRequest` (S:3510).
- Output: `{success, message, approval_status:'pending_approval', current_approval_step:1}`. Errors give 400.

### 6. POST /api/vendor-agreements/:id/step-decision (R:1086)
- multipart: `action` (`approve` or `reject`), `comments`, `documents[]` (max 5). Upload filter: extensions .zip .gz .7z .pdf .txt .doc .docx .xls .xlsx; limit 10 MB per file (R:82-98). The memory-storage multer error handler `handleMulterError` is defined (R:22) but is not attached to this route.
- Who: any user passing the gate. The route has no role check. The service requires the caller to be a configured approver of the current step (comparison via `parseInt`), or admin (S:3586-3591).
- Validation: action in [approve, reject] (S:3545); comments required for reject (S:3548). Status must be `pending_approval` (S:3566). The config and step must exist.
- Process (S:3544+), transaction with row lock:
  - Round start = MAX(`approval_timestamp`) of approvals with stage 'chain_submission' (S:3596).
  - Lazy version bump: if decisions exist for the current version older than the round start, the version is incremented (S:3609-3624).
  - Duplicate vote within the round gives "You have already submitted your decision for this step" (S:3629-3640). DB UNIQUE (agreement_id, step_number, approver_user_id, agreement_version) (migration:73).
  - Inserts into `vendor_approval_step_decisions` (S:3643). Inserts an audit row in `vendor_agreement_approvals`, approver_type 'manager', stage `chain_step_<n>` (S:3651). Documents are stored as base64 in `vendor_agreement_documents.file_path` (S:3664-3680).
  - Reject: status becomes `rejected`, `current_approval_step = NULL`, `is_locked = false` (S:3688-3696). Notifies file owner, creator and stakeholders except the rejecter, type `vendor_contract_rejected` (S:3701-3729). Email `sendChainRejected`. One rejection by any approver ends the chain regardless of `require_all`.
  - Approve, quorum: `require_all` true means every configured approver has an approve decision in this round; false means at least 1 approve (S:3778-3780). If not met, commits and returns `quorum_met:false` with a message "N more approval(s) required". With `require_all` false the quorum is always met after one approval, so that branch is unreachable for it.
  - Not last step: `current_approval_step + 1`, notify next-step approvers and observers, email (S:3800-3881).
  - Last step (`currentStep >= steps.length`): status `fully_approved`, `is_locked = true`, `locked_at`, a 'locked' change row ("...configurable approval chain completed"), notifications `vendor_contract_approved_final` to owner, creator and stakeholders (the approver is not excluded), and email `sendChainFullyApproved` (S:3885-3945).
- Output: `{success, message, approval_status, current_approval_step, quorum_met}`. Errors give 400.

### 7. GET /api/vendor-agreements/:id/step-decisions (R:1114)
- Gate only. `getStepDecisions` (S:3970): all decisions for the agreement joined to users, ORDER BY step_number, decided_at. Across all versions and rounds, with no round filter. Output `{success, decisions}`. Errors give 500 `Failed to fetch step decisions`.

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
- resubmit: `manager_approved`, notifies governance manager. send-to-vendor: `pending_vendor_acceptance`, clears vendor and owner approvals, notifies `vendor_approved_by`. close: status `rejected`, `is_locked = true`, `locked_at`.
- Approvals row actions: close = 'revoked', send-to-vendor = 'rejected', resubmit = 'approved'. No ip or user agent is recorded.

### 12. POST /api/vendor-agreements/:id/governance-action (R:1306)
- Who: route: admin or `agreement.governance_manager_user_id === user.id` (R:1314). Service: same (S:2405).
- `governanceApproveReject` (S:2377): action approve or reject; status must be `manager_approved`; reject needs comments.
- Approve: `governance_approved`, `is_locked = true`, `locked_at`, and a 'locked' change row ("Agreement locked after governance approval"). Reject: `governance_rejected`, `is_locked = false`, `locked_at = NULL`.
- Notifies `vendor_approved_by`, `owner_approved_by`, `file_owner_user_id` (types `vendor_contract_approved_final` or `vendor_contract_rejected_governance`). Emails `sendGovernanceApprovalNotification` or `sendGovernanceRejectionNotification`.
- Output `{success, approvalStatus, approvalId, isLocked, fullyApproved}`.

### 13. GET /api/vendor-agreements/:id/approvals (R:1352)
- Gate only. `getApprovalHistory` (S:2934): approvals joined to users (inner JOIN), newest first, each with its documents (metadata only, not file content). Documents are fetched with one query per approval (N+1). Errors give 500.

### 14. GET /api/vendor-agreements/:id/changes (R:1369)
- Gate only. `getChangeHistory` (S:2987): `vendor_agreement_changes` joined to users, newest first. Errors give 500.

## Data touched
- `vendor_agreements`: approval_status, current_approval_step, approval_chain_config (JSON), version, is_locked, locked_at, vendor_approved_at/by, owner_approved_at/by, governance_manager_user_id, manager_contact, additional_stakeholder_user_ids/group_ids.
- `vendor_agreement_approvals`, `vendor_approval_step_decisions` (migration:62), `vendor_agreement_documents` (file content as base64 in `file_path`), `vendor_agreement_changes`, `notifications`, `vendors` (vendor_user_id), `users`.
- Env: `APP_URL`, default 'https://your-app-url.replit.app' (S:1705 and others).
- Emails go through N, via `getEmailProvider` (N:339).

## Flags

SECURITY
- S1. vendor-action: `isAdmin = req.isAdmin || req.hasApprovePermission` is passed to the service (R:1161), which skips the vendor-identity check for such users (S:1567). Any user associated with the agreement (e.g. creator or chain approver) holding `vendor_agreements:approve` can accept or reject as vendor.
- S2. The gate does not grant access to the designated manager (`manager_contact` email) or governance manager (`governance_manager_user_id`) unless they also match another relationship (R:138-169). Those stage routes can return 403 before their own check. UNCLEAR whether other paths make them associated.
- S3. Manager routes authorize by `user.email === manager_contact` (R:1182) but the service by `file_owner_user_id` (S:1805, 2053, 2229). Different identities.
- S4. Approval documents are stored as base64 in a DB column (S:1613). The extension allow-list is on the filename only, with no content check (R:87-97). The error text says 10 KB (R:26, R:81) while the limit is 10 MB (R:85). `handleMulterError` is not applied to approval routes.
- S5. step-decisions, approvals, changes and approval-chain GET expose all approver details (username, email, comments) to anyone passing the gate, including a vendor contact.
- S6. approve/reject use non-parameterised interpolation of `newStatus` into SQL (S:1365 etc.), but the value is a hard-coded literal, so not exploitable.

BUG
- B1. `/approve` and `/reject` (legacy) do not check the current `approval_status`. An agreement in `pending_approval` or `governance_approved` can be rejected (status set to 'rejected', but `is_locked` is not cleared and approver timestamps remain) (S:1504).
- B2. `managerHandleGovernanceRejection`: the route lets admins through (R:1271) but the service has no admin bypass (S:2229), so admins get 400 unless they are file owner. It also uses a stale `req.agreement` with no lock (S:2213).
- B3. PUT approval-chain and submit-for-approval: the route allows hasApprovePermission holders, but the service rejects them unless they are admin or owner/creator (S:3365, 3421). The route returns 400 rather than 403.
- B4. `managerApproveReject` rejection emails are sent before COMMIT (S:1900-1949) using the transaction client, and the status-reset query reads uncommitted state. If the commit later failed, emails may already have been queued (async, not awaited).
- B5. The quorum "N more approval(s) required" message gives 0 for `require_all=false` (unreachable, S:3785-3787).
- B6. Step-decision observer check uses strict `includes(observerId)` on ids that may be strings (S:3480, 3838), while elsewhere `parseInt` is used. Could double-notify.
- B7. Final-approval notification list does not exclude the actor, unlike the rejection list (S:3706 vs 3907).
- B8. `vendorAcceptReject` does not allow status `vendor_rejected`, but `managerHandleVendorRejection` resets to `pending_vendor_acceptance` first, so that path still works (S:1562).
- B9. A manager approving after `governance_rejected` (S:1800) overwrites `owner_approved_at`. Intent: UNCLEAR.
- B10. Versioning: `submitForApprovalChain` bumps `version` on every submission (S:3433), which also changes the version recorded for legacy approvals. The lazy bump in recordStepDecision (S:3609) is a compatibility hack.
- B11. Fallback agreement URL is a placeholder 'https://your-app-url.replit.app' (several, e.g. S:1705).

DUPLICATE
- D1. Three approval mechanisms (legacy dual, three-stage, N-step chain) all write `approval_status`, `is_locked` and the approvals table. Final states differ: `fully_approved` is produced by both legacy dual approval (S:1364) and the chain (S:3886); `governance_approved` only by three-stage (S:2441). `isFinalApprovedAgreementStatus` treats both as final.
- D2. Vendor authorization (vendor_user_id or primary/secondary contact email) is copy-pasted in approveAgreement, rejectAgreement and vendorAcceptReject.
- D3. Documents mapping and insert are copy-pasted across five routes and five service methods. The chain step-decision stores documents with a separate code path (S:3662).
- D4. Notification and email block is duplicated per action. The `status` strings `pending_manager_approval` and `pending_governance_approval` exist in the CHECK constraint but nothing in this area writes them. Overlapping stakeholder emails and in-app notifications cover the same events.

DEAD
- DE1. `pending_manager_approval`, `pending_governance_approval`, `owner_approved`-then-flow status consumers: statuses `pending_manager_approval` and `pending_governance_approval` are never written by the code read (grep not run across the whole repo beyond this area).
- DE2. `handleMulterError` (R:22) is defined, not used on these routes. Upload config `upload`/`templateUpload` are for schemas, not this area.
- DE3. Route flags `isChainApprover` and `isCreator` (R:165, 169) are set but not read by any approval route code in R:895-1386.

UNCLEAR
- U1. Whether the legacy `/approve`/`/reject` are still reachable in practice. The UI still calls them (VendorAgreements.jsx:1498, 1524); the conditions under which it does were not traced.
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
2. Who writes `pending_manager_approval` and `pending_governance_approval` (outside this area)?
3. Intended behaviour if an agreement is rejected by legacy `/reject` while in a chain (B1).
4. Is the stated 10 KB document limit intended or the 10 MB value (S4)?
5. Which email provider and what recipients N `getStakeholders` (N:32) resolves in each notification; not traced here.
6. Does ThreeStageApprovalPanel/DynamicApprovalPanel call `/approvals`, `/changes`, `/step-decisions`? Not traced beyond the endpoints listed in grep.
7. How do the frontend components decide who sees which buttons (ApprovalChainConfig.jsx, panels)? Frontend rules were not read in full.
