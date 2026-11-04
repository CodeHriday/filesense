# Filesense - Product overview (Phase 4)

Feature ids (F..) refer to triage.md; security ids (C.., H..) and decisions (D..) refer to cross-cutting.md; terms follow glossary.md.

Decision status: the user accepted every synthesizer recommendation and the choices for the nine former "ask" features, relayed by the coordinator on 2026-11-05. The decisions are recorded in triage.md (Decision column) and cross-cutting.md section 7. This overview reflects them.

## Product summary

Filesense (earlier names in code: "DataObservatory", AWS secret "filevantage-prod") is a data-file intake, quality and governance platform. Internal teams and external vendors deliver data files by interactive upload, by dropping them into the project's cloud drop location, or through a token-authenticated API. Each file is virus-scanned (fail-closed), unpacked if it is an archive, profiled column by column, checked against the vendor agreement (data contract) that governs it and against quality rules, catalogued, tagged for sensitivity and PII, and tracked in audit trails. Mappings transform source files into target files, alone or orchestrated in mapping groups and N-step workflows on schedules, with lineage recorded from source to target. Alerts, in-app notifications, digests, Jira tickets and an executive dashboard report on delivery, quality and pipeline health.

Today it is a Node/Express monolith (one 14k-line server.js plus routers), a React/Vite single-page app and a Python Flask profiling service, backed by PostgreSQL and optionally Redis, deployed on Replit (with a second EC2/pm2 path).

## Users

- Administrators (holders of the Admin role, D3): manage users, roles, access groups, projects, connections, settings, retention and system cleanup.
- Data engineers and creators: upload files, build mappings, visual mappings, mapping groups, N-step workflows and schedules; monitor jobs.
- Data stewards and governance approvers: define quality rules, triage violations, tag sensitivity and PII, manage governance policies, approve agreements at the governance step.
- Agreement owners: create and maintain vendor agreements, file schemas and SLAs; approve agreements at the owner step; manage vendors.
- Vendor users (external): accept agreements, deliver files to their agreement's drop path, view the quality of their own files.
- Executives and viewers: read the executive dashboard, catalog and file views.
- Machine clients: upload files with API tokens.
- Operators: watch health, failed jobs, queues and audit logs.

## Goals

1. Accept files from internal and vendor sources through upload, drop and API, safely and with clear processing status. Scanning is enabled and fail-closed on every path, archive members included (D9). Archive handling is size-limited.
2. Make every file understandable: profile, header check, schema history and drift, one quality score and rule violations, preview with column-level masking.
3. Enforce vendor agreements. Only approved agreements define expected files, schemas, rules and arrival SLAs, and deliveries are validated against them. Approval runs through one configurable approval chain, with a default vendor, then agreement owner, then governance template (D5).
4. Transform and orchestrate. This covers mappings with an expression language and reference-data enrichment, mapping groups, N-step workflows as the single workflow model with e-mail and Jira steps (D6), and cron/interval schedules with explicit time zones (D11). Job status is honest: a DQ abort or any failed file fails the job, warn-level violations give completed_with_warnings, and cancel stops the run (D7).
5. Govern and trace: one sensitivity list, governance tags and policies, data ownership, lineage from source to target, retention and archival.
6. Account for everything: an audit log with real actors and no request bodies, a tamper-evident audit ledger with a keyed hash over the full record, per-file audit trails.
7. Inform people: alert policies with one delivery path, in-app notifications, digests, Jira incidents, executive dashboard.
8. Enforce tenancy and least privilege on the server (D3):
   - Projects are the boundary, resolved from the resource, never from client input.
   - Permissions are `resource:action` strings.
   - Admin is the Admin role only.
   - `all_projects:read` gives read-only visibility.
   - Project-scoped group roles apply only inside their project.
   - Access groups use one membership table (D4).
   - Secrets are encrypted on every write path and never returned.
9. Sign-in: local accounts and Okta. Okta users sign in with verified OIDC tokens. Local accounts have lockout and e-mailed one-time reset links, with no temporary passwords (D10).

## Non-goals (features dropped)

All 26 drops are decided (user accepted, relayed by the coordinator):

