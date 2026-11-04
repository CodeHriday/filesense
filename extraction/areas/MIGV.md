# MIGV - Schema migrations: vendor / audit / alerting

Paths are relative to the repo root. Coverage is partial: see Open questions for files not read.

## Summary
- Migrations are DDL/data scripts under `backend/migrations/`. Two run paths exist: (a) startup `migrationTracker.runOnce(name, fn)` in `server.js:5886-5945`, and (b) manual `node <file>` guarded by `require.main === module` (35 files, e.g. `createAuditTables.js:288`, `createVendorManagement.js:224`). Nothing in the repo (package.json, .replit, workflows, shell scripts) invokes a migration.
- Startup-run MIGV migrations: `createVendorUsersTable` (server.js:5914), `addVendorIdToUsers` (:5915), `migrateVendorConnectionDirection` (:5917), `addSubProjectToVendorAgreements` (:5920), `createVendorAgreementFileSchemas` (:5921), `migrateVendorAgreementSchemasToFileSchemas` (:5922), `addSLAMonitoringToVendorAgreements` (:5931), `addVendorSLAToAlertScope` (:5932), `createAllowedEmailDomains` (:5935), `createDigestTables` (:5941), `addApprovalChainToVendorAgreements` (:5942), `repairApprovalStatusConstraintForApprovalChain` (:5943), `bridgeVendorAdministrationPermissions` (:5945).
- Further vendor-adjacent startup migrations in the same block: `addConnectionNameUniqueConstraint` (:5916), `addUnifiedConnectionFields` (:5918), `alterDocumentFilePathToText` (:5944); see entries 19-21.
- The following were found by Grep to have no caller in any .js file, so they only run if someone runs them by hand: `createVendorManagement`, `enhanceVendorManagement`, `addGovernanceWorkflow`, `addConnectionToVendorAgreements`, `removeConnectionFromVendors`, `createAuditTables`, `addAuditRetentionAndArchive`, `createImmutableAuditLedger`, `createJobDependencyTables`, `createProgrammaticUploadTables`, `createEmailAlertingSystem`, plus seven more: `vendorConnectionsMigration`, `fixSourceConnectionIdForVendorConnections`, `addVendorAgreementToTransformations`, `addProjectToVendorAgreements`, `addManagerContactToVendorAgreements`, `addAdditionalStakeholdersToVendorAgreements` and `create_vendor_file_profiling_table.sql`.
- Rules live mostly in CHECK constraints, defaults and role-permission seeding. No business logic runs in these files beyond status remapping.
- Startup error handling: all `runOnce` calls sit in one try/catch (`server.js:5884-5956`). A failure is only logged (`:5953-5955`); the throw skips every later migration and the server keeps running on a partly migrated schema. The tracker records the failed run `success=false` and retries it next boot (`backend/utils/migrationTracker.js:100-103`: the catch calls `markExecuted(name, false, ...)`; `hasRun` filters on `success = true`, :47). Two untracked statements run on every boot: `ensureFileUploadPermissions(dbPool)` (:5948) and `ALTER TABLE transformation_jobs ADD COLUMN IF NOT EXISTS jira_issue_key VARCHAR(50)` (:5950). They sit after the last `runOnce`, so they are also skipped when an earlier migration throws.
- Fresh-database startup (inferred from the code, not run): `createVendorUsers.js:20` has `REFERENCES vendors(id)` and `createVendorAgreementFileSchemas.js:20` has `REFERENCES vendor_agreements(id)`. A grep of `CREATE TABLE` for `vendors` / `vendor_agreements` finds creators only in CLI-only migrations (`createVendorManagement.js`, `addGovernanceWorkflow.js`). On a fresh database `createVendorUsersTable` (`server.js:5914`) would therefore fail, and the single try/catch would skip every later `runOnce` (SLA, digest, approval-chain, bridge, etc.).
- A migration that returns early is recorded as a success: `migrateVendorAgreementSchemasToFileSchemas.js:25-29` commits and returns when `vendor_agreement_file_schemas` does not exist, and the tracker's success path (`migrationTracker.js:97`) records it, so the data copy is not retried (see entry 22).

## Entry points

