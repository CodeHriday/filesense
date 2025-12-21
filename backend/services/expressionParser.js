const { systemLogger } = require('../utils/logger');

/**
 * Expression Parser
 * Parses visual expressions (e.g., "concat(UPPER(first_name), ' ', last_name)")
 * into transformation chains that the engine can execute
 */

/**
 * Tokenize an expression string
 * @param {string} expression - Expression to tokenize
 * @returns {Array} - Array of tokens
 */
function tokenize(expression) {
  if (!expression || typeof expression !== 'string') {
    return [];
  }

  const tokens = [];
  let i = 0;
  
  while (i < expression.length) {
    const char = expression[i];
    
    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    
    // String literals (single or double quotes)
    if (char === "'" || char === '"') {
      const quote = char;
      let str = '';
      i++; // Skip opening quote
      
      while (i < expression.length && expression[i] !== quote) {
        if (expression[i] === '\\' && i + 1 < expression.length) {
          // Handle escaped characters
          i++;
          str += expression[i];
        } else {
          str += expression[i];
        }
        i++;
      }
      
      i++; // Skip closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }
    
    // Numbers
    if (/\d/.test(char) || (char === '-' && i + 1 < expression.length && /\d/.test(expression[i + 1]))) {
      let num = '';
      if (char === '-') {
        num += char;
        i++;
      }
      
      while (i < expression.length && /[\d.]/.test(expression[i])) {
        num += expression[i];
        i++;
      }
      
      tokens.push({ type: 'NUMBER', value: parseFloat(num) });
      continue;
    }
    
    // Variables ($variable_name)
    if (char === '$') {
      let varName = '$';
      i++; // Skip $
      
      while (i < expression.length && /[A-Za-z0-9_]/.test(expression[i])) {
        varName += expression[i];
        i++;
      }
      
      tokens.push({ type: 'VARIABLE', value: varName });
      continue;
    }
    
    // Parentheses
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    
    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }
    
    // Comma
    if (char === ',') {
      tokens.push({ type: 'COMMA', value: ',' });
      i++;
      continue;
    }
    
    // Identifiers (function names, column names - including hyphenated)
    if (/[A-Za-z_]/.test(char)) {
      let identifier = '';
      
      while (i < expression.length && /[A-Za-z0-9_-]/.test(expression[i])) {
        identifier += expression[i];
        i++;
      }
      
      tokens.push({ type: 'IDENTIFIER', value: identifier });
      continue;
    }
    
    // Unknown character - skip it
    systemLogger.warn(`Unknown character in expression: '${char}' at position ${i}`);
    i++;
  }
  
  return tokens;
}

/**
 * Parse tokens into an Abstract Syntax Tree (AST)
 * @param {Array} tokens - Token array
 * @returns {Object} - AST node
 */
function parseExpression(tokens) {
  let position = 0;
  
  function peek() {
    return tokens[position];
  }
  
  function consume() {
    return tokens[position++];
  }
  
  function parseNode() {
    const token = peek();
    
    if (!token) {
      throw new Error('Unexpected end of expression');
    }
    
    // String literal
    if (token.type === 'STRING') {
      consume();
      return { type: 'LITERAL', valueType: 'string', value: token.value };
    }
    
    // Number literal
    if (token.type === 'NUMBER') {
      consume();
      return { type: 'LITERAL', valueType: 'number', value: token.value };
    }
    
    // Variable reference
    if (token.type === 'VARIABLE') {
      consume();
      return { type: 'VARIABLE', name: token.value };
    }
    
    // Identifier (could be function or column name)
    if (token.type === 'IDENTIFIER') {
      const identifier = consume();
      
      // Check if it's a function call (followed by '(')
      if (peek() && peek().type === 'LPAREN') {
        consume(); // consume '('
        
        const args = [];
        
        // Parse arguments
        while (peek() && peek().type !== 'RPAREN') {
          args.push(parseNode());
          
          // Check for comma (more arguments)
          if (peek() && peek().type === 'COMMA') {
            consume(); // consume ','
          }
        }
        
        if (!peek() || peek().type !== 'RPAREN') {
          throw new Error('Expected closing parenthesis');
        }
        
        consume(); // consume ')'
        
        return {
          type: 'FUNCTION',
          name: identifier.value,
          arguments: args
        };
      }
      
      // It's a column reference
      return { type: 'COLUMN', name: identifier.value };
    }
    
    throw new Error(`Unexpected token: ${token.type}`);
  }
  
  return parseNode();
}

