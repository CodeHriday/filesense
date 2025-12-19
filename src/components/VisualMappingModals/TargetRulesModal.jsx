import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FaGripVertical } from 'react-icons/fa';
import FileBrowserModal from './FileBrowserModal';
import './MappingConfigModal.css';
import PropTypes from 'prop-types';


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
      <td className="vm-schema-col-type">{column.type || 'STRING'}</td>
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
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [validationError, setValidationError] = useState('');

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
      
      // Set output schema from upstream nodes
      if (outputSchema && outputSchema.length > 0) {
        setSchema({
          source: 'upstream',
          columns: outputSchema
        });
        // Initialize ordered columns with unique IDs
        // If initialConfig has savedColumnOrder, use that order
        const savedOrder = initialConfig.orderedColumns || [];
        if (savedOrder.length > 0) {
          // Merge saved order with current schema (handle new/removed columns)
          const schemaNames = new Set(outputSchema.map(c => c.name));
          const orderedFromSaved = savedOrder.filter(c => schemaNames.has(c.name));
          const savedNames = new Set(savedOrder.map(c => c.name));
          const newColumns = outputSchema.filter(c => !savedNames.has(c.name));
          setOrderedColumns([
            ...orderedFromSaved.map((col, idx) => ({ ...col, id: `col-${col.name}-${idx}` })),
            ...newColumns.map((col, idx) => ({ ...col, id: `col-${col.name}-${orderedFromSaved.length + idx}` }))
          ]);
        } else {
          setOrderedColumns(outputSchema.map((col, idx) => ({ ...col, id: `col-${col.name}-${idx}` })));
        }
      } else {
        setSchema(null);
        setOrderedColumns([]);
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
    if (active.id !== over?.id) {
      setOrderedColumns((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
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
      orderedColumns: orderedColumns.map(({ id, ...col }) => col)
    };
    onSave(config);
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
          
          {/* Schema Tab */}
          {activeTab === 'schema' && (
            <div className="vm-schema-container">
              {schema ? (
                <>
                  <div className="vm-schema-meta">
                    <div className="vm-schema-meta-row">
                      <span className="vm-schema-label">Source:</span>
                      <span className="vm-schema-value">Output from Upstream Nodes</span>
                    </div>
                    <div className="vm-schema-meta-row">
                      <span className="vm-schema-label">Total Columns:</span>
                      <span className="vm-schema-value">{orderedColumns.length}</span>
                    </div>
                    <div className="vm-schema-meta-row">
                      <span className="vm-schema-label">Selected:</span>
                      <span className="vm-schema-value">{selectedRows.size} columns</span>
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '8px', fontSize: '10px', fontFamily: 'Inter, sans-serif', color: '#6b7280' }}>
                    Drag rows to reorder output columns. Select multiple rows with checkboxes to move them together.
                  </div>
                  
                  <div className="vm-schema-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <table className="vm-schema-table">
                        <thead>
                          <tr>
                            <th style={{ width: '30px' }}>
                              <input
                                type="checkbox"
                                checked={selectedRows.size === orderedColumns.length && orderedColumns.length > 0}
                                onChange={toggleSelectAll}
                              />
                            </th>
                            <th style={{ width: '30px' }}></th>
                            <th style={{ width: '40px' }}>#</th>
                            <th>Column Name</th>
                            <th>Data Type</th>
                            <th>PII</th>
                            <th>DQ Rules</th>
                            <th>DQ Status</th>
                          </tr>
                        </thead>
                        <SortableContext items={orderedColumns.map(c => c.id)} strategy={verticalListSortingStrategy}>
                          <tbody>
                            {orderedColumns.length > 0 ? (
                              orderedColumns.map((col, idx) => (
                                <SortableSchemaRow
                                  key={col.id}
                                  column={col}
                                  index={idx}
                                  selectedRows={selectedRows}
                                  onToggleSelect={toggleRowSelect}
                                />
                              ))
                            ) : (
                              <tr>
                                <td colSpan="8" style={{ textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>
                                  No columns in schema
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </SortableContext>
                      </table>
                    </DndContext>
                  </div>
                  
                  <div className="vm-schema-note">
                    <strong>Note:</strong> This schema represents the data structure that will be written to the target. 
                    Drag rows to reorder output columns. Column properties (data type, PII, DQ rules) are set in upstream Expression nodes.
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
