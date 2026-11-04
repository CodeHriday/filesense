# VAS - Agreement file schemas and templates

## Summary
Three route files plus two helpers. All paths are relative to the repo root.
- Per-agreement file schemas (CRUD, bulk replace, pattern test) in `backend/routes/vendorAgreementFileSchemaRoutes.js`. It is mounted at `/api/vendor-agreements` behind `authenticateToken` (server.js:13895-13896).
- A multi-sheet Excel template (download, upload and parse, JSON schema file upload) in `backend/routes/vendorAgreementTemplateRoutes.js`. It is mounted at `/api` (server.js:13905-13906), and each route applies `authenticateToken` itself.
- A second, older single-agreement template (xlsx, csv, json) in `backend/routes/vendorAgreementRoutes.js:1499-1595`. It is mounted behind `authenticateToken` (server.js:13885-13886). Helper: `backend/utils/agreementTemplateUtils.js`.
- Schemas are stored as JSON in table `vendor_agreement_file_schemas`. Archive passwords go to a password vault, not the table.
- Coverage limits:
  - I read fully the two route files, the schema routes, and `vendorAgreementTemplateService.js` lines 1-55, 200-270 and 405-1004. Lines 267-405 (the instructions sheet) and `agreementTemplateUtils.js` in full were checked in the fix round.
  - I did not read the frontend components `FileSchemaManager.jsx` and `SchemaFieldEditor.jsx` in full, only by grep. The verifier read them and confirmed the claims below.
  - `requirePermission` (vendorPermissions.js:36-61), `userHasAdminAccess` (permissionHelpers.js:80-92) and `globToRegex` (regexValidator.js:199-215) were read by the verifier, who confirmed the behaviour described below.
  - Table columns and constraints come from the prod DDL dump (`attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql`) and `backend/migrations/*.js`, not from a live database. That dump predates `approval_chain_config`.

## Entry points

### Common to schema routes (vendorAgreementFileSchemaRoutes.js)
- Every route has `requirePermission('vendor_agreements:read' or ':write')` (:151, :214, :256, :448, :725, :981, :1049). `requirePermission` (vendorPermissions.js:36-61) returns 401 `{error:'Authentication required'}` without `req.user` and 403 `{error, required}` when `hasPermission` fails. It has no admin bypass: an Admin role without the exact `vendor_agreements:*` permission gets 403.
- `userHasAdminAccess` (permissionHelpers.js:80-92) is true for role `Admin`/`admin` (string or object name/role_name), or when the user has one of `users:write`, `roles:write`, `project_management:write`.
- The write routes POST, PUT (bulk), PUT (:schemaId) and DELETE also call `checkFileSchemaAccess(req.user, agreementId)` (:262, :455, :731, :986). Rules as written in code:
  - Admins (`userHasAdminAccess`) pass (:100).
  - Otherwise the query at :102-106 selects `file_owner_user_id, created_by, primary_contact_email, secondary_contact_email, vendor_user_id, approval_chain_config` from `vendor_agreements`. `vendor_user_id` is not a column of `vendor_agreements` in the prod DDL or in any migration (see BUG), so for non-admins this query should fail and the write routes should return 500 before any rule below applies. Based on DDL and migrations, not a live DB.
  - If the query did succeed, a missing row gives 404 "Vendor agreement not found" (:109-111).
  - Access would be granted when `file_owner_user_id`, `created_by` or `vendor_user_id` equals `user.id` (:115-117). The comparison is strict `===`, so a string vs number mismatch denies access.
  - Access would also be granted when `primary_contact_email` or `secondary_contact_email` equals `user.email` (:118-121).
  - Access would also be granted when `user.id` is in some `approval_chain_config.steps[].approver_user_ids` (:123-134). This check uses `parseInt(id, 10) === user.id` (:131), not strict equality on the stored value. `JSON.parse` is applied only if the value is a string (:123-125).
  - Otherwise the response would be 403 "Access denied. You are not associated with this agreement." (:136).
- The three read routes do not call `checkFileSchemaAccess` (see Flags).
- Error responses are 500 `{success:false, error, details: error.message}` on every route.
- GET list and GET one return the raw `vafs.*` row, including `column_metadata` and `header_definition`.

### GET /api/vendor-agreements/:agreementId/file-schemas (:151)
- **Inputs:** query `includeInactive`. Only the literal `'true'` includes inactive rows (:170).
- **Behaviour:**
  - Selects `vafs.*` plus the creator and updater usernames.
  - Filters `is_active = TRUE` by default.
  - Orders by `priority ASC, id ASC` (:174).
  - Adds `has_archive_password` per schema from `passwordVaultService.hasPassword('vendor_agreement_file_schema', id)` (:183). A vault error is logged and gives false. This is one vault query per schema (`Promise.all`).
