/**
 * User Repository module
 * 
 * This module handles database access for user operations.
 */
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { SECURITY_CONFIG } = require('../config/environment');

/**
 * Find all users with optional filtering
 * @param {Object} filters - Filter parameters
 * @returns {Promise<Array>} Array of user objects
 */
const findAll = async (filters = {}) => {
  try {
    // Start building the query
    let queryText = `
      SELECT u.id, u.username, u.email, u.first_name, u.middle_name, u.last_name,
             u.auth_provider, u.phone_number,
             TRIM(CONCAT(u.first_name, ' ', COALESCE(u.middle_name, ''), ' ', u.last_name)) AS full_name,
             u.created_at, u.updated_at, u.last_login,
             u.internal_user, u.user_type,
             u.failed_login_attempts, u.locked_until, u.must_change_password,
             ARRAY_AGG(r.name) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
    `;
    
    const queryParams = [];
    let whereClause = '';
    
    // Apply filters if provided
    if (Object.keys(filters).length > 0) {
      const filterClauses = [];
      let paramIndex = 1;
      
      // Filter by username (partial match)
      if (filters.username) {
        filterClauses.push(`u.username ILIKE $${paramIndex++}`);
        queryParams.push(`%${filters.username}%`);
      }
      
      // Filter by email (partial match)
      if (filters.email) {
        filterClauses.push(`u.email ILIKE $${paramIndex++}`);
        queryParams.push(`%${filters.email}%`);
      }
      
      // Filter by role
      if (filters.role) {
        filterClauses.push(`r.name = $${paramIndex++}`);
        queryParams.push(filters.role);
      }
      
      // Global search across username, email, first_name, last_name
      if (filters.search) {
        const searchPattern = `%${filters.search}%`;
        filterClauses.push(`(u.username ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex})`);
        queryParams.push(searchPattern);
        paramIndex++;
      }
      
      // Add WHERE clause if we have filters
      if (filterClauses.length > 0) {
        whereClause = ' WHERE ' + filterClauses.join(' AND ');
      }
    }
    
    // Complete the query with GROUP BY and ORDER BY
    queryText += whereClause + ' GROUP BY u.id, u.internal_user, u.user_type, u.failed_login_attempts, u.locked_until, u.must_change_password ORDER BY u.created_at DESC';
    
    // Add pagination if provided
    if (filters.limit) {
      queryText += ` LIMIT $${queryParams.length + 1}`;
      queryParams.push(parseInt(filters.limit));
      
      if (filters.offset) {
        queryText += ` OFFSET $${queryParams.length + 1}`;
        queryParams.push(parseInt(filters.offset));
      }
    }
    
    const result = await db.query(queryText, queryParams);
    
    // Process the result to handle empty roles array
    return result.rows.map(user => ({
      ...user,
      roles: user.roles.filter(role => role !== null)
    }));
  } catch (error) {
    console.error('Error in userRepository.findAll:', error);
    throw new Error('Failed to fetch users');
  }
};

/**
 * Find a user by ID
 * @param {string} id - User ID
 * @returns {Promise<Object>} User object
 */
const findById = async (id) => {
  try {
    const query = `
      SELECT u.id, u.username, u.email, u.first_name, u.middle_name, u.last_name,
             u.auth_provider, u.phone_number,
             TRIM(CONCAT(u.first_name, ' ', COALESCE(u.middle_name, ''), ' ', u.last_name)) AS full_name,
             u.created_at, u.updated_at, u.last_login,
             u.internal_user, u.user_type,
             u.failed_login_attempts, u.locked_until, u.must_change_password,
             ARRAY_AGG(r.name) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = $1
      GROUP BY u.id, u.internal_user, u.user_type, u.failed_login_attempts, u.locked_until, u.must_change_password
    `;
    
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      const error = new Error('User not found');
      error.status = 404;
      throw error;
    }
    
    // Filter out null roles if the user has no roles
    const user = result.rows[0];
    return {
      ...user,
      roles: user.roles.filter(role => role !== null)
    };
  } catch (error) {
    console.error(`Error in userRepository.findById (ID: ${id}):`, error);
    throw error;
  }
};

/**
 * Find a user by username
 * @param {string} username - Username
 * @returns {Promise<Object>} User object
 */
