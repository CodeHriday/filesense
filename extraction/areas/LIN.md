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
- No UI caller: `getPIIColumns` (src/api/lineageService.js:144) is not used in src/.

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
- No UI caller: `getPIIImpact` (src/api/lineageService.js:162) is not used in src/.

### 4. GET /api/lineage/ (lineageRoutes.js:280)
- Auth: `authenticateToken` (server.js:5217). No project scoping: returns lineage for all projects. The inventory lists its auth as "-" but it is mounted with JWT (server.js:5217).
- Logic:
  - `transformation_lineage` joined to mappings, vendor agreements and connections. `LIMIT 100`, `ORDER BY created_at DESC` (324-325). There is no pagination.
  - Computes `pii_column_count` and `pii_types`.
  - Source owner precedence (344-347): lineage `source_owner`, then connection config `owner`, then mapping `source_owner`, then vendor contact name or email.
  - Source path precedence (349-352): lineage `source_path`, then connection config `path`, then vendor drop path, then the directory part of `source_file_pattern`.
  - Target file type precedence (368-370): mapping `target_file_format`, then connection config `file_type`, then an extension guess.
  - Extension map (18-25): csv, json, xml, xlsx, xls (to XLSX), parquet.
- Output: `{success, transformation_lineage[], manual_lineage: [], total, timestamp}`. Cache headers are disabled (432-437). `manual_lineage` is a hard-coded empty placeholder (442). Each row also carries derived fields `source_file_type`, `agreement_name`, `source_filename` and `target_filename` (354-357, 375-376).
- Side effects: none, apart from debug logging.

### 5. POST /api/lineage/bulk-delete (lineageRoutes.js:463)
- Auth: JWT, applied twice (server.js:5217 and the route). The caller must have permission `lineage:write` or `lineage:delete` in `req.user.permissions` (468-477), otherwise 403. The check is a plain `includes` (469-470), so a wildcard permission does not pass. Only `lineage:write` is granted anywhere (seedProductionManual.sql and the Admin role in backend/src/migrations/index.js:143; see Data touched), so in practice that is the one needed.
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
  - Add workflows for the mappings found. `findWorkflowsForMappings` (service:1145-1335) scans every active `visual_workflows` row (all projects when `projectId` is null) and matches mappings by numeric id, string id, `vm-N` id or label.
  - Deduplicate nodes by `type:label` and edges by `source->target` (97-153).
  - Optionally enrich with quality incidents.
- Traversal details:
  - `traverseFromFile` (364-576) has a VM (visual mapping) fallback using `file_audit_details` and `visual_mapping_defs`; it creates synthetic `[VM] ` transformation nodes (mapping id `vm-${vm_id}-synthetic`, service:403) and `targetFile` nodes. It reads `column_governance_tag_assignments` (tag `tag_pii`, service:274) for `piiColumns`.
  - `traverseFromMapping` (582-789) adds derived-column nodes, chooses `targetFile` or `targetTable`, and adds last job stats. A mapping-rooted graph never goes upstream to source files. It deliberately adds no job nodes (655-658).
  - `traverseFromJob` (794-926) builds `job-${job_id}` nodes (797). Its target-file branch emits `target-${files.id}` nodes of type `targetTable` (854, 871), and a `table-${job.target_table_name}` node at 897.
- Output: `{success, nodes, edges, metadata{rootType, rootId, projectId, depth, timestamp}, cached}`.
- The caller's project access is NOT checked here. `projectId` is only a filter: `($2::integer IS NULL OR f.project_id = $2)` (service:212). When it is omitted, nothing is project-scoped.
- Depth is `parseInt(depth)` with no maximum.
- Service row limits (the first two only apply to traversal from files and vendor agreements): files per agreement 100 (214), mappings per file 50 (341).
- Incidents (service:1420-1488):
  - Counts `quality_rule_violations` where `status != 'resolved'`.
  - `severity` of `critical` or `error` goes to `criticalCount`; anything else goes to `warningCount` (1462).
  - Only `sourceFile` and `job` nodes are considered (1423-1424); ids are `file-${files.id}` (service:251) and `job-${job_id}` (797).
  - Failures are non-fatal.

