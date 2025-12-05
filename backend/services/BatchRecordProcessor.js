/**
 * Batch Record Processor
 * 
 * Processes uploaded files in batches for optimal database performance
 * Supports multiple file formats: CSV, JSON, XML, Parquet, Excel, Archives, SAS datasets
 */

const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const { XMLParser } = require('fast-xml-parser');
const xlsx = require('xlsx');
const { query } = require('../config/database');
const { systemLogger } = require('../utils/logger');
const UploadBatchService = require('./UploadBatchService');

const BATCH_SIZE = 1000; // Records per database transaction

class BatchRecordProcessor {
  constructor() {
    this.uploadBatchService = new UploadBatchService();
  }

  /**
   * Process file based on its type
   * 
   * @param {Object} uploadFile - Upload file record from database
   * @param {string} filePath - Path to uploaded file
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} - Processing result
   */
  async processFile(uploadFile, filePath, options = {}) {
    const fileType = path.extname(uploadFile.original_filename).toLowerCase().substring(1);

    systemLogger.info('Processing file', {
      fileId: uploadFile.file_id,
      fileType,
      filename: uploadFile.original_filename
    });

    try {
      await this.uploadBatchService.updateFileStatus(uploadFile.file_id, {
        phase: 'parsing',
        status: 'processing'
      });

      let result;

      switch (fileType) {
        case 'csv':
          result = await this.processCSV(uploadFile, filePath, options);
          break;
        case 'json':
          result = await this.processJSON(uploadFile, filePath, options);
          break;
        case 'xml':
          result = await this.processXML(uploadFile, filePath, options);
          break;
        case 'xlsx':
        case 'xls':
          result = await this.processExcel(uploadFile, filePath, options);
          break;
        case 'parquet':
          result = await this.processParquet(uploadFile, filePath, options);
          break;
        case 'zip':
        case 'tar':
        case 'gz':
        case 'tgz':
        case 'bz2':
          result = await this.processArchive(uploadFile, filePath, fileType, options);
          break;
        case 'sas7bdat':
        case 'xpt':
          result = await this.processSAS(uploadFile, filePath, options);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      // Validate that file contains data rows (not just headers or empty)
      if (result.totalRecords === 0) {
        const errorMessage = `File contains no data rows. The file may be empty or contain only headers. At least one data row is required for processing.`;
        systemLogger.warn('Empty file rejected', {
          fileId: uploadFile.file_id,
          filename: uploadFile.original_filename,
          fileType
        });
        throw new Error(errorMessage);
      }

      // Mark file as completed with final metrics
      await this.uploadBatchService.updateFileStatus(uploadFile.file_id, {
        status: 'completed',
        phase: 'completed',
        totalRecords: result.totalRecords,
        processedRecords: result.processedRecords
      });

      systemLogger.info('File processing completed successfully', {
        fileId: uploadFile.file_id,
        totalRecords: result.totalRecords,
        processedRecords: result.processedRecords
      });

      return result;
    } catch (error) {
      systemLogger.error('File processing failed', {
        fileId: uploadFile.file_id,
        error: error.message,
        stack: error.stack
      });

      // Mark file as failed with error details
      await this.uploadBatchService.updateFileStatus(uploadFile.file_id, {
        status: 'failed',
        phase: 'failed',
        errorMessage: error.message,
        errorDetails: { 
          stack: error.stack,
          fileType: path.extname(uploadFile.original_filename).toLowerCase().substring(1)
        }
      });

      throw error;
    }
  }

  /**
   * Process CSV file with streaming
   */
  async processCSV(uploadFile, filePath, options) {
    return new Promise((resolve, reject) => {
      const records = [];
      let totalRecords = 0;
      let processedRecords = 0;

      const stream = fs.createReadStream(filePath)
        .pipe(csvParser());

      stream.on('data', (row) => {
        records.push(row);
        totalRecords++;

        // Batch insert when we reach BATCH_SIZE
        if (records.length >= BATCH_SIZE) {
          stream.pause();
          const batch = [...records];
          records.length = 0;

          this.insertRecordBatch(uploadFile, batch, options)
            .then(() => {
              processedRecords += batch.length;
              this.uploadBatchService.updateFileStatus(uploadFile.file_id, {
                processedRecords
              });
              stream.resume();
            })
            .catch(reject);
        }
      });

      stream.on('end', async () => {
        // Insert remaining records
        if (records.length > 0) {
          try {
            await this.insertRecordBatch(uploadFile, records, options);
            processedRecords += records.length;
          } catch (error) {
            return reject(error);
          }
        }

        resolve({ totalRecords, processedRecords });
      });

      stream.on('error', reject);
    });
  }

  /**
   * Process JSON file with streaming
   */
  async processJSON(uploadFile, filePath, options) {
    const content = fs.readFileSync(filePath, 'utf8');
    let data;

    try {
      data = JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }

    // Handle both array and single object
    const records = Array.isArray(data) ? data : [data];
    const totalRecords = records.length;
    let processedRecords = 0;

    // Process in batches
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await this.insertRecordBatch(uploadFile, batch, options);
      processedRecords += batch.length;

      await this.uploadBatchService.updateFileStatus(uploadFile.file_id, {
        processedRecords
      });
    }

    return { totalRecords, processedRecords };
  }

