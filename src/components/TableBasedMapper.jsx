import React, { useState, useEffect, useRef } from 'react';
import { FiCheck, FiArrowRight, FiTrash2, FiEdit2, FiX, FiPlus, FiChevronDown, FiChevronUp, FiChevronRight, FiLock } from 'react-icons/fi';
import Editor from 'react-simple-code-editor';
import './TableBasedMapper.css';

const TRANSFORMATION_OPTIONS = [
  { value: 'none', label: 'None (Direct Copy)', group: 'Basic', params: [] },
  { value: 'null-to-value', label: 'Replace Null', group: 'Null Handling', params: [{ name: 'value', type: 'text', placeholder: 'Replacement value' }] },
  { value: 'coalesce', label: 'Coalesce', group: 'Null Handling', params: [{ name: 'column2', type: 'text', placeholder: 'Fallback column' }] },
  { value: 'UPPER', label: 'UPPERCASE', group: 'String', params: [] },
  { value: 'LOWER', label: 'lowercase', group: 'String', params: [] },
  { value: 'TRIM', label: 'Trim Whitespace', group: 'String', params: [] },
  { value: 'SUBSTRING', label: 'Substring', group: 'String', params: [
    { name: 'start', type: 'number', placeholder: 'Start position' },
    { name: 'length', type: 'number', placeholder: 'Length' }
  ]},
  { value: 'REPLACE', label: 'Find & Replace', group: 'String', params: [
    { name: 'find', type: 'text', placeholder: 'Find text' },
    { name: 'replace', type: 'text', placeholder: 'Replace with' }
  ]},
  { value: 'concat', label: 'Concatenate', group: 'String', params: [
    { name: 'separator', type: 'text', placeholder: 'Separator (optional)' },
    { name: 'column2', type: 'text', placeholder: 'Additional column (optional)' }
  ]},
  { value: 'ROUND', label: 'Round', group: 'Numeric', params: [{ name: 'decimals', type: 'number', placeholder: 'Decimal places' }] },
  { value: 'FLOOR', label: 'Floor', group: 'Numeric', params: [] },
  { value: 'CEIL', label: 'Ceiling', group: 'Numeric', params: [] },
  { value: 'add', label: 'Add', group: 'Numeric', params: [{ name: 'value', type: 'number', placeholder: 'Value to add' }] },
  { value: 'subtract', label: 'Subtract', group: 'Numeric', params: [{ name: 'value', type: 'number', placeholder: 'Value to subtract' }] },
  { value: 'multiply', label: 'Multiply', group: 'Numeric', params: [{ name: 'value', type: 'number', placeholder: 'Multiplier' }] },
  { value: 'divide', label: 'Divide', group: 'Numeric', params: [{ name: 'value', type: 'number', placeholder: 'Divisor' }] },
  { value: 'date-format', label: 'Format Date', group: 'Date/Time', params: [{ name: 'format', type: 'text', placeholder: 'e.g., YYYY-MM-DD' }] },
  { value: 'current-date', label: 'Current Date', group: 'Date/Time', params: [] },
  { value: 'cast-string', label: 'To String', group: 'Type Cast', params: [] },
  { value: 'cast-integer', label: 'To Integer', group: 'Type Cast', params: [] },
  { value: 'cast-float', label: 'To Float', group: 'Type Cast', params: [] },
  { 
    value: 'if', 
    label: 'IF Condition', 
    group: 'Conditional', 
    params: [
      { name: 'operator', type: 'select', placeholder: 'Comparison', options: [
        { value: 'equals', label: '=' },
        { value: 'not_equals', label: '!=' },
        { value: 'greater_than', label: '>' },
        { value: 'less_than', label: '<' },
        { value: 'greater_than_or_equal', label: '>=' },
        { value: 'less_than_or_equal', label: '<=' },
        { value: 'contains', label: 'Contains' },
        { value: 'is_null', label: 'Is Null' },
        { value: 'is_not_null', label: 'Is Not Null' }
      ]},
      { name: 'compareValue', type: 'text', placeholder: 'Compare to value' },
      { name: 'thenValue', type: 'text', placeholder: 'Value if TRUE' },
      { name: 'elseValue', type: 'text', placeholder: 'Value if FALSE' }
    ],
    description: 'Supports mathematical symbols: >, <, >=, <=, =, != or English names'
  },
  { 
    value: 'case_when', 
    label: 'CASE WHEN', 
    group: 'Conditional', 
    params: [
      { name: 'conditions', type: 'json', placeholder: 'Conditions array (JSON format)' },
      { name: 'defaultValue', type: 'text', placeholder: 'Default value (else)' }
    ],
    description: 'Use operators: =, !=, >, <, >=, <= in expressions (e.g., case_when(qty, \'>\', 100, \'High\', \'Default\'))'
  }
];

