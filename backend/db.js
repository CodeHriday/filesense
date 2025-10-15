/**
 * Database Pool Export
 * Re-exports the database pool for easy access in routes
 */

const { getContainer } = require('./di/bootstrapper');

// Get pool from DI container
const container = getContainer();
const pool = container.get('dbPool');

module.exports = pool;
