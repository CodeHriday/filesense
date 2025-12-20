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
 * @param {Object} context - Execution context (includes RDM data, variables, etc.)
 * @returns {any} - Transformed value
 */
function applyTransformation(transformationType, value, params = {}, context = {}) {
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
      
      case 'if':
        return ifCondition(value, params);
      
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
      
      case 'rdm_crosswalk_lookup':
        return rdmCrosswalkLookup(value, params, context);
      
      case 'rdm_dataset_join':
        return rdmDatasetJoin(value, params, context);
      
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
 * Ensures all values are converted to primitive strings to avoid [object Object] issues
 */
function concat(value, params) {
  const { fields = [], separator = '', prefix = '', suffix = '', concatParts = [] } = params;
  
  // Helper to safely convert value to string
  const toSafeString = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      // Handle objects (e.g., nested JSON) by serializing or returning empty
      try {
        return JSON.stringify(val);
      } catch (e) {
        return '';
      }
    }
    return String(val);
  };
  
  // NEW FORMAT: Use concatParts to maintain proper ordering of fields and literals
  if (concatParts.length > 0) {
    const parts = concatParts.map(part => {
      if (part.type === 'field') {
        return toSafeString(value[part.value]);
      } else if (part.type === 'literal') {
        return String(part.value ?? '');
      } else if (part.type === 'variable') {
        // Variables should be in the enriched row as $var_name
        return toSafeString(value[part.value]);
      }
      return '';
    });
    return prefix + parts.join('') + suffix;
  }
  
  // LEGACY FORMAT: Use fields with separator
  if (fields.length > 0) {
    // Concatenate multiple fields (value is a row object)
    const values = fields.map(field => toSafeString(value[field]));
    return prefix + values.join(separator) + suffix;
  }
  
  // Single value with prefix/suffix
  return prefix + toSafeString(value) + suffix;
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
 * Conditional logic (CASE WHEN) - Enhanced with additional operators
 */
