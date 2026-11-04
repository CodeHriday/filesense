# Filesense - Glossary (Phase 4)

One canonical term per concept. "Replaces" lists the old names found in code, UI, tables and notes; the rebuild should use only the canonical term. Where one old word covered several concepts (for example "group", "job", "workflow", "policy", "session"), each concept gets its own canonical term and the old word is listed under each.

## Identity and access

| Term | Definition | Replaces |
|---|---|---|
| User | A person with a login (`users` row). Logs in with username or e-mail. | account |
| Internal user | A user employed by the operating organisation (`internal_user = true`; user type FTE or Consultant). | internal, FTE |
| Vendor user | An external user who works for a vendor (`internal_user = false` and `user_type = 'Vendor'`, linked by `users.vendor_id`). | external user, isVendor, isVendorUser, vendor (as a user flag) |
| Auth provider | How a user authenticates: `local` (password) or `okta` (SSO). | SSO, SSO-only account, ssoProvider |
| Access token | Short-lived bearer JWT (default 30 min) sent on every API call. | token, JWT, accessToken |
| Refresh token | Long-lived token (default 7 days) exchanged for a new access token. | refreshToken, "session" (logoutAll message) |
| Password-change token | 10-minute token that only allows setting a new password. | passwordChangeToken, purpose password_change_only |
| Session | The period a user stays signed in, bounded by the refresh token and the inactivity timeout. One concept only. | express-session cookie, user_sessions (never written), refresh-token row, "Session Timeout" |
| Lockout | Temporary block after 5 failed logins for 15 minutes. | locked account, locked_until, failed_login_attempts |
| Forced password change | A flag that makes the user set a new password at next login. One flag. | force_password_change, must_change_password, requiresPasswordChange, "Password Change Required" |
| Password reset request | A user's request, approved or denied by an admin. Statuses: pending, approved, denied. | password_reset_requests, reset queue |
| Role | A named bundle of permissions. | role, roleDetails |
| Permission | A string `resource:action` (actions read, write, execute, approve; tag permissions `tag:<name>:read` or `:edit`). One format only. | permission object {name, resource, action}, permission_name, permission_code, legacy names user_view, role_create, user_create, file_delete |
| Feature | A UI navigation unit derived from a permission's resource. | featureId, APP_FEATURES entry, menu item |
| Administrator | A user whose role is Admin. One definition, enforced server-side. | Admin role, admin access, admin-level access, userHasAdminAccess (two copies), userHasAllProjectAccess, all-project access, admin bypass, requireAdmin, isAdmin, digest requireAdmin |
| Access group | A named set of users that can be given roles and project access (`access_groups`, membership in one table). | group, user group, Access Groups, groups (legacy table), user_groups / access_group_members (two membership tables) |
| Group role | A role granted to every member of an access group, optionally limited to one project. | group-inherited role, groupInheritedRoles, access_group_roles |
| Effective roles | Direct roles plus group roles. | effectiveRoles |
| Data steward | A user holding the Data Steward role; picked as steward on mappings. | steward |
| Bootstrap admin | The seeded first administrator account. | admin user, username 'admin' |

## Tenancy

| Term | Definition | Replaces |
|---|---|---|
| Project | The tenancy boundary for every resource (top-level `projects` row). | workspace |
| Sub-project | A project with a parent project; inherits the parent's members. | subproject, child project |
| Project member | A user with direct or group-based access to a project. | member, group-based member, project_members, project_access_groups |
| Default Project | The seeded project with id 1. | is_default project |
| Archived project | A project hidden from normal use (soft delete). Distinct from inactive. | is_archived, soft deleted |
| Inactive project | A project that blocks new work but stays visible. | is_active = false |

## Files and ingestion

