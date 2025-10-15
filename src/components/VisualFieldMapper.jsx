import React, { useCallback, useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FiPlus, FiTrash2, FiEdit } from 'react-icons/fi';
import './VisualFieldMapper.css';

const TRANSFORMATION_PARAMS = {
  'null-to-value': [{ name: 'value', type: 'text', placeholder: 'Replacement value' }],
  'coalesce': [{ name: 'column2', type: 'text', placeholder: 'Second column name' }],
  'SUBSTRING': [
    { name: 'start', type: 'number', placeholder: 'Start position' },
    { name: 'length', type: 'number', placeholder: 'Length' }
  ],
  'REPLACE': [
    { name: 'find', type: 'text', placeholder: 'Find text' },
    { name: 'replace', type: 'text', placeholder: 'Replace with' }
  ],
  'concat': [
    { name: 'column2', type: 'text', placeholder: 'Second column' },
    { name: 'separator', type: 'text', placeholder: 'Separator (optional)' }
  ],
  'ROUND': [{ name: 'decimals', type: 'number', placeholder: 'Decimal places' }],
  'add': [{ name: 'value', type: 'number', placeholder: 'Value to add' }],
  'subtract': [{ name: 'value', type: 'number', placeholder: 'Value to subtract' }],
  'multiply': [{ name: 'value', type: 'number', placeholder: 'Multiplier' }],
  'divide': [{ name: 'value', type: 'number', placeholder: 'Divisor' }],
  'date-format': [{ name: 'format', type: 'text', placeholder: 'e.g., YYYY-MM-DD' }],
};

