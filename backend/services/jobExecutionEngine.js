const { v4: uuidv4 } = require('uuid');
const { Readable } = require('stream');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { XMLParser } = require('fast-xml-parser');
const { systemLogger } = require('../utils/logger');
const { validateSchemaConsistency, saveSchemaSnapshot, inferDataType } = require('./schemaService');
const { transformRow } = require('./transformationEngine');
const { executeAnomalyDetection } = require('./anomalyRulesEngine');
const { 
  downloadFileFromConnection, 
  uploadFileToConnection,
  listAndFilterFiles
} = require('../utils/cloudStorageFileList');
const { captureFileAudit, captureFileSchema } = require('./fileAuditService');
const { profileETLOutputFile, profileETLFile } = require('./etlProfilingService');
const { profileFileBuffer, downloadAndProfileFile } = require('./transformationProfilingService');
const { persistGovernanceMetadata } = require('./governanceService');
const { enforceSchemaRulesForJob } = require('./schemaRuleEnforcer');
const { loadRDMContext } = require('./rdmContextLoader');
const alertAggregationWorker = require('./AlertAggregationWorker');
const visualMappingWS = require('./visualMappingWebSocket');
const crypto = require('crypto');
const ArchiveExtractionService = require('./archiveExtractionService');
const ImmutableAuditLedgerService = require('./ImmutableAuditLedgerService');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Archive file type constants
const ARCHIVE_EXTENSIONS = ['zip', '7z', 'tar', 'gz', 'tgz', 'bz2', 'tar.gz', 'tar.bz2'];
const FIXED_WIDTH_EXTENSIONS = ['dat', 'fixed_width', 'txt'];

/**
 * Deep clone an object with BigInt support
 * Converts BigInt values to strings to avoid JSON serialization errors
 * @param {any} obj - Object to clone
 * @returns {any} - Cloned object with BigInt values converted to strings
 */
function deepCloneWithBigInt(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj === 'bigint') {
    // Convert BigInt to string to preserve precision
    return obj.toString();
  }
  if (typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepCloneWithBigInt(item));
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  if (obj instanceof Buffer) {
    return Buffer.from(obj);
  }
  const cloned = {};
  for (const key of Object.keys(obj)) {
    cloned[key] = deepCloneWithBigInt(obj[key]);
  }
  return cloned;
}

/**
 * Parse a file buffer into an array of row objects (for join lookups)
 * Supports all 15 file types: CSV, JSON, XLSX, XLS, Parquet, XML, AVRO, DAT,
 * SAS formats, and archives (ZIP, 7z, TAR, GZ, TGZ, BZ2)
 * @param {Buffer} buffer - File content buffer
 * @param {string} filename - Filename for extension detection
 * @param {Object} pool - Database pool (required for archive password retrieval)
 * @param {number} vendorAgreementId - Vendor agreement ID for password lookup
 * @returns {Promise<Array<Object>>} - Array of row objects
 */
async function parseFileToRows(buffer, filename, pool = null, vendorAgreementId = null) {
  const rows = [];
  const ext = filename.split('.').pop()?.toLowerCase();
  
  // CSV and TSV/pipe-delimited files
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
    const content = buffer.toString('utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) return rows;
    
    // Detect delimiter (comma, tab, or pipe)
    const firstLine = lines[0];
    let delimiter = ',';
    if (ext === 'tsv' || (firstLine.includes('\t') && !firstLine.includes(','))) {
      delimiter = '\t';
    } else if (firstLine.includes('|') && !firstLine.includes(',') && !firstLine.includes('\t')) {
      delimiter = '|';
    }
    
    // Parse header
    const headerLine = lines[0];
    const headers = headerLine.split(delimiter).map(h => h.trim().replace(/^["']/g, '').replace(/["']$/g, ''));
    
    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values = [];
      let inQuotes = false;
      let currentValue = '';
      
      for (const char of line) {
        if (char === '"' && !inQuotes) {
          inQuotes = true;
        } else if (char === '"' && inQuotes) {
          inQuotes = false;
        } else if (char === delimiter && !inQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim());
      
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      rows.push(row);
    }
  } else if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson') {
    // Parse JSON / JSONL (newline-delimited JSON)
    const content = buffer.toString('utf-8');
    
    if (ext === 'jsonl' || ext === 'ndjson') {
      // JSONL: one JSON object per line
      const lines = content.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          rows.push(JSON.parse(line));
        } catch (e) {
          // Skip invalid lines
        }
      }
    } else {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        rows.push(...parsed);
      } else if (parsed.data && Array.isArray(parsed.data)) {
        rows.push(...parsed.data);
      } else if (parsed.rows && Array.isArray(parsed.rows)) {
        rows.push(...parsed.rows);
      }
    }
  } else if (ext === 'xlsx' || ext === 'xls') {
    // Parse Excel
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(sheet);
    rows.push(...jsonData);
  } else if (ext === 'parquet') {
    // Parse Parquet
    try {
      const { parquetReadObjects } = await import('hyparquet');
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      );
      const parquetIterator = await parquetReadObjects({ file: arrayBuffer });
      for await (const row of parquetIterator) {
        rows.push(row);
      }
    } catch (parquetError) {
      systemLogger.error('Parquet parsing error in parseFileToRows:', parquetError);
    }
  } else if (ext === 'xml') {
    // Parse XML
    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text',
        parseAttributeValue: true,
        parseTagValue: true
      });
      const xmlData = parser.parse(buffer.toString());
      
      // Find the data array in the XML structure
      const findDataArray = (obj) => {
        if (Array.isArray(obj)) return obj;
        if (typeof obj === 'object' && obj !== null) {
          for (const key of Object.keys(obj)) {
            const result = findDataArray(obj[key]);
            if (result) return result;
          }
        }
        return null;
      };
      
      const dataArray = findDataArray(xmlData);
      if (dataArray) {
        rows.push(...dataArray);
      }
    } catch (xmlError) {
      systemLogger.error('XML parsing error in parseFileToRows:', xmlError);
    }
  } else if (ext === 'avro') {
    // Parse AVRO using fastavro via Python or fallback
    try {
      const fastavro = require('fastavro');
      const records = await fastavro.reader(buffer);
      for await (const record of records) {
        rows.push(record);
      }
    } catch (avroError) {
      systemLogger.warn('AVRO parsing not available in parseFileToRows, attempting alternate method:', avroError.message);
      // AVRO parsing may require Python fastavro, skip for now
    }
  } else if (ext === 'dat' || FIXED_WIDTH_EXTENSIONS.includes(ext)) {
    // Fixed-width DAT files - parse as delimited with space/tab detection
    try {
      const content = buffer.toString('utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length > 0) {
        // Try to detect if it's actually delimited
        const firstLine = lines[0];
        let delimiter = null;
        if (firstLine.includes('\t')) delimiter = '\t';
        else if (firstLine.includes('|')) delimiter = '|';
        else if (firstLine.includes(',')) delimiter = ',';
        
        if (delimiter) {
          const headers = firstLine.split(delimiter).map(h => h.trim());
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(delimiter).map(v => v.trim());
            const row = {};
            headers.forEach((header, idx) => {
              row[header] = values[idx] || '';
            });
            rows.push(row);
          }
        } else {
          // True fixed-width: create generic columns
          for (let i = 0; i < lines.length; i++) {
            rows.push({ line_number: i + 1, data: lines[i] });
          }
        }
      }
    } catch (datError) {
      systemLogger.error('DAT parsing error in parseFileToRows:', datError);
    }
  } else if (ext === 'sas7bdat' || ext === 'xpt') {
    // SAS formats - would need pyreadstat, skip for secondary sources
    systemLogger.warn(`SAS format (${ext}) not supported for secondary sources in multi-source joins`);
  } else if (ARCHIVE_EXTENSIONS.includes(ext)) {
    // Handle archive files - extract and parse the first supported file
    let tempDir = null;
    try {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'join-extract-'));
      // Use basename to strip any directory prefix (e.g., 'fisher/dim_customer.csv.zip' -> 'dim_customer.csv.zip')
      const archiveBasename = path.basename(filename);
      const archivePath = path.join(tempDir, archiveBasename);
      fs.writeFileSync(archivePath, buffer);
      
      // Get password from vendor agreement if available
      let archivePassword = null;
      if (pool && vendorAgreementId) {
        try {
          archivePassword = await getArchivePasswordFromVault(pool, vendorAgreementId, filename);
          if (archivePassword) {
            systemLogger.info('Retrieved archive password from vendor agreement for secondary source', {
              filename,
              vendorAgreementId,
              hasPassword: true
            });
          }
        } catch (pwdError) {
          systemLogger.warn('Failed to retrieve archive password:', pwdError.message);
        }
      }
      
      // Create mock virus scanner for extraction service
      const virusScanService = {
        scanFile: async (filePath) => ({ isInfected: false, skipped: true, viruses: [] })
      };
      
      // Create extraction service with proper dependencies
      const archiveService = new ArchiveExtractionService(pool, virusScanService, systemLogger);
      const extractionResult = await archiveService.extractArchive(
        archivePath,
        null, // No file ID for join lookups
        archivePassword,
        null // userId
      );
      
      // Find and parse the first supported data file
      const supportedDataExtensions = ['csv', 'json', 'jsonl', 'xlsx', 'xls', 'parquet', 'xml', 'txt', 'tsv', 'avro', 'dat'];
      const extractedFiles = extractionResult.files || [];
      
      systemLogger.info('Archive extraction completed for secondary source', {
        filename,
        extractedCount: extractedFiles.length,
        files: extractedFiles.map(f => f.relativePath || path.basename(f.fullPath || ''))
      });
      
      for (const extractedFile of extractedFiles) {
        // extractedFile has relativePath and fullPath from ArchiveExtractionService
        const extractedPath = extractedFile.fullPath;
        const extractedFileName = extractedFile.relativePath || path.basename(extractedPath);
        const extractedExt = extractedFileName.split('.').pop()?.toLowerCase();
        
        if (supportedDataExtensions.includes(extractedExt)) {
          const extractedBuffer = fs.readFileSync(extractedPath);
          const extractedRows = await parseFileToRows(extractedBuffer, extractedFileName, pool, vendorAgreementId);
          rows.push(...extractedRows);
          systemLogger.info('Parsed extracted file from archive', {
            extractedFile: extractedFileName,
            rowCount: extractedRows.length
          });
          break; // Only parse the first supported file
        }
      }
      // Cleanup the extraction service's temp directory if returned
      if (extractionResult.tempDir) {
        try {
          fs.rmSync(extractionResult.tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          systemLogger.warn('Failed to cleanup extraction temp dir:', cleanupError);
        }
      }
    } catch (archiveError) {
      systemLogger.error('Archive extraction error in parseFileToRows:', {
        filename,
        vendorAgreementId,
        error: archiveError.message,
        stack: archiveError.stack
      });
    } finally {
      // Cleanup our temp directory (where we wrote the archive) in finally block
      if (tempDir) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          systemLogger.warn('Failed to cleanup temp dir:', cleanupError);
        }
      }
    }
  }
  
  return rows;
}

/**
 * Apply join enrichment to transformed rows based on join specs and lookup tables
 * Supports one-to-many joins (array-based lookup tables) and cascaded joins
 * @param {Array<Object>} transformedRows - Array of transformed row objects
 * @param {Object} joinLookupTables - Lookup tables keyed by join node ID (values are arrays)
 * @param {Array<Object>} joinSpecs - Join specifications
 * @param {Object} logger - Logger for debug output
 * @returns {Array<Object>} - Enriched rows (may have more rows than input for one-to-many joins)
 */
function applyJoinEnrichment(transformedRows, joinLookupTables, joinSpecs, logger = null) {
  if (!joinLookupTables || !joinSpecs || joinSpecs.length === 0) {
    return transformedRows;
  }
  
  // Deep clone the input rows to prevent mutation of original data (BigInt-safe)
  let currentRows = transformedRows.map(row => deepCloneWithBigInt(row));
  let matchedCount = 0;
  let unmatchedCount = 0;
  
  // Apply joins in sequence (for cascaded joins)
  for (const joinSpec of joinSpecs) {
    // Check for either 'right' or 'left' lookup table - depends on which source is secondary
    const rightLookupKey = `${joinSpec.nodeId}_right`;
    const leftLookupKey = `${joinSpec.nodeId}_left`;
    const hasRightLookup = joinLookupTables[rightLookupKey] && Object.keys(joinLookupTables[rightLookupKey]).length > 0;
    const hasLeftLookup = joinLookupTables[leftLookupKey] && Object.keys(joinLookupTables[leftLookupKey]).length > 0;
    const lookupTable = hasRightLookup ? joinLookupTables[rightLookupKey] : joinLookupTables[leftLookupKey];
    const isLeftLookup = !hasRightLookup && hasLeftLookup;
    
    if (!lookupTable || !joinSpec.joinKeys || joinSpec.joinKeys.length === 0) {
      if (logger) {
        logger.warn('Join spec missing lookup table or join keys', {
          nodeId: joinSpec.nodeId,
          hasRightLookup,
          hasLeftLookup,
          joinKeysCount: joinSpec.joinKeys?.length || 0
        });
      }
      continue;
    }
    
    const joinType = (joinSpec.joinType || 'INNER').toUpperCase();
    const nextRows = [];
    
    // Log join configuration for first row debugging
    if (logger && currentRows.length > 0) {
      const firstPrimaryRow = currentRows[0];
      const firstLookupKey = Object.keys(lookupTable)[0];
      const firstSecondaryRow = lookupTable[firstLookupKey]?.[0];
      logger.info('Join enrichment debug - first rows', {
        primaryRowKeys: Object.keys(firstPrimaryRow),
        secondaryRowKeys: firstSecondaryRow ? Object.keys(firstSecondaryRow) : [],
        isLeftLookup: isLeftLookup,
        columnMappingsCount: joinSpec.columnMappings?.length || 0,
        columnMappings: joinSpec.columnMappings?.slice(0, 5)
      });
    }
    
    for (const row of currentRows) {
      // Build composite key from the CURRENT enriched row (supports cascaded joins)
      // When right lookup: use leftColumn from primary to look up right rows
      // When left lookup: use rightColumn from primary to look up left rows
      const keyParts = joinSpec.joinKeys.map(jk => {
        const columnName = isLeftLookup
          ? (jk.rightColumn || jk.right_column || jk.right)
          : (jk.leftColumn || jk.left_column || jk.left);
        return String(row[columnName] || '').trim().toLowerCase();
      });
      const compositeKey = keyParts.join('|');
      
      // Look up matching rows from secondary source (array-based for one-to-many support)
      const matchedSecondaryRows = lookupTable[compositeKey];
      
      if (matchedSecondaryRows && matchedSecondaryRows.length > 0) {
        matchedCount += matchedSecondaryRows.length;
        
        // For each matching secondary row, create an enriched output row
        for (const matchedSecondaryRow of matchedSecondaryRows) {
          // Deep clone both rows to prevent reference issues (BigInt-safe)
          const enrichedRow = deepCloneWithBigInt(row);
          const secondaryRowClone = deepCloneWithBigInt(matchedSecondaryRow);
          
          // Apply column mappings from the join node configuration
          if (joinSpec.columnMappings && joinSpec.columnMappings.length > 0) {
            for (const cm of joinSpec.columnMappings) {
              const sourceCol = cm.sourceColumn || cm.source_column || cm.source;
              // outputColumn is saved by frontend for renamed columns (e.g., customer_key -> customer_key_1)
              const targetCol = cm.outputColumn || cm.targetColumn || cm.target_column || cm.target || sourceCol;
              
              if (sourceCol && secondaryRowClone[sourceCol] !== undefined) {
                enrichedRow[targetCol] = secondaryRowClone[sourceCol];
              }
            }
          } else {
            // If no column mappings, merge all columns from secondary source
            // Use appropriate prefix based on which side was loaded
            const prefix = isLeftLookup ? 'src1_' : 'src2_';
            for (const [col, value] of Object.entries(secondaryRowClone)) {
              // Always prefix secondary-side columns to clearly distinguish from primary
              enrichedRow[`${prefix}${col}`] = value;
              // Also add unprefixed if no conflict, for backward compatibility
              if (enrichedRow[col] === undefined) {
                enrichedRow[col] = value;
              }
            }
          }
          
          nextRows.push(enrichedRow);
        }
      } else {
        unmatchedCount++;
        
        // For LEFT/LEFT OUTER joins, keep the row with nulls for secondary columns
        if (joinType === 'LEFT' || joinType === 'LEFT OUTER') {
          nextRows.push(deepCloneWithBigInt(row));
        }
        // INNER JOIN: Skip rows with no match (don't add to nextRows)
      }
    }
    
    // Update currentRows for the next join in the chain
    currentRows = nextRows;
    
    // Debug log first enriched row
    if (logger && currentRows.length > 0) {
      const firstEnrichedRow = currentRows[0];
      logger.info('Join enrichment debug - first enriched row', {
        enrichedRowKeys: Object.keys(firstEnrichedRow),
        sampleValues: Object.keys(firstEnrichedRow).slice(0, 10).reduce((acc, key) => {
          const val = firstEnrichedRow[key];
          acc[key] = typeof val === 'object' ? `[object: ${Object.keys(val || {}).join(',')}]` : String(val).substring(0, 50);
          return acc;
        }, {})
      });
    }
  }
  
  if (logger) {
    logger.info('Join enrichment completed', {
      inputRows: transformedRows.length,
      outputRows: currentRows.length,
      matchedJoins: matchedCount,
      unmatchedJoins: unmatchedCount
    });
  }
  
  return currentRows;
}

/**
 * Check if a file extension indicates an archive file
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if file is an archive
 */
function isArchiveFile(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return ARCHIVE_EXTENSIONS.some(ext => lower.endsWith(`.${ext}`));
}

/**
 * Get password for an archive from the vendor agreement password vault
 * @param {Object} pool - Database connection pool
 * @param {number} vendorAgreementId - Vendor agreement ID
 * @param {string} filename - Source filename to match
 * @returns {Promise<string|null>} - Decrypted password or null
 */
async function getArchivePasswordFromVault(pool, vendorAgreementId, filename) {
  try {
    // First, find the file schema that matches this filename
    // Note: Passwords are stored in encrypted_passwords table with entity_type='vendor_agreement_file_schema'
    const schemaResult = await pool.query(`
      SELECT vafs.id, vafs.file_name_pattern
      FROM vendor_agreement_file_schemas vafs
      WHERE vafs.vendor_agreement_id = $1 AND vafs.is_active = true
      ORDER BY vafs.priority ASC NULLS LAST
    `, [vendorAgreementId]);
    
    if (schemaResult.rows.length === 0) {
      return null;
    }
    
    // Find matching schema by pattern
    let matchedSchema = null;
    for (const schema of schemaResult.rows) {
      const pattern = schema.file_name_pattern;
      if (!pattern) continue;
      
      // Convert file pattern to regex (e.g., *.csv -> .*\.csv)
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      if (regex.test(filename)) {
        matchedSchema = schema;
        break;
      }
    }
    
    if (!matchedSchema) {
      // Use first schema as fallback
      matchedSchema = schemaResult.rows[0];
    }
    
    // Look up password in encrypted_passwords table
    const passwordResult = await pool.query(`
      SELECT ep.secret_ciphertext, ep.iv, ep.auth_tag
      FROM encrypted_passwords ep
      WHERE ep.entity_type = 'vendor_agreement_file_schema' 
      AND ep.entity_id = $1
    `, [matchedSchema.id.toString()]);
    
    if (passwordResult.rows.length === 0) {
      // Also try looking up by vendor agreement ID
      const agreementPasswordResult = await pool.query(`
        SELECT ep.secret_ciphertext, ep.iv, ep.auth_tag
        FROM encrypted_passwords ep
        WHERE ep.entity_type = 'vendor_agreement' 
        AND ep.entity_id = $1
      `, [vendorAgreementId.toString()]);
      
      if (agreementPasswordResult.rows.length === 0) {
        return null;
      }
      
      // Decrypt the password
      const PasswordVaultService = require('./passwordVaultService');
      const vaultService = new PasswordVaultService(pool, null, systemLogger);
      return vaultService.decrypt(
        agreementPasswordResult.rows[0].secret_ciphertext,
        agreementPasswordResult.rows[0].iv,
        agreementPasswordResult.rows[0].auth_tag
      );
    }
    
    // Decrypt the password
    const PasswordVaultService = require('./passwordVaultService');
    const vaultService = new PasswordVaultService(pool, null, systemLogger);
    return vaultService.decrypt(
      passwordResult.rows[0].secret_ciphertext,
      passwordResult.rows[0].iv,
      passwordResult.rows[0].auth_tag
    );
  } catch (error) {
    systemLogger.error('Failed to get archive password from vault', {
      vendorAgreementId,
      filename,
      error: error.message
    });
    return null;
  }
}

/**
 * Get fixed-width schema from vendor agreement for headerless file parsing
 * @param {Object} pool - Database connection pool
 * @param {number} vendorAgreementId - Vendor agreement ID
 * @param {string} filename - Source filename to match
 * @returns {Promise<Object|null>} - Schema with has_header and header_definition
 */
