# AI (AI assistants & LLM providers)

## Summary
Two unrelated AI stacks exist.
1. Node (`backend/services/AIService.js`, routes `backend/routes/aiRoutes.js`): local MiniLM embeddings (`Xenova/all-MiniLM-L6-v2`, AIService.js:106) for "related datasets", a rule-based relationship explainer, and a "chat" that is keyword rule-based, not an LLM (`CHAT_MODEL = 'rule-based'`, AIService.js:112; used at :608).
2. Python (`profile_api.py` + `backend/ai_providers/*`): pluggable providers (openai, bedrock, azure, gemini, rule-based) that generate data-quality (DQ) rule suggestions, plus an `app_settings` store for the provider choice and an enable flag.
None of the 9 endpoints has authentication or ownership checks in the code read. Auth for the Node routes is not visible in aiRoutes.js (the file has no middleware); mounting was not traced (Open questions).

## Entry points

### GET /api/ai/related-datasets/:fileId (aiRoutes.js:24)
- Trigger: HTTP. Caller restrictions: none in this file.
- Inputs: `limit` default 5, `threshold` default 0.5 (:27), parsed with parseInt/parseFloat (:33-34), no validation (NaN possible).
- Logic (AIService.js:292-365): file or profile missing -> `[]` (:298-301). Compares against all other files (`getAllFiles`, :304-306). Skips any file whose `filename` was already added (:322). Files with no profile are skipped (:329). Embeds each file's text (:335). Keeps those with `similarity >= threshold` (:341). Sorts descending and slices to `limit` (:357-359).
- Output: JSON array of `{file_id, filename, similarity, file_type, created_at, quality_score}` (:342-349). Errors return 500 `{error}` (aiRoutes.js:40).
- Side effects: in-memory embedding cache (NodeCache TTL 3600s, AIService.js:81-86). First use downloads a model from Hugging Face.
- Similarity: dot product of normalized vectors, clamped to [0,1] (:277). Mismatched or invalid vectors return 0 (:259-266).

### GET /api/ai/relationship-explanation (aiRoutes.js:47)
- Inputs: query `fileId1`, `fileId2`; both required, else 400 (:51-53).
- Logic (AIService.js:457-543). Column overlap % = case-insensitive name matches / max(column counts) * 100 (:482-487). Tiers: >=80 `nearly_identical`, >=50 `strongly_related`, >=30 `moderately_related`, else `weakly_related` (:499-511). Same or different file type text is appended (:514-518).
- Missing file or profile returns 200 `{relationship_type:'unknown', explanation}` (:466-472). Any error returns 200 with `relationship_type:'error'` (:538-541).
- Output: `{relationship_type, explanation, matching_columns, overlap_percentage, same_file_type}`. The embedding similarity is shown only in the weakly_related text (:510).

### GET /api/ai/file-embedding/:fileId (aiRoutes.js:69)
- Logic: file or profile missing -> 404 (:78-80). Otherwise generates the embedding.
- Output: `{file_id, embedding_size, embedding_type:'float32', success:true}` (:84-89). The vector itself is not returned.
- Embedding text includes filename, type, row and column counts, quality score, per-column stats, and a type histogram (AIService.js:386-432). Cached by `file_emb_<file_id>` (:377). The cache key ignores profile changes, so it is stale for up to 1h.

### POST /api/ai/chat (aiRoutes.js:99)
- Inputs: body `fileId`, `message` (both required, else 400 :103-105), `chatHistory` default `[]` (not used by the rule-based path, AIService.js:608).
- Logic (AIService.js:579-621): file or profile missing returns 200 `{response:"I don't have information...", error:'Dataset not found'}` (:587-590). Response cached 3600s under `chat_<fileId>_<first 40 chars of base64(message)>` (:594, :611). Answer from `generateIntelligentResponse` (:847+, keyword rules; thresholds include unique ratio >0.9 and <0.1, :986-987, and string unique ratio <0.5, :1014).
- Errors: the service returns 200 with an error text (:616-619). The route's own catch returns 500 `{error, response:'An error occurred...'}` (aiRoutes.js:113-116).
- No external LLM call. No row data is read, only profile statistics.

