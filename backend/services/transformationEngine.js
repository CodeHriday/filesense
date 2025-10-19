const crypto = require('crypto');
const { systemLogger } = require('../utils/logger');

/**
 * Transformation Engine
 * Applies field-level transformations to data during ETL processing
 */

/**
 * Apply a transformation to a value
 * @param {string} transformationType - Type of transformation
 * @param {any} value - Input value
 * @param {Object} params - Transformation parameters
 * @returns {any} - Transformed value
 */
function applyTransformation(transformationType, value, params = {}) {
  try {
    switch (transformationType) {
      case 'null_to_value':
        return nullToValue(value, params);
      
      case 'concat':
        return concat(value, params);
      
      case 'date_format':
        return dateFormat(value, params);
      
      case 'upper':
        return upper(value);
      
      case 'lower':
        return lower(value);
      
      case 'trim':
        return trim(value, params);
      
      case 'substring':
        return substring(value, params);
      
      case 'replace':
        return replace(value, params);
      
      case 'round':
        return round(value, params);
      
      case 'floor':
        return floor(value);
      
      case 'ceil':
        return ceil(value);
      
      case 'case_when':
        return caseWhen(value, params);
      
      case 'cast':
        return cast(value, params);
      
      case 'math_add':
        return mathAdd(value, params);
      
      case 'math_subtract':
        return mathSubtract(value, params);
      
      case 'math_multiply':
        return mathMultiply(value, params);
      
      case 'math_divide':
        return mathDivide(value, params);
      
      case 'lookup':
        return lookup(value, params);
      
      case 'hash':
        return hash(value, params);
      
      case 'split':
        return split(value, params);
      
      case 'system_date':
        return systemDate(params);
      
      case 'left_pad':
        return leftPad(value, params);
      
      case 'right_pad':
        return rightPad(value, params);
      
      case 'coalesce':
        return coalesce(value, params);
      
      default:
        systemLogger.warn(`Unknown transformation type: ${transformationType}`);
        return value;
    }
  } catch (error) {
    systemLogger.error(`Error applying transformation ${transformationType}:`, error);
    return value; // Return original value on error
  }
}

// Transformation Functions

/**
 * Replace null/empty values with a default value
 */
function nullToValue(value, params) {
  const { defaultValue = '' } = params;
  return (value === null || value === undefined || value === '') ? defaultValue : value;
}

/**
 * Concatenate multiple fields or add prefix/suffix
 */
function concat(value, params) {
  const { fields = [], separator = '', prefix = '', suffix = '', concatParts = [] } = params;
  
  // NEW FORMAT: Use concatParts to maintain proper ordering of fields and literals
  if (concatParts.length > 0) {
    const parts = concatParts.map(part => {
      if (part.type === 'field') {
        return value[part.value] || '';
      } else if (part.type === 'literal') {
        return part.value;
      } else if (part.type === 'variable') {
        // Variables should be in the enriched row as $var_name
        return value[part.value] || '';
      }
      return '';
    });
    return prefix + parts.join('') + suffix;
  }
  
  // LEGACY FORMAT: Use fields with separator
  if (fields.length > 0) {
    // Concatenate multiple fields (value is a row object)
    const values = fields.map(field => value[field] || '');
    return prefix + values.join(separator) + suffix;
  }
  
  // Single value with prefix/suffix
  return prefix + (value || '') + suffix;
}

/**
 * Format date/timestamp
 */
function dateFormat(value, params) {
  const { inputFormat = 'ISO', outputFormat = 'YYYY-MM-DD' } = params;
  
  if (!value) return value;
  
  try {
    let date;
    
    // Parse input
    if (inputFormat === 'ISO') {
      date = new Date(value);
    } else if (inputFormat === 'timestamp') {
      date = new Date(parseInt(value));
    } else if (inputFormat === 'unix') {
      date = new Date(parseInt(value) * 1000);
    } else {
      date = new Date(value);
    }
    
    if (isNaN(date.getTime())) {
      return value; // Invalid date, return original
    }
    
    // Format output
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return outputFormat
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
      
  } catch (error) {
    systemLogger.error('Date format error:', error);
    return value;
  }
}

/**
 * Convert to uppercase
 */
function upper(value) {
  return value ? String(value).toUpperCase() : value;
}

/**
 * Convert to lowercase
 */
function lower(value) {
  return value ? String(value).toLowerCase() : value;
}

/**
 * Trim whitespace
 */
function trim(value, params = {}) {
  const { type = 'both' } = params;
  
  if (!value) return value;
  
  const str = String(value);
  
  switch (type) {
    case 'left':
      return str.trimStart();
    case 'right':
      return str.trimEnd();
    case 'both':
    default:
      return str.trim();
  }
}

/**
 * Extract substring
 */
function substring(value, params) {
  const { start = 0, length = null } = params;
  
  if (!value) return value;
  
  const str = String(value);
  
  if (length !== null) {
    return str.substr(start, length);
  }
  
  return str.substring(start);
}

