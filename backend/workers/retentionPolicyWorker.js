/**
 * Retention Policy Worker
 * 
 * Automatically evaluates files against retention policies:
 * - Runs at configurable intervals (default: daily at 01:00)
 * - Evaluates all enabled retention policies
 * - Identifies files that meet archival criteria
 * - Archives files using storage abstraction layer (S3/GCS/Azure/local)
 * - Logs execution runs and results
 * 
 * Runs independently of queue system for reliability
 */

const { systemLogger } = require('../utils/logger');
const ArchivalStorageService = require('../services/archivalStorageService');

class RetentionPolicyWorker {
  constructor(dbPool, logger, scheduleTime = '01:00') {
    this.pool = dbPool;
    this.logger = logger || systemLogger;
    this.scheduleTime = scheduleTime; // Format: 'HH:MM'
    this.isProcessing = false;
    this.intervalId = null;
    this.lastRunDate = null;
    this.storageService = new ArchivalStorageService(dbPool);
  }

  /**
   * Start the retention policy worker
   */
  start() {
    this.logger.info('🗄️  Retention policy worker started', {
      scheduleTime: this.scheduleTime
    });

    // Check every hour if it's time to run
    this.intervalId = setInterval(() => {
      this.checkAndRun();
    }, 60 * 60 * 1000); // Check every hour

    // Also check immediately on startup
    this.checkAndRun();
  }

  /**
   * Stop the worker
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info('Retention policy worker stopped');
    }
  }

  /**
   * Check if it's time to run and execute if needed
   */
  async checkAndRun() {
    if (this.isProcessing) {
      this.logger.debug('Retention policy evaluation already in progress, skipping');
      return;
    }

    const now = new Date();
    const [targetHour, targetMinute] = this.scheduleTime.split(':').map(Number);
    
    // Check if current hour matches schedule time
    if (now.getHours() === targetHour && now.getMinutes() >= targetMinute && now.getMinutes() < targetMinute + 60) {
      // Check if we already ran today
      const today = now.toISOString().split('T')[0];
      
      if (this.lastRunDate !== today) {
        await this.run();
        this.lastRunDate = today;
      }
    }
  }

