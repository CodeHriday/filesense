# VAS - Agreement file schemas and templates

## Summary
Three route files plus two helpers. All paths are relative to the repo root.
- Per-agreement file schemas (CRUD, bulk replace, pattern test) in `backend/routes/vendorAgreementFileSchemaRoutes.js`. It is mounted at `/api/vendor-agreements` behind `authenticateToken` (server.js:13895-13896).
- A multi-sheet Excel template (download, upload and parse, JSON schema file upload) in `backend/routes/vendorAgreementTemplateRoutes.js`. It is mounted at `/api` (server.js:13905-13906), and each route applies `authenticateToken` itself.
- A second, older single-agreement template (xlsx, csv, json) in `backend/routes/vendorAgreementRoutes.js:1499-1595`. It is mounted behind `authenticateToken` (server.js:13885-13886). Helper: `backend/utils/agreementTemplateUtils.js`.
- Schemas are stored as JSON in table `vendor_agreement_file_schemas`. Archive passwords go to a password vault, not the table.
- Coverage limits:
  - I read fully the two route files, the schema routes, and `vendorAgreementTemplateService.js` lines 1-55, 200-270 and 405-1004.
  - I read `agreementTemplateUtils.js` lines 186-355 only.
  - I did not read the frontend components `FileSchemaManager.jsx` and `SchemaFieldEditor.jsx` beyond grep.
  - I did not read `requirePermission`, `userHasAdminAccess` or `globToRegex`.

## Entry points

### Common to schema routes (vendorAgreementFileSchemaRoutes.js)
- Every route has `requirePermission('vendor_agreements:read' or ':write')` (:151, :214, :256, :448, :725, :981, :1049). The implementation was not traced.
- The write routes POST, PUT (bulk), PUT (:schemaId) and DELETE also call `checkFileSchemaAccess(req.user, agreementId)` (:262, :455, :731, :986). Rules:
  - Admins (`userHasAdminAccess`) pass (:100).
  - Otherwise the agreement is looked up. A missing row gives 404 "Vendor agreement not found" (:109-111).
  - Access is granted when `file_owner_user_id`, `created_by` or `vendor_user_id` equals `user.id` (:115-117).
  - Access is also granted when `primary_contact_email` or `secondary_contact_email` equals `user.email` (:118-121).
  - Access is also granted when `user.id` is in some `approval_chain_config.steps[].approver_user_ids` (:123-134).
  - Otherwise the response is 403 "Access denied. You are not associated with this agreement." (:136).
- The three read routes do not call `checkFileSchemaAccess` (see Flags).
- Error responses are 500 `{success:false, error, details: error.message}` on every route.

### GET /api/vendor-agreements/:agreementId/file-schemas (:151)
- **Inputs:** query `includeInactive`. Only the literal `'true'` includes inactive rows (:170).
- **Behaviour:**
  - Selects `vafs.*` plus the creator and updater usernames.
  - Filters `is_active = TRUE` by default.
  - Orders by `priority ASC, id ASC` (:174).
  - Adds `has_archive_password` per schema from `passwordVaultService.hasPassword('vendor_agreement_file_schema', id)` (:183). A vault error is logged and gives false.
- **Output:** `{success, fileSchemas, total}`.

### GET .../file-schemas/:schemaId (:214)
- **Behaviour:** looks up by id and agreement id. Not found gives 404 "File schema not found".
- **Output:** `{success, fileSchema}`. It does not include `has_archive_password`.

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

### PUT .../file-schemas (bulk replace) (:448)
- **Body:** `{fileSchemas: []}`. It must be an array or 400 (:478).
- **Flow:**
  1. The agreement must exist (404) (:486-496).
  2. BEGIN (:500). Existing schemas are read.
  3. For each existing schema with a vault password, it calls `passwordVaultService.getPassword` and keeps a map of file_name_pattern to password (:511-526).
  4. It deletes every vault password for the existing schemas (:529-537).
  5. It deletes every existing schema row (:540-543).
  6. It inserts each new schema (:551-667).
  7. COMMIT (:669).
  8. After commit it stores the passwords (:674-689).