- F13 Legacy groups API (server.js /api/groups handlers, /api/user/groups).
- F14 IAM-style policy engine (/api/policies, ABAC attributes, SCIM tables).
- F17 Sub-project members and sub-project access groups (access is inherited from the parent project).
- F36 Profile history endpoint.
- F43 Quality report page (/report/:fileId).
- F52 Chat with dataset.
- F53 Related datasets (embeddings).
- F55 Healing recommendations.
- F62 Legacy dual approval (/approve, /reject).
- F65 Single-agreement template (template/:format, parse-template).
- F69 Legacy file mappings (/api/mappings) and their execution-log routes (the visual-mapping run log is kept under F75).
- F71 Unmounted transformation stacks and dbt.
- F78 Dependency workflows (workflow steps on business processes).
- F79 Visual workflows (their e-mail and Jira steps move into N-step workflows).
- F80 Business processes.
- F81 Job groups.
- F82 Legacy process-management jobs and job schedules.
- F85 Legacy file schedules.
- F100 Legacy alert rules and file alert history.
- F108 File-pattern insights (/api/insights/*, aggregation worker).
- F109 Badges.
- F110 Dashboard settings.
- F114 Cache administration API.
- F115 Debug and test endpoints.
- F118 Rust log service and Node log client.
- F121 Alternate backend app under backend/src.

Resolved former "ask" features that are kept with changes:
- F10: one "My account" page for own contact details and password change.
- F41: one violation action (continue, warn or abort) per rule assignment, for uploads and jobs.
- F119: one Help page; the performance-optimizations page is removed.

Also retired as part of kept features:
- The global drop-location configuration and its credentials endpoint (F27, D8).
- The hard-coded three-stage approval endpoints (F61, D5).
- The legacy `groups` and `access_group_members` tables (D4).
- The admin-approved password reset queue, replaced by e-mail reset (F07, D10).

## Constraints

- Production data must be preserved: users, projects, vendors, agreements and approvals, files and profiles, mappings, jobs, audit and ledger rows.
- Schema baseline (D1): the `FileSence_prod_schema_Jan_05_*.sql` dumps, taken as the best available prod evidence. They must be confirmed against a fresh prod dump before the data model is built. That fresh dump is an open action. Known gaps in the baseline: the digest tables, `vendor_approval_step_decisions` and the 14-value approval CHECK. The in-repo migrations are not a schema source.
- Identity: Okta (OIDC) for SSO users plus local accounts with lockout and e-mail reset (D10). Admin is the Admin role only (D3).
- Storage: AWS S3 is the primary target; GCS and Azure are partly implemented. Connections hold cloud, database, e-mail and Jira credentials, keyed by `connection_id`. Drop locations are project-level connection-plus-path, with sub-project overrides and agreement sub-paths (D8).
- Processing depends on Python (pandas-based profiling, header validation, anomaly detection) and ClamAV, which must be available because scanning is fail-closed (D9). Redis is optional today, and the in-memory queue, rate limits and sessions assume a single instance.
- External integrations:
  - Okta
  - AWS Secrets Manager
  - an external RDM service (x-api-key)
  - Jira Cloud
  - e-mail providers: SMTP, SendGrid, SES, Azure, GCP, Gmail/Outlook OAuth
  - optional cloud LLM providers for DQ suggestions: OpenAI, Bedrock, Azure, Gemini
- Deployment today: Replit GCE with a bootstrap proxy, plus an EC2/pm2 GitHub Action; the rebuild uses one path.
- Time: every timestamp is stored as UTC `timestamptz`. Schedules, SLAs and digests carry an explicit IANA time zone, defaulting to UTC (D11).
- Job status vocabulary includes completed_with_warnings. It must be allowed by every status CHECK that stores run status (D7).
- Security debt to close before or during the rebuild: ten critical findings (C1-C10). Credential rotation and blocking the unauthenticated endpoints on current production (D2) are accepted. The action owner is the user/ops, and the extraction has not done them.

## Areas

| Code | Name | One line |
|---|---|---|
| AUTH | Authentication & sessions | Local login with lockout, Okta SSO via verified OIDC, JWT access/refresh tokens, forced password change; e-mail reset replaces the admin-approved queue (D10). |
| USR | Users, roles & permissions | User administration, ownership transfer, a "My account" page, and admin-only role and permission management with `resource:action` permissions (D3). |
| GRP | Access groups & RBAC/ABAC policies | Access groups with one membership table and project-scoped group roles (D3, D4); the legacy groups API and the IAM policy engine are dropped. |
| PRJ | Projects & sub-projects | Projects and sub-projects as the tenancy boundary; sub-projects inherit parent access (sub-project member tables dropped). |
| FILE | File catalog & file management | Catalog listing by logical file, file detail, preview, copies and deletion. |
| ING | File upload & drop ingestion | Interactive upload with duplicate check and contract validation, and drop to the project or agreement drop location (D8); the global drop-location config is retired. |
| ARC | Archives, virus scan & dead-letter queue | Archive detection and extraction, password vault, fail-closed ClamAV scanning (D9) and the failed-jobs queue. |
| PROC | Async file processing pipeline | Queue, file-processing worker, status polling, orphan recovery and upload cleanup. |
| PROF | Data profiling engine | One profiling engine and the internal-only profiling service, with profile retention; the profile-history endpoint is dropped. |
| FDV | File detail, profile & quality views (UI) | The per-file profile and quality-check screens; the quality-report page is dropped. |
| DQ | Data quality rules & checks | Rule library, per-file assignment, run and revalidate, one violation action per assignment, violations and one quality score. |
| ERR | Error review | Browse, group, export and update rule violations for files and mapping jobs. |
| SCH | Schema extraction, enforcement & history | Schema inference, snapshots and drift, schema rules, header validation, fixed-width and delimiter config. |
| SCHV | Bulk schema validation jobs | Validate many cloud files against agreement schemas as jobs with reports, scheduled through the scheduler. |
| BULK | Bulk profiling of cloud storage | Browse and discover S3 paths and run bulk profiling jobs, scheduled through the scheduler. |
| CONN | Storage & database connections | Connection CRUD, test, browse, schema inference and dependency checks, with secrets encrypted on every write. |
| VND | Vendors & vendor portal | Vendor records and contacts, vendor access scoped to their agreements and drop paths, vendor file views. |
| VAG | Vendor agreements | Agreement CRUD with explicit lifecycle transitions, documents, stakeholders, archive passwords, disable and archive. |
| VAP | Vendor agreement approval workflow | One configurable approval chain with a default vendor, owner, governance template (D5); legacy dual and three-stage endpoints retired. |
| VAS | Agreement file schemas & templates | Per-agreement file schemas, pattern tests and the multi-sheet Excel agreement template; the single-agreement template is dropped. |
| SLA | Vendor SLA monitoring | File-arrival SLA calculation per explicit time zone, monitor worker and SLA dashboard (rebuilt; D11). |
| ETL | ETL mapping definitions | Transformation mapping CRUD, pattern and vendor-schema validation, run trigger; legacy file mappings dropped. |
| XFM | Transformation engine & expression language | Expression parser and row transformation engine; unmounted transformation stacks and dbt dropped. |
| EXE | Mapping job execution engine | Runs a mapping end to end with honest status: failed on DQ abort or any failed file, completed_with_warnings on warnings, cancel honoured (D7). |
| JOB | Jobs & job monitoring | Transformation job list, detail, logs and cancel; legacy process-management jobs and job schedules dropped. |
| BPR | Business processes & job groups | Retired: business processes and job groups are dropped (D6). |
| MGRP | Mapping groups | Groups of mappings run together with a concurrency limit; a group run fails when a member fails (D7). |
| WFL | Workflows (N-step) | N-step workflows as the single workflow model, with e-mail and Jira steps (D6); dependency workflows dropped. |
| VMAP | Visual mapping canvas | Node/edge mapping design compiled to mappings, executed with authenticated live status and one run-log store. |
| VWF | Visual workflows | Retired (D6); its e-mail and Jira node behaviour moves into N-step workflow steps. |
| SCHD | Scheduling | Cron and interval schedules with explicit time zones (D11) and a cross-instance lock; legacy file schedules dropped. |
| LIN | Data lineage | Table and PII lineage, impact analysis, and the visual lineage graph with saved views, all project-scoped. |
| GOV | Data governance | File ownership and one sensitivity list, governance tags and policies, column-level tags and access control. |
| RET | Retention & archival | Retention policies, daily archival worker, archive list and restore (rebuilt to match the schema). |
| AUD | Audit logging | Request audit after authentication with no bodies stored, audit trail queries and export, audit retention, error-only frontend capture. |
| LEDG | Immutable audit ledger & file audit | Keyed-hash job event ledger with verify/export, and server-written per-file audit trails. |
| ALRT | Alert policies & alert delivery | Alert policies and recipients with one delivery path and delivery history; legacy alert rules dropped. |
| NTF | In-app notifications & digests | Server-written notification inbox and bell, and scheduled digest e-mails in explicit time zones. |
| EML | Email providers & domains | Admin-only e-mail provider connections, one Gmail/Outlook OAuth flow, test sends and fail-closed allowed domains. |
| JIRA | Jira incident integration | Jira connections and tickets for failed jobs (D7) and N-step workflow Jira steps (D6). |
| DASH | Dashboards | Executive dashboard and metric trends; file-pattern insights, badges and dashboard settings are dropped. |
| AI | AI DQ suggestions & LLM providers | DQ rule suggestions via pluggable providers with admin-only provider settings; chat with dataset and related datasets are dropped. |
| ANOM | Anomaly detection | One anomaly pipeline with list and resolve; healing recommendations are dropped. |
| RDM | Reference data management | External reference datasets and crosswalks used inside mappings. |
| API | Programmatic upload API & API tokens | Token lifecycle and token-authenticated vendor, internal and bulk uploads feeding the main pipeline. |
| ADM | Admin & system maintenance | System cleanup with re-authentication, app settings and profile retention; cache admin and debug endpoints are dropped. |
| SEC | Security middleware & secrets (cross-cutting) | One JWT middleware, resource-based project authorisation, Admin-role-only admin (D3), rate limits, headers, encryption and secrets loading. |
| OPS | Observability & health (cross-cutting) | Liveness and readiness that query the DB, authenticated operator metrics, logging; the Rust log service is dropped. |
| PLT | Platform bootstrap & infrastructure (cross-cutting) | Express assembly, DI, DB/Redis config, error handling, one deploy path with graceful shutdown; the backend/src app is dropped. |
| WEB | Frontend shell & shared UI (cross-cutting) | App router with UI gating that mirrors server permissions, auth context, one notification mechanism, one Help page. |
| MIG | Schema migrations: core (cross-cutting) | One versioned, transactional migration system with a baseline from the Jan_05 dumps confirmed against a fresh prod dump (D1). |
| MIGV | Schema migrations: vendor/audit/alerting (cross-cutting) | Vendor, agreement, approval, SLA, audit, ledger, alerting, digest and upload-API schema, folded into the single migration system. |