- **Output:** `{success, fileSchemas, total}`.
- **Callers:** VendorAgreements.jsx:854, MappingWizard.jsx:385, VendorFileUpload.jsx:77, FileSchemaManager.jsx:33.

### GET .../file-schemas/:schemaId (:214)
- **Behaviour:** looks up by id and agreement id. Not found gives 404 "File schema not found".
- **Output:** `{success, fileSchema}`. It does not include `has_archive_password`.
- **Callers:** ExpressionModal.jsx:66, SourceConfigModal.jsx:293.

### POST .../file-schemas (:256)
- **Body:** `file_name_pattern`, `file_description`, `schema`, `priority=0`, `is_active=true`, `contains_pii=false`, `data_classification=null`, `file_type=null`, `quality_rule_ids=[]`, `column_metadata={}`, `has_header=true`, `header_definition=null`, `archive_password=null` (:265-279).
- **Validation:**
  - `file_name_pattern` is required (400) (:282).
  - `schema` must be one of three shapes (:303-308):
    - a non-empty array;
    - `{columns:[non-empty]}` (the new shape);
    - a reference token `{_schemaRef:true}`.
  - For arrays and `columns`, every column needs `column_name` and `data_type` (:313-320).
  - `data_classification` must be one of `Public, Internal, Confidential, Highly Confidential` (:324).
  - `file_type` (lowercased for the check) must be one of `csv, json, xml, xlsx, parquet, fixed_width, binary, dat, sas7bdat, avro, zip, 7z, tar, tar.gz, tar.bz2` (:333-334).
  - `archive_password` is allowed only if `file_type` is in `['zip','7z','tar','tar.gz','tar.bz2']` (:257, :342).
  - The agreement must exist (404) (:350-360).
- **Side effects:**
  - For the new-shape schema, `mergeFileQualityRuleIds` resolves `schema.file_quality_rules` into `quality_rules` ids and merges them into `quality_rule_ids` (:366-368). Resolution rules:
    - Entries are strings or objects with `rule_type` and optional `rule_name`.
    - Name-first lookup. The rule must be enabled, not named `__schema_default__*`, and either global or in the agreement's project. Project-scoped rules win, `LIMIT 1` (:51-62).
    - Otherwise a lookup by `rule_type` with `column_name='__file__'` or empty. Project-scoped and `__file__` rules are preferred, `LIMIT 1` (:67-79).
    - It never throws. On error it returns the input ids (:87-90).
  - INSERT into `vendor_agreement_file_schemas` with `created_by` and `updated_by` set to `req.user.id` (:371-407).
  - If a password was given and the vault is available, it calls `storePassword(...)` without a user id (:412). A failure is only logged as a warning, and the response is still 201.
- **Output:** 201 `{success, fileSchema, message}`.
- **Callers:** FileSchemaManager.jsx:209.

### PUT .../file-schemas (bulk replace) (:448)
- **Body:** `{fileSchemas: []}`. It must be an array or 400 (:478).
- **Flow:**
  1. The agreement must exist (404) (:486-496).
  2. BEGIN (:500). Existing schemas are read.
  3. For each existing schema with a vault password, it calls `passwordVaultService.getPassword` and keeps a map of file_name_pattern to password (:511-526). That method does not exist (see BUG).
  4. It deletes every vault password for the existing schemas (:529-537).
  5. It deletes every existing schema row (:540-543).
  6. It inserts each new schema (:551-667).
  7. COMMIT (:669).
  8. After commit it stores the passwords (:674-689).
- **Per-item defaults:** same as POST, plus `archive_password=''`.
- **Per-item validation:** `file_name_pattern` is required, and `schema` must be a non-empty array, a `{columns}` object or a ref token. Any failure rolls back and returns 400 (:569-598). A `null` or `[]` schema is rejected (:592-598). Column fields, `file_type`, `data_classification` and the archive-type rule are not validated.
- **Quality rules:** for `{columns}` schemas it also calls `mergeFileQualityRuleIds(client, ...)` on the transaction client (:603-605). See BUG on aborted transactions.
- **Passwords:**
  - `archive_password === '__KEEP_EXISTING__'` restores the password saved for the same `file_name_pattern` (:649-658).
  - Any other non-blank value is stored as new (:659-666).
  - Password-store errors are logged and the request still succeeds (:685-687).
