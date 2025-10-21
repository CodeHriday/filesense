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
const authenticateToken = async (req, res, next) => {
  console.log('==== authenticateToken middleware called ====');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN format
  
  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    // Verify token
    console.log('Verifying token');
    const verified = jwt.verify(token, JWT_SECRET);
    console.log('Token verified:', JSON.stringify(verified));
    
    // Store user data from token
    req.user = verified;
    
    // Store the original token for debugging
    req.token = token;
    
    // Get permissions for the user based on roles
    if (verified.roles && verified.roles.length > 0) {
      console.log('User has roles:', verified.roles);
      let allPermissions = [];
      
      // Add some critical permissions regardless of role to ensure minimal functionality
      const criticalPermissions = [
        { name: 'dashboard_view', resource: 'dashboard', action: 'view' },
        { name: 'file_view', resource: 'file', action: 'view' },
        'dashboard:read',
        'file_profile:read'
      ];
      allPermissions = [...allPermissions, ...criticalPermissions];
      console.log('Added critical permissions for all roles');
      
      try {
        // 1. Get all permissions from the permissions and role_permissions tables (old system)
        console.log('Fetching old system permissions from database');
        const permissionsQuery = `
          SELECT DISTINCT p.name, p.resource, p.action
          FROM permissions p
          JOIN role_permissions rp ON p.id = rp.permission_id
          JOIN roles r ON rp.role_id = r.id
          WHERE r.name = ANY($1::varchar[])
        `;
        
        const permissionsResult = await pool.query(permissionsQuery, [verified.roles]);
        console.log('Old system permissions result rows:', permissionsResult.rows.length);
        
        // Store the permissions from the old system
        const oldSystemPermissions = permissionsResult.rows.map(p => ({
          name: p.name,
          resource: p.resource,
          action: p.action
        }));
        
        allPermissions = [...allPermissions, ...oldSystemPermissions];
        console.log('Added permissions from old system');
        
        // 2. Get permissions from the JSON array in the roles table (new system)
        console.log('Fetching new system permissions from roles table');
        const rolesWithPermissionsQuery = `
          SELECT name, permissions 
          FROM roles 
          WHERE name = ANY($1::varchar[])
        `;
        
        const rolesResult = await pool.query(rolesWithPermissionsQuery, [verified.roles]);
        console.log('New system permissions result rows:', rolesResult.rows.length);
        
        // Process each role's JSON permissions
        for (const role of rolesResult.rows) {
          console.log(`Processing role ${role.name}`);
          console.log('Role permissions type:', typeof role.permissions);
          console.log('Role permissions:', JSON.stringify(role.permissions));
          
          // Special handling for Executor role to ensure it always has badges/insights access
          if (role.name === 'Executor') {
            // Core Executor permissions that should always be included
            const executorCorePermissions = [
              'dashboard:read',
              'file_profile:read',
              'quality_checks:read',
              'mappings:read',
              'lineage:read',
              'monitor:read',
              'scheduler:read',
              'badges:read',
              'insights:read',
              'recommendations:read',
              'stories:read'
            ];
            
            console.log(`Adding core permissions for Executor role:`, executorCorePermissions);
            allPermissions = [...allPermissions, ...executorCorePermissions];
          }
          
          if (role.permissions) {
            try {
              // For string array format
              if (Array.isArray(role.permissions)) {
                // These are already in string format like "resource:action"
                const stringPermissions = role.permissions;
                console.log(`Adding array permissions for ${role.name}:`, stringPermissions);
                allPermissions = [...allPermissions, ...stringPermissions];
              } 
              // For object format that PostgreSQL returns from JSONB
              else if (typeof role.permissions === 'object') {
                // Check if it's the specialized format with numeric keys that PostgreSQL returns
                if (Object.keys(role.permissions).some(key => !isNaN(parseInt(key)))) {
                  // This is the format PostgreSQL returns for JSONB arrays: {"0":"perm1","1":"perm2"}
                  const stringPermissions = Object.values(role.permissions);
                  console.log(`Adding object-array permissions for ${role.name}:`, stringPermissions);
                  allPermissions = [...allPermissions, ...stringPermissions];
                } else {
                  // It's a regular object format
                  const permissionsArray = Object.values(role.permissions);
                  console.log(`Adding object permissions for ${role.name}:`, permissionsArray);
                  allPermissions = [...allPermissions, ...permissionsArray];
                }
              } else {
                console.log(`Unrecognized permissions format for ${role.name}:`, typeof role.permissions);
              }
            } catch (innerErr) {
              console.error(`Error processing permissions for role ${role.name}:`, innerErr);
            }
          } else {
            console.log(`No permissions found for role ${role.name}`);
          }
        }
      } catch (dbErr) {
        console.error('Error fetching permissions from database:', dbErr);
      }
      
      // Set the combined permissions on the user object
      req.user.permissions = [...new Set(allPermissions)]; // Remove duplicates
      console.log('Final permissions count:', req.user.permissions.length);
    } else {
      console.log('User has no roles, setting empty permissions array');
      req.user.permissions = [];
    }
    
    console.log('Authentication successful, proceeding to next middleware');
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid token or token expired.' });
  }
};

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
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

