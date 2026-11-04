# LIN - Data lineage

## Summary
Two separate lineage systems share the `/api/lineage*` prefix.
1. Table lineage: rows in `transformation_lineage`, one per mapping (pattern-based) or per processed file (file-specific). Served by `backend/routes/lineageRoutes.js`, plus a populate endpoint inline in `server.js`. Pages `/lineage` and `/lineage/impact/:fileId`.
2. Visual graph: a graph built at request time from vendor agreements, files, mappings, jobs and workflows by `server/services/lineageGraphService.js`, cached in Redis, with saved graphs in `visual_lineage_graphs`. Routes in `server/routes/lineageGraph.js`. Pages `/visual-lineage*`.
Not read in full: `lineageGraphService.js` (2.4k lines; only the entry function, dedupe, vendor traversal and incident enrichment were read) and the UI files.

## Entry points

### 1. POST /api/lineage/scan-and-populate (server.js:4927)
- Trigger: "scan" action in FileLineage.jsx (src/pages/FileLineage.jsx:74 calls `scanAndPopulateLineage`).
- Auth: `authenticateToken` only (server.js:4927). No role or permission check.
- Inputs: none.
- Logic:
  - Takes DISTINCT `mapping_id` from `transformation_jobs` where `status = 'completed'` and `mapping_id IS NOT NULL` (4938-4943).
  - For each, loads the mapping from `transformation_mappings`. If missing, skipped++ (4968-4971).
  - `transformation_id = 'transform_' + mapping_id` (4974).
  - Source = `source_file_pattern || ''`. Target = `target_file_name || 'output.' + (target_file_format || 'csv')` (4978-4980).
  - If a pattern-based row (or `lineage_type IS NULL`) exists for that transformation_id, UPDATE `input_file_id`, `output_file_id`, `lineage_type`, and `created_at = NOW()` (4984-5006).
  - Else if a `file-specific` row exists for the mapping_id, skip (5015-5028).
  - Else INSERT a `pattern-based` row (5031-5046).
- Output: `{success, summary:{totalMappingsProcessed, lineageCreated, lineageUpdated, lineageSkipped, errors}, errorDetails?}` (5077-5087). Per-mapping errors are counted and do not abort. Outer failure returns 500 `{success:false, error, details}`.
- Side effects: writes `transformation_lineage`. The pattern string is stored in the `input_file_id` and `output_file_id` columns, so those columns hold either a file id or a pattern.

### 2. GET /api/lineage/:fileId/pii-columns (backend/routes/lineageRoutes.js:36)
- Auth: mounted with `authenticateToken` (server.js:5217). No ownership or project check.
- Inputs: path `fileId`. Query `direction` (default `'both'`; `upstream`, `downstream` or `both`). The value is not validated; any other string filters to nothing (117-119).
- Logic: recursive CTE over `transformation_lineage`, matching `input_file_id = $1` (downstream) or `output_file_id = $1` (upstream), following the chain up to `depth < 10` (84). No cycle guard here (the pii-impact route has one).
- Output: `{success, file_id, direction, lineage[], total_transformations, total_pii_columns}`. Each lineage item carries the `column_mappings` entries where `contains_pii` is truthy, plus `pii_count` and `total_columns`.
- Error: 500 with `details: error.message`.

### 3. GET /api/lineage/:fileId/pii-impact (lineageRoutes.js:150)
- Auth: as above, with no ownership check.
- Inputs: `maxDepth` (default 5), passed as `parseInt(maxDepth)` with no upper bound (214).
- Logic:
  - Same chain walk, but only rows whose `column_mappings` contain an element with `contains_pii = true`.
  - Cycle guard via a `path` array (199).
  - `DISTINCT ON (id)` keeps the shallowest depth.
  - Left-joins `transformation_mappings` for `mapping_name` and `project_id`.
- Output: `impact_summary{total_transformations, total_files_impacted, upstream_transformations, downstream_transformations, max_depth_reached}`, `upstream[]`, `downstream[]`.
- `total_files_impacted = impactedFiles.size - 1` (254), which assumes the start file is always in the set.

### 4. GET /api/lineage/ (lineageRoutes.js:280)
- Auth: `authenticateToken` (server.js:5217). No project scoping: returns lineage for all projects.
- Logic:
  - `transformation_lineage` joined to mappings, vendor agreements and connections. `LIMIT 100`, `ORDER BY created_at DESC` (324-325). There is no pagination.
  - Computes `pii_column_count` and `pii_types`.
  - Source owner precedence (344-347): lineage `source_owner`, then connection config `owner`, then mapping `source_owner`, then vendor contact name or email.
  - Source path precedence (349-352): lineage `source_path`, then connection config `path`, then vendor drop path, then the directory part of `source_file_pattern`.
  - Target file type precedence (368-370): mapping `target_file_format`, then connection config `file_type`, then an extension guess.
  - Extension map (18-25): csv, json, xml, xlsx, xls (to XLSX), parquet.
