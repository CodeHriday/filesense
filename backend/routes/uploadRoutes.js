/**
 * Programmatic Upload API Routes
 * 
 * Endpoints for vendor and internal file uploads with bulk support
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authenticateAPIToken, requireScope } = require('../middleware/apiTokenAuth');
const UploadBatchService = require('../services/UploadBatchService');
const FileService = require('../services/FileService');
const BatchRecordProcessor = require('../services/BatchRecordProcessor');
const { systemLogger } = require('../utils/logger');
const { query } = require('../config/database');
const { getUploadQueue } = require('../queues/uploadQueue');
const uploadProcessor = require('../services/UploadProcessor');

// Initialize services
const uploadBatchService = new UploadBatchService();
const fileService = new FileService(null, systemLogger);
const virusScanService = require('../services/VirusScanService');
const batchRecordProcessor = new BatchRecordProcessor();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'programmatic');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(4).toString('hex');
    const uniqueSuffix = `${timestamp}-${randomBytes}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB max file size
    files: 50 // Max 50 files per request
  }
});

/**
 * POST /api/uploads/vendor/:agreementId
 * Upload single file to vendor agreement
 * Requires API token with 'vendor_agreements:upload' scope
 */
router.post('/vendor/:agreementId', 
  authenticateAPIToken,
  requireScope('vendor_agreements:upload'),
  upload.single('file'),
  async (req, res) => {
    try {
      const { agreementId } = req.params;
      const { triggerETL } = req.body;
      const uploadedFile = req.file;

      if (!uploadedFile) {
        return res.status(400).json({ error: 'No file provided' });
      }

      // Verify vendor agreement exists and user has access
      const agreementResult = await query(
        `SELECT va.*, p.id as project_id 
         FROM vendor_agreements va
         JOIN projects p ON va.project_id = p.id
         WHERE va.id = $1`,
        [agreementId]
      );

      if (agreementResult.rows.length === 0) {
        fs.unlinkSync(uploadedFile.path); // Clean up
        return res.status(404).json({ error: 'Vendor agreement not found' });
      }

      const agreement = agreementResult.rows[0];

      // Verify token project association
      if (req.apiToken.project_id && req.apiToken.project_id !== agreement.project_id) {
        fs.unlinkSync(uploadedFile.path);
        return res.status(403).json({ 
          error: 'Token not authorized for this project',
          message: `API token is scoped to project ${req.apiToken.project_id} but vendor agreement belongs to project ${agreement.project_id}`
        });
      }

      // Create batch
      const batch = await uploadBatchService.createBatch({
        userId: req.apiToken.user_id,
        apiTokenId: req.apiToken.id,
        projectId: agreement.project_id,
        targetType: 'vendor',
        targetId: parseInt(agreementId),
        totalFiles: 1
      });

      // Add file to batch
      const uploadFile = await uploadBatchService.addFileToBatch({
        batchId: batch.batch_id,
        originalFilename: uploadedFile.originalname,
        fileType: path.extname(uploadedFile.originalname).substring(1),
        fileSizeBytes: uploadedFile.size,
        mimeType: uploadedFile.mimetype,
        targetType: 'vendor',
        targetId: parseInt(agreementId)
      });

      // Queue async processing with BullMQ (fallback to sync if Redis unavailable)
      try {
        const queue = getUploadQueue();
        await queue.add('process-upload', {
          uploadFile,
          filePath: uploadedFile.path,
          options: {
            userId: req.apiToken.user_id,
            projectId: agreement.project_id,
            agreementId: parseInt(agreementId),
            triggerETL: triggerETL === 'true' || triggerETL === true
          }
        }, {
          jobId: `upload-${uploadFile.file_id}`,
          priority: 1
        });
      } catch (queueError) {
        systemLogger.warn('Queue unavailable, processing synchronously', {
          fileId: uploadFile.file_id,
          error: queueError.message
        });
        setImmediate(async () => {
          try {
            await uploadProcessor.processUploadFile(uploadFile, uploadedFile.path, {
              userId: req.apiToken.user_id,
              projectId: agreement.project_id,
              agreementId: parseInt(agreementId),
              triggerETL: triggerETL === 'true' || triggerETL === true
            });
          } catch (error) {
            systemLogger.error('Sync file processing failed', {
              fileId: uploadFile.file_id,
              error: error.message
            });
          }
        });
      }

      res.status(202).json({
        message: 'File upload accepted for processing',
        batchId: batch.batch_id,
        fileId: uploadFile.file_id,
        status: 'pending',
        nextStep: `Poll /api/uploads/${uploadFile.file_id}/status for progress`
      });
    } catch (error) {
      systemLogger.error('Vendor upload failed', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: 'Upload failed', details: error.message });
    }
  }
);