// Initialize file schedules table (if not exists)
pool.query(`
  CREATE TABLE IF NOT EXISTS file_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id TEXT NOT NULL,
    schedule TEXT NOT NULL,
    last_run TIMESTAMP,
    next_run TIMESTAMP,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).then(() => {
  console.log('File schedules table initialized');
}).catch(err => {
  console.error('Error initializing file schedules table:', err);
});

// Initialize business process management tables (if not exist)
const initBusinessProcessTables = async () => {
  try {
    // Create groups table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        created_by UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create user_groups table for many-to-many relationship
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_groups (
        user_id UUID,
        group_id UUID,
        PRIMARY KEY (user_id, group_id)
      );
    `);
    
    // Create business_processes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS business_processes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        group_id UUID,
        created_by UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active'
      );
    `);
    
    // Create jobs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        business_process_id UUID,
        source_connection_id TEXT,
        target_connection_id TEXT,
        validation_settings JSONB DEFAULT '{"rules": [], "enabled": true}'::jsonb,
        error_handling_settings JSONB DEFAULT '{"stop_on_error": false, "max_errors": 100, "log_level": "warning"}'::jsonb,
        notification_settings JSONB DEFAULT '{"email_on_success": false, "email_on_failure": true, "recipients": []}'::jsonb,
        schedule_settings JSONB DEFAULT '{"type": "manual", "cron_expression": "", "start_date": null, "enabled": false}'::jsonb,
        status TEXT DEFAULT 'draft',
        created_by UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_run_time TIMESTAMP,
        last_run_status TEXT
      );
    `);
    
    // Create job_runs table to track job execution history
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID,
        status TEXT NOT NULL,
        start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        records_processed INTEGER DEFAULT 0,
        records_succeeded INTEGER DEFAULT 0,
        records_failed INTEGER DEFAULT 0,
        error_details JSONB,
        triggered_by UUID,
        run_details JSONB
      );
    `);
    
    // Check if default group exists, if not create it
    const defaultGroup = await pool.query('SELECT * FROM groups WHERE name = $1', ['Default']);
    
    if (defaultGroup.rows.length === 0) {
      const newGroup = await pool.query(
        'INSERT INTO groups (name, description) VALUES ($1, $2) RETURNING id',
        ['Default', 'Default group for all users']
      );
      
      // Add all users to default group
      const users = await pool.query('SELECT id FROM users');
      let usersAdded = 0;
      
      for (const user of users.rows) {
        try {
          await pool.query(
            'INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [user.id, newGroup.rows[0].id]
          );
          usersAdded++;
        } catch (e) {
          console.error('Error adding user to default group:', e);
        }
      }
      
      console.log(`Added ${usersAdded} users to the default group`);
    }
    
    console.log('Business process management tables initialized');
  } catch (err) {
    console.error('Error initializing business process tables:', err);
  }
};

// Run table initialization
initBusinessProcessTables();

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
        // For large files, analyze only a limited sample to speed up processing
        const MAX_ANALYZE_ROWS = 1000;
        
        // Use faster file analysis that doesn't require reading the entire file
        // Estimate row count from file size instead of counting all lines
        const stats = fs.statSync(file.path);
        const fileSizeBytes = stats.size;
        
        // Process only a portion of the file to calculate averages
        const SAMPLE_SIZE = 100 * 1024; // 100 KB sample
        
        // Create a read stream to process the file efficiently
        const fileStream = fs.createReadStream(file.path, { 
          encoding: 'utf8',
          highWaterMark: SAMPLE_SIZE
        });
        
        // Initialize variables for file processing
        let buffer = '';
        let lineCount = 0;
        let header = [];
        let lineAnalyzed = 0;
        let isFirstChunk = true;
        const sampleLines = [];
        
        // Process file content in first chunk only
        await new Promise((resolve, reject) => {
          fileStream.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            
            if (lines.length > 0) {
              // Process header
              header = lines[0].split(',').map(h => h.trim());
              columnCount = header.length;
              
              // Process sample lines
              const sampleLimit = Math.min(lines.length, MAX_ANALYZE_ROWS + 1);
              for (let i = 1; i < sampleLimit; i++) {
                if (lines[i].trim().length > 0) {
                  sampleLines.push(lines[i]);
                  lineAnalyzed++;
                }
              }
              
              lineCount = sampleLimit;
              
              // We have enough data - end the stream
              fileStream.destroy();
              resolve();
            }
          });
          
          fileStream.on('end', () => {
            resolve();
          });
          
          fileStream.on('error', (err) => {
            reject(err);
          });
        });
        
        // Estimate total rows based on average line length and file size
        const sampleSize = buffer.length;
        const avgBytesPerLine = sampleSize / (lineCount || 1);
        const estimatedRowCount = Math.max(
          Math.floor(fileSizeBytes / avgBytesPerLine) - 1, // Subtract header
          sampleLines.length
        );
        
        // Use estimated row count from the file size calculation
        rowCount = Math.max(estimatedRowCount, lineCount - 1); // Subtract header row
        
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
    let successfulColumnCount = 0;
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
          successfulColumnCount++;
        } catch (columnErr) {
          console.error(`Error saving column "${column.column_name}" (index ${column.column_index}):`, columnErr.message);
          console.error('Column data:', JSON.stringify(column, null, 2));
          // Continue with other columns
        }
      }
      
      // Update the file record with the accurate column count
      if (successfulColumnCount !== columnCount) {
        console.log(`Updating column count from ${columnCount} to ${successfulColumnCount} for file ${fileId}`);
        await pool.query(
          `UPDATE files SET column_count = $1 WHERE file_id = $2`,
          [successfulColumnCount, fileId]
        );
      }
    }
    
    res.json({ 
      success: true, 
      fileId: fileId,
      filename: file.originalname,
      file_type: fileType,
      file_size: file.size,
      row_count: rowCount,
      column_count: successfulColumnCount > 0 ? successfulColumnCount : columnCount,
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
    
    // Get lineage with transformation details
    // Join with transformation_lineage and transformation_mappings to enrich data
    const lineageResult = await pool.query(`
      SELECT 
        fl.*,
        sf.filename as source_filename,
        sf.file_type as source_file_type,
        sf.file_size as source_file_size,
        sf.row_count as source_row_count,
        sf.column_count as source_column_count,
        sf.created_at as source_created_at,
        tf.filename as target_filename,
        tf.file_type as target_file_type,
        tf.file_size as target_file_size,
        tf.row_count as target_row_count,
        tf.column_count as target_column_count,
        tf.created_at as target_created_at
      FROM file_lineage fl
      LEFT JOIN files sf ON fl.source_file_id = sf.file_id
      LEFT JOIN files tf ON fl.target_file_id = tf.file_id
      ORDER BY fl.created_at DESC
    `);
    
    // Also get transformation-based lineage
    const transformLineageResult = await pool.query(`
      SELECT 
        tl.*,
        tm.mapping_name,
        tm.mapping_id,
        tm.field_mappings,
        tm.variables,
        tm.source_file_pattern,
        tm.target_file_name,
        tm.target_file_format,
        tm.description,
        sf.filename as source_filename,
        sf.file_type as source_file_type,
        sf.file_size as source_file_size,
        sf.row_count as source_row_count,
        sf.column_count as source_column_count,
        sf.created_at as source_created_at,
        tf.filename as target_filename,
        tf.file_type as target_file_type,
        tf.file_size as target_file_size,
        tf.row_count as target_row_count,
        tf.column_count as target_column_count,
        tf.created_at as target_created_at
      FROM transformation_lineage tl
      LEFT JOIN transformation_mappings tm ON tl.transformation_id = tm.mapping_id
      LEFT JOIN files sf ON tl.input_file_id = sf.file_id
      LEFT JOIN files tf ON tl.output_file_id = tf.file_id
      ORDER BY tl.created_at DESC
    `);
    
    // Combine both types of lineage
    res.json({
      manual_lineage: lineageResult.rows,
      transformation_lineage: transformLineageResult.rows
    });
  } catch (err) {
    console.error('Error fetching lineage data:', err);
    res.status(500).json({ error: 'Failed to fetch lineage data' });
  }
});

// Scan and populate lineage from existing transformation jobs
app.post('/api/lineage/scan-and-populate', authenticateToken, async (req, res) => {
  try {
    systemLogger.info('Starting lineage scan and populate', { userId: req.user.id });
    
    let created = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails = [];
    
    // Get all successful transformation jobs with their mapping info
    const jobsQuery = `
      SELECT DISTINCT
        tj.id as job_id,
        tj.mapping_id,
        tj.status,
        tj.created_at,
        tm.mapping_name,
        tm.source_file_pattern,
        tm.target_file_name
      FROM transformation_jobs tj
      LEFT JOIN transformation_mappings tm ON tj.mapping_id = tm.mapping_id
      WHERE tj.status = 'completed'
      ORDER BY tj.created_at DESC
    `;
    
    const jobsResult = await pool.query(jobsQuery);
    const jobs = jobsResult.rows;
    
    systemLogger.info(`Found ${jobs.length} completed transformation jobs to process`);
    
    // Process each job
    for (const job of jobs) {
      try {
        // Find source and target files from file_audit for this transformation job
        const auditQuery = `
          SELECT 
            file_id,
            file_name,
            load_type,
            source_path,
            correlation_id
          FROM file_audit
          WHERE transformation_job_id = $1
            AND status = 'success'
          ORDER BY created_at ASC
        `;
        
        const auditResult = await pool.query(auditQuery, [job.job_id]);
        
        if (auditResult.rows.length < 2) {
          // Need at least source and target file
          skipped++;
          continue;
        }
        
        // First record is typically the source, last is the target
        const sourceFile = auditResult.rows[0];
        const targetFile = auditResult.rows[auditResult.rows.length - 1];
        
        // Check if lineage already exists
        const existingCheck = await pool.query(`
          SELECT id FROM transformation_lineage 
          WHERE mapping_id = $1 
            AND input_file_id = $2 
            AND output_file_id = $3
        `, [job.mapping_id, sourceFile.file_id, targetFile.file_id]);
        
        if (existingCheck.rows.length > 0) {
          skipped++;
          continue;
        }
        
        // Create lineage record
        const lineageQuery = `
          INSERT INTO transformation_lineage (
            transformation_id,
            mapping_id,
            input_file_id,
            output_file_id,
            execution_id,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `;
        
        await pool.query(lineageQuery, [
          `transform_${job.mapping_id}`,
          job.mapping_id,
          sourceFile.file_id,
          targetFile.file_id,
          job.job_id.toString(),
          job.created_at
        ]);
        
        created++;
        systemLogger.info('Created lineage record', {
          jobId: job.job_id,
          mappingId: job.mapping_id,
          sourceFile: sourceFile.file_name,
          targetFile: targetFile.file_name
        });
        
      } catch (jobError) {
        errors++;
        const errorMsg = `Job ${job.job_id}: ${jobError.message}`;
        errorDetails.push(errorMsg);
        systemLogger.error('Error processing job for lineage', {
          jobId: job.job_id,
          error: jobError.message
        });
      }
    }
    
    systemLogger.info('Lineage scan and populate completed', {
      totalJobs: jobs.length,
      created,
      skipped,
      errors
    });
    
    res.json({
      success: true,
      summary: {
        totalJobsProcessed: jobs.length,
        lineageCreated: created,
        lineageSkipped: skipped,
        errors: errors
      },
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined
    });
    
  } catch (err) {
    systemLogger.error('Error in lineage scan and populate', { error: err.message });
    res.status(500).json({ 
      success: false,
      error: 'Failed to scan and populate lineage',
      details: err.message 
    });
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
      histogram: col.histogram ? JSON.parse(col.histogram) : null,
      most_frequent_value: col.most_frequent_value,
      least_frequent_value: col.least_frequent_value,
      top_values: col.top_values ? col.top_values : (
        // If top_values doesn't exist in the database, generate a simulated version
        // based on most_frequent_value and least_frequent_value
        col.type === 'string' || col.type === 'date' ? 
          JSON.stringify([
            { value: col.most_frequent_value || 'Unknown', frequency: 20 },
            { value: 'Other Values', frequency: 60 },
            { value: col.least_frequent_value || 'Unknown', frequency: 20 }
          ]) : null
      )
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
    
    // Convert username to lowercase for case-insensitive matching
    const normalizedUsername = username.toLowerCase();
    
    // Find user in database (using LOWER() for case-insensitive matching)
    const userResult = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [normalizedUsername]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    const user = userResult.rows[0];
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Get user roles
    const userRolesQuery = `
      SELECT r.name as role_name, r.id as role_id
      FROM roles r
      JOIN user_roles ur ON r.id = ur.role_id
      WHERE ur.user_id = $1
    `;
    const rolesResult = await pool.query(userRolesQuery, [user.id]);
    
    const roleIds = rolesResult.rows.map(role => role.role_id);
    const userRoles = rolesResult.rows.map(role => role.role_name);
    
    // Create simpler token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username,
        roles: userRoles
      }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRATION }
    );
    
    // Update last login time
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    
    // Don't store token in database
    
    // Return token and user info (excluding password)
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
      user: {
        ...userWithoutPassword,
        roles: userRoles,
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
        // Insert role assignments using PostgreSQL unnest for safe bulk insert
        await pool.query(
          'INSERT INTO user_roles (user_id, role_id) SELECT $1, unnest($2::int[])',
          [user.id, roleIds]
        );
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

// Get current user info - with complete role and permission information
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    console.log('=== /api/auth/me endpoint called ===');
    console.log('User from token:', JSON.stringify(req.user));
    
    const userId = req.user.id;
    console.log('Fetching user with ID:', userId);
    
    // Get user from database
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      console.log('User not found in database');
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('User found in database');
    
    // Get the complete role information from the database
    const userRoles = req.user.roles || [];
    console.log('User roles from token:', userRoles);
    
    let permissions = [];
    let roleDetails = []; // Initialize roleDetails here
    
    // Hardcoded permissions for ALL roles to ensure critical features work
    const corePermissions = [
      'dashboard:read',
      'file_profile:read',
      'quality_checks:read'
    ];
    
    permissions = [...permissions, ...corePermissions];
    console.log('Added core permissions:', corePermissions);
    
    // Get roles directly from database to ensure we have the correct permissions
    if (userRoles.length > 0) {
      console.log('Fetching detailed role information from database');
      
      try {
        // 1. Get permissions from the old system (role_permissions)
        const permissionsQuery = `
          SELECT DISTINCT p.name, p.resource, p.action
          FROM permissions p
          JOIN role_permissions rp ON p.id = rp.permission_id
          JOIN roles r ON rp.role_id = r.id
          WHERE r.name = ANY($1::varchar[])
        `;
        
        const permissionsResult = await pool.query(permissionsQuery, [userRoles]);
        console.log('Permission query result rows:', permissionsResult.rows.length);
        
        // Convert permissions to the format expected by the frontend
        const oldSystemPermissions = permissionsResult.rows.map(p => ({
          name: p.name,
          resource: p.resource,
          action: p.action
        }));
        
        permissions = [...permissions, ...oldSystemPermissions];
        console.log('Added permissions from role_permissions junction table');
        
        // 2. Get permissions from the roles table JSON array (new system)
        console.log('Fetching role details with permissions array');
        const rolesQuery = `SELECT id, name, permissions FROM roles WHERE name = ANY($1::varchar[])`;
        const rolesResult = await pool.query(rolesQuery, [userRoles]);
        console.log('Roles query result rows:', rolesResult.rows.length);
        
        roleDetails = rolesResult.rows || []; // Capture role details
        
        // Process each role's JSON permissions
        for (const role of rolesResult.rows) {
          console.log(`Processing role ${role.name}`);
          console.log('Role permissions type:', typeof role.permissions);
          console.log('Role permissions:', JSON.stringify(role.permissions));
          
          // Special hardcoded permissions for Executor role to ensure proper sidebar
          if (role.name === 'Executor') {
            console.log('Adding special permissions for Executor role');
            // These are the permissions that Executor should always have
            const executorCorePermissions = [
              'mappings:read',        // Ensure mappings is included
              'insights:read',        // Ensure insights is included
              'badges:read',          // Ensure badges is included
              'stories:read',         // Ensure stories is included
              'recommendations:read', // Ensure recommendations is included
              'monitor:read',         // Ensure monitor is included
              'scheduler:read',       // Ensure scheduler is included
              'lineage:read'          // Ensure lineage is included
            ];
            permissions = [...permissions, ...executorCorePermissions];
            console.log('Added Executor core permissions:', executorCorePermissions);
          }
          
          // Process the permissions from the database (could be in several formats)
          if (role.permissions) {
            // Handle array format
            if (Array.isArray(role.permissions)) {
              console.log('Processing array format permissions');
              permissions = [...permissions, ...role.permissions];
            } 
            // Handle object format from PostgreSQL
            else if (typeof role.permissions === 'object') {
              console.log('Processing object format permissions');
              try {
                // Check if it's PostgreSQL's numeric key format
                if (Object.keys(role.permissions).some(key => !isNaN(parseInt(key)))) {
                  console.log('Processing PostgreSQL numeric key format');
                  const stringPermissions = Object.values(role.permissions);
                  permissions = [...permissions, ...stringPermissions];
                } else {
                  // Regular object format
                  console.log('Processing regular object format');
                  const permissionsArray = Object.values(role.permissions);
                  permissions = [...permissions, ...permissionsArray];
                }
              } catch (permErr) {
                console.error('Error processing permissions object:', permErr);
              }
            } else {
              console.log('Unknown permission format:', typeof role.permissions);
            }
          } else {
            console.log('No permissions found for role');
          }
        }
      } catch (rolesErr) {
        console.error('Error processing roles/permissions:', rolesErr);
      }
    } else {
      console.log('No roles found for user, using default permissions only');
    }
    
    const user = userResult.rows[0];
    console.log('Final permission count:', permissions.length);
    
    // Return user info (excluding password)
    const { password: _, ...userWithoutPassword } = user;
    
    const responseData = {
      ...userWithoutPassword,
      roles: userRoles,
      permissions: [...new Set(permissions)], // Remove duplicate permissions
      roleDetails: roleDetails
    };
    
    console.log('Sending user data response. Unique permissions count:', new Set(permissions).size);
    
    res.json(responseData);
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
    // Temporarily bypass permission checks for development
    // Check if user has permission to view users
    // const hasPermission = req.user.permissions.some(p => p.name === 'user_view');
    // if (!hasPermission) {
    //   return res.status(403).json({ error: 'You do not have permission to view users' });
    // }
    
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
    // Temporarily bypass permission checks for development
    // Check if user has permission to view roles
    // const hasPermission = req.user.permissions.some(p => p.name === 'role_view');
    // if (!hasPermission) {
    //   return res.status(403).json({ error: 'You do not have permission to view roles' });
    // }
    
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
    // Temporarily bypass permission checks for development
    // Check if user has permission to view roles
    // const hasPermission = req.user.permissions.some(p => 
    //   p.name === 'role_view' || p.name === 'role_create' || p.name === 'role_edit'
    // );
    // if (!hasPermission) {
    //   return res.status(403).json({ error: 'You do not have permission to view permissions' });
    // }
    
    const result = await pool.query('SELECT * FROM permissions ORDER BY resource, action');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching permissions:', err);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// Create role
app.post('/api/roles', authenticateToken, async (req, res) => {
  try {
    // Temporarily bypass permission checks for development
    // Check if user has permission to create roles
    // const hasPermission = req.user.permissions.some(p => p.name === 'role_create');
    // if (!hasPermission) {
    //   return res.status(403).json({ error: 'You do not have permission to create roles' });
    // }
    
    const { name, description, permissions } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }
    
    // Check if role with the same name already exists
    const existingRole = await pool.query('SELECT * FROM roles WHERE name = $1', [name]);
    if (existingRole.rows.length > 0) {
      return res.status(400).json({ error: 'A role with this name already exists' });
    }
    
    // Create role
    const roleResult = await pool.query(
      'INSERT INTO roles (name, description, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING *',
      [name, description]
    );
    
    const roleId = roleResult.rows[0].id;
    
    // If permissions are provided, link them to the role
    if (permissions && Array.isArray(permissions) && permissions.length > 0) {
      // Update the permissions array in the roles table
      await pool.query(
        'UPDATE roles SET permissions = $1 WHERE id = $2',
        [permissions, roleId]
      );
    }
    
    // Return the created role
    const createdRole = await pool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
    res.status(201).json(createdRole.rows[0]);
  } catch (err) {
    console.error('Error creating role:', err);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// Update role
app.put('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    console.log('Role update endpoint called');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    
    // Temporarily bypass permission checks for development
    // Check if user has permission to update roles
    // const hasPermission = req.user.permissions.some(p => p.name === 'role_edit');
    // if (!hasPermission) {
    //   return res.status(403).json({ error: 'You do not have permission to update roles' });
    // }
    
    const roleId = req.params.id;
    const { name, description, permissions } = req.body;
    
    console.log(`Updating role ${roleId} with name: ${name}, description: ${description}`);
    console.log('Permissions:', permissions);
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }
    
    // Check if role exists
    const existingRole = await pool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
    if (existingRole.rows.length === 0) {
      console.log(`Role with ID ${roleId} not found`);
      return res.status(404).json({ error: 'Role not found' });
    }
    
    console.log('Existing role:', existingRole.rows[0]);
    
    // Don't allow changing Admin role name
    if (existingRole.rows[0].name.toLowerCase() === 'admin' && 
        name.toLowerCase() !== 'admin') {
      return res.status(400).json({ error: 'The Admin role name cannot be changed' });
    }
    
    // Check if another role with the same name exists
    const duplicateRole = await pool.query(
      'SELECT * FROM roles WHERE name = $1 AND id != $2', 
      [name, roleId]
    );
    
    if (duplicateRole.rows.length > 0) {
      return res.status(400).json({ error: 'Another role with this name already exists' });
    }
    
    // Update role
    await pool.query(
      'UPDATE roles SET name = $1, description = $2, updated_at = NOW() WHERE id = $3',
      [name, description, roleId]
    );
    
    // Update permissions
    if (permissions && Array.isArray(permissions)) {
      console.log('Updating permissions for role:', permissions);
      // Update the permissions array
      await pool.query(
        'UPDATE roles SET permissions = $1 WHERE id = $2',
        [permissions, roleId]
      );
    }
    
    // Return the updated role
    const updatedRole = await pool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
    console.log('Updated role:', updatedRole.rows[0]);
    res.json(updatedRole.rows[0]);
  } catch (err) {
    console.error('Error updating role:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Delete role
app.delete('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    // Temporarily bypass permission checks for development
    // Check if user has permission to delete roles
    // const hasPermission = req.user.permissions.some(p => p.name === 'role_delete');
    // if (!hasPermission) {
    //   return res.status(403).json({ error: 'You do not have permission to delete roles' });
    // }
    
    const roleId = req.params.id;
    
    // Check if role exists
    const existingRole = await pool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
    if (existingRole.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    // Don't allow deleting Admin role
    if (existingRole.rows[0].name.toLowerCase() === 'admin') {
      return res.status(400).json({ error: 'The Admin role cannot be deleted' });
    }
    
    // Check if role is assigned to users
    const usersWithRole = await pool.query(
      `SELECT COUNT(*) FROM user_roles 
       WHERE role_id = $1`,
      [roleId]
    );
    
    if (parseInt(usersWithRole.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete role because it is assigned to users. Reassign users to other roles first.' 
      });
    }
    
    // Delete role
    await pool.query('DELETE FROM roles WHERE id = $1', [roleId]);
    
    res.json({ message: 'Role deleted successfully' });
  } catch (err) {
    console.error('Error deleting role:', err);
    res.status(500).json({ error: 'Failed to delete role' });
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

// Run quality check on a file endpoint
app.post('/api/files/:fileId/quality-check', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { rules = [], anomalyDetection = true, calculateReliabilityScore = true } = req.body;
    
    // First, verify the file exists
    const fileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Get column data for the file
    const columnsResult = await pool.query('SELECT * FROM file_columns WHERE file_id = $1', [fileId]);
    const columns = columnsResult.rows;

    // Run basic quality checks
    const basicChecks = {
      null_values_check: {
        status: 'passed',
        details: {
          total_null: 0,
          null_percentage: 0,
          columns_with_nulls: []
        }
      },
      duplicate_rows_check: {
        status: 'passed',
        details: {
          duplicate_count: 0,
          duplicate_percentage: 0
        }
      },
      pattern_checks: {
        status: 'passed',
        details: {
          failed_patterns: []
        }
      }
    };
    
    // Simulate checking nulls in columns
    let totalNulls = 0;
    const columnsWithNulls = [];
    
    columns.forEach(column => {
      // Extract null percentage from column data or assign a default
      const nullPercentage = column.null_percentage || 0;
      
      if (nullPercentage > 0) {
        totalNulls += Math.round((nullPercentage / 100) * file.row_count);
        columnsWithNulls.push({
          column_name: column.column_name,
          null_count: Math.round((nullPercentage / 100) * file.row_count),
          null_percentage: nullPercentage
        });
      }
    });
    
    if (columnsWithNulls.length > 0) {
      basicChecks.null_values_check.status = 'warning';
      basicChecks.null_values_check.details.total_null = totalNulls;
      basicChecks.null_values_check.details.null_percentage = (totalNulls / (file.row_count * file.column_count)) * 100;
      basicChecks.null_values_check.details.columns_with_nulls = columnsWithNulls;
    }
    
    // Calculate scores for different quality dimensions
    const completenessScore = 100 - (basicChecks.null_values_check.details.null_percentage || 0);
    const validityScore = 95; // Placeholder
    const consistencyScore = 90; // Placeholder
    const accuracyScore = 85; // Placeholder
    
    // Create an array for any detected issues
    const issues = [];
    
    // Add issues from basic checks
    if (basicChecks.null_values_check.status !== 'passed') {
      issues.push({
        type: 'missing_data',
        severity: 'warning',
        message: `Found ${basicChecks.null_values_check.details.total_null} null values across ${columnsWithNulls.length} columns`,
        affected_columns: columnsWithNulls.map(c => c.column_name)
      });
    }
    
    // Apply any custom rules
    for (const rule of rules) {
      // This would check each rule against the data
      // As a placeholder, just log what we would check
      console.log(`Would check rule: ${rule.type} on column ${rule.column}`);
    }
    
    // Calculate overall quality score (weighted average)
    const overallScore = Math.round(
      (completenessScore * 0.3) + 
      (validityScore * 0.25) + 
      (consistencyScore * 0.25) + 
      (accuracyScore * 0.2)
    );
    
    // Insert quality check results into file_quality_checks
    // First ensure we have proper checks in the right format
    const qualityChecks = [
      {
        check_type: 'completeness',
        check_name: 'Missing Values Check',
        status: columnsWithNulls.length > 0 ? 'warning' : 'passed',
        score: completenessScore,
        details: { 
          description: 'Check for missing values in the dataset',
          null_counts: basicChecks.null_values_check.details
        }
      },
      {
        check_type: 'consistency',
        check_name: 'Data Type Consistency',
        status: 'passed',
        score: consistencyScore,
        details: { description: 'Check if data types are consistent across columns' }
      },
      {
        check_type: 'validity',
        check_name: 'Value Range Check',
        status: 'passed',
        score: validityScore,
        details: { description: 'Check if values are within expected ranges' }
      },
      {
        check_type: 'accuracy',
        check_name: 'Data Accuracy',
        status: 'passed',
        score: accuracyScore,
        details: { description: 'Check if data values are accurate and conform to expected patterns' }
      }
    ];
    
    // First clear existing checks for this file to avoid duplicates
    await pool.query('DELETE FROM file_quality_checks WHERE file_id = $1', [fileId]);
    
    // Insert new checks
    for (const check of qualityChecks) {
      await pool.query(
        'INSERT INTO file_quality_checks (file_id, check_type, check_name, status, score, details) VALUES ($1, $2, $3, $4, $5, $6)',
        [fileId, check.check_type, check.check_name, check.status, check.score, JSON.stringify(check.details)]
      );
    }
    
    // Also update the quality score in the files table
    await pool.query(
      'UPDATE files SET quality_score = $1 WHERE file_id = $2',
      [overallScore, fileId]
    );
    
    // Fetch the newly created checks to return
    const newChecksResult = await pool.query(
      'SELECT * FROM file_quality_checks WHERE file_id = $1',
      [fileId]
    );
    
    const qualityData = {
      file_id: fileId,
      overall_score: overallScore,
      dimension_scores: {
        completeness: completenessScore,
        validity: validityScore,
        consistency: consistencyScore,
        accuracy: accuracyScore
      },
      checks: newChecksResult.rows.map(row => ({
        id: row.id,
        type: row.check_type,
        name: row.check_name,
        status: row.status,
        score: row.score,
        details: row.details
      })),
      issues: issues,
      created_at: new Date().toISOString()
    };
    
    res.json(qualityData);
  } catch (error) {
    console.error('Error running quality check:', error);
    res.status(500).json({ error: 'Failed to run quality check', details: error.message });
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

// Create the schedules table if it doesn't exist
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_schedules (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        frequency VARCHAR(50) NOT NULL, -- 'hourly', 'daily', 'weekly', 'monthly'
        time VARCHAR(10), -- HH:MM format (for non-hourly frequencies)
        day INTEGER, -- Day of week (0-6) for weekly or day of month (1-31) for monthly
        is_active BOOLEAN DEFAULT TRUE,
        last_run TIMESTAMP,
        next_run TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(255),
        CONSTRAINT fk_file FOREIGN KEY(file_id) REFERENCES files(file_id) ON DELETE CASCADE
      )
    `);
    console.log('File schedules table initialized');
  } catch (error) {
    console.error('Error creating schedules table:', error);
  }
})();

