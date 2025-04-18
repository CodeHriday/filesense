const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

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

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});