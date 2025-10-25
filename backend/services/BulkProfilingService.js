/**
 * Bulk Profiling Service
 * Handles S3 file discovery and bulk profiling orchestration
 */

const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
const pool = require('../config/database');
const { systemLogger } = require('../utils/logger');
const connectionService = require('./ConnectionService');
const path = require('path');

class BulkProfilingService {
  /**
   * Discover files from S3 bucket based on path and pattern
   */
  async discoverFiles(connectionId, s3Path, filePattern = '*', recursive = false) {
    try {
      // Get connection details
      const connection = await connectionService.getConnectionById(connectionId);
      
      if (!connection) {
        throw new Error(`Connection ${connectionId} not found`);
      }
      
      if (connection.type !== 'aws') {
        throw new Error(`Connection type ${connection.type} not supported. Only AWS S3 is supported`);
      }
      
      // Decrypt connection config
      const config = connectionService.decryptSensitiveFields(connection.type, connection.config);
      
      // Parse S3 path (format: s3://bucket/prefix or just /prefix)
      let bucketName = config.bucket_name;
      let prefix = '';
      
      if (s3Path.startsWith('s3://')) {
        const pathParts = s3Path.replace('s3://', '').split('/');
        bucketName = pathParts[0];
        prefix = pathParts.slice(1).join('/');
      } else {
        prefix = s3Path.replace(/^\//, ''); // Remove leading slash
      }
      
      // Ensure prefix ends with / if not empty
      if (prefix && !prefix.endsWith('/')) {
        prefix += '/';
      }
      
      // Configure AWS S3
      const s3 = new AWS.S3({
        accessKeyId: config.access_key,
        secretAccessKey: config.secret_key,
        region: config.region
      });
      
      // List objects from S3
      const params = {
        Bucket: bucketName,
        Prefix: prefix,
        MaxKeys: 1000
      };
      
      if (!recursive) {
        params.Delimiter = '/'; // Only list files at this level
      }
      
      const data = await s3.listObjectsV2(params).promise();
      
      // Filter files by pattern and compatible types
      const compatibleExtensions = ['.csv', '.json', '.parquet', '.xlsx', '.xml'];
      const files = [];
      
      for (const item of data.Contents || []) {
        // Skip directories (keys ending with /)
        if (item.Key.endsWith('/')) continue;
        
        const fileName = path.basename(item.Key);
        const fileExt = path.extname(fileName).toLowerCase();
        
        // Check if file matches pattern
        if (!this.matchesPattern(fileName, filePattern)) continue;
        
        // Check if file type is compatible
        if (!compatibleExtensions.includes(fileExt)) continue;
        
        files.push({
          path: `s3://${bucketName}/${item.Key}`,
          name: fileName,
          size: item.Size,
          type: fileExt.replace('.', ''),
          lastModified: item.LastModified
        });
      }
      
      systemLogger.info('Discovered files from S3', { 
        count: files.length, 
        path: s3Path,
        pattern: filePattern
      });
      
      return files;
      
    } catch (error) {
      systemLogger.error('Error discovering files from S3', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Check if filename matches pattern (supports * wildcard)
   */
  matchesPattern(filename, pattern) {
    if (pattern === '*') return true;
    
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(filename);
  }
  
  /**
   * Create a new bulk profiling job
   */
  async createJob(jobData) {
    try {
      const jobId = uuidv4();
      
      const query = `
        INSERT INTO bulk_profiling_jobs (
          id, job_name, project_id, connection_id, s3_path, file_pattern,
          duplicate_handling, recursive, status, execution_type, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        RETURNING *
      `;
      
      const values = [
        jobId,
        jobData.jobName || `Bulk Profiling ${new Date().toISOString()}`,
        jobData.projectId,
        jobData.connectionId,
        jobData.s3Path,
        jobData.filePattern || '*',
        jobData.duplicateHandling || 'skip',
        jobData.recursive || false,
        'pending',
        jobData.executionType || 'manual',
        jobData.createdBy
      ];
      
      const result = await pool.query(query, values);
      systemLogger.info('Created bulk profiling job', { jobId });
      
      return result.rows[0];
      
    } catch (error) {
      systemLogger.error('Error creating bulk profiling job', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Add discovered files to job
   */
  async addFilesToJob(jobId, files) {
    try {
      if (files.length === 0) return;
      
      const values = [];
      const placeholders = [];
      
      files.forEach((file, index) => {
        const baseIndex = index * 6;
        placeholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`
        );
        values.push(
          jobId,
          file.path,
          file.name,
          file.size,
          file.type,
          'pending'
        );
      });
      
      const query = `
        INSERT INTO bulk_profiling_files (
          job_id, file_path, file_name, file_size, file_type, status
        ) VALUES ${placeholders.join(', ')}
      `;
      
      await pool.query(query, values);
      
      // Update job total_files count
      await pool.query(
        'UPDATE bulk_profiling_jobs SET total_files = $1, updated_at = NOW() WHERE id = $2',
        [files.length, jobId]
      );
      
      systemLogger.info('Added files to bulk profiling job', { jobId, fileCount: files.length });
      
    } catch (error) {
      systemLogger.error('Error adding files to job', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Get job details with file list
   */
  async getJob(jobId) {
    try {
      const jobQuery = `
        SELECT bpj.*, u.username as created_by_username
        FROM bulk_profiling_jobs bpj
        LEFT JOIN users u ON bpj.created_by = u.id
        WHERE bpj.id = $1
      `;
      
      const jobResult = await pool.query(jobQuery, [jobId]);
      
      if (jobResult.rows.length === 0) {
        return null;
      }
      
      const job = jobResult.rows[0];
      
      // Get files for this job
      const filesQuery = `
        SELECT * FROM bulk_profiling_files
        WHERE job_id = $1
        ORDER BY created_at ASC
      `;
      
      const filesResult = await pool.query(filesQuery, [jobId]);
      job.files = filesResult.rows;
      
      return job;
      
    } catch (error) {
      systemLogger.error('Error getting bulk profiling job', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Get all jobs (with optional filters)
   */
  async getAllJobs(filters = {}) {
    try {
      let query = `
        SELECT bpj.*, u.username as created_by_username
        FROM bulk_profiling_jobs bpj
        LEFT JOIN users u ON bpj.created_by = u.id
        WHERE 1=1
      `;
      const params = [];
      
      if (filters.status) {
        params.push(filters.status);
        query += ` AND bpj.status = $${params.length}`;
      }
      
      if (filters.projectId) {
        params.push(filters.projectId);
        query += ` AND bpj.project_id = $${params.length}`;
      }
      
      if (filters.createdBy) {
        params.push(filters.createdBy);
        query += ` AND bpj.created_by = $${params.length}`;
      }
      
      query += ' ORDER BY bpj.created_at DESC';
      
      if (filters.limit) {
        query += ` LIMIT ${parseInt(filters.limit)}`;
      }
      
      const result = await pool.query(query, params);
      return result.rows;
      
    } catch (error) {
      systemLogger.error('Error getting bulk profiling jobs', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Update job status
   */
  async updateJobStatus(jobId, status, errorMessage = null) {
    try {
      const updates = ['status = $1', 'updated_at = NOW()'];
      const params = [status];
      
      if (status === 'running') {
        updates.push('started_at = NOW()');
      } else if (status === 'completed' || status === 'failed') {
        updates.push('completed_at = NOW()');
      }
      
      if (errorMessage) {
        params.push(errorMessage);
        updates.push(`error_message = $${params.length}`);
      }
      
      params.push(jobId);
      const query = `
        UPDATE bulk_profiling_jobs
        SET ${updates.join(', ')}
        WHERE id = $${params.length}
      `;
      
      await pool.query(query, params);
      systemLogger.info('Updated job status', { jobId, status });
      
    } catch (error) {
      systemLogger.error('Error updating job status', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Update file status
   */
  async updateFileStatus(jobId, filePath, status, fileId = null, errorMessage = null) {
    try {
      const updates = ['status = $1', 'updated_at = NOW()'];
      const params = [status, jobId, filePath];
      
      if (status === 'processing') {
        updates.push('started_at = NOW()');
      } else if (status === 'completed' || status === 'failed') {
        updates.push('completed_at = NOW()');
      }
      
      if (fileId) {
        params.push(fileId);
        updates.push(`file_id = $${params.length}`);
      }
      
      if (errorMessage) {
        params.push(errorMessage);
        updates.push(`error_message = $${params.length}`);
      }
      
      const query = `
        UPDATE bulk_profiling_files
        SET ${updates.join(', ')}
        WHERE job_id = $2 AND file_path = $3
      `;
      
      await pool.query(query, params);
      
    } catch (error) {
      systemLogger.error('Error updating file status', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Update job progress counters
   */
  async updateJobProgress(jobId) {
    try {
      const query = `
        UPDATE bulk_profiling_jobs
        SET 
          processed_files = (SELECT COUNT(*) FROM bulk_profiling_files WHERE job_id = $1 AND status IN ('completed', 'failed', 'skipped')),
          successful_files = (SELECT COUNT(*) FROM bulk_profiling_files WHERE job_id = $1 AND status = 'completed'),
          failed_files = (SELECT COUNT(*) FROM bulk_profiling_files WHERE job_id = $1 AND status = 'failed'),
          updated_at = NOW()
        WHERE id = $1
      `;
      
      await pool.query(query, [jobId]);
      
    } catch (error) {
      systemLogger.error('Error updating job progress', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Start bulk profiling job - orchestrates the processing of all files
   */
  async startBulkProfiling(jobId, userId) {
    try {
      const job = await this.getJob(jobId);
      
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }
      
      if (job.status !== 'pending') {
        // Don't mark as failed if already running - this is a benign double-start
        if (job.status === 'running') {
          systemLogger.info('Job already running, ignoring duplicate start request', { jobId });
          return { message: 'Job is already running', jobId };
        }
        throw new Error(`Job ${jobId} is not in pending status. Current status: ${job.status}`);
      }
      
      // Update job status to running
      await this.updateJobStatus(jobId, 'running');
      
      systemLogger.info('Starting bulk profiling job', { jobId, totalFiles: job.files.length });
      
      // Process files asynchronously (don't await - let it run in background)
      this._processFilesAsync(jobId, job, userId).catch(error => {
        systemLogger.error('Error in async file processing', { jobId, error: error.message });
        this.updateJobStatus(jobId, 'failed', error.message);
      });
      
      return { message: 'Bulk profiling job started', jobId };
      
    } catch (error) {
      systemLogger.error('Error starting bulk profiling', { jobId, error: error.message });
      // Only mark as failed if we haven't already started running
      const currentJob = await this.getJob(jobId);
      if (currentJob && currentJob.status === 'pending') {
        await this.updateJobStatus(jobId, 'failed', error.message);
      }
      throw error;
    }
  }
  
  /**
   * Process files asynchronously (internal method)
   */
  async _processFilesAsync(jobId, job, userId) {
    try {
      const connection = await connectionService.getConnectionById(job.connection_id);
      if (!connection) {
        throw new Error('Connection not found');
      }
      
      const config = connectionService.decryptSensitiveFields(connection.type, connection.config);
      
      // Configure AWS S3
      const s3 = new AWS.S3({
        accessKeyId: config.access_key,
        secretAccessKey: config.secret_key,
        region: config.region
      });
      
      const bucketName = config.bucket_name;
      
      // Process files one by one or in small batches
      for (const file of job.files) {
        try {
          await this.updateFileStatus(jobId, file.file_path, 'processing');
          
          // Check for duplicates if needed
          if (job.duplicate_handling === 'skip') {
            const existingFile = await this._checkFileExists(file.file_name, job.project_id);
            if (existingFile) {
              systemLogger.info('Skipping duplicate file', { jobId, fileName: file.file_name });
              await this.updateFileStatus(jobId, file.file_path, 'skipped', null, 'File already exists');
              await this.updateJobProgress(jobId);
              continue;
            }
          }
          
          // Download file from S3 to temp location
          const tempFilePath = `/tmp/bulk_profiling_${jobId}_${Date.now()}_${file.file_name}`;
          // Extract S3 key from path (convert s3://bucket/key to just key)
          const s3Key = this._extractS3Key(file.file_path);
          await this._downloadFileFromS3(s3, bucketName, s3Key, tempFilePath);
          
          // TODO: Trigger file profiling
          // This would integrate with the existing file upload/profiling pipeline
          // For now, we'll mark as completed
          systemLogger.info('File downloaded successfully', { jobId, fileName: file.file_name });
          
          await this.updateFileStatus(jobId, file.file_path, 'completed', null, null);
          await this.updateJobProgress(jobId);
          
          // Clean up temp file
          const fs = require('fs');
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
          
        } catch (fileError) {
          systemLogger.error('Error processing file', { 
            jobId, 
            fileName: file.file_name, 
            error: fileError.message 
          });
          await this.updateFileStatus(jobId, file.file_path, 'failed', null, fileError.message);
          await this.updateJobProgress(jobId);
        }
      }
      
      // Mark job as completed
      await this.updateJobStatus(jobId, 'completed');
      systemLogger.info('Bulk profiling job completed', { jobId });
      
    } catch (error) {
      systemLogger.error('Fatal error in file processing', { jobId, error: error.message });
      await this.updateJobStatus(jobId, 'failed', error.message);
      throw error;
    }
  }
  
  /**
   * Extract S3 key from s3://bucket/key or /key format
   */
  _extractS3Key(filePath) {
    if (filePath.startsWith('s3://')) {
      // Format: s3://bucket/path/to/file.ext
      const parts = filePath.replace('s3://', '').split('/');
      // Remove bucket name and return the rest
      return parts.slice(1).join('/');
    }
    // Already just a key or path
    return filePath.replace(/^\//, ''); // Remove leading slash if present
  }
  
  /**
   * Download file from S3
   */
  async _downloadFileFromS3(s3, bucket, key, destPath) {
    const fs = require('fs');
    const stream = require('stream');
    const util = require('util');
    const pipeline = util.promisify(stream.pipeline);
    
    const s3Stream = s3.getObject({ Bucket: bucket, Key: key }).createReadStream();
    const fileStream = fs.createWriteStream(destPath);
    
    await pipeline(s3Stream, fileStream);
  }
  
  /**
   * Check if file already exists in catalog
   */
  async _checkFileExists(filename, projectId) {
    try {
      const result = await pool.query(
        'SELECT id, file_id FROM files WHERE filename = $1 AND project_id = $2 LIMIT 1',
        [filename, projectId]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      systemLogger.error('Error checking file existence', { error: error.message });
      return null;
    }
  }
}

module.exports = new BulkProfilingService();
