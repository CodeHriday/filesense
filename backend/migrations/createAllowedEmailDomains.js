const { Pool } = require('pg');

async function createAllowedEmailDomains(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('Creating allowed_email_domains table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS allowed_email_domains (
        id SERIAL PRIMARY KEY,
        domain VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created allowed_email_domains table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_allowed_email_domains_domain 
      ON allowed_email_domains(domain) WHERE is_active = true;
    `);
    console.log('✓ Created index for allowed_email_domains');

    await client.query('COMMIT');
    console.log('✓ Allowed email domains table created successfully');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating allowed_email_domains table:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createAllowedEmailDomains };