async function getFixedWidthSchemaFromAgreement(pool, vendorAgreementId, filename) {
  try {
    const result = await pool.query(`
      SELECT vafs.id, vafs.file_name_pattern, vafs.has_header, vafs.header_definition,
             vafs.file_type, vafs.schema
      FROM vendor_agreement_file_schemas vafs
      WHERE vafs.vendor_agreement_id = $1 AND vafs.is_active = true
      ORDER BY vafs.priority ASC NULLS LAST
    `, [vendorAgreementId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Find matching schema by pattern
    // Extract basename from filename (may include path like "fisher/dim_store.dat")
    const basename = filename.includes('/') ? filename.split('/').pop() : filename;
    
    let matchedSchema = null;
    for (const schema of result.rows) {
      const pattern = schema.file_name_pattern;
      if (!pattern) continue;
      
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      // Match against basename (e.g., "dim_store.dat") not full path
      if (regex.test(basename)) {
        matchedSchema = schema;
        systemLogger.info('Matched vendor agreement schema pattern', {
          vendorAgreementId,
          filename,
          basename,
          pattern,
          schemaId: schema.id
        });
        break;
      }
    }
    
    if (!matchedSchema) {
      // No pattern match found, check if any schema's file_type matches the file extension
      const fileExtension = basename.split('.').pop()?.toLowerCase();
      for (const schema of result.rows) {
        if (schema.file_type === fileExtension || 
            (schema.file_type === 'dat' && fileExtension === 'dat') ||
            (schema.file_type === 'fixed_width' && ['dat', 'txt'].includes(fileExtension))) {
          matchedSchema = schema;
          systemLogger.info('Matched vendor agreement schema by file type', {
            vendorAgreementId,
            filename,
            basename,
            fileType: schema.file_type,
            schemaId: schema.id
          });
          break;
        }
      }
    }
    
    if (!matchedSchema) {
      systemLogger.warn('No matching schema pattern found, using first available', {
        vendorAgreementId,
        filename,
        basename,
        availablePatterns: result.rows.map(r => r.file_name_pattern)
      });
      matchedSchema = result.rows[0];
    }
    
    // Parse header_definition if it's a string
    let headerDef = matchedSchema.header_definition;
    if (typeof headerDef === 'string') {
      try {
        headerDef = JSON.parse(headerDef);
      } catch (e) {
        headerDef = null;
      }
    }
    
    // Fallback: Use schema column if header_definition is empty/null
    // The schema column contains the column definitions with width and start_position
    if (!headerDef || (Array.isArray(headerDef) && headerDef.length === 0)) {
      let rawSchemaDef = matchedSchema.schema;
      if (typeof rawSchemaDef === 'string') {
        try {
          rawSchemaDef = JSON.parse(rawSchemaDef);
        } catch (e) {
          rawSchemaDef = null;
        }
      }
      // Support both legacy bare array and new { columns, file_quality_rules } shape
      let schemaDef = Array.isArray(rawSchemaDef) ? rawSchemaDef : (Array.isArray(rawSchemaDef?.columns) ? rawSchemaDef.columns : rawSchemaDef);
      // Use schema as header definition if it has column definitions with width/start_position
      if (Array.isArray(schemaDef) && schemaDef.length > 0) {
        // Check if schema contains fixed-width column definitions
        const hasFixedWidthInfo = schemaDef.some(col => 
          col.width !== undefined || col.start_position !== undefined
        );
        if (hasFixedWidthInfo) {
          headerDef = schemaDef;
          systemLogger.info('Using schema column as header definition for fixed-width file', {
            vendorAgreementId,
            filename,
            columnCount: schemaDef.length
          });
        }
      }
    }
    
    return {
      schemaId: matchedSchema.id,
      fileType: matchedSchema.file_type,
      hasHeader: matchedSchema.has_header !== false,
      headerDefinition: headerDef,
      schema: matchedSchema.schema
    };
  } catch (error) {
    systemLogger.error('Failed to get fixed-width schema from agreement', {
      vendorAgreementId,
      filename,
      error: error.message
    });
    return null;
  }
}

/**
 * Parse a fixed-width file buffer using column positions from schema
 * @param {Buffer} buffer - File buffer
 * @param {Array} columns - Column definitions with name, width, start_position
 * @param {Object} options - Parsing options
 * @returns {Object} - Parsed rows and metadata
 */
function parseFixedWidthBuffer(buffer, columns, options = {}) {
  const { hasHeader = false } = options;
  const content = buffer.toString('utf8');
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  
  const rows = [];
  const startIndex = hasHeader ? 1 : 0;
  
  // Sort columns by start_position
  const sortedColumns = [...columns].sort((a, b) => 
    (a.start_position || 0) - (b.start_position || 0)
  );
  
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const row = {};
    
    for (const col of sortedColumns) {
      const start = col.start_position || 0;
      const width = col.width || 10;
      const value = line.substring(start, start + width).trim();
      row[col.name] = value;
    }
    
    rows.push(row);
  }
  
  return {
    rows,
    rowCount: rows.length,
    columns: sortedColumns.map(c => c.name)
  };
}

/**
 * Replace dynamic placeholders in file name with actual values
 * @param {string} fileName - File name with placeholders
 * @returns {string} - File name with replaced values
 */
function replacePlaceholders(fileName) {
  if (!fileName) return fileName;
  
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const timestampStr = Math.floor(now.getTime() / 1000).toString(); // Unix timestamp
  
  return fileName
    .replace(/<current_date>/g, dateStr)
    .replace(/<current_timestamp>/g, timestampStr);
}

/**
 * Job Execution Engine
 * Handles execution of transformation mappings with comprehensive tracking and error handling
 */

/**
 * Create a new transformation job
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @param {string} userId - User ID executing the job
 * @param {Object} options - Optional metadata
 * @param {number} options.mappingGroupExecutionId - Mapping group execution ID if part of a group
 * @param {number} options.scheduleId - Schedule ID if triggered by a schedule
 * @param {number} options.workflowExecutionId - Workflow execution ID if part of a workflow
 * @param {number} options.visualWorkflowExecutionId - Visual workflow execution ID if part of a visual workflow
 * @returns {Promise<Object>} - Created job record
 */
async function createJob(pool, mappingId, userId, options = {}) {
  try {
    console.log(`[JOB-EXECUTION-ENGINE] createJob called with mappingId: ${mappingId}`);
    
    // Get mapping details
    const mappingResult = await pool.query(
      'SELECT * FROM transformation_mappings WHERE mapping_id = $1',
      [mappingId]
    );
    
    console.log(`[JOB-EXECUTION-ENGINE] Mapping query returned ${mappingResult.rows.length} rows`);
    
    if (mappingResult.rows.length === 0) {
      throw new Error(`Mapping not found: ${mappingId}`);
    }
    
    const mapping = mappingResult.rows[0];
    const jobId = `JOB-${Date.now()}-${uuidv4().substring(0, 8)}`;
    const correlationId = jobId; // Use jobId as correlation ID for source/target file linking
    
    console.log(`[JOB-EXECUTION-ENGINE] Creating job ${jobId} for mapping ${mappingId}`);
    
    const result = await pool.query(`
      INSERT INTO transformation_jobs (
        job_id, mapping_id, mapping_name, executed_by, status, 
        mapping_group_execution_id, schedule_id, workflow_execution_id, visual_workflow_execution_id, project_id, correlation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      jobId, 
      mappingId, 
      mapping.mapping_name, 
      userId, 
      'running',
      options.mappingGroupExecutionId || null,
      options.scheduleId || null,
      options.workflowExecutionId || null,
      options.visualWorkflowExecutionId || null,
      mapping.project_id,
      correlationId
    ]);
    
    console.log(`[JOB-EXECUTION-ENGINE] Job inserted, result rows: ${result.rows.length}`);
    
    const transformationJobDbId = result.rows[0].id; // Get database ID for linking to audit
    
    console.log(`[JOB-EXECUTION-ENGINE] Job created with DB ID: ${transformationJobDbId}`);
    
    systemLogger.info('Transformation job created', { 
      jobId, 
      mappingId, 
      mappingGroupExecutionId: options.mappingGroupExecutionId,
      scheduleId: options.scheduleId,
      workflowExecutionId: options.workflowExecutionId,
      visualWorkflowExecutionId: options.visualWorkflowExecutionId
    });
    
    return result.rows[0];
    
  } catch (error) {
    systemLogger.error('Error creating job:', error);
    throw error;
  }
}

/**
 * Log job execution details
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - Log message
 * @param {Object} details - Additional details
 * @param {string} visualExecutionId - Optional visual mapping execution ID for WebSocket logs
 * @param {Object} ledgerContext - Optional context for immutable audit ledger
 */
async function logJobExecution(pool, jobId, level, message, details = {}, visualExecutionId = null, ledgerContext = null) {
  try {
    await pool.query(`
      INSERT INTO transformation_logs (
        job_id, log_level, message, log_details
      ) VALUES ($1, $2, $3, $4)
    `, [jobId, level, message, JSON.stringify(details)]);
    
    // Emit log via WebSocket for visual mapping executions
    if (visualExecutionId) {
      visualMappingWS.emitExecutionLog(visualExecutionId, level, message, details);
    }
    
    // Write to immutable audit ledger for regulatory compliance
    try {
      const ledgerService = new ImmutableAuditLedgerService(pool);
      await ledgerService.appendEntry({
        jobId: jobId,
        correlationId: ledgerContext?.correlationId || details.correlationId,
        actorId: ledgerContext?.userId?.toString(),
        actorEmail: ledgerContext?.userEmail,
        actorRole: ledgerContext?.userRole,
        actorIp: ledgerContext?.userIp,
        actionType: 'JOB_EXECUTION',
        actionCategory: 'EXECUTION',
        entityType: 'TRANSFORMATION_JOB',
        entityId: jobId,
        entityName: ledgerContext?.mappingName || details.mappingName,
        logLevel: level.toUpperCase(),
        message: message,
        payload: {
          ...details,
          sessionId: ledgerContext?.sessionId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (ledgerError) {
      // Don't fail job execution if ledger write fails, just log it
      systemLogger.error('Error writing to audit ledger:', ledgerError);
    }
    
  } catch (error) {
    systemLogger.error('Error logging job execution:', error);
  }
}

/**
 * Update job status and statistics
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated job record
 */
async function updateJob(pool, jobId, updates) {
  try {
    // If end_time is being set, calculate duration_ms
    if (updates.end_time) {
      const jobResult = await pool.query(
        'SELECT start_time FROM transformation_jobs WHERE job_id = $1',
        [jobId]
      );
      
      if (jobResult.rows.length > 0) {
        const startTime = new Date(jobResult.rows[0].start_time);
        const endTime = new Date(updates.end_time);
        updates.duration_ms = endTime.getTime() - startTime.getTime();
      }
    }
    
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
    
    values.push(jobId);
    
    const query = `
      UPDATE transformation_jobs
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE job_id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
    
  } catch (error) {
    systemLogger.error('Error updating job:', error);
    throw error;
  }
}

/**
 * Persist quality rule violations to database
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @param {string} fileId - File ID (can be null)
 * @param {Array} violations - Array of violation objects from QualityValidationEngine
 * @returns {Promise<number>} - Number of violations persisted
 */
async function persistViolations(pool, jobId, fileId, violations) {
  if (!violations || violations.length === 0) {
    return 0;
  }
  
  try {
    // Build batch insert query using VALUES with multiple rows
    const values = [];
    const paramGroups = [];
    let paramIndex = 1;
    
    for (const violation of violations) {
      const paramGroup = [];
      
      // rule_id
      paramGroup.push(`$${paramIndex++}`);
      values.push(violation.rule_id);
      
      // file_id (can be null)
      paramGroup.push(`$${paramIndex++}`);
      values.push(fileId || null);
      
      // job_id
      paramGroup.push(`$${paramIndex++}`);
      values.push(jobId);
      
      // row_number
      paramGroup.push(`$${paramIndex++}`);
      values.push(violation.row_number || null);
      
      // column_name
      paramGroup.push(`$${paramIndex++}`);
      values.push(violation.column_name || null);
      
      // expected_value
      paramGroup.push(`$${paramIndex++}`);
      values.push(violation.expected_value || null);
      
      // actual_value
      paramGroup.push(`$${paramIndex++}`);
      values.push(violation.actual_value || null);
      
      // violation_details (JSONB)
      paramGroup.push(`$${paramIndex++}::jsonb`);
      values.push(JSON.stringify(violation.violation_details || {}));
      
      // severity
      paramGroup.push(`$${paramIndex++}`);
      values.push(violation.severity || 'warning');
      
      // status (default to 'new')
      paramGroup.push(`$${paramIndex++}`);
      values.push('new');
      
      // processing_action (default to 'logged')
      paramGroup.push(`$${paramIndex++}`);
      values.push('logged');
      
      // record_snapshot (JSONB)
      paramGroup.push(`$${paramIndex++}::jsonb`);
      values.push(JSON.stringify(violation.record_snapshot || {}));
      
      paramGroups.push(`(${paramGroup.join(', ')})`);
    }
    
    const query = `
      INSERT INTO quality_rule_violations (
        rule_id, file_id, job_id, row_number, column_name,
        expected_value, actual_value, violation_details, severity,
        status, processing_action, record_snapshot
      ) VALUES ${paramGroups.join(', ')}
    `;
    
    await pool.query(query, values);
    
    systemLogger.info('Quality violations persisted', {
      jobId,
      fileId,
      violationCount: violations.length
    });
    
    return violations.length;
    
  } catch (error) {
    systemLogger.error('Error persisting quality violations:', {
      jobId,
      fileId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Update transformation_executions record (called by TransformationService)
 * @param {Pool} pool - Database connection pool
 * @param {string} executionId - Execution ID
 * @param {string} status - Status (COMPLETED or FAILED)
 * @param {Object} result - Result data
 */
async function updateTransformationExecution(pool, executionId, status, result = {}) {
  if (!executionId) return; // Skip if no execution tracking
  
  try {
    await pool.query(
      `UPDATE transformation_executions
       SET status = $1,
           completed_at = NOW(),
           result = $2,
           updated_at = NOW()
       WHERE execution_id = $3`,
      [status, JSON.stringify(result), executionId]
    );
    
    systemLogger.info('Updated transformation_executions record', {
      executionId,
      status
    });
  } catch (error) {
    systemLogger.warn('Failed to update transformation_executions', {
      executionId,
      status,
      error: error.message
    });
  }
}

/**
 * Execute a transformation mapping
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @param {string} userId - User ID executing the job
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} - Job execution result
 */
async function executeTransformationJob(pool, mappingId, userId, options = {}) {
  const {
    runSchemaValidation = true,
    runProfilingChecks = true,
    dryRun = false,
    existingJob = null,
    mappingGroupExecutionId = null,
    scheduleId = null,
    workflowExecutionId = null,
    visualWorkflowExecutionId = null,
    visualMappingExecutionId = null,  // NEW: passed directly from visual mappings route
    transformationExecutionId = null,  // NEW: passed from TransformationService for execution tracking
    visualMappingNodes = null,        // Visual mapping graph nodes for status tracking
    visualMappingEdges = null,        // Visual mapping graph edges for row count tracking
    nodeExecutionMap = null,          // Map of node ID to execution step
    executionOrder = null,            // Ordered array of node IDs
    // User context for audit logging
    userEmail = null,
    userRole = null,
    userIp = null,
    sessionId = null
  } = options;
  
  // Build ledger context for audit logging throughout execution
  const ledgerContext = {
    userId,
    userEmail,
    userRole,
    userIp,
    sessionId,
    correlationId: null, // Will be set from job record
    mappingName: null    // Will be set from mapping config
  };
  
  let job = existingJob;
  let mapping = null;
  let visualExecutionId = null;
  
  // Hoist node structures outside try block so they can be accessed in catch
  const nodeMap = {};
  const nodesByType = { sourceConfig: [], expression: [], rdmLookup: [], targetRules: [], join: [] };
  
  try {
    // Create job only if not provided
    if (!job) {
      job = await createJob(pool, mappingId, userId, {
        mappingGroupExecutionId,
        scheduleId,
        workflowExecutionId,
        visualWorkflowExecutionId
      });
    }
    const jobId = job.job_id;
    const transformationJobDbId = job.id; // Database ID for linking to audit
    const correlationId = job.correlation_id || jobId;
    
    // Update ledger context with job-specific data
    ledgerContext.correlationId = correlationId;
    
    // Get mapping configuration
    mapping = await getMappingConfig(pool, mappingId);
    
    // Set mapping name in ledger context
    ledgerContext.mappingName = mapping.mapping_name;
    
    await logJobExecution(pool, jobId, 'info', 'Job execution started', { mappingId, userId, correlationId }, null, ledgerContext);
    
    // Track if this is a visual mapping execution
    const isVisualMapping = mapping.is_visual_mapping && mapping.visual_mapping_id;
    
    // Use visualMappingExecutionId from options if provided (avoids query)
    if (isVisualMapping && visualMappingExecutionId) {
      visualExecutionId = visualMappingExecutionId;
      
      // Emit execution start event
      visualMappingWS.emitExecutionProgress(visualExecutionId, 0);
      visualMappingWS.emitExecutionLog(visualExecutionId, 'info', `Execution started for job ${jobId}`);
      systemLogger.info('Visual mapping execution started - WebSocket tracking enabled', {
        visualExecutionId,
        visualMappingId: mapping.visual_mapping_id,
        jobId,
        source: 'options.visualMappingExecutionId'
      });
    }
    
    // Build node map for visual mapping status updates
    if (visualMappingNodes && Array.isArray(visualMappingNodes)) {
      visualMappingNodes.forEach(node => {
        nodeMap[node.id] = node;
        if (nodesByType[node.type]) {
          nodesByType[node.type].push(node.id);
        }
      });
    }
    
    // Helper to emit node status for visual mapping
    const emitNodeStatus = (nodeId, status, metadata = {}) => {
      if (visualExecutionId && nodeId) {
        visualMappingWS.emitNodeStatus(visualExecutionId, nodeId, status, metadata);
      }
    };
    
    // Helper to emit edge row count for visual mapping
    const emitEdgeRowCount = (sourceNodeId, targetNodeId, rowCount) => {
      if (visualExecutionId && sourceNodeId && targetNodeId && visualMappingEdges) {
        const edge = visualMappingEdges.find(e => e.source === sourceNodeId && e.target === targetNodeId);
        if (edge) {
          visualMappingWS.emitEdgeRowCount(visualExecutionId, edge.id, sourceNodeId, targetNodeId, rowCount);
        }
      }
    };
    
    // Helper to emit execution logs via WebSocket (for visual mapping console panel)
    const emitLog = (level, message, details = {}) => {
      if (visualExecutionId) {
        visualMappingWS.emitExecutionLog(visualExecutionId, level, message, details);
      }
    };
    
    // Emit execution start to reset all edge counts on the frontend
    if (visualExecutionId && visualMappingEdges && Array.isArray(visualMappingEdges)) {
      visualMappingWS.emitExecutionStart(visualExecutionId, visualMappingEdges);
    }
    
    // Mark all nodes as pending initially
    if (executionOrder && Array.isArray(executionOrder)) {
      executionOrder.forEach(nodeId => {
        emitNodeStatus(nodeId, 'pending');
      });
    }
    
    // Load RDM context once for this job (before processing any files)
    let rdmContext = {};
    const hasRdmNodes = nodesByType.rdmLookup.length > 0;
    
    try {
      // Parse RDM configs if they're stored as JSON strings
      // Support both singular (legacy) and plural (visual mapping) formats
      let rdmDatasetConfig = mapping.rdm_dataset_config;
      let rdmCrosswalkConfig = mapping.rdm_crosswalk_config;
      let rdmDatasetConfigs = mapping.rdm_dataset_configs || [];
      let rdmCrosswalkConfigs = mapping.rdm_crosswalk_configs || [];
      
      if (typeof rdmDatasetConfig === 'string') {
        rdmDatasetConfig = JSON.parse(rdmDatasetConfig);
      }
      if (typeof rdmCrosswalkConfig === 'string') {
        rdmCrosswalkConfig = JSON.parse(rdmCrosswalkConfig);
      }
      if (typeof rdmDatasetConfigs === 'string') {
        rdmDatasetConfigs = JSON.parse(rdmDatasetConfigs);
      }
      if (typeof rdmCrosswalkConfigs === 'string') {
        rdmCrosswalkConfigs = JSON.parse(rdmCrosswalkConfigs);
      }
      
      // Handle case where singular config columns contain arrays (visual mapping format)
      // This happens when arrays are stored in rdm_dataset_config/rdm_crosswalk_config columns
      if (Array.isArray(rdmDatasetConfig)) {
        rdmDatasetConfigs = [...rdmDatasetConfigs, ...rdmDatasetConfig];
        rdmDatasetConfig = null; // Clear singular, we've moved to plural
      }
      if (Array.isArray(rdmCrosswalkConfig)) {
        rdmCrosswalkConfigs = [...rdmCrosswalkConfigs, ...rdmCrosswalkConfig];
        rdmCrosswalkConfig = null; // Clear singular, we've moved to plural
      }
      
      // Check if any RDM configs are present
      const hasRdmConfigs = rdmDatasetConfig || rdmCrosswalkConfig || 
                            (rdmDatasetConfigs && rdmDatasetConfigs.length > 0) || 
                            (rdmCrosswalkConfigs && rdmCrosswalkConfigs.length > 0);
      
      // Emit running status for RDM lookup nodes
      if (hasRdmNodes && hasRdmConfigs) {
        nodesByType.rdmLookup.forEach(nodeId => {
          emitNodeStatus(nodeId, 'running', { phase: 'loading_rdm_context' });
        });
      }
      
      rdmContext = await loadRDMContext(
        mapping.field_mappings || [], 
        mapping.variables || [],
        rdmDatasetConfig,
        rdmCrosswalkConfig,
        rdmDatasetConfigs,
        rdmCrosswalkConfigs
      );
      
      const hasRDMData = Object.keys(rdmContext.rdm?.crosswalks || {}).length > 0 || 
                         Object.keys(rdmContext.rdm?.datasets || {}).length > 0;
      
      if (hasRDMData) {
        await logJobExecution(pool, jobId, 'info', 'RDM context loaded successfully', {
          crosswalkCount: Object.keys(rdmContext.rdm.crosswalks).length,
          datasetCount: Object.keys(rdmContext.rdm.datasets).length
        });
        
        // RDM nodes stay running - they'll complete when lookups are performed during transformation
      }
    } catch (rdmError) {
      // Fatal error if RDM resources were required but failed to load
      await logJobExecution(pool, jobId, 'error', 'Failed to load required RDM resources', {
        error: rdmError.message
      });
      
      // Emit failed status for RDM lookup nodes
      nodesByType.rdmLookup.forEach(nodeId => {
        emitNodeStatus(nodeId, 'failed', { error: rdmError.message });
      });
      
      await updateJob(pool, jobId, {
        status: 'failed',
        error_message: `RDM context loading failed: ${rdmError.message}`,
        end_time: new Date()
      });
      
      // Update transformation_executions if tracking
      await updateTransformationExecution(pool, transformationExecutionId, 'FAILED', {
        error: rdmError.message
      });
      
      throw rdmError;
    }
    
    // Step 1: Build full file path and find matching files from cloud storage
    // Emit running status for source config nodes
    nodesByType.sourceConfig.forEach(nodeId => {
      emitNodeStatus(nodeId, 'running', { phase: 'file_matching' });
    });
    
    const filePath = mapping.file_path || '';
    const fileNamePattern = mapping.file_name_pattern || mapping.source_file_pattern;
    
    // Build full pattern: file_path + file_name_pattern
    // Ensure exactly one separator between path and pattern
    let fullPattern;
    if (filePath) {
      const normalizedPath = filePath.replace(/^\//, '').replace(/\/$/, ''); // Remove leading/trailing slashes
      fullPattern = normalizedPath ? `${normalizedPath}/${fileNamePattern}` : fileNamePattern;
    } else {
      fullPattern = fileNamePattern;
    }
    
    // Check if this is a single file (no wildcards) or a pattern
    const isSingleFile = !fileNamePattern.includes('*') && !fileNamePattern.includes('?');
    
    await logJobExecution(pool, jobId, 'info', 'Finding matching files from cloud storage', { 
      file_path: filePath,
      file_name_pattern: fileNamePattern,
      full_pattern: fullPattern,
      is_single_file: isSingleFile,
      connection_id: mapping.source_connection_id
    });
    
    const cloudFiles = await listAndFilterFiles(
      pool, 
      mapping.source_connection_id, 
      fullPattern
    );
    
    if (cloudFiles.length === 0) {
      const errorMessage = isSingleFile 
        ? `File not found: ${fullPattern}. Please verify the file path and name are correct.`
        : `No files matched the pattern '${fullPattern}' in cloud storage`;
      
      // Emit failed status for source nodes
      nodesByType.sourceConfig.forEach(nodeId => {
        emitNodeStatus(nodeId, 'failed', { error: errorMessage });
      });
      
      await updateJob(pool, jobId, { 
        status: 'failed', 
        error_message: errorMessage,
        end_time: new Date()
      });
      
      // Update transformation_executions if tracking
      await updateTransformationExecution(pool, transformationExecutionId, 'FAILED', {
        error: errorMessage,
        filesProcessed: 0
      });
      
      await logJobExecution(pool, jobId, 'error', errorMessage, { 
        full_pattern: fullPattern,
        file_path: filePath,
        file_name_pattern: fileNamePattern
      });
      
      // Capture file audit entry for failed job (no files matched)
      try {
        await captureFileAudit(pool, {
          fileId: `job_${jobId}_failed`,
          fileName: fullPattern,
          fileSchemaId: null,
          fileHash: null,
          filePattern: fileNamePattern,
          fileType: 'unknown',
          fileDelimiter: null,
          encoding: 'utf-8',
          numberOfColumns: null,
          fileSizeBytes: 0,
          source: 'transformation',
          sourcePath: filePath,
          noOfRecordsInSource: 0,
          loadStep1: 'file_matching',
          loadStep1Path: fullPattern,
          loadStep1RecCnt: 0,
          loadType: 'etl_transformation',
          correlationId,
          transformationJobId: transformationJobDbId,
          mappingName: mapping.mapping_name,
          userId: userId,
          userEmail: ledgerContext?.userEmail,
          ipAddress: ledgerContext?.userIp,
          sessionId: ledgerContext?.sessionId,
          processingDurationMs: Date.now() - (job.start_time ? new Date(job.start_time).getTime() : Date.now()),
          status: 'failed',
          errorMessage: errorMessage,
          errorType: 'no_files_matched',
          createdBy: userId,
          fileRole: 'source'
        });
        systemLogger.info('File audit captured for failed job (no files matched)', {
          jobId,
          correlationId,
          pattern: fullPattern
        });
      } catch (auditError) {
        systemLogger.error('Failed to capture file audit for failed job', {
          jobId,
          error: auditError.message
        });
      }
      
      return { 
        jobId, 
        status: 'failed', 
        filesProcessed: 0,
        message: errorMessage
      };
    }
    
    await logJobExecution(pool, jobId, 'info', `Found ${cloudFiles.length} matching files in cloud storage`);
    emitLog('info', `Found ${cloudFiles.length} matching file(s) in source`);
    
    // Emit completed status for source nodes with file count
    nodesByType.sourceConfig.forEach(nodeId => {
      emitNodeStatus(nodeId, 'completed', { filesFound: cloudFiles.length });
    });
    
    // Convert cloud file objects to format expected by processFile
    const matchingFiles = cloudFiles.map(file => ({
      filename: file.filename,
      file_id: null, // Cloud files don't have DB file_id
      file_size: file.size,
      row_count: 0 // Will be determined during processing
    }));
    
    // Step 1.5: Schema Drift Validation (for all source types)
    // Always run validation when schema is defined, regardless of handling policy
    const hasSchemaToValidate = mapping.vendor_agreement_id || (mapping.source_schema && mapping.source_schema.length > 0);
    
    if (hasSchemaToValidate && runSchemaValidation) {
      const sourceType = mapping.vendor_agreement_id ? 'vendor agreement' : 'connection';
      await logJobExecution(pool, jobId, 'info', `Validating file schema against ${sourceType}`);
      
      try {
        let validationResult;
        
        if (mapping.vendor_agreement_id) {
          // Vendor agreement validation
          const { validateFileSchema } = require('./schemaValidationService');
          
          const fileToValidate = cloudFiles[0];
          const fileName = fileToValidate.filename;
          const filePathPart = fileName.substring(0, fileName.lastIndexOf('/'));
          const fileNamePart = fileName.substring(fileName.lastIndexOf('/') + 1);
          
          validationResult = await validateFileSchema(
            mapping.vendor_agreement_id,
            mapping.source_connection_id,
            filePathPart,
            fileNamePart,
            mapping.vendor_agreement_file_schema_id || null
          );
        } else if (mapping.source_schema && mapping.source_schema.length > 0) {
          // Regular connection validation - compare against stored mapping schema
          const { extractSchemaFromBuffer } = require('./schemaService');
          const fileToValidate = cloudFiles[0];
          const fileBuffer = await downloadFileFromConnection(pool, mapping.source_connection_id, fileToValidate.filename, { partial: true, maxBytes: 1024 * 1024 });
          const actualSchema = await extractSchemaFromBuffer(fileBuffer, fileToValidate.filename);
          
          // Compare schemas
          const expectedSchema = mapping.source_schema;
          const expectedFields = expectedSchema.map(f => f.name).sort();
          const actualFields = actualSchema.map(f => f.name).sort();
          
          const schemaDrift = expectedFields.join(',') !== actualFields.join(',');
          
          if (schemaDrift) {
            const missingFields = expectedFields.filter(f => !actualFields.includes(f));
            const newFields = actualFields.filter(f => !expectedFields.includes(f));
            
            validationResult = {
              valid: false,
              schemaDrift: true,
              message: `Schema mismatch detected. Missing fields: [${missingFields.join(', ')}]. New fields: [${newFields.join(', ')}]`,
              actualSchema,
              expectedSchema,
              differences: { missingFields, newFields }
            };
          } else {
            validationResult = {
              valid: true,
              schemaDrift: false,
              message: 'Schema validation passed',
              actualSchema,
              expectedSchema,
              differences: null
            };
          }
        } else {
          // No schema defined, skip validation
          await logJobExecution(pool, jobId, 'info', 'No schema validation required (schema not defined in mapping)');
          validationResult = null;
        }
        
        if (validationResult) {
          await logJobExecution(pool, jobId, 'info', `Schema validation result: ${validationResult.message}`, {
            schemaDrift: validationResult.schemaDrift,
            valid: validationResult.valid
          });
          
          // Update job with schema validation status
          const schemaValidationStatus = validationResult.schemaDrift ? 'Fail' : 'Pass';
          await updateJob(pool, jobId, { 
            schema_validation: schemaValidationStatus
          });
          
          // Handle schema drift based on policy
          if (validationResult.schemaDrift) {
            const driftMessage = `Schema drift detected: ${validationResult.message}`;
            
            // Create anomaly record for schema drift
            try {
              const { v4: uuidv4 } = require('uuid');
              const anomalyId = `DRIFT-${Date.now()}-${uuidv4().substring(0, 8)}`;
              
              // Determine severity based on differences
              let severity = 'medium';
              if (validationResult.differences) {
                const { missingFields = [], newFields = [] } = validationResult.differences;
                if (missingFields.length > 0) {
                  severity = 'high';
                } else if (newFields.length > 3) {
                  severity = 'medium';
                } else {
                  severity = 'low';
                }
              }
              
              await pool.query(`
                INSERT INTO anomalies (
                  anomaly_id, file_id, file_name, mapping_id, job_id,
                  anomaly_type, severity, title, description, anomaly_details,
                  expected_value, actual_value, status, detected_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
              `, [
                anomalyId,
                sourceFileId || null,
                sourceName,
                mapping.id,
                jobId,
                'schema_drift',
                severity,
                'Schema Drift Detected',
                driftMessage,
                JSON.stringify(validationResult.differences || {}),
                JSON.stringify(validationResult.expectedSchema || []),
                JSON.stringify(validationResult.actualSchema || []),
                'active'
              ]);
              
              await logJobExecution(pool, jobId, 'info', `Anomaly record created for schema drift: ${anomalyId}`);
            } catch (anomalyError) {
              await logJobExecution(pool, jobId, 'warn', `Failed to create anomaly record: ${anomalyError.message}`);
            }
            
            if (mapping.schema_drift_handling === 'abort') {
              // Emit failed status for all nodes on schema drift abort
              if (visualExecutionId) {
                [...nodesByType.sourceConfig, ...nodesByType.expression, ...nodesByType.join, 
                 ...nodesByType.rdmLookup, ...nodesByType.targetRules].forEach(nodeId => {
                  emitNodeStatus(nodeId, 'failed', { error: 'Schema drift detected - execution aborted' });
                });
              }
              
              // Abort job execution
              await updateJob(pool, jobId, { 
                status: 'failed', 
                error_message: driftMessage,
                end_time: new Date()
              });
              
              await logJobExecution(pool, jobId, 'error', driftMessage, { 
                differences: validationResult.differences,
                actualSchema: validationResult.actualSchema,
                expectedSchema: validationResult.expectedSchema
              });
              
              return { 
                jobId, 
                status: 'failed', 
                filesProcessed: 0,
                message: driftMessage,
                schemaDrift: true
              };
            } else if (mapping.schema_drift_handling === 'alert') {
              // Log warning and continue processing
              await logJobExecution(pool, jobId, 'warn', driftMessage, { 
                differences: validationResult.differences,
                actualSchema: validationResult.actualSchema,
                expectedSchema: validationResult.expectedSchema
              });
            }
          } else {
            await logJobExecution(pool, jobId, 'info', `Schema validation passed for ${sourceType}`);
          }
        }
        
      } catch (schemaValidationError) {
        await logJobExecution(pool, jobId, 'warn', `Schema validation error: ${schemaValidationError.message}. Continuing with file processing.`);
        // Set validation status as N/A due to error
        await updateJob(pool, jobId, { 
          schema_validation: null
        });
      }
    }
    
    // Step 2: Schema validation for file patterns (multiple files)
    if (runSchemaValidation && !isSingleFile && cloudFiles.length > 1) {
      await logJobExecution(pool, jobId, 'info', 'Validating schema consistency across matched files');
      
      try {
        // Download first few bytes of each file to extract schema
        const schemas = [];
        for (const file of cloudFiles) {
          try {
            const { extractSchemaFromBuffer } = require('./schemaService');
            const fileBuffer = await downloadFileFromConnection(pool, mapping.source_connection_id, file.filename, { partial: true, maxBytes: 1024 * 1024 });
            const schema = await extractSchemaFromBuffer(fileBuffer, file.filename);
            schemas.push({ filename: file.filename, schema });
          } catch (err) {
            await logJobExecution(pool, jobId, 'warn', `Could not extract schema from ${file.filename}: ${err.message}`);
          }
        }
        
        // Check for schema mismatches
        if (schemas.length > 1) {
          const baseSchema = schemas[0].schema;
          const mismatches = [];
          
          for (let i = 1; i < schemas.length; i++) {
            const currentSchema = schemas[i].schema;
            const baseFields = baseSchema.map(f => f.name).sort().join(',');
            const currentFields = currentSchema.map(f => f.name).sort().join(',');
            
            if (baseFields !== currentFields) {
              mismatches.push({
                file: schemas[i].filename,
                baseFile: schemas[0].filename,
                baseFields: baseSchema.map(f => f.name),
                currentFields: currentSchema.map(f => f.name)
              });
            }
          }
          
          if (mismatches.length > 0) {
            const errorMessage = `Schema mismatch detected across ${mismatches.length} file(s). All files matching a pattern must have identical schemas.`;
            
            // Emit failed status for all nodes on schema validation failure
            if (visualExecutionId) {
              [...nodesByType.sourceConfig, ...nodesByType.expression, ...nodesByType.join, 
               ...nodesByType.rdmLookup, ...nodesByType.targetRules].forEach(nodeId => {
                emitNodeStatus(nodeId, 'failed', { error: 'Schema validation failed' });
              });
            }
            
            await updateJob(pool, jobId, { 
              status: 'failed', 
              error_message: errorMessage,
              end_time: new Date()
            });
            
            await logJobExecution(pool, jobId, 'error', errorMessage, { 
              mismatches,
              totalFilesChecked: schemas.length
            });
            
            return { 
              jobId, 
              status: 'failed', 
              filesProcessed: 0,
              message: errorMessage,
              details: mismatches
            };
          }
          
          await logJobExecution(pool, jobId, 'info', `Schema validation passed: All ${schemas.length} files have consistent schemas`);
        }
      } catch (schemaError) {
        await logJobExecution(pool, jobId, 'warn', `Schema validation error: ${schemaError.message}. Continuing with file processing.`);
      }
    }
    
    // Step 2.5: Multi-Source Join Preparation
    // Load secondary source files into memory lookup tables for join enrichment
    let joinLookupTables = {};
    // Track row counts per node for accurate edge display (needs to be in outer scope for callback access)
    // This tracks output row counts for ALL nodes: source, expression, join, target
    const nodeOutputCounts = {};
    
    // Build node parent map for lineage tracking (which node feeds into which)
    // Key: child node ID, Value: array of parent node IDs
    const nodeParentMap = {};
    // Key: child node ID + handle, Value: parent node ID (for join left/right inputs)
    const nodeParentByHandle = {};
    
    if (visualMappingEdges && Array.isArray(visualMappingEdges)) {
      visualMappingEdges.forEach(edge => {
        if (!nodeParentMap[edge.target]) {
          nodeParentMap[edge.target] = [];
        }
        nodeParentMap[edge.target].push(edge.source);
        
        // Track by target handle for join nodes (left vs right input)
        if (edge.targetHandle) {
          nodeParentByHandle[`${edge.target}_${edge.targetHandle}`] = edge.source;
        }
      });
    }
    
    const hasMultiSourceJoin = mapping.has_multi_source_join && 
                                mapping.source_catalog && mapping.source_catalog.length > 1 &&
                                mapping.join_specs && mapping.join_specs.length > 0;
    
    if (hasMultiSourceJoin) {
      emitLog('info', `Multi-source join detected: Loading ${mapping.source_catalog.length - 1} secondary source(s) for join enrichment`);
      await logJobExecution(pool, jobId, 'info', 'Loading secondary source files for multi-source join', {
        sourceCatalogCount: mapping.source_catalog.length,
        joinSpecsCount: mapping.join_specs.length
      });
      
      // Parse source_catalog and join_specs if they're JSON strings
      let sourceCatalog = mapping.source_catalog;
      let joinSpecs = mapping.join_specs;
      
      if (typeof sourceCatalog === 'string') {
        sourceCatalog = JSON.parse(sourceCatalog);
      }
      if (typeof joinSpecs === 'string') {
        joinSpecs = JSON.parse(joinSpecs);
      }
      
      // Identify primary source node ID
      const primarySourceNodeId = mapping.primary_source_node_id;
      
      // Load each secondary source into lookup tables
      for (const source of sourceCatalog) {
        if (source.nodeId === primarySourceNodeId) {
          emitLog('info', `Skipping primary source: ${source.nodeName} (will be streamed)`);
          continue;
        }
        
        emitNodeStatus(source.nodeId, 'running', { phase: 'loading_for_join' });
        
        try {
          // Build file pattern for this source
          const sourcePattern = source.filePath 
            ? `${source.filePath.replace(/^\//, '').replace(/\/$/, '')}/${source.filePattern}`
            : source.filePattern;
          
          // Find files matching this source's pattern
          const sourceFiles = await listAndFilterFiles(
            pool,
            source.connectionId,
            sourcePattern
          );
          
          if (sourceFiles.length === 0) {
            emitLog('warn', `No files found for secondary source: ${source.nodeName} (pattern: ${sourcePattern})`);
            emitNodeStatus(source.nodeId, 'failed', { error: 'No matching files found' });
            continue;
          }
          
          // Load the first matching file (for now, single file per source)
          const sourceFile = sourceFiles[0];
          emitLog('info', `Loading secondary source: ${source.nodeName} (${sourceFile.filename})`);
          
          // Download and parse the file
          const fileBuffer = await downloadFileFromConnection(pool, source.connectionId, sourceFile.filename);
          const rows = await parseFileToRows(fileBuffer, sourceFile.filename, pool, mapping.vendor_agreement_id);
          
          // Find which join specs use this source
          const relevantJoinSpecs = joinSpecs.filter(js => 
            js.rightSourceNodeId === source.nodeId || js.leftSourceNodeId === source.nodeId
          );
          
          // Build lookup tables for each join key combination
          // NOTE: We need to support loading EITHER left or right source into the lookup table
          // depending on which one is the secondary (non-primary) source
          for (const joinSpec of relevantJoinSpecs) {
            const isRightSource = joinSpec.rightSourceNodeId === source.nodeId;
            const isLeftSource = joinSpec.leftSourceNodeId === source.nodeId;
            
            // Load this source into lookup table if it has join keys
            // The lookup key indicates which side: 'right' or 'left'
            if (joinSpec.joinKeys && joinSpec.joinKeys.length > 0) {
              // Use 'right' or 'left' suffix to indicate which side was loaded
              const sideLabel = isRightSource ? 'right' : 'left';
              const lookupKey = `${joinSpec.nodeId}_${sideLabel}`;
              joinLookupTables[lookupKey] = {};
              
              for (const row of rows) {
                // Build composite key from the appropriate side's columns
                const keyParts = joinSpec.joinKeys.map(jk => {
                  // Use rightColumn if this is the right source, leftColumn if this is the left source
                  const columnName = isRightSource 
                    ? (jk.rightColumn || jk.right_column || jk.right)
                    : (jk.leftColumn || jk.left_column || jk.left);
                  return String(row[columnName] || '').trim().toLowerCase();
                });
                const compositeKey = keyParts.join('|');
                
                // Store ALL matching rows in an array (supports one-to-many joins)
                if (!joinLookupTables[lookupKey][compositeKey]) {
                  joinLookupTables[lookupKey][compositeKey] = [];
                }
                joinLookupTables[lookupKey][compositeKey].push(row);
              }
              
              emitLog('info', `Built lookup table for ${source.nodeName} (${sideLabel} side): ${Object.keys(joinLookupTables[lookupKey]).length} unique keys`);
              systemLogger.info('Built join lookup table', {
                sourceNodeId: source.nodeId,
                sourceName: source.nodeName,
                joinNodeId: joinSpec.nodeId,
                lookupKey,
                side: sideLabel,
                uniqueKeys: Object.keys(joinLookupTables[lookupKey]).length,
                totalRows: rows.length
              });
            }
          }
          
          // Track this source's row count for accurate edge display
          nodeOutputCounts[source.nodeId] = rows.length;
          
          emitNodeStatus(source.nodeId, 'completed', { rowsLoaded: rows.length });
          
          // Emit edge row count immediately for this secondary source node
          // Find edges that have this source node as the source
          if (visualMappingEdges && Array.isArray(visualMappingEdges)) {
            const outgoingEdges = visualMappingEdges.filter(e => e.source === source.nodeId);
            outgoingEdges.forEach(edge => {
              emitEdgeRowCount(source.nodeId, edge.target, rows.length);
            });
          }
          
        } catch (loadError) {
          emitLog('error', `Failed to load secondary source ${source.nodeName}: ${loadError.message}`);
          emitNodeStatus(source.nodeId, 'failed', { error: loadError.message });
          systemLogger.error('Failed to load secondary source for join', {
            sourceNodeId: source.nodeId,
            sourceName: source.nodeName,
            error: loadError.message
          });
        }
      }
      
      // Store join specs in mapping for use during row processing
      mapping.parsed_join_specs = joinSpecs;
    }
    
    // Step 3: Process each file
    // Emit running status for expression and join nodes (transformation phase)
    nodesByType.expression.forEach(nodeId => {
      emitNodeStatus(nodeId, 'running', { phase: 'transforming' });
    });
    nodesByType.join.forEach(nodeId => {
      emitNodeStatus(nodeId, 'running', { phase: 'joining' });
    });
    
    // Emit running status for target nodes
    nodesByType.targetRules.forEach(nodeId => {
      emitNodeStatus(nodeId, 'running', { phase: 'writing_output' });
    });
    
    let totalRowsRead = 0;
    let totalRowsWritten = 0;
    let totalRowsFailed = 0;
    let filesProcessedSoFar = 0;
    let hasWarnViolations = false; // Aggregated from per-file processFile results
    
    for (const file of matchingFiles) {
      await logJobExecution(pool, jobId, 'info', `Processing file: ${file.filename}`, {
        fileId: file.file_id
      });
      emitLog('info', `Processing file: ${file.filename.split('/').pop()}`);
      
      try {
        // Create callback for real-time progress updates (called after transformation, before profiling)
        const onTransformComplete = visualExecutionId ? async (progressData) => {
          const currentRowsWritten = totalRowsWritten + progressData.rowsWritten;
          const currentRowsRead = totalRowsRead + progressData.rowsRead;
          const primarySourceNodeId = mapping.primary_source_node_id;
          
          // Track primary source row count
          if (primarySourceNodeId) {
            nodeOutputCounts[primarySourceNodeId] = currentRowsRead;
          }
          
          // Helper function to get a node's output row count by following lineage
          // Uses post-order traversal with separate visited sets per branch for join nodes
          const getNodeOutputCount = (nodeId, visited = new Set()) => {
            // Prevent infinite loops
            if (visited.has(nodeId)) return nodeOutputCounts[nodeId] || 0;
            
            // If we have a cached count for this node, use it directly
            if (nodeOutputCounts[nodeId] !== undefined) {
              return nodeOutputCounts[nodeId];
            }
            
            // Mark as visited before recursion
            visited.add(nodeId);
            
            // Get the node type to determine how to calculate
            const node = nodeMap[nodeId];
            const nodeType = node?.type;
            
            // Get parent nodes
            const parents = nodeParentMap[nodeId] || [];
            
            if (nodeType === 'sourceConfig') {
              // Source nodes should have been populated already
              // If not found, return 0 (no files matched)
              nodeOutputCounts[nodeId] = 0;
              return 0;
            } else if (nodeType === 'expression' || nodeType === 'rdmLookup' || nodeType === 'rdmDataset' || nodeType === 'rdmCrosswalk') {
              // Expression and RDM nodes pass through rows from their single parent
              if (parents.length > 0) {
                const parentCount = getNodeOutputCount(parents[0], visited);
                nodeOutputCounts[nodeId] = parentCount;
                return parentCount;
              }
              nodeOutputCounts[nodeId] = 0;
              return 0;
            } else if (nodeType === 'join') {
              // Join nodes need to calculate based on join type and both inputs
              // Use SEPARATE visited sets for each branch to handle shared parents correctly
              const leftParentId = nodeParentByHandle[`${nodeId}_left`] || parents[0];
              const rightParentId = nodeParentByHandle[`${nodeId}_right`] || parents[1];
              
              // Clone visited set for each branch to avoid interference
              const leftVisited = new Set(visited);
              const rightVisited = new Set(visited);
              
              const leftCount = leftParentId ? getNodeOutputCount(leftParentId, leftVisited) : 0;
              const rightCount = rightParentId ? getNodeOutputCount(rightParentId, rightVisited) : 0;
              
              // Find the join spec for this node to get join type
              let joinType = 'INNER';
              if (mapping.parsed_join_specs && Array.isArray(mapping.parsed_join_specs)) {
                const joinSpec = mapping.parsed_join_specs.find(js => js.nodeId === nodeId);
                if (joinSpec) {
                  joinType = (joinSpec.joinType || 'INNER').toUpperCase();
                }
              }
              
              // Calculate output based on join type using actual parent counts
              // For non-empty joins, use the primary source count (left side drives the output)
              let joinOutput;
              if (joinType === 'INNER') {
                // INNER JOIN: if either side is 0, output is 0; otherwise use actual written rows
                joinOutput = (leftCount === 0 || rightCount === 0) ? 0 : currentRowsWritten;
              } else if (joinType === 'LEFT' || joinType === 'LEFT OUTER') {
                // LEFT JOIN: if left is 0, output is 0; otherwise left count (or written if available)
                joinOutput = leftCount === 0 ? 0 : (currentRowsWritten || leftCount);
              } else if (joinType === 'RIGHT' || joinType === 'RIGHT OUTER') {
                // RIGHT JOIN: if right is 0, output is 0
                joinOutput = rightCount === 0 ? 0 : (currentRowsWritten || rightCount);
              } else if (joinType === 'FULL OUTER') {
                // FULL OUTER JOIN: always has output if either side has rows
                joinOutput = (leftCount === 0 && rightCount === 0) ? 0 : currentRowsWritten;
              } else {
                joinOutput = currentRowsWritten;
              }
              
              nodeOutputCounts[nodeId] = joinOutput;
              return joinOutput;
            } else if (nodeType === 'targetRules') {
              // Target nodes output what they receive
              if (parents.length > 0) {
                const parentCount = getNodeOutputCount(parents[0], visited);
                nodeOutputCounts[nodeId] = parentCount;
                return parentCount;
              }
              nodeOutputCounts[nodeId] = currentRowsWritten;
              return currentRowsWritten;
            }
            
            // Default fallback for unknown node types
            nodeOutputCounts[nodeId] = currentRowsWritten;
            return currentRowsWritten;
          };
          
          // Emit edge row counts immediately after transformation completes
          // Use per-node lineage tracking for accurate counts
          if (visualMappingEdges && Array.isArray(visualMappingEdges)) {
            visualMappingEdges.forEach(edge => {
              const edgeRowCount = getNodeOutputCount(edge.source);
              visualMappingWS.emitEdgeRowCount(visualExecutionId, edge.id, edge.source, edge.target, edgeRowCount);
            });
          }
          
          // Emit node completion status with accurate per-node counts
          nodesByType.expression.forEach(nodeId => {
            const count = nodeOutputCounts[nodeId] !== undefined ? nodeOutputCounts[nodeId] : currentRowsRead;
            emitNodeStatus(nodeId, 'completed', { rowsProcessed: count });
          });
          nodesByType.join.forEach(nodeId => {
            const count = nodeOutputCounts[nodeId] !== undefined ? nodeOutputCounts[nodeId] : currentRowsWritten;
            emitNodeStatus(nodeId, 'completed', { rowsProcessed: count });
          });
          nodesByType.rdmLookup.forEach(nodeId => {
            const count = nodeOutputCounts[nodeId] !== undefined ? nodeOutputCounts[nodeId] : currentRowsRead;
            emitNodeStatus(nodeId, 'completed', { rowsProcessed: count });
          });
          nodesByType.targetRules.forEach(nodeId => {
            const count = nodeOutputCounts[nodeId] !== undefined ? nodeOutputCounts[nodeId] : currentRowsWritten;
            emitNodeStatus(nodeId, 'completed', { rowsWritten: count });
          });
          
          systemLogger.info('Real-time progress callback executed - edge counts and node status emitted before profiling', {
            visualExecutionId,
            rowsWritten: currentRowsWritten,
            rowsRead: currentRowsRead,
            filename: progressData.filename,
            nodeOutputCounts: Object.keys(nodeOutputCounts).length
          });
        } : null;
        
        const fileResult = await processFile(pool, file, mapping, jobId, { 
          dryRun, 
          transformationJobDbId, 
          userId,
          rdmContext,
          onTransformComplete,
          joinLookupTables: hasMultiSourceJoin ? joinLookupTables : null,
          joinSpecs: hasMultiSourceJoin ? mapping.parsed_join_specs : null,
          ledgerContext,
          visualExecutionId
        });
        
        totalRowsRead += fileResult.rowsRead;
        totalRowsWritten += fileResult.rowsWritten;
        totalRowsFailed += fileResult.rowsFailed;
        if (fileResult.hasWarnViolations) hasWarnViolations = true;
        filesProcessedSoFar++;
        
        // Update job progress immediately after each file for real-time tracking
        await updateJob(pool, jobId, {
          files_processed: filesProcessedSoFar,
          rows_read: totalRowsRead,
          rows_written: totalRowsWritten,
          rows_failed: totalRowsFailed
        });
        
        await logJobExecution(pool, jobId, 'info', `File processed: ${file.filename}`, {
          fileId: file.file_id,
          rowsRead: fileResult.rowsRead,
          rowsWritten: fileResult.rowsWritten,
          rowsFailed: fileResult.rowsFailed,
          progressMessage: `Completed ${filesProcessedSoFar} of ${matchingFiles.length} files`
        });
        emitLog('info', `Processed ${fileResult.rowsRead} rows, wrote ${fileResult.rowsWritten} rows (${filesProcessedSoFar}/${matchingFiles.length} files)`);
        
        // Edge row counts already emitted by onTransformComplete callback (before profiling)
        // This secondary emission serves as a final confirmation after all processing completes
        // Use per-node lineage tracking for accurate counts
        if (visualExecutionId && visualMappingEdges && Array.isArray(visualMappingEdges)) {
          visualMappingEdges.forEach(edge => {
            // Use cached nodeOutputCounts from the callback (already computed via lineage)
            const edgeRowCount = nodeOutputCounts[edge.source] !== undefined 
              ? nodeOutputCounts[edge.source] 
              : totalRowsWritten;
            visualMappingWS.emitEdgeRowCount(visualExecutionId, edge.id, edge.source, edge.target, edgeRowCount);
          });
        }
        
        // Step 4: Run profiling and anomaly detection (if enabled)
        // Note: Skipped for cloud files without DB record, can be added in future
        if (runProfilingChecks && !dryRun && file.file_id) {
          await logJobExecution(pool, jobId, 'info', `Running profiling checks on: ${file.filename}`);
          
          const anomalyResults = await executeAnomalyDetection(pool, {
            fileId: file.file_id,
            filename: file.filename,
            filePattern: mapping.source_file_pattern,
            mappingId,
            jobId,
            runSchemaValidation
          });
          
          if (anomalyResults.totalAnomalies > 0) {
            await logJobExecution(pool, jobId, 'warn', 
              `Detected ${anomalyResults.totalAnomalies} anomalies in ${file.filename}`,
              anomalyResults.anomaliesByType
            );
          }
        }
        
      } catch (fileError) {
        totalRowsFailed += file.row_count || 0;
        
        // Emit failed status for all processing nodes when file processing fails
        if (visualExecutionId) {
          nodesByType.expression.forEach(nodeId => {
            emitNodeStatus(nodeId, 'failed', { error: fileError.message });
          });
          nodesByType.join.forEach(nodeId => {
            emitNodeStatus(nodeId, 'failed', { error: fileError.message });
          });
          nodesByType.rdmLookup.forEach(nodeId => {
            emitNodeStatus(nodeId, 'failed', { error: fileError.message });
          });
          nodesByType.targetRules.forEach(nodeId => {
            emitNodeStatus(nodeId, 'failed', { error: fileError.message });
          });
        }
        
        await logJobExecution(pool, jobId, 'error', `File processing failed: ${file.filename}`, {
          fileId: file.file_id,
          error: fileError.message,
          stack: fileError.stack
        });
        emitLog('error', `Failed processing file: ${fileError.message}`);
      }
    }
    
    // Update job with final statistics
    const finalStatus = hasWarnViolations ? 'completed_with_warnings' : 'completed';
    await updateJob(pool, jobId, {
      status: finalStatus,
      files_processed: matchingFiles.length,
      rows_read: totalRowsRead,
      rows_written: totalRowsWritten,
      rows_failed: totalRowsFailed,
      end_time: new Date()
    });
    
    // Update transformation_executions if tracking
    await updateTransformationExecution(pool, transformationExecutionId, 'COMPLETED', {
      filesProcessed: matchingFiles.length,
      rowsRead: totalRowsRead,
      rowsWritten: totalRowsWritten,
      rowsFailed: totalRowsFailed
    });
    
    await logJobExecution(pool, jobId, 'info', 'Job execution completed', {
      filesProcessed: matchingFiles.length,
      rowsRead: totalRowsRead,
      rowsWritten: totalRowsWritten,
      rowsFailed: totalRowsFailed
    });
    emitLog('info', `Execution completed: ${matchingFiles.length} file(s), ${totalRowsRead} rows read, ${totalRowsWritten} rows written`);
    
    // Final status emissions - these are redundant confirmations after profiling completes
    // Primary real-time updates were already sent via onTransformComplete callback (before profiling)
    if (visualExecutionId) {
      // Yield event loop to ensure all previous events are flushed
      await new Promise(resolve => setImmediate(resolve));
      
      // Final edge row count confirmation (already sent by callback, this is just a redundant final update)
      // Use per-node lineage tracking for accurate counts
      if (visualMappingEdges && Array.isArray(visualMappingEdges)) {
        visualMappingEdges.forEach(edge => {
          // Use cached nodeOutputCounts from the callback (already computed via lineage)
          const edgeRowCount = nodeOutputCounts[edge.source] !== undefined 
            ? nodeOutputCounts[edge.source] 
            : totalRowsWritten;
          visualMappingWS.emitEdgeRowCount(visualExecutionId, edge.id, edge.source, edge.target, edgeRowCount);
        });
      }
      
      // Emit final progress and completion
      visualMappingWS.emitExecutionProgress(visualExecutionId, 100);
      visualMappingWS.emitExecutionComplete(visualExecutionId, {
        filesProcessed: matchingFiles.length,
        rowsRead: totalRowsRead,
        rowsWritten: totalRowsWritten,
        rowsFailed: totalRowsFailed
      });
      systemLogger.info('Visual mapping execution completed - WebSocket events emitted', {
        visualExecutionId,
        jobId,
        nodesCompleted: Object.values(nodesByType).flat().length
      });
    }
    
    // Cleanup temporary transformation mapping if this was a visual mapping execution
    // Skip if caller will handle cleanup (e.g., to update visual_mapping_executions first)
    const skipInternalCleanup = options.skipInternalCleanup === true;
    if (mapping.is_temporary && mapping.is_visual_mapping && !skipInternalCleanup) {
      try {
        await pool.query(
          'DELETE FROM transformation_mappings WHERE mapping_id = $1 AND is_temporary = true',
          [mappingId]
        );
        systemLogger.info('Temporary transformation mapping cleaned up', {
          mappingId,
          jobId
        });
      } catch (cleanupError) {
        systemLogger.warn('Failed to cleanup temporary transformation mapping', {
          mappingId,
          jobId,
          error: cleanupError.message
        });
      }
    } else if (skipInternalCleanup) {
      systemLogger.info('Skipping internal cleanup - caller will handle', {
        mappingId,
        jobId,
        isTemporary: mapping.is_temporary,
        isVisualMapping: mapping.is_visual_mapping
      });
    }
    
    // Emit alert event (fire-and-forget, non-blocking)
    setImmediate(() => {
      try {
        alertAggregationWorker.onJobCompleted(jobId, finalStatus).catch(err => {
          systemLogger.warn('Failed to emit job completion alert event', {
            jobId,
            error: err.message
          });
        });
      } catch (err) {
        systemLogger.warn('Error emitting job completion alert event', {
          jobId,
          error: err.message
        });
      }
    });
    
    return {
      jobId,
      status: finalStatus,
      filesProcessed: matchingFiles.length,
      rowsRead: totalRowsRead,
      rowsWritten: totalRowsWritten,
      rowsFailed: totalRowsFailed
    };
    
  } catch (error) {
    systemLogger.error('Job execution error:', error);
    
    if (job) {
      await updateJob(pool, job.job_id, {
        status: 'failed',
        error_message: error.message,
        end_time: new Date()
      });
      
      await logJobExecution(pool, job.job_id, 'error', 'Job execution failed', {
        error: error.message,
        stack: error.stack
      });
      
      // Capture file audit entry for failed job (unexpected error)
      try {
        await captureFileAudit(pool, {
          fileId: `job_${job.job_id}_error`,
          fileName: mapping?.file_name_pattern || 'unknown',
          fileSchemaId: null,
          fileHash: null,
          filePattern: mapping?.file_name_pattern,
          fileType: 'unknown',
          fileDelimiter: null,
          encoding: 'utf-8',
          numberOfColumns: null,
          fileSizeBytes: 0,
          source: 'transformation',
          sourcePath: mapping?.drop_location_path || '',
          noOfRecordsInSource: 0,
          loadStep1: 'execution_error',
          loadStep1Path: null,
          loadStep1RecCnt: 0,
          loadType: 'etl_transformation',
          correlationId: job.correlation_id || job.job_id,
          transformationJobId: job.id,
          mappingName: mapping?.mapping_name || ledgerContext?.mappingName,
          userId: ledgerContext?.userId,
          userEmail: ledgerContext?.userEmail,
          ipAddress: ledgerContext?.userIp,
          sessionId: ledgerContext?.sessionId,
          processingDurationMs: Date.now() - (job.start_time ? new Date(job.start_time).getTime() : Date.now()),
          status: 'failed',
          errorMessage: error.message,
          errorType: 'execution_error',
          createdBy: ledgerContext?.userId,
          fileRole: 'source'
        });
        systemLogger.info('File audit captured for failed job (execution error)', {
          jobId: job.job_id,
          correlationId: job.correlation_id
        });
      } catch (auditError) {
        systemLogger.error('Failed to capture file audit for failed job in catch block', {
          jobId: job.job_id,
          error: auditError.message
        });
      }
      
      // Emit visual mapping execution error event
      if (visualExecutionId) {
        // Emit failed status for all nodes (call WebSocket directly - helpers are scoped to try block)
        const allNodeIds = [...(nodesByType.sourceConfig || []), ...(nodesByType.expression || []), 
           ...(nodesByType.join || []), ...(nodesByType.rdmLookup || []), 
           ...(nodesByType.targetRules || [])];
        allNodeIds.forEach(nodeId => {
          try {
            visualMappingWS.emitNodeStatus(visualExecutionId, nodeId, 'failed', { error: error.message });
          } catch (wsErr) {
            systemLogger.warn('Failed to emit node status in catch block', { nodeId, error: wsErr.message });
          }
        });
        
        visualMappingWS.emitExecutionError(visualExecutionId, error);
        systemLogger.info('Visual mapping execution failed - WebSocket events emitted', {
          visualExecutionId,
          jobId: job.job_id,
          error: error.message,
          nodesNotified: allNodeIds.length
        });
      }
      
      // Cleanup temporary transformation mapping on failure
      if (mapping && mapping.is_temporary && mapping.is_visual_mapping) {
        try {
          await pool.query(
            'DELETE FROM transformation_mappings WHERE mapping_id = $1 AND is_temporary = true',
            [mapping.mapping_id]
          );
          systemLogger.info('Temporary transformation mapping cleaned up after failure', {
            mappingId: mapping.mapping_id,
            jobId: job.job_id
          });
        } catch (cleanupError) {
          systemLogger.warn('Failed to cleanup temporary transformation mapping after failure', {
            mappingId: mapping.mapping_id,
            jobId: job.job_id,
            error: cleanupError.message
          });
        }
      }
      
      // Emit alert event (fire-and-forget, non-blocking)
      setImmediate(() => {
        try {
          alertAggregationWorker.onJobCompleted(job.job_id, 'failed').catch(err => {
            systemLogger.warn('Failed to emit job failure alert event', {
              jobId: job.job_id,
              error: err.message
            });
          });
        } catch (err) {
          systemLogger.warn('Error emitting job failure alert event', {
            jobId: job.job_id,
            error: err.message
          });
        }
      });
    }
    
    throw error;
  }
}

/**
 * Get mapping configuration
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @returns {Promise<Object>} - Mapping configuration
 */
async function getMappingConfig(pool, mappingId) {
  const result = await pool.query(
    'SELECT * FROM transformation_mappings WHERE mapping_id = $1',
    [mappingId]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`Mapping not found: ${mappingId}`);
  }
  
  const mapping = result.rows[0];
  
  // If using vendor agreement, fetch the connection ID and metadata from the agreement
  if (mapping.vendor_agreement_id) {
    const agreementResult = await pool.query(
      `SELECT 
        vendor_connection_id, 
        primary_contact_name, 
        primary_contact_email,
        drop_location_path, 
        agreement_code 
      FROM vendor_agreements 
      WHERE id = $1`,
      [mapping.vendor_agreement_id]
    );
    
    if (agreementResult.rows.length === 0) {
      throw new Error(`Vendor agreement not found: ${mapping.vendor_agreement_id}`);
    }
    
    const agreement = agreementResult.rows[0];
    
    // Set the source_connection_id to the vendor's connection ID for job execution
    mapping.source_connection_id = agreement.vendor_connection_id;
    
    // Cache vendor agreement metadata for lineage tracking
    mapping.vendor_agreement_metadata = {
      owner: agreement.primary_contact_name || agreement.primary_contact_email || null,
      path: agreement.drop_location_path || null,
      agreement_name: agreement.agreement_code || null
    };
    
    systemLogger.info('Vendor agreement metadata loaded for lineage tracking', {
      agreementId: mapping.vendor_agreement_id,
      owner: mapping.vendor_agreement_metadata.owner,
      path: mapping.vendor_agreement_metadata.path,
      agreementName: mapping.vendor_agreement_metadata.agreement_name
    });
  }
  
  return mapping;
}

/**
 * Fetch governance metadata for mapping job from vendor agreement
 * Mirrors Contract Validation's applyAgreementGovernance logic for mapping jobs
 * @param {Pool} pool - Database connection pool
 * @param {Object} mapping - Mapping configuration
 * @param {string} sourceFilename - Source filename to match against patterns
 * @param {number} projectId - Project ID
 * @returns {Promise<Object>} - Governance metadata {containsPii, dataClassification, piiColumns}
 */
async function fetchGovernanceForMapping(pool, mapping, sourceFilename, projectId) {
  // Only fetch governance if mapping uses vendor agreement
  if (!mapping.vendor_agreement_id) {
    systemLogger.info('No vendor agreement for mapping, skipping governance fetch');
    return {
      containsPii: false,
      dataClassification: null,
      piiColumns: [],
      fileTags: []
    };
  }
  
  try {
    systemLogger.info('Fetching governance metadata from vendor agreement', {
      agreementId: mapping.vendor_agreement_id,
      sourceFilename,
      projectId
    });
    
    // Fetch vendor agreement with file schemas (including quality_rule_ids for file tags)
    const agreementResult = await pool.query(`
      SELECT 
        va.id,
        va.agreement_code,
        vafs.id as schema_id,
        vafs.file_name_pattern,
        vafs.schema,
        vafs.contains_pii,
        vafs.data_classification,
        vafs.quality_rule_ids,
        vafs.priority
      FROM vendor_agreements va
      LEFT JOIN vendor_agreement_file_schemas vafs ON va.id = vafs.vendor_agreement_id AND vafs.is_active = true
      WHERE va.id = $1 AND va.project_id = $2
      ORDER BY vafs.priority ASC NULLS LAST
    `, [mapping.vendor_agreement_id, projectId]);
    
    if (agreementResult.rows.length === 0) {
      systemLogger.warn('Vendor agreement not found or no file schemas', {
        agreementId: mapping.vendor_agreement_id,
        projectId
      });
      return {
        containsPii: false,
        dataClassification: null,
        piiColumns: [],
        fileTags: []
      };
    }
    
    systemLogger.info('Fetched agreement schemas for governance', {
      agreementId: mapping.vendor_agreement_id,
      schemaCount: agreementResult.rows.length,
      patterns: agreementResult.rows.map(r => r.file_name_pattern)
    });
    
    // Match filename against patterns (same logic as Contract Validation)
    const { matchesPattern } = require('../utils/filePatternMatcher');
    let matchedSchema = null;
    
    for (const row of agreementResult.rows) {
      if (row.file_name_pattern && matchesPattern(sourceFilename, row.file_name_pattern)) {
        matchedSchema = row;
        systemLogger.info('Matched governance schema by pattern', {
          sourceFilename,
          pattern: row.file_name_pattern,
          schema_id: row.schema_id,
          contains_pii: row.contains_pii,
          classification: row.data_classification,
          quality_rules: row.quality_rule_ids
        });
        break;
      }
    }
    
    // Fallback to first schema if no pattern match
    if (!matchedSchema && agreementResult.rows[0].schema) {
      matchedSchema = agreementResult.rows[0];
      systemLogger.info('Using fallback governance schema (first schema)', {
        agreementId: mapping.vendor_agreement_id,
        sourceFilename,
        fallback_pattern: matchedSchema.file_name_pattern,
        fallback_classification: matchedSchema.data_classification
      });
    }
    
    if (!matchedSchema || !matchedSchema.schema) {
      systemLogger.warn('No matching schema found for governance', {
        agreementId: mapping.vendor_agreement_id,
        sourceFilename
      });
      return {
        containsPii: false,
        dataClassification: null,
        piiColumns: [],
        fileTags: []
      };
    }
    
    // Extract PII columns from schema (same logic as Contract Validation)
    const rawSchemaObj = typeof matchedSchema.schema === 'string' 
      ? JSON.parse(matchedSchema.schema) 
      : matchedSchema.schema;
    // Support both legacy bare array and new { columns, file_quality_rules } shape
    const schemaObj = Array.isArray(rawSchemaObj) ? rawSchemaObj : (Array.isArray(rawSchemaObj?.columns) ? rawSchemaObj.columns : rawSchemaObj);
    
    const piiColumns = [];
    if (Array.isArray(schemaObj) && schemaObj.length > 0) {
      for (const column of schemaObj) {
        const isPii = column.is_pii === true || column.is_pii === 'true';
        if (isPii) {
          const columnName = column.name || column.column_name;
          if (columnName) {
            piiColumns.push(columnName);
          }
        }
      }
    }
    
    // Extract file-level tags from quality_rule_ids
    let fileTags = [];
    if (matchedSchema.quality_rule_ids && Array.isArray(matchedSchema.quality_rule_ids)) {
      try {
        const rulesResult = await pool.query(`
          SELECT id, rule_name 
          FROM quality_rules 
          WHERE id = ANY($1::int[])
        `, [matchedSchema.quality_rule_ids]);
        
        fileTags = rulesResult.rows.map(r => r.rule_name);
        
        systemLogger.info('Extracted file-level tags from quality rules', {
          sourceFilename,
          ruleIds: matchedSchema.quality_rule_ids,
          tags: fileTags
        });
      } catch (tagError) {
        systemLogger.warn('Failed to fetch quality rule names for tags', {
          sourceFilename,
          error: tagError.message
        });
      }
    }
    
    systemLogger.info('Extracted governance metadata for mapping', {
      sourceFilename,
      containsPii: matchedSchema.contains_pii || false,
      dataClassification: matchedSchema.data_classification,
      piiColumnCount: piiColumns.length,
      piiColumns: piiColumns,
      fileTagCount: fileTags.length,
      fileTags: fileTags
    });
    
    return {
      containsPii: matchedSchema.contains_pii || false,
      dataClassification: matchedSchema.data_classification || null,
      piiColumns: piiColumns,
      fileTags: fileTags,
      // Parsed schema columns — used by DQ enforcement step for all file types
      schemaColumns: Array.isArray(schemaObj) && schemaObj.length > 0 ? schemaObj : null,
      // Full raw schema (may be bare array or {columns, file_quality_rules} object) — preserves
      // file_quality_rules so enforceSchemaRulesForJob can enforce them alongside per-column rules
      schemaRaw: rawSchemaObj || null
    };
    
  } catch (error) {
    systemLogger.error('Error fetching governance metadata', {
      agreementId: mapping.vendor_agreement_id,
      sourceFilename,
      error: error.message
    });
    // Return empty governance on error (don't fail the job)
    return {
      containsPii: false,
      dataClassification: null,
      piiColumns: [],
      fileTags: []
    };
  }
}

/**
 * Calculate column statistics from transformed rows
 * @param {Array} rows - Array of transformed data rows
 * @param {Array} schema - Schema definition with column names and types
 * @returns {Object} - Column statistics object keyed by column name
 */
function calculateColumnStatistics(rows, schema) {
  const stats = {};
  
  if (!rows || rows.length === 0 || !schema) {
    return stats;
  }

  // Initialize stats for each column
  schema.forEach(col => {
    stats[col.name] = {
      total_count: rows.length,
      null_count: 0,
      unique_values: new Set(),
      numeric_sum: 0,
      numeric_min: null,
      numeric_max: null,
      string_lengths: [],
      string_values: []  // Track all string values to find shortest/longest
    };
  });

  // Process each row to collect statistics
  rows.forEach(row => {
    schema.forEach(col => {
      const value = row[col.name];
      const colStats = stats[col.name];

      // Count nulls
      if (value === null || value === undefined || value === '') {
        colStats.null_count++;
        return;
      }

      // Track unique values
      colStats.unique_values.add(String(value));

      // Numeric statistics
      if (col.type && (col.type.includes('integer') || col.type.includes('float') || 
          col.type.includes('number') || col.type.includes('decimal'))) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          colStats.numeric_sum += numValue;
          colStats.numeric_min = colStats.numeric_min === null ? numValue : Math.min(colStats.numeric_min, numValue);
          colStats.numeric_max = colStats.numeric_max === null ? numValue : Math.max(colStats.numeric_max, numValue);
        }
      }

      // String statistics
      if (typeof value === 'string') {
        colStats.string_lengths.push(value.length);
        colStats.string_values.push(value);
      }
    });
  });

  // Finalize statistics
  schema.forEach(col => {
    const colStats = stats[col.name];
    
    // Calculate averages
    const nonNullCount = colStats.total_count - colStats.null_count;
    if (nonNullCount > 0 && colStats.numeric_sum !== 0) {
      colStats.numeric_avg = colStats.numeric_sum / nonNullCount;
    }

    // Calculate string length stats and find shortest/longest strings
    if (colStats.string_lengths.length > 0 && colStats.string_values.length > 0) {
      colStats.string_min_length = Math.min(...colStats.string_lengths);
      colStats.string_max_length = Math.max(...colStats.string_lengths);
      
      // Find shortest and longest strings by length
      const minLengthIdx = colStats.string_lengths.indexOf(colStats.string_min_length);
      const maxLengthIdx = colStats.string_lengths.indexOf(colStats.string_max_length);
      colStats.string_min_value = colStats.string_values[minLengthIdx];
      colStats.string_max_value = colStats.string_values[maxLengthIdx];
    }

    // Convert unique values set to count
    colStats.unique_count = colStats.unique_values.size;
    
    // Remove temporary data
    delete colStats.unique_values;
    delete colStats.string_lengths;
    delete colStats.string_values;

    // Clean up null values in numeric fields
    if (colStats.numeric_min === null) delete colStats.numeric_min;
    if (colStats.numeric_max === null) delete colStats.numeric_max;
    if (!colStats.numeric_avg) delete colStats.numeric_avg;
    if (colStats.numeric_sum === 0) delete colStats.numeric_sum;
    
    // Clean up empty string fields
    if (!colStats.string_min_length) delete colStats.string_min_length;
    if (!colStats.string_max_length) delete colStats.string_max_length;
    if (!colStats.string_min_value) delete colStats.string_min_value;
    if (!colStats.string_max_value) delete colStats.string_max_value;
  });

  return stats;
}

/**
 * Process a single file with transformations
 * @param {Pool} pool - Database connection pool
 * @param {Object} file - File record
 * @param {Object} mapping - Mapping configuration
 * @param {string} jobId - Job ID
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - Processing result
 */
async function processFile(pool, file, mapping, jobId, options = {}) {
  const { dryRun = false, transformationJobDbId = null, userId = null, rdmContext = {}, onTransformComplete = null, joinLookupTables = null, joinSpecs = null, ledgerContext = null, visualExecutionId = null } = options;
  
  let rowsRead = 0;
  let rowsWritten = 0;
  let rowsFailed = 0;
  let hasWarnViolations = false; // Set to true if log_warn violations are detected
  const transformedRows = [];
  
  // Get correlation_id from job record for source/target file linking
  const jobResult = await pool.query('SELECT correlation_id FROM transformation_jobs WHERE job_id = $1', [jobId]);
  const correlationId = jobResult.rows[0]?.correlation_id;
  
  try {
    // Step 1: Download file from source cloud storage
    await logJobExecution(pool, jobId, 'info', `Downloading file: ${file.filename}`, {
      source_connection_id: mapping.source_connection_id
    });
    
    const fileBuffer = await downloadFileFromConnection(
      pool, 
      mapping.source_connection_id, 
      file.filename
    );
    
    await logJobExecution(pool, jobId, 'info', `File downloaded: ${file.filename}`, {
      size: fileBuffer.length
    });
    
    // Step 2: Determine file type from filename
    let fileExtension = file.filename.split('.').pop().toLowerCase();
    
    // Step 2.1: Check if this is an archive file - archives need special handling
    if (isArchiveFile(file.filename)) {
      await logJobExecution(pool, jobId, 'info', `Detected archive file: ${file.filename}`, {
        extension: fileExtension,
        hasVendorAgreement: !!mapping.vendor_agreement_id
      });
      
      // Archives require a vendor agreement with password configuration
      if (!mapping.vendor_agreement_id) {
        throw new Error(
          `Unsupported file type: ${fileExtension}. ` +
          `Archive files (ZIP, TAR, 7z) require a vendor agreement with password configuration. ` +
          `Supported data file types: CSV, JSON, XLSX, XLS, Parquet, XML, DAT (fixed-width).`
        );
      }
      
      // Get password from vendor agreement vault
      const archivePassword = await getArchivePasswordFromVault(pool, mapping.vendor_agreement_id, file.filename);
      
      await logJobExecution(pool, jobId, 'info', `Archive password lookup completed`, {
        hasPassword: !!archivePassword,
        filename: file.filename
      });
      
      // Write archive buffer to temp file for extraction
      const tempDir = os.tmpdir();
      const tempArchivePath = path.join(tempDir, `archive_${Date.now()}_${path.basename(file.filename)}`);
      
      try {
        await fs.promises.writeFile(tempArchivePath, fileBuffer);
        
        await logJobExecution(pool, jobId, 'info', `Starting archive extraction`, {
          filename: file.filename,
          tempPath: tempArchivePath,
          size: fileBuffer.length
        });
        
        // Create virus scan service mock (extraction service requires it)
        const virusScanService = {
          scanFile: async (filePath) => ({ isInfected: false, skipped: true, viruses: [] })
        };
        
        // Create extraction service instance
        const archiveExtractionService = new ArchiveExtractionService(pool, virusScanService, systemLogger);
        
        // Extract archive with password (if available)
        const extractionResult = await archiveExtractionService.extractArchive(
          tempArchivePath,
          null, // We don't have a file ID in the files table yet
          archivePassword,
          null // userId
        );
        
        await logJobExecution(pool, jobId, 'info', `Archive extracted successfully`, {
          filename: file.filename,
          extractedCount: extractionResult.extractedCount,
          files: extractionResult.files.map(f => f.fileName)
        });
        
        // Process each extracted file through the transformation pipeline
        let totalRowsRead = 0;
        let totalRowsWritten = 0;
        let totalRowsFailed = 0;
        const allTransformedRows = [];
        const allSourceRows = [];
        
        for (const extractedFile of extractionResult.files) {
          const extractedBuffer = await fs.promises.readFile(extractedFile.fullPath);
          const extractedExtension = extractedFile.fileName.split('.').pop().toLowerCase();
          
          await logJobExecution(pool, jobId, 'info', `Processing extracted file: ${extractedFile.fileName}`, {
            extension: extractedExtension,
            size: extractedBuffer.length
          });
          
          // Skip nested archives or unsupported files
          if (isArchiveFile(extractedFile.fileName)) {
            await logJobExecution(pool, jobId, 'warn', `Skipping nested archive: ${extractedFile.fileName}`);
            continue;
          }
          
          // Process the extracted file based on its type
          let extractedParseResult = null;
          
          try {
            // For multi-source joins, delay field mapping application until after join enrichment
            const hasJoin = joinLookupTables && joinSpecs && joinSpecs.length > 0;
            const parseMappings = hasJoin ? [] : mapping.field_mappings;
            const parseVariables = hasJoin ? [] : mapping.variables;
            
            if (extractedExtension === 'csv') {
              extractedParseResult = await parseAndTransformCSV(
                extractedBuffer, 
                parseMappings,
                parseVariables,
                jobId, 
                pool,
                rdmContext
              );
            } else if (extractedExtension === 'json') {
              extractedParseResult = await parseAndTransformJSON(
                extractedBuffer, 
                parseMappings,
                parseVariables,
                jobId, 
                pool,
                rdmContext
              );
            } else if (extractedExtension === 'xlsx' || extractedExtension === 'xls') {
              extractedParseResult = await parseAndTransformXLSX(
                extractedBuffer, 
                parseMappings,
                parseVariables,
                jobId, 
                pool,
                rdmContext
              );
            } else if (extractedExtension === 'xml') {
              extractedParseResult = await parseAndTransformXML(
                extractedBuffer, 
                parseMappings,
                parseVariables,
                jobId, 
                pool,
                rdmContext
              );
            } else if (extractedExtension === 'parquet') {
              extractedParseResult = await parseAndTransformParquet(
                extractedBuffer, 
                parseMappings,
                parseVariables,
                jobId, 
                pool,
                rdmContext
              );
            } else {
              await logJobExecution(pool, jobId, 'warn', `Skipping unsupported file type: ${extractedFile.fileName}`);
              continue;
            }
            
            if (extractedParseResult) {
              totalRowsRead += extractedParseResult.rowsRead || 0;
              totalRowsWritten += extractedParseResult.rowsWritten || 0;
              totalRowsFailed += extractedParseResult.rowsFailed || 0;
              
              if (extractedParseResult.transformedRows) {
                allTransformedRows.push(...extractedParseResult.transformedRows);
              }
              if (extractedParseResult.sourceRows) {
                allSourceRows.push(...extractedParseResult.sourceRows.slice(0, 100));
              }
            }
            
            await logJobExecution(pool, jobId, 'info', `Processed extracted file: ${extractedFile.fileName}`, {
              rowsRead: extractedParseResult?.rowsRead || 0,
              rowsWritten: extractedParseResult?.rowsWritten || 0
            });
            
          } catch (extractedErr) {
            await logJobExecution(pool, jobId, 'error', `Error processing extracted file ${extractedFile.fileName}: ${extractedErr.message}`);
            totalRowsFailed++;
          }
          
          // Clean up extracted file
          await fs.promises.unlink(extractedFile.fullPath).catch(() => {});
        }
        
        // Clean up temp archive file
        await fs.promises.unlink(tempArchivePath).catch(() => {});
        
        // Clean up extraction temp directory (returned by extraction service when caller is responsible)
        if (extractionResult.tempDir) {
          await fs.promises.rm(extractionResult.tempDir, { recursive: true, force: true }).catch(() => {});
        } else if (extractionResult.files.length > 0) {
          // Fallback: derive from first file path
          const extractionDir = require('path').dirname(extractionResult.files[0].fullPath);
          await fs.promises.rm(extractionDir, { recursive: true, force: true }).catch(() => {});
        }
        
        // Apply RDM enrichment to archive transformed rows (if enabled)
        // This adds columns from RDM dataset joins and crosswalk lookups
        if (mapping.rdm_lookup_enabled && allTransformedRows.length > 0) {
          await logJobExecution(pool, jobId, 'info', `Applying RDM enrichment to archive data`, {
            inputRows: allTransformedRows.length,
            hasDatasetJoin: !!mapping.rdm_dataset_config,
            hasCrosswalkLookup: !!mapping.rdm_crosswalk_config
          });
          
          try {
            const { applyRDMLookups } = require('./rdmLookupProcessor');
            
            // Log column count before enrichment
            const columnsBefore = allTransformedRows.length > 0 ? Object.keys(allTransformedRows[0]).length : 0;
            
            const enrichedRows = applyRDMLookups(allTransformedRows, mapping, rdmContext);
            
            // Log column count after enrichment
            const columnsAfter = enrichedRows.length > 0 ? Object.keys(enrichedRows[0]).length : 0;
            
            // Replace with enriched data - use splice to maintain array reference
            allTransformedRows.splice(0, allTransformedRows.length, ...enrichedRows);
            
            await logJobExecution(pool, jobId, 'info', `RDM enrichment complete for archive`, {
              outputRows: allTransformedRows.length,
              columnsBefore,
              columnsAfter
            });
            
            console.log(`[JOB-EXECUTION-ENGINE] Archive RDM enrichment: ${columnsBefore} columns -> ${columnsAfter} columns`);
          } catch (rdmError) {
            await logJobExecution(pool, jobId, 'error', `RDM enrichment failed for archive: ${rdmError.message}`, {
              error: rdmError.stack
            });
            throw new Error(`RDM enrichment failed: ${rdmError.message}`);
          }
        }
        
        // Upload transformed data to target (if not dry run) - IMPORTANT: Must happen before return
        console.log(`[JOB-EXECUTION-ENGINE] Archive S3 upload check - dryRun: ${dryRun}, rows: ${allTransformedRows.length}, targetConnectionId: ${mapping.target_connection_id}`);
        
        if (!dryRun && allTransformedRows.length > 0 && mapping.target_connection_id) {
          const outputFormat = (mapping.target_file_format || mapping.output_format || 'csv').toLowerCase().trim();
          
          console.log(`[JOB-EXECUTION-ENGINE] Starting S3 upload for archive with ${allTransformedRows.length} rows`);
          
          await logJobExecution(pool, jobId, 'info', 
            `Uploading transformed data to target`, {
            target_connection_id: mapping.target_connection_id,
            rows: allTransformedRows.length,
            output_format: outputFormat
          });
          
          // Generate output filename with correct extension
          let outputFilename;
          if (mapping.target_file_name) {
            outputFilename = replacePlaceholders(mapping.target_file_name);
            if (!outputFilename.endsWith(`.${outputFormat}`)) {
              outputFilename = `${outputFilename.replace(/\.[^/.]+$/, '')}.${outputFormat}`;
            }
          } else {
            outputFilename = generateOutputFilename(file.filename.replace(/\.(zip|tar|gz|bz2|7z)$/i, ''), mapping.mapping_name, outputFormat);
          }
          
          // Prepend target file path if specified
          if (mapping.target_file_path) {
            const normalizedPath = mapping.target_file_path.replace(/^\//, '').replace(/\/$/, '');
            outputFilename = normalizedPath ? `${normalizedPath}/${outputFilename}` : outputFilename;
          }
          
          // Convert transformed rows to specified output format
          const outputBuffer = await convertToFormat(allTransformedRows, outputFormat);
          
          await logJobExecution(pool, jobId, 'info', 
            `Converted data to ${outputFormat.toUpperCase()} format`, {
            buffer_size: outputBuffer.length
          });
          
          // Upload to target connection
          const uploadResult = await uploadFileToConnection(
            pool,
            mapping.target_connection_id,
            outputFilename,
            outputBuffer
          );
          
          console.log(`[JOB-EXECUTION-ENGINE] S3 upload completed: ${uploadResult.location}`);
          
          await logJobExecution(pool, jobId, 'info', 
            `Data uploaded to target: ${uploadResult.location}`
          );
        } else if (!dryRun && allTransformedRows.length > 0 && !mapping.target_connection_id) {
          console.log(`[JOB-EXECUTION-ENGINE] No target connection configured - skipping S3 upload`);
          await logJobExecution(pool, jobId, 'warn', 
            `No target connection configured - skipping S3 upload`, {
            rows: allTransformedRows.length
          });
        } else {
          console.log(`[JOB-EXECUTION-ENGINE] Skipping S3 upload - dryRun: ${dryRun}, rows: ${allTransformedRows.length}`);
        }
        
        console.log(`[JOB-EXECUTION-ENGINE] Archive processing complete, returning results`);
        
        // Return aggregated results from all extracted files
        return {
          rowsRead: totalRowsRead,
          rowsWritten: totalRowsWritten,
          rowsFailed: totalRowsFailed,
          transformedRows: allTransformedRows,
          sourceRows: allSourceRows.slice(0, 1000),
          archiveExtraction: {
            extractedCount: extractionResult.extractedCount,
            files: extractionResult.files.map(f => f.fileName)
          }
        };
        
      } catch (extractionError) {
        // Clean up temp file on error
        await fs.promises.unlink(tempArchivePath).catch(() => {});
        
        await logJobExecution(pool, jobId, 'error', `Archive extraction failed: ${extractionError.message}`, {
          filename: file.filename
        });
        
        throw new Error(
          `Failed to extract archive ${file.filename}: ${extractionError.message}. ` +
          `Ensure the password is correctly configured in the vendor agreement.`
        );
      }
    }
    
    // Step 2.2: Check for fixed-width/headerless files that need schema from vendor agreement
    let fixedWidthSchema = null;
    const isFixedWidthType = FIXED_WIDTH_EXTENSIONS.includes(fileExtension);
    
    if (mapping.vendor_agreement_id && (isFixedWidthType || fileExtension === 'csv')) {
      // Get schema from vendor agreement to check if it's headerless
      fixedWidthSchema = await getFixedWidthSchemaFromAgreement(
        pool, 
        mapping.vendor_agreement_id, 
        file.filename
      );
      
      if (fixedWidthSchema) {
        await logJobExecution(pool, jobId, 'info', `Found vendor agreement schema for file`, {
          filename: file.filename,
          fileType: fixedWidthSchema.fileType,
          hasHeader: fixedWidthSchema.hasHeader,
          hasHeaderDefinition: !!fixedWidthSchema.headerDefinition
        });
      }
    }
    
    // Step 2.5: Fetch governance metadata from vendor agreement (if applicable)
    let governance = null;
    if (mapping.vendor_agreement_id && mapping.project_id) {
      try {
        governance = await fetchGovernanceForMapping(pool, mapping, file.filename, mapping.project_id);
        await logJobExecution(pool, jobId, 'info', `Governance metadata fetched for source file`, {
          filename: file.filename,
          containsPii: governance.containsPii,
          dataClassification: governance.dataClassification,
          piiColumnCount: governance.piiColumns.length
        });
      } catch (govError) {
        await logJobExecution(pool, jobId, 'warn', `Failed to fetch governance metadata: ${govError.message}`);
        // Continue processing even if governance fetch fails
        governance = {
          containsPii: false,
          dataClassification: null,
          piiColumns: [],
          fileTags: []
        };
      }
    } else {
      // No vendor agreement, use empty governance
      governance = {
        containsPii: false,
        dataClassification: null,
        piiColumns: [],
        fileTags: []
      };
    }
    
    // Step 3: Parse file and apply transformations
    await logJobExecution(pool, jobId, 'info', `Parsing and transforming ${fileExtension.toUpperCase()} file`, {
      filename: file.filename,
      field_mappings_count: mapping.field_mappings?.length || 0
    });
    
    let parseResult;
    
    // Check if this is a fixed-width file that needs special parsing
    const isFixedWidth = fixedWidthSchema && 
      (fixedWidthSchema.fileType === 'fixed_width' || 
       fixedWidthSchema.fileType === 'dat' || 
       fixedWidthSchema.fileType === 'binary');
    
    // Check if this is a headerless CSV that needs column names from schema
    const isHeaderlessCSV = fileExtension === 'csv' && 
      fixedWidthSchema && 
      fixedWidthSchema.hasHeader === false;
    
    // When a crosswalk lookup is present, field_mappings (expressions) must run AFTER
    // crosswalk enrichment — otherwise the expression sees undefined for crosswalk-added
    // columns.  Mirror the hasJoin pattern: withhold field_mappings from the parser and
    // re-apply them in Step 3.2.5, after Step 3.2 (RDM enrichment) has run.
    const hasCrosswalkEnrichment = !!(
      mapping.rdm_lookup_enabled &&
      (mapping.rdm_crosswalk_config ||
        (Array.isArray(mapping.rdm_crosswalk_configs) && mapping.rdm_crosswalk_configs.length > 0))
    );

    if (isFixedWidth && fixedWidthSchema.headerDefinition) {
      // Parse fixed-width file using schema from vendor agreement
      await logJobExecution(pool, jobId, 'info', `Parsing fixed-width file using vendor agreement schema`, {
        filename: file.filename,
        columnCount: fixedWidthSchema.headerDefinition.length,
        hasHeader: fixedWidthSchema.hasHeader
      });
      
      const fixedResult = parseFixedWidthBuffer(
        fileBuffer,
        fixedWidthSchema.headerDefinition,
        { hasHeader: fixedWidthSchema.hasHeader }
      );
      
      // For multi-source joins or crosswalk enrichment, delay field mapping application
      // until after enrichment so expressions can reference enriched columns.
      const hasJoin = joinLookupTables && joinSpecs && joinSpecs.length > 0;
      const delayMappings = hasJoin || hasCrosswalkEnrichment;
      
      // Convert field mappings and variables to expected format (same as other parsers)
      // Use empty mappings when delaying - they'll be applied after enrichment
      const convertedMappings = delayMappings ? [] : convertFieldMappings(mapping.field_mappings);
      const convertedVariables = delayMappings ? [] : convertVariables(mapping.variables);
      
      // Transform the parsed rows using the same pipeline as CSV/JSON
      const transformedFixedRows = [];
      const sourceRows = []; // Track source rows for profiling
      let fixedRowsFailed = 0;
      const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
      
      for (let i = 0; i < fixedResult.rows.length; i++) {
        const row = fixedResult.rows[i];
        
        // Capture source rows for profiling
        if (i < MAX_SOURCE_ROWS_FOR_PROFILING) {
          sourceRows.push({...row});
        }
        
        try {
          const transformedRow = transformRow(row, convertedMappings, convertedVariables, rdmContext);
          if (transformedRow && Object.keys(transformedRow).length > 0) {
            transformedFixedRows.push(transformedRow);
          }
        } catch (err) {
          fixedRowsFailed++;
          systemLogger.warn('Fixed-width row transformation error', {
            rowNumber: i + 1,
            error: err.message
          });
        }
      }
      
      parseResult = {
        rowsRead: fixedResult.rowCount,
        rowsWritten: transformedFixedRows.length,
        rowsFailed: fixedRowsFailed,
        transformedRows: transformedFixedRows,
        sourceRows // Include for profiling
      };
    } else if (isHeaderlessCSV && fixedWidthSchema.headerDefinition) {
      // Parse headerless CSV using column names from vendor agreement
      await logJobExecution(pool, jobId, 'info', `Parsing headerless CSV using vendor agreement schema`, {
        filename: file.filename,
        columnCount: fixedWidthSchema.headerDefinition.length
      });
      
      // Pass column names to CSV parser
      // Delay field mappings when a join or crosswalk is present
      const hasJoin = joinLookupTables && joinSpecs && joinSpecs.length > 0;
      const delayMappings = hasJoin || hasCrosswalkEnrichment;
      const columnNames = fixedWidthSchema.headerDefinition.map(col => col.name);
      parseResult = await parseAndTransformCSV(
        fileBuffer, 
        delayMappings ? [] : mapping.field_mappings,
        delayMappings ? [] : mapping.variables,
        jobId, 
        pool,
        rdmContext,
        { headers: columnNames, skipFirstRow: false }
      );
    } else if (fileExtension === 'csv') {
      // Delay field mappings when a join or crosswalk is present so expressions can
      // reference enriched columns (crosswalk output, secondary source columns).
      const hasJoin = joinLookupTables && joinSpecs && joinSpecs.length > 0;
      const delayMappings = hasJoin || hasCrosswalkEnrichment;
      parseResult = await parseAndTransformCSV(
        fileBuffer, 
        delayMappings ? [] : mapping.field_mappings,
        delayMappings ? [] : mapping.variables,
        jobId, 
        pool,
        rdmContext
      );
    } else if (fileExtension === 'json') {
      const hasJoin = joinLookupTables && joinSpecs && joinSpecs.length > 0;
      const delayMappings = hasJoin || hasCrosswalkEnrichment;
      parseResult = await parseAndTransformJSON(
        fileBuffer, 
        delayMappings ? [] : mapping.field_mappings,
        delayMappings ? [] : mapping.variables,
        jobId, 
        pool,
        rdmContext
      );
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const hasJoin = joinLookupTables && joinSpecs && joinSpecs.length > 0;
      const delayMappings = hasJoin || hasCrosswalkEnrichment;
      parseResult = await parseAndTransformXLSX(
        fileBuffer, 
        delayMappings ? [] : mapping.field_mappings,
        delayMappings ? [] : mapping.variables,
        jobId, 
        pool,
        rdmContext
      );
    } else if (fileExtension === 'parquet') {
      const hasJoin = joinLookupTables && joinSpecs && joinSpecs.length > 0;
      const delayMappings = hasJoin || hasCrosswalkEnrichment;
      parseResult = await parseAndTransformParquet(
        fileBuffer, 
        delayMappings ? [] : mapping.field_mappings,
        delayMappings ? [] : mapping.variables,
        jobId, 
        pool,
        rdmContext
      );
    } else if (fileExtension === 'xml') {
      const hasJoin = joinLookupTables && joinSpecs && joinSpecs.length > 0;
      const delayMappings = hasJoin || hasCrosswalkEnrichment;
      parseResult = await parseAndTransformXML(
        fileBuffer, 
        delayMappings ? [] : mapping.field_mappings,
        delayMappings ? [] : mapping.variables,
        jobId, 
        pool,
        rdmContext
      );
    } else if (FIXED_WIDTH_EXTENSIONS.includes(fileExtension)) {
      // Fixed-width file without vendor agreement schema
      throw new Error(
        `Fixed-width file detected: ${file.filename}. ` +
        `Fixed-width files require a vendor agreement with column definitions (width, start_position). ` +
        `Please configure a vendor agreement with the file schema.`
      );
    } else {
      throw new Error(
        `Unsupported file type: ${fileExtension}. ` +
        `Supported types: CSV, JSON, XLSX, XLS, Parquet, XML, DAT (fixed-width with vendor agreement).`
      );
    }
    
    // Extract results from parseResult
    rowsRead = parseResult.rowsRead;
    rowsWritten = parseResult.rowsWritten;
    rowsFailed = parseResult.rowsFailed;
    transformedRows.push(...parseResult.transformedRows);
    
    await logJobExecution(pool, jobId, 'info', `Transformation complete`, {
      rows_read: rowsRead,
      rows_transformed: transformedRows.length,
      rows_failed: rowsFailed
    });

    // Step 3.1.0: Enforce contract schema DQ rules (if vendor agreement schema has quality_rules)
    // Uses governance.schemaColumns — already pattern-matched to this file — so this fires for
    // every file type (CSV, JSON, XLSX, XML, Parquet, fixed-width) when a contract schema exists.
    // Runs against source/parsed rows to validate incoming data, not the transformed output.
    if (mapping.vendor_agreement_id && governance && (governance.schemaColumns || governance.schemaRaw)) {
      try {
        // Use schemaRaw (full schema object) when available so file-level rules are not lost.
        // Fall back to schemaColumns (bare column array) for legacy governance objects.
        const schemaForDQ = governance.schemaRaw || governance.schemaColumns;
        const schemaColumnList = governance.schemaColumns || [];
        const hasColumnRules = schemaColumnList.some(
          col => col.quality_rules && Array.isArray(col.quality_rules) && col.quality_rules.length > 0
        );
        const rawForDQ = governance.schemaRaw;
        const hasFileLevelRules = rawForDQ && !Array.isArray(rawForDQ) &&
          Array.isArray(rawForDQ.file_quality_rules) && rawForDQ.file_quality_rules.length > 0;
        const hasQualityRules = hasColumnRules || hasFileLevelRules;

        if (hasQualityRules) {
          // Use source rows captured during parsing (available for all parser types) or
          // fall back to transformed rows when source rows are not separately retained.
          const sampleRows = (parseResult.sourceRows && parseResult.sourceRows.length > 0)
            ? parseResult.sourceRows.slice(0, 100)
            : transformedRows.slice(0, 100);

          const dqResult = await enforceSchemaRulesForJob(
            pool,
            jobId,
            file.file_id || null,
            schemaForDQ,
            sampleRows,
            rowsRead
          );

          if (dqResult.executed) {
            const headerLevel = dqResult.totalFailed > 0 ? 'warning' : 'info';
            await logJobExecution(pool, jobId, headerLevel,
              `DQ checks: ${dqResult.totalPassed} passed, ${dqResult.totalFailed} failed (${dqResult.violationCount} violation(s) on ${sampleRows.length} sample rows)`
            );

            for (const r of dqResult.ruleResults) {
              if (r.passed) {
                await logJobExecution(pool, jobId, 'info',
                  `DQ PASSED — column: ${r.columnName}, rule: ${r.uiRuleType}`
                );
              } else {
                await logJobExecution(pool, jobId, 'warning',
                  `DQ FAILED — column: ${r.columnName}, rule: ${r.uiRuleType}, ` +
                  `${r.violationCount} violation(s)` +
                  (r.expectedValue ? ` (expected: ${r.expectedValue}, got: ${r.actualValue})` : '')
                );
              }
            }
          } else {
            systemLogger.info('[jobExecutionEngine] Contract DQ step skipped', {
              jobId,
              reason: dqResult.reason
            });
          }
        }
      } catch (dqErr) {
        // DQ enforcement is non-fatal — log a warning and continue job execution
        await logJobExecution(pool, jobId, 'warning',
          `Contract DQ enforcement encountered an error and was skipped: ${dqErr.message}`
        );
        systemLogger.error('[jobExecutionEngine] Contract DQ enforcement error', {
          jobId,
          error: dqErr.message,
          stack: dqErr.stack
        });
      }
    }

    // Step 3.1.5: Apply multi-source join enrichment if configured
    if (joinLookupTables && joinSpecs && joinSpecs.length > 0) {
      await logJobExecution(pool, jobId, 'info', `Applying multi-source join enrichment`, {
        inputRows: transformedRows.length,
        joinSpecCount: joinSpecs.length,
        lookupTableCount: Object.keys(joinLookupTables).length
      });
      
      try {
        const enrichedRows = applyJoinEnrichment(transformedRows, joinLookupTables, joinSpecs, systemLogger);
        
        // Update row counts based on join results
        const joinedCount = enrichedRows.length;
        const droppedByJoin = transformedRows.length - joinedCount;
        
        // Replace transformedRows with enriched data
        transformedRows.length = 0;
        transformedRows.push(...enrichedRows);
        
        // Update rowsWritten to reflect join filtering
        rowsWritten = transformedRows.length;
        
        await logJobExecution(pool, jobId, 'info', `Multi-source join enrichment complete`, {
          outputRows: transformedRows.length,
          droppedByJoin: droppedByJoin
        });
        
        // Step 3.1.6: Apply post-join field mappings transformation
        // After join enrichment, the rows now have columns from both sources.
        // Re-apply field mappings to evaluate expressions that reference secondary source columns.
        if (mapping.field_mappings && mapping.field_mappings.length > 0) {
          const { transformRow } = require('./transformationEngine');
          const convertedMappings = convertFieldMappings(mapping.field_mappings);
          const convertedVariables = convertVariables(mapping.variables || []);
          
          // Debug log: Show first enriched row structure before post-join transformation
          if (transformedRows.length > 0) {
            const firstRow = transformedRows[0];
            const rowKeys = Object.keys(firstRow);
            const valueTypes = rowKeys.reduce((acc, key) => {
              const val = firstRow[key];
              if (val === null) {
                acc[key] = 'null';
              } else if (typeof val === 'object') {
                acc[key] = `object:${Object.keys(val).join(',')}`;
              } else {
                acc[key] = typeof val;
              }
              return acc;
            }, {});
            systemLogger.info('Post-join transformation debug - enriched row before transform', {
              enrichedRowKeys: rowKeys,
              valueTypes: valueTypes
            });
          }
          
          await logJobExecution(pool, jobId, 'info', `Applying post-join transformation to evaluate expressions with joined data`, {
            inputRows: transformedRows.length,
            fieldMappingCount: convertedMappings.length
          });
          
          // Re-transform each row using field mappings (now with secondary source columns available)
          const postJoinTransformedRows = [];
          let debugLoggedFirst = false;
          for (const row of transformedRows) {
            try {
              const transformedRow = transformRow(row, convertedMappings, convertedVariables, rdmContext);
              
              // Debug log first row transformation result
              if (!debugLoggedFirst && transformedRow) {
                const resultKeys = Object.keys(transformedRow);
                const resultValueTypes = resultKeys.reduce((acc, key) => {
                  const val = transformedRow[key];
                  if (val === null || val === undefined) {
                    acc[key] = 'null/undefined';
                  } else if (typeof val === 'object') {
                    acc[key] = `object:${Object.keys(val).slice(0, 5).join(',')}`;
                  } else {
                    acc[key] = typeof val + ':' + String(val).substring(0, 30);
                  }
                  return acc;
                }, {});
                systemLogger.info('Post-join transformation debug - first row after transform', {
                  transformedRowKeys: resultKeys,
                  valueTypes: resultValueTypes
                });
                debugLoggedFirst = true;
              }
              
              if (transformedRow && Object.keys(transformedRow).length > 0) {
                postJoinTransformedRows.push(transformedRow);
              }
            } catch (transformError) {
              systemLogger.warn('Post-join transformation error', {
                error: transformError.message,
                stack: transformError.stack
              });
              // Keep original row on error
              postJoinTransformedRows.push(row);
            }
          }
          
          // Replace transformedRows with post-join transformed data
          transformedRows.length = 0;
          transformedRows.push(...postJoinTransformedRows);
          
          await logJobExecution(pool, jobId, 'info', `Post-join transformation complete`, {
            outputRows: transformedRows.length
          });
        }
      } catch (joinError) {
        await logJobExecution(pool, jobId, 'error', `Multi-source join enrichment failed: ${joinError.message}`, {
          error: joinError.stack
        });
        throw new Error(`Multi-source join enrichment failed: ${joinError.message}`);
      }
    }
    
    // Step 3.2: Apply RDM lookups (dataset join + crosswalk) if enabled
    if (mapping.rdm_lookup_enabled) {
      await logJobExecution(pool, jobId, 'info', `Applying RDM enrichment phase`, {
        inputRows: transformedRows.length,
        hasDatasetJoin: !!mapping.rdm_dataset_config,
        hasCrosswalkLookup: !!mapping.rdm_crosswalk_config
      });
      
      try {
        const { applyRDMLookups } = require('./rdmLookupProcessor');
        const enrichedRows = applyRDMLookups(transformedRows, mapping, rdmContext);
        
        // Replace transformedRows with enriched data
        transformedRows.length = 0; // Clear array
        transformedRows.push(...enrichedRows);
        
        await logJobExecution(pool, jobId, 'info', `RDM enrichment complete`, {
          outputRows: transformedRows.length
        });
      } catch (rdmError) {
        await logJobExecution(pool, jobId, 'error', `RDM enrichment failed: ${rdmError.message}`, {
          error: rdmError.stack
        });
        throw new Error(`RDM enrichment failed: ${rdmError.message}`);
      }
    }
    
    // Step 3.2.5: When crosswalk enrichment was present, field_mappings were withheld from
    // the parser so the expressions could not run against undefined crosswalk columns.
    // Now that Step 3.2 has written crosswalk output into every row, re-apply the field
    // mappings so expressions (e.g. renaming the crosswalk staging column to the final
    // output column name) see the fully-enriched row.
    if (hasCrosswalkEnrichment && mapping.field_mappings && mapping.field_mappings.length > 0) {
      await logJobExecution(pool, jobId, 'info', `Applying post-crosswalk field mappings so expressions can read crosswalk output`, {
        inputRows: transformedRows.length,
        fieldMappingCount: mapping.field_mappings.length
      });

      try {
        const { transformRow } = require('./transformationEngine');
        const convertedMappings = convertFieldMappings(mapping.field_mappings);
        const convertedVariables = convertVariables(mapping.variables || []);

        // Debug: log first enriched row keys before re-applying expressions
        if (transformedRows.length > 0) {
          systemLogger.info('Post-crosswalk transformation debug - enriched row before transform', {
            enrichedRowKeys: Object.keys(transformedRows[0])
          });
        }

        const postCrosswalkRows = [];
        for (const row of transformedRows) {
          try {
            const transformedRow = transformRow(row, convertedMappings, convertedVariables, rdmContext);
            if (transformedRow && Object.keys(transformedRow).length > 0) {
              postCrosswalkRows.push(transformedRow);
            }
          } catch (transformError) {
            systemLogger.warn('Post-crosswalk transformation error on row', {
              error: transformError.message
            });
            postCrosswalkRows.push(row); // Keep enriched row on error
          }
        }

        transformedRows.length = 0;
        transformedRows.push(...postCrosswalkRows);

        await logJobExecution(pool, jobId, 'info', `Post-crosswalk field mapping complete`, {
          outputRows: transformedRows.length
        });
      } catch (stepError) {
        await logJobExecution(pool, jobId, 'error', `Post-crosswalk field mapping failed: ${stepError.message}`, {
          error: stepError.stack
        });
        throw new Error(`Post-crosswalk field mapping failed: ${stepError.message}`);
      }
    }

    // DQ quality score for the VM target file — computed from transformation quality rules and
    // written to the files table (with the target's synthetic file_id) inside step 4, where
    // outputFilename / outputBuffer / outputSchema are all in scope.
    let dqQualityScore = null;

    // Step 3.3: Run quality validation on transformed data (if quality rules are defined)
    try {
      const qualityRulesResult = await pool.query(`
        SELECT qr.*, tqr.error_action AS per_rule_error_action
        FROM transformation_quality_rules tqr
        INNER JOIN quality_rules qr ON tqr.quality_rule_id = qr.id
        WHERE tqr.mapping_id = $1 AND qr.enabled = true
        ORDER BY qr.id
      `, [mapping.mapping_id]);
      
      // record_count and record_count_match are both valid type strings for aggregate count rules.
      const hasRecordCountRules = qualityRulesResult.rows.some(
        r => r.rule_type === 'record_count' || r.rule_type === 'record_count_match'
      );

      // Attribute-level DQ rules (validity, completeness, etc.) carry column_name values that
      // match the SOURCE file's column names, not the transformed-output column names.
      // When transformedRows is empty (e.g. the target format drops/renames every column) or
      // simply when source rows are available, validate against source rows so that rules
      // like date_format, pattern, and completeness can inspect the original field values.
      const dqSourceRows = parseResult.sourceRows && parseResult.sourceRows.length > 0
        ? parseResult.sourceRows
        : [];
      const rowsForDQ = transformedRows.length > 0 ? transformedRows : dqSourceRows;

      const shouldRunValidation = qualityRulesResult.rows.length > 0 &&
        (rowsForDQ.length > 0 || hasRecordCountRules);

      // Always emit a diagnostic line so operators can confirm rules were (or were not) linked.
      await logJobExecution(pool, jobId, 'info',
        qualityRulesResult.rows.length > 0
          ? `[DQ] Found ${qualityRulesResult.rows.length} quality rule(s) for mapping ${mapping.mapping_id}`
          : `[DQ] No quality rules linked to this mapping — skipping DQ validation`,
        { mapping_id: mapping.mapping_id, rule_count: qualityRulesResult.rows.length },
        visualExecutionId
      );

      if (shouldRunValidation) {
        const dqDatasetLabel = transformedRows.length > 0 ? 'transformed rows' : 'source rows (transformed output was empty)';
        await logJobExecution(pool, jobId, 'info', `Running quality validation with ${qualityRulesResult.rows.length} rules against ${dqDatasetLabel}`, {
          rule_count: qualityRulesResult.rows.length,
          row_count: rowsForDQ.length,
          transformed_row_count: transformedRows.length,
          source_row_count: dqSourceRows.length,
          dataset_used: transformedRows.length > 0 ? 'transformed' : 'source'
        });
        
        const QualityValidationEngine = require('./qualityValidationEngine');
        const qualityEngine = new QualityValidationEngine(pool);
        
        const validationMetadata = {
          job_id: jobId,
          file_id: file.file_id || null,
          file_name: file.filename,
          mapping_id: mapping.mapping_id,
          upload_date: new Date(),
          // record_count rules validate the SOURCE file's row count, not the transformed output.
          // rowsRead reflects how many rows were parsed from the incoming file; fall back to
          // rowsForDQ length only when the source count is unavailable.
          actual_row_count: (rowsRead > 0 ? rowsRead : null) ?? rowsForDQ.length,
          transformed_row_count: transformedRows.length
        };
        
        // Apply per-mapping column overrides: VM expression nodes assign quality rules
        // to specific columns (e.g. date_format on "enrollment_date") but the global
        // quality_rules row may have column_name = null. Merge the override here so
        // the validation engine knows which column to check.
        const qualityRuleColumnOverrides =
          (typeof mapping.quality_rule_columns === 'object' && mapping.quality_rule_columns !== null)
            ? mapping.quality_rule_columns
            : {};
        const rulesForValidation = qualityRulesResult.rows.map(rule => {
          if (!rule.column_name && qualityRuleColumnOverrides[rule.id]) {
            return { ...rule, column_name: qualityRuleColumnOverrides[rule.id] };
          }
          return rule;
        });

        const validationResult = await qualityEngine.validateData(
          rulesForValidation,
          rowsForDQ,
          validationMetadata
        );
        
        await logJobExecution(pool, jobId, 'info', `Quality validation complete`, {
          violations_found: validationResult.summary.violations_found,
          critical_count: validationResult.summary.critical_count,
          error_count: validationResult.summary.error_count,
          warning_count: validationResult.summary.warning_count
        });

        // Compute quality_score for the VM target file from the DQ rule pass/fail rate.
        // Stored in dqQualityScore and written to the files table inside step 4 once
        // outputFilename / outputBuffer / outputSchema are in scope.
        {
          const totalRules = qualityRulesResult.rows.length;
          if (totalRules > 0) {
            const violatedRuleIds = new Set(validationResult.violations.map(v => v.rule_id));
            const passedRules = totalRules - violatedRuleIds.size;
            dqQualityScore = Math.round((passedRules / totalRules) * 1000) / 10; // 0.0–100.0
          }
        }

        // Persist violations to database
        if (validationResult.violations.length > 0) {
          // Embed source metadata into violation_details so the violations review page
          // can display filename and sub-project even when join paths are unavailable
          // (e.g. temp mapping deleted, synthetic file_id not in files table).
          for (const v of validationResult.violations) {
            if (!v.violation_details || typeof v.violation_details !== 'object') {
              v.violation_details = {};
            }
            v.violation_details._file_name = file.filename || null;
            if (mapping.sub_project_id) v.violation_details._sub_project_id = mapping.sub_project_id;
            if (mapping.project_id) v.violation_details._project_id = mapping.project_id;
          }

          const violationsPersisted = await persistViolations(pool, jobId, file.file_id, validationResult.violations);
          
          await logJobExecution(pool, jobId, 'info', `Quality violations persisted`, {
            violations_count: violationsPersisted
          });
          
          // Build a per-rule action map and name map from the loaded quality rules.
          // Each row has per_rule_error_action (from tqr.error_action) with a
          // fallback to the global mapping.violation_handling setting.
          const globalViolationHandling = mapping.violation_handling || 'log_continue';
          const ruleActionMap = {};
          const ruleNameMap = {};
          for (const row of qualityRulesResult.rows) {
            ruleActionMap[row.id] = row.per_rule_error_action || globalViolationHandling;
            ruleNameMap[row.id] = row.rule_name || `Rule #${row.id}`;
          }

          // Determine the most severe action required across all fired violations.
          // Priority: log_abort > log_warn > log_continue
          const actionRank = { log_abort: 2, log_warn: 1, log_continue: 0 };
          let worstAction = 'log_continue';
          const abortRuleIds = [];
          const warnRuleIds = [];
          // Track unique rule IDs to avoid duplicates in the name lists
          const seenAbortIds = new Set();
          const seenWarnIds = new Set();

          for (const violation of validationResult.violations) {
            const ruleId = violation.rule_id;
            const action = ruleActionMap[ruleId] || globalViolationHandling;
            if ((actionRank[action] || 0) > (actionRank[worstAction] || 0)) {
              worstAction = action;
            }
            if (action === 'log_abort' && !seenAbortIds.has(ruleId)) {
              abortRuleIds.push(ruleId);
              seenAbortIds.add(ruleId);
            } else if (action === 'log_warn' && !seenWarnIds.has(ruleId)) {
              warnRuleIds.push(ruleId);
              seenWarnIds.add(ruleId);
            }
          }

          // Build human-readable rule name lists for log messages
          const abortRuleNames = abortRuleIds.map(id => ruleNameMap[id] || `Rule #${id}`);
          const warnRuleNames = warnRuleIds.map(id => ruleNameMap[id] || `Rule #${id}`);

          if (worstAction === 'log_abort') {
            const ruleNamesStr = abortRuleNames.length > 0
              ? `: ${abortRuleNames.map(n => `"${n}"`).join(', ')}`
              : '';
            const abortMessage = `Quality violations detected (${validationResult.summary.violations_found} total). Aborting due to Abort-action rule(s)${ruleNamesStr}.`;

            await updateJob(pool, jobId, {
              status: 'failed',
              error_message: abortMessage,
              end_time: new Date()
            });

            await logJobExecution(pool, jobId, 'error', abortMessage, {
              violations_summary: validationResult.summary,
              abort_rule_ids: abortRuleIds,
              abort_rule_names: abortRuleNames,
              worst_action: worstAction
            }, visualExecutionId);

            const abortError = new Error(abortMessage);
            abortError.code = 'DQ_ABORT';
            throw abortError;
          } else if (worstAction === 'log_warn') {
            // Warn: violations are persisted and surfaced as warnings; job completes with warnings status
            hasWarnViolations = true;
            const ruleNamesStr = warnRuleNames.length > 0
              ? `: ${warnRuleNames.map(n => `"${n}"`).join(', ')}`
              : '';
            await logJobExecution(pool, jobId, 'warn', `Quality violations detected — job completed with warnings (${validationResult.summary.violations_found} violation(s)) from Warn-action rule(s)${ruleNamesStr}.`, {
              violations_summary: validationResult.summary,
              warn_rule_ids: warnRuleIds,
              warn_rule_names: warnRuleNames,
              worst_action: worstAction
            }, visualExecutionId);
          } else {
            // log_continue — log at info level and proceed silently
            await logJobExecution(pool, jobId, 'info', `Quality violations detected but continuing per per-rule error action`, {
              violations_summary: validationResult.summary,
              worst_action: worstAction
            }, visualExecutionId);
          }
        }
      } else if (qualityRulesResult.rows.length > 0) {
        await logJobExecution(pool, jobId, 'info', `Skipping quality validation - no data to validate and no record_count rules`);
      }
    } catch (qualityValidationError) {
      await logJobExecution(pool, jobId, 'error', `Quality validation failed: ${qualityValidationError.message}`, {
        error: qualityValidationError.stack
      }, visualExecutionId);
      // Re-throw if this was an abort due to DQ violations (identified by error code, not message text)
      if (qualityValidationError.code === 'DQ_ABORT') {
        throw qualityValidationError;
      }
      // Otherwise, log error but continue processing
    }
    
    // Create execution timestamp for profiling correlation (used for both source and target)
    const executionTimestamp = new Date();
    
    // IMPORTANT: Emit progress callback BEFORE heavy profiling operations
    // This allows WebSocket events to be sent immediately after transformation
    if (onTransformComplete) {
      await onTransformComplete({
        rowsRead,
        rowsWritten,
        rowsFailed,
        transformedRows: transformedRows.length,
        filename: file.filename
      });
      // Yield event loop to ensure WebSocket events are flushed before blocking profiling
      await new Promise(resolve => setImmediate(resolve));
    }
    
    // Step 3.5: Profile SOURCE file using Python profilers (same as file upload)
    // This downloads and profiles the actual S3 file instead of in-memory data
    // fileId will be auto-generated from file content hash if not already set
    if (!dryRun && fileBuffer && fileBuffer.length > 0) {
      try {
        await logJobExecution(pool, jobId, 'info', 
          `Profiling SOURCE file using Python profilers (matching file upload flow)`, {
          filename: file.filename,
          fileSize: fileBuffer.length,
          fileIdProvided: !!file.file_id
        });
        
        // Profile source file buffer using Python scripts (same as file upload)
        // Pass file.file_id if it exists (from vendor upload), otherwise let it auto-generate from hash
        // Include governance metadata from vendor agreement
        const sourceProfilingResult = await profileFileBuffer({
          fileBuffer,
          filename: file.filename,
          fileType: fileExtension,
          pool,
          fileId: file.file_id, // Will use hash if undefined
          fileRole: 'source',
          mappingId: mapping.mapping_id,
          jobId,
          userId,
          projectId: mapping.project_id,
          containsPii: governance.containsPii,
          dataClassification: governance.dataClassification,
          piiColumns: governance.piiColumns
        });
        
        if (sourceProfilingResult.success) {
          await logJobExecution(pool, jobId, 'info', 
            `SOURCE file profiling completed`, {
            fileId: sourceProfilingResult.fileId,
            fileRole: 'source',
            rowCount: sourceProfilingResult.rowCount,
            columnCount: sourceProfilingResult.columnCount,
            qualityScore: sourceProfilingResult.qualityScore
          });
          
          // Persist governance metadata using unified service (after profiling completes)
          try {
            const governanceResult = await persistGovernanceMetadata(pool, {
              fileId: sourceProfilingResult.fileId,
              containsPii: governance.containsPii,
              dataClassification: governance.dataClassification,
              fileTags: governance.fileTags || [],
              piiColumns: governance.piiColumns || [],
              profiledSchema: sourceProfilingResult.schema || []
            });
            
            if (governanceResult.success) {
              await logJobExecution(pool, jobId, 'info', 
                `SOURCE file governance metadata persisted`, {
                fileId: sourceProfilingResult.fileId,
                governanceApplied: governanceResult.governanceApplied
              });
            } else {
              await logJobExecution(pool, jobId, 'warn', 
                `Failed to persist SOURCE file governance metadata: ${governanceResult.error}`, {
                fileId: sourceProfilingResult.fileId
              });
            }
          } catch (govError) {
            await logJobExecution(pool, jobId, 'warn', 
              `Error persisting SOURCE file governance metadata: ${govError.message}`, {
              fileId: sourceProfilingResult.fileId
            });
          }
        } else {
          await logJobExecution(pool, jobId, 'warn', 
            `SOURCE file profiling failed: ${sourceProfilingResult.error}`, {
            fileId: sourceProfilingResult.fileId,
            fileRole: 'source'
          });
        }
      } catch (sourceProfilingError) {
        // Log but don't fail the job if source profiling fails
        await logJobExecution(pool, jobId, 'warn', 
          `SOURCE file profiling failed: ${sourceProfilingError.message}`, {
          error: sourceProfilingError.stack
        });
      }
    }
    
    // Step 4: Upload transformed data to target (if not dry run)
    if (!dryRun && transformedRows.length > 0 && mapping.target_connection_id) {
      // Determine output format (use target_file_format from mapping, default to csv)
      const outputFormat = (mapping.target_file_format || mapping.output_format || 'csv').toLowerCase().trim();
      
      await logJobExecution(pool, jobId, 'info', 
        `Uploading transformed data to target`, {
        target_connection_id: mapping.target_connection_id,
        rows: transformedRows.length,
        output_format: outputFormat
      });
      
      // Generate output filename with correct extension
      let outputFilename;
      if (mapping.target_file_name) {
        // Use custom target file name with placeholder replacement
        outputFilename = replacePlaceholders(mapping.target_file_name);
        // Ensure it has the correct extension
        if (!outputFilename.endsWith(`.${outputFormat}`)) {
          outputFilename = `${outputFilename.replace(/\.[^/.]+$/, '')}.${outputFormat}`;
        }
      } else {
        // Generate default filename
        outputFilename = generateOutputFilename(file.filename, mapping.mapping_name, outputFormat);
      }
      
      // Prepend target file path if specified (for directory/folder structure in cloud storage)
      if (mapping.target_file_path) {
        const normalizedPath = mapping.target_file_path.replace(/^\//, '').replace(/\/$/, ''); // Remove leading/trailing slashes
        outputFilename = normalizedPath ? `${normalizedPath}/${outputFilename}` : outputFilename;
      }
      
      // Convert transformed rows to specified output format
      const outputBuffer = await convertToFormat(transformedRows, outputFormat);
      
      await logJobExecution(pool, jobId, 'info', 
        `Converted data to ${outputFormat.toUpperCase()} format`, {
        buffer_size: outputBuffer.length
      });
      
      // Upload to target connection
      const uploadResult = await uploadFileToConnection(
        pool,
        mapping.target_connection_id,
        outputFilename,
        outputBuffer
      );
      
      await logJobExecution(pool, jobId, 'info', 
        `Data uploaded to target: ${uploadResult.location}`
      );
      
      // Step 5: Capture file audit for transformation job
      try {
        // Use correlation_id from job record (retrieved at start of function)
        // This links source and target files together
        
        // Calculate source file hash
        const sourceFileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        
        // Extract schema from transformed rows (if we have any)
        const outputSchema = transformedRows.length > 0 
          ? Object.keys(transformedRows[0]).map(key => ({
              name: key,
              type: inferDataType(transformedRows[0][key])
            }))
          : [];
        
        // Write quality_score from the DQ rule run (step 3.3) to the files table for
        // the VM target synthetic file_id.  This must happen here (after outputBuffer /
        // outputFilename / outputSchema are defined) so the INSERT has all required fields.
        // profileFileBuffer (step 6) may later overwrite quality_score with a profiling-based
        // value; the DQ score takes effect immediately and persists if profiling is unavailable.
        const targetFileIdForDQ = `transformed_${jobId}_${file.filename}`;
        if (dqQualityScore !== null) {
          try {
            await pool.query(`
              INSERT INTO files (
                file_id, filename, file_type, file_size, row_count, column_count,
                file_role, correlation_id, project_id, processing_step, quality_score,
                created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, 'target', $7, $8, 'complete', $9, NOW(), NOW())
              ON CONFLICT (file_id) DO UPDATE SET
                quality_score = EXCLUDED.quality_score,
                updated_at = NOW()
            `, [
              targetFileIdForDQ,
              outputFilename,
              outputFormat,
              outputBuffer.length,
              transformedRows.length,
              outputSchema.length,
              correlationId,
              mapping.project_id || null,
              dqQualityScore
            ]);
            await logJobExecution(pool, jobId, 'info',
              `VM target quality_score persisted from DQ rule run (${dqQualityScore}%)`, {
              fileId: targetFileIdForDQ,
              dqQualityScore
            });
          } catch (qsErr) {
            await logJobExecution(pool, jobId, 'warn',
              `Failed to persist VM target DQ quality_score: ${qsErr.message}`, {
              error: qsErr.stack
            });
          }
        } else {
          // No DQ rules ran — ensure a minimal files row still exists so that profiling
          // and any subsequent DQ rule run can write quality_score against this file_id.
          try {
            await pool.query(`
              INSERT INTO files (
                file_id, filename, file_type, file_size, row_count, column_count,
                file_role, correlation_id, project_id, processing_step,
                created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, 'target', $7, $8, 'complete', NOW(), NOW())
              ON CONFLICT (file_id) DO NOTHING
            `, [
              targetFileIdForDQ,
              outputFilename,
              outputFormat,
              outputBuffer.length,
              transformedRows.length,
              outputSchema.length,
              correlationId,
              mapping.project_id || null
            ]);
          } catch (minimalInsertErr) {
            await logJobExecution(pool, jobId, 'warn',
              `Failed to upsert minimal files row for VM target: ${minimalInsertErr.message}`, {
              error: minimalInsertErr.stack
            });
          }
        }

        // Capture schema for output file
        const schemaResult = await captureFileSchema(pool, {
          fileId: `transformed_${jobId}_${file.filename}`,
          fileName: outputFilename,
          fileSchema: {
            columns: outputSchema,
            encoding: 'utf-8',
            delimiter: outputFormat === 'csv' ? ',' : null
          },
          correlationId,
          createdBy: null // System-generated transformation
        });
        
        // Capture source file audit
        const sourceAuditId = await captureFileAudit(pool, {
          fileId: file.file_id || `source_${file.filename}`,
          fileName: file.filename,
          fileSchemaId: null, // Source schema not tracked here
          fileHash: sourceFileHash,
          filePattern: mapping.source_file_pattern || mapping.file_name_pattern,
          fileType: fileExtension,
          fileDelimiter: fileExtension === 'csv' ? ',' : null,
          encoding: 'utf-8',
          numberOfColumns: null,
          fileSizeBytes: fileBuffer.length,
          source: 'transformation',
          sourcePath: file.filename,
          noOfRecordsInSource: rowsRead,
          loadStep1: 'download',
          loadStep1Path: file.filename,
          loadStep1RecCnt: rowsRead,
          loadType: 'etl_transformation',
          correlationId,
          transformationJobId: transformationJobDbId,
          mappingName: mapping.mapping_name,
          userId: userId,
          userEmail: ledgerContext?.userEmail,
          ipAddress: ledgerContext?.userIp,
          sessionId: ledgerContext?.sessionId,
          processingDurationMs: 0,
          status: 'success',
          createdBy: userId,
          fileRole: 'source'
        });
        
        // Fetch vendor agreement file schema data classification if available
        let dataClassification = null;
        if (mapping.vendor_agreement_file_schema_id) {
          try {
            const fileSchemaResult = await pool.query(
              'SELECT data_classification FROM vendor_agreement_file_schemas WHERE id = $1',
              [mapping.vendor_agreement_file_schema_id]
            );
            if (fileSchemaResult.rows.length > 0) {
              dataClassification = fileSchemaResult.rows[0].data_classification;
            }
          } catch (schemaError) {
            systemLogger.error('Error fetching vendor agreement file schema', { 
              error: schemaError.message,
              vendor_agreement_file_schema_id: mapping.vendor_agreement_file_schema_id
            });
          }
        }
        
        // Capture target file audit (output file)
        await captureFileAudit(pool, {
          fileId: `transformed_${jobId}_${file.filename}`,
          fileName: outputFilename,
          fileSchemaId: schemaResult.schemaId,
          fileHash: crypto.createHash('sha256').update(outputBuffer).digest('hex'),
          filePattern: null,
          fileType: outputFormat,
          fileDelimiter: outputFormat === 'csv' ? ',' : null,
          encoding: 'utf-8',
          numberOfColumns: outputSchema.length,
          fileSizeBytes: outputBuffer.length,
          source: 'transformation',
          sourcePath: file.filename,
          noOfRecordsInSource: rowsRead,
          loadStep1: 'upload',
          loadStep1Path: uploadResult.location,
          loadStep1RecCnt: rowsWritten,
          loadType: 'etl_transformation',
          parentAuditId: sourceAuditId,
          correlationId,
          transformationJobId: transformationJobDbId,
          mappingName: mapping.mapping_name,
          userId: userId,
          userEmail: ledgerContext?.userEmail,
          ipAddress: ledgerContext?.userIp,
          sessionId: ledgerContext?.sessionId,
          processingDurationMs: 0,
          status: 'success',
          createdBy: userId,
          fileRole: 'target',
          metadata: JSON.stringify({
            pii_columns: mapping.pii_columns || [],
            transformation_id: mapping.mapping_id,
            data_classification: dataClassification
          })
        });
        
        await logJobExecution(pool, jobId, 'info', 
          `File audit captured for transformation`, {
          correlationId,
          sourceFile: file.filename,
          targetFile: outputFilename
        }, visualExecutionId, ledgerContext);
        
        // Create transformation lineage record (only if schema changed)
        try {
          const { generateSchemaFingerprint } = require('../utils/schemaFingerprint');
          
          // Build source schema from field mappings
          const sourceFields = new Set();
          if (mapping.field_mappings && Array.isArray(mapping.field_mappings)) {
            mapping.field_mappings.forEach(fieldMapping => {
              if (fieldMapping.sourceFields && Array.isArray(fieldMapping.sourceFields)) {
                fieldMapping.sourceFields.forEach(sf => sourceFields.add(sf));
              }
            });
          }
          
          const sourceSchema = Array.from(sourceFields).map(name => ({
            name,
            type: 'string' // Type will be inferred from actual data
          }));
          
          // Generate schema fingerprints
          const sourceFingerprint = generateSchemaFingerprint(sourceSchema);
          const targetFingerprint = generateSchemaFingerprint(outputSchema);
          const combinedFingerprint = crypto.createHash('sha256')
            .update(sourceFingerprint + '_to_' + targetFingerprint)
            .digest('hex');
          
          // Check if lineage with same schema already exists for this mapping
          const existingLineageCheck = await pool.query(`
            SELECT id, schema_fingerprint 
            FROM transformation_lineage 
            WHERE mapping_id = $1 
              AND lineage_type = 'file-specific'
              AND schema_fingerprint = $2
            ORDER BY created_at DESC 
            LIMIT 1
          `, [mapping.mapping_id, combinedFingerprint]);
          
          if (existingLineageCheck.rows.length > 0) {
            // Schema unchanged - update existing lineage timestamp and column mappings
            
            // Build column-level PII mappings even for updates (in case metadata changed)
            let columnMappings = [];
            
            try {
              // Fetch column_metadata from vendor agreement file schema if available
              let columnMetadata = {};
              
              if (mapping.vendor_agreement_id && mapping.vendor_agreement_file_schema_id) {
                const schemaResult = await pool.query(
                  'SELECT column_metadata FROM vendor_agreement_file_schemas WHERE id = $1',
                  [mapping.vendor_agreement_file_schema_id]
                );
                
                if (schemaResult.rows.length > 0 && schemaResult.rows[0].column_metadata) {
                  columnMetadata = schemaResult.rows[0].column_metadata;
                }
              }
              
              // If no vendor metadata, fetch PII info from upstream lineage (for chained transformations)
              if (Object.keys(columnMetadata).length === 0 && file.file_id) {
                const upstreamLineageResult = await pool.query(`
                  SELECT column_mappings 
                  FROM transformation_lineage 
                  WHERE output_file_id = $1 
                  ORDER BY created_at DESC 
                  LIMIT 1
                `, [file.file_id]);
                
                if (upstreamLineageResult.rows.length > 0 && upstreamLineageResult.rows[0].column_mappings) {
                  const upstreamMappings = upstreamLineageResult.rows[0].column_mappings;
                  // Build columnMetadata from upstream target columns
                  upstreamMappings.forEach(mapping => {
                    if (mapping.target_column && mapping.contains_pii) {
                      columnMetadata[mapping.target_column] = {
                        contains_pii: mapping.contains_pii,
                        pii_type: mapping.pii_type
                      };
                    }
                  });
                  
                  const piiColumnsFound = Object.keys(columnMetadata).filter(col => columnMetadata[col].contains_pii);
                  if (piiColumnsFound.length > 0) {
                    await logJobExecution(pool, jobId, 'info', 
                      `PII metadata inherited from upstream lineage (chained transformation)`, {
                      sourceFileId: file.file_id,
                      piiColumnsInherited: piiColumnsFound.length,
                      piiColumns: piiColumnsFound
                    });
                  }
                }
              }
              
              // Build column mappings from field_mappings with PII propagation
              if (mapping.field_mappings && Array.isArray(mapping.field_mappings)) {
                columnMappings = mapping.field_mappings.map(fieldMapping => {
                  // Handle both old (sourceFields array) and new (source_field string) formats
                  const sourceColumn = fieldMapping.source_field || 
                    (fieldMapping.sourceFields && fieldMapping.sourceFields.length > 0 ? fieldMapping.sourceFields[0] : null);
                  const targetColumn = fieldMapping.target_field || fieldMapping.targetField || null;
                  
                  // Check if source column has PII metadata
                  const sourcePiiInfo = sourceColumn && columnMetadata[sourceColumn] 
                    ? columnMetadata[sourceColumn] 
                    : null;
                  
                  return {
                    source_column: sourceColumn,
                    target_column: targetColumn,
                    contains_pii: sourcePiiInfo?.contains_pii || false,
                    pii_type: sourcePiiInfo?.pii_type || null,
                    transformation_applied: fieldMapping.transformation || 
                      (fieldMapping.transformations && fieldMapping.transformations.length > 0
                        ? fieldMapping.transformations.map(t => t.type).join(', ')
                        : null)
                  };
                }).filter(cm => cm.source_column && cm.target_column);
              }
            } catch (columnMappingError) {
              await logJobExecution(pool, jobId, 'warn', 
                `Failed to build column-level PII mappings for update: ${columnMappingError.message}`, {
                error: columnMappingError.stack
              });
            }
            
            const updateQuery = `
              UPDATE transformation_lineage 
              SET created_at = NOW(),
                  execution_id = $1,
                  output_file_id = $2,
                  column_mappings = $3
              WHERE id = $4
              RETURNING id
            `;
            
            await pool.query(updateQuery, [
              transformationJobDbId,
              `transformed_${jobId}_${file.filename}`,
              JSON.stringify(columnMappings),
              existingLineageCheck.rows[0].id
            ]);
            
            await logJobExecution(pool, jobId, 'info', 
              `Lineage updated with latest timestamp and column mappings`, {
              mappingId: mapping.mapping_id,
              lineageId: existingLineageCheck.rows[0].id,
              schemaFingerprint: combinedFingerprint,
              columnMappingsCount: columnMappings.length,
              piiColumnsTracked: columnMappings.filter(cm => cm.contains_pii).length
            });
          } else {
            // Schema changed or first time - create lineage record
            
            // Build column-level PII mappings for lineage tracking
            let columnMappings = [];
            
            try {
              // Fetch column_metadata from vendor agreement file schema if available
              let columnMetadata = {};
              
              if (mapping.vendor_agreement_id && mapping.vendor_agreement_file_schema_id) {
                const schemaResult = await pool.query(
                  'SELECT column_metadata FROM vendor_agreement_file_schemas WHERE id = $1',
                  [mapping.vendor_agreement_file_schema_id]
                );
                
                if (schemaResult.rows.length > 0 && schemaResult.rows[0].column_metadata) {
                  columnMetadata = schemaResult.rows[0].column_metadata;
                }
              }
              
              // If no vendor metadata, fetch PII info from upstream lineage (for chained transformations)
              if (Object.keys(columnMetadata).length === 0 && file.file_id) {
                const upstreamLineageResult = await pool.query(`
                  SELECT column_mappings 
                  FROM transformation_lineage 
                  WHERE output_file_id = $1 
                  ORDER BY created_at DESC 
                  LIMIT 1
                `, [file.file_id]);
                
                if (upstreamLineageResult.rows.length > 0 && upstreamLineageResult.rows[0].column_mappings) {
                  const upstreamMappings = upstreamLineageResult.rows[0].column_mappings;
                  // Build columnMetadata from upstream target columns
                  upstreamMappings.forEach(mapping => {
                    if (mapping.target_column && mapping.contains_pii) {
                      columnMetadata[mapping.target_column] = {
                        contains_pii: mapping.contains_pii,
                        pii_type: mapping.pii_type
                      };
                    }
                  });
                  
                  const piiColumnsFound = Object.keys(columnMetadata).filter(col => columnMetadata[col].contains_pii);
                  if (piiColumnsFound.length > 0) {
                    await logJobExecution(pool, jobId, 'info', 
                      `PII metadata inherited from upstream lineage (chained transformation)`, {
                      sourceFileId: file.file_id,
                      piiColumnsInherited: piiColumnsFound.length,
                      piiColumns: piiColumnsFound
                    });
                  }
                }
              }
              
              // Get PII columns array from mapping configuration (user-tagged PII fields)
              const piiColumnsArray = mapping.pii_columns || [];
              if (piiColumnsArray.length > 0) {
                await logJobExecution(pool, jobId, 'info', 
                  `PII columns defined in mapping configuration`, {
                  piiColumns: piiColumnsArray,
                  count: piiColumnsArray.length
                });
              }
              
              // Build column mappings from field_mappings with PII propagation
              if (mapping.field_mappings && Array.isArray(mapping.field_mappings)) {
                columnMappings = mapping.field_mappings.map(fieldMapping => {
                  // Handle both old (sourceFields array) and new (source_field string) formats
                  const sourceColumn = fieldMapping.source_field || 
                    (fieldMapping.sourceFields && fieldMapping.sourceFields.length > 0 ? fieldMapping.sourceFields[0] : null);
                  const targetColumn = fieldMapping.target_field || fieldMapping.targetField || null;
                  
                  // Check if source column has PII metadata from vendor schema or upstream lineage
                  const sourcePiiInfo = sourceColumn && columnMetadata[sourceColumn] 
                    ? columnMetadata[sourceColumn] 
                    : null;
                  
                  // Check if target column is marked as PII in mapping configuration
                  const isTargetPii = targetColumn && piiColumnsArray.includes(targetColumn);
                  
                  // Target field has PII if either:
                  // 1. Source field has PII (propagated)
                  // 2. Target field is explicitly marked as PII in mapping config
                  const containsPii = sourcePiiInfo?.contains_pii || isTargetPii || false;
                  const piiType = sourcePiiInfo?.pii_type || (isTargetPii ? 'PII' : null);
                  
                  return {
                    source_column: sourceColumn,
                    target_column: targetColumn,
                    contains_pii: containsPii,
                    pii_type: piiType,
                    transformation_applied: fieldMapping.transformation || 
                      (fieldMapping.transformations && fieldMapping.transformations.length > 0
                        ? fieldMapping.transformations.map(t => t.type).join(', ')
                        : null)
                  };
                }).filter(cm => cm.source_column && cm.target_column); // Only include mappings with both source and target
              }
            } catch (columnMappingError) {
              await logJobExecution(pool, jobId, 'warn', 
                `Failed to build column-level PII mappings: ${columnMappingError.message}`, {
                error: columnMappingError.stack
              });
            }
            
            // Prepare source/target metadata based on source type
            let sourceOwner, sourcePath, sourceAgreementName;
            
            if (mapping.vendor_agreement_id && mapping.vendor_agreement_metadata) {
              // Vendor agreement source
              sourceOwner = mapping.vendor_agreement_metadata.owner;
              sourcePath = mapping.vendor_agreement_metadata.path;
              sourceAgreementName = mapping.vendor_agreement_metadata.agreement_name;
              
              if (!sourceOwner) {
                await logJobExecution(pool, jobId, 'warn', 
                  'Vendor agreement missing primary contact for lineage tracking', {
                  agreementId: mapping.vendor_agreement_id
                });
              }
            } else {
              // Regular connection source
              sourceOwner = mapping.source_owner || null;
              // Extract path from filename (everything before last slash)
              const lastSlash = file.filename.lastIndexOf('/');
              sourcePath = lastSlash !== -1 ? file.filename.substring(0, lastSlash) : (mapping.file_path || null);
              sourceAgreementName = null;
            }
            
            const targetOwner = mapping.target_owner || null;
            const targetPath = mapping.target_file_path || null;
            
            const lineageQuery = `
              INSERT INTO transformation_lineage (
                transformation_id, 
                mapping_id,
                input_file_id, 
                output_file_id, 
                execution_id,
                schema_fingerprint,
                lineage_type,
                source_schema,
                target_schema,
                column_mappings,
                source_owner,
                target_owner,
                source_path,
                target_path,
                source_agreement_name,
                created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
              RETURNING id
            `;
            
            const lineageResult = await pool.query(lineageQuery, [
              mapping.transformation_id || `transform_${mapping.mapping_id}`,
              mapping.mapping_id,
              file.file_id || `source_${file.filename}`,
              `transformed_${jobId}_${file.filename}`,
              transformationJobDbId,
              combinedFingerprint,
              'file-specific',
              JSON.stringify(sourceSchema),
              JSON.stringify(outputSchema),
              JSON.stringify(columnMappings),
              sourceOwner,
              targetOwner,
              sourcePath,
              targetPath,
              sourceAgreementName
            ]);
            
            await logJobExecution(pool, jobId, 'info', 
              `Transformation lineage created`, {
              lineageId: lineageResult.rows[0]?.id,
              mappingId: mapping.mapping_id,
              inputFile: file.filename,
              outputFile: outputFilename,
              schemaFingerprint: combinedFingerprint,
              sourceFieldsCount: sourceSchema.length,
              targetFieldsCount: outputSchema.length,
              columnMappingsCount: columnMappings.length,
              piiColumnsTracked: columnMappings.filter(cm => cm.contains_pii).length
            });
          }
        } catch (lineageError) {
          // Log but don't fail the job if lineage creation fails
          await logJobExecution(pool, jobId, 'warn', 
            `Transformation lineage creation failed: ${lineageError.message}`, {
            error: lineageError.stack
          });
        }

        // Step 6: Profile the TARGET file using Python profilers (same as file upload)
        // Profile in-memory buffer to avoid redundant S3 download (performance optimization)
        try {
          // Use same file ID as audit/lineage for consistency
          const targetFileId = `transformed_${jobId}_${file.filename}`;
          
          await logJobExecution(pool, jobId, 'info', 
            `Profiling TARGET file from in-memory buffer using Python profilers`, {
            filename: outputFilename,
            fileRole: 'target',
            bufferSize: outputBuffer.length,
            fileId: targetFileId
          });

          // Profile the in-memory outputBuffer directly (avoids redundant S3 download)
          // Pass explicit fileId to match audit trail and ensure PII tags use same ID
          // Propagate governance metadata from source file to target file
          const targetProfilingResult = await profileFileBuffer({
            pool,
            fileBuffer: outputBuffer,
            filename: outputFilename,
            fileType: outputFormat,
            fileId: targetFileId,
            fileRole: 'target',
            mappingId: mapping.mapping_id,
            jobId,
            userId,
            projectId: mapping.project_id,
            containsPii: governance.containsPii,
            dataClassification: governance.dataClassification,
            piiColumns: governance.piiColumns,
            metadata: {
              pii_columns: mapping.pii_columns || governance.piiColumns || [],
              transformation_id: mapping.mapping_id,
              data_classification: governance.dataClassification || dataClassification
            }
          });

          if (targetProfilingResult.success) {
            await logJobExecution(pool, jobId, 'info', 
              `TARGET file profiling completed`, {
              fileId: targetProfilingResult.fileId,
              fileRole: 'target',
              rowCount: targetProfilingResult.rowCount,
              columnCount: targetProfilingResult.columnCount,
              qualityScore: targetProfilingResult.qualityScore
            });
            
            // Persist governance metadata using unified service (after profiling completes)
            try {
              // Combine governance from vendor agreement and mapping-specific PII columns
              const combinedPiiColumns = [
                ...(governance.piiColumns || []),
                ...(mapping.pii_columns || [])
              ];
              
              // Remove duplicates
              const uniquePiiColumns = [...new Set(combinedPiiColumns)];
              
              const governanceResult = await persistGovernanceMetadata(pool, {
                fileId: targetProfilingResult.fileId,
                containsPii: governance.containsPii || uniquePiiColumns.length > 0,
                dataClassification: governance.dataClassification,
                fileTags: governance.fileTags || [],
                piiColumns: uniquePiiColumns,
                profiledSchema: targetProfilingResult.schema || []
              });
              
              if (governanceResult.success) {
                await logJobExecution(pool, jobId, 'info', 
                  `TARGET file governance metadata persisted`, {
                  fileId: targetProfilingResult.fileId,
                  governanceApplied: governanceResult.governanceApplied
                });
              } else {
                await logJobExecution(pool, jobId, 'warn', 
                  `Failed to persist TARGET file governance metadata: ${governanceResult.error}`, {
                  fileId: targetProfilingResult.fileId
                });
              }
            } catch (govError) {
              await logJobExecution(pool, jobId, 'warn', 
                `Error persisting TARGET file governance metadata: ${govError.message}`, {
                fileId: targetProfilingResult.fileId
              });
            }
          } else {
            await logJobExecution(pool, jobId, 'warn', 
              `TARGET file profiling failed: ${targetProfilingResult.error}`, {
              fileRole: 'target'
            });
            // Profiling failed — ensure a minimal files row exists for this synthetic file_id
            // so that subsequent DQ rule runs can write quality_score back to it and the
            // catalog COALESCE fallback (f.quality_score) has a row to join against.
            try {
              const targetFileId = `transformed_${jobId}_${file.filename}`;
              await pool.query(`
                INSERT INTO files (file_id, filename, file_type, file_size, row_count, column_count,
                  file_role, correlation_id, project_id, processing_step, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, 'target', $7, $8, 'complete', NOW(), NOW())
                ON CONFLICT (file_id) DO NOTHING
              `, [
                targetFileId,
                outputFilename,
                outputFormat,
                outputBuffer.length,
                rowsWritten,
                outputSchema.length,
                correlationId,
                mapping.project_id || null
              ]);
              await logJobExecution(pool, jobId, 'info',
                'Minimal files row upserted for VM target file (profiling failed)', {
                fileId: targetFileId
              });
            } catch (fallbackErr) {
              await logJobExecution(pool, jobId, 'warn',
                `Failed to upsert minimal files row for VM target: ${fallbackErr.message}`, {
                error: fallbackErr.stack
              });
            }
          }
        } catch (profilingError) {
          // Log but don't fail the job if profiling fails
          await logJobExecution(pool, jobId, 'warn', 
            `TARGET file profiling failed: ${profilingError.message}`, {
            error: profilingError.stack
          });
          // Ensure a minimal files row exists so DQ rule runs can store quality_score
          // for this VM target file even when the Python profiler is unavailable.
          try {
            const targetFileId = `transformed_${jobId}_${file.filename}`;
            await pool.query(`
              INSERT INTO files (file_id, filename, file_type, file_size, row_count, column_count,
                file_role, correlation_id, project_id, processing_step, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, 'target', $7, $8, 'complete', NOW(), NOW())
              ON CONFLICT (file_id) DO NOTHING
            `, [
              targetFileId,
              outputFilename,
              outputFormat,
              outputBuffer.length,
              rowsWritten,
              outputSchema.length,
              correlationId,
              mapping.project_id || null
            ]);
            await logJobExecution(pool, jobId, 'info',
              'Minimal files row upserted for VM target file (profiling exception)', {
              fileId: targetFileId
            });
          } catch (fallbackErr) {
            await logJobExecution(pool, jobId, 'warn',
              `Failed to upsert minimal files row for VM target: ${fallbackErr.message}`, {
              error: fallbackErr.stack
            });
          }
        }
      } catch (auditError) {
        // Log but don't fail the job if audit fails
        await logJobExecution(pool, jobId, 'warn', 
          `File audit capture failed: ${auditError.message}`, {
          error: auditError.stack
        });
      }
    }
    
    return {
      rowsRead,
      rowsWritten,
      rowsFailed,
      hasWarnViolations
    };
    
  } catch (error) {
    await logJobExecution(pool, jobId, 'error', 
      `File processing error: ${file.filename}`, {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Convert database field mapping format to transformRow expected format
 * @param {Array} dbFieldMappings - Field mappings from database
 * @returns {Array} - Converted field mappings for transformRow
 */
function convertFieldMappings(dbFieldMappings) {
  if (!dbFieldMappings || dbFieldMappings.length === 0) {
    return [];
  }
  
  const { parseExpressionToTransformation, evaluateTransformationConfig } = require('./expressionParser');
  
  return dbFieldMappings.map(mapping => {
    const converted = {
      targetField: mapping.target_field,
      sourceFields: [],
      transformations: []
    };
    
    // NEW FORMAT: expression field (from visual builder)
    if (mapping.expression) {
      try {
        const transformConfig = parseExpressionToTransformation(mapping.expression);
        
        if (transformConfig) {
          const { sourceFields, transformations } = evaluateTransformationConfig(transformConfig);
          converted.sourceFields = sourceFields;
          converted.transformations = transformations;
        }
      } catch (error) {
        systemLogger.error('Expression parsing failed for mapping:', {
          target_field: mapping.target_field,
          expression: mapping.expression,
          error: error.message
        });
        // Fall through to legacy format or empty
      }
    } 
    // LEGACY FORMAT: transformation + transformation_params
    else if (mapping.transformation && mapping.transformation !== 'none') {
      // Handle source_field - it can be a string, array, or null from JSONB storage
      if (mapping.source_field) {
        if (Array.isArray(mapping.source_field)) {
          converted.sourceFields = mapping.source_field;
        } else {
          converted.sourceFields = [mapping.source_field];
        }
      }
      
      // Normalize transformation name (handle hyphenated and uppercase variants)
      let transformationType = mapping.transformation.toLowerCase().replace(/-/g, '_');
      
      // Map common UI names to engine names
      const legacyTypeMap = {
        'cast_string': 'cast',
        'cast_integer': 'cast',
        'cast_float': 'cast',
        'cast_boolean': 'cast',
        'null_to_value': 'null_to_value',
        'trim': 'trim',
        'round': 'round',
        'ceil': 'ceil',
        'floor': 'floor',
        'upper': 'upper',
        'lower': 'lower'
      };
      
      transformationType = legacyTypeMap[transformationType] || transformationType;
      
      // Adjust params based on type
      let params = { ...(mapping.transformation_params || {}) };
      if (transformationType === 'cast') {
        // Infer target type from original transformation name
        const originalName = mapping.transformation.toLowerCase().replace(/-/g, '_');
        if (originalName.includes('string')) params.targetType = 'string';
        else if (originalName.includes('integer')) params.targetType = 'integer';
        else if (originalName.includes('float')) params.targetType = 'float';
        else if (originalName.includes('boolean')) params.targetType = 'boolean';
        else if (!params.targetType) params.targetType = 'string';
      } else if (transformationType === 'null_to_value' && params.value && !params.defaultValue) {
        // Map 'value' param to 'defaultValue'
        params.defaultValue = params.value;
        delete params.value;
      } else if (transformationType === 'concat') {
        // Handle legacy concat format with column2 parameter
        // Convert to proper concatParts format for the transformation engine
        const sourceField = converted.sourceFields[0];
        const column2 = params.column2;
        const separator = params.separator || '';
        
        if (sourceField && column2) {
          // Build concatParts array with proper field references
          params.concatParts = [
            { type: 'field', value: sourceField },
            { type: 'literal', value: separator },
            { type: 'field', value: column2 }
          ];
          // Also add column2 to sourceFields for proper row context
          if (!converted.sourceFields.includes(column2)) {
            converted.sourceFields.push(column2);
          }
          // Clean up legacy params
          delete params.column2;
          delete params.separator;
        } else if (sourceField && !column2) {
          // Single field concat with possible prefix/suffix - build fields array
          params.fields = [sourceField];
        }
      }
      
      converted.transformations.push({
        type: transformationType,
        params
      });
    }
    // SIMPLE PASS-THROUGH: just source to target
    // Handle both singular (source_field) and plural (sourceFields/source_fields) variants
    else if (mapping.source_field) {
      if (Array.isArray(mapping.source_field)) {
        converted.sourceFields = mapping.source_field;
      } else {
        converted.sourceFields = [mapping.source_field];
      }
    }
    // Handle passthrough mappings with pre-defined sourceFields (from compiler)
    else if (mapping.sourceFields && Array.isArray(mapping.sourceFields) && mapping.sourceFields.length > 0) {
      converted.sourceFields = mapping.sourceFields;
    }
    else if (mapping.source_fields && Array.isArray(mapping.source_fields) && mapping.source_fields.length > 0) {
      converted.sourceFields = mapping.source_fields;
    }
    
    return converted;
  });
}

/**
 * Convert database variable definitions to transformRow expected format
 * @param {Array} dbVariables - Variables from database
 * @returns {Array} - Converted variables for transformRow
 */
function convertVariables(dbVariables) {
  if (!dbVariables || dbVariables.length === 0) {
    return [];
  }
  
  const { parseExpressionToTransformation, evaluateTransformationConfig } = require('./expressionParser');
  
  // Sort by sequence to ensure correct evaluation order
  const sortedVariables = [...dbVariables].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  
  return sortedVariables.map(variable => {
    const converted = {
      name: variable.name,
      sourceFields: [],
      transformations: []
    };
    
    // NEW FORMAT: expression field
    if (variable.expression) {
      try {
        const transformConfig = parseExpressionToTransformation(variable.expression);
        
        if (transformConfig) {
          const { sourceFields, transformations } = evaluateTransformationConfig(transformConfig);
          converted.sourceFields = sourceFields;
          converted.transformations = transformations;
        }
      } catch (error) {
        systemLogger.error('Expression parsing failed for variable:', {
          name: variable.name,
          expression: variable.expression,
          error: error.message
        });
      }
    }
    // LEGACY FORMAT: transformation + params
    else if (variable.transformation) {
      if (variable.source_field) {
        converted.sourceFields = Array.isArray(variable.source_field) 
          ? variable.source_field 
          : [variable.source_field];
      }
      
      if (variable.transformation !== 'none') {
        converted.transformations.push({
          type: variable.transformation,
          params: variable.params || {}
        });
      }
    }
    
    return converted;
  });
}

/**
 * Parse CSV and apply transformations
 * @param {Buffer} buffer - File buffer
 * @param {Array} fieldMappings - Field mappings
 * @param {Object} variables - Variables
 * @param {string} jobId - Job ID
 * @param {Object} pool - Database pool
 * @param {Object} rdmContext - RDM context
 * @param {Object} options - Additional options
 * @param {Array} options.headers - Custom column headers for headerless files
 * @param {boolean} options.skipFirstRow - Whether to skip first row (default true for files with headers)
 */
async function parseAndTransformCSV(buffer, fieldMappings, variables, jobId, pool, rdmContext = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const { headers: customHeaders = null, skipFirstRow = true } = options;
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    let firstRow = null;
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000; // Limit memory usage
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    const stream = Readable.from(buffer);
    
    // Configure CSV parser options
    const csvOptions = {};
    if (customHeaders) {
      // Use custom headers for headerless files
      csvOptions.headers = customHeaders;
      csvOptions.skipLines = skipFirstRow ? 0 : 0; // Don't skip any lines for headerless files
      systemLogger.info('CSV parsing with custom headers', {
        headers: customHeaders,
        headerCount: customHeaders.length
      });
    }
    
    stream
      .pipe(csv(csvOptions))
      .on('data', (row) => {
        rowsRead++;
        
        // Capture source row for profiling (limit to first 1000 rows)
        if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
          sourceRows.push({...row}); // Clone the row
        }
        
        // Log first row for debugging (only column names, not data)
        if (rowsRead === 1) {
          firstRow = row;
          systemLogger.info('CSV first row columns:', { 
            columns: Object.keys(row),
            fieldMappingsCount: convertedMappings?.length || 0
          });
          systemLogger.info('Converted field mappings sample:', {
            sample: convertedMappings.slice(0, 3)
          });
        }
        
        try {
          const transformedRow = transformRow(row, convertedMappings, convertedVariables, rdmContext);
          
          // Debug first transformed row
          if (rowsRead === 1) {
            systemLogger.info('First transformed row structure:', {
              keys: Object.keys(transformedRow),
              valueTypes: Object.keys(transformedRow).reduce((acc, key) => {
                acc[key] = typeof transformedRow[key];
                return acc;
              }, {})
            });
          }
          
          // Check if transformedRow has any data
          if (Object.keys(transformedRow).length === 0) {
            systemLogger.warn('Transformed row is empty', {
              rowNumber: rowsRead,
              columnCount: Object.keys(row).length
            });
          }
          
          transformedRows.push(transformedRow);
          rowsWritten++;
        } catch (error) {
          rowsFailed++;
          systemLogger.error('Row transformation error', { 
            row: rowsRead, 
            error: error.message
          });
        }
      })
      .on('end', () => {
        systemLogger.info('CSV parsing complete', {
          rowsRead,
          rowsWritten,
          rowsFailed,
          transformedRowsCount: transformedRows.length,
          sourceRowsCount: sourceRows.length,
          hasData: transformedRows.length > 0
        });
        
        resolve({ 
          transformedRows,
          sourceRows, // Include source rows for profiling
          rowsRead, 
          rowsWritten, 
          rowsFailed 
        });
      })
      .on('error', (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      });
  });
}

/**
 * Parse JSON and apply transformations
 */
async function parseAndTransformJSON(buffer, fieldMappings, variables, jobId, pool, rdmContext = {}) {
  try {
    const jsonData = JSON.parse(buffer.toString());
    const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
    
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    for (const row of dataArray) {
      rowsRead++;
      
      // Capture source row for profiling (limit to first 1000 rows)
      if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
        sourceRows.push({...row});
      }
      
      try {
        const transformedRow = transformRow(row, convertedMappings, convertedVariables, rdmContext);
        transformedRows.push(transformedRow);
        rowsWritten++;
      } catch (error) {
        rowsFailed++;
        systemLogger.error('Row transformation error', { 
          row: rowsRead, 
          error: error.message 
        });
      }
    }
    
    return { 
      transformedRows,
      sourceRows,
      rowsRead, 
      rowsWritten, 
      rowsFailed 
    };
    
  } catch (error) {
    throw new Error(`JSON parsing error: ${error.message}`);
  }
}

/**
 * Parse XLSX (Excel) and apply transformations
 */
async function parseAndTransformXLSX(buffer, fieldMappings, variables, jobId, pool, rdmContext = {}) {
  try {
    // Parse XLSX file
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);
    
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    for (const row of jsonData) {
      rowsRead++;
      
      // Capture source row for profiling (limit to first 1000 rows)
      if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
        sourceRows.push({...row});
      }
      
      try {
        const transformedRow = transformRow(row, convertedMappings, convertedVariables, rdmContext);
        transformedRows.push(transformedRow);
        rowsWritten++;
      } catch (error) {
        rowsFailed++;
        systemLogger.error('Row transformation error', { 
          row: rowsRead, 
          error: error.message 
        });
      }
    }
    
    return { 
      transformedRows,
      sourceRows,
      rowsRead, 
      rowsWritten, 
      rowsFailed 
    };
    
  } catch (error) {
    throw new Error(`XLSX parsing error: ${error.message}`);
  }
}

/**
 * Parse Parquet and apply transformations
 */
async function parseAndTransformParquet(buffer, fieldMappings, variables, jobId, pool, rdmContext = {}) {
  try {
    // Dynamic import for hyparquet (ES module)
    const { parquetReadObjects } = await import('hyparquet');
    
    // Convert Node.js Buffer to ArrayBuffer for hyparquet
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset, 
      buffer.byteOffset + buffer.byteLength
    );
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    systemLogger.info('Parquet parsing started');
    
    // Read parquet file as async iterator
    const parquetIterator = await parquetReadObjects({ file: arrayBuffer });
    
    // Consume async iterator properly
    for await (const row of parquetIterator) {
      rowsRead++;
      
      // Capture source row for profiling (limit to first 1000 rows)
      if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
        sourceRows.push({...row});
      }
      
      try {
        // Log first row for debugging
        if (rowsRead === 1) {
          systemLogger.info('Parquet first row columns:', { 
            columns: Object.keys(row),
            sample: Object.keys(row).slice(0, 5)
          });
        }
        
        const transformedRow = transformRow(row, convertedMappings, convertedVariables, rdmContext);
        transformedRows.push(transformedRow);
        rowsWritten++;
      } catch (error) {
        rowsFailed++;
        systemLogger.error('Row transformation error', { 
          row: rowsRead, 
          error: error.message 
        });
      }
    }
    
    systemLogger.info('Parquet parsing complete', {
      rowsRead,
      rowsWritten,
      rowsFailed,
      sourceRowsCount: sourceRows.length
    });
    
    return { 
      transformedRows,
      sourceRows,
      rowsRead, 
      rowsWritten, 
      rowsFailed 
    };
    
  } catch (error) {
    systemLogger.error('Parquet parsing error:', error);
    throw new Error(`Parquet parsing error: ${error.message}`);
  }
}

/**
 * Flatten nested object into dot notation
 * Handles arrays of objects by flattening the first element to extract schema
 * Example: { user: { name: 'John', address: { city: 'NYC' } } }
 * becomes: { 'user.name': 'John', 'user.address.city': 'NYC' }
 * Example: { items: [{id: 1, name: 'A'}, {id: 2, name: 'B'}] }
 * becomes: { 'items.id': 1, 'items.name': 'A' }
 */
function flattenObject(obj, prefix = '') {
  const flattened = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value === null || value === undefined) {
        // Null or undefined values
        flattened[newKey] = value;
      } else if (Array.isArray(value)) {
        // Handle arrays
        if (value.length === 0) {
          // Empty array
          flattened[newKey] = '';
        } else if (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
          // Array of objects - flatten the first object to extract schema
          const firstElement = value[0];
          Object.assign(flattened, flattenObject(firstElement, newKey));
        } else {
          // Array of primitives - convert to comma-separated string
          flattened[newKey] = value.join(', ');
        }
      } else if (typeof value === 'object') {
        // Nested object - recursively flatten
        Object.assign(flattened, flattenObject(value, newKey));
      } else {
        // Primitive value
        flattened[newKey] = value;
      }
    }
  }
  
  return flattened;
}