| Term | Definition | Replaces |
|---|---|---|
| File | One delivered data file and its catalog row (`files`), identified by `file_id`. | dataset, uploaded file, numeric files.id in APIs |
| Logical file | Files in one project that share a canonical filename (timestamps, GUIDs and sequence numbers removed). | logical file group, logical_file_id, canonical name, file pattern (insights), filePattern, extractFilePattern (three variants) |
| File version | Another file in the same logical file. | copy, copies, latest version |
| Upload | Interactive delivery through the app, then queued processing. | Upload & Profile, /api/files/upload |
| Drop | Delivery written to cloud storage at the agreed drop location. | Drop File, /api/files/drop, drop ingestion |
| API upload | Delivery by a machine client with an API token. | programmatic upload, machine API, upload API |
| Ad-hoc upload | An upload not tied to a vendor agreement. | uploadType 'adhoc' |
| Contract upload | An upload validated against a vendor agreement's file schemas. | contract validation, uploadType 'contract', agreement upload |
| Drop location | The storage connection plus path where files for a project or agreement land. One model (see decision D8). | File Drop Location, drop_location_connection_id/bucket/prefix, drop_location_config (global), vendor_connection_id + drop_location_path, drop path |
| Processing step | The progress state of a file through the pipeline (queued, scanning, profiling, complete, failed, password_required). | processing_step, step, file status |
| Failure reason | Coded reason a file failed (one enumerated set). | failure_reason_code, reasonCode, DLQ error code, categorizeError codes |
| Processing job | One queued unit of work for a file in the processing pipeline. | queue job, jobId (queue), task (asyncProcessor) |
| Failed job | A file processing failure parked for manual action (retry, supply password). | DLQ job, dead-letter queue, dlq_jobs |
| Archive | An uploaded container file (zip, tar, 7z). | container, parent archive |
| Archive member | A file inside an archive. | extracted file, logical name, member manifest, profiled member, primary data file |
| Archive password | A secret needed to open an archive, kept only in the password vault. | archive_password, ad-hoc password, schema password, agreement password |
| Password vault | Encrypted store for archive passwords. | encrypted_passwords, vault |
| Virus scan status | Result of malware scanning: clean, infected, not scanned. | virus_scan_status completed/skipped, isInfected, isClean |
| Preview data | Stored sample rows of a file (up to 10,000). | file_preview_data, preview rows, file_preview (wrong table name) |
| Checksum | SHA-256 of the file content, computed by the server. | fileHash, file_hash |

## Profiling, quality and schema

| Term | Definition | Replaces |
|---|---|---|
| Profile | Per-column statistics of a file. | profiling, column statistics, profile snapshot, file_columns, profiling results |
| Profiling metrics | File-level profile figures stored per run. | profiling_metrics, metrics |
| Profiling service | The Python service that loads and profiles files. | Profile API, profile_api, Flask service, PROFILING_SERVICE_URL, PROFILE_API_URL |
| Header check | Validation of a file's header row, giving a header health score (0-100) and status healthy, warning or critical. | header validation, health_score, header health |
| Quality rule | A rule run against file rows (`quality_rules`). | DQ rule, validation rule, generic rule, rule |
| Rule type | The kind of rule: completeness, validity, consistency, uniqueness, freshness, record_count. | null_check, column_completeness, isna_check, validity_check, length_check, range_check, email_validity, phone_validity, numeric_only_string, special_character_presence, duplicate_check, engine-type alias |
| Rule assignment | A quality rule applied to a file with target columns. | assigned rule, applied rule, file_quality_rules |
| Schema rule | A rule declared in an agreement file schema and assigned automatically. | schema-enforced rule, __schema_default__ rule, contract rule |
| Violation | A row that failed a quality rule. Statuses: new, reviewed, acknowledged, resolved. | quality_rule_violations, error (error review), incident (lineage) |
| Violation action | What to do on violations: continue, warn, abort. One vocabulary. | error_action log_continue/log_abort, violation_handling, per_rule_error_action, log_warn, Abort/Warn/Continue |
| Severity | Importance of a violation or anomaly: critical, high, medium, low. One scale. | critical/error/warning (violations), danger/warning/info (UI), low/medium/high (anomalies) |
| Quality score | One 0-100 score per file from the five dimensions. | overall_score, reliability score, health score, data health index, dqQualityScore, quality_score (five formulas) |
| Quality dimension | completeness, consistency, validity, uniqueness, timeliness. | components, accuracy (one variant), freshness (as a score) |
| Schema | The column list of a file or contract (name, type, nullable, PII). | schema_definition, column definitions, file schema (ambiguous) |
| Schema snapshot | A stored schema of one file with its hash. | file_schemas row, file_schema_details, schema version |
| Schema drift | A schema change between consecutive files of a logical file. | schema change, schema mismatch (Python), schema validation Pass/Fail |
| Fixed-width layout | Column names and widths for headerless files. | fixed-width schema, header_definition, headerDefinition, header config |
| Anomaly | An unexpected change in a file's metrics against its history. Status open or resolved. | anomaly_type vocabularies (JS and Python), status 'active', statistical outlier, numeric_deviation, trend_deviation |
| Healing recommendation | A suggested fix for an anomaly. | healing, action_type |