### 1. Vendor core tables - `createVendorManagement.js` (CLI only, :224)
- Trigger: `node` by hand. Auth: none (DB env credentials). Inputs: none.
- Creates `vendors` (status CHECK `active|inactive|suspended`, default `active`, :39), `vendor_agreements` (approval_status default `draft`, CHECK `draft|pending_approval|vendor_approved|owner_approved|fully_approved|rejected|changes_pending` :81-83; `is_locked` default FALSE :90; `version` default 1 :94; status CHECK `active|inactive|archived` :97; UNIQUE `agreement_code` :105), `vendor_agreement_approvals` (approver_type CHECK `vendor|owner` :117; action CHECK `approved|rejected|revoked` :121), `vendor_agreement_changes` (change_type CHECK `created|updated|schema_changed|reopened|locked|unlocked` :142).
- Comment says lock happens "after dual approval" (:89).

### 2. Vendor enrichment - `enhanceVendorManagement.js` (CLI only, :142)
- Transaction (`BEGIN` :13).
- On `vendors` (not `vendor_agreements`): adds `vendor_onboarding_date` TIMESTAMP default CURRENT_TIMESTAMP and `vendor_type` VARCHAR(100) (:17-20).
- On `vendor_agreements`: `RENAME COLUMN file_creator TO vendor_department_team` (:25-28) and `RENAME COLUMN vendor_contact TO primary_contact_name` (:31-34). The renames have no IF EXISTS, so a second run fails (and rolls back).
- Adds primary/secondary contact columns (:38-53) and `contains_pii` default FALSE, `file_type`, `data_classification` CHECK `Public|Private|Confidential` or NULL, `domain`, `retention_days`, `expected_arrival_time`, `delivery_method`, `target_file_path` TEXT (:57-66).

### 3. Three-stage governance workflow - `addGovernanceWorkflow.js` (CLI only, :271)
- Transaction. Inserts role `Governance Manager` ("Responsible for final approval of vendor contracts") ON CONFLICT (name) DO NOTHING (:19-21).
- Adds `governance_manager_user_id`, `governance_approved_at`, `governance_approved_by` (:28-30).
- Remaps data: `vendor_approved`->`vendor_accepted`, `pending_approval`->`pending_vendor_acceptance`, `owner_approved`->`manager_approved` (:42-58); `approver_type` `owner`->`manager` (:93-95).
- New approval_status set (:65-78): draft, pending_vendor_acceptance, vendor_accepted, vendor_rejected, pending_manager_approval, manager_approved, manager_rejected, pending_governance_approval, governance_approved, governance_rejected, fully_approved, rejected, changes_pending. New approver_type set: `vendor|manager|governance_manager` (:103). Adds `approval_stage` VARCHAR(50) (:110).
- Creates `vendor_agreement_documents` (:116) and `notifications` (:141) (columns not read).
- down(): restores old constraints (:232, :246) and deletes the role (:253) without remapping data back (see BUG).

### 4. Approval chain - `addApprovalChainToVendorAgreements.js` (startup server.js:5942; CLI guard :159 is broken, see BUG B7)
- Adds `approval_chain_config` JSONB and `current_approval_step` INTEGER, both default NULL (:25-26).
- Recreates approval_status CHECK with the 13 governance statuses plus `pending_approval` (:39-55).
- Creates `vendor_approval_step_decisions`: action CHECK `approve|reject` (:67), UNIQUE (agreement_id, step_number, approver_user_id, agreement_version) so a user votes once per step per version (:73), FK cascade on agreement and user.
- `up(dbPool)` calls `dbPool.connect()` (:15-16); the CLI block calls `up()` with no argument (:160).

### 5. Approval status repair - `repairApprovalStatusConstraintForApprovalChain.js` (startup server.js:5943; exports `up` only)
- Transaction. Aborts with `Unsupported vendor agreement approval statuses found: ...` if any row has a status outside the 14-value list (:42-54); otherwise drops and recreates `vendor_agreements_approval_status_check` with the same 14 values (:58-70).
- The 14-value list is at lines 13-28 (same set as entry 4). The file header says some environments got the chain tables without the constraint update.

### 6. Vendor SLA monitoring - `addSLAMonitoringToVendorAgreements.js` (startup :5931; CLI :189)
- Adds to `vendor_agreements`: `sla_enabled` BOOLEAN default false (:30), `frequency_pattern` VARCHAR(50) (:41), `arrival_time` VARCHAR(10) (:52), `arrival_days` TEXT (:63), `alert_threshold_minutes` INTEGER default 60 (:74). Each guarded by an existence check (not read in detail).
- Creates `vendor_sla_violations` (:83-98): `expected_arrival_time` NOT NULL, `alert_sent` default false, `resolved` default false, `delay_minutes`, FK to agreement ON DELETE CASCADE. Partial indexes on `sla_enabled = true`, `resolved = false`, `alert_sent = false` (:103-125).
- down() (:160-172): `DROP TABLE IF EXISTS vendor_sla_violations` with no CASCADE (:161-163) and drops only `alert_threshold_minutes`, `arrival_days`, `frequency_pattern`, `sla_enabled` (:166-171); `arrival_time` is never dropped. See BUG B8.

