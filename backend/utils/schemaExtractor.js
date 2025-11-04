/**
 * Schema Extraction Utility
 * Extracts column names and types from various file formats
 */

const fs = require('fs');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const { XMLParser } = require('fast-xml-parser');

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
 * Main function to extract schema based on file type
 */
async function extractSchema(filePath, fileType) {
  const ext = fileType || filePath.split('.').pop().toLowerCase();
  
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
    
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

/**
 * Compare two schemas and return validation result
 */
function compareSchemas(uploadedSchema, expectedSchema) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    missingColumns: [],
    extraColumns: [],
    typeMismatches: []
  };
  
  // Create maps for easy lookup
  const uploadedMap = new Map(uploadedSchema.map(col => [col.name.toLowerCase(), col]));
  const expectedMap = new Map(expectedSchema.map(col => [col.name.toLowerCase(), col]));
  
  // Check for missing required columns
  expectedSchema.forEach(expectedCol => {
    const uploadedCol = uploadedMap.get(expectedCol.name.toLowerCase());
    
    if (!uploadedCol) {
      result.missingColumns.push(expectedCol.name);
      result.errors.push(`Missing required column: ${expectedCol.name}`);
      result.valid = false;
    } else {
      // Check type compatibility
      if (uploadedCol.type !== expectedCol.type) {
        // Allow some type flexibility (e.g., integer can be float, string can be anything)
        const compatible = isTypeCompatible(uploadedCol.type, expectedCol.type);
        
        if (!compatible) {
          result.typeMismatches.push({
            column: expectedCol.name,
            expected: expectedCol.type,
            actual: uploadedCol.type
          });
          result.errors.push(`Type mismatch for column '${expectedCol.name}': expected ${expectedCol.type}, got ${uploadedCol.type}`);
          result.valid = false;
        } else {
          result.warnings.push(`Column '${expectedCol.name}': type ${uploadedCol.type} will be converted to ${expectedCol.type}`);
        }
      }
    }
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

/**
 * Check if two types are compatible
 */
function isTypeCompatible(actualType, expectedType) {
  // Exact match
  if (actualType === expectedType) {
    return true;
  }
  
  // String can accept anything
  if (expectedType === 'string') {
    return true;
  }
  
  // Integer can be promoted to float
  if (actualType === 'integer' && expectedType === 'float') {
    return true;
  }
  
  // Date and timestamp are compatible
  if ((actualType === 'date' && expectedType === 'timestamp') ||
      (actualType === 'timestamp' && expectedType === 'date')) {
    return true;
  }
  
  return false;
}

module.exports = {
  extractSchema,
  compareSchemas,
  inferType
};
