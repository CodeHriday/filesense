import React, { useState, useEffect } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { FiArrowRight, FiTrash2, FiPlus, FiType, FiKey, FiEye, FiEyeOff } from 'react-icons/fi';
import './Transform.css';
import PropTypes from 'prop-types';

/**
 * Draggable source column component
 */
const SourceColumn = ({ column, isUsed }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'source-column',
    item: { column },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const getTypeIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'string':
      case 'text':
        return 'Aa';
      case 'number':
      case 'integer':
      case 'decimal':
        return '123';
      case 'date':
      case 'datetime':
        return '📅';
      case 'boolean':
        return 'T/F';
      default:
        return '?';
    }
  };

  return (
    <div 
      ref={drag}
      className={`source-column ${isUsed ? 'used' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      <div className="column-header">
        <span className="column-type-icon">{getTypeIcon(column.type)}</span>
        <span className="column-name">{column.name}</span>
      </div>
      <div className="column-meta">
        <span className="column-type">{column.type}</span>
        {column.nullable && <span className="nullable">nullable</span>}
      </div>
      <div className="column-stats">
        <span>Unique: {column.unique}</span>
        {column.missing > 0 && <span>Missing: {column.missing}</span>}
      </div>
    </div>
  );
};

/**
 * Drop zone for target columns
 */
const TargetColumn = ({ column, onUpdate, onDelete, onDrop, mapping }) => {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'source-column',
    drop: (item) => onDrop(item.column, column.id),
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(column.name);

  const handleNameChange = () => {
    if (editName.trim() && editName !== column.name) {
      onUpdate(column.id, { name: editName.trim() });
    }
    setIsEditing(false);
  };

  const handleTypeChange = (newType) => {
    onUpdate(column.id, { type: newType });
  };

  return (
    <div 
      ref={drop}
      className={`target-column ${isOver ? 'drag-over' : ''} ${mapping ? 'mapped' : ''}`}
    >
      <div className="column-header">
        {isEditing ? (
          <input 
            className="column-name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameChange}
            onKeyPress={(e) => e.key === 'Enter' && handleNameChange()}
            autoFocus
          />
        ) : (
          <span 
            className="column-name editable"
            onClick={() => setIsEditing(true)}
          >
            {column.name}
          </span>
        )}
        <button 
          className="delete-column"
          onClick={() => onDelete(column.id)}
          title="Remove column"
        >
          <FiTrash2 />
        </button>
      </div>
      
      <div className="column-type-selector">
        <select 
          value={column.type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="type-select"
        >
          <option value="string">Text</option>
          <option value="integer">Integer</option>
          <option value="decimal">Decimal</option>
          <option value="date">Date</option>
          <option value="datetime">DateTime</option>
          <option value="boolean">Boolean</option>
        </select>
      </div>

      {mapping ? (
        <div className="mapping-info">
          <div className="mapped-source">
            <FiArrowRight className="mapping-arrow" />
            <span>From: {mapping.sourceColumn.name}</span>
          </div>
          <div className="mapping-transformation">
            {mapping.transformation || 'Direct mapping'}
          </div>
        </div>
      ) : (
        <div className="drop-zone">
          Drop source column here
        </div>
      )}
    </div>
  );
};

/**
 * Main Column Mapper component with drag-and-drop functionality
 */
const ColumnMapper = ({ sourceSchema, targetSchema, mappings, onMappingsChange, onTargetSchemaChange }) => {
  const [localTargetSchema, setLocalTargetSchema] = useState(targetSchema || []);
  const [localMappings, setLocalMappings] = useState(mappings || []);
  const [nextColumnId, setNextColumnId] = useState(1);

  // Update local state when props change
  useEffect(() => {
    if (targetSchema && targetSchema.length > 0) {
      setLocalTargetSchema(targetSchema);
    }
  }, [targetSchema]);

  useEffect(() => {
    if (mappings && mappings.length > 0) {
      setLocalMappings(mappings);
    }
  }, [mappings]);

  // Do NOT initialize target schema - it should start empty
  // User will manually map columns from source to target

  // Sync with parent component - only when data actually changes
  useEffect(() => {
    if (JSON.stringify(targetSchema) !== JSON.stringify(localTargetSchema)) {
      onTargetSchemaChange(localTargetSchema);
    }
  }, [localTargetSchema]);

  useEffect(() => {
    if (JSON.stringify(mappings) !== JSON.stringify(localMappings)) {
      onMappingsChange(localMappings);
    }
  }, [localMappings]);

  const handleDrop = (sourceColumn, targetColumnId) => {
    const newMapping = {
      id: `mapping_${Date.now()}`,
      sourceColumn,
      targetColumnId,
      transformation: 'direct'
    };

    // Remove any existing mapping for this target column
    const filteredMappings = localMappings.filter(m => m.targetColumnId !== targetColumnId);
    setLocalMappings([...filteredMappings, newMapping]);
  };

  const addTargetColumn = () => {
    const newColumn = {
      id: `target_${nextColumnId}`,
      name: `new_column_${nextColumnId}`,
      type: 'string',
      nullable: true
    };
    setLocalTargetSchema([...localTargetSchema, newColumn]);
    setNextColumnId(nextColumnId + 1);
  };

  const updateTargetColumn = (columnId, updates) => {
    setLocalTargetSchema(prev => 
      prev.map(col => col.id === columnId ? { ...col, ...updates } : col)
    );
  };

  const deleteTargetColumn = (columnId) => {
    setLocalTargetSchema(prev => prev.filter(col => col.id !== columnId));
    setLocalMappings(prev => prev.filter(mapping => mapping.targetColumnId !== columnId));
  };

  const getMappingForTarget = (targetColumnId) => {
    return localMappings.find(mapping => mapping.targetColumnId === targetColumnId);
  };

  const isSourceColumnUsed = (sourceColumn) => {
    return localMappings.some(mapping => mapping.sourceColumn.name === sourceColumn.name);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="column-mapper">
        <div className="mapper-header">
          <h2>Map Columns</h2>
          <p>Drag source columns to target columns to create mappings. Target columns are editable.</p>
        </div>

        <div className="mapping-workspace">
          {/* Source Schema */}
          <div className="source-panel">
            <div className="panel-header">
              <h3>Source Columns</h3>
              <span className="column-count">{sourceSchema.length} columns</span>
            </div>
            <div className="columns-list">
              {sourceSchema.map(column => (
                <SourceColumn 
                  key={column.name}
                  column={column}
                  isUsed={isSourceColumnUsed(column)}
                />
              ))}
            </div>
          </div>

          {/* Mapping Arrow */}
          <div className="mapping-indicator">
            <FiArrowRight className="large-arrow" />
            <span>Drag & Drop</span>
          </div>

          {/* Target Schema */}
          <div className="target-panel">
            <div className="panel-header">
              <h3>Target Columns</h3>
              <span className="column-count">{localTargetSchema.length} columns</span>
              <button className="btn btn-sm btn-primary" onClick={addTargetColumn}>
                <FiPlus /> Add Column
              </button>
            </div>
            <div className="columns-list">
              {localTargetSchema.map(column => (
                <TargetColumn 
                  key={column.id}
                  column={column}
                  mapping={getMappingForTarget(column.id)}
                  onUpdate={updateTargetColumn}
                  onDelete={deleteTargetColumn}
                  onDrop={handleDrop}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Mapping Summary */}
        {localMappings.length > 0 && (
          <div className="mapping-summary">
            <h3>Column Mappings ({localMappings.length})</h3>
            <div className="mappings-list">
              {localMappings.map(mapping => {
                const targetColumn = localTargetSchema.find(col => col.id === mapping.targetColumnId);
                return (
                  <div key={mapping.id} className="mapping-item">
                    <span className="source-col">{mapping.sourceColumn.name}</span>
                    <FiArrowRight className="mapping-arrow" />
                    <span className="target-col">{targetColumn?.name}</span>
                    <span className="transformation-type">{mapping.transformation}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DndProvider>
  );
};

export default ColumnMapper;

// PropTypes for subcomponents
SourceColumn.propTypes = {
  column: PropTypes.shape({
    name: PropTypes.string.isRequired,
    type: PropTypes.string,
    nullable: PropTypes.bool,
    unique: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    missing: PropTypes.number
  }).isRequired,
  isUsed: PropTypes.bool
};

TargetColumn.propTypes = {
  column: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    type: PropTypes.string,
    nullable: PropTypes.bool
  }).isRequired,
  onUpdate: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onDrop: PropTypes.func.isRequired,
  mapping: PropTypes.shape({
    sourceColumn: PropTypes.shape({ name: PropTypes.string }).isRequired,
    transformation: PropTypes.string
  })
};

ColumnMapper.propTypes = {
  sourceSchema: PropTypes.arrayOf(
    PropTypes.shape({ name: PropTypes.string.isRequired, type: PropTypes.string, nullable: PropTypes.bool })
  ),
  targetSchema: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired, name: PropTypes.string.isRequired, type: PropTypes.string })
  ),
  mappings: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string.isRequired, sourceColumn: PropTypes.object.isRequired, targetColumnId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired, transformation: PropTypes.string })
  ),
  onMappingsChange: PropTypes.func.isRequired,
  onTargetSchemaChange: PropTypes.func.isRequired
};

ColumnMapper.defaultProps = {
  sourceSchema: [],
  targetSchema: [],
  mappings: [],
  onMappingsChange: () => {},
  onTargetSchemaChange: () => {}
};