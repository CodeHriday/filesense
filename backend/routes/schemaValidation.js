/**
 * Schema Validation API Routes
 * Fast metadata validation against vendor agreement schemas
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const FastSchemaValidationService = require('../services/FastSchemaValidationService');
const authenticateToken = require('../middleware/authenticate');
const { systemLogger } = require('../utils/logger');
const path = require('path');
const fs = require('fs');

/**
 * POST /api/schema-validation/jobs
 * Create a new schema validation job
 */
router.post('/jobs', authenticateToken, async (req, res) => {
  try {
    const { connectionId, projectId, vendorAgreementId } = req.body;
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!connectionId || typeof connectionId !== 'string' || !uuidRegex.test(connectionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid connection ID. Please select a valid storage connection.'
      });
    }
    
    if (!projectId || isNaN(parseInt(projectId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid project ID. Please select a valid project.'
      });
    }
    
    if (!vendorAgreementId || isNaN(parseInt(vendorAgreementId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid vendor agreement ID. Please select a valid vendor agreement.'
      });
    }
    
    const jobData = {
      ...req.body,
      createdBy: req.user.id
    };

    const job = await FastSchemaValidationService.createJob(jobData);

    if (jobData.executionType !== 'scheduled') {
      setImmediate(async () => {
        try {
          await FastSchemaValidationService.processJob(job.id);
        } catch (error) {
          systemLogger.error('Error processing schema validation job', { 
            jobId: job.id, 
            error: error.message 
          });
        }
      });
    }

    res.json({
      success: true,
      job
    });

  } catch (error) {
    systemLogger.error('Error creating schema validation job', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/schema-validation/jobs
 * Get all jobs with optional filters
 */
router.get('/jobs', authenticateToken, async (req, res) => {
  try {
    const { status, projectId } = req.query;
    
    const jobs = await FastSchemaValidationService.getJobs({
      status,
      projectId: projectId ? parseInt(projectId) : null
    });

    res.json({
      success: true,
      jobs
    });

  } catch (error) {
    systemLogger.error('Error fetching schema validation jobs', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/schema-validation/jobs/:jobId
 * Get job status
 */
router.get('/jobs/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await FastSchemaValidationService.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    res.json({
      success: true,
      job
    });

  } catch (error) {
    systemLogger.error('Error fetching schema validation job', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/schema-validation/jobs/:jobId/files
 * Get paginated file details for a job
 */
router.get('/jobs/:jobId/files', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { 
      page = 1, 
      pageSize = 25, 
      status, 
      sortBy = 'id',
      sortOrder = 'asc'
    } = req.query;
    
    const result = await FastSchemaValidationService.getJobFileDetails(jobId, {
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      status: status || null,
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    systemLogger.error('Error fetching job files', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/schema-validation/jobs/:jobId/report
 * Download validation report
 */
router.get('/jobs/:jobId/report', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const reportPath = await FastSchemaValidationService.getReportPath(jobId);
    
    if (!reportPath) {
      return res.status(404).json({
        success: false,
        message: 'Report not found or expired'
      });
    }

    const fileName = path.basename(reportPath).trim();
    const safeFileName = fileName.replace(/[^\w-.]/g, '_');
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    
    const fileStream = fs.createReadStream(reportPath);
    fileStream.pipe(res);

  } catch (error) {
    systemLogger.error('Error downloading report', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/schema-validation/schedules
 * Get all scheduled jobs
 */
router.get('/schedules', authenticateToken, async (req, res) => {
  try {
    const schedules = await FastSchemaValidationService.getScheduledJobs();

    res.json({
      success: true,
      schedules
    });

  } catch (error) {
    systemLogger.error('Error fetching scheduled jobs', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/schema-validation/schedules/:scheduleId
 * Update a scheduled job
 */
router.put('/schedules/:scheduleId', authenticateToken, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { cronExpression, isActive } = req.body;
    
    await FastSchemaValidationService.updateSchedule(scheduleId, {
      cronExpression,
      isActive
    });

    res.json({
      success: true,
      message: 'Schedule updated'
    });

  } catch (error) {
    systemLogger.error('Error updating schedule', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/schema-validation/schedules/:scheduleId
 * Cancel a scheduled job
 */
router.delete('/schedules/:scheduleId', authenticateToken, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    
    await FastSchemaValidationService.deleteSchedule(scheduleId);

    res.json({
      success: true,
      message: 'Schedule cancelled'
    });

  } catch (error) {
    systemLogger.error('Error cancelling schedule', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
