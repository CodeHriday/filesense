const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-for-development';
const JWT_EXPIRATION = '24h'; // Token expiration time

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN format
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token or token expired.' });
  }
};

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configure file upload with support for large files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

// Configure multer with increased file size limits to handle files up to 1GB
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB in bytes
    fieldSize: 1024 * 1024 * 1024 // 1GB for form fields
  }
});

// Configure PostgreSQL connection with better error handling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Add error handler to connection pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    console.error(err.stack);
  } else {
    console.log('Database connected successfully');
  }
});

// API Routes
// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Files API
app.get('/api/files', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM files ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching files:', err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

app.get('/api/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const result = await pool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const columnsResult = await pool.query(
      'SELECT * FROM file_columns WHERE file_id = $1 ORDER BY column_index ASC',
      [fileId]
    );
    
    const file = result.rows[0];
    file.columns = columnsResult.rows;
    
    res.json(file);
  } catch (err) {
    console.error('Error fetching file details:', err);
    res.status(500).json({ error: 'Failed to fetch file details' });
  }
});

// File preview endpoint
app.get('/api/files/:fileId/preview', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { limit = 100 } = req.query;
    
    // Get file details to determine type and path
    const fileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = fileResult.rows[0];
    const filePath = JSON.parse(file.metadata).path;
    const fileType = file.file_type;
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    
    // Get column information
    const columnsResult = await pool.query(
      'SELECT * FROM file_columns WHERE file_id = $1 ORDER BY column_index ASC',
      [fileId]
    );
    const columns = columnsResult.rows.map(col => ({ name: col.column_name, type: col.column_type }));
    
    let previewData = [];
    const rowLimit = parseInt(limit) || 100;
    
    // For CSV files, use streaming to get the first N rows
    if (fileType === 'csv') {
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
      let buffer = '';
      let rowCount = 0;
      let header = [];
      
      await new Promise((resolve, reject) => {
        fileStream.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          
          // Keep the last partial line in the buffer
          buffer = lines.pop();
          
          if (lines.length > 0 && rowCount === 0) {
            // Process header
            header = lines[0].split(',').map(h => h.trim());
            rowCount++;
            
            // Process data rows
            for (let i = 1; i < lines.length && rowCount < rowLimit + 1; i++) {
              if (lines[i].trim()) {
                const values = lines[i].split(',').map(v => v.trim());
                const row = {};
                
                // Map values to column names
                header.forEach((colName, idx) => {
                  row[colName] = idx < values.length ? values[idx] : null;
                });
                
                previewData.push(row);
                rowCount++;
              }
            }
          } else {
            // Process additional data rows
            for (let i = 0; i < lines.length && rowCount < rowLimit + 1; i++) {
              if (lines[i].trim()) {
                const values = lines[i].split(',').map(v => v.trim());
                const row = {};
                
                // Map values to column names
                header.forEach((colName, idx) => {
                  row[colName] = idx < values.length ? values[idx] : null;
                });
                
                previewData.push(row);
                rowCount++;
              }
            }
          }
          
          // If we've reached the limit, end the stream
          if (rowCount >= rowLimit + 1) {
            fileStream.destroy();
            resolve();
          }
        });
        
        fileStream.on('end', () => {
          // Process any remaining buffer content
          if (buffer.trim() && rowCount < rowLimit + 1) {
            const values = buffer.split(',').map(v => v.trim());
            const row = {};
            
            // Map values to column names
            header.forEach((colName, idx) => {
              row[colName] = idx < values.length ? values[idx] : null;
            });
            
            previewData.push(row);
          }
          resolve();
        });
        
        fileStream.on('error', (err) => {
          reject(err);
        });
      });
    } 
    // For JSON files
    else if (fileType === 'json') {
      // Check file size first
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      
      // For large files, use streaming
      if (fileSize > 10 * 1024 * 1024) { // 10MB
        const fileStream = fs.createReadStream(filePath, { 
          encoding: 'utf8',
          start: 0,
          end: Math.min(fileSize, 1024 * 1024) // First 1MB or less
        });
        
        let buffer = '';
        
        await new Promise((resolve, reject) => {
          fileStream.on('data', (chunk) => {
            buffer += chunk;
            
            // Try to parse what we have so far
            try {
              if (buffer.trimStart().startsWith('[')) {
                // Add closing brackets if needed
                let tempBuffer = buffer;
                
                // Count opening and closing brackets
                const openBrackets = (tempBuffer.match(/\[/g) || []).length;
                const closeBrackets = (tempBuffer.match(/\]/g) || []).length;
                
                // Add missing closing brackets
                if (openBrackets > closeBrackets) {
                  tempBuffer += ']'.repeat(openBrackets - closeBrackets);
                }
                
                try {
                  const partialData = JSON.parse(tempBuffer);
                  if (Array.isArray(partialData) && partialData.length > 0) {
                    // Take only what we need for the preview
                    previewData = partialData.slice(0, rowLimit);
                    
                    // If we have enough data, end the stream
                    fileStream.destroy();
                    resolve();
                  }
                } catch (e) {
                  // Continue collecting data
                }
              }
            } catch (e) {
              // Continue reading
            }
          });
          
          fileStream.on('end', () => {
            resolve();
          });
          
          fileStream.on('error', (err) => {
            reject(err);
          });
        });
      } else {
        // For smaller files, read the whole file
        try {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const jsonData = JSON.parse(fileContent);
          
          if (Array.isArray(jsonData)) {
            previewData = jsonData.slice(0, rowLimit);
          }
        } catch (err) {
          console.error('Error reading JSON file for preview:', err);
          return res.status(500).json({ error: 'Failed to parse JSON file' });
        }
      }
    }
    
    res.json({
      fileId,
      columns,
      rows: previewData,
      totalRows: file.row_count,
      preview: true
    });
  } catch (err) {
    console.error('Error generating file preview:', err);
    res.status(500).json({ error: 'Failed to generate file preview' });
  }
});

