# AI verification (round 3, final, after fix round 2)

Verdict: FIX
Counts: 48 checked, 2 WRONG, 0 UNSUPPORTED, 2 missed. Coverage: all 9 entry points (4 Node, 5 Flask) have a subsection and match inventory rows 289-292 and 732-736. The full-file rewrite lost nothing from round 2.

## The UNCLEAR is settled: the stored profile shape

The frontend does not get the Flask column profile. `DataProfile.jsx:1915-1921` calls `getFileFullData` -> `GET /api/files/:fileId/full` (server.js:6324), and passes `profile.columns` plus `patterns` to the tab (DataProfile.jsx:4299-4304). The columns are built at server.js:6454-6535 (from `file_columns`, or from `schema_definition` as a fallback) with these keys only: `name, type, count, unique, missing, min, max, mean, median, stdDev, histogram, patterns, most_frequent_value, least_frequent_value, most_frequent_count, least_frequent_count, _accessLevel`. The `schema_definition` fallback adds `min_length, max_length, avg_length, top_values`. The Node `getFileProfile` (FileService.js:902-914) is similar: `unique`, `missing`.

There is none of `unique_count`, `uniqueCount`, `distinct_count`, `null_count`, `nullPercentage`, `completeness`, `total_count`, `totalCount`, `sample_values` or `semantic_type`. Effects of the payload built at AIDQSuggestionsTab.jsx:186-198:
- `uniqueCount` is undefined, so it is dropped from the JSON, and the provider defaults it to 0 (rule_based_provider.py:59). Every id-like column therefore gets uniqueness severity "critical" (:135) with no "only N unique values" text (:141-142).
- `totalCount` is 0, so the duplicate check never fires (:159).
- `completeness` is `undefined || 100 - 0` = 100 and `hasNulls` is false (`undefined > 0`). The completeness rule (:89) never fires, even for columns with nulls (the profile has `missing`, which the frontend ignores).
- `sampleValues` is `[]`. The NA-placeholder check and the name-like special-character check never fire.
- `minLength` and `maxLength` are null on the `file_columns` path, so the length-range check does not fire (only the name-based length table does). They are set only on the `schema_definition` fallback (server.js:6529-6530).
- Masked or denied columns carry `patterns: []` and redacted values (server.js:6459-6477).

So the round-1 BUG ("uniqueness is always critical for id-like columns") was right in effect, and the round-2 downgrade to UNCLEAR is now resolved the other way.

## WRONG

1. **AI.md line 97, second half.** "The Flask column profile emits `unique_count` (profile_api.py:1574), which the frontend maps to `uniqueCount`" and "only if the stored profile columns really lack it; this was not established". The Flask output (profile_api.py:1568-1576, which does emit `null_count`, `null_percentage`, `unique_count` and `unique_percentage`) is not what the frontend receives. The stored profile has `unique`, not `unique_count`. The mapping therefore yields undefined/0, and the duplicate check does not fire. Established, no longer open.
2. **AI.md line 98.** "`hasNulls` still works because `null_count` is emitted" is WRONG: `null_count` is not in the profile the frontend gets (it is `missing`), so `hasNulls` is false. "The completeness rule would fire with completeness 100 for columns with nulls" is also WRONG: with `hasNulls` false and completeness 100, the rule never fires. The stored-shape claim is replaced by the section above.
   - Consequently the UNCLEAR at line 123 and Open question 4 should become a BUG (uniqueness always critical; duplicate and completeness suggestions never produced for the DataProfile tab). Settle them with server.js:6324-6550 and FileService.js:902-914.

## CORRECT (checked this round)

- Round-2 items:
  - rule_based_provider.py:59-60 reads `uniqueCount`/`distinct_count` and `totalCount`/`total_count`; the frontend names at :190-191 match. CORRECT.
  - Completeness `||` fallback at :189 and `hasNulls` at :197 are quoted correctly. The mismatch statement is true but understated (see WRONG 2).
  - The Flask profile at profile_api.py:1568-1576 has no `total_count`. CORRECT.
  - "Per verifier" markers: none remain.
  - Static provider info with generic 'cloud' at profile_api.py:2091-2094, and base.py:67 'cloud'. CORRECT.
  - Row 734 note: the proxy is registered only when `NODE_ENV === 'production'` (server.js:13968, 13983). CORRECT.
  - 50-fetch-then-filter: `getAllFiles()` with no options at AIService.js:304, filter at :306, defaults at FileService.js:307-316, target exclusion at :346, `ORDER BY ... LIMIT` with no tie-breaker at :391-400. CORRECT.
  - Dedupe by filename only after the threshold (AIService.js:322, 352). CORRECT.
  - False positives at rule_based_provider.py:130, 132, 155-157, 200, 214, 283, 345 (the 'state' length table entry). CORRECT.
  - The new BUG flag for the false positives. CORRECT.
- Flask:
  - profile_api.py:1936, 1943-1944, 1953-1961, 1974, 1978, 1984-1991, 1993-2005. CORRECT.
  - /api/ai-providers (:2020, :2034). CORRECT.
  - PUT current (:2058, 2064-2065, 2069, 2073-2079, 2089-2100). CORRECT.
  - Settings GET defaults (:2132-2144) and PUT upsert (:2173-2185). CORRECT.
  - `initialize_settings` is DO UPDATE (:2218-2219) while the comment at :2253 says DO NOTHING. CORRECT.
  - It is called only under `__main__` (:2256-2258), and the bind is 0.0.0.0 (:2261). CORRECT.
- Node:
  - server.js:13866 (auth mount) and :13876 (`requireAdmin`). CORRECT.
  - AIService.js:292-365 related-datasets logic. CORRECT.
  - Chat cache key and caching (:594, 611). CORRECT.
  - The chat file-missing response (:587-590) and the error catch (:616-619). CORRECT.
- Provider internals:
  - base.py:94-124 (factory, 'auto', lowercasing, fallback). CORRECT.
  - base.py:129-144 (`list_providers`) and :61-68 (`get_provider_info`, no display_name). CORRECT.
  - rule_based_provider.py:68-81 order and ids; completeness severity :89-95; uniqueness :129-135; duplicate :159-169. CORRECT.
  - rule_type outliers :246, 259, 358, 374. CORRECT.

## Missed (minor)

1. The `provider` key in the dq-suggestions 200 response is the full `provider_info` dict (profile_api.py:1990), not a name. The notes list only `provider`.
2. A non-JSON content type or a non-string `provider` (`.lower()` on a non-string, base.py:97) goes to the generic 500 handler (profile_api.py:1999-2005), not a 400.

## Instructions for the fixer

None are allowed to run (last round). If the notes are used as is, treat lines 97, 98, 123 and Open question 4 as superseded by the "stored profile shape" section above.