## Vendors and contracts

| Term | Definition | Replaces |
|---|---|---|
| Vendor | An external organisation that delivers files (`vendors`). | vendor organisation |
| Vendor contact | A vendor user named as the primary or backup contact of a vendor or agreement. | primary contact, backup contact, secondary contact, vendor_user_id, primary_contact_email, secondary_contact_email |
| Vendor agreement | The data contract between the organisation and a vendor: files, schemas, schedule, SLA, approvals. | contract, data contract, vendor contract, agreement_code (as name) |
| Agreement status | Lifecycle state: draft, active, inactive, archived. | status, Disable (= inactive), Delete (= archived), 'disabled' (FE) |
| Approval status | Where the agreement is in approval; separate from agreement status. | approval_status (14 values), vendor_approved/owner_approved (legacy) |
| Approved agreement | An agreement that may be used for delivery (final approval reached, locked, active). | final-approved, fully_approved, governance_approved, isFinalApprovedAgreementStatus |
| Agreement owner | The internal user who manages an agreement. | file owner, vendor manager, manager, manager_contact, file_owner_user_id, owner |
| Governance approver | The user who gives governance approval. | governance manager, governance_manager_user_id |
| Approval chain | The ordered approval steps of an agreement, each with approvers and a quorum. One mechanism. | three-stage workflow, N-step chain, dual approval, configurable chain |
| Stakeholder | A user or access group notified about an agreement but not approving. | additional stakeholder, observer |
| Agreement file schema | The expected filename pattern and schema for one file type in an agreement. | file schema, file configuration, file config, pattern schema, matched schema, vendor_agreement_file_schemas |
| Filename pattern | A glob (`*`, `?`) matched against filenames. | file_name_pattern, source_file_pattern, file_pattern, expected_file_pattern, file_name (agreement) |
| SLA | The expected arrival time and grace period for an agreement's files. | file arrival SLA, vendor SLA |
| Expected arrival | When a file is due. | expected_arrival_time, arrival_time, expectedArrivalTime |
| Grace period | Minutes after expected arrival before an SLA breach. | alert_threshold_minutes, threshold, deadline |
| SLA breach | A missed expected arrival. | violation, violated, vendor_sla_violations |

## Connections and integrations

| Term | Definition | Replaces |
|---|---|---|
| Connection | A stored link to external storage, a database, an e-mail provider or Jira, with encrypted credentials (`storage_connections`, key `connection_id`). | storage connection, vendor connection, transform connection, email connection, Jira connection, provider, connections table |
| Connection type | The kind of connection (aws, gcp, azure, snowflake, databricks, smtp, ses, sendgrid, jira, ...). | type, connection_type, provider, provider_type, storage_type |
| E-mail provider | A connection used to send e-mail. | email connection, NotificationService provider |
| Allowed e-mail domain | A domain that alerts and digests may be sent to. | domain restriction |
| Jira integration | A Jira connection used to open incident tickets. | incident integration |
| Reference data | Datasets and code crosswalks held in the external RDM system. | RDM, reference data management |
| Crosswalk | A source-code to target-code map from reference data. | rdm_crosswalk_lookup |
| Reference dataset | A reference table joined to rows during a job. | rdm_dataset_join |
| API token | A bearer token for machine clients, with scopes and a rate limit. | dfo_ token, programmatic upload token |
| Upload batch | One API upload request and its files. | upload_batches, batch |

## Transformation and orchestration

