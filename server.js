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
app.use(cors());
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

// Configure PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the database:', err);
  } else {
    console.log('Database connected successfully');
  }
});

// API Routes
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
    // This would typically involve:
    // 1. Reading the uploaded file
    // 2. Analyzing its structure
    // 3. Creating records in the files and file_columns tables
    
    // For now, we'll just save basic information
    const file = req.file;
    const fileId = `file_${Date.now()}`;
    const fileType = path.extname(file.originalname).substring(1);
    
    await pool.query(
      'INSERT INTO files (file_id, filename, file_type, file_size, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [fileId, file.originalname, fileType, file.size]
    );
    
    res.json({ 
      success: true, 
      fileId: fileId,
      message: 'File uploaded successfully'
    });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: 'Failed to upload file' });
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
    const result = await pool.query(`
      SELECT ah.*, ar.rule_name, ar.rule_type, ar.severity, f.filename
      FROM alert_history ah
      JOIN alert_rules ar ON ah.rule_id = ar.id
      JOIN files f ON ah.file_id = f.file_id
      ORDER BY ah.triggered_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching alert history:', err);
    res.status(500).json({ error: 'Failed to fetch alert history' });
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
    const result = await pool.query(`
      SELECT m.*, f.filename as source_filename
      FROM column_mappings m
      JOIN files f ON m.source_file_id = f.file_id
      ORDER BY m.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching column mappings:', err);
    res.status(500).json({ error: 'Failed to fetch column mappings' });
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});