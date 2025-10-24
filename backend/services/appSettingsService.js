/**
 * Application Settings Service
 * Manages global application configuration settings
 */

/**
 * Get a setting value by key
 */
async function getSetting(pool, settingKey) {
  try {
    const result = await pool.query(
      'SELECT setting_value FROM app_settings WHERE setting_key = $1',
      [settingKey]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0].setting_value;
  } catch (error) {
    console.error('Failed to get setting:', error);
    throw error;
  }
}

/**
 * Get all settings
 */
async function getAllSettings(pool) {
  try {
    const result = await pool.query(
      'SELECT setting_key, setting_value, description FROM app_settings ORDER BY setting_key'
    );
    
    return result.rows;
  } catch (error) {
    console.error('Failed to get all settings:', error);
    throw error;
  }
}

/**
 * Update a setting value
 */
async function updateSetting(pool, settingKey, settingValue) {
  try {
    const result = await pool.query(
      `UPDATE app_settings 
       SET setting_value = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE setting_key = $2
       RETURNING *`,
      [settingValue, settingKey]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Setting '${settingKey}' not found`);
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Failed to update setting:', error);
    throw error;
  }
}

/**
 * Get profile retention count setting
 */
async function getProfileRetentionCount(pool) {
  try {
    const value = await getSetting(pool, 'profile_retention_count');
    return value ? parseInt(value, 10) : 10; // Default to 10 if not found
  } catch (error) {
    console.error('Failed to get profile retention count:', error);
    return 10; // Default fallback
  }
}

module.exports = {
  getSetting,
  getAllSettings,
  updateSetting,
  getProfileRetentionCount
};