/**
 * Parse XML and apply transformations
 * Enhanced to handle multiple XML structures similar to file upload feature
 */
async function parseAndTransformXML(buffer, fieldMappings, variables, jobId, pool, rdmContext = {}) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: true,
      parseAttributeValue: true,
      trimValues: true
    });
    
    const xmlData = parser.parse(buffer.toString());
    
    systemLogger.info('XML structure parsed', { 
      rootKeys: Object.keys(xmlData),
      jobId 
    });
    
    // Extract records - handle various XML structures
    let records = [];
    
    // Strategy 1: Check if entire parsed data is already an array
    if (Array.isArray(xmlData)) {
      records = xmlData;
      systemLogger.info('XML: Root is array', { count: records.length, jobId });
    } 
    // Strategy 2: Navigate through root element
    else if (typeof xmlData === 'object' && xmlData !== null) {
      const rootKeys = Object.keys(xmlData).filter(key => key !== '?xml');
      
      if (rootKeys.length === 0) {
        throw new Error('XML file appears to be empty');
      }
      
      // Get the root element (usually there's only one)
      const rootElement = xmlData[rootKeys[0]];
      
      systemLogger.info('XML: Examining root element', { 
        rootKey: rootKeys[0], 
        isArray: Array.isArray(rootElement),
        isObject: typeof rootElement === 'object',
        jobId 
      });
      
      // Strategy 2a: Root element is directly an array
      if (Array.isArray(rootElement)) {
        records = rootElement;
        systemLogger.info('XML: Root element is array', { count: records.length, jobId });
      }
      // Strategy 2b: Root element is object - find arrays within it
      else if (typeof rootElement === 'object' && rootElement !== null) {
        // Look for array properties (common pattern: <root><records><record>...</record></records></root>)
        const arrayKeys = Object.keys(rootElement).filter(key => Array.isArray(rootElement[key]));
        
        if (arrayKeys.length > 0) {
          // Use the first array found (or the largest one)
          let selectedKey = arrayKeys[0];
          if (arrayKeys.length > 1) {
            // Choose the array with the most elements
            selectedKey = arrayKeys.reduce((largest, key) => {
              return rootElement[key].length > rootElement[largest].length ? key : largest;
            }, arrayKeys[0]);
          }
          
          records = rootElement[selectedKey];
          systemLogger.info('XML: Found array in root element', { 
            key: selectedKey, 
            count: records.length,
            availableKeys: arrayKeys,
            jobId 
          });
        }
        // Strategy 2c: Root element is a single object (single record XML)
        else {
          records = [rootElement];
          systemLogger.info('XML: Single record XML', { jobId });
        }
      }
      // Strategy 2d: Root element is primitive (unusual but handle it)
      else {
        records = [{ value: rootElement }];
        systemLogger.warn('XML: Root element is primitive value', { jobId });
      }
    }
    
    if (records.length === 0) {
      systemLogger.warn('XML: No records extracted from file', { 
        xmlStructure: JSON.stringify(xmlData).substring(0, 200),
        jobId 
      });
      throw new Error('No records found in XML file. Please check the XML structure.');
    }
    
    systemLogger.info('XML: Starting transformation', { 
      recordCount: records.length,
      jobId 
    });
    
    const transformedRows = [];
    const sourceRows = []; // Capture source rows for profiling
    const MAX_SOURCE_ROWS_FOR_PROFILING = 1000;
    let rowsRead = 0;
    let rowsWritten = 0;
    let rowsFailed = 0;
    
    // Convert field mappings and variables to expected format
    const convertedMappings = convertFieldMappings(fieldMappings);
    const convertedVariables = convertVariables(variables);
    
    for (const row of records) {
      rowsRead++;
      try {
        // Flatten nested XML structure before transformation
        const flattenedRow = flattenObject(row);
        
        // Capture source row for profiling (limit to first 1000 rows)
        if (rowsRead <= MAX_SOURCE_ROWS_FOR_PROFILING) {
          sourceRows.push({...flattenedRow});
        }
        
        // Log first flattened row for debugging
        if (rowsRead === 1) {
          systemLogger.info('XML first row (flattened):', { 
            keys: Object.keys(flattenedRow),
            sampleKeys: Object.keys(flattenedRow).slice(0, 10),
            jobId
          });
        }
        
        const transformedRow = transformRow(flattenedRow, convertedMappings, convertedVariables, rdmContext);
        transformedRows.push(transformedRow);
        rowsWritten++;
      } catch (error) {
        rowsFailed++;
        systemLogger.error('Row transformation error', { 
          row: rowsRead, 
          error: error.message,
          stack: error.stack,
          jobId
        });
      }
    }
    
    systemLogger.info('XML transformation complete', {
      rowsRead,
      rowsWritten,
      rowsFailed,
      sourceRowsCount: sourceRows.length,
      jobId
    });
    
    return { 
      transformedRows,
      sourceRows,
      rowsRead, 
      rowsWritten, 
      rowsFailed 
    };
    
  } catch (error) {
    systemLogger.error('XML parsing failed', {
      error: error.message,
      stack: error.stack,
      jobId
    });
    throw new Error(`XML parsing error: ${error.message}`);
  }
}

