import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiPlus, 
  FiEdit2, 
  FiTrash2, 
  FiDownload, 
  FiLink, 
  FiSettings, 
  FiEdit, 
  FiCalendar, 
  FiHash, 
  FiType, 
  FiServer,
  FiGrid,
  FiFilter,
  FiLayers,
  FiArrowRight,
  FiXCircle,
  FiCode,
  FiExternalLink
} from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
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
import { useAuth } from '../context/AuthContext';
import './Mappings.css';

function JoinPanel({ files, selectedFile, sourceFileId, onAddJoin, onClose }) {
  const [joinType, setJoinType] = useState('inner');
  const [joinFileId, setJoinFileId] = useState('');
  const [leftKey, setLeftKey] = useState('');
  const [rightKey, setRightKey] = useState('');
  const [joinFileColumns, setJoinFileColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [leftKeyCandidates, setLeftKeyCandidates] = useState([]);
  const [rightKeyCandidates, setRightKeyCandidates] = useState([]);

  useEffect(() => {
    if (selectedFile && selectedFile.columns) {
      setLeftKeyCandidates(selectedFile.columns.map(col => col.column_name));
    }
  }, [selectedFile]);

  const handleJoinFileChange = async (fileId) => {
    setJoinFileId(fileId);
    setRightKey('');
    
    if (!fileId) {
      setJoinFileColumns([]);
      setRightKeyCandidates([]);
      return;
    }
    
    try {
      setLoading(true);
      const response = await axios.get(`/api/files/${fileId}`);
      
      if (response.data && response.data.columns) {
        setJoinFileColumns(response.data.columns);
        setRightKeyCandidates(response.data.columns.map(col => col.column_name));
      } else {
        setJoinFileColumns([]);
        setRightKeyCandidates([]);
      }
    } catch (err) {
      console.error('Error fetching join file columns:', err);
      setJoinFileColumns([]);
      setRightKeyCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!joinFileId || !leftKey || !rightKey) {
      alert('Please select all required fields to create a join.');
      return;
    }
    
    const joinConfig = {
      id: `join-${Date.now()}`,
      joinType,
      sourceFileId,
      joinFileId,
      leftKey,
      rightKey,
      joinName: files.find(f => f.file_id === joinFileId)?.filename || 'Unknown file'
    };
    
    onAddJoin(joinConfig);
    onClose();
  };

  return (
    <div className="transform-panel">
      <div className="transform-panel-header">
        <h3>Configure File Join</h3>
        <button type="button" className="close-button" onClick={onClose}>×</button>
      </div>
      
      <div className="transform-panel-body">
        <div className="transform-field">
          <label>Join Type</label>
          <select 
            value={joinType}
            onChange={(e) => setJoinType(e.target.value)}
            className="form-control"
          >
            <option value="inner">Inner Join</option>
            <option value="left">Left Outer Join</option>
            <option value="right">Right Outer Join</option>
            <option value="full">Full Outer Join</option>
            <option value="lookup">Lookup (Value Replacement)</option>
          </select>
          <div className="field-help">
            {joinType === 'inner' && 'Returns rows when there is a match in both tables.'}
            {joinType === 'left' && 'Returns all rows from the left table, and matched rows from the right table.'}
            {joinType === 'right' && 'Returns all rows from the right table, and matched rows from the left table.'}
            {joinType === 'full' && 'Returns rows when there is a match in one of the tables.'}
            {joinType === 'lookup' && 'Replaces values from the source with matching values from another file.'}
          </div>
        </div>
        
        <div className="transform-field">
          <label>Join With File</label>
          <select
            value={joinFileId}
            onChange={(e) => handleJoinFileChange(e.target.value)}
            className="form-control"
          >
            <option value="">Select a file to join with...</option>
            {files
              .filter(file => file.file_id !== sourceFileId)
              .map(file => (
                <option key={file.file_id} value={file.file_id}>
                  {file.filename}
                </option>
            ))}
          </select>
        </div>
        
        {loading ? (
          <div className="loading-spinner">Loading join file details...</div>
        ) : (
          <>
            <div className="transform-field">
              <label>Join Key (Source File)</label>
              <select
                value={leftKey}
                onChange={(e) => setLeftKey(e.target.value)}
                className="form-control"
                disabled={!leftKeyCandidates.length}
              >
                <option value="">Select source column...</option>
                {leftKeyCandidates.map(colName => (
                  <option key={colName} value={colName}>{colName}</option>
                ))}
              </select>
            </div>
            
            <div className="transform-field">
              <label>Join Key (Join File)</label>
              <select
                value={rightKey}
                onChange={(e) => setRightKey(e.target.value)}
                className="form-control"
                disabled={!rightKeyCandidates.length}
              >
                <option value="">Select join column...</option>
                {rightKeyCandidates.map(colName => (
                  <option key={colName} value={colName}>{colName}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
      
      <div className="transform-panel-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button 
          type="button" 
          className="btn btn-primary" 
          onClick={handleSave}
          disabled={!joinFileId || !leftKey || !rightKey}
        >
          Add Join
        </button>
      </div>
    </div>
  );
}

function TransformationPanel({ column, onUpdate, onClose }) {
  const [name, setName] = useState(column.name);
  const [type, setType] = useState(column.type);
  const [transformation, setTransformation] = useState(column.transformation || 'none');
  const [transformConfig, setTransformConfig] = useState(column.transformConfig || {});
  const [param1, setParam1] = useState(column.transformConfig?.param1 || '');
  const [param2, setParam2] = useState(column.transformConfig?.param2 || '');
  const [sourceColumn2, setSourceColumn2] = useState(column.transformConfig?.sourceColumn2 || '');
  const [formula, setFormula] = useState(column.transformConfig?.formula || '');
  const [format, setFormat] = useState(column.transformConfig?.format || '');
  const [conditionValue, setConditionValue] = useState(column.transformConfig?.conditionValue || '');
  const [operator, setOperator] = useState(column.transformConfig?.operator || '=');
  const [trueValue, setTrueValue] = useState(column.transformConfig?.trueValue || '');
  const [falseValue, setFalseValue] = useState(column.transformConfig?.falseValue || '');

  const handleSave = () => {
    // Prepare transform config based on the transformation type
    let newConfig = {};
    
    switch(transformation) {
      case 'math':
        newConfig = { formula };
        break;
      case 'concat':
        newConfig = { sourceColumn2 };
        break;
      case 'substring':
        newConfig = { param1, param2 };
        break;
      case 'dateFormat':
        newConfig = { format };
        break;
      case 'conditional':
        newConfig = { operator, conditionValue, trueValue, falseValue };
        break;
      case 'uppercase':
      case 'lowercase':
      case 'trim':
      case 'round':
      case 'floor':
      case 'ceiling':
        // These transformations don't need additional config
        break;
      default:
        newConfig = {};
    }
    
    onUpdate({
      ...column,
      name,
      type,
      transformation,
      transformConfig: newConfig
    });
    
    onClose();
  };
  
  const renderTransformationFields = () => {
    switch(transformation) {
      case 'math':
        return (
          <div className="transform-field">
            <label>Formula:</label>
            <input 
              type="text" 
              value={formula} 
              onChange={(e) => setFormula(e.target.value)}
              placeholder="e.g., [column] * 2 + 10"
              className="form-control"
            />
            <div className="field-help">
              Use [columnName] to reference other columns. Operators: +, -, *, /, %, ^.
            </div>
          </div>
        );
        
      case 'concat':
        return (
          <div className="transform-field">
            <label>Concatenate with column:</label>
            <input 
              type="text" 
              value={sourceColumn2} 
              onChange={(e) => setSourceColumn2(e.target.value)}
              placeholder="Second column to concatenate with"
              className="form-control"
            />
          </div>
        );
        
      case 'substring':
        return (
          <>
            <div className="transform-field">
              <label>Start Position:</label>
              <input 
                type="number" 
                value={param1} 
                onChange={(e) => setParam1(e.target.value)}
                min="0"
                className="form-control"
              />
            </div>
            <div className="transform-field">
              <label>Length (optional):</label>
              <input 
                type="number" 
                value={param2} 
                onChange={(e) => setParam2(e.target.value)}
                min="0"
                className="form-control"
              />
            </div>
          </>
        );
        
      case 'dateFormat':
        return (
          <div className="transform-field">
            <label>Output Format:</label>
            <input 
              type="text" 
              value={format} 
              onChange={(e) => setFormat(e.target.value)}
              placeholder="e.g., YYYY-MM-DD"
              className="form-control"
            />
            <div className="field-help">
              Format options: YYYY (year), MM (month), DD (day), HH (hour), mm (minute), ss (second)
            </div>
          </div>
        );
        
      case 'conditional':
        return (
          <>
            <div className="transform-field">
              <label>Condition:</label>
              <div className="condition-row">
                <select 
                  value={operator} 
                  onChange={(e) => setOperator(e.target.value)}
                  className="form-control operator-select"
                >
                  <option value="=">=</option>
                  <option value="!=">!=</option>
                  <option value=">">&gt;</option>
                  <option value=">=">&gt;=</option>
                  <option value="<">&lt;</option>
                  <option value="<=">&lt;=</option>
                  <option value="contains">contains</option>
                  <option value="starts_with">starts with</option>
                  <option value="ends_with">ends with</option>
                </select>
                <input 
                  type="text" 
                  value={conditionValue} 
                  onChange={(e) => setConditionValue(e.target.value)}
                  placeholder="Compare value"
                  className="form-control"
                />
              </div>
            </div>
            <div className="transform-field">
              <label>Then:</label>
              <input 
                type="text" 
                value={trueValue} 
                onChange={(e) => setTrueValue(e.target.value)}
                placeholder="Value if condition is true"
                className="form-control"
              />
            </div>
            <div className="transform-field">
              <label>Else:</label>
              <input 
                type="text" 
                value={falseValue} 
                onChange={(e) => setFalseValue(e.target.value)}
                placeholder="Value if condition is false"
                className="form-control"
              />
            </div>
          </>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div className="transform-panel">
      <div className="transform-panel-header">
        <h3>Configure Transformation</h3>
        <button type="button" className="close-button" onClick={onClose}>×</button>
      </div>
      
      <div className="transform-panel-body">
        <div className="transform-field">
          <label>Column Name:</label>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            className="form-control"
          />
        </div>
        
        <div className="transform-field">
          <label>Data Type:</label>
          <select 
            value={type} 
            onChange={(e) => setType(e.target.value)}
            className="form-control"
          >
            <option value="string">String</option>
            <option value="number">Number</option>
            <option value="integer">Integer</option>
            <option value="float">Float</option>
            <option value="boolean">Boolean</option>
            <option value="date">Date</option>
            <option value="timestamp">Timestamp</option>
          </select>
        </div>
        
        <div className="transform-field">
          <label>Transformation:</label>
          <select 
            value={transformation} 
            onChange={(e) => setTransformation(e.target.value)}
            className="form-control"
          >
            <option value="none">None (Direct Mapping)</option>
            <optgroup label="String Transformations">
              <option value="uppercase">Convert to UPPERCASE</option>
              <option value="lowercase">Convert to lowercase</option>
              <option value="trim">Trim Whitespace</option>
              <option value="substring">Extract Substring</option>
              <option value="concat">Concatenate</option>
            </optgroup>
            <optgroup label="Numeric Transformations">
              <option value="round">Round</option>
              <option value="floor">Floor (Round Down)</option>
              <option value="ceiling">Ceiling (Round Up)</option>
              <option value="math">Math Formula</option>
            </optgroup>
            <optgroup label="Date Transformations">
              <option value="dateFormat">Format Date</option>
            </optgroup>
            <optgroup label="Logic Transformations">
              <option value="conditional">If-Then-Else</option>
            </optgroup>
          </select>
        </div>
        
        {renderTransformationFields()}
      </div>
      
      <div className="transform-panel-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={handleSave}>Apply Transformation</button>
      </div>
    </div>
  );
}

function SortableItem({ id, column, onRemove, onUpdate }) {
  const [showTransformPanel, setShowTransformPanel] = useState(false);
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
  
  const getTransformationLabel = () => {
    switch(column.transformation) {
      case 'none': return 'Direct Mapping';
      case 'uppercase': return 'UPPERCASE';
      case 'lowercase': return 'lowercase';
      case 'trim': return 'Trim';
      case 'substring': return 'Substring';
      case 'concat': return 'Concatenate';
      case 'round': return 'Round';
      case 'floor': return 'Floor';
      case 'ceiling': return 'Ceiling';
      case 'math': return 'Formula';
      case 'dateFormat': return 'Date Format';
      case 'conditional': return 'If-Then-Else';
      default: return 'Transform';
    }
  };
  
  const getTransformIcon = () => {
    switch(column.transformation) {
      case 'none': return null;
      case 'uppercase':
      case 'lowercase':
      case 'trim':
      case 'substring':
      case 'concat': return <FiType />;
      case 'round':
      case 'floor':
      case 'ceiling':
      case 'math': return <FiHash />;
      case 'dateFormat': return <FiCalendar />;
      case 'conditional': return <FiFilter />;
      default: return <FiSettings />;
    }
  };
  
  return (
    <>
      <div ref={setNodeRef} style={style} className="mapping-column" {...attributes} {...listeners}>
        <div className="mapping-column-info">
          <div className="mapping-column-name">{column.name}</div>
          <div className="mapping-column-type">{column.type}</div>
          {column.transformation !== 'none' && (
            <div className="mapping-column-transform">
              {getTransformIcon()}
              <span>{getTransformationLabel()}</span>
            </div>
          )}
        </div>
        <div className="mapping-column-actions">
          <button 
            className="mapping-column-edit" 
            onClick={(e) => {
              e.stopPropagation();
              setShowTransformPanel(true);
            }}
            title="Edit transformation"
          >
            <FiEdit />
          </button>
          <button 
            className="mapping-column-remove" 
            onClick={(e) => {
              e.stopPropagation();
              onRemove(id);
            }}
            title="Remove column"
          >
            <FiTrash2 />
          </button>
        </div>
      </div>
      
      {showTransformPanel && (
        <div className="transform-panel-overlay">
          <TransformationPanel 
            column={column} 
            onUpdate={(updatedColumn) => onUpdate(id, updatedColumn)}
            onClose={() => setShowTransformPanel(false)}
          />
        </div>
      )}
    </>
  );
}

function Mappings() {
  const { hasWritePermission } = useAuth();
  const navigate = useNavigate();
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
  const [joinFiles, setJoinFiles] = useState([]);
  const [showJoinPanel, setShowJoinPanel] = useState(false);
  const [selectedJoinFile, setSelectedJoinFile] = useState(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Added transformations state to store transformation data
  const [transformations, setTransformations] = useState([]);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        console.log('Fetching mappings and files data...');
        
        try {
          console.log('Fetching mappings...');
          const mappingsRes = await axios.get(`${API_BASE_URL}/api/mappings`);
          console.log('Mappings response:', mappingsRes.data);
          setMappings(mappingsRes.data || []);
        } catch (mappingsErr) {
          console.error('Error fetching mappings:', mappingsErr);
        }
        
        try {
          console.log('Fetching files...');
          const filesRes = await axios.get(`${API_BASE_URL}/api/files`);
          console.log('Files response:', filesRes.data);
          setFiles(filesRes.data || []);
        } catch (filesErr) {
          console.error('Error fetching files:', filesErr);
        }
        
        try {
          console.log('Fetching transformations...');
          const transformationsRes = await axios.get(`${API_BASE_URL}/api/transformations`);
          console.log('Transformations response:', transformationsRes.data);
          setTransformations(transformationsRes.data || []);
        } catch (transformationsErr) {
          console.error('Error fetching transformations:', transformationsErr);
          // Continue even if transformations fail to load
          setTransformations([]);
        }
        
        setError(null);
      } catch (err) {
        console.error('Error in fetchData:', err);
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
    setJoinFiles([]);
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
    
    if (mapping.mapping_config && mapping.mapping_config.joins) {
      setJoinFiles(mapping.mapping_config.joins);
    } else {
      setJoinFiles([]);
    }
    
    // Fetch source file columns
    handleSourceFileChange(mapping.source_file_id);
    
    setShowForm(true);
  };
  
  const handleDeleteMapping = async (id) => {
    if (window.confirm('Are you sure you want to delete this mapping?')) {
      try {
        await axios.delete(`${API_BASE_URL}/api/mappings/${id}`);
        setMappings(mappings.filter(mapping => mapping.id !== id));
      } catch (err) {
        console.error('Error deleting mapping:', err);
        alert('Failed to delete mapping. Please try again.');
      }
    }
  };
  
  const handleSourceFileChange = async (fileId) => {
    // First set the sourceFileId state
    setSourceFileId(fileId);
    
    if (!fileId) {
      setSourceColumns([]);
      return;
    }
    
    try {
      setSourceLoading(true);
      console.log('Fetching source file columns for fileId:', fileId);
      const response = await axios.get(`${API_BASE_URL}/api/files/${fileId}`);
      
      if (response.data && response.data.columns) {
        console.log('Received columns:', response.data.columns);
        setSourceColumns(response.data.columns.map(col => ({
          id: col.column_name,
          name: col.column_name,
          type: col.column_type || 'string' // Fixed column type property
        })));
      } else {
        console.log('No columns found in response:', response.data);
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
      transformation: 'none',
      transformConfig: {}
    }]);
  };
  
  const handleRemoveColumnMapping = (columnId) => {
    setTargetColumns(targetColumns.filter(col => col.id !== columnId));
  };
  
  const handleUpdateColumnMapping = (columnId, updatedColumn) => {
    setTargetColumns(targetColumns.map(col => 
      col.id === columnId ? updatedColumn : col
    ));
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
  
  const handleAddJoin = (joinConfig) => {
    setJoinFiles([...joinFiles, joinConfig]);
  };

  const handleRemoveJoin = (joinId) => {
    setJoinFiles(joinFiles.filter(join => join.id !== joinId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const mappingConfig = {
        columns: targetColumns.map(col => ({
          sourceId: col.sourceId,
          name: col.name,
          type: col.type,
          transformation: col.transformation || 'none',
          transformConfig: col.transformConfig || {}
        })),
        joins: joinFiles
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
          `${API_BASE_URL}/api/mappings/${currentMapping.id}`,
          mappingData
        );
        
        setMappings(mappings.map(map => 
          map.id === currentMapping.id ? response.data : map
        ));
      } else {
        // Create new mapping
        response = await axios.post(`${API_BASE_URL}/api/mappings`, mappingData);
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

  // Handler for opening a transformation in the Transformations page
  const handleOpenTransformation = (transformation) => {
    navigate(`/transformations?id=${transformation.id}`);
  };
  
  // Handler for editing a transformation
  const handleEditTransformation = (transformation) => {
    navigate(`/transformations?id=${transformation.id}&edit=true`);
  };
  
  // Handler for deleting a transformation
  const handleDeleteTransformation = async (id) => {
    if (window.confirm('Are you sure you want to delete this transformation?')) {
      try {
        await axios.delete(`${API_BASE_URL}/api/transformations/${id}`);
        setTransformations(transformations.filter(transformation => transformation.id !== id));
      } catch (err) {
        console.error('Error deleting transformation:', err);
        alert('Failed to delete transformation. Please try again.');
      }
    }
  };
  
  // Handler for creating a new transformation
  const handleCreateTransformation = () => {
    navigate('/transformations?new=true');
  };

  return (
    <div className="mappings-container">
      <div className="mappings-header">
        <h1>Data Transformations</h1>
        <div className="d-flex" style={{ visibility: 'hidden' }}>
          {/* Hidden placeholder for header alignment */}
          <button className="btn btn-primary">
            <FiPlus className="btn-icon" />
            Add Mapping
          </button>
        </div>
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
                  <>
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
                                      onUpdate={handleUpdateColumnMapping}
                                    />
                                  ))}
                                </div>
                              </SortableContext>
                            </DndContext>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mapping-joins">
                      <div className="joins-header">
                        <h3>File Joins</h3>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => setShowJoinPanel(true)}
                          disabled={sourceLoading}
                        >
                          <FiGrid className="btn-icon" />
                          Add Join
                        </button>
                      </div>
                      
                      {joinFiles.length === 0 ? (
                        <div className="joins-empty">
                          No file joins configured. Click "Add Join" to join data from another file.
                        </div>
                      ) : (
                        <div className="joins-list">
                          {joinFiles.map(join => (
                            <div key={join.id} className="join-item">
                              <div className="join-info">
                                <span className="join-type">{join.joinType.toUpperCase()} JOIN</span>
                                <span className="join-details">
                                  on <strong>{join.leftKey}</strong> = <strong>{join.rightKey}</strong>
                                </span>
                                <span className="join-file">
                                  with <strong>{join.joinName}</strong>
                                </span>
                              </div>
                              <button
                                type="button"
                                className="join-remove"
                                onClick={() => handleRemoveJoin(join.id)}
                                title="Remove join"
                              >
                                <FiTrash2 />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {showJoinPanel && (
                        <div className="transform-panel-overlay">
                          <JoinPanel
                            files={files}
                            selectedFile={{
                              file_id: sourceFileId,
                              columns: sourceColumns
                            }}
                            sourceFileId={sourceFileId}
                            onAddJoin={handleAddJoin}
                            onClose={() => setShowJoinPanel(false)}
                          />
                        </div>
                      )}
                    </div>
                  </>
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
          
          {!showForm && (
            <>
              {/* File Mappings Section */}
              <div className="section-header">
                <h2>File Mappings</h2>
                {hasWritePermission('mappings') && (
                  <button className="btn btn-sm btn-primary" onClick={handleAddMapping}>
                    <FiPlus className="btn-icon" />
                    Add Mapping
                  </button>
                )}
              </div>
              
              {mappings.length === 0 ? (
                <Card>
                  <div className="empty-state">
                    <FiLink className="empty-icon" />
                    <h2>No Mappings Configured</h2>
                    <p>
                      Create mappings to convert your data files between formats
                      and transform data during conversion.
                    </p>
                    {hasWritePermission('mappings') ? (
                      <button className="btn btn-primary" onClick={handleAddMapping}>
                        <FiPlus className="btn-icon" />
                        Create Your First Mapping
                      </button>
                    ) : (
                      <div className="permission-notice">
                        You don't have permission to create mappings
                      </div>
                    )}
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
                            disabled={!hasWritePermission('mappings')}
                          >
                            <FiDownload />
                          </button>
                          {hasWritePermission('mappings') && (
                            <>
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
                            </>
                          )}
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
                        <div className="mapping-detail">
                          <span className="detail-label">File Joins:</span>
                          <span className="detail-value">
                            {mapping.mapping_config && mapping.mapping_config.joins 
                              ? mapping.mapping_config.joins.length 
                              : 0}
                          </span>
                        </div>
                        {mapping.mapping_config && mapping.mapping_config.joins && mapping.mapping_config.joins.length > 0 && (
                          <div className="mapping-transforms">
                            <span className="transform-badge" title="This mapping contains file joins">
                              <FiGrid />
                              Join/Lookup
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="mapping-footer">
                        Created: {formatDate(mapping.created_at)}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
              
              {/* BlumeETL Section */}
              <div className="section-header transformations-header">
                <h2>Data Transformations with BlumeETL</h2>
                <a href="https://blume-etl.example.com" target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-primary">
                  <FiExternalLink className="btn-icon" />
                  Open BlumeETL
                </a>
              </div>
              
              <Card>
                <div className="empty-state">
                  <FiLayers className="empty-icon blume-etl-icon" />
                  <h2>BlumeETL Integration</h2>
                  <p>
                    We've moved all data transformation capabilities to BlumeETL, our dedicated ETL platform 
                    designed to handle complex transformations with advanced features and better performance.
                  </p>
                  <a href="https://blume-etl.example.com" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                    <FiExternalLink className="btn-icon" />
                    Open BlumeETL
                  </a>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Mappings;