// File upload endpoint with support for large files
app.post('/api/files/upload', upload.single('file'), async (req, res) => {
  try {
    // Process file upload and save metadata
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = req.file;
    const fileId = `file_${Date.now()}`;
    const fileType = path.extname(file.originalname).substring(1).toLowerCase();
    
    console.log('Attempting to save file:', file.originalname, 'Size:', file.size);
    
    // Process file based on type
    let rowCount = 0;
    let columnCount = 0;
    let columns = [];
    let qualityScore = 85; // Default quality score
    
    try {
      // Extract basic file metrics based on file type
      if (fileType === 'csv') {
        // For large files, use streaming to process only the first 1000 rows for analysis
        // This prevents loading the entire file into memory
        const MAX_ANALYZE_ROWS = 1000;
        
        // Create a read stream to process the file efficiently
        const fileStream = fs.createReadStream(file.path, { encoding: 'utf8' });
        let buffer = '';
        let lineCount = 0;
        let header = [];
        let lineAnalyzed = 0;
        let isFirstChunk = true;
        const sampleLines = [];
        
        // Count total lines in file using a separate stream
        const lineCountStream = fs.createReadStream(file.path, { encoding: 'utf8' });
        let totalLineCount = 0;
        
        lineCountStream.on('data', (chunk) => {
          for (let i = 0; i < chunk.length; i++) {
            if (chunk[i] === '\n') {
              totalLineCount++;
            }
          }
        });
        
        // Process file content in chunks
        await new Promise((resolve, reject) => {
          fileStream.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            
            // Keep the last partial line in the buffer
            buffer = lines.pop();
            
            if (isFirstChunk && lines.length > 0) {
              // Process header on first chunk
              header = lines[0].split(',').map(h => h.trim());
              columnCount = header.length;
              isFirstChunk = false;
              
              // Start from second line (after header)
              for (let i = 1; i < lines.length && lineAnalyzed < MAX_ANALYZE_ROWS; i++) {
                sampleLines.push(lines[i]);
                lineAnalyzed++;
              }
            } else {
              // Process subsequent chunks
              for (let i = 0; i < lines.length && lineAnalyzed < MAX_ANALYZE_ROWS; i++) {
                sampleLines.push(lines[i]);
                lineAnalyzed++;
              }
            }
            
            lineCount += lines.length;
            
            // If we've processed enough lines, end the stream early
            if (lineAnalyzed >= MAX_ANALYZE_ROWS) {
              fileStream.destroy();
            }
          });
          
          fileStream.on('end', () => {
            // Process any remaining buffer content
            if (buffer.trim().length > 0) {
              sampleLines.push(buffer);
              lineCount++;
            }
            resolve();
          });
          
          fileStream.on('error', (err) => {
            reject(err);
          });
        });
        
        // Wait for line counting to complete
        await new Promise((resolve) => {
          lineCountStream.on('end', () => {
            resolve();
          });
          
          lineCountStream.on('error', () => {
            // On error, fall back to the sampled line count
            resolve();
          });
        });
        
        // Use total line count if it's greater than the sampled count
        // Otherwise fall back to sampled count
        rowCount = Math.max(totalLineCount - 1, lineCount - 1); // Subtract header row
        
        if (header.length > 0) {
          // Use header and sample lines for analysis
          
          // Create column entries
          columns = header.map((colName, index) => {
            // Identify simple data types based on first data row
            let dataType = 'string';
            let minValue = null;
            let maxValue = null;
            let mostFrequentValue = null;
            let leastFrequentValue = null;
            let uniqueCount = 0;
            let nullCount = 0;
            
            if (sampleLines.length > 0) {
              // Get the column values from all sample data rows
              const columnValues = [];
              const valueCounts = {};
              nullCount = 0; // Reset nullCount
              
              for (let i = 0; i < sampleLines.length; i++) {
                const rowValues = sampleLines[i].split(',');
                if (index < rowValues.length) {
                  const value = rowValues[index].trim();
                  columnValues.push(value);
                  
                  // Count missing values (null, empty, or whitespace only)
                  if (!value || value === '' || value.toLowerCase() === 'null' || value.toLowerCase() === 'n/a') {
                    nullCount++;
                  } else {
                    // Count occurrences for frequency analysis
                    valueCounts[value] = (valueCounts[value] || 0) + 1;
                  }
                }
              }
              
              // Analyze first non-empty value to determine type
              const firstValue = columnValues.find(v => v !== '');
              if (firstValue) {
                if (!isNaN(Number(firstValue))) {
                  dataType = Number.isInteger(Number(firstValue)) ? 'integer' : 'decimal';
                } else if (firstValue.toLowerCase() === 'true' || firstValue.toLowerCase() === 'false') {
                  dataType = 'boolean';
                } else if (!isNaN(Date.parse(firstValue))) {
                  dataType = 'date';
                }
              }
              
              // Find min/max for numeric columns
              if (dataType === 'integer' || dataType === 'decimal') {
                const numericValues = columnValues
                  .filter(v => v !== '' && !isNaN(Number(v)))
                  .map(v => Number(v));
                
                if (numericValues.length > 0) {
                  minValue = Math.min(...numericValues);
                  maxValue = Math.max(...numericValues);
                }
              }
              
              // Find most/least frequent for all columns
              if (Object.keys(valueCounts).length > 0) {
                // Sort by frequency (descending)
                const sortedValues = Object.entries(valueCounts)
                  .sort((a, b) => b[1] - a[1]);
                
                mostFrequentValue = sortedValues[0][0];
                leastFrequentValue = sortedValues[sortedValues.length - 1][0];
                
                // Count number of unique values (distinct values)
                uniqueCount = Object.keys(valueCounts).length;
              }
            }
            
            return {
              column_name: colName,
              column_type: dataType,
              column_index: index,
              file_id: fileId,
              min_value: dataType === 'integer' || dataType === 'decimal' ? String(minValue) : null,
              max_value: dataType === 'integer' || dataType === 'decimal' ? String(maxValue) : null,
              min_value_decimal: dataType === 'integer' || dataType === 'decimal' ? minValue : null,
              max_value_decimal: dataType === 'integer' || dataType === 'decimal' ? maxValue : null,
              most_frequent_value: mostFrequentValue,
              least_frequent_value: leastFrequentValue,
              unique_count: uniqueCount,
              null_count: nullCount
            };
          });
        }
      } else if (fileType === 'json') {
        try {
          // For large JSON files, use streaming to process the file efficiently
          const MAX_ANALYZE_JSON_ITEMS = 1000;
          
          // Read file in chunks to estimate size without loading entire file
          const stats = fs.statSync(file.path);
          const fileSize = stats.size;
          
          // If file is very large (>10MB), use streaming approach
          if (fileSize > 10 * 1024 * 1024) {
            console.log('Large JSON file detected, using streaming parser');
            
            // Stream first part of the file to get structure
            const fileStream = fs.createReadStream(file.path, { 
              encoding: 'utf8',
              start: 0,
              end: Math.min(fileSize, 1024 * 1024) // First 1MB or less
            });
            
            let jsonData = [];
            let buffer = '';
            
            await new Promise((resolve, reject) => {
              fileStream.on('data', (chunk) => {
                buffer += chunk;
                
                // Try to parse as much of the JSON as possible
                try {
                  // If it appears to be an array, try to parse it with closing bracket
                  if (buffer.trimStart().startsWith('[')) {
                    // Add closing brackets if needed
                    let tempBuffer = buffer;
                    
                    // Count opening and closing brackets
                    const openBrackets = (tempBuffer.match(/\[/g) || []).length;
                    const closeBrackets = (tempBuffer.match(/\]/g) || []).length;
                    
                    // Add missing closing brackets
                    if (openBrackets > closeBrackets) {
                      tempBuffer += ']'.repeat(openBrackets - closeBrackets);
                    }
                    
                    try {
                      const partialData = JSON.parse(tempBuffer);
                      if (Array.isArray(partialData) && partialData.length > 0) {
                        // Take a sample for analysis
                        jsonData = partialData.slice(0, MAX_ANALYZE_JSON_ITEMS);
                        rowCount = partialData.length;
                        
                        // If we have enough data for analysis, end the stream
                        fileStream.destroy();
                        resolve();
                      }
                    } catch (e) {
                      // Continue collecting data
                    }
                  }
                } catch (e) {
                  // Continue reading
                }
              });
              
              fileStream.on('end', () => {
                resolve();
              });
              
              fileStream.on('error', (err) => {
                reject(err);
              });
            });
            
            // If streaming parsing failed, fall back to counting lines for an estimation
            if (jsonData.length === 0) {
              // Count lines to estimate number of records
              const lineCountStream = fs.createReadStream(file.path, { encoding: 'utf8' });
              let lineCount = 0;
              
              await new Promise((resolve) => {
                lineCountStream.on('data', (chunk) => {
                  lineCount += (chunk.match(/\n/g) || []).length;
                });
                
                lineCountStream.on('end', () => {
                  // Estimate row count based on line count
                  rowCount = Math.max(1, Math.floor(lineCount / 2)); // Rough estimate
                  resolve();
                });
                
                lineCountStream.on('error', () => {
                  resolve();
                });
              });
              
              // Try to read just the beginning to get schema
              try {
                const sampleContent = fs.readFileSync(file.path, { encoding: 'utf8', start: 0, end: 10000 });
                const startPos = sampleContent.indexOf('[');
                const endPos = sampleContent.indexOf(']', startPos);
                
                if (startPos !== -1 && endPos !== -1) {
                  const sampleJson = sampleContent.substring(startPos, endPos + 1);
                  try {
                    const sampleData = JSON.parse(sampleJson);
                    if (Array.isArray(sampleData) && sampleData.length > 0) {
                      jsonData = sampleData;
                    }
                  } catch (e) {
                    // Ignore parsing errors in sample
                  }
                }
              } catch (e) {
                console.error('Error reading JSON sample:', e);
              }
            }
          } else {
            // For smaller files, read the whole file
            const fileContent = fs.readFileSync(file.path, 'utf8');
            const allJsonData = JSON.parse(fileContent);
            
            if (Array.isArray(allJsonData)) {
              rowCount = allJsonData.length;
              // Take only a sample for analysis
              jsonData = allJsonData.slice(0, MAX_ANALYZE_JSON_ITEMS);
            }
          }
          
          if (jsonData && jsonData.length > 0) {
            // Extract columns from first item
            const firstItem = jsonData[0];
            const keys = Object.keys(firstItem);
            columnCount = keys.length;
            
            columns = keys.map((key, index) => {
              let dataType = 'string';
              let minValue = null;
              let maxValue = null;
              let mostFrequentValue = null;
              let leastFrequentValue = null;
              let uniqueCount = 0;
              let nullCount = 0;
              
              // Get initial type from first item
              const value = firstItem[key];
              
              if (typeof value === 'number') {
                dataType = Number.isInteger(value) ? 'integer' : 'decimal';
              } else if (typeof value === 'boolean') {
                dataType = 'boolean';
              } else if (value instanceof Date) {
                dataType = 'date';
              } else if (value === null) {
                dataType = 'null';
              } else if (typeof value === 'object') {
                dataType = 'object';
              }
              
              // Process all rows to collect stats
              if (jsonData.length > 1) {
                // For numeric columns, find min/max
                if (dataType === 'integer' || dataType === 'decimal') {
                  const numericValues = jsonData
                    .map(item => item[key])
                    .filter(v => v !== null && v !== undefined && typeof v === 'number');
                  
                  if (numericValues.length > 0) {
                    minValue = Math.min(...numericValues);
                    maxValue = Math.max(...numericValues);
                  }
                }
                
                // For all columns, find frequency stats
                const valueCounts = {};
                nullCount = 0; // Reset nullCount
                
                jsonData.forEach(item => {
                  // Check for missing values (null, undefined, empty string, whitespace)
                  if (item[key] === null || item[key] === undefined || 
                    (typeof item[key] === 'string' && (item[key] === '' || item[key].trim() === '' || 
                    item[key].toLowerCase() === 'null' || item[key].toLowerCase() === 'n/a'))) {
                    nullCount++;
                  } else {
                    // Convert to string for consistent counting
                    const strValue = String(item[key]);
                    valueCounts[strValue] = (valueCounts[strValue] || 0) + 1;
                  }
                });
                
                // Find most/least frequent values
                if (Object.keys(valueCounts).length > 0) {
                  const sortedValues = Object.entries(valueCounts)
                    .sort((a, b) => b[1] - a[1]);
                  
                  mostFrequentValue = sortedValues[0][0];
                  leastFrequentValue = sortedValues[sortedValues.length - 1][0];
                  
                  // Count number of unique values (distinct values)
                  uniqueCount = Object.keys(valueCounts).length;
                }
              }
              
              return {
                column_name: key,
                column_type: dataType,
                column_index: index,
                file_id: fileId,
                min_value: dataType === 'integer' || dataType === 'decimal' ? String(minValue) : null,
                max_value: dataType === 'integer' || dataType === 'decimal' ? String(maxValue) : null,
                min_value_decimal: dataType === 'integer' || dataType === 'decimal' ? minValue : null,
                max_value_decimal: dataType === 'integer' || dataType === 'decimal' ? maxValue : null,
                most_frequent_value: mostFrequentValue,
                least_frequent_value: leastFrequentValue,
                unique_count: uniqueCount,
                null_count: nullCount
              };
            });
          }
        } catch (jsonError) {
          console.error('Error parsing JSON file:', jsonError);
        }
      } else if (fileType === 'parquet') {
        // For parquet, we'd need a specific library to read the format
        // For now, just provide minimal metadata
        columnCount = 0;
        rowCount = 0;
      }
    } catch (processingError) {
      console.error('Error processing file:', processingError);
      // Continue even if processing fails
    }
    
    // Save file information to database
    await pool.query(
      `INSERT INTO files 
        (file_id, filename, file_type, file_size, checksum, row_count, column_count, quality_score, metadata, created_at, updated_at) 
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
      [
        fileId, 
        file.originalname, 
        fileType, 
        file.size, 
        null, // checksum
        rowCount,
        columnCount,
        qualityScore,
        JSON.stringify({ path: file.path }) // basic metadata
      ]
    );
    
    // Save column information if available
    if (columns.length > 0) {
      for (const column of columns) {
        try {
          await pool.query(
            `INSERT INTO file_columns 
              (file_id, column_name, column_type, column_index, file_name, 
               min_value, max_value, min_value_decimal, max_value_decimal, 
               most_frequent_value, least_frequent_value, unique_count, null_count, created_at) 
             VALUES 
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
            [
              fileId,
              column.column_name,
              column.column_type,
              column.column_index,
              file.originalname,
              column.min_value,
              column.max_value,
              column.min_value_decimal,
              column.max_value_decimal,
              column.most_frequent_value,
              column.least_frequent_value,
              column.unique_count,
              column.null_count || 0
            ]
          );
        } catch (columnErr) {
          console.error('Error saving column information:', columnErr);
          // Continue with other columns
        }
      }
    }
    
    res.json({ 
      success: true, 
      fileId: fileId,
      filename: file.originalname,
      file_type: fileType,
      file_size: file.size,
      row_count: rowCount,
      column_count: columnCount,
      created_at: new Date().toISOString(),
      message: 'File uploaded successfully'
    });
  } catch (err) {
    console.error('Error uploading file:', err);
    console.error(err.stack);
    res.status(500).json({ error: 'Failed to upload file: ' + err.message });
  }
});