const VisualFieldMapper = ({ schema, fieldMappings, onMappingsChange }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [newTargetName, setNewTargetName] = useState('');

  const transformationOptions = [
    { value: 'none', label: 'None (Direct Copy)', group: 'Basic' },
    { value: 'null-to-value', label: 'Replace Null', group: 'Null Handling' },
    { value: 'coalesce', label: 'Coalesce', group: 'Null Handling' },
    { value: 'UPPER', label: 'UPPERCASE', group: 'String' },
    { value: 'LOWER', label: 'lowercase', group: 'String' },
    { value: 'TRIM', label: 'Trim Whitespace', group: 'String' },
    { value: 'SUBSTRING', label: 'Substring', group: 'String' },
    { value: 'REPLACE', label: 'Find & Replace', group: 'String' },
    { value: 'concat', label: 'Concatenate', group: 'String' },
    { value: 'ROUND', label: 'Round', group: 'Numeric' },
    { value: 'FLOOR', label: 'Floor', group: 'Numeric' },
    { value: 'CEIL', label: 'Ceiling', group: 'Numeric' },
    { value: 'add', label: 'Add', group: 'Numeric' },
    { value: 'subtract', label: 'Subtract', group: 'Numeric' },
    { value: 'multiply', label: 'Multiply', group: 'Numeric' },
    { value: 'divide', label: 'Divide', group: 'Numeric' },
    { value: 'date-format', label: 'Format Date', group: 'Date/Time' },
    { value: 'current-date', label: 'Current Date', group: 'Date/Time' },
    { value: 'cast-string', label: 'To String', group: 'Type Cast' },
    { value: 'cast-integer', label: 'To Integer', group: 'Type Cast' },
    { value: 'cast-float', label: 'To Float', group: 'Type Cast' },
  ];

  useEffect(() => {
    if (!schema || schema.length === 0) return;

    // Create source nodes from schema
    const sourceNodes = schema.map((field, index) => ({
      id: `source-${field.name}`,
      type: 'input',
      data: { 
        label: (
          <div className="field-node">
            <div className="field-name">{field.name}</div>
            <div className="field-type">{field.type}</div>
          </div>
        )
      },
      position: { x: 50, y: 100 + index * 80 },
      sourcePosition: 'right',
    }));

    // Create target nodes from existing mappings
    const targetFieldsSet = new Set();
    (fieldMappings || []).forEach(mapping => {
      if (mapping.target_field) {
        targetFieldsSet.add(mapping.target_field);
      }
    });

    const targetFields = Array.from(targetFieldsSet);
    const targetNodes = targetFields.map((fieldName, index) => ({
      id: `target-${fieldName}`,
      type: 'output',
      data: { 
        label: (
          <div className="field-node">
            <div className="field-name">{fieldName}</div>
            <div className="field-type">target</div>
          </div>
        )
      },
      position: { x: 600, y: 100 + index * 80 },
      targetPosition: 'left',
    }));

    setNodes([...sourceNodes, ...targetNodes]);

    // Create edges from existing mappings
    if (fieldMappings && fieldMappings.length > 0) {
      const initialEdges = fieldMappings
        .filter(mapping => mapping.source_field && mapping.target_field)
        .map((mapping, index) => ({
          id: `edge-${mapping.source_field}-${mapping.target_field}`,
          source: `source-${mapping.source_field}`,
          target: `target-${mapping.target_field}`,
          type: 'smoothstep',
          animated: true,
          label: mapping.transformation !== 'none' ? mapping.transformation : '',
          data: {
            transformation: mapping.transformation || 'none',
            params: mapping.transformation_params || {}
          },
          style: { stroke: '#4F46E5', strokeWidth: 2 }
        }));
      setEdges(initialEdges);
    }
  }, [schema, fieldMappings]);

  const onConnect = useCallback(
    (params) => {
      const sourceField = params.source.replace('source-', '');
      const targetField = params.target.replace('target-', '');
      
      const newEdge = {
        ...params,
        id: `edge-${sourceField}-${targetField}`,
        type: 'smoothstep',
        animated: true,
        data: { transformation: 'none', params: {} },
        style: { stroke: '#4F46E5', strokeWidth: 2 }
      };

      setEdges((eds) => addEdge(newEdge, eds));

      const updatedMappings = [
        ...(fieldMappings || []),
        {
          source_field: sourceField,
          target_field: targetField,
          transformation: 'none',
          transformation_params: {}
        }
      ];
      onMappingsChange(updatedMappings);
    },
    [fieldMappings, onMappingsChange, setEdges]
  );

  const onEdgeClick = (event, edge) => {
    setSelectedEdge(edge);
  };

  const updateEdgeTransformation = (transformation) => {
    if (!selectedEdge) return;

    const updatedEdges = edges.map(edge => {
      if (edge.id === selectedEdge.id) {
        return {
          ...edge,
          label: transformation !== 'none' ? transformation : '',
          data: { ...edge.data, transformation, params: {} }
        };
      }
      return edge;
    });

    setEdges(updatedEdges);
    setSelectedEdge({...selectedEdge, data: { transformation, params: {} }});

    const sourceField = selectedEdge.source.replace('source-', '');
    const targetField = selectedEdge.target.replace('target-', '');

    const updatedMappings = (fieldMappings || []).map(mapping => {
      if (mapping.source_field === sourceField && mapping.target_field === targetField) {
        return { ...mapping, transformation, transformation_params: {} };
      }
      return mapping;
    });

    onMappingsChange(updatedMappings);
  };

  const updateTransformationParam = (paramName, paramValue) => {
    if (!selectedEdge) return;

    const newParams = { ...selectedEdge.data.params, [paramName]: paramValue };

    const updatedEdges = edges.map(edge => {
      if (edge.id === selectedEdge.id) {
        return {
          ...edge,
          data: { ...edge.data, params: newParams }
        };
      }
      return edge;
    });

    setEdges(updatedEdges);
    setSelectedEdge({...selectedEdge, data: { ...selectedEdge.data, params: newParams }});

    const sourceField = selectedEdge.source.replace('source-', '');
    const targetField = selectedEdge.target.replace('target-', '');

    const updatedMappings = (fieldMappings || []).map(mapping => {
      if (mapping.source_field === sourceField && mapping.target_field === targetField) {
        return { ...mapping, transformation_params: newParams };
      }
      return mapping;
    });

    onMappingsChange(updatedMappings);
  };

  const deleteEdge = () => {
    if (!selectedEdge) return;

    setEdges(edges.filter(edge => edge.id !== selectedEdge.id));

    const sourceField = selectedEdge.source.replace('source-', '');
    const targetField = selectedEdge.target.replace('target-', '');

    const updatedMappings = (fieldMappings || []).filter(
      mapping => !(mapping.source_field === sourceField && mapping.target_field === targetField)
    );

    onMappingsChange(updatedMappings);
    setSelectedEdge(null);
  };

  const addNewTargetField = () => {
    if (!newTargetName.trim()) return;

    const targetNodeId = `target-${newTargetName}`;
    
    // Check if target already exists
    if (nodes.find(n => n.id === targetNodeId)) {
      alert('Target field already exists');
      return;
    }

    const newTargetNode = {
      id: targetNodeId,
      type: 'output',
      data: { 
        label: (
          <div className="field-node">
            <div className="field-name">{newTargetName}</div>
            <div className="field-type">custom</div>
          </div>
        )
      },
      position: { x: 600, y: 100 + nodes.filter(n => n.type === 'output').length * 80 },
      targetPosition: 'left',
    };

    setNodes([...nodes, newTargetNode]);
    setNewTargetName('');
  };

  return (
    <div className="visual-field-mapper">
      <div className="mapper-toolbar">
        <div className="toolbar-section">
          <h3>Visual Field Mapping</h3>
          <p>Drag from source fields (left) to target fields (right) to create mappings</p>
        </div>
        <div className="toolbar-actions">
          <input
            type="text"
            className="form-control-sm"
            value={newTargetName}
            onChange={(e) => setNewTargetName(e.target.value)}
            placeholder="New target field name"
            style={{ marginRight: '0.5rem', width: '180px' }}
          />
          <button className="btn btn-sm" onClick={addNewTargetField}>
            <FiPlus /> Add Target Field
          </button>
        </div>
      </div>

      <div className="mapper-container">
        <div className="mapper-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {selectedEdge && (
          <div className="transformation-panel">
            <div className="panel-header">
              <h4>Connection Transformation</h4>
              <button className="btn-icon" onClick={() => setSelectedEdge(null)}>
                ×
              </button>
            </div>
            <div className="panel-body">
              <div className="connection-info">
                <strong>From:</strong> {selectedEdge.source.replace('source-', '')}
                <br />
                <strong>To:</strong> {selectedEdge.target.replace('target-', '')}
              </div>

              <div className="form-group">
                <label>Apply Transformation</label>
                <select
                  className="form-control"
                  value={selectedEdge.data?.transformation || 'none'}
                  onChange={(e) => updateEdgeTransformation(e.target.value)}
                >
                  {transformationOptions.reduce((acc, option) => {
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

              {/* Transformation Parameters */}
              {selectedEdge.data?.transformation && 
               TRANSFORMATION_PARAMS[selectedEdge.data.transformation] && (
                <div className="transformation-params-section">
                  <h5><FiEdit /> Parameters</h5>
                  {TRANSFORMATION_PARAMS[selectedEdge.data.transformation].map(param => (
                    <div key={param.name} className="form-group">
                      <label>{param.name}</label>
                      <input
                        type={param.type}
                        className="form-control-sm"
                        value={selectedEdge.data.params[param.name] || ''}
                        onChange={(e) => updateTransformationParam(param.name, e.target.value)}
                        placeholder={param.placeholder}
                      />
                    </div>
                  ))}
                </div>
              )}

              <button className="btn btn-danger btn-block" onClick={deleteEdge}>
                <FiTrash2 /> Remove Connection
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mapping-summary">
        <h4>Current Mappings ({edges.length})</h4>
        <div className="mappings-list">
          {edges.map((edge) => (
            <div key={edge.id} className="mapping-item">
              <span className="mapping-source">{edge.source.replace('source-', '')}</span>
              {edge.label && <span className="mapping-transform">[{edge.label}]</span>}
              <span className="mapping-arrow">→</span>
              <span className="mapping-target">{edge.target.replace('target-', '')}</span>
            </div>
          ))}
          {edges.length === 0 && (
            <p className="no-mappings">No field mappings yet. Drag from source to target to create connections.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default VisualFieldMapper;
