/**
 * Permission-based access control helper functions
 * These replace hardcoded "Admin" role name checks with actual permission checks
 */

/**
 * Check if user has a specific permission
 * @param {Object} user - User object with permissions array
 * @param {string} permissionName - Permission to check (e.g., 'file_catalog:read')
 * @returns {boolean}
 */
const userHasPermission = (user, permissionName) => {
  if (!user || !user.permissions) return false;
  
  return user.permissions.some(p => {
    if (typeof p === 'string') {
      return p === permissionName;
    }
    return p.name === permissionName || 
           p.permission_name === permissionName || 
           p.permission_code === permissionName;
  });
};

/**
 * Check if user has any of the specified permissions
 * @param {Object} user - User object with permissions array
 * @param {string[]} permissionNames - Array of permissions to check
 * @returns {boolean}
 */
const userHasAnyPermission = (user, permissionNames) => {
  if (!user || !user.permissions) return false;
  
  return permissionNames.some(perm => userHasPermission(user, perm));
};

/**
 * Check if user has the Admin role (for backward compatibility)
 * @param {Object} user - User object with roles array
 * @returns {boolean}
 */
const hasAdminRole = (user) => {
  if (!user || !user.roles) return false;
  
  return user.roles.includes('Admin') || 
         user.roles.includes('admin') ||
         user.roles.some(r => typeof r === 'object' && (
           r.name === 'Admin' || r.name === 'admin' ||
           r.role_name === 'Admin' || r.role_name === 'admin'
         ));
};

/**
 * Check if user has all-project access (admin-level access to all resources)
 * This replaces the hardcoded Admin role check with permission-based check
 * Users with project_management:write, users:write, or roles:write typically have admin-level access
 * @param {Object} user - User object with roles and permissions
 * @returns {boolean}
 */
const userHasAllProjectAccess = (user) => {
  if (!user) return false;
  
  if (hasAdminRole(user)) return true;
  
  const adminPermissions = [
    'project_management:write',
    'all_projects:read',
    'users:write',
    'roles:write'
  ];
  
  return userHasAnyPermission(user, adminPermissions);
};

/**
 * Check if user has admin-level access for user/role management
 * @param {Object} user - User object with roles and permissions
 * @returns {boolean}
 */
const userHasAdminAccess = (user) => {
  if (!user) return false;
  
  if (hasAdminRole(user)) return true;
  
  const adminPermissions = [
    'users:write',
    'roles:write',
    'project_management:write'
  ];
  
  return userHasAnyPermission(user, adminPermissions);
};

module.exports = {
  userHasPermission,
  userHasAnyPermission,
  hasAdminRole,
  userHasAllProjectAccess,
  userHasAdminAccess
};
