# XFM - Transformation engine & expression language

## Summary
The live part of this area is two pure libraries called by `jobExecutionEngine.js` (area EXE): `backend/services/expressionParser.js` turns a mapping expression string into a (sourceFields, transformations) pair, and `backend/services/transformationEngine.js` applies those per row (`transformRow`). No HTTP endpoint belongs to this area that is actually mounted. Everything else here (transformationRoutes + controller + `TransformationService`, `asyncTransformationService`, the `backend/src/*` transformation stack, `DBTService`) is unreachable or broken (see Flags). Callers of the engine: `jobExecutionEngine.js:3315, 3578, 3683, 5089, 5172, 5228, 5301, 5511` (all `transformRow(row, convertedMappings, convertedVariables, rdmContext)`); converters `convertFieldMappings` (`jobExecutionEngine.js:4834`) and `convertVariables` (`:4970`) are the only users of the parser (`:4839`, `:4975`).

## Entry points

### EP1. transformRow (library, live)
- Trigger: in-process call from job execution (`jobExecutionEngine.js:3315` etc.). Also re-run after multi-source join (`:3543-3578`) and after crosswalk enrichment (`:3662-3683`), i.e. on rows that were already transformed.
- Auth: none (library).
- Inputs: `row`, `fieldMappings[{targetField, sourceFields[], transformations[{type, params}]}]`, `variables[{name, sourceFields, transformations, data_type}]`, `context` (carries `rdm`) (`transformationEngine.js:946`).
- Output: new object keyed by `targetField` (`:1015-1067`).
- Rules:
  - Empty or missing `fieldMappings` returns the input row untouched, variables are ignored (`:948-950`).
  - Variables are evaluated first, in array order; each may use earlier ones (`:956-1012`). Result stored as `row["$name"]` and `row[name]` (`:1009-1010`), so a variable overwrites a source column of the same name in the enriched row.
  - Variable `data_type`, if non-empty, is applied with `cast` (`:1003-1005`).
  - Per mapping: if the first transformation is `concat`, `coalesce`, or a `math_*` whose `params.mathParts.length >= 2`, the whole enriched row is passed in as the value (`:1031-1039`). Otherwise the value is `enrichedRow[sourceFields[0]]`, falling back to `variableValues[...]` if undefined (`:1050-1056`). A first source starting with `$` reads `variableValues[name without $]` (`:1044-1048`). No sourceFields means the chain starts from `null` (`:1059-1062`).
  - Only the first source field is used for single-value transformations; extra sourceFields are ignored.
  - No try/catch in `transformRow`; callers catch per row (e.g. `jobExecutionEngine.js:3687`).
- Order: variables sorted by `sequence` (default 0) in `convertVariables` (`jobExecutionEngine.js:4978`).

