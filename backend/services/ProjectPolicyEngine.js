/**
 * Project Policy Engine
 * 
 * Evaluates project-scoped access policies following AWS IAM model.
 * Supports:
 * - Project-scoped resources (project:123:file:read)
 * - Wildcard matching (project:*:file:*)
 * - ABAC conditions (resource.sensitivity, user.clearance_level)
 * - Deny-override logic (explicit deny always wins)
 * 
 * Policy Document Format (AWS IAM-compatible):
 * {
 *   "Version": "2025-01-01",
 *   "Statement": [
 *     {
 *       "Effect": "Allow",
 *       "Action": ["project:*:file:read", "project:*:file:write"],
 *       "Resource": "project:123:file:*",
 *       "Condition": {
 *         "StringEquals": {
 *           "resource:sensitivity": "Public"
 *         }
 *       }
 *     }
 *   ]
 * }
 */

const db = require('../config/database');
const { systemLogger } = require('../utils/logger');

class ProjectPolicyEngine {
  /**
   * Evaluate if user has permission for a project-scoped action
   * 
   * @param {Object} params - Evaluation parameters
   * @param {number} params.userId - User ID
   * @param {number} params.projectId - Project ID
   * @param {string} params.action - Action to perform (e.g., 'file:read', 'workflow:execute')
   * @param {string} params.resourceType - Resource type (file, workflow, transformation, etc.)
   * @param {string} params.resourceId - Resource ID (optional)
   * @param {Object} params.context - Additional context (user attributes, resource attributes, etc.)
   * @returns {Promise<Object>} { allowed: boolean, reason: string, matchedPolicies: [] }
   */
  async evaluate(params) {
    const { userId, projectId, action, resourceType, resourceId, context = {} } = params;

    try {
      // Build resource ARN
      const resourceArn = this.buildResourceArn(projectId, resourceType, resourceId);
      const actionArn = this.buildActionArn(projectId, resourceType, action);

      systemLogger.info('Evaluating policy', {
        userId,
        projectId,
        action: actionArn,
        resource: resourceArn
      });

      // Fetch all applicable policies for the user
      const policies = await this.getUserPolicies(userId, projectId);

      if (policies.length === 0) {
        systemLogger.info('No policies found for user', { userId, projectId });
        return {
          allowed: false,
          reason: 'No policies grant access',
          matchedPolicies: []
        };
      }

      // Enrich context with user and resource attributes
      const enrichedContext = await this.enrichContext(context, userId, projectId, resourceType, resourceId);

      // Evaluate policies (deny-override logic)
      const evaluation = this.evaluatePolicies(policies, actionArn, resourceArn, enrichedContext);

      systemLogger.info('Policy evaluation result', {
        userId,
        projectId,
        action: actionArn,
        resource: resourceArn,
        allowed: evaluation.allowed,
        reason: evaluation.reason
      });

      return evaluation;

    } catch (error) {
      systemLogger.error('Policy evaluation error', {
        error: error.message,
        stack: error.stack,
        userId,
        projectId,
        action
      });

      return {
        allowed: false,
        reason: 'Policy evaluation failed',
        matchedPolicies: []
      };
    }
  }

  /**
   * Build resource ARN (Amazon Resource Name style)
   * Format: project:{projectId}:{resourceType}:{resourceId}
   */
  buildResourceArn(projectId, resourceType, resourceId = '*') {
    return `project:${projectId}:${resourceType}:${resourceId || '*'}`;
  }

  /**
   * Build action ARN
   * Format: project:{projectId}:{resourceType}:{action}
   * Example: project:123:file:read
   */
  buildActionArn(projectId, resourceType, action) {
    return `project:${projectId}:${resourceType}:${action}`;
  }

