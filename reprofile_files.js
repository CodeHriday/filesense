#!/usr/bin/env node

/**
 * Re-profile all existing files to populate comprehensive column statistics
 * This script updates file_columns with string min/max values and numeric ranges
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10
});

/**
 * Run Python profiling script on a file
 */
async function runProfiling(filePath, fileType) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'utils', 'profile_columns.py');
    const args = [pythonScript, filePath, fileType];
    
    const python = spawn('python3', args); // NOSONAR S4036 - PATH controlled in deployment environment, hardcoded command with validated script path
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python profiling failed: ${stderr}`));
      } else {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse profiling output: ${err.message}`));
        }
      }
    });
  });
}

/**
 * Update file_columns table with new statistics
 */
async function updateFileColumns(client, fileId, filename, columnStats) {
  if (!columnStats || columnStats.length === 0) {
    console.log(`  ⚠️  No column stats to update for file ${filename}`);
    return 0;
  }

  let updatedCount = 0;
  
  for (const col of columnStats) {
    try {
      await client.query(`
        UPDATE file_columns
        SET 
          min_value = $1,
          max_value = $2,
          min_value_decimal = $3,
          max_value_decimal = $4,
          null_count = $5,
          unique_count = $6
        WHERE file_id = $7 AND column_name = $8
      `, [
        col.min_value || null,
        col.max_value || null,
        col.min_value_decimal || null,
        col.max_value_decimal || null,
        col.null_count || 0,
        col.unique_count || null,
        fileId,
        col.column_name
      ]);
      updatedCount++;
    } catch (err) {
      console.error(`  ❌ Error updating column ${col.column_name}: ${err.message}`);
    }
  }
  
  return updatedCount;
}

/**
 * Process a single file
 */
async function processFile(client, file) {
  const { file_id, filename, file_type, metadata } = file;
  
  console.log(`\n📄 Processing: ${filename} (${file_type})`);
  
  try {
    // Extract file path from metadata
    let filePath = null;
    if (metadata && metadata.path) {
      filePath = metadata.path;
    }
    
    // If no path in metadata, try uploads directory
    if (!filePath) {
      const uploadsDir = path.join(__dirname, 'uploads');
      filePath = path.join(uploadsDir, filename);
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (err) {
      // File might be deleted or in cloud storage
      console.log(`  ⚠️  File not found at: ${filePath}`);
      console.log(`  ⏭️  Skipping (file may be in cloud storage or deleted)`);
      return { success: false, reason: 'file_not_found' };
    }
    
    // Run profiling
    console.log(`  🔍 Running profiling...`);
    const profilingResult = await runProfiling(filePath, file_type);
    
    if (!profilingResult.success) {
      console.log(`  ❌ Profiling failed: ${profilingResult.error}`);
      return { success: false, reason: 'profiling_failed' };
    }
    
    // Update database
    console.log(`  💾 Updating database...`);
    const updatedCount = await updateFileColumns(
      client,
      file_id,
      filename,
      profilingResult.column_stats
    );
    
    console.log(`  ✅ Updated ${updatedCount} columns`);
    return { success: true, columnsUpdated: updatedCount };
    
  } catch (err) {
    console.error(`  ❌ Error processing file: ${err.message}`);
    return { success: false, reason: 'error', error: err.message };
  }
}

/**
 * Main function
 */
async function main() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting file re-profiling...\n');
    
    // Fetch all files
    const result = await client.query(`
      SELECT file_id, filename, file_type, file_size, row_count, metadata
      FROM files
      WHERE file_type IN ('csv', 'json', 'xlsx', 'xml', 'parquet')
      ORDER BY created_at DESC
    `);
    
    console.log(`📊 Found ${result.rows.length} files to re-profile\n`);
    
    const stats = {
      total: result.rows.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      totalColumnsUpdated: 0
    };
    
    // Process each file
    for (const file of result.rows) {
      const processResult = await processFile(client, file);
      
      if (processResult.success) {
        stats.successful++;
        stats.totalColumnsUpdated += processResult.columnsUpdated || 0;
      } else if (processResult.reason === 'file_not_found') {
        stats.skipped++;
      } else {
        stats.failed++;
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 Re-profiling Summary');
    console.log('='.repeat(60));
    console.log(`Total files:           ${stats.total}`);
    console.log(`✅ Successfully profiled: ${stats.successful}`);
    console.log(`❌ Failed:               ${stats.failed}`);
    console.log(`⏭️  Skipped:              ${stats.skipped}`);
    console.log(`💾 Total columns updated: ${stats.totalColumnsUpdated}`);
    console.log('='.repeat(60));
    
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
main().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});