### EP2. applyTransformation / applyTransformationChain (library, live)
- `applyTransformation(type, value, params, context)` switch (`transformationEngine.js:17-109`). Supported types: null_to_value, concat, date_format, upper, lower, trim, substring, replace, round, floor, ceil, case_when, if, cast, math_add, math_subtract, math_multiply, math_divide, lookup, hash, split, system_date, left_pad, right_pad, coalesce, rdm_crosswalk_lookup, rdm_dataset_join.
- Unknown type: logs a warning and returns the value unchanged (`:101-103`). Any exception: logs and returns the original value (`:105-108`).
- Chain: applies each transformation in sequence, feeding the result forward (`:928-936`).
- Per-type rules (literal values):
  - null_to_value: null, undefined or `''` replaced by `defaultValue` (default `''`) (`:116-119`).
  - concat: three formats. `concatParts` ordered (field/literal/variable; any other part type such as `expression` yields `''`) (`:143-156`); legacy `fields` + `separator` (`:159-163`); single value with `prefix`/`suffix` (`:166`). Objects are JSON-stringified, null becomes `''` (`:129-140`).
  - date_format: defaults `inputFormat='ISO'`, `outputFormat='YYYY-MM-DD'`. `timestamp` = `new Date(parseInt(v))` (ms), `unix` = seconds*1000, anything else = `new Date(v)` (`:172-189`). Invalid date returns the original value (`:191-193`). Output uses server-local getters and replaces the first occurrence of each of `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss` (`:196-209`).
  - upper/lower/trim/substring/replace/split/left_pad/right_pad/hash: falsy value (`0`, `''`, null) is returned unchanged (`:221, 228, 237, 258, 275, 734, 774, 785, 718`).
  - trim `type`: left, right, both (default) (`:234-249`).
  - substring: `start` default 0, `length` default null; uses `String.substr` when length given (`:255-266`).
  - replace: `find` is escaped, so it is literal; global; `caseInsensitive` adds `i` (`:279`).
  - round: `Math.round(num*10^decimals)/10^decimals`, default `decimals=0`; non-numeric returned unchanged (`:287-296`). floor/ceil likewise.
  - case_when: first matching condition wins; else `defaultValue` if not null, else the input value (`:325-382`). Operators (words or symbols): equals/=, not_equals/!=, greater_than/>, less_than/<, greater_than_or_equal/>=, less_than_or_equal/<=, contains, starts_with, ends_with, is_null, is_not_null. `equals` uses loose `==`; ordering uses `parseFloat` on both sides. An unknown operator never matches.
  - if: same operators, plus default (unknown operator) = `Boolean(fieldValue)` (`:435-437`). Simple form, or compound form with `compoundConditions` + `logicalOperators` (`&` AND, `|` OR) combined strictly left to right with no precedence (`:473-481`). Then/else may be literal or nested transformation (`thenValueNested`/`elseValueNested`) (`:504-518`).
  - cast: targetType string, integer (`parseInt`), float/decimal (`parseFloat`), boolean (accepts true/1/yes, false/0/no, case-insensitive, else null), date (ISO string via `toISOString`); unparsable gives null; null/undefined returned as is (`:524-556`).
  - math_*: multi-part format (`mathParts` >= 2) or legacy (`addValue`/`subtractValue`/`multiplyBy`/`divideBy`). Non-numeric parts count as 0 (`|| 0`) (`:569-575`). Divide by zero in multi-part form logs and returns null (`:676-679`).
  - lookup: `mappings` object; match returns mapped value; else `defaultValue` if not null, else the input (`:701-710`).
  - hash: default `sha256`; hex digest via Node crypto; on error returns the original value (`:715-726`).
  - split: default delimiter `,`, index 0; out-of-range returns null; result is trimmed (`:731-743`).
  - system_date: current server-local time, default format `YYYY-MM-DD` (`:748-766`).
  - left_pad/right_pad: defaults `length=0`, `padChar=' '` (`:771-788`).
  - coalesce: first non-null/non-empty among `fields` of the row, else null (`:793-805`).
  - rdm_crosswalk_lookup: needs `params.rdmCrosswalkId` and `context.rdm.crosswalks[id].map` (a Map); defaults `sourceField='source_code'`, `targetField='target_code'`, `caseInsensitive=true`; key is `String(value).toLowerCase()`; no match returns `defaultValue`, or the input value if defaultValue is null (`:811-848`).
  - rdm_dataset_join: needs `rdmDatasetId`, `join.sourceField`, `join.datasetField`; `joinType` default `left`; key is lowercased `String(row[sourceField])`; match returns an object of fields prefixed `rdm_` (default prefix), excluding the join field if `selectFields` empty; no match returns `null` for `inner`, else `defaultValue` (`:854-919`).

### EP3. parseExpressionToTransformation / evaluateTransformationConfig (library, live)
- Trigger: `convertFieldMappings` / `convertVariables` when a mapping/variable has an `expression` (`jobExecutionEngine.js:4849-4857, 4988-4996`).
- Tokenizer (`expressionParser.js:14-145`): curly quotes normalised to ASCII (`:21-23`); string literals with `'` or `"` and backslash escape (`:41-60`; unterminated string is silently accepted); numbers incl. leading `-` (`:63-77`); `$var`; `(`, `)`, `,`; `&` and `|` as LOGICAL_OP; identifiers `[A-Za-z_][A-Za-z0-9_-]*` (hyphen allowed inside, so `a-1` is one identifier) (`:127-137`). Any other character, including `<`, `>`, `=`, `+`, `.` outside numbers, spaces inside names, is skipped with a warning (`:139-141`). So operators must be written as string literals, e.g. `if(a, '>', 5, 'x', 'y')`.
- Parser (`:152-235`): parses one node only; trailing tokens after the first complete node are ignored. Function call is `IDENT (` ... `)`; missing `)` throws `Expected closing parenthesis`.
- Function names: lowercased, `-` to `_` (`:269`). Aliases: add, subtract, multiply, divide to math_*; current_date to system_date; current_timestamp to system_timestamp (`:273-280`). Allowed functions: the 26 in `functionMap` (`:288-315`); anything else throws `Unknown function: <name>` (`:319-321`). Not available through expressions: rdm_crosswalk_lookup, rdm_dataset_join (reachable only via the legacy format).
- system_timestamp maps to system_date with default format `YYYY-MM-DD HH:mm:ss` (`:481-489`).
- case_when argument layout: `field, (op, compare, result)*, [default]`; `hasDefault = (args-1) % 3 !== 0` (`:665-666`).
- if: simple form `if(field, op, compare, then, else)` (`:613-652`); compound form triggered by any `&`/`|` argument (`:505-611`).
- Failure: any parse error throws `Failed to parse expression "<expr>": <msg>` (`:755`), which `convertFieldMappings` catches and logs, leaving that mapping with no sourceFields and no transformations (`jobExecutionEngine.js:4858-4865`), so the target column becomes `null` for every row. Empty expression returns null (`:737-739`).
- evaluateTransformationConfig returns `{ sourceFields (deduplicated), transformations }` (`:765-961`).

