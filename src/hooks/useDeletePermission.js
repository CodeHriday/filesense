import { useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

const DELETE_PERMISSION_MAP = {
  roles: 'roles',
  users: 'users',
  projects: 'projects',
  project_management: 'project_management',
  connections: 'connection',
  connection: 'connection',
  mappings: 'transformation',
  visual_mapping_orchestrator: 'visual_mapping_orchestrator',
  transformations: 'transformation',
  transformation: 'transformation',
  workflows: 'workflow',
  workflow: 'workflow',
  workflow_manager: 'workflow_manager',
  workflow_builder: 'workflow_builder',
  mapping_groups: 'mapping_group',
  mapping_group: 'mapping_group',
  scheduler: 'schedule',
  schedule: 'schedule',
  vendors: 'vendors',
  vendor_connections: 'vendors',
  vendor_agreements: 'vendors',
  policies: 'policies',
  tags: 'tags',
  quality_rules: 'quality_rules',
  file_upload: 'file_upload',
  file_catalog: 'file_catalog',
  processed_catalog: 'processed_catalog',
  access_groups: 'access_groups',
  api_tokens: 'api_tokens',
  email_providers: 'email_providers',
  stories: 'stories',
  jobs: 'jobs',
  audit_trail: 'audit_trail',
  settings: 'settings'
};

export const useDeletePermission = (resource) => {
  const { hasWritePermission } = useAuth();
  
  const resourceKey = DELETE_PERMISSION_MAP[resource] || resource;
  
  const canDelete = useMemo(() => {
    return hasWritePermission(resourceKey);
  }, [hasWritePermission, resourceKey]);
  
  const guardDelete = useCallback((callback) => {
    return (...args) => {
      if (!canDelete) {
        throw new Error(`You do not have permission to delete ${resource}. Required permission: ${resourceKey}:write`);
      }
      return callback(...args);
    };
  }, [canDelete, resource, resourceKey]);
  
  const checkDeletePermission = useCallback(() => {
    if (!canDelete) {
      return {
        allowed: false,
        message: `You do not have permission to delete ${resource}.`
      };
    }
    return { allowed: true, message: '' };
  }, [canDelete, resource]);
  
  return {
    canDelete,
    guardDelete,
    checkDeletePermission,
    resourceKey
  };
};

export const DELETE_PERMISSION_MAP_EXPORT = DELETE_PERMISSION_MAP;

export default useDeletePermission;
