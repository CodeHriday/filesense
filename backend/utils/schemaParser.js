/**
 * Schema Parser Utility
 * Parses Excel, CSV, and JSON files to extract schema information
 * Converts to standardized format: [{column_name, data_type, precision, scale, nullable}]
 */

const XLSX = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');
const { systemLogger } = require('./logger');

/**
 * Map common column types from Excel/CSV to standard data types
 */
const DATA_TYPE_MAPPING = {
  // String types
  'string': 'VARCHAR',
  'text': 'TEXT',
  'varchar': 'VARCHAR',
  'char': 'CHAR',
  'character': 'VARCHAR',
  
  // Numeric types
  'int': 'INTEGER',
  'integer': 'INTEGER',
  'bigint': 'BIGINT',
  'smallint': 'SMALLINT',
  'number': 'NUMERIC',
  'numeric': 'NUMERIC',
  'decimal': 'DECIMAL',
  'float': 'FLOAT',
  'double': 'DOUBLE PRECISION',
  'real': 'REAL',
  
  // Date/Time types
  'date': 'DATE',
  'time': 'TIME',
  'timestamp': 'TIMESTAMP',
  'datetime': 'TIMESTAMP',
  
  // Boolean
  'boolean': 'BOOLEAN',
  'bool': 'BOOLEAN',
  
  // JSON
  'json': 'JSON',
  'jsonb': 'JSONB',
  
  // Other
  'uuid': 'UUID',
  'blob': 'BYTEA',
  'binary': 'BYTEA'
};

/**
 * Normalize data type to standard SQL type
 */
function normalizeDataType(type) {
  if (!type) return 'VARCHAR';
  
  const lowerType = type.toString().toLowerCase().trim();
  return DATA_TYPE_MAPPING[lowerType] || 'VARCHAR';
}

/**
 * Parse precision and scale from type specification
 * Examples: DECIMAL(10,2), VARCHAR(255), NUMERIC(18,4)
 */
function parsePrecisionScale(typeSpec) {
  if (!typeSpec) return { precision: null, scale: null };
  
  const match = typeSpec.match(/\((\d+)(?:,\s*(\d+))?\)/);
  if (match) {
    return {
      precision: parseInt(match[1]) || null,
      scale: match[2] ? parseInt(match[2]) : null
    };
  }
  
  return { precision: null, scale: null };
}

/**
 * Parse Excel file to extract schema
 * Expected format: Columns with headers: column_name, data_type, precision, scale, nullable (optional)
 */
async function parseExcelSchema(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    if (jsonData.length === 0) {
      throw new Error('Excel file is empty');
    }
    
    // Map to standardized schema format
    const schema = jsonData.map((row, index) => {
      const columnName = row.column_name || row['Column Name'] || row.name || row.Name;
      const dataType = row.data_type || row['Data Type'] || row.type || row.Type;
      
      if (!columnName) {
        throw new Error(`Row ${index + 1}: column_name is required`);
      }
      
      if (!dataType) {
        throw new Error(`Row ${index + 1}: data_type is required for column "${columnName}"`);
      }
      
      // Parse precision and scale from data type if included (e.g., "DECIMAL(10,2)")
      const precisionScale = parsePrecisionScale(dataType);
      
      // Check for explicit precision/scale columns
      const precision = row.precision !== undefined && row.precision !== null && row.precision !== '' 
        ? parseInt(row.precision) 
        : precisionScale.precision;
        
      const scale = row.scale !== undefined && row.scale !== null && row.scale !== '' 
        ? parseInt(row.scale) 
        : precisionScale.scale;
      
      // Nullable - default to true if not specified
      let nullable = true;
      if (row.nullable !== undefined && row.nullable !== null && row.nullable !== '') {
        nullable = row.nullable === true || row.nullable === 'true' || row.nullable === 'TRUE' || row.nullable === 1 || row.nullable === 'yes' || row.nullable === 'YES';
      }
      
      return {
        column_name: columnName.toString().trim(),
        data_type: normalizeDataType(dataType),
        precision: precision,
        scale: scale,
        nullable: nullable
      };
    });
    
    systemLogger.info(`Parsed Excel schema with ${schema.length} columns`);
    return schema;
    
  } catch (error) {
    systemLogger.error('Error parsing Excel schema', { error: error.message });
    throw error;
  }
}

/**
 * Parse CSV file to extract schema
 * Expected format: Same as Excel - headers: column_name, data_type, precision, scale, nullable
 */
