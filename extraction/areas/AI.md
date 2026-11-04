# AI (AI assistants & LLM providers)

## Summary
Two unrelated AI stacks exist.
1. Node (`backend/services/AIService.js`, routes `backend/routes/aiRoutes.js`): local MiniLM embeddings (`Xenova/all-MiniLM-L6-v2`, AIService.js:106) for "related datasets", a rule-based relationship explainer, and a "chat" that is keyword rule-based, not an LLM (`CHAT_MODEL = 'rule-based'`, AIService.js:112; used at :608).
2. Python (`profile_api.py` + `backend/ai_providers/*`): pluggable providers (openai, bedrock, azure, gemini, rule-based) that generate data-quality (DQ) rule suggestions, plus an `app_settings` store for the provider choice and an enable flag.
The 5 Python endpoints have no authentication. The 4 Node endpoints require any valid JWT because they are mounted as `app.use('/api/ai', authenticateToken, aiRoutes(diContainer))` (server.js:13866); none has an ownership, role or project check.

## Entry points

### GET /api/ai/related-datasets/:fileId (aiRoutes.js:24)
- Trigger: HTTP. Caller restrictions: `authenticateToken` at the mount (server.js:13866); no ownership, role or project check in aiRoutes.js.
- Inputs: `limit` default 5, `threshold` default 0.5 (:27), parsed with parseInt/parseFloat (:33-34), no validation (NaN possible).
- Logic (AIService.js:292-365): file or profile missing -> `[]` (:298-301). Compares against the result of `getAllFiles()` called with no options (AIService.js:304). Its defaults are `limit = 50`, `sortBy = 'created_at'`, `sortOrder = 'DESC'`, no `projectIds` (FileService.js:307-316), and it excludes files whose `file_role` is 'target' (FileService.js:345-346). The target file itself is filtered out only after that 50-file fetch (AIService.js:304-306), so at most 49 candidates remain. So only the 50 newest non-target files, across all projects, are fetched and compared. `ORDER BY created_at DESC` has no tie-breaker, so the order is not fully deterministic for equal timestamps. Skips any file whose `filename` was already added (:322). Files with no profile are skipped (:329). Embeds each file's text (:335). Keeps those with `similarity >= threshold` (:341). Sorts descending and slices to `limit` (:357-359).
- Output: JSON array of `{file_id, filename, similarity, file_type, created_at, quality_score}` (:342-349). These come from files of any project, so filenames and quality scores cross project boundaries. Errors return 500 `{error}` (aiRoutes.js:40).
- Cost: files are processed sequentially, up to 50 embeddings and profile fetches per request. The first call may block on the model download (initializeModels retry loop, AIService.js:129-149).
- Side effects: in-memory embedding cache (NodeCache TTL 3600s, AIService.js:81-86). First use downloads a model from Hugging Face.
- Similarity: dot product of normalized vectors, clamped to [0,1] (:277). Mismatched or invalid vectors return 0 (:259-266).

### GET /api/ai/relationship-explanation (aiRoutes.js:47)
- Caller restrictions: `authenticateToken` at the mount (server.js:13866); no ownership check.
- Inputs: query `fileId1`, `fileId2`; both required, else 400 (:51-53).
- Logic (AIService.js:457-543). Column overlap % = case-insensitive name matches / max(column counts) * 100 (:482-487). Tiers: >=80 `nearly_identical`, >=50 `strongly_related`, >=30 `moderately_related`, else `weakly_related` (:499-511). Same or different file type text is appended (:514-518).
- Missing file or profile returns 200 `{relationship_type:'unknown', explanation}` (:466-472). Any error returns 200 with `relationship_type:'error'` (:538-541).
- Edge cases: if both files have 0 columns, overlap is 0/0 = NaN, giving 'weakly_related' with "NaN%". A column with a null `name` throws and returns the 200 'error'. Comparing a file with itself is allowed.
- Output: `{relationship_type, explanation, matching_columns, overlap_percentage, same_file_type}`. The embedding similarity is shown only in the weakly_related text (:510).

