/**
 * Schema Extraction Utility
 * Extracts column names and types from various file formats
 */

const fs = require('fs');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const { XMLParser } = require('fast-xml-parser');
const axios = require('axios');
const path = require('path');

/**
 * Infer type from a value
 */
function inferType(value) {
  if (value === null || value === undefined || value === '') {
    return 'string'; // Default to string for null/empty
  }
  
  const strValue = String(value).trim();
  
  // Boolean
  if (strValue === 'true' || strValue === 'false') {
    return 'boolean';
  }
  
  // Integer
  if (/^-?\d+$/.test(strValue)) {
    return 'integer';
  }
  
  // Float
  if (/^-?\d+\.\d+$/.test(strValue)) {
    return 'float';
  }
  
  // Date (ISO format, MM/DD/YYYY, YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(strValue) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(strValue)) {
    return 'date';
  }
  
  // Timestamp (ISO with time)
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(strValue)) {
    return 'timestamp';
  }
  
  return 'string';
}

/**
 * Extract schema from CSV file
 */
async function extractSchemaFromCSV(filePath) {
  return new Promise((resolve, reject) => {
    const schema = [];
    const rows = [];
    let headerProcessed = false;
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        if (!headerProcessed) {
          // Initialize schema from headers
          Object.keys(row).forEach(columnName => {
            schema.push({
              name: columnName,
              type: 'string' // Will be refined with sample data
            });
          });
          headerProcessed = true;
        }
        
        // Collect sample rows for type inference (limit to 100 rows)
        if (rows.length < 100) {
          rows.push(row);
        }
      })
      .on('end', () => {
        // Infer types from sample data
        schema.forEach((col, index) => {
          const columnName = col.name;
          const sampleValues = rows.map(row => row[columnName]).filter(v => v !== null && v !== undefined && v !== '');
          
          if (sampleValues.length > 0) {
            // Get type from first non-null value
            const types = sampleValues.slice(0, 10).map(inferType);
            const mostCommonType = types.reduce((acc, type) => {
              acc[type] = (acc[type] || 0) + 1;
              return acc;
            }, {});
            
            col.type = Object.keys(mostCommonType).reduce((a, b) => 
              mostCommonType[a] > mostCommonType[b] ? a : b
            );
          }
        });
        
        resolve(schema);
      })
      .on('error', reject);
  });
}

/**
 * Extract schema from XLSX file
 */
function extractSchemaFromXLSX(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0]; // Use first sheet
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);
  
  if (data.length === 0) {
    return [];
  }
  
  const schema = [];
  const headers = Object.keys(data[0]);
  
  headers.forEach(columnName => {
    const sampleValues = data.slice(0, 100).map(row => row[columnName]).filter(v => v !== null && v !== undefined && v !== '');
    
    let type = 'string';
    if (sampleValues.length > 0) {
      const types = sampleValues.slice(0, 10).map(inferType);
      const mostCommonType = types.reduce((acc, t) => {
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {});
      
      type = Object.keys(mostCommonType).reduce((a, b) => 
        mostCommonType[a] > mostCommonType[b] ? a : b
      );
    }
    
    schema.push({ name: columnName, type });
  });
  
  return schema;
}

/**
 * Extract schema from JSON file
 */