### POST /api/dq-suggestions (profile_api.py:1926)
- Auth: none. Inputs: JSON `columns` (required non-empty, else 400 :1943-1944), `filename` default 'unknown', `fileId`, optional `provider`.
- Rules: if DB is reachable, read `ai_dq_suggestions_enabled` (default 'true') and `ai_provider` (default 'rule-based') from `app_settings` (:1953-1961). If disabled, return 200 `{enabled:false, suggestions:[], message}` (:1963-1968).
- Provider precedence: request `provider` > DB setting > env `AI_PROVIDER` > 'rule-based' (:1974). When the DB is up, the DB default 'rule-based' always wins over the env var (see BUG).
- Calls `AIProviderFactory.get_provider(name).generate_dq_suggestions(columns, filename, file_id)` (:1975-1980).
- Output 200: `{enabled:true, suggestions, filename, fileId, generatedAt (server local time, naive isoformat), provider}` (:1984-1991). Errors: 500 `{error, details, suggestions:[]}` (:2001-2005). The raw exception text goes to the client.
- External call: sends column profile summaries to the cloud provider (name, type, completeness, uniqueCount, hasNulls, first 5 patterns, semanticType; openai_provider.py:128-136). Sample values are not sent by openai. Not checked for the others.

### GET /api/ai-providers (profile_api.py:2008)
- Auth: none. Lists all registered providers by instantiating each (base.py:129-144), which may probe external APIs. Per-provider failure gives `{name, available:false, error}`.
- Output: `{providers, current_provider, ai_enabled}`. current_provider: DB `ai_provider` else env `AI_PROVIDER` else 'rule-based' (:2020, :2034).

### PUT /api/ai-providers/current (profile_api.py:2049)
- Auth: none. Body `provider`, required (400 :2058). Must be 'auto' or a registered name, else 400 (:2064-2065). Note the registered names come from `PROVIDERS`, which are case-sensitive here but lowercased in the factory (base.py:97).
- Side effect: upsert `app_settings` row `ai_provider` with the description text and `updated_at = NOW()` (:2073-2079). Returns hard-coded static provider info (:2089-2100), so `available: True` is always reported and does not reflect real availability.
- No DB returns 500 (:2069).

### GET /api/settings/<setting_key> (profile_api.py:2115)
- Auth: none. Any key can be read. Missing key: 200 default for `ai_dq_suggestions_enabled` ('true') and `ai_provider` ('rule-based'), else 404 (:2132-2144). Output `{key, value, description}`.

### PUT /api/settings/<setting_key> (profile_api.py:2159)
- Auth: none. Any key, any value (`str(data['value'])`), upserted into `app_settings` (:2173-2179). The key is not whitelisted and the value is not validated. The value is written to the log (:2185).
- Seed: `initialize_settings` inserts defaults (`ai_dq_suggestions_enabled='true'`, `ai_provider='rule-based'`) (:2199-2206).

