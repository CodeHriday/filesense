/**
 * Column-Level Access Control Service
 * 
 * This service handles permission-based filtering and masking of columns
 * based on governance tags and user permissions.
 */

const db = require('../config/database');
const { systemLogger } = require('../utils/logger');
const { checkProjectMembership } = require('../middleware/requireProjectAccess');
const { userHasAdminAccess } = require('../utils/permissionHelpers');

class ColumnAccessControlService {
  /**
   * Get project_id for a file
   * @param {string} fileId - File ID
   * @returns {Promise<number|null>}
   */
  async getFileProjectId(fileId) {
    try {
      const result = await db.query('SELECT project_id FROM files WHERE file_id = $1', [fileId]);
      return result.rows.length > 0 ? result.rows[0].project_id : null;
    } catch (error) {
      systemLogger.error('Error getting file project_id', { fileId, error: error.message });
      return null;
    }
  }
  
  /**
   * Check if user has access to file's project
   * @param {Object} user - User object with id, roles, permissions
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} { hasAccess, role, projectId }
   */
  async checkFileProjectAccess(user, fileId) {
    if (!user) {
      return { hasAccess: false, role: null, projectId: null };
    }
    
    // Admin-level access has access to all projects
    if (userHasAdminAccess(user)) {
      const projectId = await this.getFileProjectId(fileId);
      return { hasAccess: true, role: 'Admin', projectId };
    }
    
    // Get file's project_id
    const projectId = await this.getFileProjectId(fileId);
    if (!projectId) {
      systemLogger.warn('File has no project_id', { fileId });
      return { hasAccess: false, role: null, projectId: null };
    }
    
    // Check project membership
    const membership = await checkProjectMembership(user.id, projectId);
    
    return {
      hasAccess: membership.hasAccess,
      role: membership.role,
      projectId
    };
  }
  /**
   * Check if user has permission to access a specific tag
   * @param {Object} user - User object with roles and permissions
   * @param {string} tagName - Tag name (e.g., 'pii', 'confidential')
   * @param {string} accessLevel - 'read' or 'edit'
   * @returns {boolean}
   */
  hasTagPermission(user, tagName, accessLevel = 'read') {
    if (!user) return false;
    
    // Admin-level access has access to everything
    if (userHasAdminAccess(user)) {
      return true;
    }
    
    // Check if user has tag-specific permission
    const requiredPermission = `tag:${tagName.toLowerCase()}:${accessLevel}`;
    
    if (user.permissions && Array.isArray(user.permissions)) {
      return user.permissions.some(p => {
        if (typeof p === 'string') {
          return p === requiredPermission;
        }
        if (typeof p === 'object') {
          return p.name === requiredPermission || 
                 `${p.resource}:${p.action}` === requiredPermission;
        }
        return false;
      });
    }
    
    return false;
  }
  
  /**
   * Get column governance data for a file
   * @param {string} fileId - File ID
   * @returns {Promise<Array>} Array of column governance info
   */
  async getColumnGovernance(fileId) {
    try {
      const query = `
        SELECT 
          fc.column_name,
          fc.id as column_id,
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'tag_id', gt.tag_id,
                'tag_name', gt.tag_name,
                'permission_required', gt.permission_required,
                'sensitivity_level', gt.sensitivity_level,
                'requires_view_permission', gt.requires_view_permission,
                'requires_edit_permission', gt.requires_edit_permission
              )
            ) FILTER (WHERE gt.tag_id IS NOT NULL), 
            '[]'
          ) as tags,
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'policy_id', gp.policy_id,
                'policy_name', gp.policy_name
              )
            ) FILTER (WHERE gp.policy_id IS NOT NULL),
            '[]'
          ) as policies
        FROM file_columns fc
        LEFT JOIN column_governance_tag_assignments cgta ON fc.file_id = cgta.file_id AND fc.column_name = cgta.column_name
        LEFT JOIN governance_tags gt ON cgta.tag_id = gt.tag_id
        LEFT JOIN column_policy_assignments cpa ON fc.file_id = cpa.file_id AND fc.column_name = cpa.column_name
        LEFT JOIN governance_policies gp ON cpa.policy_id = gp.policy_id
        WHERE fc.file_id = $1
        GROUP BY fc.column_name, fc.id, fc.column_index
        ORDER BY fc.column_index
      `;
      
      const result = await db.query(query, [fileId]);
      return result.rows;
    } catch (error) {
      systemLogger.error('Error getting column governance', { fileId, error: error.message });
      throw error;
    }
  }
  
