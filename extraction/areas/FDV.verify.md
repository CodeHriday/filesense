# FDV verification (final, after fix round 2)

Verdict: PASS. Checked 32, wrong 0, unsupported 0, missing 0.

## Completeness
All 10 entry points are present. The file also has BUG 1-20, DUPLICATE 1-9, DEAD 1-5, SECURITY 1-10, UNCLEAR 1-6, Domain terms and OQ 1-8. The areas.md row for FDV lists 3 FE routes, and all 3 are covered by entries 1, 5 and 6.

## Round-2 items
- BUG 7: CORRECT. App.jsx:351, :360 and :369 each have `<Navigate to="/catalog" replace />`. The only catalog route is /file-catalog (:344). The catch-all `path="*"` to "/" is at :462.
- Preview divisor sentence: CORRECT.
  - FilePreview.jsx:95 returns early when rows or data are empty.
  - :112 sets `totalRows = totalRows || total_rows || rows.length`.
  - :117 is the division.
  - :228 recomputes totalRows and only subtracts, with no division.
  - The tooltip is at :235-237.
- DEAD 5: CORRECT. In QualityReport.jsx, `FiBarChart2` and `FiPieChart` (:4), `Line` and `Pie` (:6) and `getFileProfile` (:9) each appear only on their import lines. `reportRef` is declared at :37 and used at :244.
- DEAD 2: CORRECT. In DataProfile.jsx, `Card` (:5), `getFileDetails` and `getFileProfile` (:11), `Line` (:20) and `FiShield` (:4) appear only on their import lines.
- BUG 11: CORRECT. DataProfile.jsx:139 reads `shouldFlagMultiPattern(semanticType) && column.patterns && column.patterns.length > 1`.
- BUG 17: CORRECT.
  - AIDQSuggestionsTab.jsx:186-198 reads `nullPercentage`, `null_count`, `uniqueCount`, `distinct_count` and `unique_count`.
  - DataProfile.jsx:134 and :136 use `missing` and `unique`, and :2351 uses `missing`.
  - The columns are passed through at :4299-4304 with only the patterns changed.
- BUG 18: CORRECT. AIDQSuggestionsTab.jsx:211 calls `response.json()` with no `ok` check, then :213-217 sets the feature to disabled when `!data.enabled`.
- BUG 19: CORRECT. `if (response.ok)` is at :91 (updateProvider) and :158 (toggleFeature), with no else branch.
- BUG 20: CORRECT. DataProfile.jsx:1811 has `pii: col.pii || false`. :3750 also checks the governance tag names for "pii".

## Sampled pass
All CORRECT:
- Polling delay, DataProfile.jsx:1071-1082.
- `handleSensitivityChange`, :2155-2171, with no revert on failure.
- Completeness fallback `|| 100`, :2350-2356.
- The `highnulls` lookup at :2584 versus the `missingvalues` type at :163.
- `selectedRuleIds.sort()`, :2777.
- The substring checks at :1522.
- BUG 1, :4208-4209: `fetchFileDetails` and `fetchProfileData` are not defined anywhere in the file.
- DEAD 1: `fetchProfileHistory` (:3924) is never called.
- `hasPermission` appears only at :1185-1186 and :3987-3988, and `hasWritePermission` is not used in DataProfile.jsx.
- `original_name` and `file_name` appear only at :1865.
- The `mapProfileTypeToSchemaType` order, :1792-1801.
- The schema JSON structure, :1803-1852.
- The nullable expression, :1810 and :3748.
- QualityChecks.jsx:45, :111 and :363 (`hasWritePermission('quality')`), :177 (falsy score), :300-333 (unguarded division by `row_count`) and :83 (error state).
- `showAIInsights` is not declared in QualityChecks.
- FilePreview.jsx:30-31, :33, :42, :48-54 and :95-100.
- AIDQSuggestionsTab.jsx:66-77, :79-112, :127-143, :145-169 and :171-249.

## Remaining problems
None. Two limits of the notes are already stated in the file as not read: the AIDQSuggestionsTab JSX below line 420, and the SchemaHistoryTab internals (OQ 5).
