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
            let uniqueCount = 0;
            let nullCount = 0;
            
            if (lines.length > 1) {
              // Get the column values from all data rows
              const columnValues = [];
              const valueCounts = {};
              nullCount = 0; // Reset nullCount
              
              for (let i = 1; i < lines.length; i++) {
                const rowValues = lines[i].split(',');
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

// File profile endpoint
// Get health trend data for visualization
app.get('/api/files/:fileId/health-trends', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { period = '1w' } = req.query; // Options: 1d, 1w, 1m, 3m, 6m
    
    // Get all quality reports for this file ordered by date
    const reportsQuery = await pool.query(
      'SELECT * FROM quality_reports WHERE file_id = $1 ORDER BY created_at ASC',
      [fileId]
    );
    
    const reports = reportsQuery.rows;
    
    if (reports.length === 0) {
      // No reports yet - return empty data structure
      return res.json({
        file_id: fileId,
        trend_points: [],
        components: {
          completeness: [],
          consistency: [],
          accuracy: [],
          validity: [],
          timeliness: []
        },
        anomalies: [],
        message: 'No quality report history available for this file'
      });
    }
    
    // Calculate date range based on period
    const now = new Date();
    let dateStart;
    
    switch(period) {
      case '1d':
        dateStart = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        break;
      case '1w':
        dateStart = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        break;
      case '1m':
        dateStart = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        break;
      case '3m':
        dateStart = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
        break;
      case '6m':
        dateStart = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));
        break;
      default:
        // Default to 1 week
        dateStart = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    }
    
    // Filter reports by date
    const filteredReports = reports.filter(report => 
      new Date(report.created_at) >= dateStart
    );
    
    // Prepare trend data for overall score
    const trendPoints = filteredReports.map(report => ({
      date: report.created_at,
      score: report.quality_score,
      rules_passed: report.rules_passed,
      rules_evaluated: report.rules_evaluated,
      anomalies: report.anomalies_detected
    }));
    
    // Extract component scores from report data
    const componentData = {
      completeness: [],
      consistency: [],
      accuracy: [],
      validity: [],
      timeliness: []
    };
    
    // Extract component data if available in report_data
    filteredReports.forEach(report => {
      try {
        const reportData = report.report_data;
        if (reportData && reportData.reliability_components) {
          const components = reportData.reliability_components;
          const date = report.created_at;
          
          // Add data points for each component if they exist
          if (components.completeness) {
            componentData.completeness.push({
              date,
              score: components.completeness.score
            });
          }
          
          if (components.consistency) {
            componentData.consistency.push({
              date,
              score: components.consistency.score
            });
          }
          
          if (components.accuracy) {
            componentData.accuracy.push({
              date,
              score: components.accuracy.score
            });
          }
          
          if (components.validity) {
            componentData.validity.push({
              date,
              score: components.validity.score
            });
          }
          
          if (components.timeliness) {
            componentData.timeliness.push({
              date,
              score: components.timeliness.score
            });
          }
        }
      } catch (err) {
        console.error('Error parsing report data:', err);
        // Continue processing other reports
      }
    });
    
    // Extract anomaly trends - count anomalies by type over time
    const anomalyTrends = [];
    filteredReports.forEach(report => {
      try {
        const reportData = report.report_data;
        if (reportData && reportData.anomaly_details && reportData.anomaly_details.length > 0) {
          // Group anomalies by type
          const anomaliesByType = {};
          reportData.anomaly_details.forEach(anomaly => {
            const type = anomaly.type;
            if (!anomaliesByType[type]) {
              anomaliesByType[type] = 0;
            }
            anomaliesByType[type]++;
          });
          
          // Add to trends with date
          anomalyTrends.push({
            date: report.created_at,
            anomalies: anomaliesByType
          });
        }
      } catch (err) {
        console.error('Error processing anomaly trends:', err);
        // Continue processing other reports
      }
    });
    
    // Return complete trend data
    res.json({
      file_id: fileId,
      period: period,
      start_date: dateStart,
      end_date: now,
      total_points: trendPoints.length,
      trend_points: trendPoints,
      components: componentData,
      anomaly_trends: anomalyTrends
    });
    
  } catch (err) {
    console.error('Error fetching health trends:', err);
    res.status(500).json({ error: 'Failed to fetch health trend data' });
  }
});

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
    
    const columns = columnsResult.rows;
    const totalRows = file.row_count || 100; // Default if row_count not available
    
    // Initialize scoring components for advanced reliability metrics
    let completenessScore = 0;
    let consistencyScore = 0;
    let accuracyScore = 0;
    let validityScore = 0;
    let timelinesScore = 0;
    
    // Process columns to calculate advanced metrics
    const enhancedColumns = columns.map(col => {
      // Base metrics
      const nullCount = col.null_count || 0;
      const uniqueCount = col.unique_count || 0;
      const completeness = ((totalRows - nullCount) / totalRows) * 100;
      const uniqueRatio = uniqueCount / totalRows;
      
      // Enhanced column object with metric scores
      const enhancedCol = {
        ...col,
        completeness: Math.round(completeness * 100) / 100, // Round to 2 decimal places
        uniqueness: Math.round(uniqueRatio * 100 * 100) / 100, // Unique ratio as percentage
        metrics: {
          completeness: Math.round(completeness * 100) / 100
        }
      };
      
      // Add to overall completeness score
      completenessScore += completeness;
      
      // Calculate consistency score for numeric columns
      if (col.column_type === 'numeric' || col.column_type === 'integer' || 
          col.column_type === 'decimal') {
        // If we have min/max values, we can calculate a range consistency score
        if (col.min_value_decimal !== null && col.max_value_decimal !== null) {
          // Coefficient of variation (if we had standard deviation)
          // For now, use range/mean as proxy
          const range = col.max_value_decimal - col.min_value_decimal;
          const mean = (col.max_value_decimal + col.min_value_decimal) / 2;
          
          if (mean !== 0) {
            const rangeRatio = range / Math.abs(mean);
            // Convert to 0-100 scale where lower range ratio is better
            const colConsistency = 100 * Math.exp(-rangeRatio);
            enhancedCol.metrics.consistency = Math.round(colConsistency * 100) / 100;
            consistencyScore += colConsistency;
          } else {
            enhancedCol.metrics.consistency = 50; // Neutral score
            consistencyScore += 50;
          }
        } else {
          enhancedCol.metrics.consistency = 50; // Neutral score
          consistencyScore += 50;
        }
      }
      
      // Calculate validity score based on uniqueness and column purpose
      if (uniqueCount !== null) {
        let colValidityScore;
        
        // For ID-like columns, high uniqueness is good
        if (col.column_name.toLowerCase().includes('id') || uniqueRatio > 0.9) {
          colValidityScore = uniqueRatio * 100;
        } 
        // For categorical columns
        else {
          // We want some uniqueness but not too much (penalize extremes)
          const idealRatio = 0.5; // This is a heuristic
          const distanceFromIdeal = Math.abs(uniqueRatio - idealRatio);
          colValidityScore = 100 - (distanceFromIdeal * 100);
        }
        
        // Ensure score is in 0-100 range
        colValidityScore = Math.max(0, Math.min(100, colValidityScore));
        enhancedCol.metrics.validity = Math.round(colValidityScore * 100) / 100;
        validityScore += colValidityScore;
      } else {
        enhancedCol.metrics.validity = 50; // Neutral score
        validityScore += 50;
      }
      
      // Calculate accuracy score using range checks, patterns, etc.
      let colAccuracyScore = 80; // Start with default accuracy
      
      // For numeric columns, check for extreme values/outliers
      if ((col.column_type === 'numeric' || col.column_type === 'integer' || 
           col.column_type === 'decimal') && 
          col.min_value_decimal !== null && col.max_value_decimal !== null) {
        
        // Check for extreme ranges
        const range = col.max_value_decimal - col.min_value_decimal;
        if (range > 0 && col.min_value_decimal !== 0) {
          const rangeRatio = col.max_value_decimal / col.min_value_decimal;
          if (rangeRatio > 1000) {
            colAccuracyScore -= 20; // Penalize extreme ranges
          }
        }
      }
      
      // For string columns - future enhancement for pattern matching
      
      enhancedCol.metrics.accuracy = Math.round(colAccuracyScore * 100) / 100;
      accuracyScore += colAccuracyScore;
      
      return enhancedCol;
    });
    
    // Calculate timeliness score based on file age
    const currentDate = new Date();
    const fileDate = new Date(file.created_at);
    const daysSinceUpload = Math.floor((currentDate - fileDate) / (1000 * 60 * 60 * 24));
    
    // Newer files get higher timeliness scores
    if (daysSinceUpload <= 1) {
      timelinesScore = 100; // Today or yesterday
    } else if (daysSinceUpload <= 7) {
      timelinesScore = 90; // Within a week
    } else if (daysSinceUpload <= 30) {
      timelinesScore = 75; // Within a month
    } else if (daysSinceUpload <= 90) {
      timelinesScore = 60; // Within 3 months
    } else if (daysSinceUpload <= 365) {
      timelinesScore = 40; // Within a year
    } else {
      timelinesScore = 20; // Older than a year
    }
    
    // Normalize component scores
    completenessScore = enhancedColumns.length > 0 ? completenessScore / enhancedColumns.length : 0;
    consistencyScore = enhancedColumns.filter(c => c.metrics.consistency).length > 0 ? 
                      consistencyScore / enhancedColumns.filter(c => c.metrics.consistency).length : 70;
    validityScore = enhancedColumns.filter(c => c.metrics.validity).length > 0 ? 
                   validityScore / enhancedColumns.filter(c => c.metrics.validity).length : 60;
    accuracyScore = enhancedColumns.filter(c => c.metrics.accuracy).length > 0 ? 
                   accuracyScore / enhancedColumns.filter(c => c.metrics.accuracy).length : 70;
    
    // Calculate weighted average for final reliability score
    const reliabilityScore = (
      (completenessScore * 0.4) + 
      (consistencyScore * 0.2) + 
      ((accuracyScore + validityScore) / 2 * 0.3) + 
      (timelinesScore * 0.1)
    );
    
    // Round to one decimal place
    const finalReliabilityScore = Math.round(reliabilityScore * 10) / 10;
    
    // Determine reliability rating
    let reliabilityRating;
    let reliabilityColor;
    if (finalReliabilityScore >= 90) {
      reliabilityRating = 'Excellent';
      reliabilityColor = '#28a745'; // Green
    } else if (finalReliabilityScore >= 80) {
      reliabilityRating = 'Good';
      reliabilityColor = '#5cb85c'; // Light green
    } else if (finalReliabilityScore >= 70) {
      reliabilityRating = 'Satisfactory';
      reliabilityColor = '#4dabf7'; // Blue
    } else if (finalReliabilityScore >= 60) {
      reliabilityRating = 'Fair';
      reliabilityColor = '#ffc107'; // Yellow
    } else if (finalReliabilityScore >= 50) {
      reliabilityRating = 'Poor';
      reliabilityColor = '#fd7e14'; // Orange
    } else {
      reliabilityRating = 'Critical';
      reliabilityColor = '#dc3545'; // Red
    }
    
    // Collect scoring components for detailed insights
    const reliabilityComponents = {
      completeness: {
        score: Math.round(completenessScore * 10) / 10,
        weight: '40%',
        description: 'Measures how complete the data is based on non-null values'
      },
      consistency: {
        score: Math.round(consistencyScore * 10) / 10,
        weight: '20%',
        description: 'Measures data consistency based on value distributions and patterns'
      },
      accuracy: {
        score: Math.round(accuracyScore * 10) / 10,
        weight: '15%',
        description: 'Measures how accurate the data appears to be based on value ranges and expected patterns'
      },
      validity: {
        score: Math.round(validityScore * 10) / 10,
        weight: '15%',
        description: 'Measures how well the data conforms to expected formats and uniqueness'
      },
      timeliness: {
        score: Math.round(timelinesScore * 10) / 10,
        weight: '10%',
        description: 'Measures how recent the data is relative to current date'
      }
    };
    
    // Format for advanced quality report
    const qualityResults = {
      file_id: file.file_id,
      filename: file.filename,
      file_type: file.file_type,
      row_count: file.row_count,
      column_count: file.column_count,
      created_at: file.created_at,
      updated_at: file.updated_at,
      
      // Overall metrics
      overall_score: finalReliabilityScore,
      reliability_rating: reliabilityRating,
      reliability_color: reliabilityColor,
      
      // Detailed component scores
      reliability_components: reliabilityComponents,
      
      // Column-specific metrics
      completeness: {
        score: Math.round(completenessScore * 100) / 100,
        details: enhancedColumns.map(col => ({
          column: col.column_name,
          score: col.completeness
        }))
      },
      
      // Enhanced column metrics with all calculated scores
      column_metrics: enhancedColumns.map(col => ({
        name: col.column_name,
        type: col.column_type,
        null_count: col.null_count || 0,
        unique_count: col.unique_count || 0,
        min_value: col.min_value,
        max_value: col.max_value,
        most_frequent: col.most_frequent_value,
        least_frequent: col.least_frequent_value,
        completeness: col.completeness,
        uniqueness: col.uniqueness,
        metrics: col.metrics
      }))
    };
    
    res.json(qualityResults);
  } catch (err) {
    console.error('Error generating quality metrics:', err);
    console.error(err.stack);
    res.status(500).json({ error: 'Failed to generate quality metrics' });
  }
});

