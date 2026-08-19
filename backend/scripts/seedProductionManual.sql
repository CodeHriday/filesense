-- Production access-control seed
-- Run this file only while directly connected to the intended production PostgreSQL database.
-- It is idempotent: existing roles, permissions, users, and assignments are left unchanged.
--
-- Before running, verify the connection target:
--   SELECT current_database(), current_user;
--
-- Default login created by this script:
--   username: admin
--   password: Admin123!
-- The admin user is flagged to change this password after the first login.

BEGIN;

-- 1. Roles and the feature permissions evaluated by the application.
INSERT INTO roles (name, description, permissions, created_at, updated_at)
VALUES
  (
    'Admin',
    'Full system access with all permissions',
    ARRAY[
      'dashboard:read','dashboard:write','projects:read','projects:write',
      'vendor_file_upload:read','vendor_file_upload:write','file_upload:read','file_upload:write',
      'file_drop:read','file_drop:write','file_catalog:read','file_catalog:write',
      'processed_catalog:read','processed_catalog:write','vendor_file_quality:read','vendor_file_quality:write',
      'file_profile:read','file_profile:write','file_preview:read','file_preview:write',
      'transformation:read','transformation:write','transformation:execute',
      'mapping_group:read','mapping_group:write','mapping_group:execute',
      'quality_rules:read','quality_rules:write','workflow:read','workflow:write','workflow:execute',
      'schedule:read','schedule:write','schedule:execute','jobs:read','jobs:write',
      'monitor:read','monitor:write','error_review:read','error_review:write',
      'lineage:read','lineage:write','policies:read','policies:write',
      'retention_policies:read','retention_policies:write','archived_files:read','archived_files:write',
      'anomalies:read','anomalies:write','tags:read','tags:write',
      'connection:read','connection:write','connection:execute',
      'roles:read','roles:write','users:read','users:write',
      'project_management:read','project_management:write','access_groups:read','access_groups:write',
      'vendor_users:read','vendor_users:write','vendor_roles:read','vendor_roles:write',
      'vendor_connections:read','vendor_connections:write','vendor_details:read','vendor_details:write',
      'vendor_agreements:read','vendor_agreements:write','vendor_agreements:approve',
      'system_cleanup:read','system_cleanup:write','audit_trail:read','audit_trail:write',
      'settings:read','settings:write','file_insights:read','file_insights:write',
      'recommendations:read','recommendations:write','insights:read','insights:write',
      'stories:read','stories:write',
      'tag:shipment id completeness:read','tag:shipment id completeness:edit',
      'tag:po number uniqueness:read','tag:po number uniqueness:edit',
      'tag:email format validity:read','tag:email format validity:edit',
      'tag:confidential:read','tag:confidential:edit','tag:public:read','tag:public:edit',
      'tag:phi:read','tag:phi:edit','tag:pci:read','tag:pci:edit','tag:pii:read','tag:pii:edit'
    ]::text[],
    NOW(), NOW()
  ),
  (
    'Data Steward',
    'Manages data governance including tags, policies, and data quality rules',
    ARRAY[
      'dashboard:read','file_upload:read','file_drop:read','file_catalog:read','file_catalog:write',
      'file_profile:read','file_profile:write','file_preview:read','transformation_catalog:read',
      'alerts:read','alerts:write','file_insights:read','file_insights:write',
      'lineage:read','lineage:write','policies:read','policies:write','tags:read','tags:write',
      'vendor_agreements:read','vendor_agreements:approve',
      'recommendations:read','recommendations:write','insights:read','insights:write',
      'stories:read','stories:write','tag:pii:read','tag:pii:edit'
    ]::text[],
    NOW(), NOW()
  ),
  (
    'Data Engineer',
    'Creates and manages transformations, workflows, and schedules',
    ARRAY[
      'projects:read','file_upload:read','file_upload:write','file_drop:read','file_drop:write',
      'file_catalog:read','file_catalog:write','file_profile:read','file_profile:write',
      'file_preview:read','file_preview:write',
      'transformation:read','transformation:write','transformation:execute',
      'mapping_group:read','mapping_group:write','mapping_group:execute',
      'workflow:read','workflow:write','workflow:execute',
      'schedule:read','schedule:write','schedule:execute','jobs:read','jobs:write',
      'monitor:read','monitor:write','lineage:read','lineage:write',
      'connection:read','connection:write','connection:execute'
    ]::text[],
    NOW(), NOW()
  ),
  (
    'Analyst',
    'Views insights, runs approved jobs, and reads files',
    ARRAY[]::text[],
    NOW(), NOW()
  ),
  (
    'Viewer',
    'Read-only access to data',
    ARRAY[]::text[],
    NOW(), NOW()
  ),
  (
    'Vendor Manager',
    'Manages vendor relationships, file drops, and vendor contracts',
    ARRAY[
      'projects:read','projects:write','users:read','users:write','roles:read','roles:write',
      'vendor_users:read','vendor_users:write','vendor_roles:read','vendor_roles:write',
      'vendor_connections:read','vendor_connections:write','vendor_details:read','vendor_details:write',
      'vendor_agreements:read','vendor_agreements:write','vendor_agreements:approve',
      'connection:read','connection:write','sla_monitoring:read'
    ]::text[],
    NOW(), NOW()
  ),
  (
    'Governance Manager',
    'Responsible for final approval of vendor contracts and governance oversight',
    ARRAY[
      'vendor_agreements:read','vendor_agreements:write','vendor_agreements:approve',
      'connection:read','sla_monitoring:read'
    ]::text[],
    NOW(), NOW()
  )