- **Per-item defaults:** same as POST, plus `archive_password=''`.
- **Per-item validation:** `file_name_pattern` is required, and `schema` must be a non-empty array, a `{columns}` object or a ref token. Any failure rolls back and returns 400 (:569-598). Column fields, `file_type`, `data_classification` and the archive-type rule are not validated.
- **Passwords:**
  - `archive_password === '__KEEP_EXISTING__'` restores the password saved for the same `file_name_pattern` (:649-658).
  - Any other non-blank value is stored as new (:659-666).
  - Password-store errors are logged and the request still succeeds (:685-687).
- **Output:** 200 `{success, fileSchemas, message:"Successfully replaced file schemas (N schemas created)"}`.
- **Logging:** it prints to console the first 3 characters of each archive password (:462-465).
- **Callers:** called from the agreement form (VAG.md:112 cites `src/pages/VendorAgreements.jsx:1287`).

### PUT .../file-schemas/:schemaId (:725)
- **Behaviour:** a dynamic partial update. Only fields that are not `undefined` are updated (:797-889). The schema must belong to the agreement (404) (:751-761).
- **Validation:**
  - `data_classification` and `file_type` use the same lists as POST.
  - If `schema` is supplied it must be a non-empty array, a `{columns}` object or a ref token, and every column needs `column_name` and `data_type` (:822-840).
  - `archive_password` is checked against the effective file type, which is the new one or else the stored one (:782-790).
  - If there are no updates and `archive_password` is undefined, the response is 400 "No fields to update" (:891).
- **Writes:**
  - `updated_by` is set (:901). `updated_at` is not set explicitly.
  - `file_schemas.quality_rule_ids` is replaced as given. `file_quality_rules` is not merged here.
- **Archive password:** a non-blank value is stored with the user id. A blank string deletes the vault password (:925-942).
- **Output:** `{success, fileSchema (+has_archive_password), message}`.

### DELETE .../file-schemas/:schemaId (:981)
- **Input:** query `hardDelete`. The literal `'true'` gives a hard DELETE (:1002-1007). Anything else sets `is_active = FALSE, updated_by` (:1016-1021).
- **Errors:** 404 if the schema is not found.
- **Output:** `{success, message:"File schema deleted successfully"}`.
- **Vault:** the vault password is not deleted on either path.

### POST .../file-schemas/test-pattern (:1049)
- **Body:** `pattern` and `fileName`, both required (400). The path `agreementId` is unused.
- **Behaviour:** `matchesPattern(fileName, pattern)` converts a glob (`*` and `?`) to a regex through `globToRegex` (filePatternMatcher.js:13-27).
- **Output:** `{success, matches, pattern, fileName}`.
- **Route precedence:** it is a POST on a different path from the POST create route. It does not conflict with GET or PUT `/:schemaId`, which use other methods.

### GET /api/vendor-agreement-template/download (vendorAgreementTemplateRoutes.js:38)
- **Auth:** `authenticateToken` only. There is no permission check.
- **Behaviour:** builds the workbook with `generateTemplate()` (:40). It sets the attachment name `vendor_agreement_template_<YYYY-MM-DD>.xlsx`, with the date from `toISOString()`, so it is UTC (:48).
- **Template layout:**
  - Sheets are "Agreement Info", "File Configurations" and an instructions sheet (service :57-65, :414-419).
  - Example rows are AGR001 with two file configurations (:219-242).
- **Errors:** 500 `{error, details}`.

### POST /api/vendor-agreement-template/upload (:64)
- **Auth:** `authenticateToken`.
- **Upload:** multipart field `template`. Disk storage in `uploads/templates/`. Limit 5 MB. Only `.xlsx` or `.xls` by extension (:11-23). There is no 400 handler for a file-filter error.
- **Flow:**
  1. `parseTemplateUpload(path)` (:71), then `fs.unlinkSync` (:74).
  2. If `!result.success` it returns 400 `{error:'Template validation failed', details: errors, totalRows, validRows}` (:76-84).
  3. Otherwise it calls `resolveQualityRuleIds(pool, all fileConfigs)`. A failure there is non-fatal (:88-94).