  /**
   * Process XML file
   */
  async processXML(uploadFile, filePath, options) {
    const content = fs.readFileSync(filePath, 'utf8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });

    const data = parser.parse(content);

    // Try to find array of records in XML structure
    // Common patterns: <records><record>...</record></records>
    let records = [];

    if (data.records && Array.isArray(data.records.record)) {
      records = data.records.record;
    } else if (data.root && Array.isArray(data.root.item)) {
      records = data.root.item;
    } else if (data.data && Array.isArray(data.data.row)) {
      records = data.data.row;
    } else {
      // Treat entire document as single record
      records = [data];
    }

    const totalRecords = records.length;
    let processedRecords = 0;

    // Process in batches
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await this.insertRecordBatch(uploadFile, batch, options);
      processedRecords += batch.length;

      await this.uploadBatchService.updateFileStatus(uploadFile.file_id, {
        processedRecords
      });
    }

    return { totalRecords, processedRecords };
  }

  /**
   * Process Excel file (.xlsx, .xls)
   */
  async processExcel(uploadFile, filePath, options) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Process first sheet
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const records = xlsx.utils.sheet_to_json(worksheet);
    const totalRecords = records.length;
    let processedRecords = 0;

    // Process in batches
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await this.insertRecordBatch(uploadFile, batch, options);
      processedRecords += batch.length;

