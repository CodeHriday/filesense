/**
 * Backend Formatting Utilities
 * Handles formatting of change summaries and other display values
 */

/**
 * Format a field name to be more human readable
 * @param {string} name - The field name (e.g., 'primary_contact_email')
 * @returns {string} Human readable name (e.g., 'Primary Contact Email')
 */
const formatFieldName = (name) => {
  if (!name) return '';
  
  return name
    .replace(/_id$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Format a value for display in change summaries
 * @param {any} value - The value to format
 * @returns {string} Formatted display value
 */
const formatDisplayValue = (value) => {
  if (value === null || value === undefined) return '(empty)';
  if (value === '') return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  
  const str = String(value);
  if (str.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
    try {
      const date = new Date(str);
      return date.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return str;
    }
  }
  
  if (str.length > 50) {
    return str.substring(0, 47) + '...';
  }
  return str;
};

/**
 * Format a changes object to human-readable summary text
 * @param {Object} changes - The changes object with field: {from, to} structure
 * @returns {string} Human-readable summary
 */
const formatChangeSummary = (changes) => {
  if (!changes) return 'No changes recorded';
  
  if (typeof changes === 'string') {
    if (!changes.startsWith('{') && !changes.startsWith('[')) {
      return changes;
    }
    
    try {
      changes = JSON.parse(changes);
    } catch {
      return changes;
    }
  }
  
  if (changes.approval_reset) {
    const fieldsChanged = changes.fields_changed || [];
    const resetTo = changes.reset_to || 'pending';
    const prevStatus = changes.previous_approval_status || 'unknown';
    
    if (fieldsChanged.length > 0) {
      const fieldNames = fieldsChanged.map(f => formatFieldName(f)).join(', ');
      return `Approval reset (${formatFieldName(prevStatus)} → ${formatFieldName(resetTo)}). Modified: ${fieldNames}`;
    }
    return `Approval reset from ${formatFieldName(prevStatus)} to ${formatFieldName(resetTo)}`;
  }
  
  if (Array.isArray(changes)) {
    if (changes.length === 0) return 'No changes recorded';
    return changes.map(field => formatFieldName(field)).join(', ');
  }
  
  const entries = Object.entries(changes);
  if (entries.length === 0) return 'No changes recorded';
  
  if (entries.length <= 5) {
    const details = entries.map(([field, value]) => {
      if (value && typeof value === 'object' && 'from' in value && 'to' in value) {
        return `${formatFieldName(field)}: ${formatDisplayValue(value.from)} → ${formatDisplayValue(value.to)}`;
      }
      return formatFieldName(field);
    });
    return details.join('\n');
  }
  
  const fieldNames = entries.map(([field]) => formatFieldName(field));
  return `Updated ${entries.length} fields: ${fieldNames.join(', ')}`;
};

module.exports = {
  formatFieldName,
  formatDisplayValue,
  formatChangeSummary
};
