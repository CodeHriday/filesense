const fs = require('fs');
const path = require('path');
const readline = require('readline');
const xlsx = require('xlsx');

async function validateFileHasData(filePath, originalFilename) {
  const ext = path.extname(originalFilename || filePath).toLowerCase();
  
  try {
    switch (ext) {
      case '.csv':
        return await validateCSVHasData(filePath);
      case '.json':
        return await validateJSONHasData(filePath);
      case '.xlsx':
      case '.xls':
        return validateExcelHasData(filePath);
      case '.xml':
        return await validateXMLHasData(filePath);
      case '.parquet':
        return { valid: true, message: 'Parquet files validated during processing' };
      case '.zip':
      case '.tar':
      case '.gz':
      case '.tgz':
      case '.7z':
        return { valid: true, message: 'Archive contents validated after extraction' };
      default:
        return { valid: true, message: 'File type validation deferred to processing' };
    }
  } catch (error) {
    return {
      valid: false,
      message: `Failed to validate file: ${error.message}`,
      error: error.message
    };
  }
}

async function validateCSVHasData(filePath) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });
    
    let lineCount = 0;
    let hasContent = false;
    let headerRow = null;
    let firstDataRow = null;
    
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        lineCount++;
        if (lineCount === 1) {
          hasContent = true;
          headerRow = trimmed;
        } else if (lineCount === 2) {
          firstDataRow = trimmed;
        }
        if (lineCount >= 3) {
          rl.close();
        }
      }
    });
    
    rl.on('close', () => {
      if (lineCount === 0) {
        resolve({
          valid: false,
          message: 'File is empty. Please upload a file with at least one data record.',
          errorCode: 'empty_file'
        });
      } else if (lineCount === 1) {
        resolve({
          valid: false,
          message: 'File contains only a header row with no data records. Please upload a file with at least one data record.',
          errorCode: 'header_only_file'
        });
      } else {
        // Check for duplicate/multiple headers (first data row looks like header)
        // Note: We only block on "duplicate headers" which is reliably detectable
        // "No headers" detection is handled as a warning during profiling since
        // it requires more sophisticated analysis to avoid false positives
        const headerCheck = checkForDuplicateHeaders(headerRow, firstDataRow);
        if (headerCheck.isDuplicate) {
          resolve({
            valid: false,
            message: 'File appears to have no or multiple header rows. The first data row should contain only one column names instead of data values. Please fix the file and re-upload.',
            errorCode: 'multiple_headers'
          });
        } else {
          resolve({
            valid: true,
            message: 'CSV file contains data rows',
            dataRows: true
          });
        }
      }
    });
    
    rl.on('error', (error) => {
      reject(error);
    });
  });
}

function checkForDuplicateHeaders(headerRow, firstDataRow) {
  if (!headerRow || !firstDataRow) {
    return { isDuplicate: false };
  }
  
  // Parse CSV rows (handles quoted fields properly)
  const parseRow = (row) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"' && (i === 0 || row[i-1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^["']|["']$/g, ''));
    return values;
  };
  
  const headers = parseRow(headerRow);
  const dataValues = parseRow(firstDataRow);
  
  if (headers.length === 0 || dataValues.length === 0) {
    return { isDuplicate: false };
  }
  
  // DUPLICATE HEADERS CHECK: First data row matches header names exactly
  // Only check if values are IDENTICAL to headers (case-insensitive)
  let exactMatchCount = 0;
  for (let i = 0; i < Math.min(headers.length, dataValues.length); i++) {
    const h = headers[i].toLowerCase().trim();
    const d = dataValues[i].toLowerCase().trim();
    if (h === d && h.length > 0) {
      exactMatchCount++;
    }
  }
  
  // If >60% of values match headers EXACTLY, it's a duplicate header row
  const matchRatio = exactMatchCount / Math.min(headers.length, dataValues.length);
  if (matchRatio >= 0.6) {
    return { isDuplicate: true };
  }
  
  return { isDuplicate: false };
}

async function validateJSONHasData(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, content) => {
      if (err) {
        return reject(err);
      }
      
      try {
        const trimmed = content.trim();
        if (!trimmed) {
          return resolve({
            valid: false,
            message: 'File is empty. Please upload a file with at least one data record.',
            errorCode: 'empty_file'
          });
        }
        
        const data = JSON.parse(trimmed);
        
        if (Array.isArray(data)) {
          if (data.length === 0) {
            return resolve({
              valid: false,
              message: 'JSON file contains an empty array with no data records. Please upload a file with at least one data record.',
              errorCode: 'empty_array'
            });
          }
          return resolve({
            valid: true,
            message: `JSON file contains ${data.length} records`,
            recordCount: data.length
          });
        }
        
        if (typeof data === 'object' && data !== null) {
          if (Object.keys(data).length === 0) {
            return resolve({
              valid: false,
              message: 'JSON file contains an empty object with no data. Please upload a file with data content.',
              errorCode: 'empty_object'
            });
          }
          return resolve({
            valid: true,
            message: 'JSON file contains data',
            recordCount: 1
          });
        }
        
        return resolve({
          valid: false,
          message: 'JSON file does not contain valid data records (expected array or object).',
          errorCode: 'invalid_json_structure'
        });
        
      } catch (parseError) {
        return resolve({
          valid: false,
          message: `Invalid JSON format: ${parseError.message}`,
          errorCode: 'invalid_json'
        });
      }
    });
  });
}

function validateExcelHasData(filePath) {
  try {
    const workbook = xlsx.readFile(filePath, { sheetRows: 5 });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return {
        valid: false,
        message: 'Excel file contains no worksheets. Please upload a file with at least one data record.',
        errorCode: 'no_sheets'
      };
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet || !worksheet['!ref']) {
      return {
        valid: false,
        message: 'Excel file is empty. Please upload a file with at least one data record.',
        errorCode: 'empty_file'
      };
    }
    
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    if (data.length === 0) {
      return {
        valid: false,
        message: 'Excel file contains only headers with no data rows. Please upload a file with at least one data record.',
        errorCode: 'header_only_file'
      };
    }
    
    return {
      valid: true,
      message: `Excel file contains data rows (sampled ${Math.min(data.length, 5)} rows)`,
      dataRows: true
    };
    
  } catch (error) {
    return {
      valid: false,
      message: `Failed to read Excel file: ${error.message}`,
      errorCode: 'read_error'
    };
  }
}

async function validateXMLHasData(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, content) => {
      if (err) {
        return reject(err);
      }
      
      const trimmed = content.trim();
      if (!trimmed) {
        return resolve({
          valid: false,
          message: 'File is empty. Please upload a file with at least one data record.',
          errorCode: 'empty_file'
        });
      }
      
      if (!trimmed.includes('<') || !trimmed.includes('>')) {
        return resolve({
          valid: false,
          message: 'File does not appear to contain valid XML content.',
          errorCode: 'invalid_xml'
        });
      }
      
      const tagMatches = trimmed.match(/<[^?!/][^>]*>/g);
      if (!tagMatches || tagMatches.length < 2) {
        return resolve({
          valid: false,
          message: 'XML file contains no data elements. Please upload a file with at least one data record.',
          errorCode: 'empty_xml'
        });
      }
      
      resolve({
        valid: true,
        message: 'XML file contains elements',
        dataRows: true
      });
    });
  });
}

module.exports = {
  validateFileHasData,
  validateCSVHasData,
  validateJSONHasData,
  validateExcelHasData,
  validateXMLHasData,
  checkForDuplicateHeaders
};