### EP4. Legacy mapping conversion (live, outside the parser; included because it defines accepted legacy shapes)
- `convertFieldMappings` (`jobExecutionEngine.js:4834-4963`): precedence is `expression`, else `transformation` (not `none`) + `transformation_params`, else `source_field` passthrough, else `sourceFields`/`source_fields`.
- Name normalisation: lowercase, `-` to `_`; `cast_string/integer/float/boolean` all become `cast` with targetType inferred from the name, default `string` (`:4879-4907`); null_to_value `value` param renamed `defaultValue` (`:4908-4911`); concat with `column2` becomes `concatParts` (`:4912-4936`).
- `convertVariables` legacy: `transformation` + `params`, no normalisation (`:5006-5018`).

### EP5. Unmounted transformation HTTP API (`backend/routes/transformationRoutes.js`) - NOT LIVE
- Routes: POST `/`, GET `/`, GET `/:id`, PUT `/:id`, DELETE `/:id`, POST `/:id/execute`, GET `/:id/executions`, GET `/:id/executions/:executionId` (`transformationRoutes.js:49-58`).
- Mounting: the only mount is commented out (`integration.js:27-33`); the comment says the routes are "registered in server.js", but a search of `server.js` and `index.js` finds no reference to `transformationRoutes`. Inventory says possibly-dead; this confirms it.
- Even if mounted: no authentication in the router (only a logging middleware, `:13-46`); the commented-out mount would have injected `req.user = {id: 2, roles:['Admin']}` for every caller (`integration.js:27-33`). Controller defaults `createdBy`/`userId` to `2` (admin) when no user (`transformationController.js:20, 117`). Execute requires `req.user.permissions` to include `transformation:execute`, else 403 `Access denied` (`:107-112`); no other route has a permission check.
- Controller imports the class, not an instance (`transformationController.js:8` vs `TransformationService.js:878`), so each handler calls a method on the class constructor and would throw `TypeError ... is not a function`.
- Even with an instance, `executeTransformation(transformationId, options)` is called with two args (`:120`) but the service signature is `(transformationId, userId, options)` (`TransformationService.js:387`), so `options` would be taken as userId.
- Responses (intended): create 201 with row; list array; get/update/execute-details 404 via `NotFoundError`; delete `{message:'Transformation deleted successfully'}`; delete never returns 404 because the service returns true regardless (`:87-99`; `TransformationService.js:368`).

