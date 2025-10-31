// Import our transformation tables migrations
const initTransformationTables = require('./backend/migrations/createTransformationTables');
const initETLTransformationTables = require('./backend/migrations/createETLTransformationTables');
const initLogicalFileGroupsTables = require('./backend/migrations/createLogicalFileGroupsTables');

// Function to initialize business process-related tables
const initBusinessProcessTables = async (pool) => {
  try {
    // Create the uuid-ossp extension if it doesn't exist (for UUID generation)
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `);

    // Create groups table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create user_groups table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_groups (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, group_id)
      );
    `);

    // Create business_processes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS business_processes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
        created_by TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create jobs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        business_process_id INTEGER NOT NULL REFERENCES business_processes(id) ON DELETE CASCADE,
        source_connection_id INTEGER REFERENCES connections(id) ON DELETE SET NULL,
        target_connection_id INTEGER REFERENCES connections(id) ON DELETE SET NULL,
        validation_settings JSONB,
        error_handling_settings JSONB,
        notification_settings JSONB,
        schedule_settings JSONB,
        created_by TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create job_runs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_runs (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        records_processed INTEGER,
        records_failed INTEGER,
        error_details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create job_groups table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create job_group_jobs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_group_jobs (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES job_groups(id) ON DELETE CASCADE,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, job_id)
      );
    `);

    // Check for default group existence specifically, not just any group
    const existingDefaultGroup = await pool.query("SELECT COUNT(*) FROM groups WHERE name = 'Default Group'");
    if (parseInt(existingDefaultGroup.rows[0].count) === 0) {
      try {
        await pool.query(`
          INSERT INTO groups (name, description)
          VALUES ('Default Group', 'Default group for all users');
        `);
        console.log('Created default group');
      } catch (err) {
        // Handle potential race condition - another process might have created the Default Group
        if (err.code === '23505') { // Unique violation
          console.log('Default group already created by another process, skipping');
        } else {
          throw err;
        }
      }
    } else {
      console.log('Default group already exists, skipping creation');
    }

    console.log('Business process management tables initialized');
    
    // Initialize transformation tables
    await initTransformationTables(pool);
    
    // Initialize ETL transformation system tables
    await initETLTransformationTables(pool);
    
    // Initialize logical file groups tables for cross-upload schema tracking
    await initLogicalFileGroupsTables(pool);
  } catch (error) {
    console.error('Error initializing business process tables:', error);
  }
};

module.exports = initBusinessProcessTables;