### 7. GET /api/lineage-graph/node-detail (lineageGraph.js:111)
- Auth: JWT. Required: `nodeId` (query, 400 if missing, line 115; URL-decoded with `decodeURIComponent`, line 117) and `nodeType`.
- If `projectId` is given and the user is not an "all project access" user (`userHasAllProjectAccess`), the user must be a member of that project, else 403 (124-135). If `projectId` is omitted, no check is made.
- Output: `{success, node:{id, type, details}}`. 404 if `getNodeDetails` returns null.
- `getNodeDetails` (service:1493-2371) handles vendorContract, sourceFile, transformation (with a VM branch), job, targetFile, targetTable, workflow and grouped. There is no `derivedColumn` case, so that type returns null and the route answers 404 (default branch, 2365). The `vendorContract` (1498-1511), `sourceFile` (1514-1540, `WHERE f.id = $1::integer`), `job` (1958-1968), `targetTable` (2317-2325) and `workflow` (2342-2352) lookups ignore `projectId`, so five types bypass the route's project check; only `transformation` and `targetFile` are scoped. The `targetTable` case strips `table-` (2315), but `traverseFromJob` emits `target-<id>` nodes of type `targetTable` (854, 871), so detail for those nodes returns null and the route answers 404.

### 8. GET /api/lineage-graph/node/:nodeId (lineageGraph.js:155)
- Same logic as entry 7, with `nodeId` taken from the path (157). It does not require `nodeId` explicitly and does not call `decodeURIComponent`. The two are near-duplicates (see Flags).

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
- NaN `page`/`limit` give 500 (409-429).

### 13. GET /api/lineage-graph/saved/:id (lineageGraph.js:482)
- Auth: JWT. Returns an active graph, else 404. No ownership or project check. A non-numeric `:id` gives 500 (pg cast error), not 404 (486-495).

### 14. POST /api/lineage-graph/saved (lineageGraph.js:523)
- Auth: JWT. Requires `name`, `rootType`, `rootId` (400 otherwise).
- `rootType` is not validated against the four valid values.
- `root_id` is stored as `parseInt(rootId)` (544) into `root_id int4 NOT NULL` (FileSence_prod_schema_Jan_05_1767780691950.sql:6997). Non-numeric ids give 500 (see BUG).
- Defaults: `graphConfig = {depth: 3, includeIncidents: true}`, `graphData = {nodes: [], edges: []}`. `created_by` is the user id; `project_id` is optional (`projectId ? parseInt(projectId) : null`, 548) and is taken from the body with no membership check, so any user can save into any project. `parseInt("12abc")` yields 12, so a partly numeric `rootId` is silently truncated.

### 15. PUT /api/lineage-graph/saved/:id (lineageGraph.js:572)
- Auth: JWT. No ownership check, so any user can edit any graph.
- Updatable fields: name, description, graphConfig, graphData. If none are sent, 400. Sets `updated_at`. 404 if the graph is missing or inactive.

### 16. DELETE /api/lineage-graph/saved/:id (lineageGraph.js:642)
- Auth: JWT. No ownership check. Soft delete (`is_active = false`, 647-651). 404 if not found.

### 17. POST /api/lineage-graph/saved/:id/refresh (lineageGraph.js:681)
- Auth: JWT. No ownership check.
- Rebuilds the graph using the saved `graph_config` (depth defaults to 3, `includeIncidents !== false`) and stores `{nodes, edges}` in `graph_data`.
- Uses the stored `project_id` as a filter. Does not use the Redis cache.
- Passes the integer `root_id` to the traversal, so mapping-id (text) and `vm-N-synthetic` roots cannot be refreshed. The UPDATE does not re-check `is_active` (710-715); `config.depth || 3` turns depth 0 into 3 (705).
- Returns `{graph, freshData}`.

### Writers of `transformation_lineage` outside LIN routes (related)
- backend/services/jobExecutionEngine.js:4585-4622 inserts a `file-specific` row per processed file.
  - `output_file_id` is `transformed_${jobId}_${file.filename}`.
  - `input_file_id` is `file.file_id || 'source_' + filename`.
  - It also stores schema, `column_mappings`, owners, paths and `schema_fingerprint`.