## Provider internals (reached from /api/dq-suggestions)
- Factory: names lowercased; unknown name falls back to 'rule-based' with a warning (base.py:97-104). 'auto' (also the default when the name is None, :95) tries in order openai, bedrock, azure, gemini, rule-based and takes the first `is_available()` (:112-124).
- openai: model hard-coded `gpt-4o`, temperature 0.3, max_tokens 2000, timeout 60s, `json_object` response (openai_provider.py:70-107). Key from `AI_INTEGRATIONS_OPENAI_API_KEY` or `OPENAI_API_KEY`, optional base URL (:28-35). Result read from `suggestions` or `rules` key; a dict is wrapped into a list (:112-115). Missing ids become `dq_suggestion_N`. `fileId` and `provider` are set (:117-121).
- bedrock: model env `BEDROCK_MODEL_ID` default `anthropic.claude-3-sonnet-20240229-v1:0`, max_tokens 2000, temperature 0.3 (bedrock_provider.py:18, :81-82). Requires `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (:14). privacy_level "cloud-aws".
- azure: requires `AZURE_OPENAI_KEY` and `AZURE_OPENAI_ENDPOINT` (azure_provider.py:14); temperature 0.3, max_tokens 2000 (:103-104); privacy_level "cloud-azure".
- gemini: model env `GEMINI_MODEL` default `gemini-1.5-flash`; needs `GOOGLE_API_KEY` or `GOOGLE_APPLICATION_CREDENTIALS` (gemini_provider.py:18, :26-30); temperature 0.3 (:78); privacy_level "cloud-gcp".
- rule-based (local, no external call, rule_based_provider.py): per column runs completeness, uniqueness, duplicate, validity, special-character, length and freshness checks (:68-74).
  - Completeness: runs if `has_nulls` or completeness < 100. Severity is critical if <80, error if <95, else warning (:89-95).
  - NA-placeholder check from sample values, severity warning (:106-121).
  - Uniqueness: columns whose name matches id/key/code patterns get a rule. Severity is critical only if unique_count == 0, else warning (:129-135).
  - Duplicate: key-like columns with duplicate % > 0. Severity critical >10, error >5, else warning (:164-169).
  - Ids are numbered sequentially across columns (:77).
- Provider display_name is not in the base `get_provider_info` (base.py:61-68), but the endpoint logs `provider_info.get('display_name', ...)` (profile_api.py:1978).

## Data touched
- `app_settings` (`setting_key`, `setting_value`, `description`, `updated_at`): read and written (profile_api.py:1953, 2073, 2125, 2173).
- Node side reads files and profiles through `fileService.getFileById`, `getFileProfile` and `getAllFiles`. Nothing is persisted. Caches are in-process memory only (AIService.js:81-88).
- External: Hugging Face model download (AIService.js:140), OpenAI, AWS Bedrock, Azure OpenAI and Google Gemini APIs.
- Env vars: HUGGING_FACE_TOKEN, AI_PROVIDER, OPENAI/AI_INTEGRATIONS_OPENAI_*, BEDROCK_MODEL_ID, AWS_*, AZURE_OPENAI_*, GOOGLE_API_KEY, GEMINI_MODEL.

## Flags
- SECURITY: PUT /api/ai-providers/current and PUT /api/settings/<key> are unauthenticated and the key is not whitelisted (profile_api.py:2049, 2159). Anyone reaching the API can switch the provider (and so send profile data to a cloud vendor) or write arbitrary settings.
- SECURITY: GET /api/settings/<key> reads any setting key without auth (profile_api.py:2115). Whether it can expose sensitive keys depends on what other keys are stored in `app_settings` (not checked).
- SECURITY: POST /api/dq-suggestions and GET /api/ai-providers are unauthenticated. The `provider` request parameter lets any caller trigger paid cloud calls (:1941, :1974).
- SECURITY: Node /api/ai/* routes have no auth or ownership check in aiRoutes.js. Any caller can ask about any `fileId` (:24, :47, :69, :99).
- SECURITY: raw exception text is returned to clients (aiRoutes.js:40, profile_api.py:2003).
- SECURITY: the `authenticatedFetch` wrapper replaces `global.fetch` process-wide and attaches the HF token to any URL containing 'huggingface.co' (AIService.js:33, 44). It is restored after 10s (:73-78). The substring match would also match other URLs that merely contain that text.
- BUG: when the DB is reachable, `configured_provider` defaults to 'rule-based' (profile_api.py:1961). The env `AI_PROVIDER` fallback at :1974 is therefore never reached in that case. This differs from `/api/ai-providers`, which does fall back to env (:2034).
- BUG: PUT /api/ai-providers/current returns `available: True` for every provider from a static table (profile_api.py:2089-2100), regardless of credentials.
- BUG: related-datasets dedupes by filename only after a file passes the threshold (AIService.js:322, 352). The comment says "prefer the most recent version", but no ordering by date is applied, so the version kept depends on the `getAllFiles` order.
- BUG: the embedding cache key `emb_` + the first 40 chars of the base64 of the text (:161) collides for any texts sharing their first about 30 characters. For file text, the first lines are "Dataset: <filename>...". Files with the same filename and the same leading text would share an embedding. Similarly the chat cache key (:594) uses only the first 40 base64 chars of the message, so long messages that share their first about 30 chars return the same cached answer. The key does not include the file's profile version either.
- BUG: parseInt/parseFloat of query params are unchecked, so `limit=abc` gives NaN. `slice(0, NaN)` returns an empty array and `threshold=NaN` makes every comparison false, so the result is empty (aiRoutes.js:33-34, AIService.js:341).
- BUG: `chatHistory` is accepted but ignored (AIService.js:608).
- DUPLICATE: two embedding-text and "AI chat" concepts: the Node `chatWithDataset` (rule-based keywords) and the Python providers. Two separate "rule-based" implementations exist, one for chat in JS and one for DQ rules in Python, with no shared code.
- DUPLICATE: provider-settings reads (`ai_dq_suggestions_enabled`, `ai_provider`) are copy-pasted in the dq-suggestions, list providers and settings defaults paths (profile_api.py:1953, 2026, 2134), with differing defaults for the provider (see BUG above).
- DEAD: `initializeChatModel`, `generateDatasetContext`, `buildChatPrompt`, `createCompressedContext`, `extractAIResponse`, `MODEL_CONTEXT_SIZE` appear to belong to the abandoned distilgpt2/LLM path (AIService.js:549, 630, 682, 717, 752, 115). Chat uses only `generateIntelligentResponse` (:608). Callers were not exhaustively grepped outside this file. `CHAT_MODEL='rule-based'` would also not be a valid HF model if `initializeChatModel` were ever called (:562).
- UNCLEAR: openai `validate_credentials` returns True even when no key is set (`OpenAI()` is called at :39), and `is_available` depends on `_client`. Whether `OpenAI()` without a key raises (and so returns False) depends on the library version, so availability in 'auto' mode is uncertain.
- UNCLEAR: `__init__` calls `validate_credentials`, which for several providers creates clients. Per the code comment, full provider initialisation "may probe external APIs and take 30+ seconds" (profile_api.py:2086-2088). `list_providers` instantiates every provider this way (base.py:135).

## Domain terms
- Related dataset / similar dataset: embedding-similar file. "Relationship" / `relationship_type`: nearly_identical, strongly_related, moderately_related, weakly_related, unknown, error.
- Chat with dataset / AI chat: rule-based Q&A.
- DQ suggestion / DQ rule suggestion / rule: the output of the providers. Fields: `rule_name`, `rule_type`, `column_name`, `rule_config`, `severity`.
- Severity: critical, error, warning, info (base.py:57). Rule types: completeness, validity, consistency, uniqueness, freshness.
- Provider (names: openai, bedrock, azure, gemini, rule-based, 'auto'). `privacy_level`: local, cloud, cloud-aws, cloud-azure, cloud-gcp, varies, unknown.
- `app_settings`, "admin settings" (profile_api.py:1967). `ai_dq_suggestions_enabled` is the feature flag.
- Same file in the data: `file_id` / `fileId`. Completeness is the same as 100 minus `nullPercentage`.

## Open questions
1. How are /api/ai/* mounted in the Node app, and is any auth middleware applied upstream? (aiRoutes.js has none; mounting was not traced.)
2. How is Python profile_api.py exposed (the inventory notes a /profile-api proxy)? Does the proxy add auth?
3. The rule-based checks `_check_validity`, `_check_special_characters`, `_check_length` and `_check_freshness` (rule_based_provider.py:182+) were not read, so their thresholds are not recorded.
4. The prompts and sample-data handling of the bedrock, azure and gemini providers were not read in full. Does any send `sampleValues` to the cloud?
5. `generateIntelligentResponse` (AIService.js:847-1030): the full keyword-to-answer rules were not itemised.
6. Do the frontend callers rely on `/api/settings/*` for keys other than the two AI keys?
7. Is the `threshold` default 0.5 meaningful for MiniLM similarity of structured text? Business intent is unknown.
8. Is `quality_score` of 0 treated as absent in the embedding text (falsy check, AIService.js:395)? Intent unknown.

## Inventory corrections
- None needed for the 9 AI rows. The inventory lists the Node routes without an auth value ("-"); the code shows none in the route file.