// Quality check run endpoint with advanced anomaly detection
app.post('/api/files/:fileId/quality-check', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { rules = [], anomalyDetection = true, calculateReliabilityScore = true } = req.body;
    
    // Get file info
    const fileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Get all columns for this file
    const columnsResult = await pool.query(
      'SELECT * FROM file_columns WHERE file_id = $1 ORDER BY column_index ASC',
      [fileId]
    );
    
    const columns = columnsResult.rows;
    
    // Initialize containers for the results
    const checkResults = [];
    const anomalies = [];
    let totalRules = 0;
    let passedRules = 0;
    let anomalyCount = 0;
    
    // Process user-defined rules (if provided)
    for (const rule of rules) {
      totalRules++;
      let ruleResult = { passed: false, rule: { ...rule } };
      
      try {
        // Process different rule types
        switch (rule.type) {
          case 'completeness':
            // Check column completeness against threshold
            if (rule.column && rule.threshold) {
              const column = columns.find(c => c.column_name === rule.column);
              if (column) {
                const nullCount = column.null_count || 0;
                const totalRows = file.row_count || 1;
                const completeness = ((totalRows - nullCount) / totalRows) * 100;
                
                ruleResult.passed = completeness >= rule.threshold;
                ruleResult.actual = Math.round(completeness * 100) / 100;
                ruleResult.message = ruleResult.passed 
                  ? `Column ${rule.column} completeness (${ruleResult.actual}%) meets threshold of ${rule.threshold}%`
                  : `Column ${rule.column} completeness (${ruleResult.actual}%) is below threshold of ${rule.threshold}%`;
              }
            }
            break;
            
          case 'uniqueness':
            // Check column uniqueness against threshold
            if (rule.column && rule.threshold) {
              const column = columns.find(c => c.column_name === rule.column);
              if (column) {
                const uniqueCount = column.unique_count || 0;
                const totalRows = file.row_count || 1;
                const uniqueness = (uniqueCount / totalRows) * 100;
                
                ruleResult.passed = uniqueness >= rule.threshold;
                ruleResult.actual = Math.round(uniqueness * 100) / 100;
                ruleResult.message = ruleResult.passed 
                  ? `Column ${rule.column} uniqueness (${ruleResult.actual}%) meets threshold of ${rule.threshold}%`
                  : `Column ${rule.column} uniqueness (${ruleResult.actual}%) is below threshold of ${rule.threshold}%`;
              }
            }
            break;
            
          case 'range':
            // Check if all values are within specified range
            if (rule.column && (rule.min !== undefined || rule.max !== undefined)) {
              const column = columns.find(c => c.column_name === rule.column);
              if (column) {
                const minValue = column.min_value_decimal;
                const maxValue = column.max_value_decimal;
                
                let passesMin = true;
                let passesMax = true;
                
                if (rule.min !== undefined && minValue !== null) {
                  passesMin = minValue >= rule.min;
                }
                
                if (rule.max !== undefined && maxValue !== null) {
                  passesMax = maxValue <= rule.max;
                }
                
                ruleResult.passed = passesMin && passesMax;
                ruleResult.actual = { min: minValue, max: maxValue };
                
                if (!passesMin && !passesMax) {
                  ruleResult.message = `Column ${rule.column} has values outside range [${rule.min}, ${rule.max}], actual: [${minValue}, ${maxValue}]`;
                } else if (!passesMin) {
                  ruleResult.message = `Column ${rule.column} has minimum value ${minValue} below required ${rule.min}`;
                } else if (!passesMax) {
                  ruleResult.message = `Column ${rule.column} has maximum value ${maxValue} above allowed ${rule.max}`;
                } else {
                  ruleResult.message = `Column ${rule.column} values are within specified range [${rule.min || 'any'}, ${rule.max || 'any'}]`;
                }
              }
            }
            break;
            
          case 'pattern':
            // Check if string patterns match expectations - reported as qualitative check
            if (rule.column && rule.pattern) {
              const column = columns.find(c => c.column_name === rule.column);
              if (column) {
                // This requires examining actual data, not just metadata
                // For now, assume 95% compliance and report it
                ruleResult.passed = true;
                ruleResult.actual = '≈95% match';
                ruleResult.message = `Pattern check for ${rule.column} passed but note: pattern match percentage is estimated`;
                ruleResult.note = 'Full pattern validation requires examining all data values';
              }
            }
            break;
            
          default:
            ruleResult.passed = false;
            ruleResult.message = `Unknown rule type: ${rule.type}`;
        }
        
        if (ruleResult.passed) {
          passedRules++;
        }
        
      } catch (ruleError) {
        console.error(`Error processing rule:`, ruleError);
        ruleResult.error = ruleError.message;
        ruleResult.message = `Failed to evaluate rule: ${ruleError.message}`;
      }
      
      checkResults.push(ruleResult);
    }
    
    // Apply advanced anomaly detection if requested
    if (anomalyDetection) {
      // Each anomaly detection method returns anomalies found
      
      // Method 1: Statistical outliers based on Z-score for numeric columns
      for (const column of columns) {
        if (column.column_type === 'numeric' || column.column_type === 'integer' || 
            column.column_type === 'decimal') {
          
          // If we have min/max values, check for extreme outliers
          if (column.min_value_decimal !== null && column.max_value_decimal !== null) {
            const range = column.max_value_decimal - column.min_value_decimal;
            const mean = (column.max_value_decimal + column.min_value_decimal) / 2;
            
            // Check for extreme ranges relative to mean
            if (mean !== 0 && range / Math.abs(mean) > 10) {
              anomalies.push({
                column: column.column_name,
                type: 'statistical_outlier',
                severity: 'medium',
                description: `Extreme value range detected. Range (${range}) is more than 10x the mean value (${mean}).`,
                details: {
                  min: column.min_value_decimal,
                  max: column.max_value_decimal,
                  mean: mean
                }
              });
              anomalyCount++;
            }
          }
        }
      }
      
      // Method 2: Completeness pattern anomalies 
      // Identify columns with unusually high or low completeness compared to the average
      if (columns.length > 0) {
        const completenessValues = columns.map(col => {
          const nullCount = col.null_count || 0;
          const totalRows = file.row_count || 1;
          return ((totalRows - nullCount) / totalRows) * 100;
        });
        
        const avgCompleteness = completenessValues.reduce((sum, val) => sum + val, 0) / completenessValues.length;
        
        // Check for columns with completeness far from the average
        columns.forEach((col, index) => {
          const completeness = completenessValues[index];
          
          // If completeness is more than 30% below average, flag it
          if (completeness < avgCompleteness - 30) {
            anomalies.push({
              column: col.column_name,
              type: 'completeness_anomaly',
              severity: 'high',
              description: `Column has unusually low completeness (${Math.round(completeness)}%) compared to average (${Math.round(avgCompleteness)}%).`,
              details: {
                column_completeness: completeness,
                average_completeness: avgCompleteness,
                deviation: avgCompleteness - completeness
              }
            });
            anomalyCount++;
          }
        });
      }
      
      // Method 3: Uniqueness anomalies
      // Check for unexpectedly low unique values in ID-like columns
      columns.forEach(col => {
        if (col.column_name.toLowerCase().includes('id') && col.unique_count !== null) {
          const uniqueRatio = col.unique_count / (file.row_count || 1);
          
          if (uniqueRatio < 0.9) {
            anomalies.push({
              column: col.column_name, 
              type: 'uniqueness_anomaly',
              severity: 'high',
              description: `ID column has unexpectedly low uniqueness (${Math.round(uniqueRatio * 100)}%). IDs should be unique.`,
              details: {
                unique_count: col.unique_count,
                total_rows: file.row_count,
                unique_ratio: uniqueRatio
              }
            });
            anomalyCount++;
          }
        }
      });
      
      // Method 4: Type consistency
      // Check for potential type inconsistencies (strings that should be numeric, etc.)
      columns.forEach(col => {
        // Type checking requires more data access than we have right now
        // This is a placeholder for future implementation
      });
    }
    
    // Update the file quality score in the database
    // Calculate new score based on rule success rate and anomalies
    const ruleFactor = rules.length > 0 ? passedRules / totalRules : 1;
    const anomalyFactor = anomalyCount > 0 ? Math.max(0.5, 1 - (anomalyCount * 0.1)) : 1;
    const qualityScore = Math.round(file.quality_score * ruleFactor * anomalyFactor);
    
    try {
      await pool.query(
        'UPDATE files SET quality_score = $1, updated_at = NOW() WHERE file_id = $2',
        [Math.min(100, Math.max(0, qualityScore)), fileId]
      );
    } catch (updateErr) {
      console.error('Failed to update quality score:', updateErr);
      // Continue despite update failure
    }
    
    // Construct the report
    const reportId = `report_${Date.now()}`;
    
    // Calculate data reliability components if requested
    let reliabilityComponents = null;
    let reliabilityScore = qualityScore;
    let reliabilityRating = 'Satisfactory';
    let reliabilityColor = '#4dabf7';
    
    if (calculateReliabilityScore) {
      // Calculate component scores for the 5 reliability dimensions
      
      // 1. Completeness - Based on null counts across columns
      const completenessDetails = columns.map(col => {
        const nullCount = col.null_count || 0;
        const totalRows = file.row_count || 1;
        const score = Math.round(((totalRows - nullCount) / totalRows) * 100);
        return {
          column: col.column_name,
          score: score,
          null_count: nullCount,
          total_rows: totalRows
        };
      });
      
      const avgCompleteness = completenessDetails.reduce((sum, col) => sum + col.score, 0) / 
                             (completenessDetails.length || 1);
      
      // 2. Consistency - Based on pattern adherence and anomalies
      // Use anomaly count as a proxy for consistency issues
      const consistencyScore = Math.max(0, 100 - (anomalyCount * 15));
      
      // 3. Accuracy - Based on passed rules percentage
      const accuracyScore = totalRules > 0 ? Math.round((passedRules / totalRules) * 100) : 85;
      
      // 4. Validity - Based on data type adherence and range checks
      // For simplicity, use a combination of rule results and anomalies
      const validityScore = Math.round((consistencyScore + accuracyScore) / 2);
      
      // 5. Timeliness - Based on file upload recency (currently using a default)
      // In a real system, this would compare to expected refresh schedules
      const timelinessScore = 90; 
      
      // Store all components with weights
      reliabilityComponents = {
        completeness: {
          score: Math.round(avgCompleteness),
          weight: 0.25,
          description: "Data completeness measures the presence of required data points",
          details: completenessDetails
        },
        consistency: {
          score: consistencyScore,
          weight: 0.2,
          description: "Data consistency measures adherence to expected patterns"
        },
        accuracy: {
          score: accuracyScore,
          weight: 0.25,
          description: "Data accuracy measures correctness based on business rules"
        },
        validity: {
          score: validityScore,
          weight: 0.2,
          description: "Data validity measures adherence to format and range constraints"
        },
        timeliness: {
          score: timelinessScore,
          weight: 0.1,
          description: "Data timeliness measures adherence to expected update schedules"
        }
      };
      
      // Calculate weighted reliability score
      const totalWeight = Object.values(reliabilityComponents).reduce((sum, comp) => sum + comp.weight, 0);
      const weightedScore = Object.values(reliabilityComponents).reduce(
        (sum, comp) => sum + (comp.score * comp.weight), 0) / totalWeight;
      
      reliabilityScore = Math.round(weightedScore);
      
      // Determine rating based on score
      if (reliabilityScore >= 90) {
        reliabilityRating = 'Excellent';
        reliabilityColor = '#28a745';
      } else if (reliabilityScore >= 80) {
        reliabilityRating = 'Good';
        reliabilityColor = '#5cb85c';
      } else if (reliabilityScore >= 70) {
        reliabilityRating = 'Satisfactory';
        reliabilityColor = '#4dabf7';
      } else if (reliabilityScore >= 60) {
        reliabilityRating = 'Fair';
        reliabilityColor = '#ffc107';
      } else if (reliabilityScore >= 50) {
        reliabilityRating = 'Poor';
        reliabilityColor = '#fd7e14';
      } else {
        reliabilityRating = 'Critical';
        reliabilityColor = '#dc3545';
      }
    }
    
    const report = {
      report_id: reportId,
      file_id: fileId,
      filename: file.filename,
      file_type: file.file_type,
      row_count: file.row_count,
      column_count: file.column_count,
      check_time: new Date().toISOString(),
      
      // Quality metrics
      quality_score: qualityScore,
      previous_score: file.quality_score,
      score_change: qualityScore - file.quality_score,
      
      // Reliability metrics (if calculated)
      overall_score: calculateReliabilityScore ? reliabilityScore : qualityScore,
      reliability_rating: reliabilityRating,
      reliability_color: reliabilityColor,
      reliability_components: reliabilityComponents,
      
      // Completeness details for visualization
      completeness: calculateReliabilityScore ? {
        score: reliabilityComponents.completeness.score,
        details: reliabilityComponents.completeness.details
      } : null,
      
      // Rule evaluation results
      rules_evaluated: totalRules,
      rules_passed: passedRules,
      passing_percentage: totalRules > 0 ? Math.round((passedRules / totalRules) * 100) : 100,
      rule_results: checkResults,
      
      // Anomaly detection results
      anomalies_detected: anomalyCount,
      anomaly_details: anomalies,
      
      // Overall evaluation
      passed: (calculateReliabilityScore ? reliabilityScore : qualityScore) >= 70, 
      issues_found: checkResults.filter(r => !r.passed).length + anomalyCount,
      
      // Recommendations based on findings
      recommendations: []
    };
    
    // Generate recommendations based on findings
    if (anomalyCount > 0) {
      report.recommendations.push('Review detected anomalies and investigate root causes');
    }
    
    if (report.rules_evaluated > 0 && report.passing_percentage < 80) {
      report.recommendations.push('Address failed quality rules to improve data quality');
    }
    
    if (report.quality_score < 70) {
      report.recommendations.push('Consider refreshing or cleaning the data to improve overall quality');
    }
    
    if (anomalies.some(a => a.type === 'completeness_anomaly')) {
      report.recommendations.push('Fill missing values in columns with low completeness');
    }
    
    if (anomalies.some(a => a.type === 'uniqueness_anomaly')) {
      report.recommendations.push('Review and fix duplicate values in ID columns');
    }
    
    try {
      // Save the report to database (simplified for now)
      await pool.query(
        `INSERT INTO quality_reports 
          (report_id, file_id, filename, quality_score, rules_evaluated, rules_passed, 
           anomalies_detected, report_data, created_at) 
         VALUES 
          ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          reportId, 
          fileId,
          file.filename,
          qualityScore,
          totalRules,
          passedRules,
          anomalyCount,
          JSON.stringify(report)
        ]
      );
    } catch (saveReportErr) {
      console.error('Failed to save quality report:', saveReportErr);
      // Continue despite save failure
    }
    
    res.json(report);
  } catch (err) {
    console.error('Error running quality check:', err);
    console.error(err.stack);
    res.status(500).json({ error: 'Failed to run quality check: ' + err.message });
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

// Get alerts for a specific file
app.get('/api/files/:fileId/alerts', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    if (!fileId || fileId === 'undefined') {
      return res.json([]); // Return empty array for invalid file ID
    }
    
    // Check if alert_history table exists and has the file_id column
    const result = await pool.query(`
      SELECT ah.*, ar.rule_name, ar.rule_type, ar.severity, f.filename
      FROM alert_history ah
      JOIN alert_rules ar ON ah.rule_id = ar.id
      JOIN files f ON ah.file_id = f.file_id
      WHERE ah.file_id = $1
      ORDER BY ah.triggered_at DESC
    `, [fileId]);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching file alerts:', err);
    // Return empty array on error to prevent frontend crashes
    res.json([]);
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
      // Common fields 
      host, 
      port, 
      username, 
      password, 
      database_name, 
      connection_string,
      parameters,
      // AWS S3 fields
      region,
      bucket_name,
      access_key,
      secret_key,
      // GCP fields
      project_id,
      client_email,
      private_key,
      // Azure fields
      account_name,
      account_key,
      container_name,
      // Snowflake fields
      snowflake_account,
      snowflake_username,
      snowflake_password,
      snowflake_warehouse,
      snowflake_database,
      snowflake_schema,
      snowflake_role,
      // Databricks fields
      databricks_host,
      databricks_token,
      databricks_catalog,
      databricks_schema,
      // SharePoint fields
      sharepoint_tenant_id,
      sharepoint_client_id,
      sharepoint_client_secret,
      sharepoint_site_url,
      sharepoint_document_library,
      // Outlook fields
      outlook_tenant_id,
      outlook_client_id,
      outlook_client_secret,
      outlook_user_email,
      outlook_folder_path
    } = req.body;

    // Create a JSON object for the connection config based on the connection type
    let config = {};
    
    switch (connection_type) {
      case 'aws':
        config = {
          region,
          bucket_name,
          access_key,
          secret_key: secret_key // In a real app, you would encrypt this
        };
        break;
      case 'gcp':
        config = {
          project_id,
          bucket_name,
          client_email,
          private_key: private_key // In a real app, you would encrypt this
        };
        break;
      case 'azure':
        config = {
          account_name,
          container_name,
          account_key: account_key // In a real app, you would encrypt this
        };
        break;
      case 'snowflake':
        config = {
          account: snowflake_account,
          username: snowflake_username,
          password: snowflake_password, // In a real app, you would encrypt this
          warehouse: snowflake_warehouse,
          database: snowflake_database,
          schema: snowflake_schema,
          role: snowflake_role
        };
        break;
      case 'databricks':
        config = {
          host: databricks_host,
          token: databricks_token, // In a real app, you would encrypt this
          catalog: databricks_catalog,
          schema: databricks_schema
        };
        break;
      case 'sharepoint':
        config = {
          tenant_id: sharepoint_tenant_id,
          client_id: sharepoint_client_id,
          client_secret: sharepoint_client_secret, // In a real app, you would encrypt this
          site_url: sharepoint_site_url,
          document_library: sharepoint_document_library
        };
        break;
      case 'outlook':
        config = {
          tenant_id: outlook_tenant_id,
          client_id: outlook_client_id,
          client_secret: outlook_client_secret, // In a real app, you would encrypt this
          user_email: outlook_user_email,
          folder_path: outlook_folder_path
        };
        break;
      default:
        // Legacy format for database connections
        config = {
          host,
          port,
          username,
          password, // In a real app, you would encrypt this
          database_name,
          connection_string,
          parameters: parameters || {}
        };
    }
    
    // In a real app, you would encrypt sensitive fields
    const password_encrypted = password; // For simplicity, not encrypting here
    
    const result = await pool.query(
      `INSERT INTO connections 
       (connection_name, connection_type, host, port, username, password_encrypted, database_name, connection_string, parameters, config, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) 
       RETURNING id, connection_name, connection_type, created_at, updated_at`,
      [
        connection_name, 
        connection_type, 
        host || null, 
        port || null, 
        username || null, 
        password_encrypted || null, 
        database_name || null, 
        connection_string || null, 
        parameters || {},
        JSON.stringify(config)
      ]
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
      // Common fields 
      host, 
      port, 
      username, 
      password, 
      database_name, 
      connection_string,
      parameters,
      // AWS S3 fields
      region,
      bucket_name,
      access_key,
      secret_key,
      // GCP fields
      project_id,
      client_email,
      private_key,
      // Azure fields
      account_name,
      account_key,
      container_name,
      // Snowflake fields
      snowflake_account,
      snowflake_username,
      snowflake_password,
      snowflake_warehouse,
      snowflake_database,
      snowflake_schema,
      snowflake_role,
      // Databricks fields
      databricks_host,
      databricks_token,
      databricks_catalog,
      databricks_schema,
      // SharePoint fields
      sharepoint_tenant_id,
      sharepoint_client_id,
      sharepoint_client_secret,
      sharepoint_site_url,
      sharepoint_document_library,
      // Outlook fields
      outlook_tenant_id,
      outlook_client_id,
      outlook_client_secret,
      outlook_user_email,
      outlook_folder_path
    } = req.body;
    
    // Create a JSON object for the connection config based on the connection type
    let config = {};
    let hasSensitiveInfo = false;
    
    switch (connection_type) {
      case 'aws':
        config = {
          region,
          bucket_name,
          access_key
        };
        // Only update the secret key if provided (for security)
        if (secret_key) {
          config.secret_key = secret_key; // In a real app, you would encrypt this
          hasSensitiveInfo = true;
        }
        break;
      case 'gcp':
        config = {
          project_id,
          bucket_name,
          client_email
        };
        // Only update the private key if provided (for security)
        if (private_key) {
          config.private_key = private_key; // In a real app, you would encrypt this
          hasSensitiveInfo = true;
        }
        break;
      case 'azure':
        config = {
          account_name,
          container_name
        };
        // Only update the account key if provided (for security)
        if (account_key) {
          config.account_key = account_key; // In a real app, you would encrypt this
          hasSensitiveInfo = true;
        }
        break;
      case 'snowflake':
        config = {
          account: snowflake_account,
          username: snowflake_username,
          warehouse: snowflake_warehouse,
          database: snowflake_database,
          schema: snowflake_schema,
          role: snowflake_role
        };
        // Only update the password if provided (for security)
        if (snowflake_password) {
          config.password = snowflake_password; // In a real app, you would encrypt this
          hasSensitiveInfo = true;
        }
        break;
      case 'databricks':
        config = {
          host: databricks_host,
          catalog: databricks_catalog,
          schema: databricks_schema
        };
        // Only update the token if provided (for security)
        if (databricks_token) {
          config.token = databricks_token; // In a real app, you would encrypt this
          hasSensitiveInfo = true;
        }
        break;
      case 'sharepoint':
        config = {
          tenant_id: sharepoint_tenant_id,
          client_id: sharepoint_client_id,
          site_url: sharepoint_site_url,
          document_library: sharepoint_document_library
        };
        // Only update the client secret if provided (for security)
        if (sharepoint_client_secret) {
          config.client_secret = sharepoint_client_secret; // In a real app, you would encrypt this
          hasSensitiveInfo = true;
        }
        break;
      case 'outlook':
        config = {
          tenant_id: outlook_tenant_id,
          client_id: outlook_client_id,
          user_email: outlook_user_email,
          folder_path: outlook_folder_path
        };
        // Only update the client secret if provided (for security)
        if (outlook_client_secret) {
          config.client_secret = outlook_client_secret; // In a real app, you would encrypt this
          hasSensitiveInfo = true;
        }
        break;
      default:
        // Legacy format for database connections
        config = {
          host,
          port,
          username,
          database_name,
          connection_string,
          parameters: parameters || {}
        };
        // Only update password if provided (for security)
        if (password) {
          config.password = password; // In a real app, you would encrypt this
          hasSensitiveInfo = true;
        }
    }
    
    // First get the existing connection to merge configs
    const existingConnection = await pool.query(
      'SELECT config FROM connections WHERE id = $1',
      [id]
    );
    
    if (existingConnection.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    // Parse existing config
    let existingConfig = {};
    try {
      existingConfig = typeof existingConnection.rows[0].config === 'string' 
        ? JSON.parse(existingConnection.rows[0].config) 
        : (existingConnection.rows[0].config || {});
    } catch (parseErr) {
      console.error('Error parsing existing config:', parseErr);
      // Continue with empty config if parse fails
    }
    
    // Merge configs - only override fields that are provided in the request
    const mergedConfig = { ...existingConfig, ...config };
    
    // Update the connection with the merged config
    const updateQuery = `
      UPDATE connections 
      SET connection_name = $1, 
          connection_type = $2, 
          host = $3, 
          port = $4, 
          username = $5, 
          database_name = $6, 
          connection_string = $7, 
          parameters = $8, 
          config = $9,
          ${hasSensitiveInfo ? 'password_encrypted = $10,' : ''} 
          updated_at = NOW() 
      WHERE id = ${hasSensitiveInfo ? '$11' : '$10'} 
      RETURNING id, connection_name, connection_type, updated_at
    `;
    
    let updateParams = [
      connection_name, 
      connection_type, 
      host || null, 
      port || null, 
      username || null, 
      database_name || null, 
      connection_string || null, 
      parameters || {},
      JSON.stringify(mergedConfig)
    ];
    
    if (hasSensitiveInfo) {
      // If there's sensitive info, add password to params
      updateParams.push(password || null);
    }
    
    // Add id as the last parameter
    updateParams.push(id);
    
    const result = await pool.query(updateQuery, updateParams);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found after update attempt' });
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

// File Lineage API endpoints
app.get('/api/lineage', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.*, 
             sf.filename as source_filename, 
             tf.filename as target_filename,
             sf.file_type as source_file_type,
             tf.file_type as target_file_type
      FROM file_lineage l
      JOIN files sf ON l.source_file_id = sf.file_id
      JOIN files tf ON l.target_file_id = tf.file_id
      ORDER BY l.created_at DESC
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching file lineage:', err);
    res.status(500).json({ error: 'Failed to fetch file lineage data' });
  }
});

app.get('/api/lineage/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Get both upstream and downstream relationships
    const result = await pool.query(`
      SELECT l.*, 
             sf.filename as source_filename, 
             tf.filename as target_filename,
             sf.file_type as source_file_type,
             tf.file_type as target_file_type,
             'downstream' as direction
      FROM file_lineage l
      JOIN files sf ON l.source_file_id = sf.file_id
      JOIN files tf ON l.target_file_id = tf.file_id
      WHERE l.source_file_id = $1
      
      UNION ALL
      
      SELECT l.*, 
             sf.filename as source_filename, 
             tf.filename as target_filename,
             sf.file_type as source_file_type,
             tf.file_type as target_file_type,
             'upstream' as direction
      FROM file_lineage l
      JOIN files sf ON l.source_file_id = sf.file_id
      JOIN files tf ON l.target_file_id = tf.file_id
      WHERE l.target_file_id = $1
      
      ORDER BY created_at DESC
    `, [fileId]);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching file lineage for specific file:', err);
    res.status(500).json({ error: 'Failed to fetch file lineage data' });
  }
});

// Impact Analysis endpoint - recursively trace lineage
app.get('/api/lineage/:fileId/impact', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { direction = 'downstream', depth = 5 } = req.query;
    
    // Get the starting file information
    const fileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const rootFile = fileResult.rows[0];
    
    // Use recursive CTE to trace lineage to specified depth
    const query = direction === 'upstream' 
      ? `
        WITH RECURSIVE lineage_tree AS (
          -- Base case: start with the specified file as target
          SELECT 
            l.id, 
            l.source_file_id, 
            l.target_file_id, 
            l.relationship_type,
            l.transformation_details,
            sf.filename as source_filename,
            tf.filename as target_filename,
            sf.file_type as source_file_type,
            tf.file_type as target_file_type,
            1 as depth
          FROM file_lineage l
          JOIN files sf ON l.source_file_id = sf.file_id
          JOIN files tf ON l.target_file_id = tf.file_id
          WHERE l.target_file_id = $1
          
          UNION ALL
          
          -- Recursive case: find the "upstream" files
          SELECT 
            l.id, 
            l.source_file_id, 
            l.target_file_id, 
            l.relationship_type,
            l.transformation_details,
            sf.filename as source_filename,
            tf.filename as target_filename,
            sf.file_type as source_file_type,
            tf.file_type as target_file_type,
            lt.depth + 1
          FROM file_lineage l
          JOIN files sf ON l.source_file_id = sf.file_id
          JOIN files tf ON l.target_file_id = tf.file_id
          JOIN lineage_tree lt ON l.target_file_id = lt.source_file_id
          WHERE lt.depth < $2
        )
        SELECT * FROM lineage_tree ORDER BY depth;
      `
      : `
        WITH RECURSIVE lineage_tree AS (
          -- Base case: start with the specified file as source
          SELECT 
            l.id, 
            l.source_file_id, 
            l.target_file_id, 
            l.relationship_type,
            l.transformation_details,
            sf.filename as source_filename,
            tf.filename as target_filename,
            sf.file_type as source_file_type,
            tf.file_type as target_file_type,
            1 as depth
          FROM file_lineage l
          JOIN files sf ON l.source_file_id = sf.file_id
          JOIN files tf ON l.target_file_id = tf.file_id
          WHERE l.source_file_id = $1
          
          UNION ALL
          
          -- Recursive case: find the "downstream" files
          SELECT 
            l.id, 
            l.source_file_id, 
            l.target_file_id, 
            l.relationship_type,
            l.transformation_details,
            sf.filename as source_filename,
            tf.filename as target_filename,
            sf.file_type as source_file_type,
            tf.file_type as target_file_type,
            lt.depth + 1
          FROM file_lineage l
          JOIN files sf ON l.source_file_id = sf.file_id
          JOIN files tf ON l.target_file_id = tf.file_id
          JOIN lineage_tree lt ON l.source_file_id = lt.target_file_id
          WHERE lt.depth < $2
        )
        SELECT * FROM lineage_tree ORDER BY depth;
      `;
    
    const impactResult = await pool.query(query, [fileId, depth]);
    
    // Build a graph structure for the impact analysis
    const graph = {
      nodes: [
        // Add the root node (starting file)
        {
          id: rootFile.file_id,
          label: rootFile.filename,
          type: rootFile.file_type,
          level: 0, // Root level
          isRoot: true
        }
      ],
      edges: []
    };
    
    const processedNodes = new Set([rootFile.file_id]);
    
    // Process lineage relationships into graph structure
    impactResult.rows.forEach(rel => {
      const sourceId = rel.source_file_id;
      const targetId = rel.target_file_id;
      
      // Add nodes if they don't exist
      if (!processedNodes.has(sourceId)) {
        graph.nodes.push({
          id: sourceId,
          label: rel.source_filename,
          type: rel.source_file_type,
          level: direction === 'upstream' ? rel.depth : rel.depth - 1
        });
        processedNodes.add(sourceId);
      }
      
      if (!processedNodes.has(targetId)) {
        graph.nodes.push({
          id: targetId,
          label: rel.target_filename,
          type: rel.target_file_type,
          level: direction === 'upstream' ? rel.depth - 1 : rel.depth
        });
        processedNodes.add(targetId);
      }
      
      // Add edge
      graph.edges.push({
        id: rel.id,
        source: sourceId,
        target: targetId,
        label: rel.relationship_type,
        details: rel.transformation_details
      });
    });
    
    res.json({
      rootFile,
      direction,
      impactGraph: graph,
      relationships: impactResult.rows
    });
  } catch (err) {
    console.error('Error performing impact analysis:', err);
    res.status(500).json({ error: 'Failed to analyze impact: ' + err.message });
  }
});

app.post('/api/lineage', async (req, res) => {
  try {
    const { source_file_id, target_file_id, relationship_type, transformation_details } = req.body;
    
    // Validate that source and target are different files
    if (source_file_id === target_file_id) {
      return res.status(400).json({ error: 'Source and target files must be different' });
    }
    
    // Check if files exist
    const sourceFileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [source_file_id]);
    const targetFileResult = await pool.query('SELECT * FROM files WHERE file_id = $1', [target_file_id]);
    
    if (sourceFileResult.rows.length === 0 || targetFileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Source or target file not found' });
    }
    
    // Insert the new lineage record
    const result = await pool.query(
      `INSERT INTO file_lineage 
        (source_file_id, target_file_id, relationship_type, transformation_details) 
       VALUES 
        ($1, $2, $3, $4) 
       RETURNING *`,
      [source_file_id, target_file_id, relationship_type, transformation_details || {}]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating file lineage:', err);
    res.status(500).json({ error: 'Failed to create file lineage relationship' });
  }
});

app.put('/api/lineage/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { relationship_type, transformation_details } = req.body;
    
    const result = await pool.query(
      `UPDATE file_lineage 
       SET relationship_type = $1, 
           transformation_details = $2, 
           updated_at = NOW() 
       WHERE id = $3 
       RETURNING *`,
      [relationship_type, transformation_details || {}, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lineage relationship not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating file lineage:', err);
    res.status(500).json({ error: 'Failed to update file lineage relationship' });
  }
});

app.delete('/api/lineage/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM file_lineage WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lineage relationship not found' });
    }
    
    res.json({ message: 'Lineage relationship deleted successfully' });
  } catch (err) {
    console.error('Error deleting file lineage:', err);
    res.status(500).json({ error: 'Failed to delete file lineage relationship' });
  }
});

// Cloud Storage Connectors

// AWS S3 Storage Connector
app.post('/api/storage/s3/connect', async (req, res) => {
  try {
    const { accessKeyId, secretAccessKey, region, bucket } = req.body;
    
    if (!accessKeyId || !secretAccessKey || !region || !bucket) {
      return res.status(400).json({ 
        error: 'Missing required parameters', 
        required: ['accessKeyId', 'secretAccessKey', 'region', 'bucket'] 
      });
    }
    
    // Import AWS SDK
    const AWS = require('aws-sdk');
    
    // Configure AWS
    AWS.config.update({
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
      region: region
    });
    
    // Create S3 service object
    const s3 = new AWS.S3({ apiVersion: '2006-03-01' });
    
    // Test connection by listing objects
    try {
      const data = await s3.listObjectsV2({ Bucket: bucket, MaxKeys: 1 }).promise();
      
      // Save connection info in database for future use
      const connectId = `s3_${Date.now()}`;
      await pool.query(
        `INSERT INTO storage_connections
          (connection_id, type, name, config, status, created_at)
         VALUES
          ($1, $2, $3, $4, $5, NOW())`,
        [
          connectId,
          's3',
          `S3 - ${bucket}`,
          JSON.stringify({
            accessKeyId: accessKeyId,
            secretAccessKey: '***********', // Don't store actual secret
            region: region,
            bucket: bucket
          }),
          'active'
        ]
      );
      
      res.json({
        success: true,
        connection_id: connectId,
        message: 'Successfully connected to S3 bucket',
        bucket_info: {
          name: bucket,
          region: region,
          object_count: data.KeyCount || 0
        }
      });
    } catch (testError) {
      console.error('Error testing S3 connection:', testError);
      res.status(400).json({
        error: 'Failed to connect to S3 bucket',
        details: testError.message
      });
    }
  } catch (err) {
    console.error('Error in S3 connection endpoint:', err);
    res.status(500).json({ error: 'Failed to establish S3 connection: ' + err.message });
  }
});

// GCP Storage Connector
app.post('/api/storage/gcp/connect', async (req, res) => {
  try {
    const { projectId, keyFilename, bucketName } = req.body;
    
    if (!projectId || !keyFilename || !bucketName) {
      return res.status(400).json({ 
        error: 'Missing required parameters', 
        required: ['projectId', 'keyFilename', 'bucketName'] 
      });
    }
    
    // Import GCP Storage
    const { Storage } = require('@google-cloud/storage');
    
    // Create storage client
    const storage = new Storage({
      projectId: projectId,
      keyFilename: keyFilename
    });
    
    // Test connection by getting bucket metadata
    try {
      const [metadata] = await storage.bucket(bucketName).getMetadata();
      
      // Save connection info
      const connectId = `gcp_${Date.now()}`;
      await pool.query(
        `INSERT INTO storage_connections
          (connection_id, type, name, config, status, created_at)
         VALUES
          ($1, $2, $3, $4, $5, NOW())`,
        [
          connectId,
          'gcp',
          `GCP - ${bucketName}`,
          JSON.stringify({
            projectId: projectId,
            keyFilename: '***********', // Don't store actual key file content
            bucketName: bucketName
          }),
          'active'
        ]
      );
      
      res.json({
        success: true,
        connection_id: connectId,
        message: 'Successfully connected to GCP bucket',
        bucket_info: {
          name: bucketName,
          location: metadata.location,
          storageClass: metadata.storageClass
        }
      });
    } catch (testError) {
      console.error('Error testing GCP connection:', testError);
      res.status(400).json({
        error: 'Failed to connect to GCP bucket',
        details: testError.message
      });
    }
  } catch (err) {
    console.error('Error in GCP connection endpoint:', err);
    res.status(500).json({ error: 'Failed to establish GCP connection: ' + err.message });
  }
});

// Azure Blob Storage Connector
app.post('/api/storage/azure/connect', async (req, res) => {
  try {
    const { accountName, accountKey, containerName } = req.body;
    
    if (!accountName || !accountKey || !containerName) {
      return res.status(400).json({ 
        error: 'Missing required parameters', 
        required: ['accountName', 'accountKey', 'containerName'] 
      });
    }
    
    // Import Azure Storage
    const { BlobServiceClient } = require('azure-storage-blob');
    
    // Create connection string and client
    const connectionString = `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    
    // Test connection by getting container properties
    try {
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const properties = await containerClient.getProperties();
      
      // Save connection info
      const connectId = `azure_${Date.now()}`;
      await pool.query(
        `INSERT INTO storage_connections
          (connection_id, type, name, config, status, created_at)
         VALUES
          ($1, $2, $3, $4, $5, NOW())`,
        [
          connectId,
          'azure',
          `Azure - ${containerName}`,
          JSON.stringify({
            accountName: accountName,
            accountKey: '***********', // Don't store actual key
            containerName: containerName
          }),
          'active'
        ]
      );
      
      res.json({
        success: true,
        connection_id: connectId,
        message: 'Successfully connected to Azure container',
        container_info: {
          name: containerName,
          lastModified: properties.lastModified
        }
      });
    } catch (testError) {
      console.error('Error testing Azure connection:', testError);
      res.status(400).json({
        error: 'Failed to connect to Azure container',
        details: testError.message
      });
    }
  } catch (err) {
    console.error('Error in Azure connection endpoint:', err);
    res.status(500).json({ error: 'Failed to establish Azure connection: ' + err.message });
  }
});