/**
 * Generate output filename with correct extension based on output format
 */
function generateOutputFilename(inputFilename, mappingName, outputFormat = 'csv') {
  // Remove original extension
  const nameWithoutExt = inputFilename.replace(/\.[^/.]+$/, '');
  
  // Add new extension based on output format
  const extension = outputFormat.toLowerCase();
  return `${nameWithoutExt}.${extension}`;
}

/**
 * Convert transformed rows to specified format
 */
async function convertToFormat(rows, format = 'csv') {
  if (rows.length === 0) return Buffer.from('');
  
  const formatLower = format.toLowerCase();
  
  switch (formatLower) {
    case 'csv':
      return convertToCSV(rows);
    case 'json':
      return convertToJSON(rows);
    case 'xlsx':
      return convertToXLSX(rows);
    case 'parquet':
      return convertToParquet(rows);
    case 'xml':
      return convertToXML(rows);
    default:
      systemLogger.warn(`Unsupported output format: ${format}, defaulting to CSV`);
      return convertToCSV(rows);
  }
}

/**
 * Convert transformed rows to CSV format
 */
function convertToCSV(rows) {
  if (rows.length === 0) return Buffer.from('');
  
  // Get headers from first row
  const headers = Object.keys(rows[0]);
  
  // Build CSV string
  let csv = headers.join(',') + '\n';
  
  for (const row of rows) {
    const values = headers.map(header => {
      const value = row[header] || '';
      // Escape values containing commas or quotes
      if (value.toString().includes(',') || value.toString().includes('"')) {
        return `"${value.toString().replace(/"/g, '""')}"`;
      }
      return value;
    });
    csv += values.join(',') + '\n';
  }
  
  return Buffer.from(csv);
}

