/**
 * Migration: patchEnrollmentSchemaRuleNames
 *
 * Patches vendor_agreement_file_schemas row 340 (Vendor01_Clinical_Enrollment_new*.csv)
 * to add rule_name fields to its schema JSON and populate quality_rule_ids.
 *
 * Background
 * ----------
 * Task #201 added name-first lookup and quality_rule_ids candidate lookup to
 * schemaRuleEnforcer. For those paths to work the schema JSON must carry the
 * explicit rule_name alongside rule_type:
 *
 *   "quality_rules": [{"rule_type": "date_format", "rule_name": "Date Format Validation"}]
 *   "file_quality_rules": [{"rule_type": "record_count", "rule_name": "file_rec_count"}]
 *
 * Without this the enforcer falls back to type-based lookup which:
 *  - date_format  → finds "Date Format Validation" (global) but never sets target_columns
 *  - record_count → broad lookup excluded; creates phantom __schema_default__record_count__*
 *
 * What this migration does
 * ------------------------
 * 1. Looks up rule IDs by name so the patch is not fragile to ID changes across
 *    environments or resets.
 * 2. Rewrites the schema JSONB using jsonb_set to:
 *    a. Set each column's quality_rules to [{rule_type, rule_name}] objects.
 *    b. Set file_quality_rules to [{rule_type, rule_name}] objects.
 * 3. Sets quality_rule_ids = ARRAY[<file_rec_count_id>] so step-0 candidate
 *    lookup finds the project-scoped file_rec_count rule (which step -1 name-first
 *    lookup would miss because it has project_id IS NOT NULL).
 *
 * Safe to re-run: the UPDATE is idempotent.
 */

const { systemLogger } = require('../utils/logger');

const SCHEMA_ID = 340;
const DATE_RULE_NAME    = 'Date Format Validation';
const RECORD_RULE_NAME  = 'file_rec_count';
const TARGET_COLUMN     = 'Enrollment_Date';  // column that carries the date rule

/**
 * @param {import('pg').Pool} pool
 */
async function patchEnrollmentSchemaRuleNames(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Resolve rule IDs by name
    const ruleRes = await client.query(
      `SELECT id, rule_name, project_id
       FROM quality_rules
       WHERE rule_name = ANY($1::text[]) AND enabled = true
       ORDER BY id`,
      [[DATE_RULE_NAME, RECORD_RULE_NAME]]
    );

    const ruleMap = {};
    for (const row of ruleRes.rows) {
      ruleMap[row.rule_name] = row.id;
    }

    if (!ruleMap[DATE_RULE_NAME]) {
      systemLogger.warn('[patchEnrollmentSchemaRuleNames] Date Format Validation rule not found — skipping date_format patch', {});
    }
    if (!ruleMap[RECORD_RULE_NAME]) {
      systemLogger.warn('[patchEnrollmentSchemaRuleNames] file_rec_count rule not found — skipping record_count patch', {});
    }

    // 2. Fetch current schema
    const schemaRes = await client.query(
      `SELECT schema, quality_rule_ids FROM vendor_agreement_file_schemas WHERE id = $1`,
      [SCHEMA_ID]
    );
    if (schemaRes.rows.length === 0) {
      systemLogger.warn('[patchEnrollmentSchemaRuleNames] Schema row not found — nothing to patch', { SCHEMA_ID });
      await client.query('ROLLBACK');
      return { patched: false, reason: 'schema row not found' };
    }

    const current = schemaRes.rows[0];
    const schema  = typeof current.schema === 'string'
      ? JSON.parse(current.schema)
      : current.schema;

    if (!schema || !Array.isArray(schema.columns)) {
      systemLogger.warn('[patchEnrollmentSchemaRuleNames] Unexpected schema shape — skipping', { SCHEMA_ID });
      await client.query('ROLLBACK');
      return { patched: false, reason: 'unexpected schema shape' };
    }

    // 3. Update column quality_rules: date_format → {rule_type, rule_name}
    let columnPatched = false;
    const updatedColumns = schema.columns.map(col => {
      if ((col.name || col.column_name) !== TARGET_COLUMN) return col;
      if (!col.quality_rules || !Array.isArray(col.quality_rules)) return col;

      const updatedRules = col.quality_rules.map(entry => {
        const rt = (typeof entry === 'string' ? entry : entry.rule_type || '').toLowerCase();
        if (rt === 'date_format' && ruleMap[DATE_RULE_NAME]) {
          columnPatched = true;
          return { rule_type: 'date_format', rule_name: DATE_RULE_NAME };
        }
        return entry;
      });
      return { ...col, quality_rules: updatedRules };
    });

    // 4. Update file_quality_rules: record_count → {rule_type, rule_name}
    let fileRulePatched = false;
    const updatedFileRules = (schema.file_quality_rules || []).map(entry => {
      const rt = (typeof entry === 'string' ? entry : entry.rule_type || '').toLowerCase();
      if (rt === 'record_count' && ruleMap[RECORD_RULE_NAME]) {
        fileRulePatched = true;
        return { rule_type: 'record_count', rule_name: RECORD_RULE_NAME };
      }
      return entry;
    });

    const newSchema = { ...schema, columns: updatedColumns, file_quality_rules: updatedFileRules };

    // 5. Build new quality_rule_ids: merge file_rec_count ID into existing array
    const existingIds = Array.isArray(current.quality_rule_ids) ? current.quality_rule_ids : [];
    const newIds = Array.from(new Set([
      ...existingIds,
      ...(ruleMap[RECORD_RULE_NAME] ? [ruleMap[RECORD_RULE_NAME]] : [])
    ]));

    // 6. Persist — quality_rule_ids is a JSONB column storing a JSON array of ints
    await client.query(
      `UPDATE vendor_agreement_file_schemas
       SET schema = $1::jsonb,
           quality_rule_ids = $2::jsonb
       WHERE id = $3`,
      [JSON.stringify(newSchema), JSON.stringify(newIds), SCHEMA_ID]
    );

    await client.query('COMMIT');

    systemLogger.info('[patchEnrollmentSchemaRuleNames] Schema patched successfully', {
      SCHEMA_ID,
      columnPatched,
      fileRulePatched,
      newQualityRuleIds: newIds
    });

    return { patched: true, columnPatched, fileRulePatched, newQualityRuleIds: newIds };
  } catch (err) {
    await client.query('ROLLBACK');
    systemLogger.error('[patchEnrollmentSchemaRuleNames] Migration failed', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { patchEnrollmentSchemaRuleNames };