### 7. SLA in alert scope - `addVendorSLAToAlertScope.js` (startup :5932; no CLI)
- Drops and recreates `alert_policies_entity_type_check` as `IN ('job','mapping_group','workflow','schedule','vendor_sla')` (:19-27); partial index on `(entity_type, entity_id) WHERE entity_type='vendor_sla' AND enabled = true` (:32-36); adds `alert_events.vendor_sla_violation_id` FK to `vendor_sla_violations(id)` ON DELETE SET NULL (:42-45) and a partial index (:51-54).
- The columns `entity_type` and `enabled` match prod `alert_policies`, not `createEmailAlertingSystem.js` (see B1).

### 8. Audit tables - `createAuditTables.js` (CLI only, :288)
- Creates `audit_log` (BIGSERIAL `audit_id`; `user_id`, `ip_address` INET, `action_type`/`entity_type`/`entity_id` NOT NULL, old/new/changes JSONB, `retention_until`) :12-44, including a self-referencing FK `parent_audit_id` (:32); `execution_audit` (:66); `data_access_log` (:113); `config_change_history` (:161); `security_audit_log` (:204). Remaining columns of the last four not read.
- SSL rule used by CLI runners: if `PGHOST` contains `neon.tech`, then `rejectUnauthorized:false` only when `NODE_ENV` is development or test, else `rejectUnauthorized:true` (:261-266 here; same pattern in `addAuditRetentionAndArchive.js:319-325`, `createImmutableAuditLedger.js:210`, `createJobDependencyTables.js:230`). Without neon.tech: `ssl:false`.

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
- Runs each statement through `query(...)` (:18 onward) with no BEGIN/COMMIT anywhere in the file (grep), so a mid-run failure leaves earlier tables created.
- Note: the API area (extraction/areas/API.md:74) treats these as the live tables, and prod has them (dump :4231, :6374, :6408, :6428), but nothing here runs them.

### 15. Job dependency tables - `createJobDependencyTables.js` (CLI only, :257)
- `job_dependencies` with `no_self_dependency` CHECK (:28); `job_group_schedules` with `schedule_type IN (cron, interval, manual)` and `execution_order IN (parallel, sequential, dependency-based)` (:64-65); `job_group_dependencies` with `dependency_type IN (all_success, any_success, all_complete)` (:96); `dbt_models` (`model_type` staging|intermediate|mart|snapshot|seed; `materialization` table|view|incremental|ephemeral) (:140-141); `dbt_executions` (status pending|running|success|failed|cancelled; trigger_type manual|scheduled|api|dependency) (:195-196).

