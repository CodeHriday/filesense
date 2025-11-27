/**
 * Cursor-Based Pagination Utility
 * 
 * Provides constant-time pagination for large datasets (terabytes of records)
 * by using indexed columns instead of OFFSET which degrades with table size.
 * 
 * Benefits:
 * - O(1) pagination regardless of page number (vs O(n) for OFFSET)
 * - Consistent results even when data changes between requests
 * - Works efficiently with billions of records
 */

/**
 * Encode cursor from values
 * @param {Object} values - Object with cursor values
 * @returns {string} - Base64 encoded cursor
 */
function encodeCursor(values) {
  return Buffer.from(JSON.stringify(values)).toString('base64');
}

/**
 * Decode cursor to values
 * @param {string} cursor - Base64 encoded cursor
 * @returns {Object|null} - Decoded cursor values or null if invalid
 */
function decodeCursor(cursor) {
  if (!cursor) return null;
  
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
  } catch (e) {
    return null;
  }
}

/**
 * Build cursor pagination SQL clauses
 * 
 * @param {Object} options - Pagination options
 * @param {string} options.cursor - Encoded cursor from previous request
 * @param {number} options.limit - Number of items per page (default 50)
 * @param {string} options.sortColumn - Column to sort by (default 'created_at')
 * @param {string} options.sortDirection - 'ASC' or 'DESC' (default 'DESC')
 * @param {string} options.cursorColumn - Column to use for cursor (default 'id')
 * @param {string} options.tableAlias - Optional table alias for column references
 * @returns {Object} - { whereClause, orderClause, limitClause, params }
 */
function buildCursorQuery(options = {}) {
  const {
    cursor,
    limit = 50,
    sortColumn = 'created_at',
    sortDirection = 'DESC',
    cursorColumn = 'id',
    tableAlias = ''
  } = options;

  const prefix = tableAlias ? `${tableAlias}.` : '';
  const params = [];
  let whereClause = '';
  
  // Decode cursor if provided
  const cursorValues = decodeCursor(cursor);
  
  if (cursorValues) {
    // For DESC order: next page has SMALLER values
    // For ASC order: next page has LARGER values
    const operator = sortDirection.toUpperCase() === 'DESC' ? '<' : '>';
    
    if (cursorValues.sortValue !== undefined && cursorValues.cursorId !== undefined) {
      // Compound cursor: (sort_column, cursor_id) for tie-breaking
      params.push(cursorValues.sortValue, cursorValues.cursorId);
      whereClause = `AND (
        ${prefix}${sortColumn} ${operator} $${params.length - 1}
        OR (${prefix}${sortColumn} = $${params.length - 1} AND ${prefix}${cursorColumn} ${operator} $${params.length})
      )`;
    } else if (cursorValues.cursorId !== undefined) {
      // Simple cursor: just cursor_id
      params.push(cursorValues.cursorId);
      whereClause = `AND ${prefix}${cursorColumn} ${operator} $${params.length}`;
    }
  }

  // Build order clause
  const orderClause = `ORDER BY ${prefix}${sortColumn} ${sortDirection}, ${prefix}${cursorColumn} ${sortDirection}`;
  
  // Fetch one extra to determine if there are more pages
  const limitClause = `LIMIT ${parseInt(limit) + 1}`;

  return {
    whereClause,
    orderClause,
    limitClause,
    params,
    limit: parseInt(limit)
  };
}

/**
 * Process query results and generate next cursor
 * 
 * @param {Array} rows - Query results
 * @param {number} limit - Page size
 * @param {string} sortColumn - Column used for sorting
 * @param {string} cursorColumn - Column used for cursor
 * @returns {Object} - { items, nextCursor, hasMore }
 */
function processCursorResults(rows, limit, sortColumn = 'created_at', cursorColumn = 'id') {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  
  let nextCursor = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    nextCursor = encodeCursor({
      sortValue: lastItem[sortColumn],
      cursorId: lastItem[cursorColumn]
    });
  }

  return {
    items,
    nextCursor,
    hasMore
  };
}

/**
 * Build a complete paginated query with cursor support
 * 
 * @param {Object} options - Query options
 * @param {string} options.baseQuery - Base SQL query (SELECT ... FROM ... WHERE ...)
 * @param {string} options.cursor - Encoded cursor from previous request
 * @param {number} options.limit - Number of items per page
 * @param {string} options.sortColumn - Column to sort by
 * @param {string} options.sortDirection - 'ASC' or 'DESC'
 * @param {string} options.cursorColumn - Column to use for cursor
 * @param {Array} options.baseParams - Parameters for the base query
 * @param {string} options.tableAlias - Optional table alias
 * @returns {Object} - { query, params, limit }
 */
function buildPaginatedQuery(options = {}) {
  const {
    baseQuery,
    cursor,
    limit = 50,
    sortColumn = 'created_at',
    sortDirection = 'DESC',
    cursorColumn = 'id',
    baseParams = [],
    tableAlias = ''
  } = options;

  const cursorQuery = buildCursorQuery({
    cursor,
    limit,
    sortColumn,
    sortDirection,
    cursorColumn,
    tableAlias
  });

  // Adjust parameter indices in cursor where clause
  let adjustedWhereClause = cursorQuery.whereClause;
  if (baseParams.length > 0 && adjustedWhereClause) {
    // Replace $1, $2 etc with correct indices
    cursorQuery.params.forEach((_, idx) => {
      const oldIdx = idx + 1;
      const newIdx = baseParams.length + idx + 1;
      adjustedWhereClause = adjustedWhereClause.replace(
        new RegExp(`\\$${oldIdx}(?!\\d)`, 'g'),
        `$${newIdx}`
      );
    });
  }

  const query = `${baseQuery} ${adjustedWhereClause} ${cursorQuery.orderClause} ${cursorQuery.limitClause}`;
  const params = [...baseParams, ...cursorQuery.params];

  return {
    query,
    params,
    limit: cursorQuery.limit
  };
}

/**
 * Helper to create a standardized paginated response
 * 
 * @param {Array} items - Page items
 * @param {string|null} nextCursor - Cursor for next page
 * @param {boolean} hasMore - Whether more pages exist
 * @param {Object} meta - Additional metadata
 * @returns {Object} - Standardized response object
 */
function createPaginatedResponse(items, nextCursor, hasMore, meta = {}) {
  return {
    data: items,
    pagination: {
      nextCursor,
      hasMore,
      count: items.length,
      ...meta
    }
  };
}

/**
 * Cursor pagination middleware for Express routes
 * Extracts pagination params from query string
 */
function cursorPaginationMiddleware(defaults = {}) {
  return (req, res, next) => {
    const {
      limit: defaultLimit = 50,
      maxLimit = 100,
      sortColumn = 'created_at',
      sortDirection = 'DESC'
    } = defaults;

    req.pagination = {
      cursor: req.query.cursor || null,
      limit: Math.min(parseInt(req.query.limit) || defaultLimit, maxLimit),
      sortColumn: req.query.sort || sortColumn,
      sortDirection: (req.query.order || sortDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    };

    next();
  };
}

module.exports = {
  encodeCursor,
  decodeCursor,
  buildCursorQuery,
  processCursorResults,
  buildPaginatedQuery,
  createPaginatedResponse,
  cursorPaginationMiddleware
};
