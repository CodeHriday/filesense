---
name: VM lineage fallback
description: How visual mapping jobs are discovered in the lineage graph after execution deletes their transformation_mappings row.
---

# VM lineage fallback

## The rule
Visual mapping executions create a **temporary** `transformation_mappings` row (`is_temporary = true`, `mapping_id = 'vm-{vm_id}-{timestamp}'`) and delete it immediately after the job completes. The lineage `traverseFromFile` function must NOT rely solely on `transformation_mappings` to discover VM jobs — it will always be empty by the time a user builds the lineage graph.

**Why:** `visualMappings.js` line ~852 runs `DELETE FROM transformation_mappings WHERE mapping_id = $1 AND is_temporary = true` in both the success and failure cleanup paths.

## How to apply
After the `transformation_mappings` query loop in `traverseFromFile`, a VM fallback block queries:

```sql
SELECT DISTINCT vmd.id, vmd.name, vmd.graph_data, vmd.project_id, ...
FROM file_audit_details fad
JOIN visual_mapping_defs vmd
  ON vmd.name = REPLACE(fad.mapping_name, '[VM] ', '')
 AND vmd.is_active = true
WHERE fad.file_role = 'source'
  AND fad.mapping_name LIKE '[VM] %'
  AND (fad.file_name = $basename OR fad.file_name LIKE $pathBasename)
  AND vmd.project_id = $projectId
```

`file_audit_details.mapping_name` is always `'[VM] <vm_name>'` (set from `[VM] ${transformationMapping.name}` in `visualMappings.js`). `visual_mapping_defs.name` is the bare name (no prefix).

## Node config location
In `graph_data.nodes`, config lives at `node.data.config` (not `node.config`):
- `sourceConfig` node: `node.data.config.filePattern`
- `targetRules` node: `node.data.config.fileName`, `node.data.config.fileFormat`

## Workflow edge compatibility
Set `mappingId = 'vm-{vm_id}-synthetic'` on the transformation node metadata. The `findWorkflowsForMappings` function extracts the numeric vm_id via `split('-')[1]` from the `vm-` prefix, and the edge linker checks `startsWith('vm-{id}-')` — the `-synthetic` suffix satisfies both checks without needing a real timestamp.