/**
 * Convert transformed rows to JSON format
 */
function convertToJSON(rows) {
  if (rows.length === 0) return Buffer.from('[]');
  
  const jsonString = JSON.stringify(rows, null, 2);
  return Buffer.from(jsonString);
}

/**
 * Convert transformed rows to XLSX (Excel) format
 */
function convertToXLSX(rows) {
  if (rows.length === 0) {
    // Create empty workbook
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([]);
    xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
    return Buffer.from(xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }
  
  // Convert rows to worksheet
  const ws = xlsx.utils.json_to_sheet(rows);
  
  // Create workbook and add worksheet
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
  
  // Write to buffer
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buffer);
}

/**
 * Convert transformed rows to Parquet format
 * Note: Parquet writing requires hyparquet-writer which may not be available
 */
async function convertToParquet(rows) {
  try {
    if (rows.length === 0) {
      return Buffer.from('');
    }
    
    // Import hyparquet-writer
    const { parquetWriteBuffer } = await import('hyparquet-writer');
    
    // Text encoder for converting strings to Uint8Array
    const encoder = new TextEncoder();
    
    // Convert row-based data to column-based format
    const columnData = [];
    const columnNames = Object.keys(rows[0]);
    
    for (const columnName of columnNames) {
      const rawValues = rows.map(row => row[columnName]);
      
      // Infer column type from first non-null value
      let type = 'STRING'; // default type
      let processedValues = rawValues;
      
      for (const value of rawValues) {
        if (value !== null && value !== undefined) {
          if (typeof value === 'number') {
            type = Number.isInteger(value) ? 'INT32' : 'DOUBLE';
          } else if (typeof value === 'boolean') {
            type = 'BOOLEAN';
          } else if (value instanceof Date) {
            type = 'INT64'; // timestamp in milliseconds
            processedValues = rawValues.map(v => v instanceof Date ? v.getTime() : v);
          }
          break;
        }
      }
      
      // For STRING type, encode values as Uint8Array
      if (type === 'STRING') {
        processedValues = rawValues.map(value => {
          if (value === null || value === undefined) {
            return null;
          }
          const strValue = String(value);
          return encoder.encode(strValue);
        });
      }
      
      columnData.push({
        name: columnName,
        data: processedValues,
        type: type
      });
    }
    
    // Write parquet file to buffer
    const arrayBuffer = parquetWriteBuffer({ columnData });
    return Buffer.from(arrayBuffer);
    
  } catch (error) {
    systemLogger.warn('Parquet writing not available, falling back to JSON', {
      error: error.message
    });
    // Fallback to JSON if parquet writer not available
    return convertToJSON(rows);
  }
}

