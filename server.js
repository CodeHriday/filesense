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
  origin: ['http://localhost:5000', 'https://localhost:5000', 'https://*.replit.dev', 'https://*.replit.app'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configure file upload
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

const upload = multer({ storage: storage });

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
        // Read the CSV file to extract schema and basic statistics
        const fileContent = fs.readFileSync(file.path, 'utf8');
        const lines = fileContent.split('\n').filter(line => line.trim());
        
        if (lines.length > 0) {
          // Extract header row for column names
          const header = lines[0].split(',').map(h => h.trim());
          columnCount = header.length;
          rowCount = lines.length - 1; // Subtract header row
          
          // Create column entries
          columns = header.map((colName, index) => {
            // Identify simple data types based on first data row
            let dataType = 'string';
            let minValue = null;
            let maxValue = null;
            let mostFrequentValue = null;
            let leastFrequentValue = null;
            
            if (lines.length > 1) {
              // Get the column values from all data rows
              const columnValues = [];
              const valueCounts = {};
              
              for (let i = 1; i < lines.length; i++) {
                const rowValues = lines[i].split(',');
                if (index < rowValues.length) {
                  const value = rowValues[index].trim();
                  columnValues.push(value);
                  
                  // Count occurrences for frequency analysis
                  if (value && value !== '') {
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
              least_frequent_value: leastFrequentValue
            };
          });
        }
      } else if (fileType === 'json') {
        try {
          const fileContent = fs.readFileSync(file.path, 'utf8');
          const jsonData = JSON.parse(fileContent);
          
          if (Array.isArray(jsonData)) {
            rowCount = jsonData.length;
            if (rowCount > 0) {
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
                  jsonData.forEach(item => {
                    if (item[key] !== null && item[key] !== undefined) {
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
                  least_frequent_value: leastFrequentValue
                };
              });
            }
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
               most_frequent_value, least_frequent_value, created_at) 
             VALUES 
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
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
              column.least_frequent_value
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

// File profile endpoint
app.get('/api/files/:fileId/profile', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Get basic file info
    const fileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Get columns info
    const columnsResult = await pool.query(
      'SELECT * FROM file_columns WHERE file_id = $1 ORDER BY column_index ASC',
      [fileId]
    );
    
    // Read file contents based on file type
    const filePath = file.metadata?.path;
    let fileData = {};
    
    if (filePath) {
      try {
        // For now, just return some basic metadata
        fileData = {
          filename: file.filename,
          file_type: file.file_type,
          file_size: file.file_size,
          row_count: file.row_count || 0,
          column_count: file.column_count || columnsResult.rows.length,
          columns: columnsResult.rows,
          created_at: file.created_at,
          updated_at: file.updated_at
        };
      } catch (readErr) {
        console.error('Error reading file contents:', readErr);
        // Continue with available metadata even if file read fails
      }
    }
    
    // Generate profile
    const profile = {
      file_id: file.file_id,
      basic_info: {
        filename: file.filename,
        file_type: file.file_type,
        file_size: file.file_size,
        created_at: file.created_at,
        row_count: file.row_count || 0,
        column_count: file.column_count || columnsResult.rows.length,
      },
      columns: columnsResult.rows.map(col => ({
        name: col.column_name,
        type: col.column_type,
        null_count: col.null_count || 0,
        unique_count: col.unique_count || 0,
        min_value: col.min_value,
        max_value: col.max_value,
        min_value_decimal: col.min_value_decimal,
        max_value_decimal: col.max_value_decimal,
        most_frequent_value: col.most_frequent_value,
        least_frequent_value: col.least_frequent_value,
        file_name: col.file_name
      })),
      file_data: fileData
    };
    
    res.json(profile);
  } catch (err) {
    console.error('Error generating file profile:', err);
    console.error(err.stack);
    res.status(500).json({ error: 'Failed to generate file profile' });
  }
});

// File quality endpoint
app.get('/api/files/:fileId/quality', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Get basic file info
    const fileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Get columns info
    const columnsResult = await pool.query(
      'SELECT * FROM file_columns WHERE file_id = $1 ORDER BY column_index ASC',
      [fileId]
    );
    
    // Calculate completeness score based on null values
    const columnsWithCompleteness = columnsResult.rows.map(col => {
      const totalRows = file.row_count || 100; // Default if row_count not available
      const nullCount = col.null_count || 0;
      const completeness = ((totalRows - nullCount) / totalRows) * 100;
      
      return {
        ...col,
        completeness: Math.round(completeness * 100) / 100 // Round to 2 decimal places
      };
    });
    
    // Calculate overall quality score
    const qualityScore = file.quality_score || 
      Math.round(columnsWithCompleteness.reduce((sum, col) => sum + col.completeness, 0) / 
      (columnsWithCompleteness.length || 1));
    
    const qualityResults = {
      file_id: file.file_id,
      filename: file.filename,
      overall_score: qualityScore,
      completeness: {
        score: Math.round(columnsWithCompleteness.reduce((sum, col) => sum + col.completeness, 0) / 
          (columnsWithCompleteness.length || 1) * 100) / 100,
        details: columnsWithCompleteness.map(col => ({
          column: col.column_name,
          score: col.completeness
        }))
      },
      column_metrics: columnsWithCompleteness.map(col => ({
        name: col.column_name,
        type: col.column_type,
        null_count: col.null_count || 0,
        unique_count: col.unique_count || 0,
        completeness: col.completeness
      }))
    };
    
    res.json(qualityResults);
  } catch (err) {
    console.error('Error generating quality metrics:', err);
    console.error(err.stack);
    res.status(500).json({ error: 'Failed to generate quality metrics' });
  }
});

// Quality check run endpoint
app.post('/api/files/:fileId/quality-check', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { rules } = req.body;
    
    // Get file info
    const fileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Run the quality check
    // For now, we'll just return a mock result based on the file's quality score
    const file = fileResult.rows[0];
    const qualityScore = file.quality_score || Math.round(Math.random() * 100);
    
    res.json({
      file_id: fileId,
      filename: file.filename,
      check_time: new Date().toISOString(),
      quality_score: qualityScore,
      rules_evaluated: rules?.length || 0,
      issues_found: Math.round((100 - qualityScore) / 10), // Mock value
      passed: qualityScore > 80
    });
  } catch (err) {
    console.error('Error running quality check:', err);
    console.error(err.stack);
    res.status(500).json({ error: 'Failed to run quality check' });
  }
});