- **Output:** 200 `{success, fileSchemas, message:"Successfully replaced file schemas (N schemas created)"}`.
- **Logging:** it prints to console the first 3 characters of each archive password (:462-465).
- **Callers:** called from the agreement form (VAG.md:119 cites `src/pages/VendorAgreements.jsx:1287`; also :1356 and :1449). The form's `FileConfigurationsSection` (VendorAgreements.jsx:1273-1287) passes the schema editor's output (`SchemaFieldEditor.jsx:26-66`, `name`/`type` keys) to this route, which does not check column keys, so that path works. When loading an agreement for edit, the form sets `archive_password: '__KEEP_EXISTING__'` for every schema with `has_archive_password` (VendorAgreements.jsx:869). The edit-save path catches a bulk PUT failure and only `console.error`s it (VendorAgreements.jsx:1288-1290; same at :1357-1359), so the user sees no error.

### PUT .../file-schemas/:schemaId (:725)
- **Behaviour:** a dynamic partial update. Only fields that are not `undefined` are updated (:797-889). The schema must belong to the agreement (404) (:751-761).
- **Validation:**
  - `data_classification` and `file_type` use the same lists as POST.
  - If `schema` is supplied it must be a non-empty array, a `{columns}` object or a ref token, and every column needs `column_name` and `data_type` (:822-840).
  - `archive_password` is checked against the effective file type, which is the new one or else the stored one (:782-790).
  - If there are no updates and `archive_password` is undefined, the response is 400 "No fields to update" (:891).
- **Writes:**
  - `updated_by` is set (:901) only in the `updates.length > 0` branch (:899-902), so a password-only update does not set `updated_by`. `updated_at` is not set explicitly.
  - `file_schemas.quality_rule_ids` is replaced as given. `file_quality_rules` is not merged here.
- **Archive password:** a non-blank value is stored with the user id. A blank string deletes the vault password (:925-942).
- **Output:** `{success, fileSchema (+has_archive_password), message}`.
- **Callers:** FileSchemaManager.jsx:246.

### DELETE .../file-schemas/:schemaId (:981)
- **Input:** query `hardDelete`. The literal `'true'` gives a hard DELETE (:1002-1007). Anything else sets `is_active = FALSE, updated_by` (:1016-1021).
- **Errors:** 404 if the schema is not found.
- **Output:** `{success, message:"File schema deleted successfully"}`.
- **Vault:** the vault password is not deleted on either path.
- **Callers:** FileSchemaManager.jsx:271.

