const addDuplicateRecordsColumns = async (dbPool) => {
  try {
    console.log('Adding duplicate records columns to files table...');
    
    await dbPool.query(`
      ALTER TABLE files 
      ADD COLUMN IF NOT EXISTS duplicate_records_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS duplicate_records_percentage NUMERIC(5,2) DEFAULT 0.00
    `);
    
    console.log('✅ Successfully added duplicate records columns');
    return { success: true };
  } catch (error) {
    console.error('❌ Error adding duplicate records columns:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { addDuplicateRecordsColumns };
