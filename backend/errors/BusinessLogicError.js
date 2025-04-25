/**
 * Business Logic Error
 * 
 * Used for errors related to business rules and domain logic
 */
const AppError = require('./AppError');

class BusinessLogicError extends AppError {
  /**
   * Create a new business logic error
   * 
   * @param {string} message - Error message
   * @param {string} rule - Business rule that was violated
   * @param {Object} context - Additional context about the error
   * @param {string} code - Error code (default: BUSINESS_RULE_VIOLATION)
   */
  constructor(
    message = 'Business rule violation',
    rule = null,
    context = {},
    code = 'BUSINESS_RULE_VIOLATION'
  ) {
    super(message, code, 422, { rule, ...context });
    
    this.rule = rule;
    this.businessContext = context;
  }
}

module.exports = BusinessLogicError;