### 16. Vendor connection migrations
- `addConnectionToVendorAgreements.js` (CLI, has `require.main`): adds `vendor_agreements.vendor_connection_id` VARCHAR FK `storage_connections(connection_id)` ON DELETE SET NULL and `drop_location_path` VARCHAR(500) (:17-20), plus index `idx_vendor_agreements_connection_id` (:25-27); down drops index and columns from `vendor_agreements` (:50-56). Header: "Moves vendor_connection_id and drop_location_path from vendors to vendor_agreements" (:3).
- `removeConnectionFromVendors.js` (CLI): drops `vendor_connection_id` and `drop_location_path` from `vendors` (not `vendor_agreements`) (:17-21). It is not the inverse of the file above: the two act on different tables and together move the columns from `vendors` to `vendor_agreements`. Neither file copies data between them. Prod `vendors` has neither column and `vendor_agreements` has both (dump :6796-6797).
- `migrateVendorConnectionDirection.js` (startup :5917): for `storage_connections` of `type='vendor'` with NULL/empty `connection_direction`: set `'source'` if referenced by `vendor_agreements.vendor_connection_id` (:22-41); set `'target'` if referenced by `vendor_agreements.target_connection_id`, only when that column exists (:44-74); every remaining one defaults to `'source'` (:80-98).
- `fixSourceConnectionIdForVendorConnections.js` (CLI; no caller): transaction. Drops `transformation_mappings_source_exclusivity` (:17-20), changes `transformation_mappings.source_connection_id` from INTEGER to VARCHAR(255) so vendor UUID strings fit (:23-28; header :2-3), then re-adds the CHECK: exactly one of `source_connection_id` / `vendor_agreement_id` is non-null (:31-38). down() casts back with `::INTEGER`, which fails if non-integer values exist (:66-70).
- `addVendorAgreementToTransformations.js` (no caller): adds `transformation_mappings.vendor_agreement_id` INTEGER FK `vendor_agreements(id)` ON DELETE SET NULL (:19-20), drops NOT NULL on `source_connection_id` (:26-27), adds `transformation_mappings_source_exclusivity` (:34-39) with no preceding DROP IF EXISTS, so a second run fails; index at :45. down() sets `source_connection_id` NOT NULL again (:88-89).
- `vendorConnectionsMigration.js` (no caller, no `require.main`): transaction. Reads the first active `drop_location_config` row (:19-21), builds a config object per provider (aws/gcp/azure) that includes the stored credential fields (`access_key_id`, `secret_access_key`, `service_account_json`, `account_key`; the code comments call them encrypted) (:27-55) and inserts it as `storage_connections.config` (JSON.stringify, :100) with `type='vendor'`, name `'Default Vendor Drop Location'`, status `'active'`, `connection_direction='drop'` (:91-104). Skips if a row with that type/direction/name exists (:58-63). Uses `drop_location_config.project_id`, else the project named `'Default Project'`, else inserts that project (:67-86). Creates index `idx_storage_connections_vendor_type` (:115-119). down() drops only the index; the DELETE is commented out (:143-150). The value `'drop'` is not handled by `migrateVendorConnectionDirection` (which only sets `source`/`target`).
- `addSubProjectToVendorAgreements.js` (startup :5920): skips if the column exists (information_schema check, :19); adds `sub_project_id` INTEGER FK `projects(id)` ON DELETE SET NULL (:34) and index `idx_vendor_agreements_sub_project_id` (:40).
- `addProjectToVendorAgreements.js` (no caller): transaction; adds `project_id` INTEGER FK `projects(id)` ON DELETE SET NULL (:19), backfills with `UPDATE vendor_agreements va` (:25; source `vendors.project_id`, :26), index `idx_vendor_agreements_project_id` (:35).

### 17. Vendor users - `createVendorUsers.js` and `addVendorIdToUsers.js` (startup :5914-5915)
- `vendor_users` table with an updated_at trigger (:18, :65-67); `vendor_id` FK uses ON DELETE CASCADE (`createVendorUsers.js:20`).
- `addVendorIdToUsers.js`: opens its own `new Pool({ connectionString: process.env.DATABASE_URL })` at require time (:4-6), no ssl option, and the pool is never closed anywhere in the file (no `pool.end` or `.end(` match). CLI guard at :81 calls the function and then `process.exit` (:86, :90). Transaction on one client. If `users.vendor_id` already exists it commits and returns (:23-31), which also skips the index step. Otherwise adds `users.vendor_id` INTEGER FK `vendors(id)` ON DELETE SET NULL (:34-37), backfills with `UPDATE users u SET vendor_id = v.id FROM vendors v WHERE u.id = v.vendor_user_id AND u.internal_user = false AND u.user_type = 'Vendor'` (:43-50), then creates `idx_users_vendor_id` (:55-57).

### 18. Permission bridge - `bridgeVendorAdministrationPermissions.js` (startup :5945)
- Reads every row of `roles` (id, name, permissions) (:45); `permissions` is used only if it is a JS array, else treated as empty (:49); entries may be strings or `{name}` objects (:24-26).
- Retired-to-current mapping (:4-8): `vendor_users:*`->`users:*`, `vendor_roles:*`->`roles:*`, `vendor_connections:*`->`connection:*`. It applies to any role (not just vendor roles) that holds a permission with those resource prefixes: the action is copied (e.g. `vendor_roles:write` -> `roles:write`) (:28-42, :51-54).
- Fixed additions (:10-22): `Vendor Manager` gets `connection:read`, `connection:write`, `users:read`, `users:write`, `sla_monitoring:read`; `Governance Manager` gets `connection:read`, `sla_monitoring:read`.
- Writes `UPDATE roles SET permissions = $1 WHERE id = $2` with the existing list plus additions only if some are missing (:56-62). It writes only `roles.permissions`. Old retired permissions are kept, not removed. Logs `updatedRoles` (:67).
- `roles.permissions` is text[] in prod (dump :3545) and a separate `role_permissions` table exists (dump :3896). Which one authorization reads is not established here (see Open questions).

