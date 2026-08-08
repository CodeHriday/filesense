const express = require('express');
const router = express.Router();
const DLQService = require('../services/dlqService');
const pool = require('../db');
const { systemLogger } = require('../utils/logger');

const dlqService = new DLQService(pool, systemLogger);

router.get('/', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      errorCode: req.query.errorCode,
      jobType: req.query.jobType,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate
    };

    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50
    };

    const result = await dlqService.getDLQJobs(filters, pagination);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    systemLogger.error('Error fetching DLQ jobs', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({
      error: 'Failed to fetch DLQ jobs',
      details: error.message
    });
  }
});

router.get('/statistics', async (req, res) => {
  try {
    const stats = await dlqService.getStatistics();

    res.json({
      success: true,
      statistics: stats
    });

  } catch (error) {
    systemLogger.error('Error fetching DLQ statistics', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({
      error: 'Failed to fetch DLQ statistics',
      details: error.message
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const dlqJobId = parseInt(req.params.id);

    if (isNaN(dlqJobId)) {
      return res.status(400).json({ error: 'Invalid DLQ job ID' });
    }

    const job = await dlqService.getDLQJobById(dlqJobId);

    if (!job) {
      return res.status(404).json({ error: 'DLQ job not found' });
    }

    res.json({
      success: true,
      job
    });

  } catch (error) {
    systemLogger.error('Error fetching DLQ job', {
      dlqJobId: req.params.id,
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({
      error: 'Failed to fetch DLQ job',
      details: error.message
    });
  }
});

router.post('/:id/retry', async (req, res) => {
  try {
    const dlqJobId = parseInt(req.params.id);

    if (isNaN(dlqJobId)) {
      return res.status(400).json({ error: 'Invalid DLQ job ID' });
    }

    const job = await dlqService.getDLQJobById(dlqJobId);

    if (!job) {
      return res.status(404).json({ error: 'DLQ job not found' });
    }

    if (job.status === 'resolved') {
      return res.status(400).json({
        error: 'Job already resolved',
        message: 'This DLQ job has already been successfully resolved'
      });
    }

    const originalPayload = typeof job.original_payload === 'string'
      ? JSON.parse(job.original_payload)
      : job.original_payload;

    if (!originalPayload.archiveFilePath || !originalPayload.archiveFileId) {
      return res.status(400).json({
        error: 'Invalid job payload',
        message: 'Job payload does not contain required archive information'
      });
    }

    const ArchiveExtractionService = require('../services/archiveExtractionService');
    const virusScanService = require('../services/VirusScanService');
    const archiveExtractionService = new ArchiveExtractionService(
      pool,
      virusScanService,
      systemLogger
    );

    try {
      const result = await archiveExtractionService.extractArchive(
        originalPayload.archiveFilePath,
        originalPayload.archiveFileId,
        originalPayload.password || null,
        req.user?.id
      );

      await dlqService.updateDLQJobStatus(dlqJobId, 'resolved', true);

      systemLogger.info('DLQ job retry succeeded', {
        dlqJobId,
        archiveFileId: originalPayload.archiveFileId,
        extractedCount: result.extractedCount,
        userId: req.user?.id
      });

      res.json({
        success: true,
        message: 'Archive extraction retry succeeded',
        extractedCount: result.extractedCount,
        files: result.files
      });

    } catch (retryError) {
      await dlqService.updateDLQJobStatus(dlqJobId, 'failed', true);

      systemLogger.error('DLQ job retry failed', {
        dlqJobId,
        error: retryError.message,
        userId: req.user?.id
      });

      res.status(500).json({
        error: 'Archive extraction retry failed',
        details: retryError.message
      });
    }

  } catch (error) {
    systemLogger.error('Error retrying DLQ job', {
      dlqJobId: req.params.id,
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({
      error: 'Failed to retry DLQ job',
      details: error.message
    });
  }
});

router.post('/:id/provide-password', async (req, res) => {
  try {
    const dlqJobId = parseInt(req.params.id);
    const { password } = req.body;

    if (isNaN(dlqJobId)) {
      return res.status(400).json({ error: 'Invalid DLQ job ID' });
    }

    if (!password || typeof password !== 'string' || password.trim().length === 0) {
      return res.status(400).json({
        error: 'Password is required',
        message: 'Please provide a non-empty password'
      });
    }

    const job = await dlqService.getDLQJobById(dlqJobId);

    if (!job) {
      return res.status(404).json({ error: 'DLQ job not found' });
    }

    if (job.status === 'resolved') {
      return res.status(400).json({
        error: 'Job already resolved',
        message: 'This DLQ job has already been successfully resolved'
      });
    }

    if (job.error_code !== 'ARCHIVE_PASSWORD_REQUIRED' && job.error_code !== 'INVALID_PASSWORD') {
      return res.status(400).json({
        error: 'Password not applicable',
        message: `This DLQ job failed due to: ${job.error_code}, not a password issue`
      });
    }

    const originalPayload = typeof job.original_payload === 'string'
      ? JSON.parse(job.original_payload)
      : job.original_payload;

    if (!originalPayload.archiveFilePath || !originalPayload.archiveFileId) {
      return res.status(400).json({
        error: 'Invalid job payload',
        message: 'Job payload does not contain required archive information'
      });
    }

    originalPayload.password = password;

    const ArchiveExtractionService = require('../services/archiveExtractionService');
    const virusScanService = require('../services/VirusScanService');
    const archiveExtractionService = new ArchiveExtractionService(
      pool,
      virusScanService,
      systemLogger
    );

    try {
      const result = await archiveExtractionService.extractArchive(
        originalPayload.archiveFilePath,
        originalPayload.archiveFileId,
        password,
        req.user?.id
      );

      await dlqService.updateDLQJobStatus(dlqJobId, 'resolved', true);

      systemLogger.info('DLQ job resolved with provided password', {
        dlqJobId,
        archiveFileId: originalPayload.archiveFileId,
        extractedCount: result.extractedCount,
        userId: req.user?.id
      });

      res.json({
        success: true,
        message: 'Archive extraction succeeded with provided password',
        extractedCount: result.extractedCount,
        files: result.files
      });

    } catch (retryError) {
      if (retryError.message && retryError.message.includes('password')) {
        return res.status(400).json({
          error: 'Incorrect password',
          message: 'The provided password is incorrect. Please try again.',
          details: retryError.message
        });
      }

      await dlqService.updateDLQJobStatus(dlqJobId, 'failed', true);

      systemLogger.error('DLQ job retry with password failed', {
        dlqJobId,
        error: retryError.message,
        userId: req.user?.id
      });

      res.status(500).json({
        error: 'Archive extraction failed',
        details: retryError.message
      });
    }

  } catch (error) {
    systemLogger.error('Error providing password for DLQ job', {
      dlqJobId: req.params.id,
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({
      error: 'Failed to provide password for DLQ job',
      details: error.message
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const dlqJobId = parseInt(req.params.id);

    if (isNaN(dlqJobId)) {
      return res.status(400).json({ error: 'Invalid DLQ job ID' });
    }

    const deleted = await dlqService.deleteDLQJob(dlqJobId);

    if (!deleted) {
      return res.status(404).json({ error: 'DLQ job not found' });
    }

    systemLogger.info('DLQ job deleted', {
      dlqJobId,
      userId: req.user?.id
    });

    res.json({
      success: true,
      message: 'DLQ job deleted successfully'
    });

  } catch (error) {
    systemLogger.error('Error deleting DLQ job', {
      dlqJobId: req.params.id,
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({
      error: 'Failed to delete DLQ job',
      details: error.message
    });
  }
});

module.exports = router;
