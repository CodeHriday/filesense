const { Pool } = require('pg');
const FileInsightsService = require('./backend/services/fileInsightsService');

async function testAggregation() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    const service = new FileInsightsService(pool);
    console.log('Running aggregation for 2025-10-20...');
    
    const result = await service.aggregateDailyMetrics(new Date('2025-10-20'));
    console.log('Aggregation result:', JSON.stringify(result, null, 2));
    
    // Check what was inserted
    const checkResult = await pool.query(`
      SELECT file_pattern, record_count, file_count, column_count, metric_date
      FROM file_pattern_metrics
      WHERE metric_date = '2025-10-20'
      ORDER BY file_pattern
    `);
    console.log('\nInserted metrics:');
    console.log(JSON.stringify(checkResult.rows, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testAggregation();