### 19. Connection name uniqueness - `connectionNameUniqueConstraint.js` (startup :5916 as `addConnectionNameUniqueConstraint`; CLI guard :74)
- No transaction (single client, no BEGIN). Returns early if index `idx_connections_name_unique_lower` exists (:16-24).
- Finds `storage_connections` names that collide case-insensitively (:27-32). For each group it keeps the first and renames the rest to `<name>_<i>` (i = position in the group) (:40-51), then creates a UNIQUE index on `LOWER(name)` over the whole table (:55-58). Renames are not rolled back if the index creation fails, and `<name>_<i>` could itself collide with an existing name.

### 20. Unified connection fields - `addUnifiedConnectionFields.js` (startup :5918)
- Signature `up(client)` (:13) issues `BEGIN`/`COMMIT` on the object it receives (:15, :122), but server.js passes `dbPool` (:5918). On a Pool each `query` may use a different connection, so BEGIN/COMMIT do not form a transaction.
- Adds `storage_connections.connection_user` VARCHAR(20) default `'Internal'` CHECK `Internal|External` if missing (:18-32), an index `idx_storage_connections_user` (:100-105), and sets `connection_user = 'External'` `WHERE type = 'vendor'` (:114-120). down() does not restore `'Internal'` (:141).
- Also adds, each only if the column is missing: `description` TEXT (:37-53); `authentication_method` VARCHAR(50) default `'key-based'` with CHECK `key-based|aws-iam-role|gcp-sa-oidc|azure-managed-identity|db-short-lived-token|oauth2|kerberos` (:55-80); `auth_config` JSONB default `'{}'` (:82-98); and index `idx_storage_connections_auth_method` (:107-112).

### 21. Document path widening - `alterDocumentFilePathToText.js` (startup :5944; exports `up` only)
- Transaction. If `vendor_agreement_documents.file_path` is `character varying`, alters it to TEXT; otherwise logs a skip (:20-36). Header: original type VARCHAR(1000), documents are base64 strings (:4-8).

### 22. Vendor file schemas - `createVendorAgreementFileSchemas.js` and `migrateVendorAgreementSchemasToFileSchemas.js` (startup :5921-5922)
- `createVendorAgreementFileSchemas.js`: creates `vendor_agreement_file_schemas` with FK CASCADE to the agreement, `file_name_pattern`, `schema` JSONB NOT NULL, `priority` default 0, `is_active` default true, two indexes and an updated_at trigger. Prod has the table (dump :6721, FKs :7875-7877).
- `migrateVendorAgreementSchemasToFileSchemas.js`: transaction (:14). Checks the new table exists (:20) and counts its rows (:33); it skips if any rows exist (:36-39), otherwise copies `file_name`, `schema`, `file_description` from every agreement with a non-empty schema (query at :64). If the table does not exist it logs a skip, commits and returns (:25-29); the tracker then records the run as a success (`migrationTracker.js:97`), so the copy is not retried on later boots. down() runs `DELETE FROM vendor_agreement_file_schemas` with no WHERE (:97), which also removes rows that were not produced by this migration.

### 23. Smaller vendor-agreement column migrations (no caller)
- `addManagerContactToVendorAgreements.js`: adds `manager_contact` TEXT (:19); CLI guard :63.
- `addAdditionalStakeholdersToVendorAgreements.js`: adds `additional_stakeholder_user_ids` and `additional_stakeholder_group_ids`, both JSONB default `'[]'` (:24, :31), with indexes `idx_vendor_agreements_stakeholder_users` / `_groups` (:37, :44); CLI guard :101. Index type GIN (:38, :45).

### 24. `create_vendor_file_profiling_table.sql` (not run by anything)
- Creates `vendor_file_profiling_results` (`create_vendor_file_profiling_table.sql:4`) with `file_id VARCHAR(255) NOT NULL UNIQUE` (:6), `connection_id UUID REFERENCES connections(id)` (:9), `agreement_id UUID` (:10) and `updated_at` (:25).
- Prod `vendor_file_profiling_results` (dump :6856-6877) differs: `connection_id` is varchar(255) (:6861) with FK to `storage_connections(connection_id)` (:7897); no `agreement_id`; no `updated_at`; no UNIQUE on `file_id`, but an FK `file_id` to `files(file_id)` ON DELETE CASCADE (:7898). So prod was not built from this file.

