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
const authenticate = require('../middleware/authenticate');
const UploadBatchService = require('../services/UploadBatchService');
const FileService = require('../services/FileService');
const BatchRecordProcessor = require('../services/BatchRecordProcessor');
const { systemLogger } = require('../utils/logger');
const { query } = require('../config/database');

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
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
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
 */
router.post('/vendor/:agreementId', 
  authenticate,
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

      // Create batch
      const batch = await uploadBatchService.createBatch({
        userId: req.user.id,
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

      // Start async processing
      setImmediate(async () => {
        try {
          await processUploadedFile(uploadFile, uploadedFile.path, {
            userId: req.user.id,
            projectId: agreement.project_id,
            agreementId: parseInt(agreementId),
            triggerETL: triggerETL === 'true' || triggerETL === true
          });
        } catch (error) {
          systemLogger.error('File processing failed', {
            fileId: uploadFile.file_id,
            error: error.message
          });
        }
      });

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
  authenticate,
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

      // Create batch
      const batch = await uploadBatchService.createBatch({
        userId: req.user.id,
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

      // Start async processing
      setImmediate(async () => {
        try {
          await processUploadedFile(uploadFile, uploadedFile.path, {
            userId: req.user.id,
            projectId: parseInt(projectId),
            governanceTags: governanceTags ? JSON.parse(governanceTags) : [],
            triggerETL: triggerETL === 'true' || triggerETL === true
          });
        } catch (error) {
          systemLogger.error('File processing failed', {
            fileId: uploadFile.file_id,
            error: error.message
          });
        }
      });

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
  authenticate,
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

      // Create batch
      const batch = await uploadBatchService.createBatch({
        userId: req.user.id,
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

        // Start async processing
        setImmediate(async () => {
          try {
            await processUploadedFile(uploadFile, uploadedFile.path, {
              userId: req.user.id,
              projectId: projectId,
              agreementId: fileManifest.targetType === 'vendor' ? fileManifest.targetId : null,
              governanceTags: fileManifest.governanceTags || [],
              triggerETL: fileManifest.triggerETL || false
            });
          } catch (error) {
            systemLogger.error('Bulk file processing failed', {
              fileId: uploadFile.file_id,
              error: error.message
            });
          }
        });
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
router.get('/batch/:batchId', authenticate, async (req, res) => {
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
router.get('/:fileId/status', authenticate, async (req, res) => {
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

/**
 * Async file processing function
 * Handles virus scan, cloud upload, governance tagging, and ETL triggering
 */
async function processUploadedFile(uploadFile, filePath, options) {
  try {
    const { userId, projectId, agreementId, governanceTags, triggerETL } = options;

    // Update status to processing
    await uploadBatchService.updateFileStatus(uploadFile.file_id, {
      status: 'processing',
      phase: 'virus_scanning'
    });

    // Virus scan
    const scanResult = await virusScanService.scanFile(filePath);

    await uploadBatchService.updateFileStatus(uploadFile.file_id, {
      virusScanStatus: scanResult.isClean ? 'clean' : 'infected',
      virusScanResult: scanResult.isClean ? 'No threats detected' : scanResult.threats.join(', ')
    });

    if (!scanResult.isClean) {
      await uploadBatchService.updateFileStatus(uploadFile.file_id, {
        status: 'failed',
        errorMessage: `Virus detected: ${scanResult.threats.join(', ')}`
      });
      fs.unlinkSync(filePath);
      return;
    }

    // Process file with batch record processor
    await uploadBatchService.updateFileStatus(uploadFile.file_id, {
      phase: 'processing_records'
    });

    const processingResult = await batchRecordProcessor.processFile(uploadFile, filePath, {
      userId,
      projectId,
      agreementId,
      governanceTags,
      triggerETL
    });

    // Mark as completed
    await uploadBatchService.updateFileStatus(uploadFile.file_id, {
      status: 'completed',
      phase: 'completed',
      totalRecords: processingResult.totalRecords,
      processedRecords: processingResult.processedRecords
    });

    systemLogger.info('File processing completed', {
      fileId: uploadFile.file_id,
      filename: uploadFile.original_filename,
      totalRecords: processingResult.totalRecords,
      processedRecords: processingResult.processedRecords
    });

    // TODO: Phase 2 enhancements
    // - Cloud storage upload
    // - File catalog registration
    // - ETL job triggering
  } catch (error) {
    systemLogger.error('File processing error', {
      fileId: uploadFile.file_id,
      error: error.message,
      stack: error.stack
    });

    await uploadBatchService.updateFileStatus(uploadFile.file_id, {
      status: 'failed',
      errorMessage: error.message,
      errorDetails: { stack: error.stack }
    });
  }
}

module.exports = router;