### GET /api/ai/file-embedding/:fileId (aiRoutes.js:69)
- Caller restrictions: `authenticateToken` at the mount (server.js:13866); no ownership check.
- Logic: file or profile missing -> 404 (:78-80). Otherwise generates the embedding.
- Output: `{file_id, embedding_size, embedding_type:'float32', success:true}` (:84-89). The vector itself is not returned.
- Embedding text includes filename, type, row and column counts, quality score, per-column stats, and a type histogram (AIService.js:386-432). Cached by `file_emb_<file_id>` (:377). The cache key ignores profile changes, so it is stale for up to 1h.

### POST /api/ai/chat (aiRoutes.js:99)
- Caller restrictions: `authenticateToken` at the mount (server.js:13866); no ownership check.
- Inputs: body `fileId`, `message` (both required, else 400 :103-105), `chatHistory` default `[]` (not used by the rule-based path, AIService.js:608).
- Logic (AIService.js:579-621): file or profile missing returns 200 `{response:"I don't have information...", error:'Dataset not found'}` (:587-590). Response cached 3600s under `chat_<fileId>_<first 40 chars of base64(message)>` (:594, :611). Answer from `generateIntelligentResponse` (:847+, keyword rules; thresholds include unique ratio >0.9 and <0.1, :986-987, and string unique ratio <0.5, :1014).
- Errors: the service returns 200 with an error text (:616-619). The route's own catch returns 500 `{error, response:'An error occurred...'}` (aiRoutes.js:113-116).
- No external LLM call. No row data is read, only profile statistics. Profile values such as `most_frequent_value` are echoed in replies and used in the embedding text (AIService.js:411-412).
- Keyword rules in `generateIntelligentResponse` (AIService.js:847-1038), tested in this order on the lowercased message; the first match wins:
  1. `hello`, `hi` or `help` (:857). This is a substring match, so "this", "which", "history" and "within" match 'hi'. The reply is a random greeting (`crypto.randomInt`), and it is then cached for 1h (:611), so the random pick sticks.
  2. "how many" with column or field.
  3. "how many" with row.
  4. `size` or `big`.
  5. `quality`, `good` or `clean`. Tiers: >=90 "excellent", <90 "pretty good", <70 "fair", <50 "needs some attention" (AIService.js:885-900). The greeting text hard-codes "pretty good" (:859).
  6. A column name mention (case-insensitive, also with `_` and spaces removed). Hints: unique ratio >95% means identifier, <10% means categorical. rowCount 0 gives NaN.
  7. `string` or `text` (only `type === 'string'`).
  8. `number`, `numeric` or `decimal` (only 'decimal' and 'integer').
  9. `date` or `time` (:959), so "sometimes" and "timeline" match. Only 'date' and 'datetime'.
  10. `missing`, `null` or `empty`. Severity text at 10% and 25% of rows*cols.
  11. `unique` or `distinct`.
  12. `analyze`, `insight` or `pattern`.
  13. Default: one of 3 random canned replies.

### POST /api/dq-suggestions (profile_api.py:1926)
- Auth: none. Inputs: JSON `columns` (required non-empty, else 400 :1943-1944), `filename` default 'unknown', `fileId`, optional `provider`. An empty or missing body gives 400 "No data provided" (:1936). A JSON body that is not an object (for example a list) raises AttributeError and gives 500.
- Rules: if DB is reachable, read `ai_dq_suggestions_enabled` (default 'true') and `ai_provider` (default 'rule-based') from `app_settings` (:1953-1961). If disabled, return 200 `{enabled:false, suggestions:[], message}` (:1963-1968).
- Provider precedence: request `provider` > DB setting > env `AI_PROVIDER` > 'rule-based' (:1974). When the DB is up, the DB default 'rule-based' always wins over the env var (see BUG).
- Calls `AIProviderFactory.get_provider(name).generate_dq_suggestions(columns, filename, file_id)` (:1975-1980).
- Output 200: `{enabled:true, suggestions, filename, fileId, generatedAt (server local time, naive isoformat), provider}` (:1984-1991). Errors: 500 `{error, details, suggestions:[]}` (:2001-2005). The raw exception text goes to the client. `json.JSONDecodeError` gives a separate 500 (:1993-1998). A cloud provider without credentials raises RuntimeError("client not initialized") and gives 500 with `details`. A cloud API failure gives 500 with the SDK message.
- External call: sends column profile summaries to the cloud provider. All four cloud providers (openai, azure, bedrock, gemini) build the same summary: name, type, completeness, uniqueCount, hasNulls, first 5 patterns, semanticType (openai_provider.py:128-136; same for the others: azure_provider.py:130, bedrock_provider.py:133, gemini_provider.py:107). None sends `sampleValues`. `filename` is sent too, and `patterns` could hold real value formats.
- Caller-supplied `columns`, `filename` and `patterns` go into the prompt (prompt injection into a paid call).