      await this.uploadBatchService.updateFileStatus(uploadFile.file_id, {
        processedRecords
      });
    }

    return { totalRecords, processedRecords };
  }

  /**
   * Process Parquet file
   * Uses dynamic import() since hyparquet is an ES module
   */
  async processParquet(uploadFile, filePath, options) {
    const { parquetRead } = await import('hyparquet');
    const fileHandle = fs.openSync(filePath, 'r');
    const records = [];
    let totalRecords = 0;
    let processedRecords = 0;

    try {
      await parquetRead({
        file: fileHandle,
        onComplete: async (rows) => {
          totalRecords = rows.length;

          // Process in batches
          for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            await this.insertRecordBatch(uploadFile, batch, options);
            processedRecords += batch.length;

            await this.uploadBatchService.updateFileStatus(uploadFile.file_id, {
              processedRecords
            });
          }
        }
      });

      return { totalRecords, processedRecords };
    } finally {
      fs.closeSync(fileHandle);
    }
  }

  /**
   * Process archive files (ZIP, TAR, etc.)
   */
  async processArchive(uploadFile, filePath, archiveType, options) {
    // TODO: Implement archive extraction and processing
    // This would extract files from archives and process each one
    throw new Error('Archive processing not yet implemented');
  }

  /**
   * Process SAS datasets (.sas7bdat, .xpt)
   */
  async processSAS(uploadFile, filePath, options) {
    // TODO: Implement SAS processing via Python service
    // This would call the Python profile_api service to parse SAS files
    throw new Error('SAS dataset processing not yet implemented');
  }

  /**
   * Insert batch of records into database
   * 
   * @param {Object} uploadFile - Upload file record
   * @param {Array} records - Batch of records to insert
   * @param {Object} options - Processing options
   */
  async insertRecordBatch(uploadFile, records, options) {
    if (!records || records.length === 0) {
      return { inserted: 0 };
    }

    const { projectId, agreementId, governanceTags = [] } = options;
    const fileType = path.extname(uploadFile.original_filename).toLowerCase().substring(1);

    try {
      // Create staging table if not exists (one-time per deployment)
      await this.ensureStagingTable();

      let inserted = 0;

      // Use different insertion strategies based on file type
      if (fileType === 'csv') {
        // Use PostgreSQL COPY for CSV (most efficient)
        inserted = await this.insertViaCSV(uploadFile, records, options);
      } else {
        // Use multi-row INSERT for other formats
        inserted = await this.insertViaMultiRow(uploadFile, records, options);
      }

      systemLogger.info('Record batch inserted', {
        fileId: uploadFile.file_id,
        batchSize: records.length,
        inserted,
        projectId,
        fileType
      });

      return { inserted };
    } catch (error) {
      systemLogger.error('Failed to insert record batch', {
        fileId: uploadFile.file_id,
        error: error.message,
        batchSize: records.length
      });
      throw error;
    }
  }

  /**
   * Ensure upload_staging table exists
   */
  async ensureStagingTable() {
    // Create table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS upload_staging (
        id SERIAL PRIMARY KEY,
        upload_file_id INTEGER REFERENCES upload_files(id) ON DELETE CASCADE,
        record_number BIGINT NOT NULL,
        record_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create index separately (PostgreSQL syntax)
    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_upload_staging_file 
      ON upload_staging(upload_file_id)
    `;

    try {
      await query(createTableSQL);
      await query(createIndexSQL);
    } catch (error) {
      // Ignore if table already exists
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
  }

  /**
   * Insert records using PostgreSQL COPY (CSV optimization)
   */
  async insertViaCSV(uploadFile, records, options) {
    // For CSV files, use COPY command for maximum efficiency
    // Create CSV string from records
    const csvRows = records.map((record, index) => {
      const recordNumber = options.startRecordNumber || 0 + index;
      return `${uploadFile.id}\t${recordNumber}\t${JSON.stringify(record)}`;
    });

    const csvData = csvRows.join('\n');

    // Use COPY command
    const copySQL = `
      COPY upload_staging (upload_file_id, record_number, record_data)
      FROM STDIN WITH (FORMAT text, DELIMITER E'\\t')
    `;

    // NOTE: PostgreSQL COPY requires special handling via pg-copy-streams
    // For now, fall back to multi-row insert
    // TODO: Implement proper COPY streaming with pg-copy-streams

    return await this.insertViaMultiRow(uploadFile, records, options);
  }

  /**
   * Insert records using multi-row INSERT
   */
  async insertViaMultiRow(uploadFile, records, options) {
    const { startRecordNumber = 0 } = options;

    // Build multi-row INSERT statement
    const values = [];
    const placeholders = [];

    for (let i = 0; i < records.length; i++) {
      const recordNumber = startRecordNumber + i;
      const paramOffset = i * 3;

      placeholders.push(
        `($${paramOffset + 1}, $${paramOffset + 2}, $${paramOffset + 3})`
      );
      values.push(uploadFile.id, recordNumber, JSON.stringify(records[i]));
    }

    const insertSQL = `
      INSERT INTO upload_staging (upload_file_id, record_number, record_data)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT DO NOTHING
    `;

    const result = await query(insertSQL, values);

    return result.rowCount || records.length;
  }

  /**
   * Detect file type from filename or content
   */
  detectFileType(filename, filePath) {
    const ext = path.extname(filename).toLowerCase().substring(1);

    const typeMap = {
      'csv': 'csv',
      'json': 'json',
      'xml': 'xml',
      'xlsx': 'excel',
      'xls': 'excel',
      'parquet': 'parquet',
      'zip': 'archive',
      'tar': 'archive',
      'gz': 'archive',
      'tgz': 'archive',
      'bz2': 'archive',
      'sas7bdat': 'sas',
      'xpt': 'sas',
      'avro': 'avro',
      'dat': 'dat'
    };

    return typeMap[ext] || 'unknown';
  }
}

module.exports = BatchRecordProcessor;