ON CONFLICT (name) DO NOTHING;

-- 2. Generic permission catalog.
INSERT INTO permissions (name, resource, action, description, created_at)
VALUES
  ('user:create','user','create','Create new users',NOW()),
  ('user:read','user','read','View user information',NOW()),
  ('user:update','user','update','Update user information',NOW()),
  ('user:delete','user','delete','Delete users',NOW()),
  ('role:create','role','create','Create new roles',NOW()),
  ('role:read','role','read','View roles',NOW()),
  ('role:update','role','update','Update roles',NOW()),
  ('role:delete','role','delete','Delete roles',NOW()),
  ('file:create','file','create','Upload files',NOW()),
  ('file:read','file','read','View files',NOW()),
  ('file:update','file','update','Update file metadata',NOW()),
  ('file:delete','file','delete','Delete files',NOW()),
  ('transformation:create','transformation','create','Create transformations',NOW()),
  ('transformation:read','transformation','read','View transformations',NOW()),
  ('transformation:update','transformation','update','Update transformations',NOW()),
  ('transformation:delete','transformation','delete','Delete transformations',NOW()),
  ('transformation:execute','transformation','execute','Execute transformations',NOW()),
  ('workflow:create','workflow','create','Create workflows',NOW()),
  ('workflow:read','workflow','read','View workflows',NOW()),
  ('workflow:update','workflow','update','Update workflows',NOW()),
  ('workflow:delete','workflow','delete','Delete workflows',NOW()),
  ('workflow:execute','workflow','execute','Execute workflows',NOW()),
  ('job:create','job','create','Create jobs',NOW()),
  ('job:read','job','read','View jobs',NOW()),
  ('job:update','job','update','Update jobs',NOW()),
  ('job:delete','job','delete','Delete jobs',NOW()),
  ('job:execute','job','execute','Execute jobs',NOW()),
  ('schedule:create','schedule','create','Create schedules',NOW()),
  ('schedule:read','schedule','read','View schedules',NOW()),
  ('schedule:update','schedule','update','Update schedules',NOW()),
  ('schedule:delete','schedule','delete','Delete schedules',NOW()),
  ('connection:create','connection','create','Create connections',NOW()),
  ('connection:read','connection','read','View connections',NOW()),
  ('connection:update','connection','update','Update connections',NOW()),
  ('connection:delete','connection','delete','Delete connections',NOW()),
  ('tag:create','tag','create','Create governance tags',NOW()),
  ('tag:read','tag','read','View governance tags',NOW()),
  ('tag:update','tag','update','Update governance tags',NOW()),
  ('tag:delete','tag','delete','Delete governance tags',NOW()),
  ('tag:assign','tag','assign','Assign tags to files and columns',NOW()),
  ('policy:create','policy','create','Create governance policies',NOW()),
  ('policy:read','policy','read','View governance policies',NOW()),
  ('policy:update','policy','update','Update governance policies',NOW()),
  ('policy:delete','policy','delete','Delete governance policies',NOW()),
  ('policy:assign','policy','assign','Assign policies to files and columns',NOW()),
  ('tag:pii:read','tag:pii','read','View PII tagged columns',NOW()),
  ('tag:pii:edit','tag:pii','edit','Edit PII tagged columns',NOW()),
  ('tag:confidential:read','tag:confidential','read','View confidential tagged columns',NOW()),
  ('tag:confidential:edit','tag:confidential','edit','Edit confidential tagged columns',NOW()),
  ('tag:financial:read','tag:financial','read','View financial tagged columns',NOW()),
  ('tag:financial:edit','tag:financial','edit','Edit financial tagged columns',NOW()),
  ('dashboard:read','dashboard','read','View dashboards',NOW()),
  ('insights:read','insights','read','View insights',NOW()),
  ('recommendations:read','recommendations','read','View recommendations',NOW()),
  ('badges:read','badges','read','View achievement badges',NOW()),
  ('stories:read','stories','read','View data stories',NOW()),
  ('monitor:read','monitor','read','View system monitoring',NOW()),
  ('audit:read','audit','read','View audit logs',NOW()),
  ('dbt:read','dbt','read','View DBT models',NOW()),
  ('dbt:execute','dbt','execute','Execute DBT commands',NOW())
ON CONFLICT DO NOTHING;