/**
 * Convert transformed rows to XML format
 * Creates a well-formed XML document with nested structure
 */
function convertToXML(rows) {
  if (rows.length === 0) {
    return Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<root></root>');
  }
  
  const { XMLBuilder } = require('fast-xml-parser');
  
  // Configure XML builder
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    indentBy: '  ',
    suppressEmptyNode: false
  });
  
  // Reconstruct nested objects from dot-notation keys
  const reconstructedRows = rows.map(row => {
    const reconstructed = {};
    
    for (const key in row) {
      // Prevent prototype pollution by checking hasOwnProperty and dangerous keys
      if (!row.hasOwnProperty(key)) continue;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        console.warn(`Skipping dangerous key in XML conversion: ${key}`);
        continue;
      }
      
      const value = row[key];
      const parts = key.split('.');
      
      // If it's a simple key (no dots), just assign it
      if (parts.length === 1) {
        reconstructed[key] = value;
      } else {
        // Reconstruct nested structure with prototype pollution protection
        let current = reconstructed;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          // Check for dangerous property names at each level
          if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
            console.warn(`Skipping dangerous nested key in XML conversion: ${part}`);
            break;
          }
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
        const lastPart = parts[parts.length - 1];
        if (lastPart !== '__proto__' && lastPart !== 'constructor' && lastPart !== 'prototype') {
          current[lastPart] = value;
        }
      }
    }
    
    return reconstructed;
  });
  
  // Build XML structure
  const xmlStructure = {
    '?xml': {
      '@_version': '1.0',
      '@_encoding': 'UTF-8'
    },
    root: {
      record: reconstructedRows
    }
  };
  
  // Convert to XML string
  const xmlString = builder.build(xmlStructure);
  
  return Buffer.from(xmlString);
}

