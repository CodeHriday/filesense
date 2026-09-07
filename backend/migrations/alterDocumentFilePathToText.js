/**
 * Migration: Widen vendor_agreement_documents.file_path to TEXT
 *
 * The original migration created file_path as VARCHAR(1000).
 * Base64-encoded approval documents (PDF, Word, Excel) routinely exceed
 * that limit. Widening to TEXT is backward-compatible: existing rows are
 * unaffected and the download endpoint already treats the column as a
 * base64 string.
 */

const { systemLogger } = require('../utils/logger');

async function up(dbPool) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    // Only widen if the column is still character-varying — avoids a no-op
    // error if the migration somehow runs twice despite the tracker.
    const colInfo = await client.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'vendor_agreement_documents'
        AND column_name = 'file_path'
    `);

    const dataType = colInfo.rows[0]?.data_type;
    if (dataType === 'character varying') {
      await client.query(`
        ALTER TABLE vendor_agreement_documents
          ALTER COLUMN file_path TYPE TEXT
      `);
      systemLogger.info('✓ Widened vendor_agreement_documents.file_path to TEXT');
    } else {
      systemLogger.info(`ℹ Skipping file_path widen — column is already "${dataType}"`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up };