- backend/services/jobExecutionEngine.js:4426-4441 UPDATEs an existing file-specific row (same schema fingerprint) instead of inserting: sets `created_at = NOW()`, `execution_id`, `output_file_id = transformed_${jobId}_${file.filename}` and `column_mappings = JSON.stringify(columnMappings)`. `file.file_id` is always null for engine rows: `matchingFiles` is built with `file_id: null` (jobExecutionEngine.js:1488-1493), and the only `processFile` caller is the loop at :2100. So engine rows get `source_<filename>` and `transformed_<jobId>_<filename>` ids; one row's `output_file_id` therefore never equals another row's `input_file_id`, and the recursive CTEs of pii-columns and pii-impact cannot chain past depth 1 for engine rows. Pattern-based rows hold pattern strings, which also never equal a file id.
- backend/services/jobExecutionEngine.js:4361-4392 and :4473-4500 hold a "chained transformation" PII inheritance that reads `transformation_lineage WHERE output_file_id = file.file_id`, guarded by `&& file.file_id` (4361, 4473). The guard is never true, so that code never runs (see DEAD).
- backend/services/TransformationService.js:122 inserts rows with only `transformation_id` and `input_file_id`. `output_file_id` is `text NOT NULL` in prod (FileSence_prod_schema_Jan_05_1767780691950.sql:3703), so on that table the insert would fail. The only reference to the service in server.js is `GET /api/test-di` (server.js:1228-1250), which only counts methods and does not call the insert.
- backend/routes/adminCleanupRoutes.js:517 runs `DELETE FROM transformation_lineage RETURNING id` (all rows); :179 counts the table.
- A third store, `file_lineage` (created in backend/src/migrations/index.js:104), is written by backend/src/services/transformations.js:230 and backend/src/repositories/transformationRepository.js:155,239 (deleted at transformations.js:199,254 and transformationRepository.js:232,278). No LIN route serves it.

### UI routes (src/App.jsx:383-387, per inventory)
- /lineage (FileLineage.jsx), /visual-lineage (LineageListPage.jsx), /visual-lineage/new and /:graphId (LineagePage.jsx), /lineage/impact/:fileId (LineageImpact.jsx). Page internals were not traced, except that LineageImpact.jsx:11,34 imports and calls `getImpactAnalysis` (see DEAD).

## Data touched
- `transformation_lineage`: read and written (columns used: id, transformation_id, mapping_id, input_file_id, output_file_id, execution_id, schema_fingerprint, lineage_type, source_schema, target_schema, column_mappings, source_owner, target_owner, source_path, target_path, source_agreement_name, created_at). Schema: `output_file_id text NOT NULL` (:3703), `column_mappings jsonb DEFAULT '[]'` (:3711) in FileSence_prod_schema_Jan_05_1767780691950.sql.
- Read: `transformation_jobs`, `transformation_mappings`, `vendor_agreements`, `vendors`, `transform_connections`, `files`, `projects`, `users`, `quality_rule_violations`, `quality_rules`.
- Also read: `column_governance_tag_assignments` (service:274, 862 and others), `visual_workflows`, `visual_mapping_defs`, `visual_mapping_executions`, `file_audit_details` (service:364-576, 1145-1335).
- `visual_lineage_graphs`: read, written, soft-deleted. `root_id int4 NOT NULL` (FileSence_prod_schema_Jan_05_1767780691950.sql:6997).
- `file_lineage`: written by transformations.js and transformationRepository.js (see related writers).
- Redis keys `lineage:graph:*`.
- Permission strings: `lineage:read` is the only one granted in server.js (10346, 10676, the Executor core list); no route in this area checks it. `lineage:write` appears in backend/scripts/seedProductionManual.sql:32,60,78 and is also granted to the Admin role in backend/src/migrations/index.js:143. `lineage:delete` is granted nowhere in the repo.

## Flags

### DUPLICATE
- `GET /node-detail` and `GET /node/:nodeId` carry near-identical logic (lineageGraph.js:111-146 and 155-220). The first exists to avoid slashes in path ids (comment 106-110). Difference: only `/node-detail` requires `nodeId` (400, line 115) and runs `decodeURIComponent` (117), which throws on malformed input and gives 500.
- Pattern-based lineage is created by `scan-and-populate` (server.js:5031). File-specific lineage is created by jobExecutionEngine.js:4585. Both write the same table with different meanings in `input_file_id` and `output_file_id` (pattern versus file id).
- Three lineage stores: `transformation_lineage`, `visual_lineage_graphs` (derived graph) and `file_lineage` (transformations.js:230, transformationRepository.js:155).
- "Authenticated" is applied twice on bulk-delete (server.js:5217 and the route).
- A comment at server.js:4924 says lineage routes are handled in lineageRoutes.js, yet scan-and-populate lives in server.js. It is registered before the router mount, so it is reached first.