function caseWhen(value, params) {
  const { conditions = [], defaultValue = null } = params;
  
  // conditions format: [{ operator: 'equals', compareValue: 'X', result: 'Y' }, ...]
  for (const condition of conditions) {
    const { operator, compareValue, result } = condition;
    
    let matches = false;
    
    switch (operator) {
      case 'equals':
      case '=':
        matches = value == compareValue;
        break;
      case 'not_equals':
      case '!=':
        matches = value != compareValue;
        break;
      case 'greater_than':
      case '>':
        matches = parseFloat(value) > parseFloat(compareValue);
        break;
      case 'less_than':
      case '<':
        matches = parseFloat(value) < parseFloat(compareValue);
        break;
      case 'greater_than_or_equal':
      case '>=':
        matches = parseFloat(value) >= parseFloat(compareValue);
        break;
      case 'less_than_or_equal':
      case '<=':
        matches = parseFloat(value) <= parseFloat(compareValue);
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
 * IF conditional logic - Simple if-then-else
 * @param {any} value - The value to evaluate
 * @param {Object} params - Parameters including operator, compareValue, thenValue, elseValue
 * @returns {any} - The result based on the condition
 */
function ifCondition(value, params) {
  const { 
    operator = 'equals', 
    compareValue = null, 
    thenValue = null, 
    elseValue = null 
  } = params;
  
  let condition = false;
  
  switch (operator) {
    case 'equals':
    case '=':
      condition = value == compareValue;
      break;
    case 'not_equals':
    case '!=':
      condition = value != compareValue;
      break;
    case 'greater_than':
    case '>':
      condition = parseFloat(value) > parseFloat(compareValue);
      break;
    case 'less_than':
    case '<':
      condition = parseFloat(value) < parseFloat(compareValue);
      break;
    case 'greater_than_or_equal':
    case '>=':
      condition = parseFloat(value) >= parseFloat(compareValue);
      break;
    case 'less_than_or_equal':
    case '<=':
      condition = parseFloat(value) <= parseFloat(compareValue);
      break;
    case 'contains':
      condition = String(value).includes(String(compareValue));
      break;
    case 'starts_with':
      condition = String(value).startsWith(String(compareValue));
      break;
    case 'ends_with':
      condition = String(value).endsWith(String(compareValue));
      break;
    case 'is_null':
      condition = value === null || value === undefined || value === '';
      break;
    case 'is_not_null':
      condition = value !== null && value !== undefined && value !== '';
      break;
    default:
      // If no specific operator, treat value as boolean
      condition = Boolean(value);
  }
  
  return condition ? thenValue : elseValue;
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
  const { addValue = 0, mathParts = [], fields = [] } = params;
  
  // NEW FORMAT: Use mathParts to handle multiple fields/variables/literals
  if (mathParts.length >= 2) {
    let result = 0;
    for (const part of mathParts) {
      if (part.type === 'field') {
        result += parseFloat(value[part.value]) || 0;
      } else if (part.type === 'literal') {
        result += parseFloat(part.value) || 0;
      } else if (part.type === 'variable') {
        // Variables are in enriched row as $var_name
        result += parseFloat(value[part.value]) || 0;
      }
    }
    return result;
  }
  
  // LEGACY FORMAT: Single value with addValue param
  const num1 = parseFloat(value) || 0;
  const num2 = parseFloat(addValue) || 0;
  
  return num1 + num2;
}

/**
 * Math operations - Subtract
 */
function mathSubtract(value, params) {
  const { subtractValue = 0, mathParts = [] } = params;
  
  // NEW FORMAT: Use mathParts to handle multiple fields/variables/literals
  if (mathParts.length >= 2) {
    let result = null;
    for (let i = 0; i < mathParts.length; i++) {
      const part = mathParts[i];
      let partValue = 0;
      
      if (part.type === 'field') {
        partValue = parseFloat(value[part.value]) || 0;
      } else if (part.type === 'literal') {
        partValue = parseFloat(part.value) || 0;
      } else if (part.type === 'variable') {
        partValue = parseFloat(value[part.value]) || 0;
      }
      
      if (i === 0) {
        result = partValue; // First value
      } else {
        result -= partValue; // Subtract subsequent values
      }
    }
    return result;
  }
  
  // LEGACY FORMAT: Single value with subtractValue param
  const num1 = parseFloat(value) || 0;
  const num2 = parseFloat(subtractValue) || 0;
  
  return num1 - num2;
}

/**
 * Math operations - Multiply
 */
function mathMultiply(value, params) {
  const { multiplyBy = 1, mathParts = [] } = params;
  
  // NEW FORMAT: Use mathParts to handle multiple fields/variables/literals
  if (mathParts.length >= 2) {
    let result = 1;
    for (const part of mathParts) {
      if (part.type === 'field') {
        result *= parseFloat(value[part.value]) || 0;
      } else if (part.type === 'literal') {
        result *= parseFloat(part.value) || 0;
      } else if (part.type === 'variable') {
        result *= parseFloat(value[part.value]) || 0;
      }
    }
    return result;
  }
  
  // LEGACY FORMAT: Single value with multiplyBy param
  const num1 = parseFloat(value) || 0;
  const num2 = parseFloat(multiplyBy) || 1;
  
  return num1 * num2;
}

/**
 * Math operations - Divide
 */
function mathDivide(value, params) {
  const { divideBy = 1, mathParts = [] } = params;
  
  // NEW FORMAT: Use mathParts to handle multiple fields/variables/literals
  if (mathParts.length >= 2) {
    let result = null;
    for (let i = 0; i < mathParts.length; i++) {
      const part = mathParts[i];
      let partValue = 0;
      
      if (part.type === 'field') {
        partValue = parseFloat(value[part.value]) || 0;
      } else if (part.type === 'literal') {
        partValue = parseFloat(part.value) || 0;
      } else if (part.type === 'variable') {
        partValue = parseFloat(value[part.value]) || 0;
      }
      
      if (i === 0) {
        result = partValue; // First value
      } else {
        if (partValue === 0) {
          systemLogger.warn('Division by zero attempted');
          return null;
        }
        result /= partValue; // Divide by subsequent values
      }
    }
    return result;
  }
  
  // LEGACY FORMAT: Single value with divideBy param
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
 * RDM Crosswalk Lookup - lookup a value in an RDM crosswalk table
 * This transformation requires RDM context to be preloaded
 */
function rdmCrosswalkLookup(value, params, context = {}) {
  const { 
    rdmCrosswalkId, 
    sourceField = 'source_code',
    targetField = 'target_code', 
    defaultValue = null,
    caseInsensitive = true
  } = params;
  
  if (!rdmCrosswalkId) {
    systemLogger.warn('rdm_crosswalk_lookup: rdmCrosswalkId is required');
    return defaultValue;
  }
  
  // Get preloaded crosswalk data from context
  const rdmData = context.rdm || {};
  const crosswalkData = rdmData.crosswalks?.[rdmCrosswalkId];
  
  if (!crosswalkData) {
    systemLogger.warn(`rdm_crosswalk_lookup: Crosswalk ${rdmCrosswalkId} not found in context`);
    return defaultValue;
  }
  
  if (!crosswalkData.map) {
    systemLogger.warn(`rdm_crosswalk_lookup: Crosswalk ${rdmCrosswalkId} has no mapping data`);
    return defaultValue;
  }
  
  // Perform lookup
  const lookupKey = caseInsensitive ? String(value).toLowerCase() : String(value);
  const result = crosswalkData.map.get(lookupKey);
  
  if (result && result[targetField] !== undefined) {
    return result[targetField];
  }
  
  return defaultValue !== null ? defaultValue : value;
}

/**
 * RDM Dataset Join - enrich row with data from RDM reference dataset
 * This transformation requires RDM context to be preloaded
 */
function rdmDatasetJoin(value, params, context = {}) {
  const { 
    rdmDatasetId,
    join = {},
    selectFields = [],
    prefix = 'rdm_',
    defaultValue = null
  } = params;
  
  const { sourceField, datasetField, joinType = 'left' } = join;
  
  if (!rdmDatasetId) {
    systemLogger.warn('rdm_dataset_join: rdmDatasetId is required');
    return defaultValue;
  }
  
  if (!sourceField || !datasetField) {
    systemLogger.warn('rdm_dataset_join: sourceField and datasetField are required in join config');
    return defaultValue;
  }
  
  // Get preloaded dataset from context
  const rdmData = context.rdm || {};
  const datasetData = rdmData.datasets?.[rdmDatasetId];
  
  if (!datasetData) {
    systemLogger.warn(`rdm_dataset_join: Dataset ${rdmDatasetId} not found in context`);
    return defaultValue;
  }
  
  if (!datasetData.map) {
    systemLogger.warn(`rdm_dataset_join: Dataset ${rdmDatasetId} has no mapping data`);
    return defaultValue;
  }
  
  // value should be the full row object for this transformation
  const joinKey = String(value[sourceField]).toLowerCase();
  const datasetRow = datasetData.map.get(joinKey);
  
  if (!datasetRow) {
    // No match found - return based on join type
    if (joinType === 'inner') {
      return null; // Inner join - exclude row
    }
    return defaultValue; // Left join - continue with default
  }
  
  // Build enriched object
  const enrichedData = {};
  
  if (selectFields && selectFields.length > 0) {
    // Only select specified fields
    selectFields.forEach(field => {
      enrichedData[`${prefix}${field}`] = datasetRow[field];
    });
  } else {
    // Select all fields from dataset (except join field)
    Object.keys(datasetRow).forEach(key => {
      if (key !== datasetField) {
        enrichedData[`${prefix}${key}`] = datasetRow[key];
      }
    });
  }
  
  return enrichedData;
}

/**
 * Apply multiple transformations in sequence
 * @param {any} value - Input value
 * @param {Array} transformations - Array of transformation definitions
 * @param {Object} context - Execution context (includes RDM data, variables, etc.)
 * @returns {any} - Final transformed value
 */
function applyTransformationChain(value, transformations, context = {}) {
  let result = value;
  
  for (const transform of transformations) {
    result = applyTransformation(transform.type, result, transform.params || {}, context);
  }
  
  return result;
}

/**
 * Transform a complete row of data with variables support
 * @param {Object} row - Input row
 * @param {Object} fieldMappings - Field mapping configuration
 * @param {Array} variables - Variable definitions (optional)
 * @param {Object} context - Execution context (includes RDM data, variables, etc.)
 * @returns {Object} - Transformed row
 */
function transformRow(row, fieldMappings, variables = [], context = {}) {
  // If no field mappings provided, pass through original row
  if (!fieldMappings || fieldMappings.length === 0) {
    return row;
  }
  
  // Step 1: Evaluate variables sequentially (they can reference previous variables)
  const variableValues = {};
  const enrichedRow = { ...row };
  
  if (variables && variables.length > 0) {
    for (const variable of variables) {
      const { name, sourceFields = [], transformations = [], data_type } = variable;
      
      let value;
      
      // Variables can reference source fields, other variables, or be system-generated
      if (sourceFields && sourceFields.length > 0) {
        // PRIORITY 1: Check if transformations require row-level context (concat/coalesce/math with multiple fields)
        const isMathWithMultipleFields = transformations.length > 0 && 
          (transformations[0].type === 'math_add' || transformations[0].type === 'math_subtract' || 
           transformations[0].type === 'math_multiply' || transformations[0].type === 'math_divide') &&
          transformations[0].params && transformations[0].params.mathParts && transformations[0].params.mathParts.length >= 2;
        
        if (transformations.length > 0 && (transformations[0].type === 'concat' || transformations[0].type === 'coalesce' || isMathWithMultipleFields)) {
          // Multi-field operations - pass enriched row and transformations are applied inside
          // DO NOT apply transformations again (already applied with row context)
          value = applyTransformationChain(enrichedRow, transformations, context);
        } else {
          // PRIORITY 2: Check if source is a variable reference
          const firstSource = sourceFields[0];
          if (firstSource.startsWith('$')) {
            // Reference to another variable
            const varName = firstSource.substring(1);
            value = variableValues[varName];
            // Apply transformations to variable value
            value = applyTransformationChain(value, transformations, context);
          } else {
            // Single field reference
            value = enrichedRow[firstSource];
            // Apply transformations to single field value
            value = applyTransformationChain(value, transformations, context);
          }
        }
      } else {
        // System-generated or static value
        value = applyTransformationChain(null, transformations, context);
      }
      
      // Apply data type conversion if specified
      if (data_type && data_type !== '') {
        value = cast(value, { targetType: data_type });
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
      // PRIORITY 1: Check if transformations require row-level context (concat/coalesce/math with multiple fields)
      const isMathWithMultipleFields = transformations.length > 0 && 
        (transformations[0].type === 'math_add' || transformations[0].type === 'math_subtract' || 
         transformations[0].type === 'math_multiply' || transformations[0].type === 'math_divide') &&
        transformations[0].params && transformations[0].params.mathParts && transformations[0].params.mathParts.length >= 2;
      
      if (transformations.length > 0 && (transformations[0].type === 'concat' || transformations[0].type === 'coalesce' || isMathWithMultipleFields)) {
        // Multi-field operations - pass enriched row
        value = applyTransformationChain(enrichedRow, transformations, context);
      } else {
        // PRIORITY 2: Check if source is a variable reference
        const firstSource = sourceFields[0];
        
        if (firstSource.startsWith('$')) {
          // Variable reference
          const varName = firstSource.substring(1);
          value = variableValues[varName];
          value = applyTransformationChain(value, transformations, context);
        } else {
          // Use first source field
          value = enrichedRow[firstSource];
          value = applyTransformationChain(value, transformations, context);
        }
      }
    } else {
      // Static or system-generated value
      value = applyTransformationChain(null, transformations, context);
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
