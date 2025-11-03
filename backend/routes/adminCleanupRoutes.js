/**
 * Admin Cleanup Routes
 * 
 * Provides endpoints for admin users to perform system-wide data cleanup.
 * Preserves critical system tables (users, roles, permissions) while allowing
 * deletion of operational data in categories.
 */

const express = require('express');
const router = express.Router();

/**
 * Get record counts for all cleanup categories
 * Helps admin preview what will be deleted before confirmation
 */
router.get('/counts', async (req, res) => {
  const pool = req.app.locals.pool;
  
  try {
    const counts = {};
    
    // Files & Storage category
    const filesCount = await pool.query('SELECT COUNT(*) FROM files');
    const fileColumnsCount = await pool.query('SELECT COUNT(*) FROM file_columns');
    const filePreviewCount = await pool.query('SELECT COUNT(*) FROM file_preview_data');
    const fileSchemasCount = await pool.query('SELECT COUNT(*) FROM file_schemas');
    
    counts.files = {
      files: parseInt(filesCount.rows[0].count),
      file_columns: parseInt(fileColumnsCount.rows[0].count),
      file_preview_data: parseInt(filePreviewCount.rows[0].count),
      file_schemas: parseInt(fileSchemasCount.rows[0].count)
    };
    
    // Transformations & ETL category
    const transformationsCount = await pool.query('SELECT COUNT(*) FROM transformation_mappings');
    const jobsCount = await pool.query('SELECT COUNT(*) FROM transformation_jobs');
    const logsCount = await pool.query('SELECT COUNT(*) FROM transformation_logs');
    const profilingCount = await pool.query('SELECT COUNT(*) FROM profiling_metrics');
    const anomaliesCount = await pool.query('SELECT COUNT(*) FROM anomalies');
    
    counts.transformations = {
      transformation_mappings: parseInt(transformationsCount.rows[0].count),
      transformation_jobs: parseInt(jobsCount.rows[0].count),
      transformation_logs: parseInt(logsCount.rows[0].count),
      profiling_metrics: parseInt(profilingCount.rows[0].count),
      anomalies: parseInt(anomaliesCount.rows[0].count)
    };
    
    // Workflows & Orchestration category
    const workflowsCount = await pool.query('SELECT COUNT(*) FROM n_step_workflows');
    const workflowStepsCount = await pool.query('SELECT COUNT(*) FROM workflow_steps');
    const mappingGroupsCount = await pool.query('SELECT COUNT(*) FROM mapping_groups');
    const schedulesCount = await pool.query('SELECT COUNT(*) FROM schedules');
    
    counts.workflows = {
      n_step_workflows: parseInt(workflowsCount.rows[0].count),
      workflow_steps: parseInt(workflowStepsCount.rows[0].count),
      mapping_groups: parseInt(mappingGroupsCount.rows[0].count),
      schedules: parseInt(schedulesCount.rows[0].count)
    };
    
    // Data Governance category
    const columnGovernanceCount = await pool.query('SELECT COUNT(*) FROM column_governance_tag_assignments');
    const columnPoliciesCount = await pool.query('SELECT COUNT(*) FROM column_policy_assignments');
    const fileOwnershipCount = await pool.query('SELECT COUNT(*) FROM file_ownership');
    const tagsCount = await pool.query('SELECT COUNT(*) FROM governance_tags');
    const policiesCount = await pool.query('SELECT COUNT(*) FROM governance_policies');
    
    counts.governance = {
      column_governance_tag_assignments: parseInt(columnGovernanceCount.rows[0].count),
      column_policy_assignments: parseInt(columnPoliciesCount.rows[0].count),
      file_ownership: parseInt(fileOwnershipCount.rows[0].count),
      governance_tags: parseInt(tagsCount.rows[0].count),
      governance_policies: parseInt(policiesCount.rows[0].count)
    };
    
    // Audit & Monitoring category
    const fileAuditCount = await pool.query('SELECT COUNT(*) FROM file_audit_details');
    const alertsCount = await pool.query('SELECT COUNT(*) FROM alert_history');
    const insightsCount = await pool.query('SELECT COUNT(*) FROM file_pattern_metrics');
    const executionAuditCount = await pool.query('SELECT COUNT(*) FROM execution_audit');
    const securityAuditCount = await pool.query('SELECT COUNT(*) FROM security_audit_log');
    
    counts.audits = {
      file_audit_details: parseInt(fileAuditCount.rows[0].count),
      alert_history: parseInt(alertsCount.rows[0].count),
      file_pattern_metrics: parseInt(insightsCount.rows[0].count),
      execution_audit: parseInt(executionAuditCount.rows[0].count),
      security_audit_log: parseInt(securityAuditCount.rows[0].count)
    };
    
    // Projects & Access Control category
    const projectsCount = await pool.query('SELECT COUNT(*) FROM projects WHERE id != 1'); // Exclude Default Project
    const projectMembersCount = await pool.query('SELECT COUNT(*) FROM project_members');
    
    counts.projects = {
      projects: parseInt(projectsCount.rows[0].count),
      project_members: parseInt(projectMembersCount.rows[0].count)
    };
    
    // Connections category
    const storageConnectionsCount = await pool.query('SELECT COUNT(*) FROM storage_connections');
    const transformConnectionsCount = await pool.query('SELECT COUNT(*) FROM transform_connections');
    
    counts.connections = {
      storage_connections: parseInt(storageConnectionsCount.rows[0].count),
      transform_connections: parseInt(transformConnectionsCount.rows[0].count)
    };
    
    // Groups category
    const groupsCount = await pool.query('SELECT COUNT(*) FROM access_groups WHERE id != 1'); // Exclude Default Group
    const groupMembersCount = await pool.query('SELECT COUNT(*) FROM access_group_members');
    const groupRolesCount = await pool.query('SELECT COUNT(*) FROM access_group_roles');
    
    counts.groups = {
      access_groups: parseInt(groupsCount.rows[0].count),
      access_group_members: parseInt(groupMembersCount.rows[0].count),
      access_group_roles: parseInt(groupRolesCount.rows[0].count)
    };
    
    // Vendors & Agreements category
    const vendorAgreementsCount = await pool.query('SELECT COUNT(*) FROM vendor_agreements');
    const vendorApprovalsCount = await pool.query('SELECT COUNT(*) FROM vendor_agreement_approvals');
    const vendorChangesCount = await pool.query('SELECT COUNT(*) FROM vendor_agreement_changes');
    const vendorDocsCount = await pool.query('SELECT COUNT(*) FROM vendor_agreement_documents');
    const vendorProfilingCount = await pool.query('SELECT COUNT(*) FROM vendor_file_profiling_results');
    const vendorUsersCount = await pool.query('SELECT COUNT(*) FROM vendor_users');
    const vendorsCount = await pool.query('SELECT COUNT(*) FROM vendors');
    
    counts.vendors = {
      vendor_agreements: parseInt(vendorAgreementsCount.rows[0].count),
      vendor_agreement_approvals: parseInt(vendorApprovalsCount.rows[0].count),
      vendor_agreement_changes: parseInt(vendorChangesCount.rows[0].count),
      vendor_agreement_documents: parseInt(vendorDocsCount.rows[0].count),
      vendor_file_profiling_results: parseInt(vendorProfilingCount.rows[0].count),
      vendor_users: parseInt(vendorUsersCount.rows[0].count),
      vendors: parseInt(vendorsCount.rows[0].count)
    };
    
    // DBT Integration category
    const dbtExecutionsCount = await pool.query('SELECT COUNT(*) FROM dbt_executions');
    const dbtModelsCount = await pool.query('SELECT COUNT(*) FROM dbt_models');
    
    counts.dbt = {
      dbt_executions: parseInt(dbtExecutionsCount.rows[0].count),
      dbt_models: parseInt(dbtModelsCount.rows[0].count)
    };
    
    // Notifications & User Activity category
    const notificationsCount = await pool.query('SELECT COUNT(*) FROM notifications');
    const userSessionsCount = await pool.query('SELECT COUNT(*) FROM user_sessions');
    const userBadgesCount = await pool.query('SELECT COUNT(*) FROM user_badges');
    const userDashboardCount = await pool.query('SELECT COUNT(*) FROM user_dashboard_settings');
    
    counts.activity = {
      notifications: parseInt(notificationsCount.rows[0].count),
      user_sessions: parseInt(userSessionsCount.rows[0].count),
      user_badges: parseInt(userBadgesCount.rows[0].count),
      user_dashboard_settings: parseInt(userDashboardCount.rows[0].count)
    };
    
    res.json({ counts });
  } catch (error) {
    console.error('Error fetching cleanup counts:', error);
    res.status(500).json({ 
      error: 'Failed to fetch cleanup counts',
      message: error.message 
    });
  }
});