function extractSchemaFromJSON(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  
  // Handle both array and single object
  const records = Array.isArray(data) ? data : [data];
  
  if (records.length === 0) {
    return [];
  }
  
  const schema = [];
  const headers = Object.keys(records[0]);
  
  headers.forEach(columnName => {
    const sampleValues = records.slice(0, 100).map(row => row[columnName]).filter(v => v !== null && v !== undefined && v !== '');
    
    let type = 'string';
    if (sampleValues.length > 0) {
      const types = sampleValues.slice(0, 10).map(inferType);
      const mostCommonType = types.reduce((acc, t) => {
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {});
      
      type = Object.keys(mostCommonType).reduce((a, b) => 
        mostCommonType[a] > mostCommonType[b] ? a : b
      );
    }
    
    schema.push({ name: columnName, type });
  });
  
  return schema;
}

/**
 * Extract schema from XML file
 */
function extractSchemaFromXML(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false });
  const result = parser.parse(content);
  
  // Try to find array of records (common patterns: root.records, root.data, or direct array)
  let records = [];
  
  // Navigate through common XML structures
  const findRecords = (obj) => {
    if (Array.isArray(obj)) {
      return obj;
    }
    
    if (typeof obj === 'object' && obj !== null) {
      for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          return value;
        }
        if (typeof value === 'object') {
          const found = findRecords(value);
          if (found.length > 0) return found;
        }
      }
    }
    
    return [];
  };
  
  records = findRecords(result);
  
  if (records.length === 0) {
    return [];
  }
  
  const schema = [];
  const headers = Object.keys(records[0]);
  
  headers.forEach(columnName => {
    const sampleValues = records.slice(0, 100).map(row => row[columnName]).filter(v => v !== null && v !== undefined && v !== '');
    
    let type = 'string';
    if (sampleValues.length > 0) {
      const types = sampleValues.slice(0, 10).map(inferType);
      const mostCommonType = types.reduce((acc, t) => {
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {});
      
      type = Object.keys(mostCommonType).reduce((a, b) => 
        mostCommonType[a] > mostCommonType[b] ? a : b
      );
    }
    
    schema.push({ name: columnName, type });
  });
  
  return schema;
}

/**
 * Extract schema from Parquet file
 */
async function extractSchemaFromParquet(filePath) {
  try {
    const { parquetRead } = require('hyparquet');
    const buffer = fs.readFileSync(filePath);
    
    return new Promise((resolve, reject) => {
      parquetRead({
        file: buffer,
        onComplete: (data) => {
          if (data.length === 0) {
            return resolve([]);
          }
          
          const schema = [];
          const headers = Object.keys(data[0]);
          
          headers.forEach(columnName => {
            const sampleValues = data.slice(0, 100).map(row => row[columnName]).filter(v => v !== null && v !== undefined && v !== '');
            
            let type = 'string';
            if (sampleValues.length > 0) {
              const types = sampleValues.slice(0, 10).map(inferType);
              const mostCommonType = types.reduce((acc, t) => {
                acc[t] = (acc[t] || 0) + 1;
                return acc;
              }, {});
              
              type = Object.keys(mostCommonType).reduce((a, b) => 
                mostCommonType[a] > mostCommonType[b] ? a : b
              );
            }
            
            schema.push({ name: columnName, type });
          });
          
          resolve(schema);
        }
      });
    });
  } catch (error) {
    throw new Error(`Failed to extract Parquet schema: ${error.message}`);
  }
}

/**
 * Extract schema from special formats (archives, SAS, Avro, DAT) via Python profiling service
 * These formats are first converted to temporary CSV/Parquet, then schema is extracted
 * @param {string} filePath - Path to the file
 * @param {string} ext - File extension
 * @param {string|null} archivePassword - Password for encrypted archives (optional)
 */
async function extractSchemaViaConversion(filePath, ext, archivePassword = null) {
  try {
    // Call Python profiling service to convert file to temporary CSV/Parquet
    const fileId = `schema_extract_${Date.now()}`;
    const filename = path.basename(filePath);
    
    const requestBody = {
      file_id: fileId,
      local_file_path: filePath,
      filename: filename
    };
    
    // Include password for encrypted archives
    if (archivePassword) {
      requestBody.password = archivePassword;
    }
    
    const response = await axios.post('http://localhost:8000/api/vendor-profile', requestBody, {
      timeout: 120000
    });
    
    if (!response.data || !response.data.metadata || !response.data.metadata.columns) {
      // Check for specific error messages from Python service
      if (response.data && response.data.issues && response.data.issues.length > 0) {
        const errorMessages = response.data.issues
          .filter(issue => issue.type === 'error')
          .map(issue => issue.message)
          .join('; ');
        if (errorMessages) {
          throw new Error(errorMessages);
        }
      }
      throw new Error(`Python profiling service did not return column metadata for ${ext} file`);
    }
    
    // Convert metadata.columns to schema format
    const schema = response.data.metadata.columns.map(col => ({
      name: col.name,
      type: col.data_type || 'string'
    }));
    
    return schema;
    
  } catch (error) {
    throw new Error(`Failed to extract schema from ${ext} file via conversion: ${error.message}`);
  }
}

