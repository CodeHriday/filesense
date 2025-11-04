/**
 * Filename Pattern Validator
 * 
 * Simple substring-based validation:
 * 1. Expected base filename (without extension) must be contained in uploaded base filename
 * 2. File extensions must match exactly
 * 
 * Examples:
 * - Contract: supply_chain_data.csv, Upload: supply_chain_data_20081981.csv → MATCH ✓
 * - Contract: supply_chain_data.csv, Upload: supply_chain_data.xlsx → FAIL (wrong extension) ✗
 * - Contract: supply_chain_data.csv, Upload: orders_data.csv → FAIL (name mismatch) ✗
 */

/**
 * Validate uploaded filename against expected pattern
 * 
 * @param {string} actualFilename - The uploaded filename (e.g., "supply_chain_data_20081981.csv")
 * @param {string} expectedPattern - The expected filename from contract (e.g., "supply_chain_data.csv")
 * @returns {object} Validation result with { valid: boolean, message: string, expectedBase: string, actualBase: string, expectedExt: string, actualExt: string }
 */
function validateFilename(actualFilename, expectedPattern) {
  if (!expectedPattern) {
    return {
      valid: true,
      message: 'No filename pattern defined'
    };
  }

  // Extract base name and extension from expected pattern
  const expectedLastDot = expectedPattern.lastIndexOf('.');
  const expectedBase = expectedLastDot === -1 
    ? expectedPattern 
    : expectedPattern.substring(0, expectedLastDot);
  const expectedExt = expectedLastDot === -1 
    ? '' 
    : expectedPattern.substring(expectedLastDot);

  // Extract base name and extension from actual filename
  const actualLastDot = actualFilename.lastIndexOf('.');
  const actualBase = actualLastDot === -1 
    ? actualFilename 
    : actualFilename.substring(0, actualLastDot);
  const actualExt = actualLastDot === -1 
    ? '' 
    : actualFilename.substring(actualLastDot);

  // Case-insensitive comparison
  const expectedBaseLower = expectedBase.toLowerCase();
  const actualBaseLower = actualBase.toLowerCase();
  const expectedExtLower = expectedExt.toLowerCase();
  const actualExtLower = actualExt.toLowerCase();

  // Check 1: Extension must match exactly
  if (expectedExtLower !== actualExtLower) {
    return {
      valid: false,
      message: `File extension mismatch. Expected: "${expectedExt}", but got: "${actualExt}"`,
      expectedBase,
      actualBase,
      expectedExt,
      actualExt
    };
  }

  // Check 2: Expected base name must be contained in actual base name (substring match)
  if (!actualBaseLower.includes(expectedBaseLower)) {
    return {
      valid: false,
      message: `Filename mismatch. Expected base filename "${expectedBase}" not found in uploaded filename "${actualBase}"`,
      expectedBase,
      actualBase,
      expectedExt,
      actualExt
    };
  }

  // All checks passed
  return {
    valid: true,
    message: 'Filename validation passed',
    expectedBase,
    actualBase,
    expectedExt,
    actualExt
  };
}

module.exports = {
  validateFilename
};