- Output: `{success, transformation_lineage[], manual_lineage: [], total, timestamp}`. Cache headers are disabled (432-437). `manual_lineage` is a hard-coded empty placeholder (442).
- Side effects: none, apart from debug logging.

### 5. POST /api/lineage/bulk-delete (lineageRoutes.js:463)
- Auth: JWT, applied twice (server.js:5217 and the route). The caller must have permission `lineage:write` or `lineage:delete` in `req.user.permissions` (468-477), otherwise 403.
- Input: body `{lineageIds: []}`. Must be a non-empty array (400 otherwise). Each id must be an integer greater than 0.
- Output: `{success, message, deleted, notFound, total}`.
- Side effect: hard `DELETE FROM transformation_lineage WHERE id = ANY($1)` (499-502). No project scoping and no audit row (log only).
- Error: an invalid id throws inside the try, so it returns 500 and not 400 (490-496).

### 6. GET /api/lineage-graph/graph (server/routes/lineageGraph.js:23)
- Auth: `authenticateToken` only. The route mount in server.js:5226 adds no extra middleware.
- Inputs: `rootType` (one of `vendorAgreement`, `file`, `mapping`, `job`; line 36), `rootId` (both required, else 400), `projectId` (optional), `depth` (default 3), `includeIncidents` (default `'true'`).
- Cache: Redis key `lineage:graph:{rootType}:{rootId}:{projectId|all}:{depth}:{includeIncidents}`, TTL 600 s (45, 72). Redis failures are ignored.
- Build (service lineageGraphService.js:21-90):
  - Traverse from the root, tracking `visited`, and stop at `depth < 0`.
  - Add workflows for the mappings found.
  - Deduplicate nodes by `type:label` and edges by `source->target` (97-153).
  - Optionally enrich with quality incidents.
- Output: `{success, nodes, edges, metadata{rootType, rootId, projectId, depth, timestamp}, cached}`.
- The caller's project access is NOT checked here. `projectId` is only a filter: `($2::integer IS NULL OR f.project_id = $2)` (service:212). When it is omitted, nothing is project-scoped.
- Depth is `parseInt(depth)` with no maximum.
- Service row limits (the first two only apply to traversal from files and vendor agreements): files per agreement 100 (214), mappings per file 50 (341).
- Incidents (service:1420-1488):
  - Counts `quality_rule_violations` where `status != 'resolved'`.
  - `severity` of `critical` or `error` goes to `criticalCount`; anything else goes to `warningCount` (1462).
  - Failures are non-fatal.

### 7. GET /api/lineage-graph/node-detail (lineageGraph.js:111)
- Auth: JWT. Required: `nodeId` (query, URL-decoded) and `nodeType`.
- If `projectId` is given and the user is not an "all project access" user (`userHasAllProjectAccess`), the user must be a member of that project, else 403 (124-135). If `projectId` is omitted, no check is made.
- Output: `{success, node:{id, type, details}}`. 404 if `getNodeDetails` returns null.

### 8. GET /api/lineage-graph/node/:nodeId (lineageGraph.js:155)
- Same logic as entry 7, with `nodeId` taken from the path. The two are duplicates (see Flags).

### 9. POST /api/lineage-graph/export (lineageGraph.js:230)
- Auth: JWT. Body `{graph, format='json', filename}`; `graph.nodes` and `graph.edges` are required (400).
- `json` returns the posted graph as an attachment named `{filename || 'lineage-graph-<ISO timestamp with : and . replaced by ->'}.json`. `png` and `svg` return 501 (client-side). Anything else returns 400.
- `filename` goes into the Content-Disposition header unsanitised (247).

### 10. GET /api/lineage-graph/filters (lineageGraph.js:282)
- Auth: JWT. No project filtering despite the comment "user has access to" (286).
- Returns up to 100 each of: projects; active vendors (`status = 'active'`); active vendor agreements; files with `file_role = 'source'` (newest first).

### 11. DELETE /api/lineage-graph/cache (lineageGraph.js:354)
- Auth: JWT plus `req.user.roles` must include `'Admin'` (357-363), else 403.
- Deletes all `lineage:graph:*` keys. Uses `KEYS` (367). If Redis fails, it still returns success with a "not available" message.

