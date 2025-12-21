import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FaGripVertical } from 'react-icons/fa';
import FileBrowserModal from './FileBrowserModal';
import './MappingConfigModal.css';
import PropTypes from 'prop-types';

let idCounter = 0;
const generateUniqueId = (prefix) => `${prefix}-${Date.now()}-${++idCounter}`;

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


const SortableSchemaRow = ({ column, index, selectedRows, onToggleSelect }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    backgroundColor: isDragging ? '#e0f2fe' : selectedRows.has(column.id) ? '#f0fdf4' : 'white',
    opacity: isDragging ? 0.8 : 1
  };

  const isPII = column.contains_pii || column.pii || false;
  const isNullable = column.nullable ?? true;
  const dqRules = column.dqRules || [];
  const dqStatus = column.dqStatus || null;

  return (
    <tr ref={setNodeRef} style={style}>
      <td style={{ width: '30px', textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={selectedRows.has(column.id)}
          onChange={() => onToggleSelect(column.id)}
        />
      </td>
      <td style={{ width: '30px', cursor: 'grab' }} {...attributes} {...listeners}>
        <FaGripVertical style={{ color: '#9ca3af' }} />
      </td>
      <td style={{ width: '40px', textAlign: 'center' }}>{index + 1}</td>
      <td className="vm-schema-col-name">{column.name}</td>
      <td className="vm-schema-col-type">{formatTypeWithPrecision(column.type, column.precision, column.scale)}</td>
      <td className="vm-schema-col-nullable">
        <span className={`vm-nullable-badge ${isNullable ? 'vm-nullable-yes' : 'vm-nullable-no'}`}>
          {isNullable ? 'YES' : 'NO'}
        </span>
      </td>
      <td className="vm-schema-col-pii">
        <span className={`vm-pii-badge ${isPII ? 'vm-pii-yes' : 'vm-pii-no'}`}>
          {isPII ? 'YES' : 'NO'}
        </span>
      </td>
      <td className="vm-schema-col-dq">
        {dqRules.length > 0 ? (
          <span style={{ fontSize: '9px', color: '#6b7280' }}>
            {dqRules.map(r => r.name || r.rule_type).join(', ')}
          </span>
        ) : '—'}
      </td>
      <td className="vm-schema-col-status">
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
};

SortableSchemaRow.propTypes = {
  column: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  selectedRows: PropTypes.instanceOf(Set).isRequired,
  onToggleSelect: PropTypes.func.isRequired
};

const SortableOutputRow = ({ column, index, selectedRows, onToggleSelect }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    backgroundColor: isDragging ? '#d1fae5' : selectedRows.has(column.id) ? '#dbeafe' : 'white',
    opacity: isDragging ? 0.8 : 1
  };

  return (
    <tr ref={setNodeRef} style={style}>
      <td style={{ padding: '4px' }}>
        <input
          type="checkbox"
          checked={selectedRows.has(column.id)}
          onChange={() => onToggleSelect(column.id)}
        />
      </td>
      <td style={{ padding: '4px', cursor: 'grab' }} {...attributes} {...listeners}>
        <FaGripVertical style={{ color: '#9ca3af', fontSize: '10px' }} />
      </td>
      <td style={{ padding: '4px', fontSize: '9px', color: '#6b7280' }}>{index + 1}</td>
      <td style={{ padding: '4px', fontFamily: 'monospace', fontSize: '10px' }}>{column.name}</td>
      <td style={{ padding: '4px', fontSize: '9px', color: '#6b7280' }}>{formatTypeWithPrecision(column.type, column.precision, column.scale)}</td>
    </tr>
  );
};

SortableOutputRow.propTypes = {
  column: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  selectedRows: PropTypes.instanceOf(Set).isRequired,
  onToggleSelect: PropTypes.func.isRequired
};


const TargetRulesModal = ({ isOpen, onClose, onSave, initialConfig = {}, projectId, outputSchema = null }) => {
  const [name, setName] = useState(initialConfig.name || '');
  const [description, setDescription] = useState(initialConfig.description || '');
  const [connectionId, setConnectionId] = useState(initialConfig.connectionId || '');
  const [filePath, setFilePath] = useState(initialConfig.filePath || '');
  const [fileName, setFileName] = useState(initialConfig.fileName || '');
  const [fileFormat, setFileFormat] = useState(initialConfig.fileFormat || 'csv');
  const [violationHandling, setViolationHandling] = useState(initialConfig.violationHandling || 'log_continue');
  const [selectedQualityRules, setSelectedQualityRules] = useState(initialConfig.selectedQualityRules || []);
  const [anomalyDetection, setAnomalyDetection] = useState(initialConfig.anomalyDetection || false);
  const [targetFileOwnerId, setTargetFileOwnerId] = useState(initialConfig.targetFileOwnerId || '');
  
  const [connections, setConnections] = useState([]);
  const [qualityRules, setQualityRules] = useState([]);
  const [datastewards, setDatastewards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('configuration');
  const [schema, setSchema] = useState(null);
  const [orderedColumns, setOrderedColumns] = useState([]);
  const [availableColumns, setAvailableColumns] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [selectedAvailableRows, setSelectedAvailableRows] = useState(new Set());
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [newColumnsCount, setNewColumnsCount] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );
  
  useEffect(() => {
    if (isOpen) {
      fetchConnections();
      if (projectId) {
        fetchQualityRules(projectId);
        fetchProjectDatastewards(projectId);
      }
      // Reset to configuration tab when modal opens
      setActiveTab('configuration');
      setValidationError('');
      setSelectedRows(new Set());
      setSelectedAvailableRows(new Set());
      
      // Set output schema from upstream nodes
      if (outputSchema && outputSchema.length > 0) {
        setSchema({
          source: 'upstream',
          columns: outputSchema
        });
        // Initialize ordered columns with stable IDs based on index
        // If initialConfig has orderedColumns (saved order by name), use that order - AUTHORITATIVE
        const savedOrderNames = initialConfig.orderedColumns || [];
        const schemaMap = new Map(outputSchema.map(c => [c.name, c]));
        const savedNameSet = new Set(savedOrderNames);
        
        if (savedOrderNames.length > 0) {
          // Saved config is authoritative - only include columns that were explicitly saved
          const orderedFromSaved = savedOrderNames
            .filter(name => schemaMap.has(name))
            .map(name => ({ ...schemaMap.get(name), id: generateUniqueId('col') }));
          setOrderedColumns(orderedFromSaved);
          
          // New columns go to available pool - NOT auto-appended
          const newCols = outputSchema
            .filter(c => !savedNameSet.has(c.name))
            .map(col => ({ ...col, id: generateUniqueId('avail') }));
          setAvailableColumns(newCols);
          // Only show "new columns" message for genuinely new upstream columns
          setNewColumnsCount(newCols.length);
        } else {
          // No saved config - all columns go to available (user must explicitly add)
          setOrderedColumns([]);
          setAvailableColumns(outputSchema.map(col => ({ ...col, id: generateUniqueId('avail') })));
          // First time setup - these aren't "new", they're just all available
          setNewColumnsCount(0);
        }
      } else {
        setSchema(null);
        setOrderedColumns([]);
        setAvailableColumns([]);
        setNewColumnsCount(0);
      }
    }
  }, [isOpen, projectId, outputSchema, initialConfig.orderedColumns]);
  
  const fetchConnections = async () => {
    try {
      const response = await axios.get('/api/connections');
      setConnections(response.data || []);
    } catch (error) {
      console.error('Error fetching connections:', error);
    }
  };
  
  const fetchQualityRules = async (pid) => {
    try {
      const response = await axios.get(`/api/quality-rules?project_id=${pid}`);
      setQualityRules(response.data?.rules || []);
    } catch (error) {
      console.error('Error fetching quality rules:', error);
      setQualityRules([]);
    }
  };
  
  const fetchProjectDatastewards = async (pid) => {
    try {
      // Fetch users who are data stewards and assigned to this project
      const response = await axios.get(`/api/projects/${pid}/members?role=data_steward`);
      setDatastewards(response.data.members || []);
    } catch (error) {
      console.error('Error fetching project data stewards:', error);
      // Fallback: fetch all data stewards
      try {
        const fallbackResponse = await axios.get('/api/users/data-stewards');
        setDatastewards(fallbackResponse.data.dataStewards || []);
      } catch (fallbackError) {
        console.error('Error fetching all data stewards:', fallbackError);
        setDatastewards([]);
      }
    }
  };
  
  const handleBrowse = () => {
    if (!connectionId) {
      alert('Please select a target connection first');
      return;
    }
    
    setFileBrowserOpen(true);
  };
  
  const handleFileBrowserSelect = (selection) => {
    setFilePath(selection.filePath);
    setFileName(selection.fileName);
  };
  
  const toggleQualityRule = (ruleId) => {
    setSelectedQualityRules(prev => {
      if (prev.includes(ruleId)) {
        return prev.filter(id => id !== ruleId);
      } else {
        return [...prev, ruleId];
      }
    });
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrderedColumns((items) => {
      const activeIndex = items.findIndex(i => i.id === active.id);
      const overIndex = items.findIndex(i => i.id === over.id);
      
      if (activeIndex === -1 || overIndex === -1) return items;

      if (selectedRows.has(active.id) && selectedRows.size > 1) {
        const selectedItems = items.filter(item => selectedRows.has(item.id));
        const remainingItems = items.filter(item => !selectedRows.has(item.id));
        
        if (remainingItems.length === 0) {
          return items;
        }
        
        const dragDirection = activeIndex < overIndex ? 'down' : 'up';
        
        let insertIndex;
        const overIsSelected = selectedRows.has(over.id);
        
        if (overIsSelected) {
          if (dragDirection === 'down') {
            let nearestBelow = null;
            for (let i = overIndex + 1; i < items.length; i++) {
              if (!selectedRows.has(items[i].id)) {
                nearestBelow = items[i];
                break;
              }
            }
            if (nearestBelow) {
              insertIndex = remainingItems.findIndex(item => item.id === nearestBelow.id);
            } else {
              insertIndex = remainingItems.length;
            }
          } else {
            let nearestAbove = null;
            for (let i = overIndex - 1; i >= 0; i--) {
              if (!selectedRows.has(items[i].id)) {
                nearestAbove = items[i];
                break;
              }
            }
            if (nearestAbove) {
              insertIndex = remainingItems.findIndex(item => item.id === nearestAbove.id) + 1;
            } else {
              insertIndex = 0;
            }
          }
        } else {
          const overIndexInRemaining = remainingItems.findIndex(item => item.id === over.id);
          insertIndex = dragDirection === 'down' ? overIndexInRemaining + 1 : overIndexInRemaining;
        }
        
        const result = [
          ...remainingItems.slice(0, insertIndex),
          ...selectedItems,
          ...remainingItems.slice(insertIndex)
        ];
        
        return result;
      } else {
        return arrayMove(items, activeIndex, overIndex);
      }
    });
  };

  const toggleRowSelect = (columnId) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnId)) {
        newSet.delete(columnId);
      } else {
        newSet.add(columnId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === orderedColumns.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(orderedColumns.map(c => c.id)));
    }
  };

  const toggleAvailableRowSelect = (columnId) => {
    setSelectedAvailableRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnId)) {
        newSet.delete(columnId);
      } else {
        newSet.add(columnId);
      }
      return newSet;
    });
  };

  const toggleSelectAllAvailable = () => {
    if (selectedAvailableRows.size === availableColumns.length) {
      setSelectedAvailableRows(new Set());
    } else {
      setSelectedAvailableRows(new Set(availableColumns.map(c => c.id)));
    }
  };

  const handleAddSelected = () => {
    if (selectedAvailableRows.size === 0) return;
    const toAdd = availableColumns.filter(c => selectedAvailableRows.has(c.id));
    const remaining = availableColumns.filter(c => !selectedAvailableRows.has(c.id));
    const newOrdered = [...orderedColumns, ...toAdd.map(col => ({
      ...col,
      id: generateUniqueId('col')
    }))];
    setOrderedColumns(newOrdered);
    setAvailableColumns(remaining);
    setSelectedAvailableRows(new Set());
  };

  const handleRemoveSelected = () => {
    if (selectedRows.size === 0) return;
    const toRemove = orderedColumns.filter(c => selectedRows.has(c.id));
    const remaining = orderedColumns.filter(c => !selectedRows.has(c.id));
    const newAvailable = [...availableColumns, ...toRemove.map(col => ({
      ...col,
      id: generateUniqueId('avail')
    }))];
    setOrderedColumns(remaining);
    setAvailableColumns(newAvailable);
    setSelectedRows(new Set());
  };

  const handleAddAll = () => {
    const newOrdered = [...orderedColumns, ...availableColumns.map(col => ({
      ...col,
      id: generateUniqueId('col')
    }))];
    setOrderedColumns(newOrdered);
    setAvailableColumns([]);
    setSelectedAvailableRows(new Set());
    setNewColumnsCount(0);
  };

  const handleRemoveAll = () => {
    const newAvailable = [...availableColumns, ...orderedColumns.map(col => ({
      ...col,
      id: generateUniqueId('avail')
    }))];
    setOrderedColumns([]);
    setAvailableColumns(newAvailable);
    setSelectedRows(new Set());
  };

  const handleRefreshFromUpstream = () => {
    if (!outputSchema || outputSchema.length === 0) return;
    const currentOrderedNames = new Set(orderedColumns.map(c => c.name));
    const currentAvailableNames = new Set(availableColumns.map(c => c.name));
    const newUpstream = outputSchema.filter(c => 
      !currentOrderedNames.has(c.name) && !currentAvailableNames.has(c.name)
    );
    if (newUpstream.length > 0) {
      const newAvailable = [...availableColumns, ...newUpstream.map(col => ({
        ...col,
        id: generateUniqueId('avail')
      }))];
      setAvailableColumns(newAvailable);
      setNewColumnsCount(prev => prev + newUpstream.length);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      setValidationError('Name is required');
      return;
    }
    if (!connectionId) {
      setValidationError('Target Connection is required');
      return;
    }
    if (!filePath.trim()) {
      setValidationError('File Path is required');
      return;
    }
    if (!fileName.trim()) {
      setValidationError('File Name is required');
      return;
    }
    
    setValidationError('');
    const selectedConnection = connections.find(c => c.id === parseInt(connectionId));
    const selectedOwner = datastewards.find(ds => ds.id === parseInt(targetFileOwnerId));
    const config = {
      name,
      description,
      connectionId,
      connectionName: selectedConnection?.name || '',
      connectionType: selectedConnection?.connection_type || '',
      filePath,
      fileName,
      fileFormat,
      violationHandling,
      selectedQualityRules,
      qualityRulesCount: selectedQualityRules.length,
      anomalyDetection,
      targetFileOwnerId,
      targetFileOwnerName: selectedOwner?.full_name || selectedOwner?.username || '',
      orderedColumns: orderedColumns.map(col => col.name)
    };
    try {
      onSave(config);
    } catch (error) {
      console.error('Error saving target configuration:', error);
    }
    onClose();
  };
  
  if (!isOpen) return null;
  
  // Show schema tab if schema is available
  const showSchemaTab = schema !== null;
  
  return (
    <div className="vm-modal-overlay">
      <div className="vm-modal vm-modal-large">
        <div className="vm-modal-header">
          <h2>Target Configuration</h2>
          <button onClick={onClose} className="vm-modal-close" aria-label="Close modal">×</button>
        </div>
        
        {/* Tab Navigation */}
        <div className="vm-tabs">
          <button 
            className={`vm-tab ${activeTab === 'configuration' ? 'vm-tab-active' : ''}`}
            onClick={() => setActiveTab('configuration')}
            aria-pressed={activeTab === 'configuration'}
            aria-label="Configuration tab"
          >
            Configuration
          </button>
          {showSchemaTab && (
            <button 
              className={`vm-tab ${activeTab === 'schema' ? 'vm-tab-active' : ''}`}
              onClick={() => setActiveTab('schema')}
              aria-pressed={activeTab === 'schema'}
              aria-label="Output Schema tab"
            >
              Output Schema
            </button>
          )}
        </div>
        
        <div className="vm-modal-body">
          {/* Configuration Tab */}
          {activeTab === 'configuration' && (
          <div className="vm-modal-body-scroll">
          {validationError && (
            <div className="vm-validation-error" role="alert" style={{ marginBottom: '16px', padding: '10px 12px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '4px', color: '#dc2626', fontSize: '13px' }}>
              {validationError}
            </div>
          )}
          <div className="vm-form-group">
            <label htmlFor="target-name-input">Name *</label>
            <input
              id="target-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name for this target rules configuration"
              className="vm-input"
              required
            />
          </div>
          
          <div className="vm-form-group">
            <label htmlFor="target-description">Description</label>
            <textarea
              id="target-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="vm-input"
              rows="2"
            />
          </div>
          
          <h3 className="vm-section-title">Target Destination</h3>
          
          {/* Target Connection - Full Width */}
          <div className="vm-form-group">
            <label htmlFor="target-connection-select">Target Connection *</label>
            <select
              id="target-connection-select"
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="vm-select"
            >
              <option value="">Select Connection</option>
              {connections.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.connection_type})
                </option>
              ))}
            </select>
          </div>
          
          {/* Row 1: File Path + File Name + Browse + File Format */}
          <div className="vm-form-row-four-cols">
            <div className="vm-form-group vm-form-group-no-margin">
              <label htmlFor="target-filepath-input">File Path *</label>
              <input
                id="target-filepath-input"
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="e.g., /data/processed/"
                className="vm-input"
              />
            </div>
            
            <div className="vm-form-group vm-form-group-no-margin">
              <label htmlFor="target-filename-input">File Name *</label>
              <input
                id="target-filename-input"
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="e.g., output.csv"
                className="vm-input"
              />
            </div>
            
            <div className="vm-form-group vm-form-group-no-margin vm-form-group-browse">
              <label htmlFor="target-browse-button" className="sr-only">Browse files</label>
              <button 
                id="target-browse-button"
                onClick={handleBrowse}
                disabled={!connectionId || loading}
                className="vm-btn vm-btn-browse"
                aria-label="Browse files in selected connection"
              >
                Browse
              </button>
            </div>
            
            <div className="vm-form-group vm-form-group-no-margin">
              <label htmlFor="target-fileformat-select">File Format</label>
              <select
                id="target-fileformat-select"
                value={fileFormat}
                onChange={(e) => setFileFormat(e.target.value)}
                className="vm-select"
              >
                <option value="csv">CSV</option>
                <option value="parquet">Parquet</option>
                <option value="json">JSON</option>
                <option value="xlsx">Excel (XLSX)</option>
              </select>
            </div>
          </div>
          
          {/* Target File Owner - Full Width */}
          <div className="vm-form-group">
            <label htmlFor="target-file-owner-select">Target File Owner</label>
            <select
              id="target-file-owner-select"
              value={targetFileOwnerId}
              onChange={(e) => setTargetFileOwnerId(e.target.value)}
              className="vm-select"
            >
              <option value="">Select File Owner (Optional)</option>
              {datastewards.map(ds => (
                <option key={ds.id} value={ds.id}>
                  {ds.full_name || ds.username}
                </option>
              ))}
            </select>
            <small className="vm-help-text">
              Data stewards assigned to this project
            </small>
          </div>
          
          <h3 className="vm-section-title">Anomaly Detection</h3>
          
          <div className="vm-form-group">
            <label htmlFor="anomaly-detection-checkbox" className="vm-checkbox-label">
              <input
                id="anomaly-detection-checkbox"
                type="checkbox"
                checked={anomalyDetection}
                onChange={(e) => setAnomalyDetection(e.target.checked)}
              />
              <span>Enable anomaly detection for numeric deviation, row count, and null spikes</span>
            </label>
          </div>
          </div>
          )}
          
          {/* Schema Tab - Dual List Picker */}
          {activeTab === 'schema' && (
            <div className="vm-schema-container">
              {schema ? (
                <>
                  <div className="vm-schema-meta" style={{ marginBottom: '12px' }}>
                    <div className="vm-schema-meta-row">
                      <span className="vm-schema-label">Source:</span>
                      <span className="vm-schema-value">Output from Upstream Nodes</span>
                    </div>
                    <div style={{ display: 'flex', gap: '24px', marginTop: '8px' }}>
                      <div className="vm-schema-meta-row">
                        <span className="vm-schema-label">Available:</span>
                        <span className="vm-schema-value">{availableColumns.length} columns</span>
                      </div>
                      <div className="vm-schema-meta-row">
                        <span className="vm-schema-label">Output:</span>
                        <span className="vm-schema-value">{orderedColumns.length} columns</span>
                      </div>
                    </div>
                    {newColumnsCount > 0 && (
                      <div style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '4px', fontSize: '10px', color: '#92400e' }}>
                        {newColumnsCount} new column{newColumnsCount > 1 ? 's' : ''} available from upstream. Use the arrow buttons to add them to output.
                      </div>
                    )}
                  </div>
                  
                  <div style={{ marginBottom: '8px', fontSize: '10px', fontFamily: 'Inter, sans-serif', color: '#6b7280' }}>
                    Select columns from Available and use arrow buttons to move them to Output. Drag rows in Output to reorder.
                  </div>
                  
                  {/* Dual List Picker */}
                  <div style={{ display: 'flex', gap: '12px', height: '360px' }}>
                    {/* Available Columns Panel */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: '11px', color: '#374151', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Available Columns ({availableColumns.length})</span>
                        <button
                          onClick={handleRefreshFromUpstream}
                          style={{ padding: '2px 8px', fontSize: '9px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '3px', cursor: 'pointer', color: '#374151' }}
                          title="Check for new columns from upstream"
                        >
                          Refresh
                        </button>
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
                        {availableColumns.length > 0 ? (
                          <table className="vm-schema-table" style={{ fontSize: '10px' }}>
                            <thead>
                              <tr>
                                <th style={{ width: '24px', padding: '4px' }}>
                                  <input
                                    type="checkbox"
                                    checked={selectedAvailableRows.size === availableColumns.length && availableColumns.length > 0}
                                    onChange={toggleSelectAllAvailable}
                                  />
                                </th>
                                <th style={{ padding: '4px' }}>Column Name</th>
                                <th style={{ padding: '4px' }}>Type</th>
                              </tr>
                            </thead>
                            <tbody>
                              {availableColumns.map((col) => (
                                <tr 
                                  key={col.id}
                                  style={{ backgroundColor: selectedAvailableRows.has(col.id) ? '#dbeafe' : 'white', cursor: 'pointer' }}
                                  onClick={() => toggleAvailableRowSelect(col.id)}
                                >
                                  <td style={{ padding: '4px' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedAvailableRows.has(col.id)}
                                      onChange={() => toggleAvailableRowSelect(col.id)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </td>
                                  <td style={{ padding: '4px', fontFamily: 'monospace', fontSize: '10px' }}>{col.name}</td>
                                  <td style={{ padding: '4px', fontSize: '9px', color: '#6b7280' }}>{formatTypeWithPrecision(col.type, col.precision, col.scale)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', fontSize: '10px' }}>
                            All columns added to output
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Arrow Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
                      <button
                        onClick={handleAddAll}
                        disabled={availableColumns.length === 0}
                        style={{ padding: '6px 10px', fontSize: '12px', backgroundColor: availableColumns.length > 0 ? '#3b82f6' : '#e5e7eb', color: availableColumns.length > 0 ? 'white' : '#9ca3af', border: 'none', borderRadius: '4px', cursor: availableColumns.length > 0 ? 'pointer' : 'not-allowed' }}
                        title="Add all columns"
                      >
                        &gt;&gt;
                      </button>
                      <button
                        onClick={handleAddSelected}
                        disabled={selectedAvailableRows.size === 0}
                        style={{ padding: '6px 10px', fontSize: '12px', backgroundColor: selectedAvailableRows.size > 0 ? '#3b82f6' : '#e5e7eb', color: selectedAvailableRows.size > 0 ? 'white' : '#9ca3af', border: 'none', borderRadius: '4px', cursor: selectedAvailableRows.size > 0 ? 'pointer' : 'not-allowed' }}
                        title="Add selected columns"
                      >
                        &gt;
                      </button>
                      <button
                        onClick={handleRemoveSelected}
                        disabled={selectedRows.size === 0}
                        style={{ padding: '6px 10px', fontSize: '12px', backgroundColor: selectedRows.size > 0 ? '#ef4444' : '#e5e7eb', color: selectedRows.size > 0 ? 'white' : '#9ca3af', border: 'none', borderRadius: '4px', cursor: selectedRows.size > 0 ? 'pointer' : 'not-allowed' }}
                        title="Remove selected columns"
                      >
                        &lt;
                      </button>
                      <button
                        onClick={handleRemoveAll}
                        disabled={orderedColumns.length === 0}
                        style={{ padding: '6px 10px', fontSize: '12px', backgroundColor: orderedColumns.length > 0 ? '#ef4444' : '#e5e7eb', color: orderedColumns.length > 0 ? 'white' : '#9ca3af', border: 'none', borderRadius: '4px', cursor: orderedColumns.length > 0 ? 'pointer' : 'not-allowed' }}
                        title="Remove all columns"
                      >
                        &lt;&lt;
                      </button>
                    </div>
                    
                    {/* Output Columns Panel */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', backgroundColor: '#ecfdf5', borderBottom: '1px solid #a7f3d0', fontWeight: 600, fontSize: '11px', color: '#065f46' }}>
                        Output Columns ({orderedColumns.length})
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                          {orderedColumns.length > 0 ? (
                            <table className="vm-schema-table" style={{ fontSize: '10px' }}>
                              <thead>
                                <tr>
                                  <th style={{ width: '24px', padding: '4px' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedRows.size === orderedColumns.length && orderedColumns.length > 0}
                                      onChange={toggleSelectAll}
                                    />
                                  </th>
                                  <th style={{ width: '24px', padding: '4px' }}></th>
                                  <th style={{ width: '30px', padding: '4px' }}>#</th>
                                  <th style={{ padding: '4px' }}>Column Name</th>
                                  <th style={{ padding: '4px' }}>Type</th>
                                </tr>
                              </thead>
                              <SortableContext items={orderedColumns.map(c => c.id)} strategy={verticalListSortingStrategy}>
                                <tbody>
                                  {orderedColumns.map((col, idx) => (
                                    <SortableOutputRow
                                      key={col.id}
                                      column={col}
                                      index={idx}
                                      selectedRows={selectedRows}
                                      onToggleSelect={toggleRowSelect}
                                    />
                                  ))}
                                </tbody>
                              </SortableContext>
                            </table>
                          ) : (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', fontSize: '10px' }}>
                              No columns selected for output. Add columns from the left panel.
                            </div>
                          )}
                        </DndContext>
                      </div>
                    </div>
                  </div>
                  
                  <div className="vm-schema-note" style={{ marginTop: '12px' }}>
                    <strong>Note:</strong> Only columns in the Output panel will be written to the target file. 
                    Column properties (data type, PII, DQ rules) are set in upstream Expression nodes.
                  </div>
                </>
              ) : (
                <div className="vm-empty-state">No schema available from upstream nodes</div>
              )}
            </div>
          )}
        </div>
        
        <div className="vm-modal-footer">
          <button onClick={onClose} className="vm-btn vm-btn-secondary">
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            disabled={!connectionId || !filePath || !fileName}
            className="vm-btn vm-btn-primary"
          >
            Save Configuration
          </button>
        </div>
      </div>
      
      {/* File Browser Modal */}
      {fileBrowserOpen && (
        <FileBrowserModal
          isOpen={fileBrowserOpen}
          onClose={() => setFileBrowserOpen(false)}
          onSelect={handleFileBrowserSelect}
          connectionId={connectionId}
          connectionName={connections.find(c => (c.id || c.connection_id) === connectionId)?.name || 'Connection'}
        />
      )}
    </div>
  );
};
TargetRulesModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  outputSchema: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      type: PropTypes.string,
      description: PropTypes.string,
      contains_pii: PropTypes.bool
    })
  ),
  initialConfig: PropTypes.shape({
    name: PropTypes.string,
    description: PropTypes.string,
    connectionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    filePath: PropTypes.string,
    fileName: PropTypes.string,
    fileFormat: PropTypes.string,
    violationHandling: PropTypes.string,
    selectedQualityRules: PropTypes.arrayOf(PropTypes.number),
    anomalyDetection: PropTypes.bool,
    targetFileOwnerId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    orderedColumns: PropTypes.array
  })
};

export default TargetRulesModal;