### BUG
- bulk-delete: an invalid id returns 500 and not 400 (lineageRoutes.js:490-496). `notFound` is computed from the raw array length, so duplicate ids inflate it (505).
- pii-columns: the recursive walk has no cycle guard and relies only on `depth < 10`, so cyclic data returns repeated rows (lineageRoutes.js:84).
- (Withdrawn, not a bug.) `column_mappings` is `jsonb` in prod (FileSence_prod_schema_Jan_05_1767780691950.sql:3711), so pg returns an array and the `.filter` calls in pii-columns and pii-impact work even though the writer passes `JSON.stringify` (jobExecutionEngine.js:4616).
- Frontend `src/api/lineageService.js` calls routes that do not exist: `GET /lineage/:fileId` (30), `GET /lineage/:fileId/impact` (47), `POST /lineage` (68), `PUT /lineage/:id` (84), `DELETE /lineage/:id` (99). No handler for them was found in lineageRoutes.js or server.js.
- `scan-and-populate` update sets `created_at = NOW()` on existing rows (server.js:4997), which loses the original creation time. The engine UPDATE does the same (jobExecutionEngine.js:4428).
- Saved graph `root_id` is stored with `parseInt(rootId)` (lineageGraph.js:544) into `root_id int4 NOT NULL` (prod schema Jan_05 :6997). Non-numeric ids (mapping ids, `vm-N-synthetic` at service:2293) become NaN and the insert fails with 500. Saved graphs are effectively limited to numeric root ids (agreement, file, numeric job); refresh passes the integer `root_id` to the traversal. `parseInt("12abc")` truncates to 12 (544). No CHECK on `root_type` in prod.
- Saved graph routes with a non-numeric `:id` give 500, not 404 (486-495). NaN `page`/`limit` (409-429) and NaN `maxDepth` (pii-impact, 214) also give 500.
- `traverseFromJob` emits `target-${files.id}` nodes of type `targetTable` (service:854, 871), but `getNodeDetails` strips `table-` for that type (2315), so node-detail for those nodes returns null and 404.
- `GET /api/lineage/` logs with `console.error` on every call (282, 328), and two info logs of sample rows follow (397, 418).
- Engine-written lineage rows cannot chain: with `file.file_id` always null (jobExecutionEngine.js:1488-1493), `output_file_id` of one row never equals the `input_file_id` of the next, so pii-columns and pii-impact stop at depth 1 for them.
- `TransformationService.js:122` insert omits the NOT NULL `output_file_id` (prod schema Jan_05 :3703) and would fail on the real table.

### DEAD
- `manual_lineage` is always `[]` (lineageRoutes.js:442).
- The `png` and `svg` formats of `POST /export` always return 501 (lineageGraph.js:251-258); this is not a saved-graph feature.
- Frontend functions `getFileLineage`, `getImpactAnalysis`, `createLineage`, `updateLineage`, `deleteLineage` call missing routes (see BUG). `LineageImpact.jsx:11,34` imports and calls `getImpactAnalysis` (lineageService.js:45), which calls non-existent `GET /lineage/:fileId/impact`, so the `/lineage/impact/:fileId` page is broken.
- `getPIIColumns` (lineageService.js:144) and `getPIIImpact` (:162) have no callers in src/, so pii-columns and pii-impact are API-only. Among the table-lineage client functions, `bulkDeleteLineage` (LineageTable.jsx:73) is used, plus `getLineages` (FileLineage.jsx:12,31; LineageGraph.jsx:106) and `scanAndPopulateLineage` (FileLineage.jsx:74).
- The "chained transformation" PII inheritance in jobExecutionEngine.js:4361-4392 and :4473-4500 is gated on `file.file_id`, which is always null (1488-1493), so it never runs. Column PII on engine rows is therefore never inherited from upstream lineage.
- The `TransformationService` lineage insert is not invoked by `/api/test-di` (server.js:1228-1250).