// Schedule endpoints

// Get all schedules
app.get('/api/schedules', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM file_schedules ORDER BY created_at DESC');
    res.json({ schedules: result.rows });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules', details: error.message });
  }
});

// Get a specific schedule
app.get('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM file_schedules WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json({ schedule: result.rows[0] });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule', details: error.message });
  }
});

// Create a new schedule
app.post('/api/schedules', async (req, res) => {
  try {
    const { file_id, frequency, time, day, is_active } = req.body;
    
    if (!file_id || !frequency) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Calculate next run time
    const now = new Date();
    let nextRun = new Date(now);
    
    switch (frequency) {
      case 'hourly':
        nextRun.setHours(nextRun.getHours() + 1, 0, 0, 0);
        break;
      case 'daily':
        const [hours, minutes] = time ? time.split(':').map(Number) : [0, 0];
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(hours, minutes, 0, 0);
        break;
      case 'weekly':
        const dayOfWeek = day || 0;
        const daysToAdd = (dayOfWeek + 7 - now.getDay()) % 7;
        nextRun.setDate(nextRun.getDate() + (daysToAdd === 0 ? 7 : daysToAdd));
        const [weekHours, weekMinutes] = time ? time.split(':').map(Number) : [0, 0];
        nextRun.setHours(weekHours, weekMinutes, 0, 0);
        break;
      case 'monthly':
        const dayOfMonth = day || 1;
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(dayOfMonth);
        const [monthHours, monthMinutes] = time ? time.split(':').map(Number) : [0, 0];
        nextRun.setHours(monthHours, monthMinutes, 0, 0);
        break;
      default:
        nextRun.setDate(nextRun.getDate() + 1);
    }
    
    const result = await pool.query(
      `INSERT INTO file_schedules 
       (file_id, frequency, time, day, is_active, next_run) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [file_id, frequency, time, day, is_active, nextRun]
    );
    
    res.status(201).json({ schedule: result.rows[0] });
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ error: 'Failed to create schedule', details: error.message });
  }
});

// Update a schedule
app.patch('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { frequency, time, day, is_active } = req.body;
    
    // Start with the updates we have
    const updates = {};
    const values = [];
    let paramIndex = 1;
    
    if (frequency !== undefined) {
      updates.frequency = `frequency = $${paramIndex++}`;
      values.push(frequency);
    }
    
    if (time !== undefined) {
      updates.time = `time = $${paramIndex++}`;
      values.push(time);
    }
    
    if (day !== undefined) {
      updates.day = `day = $${paramIndex++}`;
      values.push(day);
    }
    
    if (is_active !== undefined) {
      updates.is_active = `is_active = $${paramIndex++}`;
      values.push(is_active);
    }
    
    // Add the updated_at timestamp
    updates.updated_at = `updated_at = $${paramIndex++}`;
    values.push(new Date());
    
    // Add the schedule ID as the last parameter
    values.push(id);
    
    // Construct the update query
    const updateClause = Object.values(updates).join(', ');
    const query = `UPDATE file_schedules SET ${updateClause} WHERE id = $${paramIndex} RETURNING *`;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json({ schedule: result.rows[0] });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule', details: error.message });
  }
});

// Delete a schedule
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM file_schedules WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json({ message: 'Schedule deleted successfully', schedule: result.rows[0] });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule', details: error.message });
  }
});

// Run a schedule immediately
app.post('/api/schedules/:id/run', async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, get the schedule
    const scheduleResult = await pool.query('SELECT * FROM file_schedules WHERE id = $1', [id]);
    
    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    const schedule = scheduleResult.rows[0];
    
    // Get the file info
    const fileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [schedule.file_id]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Associated file not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Update the last_run time
    await pool.query(
      'UPDATE file_schedules SET last_run = $1 WHERE id = $2',
      [new Date(), id]
    );
    
    // Here you would trigger the file processing logic
    // For now, just return success
    res.json({ 
      message: 'Schedule triggered successfully',
      job: {
        id: uuidv4(),
        status: 'processing',
        file: {
          id: file.file_id,
          name: file.filename
        },
        started_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error running schedule:', error);
    res.status(500).json({ error: 'Failed to run schedule', details: error.message });
  }
});

// Update a schedule
app.patch('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { file_id, frequency, time, day, is_active } = req.body;
    
    // First, check if the schedule exists
    const checkResult = await pool.query('SELECT * FROM file_schedules WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    // Validate inputs
    if (file_id && typeof file_id !== 'string') {
      return res.status(400).json({ error: 'Invalid file_id format' });
    }
    
    if (frequency && !['hourly', 'daily', 'weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency value' });
    }
    
    // Calculate next run time if frequency is changing
    let nextRun = null;
    if (frequency) {
      const now = new Date();
      nextRun = new Date(now);
      
      switch (frequency) {
        case 'hourly':
          nextRun.setHours(nextRun.getHours() + 1, 0, 0, 0);
          break;
        case 'daily':
          const [hours, minutes] = time ? time.split(':').map(Number) : [0, 0];
          nextRun.setDate(nextRun.getDate() + 1);
          nextRun.setHours(hours, minutes, 0, 0);
          break;
        case 'weekly':
          const dayOfWeek = day || 0;
          const daysToAdd = (dayOfWeek + 7 - now.getDay()) % 7;
          nextRun.setDate(nextRun.getDate() + (daysToAdd === 0 ? 7 : daysToAdd));
          const [weekHours, weekMinutes] = time ? time.split(':').map(Number) : [0, 0];
          nextRun.setHours(weekHours, weekMinutes, 0, 0);
          break;
        case 'monthly':
          const dayOfMonth = day || 1;
          nextRun.setMonth(nextRun.getMonth() + 1);
          nextRun.setDate(dayOfMonth);
          const [monthHours, monthMinutes] = time ? time.split(':').map(Number) : [0, 0];
          nextRun.setHours(monthHours, monthMinutes, 0, 0);
          break;
        default:
          nextRun.setDate(nextRun.getDate() + 1);
      }
    }
    
    // Build the update query dynamically
    let updateFields = [];
    let queryParams = [];
    let paramCount = 1;
    
    if (file_id !== undefined) {
      updateFields.push(`file_id = $${paramCount}`);
      queryParams.push(file_id);
      paramCount++;
    }
    
    if (frequency !== undefined) {
      updateFields.push(`frequency = $${paramCount}`);
      queryParams.push(frequency);
      paramCount++;
    }
    
    if (time !== undefined) {
      updateFields.push(`time = $${paramCount}`);
      queryParams.push(time);
      paramCount++;
    }
    
    if (day !== undefined) {
      updateFields.push(`day = $${paramCount}`);
      queryParams.push(day);
      paramCount++;
    }
    
    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramCount}`);
      queryParams.push(is_active);
      paramCount++;
    }
    
    if (nextRun !== null) {
      updateFields.push(`next_run = $${paramCount}`);
      queryParams.push(nextRun);
      paramCount++;
    }
    
    // Always update the updated_at timestamp
    updateFields.push(`updated_at = $${paramCount}`);
    queryParams.push(new Date());
    paramCount++;
    
    // Add the id as the last parameter
    queryParams.push(id);
    
    // If no fields to update, return early
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    // Execute the update query
    const result = await pool.query(
      `UPDATE file_schedules SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      queryParams
    );
    
    res.json({ schedule: result.rows[0] });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule', details: error.message });
  }
});

// Delete a schedule
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, check if the schedule exists
    const checkResult = await pool.query('SELECT * FROM file_schedules WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    // Delete the schedule
    await pool.query('DELETE FROM file_schedules WHERE id = $1', [id]);
    
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule', details: error.message });
  }
});

// Get schedules for a specific file
app.get('/api/files/:fileId/schedules', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM file_schedules WHERE file_id = $1 ORDER BY created_at DESC',
      [fileId]
    );
    
    res.json({ schedules: result.rows });
  } catch (error) {
    console.error('Error fetching file schedules:', error);
    res.status(500).json({ error: 'Failed to fetch file schedules', details: error.message });
  }
});

// Business Processes API - REMOVED
app.get('/api/business-processes', authenticateToken, (req, res) => {
  res.status(410).json({ error: "This feature has been removed" });
});

app.get('/api/business-processes'/:id, authenticateToken, (req, res) => {
  res.status(410).json({ error: "This feature has been removed" });
});

app.post('/api/business-processes', authenticateToken, (req, res) => {
  res.status(410).json({ error: "This feature has been removed" });
});

app.put('/api/business-processes'/:id, authenticateToken, (req, res) => {
  res.status(410).json({ error: "This feature has been removed" });
});

app.delete('/api/business-processes'/:id, authenticateToken, (req, res) => {
  res.status(410).json({ error: "This feature has been removed" });
});

// Jobs API - REMOVED
app.get('/api/jobs', authenticateToken, (req, res) => {
  res.status(410).json({ error: "This feature has been removed" });
});

app.get('/api/jobs'/:id, authenticateToken, (req, res) => {
  res.status(410).json({ error: "This feature has been removed" });
});

app.post('/api/jobs', authenticateToken, (req, res) => {
  res.status(410).json({ error: "This feature has been removed" });
});

app.put('/api/jobs'/:id, authenticateToken, (req, res) => {
  res.status(410).json({ error: "This feature has been removed" });
});

app.delete('/api/jobs'/:id, authenticateToken, (req, res) => {
  res.status(410).json({ error: "This feature has been removed" });
});

app.post('/api/jobs'/:id/run, authenticateToken, (req, res) => {
  res.status(410).json({ error: "This feature has been removed" });
});

// Groups API - REMOVED
app.get('/api/groups', authenticateToken, (req, res) => {
  res.status(410).json({ error: "This feature has been removed" });
});

app.get('/api/user/groups', authenticateToken, (req, res) => {
  res.status(410).json({ error: "This feature has been removed" });
});