## Data touched
- Vendor: `vendors`, `vendor_agreements`, `vendor_agreement_approvals`, `vendor_agreement_changes`, `vendor_agreement_documents`, `vendor_approval_step_decisions`, `vendor_sla_violations`, `vendor_users`, `vendor_agreement_file_schemas`, `users.vendor_id`, `roles`, `notifications`, `storage_connections`, `transformation_mappings`, `drop_location_config`, `projects`.
- Audit: `audit_log` (+ 4 siblings and 5 `_archive` tables), `frontend_audit_log`, `audit_retention_settings`, `audit_ledger`, `audit_ledger_sequence`, `audit_ledger_verification`.
- Alerting: `alert_policies`, `alert_policy_recipients`, `alert_runs`, `alert_events`, `alert_aggregation`, `alert_attachments`, `digest_subscriptions`, `email_digests`, `allowed_email_domains`.
- Upload / jobs: `api_tokens`, `upload_batches`, `upload_files`, `upload_file_records`, `job_dependencies`, `job_group_schedules`, `job_group_dependencies`, `dbt_models`, `dbt_executions`.

## Prod schema comparison (FileSence_prod_schema_Jan_05_1767780691950.sql and ..._1767956647766.sql)
- Vendor FKs match the migrations: `vendor_agreements.vendor_id -> vendors` ON DELETE CASCADE (:7892), `users.vendor_id` SET NULL (:7851), `vendor_users.vendor_id` CASCADE (:7912), `vendor_agreements.vendor_connection_id` SET NULL (:7891). Both dump files carry these lines at the same line numbers.
- Alert tables: prod `alert_policies` has `entity_type` and `enabled` (dump :4141-4161). No file in the repo creates the prod alert schema (grep). See B1.
- The dump predates `digest_subscriptions`, `email_digests`, `vendor_approval_step_decisions`, `approval_chain_config` and the 14-value approval CHECK; prod's CHECK (:6832) is the 13-value set without `pending_approval`. It is not a current schema.
- Prod columns no migration creates: `vendors.address`, `backup_contact_*`; on `vendor_agreements`: `contract_start_date`, `contract_end_date`, `description`, `vendor_department_email`, `vendor_onboarding_date` (`date`, dump :6816) and `vendor_type` (varchar(100), :6814). The migration adds `vendor_onboarding_date` and `vendor_type` only to `vendors` (`enhanceVendorManagement.js:17-20`), and prod `vendors.vendor_onboarding_date` is `timestamp DEFAULT CURRENT_TIMESTAMP` (:6974), which matches the migration; no migration adds either column to `vendor_agreements`. Prod `vendor_agreements_status_check` allows `active|inactive|archived|draft|pending` (:6835), a superset of the `active|inactive|archived` set in `createVendorManagement.js:97` (it adds `draft` and `pending`). `target_file_path` is absent in prod.
- The audit, ledger, job-dependency and dbt tables match their CLI-only migrations column for column, except `job_group_schedules.project_id NOT NULL`, which no migration here adds.

## Flags

### DUPLICATE
- D1. `vendor_agreements_approval_status_check` is dropped and recreated in four places with different value sets: `createVendorManagement.js:81`, `addGovernanceWorkflow.js:64`, `addApprovalChainToVendorAgreements.js:39` and `repairApprovalStatusConstraintForApprovalChain.js:65`. The last two have the same 14 values (the repair adds a data check first). A fifth is `addApprovalChainToVendorAgreements` down() (:126).
- D2. Alert schema defined twice: `createEmailAlertingSystem.js` (this area) and the prod dump described in extraction/areas/ALRT.md:3, with different columns. Prod `alert_runs`, `alert_events`, `alert_aggregation`, `alert_attachments`, `alert_policy_recipients` all differ from the migration.
- D3. SSL-config boilerplate for the neon.tech host is copied into at least four CLI runners (see entry 8).
- D4. `addConnectionToVendorAgreements.js` and `removeConnectionFromVendors.js` are a pair, not duplicates: they act on different tables (`vendor_agreements` and `vendors`) and together relocate the two columns (entry 16).
- D5. Permission seeding for Vendor Manager / Governance Manager also exists in MIG (see extraction/areas/MIG.md:86).
- D6. `transformation_mappings_source_exclusivity` is created in `addVendorAgreementToTransformations.js:34` and dropped/recreated in `fixSourceConnectionIdForVendorConnections.js:17-38` with the same condition.

