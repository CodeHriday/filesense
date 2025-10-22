/**
 * Policy Engine Service
 * 
 * Evaluates policies to make access control decisions.
 * Supports AWS IAM-style policy documents with:
 * - Effect: Allow/Deny
 * - Action: Specific actions or wildcards
 * - Resource: Specific resources or wildcards
 * - Condition: Optional conditions for context-based access
 */

const { systemLogger } = require('../utils/logger');

class PolicyEngine {
  constructor(dbPool) {
    this.dbPool = dbPool;
    this.cacheEnabled = true;
    this.cacheTTL = 300; // 5 minutes in seconds
  }

  /**
   * Evaluate if a user is allowed to perform an action on a resource
   * @param {number} userId - User ID
   * @param {string} action - Action to perform (e.g., "file:read", "project:delete")
   * @param {string} resourceType - Type of resource (e.g., "FILE", "PROJECT")
   * @param {string} resourceId - ID of the resource
   * @param {object} context - Additional context for condition evaluation
   * @returns {Promise<{allowed: boolean, decision: string, reason: string}>}
   */
  async evaluate(userId, action, resourceType = null, resourceId = null, context = {}) {
    try {
      // Check cache first
      const cacheKey = this._generateCacheKey(userId, action, resourceType, resourceId);
      const cached = await this._getFromCache(cacheKey);
      if (cached) {
        systemLogger.debug('Policy decision from cache', { userId, action, decision: cached.decision });
        return {
          allowed: cached.decision === 'ALLOW',
          decision: cached.decision,
          reason: 'Cached decision'
        };
      }

      // Fetch all policies that apply to this user
      const policies = await this._getUserPolicies(userId, resourceType, resourceId);
      
      if (policies.length === 0) {
        const result = {
          allowed: false,
          decision: 'IMPLICIT_DENY',
          reason: 'No policies found for user'
        };
        await this._saveToCache(cacheKey, userId, action, resourceType, resourceId, result.decision, []);
        return result;
      }

      // Evaluate policies
      let hasAllow = false;
      let hasDeny = false;
      const evaluatedPolicies = [];

      for (const policy of policies) {
        const evaluation = this._evaluatePolicy(policy.policy_document, action, resourceType, resourceId, context);
        evaluatedPolicies.push({
          policyId: policy.id,
          policyName: policy.name,
          effect: evaluation.effect,
          matched: evaluation.matched
        });

        if (evaluation.matched) {
          if (evaluation.effect === 'Deny') {
            hasDeny = true;
          } else if (evaluation.effect === 'Allow') {
            hasAllow = true;
          }
        }
      }

      // Deny overrides everything
      let decision;
      if (hasDeny) {
        decision = 'DENY';
      } else if (hasAllow) {
        decision = 'ALLOW';
      } else {
        decision = 'IMPLICIT_DENY';
      }

      const result = {
        allowed: decision === 'ALLOW',
        decision,
        reason: this._getDecisionReason(decision, evaluatedPolicies)
      };

      // Cache the decision
      await this._saveToCache(cacheKey, userId, action, resourceType, resourceId, decision, evaluatedPolicies);

      systemLogger.debug('Policy evaluation completed', { 
        userId, 
        action, 
        resourceType, 
        resourceId, 
        decision,
        policiesEvaluated: policies.length 
      });

      return result;
    } catch (error) {
      systemLogger.error('Error evaluating policy', { userId, action, error });
      // Fail closed - deny access on error
      return {
        allowed: false,
        decision: 'IMPLICIT_DENY',
        reason: 'Error during policy evaluation'
      };
    }
  }

  /**
   * Evaluate a single policy document
   * @private
   */
  _evaluatePolicy(policyDocument, action, resourceType, resourceId, context) {
    const statements = policyDocument.Statement || [];
    
    for (const statement of statements) {
      // Check if action matches
      const actionMatch = this._matchPattern(action, statement.Action);
      if (!actionMatch) continue;

      // Check if resource matches
      const resourceMatch = this._matchResource(resourceType, resourceId, statement.Resource);
      if (!resourceMatch) continue;

      // Check conditions if present
      if (statement.Condition) {
        const conditionMatch = this._evaluateCondition(statement.Condition, context);
        if (!conditionMatch) continue;
      }

      // Statement matched
      return {
        matched: true,
        effect: statement.Effect
      };
    }

    return {
      matched: false,
      effect: null
    };
  }

  /**
   * Match action against pattern (supports wildcards)
   * @private
   */
  _matchPattern(value, pattern) {
    if (!pattern) return true;
    
    // Pattern can be string or array
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    
    for (const p of patterns) {
      if (p === '*') return true;
      
      // Convert wildcard to regex
      const regex = new RegExp('^' + p.replace(/\*/g, '.*') + '$');
      if (regex.test(value)) return true;
    }
    
    return false;
  }

  /**
   * Match resource against pattern
   * @private
   */
  _matchResource(resourceType, resourceId, pattern) {
    if (!pattern) return true;
    if (pattern === '*') return true;
    
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    
    for (const p of patterns) {
      if (p === '*') return true;
      
      // Format: resourceType:resourceId or resourceType:*
      const resourceArn = resourceType && resourceId 
        ? `${resourceType}:${resourceId}`
        : resourceType || '*';
      
      const regex = new RegExp('^' + p.replace(/\*/g, '.*') + '$');
      if (regex.test(resourceArn)) return true;
    }
    
    return false;
  }

