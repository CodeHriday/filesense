import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FiCheck, FiArrowRight, FiTrash2, FiEdit2, FiX, FiPlus, FiChevronDown, FiChevronUp, FiChevronRight, FiLock, FiShield } from 'react-icons/fi';
import './TableBasedMapper.css';
import PropTypes from 'prop-types';

const formatTypeWithPrecision = (type, precision, scale) => {
  const baseType = type || 'STRING';
  if (precision && scale !== null && scale !== undefined) {
    return `${baseType}(${precision},${scale})`;
  } else if (precision) {
    return `${baseType}(${precision})`;
  }
  return baseType;
};

const formatTypeForDisplay = (type) => {
  if (!type) return 'String';
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
};

const extractVariableReferences = (expression) => {
  if (!expression || typeof expression !== 'string') return [];
  const matches = expression.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
  return matches.map(m => m.substring(1));
};

const findDeletedVariableReferences = (expression, variables) => {
  const refs = extractVariableReferences(expression);
  const variableNames = new Set(variables.map(v => v.name));
  return refs.filter(ref => !variableNames.has(ref));
};


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
  { value: 'current-date', label: 'Current Date', group: 'Date/Time', params: [], noColumnInput: true, autoDataType: 'date' },
  { value: 'current-timestamp', label: 'Current Timestamp', group: 'Date/Time', params: [], noColumnInput: true, autoDataType: 'timestamp' },
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