/**
 * POST /api/uploads/internal/:projectId
 * Upload single file to internal project
 */
router.post('/internal/:projectId',
  authenticateAPIToken,
  requireScope('projects:upload'),
  upload.single('file'),
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const { triggerETL, governanceTags } = req.body;
      const uploadedFile = req.file;

      if (!uploadedFile) {
        return res.status(400).json({ error: 'No file provided' });
      }

      // Verify project exists and user has access
      const projectResult = await query(
        'SELECT * FROM projects WHERE id = $1',
        [projectId]
      );

      if (projectResult.rows.length === 0) {
        fs.unlinkSync(uploadedFile.path);
        return res.status(404).json({ error: 'Project not found' });
      }

      // Verify token project association
      if (req.apiToken.project_id && req.apiToken.project_id !== parseInt(projectId)) {
        fs.unlinkSync(uploadedFile.path);
        return res.status(403).json({ 
          error: 'Token not authorized for this project',
          message: `API token is scoped to project ${req.apiToken.project_id} but upload targets project ${projectId}`
        });
      }

      // Create batch
      const batch = await uploadBatchService.createBatch({
        userId: req.apiToken.user_id,
        apiTokenId: req.apiToken.id,
        projectId: parseInt(projectId),
        targetType: 'internal',
        targetId: parseInt(projectId),
        totalFiles: 1
      });

      // Add file to batch
      const uploadFile = await uploadBatchService.addFileToBatch({
        batchId: batch.batch_id,
        originalFilename: uploadedFile.originalname,
        fileType: path.extname(uploadedFile.originalname).substring(1),
        fileSizeBytes: uploadedFile.size,
        mimeType: uploadedFile.mimetype,
        targetType: 'internal',
        targetId: parseInt(projectId)
      });

      // Queue async processing with BullMQ (fallback to sync if Redis unavailable)
      try {
        const queue = getUploadQueue();
        await queue.add('process-upload', {
          uploadFile,
          filePath: uploadedFile.path,
          options: {
            userId: req.apiToken.user_id,
            projectId: parseInt(projectId),
            governanceTags: governanceTags ? JSON.parse(governanceTags) : [],
            triggerETL: triggerETL === 'true' || triggerETL === true
          }
        }, {
          jobId: `upload-${uploadFile.file_id}`,
          priority: 1
        });
      } catch (queueError) {
        systemLogger.warn('Queue unavailable, processing synchronously', {
          fileId: uploadFile.file_id,
          error: queueError.message
        });
        setImmediate(async () => {
          try {
            await uploadProcessor.processUploadFile(uploadFile, uploadedFile.path, {
              userId: req.apiToken.user_id,
              projectId: parseInt(projectId),
              governanceTags: governanceTags ? JSON.parse(governanceTags) : [],
              triggerETL: triggerETL === 'true' || triggerETL === true
            });
          } catch (error) {
            systemLogger.error('Sync file processing failed', {
              fileId: uploadFile.file_id,
              error: error.message
            });
          }
        });
      }

      res.status(202).json({
        message: 'File upload accepted for processing',
        batchId: batch.batch_id,
        fileId: uploadFile.file_id,
        status: 'pending',
        nextStep: `Poll /api/uploads/${uploadFile.file_id}/status for progress`
      });
    } catch (error) {
      systemLogger.error('Internal upload failed', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: 'Upload failed', details: error.message });
    }
  }
);

/**
 * POST /api/uploads/bulk
 * Bulk upload multiple files with manifest
 */