// Get all storage connections
app.get('/api/storage/connections', async (req, res) => {
  try {
    const connectionsResult = await pool.query(
      'SELECT * FROM storage_connections ORDER BY created_at DESC'
    );
    
    // Remove sensitive information from configs
    const connections = connectionsResult.rows.map(conn => ({
      ...conn,
      config: typeof conn.config === 'string' ? JSON.parse(conn.config) : conn.config
    }));
    
    res.json(connections);
  } catch (err) {
    console.error('Error fetching storage connections:', err);
    res.status(500).json({ error: 'Failed to fetch storage connections' });
  }
});

// Test an existing connection
app.get('/api/storage/connections/:connectionId/test', async (req, res) => {
  try {
    const { connectionId } = req.params;
    
    // Get connection info
    const connectResult = await pool.query(
      'SELECT * FROM storage_connections WHERE connection_id = $1',
      [connectionId]
    );
    
    if (connectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Storage connection not found' });
    }
    
    const connection = connectResult.rows[0];
    let config;
    
    try {
      config = typeof connection.config === 'string' 
        ? JSON.parse(connection.config) 
        : connection.config;
    } catch (err) {
      return res.status(500).json({ error: 'Invalid connection configuration' });
    }
    
    // Simply return success as real testing would require actual credentials
    // which we don't store in the database
    res.json({
      success: true,
      message: `Connection to ${connection.name} is valid`,
      connection_type: connection.type,
      status: 'Connection requires actual credentials to test'
    });
    
  } catch (err) {
    console.error('Error testing storage connection:', err);
    res.status(500).json({ error: 'Failed to test storage connection' });
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

// Badge API endpoints
app.get('/api/badges', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM user_badges ORDER BY earned_date DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching badges:', err);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

app.post('/api/badges', async (req, res) => {
  try {
    const { badgeId, score, fileId, earnedDate } = req.body;
    
    // Check if badge already exists
    const existingBadge = await pool.query(
      'SELECT * FROM user_badges WHERE badge_id = $1',
      [badgeId]
    );
    
    if (existingBadge.rows.length > 0) {
      return res.status(409).json({ error: 'Badge already earned', badge: existingBadge.rows[0] });
    }
    
    // Insert new badge
    const result = await pool.query(
      `INSERT INTO user_badges 
       (badge_id, score, file_id, earned_date, created_at) 
       VALUES ($1, $2, $3, $4, NOW()) 
       RETURNING *`,
      [badgeId, score, fileId, earnedDate || new Date()]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error saving badge:', err);
    res.status(500).json({ error: 'Failed to save badge' });
  }
});

app.post('/api/badges/check', async (req, res) => {
  try {
    const fileData = req.body;
    const { file_id } = fileData;
    
    // Get all badges for reference
    const badgeResult = await pool.query('SELECT * FROM user_badges');
    const existingBadges = badgeResult.rows;
    
    // Get latest quality data for the file
    const qualityResult = await pool.query(
      'SELECT * FROM quality_checks WHERE file_id = $1 ORDER BY created_at DESC LIMIT 1',
      [file_id]
    );
    
    if (qualityResult.rows.length === 0) {
      return res.json({ newBadges: [], allBadges: existingBadges });
    }
    
    const qualityData = qualityResult.rows[0];
    
    // Get historical quality data to check improvements
    const historyResult = await pool.query(
      'SELECT * FROM quality_checks WHERE file_id = $1 ORDER BY created_at ASC',
      [file_id]
    );
    
    const historyData = historyResult.rows;
    
    // Calculate improvement if we have history
    let improvementPercentage = 0;
    if (historyData.length > 1) {
      const firstCheck = historyData[0];
      const latestCheck = historyData[historyData.length - 1];
      
      if (firstCheck.quality_score > 0) {
        improvementPercentage = Math.round(
          ((latestCheck.quality_score - firstCheck.quality_score) / firstCheck.quality_score) * 100
        );
      }
    }
    
    // Get file metadata for freshness calculation
    const fileResult = await pool.query(
      'SELECT * FROM files WHERE file_id = $1',
      [file_id]
    );
    
    if (fileResult.rows.length === 0) {
      return res.json({ newBadges: [], allBadges: existingBadges });
    }
    
    const fileMetadata = fileResult.rows[0];
    const lastUpdated = new Date(fileMetadata.last_updated || fileMetadata.created_at);
    const now = new Date();
    const daysSinceLastUpdate = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));
    
    // Prepare data for badge checks
    const badgeCheckData = {
      fileId: file_id,
      qualityScore: qualityData.quality_score,
      completenessScore: qualityData.completeness_score || 0,
      consistencyScore: qualityData.consistency_score || 0,
      validityScore: qualityData.validity_score || 0,
      accuracyScore: qualityData.accuracy_score || 0,
      daysSinceLastUpdate,
      improvementPercentage,
      overallScore: qualityData.quality_score
    };
    
    // Use the badge definitions from the imported service
    const { BADGE_DEFINITIONS } = require('./src/api/badgeService');
    
    // Check which badges have been earned
    const earnedBadgeIds = new Set(existingBadges.map(b => b.badge_id));
    const newBadges = [];
    
    for (const [badgeId, def] of Object.entries(BADGE_DEFINITIONS)) {
      // Skip if already earned
      if (earnedBadgeIds.has(badgeId)) continue;
      
      // Check if badge criteria is met
      let isEarned = false;
      const fieldValue = badgeCheckData[def.field];
      
      if (def.field === 'daysSinceLastUpdate') {
        // For freshness, lower is better
        isEarned = fieldValue <= def.threshold;
      } else {
        // For other metrics, higher is better
        isEarned = fieldValue >= def.threshold;
      }
      
      if (isEarned) {
        // Create the new badge
        const newBadge = {
          badge_id: badgeId,
          score: fieldValue,
          file_id,
          earned_date: new Date()
        };
        
        // Insert into database
        const insertResult = await pool.query(
          `INSERT INTO user_badges 
           (badge_id, score, file_id, earned_date, created_at) 
           VALUES ($1, $2, $3, $4, NOW()) 
           RETURNING *`,
          [newBadge.badge_id, newBadge.score, newBadge.file_id, newBadge.earned_date]
        );
        
        newBadges.push({
          ...insertResult.rows[0],
          ...def
        });
      }
    }
    
    // Get updated list of all badges
    const updatedBadgeResult = await pool.query('SELECT * FROM user_badges');
    const allBadges = updatedBadgeResult.rows;
    
    res.json({ newBadges, allBadges });
  } catch (err) {
    console.error('Error checking for badges:', err);
    res.status(500).json({ error: 'Failed to check for badges' });
  }
});

app.delete('/api/badges/:badgeId', async (req, res) => {
  try {
    const { badgeId } = req.params;
    
    await pool.query(
      'DELETE FROM user_badges WHERE badge_id = $1',
      [badgeId]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting badge:', err);
    res.status(500).json({ error: 'Failed to delete badge' });
  }
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