  /**
   * Run retention policy evaluation for all enabled policies
   */
  async run() {
    if (this.isProcessing) {
      this.logger.warn('Retention policy evaluation already in progress');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      this.logger.info('Starting retention policy evaluation');

      // Get all enabled retention policies
      const policiesResult = await this.pool.query(`
        SELECT id, name, criteria, description, storage_config
        FROM retention_policies
        WHERE enabled = true
        ORDER BY priority ASC
      `);

      const policies = policiesResult.rows;

      if (policies.length === 0) {
        this.logger.info('No enabled retention policies found');
        this.isProcessing = false;
        return;
      }

      this.logger.info(`Evaluating ${policies.length} retention policies`);

      let totalFilesEvaluated = 0;
      let totalFilesMarkedForArchival = 0;

      // Evaluate each policy
      for (const policy of policies) {
        try {
          const result = await this.evaluatePolicy(policy);
          totalFilesEvaluated += result.filesEvaluated;
          totalFilesMarkedForArchival += result.filesMarkedForArchival;

          this.logger.info('Policy evaluation completed', {
            policyId: policy.id,
            policyName: policy.name,
            filesEvaluated: result.filesEvaluated,
            filesMarkedForArchival: result.filesMarkedForArchival,
            duration_ms: result.duration
          });
        } catch (error) {
          this.logger.error('Error evaluating retention policy', {
            policyId: policy.id,
            policyName: policy.name,
            error: error.message,
            stack: error.stack
          });
        }
      }

      const duration = Date.now() - startTime;

      this.logger.info('Retention policy evaluation completed', {
        policiesEvaluated: policies.length,
        totalFilesEvaluated,
        totalFilesMarkedForArchival,
        duration_ms: duration
      });

    } catch (error) {
      this.logger.error('Error in retention policy worker', {
        error: error.message,
        stack: error.stack
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Evaluate a single retention policy against the file catalog
   * @param {Object} policy - The retention policy to evaluate
   * @returns {Object} Evaluation results
   */
  async evaluatePolicy(policy) {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Create a run record
      const runResult = await client.query(`
        INSERT INTO retention_policy_runs (
          policy_id,
          started_at,
          status,
          files_evaluated,
          files_archived,
          bytes_archived
        ) VALUES ($1, NOW(), 'running', 0, 0, 0)
        RETURNING id
      `, [policy.id]);

      const runId = runResult.rows[0].id;

      // Build query to find matching files
      const { query, params } = this.buildFileQuery(policy.criteria);

      // Execute the query to find files matching retention criteria
      const filesResult = await client.query(query, params);
      const matchingFiles = filesResult.rows;

      const filesEvaluated = matchingFiles.length;
      let filesMarkedForArchival = 0;
      let bytesArchived = 0;

      // Archive each matching file
      for (const file of matchingFiles) {
        try {
          // Check if file is already archived
          const archivedCheck = await client.query(`
            SELECT id FROM archived_files
            WHERE file_id = $1 AND is_deleted = false
          `, [file.file_id]);

          if (archivedCheck.rows.length > 0) {
            this.logger.debug('File already archived, skipping', {
              fileId: file.file_id,
              filename: file.filename
            });
            continue;
          }

          // Prepare file info for archival
          const fileInfo = {
            file_id: file.file_id,
            filename: file.filename,
            file_path: file.file_path || `./uploads/${file.filename}`,
            file_type: file.file_type,
            size: parseInt(file.file_size) || 0
          };

          // Archive the file using storage abstraction layer
          let archiveStatus = 'pending';
          let archivePath = null;
          let compressedSize = null;
          let errorMessage = null;

          try {
            const archiveResult = await this.storageService.archiveFile(
              fileInfo,
              policy.storage_config
            );

            archiveStatus = 'archived';
            archivePath = archiveResult.archivePath;
            compressedSize = archiveResult.compressedSize;

            this.logger.info('File archived successfully', {
              fileId: file.file_id,
              archivePath
            });

          } catch (archiveError) {
            archiveStatus = 'failed';
            errorMessage = archiveError.message;
            
            this.logger.error('File archival failed', {
              fileId: file.file_id,
              error: archiveError.message
            });

            // Continue with creating the record even if archival failed
            // This allows retry later
          }

          // Create archived_files entry with actual archival results
          await client.query(`
            INSERT INTO archived_files (
              policy_id,
              file_id,
              filename,
              original_path,
              archive_path,
              original_size_bytes,
              compressed_size_bytes,
              metadata_snapshot,
              archived_at,
              archived_by,
              archive_status,
              error_message
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 1, $9, $10)
          `, [
            policy.id,
            file.file_id,
            file.filename,
            fileInfo.file_path,
            archivePath,
            fileInfo.size,
            compressedSize,
            JSON.stringify({
              row_count: file.row_count,
              column_count: file.column_count,
              quality_score: file.quality_score,
              processed_at: file.processed_at,
              metadata: file.metadata
            }),
            archiveStatus,
            errorMessage
          ]);

          if (archiveStatus === 'archived') {
            filesMarkedForArchival++;
            bytesArchived += compressedSize || fileInfo.size;
          }

        } catch (error) {
          this.logger.error('Error processing file for archival', {
            fileId: file.file_id,
            error: error.message
          });
        }
      }

      // Update the run record with results
      await client.query(`
        UPDATE retention_policy_runs
        SET 
          completed_at = NOW(),
          status = 'completed',
          files_evaluated = $1,
          files_archived = $2,
          bytes_archived = $3,
          error_message = NULL
        WHERE id = $4
      `, [filesEvaluated, filesMarkedForArchival, bytesArchived, runId]);

      await client.query('COMMIT');

      return {
        filesEvaluated,
        filesMarkedForArchival,
        bytesArchived,
        duration: Date.now() - startTime
      };

    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Policy evaluation error', {
        policyId: policy.id,
        error: error.message
      });

      // Record the failure
      try {
        await client.query(`
          UPDATE retention_policy_runs
          SET 
            completed_at = NOW(),
            status = 'failed',
            error_message = $1
          WHERE policy_id = $2 AND status = 'running'
        `, [error.message, policy.id]);
      } catch (updateError) {
        this.logger.error('Error recording failure', { error: updateError.message });
      }

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Build SQL query to find files matching retention criteria
   * @param {Object} criteria - Retention policy criteria
   * @returns {Object} { query, params }
   */
  buildFileQuery(criteria) {
    const conditions = [];
    const params = [];
    let paramCounter = 1;

    let baseQuery = `
      SELECT 
        f.file_id,
        f.filename,
        f.file_path,
        f.file_type,
        f.file_size,
        f.row_count,
        f.column_count,
        f.quality_score,
        f.processed_at,
        f.created_at,
        f.metadata
      FROM files f
      WHERE 1=1
    `;

    // Age-based criteria - files older than max_age_days should be archived
    if (criteria.max_age_days) {
      params.push(criteria.max_age_days);
      conditions.push(`f.created_at < NOW() - ($${paramCounter} * INTERVAL '1 day')`);
      paramCounter++;
    }

    // Quality score criteria - archive files below minimum quality
    if (criteria.min_quality_score !== null && criteria.min_quality_score !== undefined) {
      params.push(criteria.min_quality_score);
      conditions.push(`CAST(f.quality_score AS DECIMAL) < $${paramCounter}`);
      paramCounter++;
    }

    // Archive files above maximum quality (unusual but supported)
    if (criteria.max_quality_score !== null && criteria.max_quality_score !== undefined) {
      params.push(criteria.max_quality_score);
      conditions.push(`CAST(f.quality_score AS DECIMAL) > $${paramCounter}`);
      paramCounter++;
    }

    // File size criteria - archive small files below threshold
    if (criteria.min_file_size_bytes) {
      params.push(criteria.min_file_size_bytes);
      conditions.push(`CAST(f.file_size AS BIGINT) < $${paramCounter}`);
      paramCounter++;
    }

    // Archive large files above threshold
    if (criteria.max_file_size_bytes) {
      params.push(criteria.max_file_size_bytes);
      conditions.push(`CAST(f.file_size AS BIGINT) > $${paramCounter}`);
      paramCounter++;
    }

    // File type criteria - only archive specific file types
    if (criteria.file_types && criteria.file_types.length > 0) {
      params.push(criteria.file_types);
      conditions.push(`f.file_type = ANY($${paramCounter})`);
      paramCounter++;
    }

    // Tag-based criteria (files must have all specified tags)
    if (criteria.required_tags && criteria.required_tags.length > 0) {
      params.push(criteria.required_tags);
      conditions.push(`
        EXISTS (
          SELECT 1 FROM file_tags ft
          INNER JOIN tags t ON ft.tag_id = t.id
          WHERE ft.file_id = f.file_id
          AND t.name = ANY($${paramCounter})
          GROUP BY ft.file_id
          HAVING COUNT(DISTINCT t.name) = ${criteria.required_tags.length}
        )
      `);
      paramCounter++;
    }

    // Custom SQL criteria (advanced users)
    if (criteria.custom_sql_filter) {
      // Sanitize and add custom SQL (be careful with this!)
      // For now, we'll just append it directly
      // In production, you'd want to validate this more carefully
      conditions.push(`(${criteria.custom_sql_filter})`);
    }

    // Combine all conditions
    if (conditions.length > 0) {
      baseQuery += ' AND ' + conditions.join(' AND ');
    }

    // Limit results to prevent overwhelming the system
    baseQuery += ' LIMIT 10000';

    return {
      query: baseQuery,
      params
    };
  }

  /**
   * Manually execute retention policy evaluation (called from API endpoint)
   * @param {number} policyId - Optional policy ID to evaluate (if null, evaluates all)
   */
  async executeManually(policyId = null) {
    const startTime = Date.now();

    try {
      if (policyId) {
        // Evaluate single policy
        const policyResult = await this.pool.query(`
          SELECT id, name, criteria, description, storage_config
          FROM retention_policies
          WHERE id = $1 AND enabled = true
        `, [policyId]);

        if (policyResult.rows.length === 0) {
          throw new Error('Policy not found or not enabled');
        }

        const policy = policyResult.rows[0];
        const result = await this.evaluatePolicy(policy);

        return {
          success: true,
          policiesEvaluated: 1,
          filesEvaluated: result.filesEvaluated,
          filesMarkedForArchival: result.filesMarkedForArchival,
          bytesArchived: result.bytesArchived,
          duration_ms: Date.now() - startTime
        };

      } else {
        // Evaluate all enabled policies
        await this.run();

        return {
          success: true,
          message: 'All enabled retention policies evaluated',
          duration_ms: Date.now() - startTime
        };
      }

    } catch (error) {
      this.logger.error('Manual execution error', { error: error.message });
      throw error;
    }
  }
}

module.exports = RetentionPolicyWorker;