  /**
   * Fetch all policies applicable to the user in the project
   * Includes: direct user policies, group policies, resource policies
   */
  async getUserPolicies(userId, projectId) {
    try {
      const policies = [];

      // 1. Direct user policy attachments
      const userPoliciesResult = await db.query(`
        SELECT DISTINCT
          p.id,
          p.policy_name,
          p.policy_document,
          p.version,
          'user' as source
        FROM rbac_policies p
        JOIN user_policy_attachments upa ON p.id = upa.policy_id
        WHERE upa.user_id = $1
          AND p.is_active = TRUE
          AND (p.project_id = $2 OR p.project_id IS NULL)
      `, [userId, projectId]);

      policies.push(...userPoliciesResult.rows);

      // 2. Group policy attachments
      const groupPoliciesResult = await db.query(`
        SELECT DISTINCT
          p.id,
          p.policy_name,
          p.policy_document,
          p.version,
          'group' as source,
          ag.name as group_name
        FROM rbac_policies p
        JOIN group_policy_attachments gpa ON p.id = gpa.policy_id
        JOIN access_group_members agm ON gpa.group_id = agm.group_id
        JOIN access_groups ag ON agm.group_id = ag.id
        WHERE agm.user_id = $1
          AND p.is_active = TRUE
          AND (p.project_id = $2 OR p.project_id IS NULL)
      `, [userId, projectId]);

      policies.push(...groupPoliciesResult.rows);

      // 3. Resource-based policies (if resource supports them)
      // TODO: Implement when needed

      systemLogger.info('Fetched policies for user', {
        userId,
        projectId,
        policyCount: policies.length
      });

      return policies;

    } catch (error) {
      systemLogger.error('Error fetching user policies', {
        error: error.message,
        userId,
        projectId
      });
      return [];
    }
  }

  /**
   * Enrich context with user and resource attributes for ABAC evaluation
   */
  async enrichContext(baseContext, userId, projectId, resourceType, resourceId) {
    const enriched = { ...baseContext };

    try {
      // Load user attributes
      const userAttrsResult = await db.query(`
        SELECT attribute_key, attribute_value, attribute_type
        FROM user_attributes
        WHERE user_id = $1
      `, [userId]);

      enriched.user = enriched.user || {};
      userAttrsResult.rows.forEach(attr => {
        enriched.user[attr.attribute_key] = this.parseAttributeValue(attr.attribute_value, attr.attribute_type);
      });

      // Load resource attributes if resource ID is provided
      if (resourceId && resourceId !== '*') {
        const resourceAttrsResult = await db.query(`
          SELECT attribute_key, attribute_value, attribute_type
          FROM resource_attributes
          WHERE resource_type = $1 AND resource_id = $2
        `, [resourceType, resourceId]);

        enriched.resource = enriched.resource || {};
        resourceAttrsResult.rows.forEach(attr => {
          enriched.resource[attr.attribute_key] = this.parseAttributeValue(attr.attribute_value, attr.attribute_type);
        });
      }

      // Add project context
      enriched.project = enriched.project || {};
      enriched.project.id = projectId;

    } catch (error) {
      systemLogger.error('Error enriching context', {
        error: error.message,
        userId,
        resourceType,
        resourceId
      });
    }

    return enriched;
  }

  /**
   * Parse attribute value based on type
   */
  parseAttributeValue(value, type) {
    switch (type) {
      case 'NUMBER':
        return parseFloat(value);
      case 'BOOLEAN':
        return value === 'true' || value === true;
      case 'JSON':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      case 'STRING':
      default:
        return value;
    }
  }

