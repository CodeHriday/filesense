const { systemLogger } = require('../utils/logger');

/**
 * Migration: Update Object and Array Data Types to String
 * 
 * This migration updates all schema records in file_schema_details where
 * column types are 'object' or 'array' and converts them to 'string' type.
 * This ensures consistency with the inferDataType function which now normalizes
 * these types to 'string' for better compatibility.
 */

async function updateObjectTypesToString(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    systemLogger.info('Starting object/array to string type conversion migration');
    
    // Get all schema records that contain object or array types
    const schemaRecords = await client.query(`
      SELECT file_schema_id, file_schema
      FROM file_schema_details
      WHERE file_schema::text LIKE '%"type":"object"%' 
         OR file_schema::text LIKE '%"type":"array"%'
    `);
    
    systemLogger.info(`Found ${schemaRecords.rows.length} schema records to update`);
    
    let updatedCount = 0;
    
    for (const record of schemaRecords.rows) {
      const schema = record.file_schema;
      
      // Update columns array if it exists
      if (schema.columns && Array.isArray(schema.columns)) {
        let modified = false;
        
        schema.columns = schema.columns.map(col => {
          if (col.type === 'object' || col.type === 'array') {
            modified = true;
            return { ...col, type: 'string' };
          }
          return col;
        });
        
        if (modified) {
          // Update the record
          await client.query(`
            UPDATE file_schema_details
            SET file_schema = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE file_schema_id = $2
          `, [JSON.stringify(schema), record.file_schema_id]);
          
          updatedCount++;
        }
      }
    }
    
    await client.query('COMMIT');
    
    systemLogger.info(`Object/array to string type conversion completed`, {
      totalRecords: schemaRecords.rows.length,
      updatedRecords: updatedCount
    });
    
    console.log(`✅ Successfully updated ${updatedCount} schema records (object/array → string)`);
    
    return {
      success: true,
      totalRecords: schemaRecords.rows.length,
      updatedRecords: updatedCount
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Object/array to string type conversion failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = updateObjectTypesToString;
