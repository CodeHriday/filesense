/**
 * Format a file size in bytes to a human-readable string
 * @param {number} bytes - The size in bytes
 * @param {number} decimals - The number of decimal places (default: 2)
 * @returns {string} Formatted size string
 */
export const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * Format a date string to a localized date and time
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string
 */
export const formatDate = (dateString) => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

/**
 * Calculate time elapsed since a given date and format as readable string
 * @param {string} dateString - ISO date string
 * @returns {string} Readable elapsed time
 */
export const getTimeSince = (dateString) => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const now = new Date();
  const secondsPast = (now.getTime() - date.getTime()) / 1000;
  
  if (secondsPast < 60) {
    return `${Math.round(secondsPast)}s ago`;
  }
  if (secondsPast < 3600) {
    return `${Math.round(secondsPast / 60)}m ago`;
  }
  if (secondsPast < 86400) {
    return `${Math.round(secondsPast / 3600)}h ago`;
  }
  if (secondsPast < 604800) {
    return `${Math.round(secondsPast / 86400)}d ago`;
  }
  if (secondsPast < 2592000) {
    return `${Math.round(secondsPast / 604800)}w ago`;
  }
  if (secondsPast < 31536000) {
    return `${Math.round(secondsPast / 2592000)}mo ago`;
  }
  
  return `${Math.round(secondsPast / 31536000)}y ago`;
};

/**
 * Format a number with thousands separators
 * @param {number} num - The number to format
 * @returns {string} Formatted number string
 */
export const formatNumber = (num) => {
  if (num === null || num === undefined) return '';
  
  // Use a safer approach to prevent ReDoS - use built-in toLocaleString instead of regex
  const numValue = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(numValue)) return num.toString();
  
  return numValue.toLocaleString('en-US');
};

/**
 * Format a number to have a fixed number of decimal places
 * @param {number|string} value - The number to format
 * @param {number} decimals - The number of decimal places (default: 2)
 * @returns {string} Formatted number string with fixed decimal places
 */
export const formatDecimal = (value, decimals = 2) => {
  if (value === null || value === undefined || value === '') return '0.00';
  
  // Convert to number if it's a string
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  // Check if it's a valid number
  if (isNaN(num)) return '0.00';
  
  // Return with fixed decimal places
  return num.toFixed(decimals);
};

/**
 * Format a date in the future as a relative time string
 * @param {Date} date - The future date to format
 * @returns {string} Formatted relative time string
 */
export const formatRelativeTime = (date) => {
  if (!date) return '';
  
  const now = new Date();
  
  // If the date is in the past, use getTimeSince
  if (date < now) {
    return getTimeSince(date);
  }
  
  const secondsUntil = (date.getTime() - now.getTime()) / 1000;
  
  if (secondsUntil < 60) {
    return 'in a few seconds';
  }
  if (secondsUntil < 3600) {
    return `in ${Math.round(secondsUntil / 60)} minutes`;
  }
  if (secondsUntil < 86400) {
    return `in ${Math.round(secondsUntil / 3600)} hours`;
  }
  if (secondsUntil < 604800) {
    return `in ${Math.round(secondsUntil / 86400)} days`;
  }
  if (secondsUntil < 2592000) {
    return `in ${Math.round(secondsUntil / 604800)} weeks`;
  }
  if (secondsUntil < 31536000) {
    return `in ${Math.round(secondsUntil / 2592000)} months`;
  }
  
  return `in ${Math.round(secondsUntil / 31536000)} years`;
};

/**
 * Format a timestamp with microseconds for job logs
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string with microseconds
 */
export const formatTimestampWithMicroseconds = (dateString) => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  
  // Get the standard date/time part
  const formatted = date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  // Extract milliseconds and format as microseconds (3 decimal places)
  const ms = date.getMilliseconds();
  const microseconds = ms.toString().padStart(3, '0');
  
  return `${formatted}.${microseconds}`;
};

/**
 * Format a field name from snake_case to Title Case
 * @param {string} fieldName - The field name in snake_case
 * @returns {string} Formatted field name in Title Case
 */
const formatFieldName = (fieldName) => {
  if (!fieldName) return '';
  return fieldName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Format a value for display (handles dates, null, objects)
 * @param {*} value - The value to format
 * @returns {string} Formatted value string
 */
const formatDisplayValue = (value) => {
  if (value === null || value === undefined) return 'empty';
  if (value === '') return 'empty';
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
 * Format a changes summary from JSON to human-readable text
 * Handles vendor agreement change history records
 * @param {string|object} summary - The changes_summary value (can be JSON string or object)
 * @returns {string} Human-readable summary
 */
export const formatChangeSummary = (summary) => {
  if (!summary) return '-';
  
  if (typeof summary !== 'string' || (!summary.startsWith('{') && !summary.startsWith('['))) {
    return summary;
  }
  
  try {
    const changes = JSON.parse(summary);
    
    if (changes.approval_reset) {
      const fieldsChanged = changes.fields_changed || [];
      const resetTo = changes.reset_to || 'pending';
      const prevStatus = changes.previous_approval_status || 'unknown';
      
      if (fieldsChanged.length > 0) {
        const fieldNames = fieldsChanged.map(f => formatFieldName(f)).join(', ');
        return `Approval reset (${formatFieldName(prevStatus)} \u2192 ${formatFieldName(resetTo)}). Modified: ${fieldNames}`;
      }
      return `Approval reset from ${formatFieldName(prevStatus)} to ${formatFieldName(resetTo)}`;
    }
    
    if (Array.isArray(changes)) {
      if (changes.length === 0) return 'No changes recorded';
      return changes.map(field => formatFieldName(field)).join(', ');
    }
    
    const entries = Object.entries(changes);
    if (entries.length === 0) return 'No changes recorded';
    
    if (entries.length <= 3) {
      const details = entries.map(([field, value]) => {
        if (value && typeof value === 'object' && 'from' in value && 'to' in value) {
          return `${formatFieldName(field)}: ${formatDisplayValue(value.from)} \u2192 ${formatDisplayValue(value.to)}`;
        }
        return formatFieldName(field);
      });
      return details.join('; ');
    }
    
    const fieldNames = entries.map(([field]) => formatFieldName(field));
    return `Updated ${entries.length} fields: ${fieldNames.join(', ')}`;
    
  } catch {
    return summary;
  }
};