### POST .../file-schemas/test-pattern (:1049)
- **Body:** `pattern` and `fileName`, both required (400). The path `agreementId` is unused. A non-string `pattern` throws (globToRegex, regexValidator.js:200), which gives 500. A pattern longer than 200 characters after escaping also throws (`safeRegex` cap, regexValidator.js:32), also 500. A non-string `fileName` does not throw (it is coerced by `regex.test`).
- **Behaviour:** `matchesPattern(fileName, pattern)` converts a glob (`*` and `?`) to a regex through `globToRegex` (filePatternMatcher.js:13-27). `globToRegex` (regexValidator.js:199-215) escapes `. + ^ $ { } ( ) | [ ] \`, maps `*` to `.*` and `?` to `.`, anchors with `^...$`, uses the flag `i` (so matching is case-insensitive) and calls `safeRegex(..., {strict:false})`. Only this route builds the regex; POST and bulk PUT accept any glob.
- **Output:** `{success, matches, pattern, fileName}`.
- **Callers:** no frontend caller found in `src/`.
- **Route precedence:** it is a POST on a different path from the POST create route. It does not conflict with GET or PUT `/:schemaId`, which use other methods. `vendorAgreementRoutes` has no `file-schemas` route, and `template/:format` has two segments, so `/:id` routes do not match it, so the shared `/api/vendor-agreements` prefix (server.js:13886, :13896) causes no conflict (per the verifier's grep).

### GET /api/vendor-agreement-template/download (vendorAgreementTemplateRoutes.js:38)
- **Auth:** `authenticateToken` only. There is no permission check.
- **Behaviour:** builds the workbook with `generateTemplate()` (:40). It sets the attachment name `vendor_agreement_template_<YYYY-MM-DD>.xlsx`, with the date from `toISOString()`, so it is UTC (:48).
- **Template layout:**
  - Sheets are "Agreement Info", "File Configurations" and an instructions sheet named "Instructions" (service :57-65, :414-419).
  - Example rows are AGR001 with two file configurations (:219-242).
  - The Instructions sheet (service :267-405) is static text. It says the schema JSON must be on a single line, documents the `{external}` and `{schema:file}` tokens, the extended fixed-width properties (`width`, `start_position`, `precision`, `scale`), and the `quality_rules` values. It says rows 2-3 of File Configurations are examples. For password-protected archives it says to "configure the password manually in the UI after importing the template" (:324-326). The instructions list frequencies as `Daily, Weekly, Monthly, Quarterly, Annual, Ad-hoc` (:307). The Excel header cell also carries a comment (:161-175). Nothing on this sheet is enforced.
- **Errors:** 500 `{error, details}`.
- **Callers:** VendorAgreements.jsx:1595.

### POST /api/vendor-agreement-template/upload (:64)
- **Auth:** `authenticateToken`.
- **Upload:** multipart field `template`. Disk storage in `uploads/templates/`. Limit 5 MB. Only `.xlsx` or `.xls` by extension (:11-23). There is no 400 handler for a file-filter error; server.js has only a `/api/files/drop` multer handler (:4877), so the error falls to Express's default error handler.
- **Flow:**
  1. `parseTemplateUpload(path)` (:71), then `fs.unlinkSync` (:74).
  2. If `!result.success` it returns 400 `{error:'Template validation failed', details: errors, totalRows, validRows}` (:76-84).
  3. Otherwise it calls `resolveQualityRuleIds(pool, all fileConfigs)`. A failure there is non-fatal (:88-94).
- **Output:** 200 `{success, message:"Successfully parsed N vendor agreement(s)", agreements, totalRows, validRows}`.
- **DB writes:** nothing is saved. It only returns the parsed data to the client.
- **Error case:** 500 includes `message` and `details: error.stack` (:112-116). A missing sheet or fewer than 2 rows throws inside the parser, which rethrows "Failed to parse template: ...", so this case is 500 with the stack, not 400.
- **Callers:** VendorAgreements.jsx:1634.
- **Parse rules** (service :409-661):
  - Both sheets are required, and each needs at least 2 rows (:414-442).
  - Header cells are matched to fields by their exact label text. Unknown headers are ignored.
  - Example rows at the top are skipped:
    - Agreement rows are skipped when the first cell starts with `e.g.` or `example`, or is `agr001` with the description "Customer data export agreement" (:449-456). There is no `agr-` test here.
    - File-config rows are skipped when the first cell starts with `e.g.`, `example` or `agr-`, includes `acme`, or is `agr001` with pattern `customer_data` or `legacy_transactions` (:473-483). The skip is a `while` loop over every consecutive leading row that matches (:487-492), not just the first rows. A real first row such as `AGR-001` is dropped without a message, and the agreement then fails with "has no file configurations" (:640-647), so the user gets a 400.
  - Blank rows are skipped.
  - Agreement fields (:24-35):
    - Required: agreement_id, vendor_department_team, vendor_department_email, frequency.
    - frequency is one of `Daily, Weekly, Monthly, Quarterly, Annual, Ad-hoc`.
    - delivery_method is one of `SFTP, S3, API, Email, Manual`.
    - retention_days is parsed with `parseInt` (:834-842).
    - Dropdown values are matched exactly and case-sensitively (:816), for example `csv` but not `CSV`.
    - Duplicate `agreement_id` rows overwrite each other (`agreements[agreement.agreement_id] = agreement`, :533). An agreement row with a validation error is not added, and its file rows then fail with "not found" (:573-575).
  - File-config fields (:41-50):
    - Required: agreement_id, file_name_pattern, file_type. file_type uses the same 15-type list as the routes. `schema` is optional (`required: false`, :47).
    - Booleans must be TRUE or FALSE, case-insensitive (:824-832).
  - Each file config must reference an agreement in the Agreement Info sheet (:571-575).
  - `has_header` defaults to true, except false for `fixed_width`, `binary` and `dat` (:579-583). If a fixed-width type has `has_header` true it is an error (:586-588).
  - When `has_header` is false and there is no valid schema, it is an error unless the file type is an archive type (:592-599).
  - A headered row with no schema parses to `schema: null` (:625). The parser also accepts `[]` and `{columns: []}` (:943-946), but the bulk PUT rejects null and empty schemas (see BUG).
  - The stored `file_name_pattern` is built as `` `${basePattern}*.${fileType}` `` (:621). The input value is kept as `file_name_pattern_base`.
  - `header_definition` is set to the schema columns only when `has_header` is false (:624).
  - Output defaults: `is_active: true`, `contains_pii` false, `data_classification` null (:626-628).
  - Schema cell parsing (:861-995):
    - Reference tokens `{schema:filename}`, `{external}`, `@schema:filename` and `@external` become `{_schemaRef:true,_refType,_refFilename?,_pendingUpload:true}`.
    - Otherwise JSON is parsed. Fallbacks are smart-quote and dash normalisation, then trimming BOM and non-breaking spaces.
    - The result must be an array or `{columns:[]}`.
    - Each column needs `name`+`type` or `column_name`+`data_type`. The old names are renamed to `name`/`type`.
    - Defaults: `pii=false`, `nullable=true`.
  - Any error in either sheet makes `success` false and the whole upload returns 400 (:651). That includes the "agreement has no file configurations" entry (:640-647).
  - `validRows` is the count of agreements that have files, not rows (:655).
  - Row numbers in errors are `startRow + i + 1` (:528, :604).
- **resolveQualityRuleIds** (:682-798):
  - It considers per-column `quality_rules` strings only if they are in `BROAD_LOOKUP_SAFE` (`null_check, column_completeness, isna_check, duplicate_check, uniqueness, email_validity, phone_validity, date_format, timestamp_format, numeric_only_string`) (:12-16).
  - It looks up all enabled, global (`project_id IS NULL`), non-`__schema_default__` rules of the mapped engine type. For `validity`, when `defaultConfig.datatype` is set it also requires `rule_config->>'datatype'` to match (:715). For `completeness` the SQL uses `COALESCE((rule_config->>'threshold')::numeric, 1.0) = 1.0` (:728-740), so a rule with no threshold also matches. The generic branch that matches by rule type only (:741-752) is not reachable for validity from this caller: every `BROAD_LOOKUP_SAFE` validity type has a `datatype` in `RULE_TYPE_MAP` (schemaRuleEnforcer.js:37-41). `date_format` and `timestamp_format` both map to datatype `date`, so they resolve to the same rule ids.
  - It sets `fileConfig.quality_rule_ids` to the union of the ids found (:788-789). There is no `LIMIT`.

### POST /api/vendor-agreement-template/upload-schema (:120)
- **Auth:** `authenticateToken`.
- **Upload:** multipart field `schema`. Disk storage in `uploads/schemas/`. Limit 10 MB. Only `.json` (:25-36). The file is read as UTF-8 and deleted at once (:128-130).
- **Validation:**
  - Invalid JSON gives 400 (:136).
  - The top level must be an array (:143).
  - Each element must be an object with `name`+`type` or `column_name`+`data_type` (:158-164).
  - `type` must be a string (:175).
- **Normalisation:** it renames old keys to `name`/`type` and defaults `pii=false` and `nullable=true` (:166-185).
- **Output:** `{success, message, schema, fieldCount, originalFilename}`.
- **Persistence:** nothing is saved.
- **Callers:** FileConfigurationsSection.jsx:174.

### GET /api/vendor-agreements/template/:format (vendorAgreementRoutes.js:1499)
- **Auth:** only the mount-level `authenticateToken` (server.js:13886). There is no `requirePermission`.
- **Formats:** `xlsx` or `excel`, `csv`, `json`, case-insensitive. Anything else gives 400 "Invalid format. Use xlsx, csv, or json." (:1504-1526).
- **Output:** the file attachment `agreement_template.<ext>`, from `AgreementTemplateUtils.generate*Template` (utils :38-185):
  - `getTemplateFields` defines 17 fields (utils :13-33).
  - Excel has one sheet, "Agreement Template", with columns Field Name, Value and Instructions (:44-74).
  - CSV has the same rows with every cell quoted and `"` doubled (:112-114).
  - JSON has an `_instructions` object plus the values (:130-178). Its sample schema uses `column_name`/`data_type` (:158-169), while its instruction text says "name, type, and description" (:140).
  - The sample frequency is `Daily` (:21, :156). The instruction text lists `Yearly` (:51).