### BUG
- B1. RESOLVED. `addVendorSLAToAlertScope.js:19-27, 35` uses `entity_type` and `enabled`; `createEmailAlertingSystem.js` defines `scope` and `is_active`. Prod `alert_policies` uses `entity_type` and `enabled` (dump :4141-4161), so the startup migration works against prod. `createEmailAlertingSystem.js` is not the source of the prod alert schema and nothing in the repo creates it. Against a database built from that file the startup migration would fail (`column does not exist`).
- B2. `createEmailAlertingSystem.js:31` types `email_connection_id` as INTEGER FK `storage_connections(id)`; `createDigestTables.js:20` uses VARCHAR FK `storage_connections(connection_id)` for the same concept.
- B3. `addAuditRetentionAndArchive.js:26-28`: `ON CONFLICT DO NOTHING` on a table whose only unique key is the SERIAL id, so every re-run inserts another default settings row.
- B4. `addGovernanceWorkflow.js` down (:225-249) restores the old CHECKs without remapping rows back, so rows with new values (e.g. `manager_approved`, `governance_manager`) make the ADD CONSTRAINT fail.
- B5. `createVendorManagement.js:89` comments "locked after dual approval" while `addGovernanceWorkflow.js` moves to three stages; whether lock logic follows is outside this area.
- B6. `enhanceVendorManagement.js:25-35`: two `RENAME COLUMN` statements without existence checks make the migration non-idempotent.
- B7. `addApprovalChainToVendorAgreements.js:159-163`: the CLI guard calls `up()` with no pool, while `up(dbPool)` calls `dbPool.connect()` (:15-16), so the CLI path throws a TypeError.
- B8. `addSLAMonitoringToVendorAgreements.js:160-172`: down() never drops `arrival_time`, and `DROP TABLE vendor_sla_violations` has no CASCADE, so it fails once `alert_events.vendor_sla_violation_id` (entry 7) references it.
- B9. `createProgrammaticUploadTables.js`: no transaction (entry 14); partial creation on failure.
- B10. `addVendorIdToUsers.js:4-6`: a `Pool` is created at require time, with no ssl option, and never closed anywhere in the file (entry 17).
- B11. `addUnifiedConnectionFields.js:13` takes a client but `server.js:5918` passes `dbPool`; BEGIN/COMMIT do not scope one connection (entry 20).
- B12. `connectionNameUniqueConstraint.js:40-58`: silently renames duplicate connection names with no transaction (entry 19).
- B13. `addVendorAgreementToTransformations.js:34`: ADD CONSTRAINT without DROP IF EXISTS, so a re-run fails.
- B14. `migrateVendorAgreementSchemasToFileSchemas.js` down (:97): deletes every row of `vendor_agreement_file_schemas`.
- B15. `server.js:5953-5955`: a migration failure is only logged, later migrations are skipped and the server starts anyway (Summary).
- B16. `migrateVendorAgreementSchemasToFileSchemas.js:25-29` commits and returns when the target table is missing; the tracker records success (`migrationTracker.js:97`) and the data copy is never retried (entry 22).
- B17. Inferred, not run: on a fresh database `createVendorUsersTable` (`server.js:5914`; `createVendorUsers.js:20` references `vendors`) fails because only CLI-only migrations create `vendors`, and the single try/catch then skips every later startup migration (Summary).

### DEAD
- DE1. Never invoked by any JS file: `createEmailAlertingSystem.js` (no `require.main` either), `createProgrammaticUploadTables.js` (exports `up`/`down` only), `createAuditTables.js`, `addAuditRetentionAndArchive.js`, `createImmutableAuditLedger.js`, `createJobDependencyTables.js`, `createVendorManagement.js`, `enhanceVendorManagement.js`, `addGovernanceWorkflow.js`, `addConnectionToVendorAgreements.js`, `removeConnectionFromVendors.js`, `vendorConnectionsMigration.js`, `fixSourceConnectionIdForVendorConnections.js`, `addVendorAgreementToTransformations.js`, `addProjectToVendorAgreements.js`, `addManagerContactToVendorAgreements.js`, `addAdditionalStakeholdersToVendorAgreements.js`, and `create_vendor_file_profiling_table.sql`. They matter only if the live DB was built by hand-running them. Which tables exist in a fresh database is therefore not determined by startup code.
- DE2. `createAllowedEmailDomains.js` and `createDigestTables.js` have no CLI guard; usable only via server startup.

