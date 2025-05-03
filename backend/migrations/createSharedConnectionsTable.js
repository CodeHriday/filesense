const { Pool } = require('pg');
const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function migrateConnectionsSchema() {
  try {
    console.log('Starting connections schema migration');
    systemLogger?.info?.('Starting connections schema migration');
    
    // Create the new shared connections table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transform_connections (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL,
        config JSONB NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        last_used_at TIMESTAMP,
        description TEXT,
        shared BOOLEAN DEFAULT TRUE,
        source_application VARCHAR(50) DEFAULT 'data_observatory'
      );
    `);
    
    // Check if we have existing connections to migrate
    const existingConnectionsCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'storage_connections'
      );
    `);
    
    if (existingConnectionsCheck.rows[0].exists) {
      // Migrate existing connections to the new schema
      const existingConnections = await pool.query('SELECT * FROM storage_connections');
      
      for (const conn of existingConnections.rows) {
        // Transform the old connection format to the new format
        let configData = {};
        
        // Extract connection details based on connection type
        try {
          if (typeof conn.connection_details === 'string') {
            conn.connection_details = JSON.parse(conn.connection_details);
          }
          
          configData = {
            ...conn.connection_details
          };
        } catch (parseError) {
          console.error('Error parsing connection details:', parseError);
          configData = {}; // Default to empty object if parsing fails
        }
        
        // Insert into the new table
        await pool.query(`
          INSERT INTO transform_connections (
            name, 
            type, 
            config,
            is_active,
            created_at,
            source_application
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          conn.connection_name,
          conn.connection_type,
          configData,
          conn.is_active,
          conn.created_at,
          'data_observatory'
        ]);
      }
      
      console.log(`Migrated ${existingConnections.rows.length} connections to the shared schema`);
      systemLogger?.info?.(`Migrated ${existingConnections.rows.length} connections to the shared schema`);
    }
    
    console.log('Connections schema migration completed successfully');
    systemLogger?.info?.('Connections schema migration completed successfully');
    return { success: true, message: 'Migration completed successfully' };
  } catch (error) {
    console.error('Error during connections schema migration:', error);
    systemLogger?.error?.('Error during connections schema migration', { 
      error: error.message,
      stack: error.stack
    });
    return { success: false, message: error.message };
  }
}

module.exports = migrateConnectionsSchema;