- **Callers:** no frontend caller found in `src/`.

### POST /api/vendor-agreements/parse-template (vendorAgreementRoutes.js:1542)
- **Auth:** only the mount-level `authenticateToken`.
- **Upload:** field `templateFile`. Memory storage. Limit 5 MB. Allowed extensions `.xlsx .xls .csv .json` (:64-74). Upload errors go through `handleMulterError` (vendorAgreementRoutes.js:22-43, `router.use` at :2244): a file over the limit gives 413 "File too large. Maximum file size is 10 KB for approval documents." (wrong limit and wording for this route); a bad extension gives 400 with the multer or filter message.
- **Flow:** the parser is picked by extension (:1551-1567). The data then goes to `validateTemplateData`.
- **Parsing:** the xlsx and csv parsers read only columns A and B, skipping the header row (utils :196-203, :228-238). A row is kept only when both name and value are truthy (`fieldName && value`, :200, :234), so a value of `0` or `false` is dropped. The csv regex needs a non-empty quoted field name (:229). Schema JSON errors are wrapped as "Failed to parse Excel file. Please ensure it follows the template format." (utils :206-214). The JSON parser removes `_instructions` (:261).
- **Validation rules** (utils :275-352):
  - `file_name` and `file_description` are required. They are checked with `.trim()` (:279, :283), so a non-string value (for example an Excel numeric cell) throws a TypeError; the route's catch returns it as 400 with the raw message.
  - Only `file_name` and `file_description` are enforced as required. The Template B instruction text marks schema, domain, delivery_method, file_type, vendor_type, data_classification, retention_days and expected_arrival_time "Required" (utils :53-60), but they are not enforced (:279-285).
  - `schema`, if present, must be an array. Each item needs `column_name` or `name`, and `data_type` or `type`.
  - `frequency` must be one of `Daily, Weekly, Monthly, Quarterly, Yearly, Ad-hoc`.
  - `delivery_method` must be one of `SFTP, S3, API, Email, Manual`.
  - `file_type` must be one of `CSV, JSON, XML, Parquet, Excel`.
  - `data_classification` must be one of `Public, Private, Confidential`.
  - `contains_pii`, when not `undefined` or `null`, passes if `String(value).toLowerCase()` is `true` or `false` (:332-337). Booleans and any casing are accepted.
  - `retention_days` must be a number greater than 0.
