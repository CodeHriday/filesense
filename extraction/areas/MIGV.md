# MIGV - Schema migrations: vendor / audit / alerting

Paths are relative to the repo root. Coverage is partial: see Open questions for files not read.

## Summary
- Migrations are DDL/data scripts under `backend/migrations/`. Two run paths exist: (a) startup `migrationTracker.runOnce(name, fn)` in `server.js:5886-5945`, and (b) manual `node <file>` guarded by `require.main === module` (35 files, e.g. `createAuditTables.js:288`, `createVendorManagement.js:224`).
- Startup-run MIGV migrations: `createVendorUsersTable` (server.js:5914), `addVendorIdToUsers` (:5915), `migrateVendorConnectionDirection` (:5917), `addSubProjectToVendorAgreements` (:5920), `createVendorAgreementFileSchemas` (:5921), `migrateVendorAgreementSchemasToFileSchemas` (:5922), `addSLAMonitoringToVendorAgreements` (:5931), `addVendorSLAToAlertScope` (:5932), `createAllowedEmailDomains` (:5935), `createDigestTables` (:5941), `addApprovalChainToVendorAgreements` (:5942), `repairApprovalStatusConstraintForApprovalChain` (:5943), `bridgeVendorAdministrationPermissions` (:5945).
- The following were found by Grep to have no caller in any .js file, so they only run if someone runs them by hand: `createVendorManagement`, `enhanceVendorManagement`, `addGovernanceWorkflow`, `addConnectionToVendorAgreements`, `removeConnectionFromVendors`, `createAuditTables`, `addAuditRetentionAndArchive`, `createImmutableAuditLedger`, `createJobDependencyTables`, `createProgrammaticUploadTables`, `createEmailAlertingSystem`.
- Rules live mostly in CHECK constraints, defaults and role-permission seeding. No business logic runs in these files beyond status remapping.

## Entry points

### 1. Vendor core tables - `createVendorManagement.js` (CLI only, :224)
- Trigger: `node` by hand. Auth: none (DB env credentials). Inputs: none.
- Creates `vendors` (status CHECK `active|inactive|suspended`, default `active`, :39), `vendor_agreements` (approval_status default `draft`, CHECK `draft|pending_approval|vendor_approved|owner_approved|fully_approved|rejected|changes_pending` :81-83; `is_locked` default FALSE :90; `version` default 1 :94; status CHECK `active|inactive|archived` :97; UNIQUE `agreement_code` :105), `vendor_agreement_approvals` (approver_type CHECK `vendor|owner` :117; action CHECK `approved|rejected|revoked` :121), `vendor_agreement_changes` (change_type CHECK `created|updated|schema_changed|reopened|locked|unlocked` :142).
- Comment says lock happens "after dual approval" (:89).

### 2. Vendor enrichment - `enhanceVendorManagement.js` (CLI only, :142)
- Adds vendor onboarding date (default CURRENT_TIMESTAMP :19), vendor_type, primary/secondary contact columns (:40-52), and agreement columns `contains_pii` default FALSE, `data_classification` CHECK `Public|Private|Confidential` or NULL, `retention_days`, `expected_arrival_time`, `delivery_method`, `target_file_path` (:59-66).

### 3. Three-stage governance workflow - `addGovernanceWorkflow.js` (CLI only, :271)
- Transaction. Inserts role `Governance Manager` ("Responsible for final approval of vendor contracts") ON CONFLICT (name) DO NOTHING (:19-21).
- Adds `governance_manager_user_id`, `governance_approved_at`, `governance_approved_by` (:28-30).
- Remaps data: `vendor_approved`->`vendor_accepted`, `pending_approval`->`pending_vendor_acceptance`, `owner_approved`->`manager_approved` (:42-58); `approver_type` `owner`->`manager` (:93-95).
- New approval_status set (:65-78): draft, pending_vendor_acceptance, vendor_accepted, vendor_rejected, pending_manager_approval, manager_approved, manager_rejected, pending_governance_approval, governance_approved, governance_rejected, fully_approved, rejected, changes_pending. New approver_type set: `vendor|manager|governance_manager` (:103). Adds `approval_stage` VARCHAR(50) (:110).
- Creates `vendor_agreement_documents` (:116) and `notifications` (:141) (columns not read).
- down(): restores old constraints (:232, :246) and deletes the role (:253) without remapping data back (see BUG).