/**
 * Convert AST to transformation chain
 * @param {Object} ast - AST node
 * @param {Object} context - Execution context with variables and row data
 * @returns {Object} - Transformation chain configuration
 */
function astToTransformationChain(ast, context = {}) {
  if (ast.type === 'LITERAL') {
    // Return literal value
    return {
      type: 'static',
      value: ast.value
    };
  }
  
  if (ast.type === 'COLUMN') {
    // Return column reference
    return {
      type: 'column',
      sourceField: ast.name
    };
  }
  
  if (ast.type === 'VARIABLE') {
    // Return variable reference
    return {
      type: 'variable',
      variableName: ast.name
    };
  }
  
  if (ast.type === 'FUNCTION') {
    let functionName = ast.name.toLowerCase().replace(/-/g, '_');
    const args = ast.arguments;
    
    // Function aliases - map intuitive short names to full function names
    const functionAliases = {
      'add': 'math_add',
      'subtract': 'math_subtract',
      'multiply': 'math_multiply',
      'divide': 'math_divide',
      'current_date': 'system_date',
      'current_timestamp': 'system_timestamp'
    };
    
    // Apply alias if exists
    if (functionAliases[functionName]) {
      functionName = functionAliases[functionName];
    }
    
    // Map function names to transformation types
    const functionMap = {
      'upper': 'upper',
      'lower': 'lower',
      'trim': 'trim',
      'concat': 'concat',
      'substring': 'substring',
      'replace': 'replace',
      'round': 'round',
      'floor': 'floor',
      'ceil': 'ceil',
      'cast': 'cast',
      'date_format': 'date_format',
      'null_to_value': 'null_to_value',
      'if': 'if',
      'case_when': 'case_when',
      'math_add': 'math_add',
      'math_subtract': 'math_subtract',
      'math_multiply': 'math_multiply',
      'math_divide': 'math_divide',
      'lookup': 'lookup',
      'hash': 'hash',
      'split': 'split',
      'system_date': 'system_date',
      'system_timestamp': 'system_timestamp',
      'left_pad': 'left_pad',
      'right_pad': 'right_pad',
      'coalesce': 'coalesce'
    };
    
    const transformationType = functionMap[functionName];
    
    if (!transformationType) {
      throw new Error(`Unknown function: ${ast.name}`);
    }
    
    // Build transformation based on function type
    return buildTransformation(transformationType, args);
  }
  
  throw new Error(`Unknown AST node type: ${ast.type}`);
}

/**
 * Build transformation configuration from function arguments
 * @param {string} transformationType - Type of transformation
 * @param {Array} args - Function arguments (AST nodes)
 * @returns {Object} - Transformation configuration
 */