- **Errors:** validation failure gives 400 `{error, validationErrors}` (:1573). Any thrown error also gives 400 with its message (:1591).
- **Output:** `{success, data}`. An array `schema` is turned into a pretty-printed JSON string (:1580-1582).
- **Persistence:** nothing is saved.
- **Callers:** no frontend caller found in `src/`.

## Data touched
- `vendor_agreement_file_schemas`. Columns written: `vendor_agreement_id, file_name_pattern, file_description, schema, priority, is_active, contains_pii, data_classification, file_type, quality_rule_ids, column_metadata, has_header, header_definition, created_by, updated_by`. The column list matches the prod DDL (dump :6721-6741). The base migration `createVendorAgreementFileSchemas.js:18-42` has the first 11 columns; `addPIIAndQualityToFileSchemas.js:18-22` adds contains_pii, data_classification, file_type, quality_rule_ids; `addColumnMetadataToFileSchemas.js:18-19` adds column_metadata. `has_header` and `header_definition` are in the prod DDL, but no migration that adds them was found.
  - Constraints: no unique constraint on (agreement, pattern) in either the migration or the dump. FK `vendor_agreement_id` is ON DELETE CASCADE (migration :20; prod dump :7877); `created_by`/`updated_by` are ON DELETE SET NULL (dump :7875-7876). The older `database_ddl_1767770486833.sql` has the FKs without cascade (:3836-3840), so the two dumps disagree.
  - `updated_at` trigger: the migration creates a BEFORE UPDATE trigger (:56-74). The prod dump has no trigger line for it, so prod is unverified.
- `vendor_agreements`: read for `project_id` and the access fields (`vendor_user_id` is not a column there, see BUG).
- `users`: read for the username join.
- `quality_rules`: read to resolve ids.
- Password vault, entity type `'vendor_agreement_file_schema'`, with `hasPassword`, `storePassword`, `deletePassword` and `getPassword` (the last does not exist in the vault service).
- Disk: `uploads/templates/` and `uploads/schemas/`, deleted after parsing.

## Flags

### BUG
- `checkFileSchemaAccess` selects `vendor_user_id` from `vendor_agreements` (:102-106). Probably fails for every non-admin on the write routes.
  - Evidence: `vendor_user_id` is a column of `vendors` only (prod DDL dump :6963; `createVendorManagement.js:30`). The prod DDL's `vendor_agreements` table (dump :6769-6836) has no such column, and a grep of `backend/migrations` finds no migration adding it to `vendor_agreements`.
  - Effect: for non-admins the query should fail with "column does not exist", so POST, bulk PUT, PUT `/:schemaId` and DELETE return 500 before any 403/404/association logic. Only admins (`userHasAdminAccess`) get through.
  - Basis: DDL dump and migrations, not a live database.
- CONFIRMED: bulk PUT calls `passwordVaultService.getPassword` (:517), which does not exist.
  - Evidence: a grep of `backend/` finds `getPassword` only at vendorAgreementFileSchemaRoutes.js:517. passwordVaultService.js defines `storePassword` (:108), `retrievePassword` (:167), `deletePassword` (:226), `hasPassword` (:274) and `scheduleRotation` (:299). Other callers use `retrievePassword` (fileProcessingWorker.js:648, :671; FastSchemaValidationService.js:835).
  - The TypeError is caught at :522 and only logged as a warning, so `passwordsByPattern` stays empty.
  - The old vault passwords are then deleted at :529-537 with the pool service, outside the DB transaction.
  - Result: every bulk save from the form wipes existing archive passwords, and `__KEEP_EXISTING__` restores nothing (:649-658).
  - The form sends `archive_password: '__KEEP_EXISTING__'` whenever `has_archive_password` is true (VendorAgreements.jsx:869), so this fires on every edit save of an agreement with archive passwords. Failures of the bulk PUT are only `console.error`ed (VendorAgreements.jsx:1288-1290), so the user is not told.
  - The vault deletes are also not rolled back if validation (:570, :593) or the INSERT fails.
