/**
 * Email Composer Service
 * 
 * Composes email content using Handlebars templates.
 * Supports both HTML and plain text versions for all alert types.
 */

const Handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const { systemLogger } = require('../utils/logger');

class EmailComposer {
  constructor() {
    this.templates = {};
    this.templateDir = path.join(__dirname, 'email', 'templates');
  }

  /**
   * Load and compile a Handlebars template
   * @param {string} templateName - Template filename without extension
   * @param {string} format - 'html' or 'text'
   * @returns {Promise<Function>} - Compiled template function
   */
  async loadTemplate(templateName, format = 'html') {
    const cacheKey = `${templateName}_${format}`;
    
    if (this.templates[cacheKey]) {
      return this.templates[cacheKey];
    }

    try {
      const templatePath = path.join(this.templateDir, `${templateName}.${format}.hbs`);
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const compiled = Handlebars.compile(templateContent);
      
      this.templates[cacheKey] = compiled;
      return compiled;
    } catch (error) {
      systemLogger?.error('Failed to load email template', {
        templateName,
        format,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Register Handlebars helpers
   */
  registerHelpers() {
    // Format date helper
    Handlebars.registerHelper('formatDate', function(date) {
      if (!date) return 'N/A';
      const d = new Date(date);
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      });
    });

    // Format duration helper (milliseconds to human readable)
    Handlebars.registerHelper('formatDuration', function(ms) {
      if (!ms) return 'N/A';
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      
      if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
      } else {
        return `${seconds}s`;
      }
    });

    // Format number with commas
    Handlebars.registerHelper('formatNumber', function(num) {
      if (num === null || num === undefined) return 'N/A';
      return num.toLocaleString();
    });

    // Status badge color helper
    Handlebars.registerHelper('statusColor', function(status) {
      const colors = {
        success: '#10b981',
        completed: '#10b981',
        completed_with_warnings: '#d97706',
        failed: '#ef4444',
        error: '#ef4444',
        warning: '#f59e0b',
        pending: '#6b7280'
      };
      return colors[status?.toLowerCase()] || '#6b7280';
    });

    // Conditional helper
    Handlebars.registerHelper('eq', function(a, b) {
      return a === b;
    });

    // Greater than helper
    Handlebars.registerHelper('gt', function(a, b) {
      return a > b;
    });

    // Check if status is successful (success, completed, or completed_with_warnings)
    Handlebars.registerHelper('isSuccess', function(status) {
      const successStatuses = ['success', 'completed', 'completed_with_warnings'];
      return successStatuses.includes(status?.toLowerCase());
    });

    // Check if status is completed with warnings
    Handlebars.registerHelper('isWarning', function(status) {
      return status?.toLowerCase() === 'completed_with_warnings';
    });
  }

  /**
   * Compose job execution alert email
   * @param {Object} data - Job execution data
   * @returns {Promise<Object>} - { subject, html, text }
   */
  async composeJobAlert(data) {
    this.registerHelpers();

    const { job, status, error, duration, recordsProcessed, qualityViolations } = data;
    
    const successStatuses = ['success', 'completed', 'completed_with_warnings'];
    const isSuccess = successStatuses.includes(status?.toLowerCase());
    const isWarning = status?.toLowerCase() === 'completed_with_warnings';
    const outcomeLabel = isWarning ? 'Completed with warnings' : isSuccess ? 'Completed' : 'Failed';
    const subject = `[${isWarning ? 'WARNING' : status.toUpperCase()}] Job "${job.name}" ${outcomeLabel}`;
    
    const templateData = {
      jobName: job.name,
      jobId: job.id,
      status,
      isWarning,
      error,
      duration,
      recordsProcessed: recordsProcessed || 0,
      qualityViolations: qualityViolations || 0,
      hasViolations: qualityViolations > 0,
      executionTime: new Date(),
      projectName: job.project_name || 'Unknown Project'
    };

    const [htmlTemplate, textTemplate] = await Promise.all([
      this.loadTemplate('job-alert', 'html'),
      this.loadTemplate('job-alert', 'text')
    ]);

    return {
      subject,
      html: htmlTemplate(templateData),
      text: textTemplate(templateData)
    };
  }

  /**
   * Compose workflow execution alert email
   * @param {Object} data - Workflow execution data
   * @returns {Promise<Object>} - { subject, html, text }
   */
  async composeWorkflowAlert(data) {
    this.registerHelpers();

    const { workflow, status, error, duration, stepsCompleted, totalSteps, failedStep } = data;
    
    const successStatuses = ['success', 'completed'];
    const isSuccess = successStatuses.includes(status?.toLowerCase());
    const subject = `[${status.toUpperCase()}] Workflow "${workflow.name}" ${isSuccess ? 'Completed' : 'Failed'}`;
    
    const templateData = {
      workflowName: workflow.name,
      workflowId: workflow.id,
      status,
      error,
      duration,
      stepsCompleted: stepsCompleted || 0,
      totalSteps: totalSteps || 0,
      failedStep,
      executionTime: new Date(),
      projectName: workflow.project_name || 'Unknown Project'
    };

    const [htmlTemplate, textTemplate] = await Promise.all([
      this.loadTemplate('workflow-alert', 'html'),
      this.loadTemplate('workflow-alert', 'text')
    ]);

    return {
      subject,
      html: htmlTemplate(templateData),
      text: textTemplate(templateData)
    };
  }

  /**
   * Compose mapping group execution alert email
   * @param {Object} data - Mapping group execution data
   * @returns {Promise<Object>} - { subject, html, text }
   */
  async composeMappingGroupAlert(data) {
    this.registerHelpers();

    const { mappingGroup, status, error, duration, jobsCompleted, totalJobs, failedJobs } = data;
    
    const successStatuses = ['success', 'completed'];
    const isSuccess = successStatuses.includes(status?.toLowerCase());
    const subject = `[${status.toUpperCase()}] Mapping Group "${mappingGroup.name}" ${isSuccess ? 'Completed' : 'Failed'}`;
    
    const templateData = {
      groupName: mappingGroup.name,
      groupId: mappingGroup.id,
      status,
      error,
      duration,
      jobsCompleted: jobsCompleted || 0,
      totalJobs: totalJobs || 0,
      failedJobs: failedJobs || 0,
      executionTime: new Date(),
      projectName: mappingGroup.project_name || 'Unknown Project'
    };

    const [htmlTemplate, textTemplate] = await Promise.all([
      this.loadTemplate('mapping-group-alert', 'html'),
      this.loadTemplate('mapping-group-alert', 'text')
    ]);

    return {
      subject,
      html: htmlTemplate(templateData),
      text: textTemplate(templateData)
    };
  }

  /**
   * Compose schedule execution alert email
   * @param {Object} data - Schedule execution data
   * @returns {Promise<Object>} - { subject, html, text }
   */
  async composeScheduleAlert(data) {
    this.registerHelpers();

    const { schedule, status, error, duration, nextRun } = data;
    
    const successStatuses = ['success', 'completed'];
    const isSuccess = successStatuses.includes(status?.toLowerCase());
    const subject = `[${status.toUpperCase()}] Schedule "${schedule.name}" Execution ${isSuccess ? 'Completed' : 'Failed'}`;
    
    const templateData = {
      scheduleName: schedule.name,
      scheduleId: schedule.id,
      cronExpression: schedule.cron_expression,
      status,
      error,
      duration,
      nextRun,
      executionTime: new Date(),
      targetType: schedule.target_type,
      targetName: schedule.target_name || 'Unknown Target'
    };

    const [htmlTemplate, textTemplate] = await Promise.all([
      this.loadTemplate('schedule-alert', 'html'),
      this.loadTemplate('schedule-alert', 'text')
    ]);

    return {
      subject,
      html: htmlTemplate(templateData),
      text: textTemplate(templateData)
    };
  }

  /**
   * Compose consolidated alert email (multiple events aggregated)
   * @param {Object} data - Aggregated alert data
   * @returns {Promise<Object>} - { subject, html, text }
   */
  async composeConsolidatedAlert(data) {
    this.registerHelpers();

    const { events, summary, timeWindow } = data;
    
    const subject = `Alert Summary: ${summary.totalEvents} events in the last ${timeWindow}`;
    
    const templateData = {
      events,
      summary: {
        totalEvents: summary.totalEvents || 0,
        successCount: summary.successCount || 0,
        failureCount: summary.failureCount || 0,
        qualityViolations: summary.qualityViolations || 0
      },
      timeWindow,
      generatedAt: new Date()
    };

    const [htmlTemplate, textTemplate] = await Promise.all([
      this.loadTemplate('consolidated-alert', 'html'),
      this.loadTemplate('consolidated-alert', 'text')
    ]);

    return {
      subject,
      html: htmlTemplate(templateData),
      text: textTemplate(templateData)
    };
  }

  /**
   * Compose vendor agreement update notification email
   * @param {Object} data - Agreement update data
   * @returns {Promise<Object>} - { subject, html, text }
   */
  async composeVendorAgreementUpdate(data) {
    this.registerHelpers();

    const { 
      agreement, 
      vendorName, 
      changeSummary, 
      changes,
      updatedByName,
      baseUrl 
    } = data;
    
    const subject = `[Agreement Updated] ${agreement.agreement_code} - ${vendorName}`;
    
    const getStatusClass = (status) => {
      switch (status?.toLowerCase()) {
        case 'draft': return 'draft';
        case 'active': return 'active';
        case 'closed': return 'draft';
        default: return 'active';
      }
    };

    const formatApprovalStatus = (status) => {
      if (!status) return null;
      const statusMap = {
        'pending_vendor_acceptance': 'Pending Vendor Acceptance',
        'changes_pending': 'Changes Pending Vendor Review',
        'vendor_accepted': 'Vendor Accepted - Pending Manager',
        'vendor_rejected': 'Vendor Rejected',
        'manager_approved': 'Manager Approved - Pending Governance',
        'manager_rejected': 'Manager Rejected',
        'governance_approved': 'Fully Approved',
        'governance_rejected': 'Governance Rejected',
        'draft': 'Draft'
      };
      return statusMap[status] || status;
    };
    
    const templateData = {
      agreementCode: agreement.agreement_code,
      vendorName,
      status: agreement.status?.charAt(0).toUpperCase() + agreement.status?.slice(1) || 'Unknown',
      statusClass: getStatusClass(agreement.status),
      approvalStatus: formatApprovalStatus(agreement.approval_status),
      updatedByName: updatedByName || 'System',
      updatedAt: new Date(),
      hasChanges: changes && changes.length > 0,
      changes: changes || [],
      changeSummary,
      agreementUrl: `${baseUrl}/vendor/agreements?id=${agreement.id}`
    };

    const [htmlTemplate, textTemplate] = await Promise.all([
      this.loadTemplate('vendor-agreement-update', 'html'),
      this.loadTemplate('vendor-agreement-update', 'text')
    ]);

    return {
      subject,
      html: htmlTemplate(templateData),
      text: textTemplate(templateData)
    };
  }

  /**
   * Compose alert email based on entity type
   * @param {string} entityType - 'job', 'workflow', 'mapping_group', 'schedule'
   * @param {Object} entityData - Entity-specific data
   * @returns {Promise<Object>} - { subject, html, text }
   */
  async composeAlert(entityType, entityData) {
    switch (entityType) {
      case 'job':
        return await this.composeJobAlert(entityData);
      case 'workflow':
        return await this.composeWorkflowAlert(entityData);
      case 'mapping_group':
        return await this.composeMappingGroupAlert(entityData);
      case 'schedule':
        return await this.composeScheduleAlert(entityData);
      case 'vendor_agreement':
        return await this.composeVendorAgreementUpdate(entityData);
      default:
        throw new Error(`Unsupported entity type for alert composition: ${entityType}`);
    }
  }
}

module.exports = new EmailComposer();