const findByUsername = async (username) => {
  try {
    const query = `
      SELECT u.id, u.username, u.email, u.password, u.full_name, 
             u.created_at, u.updated_at, u.last_login,
             u.internal_user, u.user_type,
             u.failed_login_attempts, u.locked_until, u.must_change_password,
             ARRAY_AGG(r.name) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.username = $1
      GROUP BY u.id, u.internal_user, u.user_type, u.failed_login_attempts, u.locked_until, u.must_change_password
    `;
    
    const result = await db.query(query, [username]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Filter out null roles if the user has no roles
    const user = result.rows[0];
    return {
      ...user,
      roles: user.roles.filter(role => role !== null)
    };
  } catch (error) {
    console.error(`Error in userRepository.findByUsername (Username: ${username}):`, error);
    throw error;
  }
};

/**
 * Create a new user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user object
 */
const create = async (userData) => {
  const {
    username,
    password,
    email,
    firstName,
    lastName,
    roles = ['User']
  } = userData;
  
  // Generate a unique ID
  const id = uuidv4();
  
  try {
    // Hash the password
    const saltRounds = SECURITY_CONFIG.BCRYPT_SALT_ROUNDS;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Use a transaction for atomicity
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Insert the user
      const insertUserQuery = `
        INSERT INTO users (
          id, username, password, email, first_name, last_name, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id, username, email, first_name, last_name, created_at, updated_at
      `;
      
      const insertUserResult = await client.query(insertUserQuery, [
        id,
        username,
        hashedPassword,
        email,
        firstName,
        lastName
      ]);
      
      // Insert user roles
      for (const roleName of roles) {
        // First, get the role ID
        const getRoleQuery = 'SELECT id FROM roles WHERE name = $1';
        const roleResult = await client.query(getRoleQuery, [roleName]);
        
        if (roleResult.rows.length === 0) {
          // Create the role if it doesn't exist
          const createRoleQuery = `
            INSERT INTO roles (name, created_at, updated_at)
            VALUES ($1, NOW(), NOW())
            RETURNING id
          `;
          
          const newRoleResult = await client.query(createRoleQuery, [roleName]);
          const roleId = newRoleResult.rows[0].id;
          
          // Assign the role to the user
          const insertUserRoleQuery = `
            INSERT INTO user_roles (user_id, role_id, created_at)
            VALUES ($1, $2, NOW())
          `;
          
          await client.query(insertUserRoleQuery, [id, roleId]);
        } else {
          // Assign the existing role to the user
          const roleId = roleResult.rows[0].id;
          const insertUserRoleQuery = `
            INSERT INTO user_roles (user_id, role_id, created_at)
            VALUES ($1, $2, NOW())
          `;
          
          await client.query(insertUserRoleQuery, [id, roleId]);
        }
      }
      
      await client.query('COMMIT');
      
      // Return the created user with roles
      return {
        ...insertUserResult.rows[0],
        roles
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in userRepository.create:', error);
    
    // Handle unique constraint violations
    if (error.code === '23505') { // PostgreSQL unique violation code
      if (error.constraint === 'users_username_key') {
        const conflictError = new Error('Username already exists');
        conflictError.status = 409;
        throw conflictError;
      } else if (error.constraint === 'users_email_key') {
        const conflictError = new Error('Email already exists');
        conflictError.status = 409;
        throw conflictError;
      }
    }
    
    throw new Error('Failed to create user');
  }
};

/**
 * Update an existing user
 * @param {string} id - User ID
 * @param {Object} userData - Updated user data
 * @returns {Promise<Object>} Updated user object
 */
const update = async (id, userData) => {
  try {
    // Check if the user exists
    await findById(id);
    
    // Extract user data
    const {
      username,
      password,
      email,
      firstName,
      lastName,
      roles
    } = userData;
    
    // Use a transaction for atomicity
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Prepare the update query with only the fields that are provided
      let updateQuery = 'UPDATE users SET updated_at = NOW()';
      const queryParams = [];
      let paramIndex = 1;
      
      // Build dynamic SET clause based on provided fields
      const updateFields = [
        { key: 'username', value: username },
        { key: 'email', value: email },
        { key: 'first_name', value: firstName },
        { key: 'last_name', value: lastName }
      ];
      
      for (const field of updateFields) {
        if (field.value !== undefined) {
          updateQuery += `, ${field.key} = $${paramIndex++}`;
          queryParams.push(field.value);
        }
      }
      
      // Handle password separately (needs hashing)
      if (password !== undefined) {
        const saltRounds = SECURITY_CONFIG.BCRYPT_SALT_ROUNDS;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        updateQuery += `, password = $${paramIndex++}`;
        queryParams.push(hashedPassword);
      }
      
      // Add the WHERE clause and RETURNING *
      updateQuery += ` WHERE id = $${paramIndex} RETURNING id, username, email, first_name, last_name, created_at, updated_at`;
      queryParams.push(id);
      
      const updateResult = await client.query(updateQuery, queryParams);
      
      // Update roles if provided
      if (roles !== undefined) {
        // First, delete all existing user roles
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
        
        // Then insert the new roles
        for (const roleName of roles) {
          // Get the role ID
          const getRoleQuery = 'SELECT id FROM roles WHERE name = $1';
          const roleResult = await client.query(getRoleQuery, [roleName]);
          
          if (roleResult.rows.length === 0) {
            // Create the role if it doesn't exist
            const createRoleQuery = `
              INSERT INTO roles (name, created_at, updated_at)
              VALUES ($1, NOW(), NOW())
              RETURNING id
            `;
            
            const newRoleResult = await client.query(createRoleQuery, [roleName]);
            const roleId = newRoleResult.rows[0].id;
            
            // Assign the role to the user
            const insertUserRoleQuery = `
              INSERT INTO user_roles (user_id, role_id, created_at)
              VALUES ($1, $2, NOW())
            `;
            
            await client.query(insertUserRoleQuery, [id, roleId]);
          } else {
            // Assign the existing role to the user
            const roleId = roleResult.rows[0].id;
            const insertUserRoleQuery = `
              INSERT INTO user_roles (user_id, role_id, created_at)
              VALUES ($1, $2, NOW())
            `;
            
            await client.query(insertUserRoleQuery, [id, roleId]);
          }
        }
      }
      
      await client.query('COMMIT');
      
      // Return the updated user with roles
      return {
        ...updateResult.rows[0],
        roles: roles || (await findById(id)).roles
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error in userRepository.update (ID: ${id}):`, error);
    
    // Handle unique constraint violations
    if (error.code === '23505') { // PostgreSQL unique violation code
      if (error.constraint === 'users_username_key') {
        const conflictError = new Error('Username already exists');
        conflictError.status = 409;
        throw conflictError;
      } else if (error.constraint === 'users_email_key') {
        const conflictError = new Error('Email already exists');
        conflictError.status = 409;
        throw conflictError;
      }
    }
    
    throw error;
  }
};

/**
 * Delete a user
 * @param {string} id - User ID
 * @returns {Promise<boolean>} True if deletion was successful
 */
const remove = async (id) => {
  try {
    // Use a transaction for atomicity
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // First, delete user roles
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
      
      // Delete the user
      const result = await client.query(
        'DELETE FROM users WHERE id = $1 RETURNING id',
        [id]
      );
      
      if (result.rows.length === 0) {
        throw new Error('User not found or already deleted');
      }
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error in userRepository.remove (ID: ${id}):`, error);
    throw error;
  }
};

/**
 * Update user last login timestamp
 * @param {string} id - User ID
 * @returns {Promise<Object>} Updated user object
 */
const updateLastLogin = async (id) => {
  try {
    const query = 'UPDATE users SET last_login = NOW() WHERE id = $1 RETURNING id';
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      const error = new Error('User not found');
      error.status = 404;
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error(`Error in userRepository.updateLastLogin (ID: ${id}):`, error);
    throw error;
  }
};

/**
 * Count users with optional filtering
 * @param {Object} filters - Filter parameters
 * @returns {Promise<number>} Count of matching users
 */
const count = async (filters = {}) => {
  try {
    // Start building the query
    let queryText = 'SELECT COUNT(DISTINCT u.id) FROM users u';
    const queryParams = [];
    
    // Add join for role filtering if needed
    if (filters.role) {
      queryText += `
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
      `;
    }
    
    // Apply filters if provided
    if (Object.keys(filters).length > 0) {
      const filterClauses = [];
      let paramIndex = 1;
      
      // Filter by username (partial match)
      if (filters.username) {
        filterClauses.push(`u.username ILIKE $${paramIndex++}`);
        queryParams.push(`%${filters.username}%`);
      }
      
      // Filter by email (partial match)
      if (filters.email) {
        filterClauses.push(`u.email ILIKE $${paramIndex++}`);
        queryParams.push(`%${filters.email}%`);
      }
      
      // Filter by role
      if (filters.role) {
        filterClauses.push(`r.name = $${paramIndex++}`);
        queryParams.push(filters.role);
      }
      
      // Global search across username, email, first_name, last_name
      if (filters.search) {
        const searchPattern = `%${filters.search}%`;
        filterClauses.push(`(u.username ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex})`);
        queryParams.push(searchPattern);
        paramIndex++;
      }
      
      // Add WHERE clause if we have filters
      if (filterClauses.length > 0) {
        queryText += ' WHERE ' + filterClauses.join(' AND ');
      }
    }
    
    const result = await db.query(queryText, queryParams);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error in userRepository.count:', error);
    throw new Error('Failed to count users');
  }
};

/**
 * Validate user credentials
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Object|null>} User object if valid, null otherwise
 */
const validateCredentials = async (username, password) => {
  try {
    // Get the user with password
    const user = await findByUsername(username);
    
    if (!user) {
      return null;
    }
    
    // Compare the password
    const isValid = await bcrypt.compare(password, user.password);
    
    if (!isValid) {
      return null;
    }
    
    // Update last login time
    await updateLastLogin(user.id);
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    console.error(`Error in userRepository.validateCredentials:`, error);
    throw error;
  }
};

/**
 * Set must_change_password flag for a user
 * @param {string} userId - User ID
 * @param {boolean} mustChange - Whether user must change password
 * @returns {Promise<void>}
 */
const setMustChangePassword = async (userId, mustChange = true) => {
  try {
    const query = 'UPDATE users SET must_change_password = $1 WHERE id = $2';
    await db.query(query, [mustChange, userId]);
  } catch (error) {
    console.error(`Error in userRepository.setMustChangePassword:`, error);
    throw error;
  }
};

module.exports = {
  findAll,
  findById,
  findByUsername,
  create,
  update,
  remove,
  updateLastLogin,
  count,
  validateCredentials,
  setMustChangePassword
};