const TableBasedMapper = ({ schema, fieldMappings, variables: initialVariables = [], piiColumns: initialPiiColumns = [], dqRuleAssignments: initialDqRuleAssignments = {}, onMappingsChange }) => {
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
  const [addingVariable, setAddingVariable] = useState(false);
  const [inlineEditingVariableId, setInlineEditingVariableId] = useState(null); // Track which variable is being edited in the modal
  const [newVariable, setNewVariable] = useState({
    name: '',
    expression: '',
    data_type: ''
  });
  
  // Collapsible sections state for variable modal - all collapsed by default
  const [sourceColumnsExpanded, setSourceColumnsExpanded] = useState(false);
  const [previousVariablesExpanded, setPreviousVariablesExpanded] = useState(false);
  const [collapsedFunctionGroups, setCollapsedFunctionGroups] = useState({
    'Basic': true,
    'Null Handling': true,
    'String': true,
    'Numeric': true,
    'Date/Time': true,
    'Type Cast': true,
    'Conditional': true
  });
  const expressionTextareaRef = useRef(null);
  const editExpressionTextareaRef = useRef(null);
  
  // Cursor positioning state - tracks where cursor should be placed after React updates DOM
  const [pendingCursorPos, setPendingCursorPos] = useState(null);
  const [pendingEditCursorPos, setPendingEditCursorPos] = useState(null);
  
  // Validation error modal state
  const [validationError, setValidationError] = useState(null);
  
  // PII tagging state
  const [piiColumns, setPiiColumns] = useState(new Set(initialPiiColumns || []));
  
  // DQ Rule Assignment state
  // Data structure: { columnName: [{ ruleId, errorAction, applyTo }] }
  // Legacy format support: { columnName: [ruleId, ruleId, ...] } - converted on load
  const [dqRuleAssignments, setDqRuleAssignments] = useState(() => {
    // Normalize legacy format (array of IDs) to new format (array of objects)
    const initial = initialDqRuleAssignments || {};
    const normalized = {};
    Object.entries(initial).forEach(([col, rules]) => {
      if (Array.isArray(rules)) {
        normalized[col] = rules.map(r => {
          if (typeof r === 'object' && r.ruleId !== undefined) {
            return r; // Already in new format
          }
          // Legacy format: just a rule ID number
          return { ruleId: r, errorAction: 'log_continue', applyTo: 'etl_job' };
        });
      }
    });
    return normalized;
  });
  const [showDqRulePanel, setShowDqRulePanel] = useState(false);
  const [availableDqRules, setAvailableDqRules] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState(new Set());
  const [selectedRules, setSelectedRules] = useState(new Set());
  const [dqRulesLoading, setDqRulesLoading] = useState(false);
  const [selectedErrorAction, setSelectedErrorAction] = useState('log_continue');
  const lastReportedDqAssignmentsRef = useRef(null);

  // Sync variables from prop to local state (always sync, including empty arrays)
  useEffect(() => {
    setVariables(initialVariables || []);
  }, [initialVariables]);

  // Sync PII columns from prop
  useEffect(() => {
    setPiiColumns(new Set(initialPiiColumns || []));
  }, [initialPiiColumns]);
  
  // Sync DQ rule assignments from prop and normalize legacy format
  // Skip if the change originated from within this component (prevents circular updates)
  useEffect(() => {
    const initial = initialDqRuleAssignments || {};
    
    // Check if this is a round-trip from our own update by comparing with last reported value
    if (lastReportedDqAssignmentsRef.current === initial) {
      return; // Skip - this is our own update coming back
    }
    
    const normalized = {};
    Object.entries(initial).forEach(([col, rules]) => {
      if (Array.isArray(rules)) {
        normalized[col] = rules.map(r => {
          if (typeof r === 'object' && r.ruleId !== undefined) {
            return r; // Already in new format
          }
          // Legacy format: just a rule ID number
          return { ruleId: r, errorAction: 'log_continue', applyTo: 'etl_job' };
        });
      }
    });
    setDqRuleAssignments(normalized);
  }, [initialDqRuleAssignments]);
  
  // Fetch DQ rules on mount if there are existing assignments (so rule names are available)
  useEffect(() => {
    const hasAssignments = Object.keys(initialDqRuleAssignments || {}).length > 0;
    if (hasAssignments && availableDqRules.length === 0) {
      const loadRules = async () => {
        try {
          const response = await axios.get('/api/quality-rules?limit=100');
          setAvailableDqRules(response.data?.rules || []);
        } catch (error) {
          console.error('Error fetching DQ rules on mount:', error);
        }
      };
      loadRules();
    }
  }, []);
  
  // Auto-populate PII columns from schema on initial load
  useEffect(() => {
    if (schema && schema.length > 0 && initialPiiColumns.length === 0) {
      const piiFieldsFromSchema = schema
        .filter(col => col.contains_pii || col.is_pii || col.pii)
        .map(col => col.name);
      
      if (piiFieldsFromSchema.length > 0) {
        const newPiiSet = new Set(piiFieldsFromSchema);
        setPiiColumns(newPiiSet);
        onMappingsChange(mappings, variables, Array.from(newPiiSet), dqRuleAssignments);
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
      const textarea = expressionTextareaRef.current;
      textarea.focus();
      textarea.setSelectionRange(pendingCursorPos, pendingCursorPos);
      // Clear pending position after applying
      setPendingCursorPos(null);
    }
  }, [newVariable.expression, pendingCursorPos]);
  
  // Position cursor after React updates expression in DOM (for inline editing mode)
  useEffect(() => {
    if (pendingEditCursorPos !== null && expressionTextareaRef.current && inlineEditingVariableId) {
      const textarea = expressionTextareaRef.current;
      textarea.focus();
      textarea.setSelectionRange(pendingEditCursorPos, pendingEditCursorPos);
      // Clear pending position after applying
      setPendingEditCursorPos(null);
    }
  }, [newVariable.expression, pendingEditCursorPos, inlineEditingVariableId]);
  
  // Toggle PII status for a field
  const togglePII = (targetField) => {
    const newPiiColumns = new Set(piiColumns);
    if (newPiiColumns.has(targetField)) {
      newPiiColumns.delete(targetField);
    } else {
      newPiiColumns.add(targetField);
    }
    setPiiColumns(newPiiColumns);
    onMappingsChange(mappings, variables, Array.from(newPiiColumns), dqRuleAssignments);
  };
  
  // Fetch available DQ rules from API
  const fetchDqRules = async () => {
    setDqRulesLoading(true);
    try {
      const response = await axios.get('/api/quality-rules?limit=100');
      setAvailableDqRules(response.data?.rules || []);
    } catch (error) {
      console.error('Error fetching DQ rules:', error);
      setAvailableDqRules([]);
    } finally {
      setDqRulesLoading(false);
    }
  };
  
  // Open DQ Rule Assignment Panel
  const handleOpenDqRulePanel = () => {
    setShowDqRulePanel(true);
    setSelectedColumns(new Set());
    setSelectedRules(new Set());
    fetchDqRules();
  };
  
  // Toggle column selection in DQ panel
  const toggleColumnSelection = (columnName) => {
    const newSelection = new Set(selectedColumns);
    if (newSelection.has(columnName)) {
      newSelection.delete(columnName);
    } else {
      newSelection.add(columnName);
    }
    setSelectedColumns(newSelection);
  };
  
  // Toggle rule selection in DQ panel
  const toggleRuleSelection = (ruleId) => {
    const newSelection = new Set(selectedRules);
    if (newSelection.has(ruleId)) {
      newSelection.delete(ruleId);
    } else {
      newSelection.add(ruleId);
    }
    setSelectedRules(newSelection);
  };
  
  // Add DQ rule assignments (bulk assign selected rules to selected columns)
  const handleAddDqAssignments = () => {
    if (selectedColumns.size === 0 || selectedRules.size === 0) {
      return;
    }
    
    const newAssignments = { ...dqRuleAssignments };
    
    selectedColumns.forEach(columnName => {
      if (!newAssignments[columnName]) {
        newAssignments[columnName] = [];
      }
      selectedRules.forEach(ruleId => {
        // Check if rule already assigned to this column
        const existingRule = newAssignments[columnName].find(r => r.ruleId === ruleId);
        if (!existingRule) {
          newAssignments[columnName].push({
            ruleId,
            errorAction: selectedErrorAction,
            applyTo: 'etl_job'
          });
        }
      });
    });
    
    setDqRuleAssignments(newAssignments);
    setSelectedColumns(new Set());
    setSelectedRules(new Set());
    lastReportedDqAssignmentsRef.current = newAssignments;
    onMappingsChange(mappings, variables, Array.from(piiColumns), newAssignments);
  };
  
  // Remove a specific rule from a column
  const handleRemoveDqAssignment = (columnName, ruleId) => {
    const newAssignments = { ...dqRuleAssignments };
    if (newAssignments[columnName]) {
      newAssignments[columnName] = newAssignments[columnName].filter(r => r.ruleId !== ruleId);
      if (newAssignments[columnName].length === 0) {
        delete newAssignments[columnName];
      }
    }
    setDqRuleAssignments(newAssignments);
    lastReportedDqAssignmentsRef.current = newAssignments;
    onMappingsChange(mappings, variables, Array.from(piiColumns), newAssignments);
  };
  
  // Update error action for a specific rule assignment
  const handleUpdateDqErrorAction = (columnName, ruleId, newErrorAction) => {
    const newAssignments = { ...dqRuleAssignments };
    if (newAssignments[columnName]) {
      newAssignments[columnName] = newAssignments[columnName].map(r => 
        r.ruleId === ruleId ? { ...r, errorAction: newErrorAction } : r
      );
    }
    setDqRuleAssignments(newAssignments);
    lastReportedDqAssignmentsRef.current = newAssignments;
    onMappingsChange(mappings, variables, Array.from(piiColumns), newAssignments);
  };
  
  // Get rule name by ID
  const getRuleName = (ruleId) => {
    const rule = availableDqRules.find(r => r.id === ruleId);
    return rule ? rule.rule_name : `Rule #${ruleId}`;
  };
  
  // Get count of DQ rules for a column
  const getDqRuleCount = (columnName) => {
    return dqRuleAssignments[columnName]?.length || 0;
  };
  
  // Get error action label for display
  const getErrorActionLabel = (errorAction) => {
    switch (errorAction) {
      case 'log_abort': return 'Abort';
      case 'log_continue': return 'Continue';
      default: return 'Continue';
    }
  };
  
  // Get error action style class
  const getErrorActionClass = (errorAction) => {
    return errorAction === 'log_abort' ? 'error-action-abort' : 'error-action-continue';
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
      onMappingsChange(newMappings, variables, Array.from(piiColumns), dqRuleAssignments);
    } else {
      newSelected.add(fieldName);
      const sourceField = schema.find(s => s.name === fieldName);
      const newMapping = {
        source_field: fieldName,
        target_field: fieldName,
        transformation: 'none',
        transformation_params: {},
        data_type: sourceField?.type || sourceField?.data_type || sourceField?.column_type || 'STRING',
        precision: sourceField?.precision ?? null,
        scale: sourceField?.scale ?? null,
        nullable: sourceField?.nullable ?? true
      };
      const newMappings = [...mappings, newMapping];
      setMappings(newMappings);
      onMappingsChange(newMappings, variables, Array.from(piiColumns), dqRuleAssignments);
    }
    
    setSelectedSource(newSelected);
  };

  const handleAutomap = () => {
    const newMappings = schema.map(field => ({
      source_field: field.name,
      target_field: field.name,
      transformation: 'none',
      transformation_params: {},
      data_type: field.type || field.data_type || field.column_type || 'STRING',
      precision: field.precision ?? null,
      scale: field.scale ?? null,
      nullable: field.nullable ?? true
    }));
    
    setMappings(newMappings);
    setSelectedSource(new Set(schema.map(f => f.name)));
    onMappingsChange(newMappings, variables, Array.from(piiColumns), dqRuleAssignments);
  };

  const handleClearMapping = () => {
    setMappings([]);
    setSelectedSource(new Set());
    const emptyAssignments = {};
    setDqRuleAssignments(emptyAssignments);
    lastReportedDqAssignmentsRef.current = emptyAssignments;
    onMappingsChange([], variables, Array.from(piiColumns), emptyAssignments);
  };

  const handleRemoveMapping = (sourceField) => {
    const mapping = mappings.find(m => m.source_field === sourceField);
    const targetField = mapping?.target_field;
    const newMappings = mappings.filter(m => m.source_field !== sourceField);
    const newSelected = new Set(selectedSource);
    newSelected.delete(sourceField);
    
    const newDqAssignments = { ...dqRuleAssignments };
    if (targetField && newDqAssignments[targetField]) {
      delete newDqAssignments[targetField];
    }
    
    setMappings(newMappings);
    setSelectedSource(newSelected);
    setDqRuleAssignments(newDqAssignments);
    lastReportedDqAssignmentsRef.current = newDqAssignments;
    onMappingsChange(newMappings, variables, Array.from(piiColumns), newDqAssignments);
  };

  const handleTargetNameChange = (sourceField, newTargetName) => {
    const oldMapping = mappings.find(m => m.source_field === sourceField);
    const oldTargetName = oldMapping?.target_field;
    
    if (oldTargetName === newTargetName) {
      return;
    }
    
    const newMappings = mappings.map(m => 
      m.source_field === sourceField ? { ...m, target_field: newTargetName } : m
    );
    
    const newDqAssignments = { ...dqRuleAssignments };
    if (oldTargetName && newDqAssignments[oldTargetName] && newTargetName) {
      newDqAssignments[newTargetName] = newDqAssignments[oldTargetName];
      delete newDqAssignments[oldTargetName];
    }
    
    setMappings(newMappings);
    setDqRuleAssignments(newDqAssignments);
    lastReportedDqAssignmentsRef.current = newDqAssignments;
    onMappingsChange(newMappings, variables, Array.from(piiColumns), newDqAssignments);
  };

  const SQL_TYPE_OPTIONS = [
    'STRING', 'VARCHAR', 'INTEGER', 'BIGINT', 'DECIMAL', 'DOUBLE', 'FLOAT',
    'DATE', 'TIMESTAMP', 'BOOLEAN', 'BINARY', 'ARRAY', 'MAP', 'STRUCT'
  ];

  const TYPES_WITH_PRECISION = ['DECIMAL', 'VARCHAR', 'CHAR', 'NUMERIC'];
  const TYPES_WITH_SCALE = ['DECIMAL', 'NUMERIC'];

  const handleTypeChange = (sourceField, newType) => {
    const newMappings = mappings.map(m => {
      if (m.source_field === sourceField) {
        const updatedMapping = { ...m, data_type: newType };
        if (!TYPES_WITH_PRECISION.includes(newType)) {
          updatedMapping.precision = null;
        }
        if (!TYPES_WITH_SCALE.includes(newType)) {
          updatedMapping.scale = null;
        }
        return updatedMapping;
      }
      return m;
    });
    setMappings(newMappings);
    onMappingsChange(newMappings, variables, Array.from(piiColumns), dqRuleAssignments);
  };

  const handlePrecisionChange = (sourceField, newPrecision) => {
    const newMappings = mappings.map(m => 
      m.source_field === sourceField ? { ...m, precision: newPrecision === '' ? null : parseInt(newPrecision, 10) || null } : m
    );
    setMappings(newMappings);
    onMappingsChange(newMappings, variables, Array.from(piiColumns), dqRuleAssignments);
  };

  const handleScaleChange = (sourceField, newScale) => {
    const newMappings = mappings.map(m => 
      m.source_field === sourceField ? { ...m, scale: newScale === '' ? null : parseInt(newScale, 10) || null } : m
    );
    setMappings(newMappings);
    onMappingsChange(newMappings, variables, Array.from(piiColumns), dqRuleAssignments);
  };

  const handleNullableChange = (sourceField, newNullable) => {
    const newMappings = mappings.map(m => 
      m.source_field === sourceField ? { ...m, nullable: newNullable } : m
    );
    setMappings(newMappings);
    onMappingsChange(newMappings, variables, Array.from(piiColumns), dqRuleAssignments);
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
    onMappingsChange(newMappings, variables, Array.from(piiColumns), dqRuleAssignments);
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
      setValidationError('Please enter a target field name');
      return;
    }

    // Check if target field name already exists
    if (mappings.some(m => m.target_field === newColumn.targetField)) {
      setValidationError('A field with this target name already exists');
      return;
    }

    const sourceField = newColumn.sourceField ? schema.find(s => s.name === newColumn.sourceField) : null;
    const newMapping = {
      source_field: newColumn.sourceField || `__custom_${Date.now()}__`,
      target_field: newColumn.targetField,
      transformation: newColumn.transformation,
      transformation_params: newColumn.params,
      is_custom: !newColumn.sourceField,
      data_type: sourceField?.type || sourceField?.data_type || sourceField?.column_type || 'STRING',
      precision: sourceField?.precision ?? null,
      scale: sourceField?.scale ?? null,
      nullable: sourceField?.nullable ?? true
    };

    const newMappings = [...mappings, newMapping];
    setMappings(newMappings);
    onMappingsChange(newMappings, variables, Array.from(piiColumns), dqRuleAssignments);
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
    
    // Get the textarea element directly from ref
    const textarea = isEditMode ? editExpressionTextareaRef.current : expressionTextareaRef.current;
    
    if (!textarea) {
      // Fallback: append to end if no textarea ref available
      const currentValue = newVariable.expression || '';
      setNewVariable({ ...newVariable, expression: currentValue + sanitizedText });
      return;
    }

    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const currentValue = newVariable.expression || '';
    const newValue = currentValue.substring(0, start) + sanitizedText + currentValue.substring(end);
    
    // Calculate where cursor should be after insertion
    const newPos = start + sanitizedText.length;
    
    setNewVariable({ ...newVariable, expression: newValue });
    // Set pending cursor position - useEffect will apply it after React updates DOM
    setPendingCursorPos(newPos);
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
    
    // Functions that don't take column input (e.g., current-date, current-timestamp)
    if (transformOption.noColumnInput) {
      return `${transformOption.value}()`;
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
    
    // Auto-set data type for functions that have it defined
    // Use functional state updates to preserve the expression that was just inserted
    if (transformOption.autoDataType) {
      if (isEditMode) {
        setEditingVariable(prev => prev ? { ...prev, data_type: transformOption.autoDataType } : prev);
      } else {
        setNewVariable(prev => ({ ...prev, data_type: transformOption.autoDataType }));
      }
    }
  };

  const handleSaveVariable = () => {
    if (!newVariable.name.trim()) {
      setValidationError('Please enter a variable name');
      return;
    }

    if (!newVariable.expression.trim()) {
      setValidationError('Please enter an expression for the variable');
      return;
    }

    // Validate variable name format
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newVariable.name)) {
      setValidationError('Variable name must start with a letter or underscore and contain only letters, numbers, and underscores');
      return;
    }

    // Check if variable name already exists
    if (variables.some(v => v.name === newVariable.name)) {
      setValidationError('A variable with this name already exists');
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
    // Keep modal open - user must click X to close
    setNewVariable({ name: '', expression: '', data_type: '' });
    onMappingsChange(mappings, newVariables, Array.from(piiColumns), dqRuleAssignments);
  };

  const handleEditVariable = (variable) => {
    // Load variable data into the form for inline editing
    setInlineEditingVariableId(variable.id);
    setNewVariable({
      name: variable.name,
      expression: variable.expression || buildVariableExpression(variable),
      data_type: variable.data_type || ''
    });
  };

  const handleUpdateVariable = () => {
    // Update the variable but keep modal open
    if (!inlineEditingVariableId) return;

    if (!newVariable.expression.trim()) {
      setValidationError('Please enter an expression for the variable');
      return;
    }

    const updatedVariables = variables.map(v =>
      v.id === inlineEditingVariableId
        ? {
            ...v,
            expression: newVariable.expression,
            data_type: newVariable.data_type,
            source_field: null,
            transformation: 'none',
            transformation_params: {}
          }
        : v
    );

    setVariables(updatedVariables);
    onMappingsChange(mappings, updatedVariables, Array.from(piiColumns), dqRuleAssignments);
    // Clear the form and editing state but keep modal open
    setInlineEditingVariableId(null);
    setNewVariable({ name: '', expression: '', data_type: '' });
  };

  const handleSaveAndClose = () => {
    // If editing, save the edit and close. If adding new, save new and close.
    if (inlineEditingVariableId) {
      if (!newVariable.expression.trim()) {
        setValidationError('Please enter an expression for the variable');
        return;
      }

      const updatedVariables = variables.map(v =>
        v.id === inlineEditingVariableId
          ? {
              ...v,
              expression: newVariable.expression,
              data_type: newVariable.data_type,
              source_field: null,
              transformation: 'none',
              transformation_params: {}
            }
          : v
      );

      setVariables(updatedVariables);
      onMappingsChange(mappings, updatedVariables, Array.from(piiColumns), dqRuleAssignments);
    } else if (newVariable.name.trim() && newVariable.expression.trim()) {
      // Adding a new variable - validate and save
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newVariable.name)) {
        setValidationError('Variable name must start with a letter or underscore and contain only letters, numbers, and underscores');
        return;
      }
      if (variables.some(v => v.name === newVariable.name)) {
        setValidationError('A variable with this name already exists');
        return;
      }

      const variable = {
        id: `var_${Date.now()}`,
        name: newVariable.name,
        expression: newVariable.expression,
        data_type: newVariable.data_type,
        source_field: null,
        transformation: 'none',
        transformation_params: {}
      };

      const newVariables = [...variables, variable];
      setVariables(newVariables);
      onMappingsChange(mappings, newVariables, Array.from(piiColumns), dqRuleAssignments);
    }

    // Close the modal
    setAddingVariable(false);
    setInlineEditingVariableId(null);
    setNewVariable({ name: '', expression: '', data_type: '' });
  };

  const handleDeleteVariable = (variableId) => {
    const newVariables = variables.filter(v => v.id !== variableId);
    setVariables(newVariables);
    onMappingsChange(mappings, newVariables, Array.from(piiColumns), dqRuleAssignments);
  };

  const handleMoveVariableUp = (index) => {
    if (index === 0) return;
    const newVariables = [...variables];
    [newVariables[index - 1], newVariables[index]] = [newVariables[index], newVariables[index - 1]];
    setVariables(newVariables);
    onMappingsChange(mappings, newVariables, Array.from(piiColumns), dqRuleAssignments);
  };

  const handleMoveVariableDown = (index) => {
    if (index === variables.length - 1) return;
    const newVariables = [...variables];
    [newVariables[index], newVariables[index + 1]] = [newVariables[index + 1], newVariables[index]];
    setVariables(newVariables);
    onMappingsChange(mappings, newVariables, Array.from(piiColumns), dqRuleAssignments);
  };

  const handleVariableTransformationChange = (value) => {
    const transform = TRANSFORMATION_OPTIONS.find(t => t.value === value);
    setNewVariable({
      ...newVariable,
      transformation: value,
      params: transform && transform.params.length > 0 ? {} : {}
    });
  };

  const handleVariableParamChange = (paramName, paramValue) => {
    setNewVariable({
      ...newVariable,
      params: {
        ...newVariable.params,
        [paramName]: paramValue
      }
    });
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
            <FiPlus /> Add/Edit Expressions
          </button>
        </div>

        {variablesExpanded && (
          <div className="variables-content">
            {variables.length === 0 ? (
              <div className="no-variables">
                No variables defined. Click "Add/Edit Expressions" to create pre-calculations that can be used in field mappings.
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
            <div className="target-panel-actions">
              <button className="btn btn-primary btn-xs" onClick={handleClearMapping} style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.125rem 0.25rem' }}>
                Clear Mapping
              </button>
              <button className="btn btn-primary btn-xs" onClick={handleAutomap} style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.125rem 0.25rem' }}>
                Automap
              </button>
              <button className="btn btn-primary btn-xs" onClick={handleOpenDqRulePanel} title="Assign Data Quality rules to target columns" style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.125rem 0.25rem', gap: '0.125rem' }}>
                <FiShield /> Assign DQ Rule
              </button>
              <button className="btn btn-primary btn-xs" onClick={handleAddNewColumn} title="Add a new calculated column" style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.125rem 0.25rem', gap: '0.125rem' }}>
                <FiPlus /> Add New Column
              </button>
            </div>
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
                  <th style={{ width: '180px' }}>Name</th>
                  <th style={{ width: '100px' }}>Type</th>
                  <th style={{ width: '60px' }}>Precision</th>
                  <th style={{ width: '50px' }}>Scale</th>
                  <th style={{ width: '50px', textAlign: 'center' }} title="Allow NULL values">Nullable</th>
                  <th style={{ width: '50px', textAlign: 'center' }} title="Mark as PII (Personally Identifiable Information)">
                    <FiLock /> PII
                  </th>
                  <th style={{ width: '180px', textAlign: 'left' }} title="Data Quality Rules assigned to this field">
                    <FiShield /> DQ Rules
                  </th>
                  <th style={{ width: '70px' }}>Actions</th>
                  <th>Expression</th>
                </tr>
              </thead>
              <tbody>
                {filteredMappings.map(mapping => {
                  const sourceCol = schema.find(s => s.name === mapping.source_field);
                  const colType = mapping.data_type || mapping.type || sourceCol?.type || sourceCol?.data_type || sourceCol?.column_type || 'STRING';
                  const colPrecision = mapping.precision ?? sourceCol?.precision ?? null;
                  const colScale = mapping.scale ?? sourceCol?.scale ?? null;
                  const colNullable = mapping.nullable ?? sourceCol?.nullable ?? true;
                  const showPrecision = TYPES_WITH_PRECISION.includes(colType.toUpperCase());
                  const showScale = TYPES_WITH_SCALE.includes(colType.toUpperCase());
                  const mappingExpression = mapping.expression || mapping.customExpression || buildExpressionForCustom(mapping);
                  // Also check source_field for variable references (e.g., when using a variable as the source)
                  const sourceFieldVarRefs = extractVariableReferences(mapping.source_field || '');
                  const expressionVarRefs = findDeletedVariableReferences(mappingExpression, variables);
                  const deletedVarRefs = [...new Set([...expressionVarRefs, ...sourceFieldVarRefs.filter(ref => !variables.some(v => v.name === ref))])];
                  const hasDeletedVarRef = deletedVarRefs.length > 0;
                  return (
                  <tr key={mapping.source_field} className={hasDeletedVarRef ? 'row-has-error' : ''}>
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
                    <td>
                      <select
                        value={colType}
                        onChange={(e) => handleTypeChange(mapping.source_field, e.target.value)}
                        style={{ fontSize: '9px', padding: '2px 4px', width: '100%', border: '1px solid #d1d5db', borderRadius: '3px' }}
                        title="Data type"
                      >
                        {SQL_TYPE_OPTIONS.map(t => (
                          <option key={t} value={t}>{formatTypeForDisplay(t)}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {showPrecision ? (
                        <input
                          type="number"
                          value={colPrecision ?? ''}
                          onChange={(e) => handlePrecisionChange(mapping.source_field, e.target.value)}
                          style={{ fontSize: '9px', padding: '2px 4px', width: '100%', border: '1px solid #d1d5db', borderRadius: '3px' }}
                          placeholder="—"
                          min="0"
                          title="Precision (total digits)"
                        />
                      ) : (
                        <span style={{ fontSize: '9px', color: '#9ca3af' }}>—</span>
                      )}
                    </td>
                    <td>
                      {showScale ? (
                        <input
                          type="number"
                          value={colScale ?? ''}
                          onChange={(e) => handleScaleChange(mapping.source_field, e.target.value)}
                          style={{ fontSize: '9px', padding: '2px 4px', width: '100%', border: '1px solid #d1d5db', borderRadius: '3px' }}
                          placeholder="—"
                          min="0"
                          title="Scale (decimal places)"
                        />
                      ) : (
                        <span style={{ fontSize: '9px', color: '#9ca3af' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={colNullable}
                        onChange={(e) => handleNullableChange(mapping.source_field, e.target.checked)}
                        title="Allow NULL values"
                        style={{ cursor: 'pointer' }}
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
                    <td className="dq-rules-cell" onClick={handleOpenDqRulePanel} style={{ cursor: 'pointer' }} title="Click to manage DQ rules">
                      {getDqRuleCount(mapping.target_field) > 0 ? (
                        <div className="dq-rules-inline-tags">
                          {(dqRuleAssignments[mapping.target_field] || []).map(ruleAssignment => (
                            <span key={ruleAssignment.ruleId} className={`dq-rule-inline-tag ${getErrorActionClass(ruleAssignment.errorAction)}`}>
                              {getRuleName(ruleAssignment.ruleId)}
                              <span className="dq-rule-action-badge" title={`On failure: ${getErrorActionLabel(ruleAssignment.errorAction)}`}>
                                {ruleAssignment.errorAction === 'log_abort' ? '!' : ''}
                              </span>
                              <button
                                className="dq-rule-inline-remove"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveDqAssignment(mapping.target_field, ruleAssignment.ruleId);
                                }}
                                title="Remove rule"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="dq-rule-empty">-</span>
                      )}
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
                      <span className={`expression-text ${hasDeletedVarRef ? 'expression-error' : ''}`} onClick={() => handleEditExpression(mapping.source_field)}>
                        {buildExpressionForCustom(mapping)}
                      </span>
                      {hasDeletedVarRef && (
                        <div className="expression-validation-error">
                          A referenced variable has been deleted. Please update the expression.
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {filteredMappings.length === 0 && (
                  <tr>
                    <td colSpan="10" className="no-mappings">
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
                <label htmlFor="editing-source-field">Source Field</label>
                <input
                  id="editing-source-field"
                  type="text"
                  value={editingExpression.sourceField}
                  disabled
                  className="form-control"
                />
              </div>

              <div className="form-group">
                <label htmlFor="editing-transformation">Transformation</label>
                <select
                  id="editing-transformation"
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
                  <label htmlFor={`editing-param-${param.name}`}>{param.name}</label>
                  {param.type === 'select' ? (
                    <select
                      id={`editing-param-${param.name}`}
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
                      id={`editing-param-${param.name}`}
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
                <div className="form-label">Preview</div>
                <div id="editing-preview" className="expression-preview">
                  {buildExpression({
                    source_field: editingExpression.sourceField,
                    transformation: editingExpression.transformation,
                    transformation_params: editingExpression.params
                  })}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-fixed-width" onClick={() => setEditingExpression(null)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-fixed-width" onClick={handleSaveExpression}>
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
                <label htmlFor="newcol-target-field">Target Field Name *</label>
                <input
                  id="newcol-target-field"
                  type="text"
                  className="form-control"
                  value={newColumn.targetField}
                  onChange={(e) => handleNewColumnChange('targetField', e.target.value)}
                  placeholder="Enter new column name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="newcol-source-field">Source Field (Optional)</label>
                <select
                  id="newcol-source-field"
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
                <label htmlFor="newcol-transformation">Transformation</label>
                <select
                  id="newcol-transformation"
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
                  <label htmlFor={`newcol-param-${param.name}`}>{param.name} *</label>
                  <input
                    id={`newcol-param-${param.name}`}
                    type={param.type}
                    className="form-control"
                    value={newColumn.params[param.name] || ''}
                    onChange={(e) => handleNewColumnParamChange(param.name, e.target.value)}
                    placeholder={param.placeholder}
                  />
                </div>
              ))}

              <div className="form-group">
                <div className="form-label">Preview</div>
                <div id="newcol-preview" className="expression-preview">
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
              <h4>Add/Edit Expressions {inlineEditingVariableId && <span style={{ fontWeight: 'normal', fontSize: '10px', color: '#6b7280' }}>(Editing: ${newVariable.name})</span>}</h4>
              <button className="btn-close" onClick={() => { setAddingVariable(false); setInlineEditingVariableId(null); setNewVariable({ name: '', expression: '', data_type: '' }); }}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="variable-builder-panes">
                {/* Left Pane: Variables & Source Columns */}
                <div className="variable-pane">
                  <div className="variable-pane-header" style={{ textTransform: 'none' }}>Variables & Source Columns</div>
                  <div className="variable-pane-content">
                    {/* Previous Variables - Collapsible (shown first) */}
                    {variables.length > 0 && (
                      <>
                        <div 
                          className="function-group-header collapsible-header"
                          onClick={() => setPreviousVariablesExpanded(!previousVariablesExpanded)}
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textTransform: 'none' }}
                        >
                          <span>Variables</span>
                          {previousVariablesExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                        </div>
                        {previousVariablesExpanded && variables.map(variable => (
                          <div key={variable.id} className={`insertable-item ${inlineEditingVariableId === variable.id ? 'insertable-item-editing' : ''}`}>
                            <div className="insertable-item-name">${variable.name}</div>
                            <div className="insertable-item-actions">
                              <button 
                                className="btn-insert"
                                onClick={() => handleEditVariable(variable)}
                                title="Edit variable"
                                disabled={inlineEditingVariableId === variable.id}
                              >
                                <FiEdit2 size={12} />
                              </button>
                              <button 
                                className="btn-insert btn-delete"
                                onClick={() => {
                                  handleDeleteVariable(variable.id);
                                  if (inlineEditingVariableId === variable.id) {
                                    setInlineEditingVariableId(null);
                                    setNewVariable({ name: '', expression: '', data_type: '' });
                                  }
                                }}
                                title="Delete variable"
                              >
                                <FiTrash2 size={12} />
                              </button>
                              <button 
                                className="btn-insert"
                                onClick={() => handleInsertVariable(variable.name)}
                                title="Insert variable"
                              >
                                <FiPlus size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                    
                    {/* Source Columns - Collapsible */}
                    <div 
                      className="function-group-header collapsible-header"
                      onClick={() => setSourceColumnsExpanded(!sourceColumnsExpanded)}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textTransform: 'none', marginTop: variables.length > 0 ? '8px' : '0' }}
                    >
                      <span>Source Columns</span>
                      {sourceColumnsExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                    </div>
                    {sourceColumnsExpanded && schema.map(field => (
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
                    }, []).map((group, idx) => {
                      const isCollapsed = collapsedFunctionGroups[group.group];
                      // Convert group name to Title Case
                      const titleCaseGroup = group.group.split('/').map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                      ).join('/');
                      return (
                        <div key={idx} className={group.group === 'Conditional' ? 'function-group-conditional' : ''}>
                          <div 
                            className={`function-group-header collapsible-header ${group.group === 'Conditional' ? 'conditional-header' : ''}`}
                            onClick={() => setCollapsedFunctionGroups(prev => ({ ...prev, [group.group]: !prev[group.group] }))}
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textTransform: 'none' }}
                          >
                            <span>
                              {group.group === 'Conditional' && '⚡ '}
                              {titleCaseGroup}
                            </span>
                            {isCollapsed ? <FiChevronRight size={14} /> : <FiChevronDown size={14} />}
                          </div>
                          {!isCollapsed && group.options.map(opt => (
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
                      );
                    })}
                  </div>
                </div>

                {/* Right Pane: Expression Builder */}
                <div className="variable-pane">
                  <div className="variable-pane-header" style={{ textTransform: 'none' }}>Build Expression</div>
                  <div className="variable-pane-content">
                    <div className="expression-builder">
                      <div className="variable-name-input">
                        <label htmlFor="newvar-name">Variable Name {!inlineEditingVariableId && '*'}</label>
                        <input
                          id="newvar-name"
                          type="text"
                          value={newVariable.name}
                          onChange={(e) => setNewVariable({ ...newVariable, name: e.target.value })}
                          placeholder="e.g., full_name, total_amount"
                          disabled={!!inlineEditingVariableId}
                          style={inlineEditingVariableId ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                        />
                        <small className="form-text">{inlineEditingVariableId ? 'Variable name cannot be changed' : 'Can be referenced as $variable_name'}</small>
                      </div>

                      <div className="variable-name-input">
                        <label htmlFor="newvar-data-type">Data Type</label>
                        <select
                          id="newvar-data-type"
                          className="form-control"
                          value={newVariable.data_type || ''}
                          onChange={(e) => setNewVariable({ ...newVariable, data_type: e.target.value })}
                        >
                          <option value="">Auto-detect</option>
                          <option value="string">String</option>
                          <option value="integer">Integer</option>
                          <option value="float">Float</option>
                          <option value="date">Date</option>
                          <option value="timestamp">Timestamp</option>
                          <option value="boolean">Boolean</option>
                        </select>
                        <small className="form-text">Output will be converted to this type</small>
                      </div>

                      <div className="expression-builder-header">
                        <label htmlFor="newvar-expression">Expression *</label>
                      </div>
                      <div className="expression-editor-container">
                        <textarea
                          id="newvar-expression"
                          ref={expressionTextareaRef}
                          className="expression-code-input"
                          value={newVariable.expression}
                          onChange={(e) => setNewVariable({ ...newVariable, expression: e.target.value })}
                          placeholder="Click + buttons to insert columns and functions, or type directly..."
                          spellCheck="false"
                          style={{
                            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                            fontSize: '10px',
                            minHeight: '200px',
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            backgroundColor: '#fff',
                            resize: 'vertical'
                          }}
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
                          <div className="form-label">Preview</div>
                          <div id="newvar-preview" className="expression-preview">
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
              <button className="btn btn-secondary btn-fixed-width" onClick={() => { setAddingVariable(false); setInlineEditingVariableId(null); setNewVariable({ name: '', expression: '', data_type: '' }); }}>
                Cancel
              </button>
              {inlineEditingVariableId && (
                <button className="btn btn-secondary btn-fixed-width" onClick={handleUpdateVariable}>
                  Update
                </button>
              )}
              <button className="btn btn-primary btn-fixed-width" onClick={handleSaveAndClose}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {false && (
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
                {/* Left Pane: Variables & Source Columns */}
                <div className="variable-pane">
                  <div className="variable-pane-header" style={{ textTransform: 'none' }}>Variables & Source Columns</div>
                  <div className="variable-pane-content">
                    {/* Previous Variables - Collapsible (shown first) */}
                    {variables.filter(v => v.id !== editingVariable.id).length > 0 && (
                      <>
                        <div 
                          className="function-group-header collapsible-header"
                          onClick={() => setPreviousVariablesExpanded(!previousVariablesExpanded)}
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textTransform: 'none' }}
                        >
                          <span>Variables</span>
                          {previousVariablesExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                        </div>
                        {previousVariablesExpanded && variables.filter(v => v.id !== editingVariable.id).map(variable => (
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
                    
                    {/* Source Columns - Collapsible */}
                    <div 
                      className="function-group-header collapsible-header"
                      onClick={() => setSourceColumnsExpanded(!sourceColumnsExpanded)}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textTransform: 'none', marginTop: variables.filter(v => v.id !== editingVariable.id).length > 0 ? '8px' : '0' }}
                    >
                      <span>Source Columns</span>
                      {sourceColumnsExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                    </div>
                    {sourceColumnsExpanded && schema.map(field => (
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
                  </div>
                </div>

                {/* Middle Pane: Transformation Functions */}
                <div className="variable-pane">
                  <div className="variable-pane-header" style={{ textTransform: 'none' }}>Functions</div>
                  <div className="variable-pane-content">
                    {TRANSFORMATION_OPTIONS.reduce((acc, option) => {
                      const lastGroup = acc[acc.length - 1];
                      if (!lastGroup || lastGroup.group !== option.group) {
                        acc.push({ group: option.group, options: [option] });
                      } else {
                        lastGroup.options.push(option);
                      }
                      return acc;
                    }, []).map((group, idx) => {
                      const isCollapsed = collapsedFunctionGroups[group.group];
                      // Convert group name to Title Case
                      const titleCaseGroup = group.group.split('/').map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                      ).join('/');
                      return (
                        <div key={idx} className={group.group === 'Conditional' ? 'function-group-conditional' : ''}>
                          <div 
                            className={`function-group-header collapsible-header ${group.group === 'Conditional' ? 'conditional-header' : ''}`}
                            onClick={() => setCollapsedFunctionGroups(prev => ({ ...prev, [group.group]: !prev[group.group] }))}
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textTransform: 'none' }}
                          >
                            <span>
                              {group.group === 'Conditional' && '⚡ '}
                              {titleCaseGroup}
                            </span>
                            {isCollapsed ? <FiChevronRight size={14} /> : <FiChevronDown size={14} />}
                          </div>
                          {!isCollapsed && group.options.map(opt => (
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
                      );
                    })}
                  </div>
                </div>

                {/* Right Pane: Expression Builder */}
                <div className="variable-pane">
                  <div className="variable-pane-header" style={{ textTransform: 'none' }}>Build Expression</div>
                  <div className="variable-pane-content">
                    <div className="expression-builder">
                      <div className="variable-name-input">
                        <label htmlFor="editvar-name">Variable Name</label>
                        <input
                          id="editvar-name"
                          type="text"
                          value={editingVariable.name}
                          disabled
                        />
                        <small className="form-text">Variable name cannot be changed</small>
                      </div>

                      <div className="variable-name-input">
                        <label htmlFor="editvar-data-type">Data Type</label>
                        <select
                          id="editvar-data-type"
                          className="form-control"
                          value={editingVariable.data_type || ''}
                          onChange={(e) => setEditingVariable({ ...editingVariable, data_type: e.target.value })}
                        >
                          <option value="">Auto-detect</option>
                          <option value="string">String</option>
                          <option value="integer">Integer</option>
                          <option value="float">Float</option>
                          <option value="date">Date</option>
                          <option value="timestamp">Timestamp</option>
                          <option value="boolean">Boolean</option>
                        </select>
                        <small className="form-text">Output will be converted to this type</small>
                      </div>

                      <div className="expression-builder-header">
                        <label htmlFor="editvar-expression">Expression *</label>
                      </div>
                      <div className="expression-editor-container">
                        <textarea
                          id="editvar-expression"
                          ref={editExpressionTextareaRef}
                          className="expression-code-input"
                          value={editingVariable.expression || ''}
                          onChange={(e) => setEditingVariable({ ...editingVariable, expression: e.target.value })}
                          placeholder="Click + buttons to insert columns and functions, or type directly..."
                          spellCheck="false"
                          style={{
                            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                            fontSize: '10px',
                            minHeight: '200px',
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            backgroundColor: '#fff',
                            resize: 'vertical'
                          }}
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
                          <div className="form-label">Preview</div>
                          <div id="editvar-preview" className="expression-preview">
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
              <button className="btn btn-secondary btn-fixed-width" onClick={() => setEditingVariable(null)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-fixed-width" onClick={handleSaveEditedVariable}>
                Save Variable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DQ Rule Assignment Panel Modal */}
      {showDqRulePanel && (
        <div className="expression-editor-modal dq-rule-panel-modal">
          <div className="modal-overlay"></div>
          <div className="modal-content dq-rule-panel-content">
            <div className="modal-header">
              <h4>Assign Data Quality Rules</h4>
              <button className="btn-close" onClick={() => setShowDqRulePanel(false)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body dq-rule-panel-body">
              <div className="dq-panel-grid">
                {/* Left Panel: Target Columns */}
                <div className="dq-panel-section">
                  <div className="dq-panel-section-header">Target Columns</div>
                  <div className="dq-panel-section-content">
                    {mappings.length === 0 ? (
                      <div className="dq-panel-empty">No target columns available. Create field mappings first.</div>
                    ) : (
                      mappings.map(mapping => (
                        <div key={mapping.target_field} className="dq-panel-item">
                          <input
                            type="checkbox"
                            id={`col-${mapping.target_field}`}
                            checked={selectedColumns.has(mapping.target_field)}
                            onChange={() => toggleColumnSelection(mapping.target_field)}
                          />
                          <label htmlFor={`col-${mapping.target_field}`}>{mapping.target_field}</label>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Center Panel: Available DQ Rules */}
                <div className="dq-panel-section">
                  <div className="dq-panel-section-header">Available DQ Rules</div>
                  <div className="dq-panel-section-content">
                    {dqRulesLoading ? (
                      <div className="dq-panel-loading">Loading rules...</div>
                    ) : availableDqRules.length === 0 ? (
                      <div className="dq-panel-empty">No DQ rules available. Create rules in the Quality Rules page.</div>
                    ) : (
                      availableDqRules.map(rule => (
                        <div key={rule.id} className="dq-panel-item">
                          <input
                            type="checkbox"
                            id={`rule-${rule.id}`}
                            checked={selectedRules.has(rule.id)}
                            onChange={() => toggleRuleSelection(rule.id)}
                          />
                          <label htmlFor={`rule-${rule.id}`}>
                            <span className="dq-rule-name">{rule.rule_name}</span>
                            <span className="dq-rule-type">({rule.rule_type})</span>
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="dq-panel-section-actions">
                    <div className="dq-error-action-selector">
                      <label htmlFor="dq-on-failure" style={{ fontSize: '10px', fontFamily: 'Inter', marginRight: '6px' }}>On Failure:</label>
                      <select
                        id="dq-on-failure"
                        value={selectedErrorAction}
                        onChange={(e) => setSelectedErrorAction(e.target.value)}
                        style={{ fontSize: '10px', fontFamily: 'Inter', padding: '2px 4px' }}
                      >
                        <option value="log_continue">Log & Continue</option>
                        <option value="log_abort">Log & Abort Job</option>
                      </select>
                    </div>
                    <button 
                      className="btn btn-primary btn-sm"
                      onClick={handleAddDqAssignments}
                      disabled={selectedColumns.size === 0 || selectedRules.size === 0}
                      style={{ fontSize: '10px', fontFamily: 'Inter' }}
                    >
                      <FiPlus /> Add Assignment
                    </button>
                  </div>
                </div>

                {/* Right Panel: Current Assignments */}
                <div className="dq-panel-section">
                  <div className="dq-panel-section-header">Current Assignments</div>
                  <div className="dq-panel-section-content">
                    {Object.keys(dqRuleAssignments).length === 0 ? (
                      <div className="dq-panel-empty">No DQ rules assigned yet. Select columns and rules, then click Add.</div>
                    ) : (
                      Object.entries(dqRuleAssignments).map(([columnName, ruleAssignments]) => (
                        <div key={columnName} className="dq-assignment-group">
                          <div className="dq-assignment-column">{columnName}</div>
                          <div className="dq-assignment-rules">
                            {ruleAssignments.map(ruleAssignment => (
                              <div key={ruleAssignment.ruleId} className="dq-assignment-rule">
                                <span className="dq-assignment-rule-name">{getRuleName(ruleAssignment.ruleId)}</span>
                                <select
                                  className="dq-assignment-action-select"
                                  value={ruleAssignment.errorAction}
                                  onChange={(e) => handleUpdateDqErrorAction(columnName, ruleAssignment.ruleId, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  title="Action on failure"
                                  style={{ fontSize: '9px', fontFamily: 'Inter', padding: '1px 2px', marginRight: '4px' }}
                                >
                                  <option value="log_continue">Continue</option>
                                  <option value="log_abort">Abort</option>
                                </select>
                                <button 
                                  className="btn-icon-tiny"
                                  onClick={() => handleRemoveDqAssignment(columnName, ruleAssignment.ruleId)}
                                  title="Remove this rule"
                                >
                                  <FiX size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-primary btn-fixed-width" 
                onClick={() => setShowDqRulePanel(false)}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {validationError && (
        <div className="expression-editor-modal">
          <div className="modal-overlay" onClick={() => setValidationError(null)}></div>
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h4>Validation Error</h4>
              <button className="btn-close" onClick={() => setValidationError(null)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '10px', lineHeight: '1.5' }}>
                {validationError}
              </p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-primary btn-fixed-width" 
                onClick={() => setValidationError(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mapping-summary">
        <p>{mappings.length} field(s) mapped</p>
        {variables.length > 0 && <p>{variables.length} variable(s) defined</p>}
        {Object.keys(dqRuleAssignments).length > 0 && <p>{Object.keys(dqRuleAssignments).length} column(s) with DQ rules</p>}
      </div>
    </div>
  );
};
TableBasedMapper.propTypes = {
  schema: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      contains_pii: PropTypes.bool,
      is_pii: PropTypes.bool,
      pii: PropTypes.bool
    })
  ).isRequired,

  fieldMappings: PropTypes.arrayOf(
    PropTypes.shape({
      source_field: PropTypes.string.isRequired,
      target_field: PropTypes.string.isRequired,
      transformation: PropTypes.string,
      transformation_params: PropTypes.object,
      is_custom: PropTypes.bool
    })
  ),

  variables: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string.isRequired,
      expression: PropTypes.string,
      data_type: PropTypes.string,
      source_field: PropTypes.string,
      transformation: PropTypes.string,
      transformation_params: PropTypes.object
    })
  ),

  piiColumns: PropTypes.arrayOf(PropTypes.string),

  dqRuleAssignments: PropTypes.objectOf(
    PropTypes.arrayOf(
      PropTypes.shape({
        ruleId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        errorAction: PropTypes.oneOf(['log_continue', 'log_abort']),
        applyTo: PropTypes.string
      })
    )
  ),

  onMappingsChange: PropTypes.func.isRequired
};

export default TableBasedMapper;