  /**
   * Filter columns based on user permissions
   * @param {Object} user - User object with roles and permissions
   * @param {Array} columns - Array of column governance objects
   * @param {string} accessLevel - 'read' or 'edit'
   * @returns {Object} { allowedColumns, deniedColumns, maskedColumns }
   */
  filterColumns(user, columns, accessLevel = 'read') {
    const allowedColumns = [];
    const deniedColumns = [];
    const maskedColumns = [];
    
    for (const column of columns) {
      // Parse tags if they're a string
      const tags = typeof column.tags === 'string' 
        ? JSON.parse(column.tags) 
        : column.tags || [];
      
      // Check if column has any sensitive tags
      const sensitiveTags = tags.filter(tag => 
        tag.sensitivity_level === 'restricted' || 
        tag.sensitivity_level === 'private' ||
        (accessLevel === 'read' && tag.requires_view_permission) ||
        (accessLevel === 'edit' && tag.requires_edit_permission)
      );
      
      if (sensitiveTags.length === 0) {
        // No sensitive tags, allow access
        allowedColumns.push({
          ...column,
          accessLevel: 'full',
          masked: false
        });
        continue;
      }
      
      // Check if user has permission for ALL sensitive tags
      const hasAllPermissions = sensitiveTags.every(tag => {
        return this.hasTagPermission(user, tag.permission_required || tag.tag_name, accessLevel);
      });
      
      if (hasAllPermissions) {
        // User has permission for all tags
        allowedColumns.push({
          ...column,
          accessLevel: 'full',
          masked: false
        });
      } else {
        // User doesn't have permission - mask or deny
        if (accessLevel === 'read') {
          // For read access, mask the column
          maskedColumns.push({
            ...column,
            accessLevel: 'masked',
            masked: true,
            restrictedBy: sensitiveTags.map(t => t.tag_name)
          });
        } else {
          // For edit access, deny completely
          deniedColumns.push({
            ...column,
            accessLevel: 'none',
            masked: false,
            restrictedBy: sensitiveTags.map(t => t.tag_name)
          });
        }
      }
    }
    
    return {
      allowedColumns,
      deniedColumns,
      maskedColumns,
      summary: {
        total: columns.length,
        allowed: allowedColumns.length,
        masked: maskedColumns.length,
        denied: deniedColumns.length
      }
    };
  }
  
  /**
   * Mask sensitive data in a row
   * @param {Object} row - Data row
   * @param {Array} maskedColumnNames - Array of column names to mask
   * @returns {Object} Masked row
   */
  maskRow(row, maskedColumnNames) {
    if (!row || !maskedColumnNames || maskedColumnNames.length === 0) {
      return row;
    }
    
    const maskedRow = { ...row };
    
    for (const columnName of maskedColumnNames) {
      if (columnName in maskedRow) {
        const value = maskedRow[columnName];
        
        if (value === null || value === undefined || value === '') {
          // Keep null/empty values as is
          continue;
        }
        
        // Mask based on data type
        if (typeof value === 'number') {
          maskedRow[columnName] = '****';
        } else if (typeof value === 'string') {
          // For strings, show first/last characters for long strings
          if (value.length <= 4) {
            maskedRow[columnName] = '****';
          } else if (value.length <= 10) {
            maskedRow[columnName] = `${value[0]}***${value[value.length - 1]}`;
          } else {
            // For longer strings (like emails, SSN), show pattern
            if (value.includes('@')) {
              // Email masking
              const [local, domain] = value.split('@');
              maskedRow[columnName] = `${local[0]}***@${domain}`;
            } else if (/^\d{3}-\d{2}-\d{4}$/.test(value)) {
              // SSN masking (###-##-####)
              maskedRow[columnName] = '***-**-' + value.slice(-4);
            } else {
              // Generic string masking
              maskedRow[columnName] = value.slice(0, 2) + '****' + value.slice(-2);
            }
          }
        } else {
          // For objects/arrays, just mask completely
          maskedRow[columnName] = '****';
        }
      }
    }
    
    return maskedRow;
  }
  
  /**
   * Apply column filtering and masking to dataset
   * @param {Object} user - User object
   * @param {string} fileId - File ID
   * @param {Array} data - Array of data rows
   * @param {string} accessLevel - 'read' or 'edit'
   * @returns {Promise<Object>} { data, columnAccess, summary, projectAccess }
   */
  async filterDataset(user, fileId, data, accessLevel = 'read') {
    try {
      // LAYER 1: Check project-level access first
      const projectAccess = await this.checkFileProjectAccess(user, fileId);
      
      if (!projectAccess.hasAccess) {
        systemLogger.warn('Project access denied for file', {
          userId: user?.id,
          username: user?.username,
          fileId,
          projectId: projectAccess.projectId
        });
        
        // Deny all access - return empty dataset with all columns masked
        return {
          data: [],
          columnAccess: {
            allowed: [],
            masked: [],
            denied: []
          },
          summary: {
            total: 0,
            allowed: 0,
            masked: 0,
            denied: 0
          },
          projectAccess: {
            hasAccess: false,
            reason: 'Not a member of the file\'s project',
            projectId: projectAccess.projectId
          }
        };
      }
      
      // LAYER 2: User is a project member, proceed with tag-based column access control
      // Get column governance info
      const columnGovernance = await this.getColumnGovernance(fileId);
      
      // Filter columns based on permissions
      const { allowedColumns, deniedColumns, maskedColumns, summary } = 
        this.filterColumns(user, columnGovernance, accessLevel);
      
      // Get masked column names
      const maskedColumnNames = maskedColumns.map(c => c.column_name);
      
      // Apply masking to data
      const maskedData = data.map(row => this.maskRow(row, maskedColumnNames));
      
      // For edit access, remove denied columns completely
      let filteredData = maskedData;
      if (accessLevel === 'edit' && deniedColumns.length > 0) {
        const deniedColumnNames = deniedColumns.map(c => c.column_name);
        filteredData = maskedData.map(row => {
          const filtered = { ...row };
          for (const col of deniedColumnNames) {
            delete filtered[col];
          }
          return filtered;
        });
      }
      
      return {
        data: filteredData,
        columnAccess: {
          allowed: allowedColumns.map(c => ({ name: c.column_name, masked: false })),
          masked: maskedColumns.map(c => ({ name: c.column_name, masked: true, restrictedBy: c.restrictedBy })),
          denied: deniedColumns.map(c => ({ name: c.column_name, denied: true, restrictedBy: c.restrictedBy }))
        },
        summary,
        projectAccess: {
          hasAccess: true,
          role: projectAccess.role,
          projectId: projectAccess.projectId
        }
      };
    } catch (error) {
      systemLogger.error('Error filtering dataset', { fileId, error: error.message });
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new ColumnAccessControlService();
