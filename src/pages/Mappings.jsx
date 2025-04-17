import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiDownload, FiLink } from 'react-icons/fi';
import axios from 'axios';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Card from '../components/Card';
import { formatDate } from '../utils/formatters';
import './Mappings.css';

function SortableItem({ id, column, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  
  return (
    <div ref={setNodeRef} style={style} className="mapping-column" {...attributes} {...listeners}>
      <div className="mapping-column-name">{column.name}</div>
      <div className="mapping-column-type">{column.type}</div>
      <button className="mapping-column-remove" onClick={() => onRemove(id)}>
        <FiTrash2 />
      </button>
    </div>
  );
}

function Mappings() {
  const [mappings, setMappings] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [currentMapping, setCurrentMapping] = useState(null);
  
  // Form state
  const [mappingName, setMappingName] = useState('');
  const [sourceFileId, setSourceFileId] = useState('');
  const [targetFileType, setTargetFileType] = useState('csv');
  const [sourceColumns, setSourceColumns] = useState([]);
  const [targetColumns, setTargetColumns] = useState([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [mappingsRes, filesRes] = await Promise.all([
          axios.get('/api/mappings'),
          axios.get('/api/files')
        ]);
        
        setMappings(mappingsRes.data || []);
        setFiles(filesRes.data || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching mappings data:', err);
        setError('Failed to load mappings data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  const handleAddMapping = () => {
    setCurrentMapping(null);
    setMappingName('');
    setSourceFileId('');
    setTargetFileType('csv');
    setSourceColumns([]);
    setTargetColumns([]);
    setShowForm(true);
  };
  
  const handleEditMapping = (mapping) => {
    setCurrentMapping(mapping);
    setMappingName(mapping.mapping_name);
    setSourceFileId(mapping.source_file_id);
    setTargetFileType(mapping.target_file_type);
    
    if (mapping.mapping_config && mapping.mapping_config.columns) {
      setTargetColumns(mapping.mapping_config.columns);
    } else {
      setTargetColumns([]);
    }
    
    // Fetch source file columns
    handleSourceFileChange(mapping.source_file_id);
    
    setShowForm(true);
  };
  
  const handleDeleteMapping = async (id) => {
    if (window.confirm('Are you sure you want to delete this mapping?')) {
      try {
        await axios.delete(`/api/mappings/${id}`);
        setMappings(mappings.filter(mapping => mapping.id !== id));
      } catch (err) {
        console.error('Error deleting mapping:', err);
        alert('Failed to delete mapping. Please try again.');
      }
    }
  };
  
  const handleSourceFileChange = async (fileId) => {
    if (!fileId) {
      setSourceColumns([]);
      return;
    }
    
    try {
      setSourceLoading(true);
      const response = await axios.get(`/api/files/${fileId}`);
      
      if (response.data && response.data.columns) {
        setSourceColumns(response.data.columns.map(col => ({
          id: col.column_name,
          name: col.column_name,
          type: col.data_type
        })));
      } else {
        setSourceColumns([]);
      }
    } catch (err) {
      console.error('Error fetching source file columns:', err);
      setSourceColumns([]);
    } finally {
      setSourceLoading(false);
    }
  };
  
  const handleAddColumnMapping = (sourceColumn) => {
    // Add source column to target columns
    setTargetColumns([...targetColumns, { 
      id: `target-${Date.now()}`,
      sourceId: sourceColumn.id,
      name: sourceColumn.name,
      type: sourceColumn.type,
      transformation: 'none'
    }]);
  };
  
  const handleRemoveColumnMapping = (columnId) => {
    setTargetColumns(targetColumns.filter(col => col.id !== columnId));
  };
  
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (active.id !== over.id) {
      setTargetColumns((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const mappingConfig = {
        columns: targetColumns.map(col => ({
          sourceId: col.sourceId,
          name: col.name,
          type: col.type,
          transformation: col.transformation || 'none'
        }))
      };
      
      const mappingData = {
        mapping_name: mappingName,
        source_file_id: sourceFileId,
        target_file_type: targetFileType,
        mapping_config: mappingConfig
      };
      
      let response;
      
      if (currentMapping) {
        // Update existing mapping
        response = await axios.put(
          `/api/mappings/${currentMapping.id}`,
          mappingData
        );
        
        setMappings(mappings.map(map => 
          map.id === currentMapping.id ? response.data : map
        ));
      } else {
        // Create new mapping
        response = await axios.post('/api/mappings', mappingData);
        setMappings([...mappings, response.data]);
      }
      
      setShowForm(false);
    } catch (err) {
      console.error('Error saving mapping:', err);
      alert('Failed to save mapping. Please try again.');
    }
  };
  
  const handleRunConversion = (mappingId) => {
    // In a real app, this would trigger a conversion job using the mapping
    alert(`Conversion started for mapping ID: ${mappingId}`);
  };

  return (
    <div className="mappings-container">
      <div className="mappings-header">
        <h1>File Mappings</h1>
        <button className="btn btn-primary" onClick={handleAddMapping}>
          <FiPlus className="btn-icon" />
          Add Mapping
        </button>
      </div>
      
      {loading ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading mappings...</p>
        </div>
      ) : error ? (
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {showForm && (
            <Card className="mapping-form-card">
              <h2>{currentMapping ? 'Edit Mapping' : 'Create Mapping'}</h2>
              <form onSubmit={handleSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="mappingName">Mapping Name</label>
                    <input
                      type="text"
                      id="mappingName"
                      className="form-control"
                      value={mappingName}
                      onChange={(e) => setMappingName(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="targetFileType">Target File Type</label>
                    <select
                      id="targetFileType"
                      className="form-control"
                      value={targetFileType}
                      onChange={(e) => setTargetFileType(e.target.value)}
                    >
                      <option value="csv">CSV</option>
                      <option value="json">JSON</option>
                      <option value="parquet">Parquet</option>
                      <option value="excel">Excel</option>
                    </select>
                  </div>
                </div>
                
                <div className="form-group">
                  <label htmlFor="sourceFileId">Source File</label>
                  <select
                    id="sourceFileId"
                    className="form-control"
                    value={sourceFileId}
                    onChange={(e) => handleSourceFileChange(e.target.value)}
                    required
                  >
                    <option value="">Select a source file...</option>
                    {files.map(file => (
                      <option key={file.file_id} value={file.file_id}>
                        {file.filename}
                      </option>
                    ))}
                  </select>
                </div>
                
                {sourceFileId && (
                  <div className="mapping-builder">
                    <div className="mapping-columns-container">
                      <div className="mapping-source-columns">
                        <h3>Source Columns</h3>
                        {sourceLoading ? (
                          <div className="column-loading">Loading columns...</div>
                        ) : sourceColumns.length === 0 ? (
                          <div className="column-empty">No columns available.</div>
                        ) : (
                          <div className="column-list">
                            {sourceColumns.map(column => (
                              <div key={column.id} className="source-column">
                                <div className="source-column-name">{column.name}</div>
                                <div className="source-column-type">{column.type}</div>
                                <button 
                                  className="source-column-add" 
                                  onClick={() => handleAddColumnMapping(column)}
                                  type="button"
                                >
                                  <FiPlus />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div className="mapping-arrow">
                        <FiLink />
                      </div>
                      
                      <div className="mapping-target-columns">
                        <h3>Target Columns</h3>
                        {targetColumns.length === 0 ? (
                          <div className="column-empty">
                            No columns mapped yet. Add columns from the source.
                          </div>
                        ) : (
                          <DndContext 
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                          >
                            <SortableContext 
                              items={targetColumns.map(col => col.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              <div className="column-list">
                                {targetColumns.map(column => (
                                  <SortableItem 
                                    key={column.id} 
                                    id={column.id} 
                                    column={column}
                                    onRemove={handleRemoveColumnMapping}
                                  />
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="form-actions">
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {currentMapping ? 'Update Mapping' : 'Create Mapping'}
                  </button>
                </div>
              </form>
            </Card>
          )}
          
          {mappings.length === 0 && !showForm ? (
            <Card>
              <div className="empty-state">
                <FiLink className="empty-icon" />
                <h2>No Mappings Configured</h2>
                <p>
                  Create mappings to convert your data files between formats
                  and transform data during conversion.
                </p>
                <button className="btn btn-primary" onClick={handleAddMapping}>
                  <FiPlus className="btn-icon" />
                  Create Your First Mapping
                </button>
              </div>
            </Card>
          ) : (
            <div className="mappings-grid">
              {mappings.map(mapping => (
                <Card key={mapping.id} className="mapping-card">
                  <div className="mapping-header">
                    <div className="mapping-title">
                      <h3>{mapping.mapping_name}</h3>
                    </div>
                    <div className="mapping-actions">
                      <button 
                        className="action-button" 
                        title="Run Conversion"
                        onClick={() => handleRunConversion(mapping.id)}
                      >
                        <FiDownload />
                      </button>
                      <button 
                        className="action-button" 
                        title="Edit Mapping"
                        onClick={() => handleEditMapping(mapping)}
                      >
                        <FiEdit2 />
                      </button>
                      <button 
                        className="action-button delete-button" 
                        title="Delete Mapping"
                        onClick={() => handleDeleteMapping(mapping.id)}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>
                  <div className="mapping-content">
                    <div className="mapping-detail">
                      <span className="detail-label">Source:</span>
                      <span className="detail-value">
                        {mapping.source_filename || 'Unknown'}
                      </span>
                    </div>
                    <div className="mapping-detail">
                      <span className="detail-label">Target Type:</span>
                      <span className="detail-value">
                        {mapping.target_file_type.toUpperCase()}
                      </span>
                    </div>
                    <div className="mapping-detail">
                      <span className="detail-label">Columns Mapped:</span>
                      <span className="detail-value">
                        {mapping.mapping_config && mapping.mapping_config.columns 
                          ? mapping.mapping_config.columns.length 
                          : 0}
                      </span>
                    </div>
                  </div>
                  <div className="mapping-footer">
                    Created: {formatDate(mapping.created_at)}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Mappings;