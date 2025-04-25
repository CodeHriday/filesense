/**
 * Worker Thread implementation for handling async processing tasks
 * 
 * This file is executed in a separate worker thread for CPU-intensive operations
 * to keep the main application responsive.
 */

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');
const csv = require('csv-parser');
const createCsvStringifier = require('csv-writer').createObjectCsvStringifier;
const { Transform } = require('stream');

// Initialize database connection if needed
let pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
}

// Extract worker data
const { taskId, taskType, taskParams } = workerData;

// Report progress back to main thread
function reportProgress(progress) {
  if (parentPort) {
    parentPort.postMessage({
      type: 'progress',
      data: progress
    });
  }
}

// Log message back to main thread
function logMessage(level, message, meta = {}) {
  if (parentPort) {
    parentPort.postMessage({
      type: 'log',
      data: {
        level,
        message,
        timestamp: new Date().toISOString(),
        taskId,
        taskType,
        ...meta
      }
    });
  }
}

// Report result back to main thread
function reportResult(result) {
  if (parentPort) {
    parentPort.postMessage({
      type: 'result',
      data: result
    });
  }
}

// Report error back to main thread
function reportError(error) {
  if (parentPort) {
    parentPort.postMessage({
      type: 'error',
      data: {
        message: error.message,
        stack: error.stack
      }
    });
  }
}

// Process a CSV file
async function processCSVFile(filePath, transformations) {
  // Create output file path
  const parsedPath = path.parse(filePath);
  const outputPath = path.join(
    parsedPath.dir, 
    `${parsedPath.name}_transformed${parsedPath.ext}`
  );
  
  const results = [];
  const headers = [];
  let totalRows = 0;
  let processedRows = 0;
  
  try {
    // First pass to count total rows
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .on('error', reject)
        .pipe(csv())
        .on('data', () => {
          totalRows++;
        })
        .on('end', resolve)
        .on('error', reject);
    });
    
    logMessage('info', `Starting CSV processing with ${totalRows} rows`, { filePath });
    
    // Process stream with transformations
    const transformData = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        const transformedRow = applyTransformations(chunk, transformations);
        processedRows++;
        
        // Report progress every 1000 rows
        if (processedRows % 1000 === 0) {
          reportProgress(Math.floor((processedRows / totalRows) * 100));
          logMessage('debug', `Processed ${processedRows}/${totalRows} rows`, { 
            progress: Math.floor((processedRows / totalRows) * 100) 
          });
        }
        
        this.push(transformedRow);
        callback();
      }
    });
    
    // Process the file
    const processedData = await new Promise((resolve, reject) => {
      const rows = [];
      fs.createReadStream(filePath)
        .on('error', reject)
        .pipe(csv())
        .on('headers', (columnHeaders) => {
          headers.push(...columnHeaders);
        })
        .pipe(transformData)
        .on('data', (row) => {
          rows.push(row);
        })
        .on('end', () => {
          resolve(rows);
        })
        .on('error', reject);
    });
    
    // Write transformed data to output file
    const csvStringifier = createCsvStringifier({
      header: headers.map(header => ({ id: header, title: header })),
      fieldDelimiter: ','
    });
    
    const headerString = csvStringifier.getHeaderString();
    const recordsString = csvStringifier.stringifyRecords(processedData);
    
    await fs.writeFile(outputPath, headerString + recordsString);
    
    logMessage('info', `CSV processing completed successfully`, { 
      filePath, 
      outputPath, 
      rowsProcessed: processedRows 
    });
    
    return {
      success: true,
      outputPath,
      rowsProcessed: processedRows,
      transformationStats: {
        inputRows: totalRows,
        outputRows: processedData.length
      }
    };
  } catch (error) {
    logMessage('error', `Error processing CSV file: ${error.message}`, { 
      filePath, 
      error: error.stack 
    });
    throw error;
  }
}

// Apply transformations to a row of data
function applyTransformations(row, transformations) {
  const result = { ...row };
  
  for (const transformation of transformations) {
    switch (transformation.type) {
      case 'rename':
        if (result[transformation.sourceField]) {
          result[transformation.targetField] = result[transformation.sourceField];
          delete result[transformation.sourceField];
        }
        break;
        
      case 'filter':
        // No-op for filter as it happens at row level and is handled separately
        break;
        
      case 'transform':
        if (result[transformation.field]) {
          switch (transformation.function) {
            case 'uppercase':
              result[transformation.field] = String(result[transformation.field]).toUpperCase();
              break;
              
            case 'lowercase':
              result[transformation.field] = String(result[transformation.field]).toLowerCase();
              break;
              
            case 'trim':
              result[transformation.field] = String(result[transformation.field]).trim();
              break;
              
            case 'number':
              result[transformation.field] = Number(result[transformation.field]);
              break;
              
            case 'date':
              result[transformation.field] = new Date(result[transformation.field]).toISOString();
              break;
              
            case 'replace':
              result[transformation.field] = String(result[transformation.field])
                .replace(transformation.find, transformation.replace);
              break;
              
            case 'custom':
              if (transformation.code) {
                try {
                  // Careful with eval - should be replaced with safer alternatives in production
                  const customFn = new Function('value', transformation.code);
                  result[transformation.field] = customFn(result[transformation.field]);
                } catch (error) {
                  logMessage('error', `Error in custom transformation: ${error.message}`, { field: transformation.field });
                }
              }
              break;
          }
        }
        break;
        
      case 'calculate':
        try {
          // Careful with eval - should be replaced with safer alternatives in production
          const formula = transformation.formula;
          const fields = Object.keys(row);
          
          // Create a function with row fields as parameters
          const params = fields.join(', ');
          const values = fields.map(field => row[field]);
          
          const calcFn = new Function(params, `return ${formula};`);
          result[transformation.targetField] = calcFn(...values);
        } catch (error) {
          logMessage('error', `Error in calculation: ${error.message}`, { formula: transformation.formula });
        }
        break;
    }
  }
  
  return result;
}

// Main task processor
async function processTask() {
  try {
    logMessage('info', `Starting task ${taskId} of type ${taskType}`);
    
    let result;
    
    switch (taskType) {
      case 'transformation':
        if (taskParams.fileType === 'csv') {
          result = await processCSVFile(taskParams.filePath, taskParams.transformations);
        } else {
          throw new Error(`Unsupported file type: ${taskParams.fileType}`);
        }
        break;
        
      case 'file_processing':
        // Handle file processing logic
        result = { message: 'File processing not yet implemented' };
        break;
        
      case 'data_validation':
        // Handle data validation logic
        result = { message: 'Data validation not yet implemented' };
        break;
        
      default:
        throw new Error(`Unknown task type: ${taskType}`);
    }
    
    logMessage('info', `Task ${taskId} completed successfully`);
    reportResult(result);
  } catch (error) {
    logMessage('error', `Task ${taskId} failed: ${error.message}`, { stack: error.stack });
    reportError(error);
    
    // Exit with error code
    process.exit(1);
  }
}

// Start processing
processTask().catch(error => {
  console.error(`Unhandled error in worker: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});