---
id: REQ-ING-005
title: Resolve the effective drop location for an upload or drop
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ING-004]
contracts: []
priority: must
---
# REQ-ING-005: Resolve the effective drop location for an upload or drop

## Context
A drop location is the connection plus path where a project's or agreement's files land. Today the term has three meanings: per-project settings, one global configuration, and an agreement's connection plus path. Only the per-project settings gate uploads, contract uploads skip the check, and the drop path checks the project but writes to the global configuration. Under D8, a drop location is a connection plus a path set on the project, with an optional sub-project override; an agreement names a sub-path under its project's drop location; the global configuration is retired. Configuring these values belongs to the project and agreement areas; this requirement covers how ingestion resolves and enforces them.

## Requirements
1. When an upload or drop is accepted, the system shall resolve one effective drop location: a connection, a bucket (or container) and a path.
2. Where the sub-project of the request has its own drop location connection, the system shall use the sub-project's connection, bucket and path.
3. Where the sub-project has no drop location connection, or no sub-project is involved, the system shall use the parent project's connection, bucket and path.
4. Where the upload or drop names a vendor agreement, the system shall append the agreement's sub-path to the resolved path.
5. The system shall join path segments with single `/` separators, without leading or trailing `/`.
6. If no drop location connection is set on the sub-project or its parent project, then the system shall reject the request with 400, code `DROP_LOCATION_CONNECTION_MISSING`, error "Upload not configured" and the message: File uploads are not enabled for project "<project name>". An administrator must configure a File Drop Location for this project.
7. If the resolved connection no longer exists or is not enabled, then the system shall reject the request with 400 and code `DROP_LOCATION_UNAVAILABLE`.
8. The system shall attach the resolved drop location to the processing job of every accepted file, so that processing writes the file only there.
9. The system shall not use any system-wide drop location.
10. The system shall not return connection credentials when it reports or records the drop location.

## Acceptance criteria
- **AC-1**: Given project 30 with connection C1, bucket `acme-data` and path `inbound/claims`, and no sub-project, When a file is uploaded to project 30, Then its job targets C1, `acme-data`, `inbound/claims`. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-2**: Given project 30 as above and sub-project 31 with connection C2, bucket `acme-sub` and path `sub/in`, When a file is uploaded to sub-project 31, Then its job targets C2, `acme-sub`, `sub/in`. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-3**: Given sub-project 31 with no connection and parent project 30 as above, When a file is uploaded to sub-project 31, Then its job targets C1, `acme-data`, `inbound/claims`. <!-- source: cross-cutting.md#7-resolved-decisions -->
- **AC-4**: Given project 30 as above and agreement 5 of project 30 with sub-path `/vendor-x/`, When a contract upload or drop names agreement 5, Then the job's path is `inbound/claims/vendor-x`. <!-- source: cross-cutting.md#7-resolved-decisions -->
- **AC-5**: Given project "Claims" with no drop location connection, When a member uploads to it, Then the response is 400 `DROP_LOCATION_CONNECTION_MISSING` with message File uploads are not enabled for project "Claims". An administrator must configure a File Drop Location for this project. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-6**: Given project "Claims" with no drop location connection, When a contract upload names an approved agreement of "Claims", Then the response is 400 `DROP_LOCATION_CONNECTION_MISSING`, not an accepted upload. <!-- source: areas/ING.md#security -->
- **AC-7**: Given project 30's connection C1 has been disabled, When a member uploads to project 30, Then the response is 400 `DROP_LOCATION_UNAVAILABLE` and no file record is created. <!-- source: cross-cutting.md#7-resolved-decisions -->
- **AC-8**: Given any rejection here, When the response is returned, Then it contains no access key, secret, account key or service-account content. <!-- source: areas/ING.md#security -->

## Out of scope
- Setting a project's or sub-project's drop location (project area) and an agreement's sub-path (agreement area).
- Writing the file to the drop location (processing area), including support for aws, gcp and azure connections.
- Confinement of a vendor's folder under the agreement sub-path (REQ-ING-024).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: at most three lookups (sub-project, project, connection) per request.

## Edge cases and errors
- Path set to an empty string on the project: the files land at the root of the bucket.
- Agreement sub-path empty: the project path is used unchanged.
- Connection changed between acceptance and processing: the job keeps the location resolved at acceptance (see Open questions).

## Open questions
- Today contract uploads are never written to any drop location. Confirm that under D8 contract uploads must have a project drop location and land under the agreement sub-path.
- If the connection is changed or disabled after a file was accepted but before processing writes it, should processing use the location resolved at acceptance or fail the file?
- Which connection types can serve as drop locations? Agreements today may point at connections of type `vendor`, whose credentials have a different shape (CONN/PROC).
- Does an agreement belong to a sub-project, and if so does the sub-project override apply to its drops?
