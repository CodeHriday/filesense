const pool = require('../db');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    systemLogger.info('Adding source_owner and target_owner columns to transformation_mappings table');
    
    await client.query(`
      ALTER TABLE transformation_mappings
      ADD COLUMN IF NOT EXISTS source_owner VARCHAR(255),
      ADD COLUMN IF NOT EXISTS target_owner VARCHAR(255);
    `);
    
    systemLogger.info('Successfully added source_owner and target_owner columns');
  } catch (error) {
    systemLogger.error('Error adding source_owner and target_owner columns:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    systemLogger.info('Removing source_owner and target_owner columns from transformation_mappings table');
    
    await client.query(`
      ALTER TABLE transformation_mappings
      DROP COLUMN IF EXISTS source_owner,
      DROP COLUMN IF EXISTS target_owner;
    `);
    
    systemLogger.info('Successfully removed source_owner and target_owner columns');
  } catch (error) {
    systemLogger.error('Error removing source_owner and target_owner columns:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