/**
 * Execute system cleanup based on selected categories
 * Requires admin privileges and multiple confirmation
 */
router.post('/', async (req, res) => {
  const pool = req.app.locals.pool;
  const { categories, confirmationCode } = req.body;
  
  // Validate confirmation code
  if (confirmationCode !== 'DELETE ALL DATA') {
    return res.status(400).json({ 
      error: 'Invalid confirmation code',
      message: 'You must type "DELETE ALL DATA" to proceed'
    });
  }
  
  // Validate categories
  if (!Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({ 
      error: 'No categories selected',
      message: 'Please select at least one category to clean up'
    });
  }
  
  const validCategories = ['files', 'transformations', 'workflows', 'governance', 'audits', 'projects', 'connections', 'groups', 'vendors', 'dbt', 'activity'];
  const invalidCategories = categories.filter(c => !validCategories.includes(c));
  
  if (invalidCategories.length > 0) {
    return res.status(400).json({ 
      error: 'Invalid categories',
      message: `Invalid categories: ${invalidCategories.join(', ')}`
    });
  }
  
  const client = await pool.connect();
  const deletedCounts = {};
  
  try {
    await client.query('BEGIN');
    
    // Delete Files & Storage (cascades to related tables)
    if (categories.includes('files')) {
      const filePreviewResult = await client.query('DELETE FROM file_preview_data RETURNING preview_id');
      const fileColumnsResult = await client.query('DELETE FROM file_columns RETURNING id');
      const fileSchemasResult = await client.query('DELETE FROM file_schemas RETURNING id');
      const filesResult = await client.query('DELETE FROM files RETURNING id');
      
      deletedCounts.files = {
        files: filesResult.rowCount,
        file_columns: fileColumnsResult.rowCount,
        file_preview_data: filePreviewResult.rowCount,
        file_schemas: fileSchemasResult.rowCount
      };
    }
    
    // Delete Transformations & ETL
    if (categories.includes('transformations')) {
      const anomaliesResult = await client.query('DELETE FROM anomalies RETURNING id');
      const profilingResult = await client.query('DELETE FROM profiling_metrics RETURNING id');
      const logsResult = await client.query('DELETE FROM transformation_logs RETURNING id');
      const jobsResult = await client.query('DELETE FROM transformation_jobs RETURNING id');
      const transformationsResult = await client.query('DELETE FROM transformation_mappings RETURNING mapping_id');
      
      deletedCounts.transformations = {
        transformation_mappings: transformationsResult.rowCount,
        transformation_jobs: jobsResult.rowCount,
        transformation_logs: logsResult.rowCount,
        profiling_metrics: profilingResult.rowCount,
        anomalies: anomaliesResult.rowCount
      };
    }
    
    // Delete Workflows & Orchestration
    if (categories.includes('workflows')) {
      const schedulesResult = await client.query('DELETE FROM schedules RETURNING id');
      const mappingGroupMembersResult = await client.query('DELETE FROM mapping_group_members RETURNING id');
      const mappingGroupsResult = await client.query('DELETE FROM mapping_groups RETURNING id');
      const workflowStepsResult = await client.query('DELETE FROM workflow_steps RETURNING id');
      const workflowsResult = await client.query('DELETE FROM n_step_workflows RETURNING id');
      
      deletedCounts.workflows = {
        n_step_workflows: workflowsResult.rowCount,
        workflow_steps: workflowStepsResult.rowCount,
        mapping_groups: mappingGroupsResult.rowCount,
        mapping_group_members: mappingGroupMembersResult.rowCount,
        schedules: schedulesResult.rowCount
      };
    }
    
    // Delete Data Governance
    if (categories.includes('governance')) {
      const columnPoliciesResult = await client.query('DELETE FROM column_policy_assignments RETURNING id');
      const columnGovernanceResult = await client.query('DELETE FROM column_governance_tag_assignments RETURNING id');
      const fileOwnershipResult = await client.query('DELETE FROM file_ownership RETURNING id');
      const tagsResult = await client.query('DELETE FROM governance_tags RETURNING id');
      const policiesResult = await client.query('DELETE FROM governance_policies RETURNING id');
      
      deletedCounts.governance = {
        column_governance_tag_assignments: columnGovernanceResult.rowCount,
        column_policy_assignments: columnPoliciesResult.rowCount,
        file_ownership: fileOwnershipResult.rowCount,
        governance_tags: tagsResult.rowCount,
        governance_policies: policiesResult.rowCount
      };
    }
    
    // Delete Audit & Monitoring
    if (categories.includes('audits')) {
      const insightsResult = await client.query('DELETE FROM file_pattern_metrics RETURNING id');
      const alertsResult = await client.query('DELETE FROM alert_history RETURNING id');
      const auditResult = await client.query('DELETE FROM file_audit_details RETURNING id');
      const executionAuditResult = await client.query('DELETE FROM execution_audit RETURNING id');
      const securityAuditResult = await client.query('DELETE FROM security_audit_log RETURNING id');
      
      deletedCounts.audits = {
        file_audit_details: auditResult.rowCount,
        alert_history: alertsResult.rowCount,
        file_pattern_metrics: insightsResult.rowCount,
        execution_audit: executionAuditResult.rowCount,
        security_audit_log: securityAuditResult.rowCount
      };
    }
    
    // Delete Projects & Access Control (preserve Default Project)
    if (categories.includes('projects')) {
      const projectMembersResult = await client.query('DELETE FROM project_members RETURNING id');
      const projectsResult = await client.query('DELETE FROM projects WHERE id != 1 RETURNING id');
      
      deletedCounts.projects = {
        projects: projectsResult.rowCount,
        project_members: projectMembersResult.rowCount
      };
    }
    
    // Delete Connections
    if (categories.includes('connections')) {
      const transformConnectionsResult = await client.query('DELETE FROM transform_connections RETURNING connection_id');
      const storageConnectionsResult = await client.query('DELETE FROM storage_connections RETURNING connection_id');
      
      deletedCounts.connections = {
        storage_connections: storageConnectionsResult.rowCount,
        transform_connections: transformConnectionsResult.rowCount
      };
    }
    
    // Delete Groups (preserve Default Group)
    if (categories.includes('groups')) {
      const groupRolesResult = await client.query('DELETE FROM access_group_roles WHERE group_id != 1 RETURNING id');
      const groupMembersResult = await client.query('DELETE FROM access_group_members WHERE group_id != 1 RETURNING id');
      const groupsResult = await client.query('DELETE FROM access_groups WHERE id != 1 RETURNING id');
      
      deletedCounts.groups = {
        access_groups: groupsResult.rowCount,
        access_group_members: groupMembersResult.rowCount,
        access_group_roles: groupRolesResult.rowCount
      };
    }
    
    // Delete Vendors & Agreements (proper FK order)
    if (categories.includes('vendors')) {
      // Delete child tables first
      const vendorDocsResult = await client.query('DELETE FROM vendor_agreement_documents RETURNING id');
      const vendorChangesResult = await client.query('DELETE FROM vendor_agreement_changes RETURNING id');
      const vendorApprovalsResult = await client.query('DELETE FROM vendor_agreement_approvals RETURNING id');
      const vendorProfilingResult = await client.query('DELETE FROM vendor_file_profiling_results RETURNING id');
      const vendorAgreementsResult = await client.query('DELETE FROM vendor_agreements RETURNING id');
      const vendorUsersResult = await client.query('DELETE FROM vendor_users RETURNING id');
      const vendorsResult = await client.query('DELETE FROM vendors RETURNING id');
      
      deletedCounts.vendors = {
        vendor_agreement_documents: vendorDocsResult.rowCount,
        vendor_agreement_changes: vendorChangesResult.rowCount,
        vendor_agreement_approvals: vendorApprovalsResult.rowCount,
        vendor_file_profiling_results: vendorProfilingResult.rowCount,
        vendor_agreements: vendorAgreementsResult.rowCount,
        vendor_users: vendorUsersResult.rowCount,
        vendors: vendorsResult.rowCount
      };
    }
    
    // Delete DBT Integration
    if (categories.includes('dbt')) {
      const dbtExecutionsResult = await client.query('DELETE FROM dbt_executions RETURNING id');
      const dbtModelsResult = await client.query('DELETE FROM dbt_models RETURNING id');
      
      deletedCounts.dbt = {
        dbt_executions: dbtExecutionsResult.rowCount,
        dbt_models: dbtModelsResult.rowCount
      };
    }
    
    // Delete Notifications & User Activity
    if (categories.includes('activity')) {
      const notificationsResult = await client.query('DELETE FROM notifications RETURNING id');
      const userSessionsResult = await client.query('DELETE FROM user_sessions RETURNING id');
      const userBadgesResult = await client.query('DELETE FROM user_badges RETURNING id');
      const userDashboardResult = await client.query('DELETE FROM user_dashboard_settings RETURNING id');
      
      deletedCounts.activity = {
        notifications: notificationsResult.rowCount,
        user_sessions: userSessionsResult.rowCount,
        user_badges: userBadgesResult.rowCount,
        user_dashboard_settings: userDashboardResult.rowCount
      };
    }
    
    await client.query('COMMIT');
    
    // Log the cleanup operation
    const AuditService = require('../services/AuditService');
    const auditService = new AuditService(pool);
    await auditService.logSystemCleanup(req.user.id, req.user.username, categories, deletedCounts);
    
    res.json({ 
      success: true,
      message: 'System cleanup completed successfully',
      deletedCounts
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during system cleanup:', error);
    res.status(500).json({ 
      error: 'Cleanup failed',
      message: error.message 
    });
  } finally {
    client.release();
  }
});

module.exports = router;
