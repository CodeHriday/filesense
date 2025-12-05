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
    
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        lineCount++;
        if (lineCount === 1) {
          hasContent = true;
        }
        if (lineCount >= 2) {
          rl.close();
          resolve({
            valid: true,
            message: 'CSV file contains data rows',
            dataRows: true
          });
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
      }
    });
    
    rl.on('error', (error) => {
      reject(error);
    });
  });
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
  validateXMLHasData
};
