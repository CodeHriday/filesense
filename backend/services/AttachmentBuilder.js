/**
 * Attachment Builder Service
 * 
 * Generates email attachments for quality violations and alert reports.
 * Supports CSV and Excel (XLSX) formats with configurable size limits.
 */

const xlsx = require('xlsx');
const pool = require('../db');
const { systemLogger } = require('../utils/logger');

class AttachmentBuilder {
  constructor() {
    // Size limits (in bytes)
    this.MAX_INLINE_SIZE = 10 * 1024 * 1024; // 10MB for inline attachments
    this.MAX_CSV_ROWS = 100000; // Limit to prevent excessive memory usage
  }

  /**
   * Generate quality violations attachment for a job
   * @param {string} jobId - Job ID to fetch violations for
   * @param {string} format - 'csv' or 'xlsx'
   * @param {Object} options - { limit, includeRecordSnapshot, keepBufferForUpload }
   * @returns {Promise<Object>} - { buffer, filename, mimeType, size, rowCount, truncated, exceedsLimit, requiresCloudUpload, downloadHint? }
   *   - buffer: Buffer or null (null if exceeds limit, unless keepBufferForUpload=true)
   *   - requiresCloudUpload: true if buffer is null due to size limit
   */
  async generateJobViolationsAttachment(jobId, format = 'csv', options = {}) {
    try {
      const { limit, includeRecordSnapshot = false, keepBufferForUpload = false } = options;

      // Enforce row limit (clamp to MAX_CSV_ROWS, guard against negative/zero)
      const effectiveLimit = Math.max(1, Math.min(limit || this.MAX_CSV_ROWS, this.MAX_CSV_ROWS));

      // Fetch quality violations from database
      const violations = await this.fetchJobViolations(jobId, effectiveLimit, includeRecordSnapshot);

      if (violations.length === 0) {
        systemLogger.info('No quality violations found for job', { jobId });
        return null;
      }

      // Generate attachment based on format
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `quality-violations-job-${jobId}-${timestamp}.${format}`;
      
      let buffer, mimeType;
      
      if (format === 'xlsx') {
        ({ buffer, mimeType } = this.generateExcelBuffer(violations));
      } else {
        ({ buffer, mimeType } = this.generateCSVBuffer(violations));
      }

      const size = buffer.length;
      const truncated = violations.length >= effectiveLimit;
      const exceedsLimit = size > this.MAX_INLINE_SIZE;

      if (exceedsLimit) {
        systemLogger.warn('Generated attachment exceeds inline size limit - must upload to cloud storage', {
          jobId,
          format,
          size,
          limit: this.MAX_INLINE_SIZE,
          sizeFormatted: this.formatSize(size)
        });

        // Return metadata - with or without buffer depending on keepBufferForUpload flag
        return {
          buffer: keepBufferForUpload ? buffer : null,
          filename,
          mimeType,
          size,
          rowCount: violations.length,
          truncated,
          exceedsLimit: true,
          requiresCloudUpload: true,
          downloadHint: `Attachment too large (${this.formatSize(size)}). Upload to cloud storage and provide download link.`
        };
      }

      systemLogger.info('Generated quality violations attachment', {
        jobId,
        format,
        rowCount: violations.length,
        size,
        truncated,
        exceedsLimit: false
      });

      return {
        buffer,
        filename,
        mimeType,
        size,
        rowCount: violations.length,
        truncated,
        exceedsLimit: false,
        requiresCloudUpload: false
      };
    } catch (error) {
      systemLogger.error('Error generating job violations attachment', {
        jobId,
        format,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate quality violations attachment for multiple jobs (consolidated)
   * @param {Array<string>} jobIds - Array of job IDs
   * @param {string} format - 'csv' or 'xlsx'
   * @param {Object} options - { limit, includeRecordSnapshot, keepBufferForUpload }
   * @returns {Promise<Object>} - { buffer, filename, mimeType, size, rowCount, truncated, exceedsLimit, requiresCloudUpload, downloadHint? }
   *   - buffer: Buffer or null (null if exceeds limit, unless keepBufferForUpload=true)
   *   - requiresCloudUpload: true if buffer is null due to size limit
   */
  async generateConsolidatedViolationsAttachment(jobIds, format = 'csv', options = {}) {
    try {
      const { limit, includeRecordSnapshot = false, keepBufferForUpload = false } = options;

      if (!jobIds || jobIds.length === 0) {
        return null;
      }

      // Enforce row limit (clamp to MAX_CSV_ROWS, guard against negative/zero)
      const effectiveLimit = Math.max(1, Math.min(limit || this.MAX_CSV_ROWS, this.MAX_CSV_ROWS));

      // Fetch violations for all jobs
      const violations = await this.fetchMultipleJobsViolations(jobIds, effectiveLimit, includeRecordSnapshot);

      if (violations.length === 0) {
        systemLogger.info('No quality violations found for jobs', { jobIds });
        return null;
      }

      // Generate attachment
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `quality-violations-consolidated-${timestamp}.${format}`;
      
      let buffer, mimeType;
      
      if (format === 'xlsx') {
        ({ buffer, mimeType } = this.generateExcelBuffer(violations));
      } else {
        ({ buffer, mimeType } = this.generateCSVBuffer(violations));
      }

      const size = buffer.length;
      const truncated = violations.length >= effectiveLimit;
      const exceedsLimit = size > this.MAX_INLINE_SIZE;

      if (exceedsLimit) {
        systemLogger.warn('Generated consolidated attachment exceeds inline size limit - must upload to cloud storage', {
          jobCount: jobIds.length,
          format,
          size,
          limit: this.MAX_INLINE_SIZE,
          sizeFormatted: this.formatSize(size)
        });

        // Return metadata - with or without buffer depending on keepBufferForUpload flag
        return {
          buffer: keepBufferForUpload ? buffer : null,
          filename,
          mimeType,
          size,
          rowCount: violations.length,
          truncated,
          exceedsLimit: true,
          requiresCloudUpload: true,
          downloadHint: `Attachment too large (${this.formatSize(size)}). Upload to cloud storage and provide download link.`
        };
      }

      systemLogger.info('Generated consolidated violations attachment', {
        jobCount: jobIds.length,
        format,
        rowCount: violations.length,
        size,
        truncated,
        exceedsLimit: false
      });

      return {
        buffer,
        filename,
        mimeType,
        size,
        rowCount: violations.length,
        truncated,
        exceedsLimit: false,
        requiresCloudUpload: false
      };
    } catch (error) {
      systemLogger.error('Error generating consolidated violations attachment', {
        jobIds,
        format,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Fetch quality violations for a single job
   * @private
   */
  async fetchJobViolations(jobId, limit, includeRecordSnapshot) {
    const columns = [
      'qrv.id',
      'qrv.job_id',
      'qrv.file_id',
      'qrv.rule_id',
      'qr.rule_name',
      'qr.rule_type',
      'qrv.row_number',
      'qrv.column_name',
      'qrv.expected_value',
      'qrv.actual_value',
      'qrv.severity',
      'qrv.status',
      'qrv.processing_action',
      'qrv.created_at'
    ];

    if (includeRecordSnapshot) {
      columns.push('qrv.record_snapshot');
    }

    const query = `
      SELECT ${columns.join(', ')}
      FROM quality_rule_violations qrv
      LEFT JOIN quality_rules qr ON qrv.rule_id = qr.id
      WHERE qrv.job_id = $1
      ORDER BY qrv.created_at DESC, qrv.id DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [jobId, limit]);
    return this.flattenViolations(result.rows);
  }

  /**
   * Fetch quality violations for multiple jobs
   * @private
   */
  async fetchMultipleJobsViolations(jobIds, limit, includeRecordSnapshot) {
    const columns = [
      'qrv.id',
      'qrv.job_id',
      'qrv.file_id',
      'qrv.rule_id',
      'qr.rule_name',
      'qr.rule_type',
      'qrv.row_number',
      'qrv.column_name',
      'qrv.expected_value',
      'qrv.actual_value',
      'qrv.severity',
      'qrv.status',
      'qrv.processing_action',
      'qrv.created_at'
    ];

    if (includeRecordSnapshot) {
      columns.push('qrv.record_snapshot');
    }

    const query = `
      SELECT ${columns.join(', ')}
      FROM quality_rule_violations qrv
      LEFT JOIN quality_rules qr ON qrv.rule_id = qr.id
      WHERE qrv.job_id = ANY($1::uuid[])
      ORDER BY qrv.created_at DESC, qrv.id DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [jobIds, limit]);
    return this.flattenViolations(result.rows);
  }

  /**
   * Flatten violations for CSV/Excel export
   * Converts JSONB fields to readable strings
   * @private
   */
  flattenViolations(violations) {
    return violations.map(v => {
      const flattened = {
        violation_id: v.id,
        job_id: v.job_id,
        file_id: v.file_id,
        rule_id: v.rule_id,
        rule_name: v.rule_name || 'N/A',
        rule_type: v.rule_type || 'N/A',
        row_number: v.row_number,
        column_name: v.column_name || 'N/A',
        expected_value: v.expected_value || 'N/A',
        actual_value: v.actual_value || 'N/A',
        severity: v.severity,
        status: v.status || 'open',
        processing_action: v.processing_action || 'N/A',
        created_at: v.created_at ? new Date(v.created_at).toISOString() : 'N/A'
      };

      // Include record snapshot if present
      if (v.record_snapshot) {
        try {
          const snapshot = typeof v.record_snapshot === 'string'
            ? JSON.parse(v.record_snapshot)
            : v.record_snapshot;

          flattened.record_snapshot = JSON.stringify(snapshot);
        } catch (e) {
          systemLogger.warn('Failed to parse record_snapshot, using raw value', {
            error: e.message,
            record_snapshot: v.record_snapshot,
          });

          flattened.record_snapshot = String(v.record_snapshot);
        }
      }

      return flattened;
    });
  }

  /**
   * Generate CSV buffer from violations
   * @private
   */
  generateCSVBuffer(violations) {
    if (violations.length === 0) {
      return { buffer: Buffer.from(''), mimeType: 'text/csv' };
    }

    // Get headers from first row
    const headers = Object.keys(violations[0]);
    
    // Build CSV content
    const csvRows = [
      headers.join(','), // Header row
      ...violations.map(row => {
        return headers.map(header => {
          const value = row[header];
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (value === null || value === undefined) {
            return '';
          }
          const stringValue = String(value);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',');
      })
    ];

    const csvContent = csvRows.join('\n');
    const buffer = Buffer.from(csvContent, 'utf-8');

    return {
      buffer,
      mimeType: 'text/csv'
    };
  }

  /**
   * Generate Excel buffer from violations
   * @private
   */
  generateExcelBuffer(violations) {
    if (violations.length === 0) {
      const ws = xlsx.utils.aoa_to_sheet([['No violations found']]);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Violations');
      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return { buffer, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    }

    // Create worksheet from violations
    const ws = xlsx.utils.json_to_sheet(violations);
    
    // Auto-size columns
    const columnWidths = Object.keys(violations[0]).map(key => {
      const maxLength = Math.max(
        key.length,
        ...violations.map(row => String(row[key] || '').length)
      );
      return { wch: Math.min(maxLength + 2, 50) }; // Cap at 50 characters
    });
    ws['!cols'] = columnWidths;

    // Create workbook and add worksheet
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Quality Violations');

    // Generate buffer
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return {
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
  }

  /**
   * Check if attachment exceeds inline size limit
   * @param {number} size - Attachment size in bytes
   * @returns {boolean}
   */
  exceedsInlineLimit(size) {
    return size > this.MAX_INLINE_SIZE;
  }

  /**
   * Format size for human-readable display
   * @param {number} bytes - Size in bytes
   * @returns {string}
   */
  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

module.exports = new AttachmentBuilder();