### EP6. TransformationService (class, not live)
- Instantiated only by the DI container auto-discovery of `*Service.js` (`di/services.js:22-61`, called from `di/bootstrapper.js:111`; `db.js:6` imports the bootstrapper), constructor `(dbPool, logger)`; nothing in the code base resolves a `transformationService` from it (search of `backend/**/*.js` finds no other consumer). Treated as dead.
- Rules (if used):
  - Valid types: join, filter, aggregate, sort, map, split, merge, lookup, validate, enrich, custom (`:34-46, 811-814`). Name and type required; `inputFiles`, if present, must be a non-empty array (`:802-830`). Config checks: join needs `joinType` + `joinColumns[]`; filter `conditions[]`; aggregate `groupBy[]` + `aggregations[]`; map `mappings[]` (`:840-874`).
  - ID: `transformationData.id || 'transform_' + Date.now()` (`:68`); `outputFormat` default `csv`; `createdBy` default `2`; SERIALIZABLE transaction; creates `transformation_lineage` table on the fly if missing and inserts one row per input file (`:71-140`).
  - List: sort columns whitelist `id, name, type, created_at, updated_at`; default `created_at DESC`, limit 100, offset 0 (`:158-174`).
  - Update: updatable fields `name, description, type, config, input_files, output_format, enabled` (`:275-278`); the service reads `updates.input_files` and `updates.output_format` (snake_case) whereas create uses camelCase `inputFiles`/`outputFormat`.
  - Execute: inserts `transformation_executions` with `execution_id='exec_'+Date.now()`, status `RUNNING`; sets `last_execution_id`/`last_executed_at` on `transformations`; then calls `executeTransformationJob(dbPool, transformationId, userId, {...options, transformationExecutionId})` (`:398-448`). Note `executeTransformationJob` takes a mapping id (`jobExecutionEngine.js:1137` `(pool, mappingId, userId, options)`), so the id passed is treated as a mapping id, not a `transformations` row id.
  - updateExecutionStatus: sets `completed_at` for `COMPLETED`/`FAILED`; increments `total_successful_executions` or `total_failed_executions`; sets `last_execution_status`; on COMPLETED records `result.result.outputFiles[]` into `transformation_outputs` (table created if missing) (`:481-601`). Nothing in the area calls it; `jobExecutionEngine.js:1096-1122` updates `transformation_executions` directly instead.
  - History: default limit 20, offset 0; returns `{executions, pagination:{total,limit,offset}, stats}` (`:610-673`). Details: join with `transformations`, falls back to the bare row if the transformation was deleted (`:697-736`).
  - Delete removes executions then the transformation, matching `transformation_id = $1 OR id = $2` when the id parses as a number (`:344-366`).

### EP7. asyncTransformationService (module, not live)
- No file requires it (search `asyncTransformationService` across `*.js` finds only the file itself). Inventory entry that `TransformationService.js:14` and `asyncTransformationService.js:8` use `asyncProcessor` is correct for the import line, but see BUG below.
- Functions: `createTransformation(config, userId)` inserts `transformations (name, description, config, created_by, status='pending')`, starts a task, sets `status='running'` and `task_id`, and listens for `progress`/`completed`/`error` events to update `progress`, `status` (`completed`/`failed`), `result`, `error` (`:20-108`). `getTransformationStatus(id)` (`:116-169`). `listTransformations(userId, {limit=20, offset=0, status})` filters by `created_by = userId` (`:178-207`). `deleteTransformation(id, userId)` only if `created_by === userId` (`:216-253`).

### EP8. backend/src transformations stack (not live)
- Routes `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/execute` (`backend/src/routes/transformations.js:15-54`). `authenticateToken` on all (`:12`); permissions `transformations:read` for GETs, `transformations:write` for POST/PUT/DELETE and for execute (`:17-53`).
- Mounting is commented out (`backend/src/routes/index.js:14, 29`); repository `backend/src/repositories/transformationRepository.js` has no importer (search finds only its own file).
- Inputs: create requires `name` and `transform_type` (400 `Validation error`) (`controllers/transformations.js:39-51`). Delete returns 204. Execute returns the updated row.
- Rules: ID is `uuidv4()`; default status `created`; lineage row in `file_lineage` only if both `source_file_id` and `target_file_id` (`services/transformations.js:70-94`); update replaces lineage when source/target changes (`:171-178`); delete removes `file_lineage` rows first (`:198-201`); execute sets `running`, waits `setTimeout(..., 1000)`, sets `completed` - it does no transformation (`:271-294`); on error sets `failed`.
- Schema differs from the live one: columns `transform_type`, `transform_config`, `source_file_id`, `target_file_id` versus `type`, `config`, `input_files` in `TransformationService`.

