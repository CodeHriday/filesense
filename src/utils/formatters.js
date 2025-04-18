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
    minute: '2-digit'
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
  
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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