const TableBasedMapper = ({ schema, fieldMappings, variables: initialVariables = [], piiColumns: initialPiiColumns = [], onMappingsChange }) => {
  const [selectedSource, setSelectedSource] = useState(new Set());
  const [mappings, setMappings] = useState([]);
  const [editingExpression, setEditingExpression] = useState(null);
  const [searchSource, setSearchSource] = useState('');
  const [searchTarget, setSearchTarget] = useState('');
  const [addingNewColumn, setAddingNewColumn] = useState(false);
  const [newColumn, setNewColumn] = useState({
    targetField: '',
    sourceField: '',
    transformation: 'none',
    params: {}
  });
  
  // Variables state
  const [variables, setVariables] = useState([]);
  const [variablesExpanded, setVariablesExpanded] = useState(true);
  const [editingVariable, setEditingVariable] = useState(null);
  const [addingVariable, setAddingVariable] = useState(false);
  const [newVariable, setNewVariable] = useState({
    name: '',
    expression: '',
    data_type: ''
  });
  const expressionTextareaRef = useRef(null);
  const editExpressionTextareaRef = useRef(null);
  
  // Cursor positioning state - tracks where cursor should be placed after React updates DOM
  const [pendingCursorPos, setPendingCursorPos] = useState(null);
  const [pendingEditCursorPos, setPendingEditCursorPos] = useState(null);
  
  // PII tagging state
  const [piiColumns, setPiiColumns] = useState(new Set(initialPiiColumns || []));

  // Sync variables from prop to local state (always sync, including empty arrays)
  useEffect(() => {
    setVariables(initialVariables || []);
  }, [initialVariables]);

  // Sync PII columns from prop
  useEffect(() => {
    setPiiColumns(new Set(initialPiiColumns || []));
  }, [initialPiiColumns]);
  
  // Auto-populate PII columns from schema on initial load
  useEffect(() => {
    if (schema && schema.length > 0 && initialPiiColumns.length === 0) {
      const piiFieldsFromSchema = schema
        .filter(col => col.contains_pii || col.is_pii || col.pii)
        .map(col => col.name);
      
      if (piiFieldsFromSchema.length > 0) {
        const newPiiSet = new Set(piiFieldsFromSchema);
        setPiiColumns(newPiiSet);
        onMappingsChange(mappings, variables, Array.from(newPiiSet));
      }
    }
  }, [schema]);

  useEffect(() => {
    if (fieldMappings && fieldMappings.length > 0) {
      setMappings(fieldMappings);
      const selectedFields = new Set(fieldMappings.map(m => m.source_field));
      setSelectedSource(selectedFields);
    }
  }, [fieldMappings]);
  
  // Position cursor after React updates newVariable expression in DOM
  useEffect(() => {
    if (pendingCursorPos !== null && expressionTextareaRef.current) {
      const textarea = expressionTextareaRef.current.querySelector('textarea');
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(pendingCursorPos, pendingCursorPos);
      }
      // Clear pending position after applying
      setPendingCursorPos(null);
    }
  }, [newVariable.expression, pendingCursorPos]);
  
  // Position cursor after React updates editingVariable expression in DOM
  useEffect(() => {
    if (pendingEditCursorPos !== null && editExpressionTextareaRef.current) {
      const textarea = editExpressionTextareaRef.current.querySelector('textarea');
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(pendingEditCursorPos, pendingEditCursorPos);
      }
      // Clear pending position after applying
      setPendingEditCursorPos(null);
    }
  }, [editingVariable?.expression, pendingEditCursorPos]);
  
  // Toggle PII status for a field
  const togglePII = (targetField) => {
    const newPiiColumns = new Set(piiColumns);
    if (newPiiColumns.has(targetField)) {
      newPiiColumns.delete(targetField);
    } else {
      newPiiColumns.add(targetField);
    }
    setPiiColumns(newPiiColumns);
    onMappingsChange(mappings, variables, Array.from(newPiiColumns));
  };

  const buildExpression = (mapping) => {
    if (!mapping.transformation || mapping.transformation === 'none') {
      return mapping.source_field;
    }

    const transform = TRANSFORMATION_OPTIONS.find(t => t.value === mapping.transformation);
    if (!transform) return mapping.source_field;

    let expr = `${mapping.transformation}(${mapping.source_field}`;
    
    if (mapping.transformation_params && Object.keys(mapping.transformation_params).length > 0) {
      const params = Object.values(mapping.transformation_params).filter(v => v);
      if (params.length > 0) {
        expr += ', ' + params.map(p => typeof p === 'string' ? `'${p}'` : p).join(', ');
      }
    }
    
    expr += ')';
    return expr;
  };

  const handleSourceToggle = (fieldName) => {
    const newSelected = new Set(selectedSource);
    
    if (newSelected.has(fieldName)) {
      newSelected.delete(fieldName);
      const newMappings = mappings.filter(m => m.source_field !== fieldName);
      setMappings(newMappings);
      onMappingsChange(newMappings, variables, Array.from(piiColumns));
    } else {
      newSelected.add(fieldName);
      const newMapping = {
        source_field: fieldName,
        target_field: fieldName,
        transformation: 'none',
        transformation_params: {}
      };
      const newMappings = [...mappings, newMapping];
      setMappings(newMappings);
      onMappingsChange(newMappings, variables, Array.from(piiColumns));
    }
    
    setSelectedSource(newSelected);
  };

  const handleAutomap = () => {
    const newMappings = schema.map(field => ({
      source_field: field.name,
      target_field: field.name,
      transformation: 'none',
      transformation_params: {}
    }));
    
    setMappings(newMappings);
    setSelectedSource(new Set(schema.map(f => f.name)));
    onMappingsChange(newMappings, variables, Array.from(piiColumns));
  };

  const handleClearMapping = () => {
    setMappings([]);
    setSelectedSource(new Set());
    onMappingsChange([], variables, Array.from(piiColumns));
  };

  const handleRemoveMapping = (sourceField) => {
    const newMappings = mappings.filter(m => m.source_field !== sourceField);
    const newSelected = new Set(selectedSource);
    newSelected.delete(sourceField);
    
    setMappings(newMappings);
    setSelectedSource(newSelected);
    onMappingsChange(newMappings, variables, Array.from(piiColumns));
  };

  const handleTargetNameChange = (sourceField, newTargetName) => {
    const newMappings = mappings.map(m => 
      m.source_field === sourceField ? { ...m, target_field: newTargetName } : m
    );
    setMappings(newMappings);
    onMappingsChange(newMappings, variables, Array.from(piiColumns));
  };

  const handleEditExpression = (sourceField) => {
    const mapping = mappings.find(m => m.source_field === sourceField);
    if (mapping) {
      setEditingExpression({
        sourceField,
        transformation: mapping.transformation || 'none',
        params: mapping.transformation_params || {}
      });
    }
  };

  const handleSaveExpression = () => {
    if (!editingExpression) return;

    const newMappings = mappings.map(m => {
      if (m.source_field === editingExpression.sourceField) {
        return {
          ...m,
          transformation: editingExpression.transformation,
          transformation_params: editingExpression.params
        };
      }
      return m;
    });

    setMappings(newMappings);
    onMappingsChange(newMappings, variables, Array.from(piiColumns));
    setEditingExpression(null);
  };

  const handleTransformationChange = (value) => {
    const transform = TRANSFORMATION_OPTIONS.find(t => t.value === value);
    setEditingExpression({
      ...editingExpression,
      transformation: value,
      params: transform && transform.params.length > 0 ? {} : {}
    });
  };

  const handleParamChange = (paramName, paramValue) => {
    setEditingExpression({
      ...editingExpression,
      params: {
        ...editingExpression.params,
        [paramName]: paramValue
      }
    });
  };

  const handleAddNewColumn = () => {
    setNewColumn({
      targetField: '',
      sourceField: '',
      transformation: 'none',
      params: {}
    });
    setAddingNewColumn(true);
  };

  const handleNewColumnChange = (field, value) => {
    setNewColumn({
      ...newColumn,
      [field]: value
    });
  };

  const handleNewColumnTransformationChange = (value) => {
    const transform = TRANSFORMATION_OPTIONS.find(t => t.value === value);
    setNewColumn({
      ...newColumn,
      transformation: value,
      params: transform && transform.params.length > 0 ? {} : {}
    });
  };

  const handleNewColumnParamChange = (paramName, paramValue) => {
    setNewColumn({
      ...newColumn,
      params: {
        ...newColumn.params,
        [paramName]: paramValue
      }
    });
  };

  const handleSaveNewColumn = () => {
    if (!newColumn.targetField.trim()) {
      alert('Please enter a target field name');
      return;
    }

    // Check if target field name already exists
    if (mappings.some(m => m.target_field === newColumn.targetField)) {
      alert('A field with this target name already exists');
      return;
    }

    const newMapping = {
      source_field: newColumn.sourceField || `__custom_${Date.now()}__`,
      target_field: newColumn.targetField,
      transformation: newColumn.transformation,
      transformation_params: newColumn.params,
      is_custom: !newColumn.sourceField
    };

    const newMappings = [...mappings, newMapping];
    setMappings(newMappings);
    onMappingsChange(newMappings, variables, Array.from(piiColumns));
    setAddingNewColumn(false);
  };

  const buildExpressionForCustom = (mapping) => {
    if (mapping.is_custom) {
      if (!mapping.transformation || mapping.transformation === 'none') {
        return '(custom value)';
      }
      
      const transform = TRANSFORMATION_OPTIONS.find(t => t.value === mapping.transformation);
      if (!transform) return '(custom value)';

      let expr = `${mapping.transformation}(`;
      
      if (mapping.transformation_params && Object.keys(mapping.transformation_params).length > 0) {
        const params = Object.values(mapping.transformation_params).filter(v => v);
        expr += params.map(p => typeof p === 'string' ? `'${p}'` : p).join(', ');
      }
      
      expr += ')';
      return expr;
    }
    return buildExpression(mapping);
  };

  // Syntax highlighting function for react-simple-code-editor (returns HTML string)
  const highlightExpression = (expression) => {
    if (!expression) return expression || '';
    
    // Get all column names and variable names for matching
    const columnNames = schema.map(f => f.name);
    const variableNames = variables.map(v => v.name);
    const functionNames = TRANSFORMATION_OPTIONS.map(t => t.value);
    
    // Conditional function names for special highlighting
    const conditionalFunctions = ['if', 'case_when'];
    
    // Build regex pattern for tokenization
    // Match: strings, variables, or identifiers (including hyphenated function names)
    const pattern = /'[^']*'|"[^"]*"|\$\w+|[\w-]+/g;
    
    const tokens = [];
    let lastIndex = 0;
    let match;
    
    while ((match = pattern.exec(expression)) !== null) {
      // Add any text before this match (operators, parens, etc.)
      if (match.index > lastIndex) {
        tokens.push({
          type: 'other',
          text: expression.substring(lastIndex, match.index)
        });
      }
      
      const token = match[0];
      
      // Determine token type
      if (token.startsWith("'") || token.startsWith('"')) {
        // String literal
        tokens.push({ type: 'string', text: token });
      } else if (token.startsWith('$')) {
        // Variable reference
        tokens.push({ type: 'variable', text: token });
      } else if (conditionalFunctions.includes(token)) {
        // Conditional function (IF, CASE_WHEN) - amber highlight
        tokens.push({ type: 'conditional', text: token });
      } else if (functionNames.includes(token)) {
        // Function name
        tokens.push({ type: 'function', text: token });
      } else if (columnNames.includes(token)) {
        // Column name
        tokens.push({ type: 'column', text: token });
      } else {
        // Other identifier or keyword
        tokens.push({ type: 'other', text: token });
      }
      
      lastIndex = pattern.lastIndex;
    }
    
    // Add any remaining text
    if (lastIndex < expression.length) {
      tokens.push({
        type: 'other',
        text: expression.substring(lastIndex)
      });
    }
    
    // Convert tokens to HTML string for react-simple-code-editor
    const htmlParts = tokens.map((token) => {
      const color = token.type === 'conditional' ? '#f59e0b' :  // amber for if/case_when
                    token.type === 'function' ? '#10B981' :     // green
                    token.type === 'column' ? '#3B82F6' :       // blue
                    token.type === 'variable' ? '#8B5CF6' :     // purple for variables
                    token.type === 'string' ? '#000000' :       // black
                    '#374151';  // default dark gray
      
      // Escape HTML special characters
      const escapedText = token.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      
      return `<span style="color: ${color};">${escapedText}</span>`;
    });
    
    return htmlParts.join('');
  };

  // Variable handlers
  const handleAddVariable = () => {
    setNewVariable({
      name: '',
      expression: ''
    });
    setAddingVariable(true);
  };

  // Sanitize text to remove invisible Unicode characters that can cause cursor offset issues
  const sanitizeText = (text) => {
    return text
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces and BOM
      .replace(/[\u00A0]/g, ' ')              // Replace non-breaking spaces with regular spaces
      .replace(/[\u2028\u2029]/g, '\n')       // Normalize line separators
      .normalize('NFC');                      // Normalize to canonical composition
  };

  // Helper function to insert text at cursor position in expression editor
  const insertAtCursor = (text, isEditMode = false) => {
    // Sanitize the text before insertion to prevent invisible character issues
    const sanitizedText = sanitizeText(text);
    
    // Get the textarea element from the Editor component ref
    const editorRef = isEditMode ? editExpressionTextareaRef.current : expressionTextareaRef.current;
    const textarea = editorRef?.querySelector('textarea');
    
    if (!textarea) {
      // Fallback: append to end if no textarea ref available
      if (isEditMode) {
        const currentValue = editingVariable?.expression || '';
        setEditingVariable({ ...editingVariable, expression: currentValue + sanitizedText });
      } else {
        const currentValue = newVariable.expression || '';
        setNewVariable({ ...newVariable, expression: currentValue + sanitizedText });
      }
      return;
    }

    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const currentValue = isEditMode ? (editingVariable?.expression || '') : (newVariable.expression || '');
    const newValue = currentValue.substring(0, start) + sanitizedText + currentValue.substring(end);
    
    // Calculate where cursor should be after insertion
    const newPos = start + sanitizedText.length;
    
    if (isEditMode) {
      setEditingVariable({ ...editingVariable, expression: newValue });
      // Set pending cursor position - useEffect will apply it after React updates DOM
      setPendingEditCursorPos(newPos);
    } else {
      setNewVariable({ ...newVariable, expression: newValue });
      // Set pending cursor position - useEffect will apply it after React updates DOM
      setPendingCursorPos(newPos);
    }
  };

  // Helper function to get function syntax template
  const getFunctionSyntax = (transformOption) => {
    // Special syntax for conditional functions
    if (transformOption.value === 'if') {
      return `if(column, '>', 100, 'High', 'Low')`;
    }
    
    if (transformOption.value === 'case_when') {
      return `case_when(column, '=', 'A', 'Result A', '>', 50, 'High', 'Default')`;
    }
    
    if (transformOption.params.length === 0) {
      return `${transformOption.value}(column)`;
    }
    
    // Wrap parameter placeholders in single quotes to prevent space-based tokenization issues
    const paramPlaceholders = transformOption.params
      .map(p => `'${p.placeholder || p.name}'`)
      .join(', ');
    return `${transformOption.value}(column, ${paramPlaceholders})`;
  };

  // Insert column name at cursor
  const handleInsertColumn = (columnName, isEditMode = false) => {
    insertAtCursor(columnName, isEditMode);
  };

  // Insert variable reference at cursor
  const handleInsertVariable = (variableName, isEditMode = false) => {
    insertAtCursor(`$${variableName}`, isEditMode);
  };

  // Insert function template at cursor
  const handleInsertFunction = (transformOption, isEditMode = false) => {
    const syntax = getFunctionSyntax(transformOption);
    insertAtCursor(syntax, isEditMode);
  };

  const handleSaveVariable = () => {
    if (!newVariable.name.trim()) {
      alert('Please enter a variable name');
      return;
    }

    if (!newVariable.expression.trim()) {
      alert('Please enter an expression for the variable');
      return;
    }

    // Validate variable name format
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newVariable.name)) {
      alert('Variable name must start with a letter or underscore and contain only letters, numbers, and underscores');
      return;
    }

    // Check if variable name already exists
    if (variables.some(v => v.name === newVariable.name)) {
      alert('A variable with this name already exists');
      return;
    }

    const variable = {
      id: `var_${Date.now()}`,
      name: newVariable.name,
      expression: newVariable.expression,
      source_field: null,
      transformation: 'none',
      transformation_params: {}
    };

    const newVariables = [...variables, variable];
    setVariables(newVariables);
    setAddingVariable(false);
    setNewVariable({ name: '', expression: '' });
    onMappingsChange(mappings, newVariables, Array.from(piiColumns));
  };

  const handleEditVariable = (variable) => {
    setEditingVariable({
      ...variable,
      expression: variable.expression || buildVariableExpression(variable),
      params: variable.transformation_params || {}
    });
  };

  const handleSaveEditedVariable = () => {
    if (!editingVariable) return;

    if (!editingVariable.expression.trim()) {
      alert('Please enter an expression for the variable');
      return;
    }

    const updatedVariables = variables.map(v =>
      v.id === editingVariable.id
        ? {
            ...v,
            expression: editingVariable.expression,
            source_field: null,
            transformation: 'none',
            transformation_params: {}
          }
        : v
    );

    setVariables(updatedVariables);
    setEditingVariable(null);
    onMappingsChange(mappings, updatedVariables, Array.from(piiColumns));
  };

  const handleDeleteVariable = (variableId) => {
    const newVariables = variables.filter(v => v.id !== variableId);
    setVariables(newVariables);
    onMappingsChange(mappings, newVariables, Array.from(piiColumns));
  };

  const handleMoveVariableUp = (index) => {
    if (index === 0) return;
    const newVariables = [...variables];
    [newVariables[index - 1], newVariables[index]] = [newVariables[index], newVariables[index - 1]];
    setVariables(newVariables);
    onMappingsChange(mappings, newVariables, Array.from(piiColumns));
  };

  const handleMoveVariableDown = (index) => {
    if (index === variables.length - 1) return;
    const newVariables = [...variables];
    [newVariables[index], newVariables[index + 1]] = [newVariables[index + 1], newVariables[index]];
    setVariables(newVariables);
    onMappingsChange(mappings, newVariables, Array.from(piiColumns));
  };

  const handleVariableTransformationChange = (value) => {
    const transform = TRANSFORMATION_OPTIONS.find(t => t.value === value);
    if (editingVariable) {
      setEditingVariable({
        ...editingVariable,
        transformation: value,
        params: transform && transform.params.length > 0 ? {} : {}
      });
    } else {
      setNewVariable({
        ...newVariable,
        transformation: value,
        params: transform && transform.params.length > 0 ? {} : {}
      });
    }
  };

  const handleVariableParamChange = (paramName, paramValue) => {
    if (editingVariable) {
      setEditingVariable({
        ...editingVariable,
        params: {
          ...editingVariable.params,
          [paramName]: paramValue
        }
      });
    } else {
      setNewVariable({
        ...newVariable,
        params: {
          ...newVariable.params,
          [paramName]: paramValue
        }
      });
    }
  };

  const buildVariableExpression = (variable) => {
    // If variable has direct expression field, use that
    if (variable.expression) {
      return variable.expression;
    }

    // Otherwise, build from legacy format (backwards compatibility)
    const sourceField = variable.source_field || variable.sourceField;
    if (!variable.transformation || variable.transformation === 'none') {
      return sourceField || '(no source)';
    }

    const transform = TRANSFORMATION_OPTIONS.find(t => t.value === variable.transformation);
    if (!transform) return sourceField || '(no source)';

    let expr = `${variable.transformation}(`;
    if (sourceField) {
      expr += sourceField;
    }
    
    const params = variable.transformation_params || variable.params || {};
    if (Object.keys(params).length > 0) {
      const paramValues = Object.values(params).filter(v => v);
      if (paramValues.length > 0) {
        if (sourceField) expr += ', ';
        expr += paramValues.map(p => typeof p === 'string' ? `'${p}'` : p).join(', ');
      }
    }
    
    expr += ')';
    return expr;
  };

  const filteredSourceFields = schema.filter(field => 
    field.name.toLowerCase().includes(searchSource.toLowerCase())
  );

  const filteredMappings = mappings.filter(mapping =>
    mapping.target_field.toLowerCase().includes(searchTarget.toLowerCase())
  );

  return (
    <div className="table-based-mapper">
      <div className="mapper-header">
        <h3>Field Mapping Parameter Details</h3>
        <div className="mapper-actions">
          <button className="btn btn-secondary btn-xs" onClick={handleClearMapping} style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.125rem 0.25rem' }}>
            Clear Mapping
          </button>
          <button className="btn btn-primary btn-xs" onClick={handleAutomap} style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.125rem 0.25rem' }}>
            Automap
          </button>
        </div>
      </div>

      {/* Variables Section */}
      <div className="variables-section">
        <div className="variables-header" onClick={() => setVariablesExpanded(!variablesExpanded)}>
          <div className="variables-title">
            {variablesExpanded ? <FiChevronDown /> : <FiChevronRight />}
            <h4>Variables ({variables.length})</h4>
            <span className="variables-info">Pre-calculations executed sequentially</span>
          </div>
          <button 
            className="btn btn-primary btn-xs" 
            onClick={(e) => { e.stopPropagation(); handleAddVariable(); }}
            style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.125rem 0.25rem', gap: '0.125rem' }}
          >
            <FiPlus /> Add Variable
          </button>
        </div>

        {variablesExpanded && (
          <div className="variables-content">
            {variables.length === 0 ? (
              <div className="no-variables">
                No variables defined. Click "Add Variable" to create pre-calculations that can be used in field mappings.
              </div>
            ) : (
              <div className="variables-list">
                {variables.map((variable, index) => (
                  <div key={variable.id} className="variable-item">
                    <div className="variable-order">
                      <button
                        className="btn-icon-small"
                        onClick={() => handleMoveVariableUp(index)}
                        disabled={index === 0}
                        title="Move up"
                      >
                        <FiChevronUp />
                      </button>
                      <span className="order-number">{index + 1}</span>
                      <button
                        className="btn-icon-small"
                        onClick={() => handleMoveVariableDown(index)}
                        disabled={index === variables.length - 1}
                        title="Move down"
                      >
                        <FiChevronDown />
                      </button>
                    </div>
                    <div className="variable-info">
                      <div className="variable-name">
                        <strong>${variable.name}</strong> =
                      </div>
                      <div className="variable-expression">
                        {buildVariableExpression(variable)}
                      </div>
                    </div>
                    <div className="variable-actions">
                      <button
                        className="btn-icon-small"
                        onClick={() => handleEditVariable(variable)}
                        title="Edit variable"
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        className="btn-icon-small"
                        onClick={() => handleDeleteVariable(variable.id)}
                        title="Delete variable"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mapper-panels">
        <div className="source-panel">
          <h4>Incoming Fields</h4>
          <div className="field-search">
            <input
              type="text"
              placeholder="Find"
              value={searchSource}
              onChange={(e) => setSearchSource(e.target.value)}
              className="form-control-sm"
            />
          </div>
          <div className="source-fields-list">
            {filteredSourceFields.map(field => (
              <div key={field.name} className="source-field-item">
                <input
                  type="checkbox"
                  id={`source-${field.name}`}
                  checked={selectedSource.has(field.name)}
                  onChange={() => handleSourceToggle(field.name)}
                />
                <label htmlFor={`source-${field.name}`}>
                  {field.name}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="target-panel">
          <div className="target-panel-header">
            <h4>Target Fields</h4>
            <button className="btn btn-primary btn-xs" onClick={handleAddNewColumn} title="Add a new calculated column" style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.125rem 0.25rem', gap: '0.125rem' }}>
              <FiPlus /> Add New Column
            </button>
          </div>
          <div className="field-search">
            <input
              type="text"
              placeholder="Find"
              value={searchTarget}
              onChange={(e) => setSearchTarget(e.target.value)}
              className="form-control-sm"
            />
          </div>
          <div className="target-table-container">
            <table className="target-mapping-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>Status</th>
                  <th style={{ width: '200px' }}>Name</th>
                  <th style={{ width: '60px', textAlign: 'center' }} title="Mark as PII (Personally Identifiable Information)">
                    <FiLock /> PII
                  </th>
                  <th style={{ width: '80px' }}>Actions</th>
                  <th>Expression</th>
                </tr>
              </thead>
              <tbody>
                {filteredMappings.map(mapping => (
                  <tr key={mapping.source_field}>
                    <td className="status-cell">
                      <FiCheck className="status-icon mapped" />
                    </td>
                    <td className="name-cell">
                      <input
                        type="text"
                        value={mapping.target_field}
                        onChange={(e) => handleTargetNameChange(mapping.source_field, e.target.value)}
                        className="target-name-input"
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={piiColumns.has(mapping.target_field)}
                        onChange={() => togglePII(mapping.target_field)}
                        title="Mark as PII"
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td className="actions-cell">
                      {!mapping.is_custom && <FiArrowRight className="arrow-icon" title="Mapped from source" />}
                      {mapping.is_custom && <span className="custom-badge" title="Custom column">Custom</span>}
                      <button 
                        className="btn-icon-small"
                        onClick={() => handleEditExpression(mapping.source_field)}
                        title="Edit expression"
                      >
                        <FiEdit2 />
                      </button>
                      <button 
                        className="btn-icon-small"
                        onClick={() => handleRemoveMapping(mapping.source_field)}
                        title="Remove mapping"
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                    <td className="expression-cell">
                      <span className="expression-text" onClick={() => handleEditExpression(mapping.source_field)}>
                        {buildExpressionForCustom(mapping)}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredMappings.length === 0 && (
                  <tr>
                    <td colSpan="5" className="no-mappings">
                      No field mappings. Select source fields from the left panel or click Automap.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editingExpression && (
        <div className="expression-editor-modal">
          <div className="modal-overlay"></div>
          <div className="modal-content">
            <div className="modal-header">
              <h4>Edit Expression</h4>
              <button className="btn-close" onClick={() => setEditingExpression(null)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Source Field</label>
                <input
                  type="text"
                  value={editingExpression.sourceField}
                  disabled
                  className="form-control"
                />
              </div>

              <div className="form-group">
                <label>Transformation</label>
                <select
                  className="form-control"
                  value={editingExpression.transformation}
                  onChange={(e) => handleTransformationChange(e.target.value)}
                >
                  {TRANSFORMATION_OPTIONS.reduce((acc, option) => {
                    const lastGroup = acc[acc.length - 1];
                    if (!lastGroup || lastGroup.group !== option.group) {
                      acc.push({ group: option.group, options: [option] });
                    } else {
                      lastGroup.options.push(option);
                    }
                    return acc;
                  }, []).map((group, idx) => (
                    <optgroup key={idx} label={group.group}>
                      {group.options.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {TRANSFORMATION_OPTIONS.find(t => t.value === editingExpression.transformation)?.params.map(param => (
                <div key={param.name} className="form-group">
                  <label>{param.name}</label>
                  {param.type === 'select' ? (
                    <select
                      className="form-control"
                      value={editingExpression.params[param.name] || ''}
                      onChange={(e) => handleParamChange(param.name, e.target.value)}
                    >
                      <option value="">{param.placeholder || 'Select...'}</option>
                      {param.options?.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={param.type}
                      className="form-control"
                      value={editingExpression.params[param.name] || ''}
                      onChange={(e) => handleParamChange(param.name, e.target.value)}
                      placeholder={param.placeholder}
                    />
                  )}
                </div>
              ))}

              <div className="form-group">
                <label>Preview</label>
                <div className="expression-preview">
                  {buildExpression({
                    source_field: editingExpression.sourceField,
                    transformation: editingExpression.transformation,
                    transformation_params: editingExpression.params
                  })}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingExpression(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveExpression}>
                Save Expression
              </button>
            </div>
          </div>
        </div>
      )}

      {addingNewColumn && (
        <div className="expression-editor-modal">
          <div className="modal-overlay"></div>
          <div className="modal-content">
            <div className="modal-header">
              <h4>Add New Column</h4>
              <button className="btn-close" onClick={() => setAddingNewColumn(false)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Target Field Name *</label>
                <input
                  type="text"
                  className="form-control"
                  value={newColumn.targetField}
                  onChange={(e) => handleNewColumnChange('targetField', e.target.value)}
                  placeholder="Enter new column name"
                />
              </div>

              <div className="form-group">
                <label>Source Field (Optional)</label>
                <select
                  className="form-control"
                  value={newColumn.sourceField}
                  onChange={(e) => handleNewColumnChange('sourceField', e.target.value)}
                >
                  <option value="">-- None (Custom Value) --</option>
                  {schema.map(field => (
                    <option key={field.name} value={field.name}>
                      {field.name}
                    </option>
                  ))}
                  {variables.length > 0 && variables.map(variable => (
                    <option key={variable.id} value={`$${variable.name}`}>
                      ${variable.name} (variable)
                    </option>
                  ))}
                </select>
                <small className="form-text">Select a source field to base the new column on, or leave empty for a custom calculated column</small>
              </div>

              <div className="form-group">
                <label>Transformation</label>
                <select
                  className="form-control"
                  value={newColumn.transformation}
                  onChange={(e) => handleNewColumnTransformationChange(e.target.value)}
                >
                  {TRANSFORMATION_OPTIONS.reduce((acc, option) => {
                    const lastGroup = acc[acc.length - 1];
                    if (!lastGroup || lastGroup.group !== option.group) {
                      acc.push({ group: option.group, options: [option] });
                    } else {
                      lastGroup.options.push(option);
                    }
                    return acc;
                  }, []).map((group, idx) => (
                    <optgroup key={idx} label={group.group}>
                      {group.options.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {TRANSFORMATION_OPTIONS.find(t => t.value === newColumn.transformation)?.params.map(param => (
                <div key={param.name} className="form-group">
                  <label>{param.name} *</label>
                  <input
                    type={param.type}
                    className="form-control"
                    value={newColumn.params[param.name] || ''}
                    onChange={(e) => handleNewColumnParamChange(param.name, e.target.value)}
                    placeholder={param.placeholder}
                  />
                </div>
              ))}

              <div className="form-group">
                <label>Preview</label>
                <div className="expression-preview">
                  {newColumn.sourceField ? 
                    buildExpression({
                      source_field: newColumn.sourceField,
                      transformation: newColumn.transformation,
                      transformation_params: newColumn.params
                    }) :
                    buildExpressionForCustom({
                      is_custom: true,
                      transformation: newColumn.transformation,
                      transformation_params: newColumn.params
                    })
                  }
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-fixed-width" onClick={() => setAddingNewColumn(false)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-fixed-width" onClick={handleSaveNewColumn}>
                Add Column
              </button>
            </div>
          </div>
        </div>
      )}

      {addingVariable && (
        <div className="expression-editor-modal variable-builder-modal">
          <div className="modal-overlay"></div>
          <div className="modal-content">
            <div className="modal-header">
              <h4>Add Variable</h4>
              <button className="btn-close" onClick={() => setAddingVariable(false)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="variable-builder-panes">
                {/* Left Pane: Source Columns */}
                <div className="variable-pane">
                  <div className="variable-pane-header">Source Columns</div>
                  <div className="variable-pane-content">
                    {schema.map(field => (
                      <div key={field.name} className="insertable-item">
                        <div className="insertable-item-name">{field.name}</div>
                        <button 
                          className="btn-insert"
                          onClick={() => handleInsertColumn(field.name)}
                          title="Insert column"
                        >
                          <FiPlus size={12} />
                        </button>
                      </div>
                    ))}
                    
                    {variables.length > 0 && (
                      <>
                        <div className="function-group-header">Previous Variables</div>
                        {variables.map(variable => (
                          <div key={variable.id} className="insertable-item">
                            <div className="insertable-item-name">${variable.name}</div>
                            <button 
                              className="btn-insert"
                              onClick={() => handleInsertVariable(variable.name)}
                              title="Insert variable"
                            >
                              <FiPlus size={12} />
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {/* Middle Pane: Transformation Functions */}
                <div className="variable-pane">
                  <div className="variable-pane-header">Functions</div>
                  <div className="variable-pane-content">
                    {TRANSFORMATION_OPTIONS.reduce((acc, option) => {
                      const lastGroup = acc[acc.length - 1];
                      if (!lastGroup || lastGroup.group !== option.group) {
                        acc.push({ group: option.group, options: [option] });
                      } else {
                        lastGroup.options.push(option);
                      }
                      return acc;
                    }, []).map((group, idx) => (
                      <div key={idx} className={group.group === 'Conditional' ? 'function-group-conditional' : ''}>
                        <div className={`function-group-header ${group.group === 'Conditional' ? 'conditional-header' : ''}`}>
                          {group.group === 'Conditional' && '⚡ '}
                          {group.group}
                        </div>
                        {group.options.map(opt => (
                          <div key={opt.value} className={`function-item ${opt.group === 'Conditional' ? 'function-item-conditional' : ''}`}>
                            <div className="function-item-header">
                              <div className="function-item-name">{opt.label}</div>
                              <button 
                                className="btn-insert"
                                onClick={() => handleInsertFunction(opt)}
                                title="Insert function"
                              >
                                <FiPlus size={12} />
                              </button>
                            </div>
                            <div className="function-item-syntax">{getFunctionSyntax(opt)}</div>
                            {opt.description && (
                              <div className="function-item-description">{opt.description}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Pane: Expression Builder */}
                <div className="variable-pane">
                  <div className="variable-pane-header">Build Expression</div>
                  <div className="variable-pane-content">
                    <div className="expression-builder">
                      <div className="variable-name-input">
                        <label>Variable Name *</label>
                        <input
                          type="text"
                          value={newVariable.name}
                          onChange={(e) => setNewVariable({ ...newVariable, name: e.target.value })}
                          placeholder="e.g., full_name, total_amount"
                        />
                        <small className="form-text">Can be referenced as $variable_name</small>
                      </div>

                      <div className="variable-name-input">
                        <label>Data Type</label>
                        <select
                          className="form-control"
                          value={newVariable.data_type || ''}
                          onChange={(e) => setNewVariable({ ...newVariable, data_type: e.target.value })}
                        >
                          <option value="">Auto-detect</option>
                          <option value="string">String</option>
                          <option value="integer">Integer</option>
                          <option value="float">Float</option>
                          <option value="date">Date</option>
                          <option value="boolean">Boolean</option>
                        </select>
                        <small className="form-text">Output will be converted to this type</small>
                      </div>

                      <div className="expression-builder-header">
                        <label>Expression *</label>
                      </div>
                      <div className="expression-editor-container" ref={expressionTextareaRef}>
                        <Editor
                          value={newVariable.expression}
                          onValueChange={(code) => setNewVariable({ ...newVariable, expression: code })}
                          highlight={highlightExpression}
                          padding={8}
                          placeholder="Click + buttons to insert columns and functions, or type directly..."
                          style={{
                            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                            fontSize: 10,
                            minHeight: '200px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            backgroundColor: '#fff'
                          }}
                          textareaClassName="expression-code-input"
                        />
                      </div>

                      <div className="expression-help">
                        <div className="expression-help-title">💡 Tips:</div>
                        <div className="expression-help-text">
                          • Click + next to columns to insert them<br/>
                          • Click + next to functions to insert templates<br/>
                          • Build complex expressions like: concat(UPPER(first_name), ' ', last_name)<br/>
                          • Reference previous variables using $variable_name
                        </div>
                      </div>

                      {newVariable.expression && (
                        <div className="expression-preview-section">
                          <label>Preview</label>
                          <div className="expression-preview">
                            {newVariable.expression}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-fixed-width" onClick={() => setAddingVariable(false)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-fixed-width" onClick={handleSaveVariable}>
                Add Variable
              </button>
            </div>
          </div>
        </div>
      )}

      {editingVariable && (
        <div className="expression-editor-modal variable-builder-modal">
          <div className="modal-overlay"></div>
          <div className="modal-content">
            <div className="modal-header">
              <h4>Edit Variable: ${editingVariable.name}</h4>
              <button className="btn-close" onClick={() => setEditingVariable(null)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="variable-builder-panes">
                {/* Left Pane: Source Columns */}
                <div className="variable-pane">
                  <div className="variable-pane-header">Source Columns</div>
                  <div className="variable-pane-content">
                    {schema.map(field => (
                      <div key={field.name} className="insertable-item">
                        <div className="insertable-item-name">{field.name}</div>
                        <button 
                          className="btn-insert"
                          onClick={() => handleInsertColumn(field.name, true)}
                          title="Insert column"
                        >
                          <FiPlus size={12} />
                        </button>
                      </div>
                    ))}
                    
                    {variables.filter(v => v.id !== editingVariable.id).length > 0 && (
                      <>
                        <div className="function-group-header">Previous Variables</div>
                        {variables.filter(v => v.id !== editingVariable.id).map(variable => (
                          <div key={variable.id} className="insertable-item">
                            <div className="insertable-item-name">${variable.name}</div>
                            <button 
                              className="btn-insert"
                              onClick={() => handleInsertVariable(variable.name, true)}
                              title="Insert variable"
                            >
                              <FiPlus size={12} />
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {/* Middle Pane: Transformation Functions */}
                <div className="variable-pane">
                  <div className="variable-pane-header">Functions</div>
                  <div className="variable-pane-content">
                    {TRANSFORMATION_OPTIONS.reduce((acc, option) => {
                      const lastGroup = acc[acc.length - 1];
                      if (!lastGroup || lastGroup.group !== option.group) {
                        acc.push({ group: option.group, options: [option] });
                      } else {
                        lastGroup.options.push(option);
                      }
                      return acc;
                    }, []).map((group, idx) => (
                      <div key={idx} className={group.group === 'Conditional' ? 'function-group-conditional' : ''}>
                        <div className={`function-group-header ${group.group === 'Conditional' ? 'conditional-header' : ''}`}>
                          {group.group === 'Conditional' && '⚡ '}
                          {group.group}
                        </div>
                        {group.options.map(opt => (
                          <div key={opt.value} className={`function-item ${opt.group === 'Conditional' ? 'function-item-conditional' : ''}`}>
                            <div className="function-item-header">
                              <div className="function-item-name">{opt.label}</div>
                              <button 
                                className="btn-insert"
                                onClick={() => handleInsertFunction(opt, true)}
                                title="Insert function"
                              >
                                <FiPlus size={12} />
                              </button>
                            </div>
                            <div className="function-item-syntax">{getFunctionSyntax(opt)}</div>
                            {opt.description && (
                              <div className="function-item-description">{opt.description}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Pane: Expression Builder */}
                <div className="variable-pane">
                  <div className="variable-pane-header">Build Expression</div>
                  <div className="variable-pane-content">
                    <div className="expression-builder">
                      <div className="variable-name-input">
                        <label>Variable Name</label>
                        <input
                          type="text"
                          value={editingVariable.name}
                          disabled
                        />
                        <small className="form-text">Variable name cannot be changed</small>
                      </div>

                      <div className="variable-name-input">
                        <label>Data Type</label>
                        <select
                          className="form-control"
                          value={editingVariable.data_type || ''}
                          onChange={(e) => setEditingVariable({ ...editingVariable, data_type: e.target.value })}
                        >
                          <option value="">Auto-detect</option>
                          <option value="string">String</option>
                          <option value="integer">Integer</option>
                          <option value="float">Float</option>
                          <option value="date">Date</option>
                          <option value="boolean">Boolean</option>
                        </select>
                        <small className="form-text">Output will be converted to this type</small>
                      </div>

                      <div className="expression-builder-header">
                        <label>Expression *</label>
                      </div>
                      <div className="expression-editor-container" ref={editExpressionTextareaRef}>
                        <Editor
                          value={editingVariable.expression || ''}
                          onValueChange={(code) => setEditingVariable({ ...editingVariable, expression: code })}
                          highlight={highlightExpression}
                          padding={8}
                          placeholder="Click + buttons to insert columns and functions, or type directly..."
                          style={{
                            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                            fontSize: 10,
                            minHeight: '200px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            backgroundColor: '#fff'
                          }}
                          textareaClassName="expression-code-input"
                        />
                      </div>

                      <div className="expression-help">
                        <div className="expression-help-title">💡 Tips:</div>
                        <div className="expression-help-text">
                          • Click + next to columns to insert them<br/>
                          • Click + next to functions to insert templates<br/>
                          • Build complex expressions like: concat(UPPER(first_name), ' ', last_name)<br/>
                          • Reference previous variables using $variable_name
                        </div>
                      </div>

                      {editingVariable.expression && (
                        <div className="expression-preview-section">
                          <label>Preview</label>
                          <div className="expression-preview">
                            {editingVariable.expression}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingVariable(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveEditedVariable}>
                Save Variable
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mapping-summary">
        <p>{mappings.length} field(s) mapped</p>
        {variables.length > 0 && <p>{variables.length} variable(s) defined</p>}
      </div>
    </div>
  );
};

export default TableBasedMapper;
