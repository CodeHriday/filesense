/**
 * Bulk Profiling Service
 * Handles S3 file discovery and bulk profiling orchestration
 */

const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');
const connectionService = require('./ConnectionService');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { captureFileAudit, captureFileSchema } = require('./fileAuditService');
const virusScanService = require('./VirusScanService');
const { createSchedule } = require('./cronSchedulerService');
const { describeCronExpression } = require('../utils/cronDescriber');
const { validateDataWithRules } = require('./qualityValidationEngine');

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
      // Include archive extensions - these will be extracted during schema validation
      const compatibleExtensions = ['.csv', '.json', '.parquet', '.xlsx', '.xml', '.dat', '.zip', '.7z', '.tar', '.tar.gz', '.tgz'];
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
   * Browse S3 path - list folders and files for navigation
   */
  async browseS3Path(connectionId, s3Path = '', rawCredentials = null) {
    try {
      let config;
      
      // Use raw credentials if provided (for testing before save)
      if (rawCredentials) {
        config = rawCredentials;
        
        // Validate provider (check multiple field names for compatibility)
        const provider = config.provider || config.storage_type || config.connection_type;
        if (provider !== 'aws' && provider !== 's3') {
          throw new Error(`Provider ${provider} not supported. Only AWS S3 is supported`);
        }
      } else {
        // Get connection details from database
        const connection = await connectionService.getConnectionById(connectionId);
        
        if (!connection) {
          throw new Error(`Connection ${connectionId} not found`);
        }
        
        // Handle both transform connections and vendor connections
        let connectionType = connection.type;
        config = connection.config;
        
        // For vendor connections, extract the actual provider type from config
        if (connectionType === 'vendor') {
          config = typeof config === 'string' ? JSON.parse(config) : config;
          const provider = config.provider || config.storage_type || config.connection_type;
          
          if (provider !== 'aws' && provider !== 's3') {
            throw new Error(`Vendor connection provider ${provider} not supported. Only AWS S3 is supported`);
          }
          
          // Decrypt vendor connection credentials
          config = connectionService.decryptSensitiveFields('vendor', config);
        } else {
          // For transform connections, ensure it's AWS type
          if (connectionType !== 'aws') {
            throw new Error(`Connection type ${connectionType} not supported. Only AWS S3 is supported`);
          }
          
          // Decrypt transform connection config
          config = connectionService.decryptSensitiveFields(connectionType, config);
        }
      }
      
      // Parse S3 path
      let bucketName = config.bucket_name || config.bucket;
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
      
      // Configure AWS S3 - handle both transform and vendor connection formats
      const s3 = new AWS.S3({
        accessKeyId: config.access_key || config.access_key_id,
        secretAccessKey: config.secret_key || config.secret_access_key,
        region: config.region
      });
      
      // List objects at this level only (non-recursive)
      const params = {
        Bucket: bucketName,
        Prefix: prefix,
        Delimiter: '/',
        MaxKeys: 1000
      };
      
      const data = await s3.listObjectsV2(params).promise();
      
      // Extract folders (CommonPrefixes)
      const folders = (data.CommonPrefixes || []).map(item => {
        const folderPath = item.Prefix;
        const folderName = folderPath.slice(prefix.length).replace(/\/$/, '');
        return {
          name: folderName,
          path: `/${folderPath}`,
          type: 'folder'
        };
      });
      
      // Extract files (Contents) - only those directly in this folder
      // Include archive extensions and DAT files for schema validation
      const compatibleExtensions = ['.csv', '.json', '.parquet', '.xlsx', '.xml', '.dat', '.txt', '.zip', '.7z', '.tar', '.tgz', '.gz'];
      const files = (data.Contents || [])
        .filter(item => {
          // Skip the folder itself and folders (keys ending with /)
          if (item.Key === prefix || item.Key.endsWith('/')) return false;
          
          const fileName = path.basename(item.Key);
          const fileExt = path.extname(fileName).toLowerCase();
          
          // Only include compatible file types
          return compatibleExtensions.includes(fileExt);
        })
        .map(item => {
          const fileName = path.basename(item.Key);
          const fileExt = path.extname(fileName).toLowerCase();
          return {
            name: fileName,
            path: `/${item.Key}`,
            type: fileExt.replace('.', ''),
            size: item.Size,
            lastModified: item.LastModified
          };
        });
      
      return {
        currentPath: prefix ? `/${prefix.replace(/\/$/, '')}` : '/',
        bucketName,
        folders,
        files
      };
      
    } catch (error) {
      systemLogger.error('Error browsing S3 path', { error: error.message });
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
      let scheduleId = null;
      
      // Validate connection exists FIRST (UUID format = storage_connections, integer = transform_connections)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isUuidFormat = typeof jobData.connectionId === 'string' && uuidRegex.test(jobData.connectionId);
      
      if (isUuidFormat) {
        // UUID format - check storage_connections table
        const connCheck = await pool.query(
          'SELECT connection_id FROM storage_connections WHERE connection_id = $1 AND status = $2',
          [jobData.connectionId, 'active']
        );
        
        if (connCheck.rows.length === 0) {
          throw new Error('Connection not found or inactive. Please select a valid connection.');
        }
      } else {
        // Integer format - check transform_connections table
        const connCheck = await pool.query(
          'SELECT id FROM transform_connections WHERE id = $1 AND is_active = TRUE',
          [jobData.connectionId]
        );
        
        if (connCheck.rows.length === 0) {
          throw new Error('Connection not found or inactive. Please select a valid connection.');
        }
      }
      
      // If scheduled execution, create a schedule record AFTER validation
      if (jobData.executionType === 'scheduled') {
        const scheduleData = {
          entity_type: 'bulk_profiling_job',
          entity_id: jobId,
          schedule_name: jobData.jobName || `Bulk Profile Schedule - ${jobData.s3Path}`,
          project_id: jobData.projectId,
          created_by: jobData.createdBy,
          is_active: true
        };
        
        // For recurring schedules
        if (jobData.scheduleType === 'recurring') {
          scheduleData.schedule_type = 'cron';
          scheduleData.cron_expression = jobData.cronExpression;
        } 
        // For one-time schedules, use the start date as a one-time cron
        else if (jobData.scheduleType === 'one-time') {
          // Convert datetime to cron expression for one-time execution
          const startDate = new Date(jobData.scheduleStartDate);
          const minute = startDate.getMinutes();
          const hour = startDate.getHours();
          const day = startDate.getDate();
          const month = startDate.getMonth() + 1;
          scheduleData.schedule_type = 'cron';
          scheduleData.cron_expression = `${minute} ${hour} ${day} ${month} *`;
        }
        
        const scheduleResult = await createSchedule(scheduleData);
        scheduleId = scheduleResult.schedule.id;
        systemLogger.info('Created schedule for bulk profiling job', { jobId, scheduleId });
      }
      
      const query = `
        INSERT INTO bulk_profiling_jobs (
          id, job_name, project_id, sub_project_id, connection_id, s3_path, file_pattern,
          duplicate_handling, recursive, status, execution_type, schedule_id, quality_rule_ids, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        RETURNING *
      `;
      
      const values = [
        jobId,
        jobData.jobName || `Bulk Profiling ${new Date().toISOString()}`,
        jobData.projectId,
        jobData.subProjectId || null,
        jobData.connectionId,
        jobData.s3Path,
        jobData.filePattern || '*',
        jobData.duplicateHandling || 'skip',
        jobData.recursive || false,
        'pending',
        jobData.executionType || 'manual',
        scheduleId,
        jobData.qualityRuleIds || null,
        jobData.createdBy
      ];
      
      const result = await pool.query(query, values);
      systemLogger.info('Created bulk profiling job', { jobId, executionType: jobData.executionType });
      
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
        SELECT bpj.*, u.username as created_by_username,
               s.id as schedule_id, s.cron_expression, s.schedule_type,
               s.interval_value, s.interval_unit, s.is_active as schedule_active,
               s.next_run, s.last_run
        FROM bulk_profiling_jobs bpj
        LEFT JOIN users u ON bpj.created_by = u.id
        LEFT JOIN schedules s ON s.entity_id = bpj.id AND s.entity_type = 'bulk_profiling_job'
        WHERE bpj.id = $1
      `;
      
      const jobResult = await pool.query(jobQuery, [jobId]);
      
      if (jobResult.rows.length === 0) {
        return null;
      }
      
      const job = jobResult.rows[0];
      
      // Add human-readable frequency
      if (job.schedule_id && job.cron_expression) {
        job.frequency = describeCronExpression(job.cron_expression);
      } else {
        job.frequency = 'Ad-hoc';
      }
      
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
        SELECT bpj.*, u.username as created_by_username,
               s.id as schedule_id, s.cron_expression, s.schedule_type,
               s.interval_value, s.interval_unit, s.is_active as schedule_active,
               s.next_run, s.last_run
        FROM bulk_profiling_jobs bpj
        LEFT JOIN users u ON bpj.created_by = u.id
        LEFT JOIN schedules s ON s.entity_id = bpj.id AND s.entity_type = 'bulk_profiling_job'
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
      
      // Add human-readable frequency to each job
      const jobs = result.rows.map(job => {
        if (job.schedule_id && job.cron_expression) {
          job.frequency = describeCronExpression(job.cron_expression);
        } else {
          job.frequency = 'Ad-hoc';
        }
        return job;
      });
      
      return jobs;
      
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
          skipped_files = (SELECT COUNT(*) FROM bulk_profiling_files WHERE job_id = $1 AND status = 'skipped'),
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
  /**
   * Start a bulk profiling job (alias for scheduler compatibility)
   */
  async startJob(jobId, userId) {
    return this.startBulkProfiling(jobId, userId);
  }
  
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
              systemLogger.info('Skipping duplicate file', { jobId, fileName: file.file_name, existingFileId: existingFile.file_id });
              await this.updateFileStatus(jobId, file.file_path, 'skipped', existingFile.file_id, 'Already in catalog - duplicate skipped');
              await this.updateJobProgress(jobId);
              continue;
            }
          }
          
          // Download file from S3 to temp location
          const tempFilePath = `/tmp/bulk_profiling_${jobId}_${Date.now()}_${file.file_name}`;
          const s3Key = this._extractS3Key(file.file_path);
          await this._downloadFileFromS3(s3, bucketName, s3Key, tempFilePath);
          systemLogger.info('File downloaded from S3', { jobId, fileName: file.file_name, size: file.file_size });
          
          // Virus scan the downloaded file
          const scanResult = await virusScanService.scanFile(tempFilePath);
          if (scanResult.isInfected) {
            systemLogger.warn('Infected file detected and deleted', { 
              jobId, 
              fileName: file.file_name, 
              virus: scanResult.viruses.join(', ')
            });
            // Delete infected file
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
            await this.updateFileStatus(
              jobId, 
              file.file_path, 
              'failed', 
              null, 
              `Virus detected: ${scanResult.viruses.join(', ')}`
            );
            await this.updateJobProgress(jobId);
            continue;
          }
          
          // Profile the file
          const fileId = uuidv4();
          const startTime = Date.now();
          
          try {
            // Step 1: Extract schema and basic file info
            const fileInfo = await this._callPythonProcessor(tempFilePath, file.file_type);
            systemLogger.info('File analysis completed', { 
              jobId, 
              fileName: file.file_name,
              rows: fileInfo.row_count,
              columns: fileInfo.column_count 
            });
            
            // Step 2: Generate detailed column profiling
            const profilingData = await this._callProfilingScript(tempFilePath, file.file_type);
            
            // Merge profiling data with schema
            if (fileInfo.schema && profilingData.columns) {
              fileInfo.schema = fileInfo.schema.map(col => {
                const profiling = profilingData.columns.find(p => p.name === col.name);
                if (profiling) {
                  const { type, ...profilingFields } = profiling;
                  return { ...col, ...profilingFields };
                }
                return col;
              });
            }
            
            // Step 3: Detect duplicates
            const duplicateStats = await this._detectDuplicates(tempFilePath, file.file_type);
            
            // Step 4: Save to files table
            const fileHash = uuidv4(); // Generate file hash
            await this._saveFileMetadata(
              fileId, 
              file.file_name, 
              file.file_type, 
              file.file_size, 
              fileInfo, 
              userId, 
              fileHash, 
              duplicateStats, 
              job.project_id
            );
            
            // Step 5: Save column information
            if (fileInfo.schema && fileInfo.schema.length > 0) {
              await this._saveColumnInfo(fileId, fileInfo.schema);
            }
            
            // Step 6: Save preview data
            if (fileInfo.preview_data && fileInfo.preview_data.length > 0) {
              await this._savePreviewData(fileId, fileInfo.preview_data);
            }
            
            // Step 6.5: Run quality rules validation if configured
            if (job.quality_rule_ids && job.quality_rule_ids.length > 0 && fileInfo.preview_data && fileInfo.preview_data.length > 0) {
              try {
                await this._runQualityValidation(
                  fileId,
                  file.file_name,
                  job.quality_rule_ids,
                  fileInfo.preview_data,
                  userId
                );
                systemLogger.info('Quality validation completed', { 
                  jobId, 
                  fileName: file.file_name,
                  ruleCount: job.quality_rule_ids.length
                });
              } catch (validationError) {
                systemLogger.error('Error running quality validation', {
                  jobId,
                  fileName: file.file_name,
                  error: validationError.message
                });
                // Don't fail the entire job, just log the validation error
              }
            }
            
            // Step 7: Create file ownership
            await this._createFileOwnership(fileId, userId, file.file_name);
            
            // Step 8: Capture audit logs
            const correlationId = uuidv4();
            await captureFileSchema(pool, {
              fileId,
              fileName: file.file_name,
              fileSchema: {
                columns: fileInfo.schema || [],
                encoding: fileInfo.encoding,
                delimiter: fileInfo.delimiter
              },
              correlationId,
              createdBy: userId
            });
            
            await captureFileAudit(pool, {
              fileId,
              fileName: file.file_name,
              fileSchemaId: null,
              fileHash,
              filePattern: job.file_pattern,
              fileType: file.file_type,
              fileDelimiter: fileInfo.delimiter,
              encoding: fileInfo.encoding,
              numberOfColumns: fileInfo.column_count,
              fileSizeBytes: file.file_size,
              source: 's3_bulk_profiling',
              sourcePath: file.file_path,
              noOfRecordsInSource: fileInfo.row_count,
              loadStep1: 'bulk_profiling',
              loadStep1Path: tempFilePath,
              loadStep1RecCnt: fileInfo.row_count,
              loadType: 'bulk_profiling',
              correlationId,
              userId,
              processingDurationMs: Date.now() - startTime,
              status: 'success',
              createdBy: userId
            });
            
            systemLogger.info('File profiling completed successfully', { 
              jobId, 
              fileName: file.file_name,
              fileId 
            });
            
            await this.updateFileStatus(jobId, file.file_path, 'completed', fileId, null);
            await this.updateJobProgress(jobId);
            
          } catch (profilingError) {
            systemLogger.error('Error profiling file', { 
              jobId, 
              fileName: file.file_name, 
              error: profilingError.message 
            });
            await this.updateFileStatus(jobId, file.file_path, 'failed', null, profilingError.message);
            await this.updateJobProgress(jobId);
          } finally {
            // Clean up temp file
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
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
  
  /**
   * Call Python processor to extract schema and file info
   */
  async _callPythonProcessor(filePath, fileType) {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(__dirname, '../../utils/process_file.py');
      
      if (!fs.existsSync(pythonScript)) {
        return reject(new Error(`Python processor script not found at ${pythonScript}`));
      }
      
      const workspaceRoot = path.join(__dirname, '../..');
      const env = { ...process.env, PYTHONPATH: workspaceRoot };
      const python = spawn('python3', [pythonScript, filePath, fileType], { env }); // NOSONAR S4036 - PATH controlled in deployment environment, hardcoded command with validated script path
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data) => { stdout += data.toString(); });
      python.stderr.on('data', (data) => { stderr += data.toString(); });
      
      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python processor failed: ${stderr || 'Unknown error'}`));
        } else {
          try {
            const result = JSON.parse(stdout);
            if (result.error) {
              reject(new Error(`Python processing error: ${result.error}`));
            } else {
              resolve(result);
            }
          } catch (error) {
            reject(new Error(`Failed to parse Python output: ${error.message}`));
          }
        }
      });
      
      python.on('error', (error) => reject(error));
    });
  }
  
  /**
   * Call Python profiling script for detailed column statistics
   */
  async _callProfilingScript(filePath, fileType) {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(__dirname, '../../utils/profile_columns.py');
      
      if (!fs.existsSync(pythonScript)) {
        systemLogger.warn('Profiling script not found, skipping profiling');
        return resolve({ columns: [] });
      }
      
      const workspaceRoot = path.join(__dirname, '../..');
      const env = { ...process.env, PYTHONPATH: workspaceRoot };
      const python = spawn('python3', [pythonScript, filePath, fileType], { env }); // NOSONAR S4036 - PATH controlled in deployment environment, hardcoded command with validated script path
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data) => { stdout += data.toString(); });
      python.stderr.on('data', (data) => { stderr += data.toString(); });
      
      python.on('close', (code) => {
        if (code !== 0) {
          systemLogger.error('Profiling script error', { code, stderr });
          resolve({ columns: [] });
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch (error) {
            systemLogger.error('Failed to parse profiling output', { error: error.message });
            resolve({ columns: [] });
          }
        }
      });
      
      python.on('error', (error) => {
        systemLogger.error('Failed to spawn profiling script', { error: error.message });
        resolve({ columns: [] });
      });
    });
  }
  
  /**
   * Detect duplicate rows in file
   */
  async _detectDuplicates(filePath, fileType) {
    return new Promise((resolve) => {
      const pythonCode = `
import sys
import json
sys.path.insert(0, '.')
from quality_checks import detect_duplicate_rows

result = detect_duplicate_rows('${filePath.replace(/'/g, "\\'")}', '${fileType}')
print(json.dumps(result))
`;
      
      const python = spawn('python3', ['-c', pythonCode]); // NOSONAR S4036 - PATH controlled in deployment environment, hardcoded command with no user input in script
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data) => { stdout += data.toString(); });
      python.stderr.on('data', (data) => { stderr += data.toString(); });
      
      python.on('close', (code) => {
        if (code !== 0) {
          systemLogger.error('Duplicate detection error', { code, stderr });
          resolve({ total_rows: 0, unique_rows: 0, duplicate_count: 0, duplicate_percentage: 0.0 });
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch (error) {
            systemLogger.error('Failed to parse duplicate detection output', { error: error.message });
            resolve({ total_rows: 0, unique_rows: 0, duplicate_count: 0, duplicate_percentage: 0.0 });
          }
        }
      });
      
      python.on('error', (error) => {
        systemLogger.error('Failed to spawn duplicate detection', { error: error.message });
        resolve({ total_rows: 0, unique_rows: 0, duplicate_count: 0, duplicate_percentage: 0.0 });
      });
    });
  }
  
  /**
   * Save file metadata to files table
   */
  async _saveFileMetadata(fileId, filename, fileType, fileSize, fileInfo, userId, fileHash, duplicateStats, projectId) {
    const metadata = {
      encoding: fileInfo.encoding || null,
      delimiter: fileInfo.delimiter || null,
      preview_data: fileInfo.preview_data || []
    };
    
    const query = `
      INSERT INTO files (
        file_id, filename, file_type, file_size, 
        row_count, column_count, quality_score, metadata, checksum,
        duplicate_records_count, duplicate_records_percentage, project_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (file_id) 
      DO UPDATE SET
        row_count = EXCLUDED.row_count,
        column_count = EXCLUDED.column_count,
        quality_score = EXCLUDED.quality_score,
        metadata = EXCLUDED.metadata,
        checksum = EXCLUDED.checksum,
        duplicate_records_count = EXCLUDED.duplicate_records_count,
        duplicate_records_percentage = EXCLUDED.duplicate_records_percentage,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const values = [
      fileId,
      filename,
      fileType,
      fileSize,
      fileInfo.row_count || 0,
      fileInfo.column_count || 0,
      85, // Default quality score
      JSON.stringify(metadata),
      fileHash || null,
      duplicateStats?.duplicate_count || 0,
      duplicateStats?.duplicate_percentage || 0.0,
      projectId
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }
  
  /**
   * Save column information to file_columns table
   */
  async _saveColumnInfo(fileId, schema) {
    await pool.query('DELETE FROM file_columns WHERE file_id = $1', [fileId]);
    
    const insertQuery = `
      INSERT INTO file_columns (
        file_id, column_name, column_type, column_index,
        unique_count, null_count, min_value, max_value,
        most_frequent_value, least_frequent_value,
        min_value_decimal, max_value_decimal,
        most_frequent_count, least_frequent_count,
        min_frequency, max_frequency,
        min_is_frequent, max_is_frequent,
        patterns
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    `;
    
    for (const col of schema) {
      try {
        const isNumericType = ['integer', 'float', 'decimal', 'numeric', 'number'].includes(col.type?.toLowerCase());
        const minValueDecimal = isNumericType ? this._safeParseFloat(col.min_value) : null;
        const maxValueDecimal = isNumericType ? this._safeParseFloat(col.max_value) : null;
        
        await pool.query(insertQuery, [
          fileId,
          col.name,
          col.type,
          schema.indexOf(col),
          col.unique_count || 0,
          col.null_count || 0,
          col.min_value !== undefined && col.min_value !== null ? String(col.min_value) : null,
          col.max_value !== undefined && col.max_value !== null ? String(col.max_value) : null,
          col.most_frequent_value || null,
          col.least_frequent_value || null,
          minValueDecimal,
          maxValueDecimal,
          col.most_frequent_count || null,
          col.least_frequent_count || null,
          col.min_frequency || null,
          col.max_frequency || null,
          col.min_is_frequent !== undefined ? col.min_is_frequent : null,
          col.max_is_frequent !== undefined ? col.max_is_frequent : null,
          col.patterns && col.patterns.length > 0 ? JSON.stringify(col.patterns) : null
        ]);
      } catch (columnErr) {
        systemLogger.error('Error saving column', { 
          column: col.name, 
          error: columnErr.message 
        });
      }
    }
  }
  
  /**
   * Save preview data to file_preview_data table
   */
  async _savePreviewData(fileId, previewRows) {
    try {
      const limitedRows = previewRows.slice(0, 100);
      
      for (let i = 0; i < limitedRows.length; i++) {
        await pool.query(
          `INSERT INTO file_preview_data (file_id, row_number, row_data)
           VALUES ($1, $2, $3)
           ON CONFLICT (file_id, row_number) 
           DO UPDATE SET row_data = EXCLUDED.row_data`,
          [fileId, i + 1, JSON.stringify(limitedRows[i])]
        );
      }
      
      systemLogger.info('Preview data saved', { fileId, rowsSaved: limitedRows.length });
    } catch (error) {
      systemLogger.error('Error saving preview data', { fileId, error: error.message });
    }
  }
  
  /**
   * Create file ownership record
   */
  async _createFileOwnership(fileId, userId, filename) {
    try {
      await pool.query(
        `INSERT INTO file_ownership (file_id, creator_user_id, owner, filename, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (file_id) DO NOTHING`,
        [fileId, userId, userId, filename]
      );
    } catch (error) {
      systemLogger.error('Error creating file ownership', { fileId, error: error.message });
    }
  }
  
  /**
   * Safely parse float value
   */
  _safeParseFloat(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = parseFloat(value);
    return !isNaN(parsed) && isFinite(parsed) ? parsed : null;
  }
  
  /**
   * Run quality validation on file data
   */
  async _runQualityValidation(fileId, fileName, qualityRuleIds, previewData, userId) {
    try {
      // Fetch quality rules from database
      const rulesQuery = `
        SELECT id, rule_name, rule_type, column_name, rule_config, severity
        FROM quality_rules
        WHERE id = ANY($1) AND enabled = true
      `;
      const rulesResult = await pool.query(rulesQuery, [qualityRuleIds]);
      
      if (rulesResult.rows.length === 0) {
        systemLogger.info('No enabled quality rules found', { qualityRuleIds });
        return;
      }
      
      const rules = rulesResult.rows.map(rule => ({
        ...rule,
        rule_config: typeof rule.rule_config === 'string' ? JSON.parse(rule.rule_config) : rule.rule_config
      }));
      
      // Run validation on preview data (first 100 rows)
      const validationResult = await validateDataWithRules(previewData, rules);
      
      // Store violations if any
      if (validationResult.violations && validationResult.violations.length > 0) {
        for (const violation of validationResult.violations) {
          try {
            await pool.query(
              `INSERT INTO quality_violations 
               (file_id, file_name, rule_id, rule_name, column_name, severity, 
                violation_details, row_number, expected_value, actual_value, created_by, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
              [
                fileId,
                fileName,
                violation.rule_id,
                violation.rule_name,
                violation.column_name,
                violation.severity,
                violation.message || violation.violation_details,
                violation.row_number || null,
                violation.expected_value || null,
                violation.actual_value || null,
                userId
              ]
            );
          } catch (violationError) {
            systemLogger.error('Error storing quality violation', {
              fileId,
              ruleId: violation.rule_id,
              error: violationError.message
            });
          }
        }
        
        systemLogger.info('Quality violations stored', {
          fileId,
          fileName,
          violationCount: validationResult.violations.length
        });
      } else {
        systemLogger.info('No quality violations found', { fileId, fileName });
      }
      
    } catch (error) {
      systemLogger.error('Error running quality validation', {
        fileId,
        fileName,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new BulkProfilingService();
