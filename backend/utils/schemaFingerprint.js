const crypto = require('crypto');

/**
 * Generate a consistent fingerprint for a schema
 * @param {Array} schema - Array of column definitions with name and type
 * @returns {string} SHA256 hash of the schema
 * 
 * Example schema format:
 * [
 *   { name: 'order_id', type: 'string' },
 *   { name: 'amount', type: 'number' }
 * ]
 */
function generateSchemaFingerprint(schema) {
  if (!schema || !Array.isArray(schema) || schema.length === 0) {
    return null;
  }

  const normalized = schema
    .map(col => ({
      name: (col.name || col.column_name || '').toLowerCase().trim(),
      type: normalizeType(col.type || col.data_type || col.column_type || 'string')
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const schemaString = JSON.stringify(normalized);
  
  return crypto
    .createHash('sha256')
    .update(schemaString)
    .digest('hex');
}

/**
 * Normalize data types to standard categories
 * @param {string} type - Original type name
 * @returns {string} Normalized type
 */
function normalizeType(type) {
  const typeStr = String(type).toLowerCase();
  
  if (typeStr.includes('int') || typeStr.includes('serial') || typeStr.includes('bigint')) {
    return 'integer';
  }
  
  if (typeStr.includes('float') || typeStr.includes('double') || 
      typeStr.includes('decimal') || typeStr.includes('numeric')) {
    return 'numeric';
  }
  
  if (typeStr.includes('bool')) {
    return 'boolean';
  }
  
  if (typeStr.includes('date') || typeStr.includes('time')) {
    return 'datetime';
  }
  
  if (typeStr.includes('json')) {
    return 'json';
  }
  
  return 'string';
}

/**
 * Compare two schemas and return true if they are identical
 * @param {Array} schema1 - First schema
 * @param {Array} schema2 - Second schema
 * @returns {boolean} True if schemas are identical
 */
function schemasMatch(schema1, schema2) {
  const fp1 = generateSchemaFingerprint(schema1);
  const fp2 = generateSchemaFingerprint(schema2);
  
  return fp1 === fp2 && fp1 !== null;
}

/**
 * Extract schema from column statistics object
 * @param {Object} columnStats - Column statistics from transformation
 * @returns {Array} Schema array
 */
function extractSchemaFromStats(columnStats) {
  if (!columnStats || typeof columnStats !== 'object') {
    return [];
  }

  return Object.entries(columnStats).map(([name, stats]) => ({
    name,
    type: stats.type || stats.data_type || 'string'
  }));
}

module.exports = {
  generateSchemaFingerprint,
  schemasMatch,
  normalizeType,
  extractSchemaFromStats
};