function buildTransformation(transformationType, args) {
  const config = {
    type: 'transformation',
    transformation: transformationType,
    params: {}
  };
  
  // Handle specific transformation types
  switch (transformationType) {
    case 'concat':
      // concat(field1, field2, ...) or concat(expr1, expr2, ...)
      config.nestedArgs = args;
      config.params.separator = '';
      break;
      
    case 'upper':
    case 'lower':
    case 'trim':
    case 'floor':
    case 'ceil':
      // Single argument functions
      if (args.length > 0) {
        config.nestedArgs = [args[0]];
      }
      break;
      
    case 'substring':
      // substring(field, start, length)
      if (args.length > 0) {
        config.nestedArgs = [args[0]];
      }
      if (args.length > 1 && args[1].type === 'LITERAL') {
        config.params.start = args[1].value;
      }
      if (args.length > 2 && args[2].type === 'LITERAL') {
        config.params.length = args[2].value;
      }
      break;
      
    case 'replace':
      // replace(field, find, replaceWith)
      if (args.length > 0) {
        config.nestedArgs = [args[0]];
      }
      if (args.length > 1 && args[1].type === 'LITERAL') {
        config.params.find = args[1].value;
      }
      if (args.length > 2 && args[2].type === 'LITERAL') {
        config.params.replaceWith = args[2].value;
      }
      break;
      
    case 'round':
      // round(field, decimals)
      if (args.length > 0) {
        config.nestedArgs = [args[0]];
      }
      if (args.length > 1 && args[1].type === 'LITERAL') {
        config.params.decimals = args[1].value;
      }
      break;
      
    case 'cast':
      // cast(field, targetType)
      if (args.length > 0) {
        config.nestedArgs = [args[0]];
      }
      if (args.length > 1 && args[1].type === 'LITERAL') {
        config.params.targetType = args[1].value;
      }
      break;
      
    case 'date_format':
      // date_format(field, inputFormat, outputFormat)
      if (args.length > 0) {
        config.nestedArgs = [args[0]];
      }
      if (args.length > 1 && args[1].type === 'LITERAL') {
        config.params.inputFormat = args[1].value;
      }
      if (args.length > 2 && args[2].type === 'LITERAL') {
        config.params.outputFormat = args[2].value;
      }
      break;
      
    case 'null_to_value':
      // null_to_value(field, defaultValue)
      if (args.length > 0) {
        config.nestedArgs = [args[0]];
      }
      if (args.length > 1 && args[1].type === 'LITERAL') {
        config.params.defaultValue = args[1].value;
      }
      break;
      
    case 'math_add':
    case 'math_subtract':
    case 'math_multiply':
    case 'math_divide':
      // math_op(field1, field2) or math_op(field, literal)
      // Support both multi-field operations and single-field with literal
      config.nestedArgs = args;
      break;
      
    case 'split':
      // split(field, delimiter, index)
      if (args.length > 0) {
        config.nestedArgs = [args[0]];
      }
      if (args.length > 1 && args[1].type === 'LITERAL') {
        config.params.delimiter = args[1].value;
      }
      if (args.length > 2 && args[2].type === 'LITERAL') {
        config.params.index = args[2].value;
      }
      break;
      
    case 'left_pad':
    case 'right_pad':
      // pad(field, length, padChar)
      if (args.length > 0) {
        config.nestedArgs = [args[0]];
      }
      if (args.length > 1 && args[1].type === 'LITERAL') {
        config.params.length = args[1].value;
      }
      if (args.length > 2 && args[2].type === 'LITERAL') {
        config.params.padChar = args[2].value;
      }
      break;
      
    case 'coalesce':
      // coalesce(field1, field2, ...)
      config.nestedArgs = args;
      break;
      
    case 'system_date':
      // system_date(format) - defaults to YYYY-MM-DD for date only
      if (args.length > 0 && args[0].type === 'LITERAL') {
        config.params.format = args[0].value;
      } else {
        config.params.format = 'YYYY-MM-DD';
      }
      break;
      
    case 'system_timestamp':
      // system_timestamp(format) - defaults to YYYY-MM-DD HH:mm:ss for full timestamp
      config.transformation = 'system_date'; // Use same underlying transformation
      if (args.length > 0 && args[0].type === 'LITERAL') {
        config.params.format = args[0].value;
      } else {
        config.params.format = 'YYYY-MM-DD HH:mm:ss';
      }
      break;
      
    case 'if':
      // if(field, operator, compareValue, thenValue, elseValue)
      // Supports both mathematical symbols (>, <, >=, <=, =, !=) and English names
      if (args.length > 0) {
        config.nestedArgs = [args[0]];
      }
      if (args.length > 1 && args[1].type === 'LITERAL') {
        config.params.operator = args[1].value;
      }
      if (args.length > 2) {
        // compareValue can be literal, column, or variable
        if (args[2].type === 'LITERAL') {
          config.params.compareValue = args[2].value;
        } else if (args[2].type === 'COLUMN') {
          config.params.compareValue = args[2].name;
        } else if (args[2].type === 'VARIABLE') {
          config.params.compareValue = args[2].name;
        }
      }
      if (args.length > 3) {
        // thenValue can be literal, column, or variable
        if (args[3].type === 'LITERAL') {
          config.params.thenValue = args[3].value;
        } else if (args[3].type === 'COLUMN') {
          config.params.thenValue = args[3].name;
        } else if (args[3].type === 'VARIABLE') {
          config.params.thenValue = args[3].name;
        }
      }
      if (args.length > 4) {
        // elseValue can be literal, column, or variable
        if (args[4].type === 'LITERAL') {
          config.params.elseValue = args[4].value;
        } else if (args[4].type === 'COLUMN') {
          config.params.elseValue = args[4].name;
        } else if (args[4].type === 'VARIABLE') {
          config.params.elseValue = args[4].name;
        }
      }
      break;
      
    case 'case_when':
      // case_when(field, operator1, compareValue1, result1, operator2, compareValue2, result2, ..., defaultValue?)
      // Supports mathematical symbols in operators
      // Arguments come in groups of 3 (operator, compareValue, result), optionally followed by defaultValue
      if (args.length > 0) {
        config.nestedArgs = [args[0]];
      }
      
      // Calculate condition arguments (excluding field)
      const conditionArgsCount = args.length - 1;
      const hasDefault = conditionArgsCount % 3 !== 0;
      
      // Calculate how many complete condition sets we have
      const conditionCount = hasDefault 
        ? Math.floor(conditionArgsCount / 3)
        : conditionArgsCount / 3;
      
      // Parse conditions - skip first arg (field), then parse in groups of 3
      const conditions = [];
      for (let i = 0; i < conditionCount; i++) {
        const baseIndex = 1 + (i * 3); // Start after field arg, then jump by 3
        const condition = {};
        
        // Operator (arg baseIndex)
        if (args[baseIndex].type === 'LITERAL') {
          condition.operator = args[baseIndex].value;
        }
        
        // Compare value (arg baseIndex+1)
        if (args[baseIndex + 1].type === 'LITERAL') {
          condition.compareValue = args[baseIndex + 1].value;
        } else if (args[baseIndex + 1].type === 'COLUMN') {
          condition.compareValue = args[baseIndex + 1].name;
        } else if (args[baseIndex + 1].type === 'VARIABLE') {
          condition.compareValue = args[baseIndex + 1].name;
        }
        
        // Result (arg baseIndex+2)
        if (args[baseIndex + 2].type === 'LITERAL') {
          condition.result = args[baseIndex + 2].value;
        } else if (args[baseIndex + 2].type === 'COLUMN') {
          condition.result = args[baseIndex + 2].name;
        } else if (args[baseIndex + 2].type === 'VARIABLE') {
          condition.result = args[baseIndex + 2].name;
        }
        
        conditions.push(condition);
      }
      
      config.params.conditions = conditions;
      
      // If there's a default value (remainder after dividing by 3), grab it
      if (hasDefault) {
        const lastArg = args[args.length - 1];
        if (lastArg.type === 'LITERAL') {
          config.params.defaultValue = lastArg.value;
        } else if (lastArg.type === 'COLUMN') {
          config.params.defaultValue = lastArg.name;
        } else if (lastArg.type === 'VARIABLE') {
          config.params.defaultValue = lastArg.name;
        }
      }
      break;
      
    default:
      // Generic handling - first arg is the value to transform
      if (args.length > 0) {
        config.nestedArgs = [args[0]];
      }
  }
  
  return config;
}