// Lineage endpoints
app.get('/api/lineage', async (req, res) => {
  try {
    // Create lineage table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_lineage (
        id SERIAL PRIMARY KEY,
        source_file_id VARCHAR(255) NOT NULL,
        target_file_id VARCHAR(255) NOT NULL,
        relationship_type VARCHAR(50) NOT NULL,
        transformation_details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const result = await pool.query('SELECT * FROM file_lineage');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching lineage data:', err);
    res.status(500).json({ error: 'Failed to fetch lineage data' });
  }
});

// Badges endpoint
app.get('/api/badges', async (req, res) => {
  try {
    // Create badges table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_badges (
        id SERIAL PRIMARY KEY,
        badge_id VARCHAR(50) NOT NULL,
        badge_name VARCHAR(100) NOT NULL,
        badge_description TEXT,
        icon_url VARCHAR(255),
        earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const result = await pool.query('SELECT * FROM user_badges');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching badges:', err);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// Alert history endpoint
app.get('/api/alerts/history', async (req, res) => {
  try {
    // Create alerts history table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_history (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        alert_type VARCHAR(50) NOT NULL,
        alert_severity VARCHAR(20) NOT NULL,
        alert_message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const result = await pool.query('SELECT * FROM alert_history');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching alert history:', err);
    res.status(500).json({ error: 'Failed to fetch alert history' });
  }
});

// Connections endpoint
app.get('/api/connections', async (req, res) => {
  try {
    // Create connections table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS storage_connections (
        id SERIAL PRIMARY KEY,
        connection_name VARCHAR(100) NOT NULL,
        connection_type VARCHAR(50) NOT NULL,
        connection_details JSON NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const result = await pool.query('SELECT * FROM storage_connections');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching connections:', err);
    res.status(500).json({ error: 'Failed to fetch connections' });
  }
});

// Mappings endpoint
app.get('/api/mappings', async (req, res) => {
  try {
    // Create mappings table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_mappings (
        id SERIAL PRIMARY KEY,
        mapping_name VARCHAR(100) NOT NULL,
        source_file_id VARCHAR(255) NOT NULL,
        target_file_id VARCHAR(255) NOT NULL,
        mapping_rules JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const result = await pool.query('SELECT * FROM file_mappings');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching mappings:', err);
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

// Dashboard settings endpoint
app.get('/api/user/dashboard-settings', async (req, res) => {
  try {
    // Create dashboard settings table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_dashboard_settings (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) DEFAULT 'default',
        settings JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const result = await pool.query("SELECT * FROM user_dashboard_settings WHERE user_id = 'default'");
    
    if (result.rows.length === 0) {
      // Return default settings if none exist
      res.json({
        layout: 'grid',
        widgets: [
          { id: 'recent-files', position: 1, visible: true },
          { id: 'data-quality', position: 2, visible: true },
          { id: 'data-volume', position: 3, visible: true },
          { id: 'alerts', position: 4, visible: true }
        ],
        theme: 'light'
      });
    } else {
      res.json(result.rows[0].settings);
    }
  } catch (err) {
    console.error('Error fetching dashboard settings:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard settings' });
  }
});

// File profile endpoint
app.get('/api/files/:fileId/profile', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Check if file exists
    const fileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get file columns
    const columnsResult = await pool.query(
      'SELECT * FROM file_columns WHERE file_id = $1 ORDER BY column_index ASC',
      [fileId]
    );
    
    // Create profile response
    const file = fileResult.rows[0];
    const columns = columnsResult.rows.map(col => ({
      name: col.column_name,
      type: col.column_type,
      count: col.non_null_count,
      unique: col.unique_count,
      missing: col.null_count,
      min: col.min_value,
      max: col.max_value,
      mean: col.mean_value,
      median: col.median_value,
      stdDev: col.std_dev,
      histogram: col.histogram ? JSON.parse(col.histogram) : null
    }));
    
    const profile = {
      fileId,
      filename: file.filename,
      fileType: file.file_type,
      fileSize: file.file_size,
      rowCount: file.row_count,
      columnCount: file.column_count,
      processedAt: file.processed_at,
      columns,
      summary: {
        completeness: ((file.row_count * file.column_count - columnsResult.rows.reduce((acc, col) => acc + (col.null_count || 0), 0)) / (file.row_count * file.column_count) * 100).toFixed(2),
        uniqueness: (columnsResult.rows.reduce((acc, col) => acc + (col.unique_count || 0), 0) / (file.row_count * file.column_count) * 100).toFixed(2)
      }
    };
    
    res.json(profile);
  } catch (err) {
    console.error('Error fetching file profile:', err);
    res.status(500).json({ error: 'Failed to fetch file profile' });
  }
});

// File quality endpoint
app.get('/api/files/:fileId/quality', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Check if file exists
    const fileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Create quality check table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_quality_checks (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        check_type VARCHAR(50) NOT NULL,
        check_name VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        score NUMERIC(5,2),
        details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Get file quality checks
    const qualityChecksResult = await pool.query(
      'SELECT * FROM file_quality_checks WHERE file_id = $1',
      [fileId]
    );
    
    const file = fileResult.rows[0];
    
    // If no quality checks exist yet, create basic ones
    if (qualityChecksResult.rows.length === 0) {
      const basicChecks = [
        {
          check_type: 'completeness',
          check_name: 'Missing Values Check',
          status: 'passed',
          score: 90,
          details: { description: 'Check for missing values in the dataset' }
        },
        {
          check_type: 'consistency',
          check_name: 'Data Type Consistency',
          status: 'passed',
          score: 95,
          details: { description: 'Check if data types are consistent across columns' }
        },
        {
          check_type: 'validity',
          check_name: 'Value Range Check',
          status: 'warning',
          score: 80,
          details: { description: 'Check if values are within expected ranges' }
        }
      ];
      
      for (const check of basicChecks) {
        await pool.query(
          'INSERT INTO file_quality_checks (file_id, check_type, check_name, status, score, details) VALUES ($1, $2, $3, $4, $5, $6)',
          [fileId, check.check_type, check.check_name, check.status, check.score, JSON.stringify(check.details)]
        );
      }
      
      // Fetch the newly created checks
      const newChecksResult = await pool.query(
        'SELECT * FROM file_quality_checks WHERE file_id = $1',
        [fileId]
      );
      
      qualityChecksResult.rows = newChecksResult.rows;
    }
    
    const qualityScore = file.quality_score || 85;
    
    const quality = {
      fileId,
      filename: file.filename,
      qualityScore,
      scoringMethod: 'weighted_average',
      checks: qualityChecksResult.rows.map(check => ({
        id: check.id,
        type: check.check_type,
        name: check.check_name,
        status: check.status,
        score: check.score,
        details: check.details
      })),
      summary: {
        passed: qualityChecksResult.rows.filter(c => c.status === 'passed').length,
        warning: qualityChecksResult.rows.filter(c => c.status === 'warning').length,
        failed: qualityChecksResult.rows.filter(c => c.status === 'failed').length
      }
    };
    
    res.json(quality);
  } catch (err) {
    console.error('Error fetching file quality:', err);
    res.status(500).json({ error: 'Failed to fetch file quality' });
  }
});

// Alert rules endpoint
app.get('/api/alerts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM alert_rules');
    
    // If no rules exist, create some default ones
    if (result.rows.length === 0) {
      const defaultRules = [
        {
          rule_name: 'Missing Values Alert',
          rule_condition: 'greater_than',
          rule_value: '10',
          rule_type: 'data_quality',
          severity: 'warning',
          enabled: true
        },
        {
          rule_name: 'File Size Alert',
          rule_condition: 'percentage_change',
          rule_value: '20',
          rule_type: 'file_metadata',
          severity: 'critical',
          enabled: true
        }
      ];
      
      for (const rule of defaultRules) {
        await pool.query(
          'INSERT INTO alert_rules (rule_name, rule_condition, rule_value, rule_type, severity, enabled) VALUES ($1, $2, $3, $4, $5, $6)',
          [rule.rule_name, rule.rule_condition, rule.rule_value, rule.rule_type, rule.severity, rule.enabled]
        );
      }
      
      const newResult = await pool.query('SELECT * FROM alert_rules');
      res.json(newResult.rows);
    } else {
      res.json(result.rows);
    }
  } catch (err) {
    console.error('Error fetching alert rules:', err);
    res.status(500).json({ error: 'Failed to fetch alert rules' });
  }
});