/**
 * Get job status
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Job status with logs
 */
async function getJobStatus(pool, jobId) {
  try {
    const jobResult = await pool.query(
      'SELECT * FROM transformation_jobs WHERE job_id = $1',
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new Error(`Job not found: ${jobId}`);
    }
    
    const logsResult = await pool.query(
      'SELECT * FROM transformation_logs WHERE job_id = $1 ORDER BY timestamp ASC',
      [jobId]
    );
    
    return {
      job: jobResult.rows[0],
      logs: logsResult.rows
    };
    
  } catch (error) {
    systemLogger.error('Error getting job status:', error);
    throw error;
  }
}

/**
 * Cancel a running job
 * @param {Pool} pool - Database connection pool
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Updated job record
 */
async function cancelJob(pool, jobId) {
  try {
    // Check current job status
    const jobResult = await pool.query(
      'SELECT * FROM transformation_jobs WHERE job_id = $1',
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new Error(`Job not found: ${jobId}`);
    }
    
    const currentStatus = jobResult.rows[0].status;
    
    // Check if job is in a terminal state
    if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'cancelled') {
      const error = new Error(`Cannot cancel job: Job is already ${currentStatus}`);
      error.statusCode = 409; // Conflict
      throw error;
    }
    
    // Only cancel if job is in a cancellable state (pending, running)
    const result = await updateJob(pool, jobId, {
      status: 'cancelled',
      end_time: new Date()
    });
    
    await logJobExecution(pool, jobId, 'info', 'Job cancelled by user');
    
    systemLogger.info('Job cancelled', { jobId, previousStatus: currentStatus });
    
    return result;
    
  } catch (error) {
    systemLogger.error('Error cancelling job:', error);
    throw error;
  }
}

module.exports = {
  createJob,
  executeTransformationJob,
  getJobStatus,
  updateJob,
  cancelJob,
  logJobExecution,
  getMappingConfig,
  processFile,
  downloadFileFromConnection,
  parseFileToRows,
  listAndFilterFiles
};
