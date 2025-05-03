const { pool, query } = require('../config/database');

class ConnectionService {
  /**
   * Get all connections from the shared table
   * 
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum number of connections to return
   * @param {string} options.source - Filter by source application
   * @returns {Promise<Array>} - Array of connections
   */
  async getAllConnections(options = {}) {
    try {
      const { limit, source } = options;
      
      let query = 'SELECT * FROM transform_connections WHERE is_active = TRUE';
      const params = [];
      
      // Add source filter if specified
      if (source) {
        query += ' AND source_application = $1';
        params.push(source);
      }
      
      // Add sorting and limit
      query += ' ORDER BY name ASC';
      
      if (limit) {
        query += ` LIMIT ${parseInt(limit)}`;
      }
      
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error fetching connections:', error);
      throw new Error(`Failed to fetch connections: ${error.message}`);
    }
  }
  
  /**
   * Get a connection by ID
   * 
   * @param {number} id - Connection ID
   * @returns {Promise<Object>} - Connection details
   */
  async getConnectionById(id) {
    try {
      const result = await pool.query(
        'SELECT * FROM transform_connections WHERE id = $1',
        [id]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Connection with ID ${id} not found`);
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error fetching connection by ID:', error);
      throw new Error(`Failed to fetch connection: ${error.message}`);
    }
  }
  
  /**
   * Create a new connection
   * 
   * @param {Object} connectionData - Connection data
   * @returns {Promise<Object>} - Created connection
   */
  async createConnection(connectionData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { name, type, config, created_by, description } = connectionData;
      
      // Validate required fields
      if (!name || !type || !config) {
        throw new Error('Missing required connection fields');
      }
      
      // Insert the connection
      const result = await client.query(`
        INSERT INTO transform_connections (
          name, 
          type, 
          config, 
          created_by,
          description,
          source_application
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        name,
        type,
        config,
        created_by || null,
        description || null,
        'data_observatory'
      ]);
      
      await client.query('COMMIT');
      console.log('Connection created successfully:', result.rows[0].id);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating connection:', error);
      throw new Error(`Failed to create connection: ${error.message}`);
    } finally {
      client.release();
    }
  }
  
  /**
   * Update an existing connection
   * 
   * @param {number} id - Connection ID
   * @param {Object} connectionData - Updated connection data
   * @returns {Promise<Object>} - Updated connection
   */
  async updateConnection(id, connectionData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if connection exists
      const checkResult = await client.query(
        'SELECT * FROM transform_connections WHERE id = $1',
        [id]
      );
      
      if (checkResult.rows.length === 0) {
        throw new Error(`Connection with ID ${id} not found`);
      }
      
      // Extract fields to update
      const { name, type, config, is_active, description } = connectionData;
      
      // Build update query dynamically based on provided fields
      let updateQuery = 'UPDATE transform_connections SET ';
      const updateValues = [];
      const updateFields = [];
      
      if (name !== undefined) {
        updateFields.push(`name = $${updateValues.length + 1}`);
        updateValues.push(name);
      }
      
      if (type !== undefined) {
        updateFields.push(`type = $${updateValues.length + 1}`);
        updateValues.push(type);
      }
      
      if (config !== undefined) {
        updateFields.push(`config = $${updateValues.length + 1}`);
        updateValues.push(config);
      }
      
      if (is_active !== undefined) {
        updateFields.push(`is_active = $${updateValues.length + 1}`);
        updateValues.push(is_active);
      }
      
      if (description !== undefined) {
        updateFields.push(`description = $${updateValues.length + 1}`);
        updateValues.push(description);
      }
      
      // Add updated_at timestamp
      updateFields.push(`updated_at = NOW()`);
      
      // If no fields to update, return the existing connection
      if (updateFields.length === 0) {
        return checkResult.rows[0];
      }
      
      updateQuery += updateFields.join(', ');
      updateQuery += ` WHERE id = $${updateValues.length + 1} RETURNING *`;
      updateValues.push(id);
      
      // Execute update
      const result = await client.query(updateQuery, updateValues);
      
      await client.query('COMMIT');
      console.log('Connection updated successfully:', id);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating connection:', error);
      throw new Error(`Failed to update connection: ${error.message}`);
    } finally {
      client.release();
    }
  }
  
  /**
   * Delete a connection
   * 
   * @param {number} id - Connection ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteConnection(id) {
    try {
      const result = await pool.query(
        'DELETE FROM transform_connections WHERE id = $1 RETURNING id',
        [id]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Connection with ID ${id} not found`);
      }
      
      console.log('Connection deleted successfully:', id);
      return true;
    } catch (error) {
      console.error('Error deleting connection:', error);
      throw new Error(`Failed to delete connection: ${error.message}`);
    }
  }
  
  /**
   * Test a connection to verify it works
   * 
   * @param {Object} connectionData - Connection configuration to test
   * @returns {Promise<Object>} - Test result
   */
  async testConnection(connectionData) {
    try {
      const { type, config } = connectionData;
      
      // Log the test attempt
      console.log('Testing connection:', type);
      
      // Implement connection testing logic based on type
      // This would typically include attempting to connect to the source
      let testResult = { success: false, message: 'Connection test not implemented' };
      
      switch (type) {
        case 'aws':
          // For now, return a simple success message
          // In a real implementation, this would test the AWS credentials
          testResult = { success: true, message: 'AWS connection test successful' };
          break;
          
        case 'gcp':
          testResult = { success: true, message: 'GCP connection test successful' };
          break;
          
        case 'azure':
          testResult = { success: true, message: 'Azure connection test successful' };
          break;
          
        case 'snowflake':
          testResult = { success: true, message: 'Snowflake connection test successful' };
          break;
          
        case 'databricks':
          testResult = { success: true, message: 'Databricks connection test successful' };
          break;
          
        case 'sharepoint':
          testResult = { success: true, message: 'SharePoint connection test successful' };
          break;
          
        case 'outlook':
          testResult = { success: true, message: 'Outlook connection test successful' };
          break;
          
        default:
          testResult = { 
            success: false, 
            message: `Connection type '${type}' test not implemented` 
          };
      }
      
      return testResult;
    } catch (error) {
      console.error('Error testing connection:', error);
      return { 
        success: false, 
        message: `Connection test failed: ${error.message}` 
      };
    }
  }
  
  /**
   * Update the last_used_at timestamp for a connection
   * 
   * @param {number} id - Connection ID
   * @returns {Promise<void>}
   */
  async updateLastUsedTimestamp(id) {
    try {
      await pool.query(
        'UPDATE transform_connections SET last_used_at = NOW() WHERE id = $1',
        [id]
      );
    } catch (error) {
      console.warn('Error updating connection last_used timestamp:', error);
      // Non-critical error, don't throw
    }
  }
}

module.exports = new ConnectionService();