// Authentication and User Management API

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user in database
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    const user = userResult.rows[0];
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Get user roles and permissions
    const userRolesQuery = `
      SELECT r.name as role_name, r.id as role_id
      FROM roles r
      JOIN user_roles ur ON r.id = ur.role_id
      WHERE ur.user_id = $1
    `;
    const rolesResult = await pool.query(userRolesQuery, [user.id]);
    
    const roleIds = rolesResult.rows.map(role => role.role_id);
    const userRoles = rolesResult.rows.map(role => role.role_name);
    
    // If we have roles, get permissions
    let userPermissions = [];
    if (roleIds.length > 0) {
      const permissionsQuery = `
        SELECT DISTINCT p.name, p.resource, p.action
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = ANY($1::int[])
      `;
      const permissionsResult = await pool.query(permissionsQuery, [roleIds]);
      userPermissions = permissionsResult.rows.map(p => ({ 
        name: p.name, 
        resource: p.resource, 
        action: p.action 
      }));
    }
    
    // Create token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username,
        roles: userRoles,
        permissions: userPermissions
      }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRATION }
    );
    
    // Update last login time
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    
    // Store token in sessions table
    await pool.query(
      'INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'24 hours\')',
      [user.id, token]
    );
    
    // Return token and user info (excluding password)
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
      user: {
        ...userWithoutPassword,
        roles: userRoles,
        permissions: userPermissions
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'An error occurred during login' });
  }
});