-- 3. Role-to-generic-permission links. Feature permissions above are stored on roles.permissions.
WITH requested_links(role_name, permission_name) AS (
  VALUES
    ('Data Steward','tag:create'),('Data Steward','tag:read'),('Data Steward','tag:update'),
    ('Data Steward','tag:delete'),('Data Steward','tag:assign'),('Data Steward','policy:create'),
    ('Data Steward','policy:read'),('Data Steward','policy:update'),('Data Steward','policy:delete'),
    ('Data Steward','policy:assign'),('Data Steward','tag:pii:read'),('Data Steward','tag:pii:edit'),
    ('Data Steward','tag:confidential:read'),('Data Steward','tag:confidential:edit'),
    ('Data Steward','tag:financial:read'),('Data Steward','tag:financial:edit'),
    ('Data Steward','file:create'),('Data Steward','file:read'),('Data Steward','file:update'),
    ('Data Steward','file:delete'),('Data Steward','transformation:read'),('Data Steward','workflow:read'),
    ('Data Steward','job:read'),('Data Steward','schedule:read'),('Data Steward','monitor:read'),
    ('Data Steward','audit:read'),('Data Steward','dashboard:read'),('Data Steward','insights:read'),
    ('Data Steward','recommendations:read'),('Data Steward','badges:read'),('Data Steward','stories:read'),
    ('Data Engineer','transformation:create'),('Data Engineer','transformation:read'),
    ('Data Engineer','transformation:update'),('Data Engineer','transformation:delete'),
    ('Data Engineer','transformation:execute'),('Data Engineer','workflow:create'),
    ('Data Engineer','workflow:read'),('Data Engineer','workflow:update'),('Data Engineer','workflow:delete'),
    ('Data Engineer','workflow:execute'),('Data Engineer','job:create'),('Data Engineer','job:read'),
    ('Data Engineer','job:update'),('Data Engineer','job:delete'),('Data Engineer','job:execute'),
    ('Data Engineer','schedule:create'),('Data Engineer','schedule:read'),('Data Engineer','schedule:update'),
    ('Data Engineer','schedule:delete'),('Data Engineer','connection:create'),('Data Engineer','connection:read'),
    ('Data Engineer','connection:update'),('Data Engineer','connection:delete'),('Data Engineer','file:create'),
    ('Data Engineer','file:read'),('Data Engineer','file:update'),('Data Engineer','file:delete'),
    ('Data Engineer','tag:read'),('Data Engineer','tag:assign'),('Data Engineer','policy:read'),
    ('Data Engineer','policy:assign'),('Data Engineer','tag:pii:read'),
    ('Data Engineer','tag:confidential:read'),('Data Engineer','tag:financial:read'),
    ('Data Engineer','dbt:read'),('Data Engineer','dbt:execute'),('Data Engineer','monitor:read'),
    ('Data Engineer','dashboard:read'),('Data Engineer','insights:read'),
    ('Data Engineer','recommendations:read'),('Data Engineer','badges:read'),('Data Engineer','stories:read'),
    ('Analyst','file:read'),('Analyst','job:read'),('Analyst','job:execute'),
    ('Analyst','transformation:read'),('Analyst','workflow:read'),('Analyst','tag:read'),
    ('Analyst','policy:read'),('Analyst','dashboard:read'),('Analyst','insights:read'),
    ('Analyst','recommendations:read'),('Analyst','badges:read'),('Analyst','stories:read'),
    ('Analyst','schedule:read'),('Analyst','dbt:read'),
    ('Viewer','file:read'),('Viewer','transformation:read'),('Viewer','workflow:read'),
    ('Viewer','job:read'),('Viewer','schedule:read'),('Viewer','tag:read'),('Viewer','policy:read'),
    ('Viewer','dashboard:read'),('Viewer','insights:read'),('Viewer','recommendations:read'),
    ('Viewer','badges:read'),('Viewer','stories:read'),
    ('Vendor Manager','dashboard:read'),('Vendor Manager','file:read'),
    ('Governance Manager','dashboard:read'),('Governance Manager','file:read')
)
INSERT INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, NOW()
FROM requested_links l
JOIN roles r ON r.name = l.role_name
JOIN permissions p ON p.name = l.permission_name
ON CONFLICT DO NOTHING;

-- Admin receives every generic permission in the catalog.
INSERT INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, NOW()
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Admin'
ON CONFLICT DO NOTHING;

-- 4. Local administrator. This bcrypt hash is for the temporary password Admin123!.
INSERT INTO users (
  username, password, email, full_name, auth_provider, internal_user,
  force_password_change, must_change_password, created_at, updated_at
)
VALUES (
  'admin',
  '$2b$12$Q15kH0BN8UD7MxM.N50AmetB8WXqv4CxZGmwsC9V66ncYJz5sUD5u',
  'admin@dataobservatory.local',
  'System Administrator',
  'local',
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- 5. Assign the administrator the roles required to manage the system and approval chains.
INSERT INTO user_roles (user_id, role_id, created_at)
SELECT u.id, r.id, NOW()
FROM users u
JOIN roles r ON r.name IN ('Admin', 'Vendor Manager', 'Governance Manager')
WHERE u.username = 'admin'
ON CONFLICT DO NOTHING;

COMMIT;

-- Post-run verification (all values should be non-zero).
SELECT
  (SELECT COUNT(*) FROM roles) AS roles,
  (SELECT COUNT(*) FROM permissions) AS permissions,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM role_permissions) AS role_permissions,
  (SELECT COUNT(*) FROM user_roles) AS user_roles;