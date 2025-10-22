/**
 * Column-Level Access Control Service
 * 
 * This service handles permission-based filtering and masking of columns
 * based on governance tags and user permissions.
 */

const db = require('../config/database');
const { systemLogger } = require('../utils/logger');

class ColumnAccessControlService {
  /**
   * Check if user has permission to access a specific tag
   * @param {Object} user - User object with roles and permissions
   * @param {string} tagName - Tag name (e.g., 'pii', 'confidential')
   * @param {string} accessLevel - 'read' or 'edit'
   * @returns {boolean}
   */
  hasTagPermission(user, tagName, accessLevel = 'read') {
    if (!user) return false;
    
    // Admin has access to everything
    if (user.roles && user.roles.includes('Admin')) {
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
          fc.column_id,
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
        LEFT JOIN column_governance_tag_assignments cgta ON fc.column_id = cgta.column_id
        LEFT JOIN governance_tags gt ON cgta.tag_id = gt.tag_id
        LEFT JOIN column_policy_assignments cpa ON fc.column_id = cpa.column_id
        LEFT JOIN governance_policies gp ON cpa.policy_id = gp.policy_id
        WHERE fc.file_id = $1
        GROUP BY fc.column_name, fc.column_id
        ORDER BY fc.column_id
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
   * @returns {Promise<Object>} { data, columnAccess, summary }
   */
  async filterDataset(user, fileId, data, accessLevel = 'read') {
    try {
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
        summary
      };
    } catch (error) {
      systemLogger.error('Error filtering dataset', { fileId, error: error.message });
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new ColumnAccessControlService();
