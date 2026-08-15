/**
 * Migration: Create digest subscription and audit tables
 * Adds digest_subscriptions and email_digests for the scheduled activity digest feature.
 */

async function createDigestTables(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Digest subscriptions — one row per user preference
    await client.query(`
      CREATE TABLE IF NOT EXISTS digest_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL DEFAULT 'My Digest',
        frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('hourly', 'daily', 'weekly', 'monthly')),
        categories JSONB NOT NULL DEFAULT '["all"]',
        recipients JSONB NOT NULL DEFAULT '[]',
        email_connection_id VARCHAR(255) REFERENCES storage_connections(connection_id) ON DELETE SET NULL,
        send_if_empty BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        next_send_at TIMESTAMP WITH TIME ZONE,
        last_sent_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✓ Created digest_subscriptions table');

    // Audit log for every digest attempt
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_digests (
        id SERIAL PRIMARY KEY,
        subscription_id INTEGER NOT NULL REFERENCES digest_subscriptions(id) ON DELETE CASCADE,
        sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        recipient_count INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
        summary JSONB,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✓ Created email_digests table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_digest_subscriptions_user
        ON digest_subscriptions(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_digest_subscriptions_next_send
        ON digest_subscriptions(next_send_at)
        WHERE is_active = true
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_digests_subscription
        ON email_digests(subscription_id, sent_at DESC)
    `);

    await client.query('COMMIT');
    console.log('✅ Digest tables created successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating digest tables:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createDigestTables };