### SECURITY
- S1. `createImmutableAuditLedger.js` triggers do not block TRUNCATE, and a superuser or table owner can drop the triggers; immutability is DB-level only (:149-178). Stated as observation. Prod has the same two triggers and no TRUNCATE trigger (dump :2726-2733).
- S2. The CLI runners set `rejectUnauthorized:false` for a neon.tech host only when `NODE_ENV` is development or test (e.g. `addAuditRetentionAndArchive.js:320-322`); otherwise `true`. When `PGHOST` is not a neon.tech host, SSL is off entirely. `addVendorIdToUsers.js:4-6` sets no ssl option at all.
- S3. `bridgeVendorAdministrationPermissions.js:51-62` grants `users:write` (and `connection:*`, `users:read`, `sla_monitoring:read`) to every role named `Vendor Manager` at startup, and does not remove retired permissions. Any role, whatever its name, holding `vendor_users:*`, `vendor_roles:*` or `vendor_connections:*` also gets `users:*`, `roles:*` or `connection:*` with the same action (:28-42): a role with `vendor_roles:write` gets `roles:write`.
- S4. `api_tokens` stores `token_hash` and `token_prefix` (:22-23); hash algorithm not in this file.
- S5. `vendorConnectionsMigration.js:39-54, 100` copies the drop-location credentials (code comments say encrypted) into `storage_connections.config` JSON. Whether other code reads or exposes that config is not established here.

### UNCLEAR
- U1. `audit_ledger_verification.status` (:119) and `upload_*.status` columns have no CHECK; permitted values come from code outside this area.
- U2. Whether `vendorConnectionsMigration.js`'s `connection_direction='drop'` is read anywhere (not in `migrateVendorConnectionDirection`). The migration has no caller.

## Domain terms
- Approval statuses: `vendor_approved` / `vendor_accepted`; `owner_approved` / `manager_approved`; `pending_approval` / `pending_vendor_acceptance` (old vs new names for the same step, addGovernanceWorkflow.js:42-58). `owner` approver == `manager` approver.
- Approval chain: configurable steps (`approval_chain_config`, `current_approval_step`), distinct from the fixed three-stage flow.
- Governance Manager, Vendor Manager: role names. Agreement version (`agreement_version`, `version`).
- Alert `scope` vs `entity_type` (same concept under different names in different schemas). `alert_run` = one sent email; `alert_event` = individual job event; `grouping` none/by_parent/digest.
- Ledger vs audit log: `audit_ledger` (hash chained, immutable) vs `audit_log` (mutable, with retention and archive). `frontend_audit_log` is separate.
- `connection_direction` source|target (also `drop` written by `vendorConnectionsMigration.js:102`); `vendor_connection_id` / `drop_location_path`; `connection_user` Internal|External.
- Digest vs alert: `digest_subscriptions` are per-user scheduled summaries.
- Publish: the word used at `server.js:14069` ("Schema changes are applied by Publish").

## How prod got tables whose migrations are never called (an answer, not a verified fact)
- Nothing in the repo invokes a migration (see Summary).
- The audit, ledger, job and dbt tables match their CLI-only migrations column for column, which fits manual `node <file>` runs.
- `server.js:14069` says "Schema changes are applied by Publish". This is likely a Replit dev-to-prod schema diff that would carry any table in the dev DB regardless of origin; this is inference, not shown in code. It would explain prod columns and alert tables with no creating code.
- Hand edits or older script versions would explain remaining differences.
- A fresh database built only from startup code would lack the audit, ledger, job-dependency, dbt, alert and (apart from `createVendorUsers`, file schemas and later ALTERs) core vendor tables.
- `backend/src/migrations/index.js` is a separate file-based runner for `001_initial_schema` with `users.id VARCHAR(36)` and `roles.permissions JSONB`, which conflicts with prod (`users.id` integer, `roles.permissions` text[]). No caller found; not read by me.

## Open questions
1. Does authorization read `roles.permissions` (the only column the bridge writes) or the separate `role_permissions` table? If the latter, the bridge changes nothing.
2. Which tables does Publish actually carry to prod, and does anything run the CLI migrations? Not determinable from the repo.
3. Contents not read: `vendor_agreement_documents` and `notifications` columns (`addGovernanceWorkflow.js`), `execution_audit`..`security_audit_log` columns, `alert_events`/`alert_attachments` tail, `createJobDependencyTables.js` columns outside CHECKs, `backend/src/migrations/index.js`.
4. Whether `down` functions are ever invoked (no runner seen).
5. Whether the prod-only column differences listed under "Prod schema comparison" come from Publish, hand edits or older scripts.
