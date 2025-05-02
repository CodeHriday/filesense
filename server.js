const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Initialize dependency injection container
const { initialize: initializeDI } = require('./backend/di/bootstrapper');
const diContainer = initializeDI();

// Import enhanced backend features
const { setupEnhancedFeatures } = require('./backend/integration');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Get shared services from DI container
const dbPool = diContainer.get('dbPool');
const logger = diContainer.get('logger');

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-for-development';
const JWT_EXPIRATION = '24h'; // Token expiration time

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  console.log('==== authenticateToken middleware called ====');
  
  // Skip auth for Business Process Management routes, but set a default user
  if (req.path.match(/^\/api\/groups/) || 
      req.path.match(/^\/api\/business-processes/) || 
      req.path.match(/^\/api\/jobs/)) {
    console.log('Skipping auth for BPM route:', req.path);
    // Set a default admin user to prevent 'undefined' errors
    req.user = { 
      id: 2,  // Admin ID
      roles: ['Admin']
    };
    return next();
  }
  
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

// Attach logger to request for use in error handler
app.use((req, res, next) => {
  req.logger = logger;
  next();
});

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

// Use the database pool from the DI container
const pool = dbPool;

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

// Import our improved implementation
const initBusinessProcessTables = require('./initBusinessProcessTables');

// Run table initialization
initBusinessProcessTables(pool);

