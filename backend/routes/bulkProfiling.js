/**
 * Bulk Profiling API Routes
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const BulkProfilingService = require('../services/BulkProfilingService');
const authenticateToken = require('../middleware/authenticate');
const { systemLogger } = require('../utils/logger');

/**
 * POST /api/bulk-profiling/discover
 * Discover files from S3 path
 */
router.post('/discover', authenticateToken, async (req, res) => {
  try {
    const { connectionId, s3Path, filePattern, recursive } = req.body;
    
    if (!connectionId || !s3Path) {
      return res.status(400).json({
        success: false,
        message: 'Connection ID and S3 path are required'
      });
    }
    
    const files = await BulkProfilingService.discoverFiles(
      connectionId,
      s3Path,
      filePattern || '*',
      recursive || false
    );
    
    res.json({
      success: true,
      files,
      count: files.length
    });
    
  } catch (error) {
    systemLogger.error('Error discovering files', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/bulk-profiling/jobs
 * Create a new bulk profiling job
 */
router.post('/jobs', authenticateToken, async (req, res) => {
  try {
    const jobData = {
      ...req.body,
      createdBy: req.user.id
    };
    
    // Create the job
    const job = await BulkProfilingService.createJob(jobData);
    
    // Discover files
    const files = await BulkProfilingService.discoverFiles(
      jobData.connectionId,
      jobData.s3Path,
      jobData.filePattern || '*',
      jobData.recursive || false
    );
    
    if (files.length === 0) {
      await BulkProfilingService.updateJobStatus(job.id, 'completed');
      return res.json({
        success: true,
        job,
        message: 'No files found matching the criteria'
      });
    }
    
    // Add files to job
    await BulkProfilingService.addFilesToJob(job.id, files);
    
    // Return job details
    const updatedJob = await BulkProfilingService.getJob(job.id);
    
    res.json({
      success: true,
      job: updatedJob
    });
    
  } catch (error) {
    systemLogger.error('Error creating bulk profiling job', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/bulk-profiling/jobs
 * Get all bulk profiling jobs
 */
router.get('/jobs', authenticateToken, async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      projectId: req.query.projectId,
      createdBy: req.query.createdBy,
      limit: req.query.limit
    };
    
    const jobs = await BulkProfilingService.getAllJobs(filters);
    
    res.json({
      success: true,
      jobs
    });
    
  } catch (error) {
    systemLogger.error('Error getting bulk profiling jobs', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/bulk-profiling/jobs/:jobId
 * Get a specific bulk profiling job with file details
 */
router.get('/jobs/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await BulkProfilingService.getJob(jobId);
    
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
    systemLogger.error('Error getting bulk profiling job', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/bulk-profiling/jobs/:jobId/start
 * Start executing a bulk profiling job
 */
router.post('/jobs/:jobId/start', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await BulkProfilingService.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    if (job.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Job is already ${job.status}`
      });
    }
    
    // Update job status to running
    await BulkProfilingService.updateJobStatus(jobId, 'running');
    
    // Start async processing (will be implemented in next phase)
    // For now, just return success
    
    res.json({
      success: true,
      message: 'Job started',
      jobId
    });
    
  } catch (error) {
    systemLogger.error('Error starting bulk profiling job', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/bulk-profiling/jobs/:jobId
 * Cancel/delete a bulk profiling job
 */
router.delete('/jobs/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await BulkProfilingService.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    if (job.status === 'running') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a running job'
      });
    }
    
    // Delete job (cascade will delete files too)
    await pool.query('DELETE FROM bulk_profiling_jobs WHERE id = $1', [jobId]);
    
    res.json({
      success: true,
      message: 'Job deleted'
    });
    
  } catch (error) {
    systemLogger.error('Error deleting bulk profiling job', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
