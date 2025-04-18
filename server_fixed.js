const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors({
  origin: ['http://localhost:5000', 'https://localhost:5000', 'http://0.0.0.0:5000', 'https://0.0.0.0:5000', 'http://*.replit.dev', 'https://*.replit.dev', 'https://*.replit.app'],
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