  /**
   * Evaluate policies with deny-override logic
   * 1. If any policy explicitly denies, deny
   * 2. If any policy allows, allow
   * 3. Default deny
   */
  evaluatePolicies(policies, action, resource, context) {
    let hasExplicitDeny = false;
    let hasExplicitAllow = false;
    const matchedPolicies = [];
    const denyReasons = [];
    const allowReasons = [];

    for (const policy of policies) {
      const policyDoc = policy.policy_document;

      if (!policyDoc || !policyDoc.Statement) {
        continue;
      }

      for (const statement of policyDoc.Statement) {
        const match = this.evaluateStatement(statement, action, resource, context);

        if (match.matched) {
          matchedPolicies.push({
            policyId: policy.id,
            policyName: policy.policy_name,
            source: policy.source,
            effect: statement.Effect,
            reason: match.reason
          });

          if (statement.Effect === 'Deny') {
            hasExplicitDeny = true;
            denyReasons.push(match.reason);
          } else if (statement.Effect === 'Allow') {
            hasExplicitAllow = true;
            allowReasons.push(match.reason);
          }
        }
      }
    }

    // Deny override logic
    if (hasExplicitDeny) {
      return {
        allowed: false,
        reason: `Explicitly denied: ${denyReasons.join('; ')}`,
        matchedPolicies
      };
    }

    if (hasExplicitAllow) {
      return {
        allowed: true,
        reason: `Allowed by policy: ${allowReasons.join('; ')}`,
        matchedPolicies
      };
    }

    return {
      allowed: false,
      reason: 'No policy grants access (implicit deny)',
      matchedPolicies
    };
  }

  /**
   * Evaluate a single policy statement
   */
  evaluateStatement(statement, action, resource, context) {
    // Check Action match
    const actionMatch = this.matchPattern(action, statement.Action);
    if (!actionMatch) {
      return { matched: false };
    }

    // Check Resource match
    const resourceMatch = this.matchPattern(resource, statement.Resource);
    if (!resourceMatch) {
      return { matched: false };
    }

    // Check Condition (ABAC)
    if (statement.Condition) {
      const conditionMatch = this.evaluateCondition(statement.Condition, context);
      if (!conditionMatch.matched) {
        return { matched: false };
      }
    }

    return {
      matched: true,
      reason: `Statement matches: Action=${action}, Resource=${resource}`
    };
  }

  /**
   * Match action/resource against pattern(s) with wildcard support
   */
  matchPattern(value, patterns) {
    const patternArray = Array.isArray(patterns) ? patterns : [patterns];

    for (const pattern of patternArray) {
      if (this.wildcardMatch(value, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Wildcard matching (* and ? support)
   */
  wildcardMatch(value, pattern) {
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
      .replace(/\*/g, '.*')                   // * matches any sequence
      .replace(/\?/g, '.');                   // ? matches single char

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(value);
  }

  /**
   * Evaluate ABAC conditions
   * Supports: StringEquals, StringLike, NumericEquals, NumericLessThan, etc.
   */
  evaluateCondition(condition, context) {
    for (const [operator, comparisons] of Object.entries(condition)) {
      for (const [key, expectedValue] of Object.entries(comparisons)) {
        const actualValue = this.getContextValue(key, context);

        const match = this.evaluateComparison(operator, actualValue, expectedValue);
        if (!match) {
          return {
            matched: false,
            reason: `Condition failed: ${key} ${operator} ${expectedValue}`
          };
        }
      }
    }

    return { matched: true };
  }

  /**
   * Get value from context using dot notation
   * E.g., "user.clearance_level" => context.user.clearance_level
   */
  getContextValue(key, context) {
    const parts = key.split(':').pop().split('.');
    let value = context;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Evaluate comparison operators
   */
  evaluateComparison(operator, actualValue, expectedValue) {
    switch (operator) {
      case 'StringEquals':
        return String(actualValue) === String(expectedValue);
      
      case 'StringNotEquals':
        return String(actualValue) !== String(expectedValue);
      
      case 'StringLike':
        return this.wildcardMatch(String(actualValue), String(expectedValue));
      
      case 'NumericEquals':
        return Number(actualValue) === Number(expectedValue);
      
      case 'NumericLessThan':
        return Number(actualValue) < Number(expectedValue);
      
      case 'NumericLessThanEquals':
        return Number(actualValue) <= Number(expectedValue);
      
      case 'NumericGreaterThan':
        return Number(actualValue) > Number(expectedValue);
      
      case 'NumericGreaterThanEquals':
        return Number(actualValue) >= Number(expectedValue);
      
      case 'Bool':
        return Boolean(actualValue) === Boolean(expectedValue);
      
      default:
        systemLogger.warn('Unknown condition operator', { operator });
        return false;
    }
  }
}

module.exports = new ProjectPolicyEngine();