### EP9. DBTService (class, not reachable)
- Frontend page calls `/api/dbt/models`, `/api/dbt/executions`, `/api/dbt/discover`, `/api/dbt/execute` (`src/pages/DBTTransformations.jsx:25, 36, 46, 60, 122`); the route is commented out as ARCHIVED (`src/App.jsx:412`). No backend route for `/api/dbt` exists (search of `*.js` finds only `auditMiddleware.js:54`, which classifies `/api/dbt` URLs as entity type `dbt`). The class is instantiated by the DI container (`di/services.js:46-52`) but nothing resolves `dbtService`.
- Methods: `listModels`, `getModel`, `discoverModels(userId)`, `executeDbt(command, userId, options)`, `runDbtCommand`, `parseDbtOutput`, `getExecutions(limit=50)`, `getExecution`.
- Rules: `discoverModels` scans `<cwd>/dbt_project/models` recursively for `.sql`, skipping unsafe filenames (`isSafeFilename`/`safePath`), defaults materialization `view` and model type `prefix.split('/')[0] || 'staging'`, parses `config(...)`, `source(...)`, `ref(...)` by regex, upserts into `dbt_models` by `model_name` (`:50-146`). `executeDbt` allows commands `run, test, compile, build, snapshot, seed, docs` only (`:169-172`); `modelsSelector` must match `/^[a-zA-Z0-9_\s\-\.\+:]+$/` (`:174`); inserts `dbt_executions` status `running` with `triggered_by = userId || 'system'`, `trigger_type` default `manual`; spawns `dbt` with `shell:false` and `cwd` = `dbt_project`; status `success` iff exit code 0 else `failed`; parses stdout summary `Done. PASS=.. WARN=.. ERROR=.. SKIP=.. TOTAL=..` (`:197-233, 373-379`). Audit entries only when `userId` truthy.

## Data touched
- `transformations`, `transformation_executions`, `transformation_outputs`, `transformation_lineage` (`TransformationService.js:73-86, 398-427, 554-575, 106-127`); `transformations` also by `asyncTransformationService.js:30-85` and `backend/src/services/transformations.js:73-290` with incompatible column sets.
- `file_lineage` (`backend/src/services/transformations.js:230, 199`).
- `dbt_models`, `dbt_executions` (`DBTService.js:121-145, 180-233`).
- The live engine/parser read and write no tables; they operate on in-memory rows. `jobExecutionEngine.js` (EXE) reads `transformation_lineage` and updates `transformation_executions` (`:1107, 4331, 4427, 4585`).
- External: `dbt` CLI via `spawn` (`DBTService.js:312`). Files: `<cwd>/dbt_project/models/**/*.sql` read.

## Flags