app.delete('/api/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    await pool.query('DELETE FROM files WHERE file_id = $1', [fileId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Alert Rules API
app.get('/api/alerts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM alert_rules ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching alert rules:', err);
    res.status(500).json({ error: 'Failed to fetch alert rules' });
  }
});

app.post('/api/alerts', async (req, res) => {
  try {
    const { rule_name, rule_type, rule_condition, rule_value, severity } = req.body;
    
    const result = await pool.query(
      'INSERT INTO alert_rules (rule_name, rule_type, rule_condition, rule_value, severity, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *',
      [rule_name, rule_type, rule_condition, rule_value, severity]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating alert rule:', err);
    res.status(500).json({ error: 'Failed to create alert rule' });
  }
});

app.put('/api/alerts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rule_name, rule_type, rule_condition, rule_value, severity, enabled } = req.body;
    
    const result = await pool.query(
      'UPDATE alert_rules SET rule_name = $1, rule_type = $2, rule_condition = $3, rule_value = $4, severity = $5, enabled = $6, updated_at = NOW() WHERE id = $7 RETURNING *',
      [rule_name, rule_type, rule_condition, rule_value, severity, enabled, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating alert rule:', err);
    res.status(500).json({ error: 'Failed to update alert rule' });
  }
});

app.delete('/api/alerts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM alert_rules WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting alert rule:', err);
    res.status(500).json({ error: 'Failed to delete alert rule' });
  }
});

app.get('/api/alerts/history', async (req, res) => {
  try {
    // Check if the alert_history table has any records
    const countResult = await pool.query('SELECT COUNT(*) FROM alert_history');
    const count = parseInt(countResult.rows[0].count);
    
    if (count === 0) {
      // If no records, return an empty array
      return res.json([]);
    }
    
    // If records exist, proceed with the join query
    try {
      const result = await pool.query(`
        SELECT ah.*, ar.rule_name, ar.rule_type, ar.severity, f.filename
        FROM alert_history ah
        JOIN alert_rules ar ON ah.rule_id = ar.id
        JOIN files f ON ah.file_id = f.file_id
        ORDER BY ah.triggered_at DESC
      `);
      res.json(result.rows);
    } catch (joinErr) {
      console.error('Error with join query in alert history:', joinErr);
      console.error(joinErr.stack);
      
      // Fallback: Return just the alert history without joins
      const fallbackResult = await pool.query('SELECT * FROM alert_history ORDER BY triggered_at DESC');
      res.json(fallbackResult.rows);
    }
  } catch (err) {
    console.error('Error fetching alert history:', err);
    console.error(err.stack);
    res.status(500).json({ error: 'Failed to fetch alert history: ' + err.message });
  }
});

// Connections API
app.get('/api/connections', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, connection_name, connection_type, host, port, username, database_name, created_at, updated_at, last_used_at FROM connections ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching connections:', err);
    res.status(500).json({ error: 'Failed to fetch connections' });
  }
});

