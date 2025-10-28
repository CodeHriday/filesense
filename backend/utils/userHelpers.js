/**
 * User Helper Utilities
 * Helper functions for user classification and permissions
 */

/**
 * Check if a user is a vendor based on user attributes
 * @param {Object} user - User object with internal_user and user_type fields
 * @returns {boolean} True if user is a vendor
 */
function isVendorUser(user) {
  if (!user) return false;
  
  // A vendor user is identified by:
  // 1. internal_user is false (external user)
  // 2. user_type is 'Vendor'
  return user.internal_user === false && user.user_type === 'Vendor';
}

/**
 * Check if a user is an internal user
 * @param {Object} user - User object with internal_user field
 * @returns {boolean} True if user is internal
 */
function isInternalUser(user) {
  if (!user) return false;
  
  // Default to true if internal_user field is not set (backwards compatibility)
  return user.internal_user !== false;
}

/**
 * Get user type description
 * @param {Object} user - User object
 * @returns {string} User type description
 */
function getUserTypeDescription(user) {
  if (!user) return 'Unknown';
  
  if (isVendorUser(user)) {
    return 'Vendor';
  }
  
  if (user.user_type) {
    return user.user_type;
  }
  
  return user.internal_user === false ? 'External' : 'Internal';
}

module.exports = {
  isVendorUser,
  isInternalUser,
  getUserTypeDescription
};
