-- Backfill project_id for existing schedules based on their entity's project
-- This fixes schedules created before the project_id persistence bug was fixed

-- Update schedules linked to transformation_mappings
UPDATE schedules s
SET project_id = tm.project_id,
    updated_at = CURRENT_TIMESTAMP
FROM transformation_mappings tm
WHERE s.entity_type = 'mapping'
  AND s.entity_id = tm.mapping_id
  AND s.project_id IS NULL
  AND tm.project_id IS NOT NULL;

-- Update schedules linked to mapping_groups
UPDATE schedules s
SET project_id = mg.project_id,
    updated_at = CURRENT_TIMESTAMP
FROM mapping_groups mg
WHERE s.entity_type = 'mapping_group'
  AND s.entity_id = CAST(mg.id AS TEXT)
  AND s.project_id IS NULL
  AND mg.project_id IS NOT NULL;

-- Update schedules linked to workflows
UPDATE schedules s
SET project_id = nw.project_id,
    updated_at = CURRENT_TIMESTAMP
FROM n_step_workflows nw
WHERE s.entity_type = 'workflow'
  AND s.entity_id = CAST(nw.id AS TEXT)
  AND s.project_id IS NULL
  AND nw.project_id IS NOT NULL;

-- Report results
SELECT 
  entity_type,
  COUNT(*) as total_schedules,
  COUNT(project_id) as with_project,
  COUNT(*) - COUNT(project_id) as without_project
FROM schedules
GROUP BY entity_type
ORDER BY entity_type;