  /**
   * Evaluate policy conditions
   * @private
   */
  _evaluateCondition(condition, context) {
    // Simple condition evaluation - can be extended for complex conditions
    for (const [operator, conditions] of Object.entries(condition)) {
      for (const [key, value] of Object.entries(conditions)) {
        const contextValue = context[key];
        
        switch (operator) {
          case 'StringEquals':
            if (contextValue !== value) return false;
            break;
          case 'StringLike':
            const regex = new RegExp('^' + value.replace(/\*/g, '.*') + '$');
            if (!regex.test(contextValue)) return false;
            break;
          case 'NumericEquals':
            if (Number(contextValue) !== Number(value)) return false;
            break;
          case 'NumericLessThan':
            if (Number(contextValue) >= Number(value)) return false;
            break;
          case 'NumericGreaterThan':
            if (Number(contextValue) <= Number(value)) return false;
            break;
          case 'Bool':
            if (Boolean(contextValue) !== Boolean(value)) return false;
            break;
          default:
            systemLogger.warn('Unknown condition operator', { operator });
            return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Get all policies that apply to a user
   * @private
   */
  async _getUserPolicies(userId, resourceType = null, resourceId = null) {
    const client = await this.dbPool.connect();
    try {
      // Get policies from:
      // 1. Direct user attachments
      // 2. Group memberships
      // 3. Resource-based policies (if resource specified)
      
      let query = `
        SELECT DISTINCT p.*
        FROM rbac_policies p
        WHERE p.is_active = TRUE
        AND (
          -- User policies
          EXISTS (
            SELECT 1 FROM user_policy_attachments upa
            WHERE upa.policy_id = p.id AND upa.user_id = $1
          )
          -- Group policies
          OR EXISTS (
            SELECT 1 FROM access_group_members agm
            JOIN group_policy_attachments gpa ON gpa.group_id = agm.group_id
            WHERE gpa.policy_id = p.id AND agm.user_id = $1
          )
      `;
      
      const params = [userId];
      
      // Add resource-based policies if resource specified
      if (resourceType && resourceId) {
        query += `
          OR EXISTS (
            SELECT 1 FROM resource_policy_attachments rpa
            WHERE rpa.policy_id = p.id 
            AND rpa.resource_type = $2
            AND rpa.resource_id = $3
          )
        `;
        params.push(resourceType, resourceId);
      }
      
      query += `)`;
      
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Generate cache key
   * @private
   */
  _generateCacheKey(userId, action, resourceType, resourceId) {
    return `policy:${userId}:${action}:${resourceType || 'none'}:${resourceId || 'none'}`;
  }

  /**
   * Get decision from cache
   * @private
   */
  async _getFromCache(cacheKey) {
    if (!this.cacheEnabled) return null;
    
    const client = await this.dbPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM policy_evaluation_cache WHERE cache_key = $1 AND expires_at > NOW()',
        [cacheKey]
      );
      
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Save decision to cache
   * @private
   */
  async _saveToCache(cacheKey, userId, action, resourceType, resourceId, decision, evaluatedPolicies) {
    if (!this.cacheEnabled) return;
    
    const client = await this.dbPool.connect();
    try {
      const expiresAt = new Date(Date.now() + this.cacheTTL * 1000);
      
      await client.query(`
        INSERT INTO policy_evaluation_cache 
        (cache_key, user_id, action, resource_type, resource_id, decision, evaluated_policies, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (cache_key) DO UPDATE
        SET decision = $6, evaluated_policies = $7, expires_at = $8, created_at = NOW()
      `, [cacheKey, userId, action, resourceType, resourceId, decision, JSON.stringify(evaluatedPolicies), expiresAt]);
    } finally {
      client.release();
    }
  }

  /**
   * Invalidate cache for a user
   */
  async invalidateUserCache(userId) {
    const client = await this.dbPool.connect();
    try {
      await client.query('DELETE FROM policy_evaluation_cache WHERE user_id = $1', [userId]);
      systemLogger.info('Invalidated policy cache for user', { userId });
    } finally {
      client.release();
    }
  }

  /**
   * Invalidate all cache
   */
  async invalidateAllCache() {
    const client = await this.dbPool.connect();
    try {
      await client.query('DELETE FROM policy_evaluation_cache');
      systemLogger.info('Invalidated all policy cache');
    } finally {
      client.release();
    }
  }

  /**
   * Get decision reason
   * @private
   */
  _getDecisionReason(decision, evaluatedPolicies) {
    const matched = evaluatedPolicies.filter(p => p.matched);
    
    if (decision === 'DENY') {
      return `Explicitly denied by policy: ${matched.find(p => p.effect === 'Deny')?.policyName}`;
    } else if (decision === 'ALLOW') {
      return `Allowed by policy: ${matched.find(p => p.effect === 'Allow')?.policyName}`;
    } else {
      return 'No matching allow policy found';
    }
  }
}

module.exports = PolicyEngine;
