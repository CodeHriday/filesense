/**
 * Validation middleware module
 * 
 * This module provides validation middleware using Joi schema validation.
 */
const Joi = require('joi');

/**
 * Validate request data against a Joi schema
 * @param {Object} schema - Joi schema object with body, query, and params validation
 * @returns {Function} Express middleware function
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    const validationOptions = {
      abortEarly: false, // Include all errors
      allowUnknown: true, // Ignore unknown props
      stripUnknown: true // Remove unknown props
    };
    
    // Validate request body if a schema was provided
    if (schema.body) {
      const { error, value } = schema.body.validate(req.body, validationOptions);
      
      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        return res.status(400).json({
          error: 'Validation Error',
          message: 'The request body contains invalid data',
          errors
        });
      }
      
      // Replace req.body with validated and sanitized value
      req.body = value;
    }
    
    // Validate request query parameters if a schema was provided
    if (schema.query) {
      const { error, value } = schema.query.validate(req.query, validationOptions);
      
      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        return res.status(400).json({
          error: 'Validation Error',
          message: 'The request query parameters contain invalid data',
          errors
        });
      }
      
      // Replace req.query with validated and sanitized value
      req.query = value;
    }
    
    // Validate request URL parameters if a schema was provided
    if (schema.params) {
      const { error, value } = schema.params.validate(req.params, validationOptions);
      
      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        return res.status(400).json({
          error: 'Validation Error',
          message: 'The request URL parameters contain invalid data',
          errors
        });
      }
      
      // Replace req.params with validated and sanitized value
      req.params = value;
    }
    
    next();
  };
};

/**
 * Schema for validating transformation requests
 */
const transformationSchema = {
  body: Joi.object({
    name: Joi.string().min(1).max(255).required()
      .messages({
        'string.empty': 'Transformation name is required',
        'string.min': 'Transformation name must be at least {#limit} characters',
        'string.max': 'Transformation name cannot exceed {#limit} characters',
        'any.required': 'Transformation name is required'
      }),
    
    description: Joi.string().allow('', null).max(1000)
      .messages({
        'string.max': 'Description cannot exceed {#limit} characters'
      }),
    
    source_file_id: Joi.string().allow('', null),
    target_file_id: Joi.string().allow('', null),
    
    transform_type: Joi.string().valid(
      'join', 'filter', 'aggregate', 'transform', 'map', 'cleanse', 'enrich', 'lookup', 'custom'
    ).required()
      .messages({
        'string.empty': 'Transformation type is required',
        'any.only': 'Transformation type must be one of: join, filter, aggregate, transform, map, cleanse, enrich, lookup, custom',
        'any.required': 'Transformation type is required'
      }),
    
    transform_config: Joi.object().required()
      .messages({
        'object.base': 'Transformation configuration must be an object',
        'any.required': 'Transformation configuration is required'
      }),
    
    status: Joi.string().valid('created', 'running', 'completed', 'failed', 'scheduled').default('created')
      .messages({
        'any.only': 'Status must be one of: created, running, completed, failed, scheduled'
      })
  }),
  
  params: Joi.object({
    id: Joi.string().required()
      .messages({
        'string.empty': 'Transformation ID is required',
        'any.required': 'Transformation ID is required'
      })
  })
};

/**
 * Schema for validating user requests
 */
const userSchema = {
  body: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required()
      .messages({
        'string.empty': 'Username is required',
        'string.alphanum': 'Username must only contain alphanumeric characters',
        'string.min': 'Username must be at least {#limit} characters',
        'string.max': 'Username cannot exceed {#limit} characters',
        'any.required': 'Username is required'
      }),
    
    password: Joi.string().min(8).max(100).required()
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$'))
      .messages({
        'string.empty': 'Password is required',
        'string.min': 'Password must be at least {#limit} characters',
        'string.max': 'Password cannot exceed {#limit} characters',
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character',
        'any.required': 'Password is required'
      }),
    
    email: Joi.string().email().required()
      .messages({
        'string.empty': 'Email is required',
        'string.email': 'Invalid email format',
        'any.required': 'Email is required'
      }),
    
    firstName: Joi.string().max(50).allow('', null),
    lastName: Joi.string().max(50).allow('', null),
    
    roles: Joi.array().items(Joi.string()).default(['User'])
  }),
  
  params: Joi.object({
    id: Joi.string().required()
      .messages({
        'string.empty': 'User ID is required',
        'any.required': 'User ID is required'
      })
  })
};

/**
 * Schema for validating login requests
 */
const loginSchema = {
  body: Joi.object({
    username: Joi.string().required()
      .messages({
        'string.empty': 'Username is required',
        'any.required': 'Username is required'
      }),
    
    password: Joi.string().required()
      .messages({
        'string.empty': 'Password is required',
        'any.required': 'Password is required'
      })
  })
};

/**
 * Schema for validating file upload requests
 */
const fileUploadSchema = {
  body: Joi.object({
    file_name: Joi.string().allow('', null),
    file_description: Joi.string().allow('', null),
    metadata: Joi.object().allow(null)
  })
};

module.exports = {
  validateRequest,
  transformationSchema,
  userSchema,
  loginSchema,
  fileUploadSchema
};