- Bulk PUT runs `mergeFileQualityRuleIds` on the transaction client (:603-605). The function swallows query errors (:87-90), but a failed query inside a transaction leaves it aborted (Postgres 25P02), so the next INSERT should fail and the route returns 500 with rollback. (Inferred from Postgres transaction behaviour; not run.)
- Frontend and backend schema key names differ.
  - `SchemaFieldEditor.jsx:26-66` reads and emits only `name`/`type`. It does not support the `{columns}` shape (error "Schema must be an array") and drops `quality_rules`. Through the bulk PUT this works, because the bulk route does not check column keys.
  - `FileSchemaManager.jsx:204-209, 241-246` sends the user's raw JSON to POST and PUT `/:schemaId`. Those routes require `column_name` and `data_type` (:314, :833), so `name`/`type` JSON gets 400. `name`+`data_type` (the shape its own comment at :55 describes) also gets 400. The placeholder at FileSchemaManager.jsx:437 suggests `{"fields": [{"name": ..., "type": ...}]}`, which is neither an array, nor `{columns}`, nor a ref token, so it is rejected too.
- FileSchemaManager reads `err.response?.data?.message` (:37, :222, :259, :275), but the backend returns `error` and `details`. The user always sees the generic fallback text.
- FileSchemaManager delete (:271) sends no `hardDelete`, so it is a soft delete, and the list call (:33) sends no `includeInactive`. The row disappears from the UI only. The vault password stays.
- FileSchemaManager sends no `file_type`, `has_header` or `archive_password`, so it cannot manage them.
- Template parse and save disagree on schema. `schema` is optional in the template (service :47), and a headered row without one parses to `schema: null` (:625). Bulk PUT rejects `null` and `[]` with 400 (:592-598). The frontend maps the value to `config.schema || []`, which also fails. The parser accepts `[]` and `{columns: []}` (:943-946) but the routes reject them.
- POST and PUT `/:schemaId` have no handling for `__KEEP_EXISTING__`. The literal string would be stored as the password (:412, :925-930).
- POST checks `ARCHIVE_FILE_TYPES.includes(file_type)` on the raw value (:342), while `file_type` was validated after lowercasing (:334). `"ZIP"` passes the type check but fails the password check.
- POST stores the password without a user id (:412), and the other store calls pass one (:677, :929).
- `file_name_pattern` is required on POST and bulk, but PUT `/:schemaId` can set it to an empty string (:797).
- Hard delete leaves the vault password behind (:1002-1013), and so does soft delete.
- The template upload treats the generated example values as examples by content. A real file-config first row whose first cell starts with `agr-`, or contains `acme`, is dropped without a message (:479-480, loop at :487-492). The upload then fails with "Agreement ... has no file configurations" (:640-647), a 400 (an `AGR-001` agreement in Agreement Info is not skipped, since :449-456 has no `agr-` test).
- Duplicate `agreement_id` rows in Agreement Info overwrite each other without a message (:533).
- Parse failures from a missing sheet or too few rows return 500 with `error.stack` instead of 400 (route :105-117).
- `validateTemplateData` calls `.trim()` on `file_name` and `file_description` (utils :279, :283). A non-string value throws a TypeError, which the route returns as 400 with a raw TypeError message.
- The xlsx and csv template parsers drop any falsy value (`fieldName && value`, utils :200, :234).
- `parse-template` upload errors use `handleMulterError`, which reports a file over 5 MB as 413 "Maximum file size is 10 KB for approval documents" (vendorAgreementRoutes.js:25-26), the wrong limit and wording for this route.
- The Template B instruction text says several fields are "Required" (utils :53-60) that the validator does not enforce (:279-285).
- A long glob (over 200 characters after escaping) gives 500 on test-pattern (regexValidator.js:32), while POST and bulk accept it.