### 4. Approval chain - `addApprovalChainToVendorAgreements.js` (startup server.js:5942; CLI :159)
- Adds `approval_chain_config` JSONB and `current_approval_step` INTEGER, both default NULL (:25-26).
- Recreates approval_status CHECK with the 13 governance statuses plus `pending_approval` (:39-55).
- Creates `vendor_approval_step_decisions`: action CHECK `approve|reject` (:67), UNIQUE (agreement_id, step_number, approver_user_id, agreement_version) so a user votes once per step per version (:73), FK cascade on agreement and user.

### 5. Approval status repair - `repairApprovalStatusConstraintForApprovalChain.js` (startup server.js:5943; exports `up` only)
- Transaction. Aborts with `Unsupported vendor agreement approval statuses found: ...` if any row has a status outside the 14-value list (:42-54); otherwise drops and recreates `vendor_agreements_approval_status_check` with the same 14 values (:58-70).
- Status list quoted from file head (the first values are lines 1-19, not read); lines 20-27 show manager_rejected through pending_approval.

### 6. Vendor SLA monitoring - `addSLAMonitoringToVendorAgreements.js` (startup :5931; CLI :189)
- Adds to `vendor_agreements`: `sla_enabled` BOOLEAN default false (:30), `frequency_pattern` VARCHAR(50) (:41), `arrival_time` VARCHAR(10) (:52), `arrival_days` TEXT (:63), `alert_threshold_minutes` INTEGER default 60 (:74). Each guarded by an existence check (not read in detail).
- Creates `vendor_sla_violations` (:83-98): `expected_arrival_time` NOT NULL, `alert_sent` default false, `resolved` default false, `delay_minutes`, FK to agreement ON DELETE CASCADE. Partial indexes on `sla_enabled = true`, `resolved = false`, `alert_sent = false` (:103-125).

### 7. SLA in alert scope - `addVendorSLAToAlertScope.js` (startup :5932; no CLI)
- Drops and recreates `alert_policies_entity_type_check` as `IN ('job','mapping_group','workflow','schedule','vendor_sla')` (:19-27); partial index on `(entity_type, entity_id) WHERE entity_type='vendor_sla' AND enabled = true` (:32-36); adds `alert_events.vendor_sla_violation_id` FK to `vendor_sla_violations(id)` ON DELETE SET NULL (:42-45) and a partial index (:51-54).
- See BUG on column names.

### 8. Audit tables - `createAuditTables.js` (CLI only, :288)
- Creates `audit_log` (BIGSERIAL `audit_id`; `user_id`, `ip_address` INET, `action_type`/`entity_type`/`entity_id` NOT NULL, old/new/changes JSONB, `retention_until`) :12-44; `execution_audit` (:66); `data_access_log` (:113); `config_change_history` (:161); `security_audit_log` (:204). Remaining columns of the last four not read.
- SSL rule used by CLI runners: if `PGHOST` contains `neon.tech`, then `rejectUnauthorized:false` in `NODE_ENV` development/test, else `rejectUnauthorized:true` (:261-266 here; same pattern in `addAuditRetentionAndArchive.js:319-325`, `createImmutableAuditLedger.js:210`, `createJobDependencyTables.js:230`). Without neon.tech: `ssl:false`.

### 9. Audit retention and archive - `addAuditRetentionAndArchive.js` (CLI only, :344)
- Creates `audit_retention_settings`: `retention_days` default 30, `auto_archive_enabled` default TRUE, `auto_delete_enabled` default FALSE, `last_archive_run`, `last_cleanup_run` (:12-21). Seeds `(30, TRUE, FALSE)` with `ON CONFLICT DO NOTHING` (:26-28).
- Creates archive tables `audit_log_archive` (:35), `execution_audit_archive` (:83), `data_access_log_archive` (:127), `config_change_history_archive` (:172), `security_audit_log_archive` (:212), and `frontend_audit_log` (:253).