### GET /api/ai-providers (profile_api.py:2008)
- Auth: none. Lists all registered providers by instantiating each (base.py:129-144), which may probe external APIs. Per-provider failure gives `{name, available:false, error}`.
- Output: `{providers, current_provider, ai_enabled}`. current_provider: DB `ai_provider` else env `AI_PROVIDER` else 'rule-based' (:2020, :2034).

### PUT /api/ai-providers/current (profile_api.py:2049)
- Auth: none. Body `provider`, required (400 :2058). Must be 'auto' or a registered name, else 400 (:2064-2065). Note the registered names come from `PROVIDERS`, which are case-sensitive here but lowercased in the factory (base.py:97).
- Side effect: upsert `app_settings` row `ai_provider` with the description text and `updated_at = NOW()` (:2073-2079). Returns hard-coded static provider info (:2089-2100), so `available: True` is always reported and does not reflect real availability. The static info reports a generic `privacy_level: 'cloud'` for openai, bedrock, azure and gemini (:2091-2094), while the real providers report 'cloud-aws', 'cloud-azure' and 'cloud-gcp'; the base `get_provider_info` also returns 'cloud' (base.py:67).
- No DB returns 500 (:2069).

### GET /api/settings/<setting_key> (profile_api.py:2115)
- Auth: none. Any key can be read, including keys used by Node features (`profile_retention_count`, appSettingsService.js:72; `default_email_connection_id`, VendorAgreementNotificationService.js:341). Missing key: 200 default for `ai_dq_suggestions_enabled` ('true') and `ai_provider` ('rule-based'), else 404 (:2132-2144). Output `{key, value, description}`.

### PUT /api/settings/<setting_key> (profile_api.py:2159)
- Auth: none. Any key, any value (`str(data['value'])`), upserted into `app_settings` (:2173-2179). The key is not whitelisted and the value is not validated. The value is written to the log (:2185). `setting_key` is `varchar(100)` (schema file FileSence_prod_schema_Jan_05_1767780691950.sql:2623), so a longer key gives 500.
- Seed: `initialize_settings` inserts defaults (`ai_dq_suggestions_enabled='true'`, `ai_provider='rule-based'`) with `ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()` (:2199-2220). It is called from `initialize_app` under `__main__` (:2254-2258). Every Flask start therefore resets both keys to their defaults (see BUG).