/**
 * Map MIME types to file extensions
 * Note: application/octet-stream is intentionally NOT mapped here because it's a generic
 * MIME type used by browsers/storage for many file types. Let it fall back to filename extension.
 */
function mimeTypeToExtension(mimeType) {
  const mimeMap = {
    'text/csv': 'csv',
    'application/vnd.ms-excel': 'xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/json': 'json',
    'text/json': 'json',
    'application/xml': 'xml',
    'text/xml': 'xml',
    'application/x-parquet': 'parquet',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/x-tar': 'tar',
    'application/x-gzip': 'gz',
    'application/x-bzip2': 'bz2',
    'application/avro': 'avro'
  };
  
  return mimeMap[mimeType] || null;
}

/**
 * Main function to extract schema based on file type
 * @param {string} filePath - Path to the file
 * @param {string} fileType - MIME type or file extension
 * @param {Object} options - Additional options
 * @param {string|null} options.archivePassword - Password for encrypted archives
 */
async function extractSchema(filePath, fileType, options = {}) {
  const { archivePassword = null } = options;
  let ext;
  const filename = path.basename(filePath);
  
  // If fileType is a MIME type, convert it to extension
  if (fileType && fileType.includes('/')) {
    ext = mimeTypeToExtension(fileType);
    if (!ext) {
      // Fall back to file extension from path
      ext = filePath.split('.').pop().toLowerCase();
    }
  } else {
    // Use provided extension or extract from path
    ext = fileType || filePath.split('.').pop().toLowerCase();
  }
  
  // Handle compound extensions for archives (tar.gz, tar.bz2)
  if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) {
    ext = 'tar.gz';
  } else if (filename.endsWith('.tar.bz2') || filename.endsWith('.tbz2')) {
    ext = 'tar.bz2';
  } else if (filename.endsWith('.sas7bdat')) {
    ext = 'sas7bdat';
  } else if (filename.endsWith('.xpt')) {
    ext = 'xpt';
  }
  
  switch (ext) {
    case 'csv':
      return await extractSchemaFromCSV(filePath);
    
    case 'xlsx':
    case 'xls':
      return extractSchemaFromXLSX(filePath);
    
    case 'json':
      return extractSchemaFromJSON(filePath);
    
    case 'xml':
      return extractSchemaFromXML(filePath);
    
    case 'parquet':
      return await extractSchemaFromParquet(filePath);
    
    // New formats: delegate to Python profiling service for conversion
    case 'zip':
    case 'tar':
    case 'tar.gz':
    case 'tgz':
    case 'tar.bz2':
    case 'tbz2':
    case 'sas7bdat':
    case 'xpt':
    case 'avro':
    case 'dat':
      return await extractSchemaViaConversion(filePath, ext, archivePassword);
    
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

/**
 * Compare two schemas and return validation result
 * Only validates column names (case-insensitive), not types
 */
function compareSchemas(uploadedSchema, expectedSchema) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    missingColumns: [],
    extraColumns: []
  };
  
  // Create maps for easy lookup (case-insensitive)
  const uploadedMap = new Map(uploadedSchema.map(col => [col.name.toLowerCase(), col]));
  const expectedMap = new Map(expectedSchema.map(col => [col.name.toLowerCase(), col]));
  
  // Check for missing required columns (case-insensitive)
  expectedSchema.forEach(expectedCol => {
    const uploadedCol = uploadedMap.get(expectedCol.name.toLowerCase());
    
    if (!uploadedCol) {
      result.missingColumns.push(expectedCol.name);
      result.errors.push(`Missing required column: ${expectedCol.name}`);
      result.valid = false;
    }
    // Note: Type checking removed - CSV files have all columns as strings
  });
  
  // Check for extra columns (warning only)
  uploadedSchema.forEach(uploadedCol => {
    if (!expectedMap.has(uploadedCol.name.toLowerCase())) {
      result.extraColumns.push(uploadedCol.name);
      result.warnings.push(`Extra column found: ${uploadedCol.name} (will be ignored)`);
    }
  });
  
  return result;
}

module.exports = {
  extractSchema,
  compareSchemas,
  inferType
};
