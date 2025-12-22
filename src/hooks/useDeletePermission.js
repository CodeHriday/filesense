import { useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

const DELETE_PERMISSION_MAP = {
  roles: 'roles:write',
  users: 'users:write',
  projects: 'projects:write',
  project_management: 'project_management:write',
  connections: 'connection:write',
  connection: 'connection:write',
  mappings: 'visual_mapping_orchestrator:write',
  visual_mapping_orchestrator: 'visual_mapping_orchestrator:write',
  transformations: 'visual_mapping_orchestrator:write',
  workflows: 'workflow_manager:write',
  workflow_manager: 'workflow_manager:write',
  mapping_groups: 'workflow_manager:write',
  scheduler: 'schedule:write',
  schedule: 'schedule:write',
  vendors: 'vendors:write',
  vendor_connections: 'vendors:write',
  vendor_agreements: 'vendors:write',
  policies: 'policies:write',
  tags: 'tags:write',
  quality_rules: 'quality_rules:write',
  file_upload: 'file_upload:write',
  file_catalog: 'file_catalog:write',
  processed_catalog: 'processed_catalog:write',
  access_groups: 'access_groups:write',
  api_tokens: 'api_tokens:write',
  email_providers: 'email_providers:write',
  stories: 'stories:write',
  jobs: 'jobs:write',
  audit_trail: 'audit_trail:write',
  settings: 'settings:write'
};

export const useDeletePermission = (resource) => {
  const { hasPermission, hasRole } = useAuth();
  
  const permissionKey = DELETE_PERMISSION_MAP[resource] || `${resource}:write`;
  
  const canDelete = useMemo(() => {
    if (hasRole('Admin')) {
      return true;
    }
    return hasPermission(permissionKey);
  }, [hasPermission, hasRole, permissionKey]);
  
  const guardDelete = useCallback((callback) => {
    return (...args) => {
      if (!canDelete) {
        throw new Error(`You do not have permission to delete ${resource}. Required permission: ${permissionKey}`);
      }
      return callback(...args);
    };
  }, [canDelete, resource, permissionKey]);
  
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
    permissionKey
  };
};

export const DELETE_PERMISSION_MAP_EXPORT = DELETE_PERMISSION_MAP;

export default useDeletePermission;