### BUG
1. Nested functions in expressions are dropped. For single-argument functions with a function argument (`upper(trim(x))`), `extractFromConfig` is called on a raw AST node of type `FUNCTION`, which matches none of the branches and returns null, so no source field or inner transformation is recorded (`expressionParser.js:921-925, 805-953`). Result: outer function runs on `null`, target is null. For `concat`, a nested function becomes a `{type:'expression', value:'<nested>'}` part (`:843-847`) which the engine renders as `''` (`transformationEngine.js:152`). The comment says "will need enhancement".
2. A pure literal or pure variable expression produces nothing: `'abc'` (static) or `$x` returns a value from `extractFromConfig` that is never stored (`expressionParser.js:811-818`), so sourceFields=[] and transformations=[] and the target is `null` (`transformationEngine.js:1059-1062`). A bare column expression works (`:806-809`).
3. Variables used only as arguments yield nothing. The parser never adds `$vars` to `sourceFields` (`expressionParser.js:840-842, 863-865, 881-883`, and `:921` only for COLUMN). With no source fields, `transformRow` calls the chain with `null` (`transformationEngine.js:1059-1062`), so `upper($v)` returns null, and `concat($a, '-', $b)` throws on `null[...]` inside `concat` (`transformationEngine.js:147-151`), caught at `:105-108` and returns the original value `null`. Mixed column+variable expressions work because the column makes the row path active.
4. Legacy math with zero operand: `parseFloat(divideBy) || 1` turns `divideBy: 0` into 1, so the divide-by-zero guard at `transformationEngine.js:690-693` is unreachable and the result is `num1 / 1` (`:688`). Same for `multiplyBy: 0` becoming 1 (`:647`).
5. Multi-part math treats null/non-numeric operands as 0 (`|| 0`), so multiply with an empty field returns 0 and add silently ignores it (`transformationEngine.js:569-575, 635`).
6. `hash` failure returns the unhashed original value (`transformationEngine.js:722-725`); a bad `algorithm` param therefore outputs plaintext. The generic catch does the same (`:105-108`).
7. `if`/`case_when` where then/else/result/compare is a column or variable name: the parser stores the NAME (`expressionParser.js:588-591, 623-625, 633-636, 688-700`) and the engine returns that name as a string (`transformationEngine.js:510, 517, 377`), not the column value. In simple `if`, `compareValue` that is a column name is compared as a literal string (`:484`); only compound conditions resolve compare values against the row (`:459-467`), and there a string literal that happens to equal a column name is replaced by that column's value.
8. `lookup` and `hash` have no parameter mapping in the parser (`buildTransformation` default branch, `expressionParser.js:720-724`), so `lookup(x, ...)` via expression has empty `mappings` and returns its input; `hash(x, 'md5')` ignores the algorithm.
9. `lookup` uses `value in mappings`, which matches inherited keys such as `constructor`/`toString` and returns a function (`transformationEngine.js:705-707`).
10. `if` variable fallback uses `||`, so a variable value that is `0`, `''` or false falls through to the alternate key or the raw name (`transformationEngine.js:453, 463, 498`).
11. `case_when` default detection uses `(args-1) % 3 !== 0` (`expressionParser.js:666`), so one or two stray trailing arguments are both treated as a default (the last one wins); no error.
12. Controller/service wiring broken in `transformationController.js` (class vs instance, `:8`; arity mismatch, `:120`). Not live, but would fail if mounted.
13. `asyncTransformationService.createTransformation` calls `executeTransformation` imported from `asyncProcessor` (`:8, 48`), but `asyncProcessor` exports no such function (`asyncProcessor.js:420-426`), so it would throw `TypeError`.
14. `TransformationService.executeTransformation` passes the transformation id as the mapping id to `executeTransformationJob` (`TransformationService.js:443-448`; `jobExecutionEngine.js:1137`).
15. Dates: `date_format` and `system_date` use server-local time zone getters (`transformationEngine.js:196-201, 751-757`), and a date-only ISO string is parsed as UTC, so the output day can shift depending on server time zone. Only the first occurrence of each token is replaced (`:203-209`); `inputFormat` other than ISO/timestamp/unix is ignored (`:187-189`).
16. Expression parse failure is silent for data: the target column is null for all rows and only a log line is written (`jobExecutionEngine.js:4858-4865`).
17. Mapping variable of the same name as a source column overwrites it in `enrichedRow` (`transformationEngine.js:1010`).

### SECURITY
1. `transformationRoutes.js` has no authentication; the commented mount would have forced every caller to user id 2 / role Admin (`integration.js:27-33`); controller defaults to user 2 (`transformationController.js:20, 117`). Currently not mounted.
2. Only `execute` is permission-checked in that router (`transformationController.js:107-112`); list/get/update/delete have no ownership or permission check.
3. `asyncTransformationService.deleteTransformation` compares `created_by !== userId` with strict inequality (`:232`); a numeric DB id versus string id would never match (UNCLEAR whether types differ). Not live.
4. DBT: shell not used and selector regexp-limited (`DBTService.js:174, 312`); `--models` argument still accepts `+`, `:` selector syntax. `logs` stores full stdout. No route, so not reachable.
5. `hash` allows any Node hash algorithm including md5/sha1 (`transformationEngine.js:716-721`) (note only).

### DUPLICATE
1. Three transformation CRUD stacks over the same table name `transformations`: `backend/routes/transformationRoutes.js` + `controllers/transformationController.js` + `services/TransformationService.js` (columns `transformation_id`, `type`, `config`, `input_files`); `backend/src/{routes,controllers,services,repositories}/transformation*` (columns `id` uuid, `transform_type`, `transform_config`, `source_file_id`, `target_file_id`); `services/asyncTransformationService.js` (columns `name, description, config, created_by, status, task_id, progress, result, error`). Live ETL mapping CRUD is in area ETL (`backend/routes/transformations.js`, not in this area).
2. Two execution status vocabularies: `RUNNING/COMPLETED/FAILED` (`TransformationService.js:417, 526`), `pending/running/completed/failed` (`asyncTransformationService.js:40, 56, 75, 87`), and `created/running/completed/failed` (`backend/src/services/transformations.js:87, 277, 291, 301`).
3. Two sets of operator names (words and symbols) are duplicated between `caseWhen` and `evaluateSingleCondition` (`transformationEngine.js:334-374` vs `:407-437`); `caseWhen` has no default branch, `if` defaults to `Boolean(fieldValue)`.
4. Concat and math exist in a legacy form and a parts form (`transformationEngine.js:143-166, 565-584`).
5. `repositories/transformationRepository.js` duplicates `services/transformations.js` queries (not read in detail; see Open questions).