### 10. Immutable audit ledger - `createImmutableAuditLedger.js` (CLI only, :235)
- `audit_ledger` (:13-61): BIGSERIAL id, `entry_id` UUID unique default `gen_random_uuid()`, `tenant_id` default `'default'`, `action_category` default `'EXECUTION'`, `log_level` default `'INFO'`, `sequence_number` BIGINT NOT NULL, `prev_hash`/`record_hash` VARCHAR(64) (record_hash NOT NULL), `signature`, `source_system` default `'data_observatory'`, `version` default `'1.0'`. 8 indexes (:66-88).
- `audit_ledger_sequence` per-tenant counter (`current_sequence` default 0, `last_hash`) seeded with tenant `'default'` (:92-105). `audit_ledger_verification` records verification runs (`status` VARCHAR(20) with no CHECK) (:109-137).
- Immutability: BEFORE UPDATE and BEFORE DELETE triggers raise `Audit ledger entries are immutable and cannot be updated` / `...cannot be deleted` (:141-180). TRUNCATE is not blocked.
- Hash algorithm is stated only in comments (SHA-256, :186-189); computation code is in the ledger service (not in this area's migration).

### 11. Email alerting schema - `createEmailAlertingSystem.js` (exported; no caller, no CLI)
- `alert_policies` (:13-48): `scope` CHECK `job|mapping_group|workflow|schedule`; `trigger_type` CHECK `success|failure|both`; `grouping` default `'none'` CHECK `none|by_parent|digest`; `grouping_window_minutes` default 60; `include_violations` default true; `max_attachment_size_mb` default 10; `is_active` default true; `email_connection_id` INTEGER FK `storage_connections(id)`; `failover_connection_ids` INTEGER[].
- `alert_policy_recipients` (:54-70): `recipient_type` CHECK `user|distribution_list|external`; UNIQUE (policy_id, email); notify_on_success/failure default true.
- `alert_runs` (:76-107): `run_id` unique; `status` CHECK `pending|sent|failed|retrying`; `retry_count` default 0.
- `alert_events` (:113-144), `alert_aggregation` (:150-173; status CHECK `collecting|ready|processing|completed`, default `collecting`; UNIQUE aggregation_key), `alert_attachments` (:179-).

### 12. Digest tables - `createDigestTables.js` (startup :5941; no CLI)
- `digest_subscriptions` (:13-27): `frequency` CHECK `hourly|daily|weekly|monthly`; `categories` default `["all"]`; `recipients` default `[]`; `name` default `'My Digest'`; `send_if_empty` default false; `is_active` default true; `email_connection_id` VARCHAR FK `storage_connections(connection_id)` ON DELETE SET NULL; timestamps are `TIMESTAMP WITH TIME ZONE`.
- `email_digests` (:33-42): `status` CHECK `sent|failed|skipped`; FK cascade on subscription.
- Indexes: user, `next_send_at WHERE is_active = true`, `(subscription_id, sent_at DESC)` (:46-58).

### 13. Allowed email domains - `createAllowedEmailDomains.js` (startup :5935; no CLI)
- Table `allowed_email_domains`: `domain` UNIQUE NOT NULL, `is_active` default true, `created_by` FK users; partial index on domain where active (:12-27). No seed rows.

### 14. Programmatic upload tables - `createProgrammaticUploadTables.js` (exports `up`/`down`, no caller)
- `api_tokens` (:19-37): `token_hash` UNIQUE, `token_prefix`, `scopes` default `[]`, `rate_limit` default 100, `rate_window_hours` default 1, `is_active` default true, `expires_at`, revoked_at/by.
- `upload_batches` (:59-79): `batch_id` unique; `status` default `'pending'` (no CHECK); counters default 0.
- `upload_files` (:101-129): `file_id` unique; `status` default `'pending'`; `phase` default `'uploaded'`; `virus_scan_status`, `virus_scan_result`, `catalog_file_id`, `etl_job_id`.
- `upload_file_records` (:156-165). `down()` drops all four CASCADE (:190-193).
- Note: the API area (extraction/areas/API.md:74) treats these as the live tables, but nothing here runs them.

### 15. Job dependency tables - `createJobDependencyTables.js` (CLI only, :257)
- `job_dependencies` with `no_self_dependency` CHECK (:28); `job_group_schedules` with `schedule_type IN (cron, interval, manual)` and `execution_order IN (parallel, sequential, dependency-based)` (:64-65); `job_group_dependencies` with `dependency_type IN (all_success, any_success, all_complete)` (:96); `dbt_models` (`model_type` staging|intermediate|mart|snapshot|seed; `materialization` table|view|incremental|ephemeral) (:140-141); `dbt_executions` (status pending|running|success|failed|cancelled; trigger_type manual|scheduled|api|dependency) (:195-196).

### 16. Vendor connection migrations
- `addConnectionToVendorAgreements.js` (CLI :?; has `require.main`): adds `vendor_agreements.vendor_connection_id` VARCHAR FK `storage_connections(connection_id)` ON DELETE SET NULL and `drop_location_path` VARCHAR(500) (:19-20); down drops them (:55-56).
- `removeConnectionFromVendors.js` (CLI): drops those same two columns (:19-20) and its down re-adds them (:46-47). The two files are inverses.
- `migrateVendorConnectionDirection.js` (startup :5917): for `storage_connections` of `type='vendor'` with NULL/empty `connection_direction`: set `'source'` if referenced by `vendor_agreements.vendor_connection_id` (:22-41); set `'target'` if referenced by `vendor_agreements.target_connection_id`, only when that column exists (:44-74); every remaining one defaults to `'source'` (:80-98).
- `fixSourceConnectionIdForVendorConnections.js` (CLI): replaces `transformation_mappings_source_exclusivity` CHECK (:19-34; down :63-76). Constraint body not read.
- `vendorConnectionsMigration.js` (no `require.main` hit): inserts `projects` (:80) and `storage_connections` rows (:92); down only comments out a DELETE (:143-148). Not read in detail.

### 17. Vendor users - `createVendorUsers.js` and `addVendorIdToUsers.js` (startup :5914-5915)
- `vendor_users` table with an updated_at trigger (:18, :65-67). `users.vendor_id` INTEGER FK `vendors(id)` ON DELETE SET NULL (:36), followed by an UPDATE that backfills (`UPDATE users u`, :44; join condition not read).

### 18. Permission bridge - `bridgeVendorAdministrationPermissions.js` (startup :5945)
- Reads every row of `roles` (id, name, permissions), `permissions` is treated as an array of strings or `{name}` objects (:45-50).
- Retired-to-current mapping (:4-8): `vendor_users:*`->`users:*`, `vendor_roles:*`->`roles:*`, `vendor_connections:*`->`connection:*`.
- Fixed additions (:10-22): `Vendor Manager` gets `connection:read`, `connection:write`, `users:read`, `users:write`, `sla_monitoring:read`; `Governance Manager` gets `connection:read`, `sla_monitoring:read`.
- Writes `UPDATE roles SET permissions = $1` with the existing list plus additions only if some are missing (:56-62). Old retired permissions are kept, not removed. Logs `updatedRoles`.

## Data touched
- Vendor: `vendors`, `vendor_agreements`, `vendor_agreement_approvals`, `vendor_agreement_changes`, `vendor_agreement_documents`, `vendor_approval_step_decisions`, `vendor_sla_violations`, `vendor_users`, `users.vendor_id`, `roles`, `notifications`, `storage_connections`.
- Audit: `audit_log` (+ 4 siblings and 5 `_archive` tables), `frontend_audit_log`, `audit_retention_settings`, `audit_ledger`, `audit_ledger_sequence`, `audit_ledger_verification`.
- Alerting: `alert_policies`, `alert_policy_recipients`, `alert_runs`, `alert_events`, `alert_aggregation`, `alert_attachments`, `digest_subscriptions`, `email_digests`, `allowed_email_domains`.
- Upload / jobs: `api_tokens`, `upload_batches`, `upload_files`, `upload_file_records`, `job_dependencies`, `job_group_schedules`, `job_group_dependencies`, `dbt_models`, `dbt_executions`.

## Flags

### DUPLICATE
- D1. `vendor_agreements_approval_status_check` is dropped and recreated in four places with different value sets: `createVendorManagement.js:81`, `addGovernanceWorkflow.js:64`, `addApprovalChainToVendorAgreements.js:39` and `repairApprovalStatusConstraintForApprovalChain.js:65`. The last two have the same 14 values (the repair adds a data check first).
- D2. Alert schema defined twice: `createEmailAlertingSystem.js` (this area) and the prod dump described in extraction/areas/ALRT.md:3, with different columns.
- D3. SSL-config boilerplate for the neon.tech host is copied into at least four CLI runners (see entry 8).
- D4. `addConnectionToVendorAgreements.js` and `removeConnectionFromVendors.js` add and remove the same two columns.
- D5. Permission seeding for Vendor Manager / Governance Manager also exists in MIG (see extraction/areas/MIG.md:86).

### BUG
- B1. `addVendorSLAToAlertScope.js:19-27, 35` constrains `alert_policies.entity_type` and filters on `enabled`, but `createEmailAlertingSystem.js` defines the columns `scope` and `is_active` and no `entity_type` or `enabled`. If the table is built from that migration, this startup migration would fail (`column does not exist`). It works only if the live table matches the prod dump. Cannot confirm which; see Open questions.
- B2. `createEmailAlertingSystem.js:31` types `email_connection_id` as INTEGER FK `storage_connections(id)`; `createDigestTables.js:20` uses VARCHAR FK `storage_connections(connection_id)` for the same concept.
- B3. `addAuditRetentionAndArchive.js:26-28`: `ON CONFLICT DO NOTHING` on a table whose only unique key is the SERIAL id, so every re-run inserts another default settings row.
- B4. `addGovernanceWorkflow.js` down (:225-249) restores the old CHECKs without remapping rows back, so rows with new values (e.g. `manager_approved`, `governance_manager`) make the ADD CONSTRAINT fail.
- B5. `createVendorManagement.js:89` comments "locked after dual approval" while `addGovernanceWorkflow.js` moves to three stages; whether lock logic follows is outside this area.

### DEAD
- DE1. Never invoked by any JS file: `createEmailAlertingSystem.js` (no `require.main` either), `createProgrammaticUploadTables.js` (exports `up`/`down` only), `createAuditTables.js`, `addAuditRetentionAndArchive.js`, `createImmutableAuditLedger.js`, `createJobDependencyTables.js`, `createVendorManagement.js`, `enhanceVendorManagement.js`, `addGovernanceWorkflow.js`, `addConnectionToVendorAgreements.js`, `removeConnectionFromVendors.js`. They matter only if the live DB was built by hand-running them. Which tables exist in a fresh database is therefore not determined by startup code.
- DE2. `createAllowedEmailDomains.js` and `createDigestTables.js` have no CLI guard; usable only via server startup.

### SECURITY
- S1. `createImmutableAuditLedger.js` triggers do not block TRUNCATE, and a superuser or table owner can drop the triggers; immutability is DB-level only (:149-178). Stated as observation.
- S2. The CLI runners accept `rejectUnauthorized:false` for neon.tech whenever `NODE_ENV` is development or test (e.g. `addAuditRetentionAndArchive.js:320-322`). When `PGHOST` is not a neon.tech host, SSL is off entirely.
- S3. `bridgeVendorAdministrationPermissions.js:51-62` grants `users:write` to every role named `Vendor Manager` at startup, and does not remove retired permissions.
- S4. `api_tokens` stores `token_hash` and `token_prefix` (:22-23); hash algorithm not in this file.

### UNCLEAR
- U1. `audit_ledger_verification.status` (:119) and `upload_*.status` columns have no CHECK; permitted values come from code outside this area.
- U2. `vendorConnectionsMigration.js` creates projects and connections (:80, :92); intent and trigger not read.

## Domain terms
- Approval statuses: `vendor_approved` / `vendor_accepted`; `owner_approved` / `manager_approved`; `pending_approval` / `pending_vendor_acceptance` (old vs new names for the same step, addGovernanceWorkflow.js:42-58). `owner` approver == `manager` approver.
- Approval chain: configurable steps (`approval_chain_config`, `current_approval_step`), distinct from the fixed three-stage flow.
- Governance Manager, Vendor Manager: role names. Agreement version (`agreement_version`, `version`).
- Alert `scope` vs `entity_type` (same concept under different names in different schemas). `alert_run` = one sent email; `alert_event` = individual job event; `grouping` none/by_parent/digest.
- Ledger vs audit log: `audit_ledger` (hash chained, immutable) vs `audit_log` (mutable, with retention and archive). `frontend_audit_log` is separate.
- `connection_direction` source|target; `vendor_connection_id` / `drop_location_path`.
- Digest vs alert: `digest_subscriptions` are per-user scheduled summaries.

## Open questions
1. Is the live `alert_policies` built from `createEmailAlertingSystem.js` or from the prod dump? B1 depends on it.
2. How do `createVendorManagement`, `createAuditTables`, `createImmutableAuditLedger` and `createProgrammaticUploadTables` get applied in a new environment (not in `runOnce`, no npm script found in the files searched)? `package.json` scripts and `.replit` were not read for this.
3. Whether `server.js` or `.github/workflows` call the CLI migrations (only .js/.json/.yml/.md names were grepped, with no hits besides server.js).
4. Contents not read: first 19 lines of `repairApprovalStatusConstraintForApprovalChain.js`, `vendor_agreement_documents` and `notifications` columns, `execution_audit`..`security_audit_log` columns, `alert_events`/`alert_attachments` tail, `createVendorUsers.js` columns, `addVendorIdToUsers.js` backfill join, `createVendorAgreementFileSchemas.js`, `migrateVendorAgreementSchemasToFileSchemas.js`, `addSubProjectToVendorAgreements.js`, `createJobDependencyTables.js` columns outside CHECKs, `vendorConnectionsMigration.js`, `fixSourceConnectionIdForVendorConnections.js` constraint body, `create_vendor_file_profiling_table.sql`, `addVendorAgreementToTransformations.js`, `addProjectToVendorAgreements.js`, `addManagerContactToVendorAgreements.js`, `addAdditionalStakeholdersToVendorAgreements.js`, `addUnifiedConnectionFields.js`, `connectionNameUniqueConstraint.js`.
5. Whether `down` functions are ever invoked (no runner seen).
