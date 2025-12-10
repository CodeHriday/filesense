/**
 * Fast Schema Validation Service
 * Validates file metadata against vendor agreement schemas without storing to database
 * Generates downloadable Excel reports
 */

const { systemLogger } = require('../utils/logger');
const { pool } = require('../config/database');
const AWS = require('aws-sdk');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { decryptCredentials } = require('../utils/encryption');
const { matchesPattern } = require('../utils/filePatternMatcher');
const csv = require('csv-parser');
const { Readable } = require('stream');

class FastSchemaValidationService {
  
  /**
   * Create a new schema validation job
   */
  static async createJob(jobData) {
    const { 
      jobName, 
      projectId, 
      connectionId, 
      vendorAgreementId,
      s3Path, 
      filePattern, 
      recursive,
      files,
      createdBy,
      executionType,
      scheduleType,
      cronExpression,
      scheduleStartDate
    } = jobData;

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const jobResult = await client.query(
        `INSERT INTO schema_validation_jobs 
         (job_name, project_id, connection_id, vendor_agreement_id, s3_path, file_pattern, 
          recursive, total_files, status, created_by, execution_type, schedule_type, 
          cron_expression, schedule_start_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          jobName,
          projectId,
          connectionId,
          vendorAgreementId,
          s3Path,
          filePattern,
          recursive,
          files?.length || 0,
          executionType === 'scheduled' ? 'scheduled' : 'pending',
          createdBy,
          executionType,
          scheduleType,
          cronExpression,
          scheduleStartDate
        ]
      );

      const job = jobResult.rows[0];

      if (files && files.length > 0) {
        // Filter out null/undefined/empty file paths
        const validFiles = files.filter(f => f && typeof f === 'string' && f.trim().length > 0);
        
        if (validFiles.length > 0) {
          const fileValues = validFiles.map((filePath, index) => 
            `($1, $${index + 2}, 'pending')`
          ).join(', ');
          
          await client.query(
            `INSERT INTO schema_validation_job_files (job_id, file_path, status)
             VALUES ${fileValues}`,
            [job.id, ...validFiles]
          );
          
          // Update total_files count if it changed
          if (validFiles.length !== files.length) {
            await client.query(
              `UPDATE schema_validation_jobs SET total_files = $1 WHERE id = $2`,
              [validFiles.length, job.id]
            );
          }
        }
      }

      await client.query('COMMIT');

      systemLogger.info('Created schema validation job', { 
        jobId: job.id, 
        totalFiles: files?.length || 0 
      });

      return job;

    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error creating schema validation job', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get job by ID
   */
  static async getJob(jobId) {
    const result = await pool.query(
      `SELECT svj.*, 
              p.name as project_name,
              sc.name as connection_name,
              COALESCE(va.agreement_code, va.file_name) as agreement_name,
              v.vendor_name as vendor_name
       FROM schema_validation_jobs svj
       LEFT JOIN projects p ON svj.project_id = p.id
       LEFT JOIN storage_connections sc ON svj.connection_id = sc.connection_id
       LEFT JOIN vendor_agreements va ON svj.vendor_agreement_id = va.id
       LEFT JOIN vendors v ON va.vendor_id = v.id
       WHERE svj.id = $1`,
      [jobId]
    );

    return result.rows[0];
  }

  /**
   * Get all jobs with optional filters
   */
  static async getJobs(filters = {}) {
    let query = `
      SELECT svj.*, 
             p.name as project_name,
             sc.name as connection_name,
             COALESCE(va.agreement_code, va.file_name) as agreement_name,
             v.vendor_name as vendor_name
      FROM schema_validation_jobs svj
      LEFT JOIN projects p ON svj.project_id = p.id
      LEFT JOIN storage_connections sc ON svj.connection_id::text = sc.connection_id
      LEFT JOIN vendor_agreements va ON svj.vendor_agreement_id = va.id
      LEFT JOIN vendors v ON va.vendor_id = v.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (filters.status) {
      params.push(filters.status);
      query += ` AND svj.status = $${params.length}`;
    }
    
    if (filters.projectId) {
      params.push(filters.projectId);
      query += ` AND svj.project_id = $${params.length}`;
    }

    query += ` ORDER BY svj.created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get scheduled jobs
   */
  static async getScheduledJobs() {
    const result = await pool.query(
      `SELECT svj.*, 
              p.name as project_name,
              COALESCE(va.agreement_code, va.file_name) as agreement_name,
              v.vendor_name as vendor_name
       FROM schema_validation_jobs svj
       LEFT JOIN projects p ON svj.project_id = p.id
       LEFT JOIN vendor_agreements va ON svj.vendor_agreement_id = va.id
       LEFT JOIN vendors v ON va.vendor_id = v.id
       WHERE svj.execution_type = 'scheduled' 
         AND svj.status IN ('scheduled', 'pending')
       ORDER BY svj.next_run_at ASC`
    );

    return result.rows;
  }

  /**
   * Update job status
   */
  static async updateJobStatus(jobId, status, additionalFields = {}) {
    const fields = ['status = $2'];
    const values = [jobId, status];
    let paramIndex = 3;

    if (status === 'running' && !additionalFields.started_at) {
      fields.push(`started_at = NOW()`);
    }
    
    if (status === 'completed' || status === 'failed') {
      fields.push(`completed_at = NOW()`);
    }

    for (const [key, value] of Object.entries(additionalFields)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    await pool.query(
      `UPDATE schema_validation_jobs 
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $1`,
      values
    );
  }

  /**
   * Process validation job
   */
  static async processJob(jobId) {
    const job = await this.getJob(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    systemLogger.info('Starting schema validation job', { jobId });

    try {
      await this.updateJobStatus(jobId, 'running');

      const filesResult = await pool.query(
        `SELECT * FROM schema_validation_job_files WHERE job_id = $1 ORDER BY id`,
        [jobId]
      );
      
      const files = filesResult.rows;
      const results = [];
      let validCount = 0;
      let invalidCount = 0;
      let processedCount = 0;

      const agreementSchema = await this.getAgreementSchema(job.vendor_agreement_id);
      const connectionCredentials = await this.getConnectionCredentials(job.connection_id);
      const s3 = this.createS3Client(connectionCredentials);

      for (const file of files) {
        try {
          const validationResult = await this.validateFileMetadata(
            s3,
            connectionCredentials.bucket,
            file.file_path,
            agreementSchema
          );

          results.push({
            filePath: file.file_path,
            ...validationResult
          });

          if (validationResult.valid) {
            validCount++;
          } else {
            invalidCount++;
          }

          await pool.query(
            `UPDATE schema_validation_job_files 
             SET status = $2, validation_result = $3, updated_at = NOW()
             WHERE id = $1`,
            [file.id, validationResult.valid ? 'valid' : 'invalid', JSON.stringify(validationResult)]
          );

        } catch (fileError) {
          systemLogger.error('Error validating file', { 
            filePath: file.file_path, 
            error: fileError.message 
          });
          
          results.push({
            filePath: file.file_path,
            valid: false,
            error: fileError.message
          });
          
          invalidCount++;
          
          await pool.query(
            `UPDATE schema_validation_job_files 
             SET status = 'error', error_message = $2, updated_at = NOW()
             WHERE id = $1`,
            [file.id, fileError.message]
          );
        }

        processedCount++;

        if (processedCount % 10 === 0) {
          await this.updateJobStatus(jobId, 'running', {
            processed_count: processedCount,
            valid_count: validCount,
            invalid_count: invalidCount
          });
        }
      }

      const reportPath = await this.generateReport(job, results);

      await this.updateJobStatus(jobId, 'completed', {
        processed_count: processedCount,
        valid_count: validCount,
        invalid_count: invalidCount,
        report_path: reportPath
      });

      systemLogger.info('Schema validation job completed', { 
        jobId, 
        validCount, 
        invalidCount 
      });

      return {
        success: true,
        validCount,
        invalidCount,
        reportPath
      };

    } catch (error) {
      systemLogger.error('Schema validation job failed', { 
        jobId, 
        error: error.message 
      });
      
      await this.updateJobStatus(jobId, 'failed', {
        error_message: error.message
      });
      
      throw error;
    }
  }

  /**
   * Get vendor agreement schema
   */
  static async getAgreementSchema(vendorAgreementId) {
    const fileSchemasResult = await pool.query(
      `SELECT id, file_name_pattern, schema, priority, file_description 
       FROM vendor_agreement_file_schemas 
       WHERE vendor_agreement_id = $1 AND is_active = TRUE 
       ORDER BY priority ASC, id ASC`,
      [vendorAgreementId]
    );

    if (fileSchemasResult.rows.length > 0) {
      return {
        type: 'multi-pattern',
        patterns: fileSchemasResult.rows
      };
    }

    const legacyResult = await pool.query(
      `SELECT schema, file_name FROM vendor_agreements WHERE id = $1`,
      [vendorAgreementId]
    );

    if (legacyResult.rows.length === 0) {
      throw new Error('Vendor agreement not found');
    }

    return {
      type: 'legacy',
      schema: legacyResult.rows[0].schema,
      pattern: legacyResult.rows[0].file_name
    };
  }

  /**
   * Get connection credentials
   */
  static async getConnectionCredentials(connectionId) {
    const result = await pool.query(
      `SELECT * FROM storage_connections WHERE connection_id = $1`,
      [connectionId.toString()]
    );

    if (result.rows.length === 0) {
      throw new Error('Connection not found');
    }

    const connection = result.rows[0];
    const config = connection.config || {};
    
    // Determine connection type for decryption
    const storageType = config.storage_type || config.provider || connection.type || 'aws';
    
    // Decrypt credentials before using them
    const decryptedConfig = decryptCredentials(storageType, config);
    
    // Return credentials from decrypted config
    return {
      ...connection,
      bucket: decryptedConfig.bucket || decryptedConfig.bucketName || decryptedConfig.bucket_name || config.bucket_name,
      access_key_id: decryptedConfig.access_key || decryptedConfig.access_key_id || decryptedConfig.accessKeyId,
      secret_access_key: decryptedConfig.secret_key || decryptedConfig.secret_access_key || decryptedConfig.secretAccessKey,
      region: decryptedConfig.region || config.region || 'us-east-1'
    };
  }

  /**
   * Create S3 client
   */
  static createS3Client(credentials) {
    return new AWS.S3({
      accessKeyId: credentials.access_key_id || credentials.accessKeyId,
      secretAccessKey: credentials.secret_access_key || credentials.secretAccessKey,
      region: credentials.region || 'us-east-1'
    });
  }

  /**
   * Validate file metadata against schema
   */
  static async validateFileMetadata(s3, bucket, filePath, agreementSchema) {
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(fileName).toLowerCase().slice(1);

    let expectedSchema;
    let matchedPattern = null;

    if (agreementSchema.type === 'multi-pattern') {
      for (const pattern of agreementSchema.patterns) {
        if (matchesPattern(fileName, pattern.file_name_pattern)) {
          expectedSchema = pattern.schema;
          matchedPattern = pattern.file_name_pattern;
          break;
        }
      }

      if (!expectedSchema) {
        return {
          valid: false,
          reason: 'No matching schema pattern',
          fileName,
          availablePatterns: agreementSchema.patterns.map(p => p.file_name_pattern)
        };
      }
    } else {
      expectedSchema = agreementSchema.schema;
      matchedPattern = agreementSchema.pattern;
    }

    if (!expectedSchema || expectedSchema.length === 0) {
      return {
        valid: true,
        reason: 'No schema defined',
        fileName,
        matchedPattern
      };
    }

    let actualColumns;
    try {
      actualColumns = await this.extractFileColumns(s3, bucket, filePath, fileExtension);
    } catch (err) {
      return {
        valid: false,
        reason: `Failed to read file headers: ${err.message}`,
        fileName,
        matchedPattern
      };
    }

    const expectedColumns = expectedSchema.map(col => ({
      name: col.name || col.column_name,
      type: col.type || col.data_type,
      nullable: col.nullable !== false
    }));

    const missingColumns = [];
    const extraColumns = [];
    const typeMismatches = [];

    const actualColumnNames = actualColumns.map(c => c.toLowerCase());
    const expectedColumnNames = expectedColumns.map(c => c.name.toLowerCase());

    for (const expected of expectedColumns) {
      if (!actualColumnNames.includes(expected.name.toLowerCase())) {
        missingColumns.push(expected.name);
      }
    }

    for (const actual of actualColumns) {
      if (!expectedColumnNames.includes(actual.toLowerCase())) {
        extraColumns.push(actual);
      }
    }

    const valid = missingColumns.length === 0;

    return {
      valid,
      fileName,
      matchedPattern,
      actualColumnCount: actualColumns.length,
      expectedColumnCount: expectedColumns.length,
      missingColumns,
      extraColumns,
      reason: valid ? 'Schema matches' : `Missing ${missingColumns.length} column(s)`,
      details: {
        actualColumns,
        expectedColumns: expectedColumns.map(c => c.name)
      }
    };
  }

  /**
   * Extract column headers from file (metadata only - no full read)
   */
  static async extractFileColumns(s3, bucket, filePath, fileExtension) {
    const params = {
      Bucket: bucket,
      Key: filePath,
      Range: 'bytes=0-65536'
    };

    const response = await s3.getObject(params).promise();
    const buffer = response.Body;

    switch (fileExtension) {
      case 'csv':
        return this.extractCSVColumns(buffer);
      case 'json':
        return this.extractJSONColumns(buffer);
      case 'xlsx':
      case 'xls':
        return this.extractExcelColumns(buffer);
      case 'parquet':
        return ['parquet_column_extraction_not_supported'];
      default:
        throw new Error(`Unsupported file type: ${fileExtension}`);
    }
  }

  /**
   * Extract columns from CSV header
   */
  static extractCSVColumns(buffer) {
    const content = buffer.toString('utf-8');
    const firstLine = content.split('\n')[0].trim();
    
    const columns = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of firstLine) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        columns.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current) {
      columns.push(current.trim().replace(/^"|"$/g, ''));
    }

    return columns;
  }

  /**
   * Extract keys from JSON (first object)
   */
  static extractJSONColumns(buffer) {
    const content = buffer.toString('utf-8');
    
    try {
      const parsed = JSON.parse(content);
      
      if (Array.isArray(parsed) && parsed.length > 0) {
        return Object.keys(parsed[0]);
      }
      
      if (typeof parsed === 'object') {
        return Object.keys(parsed);
      }
      
      return [];
    } catch (e) {
      const arrayMatch = content.match(/\[\s*\{([^}]+)\}/);
      if (arrayMatch) {
        const keyMatches = arrayMatch[1].match(/"([^"]+)"\s*:/g);
        if (keyMatches) {
          return keyMatches.map(k => k.replace(/"/g, '').replace(':', '').trim());
        }
      }
      throw new Error('Invalid JSON format');
    }
  }

  /**
   * Extract columns from Excel header
   */
  static extractExcelColumns(buffer) {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    
    const range = xlsx.utils.decode_range(firstSheet['!ref'] || 'A1');
    const columns = [];
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = xlsx.utils.encode_cell({ r: 0, c: col });
      const cell = firstSheet[cellAddress];
      if (cell && cell.v !== undefined) {
        columns.push(String(cell.v));
      }
    }

    return columns;
  }

  /**
   * Generate Excel report
   */
  static async generateReport(job, results) {
    const reportDir = path.join(os.tmpdir(), 'schema-validation-reports');
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportFileName = `schema-validation-${job.id}-${Date.now()}.xlsx`;
    const reportPath = path.join(reportDir, reportFileName);

    const summaryData = [
      ['Schema Validation Report'],
      [''],
      ['Job Name', job.job_name],
      ['Project', job.project_name],
      ['Vendor Agreement', `${job.vendor_name || ''} - ${job.agreement_name || ''}`],
      ['S3 Path', job.s3_path],
      ['Executed At', new Date().toISOString()],
      [''],
      ['Summary'],
      ['Total Files', results.length],
      ['Valid Files', results.filter(r => r.valid).length],
      ['Invalid Files', results.filter(r => !r.valid).length],
    ];

    const detailsData = [
      ['File Path', 'Status', 'Matched Pattern', 'Actual Columns', 'Expected Columns', 'Missing Columns', 'Extra Columns', 'Reason']
    ];

    for (const result of results) {
      detailsData.push([
        result.filePath,
        result.valid ? 'Valid' : 'Invalid',
        result.matchedPattern || '-',
        result.actualColumnCount || '-',
        result.expectedColumnCount || '-',
        result.missingColumns?.join(', ') || '-',
        result.extraColumns?.join(', ') || '-',
        result.reason || result.error || '-'
      ]);
    }

    const invalidFiles = results.filter(r => !r.valid && r.missingColumns?.length > 0);
    const columnIssuesData = [
      ['File', 'Missing Column', 'Expected Type']
    ];

    for (const file of invalidFiles) {
      for (const col of file.missingColumns || []) {
        const expectedCol = file.details?.expectedColumns?.find(c => 
          c.toLowerCase() === col.toLowerCase()
        );
        columnIssuesData.push([
          file.filePath,
          col,
          '-'
        ]);
      }
    }

    const workbook = xlsx.utils.book_new();

    const summarySheet = xlsx.utils.aoa_to_sheet(summaryData);
    xlsx.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    const detailsSheet = xlsx.utils.aoa_to_sheet(detailsData);
    xlsx.utils.book_append_sheet(workbook, detailsSheet, 'File Details');

    if (columnIssuesData.length > 1) {
      const issuesSheet = xlsx.utils.aoa_to_sheet(columnIssuesData);
      xlsx.utils.book_append_sheet(workbook, issuesSheet, 'Column Issues');
    }

    xlsx.writeFile(workbook, reportPath);

    systemLogger.info('Generated schema validation report', { 
      jobId: job.id, 
      reportPath 
    });

    return reportPath;
  }

  /**
   * Get report file path for download
   */
  static async getReportPath(jobId) {
    const result = await pool.query(
      `SELECT report_path FROM schema_validation_jobs WHERE id = $1`,
      [jobId]
    );

    if (result.rows.length === 0 || !result.rows[0].report_path) {
      return null;
    }

    const reportPath = result.rows[0].report_path;
    
    if (!fs.existsSync(reportPath)) {
      return null;
    }

    return reportPath;
  }

  /**
   * Delete a scheduled job
   */
  static async deleteSchedule(scheduleId) {
    await pool.query(
      `DELETE FROM schema_validation_jobs WHERE id = $1 AND status = 'scheduled'`,
      [scheduleId]
    );
  }

  /**
   * Update a schedule
   */
  static async updateSchedule(scheduleId, updates) {
    const fields = [];
    const values = [scheduleId];
    let paramIndex = 2;

    if (updates.cronExpression !== undefined) {
      fields.push(`cron_expression = $${paramIndex}`);
      values.push(updates.cronExpression);
      paramIndex++;
    }

    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex}`);
      values.push(updates.isActive);
      paramIndex++;
    }

    if (fields.length === 0) return;

    await pool.query(
      `UPDATE schema_validation_jobs 
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $1`,
      values
    );
  }
}

module.exports = FastSchemaValidationService;
