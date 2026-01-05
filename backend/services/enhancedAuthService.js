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
    
    // If lockout period has expired, reset the lockout
    if (user.locked_until && !lockStatus.locked) {
      const resetValues = passwordSecurity.resetFailedAttempts();
      await db.query(
        `UPDATE users 
         SET failed_login_attempts = $1, 
             locked_until = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [resetValues.attempts, resetValues.lockUntil, user.id]
      );
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
    
    // Check if user must change password (e.g., after admin unlock)
    if (user.must_change_password) {
      // Generate a short-lived token specifically for password change
      const jwt = require('jsonwebtoken');
      const { SECURITY_CONFIG } = require('../src/config/environment');
      
      const passwordChangeToken = jwt.sign(
        { 
          userId: user.id, 
          purpose: 'password_change_only',
          username: user.username
        },
        SECURITY_CONFIG.JWT_SECRET,
        { expiresIn: '10m' } // Short-lived token - 10 minutes only
      );
      
      return {
        success: true,
        requiresPasswordChange: true,
        message: 'You must change your password before continuing',
        userId: user.id,
        username: user.username,
        passwordChangeToken: passwordChangeToken
      };
    }
    
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
    internal_user = false,
    user_type,
    roles = []
  } = userData;
  
  // Validate required fields first (outside transaction)
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
  
  // Validate phone number if provided
  if (phone_number) {
    if (!/^\d*$/.test(phone_number)) {
      return {
        success: false,
        message: 'Phone number can only contain numeric digits',
        field: 'phone_number'
      };
    }
    if (phone_number.length > 10) {
      return {
        success: false,
        message: 'Phone number cannot exceed 10 digits',
        field: 'phone_number'
      };
    }
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
  
  // Check if username exists (case-insensitive) - outside transaction
  const existingUser = await db.query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
    [username, email]
  );
  
  if (existingUser.rows.length > 0) {
    return {
      success: false,
      message: 'Username or email already exists'
    };
  }
  
  // Hash password before transaction
  const hashedPassword = await bcrypt.hash(password, 10);
  const passwordHistory = passwordSecurity.addToPasswordHistory(hashedPassword, []);
  
  try {
    // Use db.transaction for proper transaction handling
    const result = await db.transaction(async (client) => {
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
          failed_login_attempts,
          internal_user,
          user_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, username, email, first_name, last_name, auth_provider, internal_user, user_type
      `;
      
      const userResult = await client.query(insertQuery, [
        username,
        hashedPassword,
        email,
        first_name || null,
        last_name || null,
        middle_name || null,
        phone_number || null,
        'local',
        JSON.stringify(passwordHistory),
        0,
        internal_user,
        user_type || null
      ]);
      
      const newUser = userResult.rows[0];
      
      // Assign roles to the user
      if (roles && roles.length > 0) {
        for (const role of roles) {
          const roleIdentifier = typeof role === 'string' ? role : role;
          const isNumeric = !isNaN(roleIdentifier);
          
          let roleId;
          
          if (isNumeric) {
            const roleResult = await client.query(
              'SELECT id FROM roles WHERE id = $1',
              [roleIdentifier]
            );
            if (roleResult.rows.length > 0) {
              roleId = roleResult.rows[0].id;
            }
          } else {
            const roleResult = await client.query(
              'SELECT id FROM roles WHERE name = $1',
              [roleIdentifier]
            );
            if (roleResult.rows.length > 0) {
              roleId = roleResult.rows[0].id;
            }
          }
          
          if (roleId) {
            await client.query(
              'INSERT INTO user_roles (user_id, role_id, created_at) VALUES ($1, $2, NOW())',
              [newUser.id, roleId]
            );
          } else {
            console.warn(`Role '${roleIdentifier}' not found in database, skipping assignment`);
          }
        }
      }
      
      return newUser;
    });
    
    return {
      success: true,
      user: {
        ...result,
        roles
      }
    };
    
  } catch (error) {
    console.error('Error registering user:', error);
    throw error;
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
    
    // Update user (password_history is jsonb, pass array directly, not stringified)
    const updateResult = await db.query(
      `UPDATE users 
       SET password = $1, 
           password_history = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, username, email`,
      [hashedPassword, updatedHistory, userId]
    );
    
    // Verify the update succeeded
    if (updateResult.rows.length === 0) {
      console.error(`Password update failed for user ID ${userId} - no rows updated`);
      return {
        success: false,
        message: 'Failed to update password in database'
      };
    }
    
    console.log(`Password successfully updated for user: ${updateResult.rows[0].username} (ID: ${userId})`);
    
    return {
      success: true,
      message: 'Password changed successfully',
      user: updateResult.rows[0]
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