router.post('/bulk',
  authenticateAPIToken,
  requireScope('bulk:upload'),
  upload.array('files', 50),
  async (req, res) => {
    try {
      const uploadedFiles = req.files;
      const { manifest } = req.body;

      if (!uploadedFiles || uploadedFiles.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }

      if (!manifest) {
        return res.status(400).json({ error: 'Manifest required for bulk upload' });
      }

      const manifestData = JSON.parse(manifest);

      if (!manifestData.files || !Array.isArray(manifestData.files)) {
        return res.status(400).json({ error: 'Invalid manifest format' });
      }

      // Validate manifest file count matches uploaded files
      if (manifestData.files.length !== uploadedFiles.length) {
        return res.status(400).json({ 
          error: 'Manifest file count does not match uploaded files',
          expected: manifestData.files.length,
          received: uploadedFiles.length
        });
      }

      // Get project ID (from first file in manifest)
      const firstFileManifest = manifestData.files[0];
      const projectId = firstFileManifest.targetType === 'vendor'
        ? (await query('SELECT project_id FROM vendor_agreements WHERE id = $1', [firstFileManifest.targetId])).rows[0]?.project_id
        : firstFileManifest.targetId;

      if (!projectId) {
        return res.status(400).json({ error: 'Invalid target project' });
      }

      // Verify token project association
      if (req.apiToken.project_id && req.apiToken.project_id !== projectId) {
        return res.status(403).json({ 
          error: 'Token not authorized for this project',
          message: `API token is scoped to project ${req.apiToken.project_id} but bulk upload targets project ${projectId}`
        });
      }

      // Create batch
      const batch = await uploadBatchService.createBatch({
        userId: req.apiToken.user_id,
        apiTokenId: req.apiToken.id,
        projectId: projectId,
        targetType: 'bulk',
        targetId: null,
        totalFiles: uploadedFiles.length
      });

      const fileResults = [];

      // Process each file
      for (let i = 0; i < uploadedFiles.length; i++) {
        const uploadedFile = uploadedFiles[i];
        const fileManifest = manifestData.files[i];

        const uploadFile = await uploadBatchService.addFileToBatch({
          batchId: batch.batch_id,
          originalFilename: uploadedFile.originalname,
          fileType: path.extname(uploadedFile.originalname).substring(1),
          fileSizeBytes: uploadedFile.size,
          mimeType: uploadedFile.mimetype,
          targetType: fileManifest.targetType,
          targetId: fileManifest.targetId
        });

        fileResults.push({
          clientName: uploadedFile.originalname,
          fileId: uploadFile.file_id,
          status: 'pending'
        });

        // Queue async processing with BullMQ (fallback to sync if Redis unavailable)
        try {
          const queue = getUploadQueue();
          await queue.add('process-upload', {
            uploadFile,
            filePath: uploadedFile.path,
            options: {
              userId: req.apiToken.user_id,
              projectId: projectId,
              agreementId: fileManifest.targetType === 'vendor' ? fileManifest.targetId : null,
              governanceTags: fileManifest.governanceTags || [],
              triggerETL: fileManifest.triggerETL || false
            }
          }, {
            jobId: `upload-${uploadFile.file_id}`,
            priority: fileManifest.priority || 5
          });
        } catch (queueError) {
          systemLogger.warn('Queue unavailable, processing synchronously', {
            fileId: uploadFile.file_id,
            error: queueError.message
          });
          setImmediate(async () => {
            try {
              await uploadProcessor.processUploadFile(uploadFile, uploadedFile.path, {
                userId: req.apiToken.user_id,
                projectId: projectId,
                agreementId: fileManifest.targetType === 'vendor' ? fileManifest.targetId : null,
                governanceTags: fileManifest.governanceTags || [],
                triggerETL: fileManifest.triggerETL || false
              });
            } catch (error) {
              systemLogger.error('Sync file processing failed', {
                fileId: uploadFile.file_id,
                error: error.message
              });
            }
          });
        }
      }

      res.status(202).json({
        message: 'Bulk upload accepted for processing',
        batchId: batch.batch_id,
        files: fileResults,
        nextStep: `Poll /api/uploads/batch/${batch.batch_id} for progress`
      });
    } catch (error) {
      systemLogger.error('Bulk upload failed', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: 'Bulk upload failed', details: error.message });
    }
  }
);

/**
 * GET /api/uploads/batch/:batchId
 * Get batch status with file details
 */
router.get('/batch/:batchId', authenticateAPIToken, async (req, res) => {
  try {
    const { batchId } = req.params;
    const batchStatus = await uploadBatchService.getBatchStatus(batchId);

    res.json(batchStatus);
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    systemLogger.error('Get batch status failed', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to get batch status' });
  }
});

/**
 * GET /api/uploads/:fileId/status
 * Get individual file status
 */
router.get('/:fileId/status', authenticateAPIToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const fileStatus = await uploadBatchService.getFileStatus(fileId);

    res.json(fileStatus);
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    systemLogger.error('Get file status failed', {
      error: error.message
    });
    res.status(500).json({ error: 'Failed to get file status' });
  }
});

module.exports = router;