### 12. GET /api/lineage-graph/saved (lineageGraph.js:406)
- Auth: JWT. Query `projectId`, `page` (1), `limit` (50, no upper cap).
- Returns only `is_active = true` rows, ordered by `updated_at DESC`, with `node_count`, `edge_count` and the creator and project names. Response is `{graphs, pagination{page, limit, total, totalPages}}`.
- No project or ownership filter when `projectId` is omitted.

### 13. GET /api/lineage-graph/saved/:id (lineageGraph.js:482)
- Auth: JWT. Returns an active graph, else 404. No ownership or project check.

### 14. POST /api/lineage-graph/saved (lineageGraph.js:523)
- Auth: JWT. Requires `name`, `rootType`, `rootId` (400 otherwise).
- `rootType` is not validated against the four valid values.
- `root_id` is stored as `parseInt(rootId)` (544).
- Defaults: `graphConfig = {depth: 3, includeIncidents: true}`, `graphData = {nodes: [], edges: []}`. `created_by` is the user id; `project_id` is optional.

### 15. PUT /api/lineage-graph/saved/:id (lineageGraph.js:572)
- Auth: JWT. No ownership check, so any user can edit any graph.
- Updatable fields: name, description, graphConfig, graphData. If none are sent, 400. Sets `updated_at`. 404 if the graph is missing or inactive.

### 16. DELETE /api/lineage-graph/saved/:id (lineageGraph.js:642)
- Auth: JWT. No ownership check. Soft delete (`is_active = false`, 647-651). 404 if not found.

### 17. POST /api/lineage-graph/saved/:id/refresh (lineageGraph.js:681)
- Auth: JWT. No ownership check.
- Rebuilds the graph using the saved `graph_config` (depth defaults to 3, `includeIncidents !== false`) and stores `{nodes, edges}` in `graph_data`.
- Uses the stored `project_id` as a filter. Does not use the Redis cache.
- Returns `{graph, freshData}`.

### Writers of `transformation_lineage` outside LIN routes (related)
- backend/services/jobExecutionEngine.js:4585-4622 inserts a `file-specific` row per processed file.
  - `output_file_id` is `transformed_${jobId}_${file.filename}`.
  - `input_file_id` is `file.file_id || 'source_' + filename`.
  - It also stores schema, `column_mappings`, owners, paths and `schema_fingerprint`.
- backend/services/TransformationService.js:122 inserts rows with only `transformation_id` and `input_file_id`. See UNCLEAR below.

### UI routes (src/App.jsx:383-387, per inventory)
- /lineage (FileLineage.jsx), /visual-lineage (LineageListPage.jsx), /visual-lineage/new and /:graphId (LineagePage.jsx), /lineage/impact/:fileId (LineageImpact.jsx). Page internals were not traced.

## Data touched
- `transformation_lineage`: read and written (columns used: id, transformation_id, mapping_id, input_file_id, output_file_id, execution_id, schema_fingerprint, lineage_type, source_schema, target_schema, column_mappings, source_owner, target_owner, source_path, target_path, source_agreement_name, created_at).
- Read: `transformation_jobs`, `transformation_mappings`, `vendor_agreements`, `vendors`, `transform_connections`, `files`, `projects`, `users`, `quality_rule_violations`, `quality_rules`.
- `visual_lineage_graphs`: read, written, soft-deleted.
- Redis keys `lineage:graph:*`.
- Permission strings: `lineage:write`, `lineage:delete`, `lineage:read` (granted in server.js:10346 and 10676; no route in this area checks `lineage:read`).

## Flags

### DUPLICATE
- `GET /node-detail` and `GET /node/:nodeId` carry identical logic (lineageGraph.js:111-146 and 155-220). The first exists to avoid slashes in path ids (comment 106-110).
- Pattern-based lineage is created by `scan-and-populate` (server.js:5031). File-specific lineage is created by jobExecutionEngine.js:4585. Both write the same table with different meanings in `input_file_id` and `output_file_id` (pattern versus file id).
- "Authenticated" is applied twice on bulk-delete (server.js:5217 and the route).
- A comment at server.js:4924 says lineage routes are handled in lineageRoutes.js, yet scan-and-populate lives in server.js. It is registered before the router mount, so it is reached first.