- **Output:** 200 `{success, message:"Successfully parsed N vendor agreement(s)", agreements, totalRows, validRows}`.
- **DB writes:** nothing is saved. It only returns the parsed data to the client.
- **Error case:** 500 includes `message` and `details: error.stack` (:112-116).
- **Parse rules** (service :409-661):
  - Both sheets are required, and each needs at least 2 rows (:414-442).
  - Header cells are matched to fields by their exact label text. Unknown headers are ignored.
  - Example rows at the top are skipped:
    - Agreement rows are skipped when the first cell starts with `e.g.` or `example`, or is `agr001` with the description "Customer data export agreement" (:449-456).
    - File-config rows are skipped when the first cell starts with `e.g.`, `example` or `agr-`, includes `acme`, or is `agr001` with pattern `customer_data` or `legacy_transactions` (:473-483).
  - Blank rows are skipped.
  - Agreement fields (:24-35):
    - Required: agreement_id, vendor_department_team, vendor_department_email, frequency.
    - frequency is one of `Daily, Weekly, Monthly, Quarterly, Annual, Ad-hoc`.
    - delivery_method is one of `SFTP, S3, API, Email, Manual`.
    - retention_days is parsed with `parseInt` (:834-842).
  - File-config fields (:41-50):
    - Required: agreement_id, file_name_pattern, file_type. file_type uses the same 15-type list as the routes.
    - Booleans must be TRUE or FALSE, case-insensitive (:824-832).
  - Each file config must reference an agreement in the Agreement Info sheet (:571-575).
  - `has_header` defaults to true, except false for `fixed_width`, `binary` and `dat` (:579-583). If a fixed-width type has `has_header` true it is an error (:586-588).
  - When `has_header` is false and there is no valid schema, it is an error unless the file type is an archive type (:592-599).
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
  - It looks up all enabled, global (`project_id IS NULL`), non-`__schema_default__` rules of the mapped engine type. For `validity` it also requires `rule_config->>'datatype'` to match. For `completeness` it requires `threshold = 1.0` (:715-752).
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

### GET /api/vendor-agreements/template/:format (vendorAgreementRoutes.js:1499)
- **Auth:** only the mount-level `authenticateToken` (server.js:13886). There is no `requirePermission`.
- **Formats:** `xlsx` or `excel`, `csv`, `json`, case-insensitive. Anything else gives 400 "Invalid format. Use xlsx, csv, or json." (:1504-1526).
- **Output:** the file attachment `agreement_template.<ext>`. It comes from `AgreementTemplateUtils.generate*Template` (not read).

### POST /api/vendor-agreements/parse-template (vendorAgreementRoutes.js:1542)
- **Auth:** only the mount-level `authenticateToken`.
- **Upload:** field `templateFile`. Memory storage. Limit 5 MB. Allowed extensions `.xlsx .xls .csv .json` (:64-74).
- **Flow:** the parser is picked by extension (:1551-1567). The data then goes to `validateTemplateData`.
- **Parsing:** the xlsx and csv parsers read a two-column field/value list, skipping the header row (utils :196-203, :228-238). The JSON parser removes `_instructions` (:261).
- **Validation rules** (utils :275-352):
  - `file_name` and `file_description` are required.
  - `schema`, if present, must be an array. Each item needs `column_name` or `name`, and `data_type` or `type`.
  - `frequency` must be one of `Daily, Weekly, Monthly, Quarterly, Yearly, Ad-hoc`.
  - `delivery_method` must be one of `SFTP, S3, API, Email, Manual`.
  - `file_type` must be one of `CSV, JSON, XML, Parquet, Excel`.
  - `data_classification` must be one of `Public, Private, Confidential`.
  - `contains_pii` must be the string `true` or `false`.
  - `retention_days` must be a number greater than 0.
- **Errors:** validation failure gives 400 `{error, validationErrors}` (:1573). Any thrown error also gives 400 with its message (:1591).
- **Output:** `{success, data}`. An array `schema` is turned into a pretty-printed JSON string (:1580-1582).
- **Persistence:** nothing is saved.

