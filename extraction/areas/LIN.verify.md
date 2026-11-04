# LIN verify (final, after fix round 2)

Verdict: PASS
Counts: checked 52, wrong 0, unsupported 0, missing 0.

## Coverage
All 17 routes in inventory (server.js:4927; lineageRoutes.js:36/150/280/463; lineageGraph.js:23/111/155/230/282/354/406/482/523/572/642/681) and the 4 UI routes (App.jsx:383-387) have subsections. Nothing missing.

## Round-2 items
- lineage:write Admin grant, backend/src/migrations/index.js:143: CORRECT. Line 143 is `VALUES ('Admin', '[... "lineage:read","lineage:write" ...`. Role name confirmed as Admin. There is no lineage:delete anywhere in the repo.
- findWorkflowsForMappings project filter: CORRECT. `($1::integer IS NULL OR vw.project_id = $1)` at service:1200 (query params at 1201).
- traverseFromVmJobExecution filtered: CORRECT (968, 1090).
- traverseFromJob gap: CORRECT. The job lookup (802-810) and target-file lookup (844-850) have no project filter.
- "per verifier" cites replaced: all CORRECT.
  - jobExecutionEngine.js:1488-1493 builds matchingFiles with `file_id: null`; it is the only assignment of matchingFiles; the only processFile call is :2100.
  - lineageGraph.js:705 `config.depth || 3`; :710-715 refresh UPDATE has no is_active re-check.
  - :409-429 NaN page/limit go into the SQL params and give 500.
  - :486-495 non-numeric id gives a pg cast error and 500.
  - OQ 5 closure is consistent.
- Controller mount commented out, backend/integration.js:27-33: CORRECT.
- getNodeDetails sourceFile (1514-1540) has `WHERE f.id = $1::integer` with no project filter. vendorContract (1498-1511), job (1958-1968, not re-read in detail), targetTable (2317-2325) and workflow (2342-2352) also ignore projectId. Five unscoped types: CORRECT.
- Chained PII dead (jobExecutionEngine.js:4361-4392, 4473-4500): CORRECT. Guarded by `&& file.file_id`, which is always null.
- target-<id> 404: CORRECT. traverseFromJob emits `target-${id}` as type targetTable (854, 871). getNodeDetails strips only `table-` (2315), queries `target_table_name = 'target-N'`, finds nothing, returns null, and the route answers 404.
- POST /saved: CORRECT. No membership check on body projectId (548). `parseInt(rootId)` at 544 truncates "12abc" to 12 and gives NaN, hence 500, for non-numeric ids.

## Other claims checked (all CORRECT)
- Route auth and mounts: server.js:5217 (JWT on lineage router), 5226 (no extra middleware on lineage-graph), 4924 comment, 4927.
- scan-and-populate: lineage_type IS NULL handling (4987) and the skip when a file-specific row exists (5014-5028).
- bulk-delete: includes() permission check (468-477); the invalid-id throw is inside the try so it gives 500 (490-496); notFound uses the raw length (505).
- pii-columns: depth < 10 (84), no cycle guard, direction filter (117-119).
- pii-impact: path cycle guard (199), parseInt(maxDepth) (214), `size - 1` (254).
- /graph: validRootTypes (36), cache key (45), TTL 600 (72), parseInt(depth) with no maximum.
- node-detail: decodeURIComponent (117), project check only if projectId is sent (124-135), duplicate of node/:nodeId.
- export: Content-Disposition unsanitised (247), png/svg 501 (251-258), default 400.
- filters: no project filter (286-327).
- cache clear: Admin role check (357-363), KEYS (367), success even when Redis fails.
- saved: list, get, put and delete behave as described, including soft delete.
- Engine writers: update at 4426-4441; insert at 4584-4622 (note cites 4585); source_ and transformed_ ids at 4609-4610.

## Whole-file rewrite
Nothing lost. Flags, open questions and data-touched lists are complete and consistent with the code.

## Residual (not wrong)
The job case in getNodeDetails (1958-1968) was not re-read line by line; it is assumed unscoped, consistent with the grep of project_id uses, which shows none in that range.