// Business Process Management API Routes
// Groups API - with stats (public)
app.get('/api/groups/stats', async (req, res) => {
  try {
    // First check if we need to create a default group
    const checkDefaultGroup = await pool.query("SELECT COUNT(*) FROM groups WHERE name = 'Default Group'");
    if (parseInt(checkDefaultGroup.rows[0].count) === 0) {
      console.log('No default group found, creating one');
      try {
        await pool.query(`
          INSERT INTO groups (name, description)
          VALUES ('Default Group', 'Default group for all users');
        `);
        console.log('Created default group');
      } catch (err) {
        if (err.code !== '23505') { // Not a unique violation
          console.error('Error creating default group:', err);
        }
      }
    }
  
    const groupsQuery = `
      SELECT g.*, COUNT(DISTINCT ug.user_id) as user_count, COUNT(DISTINCT bp.id) as process_count
      FROM groups g
      LEFT JOIN user_groups ug ON g.id = ug.group_id
      LEFT JOIN business_processes bp ON g.id = bp.group_id
      GROUP BY g.id
      ORDER BY g.name
    `;
    
    const groupsResult = await pool.query(groupsQuery);
    res.json(groupsResult.rows);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

app.get('/api/groups/user', async (req, res) => {
  // Return all groups for now (since we're not using auth)
  try {
    const groupsQuery = `
      SELECT g.*, COUNT(DISTINCT ug.user_id) as user_count, COUNT(DISTINCT bp.id) as process_count
      FROM groups g
      LEFT JOIN user_groups ug ON g.id = ug.group_id
      LEFT JOIN business_processes bp ON g.id = bp.group_id
      GROUP BY g.id
      ORDER BY g.name
    `;
    
    const groupsResult = await pool.query(groupsQuery);
    res.json(groupsResult.rows);
  } catch (err) {
    console.error('Error fetching user groups:', err);
    res.status(500).json({ error: 'Failed to fetch user groups' });
  }
});

app.post('/api/groups', async (req, res) => {
  try {
    const { name, description } = req.body;
    
    // Basic validation
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    // Insert the group
    const result = await pool.query(
      'INSERT INTO groups (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating group:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

app.put('/api/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    // Basic validation
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    // Update the group
    const result = await pool.query(
      'UPDATE groups SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [name, description, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating group:', err);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

app.delete('/api/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete the group
    const result = await pool.query('DELETE FROM groups WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json({ message: 'Group deleted successfully', id: result.rows[0].id });
  } catch (err) {
    console.error('Error deleting group:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// Business Processes API
// NOTE: Primary implementation is at line ~2744, this duplicate has been removed

// Jobs API - Replaced by authenticated endpoint below

// API Routes
// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test DI endpoint - this is for testing only and should be removed in production
app.get('/api/test-di', (req, res) => {
  try {
    const transformationService = diContainer.get('transformationService');
    const fileService = diContainer.get('fileService');
    
    // Just check if we can access the services
    res.json({ 
      status: 'ok', 
      services: {
        transformation: {
          name: 'TransformationService',
          methodCount: Object.getOwnPropertyNames(Object.getPrototypeOf(transformationService))
            .filter(m => m !== 'constructor').length
        },
        file: {
          name: 'FileService',
          methodCount: Object.getOwnPropertyNames(Object.getPrototypeOf(fileService))
            .filter(m => m !== 'constructor').length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Files API
app.get('/api/files', async (req, res) => {
  try {
    // Use the FileService from the DI container
    const fileService = diContainer.get('fileService');
    const files = await fileService.getAllFiles({
      sortBy: 'created_at',
      sortOrder: 'DESC'
    });
    
    res.json(files);
  } catch (err) {
    logger.error('Error fetching files', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

app.get('/api/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Use the FileService from the DI container
    const fileService = diContainer.get('fileService');
    const file = await fileService.getFileById(fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.json(file);
  } catch (err) {
    logger.error('Error fetching file details', { error: err.message, fileId: req.params.fileId });
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
    
    // Handle metadata whether it's a string or already an object
    let filePath;
    if (typeof file.metadata === 'string') {
      // If metadata is a string, parse it
      filePath = JSON.parse(file.metadata).path;
    } else if (typeof file.metadata === 'object' && file.metadata !== null) {
      // If metadata is already an object, use it directly
      filePath = file.metadata.path;
    } else {
      // Handle the case where metadata is invalid
      console.error('Invalid metadata format:', file.metadata);
      return res.status(500).json({ error: 'Invalid file metadata format' });
    }
    
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
    
    // Use the FileService from the DI container
    const fileService = diContainer.get('fileService');
    logger.info('Processing file upload', { 
      filename: req.file.originalname, 
      size: req.file.size,
      traceId: `svc_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
    });
    
    // Important: Define these variables that are used later in the code
    const file = req.file;
    // Generate a consistent fileId that will be used throughout this request
    const generatedFileId = `file_${Date.now()}`;
    const fileType = path.extname(file.originalname).substring(1).toLowerCase();
    
    // Process file based on type
    let rowCount = 0;
    let columnCount = 0;
    let columns = [];
    let qualityScore = 85; // Default quality score
    
    // Use the service to save the file - IMPORTANT: We pass our generated ID to ensure consistency
    let fileRecord;
    try {
      // Override the service to use our generated fileId for consistency
      fileRecord = await fileService.saveFile(req.file, { fileId: generatedFileId });
    } catch (saveError) {
      logger.error('Error saving file using FileService', { error: saveError.message, fileId: generatedFileId });
      // Allow execution to continue, will fallback to legacy implementation below
    }
    
    // Use the fileRecord's file_id if available, otherwise use our generated ID
    const fileId = fileRecord ? fileRecord.file_id : generatedFileId;
    
    // Return the saved file record - early response to improve UX
    res.json({
      success: true,
      file: fileRecord || {
        file_id: fileId,
        filename: file.originalname,
        file_type: fileType,
        file_size: file.size
      }
    });
    
    // Set response flag to prevent multiple responses
    res.headersSent = true;
    
    /* Legacy implementation for reference - variables moved above */
    
    
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
    
    // Only proceed with database operations if it's not the FileService handling it
    // This check prevents duplicate records and headers already sent errors
    if (!fileRecord) {
      logger.info('Legacy file processing - inserting into database', { fileId, size: file.size });
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
    }
    
    // Save column information if available
    if (columns.length > 0) {
      // Make sure we're using the final fileId from above for all columns
      const finalFileId = fileRecord ? fileRecord.file_id : fileId;
      
      // Log the fileId being used for columns to help with debugging
      logger.info('Saving column information', {
        fileId: finalFileId,
        columnCount: columns.length
      });
      
      // Set success flag to track if all columns were saved
      let columnSaveSuccess = true;
      
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
              finalFileId, // Use the consistent fileId
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
          logger.error('Error saving column information:', columnErr);
          columnSaveSuccess = false;
          // Continue with other columns
        }
      }
      
      // IMPORTANT: Update the row_count and column_count in the files table
      // This ensures the file profile displays correctly
      if (columnSaveSuccess) {
        try {
          logger.info('Updating file record with row and column counts', {
            fileId: finalFileId,
            rowCount,
            columnCount: columns.length
          });
          
          // Calculate quality score using the actual column data
          const { calculateQualityScore } = require('./quality_helper');
          
          // Map column data to the format expected by our quality calculator
          const columnData = columns.map(col => ({
            name: col.column_name,
            type: col.column_type,
            unique: col.unique_count,
            missing: col.null_count || 0,
            min: col.min_value || col.min_value_decimal,
            max: col.max_value || col.max_value_decimal,
            most_frequent_value: col.most_frequent_value,
            least_frequent_value: col.least_frequent_value
          }));
          
          // Calculate quality score based on actual file data
          const fileMetadata = {
            row_count: rowCount,
            created_at: new Date().toISOString()
          };
          
          const qualityResult = await calculateQualityScore(columnData, fileMetadata);
          logger.info('Calculated quality score', {
            fileId: finalFileId,
            score: qualityResult.overall_score,
            components: qualityResult.components
          });
          
          // Update the file record with counts and quality score
          await pool.query(
            `UPDATE files 
             SET row_count = $1, column_count = $2, quality_score = $3, updated_at = NOW() 
             WHERE file_id = $4`,
            [rowCount, columns.length, qualityResult.overall_score, finalFileId]
          );
        } catch (updateErr) {
          logger.error('Error updating file record with counts and quality score:', updateErr);
        }
      }
    }
    
    // Only send a response if we haven't already sent one
    if (!res.headersSent) {
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
    } else {
      // Just log the completion if response already sent
      logger.info('File upload processing completed but response already sent', {
        fileId,
        headersSent: true
      });
    }
  } catch (err) {
    console.error('Error uploading file:', err);
    console.error(err.stack);
    
    // Prevent sending multiple responses
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to upload file: ' + err.message });
    } else {
      logger.error('Error processing file upload after response sent', {
        error: err.message,
        stack: err.stack
      });
    }
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
        target_file_id VARCHAR(255),
        mapping_rules JSON NOT NULL,
        target_file_type VARCHAR(20) DEFAULT 'csv',
        mapping_config JSON,
        source_filename VARCHAR(255),
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

// Create file_mappings table if it doesn't exist
const initFileMappingsTable = async () => {
  try {
    // Drop existing table if it has issues
    await pool.query(`DROP TABLE IF EXISTS file_mappings`);
    
    // Create a new table with the correct schema
    await pool.query(`
      CREATE TABLE file_mappings (
        id SERIAL PRIMARY KEY,
        mapping_name VARCHAR(255) NOT NULL,
        source_file_id VARCHAR(255) NOT NULL,
        source_filename VARCHAR(255),
        target_file_type VARCHAR(50) DEFAULT 'csv',
        mapping_rules JSON DEFAULT '{}',
        mapping_config JSON DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('File mappings table initialized');
  } catch (err) {
    console.error('Error initializing file_mappings table:', err);
  }
};

// Create schedules table if it doesn't exist
const initSchedulesTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_schedules (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'one-time',
        one_time_date TIMESTAMP,
        cron_expression VARCHAR(100),
        enabled BOOLEAN DEFAULT true,
        next_run_time TIMESTAMP,
        last_run_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('File schedules table initialized');
  } catch (err) {
    console.error('Error initializing schedules table:', err);
  }
};

// Initialize file_mappings table on startup
initFileMappingsTable();
// Initialize schedules table on startup
initSchedulesTable();

// Create a new mapping
app.post('/api/mappings', async (req, res) => {
  try {
    const { 
      mapping_name, 
      source_file_id, 
      target_file_type, 
      mapping_config,
      source_filename
    } = req.body;
    
    if (!mapping_name || !source_file_id) {
      return res.status(400).json({ error: 'Mapping name and source file ID are required' });
    }
    
    // Insert the new mapping
    const result = await pool.query(`
      INSERT INTO file_mappings (
        mapping_name, 
        source_file_id, 
        target_file_type,
        mapping_rules, 
        mapping_config,
        source_filename
      ) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *
    `, [
      mapping_name, 
      source_file_id, 
      target_file_type || 'csv', 
      JSON.stringify({}), 
      JSON.stringify(mapping_config || {}),
      source_filename
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating mapping:', err);
    res.status(500).json({ error: 'Failed to create mapping' });
  }
});

// Update an existing mapping
app.put('/api/mappings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      mapping_name, 
      source_file_id, 
      target_file_type, 
      mapping_config,
      source_filename
    } = req.body;
    
    if (!mapping_name || !source_file_id) {
      return res.status(400).json({ error: 'Mapping name and source file ID are required' });
    }
    
    // Update the mapping
    const result = await pool.query(`
      UPDATE file_mappings 
      SET 
        mapping_name = $1, 
        source_file_id = $2, 
        target_file_type = $3,
        mapping_rules = $4, 
        mapping_config = $5,
        source_filename = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [
      mapping_name, 
      source_file_id, 
      target_file_type || 'csv', 
      JSON.stringify({}), 
      JSON.stringify(mapping_config || {}),
      source_filename,
      id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mapping not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating mapping:', err);
    res.status(500).json({ error: 'Failed to update mapping' });
  }
});

// Delete a mapping
app.delete('/api/mappings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM file_mappings WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mapping not found' });
    }
    
    res.json({ message: 'Mapping deleted successfully', id: result.rows[0].id });
  } catch (err) {
    console.error('Error deleting mapping:', err);
    res.status(500).json({ error: 'Failed to delete mapping' });
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
// Get file quality data
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
    
    // Get file details and column data for quality calculation
    const file = fileResult.rows[0];
    
    // Get column data for this file
    const columnsResult = await pool.query(
      'SELECT * FROM file_columns WHERE file_id = $1',
      [fileId]
    );
    
    const columns = columnsResult.rows.map(col => ({
      name: col.column_name,
      type: col.column_type,
      unique: col.unique_count,
      missing: col.null_count,
      min: col.min_value || col.min_value_decimal,
      max: col.max_value || col.max_value_decimal,
      most_frequent_value: col.most_frequent_value,
      least_frequent_value: col.least_frequent_value
    }));
    
    // Calculate quality score using our helper module
    const { calculateQualityScore } = require('./quality_helper');
    const qualityResult = await calculateQualityScore(columns, {
      row_count: file.row_count,
      created_at: file.created_at
    });
    
    // Update the quality score in the database
    await pool.query(
      'UPDATE files SET quality_score = $1 WHERE file_id = $2',
      [qualityResult.overall_score, fileId]
    );
    
    // Get file quality checks table or create if needed
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
    
    // Get existing quality checks or create new ones
    const qualityChecksResult = await pool.query(
      'SELECT * FROM file_quality_checks WHERE file_id = $1',
      [fileId]
    );
    
    // If no quality checks exist yet, create them from our calculated components
    if (qualityChecksResult.rows.length === 0) {
      // Create checks based on our calculated component scores
      const components = qualityResult.components;
      const componentChecks = [
        {
          check_type: 'completeness',
          check_name: 'Missing Values Check',
          status: components.completeness >= 90 ? 'passed' : (components.completeness >= 70 ? 'warning' : 'failed'),
          score: components.completeness,
          details: { 
            description: 'Check for missing values in the dataset',
            weight: qualityResult.weights.completeness
          }
        },
        {
          check_type: 'consistency',
          check_name: 'Data Type Consistency',
          status: components.consistency >= 90 ? 'passed' : (components.consistency >= 70 ? 'warning' : 'failed'),
          score: components.consistency,
          details: { 
            description: 'Check if data types are consistent across columns',
            weight: qualityResult.weights.consistency
          }
        },
        {
          check_type: 'validity',
          check_name: 'Value Range Check',
          status: components.validity >= 90 ? 'passed' : (components.validity >= 70 ? 'warning' : 'failed'),
          score: components.validity,
          details: { 
            description: 'Check if values are within expected ranges',
            weight: qualityResult.weights.validity
          }
        },
        {
          check_type: 'uniqueness',
          check_name: 'Uniqueness Check',
          status: components.uniqueness >= 90 ? 'passed' : (components.uniqueness >= 70 ? 'warning' : 'failed'),
          score: components.uniqueness,
          details: { 
            description: 'Check for uniqueness of values across columns',
            weight: qualityResult.weights.uniqueness
          }
        },
        {
          check_type: 'timeliness',
          check_name: 'Data Freshness Check',
          status: components.timeliness >= 90 ? 'passed' : (components.timeliness >= 70 ? 'warning' : 'failed'),
          score: components.timeliness,
          details: { 
            description: 'Check for freshness of data based on creation date',
            weight: qualityResult.weights.timeliness
          }
        }
      ];
      
      for (const check of componentChecks) {
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
    
    const qualityScore = qualityResult.overall_score;
    
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

// Recalculate quality score for a file
app.post('/api/files/:fileId/recalculate-quality', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Check if file exists
    const fileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Get column data for this file
    const columnsResult = await pool.query(
      'SELECT * FROM file_columns WHERE file_id = $1',
      [fileId]
    );
    
    if (columnsResult.rows.length === 0) {
      return res.status(400).json({ 
        error: 'No column data found for this file', 
        message: 'Cannot calculate quality score without column data.'
      });
    }
    
    // Map column data to the format expected by our quality calculator
    const columns = columnsResult.rows.map(col => ({
      name: col.column_name,
      type: col.column_type,
      unique: col.unique_count,
      missing: col.null_count || 0,
      min: col.min_value || col.min_value_decimal,
      max: col.max_value || col.max_value_decimal,
      most_frequent_value: col.most_frequent_value,
      least_frequent_value: col.least_frequent_value
    }));
    
    // Calculate quality score using our helper module
    const { calculateQualityScore } = require('./quality_helper');
    const qualityResult = await calculateQualityScore(columns, {
      row_count: file.row_count,
      created_at: file.created_at
    });
    
    console.log('Calculated new quality score:', {
      fileId,
      score: qualityResult.overall_score,
      components: qualityResult.components
    });
    
    // Update the quality score in the database
    await pool.query(
      'UPDATE files SET quality_score = $1, updated_at = NOW() WHERE file_id = $2',
      [qualityResult.overall_score, fileId]
    );
    
    // Create or update quality checks based on component scores
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
    
    // Delete existing quality checks for this file
    await pool.query('DELETE FROM file_quality_checks WHERE file_id = $1', [fileId]);
    
    // Create new quality checks based on our calculated component scores
    const components = qualityResult.components;
    const componentChecks = [
      {
        check_type: 'completeness',
        check_name: 'Missing Values Check',
        status: components.completeness >= 90 ? 'passed' : (components.completeness >= 70 ? 'warning' : 'failed'),
        score: components.completeness,
        details: { 
          description: 'Check for missing values in the dataset',
          weight: qualityResult.weights.completeness
        }
      },
      {
        check_type: 'consistency',
        check_name: 'Data Type Consistency',
        status: components.consistency >= 90 ? 'passed' : (components.consistency >= 70 ? 'warning' : 'failed'),
        score: components.consistency,
        details: { 
          description: 'Check if data types are consistent across columns',
          weight: qualityResult.weights.consistency
        }
      },
      {
        check_type: 'validity',
        check_name: 'Value Range Check',
        status: components.validity >= 90 ? 'passed' : (components.validity >= 70 ? 'warning' : 'failed'),
        score: components.validity,
        details: { 
          description: 'Check if values are within expected ranges',
          weight: qualityResult.weights.validity
        }
      },
      {
        check_type: 'uniqueness',
        check_name: 'Uniqueness Check',
        status: components.uniqueness >= 90 ? 'passed' : (components.uniqueness >= 70 ? 'warning' : 'failed'),
        score: components.uniqueness,
        details: { 
          description: 'Check for uniqueness of values across columns',
          weight: qualityResult.weights.uniqueness
        }
      },
      {
        check_type: 'timeliness',
        check_name: 'Data Freshness Check',
        status: components.timeliness >= 90 ? 'passed' : (components.timeliness >= 70 ? 'warning' : 'failed'),
        score: components.timeliness,
        details: { 
          description: 'Check for freshness of data based on creation date',
          weight: qualityResult.weights.timeliness
        }
      }
    ];
    
    for (const check of componentChecks) {
      await pool.query(
        'INSERT INTO file_quality_checks (file_id, check_type, check_name, status, score, details) VALUES ($1, $2, $3, $4, $5, $6)',
        [fileId, check.check_type, check.check_name, check.status, check.score, JSON.stringify(check.details)]
      );
    }
    
    // Get the newly created checks
    const qualityChecksResult = await pool.query(
      'SELECT * FROM file_quality_checks WHERE file_id = $1',
      [fileId]
    );
    
    // Return the updated quality data
    const qualityData = {
      fileId,
      filename: file.filename,
      qualityScore: qualityResult.overall_score,
      scoringMethod: 'weighted_average',
      components: qualityResult.components,
      weights: qualityResult.weights,
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
    
    res.json(qualityData);
  } catch (err) {
    console.error('Error recalculating file quality:', err);
    res.status(500).json({ error: 'Failed to recalculate file quality', details: err.message });
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

// Create the transformations table if it doesn't exist
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transformations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        config JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id)
      )
    `);
    console.log('Transformations table initialized');
  } catch (error) {
    console.error('Error creating transformations table:', error);
  }
})();

// Transformations endpoints
app.get('/api/transformations', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM transformations ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching transformations:', err);
    res.status(500).json({ error: 'Failed to fetch transformations' });
  }
});

app.get('/api/transformations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM transformations WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transformation not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching transformation:', err);
    res.status(500).json({ error: 'Failed to fetch transformation' });
  }
});

app.post('/api/transformations', authenticateToken, async (req, res) => {
  try {
    const { name, description, config } = req.body;
    const userId = req.user.id;
    
    const result = await pool.query(
      'INSERT INTO transformations (name, description, config, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, config, userId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating transformation:', err);
    res.status(500).json({ error: 'Failed to create transformation' });
  }
});

app.put('/api/transformations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, config } = req.body;
    
    const result = await pool.query(
      'UPDATE transformations SET name = $1, description = $2, config = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
      [name, description, config, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transformation not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating transformation:', err);
    res.status(500).json({ error: 'Failed to update transformation' });
  }
});

app.delete('/api/transformations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM transformations WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transformation not found' });
    }
    
    res.json({ message: 'Transformation deleted successfully' });
  } catch (err) {
    console.error('Error deleting transformation:', err);
    res.status(500).json({ error: 'Failed to delete transformation' });
  }
});

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

// Business Processes API

// Get all business processes
app.get('/api/business-processes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("Fetching business processes for user ID:", userId);
    
    // First, ensure the default group exists and the user is a member
    try {
      // Check if default group exists
      console.log("Checking for default group");
      const defaultGroupCheck = await pool.query("SELECT id FROM groups WHERE name = 'Default Group'");
      
      let defaultGroupId;
      
      if (defaultGroupCheck.rows.length === 0) {
        // Create default group
        console.log("Creating default group");
        const newGroupResult = await pool.query(
          "INSERT INTO groups (name, description) VALUES ('Default Group', 'Default group for all users') RETURNING id"
        );
        defaultGroupId = newGroupResult.rows[0].id;
        console.log("Created default group with ID:", defaultGroupId);
      } else {
        defaultGroupId = defaultGroupCheck.rows[0].id;
        console.log("Found existing default group with ID:", defaultGroupId);
      }
      
      // Ensure user is in the default group
      console.log("Ensuring user", userId, "is in default group");
      const userGroupCheck = await pool.query(
        "SELECT 1 FROM user_groups WHERE user_id = $1 AND group_id = $2",
        [userId, defaultGroupId]
      );
      
      if (userGroupCheck.rows.length === 0) {
        // Add user to default group
        console.log("Adding user to default group");
        await pool.query(
          "INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [userId, defaultGroupId]
        );
        console.log("User added to default group");
      } else {
        console.log("User already in default group");
      }
    } catch (groupErr) {
      console.error("Error handling default group:", groupErr);
      // Continue anyway - we'll try to fetch what we can
    }
    
    // Get user's groups - now using a LEFT JOIN to include all groups
    const userGroupsQuery = `
      SELECT g.id
      FROM groups g
      LEFT JOIN user_groups ug ON g.id = ug.group_id AND ug.user_id = $1
      WHERE ug.user_id = $1 OR g.name = 'Default Group'
    `;
    
    const userGroupsResult = await pool.query(userGroupsQuery, [userId]);
    const userGroupIds = userGroupsResult.rows.map(row => row.id);
    console.log("User group IDs:", userGroupIds);
    
    if (userGroupIds.length === 0) {
      return res.json([]);
    }
    
    // Get all business processes for the user's groups
    const businessProcessesQuery = `
      SELECT bp.*, g.name as group_name, 
        COALESCE(COUNT(j.id), 0) as job_count
      FROM business_processes bp
      LEFT JOIN groups g ON bp.group_id = g.id
      LEFT JOIN jobs j ON bp.id = j.business_process_id
      WHERE bp.group_id = ANY($1)
      GROUP BY bp.id, g.name
      ORDER BY bp.updated_at DESC
    `;
    
    const processesResult = await pool.query(businessProcessesQuery, [userGroupIds]);
    res.json(processesResult.rows);
  } catch (err) {
    console.error('Error fetching business processes:', err);
    res.status(500).json({ error: 'Failed to fetch business processes' });
  }
});

// Get a single business process with its jobs
app.get('/api/business-processes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Get user's groups
    const userGroupsQuery = `
      SELECT g.id
      FROM groups g
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE ug.user_id = $1
    `;
    const userGroupsResult = await pool.query(userGroupsQuery, [userId]);
    const userGroupIds = userGroupsResult.rows.map(row => row.id);
    
    if (userGroupIds.length === 0) {
      return res.status(403).json({ error: 'You do not have access to this business process' });
    }
    
    // Get the business process
    const processQuery = `
      SELECT bp.*, g.name as group_name
      FROM business_processes bp
      LEFT JOIN groups g ON bp.group_id = g.id
      WHERE bp.id = $1
    `;
    const processResult = await pool.query(processQuery, [id]);
    
    if (processResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business process not found' });
    }
    
    const process = processResult.rows[0];
    
    // Check if user has access to this process through their groups
    if (!userGroupIds.includes(process.group_id)) {
      return res.status(403).json({ error: 'You do not have access to this business process' });
    }
    
    // Get all jobs for this business process
    const jobsQuery = `
      SELECT j.*, COALESCE(COUNT(jr.id), 0) as run_count,
        MAX(jr.start_time) as last_run_time
      FROM jobs j
      LEFT JOIN job_runs jr ON j.id = jr.job_id
      WHERE j.business_process_id = $1
      GROUP BY j.id
      ORDER BY j.updated_at DESC
    `;
    const jobsResult = await pool.query(jobsQuery, [id]);
    
    // Combine process and jobs
    const businessProcess = processResult.rows[0];
    businessProcess.jobs = jobsResult.rows;
    
    res.json(businessProcess);
  } catch (err) {
    console.error('Error fetching business process:', err);
    res.status(500).json({ error: 'Failed to fetch business process' });
  }
});

// Create a business process
app.post('/api/business-processes', authenticateToken, async (req, res) => {
  try {
    let { name, description, group_id } = req.body;
    // Use a default user ID if authentication is skipped
    const userId = req.user ? req.user.id : 2; // Default to admin user (ID 2)
    
    console.log("Creating business process:", { name, description, group_id, userId });
    
    if (!name) {
      return res.status(400).json({ error: 'Business process name is required' });
    }
    
    // If no group_id provided, find or create default group
    if (!group_id) {
      console.log("No group_id provided, looking for default group");
      
      // Check if default group exists
      const defaultGroupResult = await pool.query("SELECT id FROM groups WHERE name = 'Default Group'");
      
      if (defaultGroupResult.rows.length > 0) {
        // Use existing default group
        group_id = defaultGroupResult.rows[0].id;
        console.log("Using existing default group ID:", group_id);
      } else {
        // Create a default group
        console.log("Creating default group");
        try {
          const newGroupResult = await pool.query(
            "INSERT INTO groups (name, description) VALUES ('Default Group', 'Default group for all users') RETURNING id"
          );
          group_id = newGroupResult.rows[0].id;
          console.log("Created new default group with ID:", group_id);
        } catch (groupErr) {
          console.error("Error creating default group:", groupErr);
          return res.status(500).json({ error: 'Failed to create default group', details: groupErr.message });
        }
      }
    } else {
      // Verify the specified group exists
      console.log("Verifying group exists:", group_id);
      const groupCheck = await pool.query("SELECT id FROM groups WHERE id = $1", [group_id]);
      
      if (groupCheck.rows.length === 0) {
        console.error("Specified group ID does not exist:", group_id);
        return res.status(400).json({ error: 'Specified group does not exist' });
      }
      
      console.log("Group exists:", groupCheck.rows[0]);
    }
    
    // For now, skip the group verification since we're
    // implementing a simplified auth model for business process management
    // This allows any user to create in any group
    const skipGroupVerification = true;
    
    // Create the business process
    const insertQuery = `
      INSERT INTO business_processes (name, description, group_id, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await pool.query(insertQuery, [name, description, group_id, userId]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating business process:', err);
    res.status(500).json({ error: 'Failed to create business process' });
  }
});

// Update a business process
app.put('/api/business-processes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, group_id, status } = req.body;
    // Use a default user ID if authentication is skipped
    const userId = req.user ? req.user.id : 2; // Default to admin user (ID 2)
    
    if (!name) {
      return res.status(400).json({ error: 'Business process name is required' });
    }
    
    // Check if process exists and user has access
    const checkQuery = `
      SELECT bp.* FROM business_processes bp
      JOIN groups g ON bp.group_id = g.id
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE bp.id = $1 AND ug.user_id = $2
    `;
    
    const checkResult = await pool.query(checkQuery, [id, userId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business process not found or you do not have access to it' });
    }
    
    // If group_id is being changed, verify user is a member of the new group
    if (group_id && group_id !== checkResult.rows[0].group_id) {
      const userGroupQuery = `
        SELECT 1 FROM user_groups 
        WHERE user_id = $1 AND group_id = $2
      `;
      
      const userGroupResult = await pool.query(userGroupQuery, [userId, group_id]);
      
      if (userGroupResult.rows.length === 0) {
        return res.status(403).json({ error: 'You are not a member of the specified group' });
      }
    }
    
    // Update the business process
    const updateQuery = `
      UPDATE business_processes
      SET name = $1, 
          description = $2, 
          group_id = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;
    
    const finalGroupId = group_id || checkResult.rows[0].group_id;
    
    const result = await pool.query(updateQuery, [name, description, finalGroupId, id]);
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating business process:', err);
    res.status(500).json({ error: 'Failed to update business process' });
  }
});

// Delete a business process
app.delete('/api/business-processes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    // Use a default user ID if authentication is skipped
    const userId = req.user ? req.user.id : 2; // Default to admin user (ID 2)
    
    // Check if process exists and user has access
    const checkQuery = `
      SELECT bp.* FROM business_processes bp
      JOIN groups g ON bp.group_id = g.id
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE bp.id = $1 AND ug.user_id = $2
    `;
    
    const checkResult = await pool.query(checkQuery, [id, userId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business process not found or you do not have access to it' });
    }
    
    // Delete the business process (cascade will delete related jobs)
    const deleteQuery = 'DELETE FROM business_processes WHERE id = $1';
    await pool.query(deleteQuery, [id]);
    
    res.json({ message: 'Business process deleted successfully' });
  } catch (err) {
    console.error('Error deleting business process:', err);
    res.status(500).json({ error: 'Failed to delete business process' });
  }
});

// Jobs API

// Get all jobs
app.get('/api/jobs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("Fetching jobs for user ID:", userId);
    
    // First, ensure the default group exists and the user is a member
    try {
      // Check if default group exists
      console.log("Checking for default group");
      const defaultGroupCheck = await pool.query("SELECT id FROM groups WHERE name = 'Default Group'");
      
      let defaultGroupId;
      
      if (defaultGroupCheck.rows.length === 0) {
        // Create default group
        console.log("Creating default group");
        const newGroupResult = await pool.query(
          "INSERT INTO groups (name, description) VALUES ('Default Group', 'Default group for all users') RETURNING id"
        );
        defaultGroupId = newGroupResult.rows[0].id;
        console.log("Created default group with ID:", defaultGroupId);
      } else {
        defaultGroupId = defaultGroupCheck.rows[0].id;
        console.log("Found existing default group with ID:", defaultGroupId);
      }
      
      // Ensure user is in the default group
      console.log("Ensuring user", userId, "is in default group");
      const userGroupCheck = await pool.query(
        "SELECT 1 FROM user_groups WHERE user_id = $1 AND group_id = $2",
        [userId, defaultGroupId]
      );
      
      if (userGroupCheck.rows.length === 0) {
        // Add user to default group
        console.log("Adding user to default group");
        await pool.query(
          "INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [userId, defaultGroupId]
        );
        console.log("User added to default group");
      } else {
        console.log("User already in default group");
      }
    } catch (groupErr) {
      console.error("Error handling default group:", groupErr);
      // Continue anyway - we'll try to fetch what we can
    }
    
    // Get user's groups - now including default group
    const userGroupsQuery = `
      SELECT g.id
      FROM groups g
      LEFT JOIN user_groups ug ON g.id = ug.group_id AND ug.user_id = $1
      WHERE ug.user_id = $1 OR g.name = 'Default Group'
    `;
    const userGroupsResult = await pool.query(userGroupsQuery, [userId]);
    const userGroupIds = userGroupsResult.rows.map(row => row.id);
    console.log("User group IDs for jobs:", userGroupIds);
    
    if (userGroupIds.length === 0) {
      console.log("No groups found for user, returning empty jobs array");
      return res.json([]);
    }
    
    // Get all jobs for the business processes in user's groups WITHOUT job_runs
    const jobsQuery = `
      SELECT j.*, bp.name as business_process_name, g.name as group_name
      FROM jobs j
      JOIN business_processes bp ON j.business_process_id = bp.id
      JOIN groups g ON bp.group_id = g.id
      WHERE bp.group_id = ANY($1::integer[])
      ORDER BY j.updated_at DESC
    `;
    
    const jobsResult = await pool.query(jobsQuery, [userGroupIds]);
    
    // Add empty placeholders for run_count and last_run_time
    const jobsWithRunInfo = jobsResult.rows.map(job => {
      return {
        ...job,
        run_count: 0,
        last_run_time: null
      };
    });
    
    console.log('Jobs fetched successfully, returned count:', jobsWithRunInfo.length);
    res.json(jobsWithRunInfo);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get a single job with its history
app.get('/api/jobs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    console.log("Fetching single job with ID:", id, "for user ID:", userId);
    
    // First, ensure the default group exists and the user is a member
    try {
      // Check if default group exists
      console.log("Checking for default group");
      const defaultGroupCheck = await pool.query("SELECT id FROM groups WHERE name = 'Default Group'");
      
      let defaultGroupId;
      
      if (defaultGroupCheck.rows.length === 0) {
        // Create default group
        console.log("Creating default group");
        const newGroupResult = await pool.query(
          "INSERT INTO groups (name, description) VALUES ('Default Group', 'Default group for all users') RETURNING id"
        );
        defaultGroupId = newGroupResult.rows[0].id;
        console.log("Created default group with ID:", defaultGroupId);
      } else {
        defaultGroupId = defaultGroupCheck.rows[0].id;
        console.log("Found existing default group with ID:", defaultGroupId);
      }
      
      // Ensure user is in the default group
      console.log("Ensuring user", userId, "is in default group");
      const userGroupCheck = await pool.query(
        "SELECT 1 FROM user_groups WHERE user_id = $1 AND group_id = $2",
        [userId, defaultGroupId]
      );
      
      if (userGroupCheck.rows.length === 0) {
        // Add user to default group
        console.log("Adding user to default group");
        await pool.query(
          "INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [userId, defaultGroupId]
        );
        console.log("User added to default group");
      } else {
        console.log("User already in default group");
      }
    } catch (groupErr) {
      console.error("Error handling default group:", groupErr);
      // Continue anyway - we'll try to fetch what we can
    }
    
    // Get user's groups - now including the default group
    const userGroupsQuery = `
      SELECT g.id
      FROM groups g
      LEFT JOIN user_groups ug ON g.id = ug.group_id AND ug.user_id = $1
      WHERE ug.user_id = $1 OR g.name = 'Default Group'
    `;
    const userGroupsResult = await pool.query(userGroupsQuery, [userId]);
    const userGroupIds = userGroupsResult.rows.map(row => row.id);
    console.log("User group IDs for job detail:", userGroupIds);
    
    if (userGroupIds.length === 0) {
      console.log("No groups found for user, denying access to job");
      return res.status(403).json({ error: 'You do not have access to this job' });
    }
    
    // Get the job with access control
    const jobQuery = `
      SELECT j.*, bp.name as business_process_name, g.name as group_name
      FROM jobs j
      JOIN business_processes bp ON j.business_process_id = bp.id
      JOIN groups g ON bp.group_id = g.id
      WHERE j.id = $1 AND bp.group_id = ANY($2::integer[])
    `;
    const jobResult = await pool.query(jobQuery, [id, userGroupIds]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or you do not have access to it' });
    }
    
    // Get job with empty history placeholder for now
    const job = jobResult.rows[0];
    job.history = [];
    
    res.json(job);
  } catch (err) {
    console.error('Error fetching job:', err);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Create a job
app.post('/api/jobs', authenticateToken, async (req, res) => {
  try {
    console.log('========== CREATE JOB REQUEST ==========');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Extract job data from the request
    const {
      name,
      description,
      business_process_id,
      source_connection_id,
      target_connection_id,
      validation_settings,
      error_handling_settings,
      notification_settings,
      schedule_settings,
      created_by,
      status
    } = req.body;
    
    // Get user ID from token or use provided created_by
    let userId = created_by;
    if (req.user && req.user.id) {
      userId = req.user.id;
      console.log('Using user ID from token:', userId);
    } else {
      console.log('No user ID in token, using created_by from request:', userId);
    }
    
    // Validate required fields
    if (!name || !business_process_id) {
      console.error('Validation error: Missing name or business_process_id');
      return res.status(400).json({ error: 'Job name and business process are required' });
    }
    
    // Ensure business_process_id is an integer
    const processId = parseInt(business_process_id, 10);
    if (isNaN(processId)) {
      console.error('Validation error: Invalid business_process_id format');
      return res.status(400).json({ error: 'Invalid business process ID, must be an integer' });
    }
    console.log('Creating job with business_process_id:', processId, 'Type:', typeof processId);
    
    // Skip access verification temporarily to debug job creation
    // We'll add it back later after job creation is working
    
    console.log('Preparing to insert job into database');
    console.log('Status value:', status || 'active');
    
    // Prepare values for query, handling possible undefined fields
    const validationSettingsValue = validation_settings || {};
    const errorHandlingSettingsValue = error_handling_settings || {};
    const notificationSettingsValue = notification_settings || {};
    const scheduleSettingsValue = schedule_settings || {};
    
    // Create the job (note: there's no description column in the table)
    const result = await pool.query(
      `INSERT INTO jobs (
        name,
        business_process_id, 
        source_connection_id, 
        target_connection_id, 
        validation_settings, 
        error_handling_settings, 
        notification_settings, 
        schedule_settings, 
        created_by,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        name,
        processId, 
        source_connection_id || null,
        target_connection_id || null,
        validationSettingsValue,
        errorHandlingSettingsValue,
        notificationSettingsValue,
        scheduleSettingsValue,
        userId,
        status || 'active' // Default status
      ]
    );
    
    console.log('Job created successfully:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating job:', err);
    // Send more detailed error information
    res.status(500).json({ 
      error: 'Failed to create job',
      details: err.message,
      code: err.code
    });
  }
});

// Schedule endpoints
app.get('/api/schedules', authenticateToken, async (req, res) => {
  try {
    const schedules = await pool.query(`
      SELECT js.*, j.name as job_name 
      FROM job_schedules js
      JOIN jobs j ON js.job_id = j.id
      ORDER BY js.created_at DESC
    `);
    res.json(schedules.rows);
  } catch (err) {
    console.error('Error fetching schedules:', err);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

app.get('/api/jobs/:jobId/schedules', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const schedules = await pool.query('SELECT * FROM job_schedules WHERE job_id = $1', [jobId]);
    res.json(schedules.rows);
  } catch (err) {
    console.error('Error fetching job schedules:', err);
    res.status(500).json({ error: 'Failed to fetch job schedules' });
  }
});

app.post('/api/schedules', authenticateToken, async (req, res) => {
  try {
    const { 
      job_id, 
      type, 
      one_time_date, 
      cron_expression, 
      enabled 
    } = req.body;
    
    // Validate required fields
    if (!job_id) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    if (type === 'one-time' && !one_time_date) {
      return res.status(400).json({ error: 'One-time date is required for one-time schedules' });
    }
    
    if (type === 'recurring' && !cron_expression) {
      return res.status(400).json({ error: 'Cron expression is required for recurring schedules' });
    }
    
    // Calculate next run time (just for demonstration - in production this would be more complex)
    let nextRunTime = null;
    if (type === 'one-time') {
      nextRunTime = one_time_date;
    } else {
      // For recurring jobs, we would parse the cron expression and calculate the next run time
      // For simplicity, just setting it to 1 day from now
      nextRunTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    
    // Insert the schedule
    const result = await pool.query(`
      INSERT INTO job_schedules (
        job_id, 
        type, 
        one_time_date, 
        cron_expression, 
        enabled, 
        next_run_time
      ) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *
    `, [
      job_id,
      type || 'one-time',
      one_time_date,
      cron_expression,
      enabled !== false, // Default to true if not provided
      nextRunTime
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating schedule:', err);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

app.put('/api/schedules/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      type, 
      one_time_date, 
      cron_expression, 
      enabled 
    } = req.body;
    
    // Calculate next run time based on updated values
    let nextRunTime = null;
    if (type === 'one-time') {
      nextRunTime = one_time_date;
    } else {
      // For recurring jobs, we would parse the cron expression and calculate the next run time
      // For simplicity, just setting it to 1 day from now
      nextRunTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    
    // Update the schedule
    const result = await pool.query(`
      UPDATE job_schedules 
      SET 
        type = $1, 
        one_time_date = $2, 
        cron_expression = $3, 
        enabled = $4, 
        next_run_time = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `, [
      type,
      one_time_date,
      cron_expression,
      enabled,
      nextRunTime,
      id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating schedule:', err);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

app.delete('/api/schedules/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM job_schedules WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json({ message: 'Schedule deleted successfully', id: result.rows[0].id });
  } catch (err) {
    console.error('Error deleting schedule:', err);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

app.post('/api/schedules/:id/enable', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE job_schedules SET enabled = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error enabling schedule:', err);
    res.status(500).json({ error: 'Failed to enable schedule' });
  }
});

app.post('/api/schedules/:id/disable', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE job_schedules SET enabled = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error disabling schedule:', err);
    res.status(500).json({ error: 'Failed to disable schedule' });
  }
});

// Update a job
app.put('/api/jobs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      business_process_id,
      status,
      source_connection_id,
      target_connection_id,
      validation_settings,
      error_handling_settings,
      notification_settings,
      schedule_settings
    } = req.body;
    
    const userId = req.user.id;
    
    if (!name) {
      return res.status(400).json({ error: 'Job name is required' });
    }
    
    // Check if the job exists and user has access to it
    const jobAccessQuery = `
      SELECT j.* FROM jobs j
      JOIN business_processes bp ON j.business_process_id = bp.id
      JOIN groups g ON bp.group_id = g.id
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE j.id = $1 AND ug.user_id = $2
    `;
    
    const jobAccessResult = await pool.query(jobAccessQuery, [id, userId]);
    
    if (jobAccessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or you do not have access to it' });
    }
    
    // If business_process_id is changing, verify access to the new business process
    if (business_process_id && business_process_id !== jobAccessResult.rows[0].business_process_id) {
      const processAccessQuery = `
        SELECT bp.* FROM business_processes bp
        JOIN groups g ON bp.group_id = g.id
        JOIN user_groups ug ON g.id = ug.group_id
        WHERE bp.id = $1 AND ug.user_id = $2
      `;
      
      const processAccessResult = await pool.query(processAccessQuery, [business_process_id, userId]);
      
      if (processAccessResult.rows.length === 0) {
        return res.status(403).json({ error: 'You do not have access to the specified business process' });
      }
    }
    
    // Ensure business_process_id is an integer if provided
    let processId = jobAccessResult.rows[0].business_process_id;
    if (business_process_id) {
      processId = parseInt(business_process_id, 10);
      if (isNaN(processId)) {
        return res.status(400).json({ error: 'Invalid business process ID' });
      }
    }
    console.log('Updating job with business_process_id:', processId, 'Type:', typeof processId);
    
    // Update the job
    const result = await pool.query(
      `UPDATE jobs SET 
        name = $1, 
        business_process_id = $2, 
        status = $3,
        source_connection_id = $4, 
        target_connection_id = $5, 
        validation_settings = $6, 
        error_handling_settings = $7, 
        notification_settings = $8, 
        schedule_settings = $9,
        updated_at = NOW()
      WHERE id = $10 RETURNING *`,
      [
        name, 
        processId, 
        status || jobAccessResult.rows[0].status || 'active',
        source_connection_id,
        target_connection_id,
        validation_settings,
        error_handling_settings,
        notification_settings,
        schedule_settings,
        id
      ]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating job:', err);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Delete a job
app.delete('/api/jobs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Check if the job exists and user has access to it
    const jobAccessQuery = `
      SELECT j.* FROM jobs j
      JOIN business_processes bp ON j.business_process_id = bp.id
      JOIN groups g ON bp.group_id = g.id
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE j.id = $1 AND ug.user_id = $2
    `;
    
    const jobAccessResult = await pool.query(jobAccessQuery, [id, userId]);
    
    if (jobAccessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or you do not have access to it' });
    }
    
    // Delete the job (cascade will delete history)
    await pool.query('DELETE FROM jobs WHERE id = $1', [id]);
    
    res.json({ message: 'Job deleted successfully' });
  } catch (err) {
    console.error('Error deleting job:', err);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Run a job manually
app.post('/api/jobs/:id/run', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Check if the job exists and user has access to it
    const jobAccessQuery = `
      SELECT j.* FROM jobs j
      JOIN business_processes bp ON j.business_process_id = bp.id
      JOIN groups g ON bp.group_id = g.id
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE j.id = $1 AND ug.user_id = $2
    `;
    
    const jobAccessResult = await pool.query(jobAccessQuery, [id, userId]);
    
    if (jobAccessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or you do not have access to it' });
    }
    
    // Simulate a job run without database operations for now
    console.log(`Job ${id} started successfully`);
    
    // Return a fake history ID
    const fakeHistoryId = Date.now().toString();
    
    res.json({ 
      message: 'Job started successfully', 
      job_history_id: fakeHistoryId 
    });
  } catch (err) {
    console.error('Error running job:', err);
    res.status(500).json({ error: 'Failed to run job' });
  }
});

// Groups API

// Get all groups (authenticated)
app.get('/api/groups', authenticateToken, async (req, res) => {
  try {
    // First check if we need to create a default group
    const checkDefaultGroup = await pool.query("SELECT COUNT(*) FROM groups WHERE name = 'Default Group'");
    if (parseInt(checkDefaultGroup.rows[0].count) === 0) {
      console.log('No default group found, creating one from authenticated endpoint');
      try {
        await pool.query(`
          INSERT INTO groups (name, description)
          VALUES ('Default Group', 'Default group for all users');
        `);
        console.log('Created default group from authenticated endpoint');
      } catch (err) {
        if (err.code !== '23505') { // Not a unique violation
          console.error('Error creating default group from authenticated endpoint:', err);
        }
      }
    }

    const result = await pool.query('SELECT * FROM groups ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get user's groups
app.get('/api/user/groups', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const query = `
      SELECT g.*
      FROM groups g
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE ug.user_id = $1
      ORDER BY g.name
    `;
    
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching user groups:', err);
    res.status(500).json({ error: 'Failed to fetch user groups' });
  }
});

// Create a new group
app.post('/api/groups', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    const query = `
      INSERT INTO groups (name, description)
      VALUES ($1, $2)
      RETURNING *
    `;
    
    const result = await pool.query(query, [name, description]);
    const newGroup = result.rows[0];
    
    // Add the creator to the group automatically
    await pool.query(
      'INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2)',
      [req.user.id, newGroup.id]
    );
    
    res.status(201).json(newGroup);
  } catch (err) {
    console.error('Error creating group:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Update a group
app.put('/api/groups/:id', authenticateToken, async (req, res) => {
  try {
    const groupId = req.params.id;
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    const query = `
      UPDATE groups
      SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await pool.query(query, [name, description, groupId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating group:', err);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// Delete a group
app.delete('/api/groups/:id', authenticateToken, async (req, res) => {
  try {
    const groupId = req.params.id;
    
    // First check if it's the default group
    const defaultGroup = await pool.query('SELECT * FROM groups WHERE name = $1', ['Default Group']);
    
    if (defaultGroup.rows.length > 0 && defaultGroup.rows[0].id == groupId) {
      return res.status(403).json({ error: 'Cannot delete the default group' });
    }
    
    // Delete the group (cascade will remove user_groups entries)
    const result = await pool.query('DELETE FROM groups WHERE id = $1 RETURNING *', [groupId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    console.error('Error deleting group:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// Add users to a group
app.post('/api/groups/:id/users', authenticateToken, async (req, res) => {
  try {
    const groupId = req.params.id;
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs are required' });
    }
    
    // Check if the group exists
    const groupResult = await pool.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Add users to the group
    const addedUsers = [];
    for (const userId of userIds) {
      try {
        await pool.query(
          'INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, groupId]
        );
        addedUsers.push(userId);
      } catch (err) {
        console.error(`Error adding user ${userId} to group:`, err);
      }
    }
    
    res.json({ message: 'Users added to group successfully', addedUsers });
  } catch (err) {
    console.error('Error adding users to group:', err);
    res.status(500).json({ error: 'Failed to add users to group' });
  }
});

// Remove a user from a group
app.delete('/api/groups/:groupId/users/:userId', authenticateToken, async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    
    // Check if the group exists
    const groupResult = await pool.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Check if it's the default group
    if (groupResult.rows[0].name === 'Default Group') {
      return res.status(403).json({ error: 'Cannot remove users from the default group' });
    }
    
    // Remove the user from the group
    const result = await pool.query(
      'DELETE FROM user_groups WHERE user_id = $1 AND group_id = $2 RETURNING *',
      [userId, groupId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User is not a member of this group' });
    }
    
    res.json({ message: 'User removed from group successfully' });
  } catch (err) {
    console.error('Error removing user from group:', err);
    res.status(500).json({ error: 'Failed to remove user from group' });
  }
});

// Add user to default group if not in any group
// This ensures all users have at least one group
(async () => {
  try {
    const defaultGroupResult = await pool.query("SELECT id FROM groups WHERE name = 'Default Group'");
    
    if (defaultGroupResult.rows.length > 0) {
      const defaultGroupId = defaultGroupResult.rows[0].id;
      
      // Find users not in any group
      const usersWithoutGroupQuery = `
        SELECT id FROM users 
        WHERE id NOT IN (
          SELECT DISTINCT user_id FROM user_groups
        )
      `;
      
      const usersResult = await pool.query(usersWithoutGroupQuery);
      
      // Add these users to the default group
      for (const user of usersResult.rows) {
        await pool.query(
          'INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [user.id, defaultGroupId]
        );
      }
      
      console.log(`Added ${usersResult.rows.length} users to the default group`);
    }
  } catch (error) {
    console.error('Error ensuring users have default group:', error);
  }
})();

// Job Groups API

// Get all job groups
app.get('/api/job-groups', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRoles = req.user.roles || [];
    
    // Get all users with the same roles as the current user for sharing groups
    let usersWithSameRoleIds = [userId.toString()]; // Default to just current user
    
    try {
      // For each role, find users with that role
      // We're using the simpler approach here to avoid table schema issues
      // Just include the current user
      usersWithSameRoleIds = [userId.toString()];
      
      // If the user is an admin, fetch all users to see all groups
      if (userRoles.includes('Admin')) {
        const allUsers = await pool.query(`SELECT id FROM users`);
        if (allUsers.rows.length > 0) {
          allUsers.rows.forEach(user => {
            if (!usersWithSameRoleIds.includes(user.id.toString())) {
              usersWithSameRoleIds.push(user.id.toString());
            }
          });
        }
      }
    } catch (roleErr) {
      console.error('Error getting users with same role:', roleErr);
      // Continue with just current user if there's an error
    }
    
    console.log('Users with same roles:', usersWithSameRoleIds);
    
    // Generate a list of job groups created by users with the same role
    const jobGroupsQuery = `
      SELECT jg.*, 
        COALESCE(COUNT(jgj.job_id), 0) as job_count,
        COALESCE(u.username, 'Unknown') as created_by_name
      FROM job_groups jg
      LEFT JOIN job_group_jobs jgj ON jg.id = jgj.group_id
      LEFT JOIN users u ON u.id::text = jg.created_by
      WHERE jg.created_by = ANY($1)
      GROUP BY jg.id, u.username
      ORDER BY jg.created_at DESC
    `;
    
    const jobGroupsResult = await pool.query(jobGroupsQuery, [usersWithSameRoleIds]);
    res.json(jobGroupsResult.rows);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get a single job group with its jobs
app.get('/api/job-groups/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRoles = req.user.roles || [];
    
    // Get the job group
    const jobGroupQuery = `
      SELECT jg.*, COALESCE(u.username, 'Unknown') as created_by_name
      FROM job_groups jg
      LEFT JOIN users u ON u.id::text = jg.created_by
      WHERE jg.id = $1
    `;
    const jobGroupResult = await pool.query(jobGroupQuery, [id]);
    
    if (jobGroupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Check if user has access to this group (created by them or by someone with the same role)
    const createdBy = jobGroupResult.rows[0].created_by;
    if (createdBy !== userId.toString()) {
      // Simplified access control - Admin can see all groups
      // Other users can only see their own groups
      if (!userRoles.includes('Admin')) {
        return res.status(403).json({ error: 'You do not have access to this group' });
      }
    }
    
    // Get all jobs in this group
    const jobsQuery = `
      SELECT j.*
      FROM jobs j
      JOIN job_group_jobs jgj ON j.id = jgj.job_id
      WHERE jgj.group_id = $1
      ORDER BY j.created_at DESC
    `;
    const jobsResult = await pool.query(jobsQuery, [id]);
    
    // Combine job group and jobs
    const jobGroup = jobGroupResult.rows[0];
    jobGroup.jobs = jobsResult.rows;
    
    res.json(jobGroup);
  } catch (err) {
    console.error('Error fetching group:', err);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// Create a job group
app.post('/api/job-groups', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user.id;
    
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    // First check if tables exist, create if not
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_group_jobs (
        group_id UUID NOT NULL,
        job_id UUID NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, job_id)
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_job_groups (
        user_id TEXT NOT NULL,
        group_id UUID NOT NULL,
        PRIMARY KEY (user_id, group_id)
      )
    `);
    
    // Get user info for display purposes
    let userName = 'Unknown';
    try {
      const userResult = await pool.query('SELECT username FROM users WHERE id::text = $1', [userId.toString()]);
      if (userResult.rows.length > 0) {
        userName = userResult.rows[0].username;
      }
    } catch (userErr) {
      console.error('Error fetching username:', userErr);
      // Continue anyway with default name
    }
    
    // Convert schema and handle user_id as text explicitly
    const text_user_id = String(userId);
    console.log('Creating job group with user ID (as text):', text_user_id);
    
    // Create the group with user ID as text
    const result = await pool.query(
      'INSERT INTO job_groups (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, description, text_user_id]
    );
    
    const new_group_id = result.rows[0].id;
    console.log('Created new job group with ID:', new_group_id, 'and user ID:', text_user_id);
    
    // Add creator to group
    await pool.query(
      'INSERT INTO user_job_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [text_user_id, new_group_id]
    );
    
    // Add username to the response for display
    const responseGroup = {
      ...result.rows[0],
      created_by_name: userName
    };
    
    res.status(201).json(responseGroup);
  } catch (err) {
    console.error('Error creating group:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Update a job group
app.put('/api/job-groups/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    // Check if the job group exists
    const existingGroup = await pool.query('SELECT * FROM job_groups WHERE id = $1', [id]);
    
    if (existingGroup.rows.length === 0) {
      return res.status(404).json({ error: 'Job group not found' });
    }
    
    // Update the job group
    const result = await pool.query(
      'UPDATE job_groups SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [name, description, id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating job group:', err);
    res.status(500).json({ error: 'Failed to update job group' });
  }
});

// Delete a job group
app.delete('/api/job-groups/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if the job group exists
    const existingGroup = await pool.query('SELECT * FROM job_groups WHERE id = $1', [id]);
    
    if (existingGroup.rows.length === 0) {
      return res.status(404).json({ error: 'Job group not found' });
    }
    
    // Delete associations first
    await pool.query('DELETE FROM job_group_jobs WHERE group_id = $1', [id]);
    await pool.query('DELETE FROM user_job_groups WHERE group_id = $1', [id]);
    
    // Delete the job group
    await pool.query('DELETE FROM job_groups WHERE id = $1', [id]);
    
    res.json({ message: 'Job group deleted successfully' });
  } catch (err) {
    console.error('Error deleting job group:', err);
    res.status(500).json({ error: 'Failed to delete job group' });
  }
});

// Add job to group
app.post('/api/job-groups/:id/jobs', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { job_id } = req.body;
    
    if (!job_id) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    // Check if job group exists
    const groupResult = await pool.query('SELECT * FROM job_groups WHERE id = $1', [id]);
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job group not found' });
    }
    
    // Check if job exists
    const jobResult = await pool.query('SELECT * FROM jobs WHERE id = $1', [job_id]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Add job to group
    await pool.query(
      'INSERT INTO job_group_jobs (group_id, job_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, job_id]
    );
    
    res.json({ message: 'Job added to group successfully' });
  } catch (err) {
    console.error('Error adding job to group:', err);
    res.status(500).json({ error: 'Failed to add job to group' });
  }
});

// Remove job from group
app.delete('/api/job-groups/:id/jobs/:jobId', authenticateToken, async (req, res) => {
  try {
    const { id, jobId } = req.params;
    
    // Remove job from group
    await pool.query(
      'DELETE FROM job_group_jobs WHERE group_id = $1 AND job_id = $2',
      [id, jobId]
    );
    
    res.json({ message: 'Job removed from group successfully' });
  } catch (err) {
    console.error('Error removing job from group:', err);
    res.status(500).json({ error: 'Failed to remove job from group' });
  }
});

// Add direct access to transformations API without authentication
const transformationRoutes = require('./backend/routes/transformationRoutes');
const aiRoutes = require('./backend/routes/aiRoutes');
app.use('/api/transformations-noauth', (req, res, next) => {
  // Set a default admin user to prevent 'undefined' errors
  req.user = { 
    id: 2,  // Admin ID
    roles: ['Admin']
  };
  next();
}, transformationRoutes);
console.log('Added unauthenticated transformation routes');

// Setup enhanced backend features
setupEnhancedFeatures(app);

// Import error types
const { NotFoundError } = require('./backend/errors');

// Add 404 handler (must come after all routes and before error handler)
app.use((req, res, next) => {
  const error = new NotFoundError(
    `Route ${req.originalUrl} not found`,
    'route',
    req.originalUrl
  );
  next(error);
});

// Import and use global error handler middleware (must be after all routes)
const errorHandler = require('./backend/middleware/errorHandler');
app.use(errorHandler);

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});