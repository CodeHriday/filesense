/**
 * Password Security Utilities
 * Handles password validation, strength checking, history, and account lockout
 * for local authentication users only
 */

const bcrypt = require('bcrypt');

// Password Policy Configuration
const PASSWORD_CONFIG = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  historyCount: 5,  // Prevent reuse of last 5 passwords
  maxFailedAttempts: 5,
  lockoutDurationMinutes: 15
};

/**
 * Validate password against strong password requirements
 * @param {string} password - The password to validate
 * @returns {object} - { valid: boolean, errors: string[], strength: string }
 */
function validatePasswordStrength(password) {
  const errors = [];
  let strength = 'weak';
  
  if (!password) {
    return { valid: false, errors: ['Password is required'], strength: 'none' };
  }
  
  // Check minimum length
  if (password.length < PASSWORD_CONFIG.minLength) {
    errors.push(`Password must be at least ${PASSWORD_CONFIG.minLength} characters long`);
  }
  
  // Check uppercase
  if (PASSWORD_CONFIG.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  // Check lowercase
  if (PASSWORD_CONFIG.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  // Check numbers
  if (PASSWORD_CONFIG.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  // Check special characters
  if (PASSWORD_CONFIG.requireSpecialChars) {
    const specialCharsRegex = new RegExp(`[${PASSWORD_CONFIG.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`);
    if (!specialCharsRegex.test(password)) {
      errors.push('Password must contain at least one special character (!@#$%^&*...)');
    }
  }
  
  // Calculate password strength
  let strengthScore = 0;
  if (password.length >= 12) strengthScore++;
  if (password.length >= 16) strengthScore++;
  if (/[A-Z]/.test(password)) strengthScore++;
  if (/[a-z]/.test(password)) strengthScore++;
  if (/[0-9]/.test(password)) strengthScore++;
  if (new RegExp(`[${PASSWORD_CONFIG.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(password)) strengthScore++;
  if (password.length >= 20) strengthScore++;
  
  if (strengthScore <= 3) strength = 'weak';
  else if (strengthScore <= 5) strength = 'medium';
  else strength = 'strong';
  
  return {
    valid: errors.length === 0,
    errors,
    strength,
    score: strengthScore
  };
}

/**
 * Check if password was used in recent history
 * @param {string} password - The new password
 * @param {Array} passwordHistory - Array of hashed previous passwords
 * @returns {Promise<boolean>} - true if password was used before
 */
async function isPasswordInHistory(password, passwordHistory = []) {
  if (!passwordHistory || passwordHistory.length === 0) {
    return false;
  }
  
  for (const oldPasswordHash of passwordHistory) {
    const matches = await bcrypt.compare(password, oldPasswordHash);
    if (matches) {
      return true;
    }
  }
  
  return false;
}

/**
 * Add password to history
 * @param {string} passwordHash - The hashed password to add
 * @param {Array} currentHistory - Current password history array
 * @returns {Array} - Updated history (limited to last N passwords)
 */
function addToPasswordHistory(passwordHash, currentHistory = []) {
  const history = Array.isArray(currentHistory) ? [...currentHistory] : [];
  history.unshift(passwordHash);
  
  // Keep only the most recent passwords
  return history.slice(0, PASSWORD_CONFIG.historyCount);
}

/**
 * Check if account is currently locked
 * @param {object} user - User object with locked_until field
 * @returns {object} - { locked: boolean, remainingTime: number }
 */
function isAccountLocked(user) {
  if (!user.locked_until) {
    return { locked: false, remainingTime: 0 };
  }
  
  const now = new Date();
  const lockUntil = new Date(user.locked_until);
  
  if (now < lockUntil) {
    const remainingMs = lockUntil - now;
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    return { locked: true, remainingTime: remainingMinutes };
  }
  
  return { locked: false, remainingTime: 0 };
}

/**
 * Calculate lockout end time
 * @returns {Date} - Timestamp when account should be unlocked
 */
function calculateLockoutTime() {
  const now = new Date();
  return new Date(now.getTime() + PASSWORD_CONFIG.lockoutDurationMinutes * 60000);
}

/**
 * Increment failed login attempts
 * @param {number} currentAttempts - Current failed attempt count
 * @returns {object} - { attempts: number, shouldLock: boolean, lockUntil: Date|null }
 */
function incrementFailedAttempts(currentAttempts = 0) {
  const newAttempts = currentAttempts + 1;
  const shouldLock = newAttempts >= PASSWORD_CONFIG.maxFailedAttempts;
  
  return {
    attempts: newAttempts,
    shouldLock,
    lockUntil: shouldLock ? calculateLockoutTime() : null
  };
}

/**
 * Reset failed login attempts (called on successful login)
 * @returns {object} - Reset values
 */
function resetFailedAttempts() {
  return {
    attempts: 0,
    lockUntil: null
  };
}

/**
 * Get password requirements for display to users
 * @returns {object} - Password requirements
 */
function getPasswordRequirements() {
  return {
    minLength: PASSWORD_CONFIG.minLength,
    requireUppercase: PASSWORD_CONFIG.requireUppercase,
    requireLowercase: PASSWORD_CONFIG.requireLowercase,
    requireNumbers: PASSWORD_CONFIG.requireNumbers,
    requireSpecialChars: PASSWORD_CONFIG.requireSpecialChars,
    historyCount: PASSWORD_CONFIG.historyCount,
    maxFailedAttempts: PASSWORD_CONFIG.maxFailedAttempts,
    lockoutDurationMinutes: PASSWORD_CONFIG.lockoutDurationMinutes
  };
}

module.exports = {
  validatePasswordStrength,
  isPasswordInHistory,
  addToPasswordHistory,
  isAccountLocked,
  calculateLockoutTime,
  incrementFailedAttempts,
  resetFailedAttempts,
  getPasswordRequirements,
  PASSWORD_CONFIG
};
