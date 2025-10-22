/**
 * Policy-based Authorization Middleware
 * 
 * This middleware integrates the PolicyEngine service into the Express middleware chain,
 * providing policy-based access control for routes.
 */

const PolicyEngine = require('../services/policyEngine');
const { systemLogger } = require('../utils/logger');

class PolicyAuthorizationMiddleware {
  constructor(dbPool) {
    this.policyEngine = new PolicyEngine(dbPool);
  }

  /**
   * Create middleware that checks if user is authorized for an action
   * @param {string} action - Action to check (e.g., 'file:read', 'project:create')
   * @param {Object} options - Options for authorization
   * @param {Function} options.resourceType - Function to extract resource type from req
   * @param {Function} options.resourceId - Function to extract resource ID from req
   * @param {Function} options.context - Function to build additional context from req
   */
  requirePolicy(action, options = {}) {
    return async (req, res, next) => {
      try {
        const userId = req.user?.id;
        
        if (!userId) {
          systemLogger.warn('Policy check failed: No user in request');
          return res.status(401).json({ error: 'Authentication required' });
        }

        const resourceType = options.resourceType ? options.resourceType(req) : null;
        const resourceId = options.resourceId ? options.resourceId(req) : null;
        const additionalContext = options.context ? options.context(req) : {};

        const decision = await this.policyEngine.evaluateAccess(
          userId,
          action,
          resourceType,
          resourceId,
          additionalContext
        );

        if (decision.allowed) {
          systemLogger.debug('Policy check passed', {
            userId,
            action,
            resourceType,
            resourceId,
            decision: decision.decision
          });
          req.policyDecision = decision;
          return next();
        } else {
          systemLogger.warn('Policy check denied', {
            userId,
            action,
            resourceType,
            resourceId,
            reason: decision.reason,
            decision: decision.decision
          });
          return res.status(403).json({
            error: 'Access denied',
            reason: decision.reason,
            decision: decision.decision
          });
        }
      } catch (error) {
        systemLogger.error('Error during policy authorization', error);
        return res.status(500).json({ error: 'Authorization check failed' });
      }
    };
  }

  /**
   * Create middleware that checks multiple actions (OR logic)
   * User needs to be authorized for at least one action
   */
  requireAnyPolicy(actions, options = {}) {
    return async (req, res, next) => {
      try {
        const userId = req.user?.id;
        
        if (!userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const resourceType = options.resourceType ? options.resourceType(req) : null;
        const resourceId = options.resourceId ? options.resourceId(req) : null;
        const additionalContext = options.context ? options.context(req) : {};

        for (const action of actions) {
          const decision = await this.policyEngine.evaluateAccess(
            userId,
            action,
            resourceType,
            resourceId,
            additionalContext
          );

          if (decision.allowed) {
            systemLogger.debug('Policy check passed (any)', {
              userId,
              action,
              resourceType,
              resourceId
            });
            req.policyDecision = decision;
            return next();
          }
        }

        systemLogger.warn('Policy check denied (none matched)', {
          userId,
          actions,
          resourceType,
          resourceId
        });
        
        return res.status(403).json({
          error: 'Access denied',
          reason: 'Insufficient permissions'
        });
      } catch (error) {
        systemLogger.error('Error during policy authorization', error);
        return res.status(500).json({ error: 'Authorization check failed' });
      }
    };
  }

  /**
   * Create middleware that checks multiple actions (AND logic)
   * User needs to be authorized for all actions
   */
  requireAllPolicies(actions, options = {}) {
    return async (req, res, next) => {
      try {
        const userId = req.user?.id;
        
        if (!userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const resourceType = options.resourceType ? options.resourceType(req) : null;
        const resourceId = options.resourceId ? options.resourceId(req) : null;
        const additionalContext = options.context ? options.context(req) : {};

        for (const action of actions) {
          const decision = await this.policyEngine.evaluateAccess(
            userId,
            action,
            resourceType,
            resourceId,
            additionalContext
          );

          if (!decision.allowed) {
            systemLogger.warn('Policy check denied (all required)', {
              userId,
              failedAction: action,
              actions,
              resourceType,
              resourceId,
              reason: decision.reason
            });
            
            return res.status(403).json({
              error: 'Access denied',
              reason: decision.reason,
              failedAction: action
            });
          }
        }

        systemLogger.debug('Policy check passed (all)', {
          userId,
          actions,
          resourceType,
          resourceId
        });
        
        req.policyDecision = { allowed: true, decision: 'ALLOW' };
        return next();
      } catch (error) {
        systemLogger.error('Error during policy authorization', error);
        return res.status(500).json({ error: 'Authorization check failed' });
      }
    };
  }

  /**
   * Check if user has policy permission (utility for use in route handlers)
   */
  async hasPermission(userId, action, resourceType = null, resourceId = null, context = {}) {
    const decision = await this.policyEngine.evaluateAccess(
      userId,
      action,
      resourceType,
      resourceId,
      context
    );
    return decision.allowed;
  }
}

module.exports = PolicyAuthorizationMiddleware;