### SECURITY
- The read routes (GET list, GET one, test-pattern) check only the permission and not association with the agreement (:151, :214, :1049). Any user with `vendor_agreements:read` can read the schemas of any agreement, including `has_archive_password`.
- The template routes (download, upload, upload-schema) check only authentication, with no permission (:38, :64, :120). The same applies to `template/:format` and `parse-template`.
- The bulk PUT console-logs the first 3 characters of each archive password and the password lengths (:462-465, :473).
- The upload error response returns `error.stack` to the client (:115). Other routes return `error.message` as `details`.
- Multer checks only the file extension (templateRoutes :14-22, :28-35), with no content check.
- Uploaded files are saved to disk under multer-generated names and are removed after parsing. If the process dies between save and `unlinkSync`, they stay.

### DUPLICATE
- Two template systems for agreements:
  - A: the multi-agreement, multi-sheet service (`vendorAgreementTemplateService`), used by `/vendor-agreement-template/*`.
  - B: the single-agreement field/value template (`AgreementTemplateUtils`), used by `/template/:format` and `/parse-template`.
- How A and B differ:
  - `frequency`: A has `Annual`, B has `Yearly` (service :29, utils :308).
  - `file_type`: A uses lowercase types (15 of them), B uses `CSV, JSON, XML, Parquet, Excel` (service :45, utils :320).
  - `data_classification`: A has `Internal, Highly Confidential`, B has `Private` (service :49, utils :326).
  - Required fields: A requires agreement_id, vendor team and email, and frequency. B requires `file_name` and `file_description`.
  - Schema shape: A accepts an array or `{columns}`. B accepts only an array.
- Schema key normalisation to `name`/`type` is implemented twice: in the service (:953-983) and in upload-schema (:150-188).
- Rule id resolution is implemented twice:
  - `mergeFileQualityRuleIds` takes one id per entry and allows project-scoped rules.
  - `resolveQualityRuleIds` takes all matching global ids.
- Schema-shape validation is implemented in three places: POST, PUT `/:schemaId` and bulk PUT. The bulk copy is weaker.
- Archive types and file types are hard-coded lists in several places (routes :257, :333, :726, :773; service :21, :45).

### DEAD
- None proven in the backend routes.
- `FileSchemaManager` is not dead: `src/pages/VendorAgreements.jsx:15` imports it and `:3333` renders `<FileSchemaManager agreementId={selectedAgreement.id} />` (in the file-schemas tab, `activeTab === 'fileSchemas'` at :3331). `SchemaFieldEditor` is used by `FileConfigurationsSection.jsx:852`, not by `FileSchemaManager`.
- No frontend caller was found in `src/` for `test-pattern`, `template/:format` or `parse-template`. They have no UI caller, but other clients are not ruled out.

### UNCLEAR
- `resolveQualityRuleIds` links every enabled global rule of a type. This means all such rules get attached, not one.
- Soft delete does not set `updated_at` explicitly. The migration defines an `updated_at` BEFORE UPDATE trigger (:56-74) but the prod dump has no trigger line for it, so whether prod has it is unverified.
- `GET /:schemaId` does not return `has_archive_password`, while the list and PUT do.
- `checkFileSchemaAccess` calls `JSON.parse` on `approval_chain_config` only if it is a string (:123-125). The column is JSONB (`addApprovalChainToVendorAgreements.js:25`), so pg returns an object and a malformed-JSON 500 is probably unreachable.

## Domain terms
- file schema, file configuration and file config are the same thing: a row of `vendor_agreement_file_schemas`. The template calls it "File Configuration", and the code calls it `fileSchemas` or `fileConfigurations`.
- file_name_pattern: a glob with `*` and `?`. The template derives it as `<base>*.<type>`.
- schema: an array of columns, or `{columns, file_quality_rules}`, or a reference token (`_schemaRef`, `{schema:x}`, `{external}`, `@schema:`, `@external`, "pending upload").
- Column keys: `name`/`type` (new, from the template) and `column_name`/`data_type` (old).
- header_definition: for headerless files (fixed_width, binary, dat), the column list used instead of a header row.
- quality_rule_ids and file_quality_rules: ids of linked `quality_rules`, and file-level rule type entries.
- `__schema_default__`: a prefix for synthetic rules that are excluded.
- data_classification: `Public, Internal, Confidential, Highly Confidential`, and in B `Private`.
- archive types: `zip, 7z, tar, tar.gz, tar.bz2`.

## Open questions
1. Does the prod `vendor_agreement_file_schemas` table have the `updated_at` trigger? The migration creates it (:56-74); the prod dump shows none.
2. Which migration adds `has_header` and `header_definition`? They are in the prod DDL but none was found.
3. Does the live `vendor_agreements` table have a `vendor_user_id` column? DDL and migrations say no, but a live DB was not checked. The sibling `vendorAgreementRoutes.js:147` reads `agreement.vendor_user_id`; its source (possibly a vendors join) was not checked.
