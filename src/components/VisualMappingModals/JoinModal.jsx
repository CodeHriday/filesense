import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FaPlus, FaTrash, FaExclamationTriangle, FaMagic, FaEraser, FaChevronRight, FaChevronLeft, FaAngleDoubleRight, FaAngleDoubleLeft } from 'react-icons/fa';
import './MappingConfigModal.css';
import PropTypes from 'prop-types';

const toTitleCase = (str) => {
  if (!str) return str;
  return str.toLowerCase().split(/[\s_]+/).map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

const formatTypeWithPrecision = (type, precision, scale) => {
  const baseType = toTitleCase(type || 'String');
  if (precision && scale !== null && scale !== undefined) {
    return `${baseType}(${precision},${scale})`;
  } else if (precision) {
    return `${baseType}(${precision})`;
  }
  return baseType;
};


const JoinModal = ({ isOpen, onClose, onSave, initialConfig = {}, leftSchema = [], rightSchema = [], leftNodeName = '', rightNodeName = '' }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [activeTab, setActiveTab] = useState('configuration');
  const [joinType, setJoinType] = useState('INNER');
  const [joinKeys, setJoinKeys] = useState([]);
  const [columnMappings, setColumnMappings] = useState([]);
  const [validationError, setValidationError] = useState('');
  const [mappingFilter, setMappingFilter] = useState('');
  const [leftPanelSelection, setLeftPanelSelection] = useState(new Set());
  const [rightPanelSelection, setRightPanelSelection] = useState(new Set());
  const [leftPanelFilter, setLeftPanelFilter] = useState('');
  const [rightPanelFilter, setRightPanelFilter] = useState('');
  
  const lastConfigSignatureRef = useRef('');
  const userHasEditedRef = useRef(false);
  
  const configSignature = useMemo(() => {
    return JSON.stringify({
      joinType: initialConfig.joinType,
      joinKeysLen: initialConfig.joinKeys?.length || 0,
      name: initialConfig.name
    });
  }, [initialConfig.joinType, initialConfig.joinKeys?.length, initialConfig.name]);

  useEffect(() => {
    if (!isOpen) {
      lastConfigSignatureRef.current = '';
      userHasEditedRef.current = false;
      return;
    }
    
    const isNewConfig = configSignature !== lastConfigSignatureRef.current;
    const hasRealConfig = initialConfig.joinType || (initialConfig.joinKeys && initialConfig.joinKeys.length > 0);
    
    if (isNewConfig && hasRealConfig && !userHasEditedRef.current) {
      lastConfigSignatureRef.current = configSignature;
      
      setName(initialConfig.name || '');
      setDescription(initialConfig.description || '');
      setJoinType(initialConfig.joinType || 'INNER');
      setJoinKeys(initialConfig.joinKeys || []);
      
      if (initialConfig.columnMappings && initialConfig.columnMappings.length > 0) {
        setColumnMappings(initialConfig.columnMappings);
      }
      
      setActiveTab('configuration');
      setValidationError('');
      setMappingFilter('');
    } else if (isNewConfig && !hasRealConfig && lastConfigSignatureRef.current === '') {
      lastConfigSignatureRef.current = configSignature;
      setName('');
      setDescription('');
      setJoinType('INNER');
      setJoinKeys([]);
      setColumnMappings([]);
      setActiveTab('configuration');
      setValidationError('');
      setMappingFilter('');
    }
  }, [isOpen, configSignature, initialConfig]);

  // Build lookup maps for quick schema access
  const leftSchemaMap = useMemo(() => {
    const map = new Map();
    leftSchema.forEach(col => map.set(col.name, col));
    return map;
  }, [leftSchema]);

  const rightSchemaMap = useMemo(() => {
    const map = new Map();
    rightSchema.forEach(col => map.set(col.name, col));
    return map;
  }, [rightSchema]);

  useEffect(() => {
    if (isOpen && leftSchema.length > 0 && rightSchema.length > 0) {
      setJoinKeys(prevKeys => {
        if (prevKeys.length === 0) {
          return [{
            leftColumn: leftSchema.length > 0 ? leftSchema[0].name : '',
            operator: '=',
            rightColumn: rightSchema.length > 0 ? rightSchema[0].name : ''
          }];
        }
        return prevKeys;
      });
      setColumnMappings(prevMappings => {
        if (prevMappings.length === 0) {
          // Initial population - create mappings from scratch
          const mappings = [];
          leftSchema.forEach(col => {
            mappings.push({
              outputColumn: col.name,
              sourceColumn: col.name,
              sourceSide: 'left',
              include: true,
              type: col.type || col.data_type || col.column_type || 'STRING',
              precision: col.precision ?? null,
              scale: col.scale ?? null,
              nullable: col.nullable ?? true,
              pii: col.pii || col.contains_pii || false,
              dqRules: col.dqRules || []
            });
          });
          rightSchema.forEach(col => {
            const isDuplicate = leftSchema.some(leftCol => leftCol.name === col.name);
            if (!isDuplicate) {
              mappings.push({
                outputColumn: col.name,
                sourceColumn: col.name,
                sourceSide: 'right',
                include: true,
                type: col.type || col.data_type || col.column_type || 'STRING',
                precision: col.precision ?? null,
                scale: col.scale ?? null,
                nullable: col.nullable ?? true,
                pii: col.pii || col.contains_pii || false,
                dqRules: col.dqRules || []
              });
            }
          });
          return mappings;
        }
        
        // Schema reconciliation - update existing mappings with fresh metadata from upstream
        // Preserves user-controlled fields: outputColumn, ordering
        // Updates schema-derived fields: type, precision, scale, nullable, pii, dqRules
        const reconciledMappings = prevMappings.map(mapping => {
          const schemaMap = mapping.sourceSide === 'left' ? leftSchemaMap : rightSchemaMap;
          const upstreamCol = schemaMap.get(mapping.sourceColumn);
          
          if (upstreamCol) {
            // Update with fresh metadata from upstream, preserve user edits
            return {
              ...mapping,
              type: upstreamCol.type || upstreamCol.data_type || upstreamCol.column_type || 'STRING',
              precision: upstreamCol.precision ?? null,
              scale: upstreamCol.scale ?? null,
              nullable: upstreamCol.nullable ?? true,
              pii: upstreamCol.pii || upstreamCol.contains_pii || false,
              dqRules: upstreamCol.dqRules || []
            };
          }
          
          // Column no longer exists upstream - keep as-is (will be flagged as invalid)
          return mapping;
        });
        
        return reconciledMappings;
      });
    }
  }, [leftSchema, rightSchema, leftSchemaMap, rightSchemaMap, isOpen]);

  const leftFieldNames = useMemo(() => new Set(leftSchema.map(c => c.name)), [leftSchema]);
  const rightFieldNames = useMemo(() => new Set(rightSchema.map(c => c.name)), [rightSchema]);

  const invalidMappings = useMemo(() => {
    const invalid = [];
    columnMappings.forEach((mapping, index) => {
      const fieldSet = mapping.sourceSide === 'left' ? leftFieldNames : rightFieldNames;
      if (mapping.sourceColumn && !fieldSet.has(mapping.sourceColumn)) {
        invalid.push({
          index,
          type: 'columnMapping',
          field: mapping.sourceColumn,
          side: mapping.sourceSide
        });
      }
    });
    return invalid;
  }, [columnMappings, leftFieldNames, rightFieldNames]);

  const invalidJoinKeys = useMemo(() => {
    const invalid = [];
    joinKeys.forEach((key, index) => {
      if (key.leftColumn && !leftFieldNames.has(key.leftColumn)) {
        invalid.push({ index, side: 'left', field: key.leftColumn });
      }
      if (key.rightColumn && !rightFieldNames.has(key.rightColumn)) {
        invalid.push({ index, side: 'right', field: key.rightColumn });
      }
    });
    return invalid;
  }, [joinKeys, leftFieldNames, rightFieldNames]);

  const hasInvalidMappings = invalidMappings.length > 0 || invalidJoinKeys.length > 0;

  const filteredMappingIndices = useMemo(() => {
    if (!mappingFilter.trim()) {
      return columnMappings.map((_, idx) => idx);
    }
    const lowerFilter = mappingFilter.toLowerCase();
    return columnMappings
      .map((mapping, idx) => ({ mapping, idx }))
      .filter(({ mapping }) => 
        mapping.sourceColumn?.toLowerCase().includes(lowerFilter) ||
        mapping.outputColumn?.toLowerCase().includes(lowerFilter)
      )
      .map(({ idx }) => idx);
  }, [columnMappings, mappingFilter]);

  const isMappingInvalid = (index) => invalidMappings.some(inv => inv.index === index);
  const isJoinKeyInvalid = (index, side) => invalidJoinKeys.some(inv => inv.index === index && inv.side === side);

  const removeInvalidMappings = () => {
    userHasEditedRef.current = true;
    const validMappingIndices = new Set(invalidMappings.map(inv => inv.index));
    const filteredMappings = columnMappings.filter((_, idx) => !validMappingIndices.has(idx));
    setColumnMappings(filteredMappings);

    const invalidJoinKeyIndices = new Set();
    invalidJoinKeys.forEach(inv => invalidJoinKeyIndices.add(inv.index));
    const filteredJoinKeys = joinKeys.filter((_, idx) => !invalidJoinKeyIndices.has(idx));
    setJoinKeys(filteredJoinKeys);
  };

  const generateDefaultMappings = () => {
    const mappings = [];
    
    leftSchema.forEach(col => {
      mappings.push({
        outputColumn: col.name,
        sourceColumn: col.name,
        sourceSide: 'left',
        include: true,
        type: col.type || col.data_type || col.column_type || 'STRING',
        precision: col.precision ?? null,
        scale: col.scale ?? null,
        nullable: col.nullable ?? true,
        pii: col.pii || col.contains_pii || false,
        dqRules: col.dqRules || []
      });
    });
    
    rightSchema.forEach(col => {
      const isDuplicate = leftSchema.some(leftCol => leftCol.name === col.name);
      if (!isDuplicate) {
        mappings.push({
          outputColumn: col.name,
          sourceColumn: col.name,
          sourceSide: 'right',
          include: true,
          type: col.type || col.data_type || col.column_type || 'STRING',
          precision: col.precision ?? null,
          scale: col.scale ?? null,
          nullable: col.nullable ?? true,
          pii: col.pii || col.contains_pii || false,
          dqRules: col.dqRules || []
        });
      }
    });
    
    setColumnMappings(mappings);
  };

  const addJoinKey = () => {
    userHasEditedRef.current = true;
    const newKey = {
      leftColumn: leftSchema.length > 0 ? leftSchema[0].name : '',
      operator: '=',
      rightColumn: rightSchema.length > 0 ? rightSchema[0].name : ''
    };
    setJoinKeys([...joinKeys, newKey]);
  };

  const removeJoinKey = (index) => {
    userHasEditedRef.current = true;
    setJoinKeys(joinKeys.filter((_, i) => i !== index));
  };

  const updateJoinKey = (index, field, value) => {
    userHasEditedRef.current = true;
    const updated = [...joinKeys];
    updated[index][field] = value;
    setJoinKeys(updated);
  };

  const addColumnMapping = () => {
    userHasEditedRef.current = true;
    const firstCol = leftSchema.length > 0 ? leftSchema[0] : null;
    const newMapping = {
      outputColumn: '',
      sourceColumn: firstCol?.name || '',
      sourceSide: 'left',
      include: true,
      type: firstCol?.type || firstCol?.data_type || firstCol?.column_type || 'STRING',
      precision: firstCol?.precision ?? null,
      scale: firstCol?.scale ?? null,
      nullable: firstCol?.nullable ?? true,
      pii: firstCol?.pii || firstCol?.contains_pii || false,
      dqRules: firstCol?.dqRules || []
    };
    setColumnMappings([...columnMappings, newMapping]);
  };

  const removeColumnMapping = (index) => {
    userHasEditedRef.current = true;
    setColumnMappings(columnMappings.filter((_, i) => i !== index));
  };

  const updateColumnMapping = (index, field, value) => {
    userHasEditedRef.current = true;
    const updated = [...columnMappings];
    updated[index][field] = value;
    
    if (field === 'sourceSide') {
      const schema = value === 'left' ? leftSchema : rightSchema;
      const firstCol = schema.length > 0 ? schema[0] : null;
      updated[index].sourceColumn = firstCol?.name || '';
      updated[index].type = firstCol?.type || firstCol?.data_type || firstCol?.column_type || 'STRING';
      updated[index].precision = firstCol?.precision ?? null;
      updated[index].scale = firstCol?.scale ?? null;
      updated[index].nullable = firstCol?.nullable ?? true;
      updated[index].pii = firstCol?.pii || firstCol?.contains_pii || false;
      updated[index].dqRules = firstCol?.dqRules || [];
    } else if (field === 'sourceColumn') {
      const schema = updated[index].sourceSide === 'left' ? leftSchema : rightSchema;
      const col = schema.find(c => c.name === value);
      if (col) {
        updated[index].type = col.type || col.data_type || col.column_type || 'STRING';
        updated[index].precision = col.precision ?? null;
        updated[index].scale = col.scale ?? null;
        updated[index].nullable = col.nullable ?? true;
        updated[index].pii = col.pii || col.contains_pii || false;
        updated[index].dqRules = col.dqRules || [];
      }
    }
    
    setColumnMappings(updated);
  };

  const toggleAllLeftColumns = () => {
    userHasEditedRef.current = true;
    const leftMappings = columnMappings.filter(m => m.sourceSide === 'left');
    const allIncluded = leftMappings.length > 0 && leftMappings.every(m => m.include);
    
    const updated = columnMappings.map(m => {
      if (m.sourceSide === 'left') {
        return { ...m, include: !allIncluded };
      }
      return m;
    });
    setColumnMappings(updated);
  };

  const toggleAllRightColumns = () => {
    userHasEditedRef.current = true;
    const rightMappings = columnMappings.filter(m => m.sourceSide === 'right');
    const allIncluded = rightMappings.length > 0 && rightMappings.every(m => m.include);
    
    const updated = columnMappings.map(m => {
      if (m.sourceSide === 'right') {
        return { ...m, include: !allIncluded };
      }
      return m;
    });
    setColumnMappings(updated);
  };

  const getLeftIncludeState = () => {
    const leftMappings = columnMappings.filter(m => m.sourceSide === 'left');
    if (leftMappings.length === 0) return false;
    return leftMappings.every(m => m.include);
  };

  const getRightIncludeState = () => {
    const rightMappings = columnMappings.filter(m => m.sourceSide === 'right');
    if (rightMappings.length === 0) return false;
    return rightMappings.every(m => m.include);
  };

  const clearAllMappings = () => {
    userHasEditedRef.current = true;
    setColumnMappings([]);
  };

  const automapColumns = (preferSide = 'left') => {
    userHasEditedRef.current = true;
    const mappings = [];
    const usedColumns = new Set();

    if (preferSide === 'left') {
      leftSchema.forEach(col => {
        mappings.push({
          outputColumn: col.name,
          sourceColumn: col.name,
          sourceSide: 'left',
          include: true,
          type: col.type || col.data_type || col.column_type || 'STRING',
          precision: col.precision ?? null,
          scale: col.scale ?? null,
          nullable: col.nullable ?? true,
          pii: col.pii || col.contains_pii || false,
          dqRules: col.dqRules || []
        });
        usedColumns.add(col.name);
      });
      rightSchema.forEach(col => {
        if (!usedColumns.has(col.name)) {
          mappings.push({
            outputColumn: col.name,
            sourceColumn: col.name,
            sourceSide: 'right',
            include: true,
            type: col.type || col.data_type || col.column_type || 'STRING',
            precision: col.precision ?? null,
            scale: col.scale ?? null,
            nullable: col.nullable ?? true,
            pii: col.pii || col.contains_pii || false,
            dqRules: col.dqRules || []
          });
          usedColumns.add(col.name);
        }
      });
    } else {
      rightSchema.forEach(col => {
        mappings.push({
          outputColumn: col.name,
          sourceColumn: col.name,
          sourceSide: 'right',
          include: true,
          type: col.type || col.data_type || col.column_type || 'STRING',
          precision: col.precision ?? null,
          scale: col.scale ?? null,
          nullable: col.nullable ?? true,
          pii: col.pii || col.contains_pii || false,
          dqRules: col.dqRules || []
        });
        usedColumns.add(col.name);
      });
      leftSchema.forEach(col => {
        if (!usedColumns.has(col.name)) {
          mappings.push({
            outputColumn: col.name,
            sourceColumn: col.name,
            sourceSide: 'left',
            include: true,
            type: col.type || col.data_type || col.column_type || 'STRING',
            precision: col.precision ?? null,
            scale: col.scale ?? null,
            nullable: col.nullable ?? true,
            pii: col.pii || col.contains_pii || false,
            dqRules: col.dqRules || []
          });
          usedColumns.add(col.name);
        }
      });
    }

    setColumnMappings(mappings);
  };

  // Dual-list picker: Get all available columns (not yet mapped)
  const availableColumns = useMemo(() => {
    const mappedKeys = new Set(columnMappings.map(m => `${m.sourceSide}:${m.sourceColumn}`));
    const available = [];
    leftSchema.forEach(col => {
      const key = `left:${col.name}`;
      if (!mappedKeys.has(key)) {
        available.push({ ...col, sourceSide: 'left', key });
      }
    });
    rightSchema.forEach(col => {
      const key = `right:${col.name}`;
      if (!mappedKeys.has(key)) {
        available.push({ ...col, sourceSide: 'right', key });
      }
    });
    return available;
  }, [leftSchema, rightSchema, columnMappings]);

  // Filter available columns
  const filteredAvailableColumns = useMemo(() => {
    if (!leftPanelFilter) return availableColumns;
    const lower = leftPanelFilter.toLowerCase();
    return availableColumns.filter(col => col.name.toLowerCase().includes(lower));
  }, [availableColumns, leftPanelFilter]);

  // Filter mapped columns
  const filteredMappedColumns = useMemo(() => {
    if (!rightPanelFilter) return columnMappings;
    const lower = rightPanelFilter.toLowerCase();
    return columnMappings.filter(m => 
      m.outputColumn.toLowerCase().includes(lower) || 
      m.sourceColumn.toLowerCase().includes(lower)
    );
  }, [columnMappings, rightPanelFilter]);

  // Toggle selection in left panel (available)
  const toggleLeftPanelSelection = (key) => {
    const newSelection = new Set(leftPanelSelection);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    setLeftPanelSelection(newSelection);
  };

  // Toggle selection in right panel (mapped)
  const toggleRightPanelSelection = (key) => {
    const newSelection = new Set(rightPanelSelection);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    setRightPanelSelection(newSelection);
  };

  // Helper function to generate unique output column name with numeric suffix
  const getUniqueOutputName = (baseName, existingNames) => {
    if (!existingNames.has(baseName)) {
      return baseName;
    }
    let suffix = 1;
    while (existingNames.has(`${baseName}_${suffix}`)) {
      suffix++;
    }
    return `${baseName}_${suffix}`;
  };

  // Move selected columns from available to mapped (>)
  const moveSelectedToMapped = () => {
    if (leftPanelSelection.size === 0) return;
    userHasEditedRef.current = true;
    
    const newMappings = [...columnMappings];
    const existingOutputNames = new Set(newMappings.map(m => m.outputColumn || m.sourceColumn));
    
    leftPanelSelection.forEach(key => {
      const col = availableColumns.find(c => c.key === key);
      if (col) {
        const outputName = getUniqueOutputName(col.name, existingOutputNames);
        existingOutputNames.add(outputName);
        newMappings.push({
          outputColumn: outputName,
          sourceColumn: col.name,
          sourceSide: col.sourceSide,
          include: true,
          type: col.type || col.data_type || col.column_type || 'STRING',
          precision: col.precision ?? null,
          scale: col.scale ?? null,
          nullable: col.nullable ?? true,
          pii: col.pii || col.contains_pii || false,
          dqRules: col.dqRules || []
        });
      }
    });
    
    setColumnMappings(newMappings);
    setLeftPanelSelection(new Set());
  };

  // Move selected columns from mapped back to available (<)
  const moveSelectedToAvailable = () => {
    if (rightPanelSelection.size === 0) return;
    userHasEditedRef.current = true;
    
    const keysToRemove = rightPanelSelection;
    const newMappings = columnMappings.filter(m => {
      const key = `${m.sourceSide}:${m.sourceColumn}`;
      return !keysToRemove.has(key);
    });
    
    setColumnMappings(newMappings);
    setRightPanelSelection(new Set());
  };

  // Move all available to mapped (>>)
  const moveAllToMapped = () => {
    if (availableColumns.length === 0) return;
    userHasEditedRef.current = true;
    
    const newMappings = [...columnMappings];
    const existingOutputNames = new Set(newMappings.map(m => m.outputColumn || m.sourceColumn));
    
    availableColumns.forEach(col => {
      const outputName = getUniqueOutputName(col.name, existingOutputNames);
      existingOutputNames.add(outputName);
      newMappings.push({
        outputColumn: outputName,
        sourceColumn: col.name,
        sourceSide: col.sourceSide,
        include: true,
        type: col.type || col.data_type || col.column_type || 'STRING',
        precision: col.precision ?? null,
        scale: col.scale ?? null,
        nullable: col.nullable ?? true,
        pii: col.pii || col.contains_pii || false,
        dqRules: col.dqRules || []
      });
    });
    
    setColumnMappings(newMappings);
    setLeftPanelSelection(new Set());
  };

  // Move all mapped back to available (<<)
  const moveAllToAvailable = () => {
    if (columnMappings.length === 0) return;
    userHasEditedRef.current = true;
    setColumnMappings([]);
    setRightPanelSelection(new Set());
  };

  const validateConfig = () => {
    if (joinKeys.length === 0) {
      setValidationError('At least one join key is required');
      return false;
    }

    for (let i = 0; i < joinKeys.length; i++) {
      const key = joinKeys[i];
      if (!key.leftColumn || !key.rightColumn) {
        setValidationError(`Join key ${i + 1} is incomplete`);
        return false;
      }
    }

    const outputColumns = columnMappings.map(m => m.outputColumn || m.sourceColumn);
    
    if (outputColumns.length === 0) {
      setValidationError('At least one output column must be included');
      return false;
    }

    const duplicates = outputColumns.filter((col, index) => 
      outputColumns.indexOf(col) !== index
    );
    
    if (duplicates.length > 0) {
      setValidationError(`Duplicate output column names: ${duplicates.join(', ')}`);
      return false;
    }

    setValidationError('');
    return true;
  };

  const handleSave = () => {
    if (!validateConfig()) {
      setActiveTab('configuration');
      return;
    }

    const config = {
      name,
      description,
      joinType,
      joinKeys,
      columnMappings: columnMappings.map(m => ({ ...m, include: true })),
      outputSchema: columnMappings.map(m => ({
        name: m.outputColumn || m.sourceColumn,
        type: m.type || 'STRING',
        precision: m.precision ?? null,
        scale: m.scale ?? null,
        nullable: m.nullable ?? true,
        pii: m.pii || m.contains_pii || false,
        dqRules: m.dqRules || [],
        source: m.sourceSide
      }))
    };
    
    onSave(config);
    onClose();
  };

  const getOutputSchema = () => {
    return columnMappings
      .map(m => m.outputColumn || m.sourceColumn)
      .filter(name => name);
  };

  if (!isOpen) return null;

  return (
    <div className="vm-modal-overlay">
      <div className="vm-modal vm-modal-large">
        <div className="vm-modal-header">
          <h2>Join Configuration</h2>
          <button onClick={onClose} className="vm-modal-close" aria-label="Close modal">×</button>
        </div>

        <div className="vm-tabs">
          <button
            className={`vm-tab ${activeTab === 'configuration' ? 'vm-tab-active' : ''}`}
            onClick={() => setActiveTab('configuration')}
          >
            Configuration
          </button>
          <button
            className={`vm-tab ${activeTab === 'mapping' ? 'vm-tab-active' : ''}`}
            onClick={() => setActiveTab('mapping')}
          >
            Mapping
          </button>
          <button
            className={`vm-tab ${activeTab === 'schema' ? 'vm-tab-active' : ''}`}
            onClick={() => setActiveTab('schema')}
          >
            Output Schema
          </button>
        </div>

        <div className="vm-modal-body vm-modal-body-scroll">
          {hasInvalidMappings && (
            <div className="vm-warning-banner" style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              padding: '12px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaExclamationTriangle style={{ color: '#856404', fontSize: '16px' }} />
                <span style={{ color: '#856404', fontSize: '10px', fontFamily: 'Inter, sans-serif' }}>
                  {invalidMappings.length + invalidJoinKeys.length} mapping(s) reference fields that no longer exist in upstream nodes.
                </span>
              </div>
              <button
                onClick={removeInvalidMappings}
                className="vm-btn vm-btn-secondary"
                style={{ 
                  padding: '4px 8px', 
                  fontSize: '9px',
                  backgroundColor: '#856404',
                  color: 'white',
                  border: 'none'
                }}
              >
                Remove Invalid
              </button>
            </div>
          )}
          {validationError && (
            <div className="vm-error-message">
              {validationError}
            </div>
          )}

          {activeTab === 'configuration' && (
            <div>
              <div className="vm-form-group">
                <label htmlFor="join-name-input">Name *</label>
                <input
                  id="join-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => { userHasEditedRef.current = true; setName(e.target.value); }}
                  placeholder="Enter a name for this join configuration"
                  className="vm-input"
                  required
                />
              </div>
              
              <div className="vm-form-group">
                <label htmlFor="join-description">Description</label>
                <textarea
                  id="join-description"
                  value={description}
                  onChange={(e) => { userHasEditedRef.current = true; setDescription(e.target.value); }}
                  placeholder="Optional description"
                  className="vm-input"
                  rows="2"
                />
              </div>
              
              <div className="vm-form-group">
                <label htmlFor="join-type-select">Join Type</label>
                <select 
                  id="join-type-select"
                  className="vm-select"
                  value={joinType}
                  onChange={(e) => { userHasEditedRef.current = true; setJoinType(e.target.value); }}
                >
                  <option value="INNER">INNER JOIN</option>
                  <option value="LEFT">LEFT JOIN</option>
                  <option value="RIGHT">RIGHT JOIN</option>
                  <option value="FULL OUTER">FULL OUTER JOIN</option>
                </select>
                <span className="vm-help-text">
                  Select the type of join operation to perform
                </span>
              </div>

              <div className="vm-section-title">Join Keys</div>
              
              {joinKeys.length === 0 ? (
                <div className="vm-info-box">
                  <p>No join keys defined. Click "Add Join Key" to create one.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="vm-schema-table" style={{ marginBottom: '16px' }}>
                    <thead>
                      <tr>
                        <th>Left Column {leftNodeName && `(${leftNodeName})`}</th>
                        <th>Operator</th>
                        <th>Right Column {rightNodeName && `(${rightNodeName})`}</th>
                        <th style={{ width: '80px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {joinKeys.map((key, index) => {
                        const leftInvalid = isJoinKeyInvalid(index, 'left');
                        const rightInvalid = isJoinKeyInvalid(index, 'right');
                        return (
                        <tr key={index} style={leftInvalid || rightInvalid ? { backgroundColor: '#fff3cd' } : {}}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {leftInvalid && <FaExclamationTriangle style={{ color: '#856404', fontSize: '12px' }} title={`Field "${key.leftColumn}" no longer exists`} />}
                              <select
                                id={`leftColumn-${index}`}
                                className="vm-select"
                                style={leftInvalid ? { borderColor: '#ffc107', backgroundColor: '#fffbe6' } : {}}
                                value={key.leftColumn}
                                onChange={(e) => updateJoinKey(index, 'leftColumn', e.target.value)}
                                aria-label={`Left Column ${index + 1}`}
                              >
                                <option value="">-- Select Column --</option>
                                {leftInvalid && <option value={key.leftColumn} style={{ color: '#856404' }}>{key.leftColumn} (missing)</option>}
                                {leftSchema.map((col, i) => (
                                  <option key={i} value={col.name}>{col.name}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td>
                            <select
                              id={`operator-${index}`}
                              className="vm-select"
                              value={key.operator}
                              onChange={(e) => updateJoinKey(index, 'operator', e.target.value)}
                              aria-label={`Operator ${index + 1}`}
                            >
                              <option value="=">=</option>
                              <option value="!=">!=</option>
                              <option value="<">&lt;</option>
                              <option value=">">&gt;</option>
                              <option value="<=">&lt;=</option>
                              <option value=">=">&gt;=</option>
                            </select>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {rightInvalid && <FaExclamationTriangle style={{ color: '#856404', fontSize: '12px' }} title={`Field "${key.rightColumn}" no longer exists`} />}
                              <select
                                id={`rightColumn-${index}`}
                                className="vm-select"
                                style={rightInvalid ? { borderColor: '#ffc107', backgroundColor: '#fffbe6' } : {}}
                                value={key.rightColumn}
                                onChange={(e) => updateJoinKey(index, 'rightColumn', e.target.value)}
                                aria-label={`Right Column ${index + 1}`}
                              >
                                <option value="">-- Select Column --</option>
                                {rightInvalid && <option value={key.rightColumn} style={{ color: '#856404' }}>{key.rightColumn} (missing)</option>}
                                {rightSchema.map((col, i) => (
                                  <option key={i} value={col.name}>{col.name}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td>
                            <button
                              className="vm-btn vm-btn-secondary"
                              onClick={() => removeJoinKey(index)}
                              style={{ padding: '4px 8px', fontSize: '9px' }}
                              aria-label={`Remove join key ${index + 1}`}
                            >
                              <FaTrash />
                            </button>
                          </td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              )}

              <button
                className="vm-btn vm-btn-primary"
                onClick={addJoinKey}
                style={{ marginTop: '8px' }}
                aria-label="Add new join key"
              >
                <FaPlus /> Add Join Key
              </button>
            </div>
          )}

          {activeTab === 'mapping' && (
            <div>
              <div style={{ display: 'flex', gap: '16px', height: '400px' }}>
                {/* Left Panel - Available Columns */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 600, color: '#025043', marginBottom: '6px' }}>
                      Available Columns ({availableColumns.length})
                    </div>
                    <input
                      type="text"
                      placeholder="Filter..."
                      value={leftPanelFilter}
                      onChange={(e) => setLeftPanelFilter(e.target.value)}
                      className="vm-input"
                      style={{ width: '100%', padding: '4px 8px', fontSize: '10px', fontFamily: 'Inter, sans-serif' }}
                    />
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
                    {filteredAvailableColumns.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '10px', fontFamily: 'Inter, sans-serif' }}>
                        {availableColumns.length === 0 ? 'All columns mapped' : 'No matching columns'}
                      </div>
                    ) : (
                      filteredAvailableColumns.map(col => (
                        <div
                          key={col.key}
                          onClick={() => toggleLeftPanelSelection(col.key)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '6px 8px',
                            cursor: 'pointer',
                            borderRadius: '3px',
                            marginBottom: '2px',
                            backgroundColor: leftPanelSelection.has(col.key) ? '#e0f2fe' : 'transparent',
                            border: leftPanelSelection.has(col.key) ? '1px solid #0284c7' : '1px solid transparent',
                            transition: 'all 0.15s'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={leftPanelSelection.has(col.key)}
                            onChange={() => {}}
                            style={{ marginRight: '8px', cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', color: '#1e293b' }}>
                              {col.name}
                            </div>
                            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '8px', color: '#6b7280' }}>
                              {toTitleCase(col.type || col.data_type || col.column_type || 'String')}
                              {(col.pii || col.contains_pii) && <span style={{ marginLeft: '4px', color: '#dc2626' }}>(PII)</span>}
                            </div>
                          </div>
                          <span style={{
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '8px',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            backgroundColor: col.sourceSide === 'left' ? '#dbeafe' : '#fef3c7',
                            color: col.sourceSide === 'left' ? '#1e40af' : '#92400e'
                          }}>
                            {col.sourceSide === 'left' ? (leftNodeName || 'Left') : (rightNodeName || 'Right')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Chevron Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', padding: '0 8px' }}>
                  <button
                    className="vm-btn vm-btn-secondary"
                    onClick={moveSelectedToMapped}
                    disabled={leftPanelSelection.size === 0}
                    style={{ padding: '8px 12px', fontSize: '12px' }}
                    title="Add selected columns to output"
                  >
                    <FaChevronRight />
                  </button>
                  <button
                    className="vm-btn vm-btn-secondary"
                    onClick={moveSelectedToAvailable}
                    disabled={rightPanelSelection.size === 0}
                    style={{ padding: '8px 12px', fontSize: '12px' }}
                    title="Remove selected columns from output"
                  >
                    <FaChevronLeft />
                  </button>
                  <button
                    className="vm-btn vm-btn-secondary"
                    onClick={moveAllToMapped}
                    disabled={availableColumns.length === 0}
                    style={{ padding: '8px 12px', fontSize: '12px' }}
                    title="Add all columns to output"
                  >
                    <FaAngleDoubleRight />
                  </button>
                  <button
                    className="vm-btn vm-btn-secondary"
                    onClick={moveAllToAvailable}
                    disabled={columnMappings.length === 0}
                    style={{ padding: '8px 12px', fontSize: '12px' }}
                    title="Remove all columns from output"
                  >
                    <FaAngleDoubleLeft />
                  </button>
                </div>

                {/* Right Panel - Mapped Columns (Output) */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', backgroundColor: '#f0fdf4', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 600, color: '#025043', marginBottom: '6px' }}>
                      Output Columns ({columnMappings.length})
                    </div>
                    <input
                      type="text"
                      placeholder="Filter..."
                      value={rightPanelFilter}
                      onChange={(e) => setRightPanelFilter(e.target.value)}
                      className="vm-input"
                      style={{ width: '100%', padding: '4px 8px', fontSize: '10px', fontFamily: 'Inter, sans-serif' }}
                    />
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
                    {filteredMappedColumns.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '10px', fontFamily: 'Inter, sans-serif' }}>
                        {columnMappings.length === 0 ? 'No columns mapped yet' : 'No matching columns'}
                      </div>
                    ) : (
                      filteredMappedColumns.map((mapping, idx) => {
                        const key = `${mapping.sourceSide}:${mapping.sourceColumn}`;
                        return (
                          <div
                            key={key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 8px',
                              borderRadius: '3px',
                              marginBottom: '2px',
                              backgroundColor: rightPanelSelection.has(key) ? '#dcfce7' : 'transparent',
                              border: rightPanelSelection.has(key) ? '1px solid #16a34a' : '1px solid transparent',
                              transition: 'all 0.15s',
                              cursor: 'pointer'
                            }}
                            onClick={() => toggleRightPanelSelection(key)}
                          >
                            <input
                              type="checkbox"
                              checked={rightPanelSelection.has(key)}
                              onChange={() => toggleRightPanelSelection(key)}
                              style={{ marginRight: '8px', cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', color: '#1e293b' }}>
                                {mapping.outputColumn || mapping.sourceColumn}
                              </div>
                              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '8px', color: '#6b7280' }}>
                                {toTitleCase(mapping.type || 'String')}
                                {mapping.pii && <span style={{ marginLeft: '4px', color: '#dc2626' }}>(PII)</span>}
                              </div>
                            </div>
                            <span style={{
                              fontFamily: 'Inter, sans-serif',
                              fontSize: '8px',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              backgroundColor: mapping.sourceSide === 'left' ? '#dbeafe' : '#fef3c7',
                              color: mapping.sourceSide === 'left' ? '#1e40af' : '#92400e'
                            }}>
                              {mapping.sourceSide === 'left' ? (leftNodeName || 'Left') : (rightNodeName || 'Right')}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="vm-section-title" style={{ marginTop: '16px' }}>Output Schema Preview</div>
              <div className="vm-schema-meta">
                <div className="vm-schema-meta-row">
                  <span className="vm-schema-label">Total Output Columns:</span>
                  <span className="vm-schema-value">{columnMappings.length}</span>
                </div>
                <div className="vm-schema-meta-row">
                  <span className="vm-schema-label">Columns:</span>
                  <span className="vm-schema-value" style={{ fontSize: '9px' }}>
                    {columnMappings.map(m => m.outputColumn || m.sourceColumn).join(', ') || 'None'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'schema' && (
            <div className="vm-schema-container">
              <div className="vm-schema-meta">
                <div className="vm-schema-meta-row">
                  <span className="vm-schema-label">Total Output Columns:</span>
                  <span className="vm-schema-value">{columnMappings.length}</span>
                </div>
                <div className="vm-schema-meta-row">
                  <span className="vm-schema-label">Left Source:</span>
                  <span className="vm-schema-value">{leftNodeName || 'Left Input'}</span>
                </div>
                <div className="vm-schema-meta-row">
                  <span className="vm-schema-label">Right Source:</span>
                  <span className="vm-schema-value">{rightNodeName || 'Right Input'}</span>
                </div>
              </div>

              <div className="vm-schema-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="vm-schema-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Column Name</th>
                      <th>Data Type</th>
                      <th>Nullable</th>
                      <th>Source</th>
                      <th>PII</th>
                      <th>DQ Rules</th>
                      <th>DQ Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columnMappings.length > 0 ? (
                      columnMappings.map((col, idx) => {
                        const isPII = col.pii || col.contains_pii || false;
                        const isNullable = col.nullable ?? true;
                        const dqRules = col.dqRules || [];
                        const dqStatus = col.dqStatus || null;
                        return (
                          <tr key={idx}>
                            <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                            <td className="vm-schema-col-name">{col.outputColumn || col.sourceColumn}</td>
                            <td className="vm-schema-col-type">{formatTypeWithPrecision(col.type, col.precision, col.scale)}</td>
                            <td className="vm-schema-col-nullable">
                              <span className={`vm-nullable-badge ${isNullable ? 'vm-nullable-yes' : 'vm-nullable-no'}`}>
                                {isNullable ? 'YES' : 'NO'}
                              </span>
                            </td>
                            <td style={{ fontSize: '9px', color: '#6b7280' }}>
                              {col.sourceSide === 'left' ? (leftNodeName || 'Left') : (rightNodeName || 'Right')}
                            </td>
                            <td className="vm-schema-col-pii">
                              <span className={`vm-pii-badge ${isPII ? 'vm-pii-yes' : 'vm-pii-no'}`}>
                                {isPII ? 'YES' : 'NO'}
                              </span>
                            </td>
                            <td>
                              {dqRules.length > 0 ? (
                                <span style={{ fontSize: '9px', color: '#6b7280' }}>
                                  {dqRules.map(r => r.name || r.rule_type).join(', ')}
                                </span>
                              ) : '—'}
                            </td>
                            <td>
                              {dqStatus === 'passed' && (
                                <span style={{ color: '#16a34a', fontSize: '9px', fontWeight: 500 }}>Passed</span>
                              )}
                              {dqStatus === 'failed' && (
                                <span style={{ color: '#dc2626', fontSize: '9px', fontWeight: 500 }}>Failed</span>
                              )}
                              {!dqStatus && '—'}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>
                          No columns mapped. Go to Mapping tab to add columns.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="vm-schema-note">
                <strong>Note:</strong> This tab shows a read-only summary of the join output schema. 
                Data types, PII settings, and DQ rules are inherited from upstream Expression nodes.
              </div>
            </div>
          )}
        </div>

        <div className="vm-modal-footer">
          <button onClick={onClose} className="vm-btn vm-btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="vm-btn vm-btn-primary">
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
JoinModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,

  initialConfig: PropTypes.shape({
    name: PropTypes.string,
    description: PropTypes.string,
    joinType: PropTypes.string,
    joinKeys: PropTypes.array,
    columnMappings: PropTypes.array
  }),

  leftSchema: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired
    })
  ),

  rightSchema: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired
    })
  ),

  leftNodeName: PropTypes.string,
  rightNodeName: PropTypes.string
};

export default JoinModal;