// Register endpoint (for creating new users)
app.post('/api/auth/register', authenticateToken, async (req, res) => {
  try {
    // Check if user has permission to create users
    const hasPermission = req.user.permissions.some(p => p.name === 'user_create');
    if (!hasPermission) {
      return res.status(403).json({ error: 'You do not have permission to create users' });
    }
    
    const { username, password, email, fullName, roles } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Check if username already exists
    const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const userResult = await pool.query(
      'INSERT INTO users (username, password, email, full_name) VALUES ($1, $2, $3, $4) RETURNING *',
      [username, hashedPassword, email, fullName]
    );
    
    const user = userResult.rows[0];
    
    // Assign roles if provided
    if (Array.isArray(roles) && roles.length > 0) {
      const rolesQuery = 'SELECT id FROM roles WHERE name = ANY($1::varchar[])';
      const rolesResult = await pool.query(rolesQuery, [roles]);
      
      const roleIds = rolesResult.rows.map(role => role.id);
      if (roleIds.length > 0) {
        // Insert role assignments
        const values = roleIds.map(roleId => `(${user.id}, ${roleId})`).join(', ');
        await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ${values}`);
      }
    }
    
    // Return user info (excluding password)
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'An error occurred during registration' });
  }
});

// Get current user info
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user from database
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Return user info (excluding password)
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
      ...userWithoutPassword,
      roles: req.user.roles,
      permissions: req.user.permissions
    });
  } catch (err) {
    console.error('Error fetching user info:', err);
    res.status(500).json({ error: 'An error occurred while fetching user info' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    
    // Remove token from sessions table
    await pool.query('DELETE FROM user_sessions WHERE token = $1', [token]);
    
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'An error occurred during logout' });
  }
});

// User Management API (protected by authentication and permissions)

// Get all users (admin only)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    // Check if user has permission to view users
    const hasPermission = req.user.permissions.some(p => p.name === 'user_view');
    if (!hasPermission) {
      return res.status(403).json({ error: 'You do not have permission to view users' });
    }
    
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.full_name, u.created_at, u.updated_at, u.last_login,
        array_agg(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      GROUP BY u.id
      ORDER BY u.id ASC
    `);
    
    // Remove null values from roles array
    const users = result.rows.map(user => ({
      ...user,
      roles: user.roles.filter(role => role !== null)
    }));
    
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get roles
app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    // Check if user has permission to view roles
    const hasPermission = req.user.permissions.some(p => p.name === 'role_view');
    if (!hasPermission) {
      return res.status(403).json({ error: 'You do not have permission to view roles' });
    }
    
    const result = await pool.query('SELECT * FROM roles ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching roles:', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// Get permissions
app.get('/api/permissions', authenticateToken, async (req, res) => {
  try {
    // Check if user has permission to view roles
    const hasPermission = req.user.permissions.some(p => 
      p.name === 'role_view' || p.name === 'role_create' || p.name === 'role_edit'
    );
    if (!hasPermission) {
      return res.status(403).json({ error: 'You do not have permission to view permissions' });
    }
    
    const result = await pool.query('SELECT * FROM permissions ORDER BY resource, action');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching permissions:', err);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// Get AI insights for a file
app.get('/api/files/:fileId/insights', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Check if user has permission to view insights
    const hasPermission = req.user.permissions.some(p => p.name === 'insight_view');
    if (!hasPermission) {
      return res.status(403).json({ error: 'You do not have permission to view insights' });
    }
    
    // Get file from database
    const fileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Get column statistics
    const columnStats = await pool.query(
      'SELECT * FROM file_columns WHERE file_id = $1',
      [fileId]
    );
    
    // Get file profile
    const profileResult = await pool.query(
      'SELECT * FROM file_profiles WHERE file_id = $1 ORDER BY created_at DESC LIMIT 1',
      [fileId]
    );
    
    let profile = null;
    if (profileResult.rows.length > 0) {
      profile = profileResult.rows[0];
    }
    
    // Get quality report
    const qualityResult = await pool.query(
      'SELECT * FROM file_quality_checks WHERE file_id = $1 ORDER BY created_at DESC LIMIT 1',
      [fileId]
    );
    
    let quality = null;
    if (qualityResult.rows.length > 0) {
      quality = qualityResult.rows[0];
    }
    
    // Generate insights based on file data
    const insights = {
      summary: {
        fileType: file.file_type,
        rowCount: file.row_count,
        columnCount: file.column_count,
        qualityScore: file.quality_score,
        createdAt: file.created_at,
        updatedAt: file.updated_at
      },
      columnInsights: columnStats.rows.map(col => ({
        name: col.column_name,
        type: col.column_type,
        nullPercentage: col.null_percentage,
        uniquePercentage: col.unique_percentage,
        recommendations: []
      })),
      qualityInsights: quality ? {
        overallScore: quality.overall_score,
        completenessScore: quality.completeness_score,
        validityScore: quality.validity_score,
        consistencyScore: quality.consistency_score,
        accuracyScore: quality.accuracy_score,
        issues: JSON.parse(quality.issues)
      } : null,
      recommendations: [
        {
          id: `rec_${Date.now()}_1`,
          type: 'quality',
          title: 'Improve Data Quality',
          description: 'Consider addressing missing values and outliers to improve overall data quality.',
          actionable: true,
          priority: 'high'
        },
        {
          id: `rec_${Date.now()}_2`,
          type: 'performance',
          title: 'Optimize Data Structure',
          description: 'Converting categorical columns to numerical encodings can improve processing efficiency.',
          actionable: true,
          priority: 'medium'
        },
        {
          id: `rec_${Date.now()}_3`,
          type: 'security',
          title: 'Review Sensitive Data',
          description: 'Ensure any potentially sensitive information is properly anonymized or encrypted.',
          actionable: true,
          priority: 'high'
        }
      ]
    };
    
    res.json(insights);
  } catch (err) {
    console.error('Error generating AI insights:', err);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

// Debug route to check password hashing - REMOVE IN PRODUCTION
app.get('/api/debug/hash-password/:password', async (req, res) => {
  try {
    const { password } = req.params;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    res.json({ hashedPassword });
  } catch (err) {
    console.error('Error hashing password:', err);
    res.status(500).json({ error: 'Failed to hash password' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});