/**
 * Parse expression and convert to transformation chain
 * @param {string} expression - Expression string
 * @returns {Object} - Transformation configuration
 */
function parseExpressionToTransformation(expression) {
  try {
    if (!expression || typeof expression !== 'string' || expression.trim() === '') {
      return null;
    }
    
    const tokens = tokenize(expression);
    if (tokens.length === 0) {
      return null;
    }
    
    const ast = parseExpression(tokens);
    const transformation = astToTransformationChain(ast);
    
    return transformation;
  } catch (error) {
    systemLogger.error('Expression parsing error:', {
      expression,
      error: error.message
    });
    throw new Error(`Failed to parse expression "${expression}": ${error.message}`);
  }
}

/**
 * Evaluate a transformation configuration to extract source fields and build transformation chain
 * @param {Object} transformConfig - Transformation configuration from parseExpressionToTransformation
 * @param {Object} variableValues - Pre-calculated variable values
 * @returns {Object} - { sourceFields: [], transformations: [] }
 */
function evaluateTransformationConfig(transformConfig, variableValues = {}) {
  const sourceFields = [];
  const transformations = [];
  
  function extractFromConfig(config) {
    if (config.type === 'column') {
      sourceFields.push(config.sourceField);
      return config.sourceField;
    }
    
    if (config.type === 'variable') {
      // Variables are resolved before field mappings
      return config.variableName;
    }
    
    if (config.type === 'static') {
      return config.value;
    }
    
    if (config.type === 'transformation') {
      const transformation = {
        type: config.transformation,
        params: { ...config.params }
      };
      
      // Handle nested arguments
      if (config.nestedArgs && config.nestedArgs.length > 0) {
        // For concat/coalesce - collect all field references and maintain ordering
        if (config.transformation === 'concat') {
          const fields = [];
          const concatParts = []; // Ordered list of {type: 'field'|'literal'|'variable', value: string}
          
          for (const arg of config.nestedArgs) {
            if (arg.type === 'COLUMN') {
              fields.push(arg.name);
              sourceFields.push(arg.name);
              concatParts.push({ type: 'field', value: arg.name });
            } else if (arg.type === 'LITERAL') {
              concatParts.push({ type: 'literal', value: arg.value });
            } else if (arg.type === 'VARIABLE') {
              fields.push(arg.name);
              concatParts.push({ type: 'variable', value: arg.name });
            } else if (arg.type === 'FUNCTION') {
              // Nested function - recursively extract
              extractFromConfig(arg);
              // For now, treat nested functions as fields (will need enhancement)
              concatParts.push({ type: 'expression', value: '<nested>' });
            }
          }
          
          if (fields.length > 0) {
            transformation.params.fields = fields;
          }
          
          // Store ordered parts for concat to properly interleave fields and literals
          transformation.params.concatParts = concatParts;
        } else if (config.transformation === 'coalesce') {
          const fields = [];
          for (const arg of config.nestedArgs) {
            if (arg.type === 'COLUMN') {
              fields.push(arg.name);
              sourceFields.push(arg.name);
            } else if (arg.type === 'VARIABLE') {
              fields.push(arg.name);
            }
          }
          transformation.params.fields = fields;
        } else if (config.transformation === 'math_add' || config.transformation === 'math_subtract' || 
                   config.transformation === 'math_multiply' || config.transformation === 'math_divide') {
          // Math operations: handle both multi-field and single-field with literal
          const mathParts = [];
          const fields = [];
          
          for (const arg of config.nestedArgs) {
            if (arg.type === 'COLUMN') {
              fields.push(arg.name);
              sourceFields.push(arg.name);
              mathParts.push({ type: 'field', value: arg.name });
            } else if (arg.type === 'LITERAL') {
              mathParts.push({ type: 'literal', value: arg.value });
            } else if (arg.type === 'VARIABLE') {
              fields.push(arg.name);
              mathParts.push({ type: 'variable', value: arg.name });
            }
          }
          
          if (fields.length > 0) {
            transformation.params.fields = fields;
          }
          transformation.params.mathParts = mathParts;
        } else {
          // For other functions, first arg is the value to transform
          if (config.nestedArgs[0].type === 'COLUMN') {
            sourceFields.push(config.nestedArgs[0].name);
          } else if (config.nestedArgs[0].type === 'FUNCTION' || config.nestedArgs[0].type === 'transformation') {
            extractFromConfig(config.nestedArgs[0]);
          }
        }
      }
      
      transformations.push(transformation);
      return null;
    }
    
    return null;
  }
  
  extractFromConfig(transformConfig);
  
  return {
    sourceFields: [...new Set(sourceFields)], // Remove duplicates
    transformations
  };
}

module.exports = {
  tokenize,
  parseExpression,
  parseExpressionToTransformation,
  evaluateTransformationConfig,
  astToTransformationChain,
  buildTransformation
};