| Term | Definition | Replaces |
|---|---|---|
| Mapping | A definition that turns source files into a target file (`transformation_mappings`). | transformation mapping, ETL mapping, transformation, file mapping (legacy, dropped) |
| Visual mapping | A mapping drawn as a node graph on the canvas, compiled into a mapping at run time. | visual_mapping_defs, VM, temporary mapping ([VM] prefix) |
| Field mapping | A rule producing one target column from source columns. | column mapping, field_mappings, fieldMappings |
| Expression | The formula of a field mapping, for example `concat(upper(first_name), ' ', last_name)`. | new format, transformation + transformation_params (legacy format) |
| Variable | A named intermediate value referenced as `$name`. | mapping variable |
| Job | One run of a mapping (`transformation_jobs`, identified by `job_id`). | transformation job, mapping job, ETL job; distinct from processing job, failed job, bulk profiling job and legacy job |
| Job status | pending, running, completed, completed_with_warnings, failed, cancelled. | finalStatus, per-table status vocabularies |
| Run | One execution of a mapping group or workflow. | execution, execution_id, run_id, WFRUN-, WORKFLOW-, VWFL-, GROUP-, vmrun- |
| Correlation ID | Id linking source and target files of one job (equal to job_id). | correlation_id |
| Mapping group | A set of mappings run together with a concurrency limit. | job group (old name), group |
| Workflow | An ordered set of steps that run mappings and mapping groups. One model (see decision D6). | N-step workflow, dependency workflow, visual workflow, business process ("Workflows" page), workflow steps |
| Step | One stage of a workflow. | step_index, workflow step, node |
| Step item | A mapping or mapping group inside a step. | asset, entity, asset_id, entity_id |
| Schedule | A cron or interval trigger for a mapping, group, workflow or system task (`schedules`). | job schedule, file schedule, file_schedules, job_schedules, scheduled job, execution type 'scheduled' |
| Bulk profiling job | A one-off or scheduled profiling run over a cloud storage path. | bulk_profiling_jobs |
| Bulk validation job | A run that checks many cloud files against agreement schemas. | schema validation job, schema_validation_jobs |

## Governance, lineage and audit

| Term | Definition | Replaces |
|---|---|---|
| Sensitivity level | Classification of a file or column: Public, Internal, Confidential, Restricted. One list. | classification_level, data_classification, sensitivity_level (several lists), permission level, Low/High scale |
| Governance tag | A label (for example PII) on a file or column that can require a tag permission to view or edit. | tag, sensitivity tag, PII tag, column_sensitivity_tags |
| Governance policy | A data-handling rule (retention days, access control, encryption) attached to files or columns. | policy (governance); distinct from RBAC policy, alert policy and retention policy |
| Column access | Result of column access control: full, masked or denied. | _accessLevel, accessLevel 'none', [REDACTED] |
| Data owner | The person accountable for a file's data. | ownership, file owner (governance), owner_user_id, creator |
| Lineage | Recorded links from source files through mappings and jobs to target files and columns. | transformation lineage, file lineage, pattern-based vs file-specific lineage, visual lineage, lineage graph |
| Saved lineage view | A stored lineage graph. | saved graph, visual_lineage_graphs |
| Audit log | The record of user and system actions (who, what, when, outcome). | audit trail, audit_log, execution audit, data access log, security audit log, frontend audit log |
| Audit ledger | The tamper-evident, hash-chained record of job events. | immutable audit ledger, audit_ledger |
| File audit | The per-file record of each load step. | file_audit_details, profiling results (delete message) |
| Retention policy | A rule that archives or deletes old files. | retention_policies; distinct from audit retention and profile retention count |
| Audit retention | How long audit records are kept before archive and deletion. | audit_retention_settings, retention_days |
| Profile retention count | Number of profile versions kept per mapping. | profile_retention_count, retentionCount |

## Alerting and notifications

| Term | Definition | Replaces |
|---|---|---|
| Alert policy | "When entity X reaches event Y, notify these recipients". | alert config, alert rule (legacy, dropped) |
| Alert scope | The kind of entity an alert policy watches (job, workflow, mapping group, schedule, vendor SLA). | entity_type, scope |
| Alert delivery | One sent alert e-mail and its outcome. | alert run, alert_runs, alert history |
| Alert event | One event included in an alert delivery. | alert_events, aggregation item |
| Alert consolidation | Grouping events into one delivery within a time window. | aggregation, grouping, consolidate_alerts, digest (in alert code) |
| Notification | An in-app inbox message for one user. | alert (inbox), notifications row; distinct from NotificationService (e-mail) |
| Digest | A scheduled summary e-mail a user subscribes to. | digest subscription, email_digests |

## Platform

| Term | Definition | Replaces |
|---|---|---|
| Readiness | The service can accept traffic (database reachable, schema prerequisites present). | ready, databasePrerequisites.ready, /api/health/ready |
| Liveness | The process is running. | /api/health/live, /health-check |
| Enabled | On/off flag for any configurable object. One name. | is_active, enabled, status 'active'/'inactive' used as a flag |

Glossary size: 130 canonical terms.