### SECURITY
- No project or ownership check on `GET /api/lineage/`, `/:fileId/pii-columns`, `/:fileId/pii-impact`, `scan-and-populate`. Any authenticated user sees lineage (including PII column names and types) for all projects.
- `GET /graph`: project membership is never verified. Omitting `projectId` returns the unscoped graph (lineageGraph.js:23-96), and the cache key is shared across users.
- Saved graph GET, PUT, DELETE and refresh have no ownership or project check (lineageGraph.js:482-733). POST /saved takes `projectId` from the body with no membership check (525, 548). `/saved` list shows all projects' graphs when `projectId` is omitted.
- `/filters` lists all projects, vendors and files regardless of user access (282-327).
- `scan-and-populate` has no role or permission check, yet it rewrites lineage for all mappings.
- `Content-Disposition` is built from the user-supplied `filename` (247). Header injection or odd filenames are possible.
- LIN does not use the `requireProjectAccess` middleware. The only project check is on node-detail and node/:nodeId, and it runs only if the client sends `projectId` (lineageGraph.js:124-135, 168-173).
- Project-filter gaps: the `transformation_jobs` branch of `traverseFromJob` (794-926) has no project filter, neither in the job lookup (802-810) nor in the target-file lookup (844-850), so a job-rooted graph on that branch leaks across projects even when `projectId` is given (`traverseFromVmJobExecution` is project-filtered, at 968 and 1090); vendor agreements are never project filtered (166-174, only their files are); `findWorkflowsForMappings` (1145-1335) filters by project (1200) and scans all active `visual_workflows` only when `projectId` is null; `getNodeDetails` for `vendorContract`, `sourceFile`, `job`, `targetTable` and `workflow` ignores `projectId` (five types).
- `adminCleanupRoutes.js:517` deletes every `transformation_lineage` row (auth of that route belongs to another area).
- Error responses return `error.message` as `details` (all routes).
- Redis `KEYS` is used on cache clear (367), a blocking operation on large keyspaces.

### UNCLEAR
- Rows with `lineage_type IS NULL` are treated as pattern-based (server.js:4987), but the migration default is `'file-specific'` (createTransformationTables.js:81). Which rows are NULL is unknown.
- `depth` semantic: traversal checks `depth < 0`, so depth 3 yields up to four levels (service:159, 249, 583). Intended meaning unknown.
- Resolved: node ids are `file-${files.id}` (service:251) and `job-${job_id}` (797). Incident enrichment only considers `sourceFile` and `job` nodes (1423-1424), never `targetFile` or `targetTable`. `quality_rule_violations.file_id` and `job_id` are varchar (prod schema Jan_05 :5753-5754) and getNodeDetails joins `qrv.file_id = f.id::text`. Job nodes exist only when the root type is `job`.
- `TransformationService.js:105-127` creates `transformation_lineage` with a foreign key to `transformations` if absent, in a different shape from createTransformationTables.js. The prod dump (Jan_05 :3699-3719) shows no FK. The service is only referenced by `/api/test-di` (server.js:1228-1250); its controller mount is commented out in backend/integration.js:27-33 and server.js mounts backend/routes/transformations instead.

## Domain terms
- Lineage, transformation lineage, file lineage, "visual lineage", "lineage graph", "saved lineage graph".
- pattern-based vs file-specific lineage (`lineage_type`).
- `input_file_id` and `output_file_id`, reported as source/target file id; also the source file pattern and target file name.
- transformation_id (`transform_<mapping_id>`) and mapping_id. Synthetic ids of the form `vm-{id}-synthetic` appear for "VM" (visual mapping) definitions.
- Node types: vendorContract, sourceFile, transformation, job, derivedColumn, targetTable, targetFile (service:538, 729), workflow (1266), grouped (handled only in getNodeDetails, 2355). Root types: vendorAgreement, file, mapping, job.
- Node id formats: `file-<files.id>`, `job-<job_id>` (service:251, 797).
- Vendor agreement and agreement code, drop location. PII column, `contains_pii`, `pii_type`. Upstream and downstream (also flow_direction). Incident (a quality rule violation).
- `column_mappings` (lineage table) versus `field_mappings` (mapping table).

## Open questions
1. Are the frontend calls to `/lineage/:fileId`, POST, PUT and DELETE `/lineage/:id` made by any page? There is no handler for them. (`/impact` is called by LineageImpact.jsx, see DEAD.)
2. Is the intended depth 3 levels or 4?
3. Is open project visibility on lineage intended, or is it a gap?
4. Is `lineage:delete` meant to be granted to any role? It is granted nowhere in the repo.