async function parseCSVSchema(filePath) {
  return new Promise((resolve, reject) => {
    const schema = [];
    let rowIndex = 0;
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        rowIndex++;
        
        const columnName = row.column_name || row['Column Name'] || row.name || row.Name;
        const dataType = row.data_type || row['Data Type'] || row.type || row.Type;
        
        if (!columnName) {
          reject(new Error(`Row ${rowIndex}: column_name is required`));
          return;
        }
        
        if (!dataType) {
          reject(new Error(`Row ${rowIndex}: data_type is required for column "${columnName}"`));
          return;
        }
        
        // Parse precision and scale from data type if included
        const precisionScale = parsePrecisionScale(dataType);
        
        // Check for explicit precision/scale columns
        const precision = row.precision !== undefined && row.precision !== null && row.precision !== '' 
          ? parseInt(row.precision) 
          : precisionScale.precision;
          
        const scale = row.scale !== undefined && row.scale !== null && row.scale !== '' 
          ? parseInt(row.scale) 
          : precisionScale.scale;
        
        // Nullable - default to true if not specified
        let nullable = true;
        if (row.nullable !== undefined && row.nullable !== null && row.nullable !== '') {
          nullable = row.nullable === 'true' || row.nullable === 'TRUE' || row.nullable === '1' || row.nullable === 'yes' || row.nullable === 'YES';
        }
        
        schema.push({
          column_name: columnName.toString().trim(),
          data_type: normalizeDataType(dataType),
          precision: precision,
          scale: scale,
          nullable: nullable
        });
      })
      .on('end', () => {
        systemLogger.info(`Parsed CSV schema with ${schema.length} columns`);
        resolve(schema);
      })
      .on('error', (error) => {
        systemLogger.error('Error parsing CSV schema', { error: error.message });
        reject(error);
      });
  });
}

/**
 * Parse JSON file to extract schema
 * Expected format: Array of objects with column_name, data_type, precision, scale, nullable
 * Example: [{"column_name": "id", "data_type": "INTEGER", "nullable": false}, ...]
 */
async function parseJSONSchema(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(fileContent);
    
    if (!Array.isArray(jsonData)) {
      throw new Error('JSON file must contain an array of column definitions');
    }
    
    if (jsonData.length === 0) {
      throw new Error('JSON file is empty');
    }
    
    const schema = jsonData.map((row, index) => {
      const columnName = row.column_name || row.name;
      const dataType = row.data_type || row.type;
      
      if (!columnName) {
        throw new Error(`Row ${index + 1}: column_name is required`);
      }
      
      if (!dataType) {
        throw new Error(`Row ${index + 1}: data_type is required for column "${columnName}"`);
      }
      
      // Parse precision and scale from data type if included
      const precisionScale = parsePrecisionScale(dataType);
      
      // Check for explicit precision/scale
      const precision = row.precision !== undefined && row.precision !== null 
        ? parseInt(row.precision) 
        : precisionScale.precision;
        
      const scale = row.scale !== undefined && row.scale !== null 
        ? parseInt(row.scale) 
        : precisionScale.scale;
      
      // Nullable - default to true if not specified
      const nullable = row.nullable !== undefined ? Boolean(row.nullable) : true;
      
      return {
        column_name: columnName.toString().trim(),
        data_type: normalizeDataType(dataType),
        precision: precision,
        scale: scale,
        nullable: nullable
      };
    });
    
    systemLogger.info(`Parsed JSON schema with ${schema.length} columns`);
    return schema;
    
  } catch (error) {
    systemLogger.error('Error parsing JSON schema', { error: error.message });
    throw error;
  }
}

/**
 * Main schema parser - detects file type and routes to appropriate parser
 */
async function parseSchemaFile(filePath, fileType) {
  if (!filePath) {
    throw new Error('File path is required');
  }
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  // Detect file type if not provided
  if (!fileType) {
    const extension = filePath.split('.').pop().toLowerCase();
    if (extension === 'xlsx' || extension === 'xls') {
      fileType = 'excel';
    } else if (extension === 'csv') {
      fileType = 'csv';
    } else if (extension === 'json') {
      fileType = 'json';
    } else {
      throw new Error(`Unsupported file type: ${extension}`);
    }
  }
  
  switch (fileType.toLowerCase()) {
    case 'excel':
    case 'xlsx':
    case 'xls':
      return await parseExcelSchema(filePath);
      
    case 'csv':
      return await parseCSVSchema(filePath);
      
    case 'json':
      return await parseJSONSchema(filePath);
      
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Validate schema structure
 */
function validateSchema(schema) {
  if (!Array.isArray(schema) || schema.length === 0) {
    throw new Error('Schema must be a non-empty array');
  }
  
  const errors = [];
  const columnNames = new Set();
  
  schema.forEach((col, index) => {
    if (!col.column_name) {
      errors.push(`Row ${index + 1}: column_name is required`);
    } else {
      // Check for duplicate column names
      if (columnNames.has(col.column_name.toLowerCase())) {
        errors.push(`Row ${index + 1}: duplicate column name "${col.column_name}"`);
      }
      columnNames.add(col.column_name.toLowerCase());
    }
    
    if (!col.data_type) {
      errors.push(`Row ${index + 1}: data_type is required`);
    }
  });
  
  if (errors.length > 0) {
    throw new Error(`Schema validation failed:\n${errors.join('\n')}`);
  }
  
  return true;
}

module.exports = {
  parseSchemaFile,
  parseExcelSchema,
  parseCSVSchema,
  parseJSONSchema,
  validateSchema,
  normalizeDataType,
  parsePrecisionScale
};