### DEAD
1. `backend/routes/transformationRoutes.js`, `controllers/transformationController.js`, `services/TransformationService.js` (EP5, EP6).
2. `backend/services/asyncTransformationService.js` (EP7).
3. `backend/src/routes|controllers|services|repositories/transformation*` (EP8).
4. `DBTService.js` plus the archived `src/pages/DBTTransformations.jsx` (EP9).
5. `processTransformationAsync` imported at `TransformationService.js:14` but never used there; `fs/path/uuid/fileService/readFile/writeFile` imports also unused. `transformationTypes.SPLIT/MERGE/...` have no executing code anywhere.
6. Engine exports `applyTransformation, applyTransformationChain` and individual functions; only `transformRow` is used outside tests (`jobExecutionEngine.js:8`). rdm functions not exported individually.
7. `TransformationService.updateExecutionStatus` has no caller.

### UNCLEAR
1. `jobExecutionEngine.js:3578` and `:3683` re-apply `transformRow` to rows that were already transformed; whether expressions are idempotent on that second pass is not stated (belongs to EXE).
2. `rdm_dataset_join` returns an object for a single `targetField`; `transformRow` assigns it as the field value (`transformationEngine.js:1064`) with no flattening. How the writer handles such an object is not visible here.
3. `lookup` mappings and `hash` algorithm can be supplied only through legacy `transformation_params`; whether the UI still produces them is unknown.
4. `UNCLEAR` whether a variable with `expression` and no transformation `type` is ever stored with `source_field = '$other'` (the `$` first-source path in `transformRow` is only reachable from legacy mappings, since the parser never emits `$` source fields).

## Domain terms
- Transformation / mapping / field mapping: row-level rule from source fields to a `targetField` (engine term `fieldMappings`; DB term `field_mappings` in `jobExecutionEngine.js:3542`).
- Transformation (second meaning): a `transformations` table row in the unmounted CRUD APIs; `transformation_id` vs `id` (numeric/uuid) vs `execution_id`.
- Variable: named intermediate value evaluated before field mappings, referenced as `$name`; also stored without `$` (`transformationEngine.js:1009-1010`).
- Expression: visual-builder string such as `concat(upper(first_name), ' ', last_name)` (`expressionParser.js:5`); also called "new format"; opposed to "legacy format" (`transformation` + `transformation_params`).
- concatParts / mathParts: ordered operand lists.
- Compound condition: `if` with `&`/`|`.
- RDM: reference data management context (`context.rdm.crosswalks`, `context.rdm.datasets`); crosswalk = source-to-target code map.
- Lineage: `transformation_lineage` (input file per transformation) vs `file_lineage` (source/target file pairs).
- dbt model / materialization (view default).
- Synonyms: `defaultValue` (null_to_value, lookup, case_when) vs `elseValue` (if); `target_field`/`targetField`; `source_field`/`sourceFields`/`source_fields`; `system_date` vs `current_date`; `math_add` vs `add`.

## Open questions
1. Is `transformationRoutes` or the `backend/src` router mounted anywhere not searched (for example a dynamic route loader)? The only static mounts found are commented out (`integration.js:27-33`, `backend/src/routes/index.js:29`).
2. Does anything resolve `transformationService` or `dbtService` from the DI container by string name (for example via `container.get(variable)`)? Not found by literal search.
3. Do `src/` UI builders ever send expressions whose whole content is a literal or a variable (BUG 2, 3) or nested functions (BUG 1)? Not checked; frontend is under ETL.
4. `backend/src/repositories/transformationRepository.js` was only checked for imports, not read line by line; its behaviour is not described.
5. `jobExecutionEngine.js` lines around `4331-4585` (lineage writes) belong to EXE and were not traced here.
6. `backend/utils/asyncProcessor.js` / `processorWorker.js` do not use the engine or parser (search finds only `jobExecutionEngine.js` and a test importing them); the inventory row listing worker thread under PROC/XFM is only half supported (the XFM side is only the dead `processTransformationAsync` import).
7. `DBTService` DB tables `dbt_models`/`dbt_executions` are created in `createJobDependencyTables.js` per inventory; that file was not opened.