app.post('/api/connections', async (req, res) => {
  try {
    const { 
      connection_name, 
      connection_type, 
      host, 
      port, 
      username, 
      password, 
      database_name, 
      connection_string,
      parameters 
    } = req.body;
    
    // In a real app, you would encrypt the password
    const password_encrypted = password; // For simplicity, not encrypting here
    
    const result = await pool.query(
      `INSERT INTO connections 
       (connection_name, connection_type, host, port, username, password_encrypted, database_name, connection_string, parameters, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) 
       RETURNING id, connection_name, connection_type, host, port, username, database_name, created_at, updated_at`,
      [connection_name, connection_type, host, port, username, password_encrypted, database_name, connection_string, parameters || {}]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating connection:', err);
    res.status(500).json({ error: 'Failed to create connection' });
  }
});

app.put('/api/connections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      connection_name, 
      connection_type, 
      host, 
      port, 
      username, 
      password, 
      database_name, 
      connection_string,
      parameters 
    } = req.body;
    
    let updateQuery, updateParams;
    
    if (password) {
      // If password is provided, update it as well
      const password_encrypted = password; // Again, for simplicity
      
      updateQuery = `
        UPDATE connections 
        SET connection_name = $1, connection_type = $2, host = $3, port = $4, username = $5, 
            password_encrypted = $6, database_name = $7, connection_string = $8, parameters = $9, updated_at = NOW() 
        WHERE id = $10 
        RETURNING id, connection_name, connection_type, host, port, username, database_name, created_at, updated_at
      `;
      
      updateParams = [
        connection_name, connection_type, host, port, username, 
        password_encrypted, database_name, connection_string, parameters || {}, id
      ];
    } else {
      // If no password, don't update it
      updateQuery = `
        UPDATE connections 
        SET connection_name = $1, connection_type = $2, host = $3, port = $4, username = $5, 
            database_name = $6, connection_string = $7, parameters = $8, updated_at = NOW() 
        WHERE id = $9 
        RETURNING id, connection_name, connection_type, host, port, username, database_name, created_at, updated_at
      `;
      
      updateParams = [
        connection_name, connection_type, host, port, username, 
        database_name, connection_string, parameters || {}, id
      ];
    }
    
    const result = await pool.query(updateQuery, updateParams);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating connection:', err);
    res.status(500).json({ error: 'Failed to update connection' });
  }
});

app.delete('/api/connections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM connections WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting connection:', err);
    res.status(500).json({ error: 'Failed to delete connection' });
  }
});

// Column Mappings API
app.get('/api/mappings', async (req, res) => {
  try {
    // Check if the column_mappings table has any records
    const countResult = await pool.query('SELECT COUNT(*) FROM column_mappings');
    const count = parseInt(countResult.rows[0].count);
    
    if (count === 0) {
      // If no records, return an empty array
      return res.json([]);
    }
    
    // If records exist, proceed with the join query
    try {
      const result = await pool.query(`
        SELECT m.*, f.filename as source_filename
        FROM column_mappings m
        JOIN files f ON m.source_file_id = f.file_id
        ORDER BY m.created_at DESC
      `);
      res.json(result.rows);
    } catch (joinErr) {
      console.error('Error with join query in column mappings:', joinErr);
      console.error(joinErr.stack);
      
      // Fallback: Return just the mappings without joins
      const fallbackResult = await pool.query('SELECT * FROM column_mappings ORDER BY created_at DESC');
      res.json(fallbackResult.rows);
    }
  } catch (err) {
    console.error('Error fetching column mappings:', err);
    console.error(err.stack);
    res.status(500).json({ error: 'Failed to fetch column mappings: ' + err.message });
  }
});

app.post('/api/mappings', async (req, res) => {
  try {
    const { mapping_name, source_file_id, target_file_type, mapping_config } = req.body;
    
    const result = await pool.query(
      'INSERT INTO column_mappings (mapping_name, source_file_id, target_file_type, mapping_config, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *',
      [mapping_name, source_file_id, target_file_type, mapping_config]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating column mapping:', err);
    res.status(500).json({ error: 'Failed to create column mapping' });
  }
});

app.put('/api/mappings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { mapping_name, source_file_id, target_file_type, mapping_config } = req.body;
    
    const result = await pool.query(
      'UPDATE column_mappings SET mapping_name = $1, source_file_id = $2, target_file_type = $3, mapping_config = $4, updated_at = NOW() WHERE id = $5 RETURNING *',
      [mapping_name, source_file_id, target_file_type, mapping_config, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mapping not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating column mapping:', err);
    res.status(500).json({ error: 'Failed to update column mapping' });
  }
});

app.delete('/api/mappings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM column_mappings WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting column mapping:', err);
    res.status(500).json({ error: 'Failed to delete column mapping' });
  }
});

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error in request:', err);
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong' 
  });
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Don't crash the server
});

// Catch uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:');
  console.error(err.stack);
  // Keep the process alive
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});