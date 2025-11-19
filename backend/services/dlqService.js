class DLQService {
  constructor(dbPool, logger = null) {
    this.dbPool = dbPool;
    this.logger = logger || console;
  }

  async createDLQJob(jobType, originalPayload, error, remediationInstructions = null) {
    try {
      let errorCode = 'UNKNOWN_ERROR';
      let errorMessage = error.message || 'Unknown error occurred';
      let remediation = remediationInstructions;

      if (errorMessage.includes('ARCHIVE_PASSWORD_REQUIRED')) {
        errorCode = 'ARCHIVE_PASSWORD_REQUIRED';
        errorMessage = 'Archive is password-protected but no password was provided';
        remediation = 'Provide the archive password via the DLQ remediation UI or vendor agreement settings';
      } else if (errorMessage.includes('password') || errorMessage.includes('encrypted')) {
        errorCode = 'INVALID_PASSWORD';
        errorMessage = 'Archive password is incorrect or encryption method is not supported';
        remediation = 'Verify the password is correct or contact the vendor for the correct password';
      } else if (errorMessage.includes('size') && errorMessage.includes('exceed')) {
        errorCode = 'FILE_SIZE_EXCEEDED';
        remediation = 'Archive exceeds the 25 MB size limit. Please request a smaller archive from the vendor';
      } else if (errorMessage.includes('Unsupported archive type') || errorMessage.includes('not supported')) {
        errorCode = 'UNSUPPORTED_FORMAT';
        remediation = 'Archive format is not supported. Supported formats: ZIP, 7z, TAR, TAR.GZ, TAR.BZ2';
      } else if (errorMessage.includes('corrupt') || errorMessage.includes('invalid')) {
        errorCode = 'CORRUPTED_ARCHIVE';
        remediation = 'Archive file appears to be corrupted. Please request a new copy from the vendor';
      } else if (errorMessage.includes('virus') || errorMessage.includes('malware')) {
        errorCode = 'VIRUS_DETECTED';
        remediation = 'Virus or malware detected in extracted file. Contact vendor immediately';
      } else {
        remediation = remediation || 'Review error message and contact support if issue persists';
      }

      const result = await this.dbPool.query(
        `INSERT INTO dlq_jobs (
          job_type,
          original_payload,
          error_code,
          error_message,
          remediation_instructions,
          retry_count,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          jobType,
          JSON.stringify(originalPayload),
          errorCode,
          errorMessage,
          remediation,
          0,
          'pending'
        ]
      );

      this.logger.info('DLQ job created', {
        dlqJobId: result.rows[0].id,
        jobType,
        errorCode
      });

      return result.rows[0];

    } catch (error) {
      this.logger.error('Failed to create DLQ job', {
        error: error.message,
        jobType
      });
      throw new Error(`Failed to create DLQ job: ${error.message}`);
    }
  }

  async getDLQJobs(filters = {}, pagination = {}) {
    try {
      const { page = 1, limit = 50 } = pagination;
      const offset = (page - 1) * limit;

      const whereClauses = [];
      const values = [];
      let paramIndex = 1;

      if (filters.status) {
        whereClauses.push(`status = $${paramIndex++}`);
        values.push(filters.status);
      }

      if (filters.errorCode) {
        whereClauses.push(`error_code = $${paramIndex++}`);
        values.push(filters.errorCode);
      }

      if (filters.jobType) {
        whereClauses.push(`job_type = $${paramIndex++}`);
        values.push(filters.jobType);
      }

      if (filters.fromDate) {
        whereClauses.push(`created_at >= $${paramIndex++}`);
        values.push(filters.fromDate);
      }

      if (filters.toDate) {
        whereClauses.push(`created_at <= $${paramIndex++}`);
        values.push(filters.toDate);
      }

      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countResult = await this.dbPool.query(
        `SELECT COUNT(*) as total FROM dlq_jobs ${whereClause}`,
        values
      );

      values.push(limit, offset);
      const dataResult = await this.dbPool.query(
        `SELECT * FROM dlq_jobs ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        values
      );

      return {
        jobs: dataResult.rows,
        total: parseInt(countResult.rows[0].total),
        page,
        limit,
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
      };

    } catch (error) {
      this.logger.error('Failed to fetch DLQ jobs', {
        error: error.message
      });
      throw new Error(`Failed to fetch DLQ jobs: ${error.message}`);
    }
  }

  async getDLQJobById(dlqJobId) {
    try {
      const result = await this.dbPool.query(
        'SELECT * FROM dlq_jobs WHERE id = $1',
        [dlqJobId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      this.logger.error('Failed to fetch DLQ job', {
        dlqJobId,
        error: error.message
      });
      throw new Error(`Failed to fetch DLQ job: ${error.message}`);
    }
  }

  async updateDLQJobStatus(dlqJobId, status, retryAttemptIncrement = false) {
    try {
      let query;
      let values;

      if (retryAttemptIncrement) {
        query = `UPDATE dlq_jobs
                 SET status = $1, retry_count = retry_count + 1, resolved_at = CASE WHEN $1 = 'resolved' THEN CURRENT_TIMESTAMP ELSE NULL END
                 WHERE id = $2
                 RETURNING *`;
        values = [status, dlqJobId];
      } else {
        query = `UPDATE dlq_jobs
                 SET status = $1, resolved_at = CASE WHEN $1 = 'resolved' THEN CURRENT_TIMESTAMP ELSE NULL END
                 WHERE id = $2
                 RETURNING *`;
        values = [status, dlqJobId];
      }

      const result = await this.dbPool.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('DLQ job not found');
      }

      this.logger.info('DLQ job status updated', {
        dlqJobId,
        status,
        retryIncremented: retryAttemptIncrement
      });

      return result.rows[0];

    } catch (error) {
      this.logger.error('Failed to update DLQ job status', {
        dlqJobId,
        error: error.message
      });
      throw new Error(`Failed to update DLQ job status: ${error.message}`);
    }
  }

  async deleteDLQJob(dlqJobId) {
    try {
      const result = await this.dbPool.query(
        'DELETE FROM dlq_jobs WHERE id = $1 RETURNING id',
        [dlqJobId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      this.logger.info('DLQ job deleted', { dlqJobId });
      return true;

    } catch (error) {
      this.logger.error('Failed to delete DLQ job', {
        dlqJobId,
        error: error.message
      });
      throw new Error(`Failed to delete DLQ job: ${error.message}`);
    }
  }

  async getStatistics() {
    try {
      const result = await this.dbPool.query(`
        SELECT
          status,
          error_code,
          COUNT(*) as count
        FROM dlq_jobs
        GROUP BY status, error_code
        ORDER BY count DESC
      `);

      const totalResult = await this.dbPool.query('SELECT COUNT(*) as total FROM dlq_jobs');

      return {
        total: parseInt(totalResult.rows[0].total),
        byStatusAndError: result.rows
      };

    } catch (error) {
      this.logger.error('Failed to get DLQ statistics', {
        error: error.message
      });
      throw new Error(`Failed to get DLQ statistics: ${error.message}`);
    }
  }
}

module.exports = DLQService;