## Data touched
- `vendor_agreement_file_schemas`. Columns written: `vendor_agreement_id, file_name_pattern, file_description, schema, priority, is_active, contains_pii, data_classification, file_type, quality_rule_ids, column_metadata, has_header, header_definition, created_by, updated_by`. The migration (createVendorAgreementFileSchemas.js) was not read.
- `vendor_agreements`: read for `project_id` and the access fields.
- `users`: read for the username join.
- `quality_rules`: read to resolve ids.
- Password vault, entity type `'vendor_agreement_file_schema'`, with `hasPassword`, `storePassword`, `deletePassword` and `getPassword`.
- Disk: `uploads/templates/` and `uploads/schemas/`, deleted after parsing.

## Flags

### BUG
- Bulk PUT calls `passwordVaultService.getPassword` (:517), which does not exist; the vault defines `retrievePassword` (per ARC.md:326, passwordVaultService.js:167, not re-verified by me).
  - The TypeError is caught (:522).
  - Old passwords are then deleted (:529-537), so `__KEEP_EXISTING__` restores nothing.
  - The deletes happen outside the DB transaction, so they are not rolled back on a validation error (:570, :593).
- POST and PUT `/:schemaId` have no handling for `__KEEP_EXISTING__`. The literal string would be stored as the password (:412, :925-930).
- POST checks `ARCHIVE_FILE_TYPES.includes(file_type)` on the raw value (:342), while `file_type` was validated after lowercasing (:334). `"ZIP"` passes the type check but fails the password check.
- POST stores the password without a user id (:412), and the other store calls pass one (:677, :929).
- `file_name_pattern` is required on POST and bulk, but PUT `/:schemaId` can set it to an empty string (:797).
- Hard delete leaves the vault password behind (:1002-1013), and so does soft delete.
- Frontend and backend schema key names differ (see UNCLEAR).
- The template upload treats the generated example values as examples by content. A real first row whose first cell starts with `agr-`, or contains `acme`, is dropped silently (:479-480).

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
- None proven. The frontend caller of `test-pattern` was not found in grep of `src/` (the greps matched only `file-schemas` in FileSchemaManager.jsx:33,209,246,271, MappingWizard.jsx:385 and ExpressionModal.jsx:66).
- No importer of `FileSchemaManager` was found in the grep (limited to 20 results).

### UNCLEAR
- Template upload returns the `name`/`type` form, but the single-schema POST and PUT require `column_name`/`data_type` (:314, :833), and bulk PUT does not check. It is not known which shape the front end sends to POST and PUT.
- `resolveQualityRuleIds` links every enabled global rule of a type. This means all such rules get attached, not one.
- Soft delete does not set `updated_at` explicitly. Whether a DB trigger does is unknown.
- `GET /:schemaId` does not return `has_archive_password`, while the list and PUT do.

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
1. What do `requirePermission` and `userHasAdminAccess` actually check? They were not read.
2. Which front-end calls use `template/:format`, `parse-template` and `test-pattern`? No caller was found for the last. Is `FileSchemaManager` mounted anywhere?
3. Which column key shape does the front end send to POST and PUT `/:schemaId` (name/type or column_name/data_type)?
4. How does `globToRegex` (regexValidator.js) treat characters other than `*` and `?`, such as `.` and brackets? Not read.
5. What do `generateExcelTemplate`, `generateCSVTemplate` and `generateJSONTemplate` (agreementTemplateUtils.js:1-186) emit? Not read, nor service lines 55-200 and 267-405 (the instruction text).
6. Does `vendor_agreement_file_schemas` have `updated_at` triggers, unique constraints on (agreement, pattern), or cascade deletes? The migration was not read.
7. Does the multer file-filter error in templateRoutes get a handler elsewhere in `server.js`? No handler exists in the file itself.
8. Which route is hit first when `vendorAgreementRoutes` (server.js:13886) and the file-schema routes (:13896) share the `/api/vendor-agreements` prefix? Not checked for conflicts.