/**
 * Find and replace
 */
function replace(value, params) {
  const { find = '', replaceWith = '', caseInsensitive = false } = params;
  
  if (!value || !find) return value;
  
  const str = String(value);
  const flags = caseInsensitive ? 'gi' : 'g';
  const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  
  return str.replace(regex, replaceWith);
}

/**
 * Round number to decimal places
 */
function round(value, params) {
  const { decimals = 0 } = params;
  
  if (value === null || value === undefined || value === '') return value;
  
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Floor number
 */
function floor(value) {
  if (value === null || value === undefined || value === '') return value;
  
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  
  return Math.floor(num);
}

/**
 * Ceiling number
 */
function ceil(value) {
  if (value === null || value === undefined || value === '') return value;
  
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  
  return Math.ceil(num);
}

/**
 * Conditional logic (CASE WHEN)
 */
function caseWhen(value, params) {
  const { conditions = [], defaultValue = null } = params;
  
  // conditions format: [{ operator: 'equals', value: 'X', result: 'Y' }, ...]
  for (const condition of conditions) {
    const { operator, compareValue, result } = condition;
    
    let matches = false;
    
    switch (operator) {
      case 'equals':
        matches = value == compareValue;
        break;
      case 'not_equals':
        matches = value != compareValue;
        break;
      case 'greater_than':
        matches = parseFloat(value) > parseFloat(compareValue);
        break;
      case 'less_than':
        matches = parseFloat(value) < parseFloat(compareValue);
        break;
      case 'contains':
        matches = String(value).includes(String(compareValue));
        break;
      case 'starts_with':
        matches = String(value).startsWith(String(compareValue));
        break;
      case 'ends_with':
        matches = String(value).endsWith(String(compareValue));
        break;
      case 'is_null':
        matches = value === null || value === undefined || value === '';
        break;
      case 'is_not_null':
        matches = value !== null && value !== undefined && value !== '';
        break;
    }
    
    if (matches) {
      return result;
    }
  }
  
  return defaultValue !== null ? defaultValue : value;
}

/**
 * Type casting
 */
function cast(value, params) {
  const { targetType = 'string' } = params;
  
  if (value === null || value === undefined) return value;
  
  switch (targetType) {
    case 'string':
      return String(value);
    
    case 'integer':
      const int = parseInt(value);
      return isNaN(int) ? null : int;
    
    case 'float':
    case 'decimal':
      const float = parseFloat(value);
      return isNaN(float) ? null : float;
    
    case 'boolean':
      if (typeof value === 'boolean') return value;
      const str = String(value).toLowerCase();
      if (str === 'true' || str === '1' || str === 'yes') return true;
      if (str === 'false' || str === '0' || str === 'no') return false;
      return null;
    
    case 'date':
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date.toISOString();
    
    default:
      return value;
  }
}

/**
 * Math operations - Add
 */
function mathAdd(value, params) {
  const { addValue = 0 } = params;
  
  const num1 = parseFloat(value) || 0;
  const num2 = parseFloat(addValue) || 0;
  
  return num1 + num2;
}

/**
 * Math operations - Subtract
 */
function mathSubtract(value, params) {
  const { subtractValue = 0 } = params;
  
  const num1 = parseFloat(value) || 0;
  const num2 = parseFloat(subtractValue) || 0;
  
  return num1 - num2;
}

/**
 * Math operations - Multiply
 */
function mathMultiply(value, params) {
  const { multiplyBy = 1 } = params;
  
  const num1 = parseFloat(value) || 0;
  const num2 = parseFloat(multiplyBy) || 1;
  
  return num1 * num2;
}

/**
 * Math operations - Divide
 */
function mathDivide(value, params) {
  const { divideBy = 1 } = params;
  
  const num1 = parseFloat(value) || 0;
  const num2 = parseFloat(divideBy) || 1;
  
  if (num2 === 0) {
    systemLogger.warn('Division by zero attempted');
    return null;
  }
  
  return num1 / num2;
}

/**
 * Lookup and replace based on mapping
 */
function lookup(value, params) {
  const { mappings = {}, defaultValue = null } = params;
  
  // mappings format: { "old_value": "new_value", ... }
  if (value in mappings) {
    return mappings[value];
  }
  
  return defaultValue !== null ? defaultValue : value;
}

/**
 * Hash value (MD5, SHA256, etc.)
 */
function hash(value, params) {
  const { algorithm = 'sha256' } = params;
  
  if (!value) return value;
  
  try {
    return crypto.createHash(algorithm).update(String(value)).digest('hex');
  } catch (error) {
    systemLogger.error('Hash error:', error);
    return value;
  }
}

/**
 * Split string into parts
 */
function split(value, params) {
  const { delimiter = ',', index = 0 } = params;
  
  if (!value) return value;
  
  const parts = String(value).split(delimiter);
  
  if (index < 0 || index >= parts.length) {
    return null;
  }
  
  return parts[index].trim();
}

/**
 * Get current system date/time
 */
function systemDate(params) {
  const { format = 'YYYY-MM-DD' } = params;
  
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * Left pad string
 */
function leftPad(value, params) {
  const { length = 0, padChar = ' ' } = params;
  
  if (!value) return value;
  
  return String(value).padStart(length, padChar);
}

/**
 * Right pad string
 */
function rightPad(value, params) {
  const { length = 0, padChar = ' ' } = params;
  
  if (!value) return value;
  
  return String(value).padEnd(length, padChar);
}

/**
 * Coalesce - return first non-null value from list of fields
 */
function coalesce(value, params) {
  const { fields = [] } = params;
  
  // value is a row object
  for (const field of fields) {
    const fieldValue = value[field];
    if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') {
      return fieldValue;
    }
  }
  
  return null;
}

/**
 * Apply multiple transformations in sequence
 * @param {any} value - Input value
 * @param {Array} transformations - Array of transformation definitions
 * @returns {any} - Final transformed value
 */
function applyTransformationChain(value, transformations) {
  let result = value;
  
  for (const transform of transformations) {
    result = applyTransformation(transform.type, result, transform.params || {});
  }
  
  return result;
}

/**
 * Transform a complete row of data with variables support
 * @param {Object} row - Input row
 * @param {Object} fieldMappings - Field mapping configuration
 * @param {Array} variables - Variable definitions (optional)
 * @returns {Object} - Transformed row
 */
function transformRow(row, fieldMappings, variables = []) {
  // If no field mappings provided, pass through original row
  if (!fieldMappings || fieldMappings.length === 0) {
    return row;
  }
  
  // Step 1: Evaluate variables sequentially (they can reference previous variables)
  const variableValues = {};
  const enrichedRow = { ...row };
  
  if (variables && variables.length > 0) {
    for (const variable of variables) {
      const { name, sourceFields = [], transformations = [] } = variable;
      
      let value;
      
      // Variables can reference source fields, other variables, or be system-generated
      if (sourceFields && sourceFields.length > 0) {
        // PRIORITY 1: Check if transformations require row-level context (concat/coalesce)
        if (transformations.length > 0 && (transformations[0].type === 'concat' || transformations[0].type === 'coalesce')) {
          // Multi-field operations - pass enriched row and transformations are applied inside
          // DO NOT apply transformations again (already applied with row context)
          value = applyTransformationChain(enrichedRow, transformations);
        } else {
          // PRIORITY 2: Check if source is a variable reference
          const firstSource = sourceFields[0];
          if (firstSource.startsWith('$')) {
            // Reference to another variable
            const varName = firstSource.substring(1);
            value = variableValues[varName];
            // Apply transformations to variable value
            value = applyTransformationChain(value, transformations);
          } else {
            // Single field reference
            value = enrichedRow[firstSource];
            // Apply transformations to single field value
            value = applyTransformationChain(value, transformations);
          }
        }
      } else {
        // System-generated or static value
        value = applyTransformationChain(null, transformations);
      }
      
      // Store variable value
      variableValues[name] = value;
      enrichedRow[`$${name}`] = value; // Make available as $variable_name
    }
  }
  
  // Step 2: Process field mappings
  const transformedRow = {};
  
  for (const mapping of fieldMappings) {
    const { targetField, sourceFields, transformations = [] } = mapping;
    
    let value;
    
    // Process field mappings with proper priority
    if (sourceFields && sourceFields.length > 0) {
      // PRIORITY 1: Check if transformations require row-level context (concat/coalesce)
      if (transformations.length > 0 && (transformations[0].type === 'concat' || transformations[0].type === 'coalesce')) {
        // Multi-field operations - pass enriched row
        value = applyTransformationChain(enrichedRow, transformations);
      } else {
        // PRIORITY 2: Check if source is a variable reference
        const firstSource = sourceFields[0];
        
        if (firstSource.startsWith('$')) {
          // Variable reference
          const varName = firstSource.substring(1);
          value = variableValues[varName];
          value = applyTransformationChain(value, transformations);
        } else {
          // Use first source field
          value = enrichedRow[firstSource];
          value = applyTransformationChain(value, transformations);
        }
      }
    } else {
      // Static or system-generated value
      value = applyTransformationChain(null, transformations);
    }
    
    transformedRow[targetField] = value;
  }
  
  return transformedRow;
}

module.exports = {
  applyTransformation,
  applyTransformationChain,
  transformRow,
  
  // Export individual functions for testing
  nullToValue,
  concat,
  dateFormat,
  upper,
  lower,
  trim,
  substring,
  replace,
  round,
  floor,
  ceil,
  caseWhen,
  cast,
  mathAdd,
  mathSubtract,
  mathMultiply,
  mathDivide,
  lookup,
  hash,
  split,
  systemDate,
  leftPad,
  rightPad,
  coalesce
};
