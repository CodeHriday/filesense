const { Pool } = require('pg');
const FileInsightsService = require('./backend/services/fileInsightsService');

async function backfillMetrics() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Starting metrics backfill for all historical dates...\n');
    
    // Get all distinct dates where files were created
    const datesResult = await pool.query(`
      SELECT DISTINCT DATE(created_at) as file_date
      FROM files
      ORDER BY file_date DESC
    `);
    
    console.log(`Found ${datesResult.rows.length} distinct dates with files\n`);
    
    const service = new FileInsightsService(pool);
    let totalPatterns = 0;
    let totalFiles = 0;
    
    for (const row of datesResult.rows) {
      const date = new Date(row.file_date);
      console.log(`Processing date: ${date.toISOString().split('T')[0]}...`);
      
      const result = await service.aggregateDailyMetrics(date);
      totalPatterns += result.patterns_processed;
      totalFiles += result.files_processed;
      
      console.log(`  ✓ Processed ${result.patterns_processed} patterns, ${result.files_processed} files\n`);
    }
    
    console.log(`\n=== Backfill Complete ===`);
    console.log(`Total dates processed: ${datesResult.rows.length}`);
    console.log(`Total patterns: ${totalPatterns}`);
    console.log(`Total files: ${totalFiles}\n`);
    
    // Show summary of metrics
    const summaryResult = await pool.query(`
      SELECT 
        file_pattern,
        COUNT(*) as days_tracked,
        SUM(file_count) as total_files,
        AVG(overall_quality_score)::numeric(5,2) as avg_quality
      FROM file_pattern_metrics
      GROUP BY file_pattern
      ORDER BY file_pattern
    `);
    
    console.log('Metrics Summary:');
    console.table(summaryResult.rows);
    
  } catch (error) {
    console.error('Error during backfill:', error);
  } finally {
    await pool.end();
  }
}

backfillMetrics();
