/**
 * Enhanced Authentication Service
 * Extends existing auth service with account lockout, password validation,
 * and Okta SSO support
 */

const bcrypt = require('bcrypt');
const db = require('../config/database');
const authService = require('../src/services/authService');
const passwordSecurity = require('../utils/passwordSecurity');

/**
 * Authenticate user with enhanced security (account lockout, auth provider support)
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string} userAgent - User agent string
 * @returns {Promise<Object>} Authentication result
 */
async function authenticateUserWithSecurity(username, password, userAgent) {
  try {
    // Get user from database
    const userQuery = `
      SELECT * FROM users 
      WHERE username = $1 OR email = $1
    `;
    const result = await db.query(userQuery, [username]);
    
    if (result.rows.length === 0) {
      return { 
        success: false, 
        message: 'Invalid username or password' 
      };
    }
    
    const user = result.rows[0];
    
    // Check auth provider - Okta users cannot login locally
    if (user.auth_provider && user.auth_provider !== 'local') {
      return {
        success: false,
        message: `This account uses ${user.auth_provider.toUpperCase()} SSO. Please use the SSO login button.`,
        useSso: true,
        ssoProvider: user.auth_provider
      };
    }
    
    // Check if account is locked
    const lockStatus = passwordSecurity.isAccountLocked(user);
    if (lockStatus.locked) {
      return {
        success: false,
        locked: true,
        message: `Account is locked due to too many failed login attempts. Please try again in ${lockStatus.remainingTime} minute(s).`,
        remainingTime: lockStatus.remainingTime
      };
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      // Increment failed login attempts
      const failedAttempts = passwordSecurity.incrementFailedAttempts(
        user.failed_login_attempts || 0
      );
      
      // Update failed attempts in database
      const updateQuery = `
        UPDATE users 
        SET 
          failed_login_attempts = $1,
          locked_until = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `;
      
      await db.query(updateQuery, [
        failedAttempts.attempts,
        failedAttempts.lockUntil,
        user.id
      ]);
      
      const attemptsLeft = passwordSecurity.PASSWORD_CONFIG.maxFailedAttempts - failedAttempts.attempts;
      
      if (failedAttempts.shouldLock) {
        return {
          success: false,
          locked: true,
          message: `Account has been locked due to too many failed login attempts. Please try again in ${passwordSecurity.PASSWORD_CONFIG.lockoutDurationMinutes} minutes.`
        };
      }
      
      return {
        success: false,
        message: `Invalid username or password. ${attemptsLeft} attempt(s) remaining before account lockout.`
      };
    }
    
    // Password is valid - reset failed attempts and update last login
    const resetValues = passwordSecurity.resetFailedAttempts();
    await db.query(
      `UPDATE users 
       SET failed_login_attempts = $1, 
           locked_until = $2, 
           last_login = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [resetValues.attempts, resetValues.lockUntil, user.id]
    );
    
    // Call original auth service to generate tokens
    // Note: This requires modifying the original validateCredentials to accept user object
    return authService.authenticateUser(username, password, userAgent);
    
  } catch (error) {
    console.error('Error in enhanced authentication:', error);
    throw error;
  }
}

/**
 * Validate and register new local user with enhanced password requirements
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} Registration result
 */
async function registerLocalUser(userData) {
  const {
    username,
    password,
    email,
    first_name,
    last_name,
    middle_name,
    phone_number,
    roles = []
  } = userData;
  
  const client = await db.pool.connect();
  
  try {
    // Validate required fields
    const errors = [];
    if (!username || username.trim() === '') {
      errors.push('Username is required');
    }
    if (!email || email.trim() === '') {
      errors.push('Email is required');
    }
    if (!password || password.trim() === '') {
      errors.push('Password is required');
    }
    
    if (errors.length > 0) {
      return {
        success: false,
        message: 'Validation failed',
        errors
      };
    }
    
    // Validate password strength
    const passwordValidation = passwordSecurity.validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return {
        success: false,
        errors: passwordValidation.errors,
        field: 'password'
      };
    }
    
    // Check if username exists (case-insensitive)
    const existingUser = await client.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
      [username, email]
    );
    
    if (existingUser.rows.length > 0) {
      return {
        success: false,
        message: 'Username or email already exists'
      };
    }
    
    // Start transaction
    await client.query('BEGIN');
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user with initial password history
    const passwordHistory = passwordSecurity.addToPasswordHistory(hashedPassword, []);
    
    const insertQuery = `
      INSERT INTO users (
        username,
        password,
        email,
        first_name,
        last_name,
        middle_name,
        phone_number,
        auth_provider,
        password_history,
        failed_login_attempts
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, username, email, first_name, last_name, auth_provider
    `;
    
    const result = await client.query(insertQuery, [
      username,
      hashedPassword,
      email,
      first_name || null,
      last_name || null,
      middle_name || null,
      phone_number || null,
      'local',
      JSON.stringify(passwordHistory),
      0
    ]);
    
    const newUser = result.rows[0];
    
    // Assign roles to the user
    if (roles && roles.length > 0) {
      for (const role of roles) {
        // Handle both role IDs (numbers) and role names (strings)
        const roleIdentifier = typeof role === 'string' ? role : role;
        const isNumeric = !isNaN(roleIdentifier);
        
        let roleId;
        
        if (isNumeric) {
          // If it's a numeric ID, verify it exists
          const roleResult = await client.query(
            'SELECT id FROM roles WHERE id = $1',
            [roleIdentifier]
          );
          
          if (roleResult.rows.length > 0) {
            roleId = roleResult.rows[0].id;
          }
        } else {
          // If it's a role name, look it up
          const roleResult = await client.query(
            'SELECT id FROM roles WHERE name = $1',
            [roleIdentifier]
          );
          
          if (roleResult.rows.length > 0) {
            roleId = roleResult.rows[0].id;
          }
        }
        
        if (roleId) {
          // Insert user_role mapping
          await client.query(
            'INSERT INTO user_roles (user_id, role_id, created_at) VALUES ($1, $2, NOW())',
            [newUser.id, roleId]
          );
        } else {
          console.warn(`Role '${roleIdentifier}' not found in database, skipping assignment`);
        }
      }
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    return {
      success: true,
      user: {
        ...newUser,
        roles
      }
    };
    
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Error registering user:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Change password with validation and history check
 * @param {number} userId - User ID
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} Password change result
 */
async function changePassword(userId, currentPassword, newPassword) {
  try {
    // Get user
    const userResult = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return { success: false, message: 'User not found' };
    }
    
    const user = userResult.rows[0];
    
    // Only local users can change passwords
    if (user.auth_provider !== 'local') {
      return {
        success: false,
        message: 'SSO users cannot change password here. Please use your SSO provider.'
      };
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return { success: false, message: 'Current password is incorrect' };
    }
    
    // Validate new password strength
    const validation = passwordSecurity.validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors
      };
    }
    
    // Check password history
    const passwordHistory = user.password_history || [];
    const isReused = await passwordSecurity.isPasswordInHistory(
      newPassword,
      passwordHistory
    );
    
    if (isReused) {
      return {
        success: false,
        message: `Password was recently used. Please choose a different password. Cannot reuse last ${passwordSecurity.PASSWORD_CONFIG.historyCount} passwords.`
      };
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password history
    const updatedHistory = passwordSecurity.addToPasswordHistory(
      hashedPassword,
      passwordHistory
    );
    
    // Update user
    await db.query(
      `UPDATE users 
       SET password = $1, 
           password_history = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [hashedPassword, JSON.stringify(updatedHistory), userId]
    );
    
    return {
      success: true,
      message: 'Password changed successfully'
    };
    
  } catch (error) {
    console.error('Error changing password:', error);
    throw error;
  }
}

/**
 * Get password requirements for frontend display
 */
function getPasswordRequirements() {
  return passwordSecurity.getPasswordRequirements();
}

module.exports = {
  authenticateUserWithSecurity,
  registerLocalUser,
  changePassword,
  getPasswordRequirements
};