## Provider internals (reached from /api/dq-suggestions)
- Factory: names lowercased; unknown name falls back to 'rule-based' with a warning (base.py:97-104). 'auto' (also the default when the name is None, :95) tries in order openai, bedrock, azure, gemini, rule-based and takes the first `is_available()` (:112-124).
- openai: model hard-coded `gpt-4o`, temperature 0.3, max_tokens 2000, timeout 60s, `json_object` response (openai_provider.py:70-107). Key from `AI_INTEGRATIONS_OPENAI_API_KEY` or `OPENAI_API_KEY`, optional base URL (:28-35). Result read from `suggestions` or `rules` key; a dict is wrapped into a list (:112-115). Missing ids become `dq_suggestion_N`. `fileId` and `provider` are set (:117-121).
- bedrock: model env `BEDROCK_MODEL_ID` default `anthropic.claude-3-sonnet-20240229-v1:0`, max_tokens 2000, temperature 0.3 (bedrock_provider.py:18, :81-82). Requires `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (:14). Region from `AWS_REGION`, default us-east-1 (:19). A non-"anthropic" model id uses a Titan request path (:107-124, 70-73). `_parse_response` swallows parse errors and returns 200 with `[]` (:166-168) and does not read the `rules` key, unlike the other providers. privacy_level "cloud-aws".
- azure: requires `AZURE_OPENAI_KEY` and `AZURE_OPENAI_ENDPOINT` (azure_provider.py:14); deployment defaults to `gpt-4o` and `AZURE_OPENAI_API_VERSION` to `2024-02-15-preview` (:18-19); temperature 0.3, max_tokens 2000 (:103-104); privacy_level "cloud-azure".
- gemini: model env `GEMINI_MODEL` default `gemini-1.5-flash`; needs `GOOGLE_API_KEY` or `GOOGLE_APPLICATION_CREDENTIALS` (gemini_provider.py:18, :26-30); temperature 0.3 (:78); privacy_level "cloud-gcp".
- rule-based (local, no external call, rule_based_provider.py): per column runs completeness, uniqueness, duplicate, validity, special-character, length and freshness checks (:68-74).
  - Completeness: runs if `has_nulls` or completeness < 100. Severity is critical if <80, error if <95, else warning (:89-95).
  - NA-placeholder check from sample values, severity warning (:106-121).
  - Uniqueness: columns whose name matches id/key/code patterns get a rule. Severity is critical only if unique_count == 0, else warning (:129-135).
  - Duplicate: key-like columns with duplicate % > 0. Severity critical >10, error >5, else warning (:164-169). Also needs `total_count>0` and `unique_count>0`.
  - Validity (rule_based_provider.py:186-268): email (name contains 'email' or semantic email, warning, regex at :195); phone (name contains phone, tel, mobile or fax; warning; `^[\d\s\-\+\(\)\.]{7,20}$`, :209); date (name has 'date', '_dt' or '_ts'; `^\d{4}-\d{2}-\d{2}`; warning); postal (zip, postal or postcode; `^\d{5}(-\d{4})?$`; info); range check (numeric types with amount, price, cost, total, qty or quantity in the name; min 0; info; `rule_type` 'range_check', :246); SSN (`rule_type` 'validity_check', warning, :259).
  - Special characters (:272+): STRING/TEXT/VARCHAR/CHAR only. Code-field names (code, sku, upc, ean, isbn, part_number, product_id, serial, batch, lot, reference; :282) always get the rule, regex `^[A-Za-z0-9\-\_\.]+$` (warning). Name-like fields get it only if a sample value has a char outside `[\w\s\-.,@#()&/]` (info).
  - Length: lookup table by name substring (zip, postal, phone, mobile, ssn, ein, credit_card, account_number, routing_number, state, country_code, currency_code, sku, upc, ean, isbn); first match wins (warning), `rule_type` 'length_check' (:358). Plus a "Maximum Length Check" (info, 'length_check', :371-374) if min != max and max > 100.
  - Freshness: name contains created, updated, modified, timestamp, _at, _ts, last_, processed or ingested, or semantic type datetime or timestamp. Rule config `max_age_days: 30` (:403), info.
  - Ids are numbered sequentially across columns (:77).
  - Name matching is by substring, so false positives occur: 'key' matches "monkey", 'code' matches "barcode" (:130, :155), 'state' matches "estate" (length table, :345), 'order' matches "border" and 'ref' matches "prefix" (:156), and 'tel' matches "hotel" (:200). Also `name_lower.endswith('id')` matches "paid", "valid" and "android" (:132, :157); 'date' matches "update", "candidate" and "mandate" (:214); 'lot' matches "plot" and "slot" (:283).
  - Payload field names: the provider reads `uniqueCount` (fallback `distinct_count`, default 0) and `totalCount` (fallback `total_count`, default 0) at rule_based_provider.py:59-60. The frontend sends the same names, mapped as `uniqueCount: col.uniqueCount || col.distinct_count || col.unique_count` and `totalCount: col.totalCount || col.total_count || 0` (src/components/AIDQSuggestionsTab.jsx:190-191). So the names match. The Flask column profile emits `unique_count` (profile_api.py:1574), which the frontend maps to `uniqueCount`. The Flask column profile (profile_api.py:1568-1576) has no `total_count`, so totalCount would be 0 and the duplicate check (needs total_count>0, :159) would not fire, but only if the stored profile columns really lack it; this was not established.
  - Other fields: the frontend computes `completeness: col.completeness || (100 - (col.nullPercentage || 0))` (AIDQSuggestionsTab.jsx:189), while the Flask profile emits snake_case `null_percentage` (profile_api.py:1573) and no `completeness` or `nullPercentage`. If the stored profile has only `null_percentage`, completeness is sent as 100. `hasNulls` is computed from `col.nullPercentage > 0 || col.null_count > 0` (:197) and `null_count` is emitted (profile_api.py:1572), so hasNulls still works. In that case the completeness rule would fire with completeness 100 (severity "warning", reason "0.0% missing values", rule_based_provider.py:89-101) for columns with nulls. Whether the stored profile has these fields was not checked.
- Provider display_name is not in the base `get_provider_info` (base.py:61-68), but the endpoint logs `provider_info.get('display_name', ...)` (profile_api.py:1978).

## Data touched
- `app_settings` (`setting_key` varchar(100) NOT NULL UNIQUE, `setting_value` text NOT NULL, `description` text, `created_at`, `updated_at`; schema file FileSence_prod_schema_Jan_05_1767780691950.sql:2623-2633): read and written (profile_api.py:1953, 2073, 2125, 2173). The table is shared with Node features: `profile_retention_count` (appSettingsService.js:72; admin route adminSettingsRoutes.js:39) and `default_email_connection_id` (VendorAgreementNotificationService.js:341).
- Node side reads files and profiles through `fileService.getFileById`, `getFileProfile` and `getAllFiles`. Nothing is persisted. Caches are in-process memory only (AIService.js:81-88).
- External: Hugging Face model download (AIService.js:140), OpenAI, AWS Bedrock, Azure OpenAI and Google Gemini APIs.
- Env vars: HUGGING_FACE_TOKEN, AI_PROVIDER, OPENAI/AI_INTEGRATIONS_OPENAI_*, BEDROCK_MODEL_ID, AWS_*, AZURE_OPENAI_*, GOOGLE_API_KEY, GEMINI_MODEL.

## Flags
- SECURITY: PUT /api/ai-providers/current and PUT /api/settings/<key> are unauthenticated and the key is not whitelisted (profile_api.py:2049, 2159). Anyone reaching the API can switch the provider (and so send profile data to a cloud vendor) or write arbitrary settings.
- SECURITY: the unauthenticated GET and PUT /api/settings/<key> also reach `profile_retention_count` and `default_email_connection_id`, which Node serves only through admin routes (adminSettingsRoutes.js:39; mount `/api/admin` with authenticateToken + requireAdmin, server.js:13876). This bypasses that gate for reads and writes. Table: schema file FileSence_prod_schema_Jan_05_1767780691950.sql:2623.
- SECURITY: POST /api/dq-suggestions and GET /api/ai-providers are unauthenticated. The `provider` request parameter lets any caller trigger paid cloud calls (:1941, :1974), with caller-supplied columns/filename/patterns in the prompt. Cost per call is capped by max_tokens 2000 but nothing caps request volume.
- SECURITY: Node /api/ai/* routes require a valid JWT (server.js:13866) but have no ownership, project or role check. Any logged-in user can chat about, embed or compare any `fileId` (aiRoutes.js:24, :47, :69, :99; `getFileById` is a plain select by id).
- SECURITY: related-datasets returns filename, file_type and quality_score of files from any project to any authenticated user (AIService.js:304, FileService.js:307-316).
- SECURITY: raw exception text is returned to clients (aiRoutes.js:40, profile_api.py:2003). A cloud provider without credentials gives a 500 that includes `details`.
- SECURITY: the `authenticatedFetch` wrapper replaces `global.fetch` process-wide and attaches the HF token to any URL containing 'huggingface.co' (AIService.js:33, 44). It is restored after 10s (:73-78). Further problems: `global.HF_TOKEN = HF_TOKEN` exposes the token to all code in the process (:25); `url.includes` throws TypeError if a caller passes a `URL` or `Request` object, which breaks fetch process-wide during the window (:33); spreading `options.headers` drops the entries of a `Headers` instance (:34-37); the token is also set in `transformers.env.backends.onnx.httpHeaders` (:59), and model-init retries after the restore (3s and 30s, :135, :148) get no fetch header.
- SECURITY: Flask reachability. The `/profile-api` proxy to Flask is registered only when NODE_ENV is 'production' (server.js:13968-13983) with no auth. Flask binds `0.0.0.0` on port 8000 (profile_api.py:2261); CORS (profile_api.py:58-63) only restricts browsers. Whether :8000 is directly reachable depends on deployment.
- BUG: when the DB is reachable, `configured_provider` defaults to 'rule-based' (profile_api.py:1961). The env `AI_PROVIDER` fallback at :1974 is therefore never reached in that case. This differs from `/api/ai-providers`, which does fall back to env (:2034).
- BUG: `initialize_settings` uses `ON CONFLICT ... DO UPDATE` (profile_api.py:2218-2219), while the comment at :2253 says DO NOTHING and the docstring says "so they always exist". Every Flask restart resets `ai_provider` to 'rule-based' and `ai_dq_suggestions_enabled` to 'true', overwriting admin choices.
- BUG: PUT /api/ai-providers/current returns `available: True` for every provider from a static table (profile_api.py:2089-2100), regardless of credentials. The table also reports a generic `privacy_level: 'cloud'` for openai, bedrock, azure and gemini (:2091-2094), unlike the real providers' 'cloud-aws', 'cloud-azure' and 'cloud-gcp'; the base `get_provider_info` also returns 'cloud' (base.py:67).
- BUG: related-datasets dedupes by filename only after a file passes the threshold (AIService.js:322, 352). The order is `created_at DESC` with no tie-breaker (FileService.js:391-396), so, except for equal timestamps, the newest file with a name is seen first. But a newer file below the threshold does not block an older same-named one that passes. The comment says "prefer the most recent version".
- BUG: the embedding cache key is `emb_` + the first 40 chars of the base64 of the text (AIService.js:161), i.e. the first 30 bytes of the text. File text starts "Dataset: " (9 bytes), so only the first 21 characters of the filename count. `generateEmbedding` returns the cached vector before embedding (:163-168). Any two files whose names share their first 21 characters (for example `customer_transactions_2024_01.csv` and `_02.csv`) get identical embeddings and similarity 1.0, whatever their columns. This corrupts related-datasets and the weakly_related text. The chat cache key (:594) likewise uses only the first 40 base64 chars of the message, so long messages that share their first about 30 chars return the same cached answer. The key does not include the file's profile version either.
- BUG: chat keyword rules use substring matching in a fixed order (AIService.js:857, 959): 'hi' matches "this"/"which", giving a random greeting that is then cached; 'time' matches "sometimes".
- BUG: rule-based provider emits `rule_type` values `range_check`, `validity_check`, `length_check` (rule_based_provider.py:246, 259, 358, 374) that are outside the vocabulary of completeness, validity, consistency, uniqueness, freshness. Line 17 of the same file lists them as validity sub-checks.
- UNCLEAR: the payload field names for uniqueCount/totalCount match between frontend and provider (see Provider internals). Whether uniqueness severity, the duplicate check and the completeness value (100 when only `null_percentage` is stored) behave correctly depends on the stored profile column shape, which was not checked.
- BUG: substring name matching in the rule-based provider gives false positives: `endswith('id')` matches "paid", "valid" and "android" (rule_based_provider.py:132, 157); 'date' matches "update" (:214); 'lot' matches "plot" (:283). 'key', 'code', 'state', 'order', 'ref' and 'tel' do likewise (see Provider internals).
- BUG: parseInt/parseFloat of query params are unchecked, so `limit=abc` gives NaN. `slice(0, NaN)` returns an empty array and `threshold=NaN` makes every comparison false, so the result is empty (aiRoutes.js:33-34, AIService.js:341).
- BUG: `chatHistory` is accepted but ignored (AIService.js:608).
- BUG: Bedrock `_parse_response` swallows parse errors and returns 200 with an empty list (bedrock_provider.py:166-168).
- DUPLICATE: two separate "rule-based" implementations: the Node `chatWithDataset` keyword chat (AIService.js:579-621, 847+) and the Python rule-based DQ provider (rule_based_provider.py). They share no code that I found.
- DUPLICATE: provider-settings reads (`ai_dq_suggestions_enabled`, `ai_provider`) are repeated in the dq-suggestions path (profile_api.py:1953-1961) and the list-providers path (:2026), with a differing provider default (see BUG above). The settings GET has a separate hard-coded `defaults` dict (:2134), a different mechanism for the same two defaults.
- DEAD: `initializeChatModel`, `generateDatasetContext`, `buildChatPrompt`, `createCompressedContext`, `extractAIResponse`, `MODEL_CONTEXT_SIZE` appear to belong to the abandoned distilgpt2/LLM path (AIService.js:549, 630, 682, 717, 752, 115). Chat uses only `generateIntelligentResponse` (:608). Callers were not exhaustively grepped outside this file. `CHAT_MODEL='rule-based'` would also not be a valid HF model if `initializeChatModel` were ever called (:562).
- UNCLEAR: openai `validate_credentials` returns True only if `OpenAI()` does not raise (openai_provider.py:39-44, inside a try/except returning False). Whether `OpenAI()` without a key raises depends on the SDK version, so availability in 'auto' mode is uncertain.
- UNCLEAR: `__init__` calls `validate_credentials`, which for several providers creates clients. Per the code comment, full provider initialisation "may probe external APIs and take 30+ seconds" (profile_api.py:2086-2088). `list_providers` instantiates every provider this way (base.py:135).

## Domain terms
- Related dataset / similar dataset: embedding-similar file. "Relationship" / `relationship_type`: nearly_identical, strongly_related, moderately_related, weakly_related, unknown, error.
- Chat with dataset / AI chat: rule-based Q&A.
- DQ suggestion / DQ rule suggestion / rule: the output of the providers. Fields: `rule_name`, `rule_type`, `column_name`, `rule_config`, `severity`.
- Severity: critical, error, warning, info (base.py:57). Rule types documented: completeness, validity, consistency, uniqueness, freshness; the rule-based provider also emits range_check, validity_check, length_check.
- Provider (names: openai, bedrock, azure, gemini, rule-based, 'auto'). `privacy_level`: local, cloud, cloud-aws, cloud-azure, cloud-gcp, varies, unknown.
- `app_settings`, "admin settings" (profile_api.py:1967). `ai_dq_suggestions_enabled` is the feature flag.
- Same file in the data: `file_id` / `fileId`. Completeness is the same as 100 minus `nullPercentage`.

## Open questions
1. Is Flask port 8000 reachable directly in production, or only through the `/profile-api` proxy? (The proxy exists only when NODE_ENV is production and adds no auth; the bind is 0.0.0.0.)
2. Is the `threshold` default 0.5 meaningful for MiniLM similarity of structured text? Business intent is unknown.
3. Is `quality_score` of 0 treated as absent in the embedding text (falsy check, AIService.js:395)? Intent unknown.
4. Does the stored profile column shape contain `unique_count`/`uniqueCount`, `total_count`/`totalCount`, `completeness` or `nullPercentage`? The Flask column profile (profile_api.py:1568-1576) emits `null_count`, `null_percentage` and `unique_count` only. Without this, the effect of the payload on uniqueness severity, the duplicate check and completeness is unknown.
5. Frontend callers (src/components/AIDQSuggestionsTab.jsx:130, 151, 200) use `/profile-api/api/settings/ai_dq_suggestions_enabled` and `/profile-api/api/dq-suggestions`. Other frontend callers of `/api/settings/*` were not searched.

## Inventory corrections
- The inventory lists the 4 Node routes with auth "-". It should be `authenticateToken (mount, server.js:13866)`.
- Inventory row 734's note "publicly reachable via /profile-api proxy" holds only in production, where the proxy is registered (server.js:13968-13983).