### BUG
- bulk-delete: an invalid id returns 500 and not 400 (lineageRoutes.js:490-496). `notFound` is computed from the raw array length, so duplicate ids inflate it (505).
- pii-columns: the recursive walk has no cycle guard and relies only on `depth < 10`, so cyclic data returns repeated rows (lineageRoutes.js:84).
- pii-columns and pii-impact: `(row.column_mappings || []).filter` assumes an array. If `column_mappings` was stored as a JSON string (jobExecutionEngine.js:4616 passes `JSON.stringify`), behaviour depends on the column type. UNVERIFIED, so see Open questions.
- Frontend `src/api/lineageService.js` calls routes that do not exist: `GET /lineage/:fileId` (30), `GET /lineage/:fileId/impact` (47), `POST /lineage` (68), `PUT /lineage/:id` (84), `DELETE /lineage/:id` (99). No handler for them was found in lineageRoutes.js or server.js.
- `scan-and-populate` update sets `created_at = NOW()` on existing rows (server.js:4997), which loses the original creation time.
- Saved graph `root_id` is stored with `parseInt(rootId)` (lineageGraph.js:544), but `rootType` `vendorAgreement`/`file` ids are used elsewhere as strings. Non-numeric ids (e.g. mapping ids such as `vm-5-synthetic`, service:2293) would become NaN. UNVERIFIED.
- `GET /api/lineage/` logs with `console.error` on every call (282, 328), and two info logs of sample rows follow (397, 418).

### DEAD
- `manual_lineage` is always `[]` (lineageRoutes.js:442).
- The saved-graph PNG/SVG export branch always returns 501 (lineageGraph.js:251-258).
- Frontend functions `getFileLineage`, `getImpact`, `createLineage`, `updateLineage`, `deleteLineage` call missing routes (see BUG). Whether anything imports them was not checked.

### SECURITY
- No project or ownership check on `GET /api/lineage/`, `/:fileId/pii-columns`, `/:fileId/pii-impact`, `scan-and-populate`. Any authenticated user sees lineage (including PII column names and types) for all projects.
- `GET /graph`: project membership is never verified. Omitting `projectId` returns the unscoped graph (lineageGraph.js:23-96), and the cache key is shared across users.
- Saved graph GET, PUT, DELETE and refresh have no ownership or project check (lineageGraph.js:482-733). `/saved` list shows all projects' graphs when `projectId` is omitted.
- `/filters` lists all projects, vendors and files regardless of user access (282-327).
- `scan-and-populate` has no role or permission check, yet it rewrites lineage for all mappings.
- `Content-Disposition` is built from the user-supplied `filename` (247). Header injection or odd filenames are possible.
- Error responses return `error.message` as `details` (all routes).
- Redis `KEYS` is used on cache clear (367), a blocking operation on large keyspaces.

### UNCLEAR
- `TransformationService.js:105-127` creates `transformation_lineage` with a foreign key to `transformations` if absent, in a different shape from createTransformationTables.js. Whether this path is reachable was not determined.
- Rows with `lineage_type IS NULL` are treated as pattern-based (server.js:4987), but the migration default is `'file-specific'` (createTransformationTables.js:81). Which rows are NULL is unknown.
- `depth` semantic: traversal checks `depth < 0`, so depth 3 yields up to four levels (service:159, 249, 583). Intended meaning unknown.
- `enrichWithIncidents` looks up `file-${id}` or `job-${id}` in a map and matches `node.id`. The node id formats for files and jobs were not checked here, so whether incidents attach is unverified (service:1448, 1477).

## Domain terms
- Lineage, transformation lineage, file lineage, "visual lineage", "lineage graph", "saved lineage graph".
- pattern-based vs file-specific lineage (`lineage_type`).
- `input_file_id` and `output_file_id`, reported as source/target file id; also the source file pattern and target file name.
- transformation_id (`transform_<mapping_id>`) and mapping_id. Synthetic ids of the form `vm-{id}-synthetic` appear for "VM" (visual mapping) definitions.
- Node types: vendorContract, sourceFile, transformation, job, derivedColumn, targetTable. Root types: vendorAgreement, file, mapping, job.
- Vendor agreement and agreement code, drop location. PII column, `contains_pii`, `pii_type`. Upstream and downstream (also flow_direction). Incident (a quality rule violation).
- `column_mappings` (lineage table) versus `field_mappings` (mapping table).

## Open questions
1. Are the frontend calls to `/lineage/:fileId`, `/impact`, POST, PUT and DELETE `/lineage/:id` made by any page? There is no handler for them.
2. What is the stored type of `column_mappings`: jsonb or text? (The writer stringifies it.)
3. Does `LineageImpact.jsx` call `/pii-impact` or something else?
4. What do node ids look like for files and jobs, so that incidents attach correctly?
5. Is the intended depth 3 levels or 4?
6. Is the `TransformationService` lineage insert reachable, and does it conflict with the main table definition?
7. Is open project visibility on lineage intended, or is it a gap?
8. Are `lineage:read`, `lineage:write` and `lineage:delete` granted to roles anywhere beyond server.js:10346 and 10676? No route checks `lineage:read`.
9. What does the rest of `lineageGraphService.js` (traversal beyond vendor agreements, workflows, derived columns, node details) apply as rules? Not read.
