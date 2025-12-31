const { query: dbQuery } = require('../config/database');

/**
 * Migration Tracker
 * Prevents migrations from running multiple times on server restart
 */

class MigrationTracker {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize the schema_migrations table
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await dbQuery(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          migration_name VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          success BOOLEAN DEFAULT true,
          error_message TEXT
        )
      `);
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing schema_migrations table:', error);
      throw error;
    }
  }

  /**
   * Check if a migration has already been executed
   * @param {string} migrationName - Name of the migration
   * @returns {Promise<boolean>} - True if already executed
   */
  async hasRun(migrationName) {
    await this.initialize();

    try {
      const result = await dbQuery(
        'SELECT id FROM schema_migrations WHERE migration_name = $1 AND success = true',
        [migrationName]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error(`Error checking migration ${migrationName}:`, error);
      return false;
    }
  }

  /**
   * Mark a migration as executed
   * @param {string} migrationName - Name of the migration
   * @param {boolean} success - Whether migration succeeded
   * @param {string} errorMessage - Error message if failed
   */
  async markExecuted(migrationName, success = true, errorMessage = null) {
    await this.initialize();

    try {
      await dbQuery(
        `INSERT INTO schema_migrations (migration_name, success, error_message) 
         VALUES ($1, $2, $3)
         ON CONFLICT (migration_name) 
         DO UPDATE SET executed_at = CURRENT_TIMESTAMP, success = $2, error_message = $3`,
        [migrationName, success, errorMessage]
      );
    } catch (error) {
      console.error(`Error marking migration ${migrationName}:`, error);
    }
  }

  /**
   * Run a migration only if it hasn't been executed yet
   * @param {string} migrationName - Unique name for the migration
   * @param {Function} migrationFn - Migration function to execute
   * @returns {Promise<any>} - Result of migration function
   */
  async runOnce(migrationName, migrationFn) {
    const alreadyRun = await this.hasRun(migrationName);
    
    if (alreadyRun) {
      console.log(`⏭️  Skipping migration: ${migrationName} (already executed)`);
      return { skipped: true, migrationName };
    }

    console.log(`▶️  Running migration: ${migrationName}`);
    
    try {
      const result = await migrationFn();
      await this.markExecuted(migrationName, true);
      console.log(`✅ Migration completed: ${migrationName}`);
      return result;
    } catch (error) {
      console.error(`❌ Migration failed: ${migrationName}`, error);
      await this.markExecuted(migrationName, false, error.message);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new MigrationTracker();
