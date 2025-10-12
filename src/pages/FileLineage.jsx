import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  FiDatabase, 
  FiLink, 
  FiTrash2, 
  FiInfo, 
  FiArrowRight, 
  FiGitBranch,
  FiActivity,
  FiMap
} from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import LineageGraph from '../components/LineageGraph';
import { getFileCatalog } from '../api/fileService';
import { getLineages, createLineage, deleteLineage } from '../api/lineageService';
import { DndContext, DragOverlay, useSensors, useSensor, PointerSensor } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import './FileLineage.css';
import '../components/LineageGraph.css';

// Component for a draggable file card
const FileCard = ({ file, draggable = true, isDragging = false }) => {
  return (
    <div 
      className={`file-card ${isDragging ? 'dragging' : ''}`} 
      data-file-id={file.file_id}
    >
      <div className="file-type-badge">{file.file_type}</div>
      <div className="file-name">{file.filename}</div>
      {!isDragging && (
        <div className="file-size">{(file.file_size / 1000).toFixed(1)} KB</div>
      )}
    </div>
  );
};

// Drop zone component
const DropZone = ({ title, file, icon, onDrop, onClear }) => {
  return (
    <div className={`drop-zone ${file ? 'has-file' : ''}`} data-droppable id={title.toLowerCase()}>
      {!file ? (
        <div className="empty-drop-zone">
          {React.cloneElement(icon, { className: 'drop-zone-icon' })}
          <div className="drop-zone-text">
            <span className="drop-zone-title">{title}</span>
            <span className="drop-zone-desc">Drag and drop a file here</span>
          </div>
        </div>
      ) : (
        <div className="filled-drop-zone">
          <div className="drop-zone-content">
            <FileCard file={file} draggable={false} />
          </div>
          <button className="clear-btn" onClick={onClear}>
            <FiTrash2 />
          </button>
        </div>
      )}
    </div>
  );
};

function FileLineage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [lineages, setLineages] = useState([]);
  const [sourceFile, setSourceFile] = useState(null);
  const [targetFile, setTargetFile] = useState(null);
  const [activeFile, setActiveFile] = useState(null);
  const [relationshipType, setRelationshipType] = useState('transforms');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Configure DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [filesData, lineageData] = await Promise.all([
          getFileCatalog(),
          getLineages()
        ]);
        
        setFiles(filesData);
        setLineages(lineageData);
        setError(null);
      } catch (err) {
        console.error('Error fetching lineage data:', err);
        setError('Failed to load files or lineage data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // Success message timeout
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [successMessage]);
  
  const handleDragStart = (event) => {
    const { active } = event;
    const fileId = active.id;
    const fileData = files.find(f => f.file_id === fileId);
    
    if (fileData) {
      setActiveFile(fileData);
    }
  };
  
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    setActiveFile(null);
    
    if (!over) return;
    
    const fileId = active.id;
    const dropZoneId = over.id;
    const fileData = files.find(f => f.file_id === fileId);
    
    if (!fileData) return;
    
    // Handle dropping into source or target zones
    if (dropZoneId === 'source') {
      setSourceFile(fileData);
    } else if (dropZoneId === 'target') {
      setTargetFile(fileData);
    }
  };
  
  const clearSourceFile = () => setSourceFile(null);
  const clearTargetFile = () => setTargetFile(null);
  
  const isCreateDisabled = !sourceFile || !targetFile || sourceFile.file_id === targetFile.file_id;
  
  const handleCreateRelationship = async () => {
    if (isCreateDisabled) return;
    
    try {
      const lineageData = {
        source_file_id: sourceFile.file_id,
        target_file_id: targetFile.file_id,
        relationship_type: relationshipType,
        transformation_details: {
          created_by: 'user',
          description: `${sourceFile.filename} ${relationshipType} ${targetFile.filename}`
        }
      };
      
      const newLineage = await createLineage(lineageData);
      
      // Update the lineages list
      setLineages(prev => [newLineage, ...prev]);
      
      // Show success message
      setSuccessMessage('Lineage relationship created successfully!');
      
      // Clear drop zones
      clearSourceFile();
      clearTargetFile();
    } catch (err) {
      console.error('Error creating lineage relationship:', err);
      setError('Failed to create lineage relationship. Please try again.');
    }
  };
  
  const handleDeleteLineage = async (id) => {
    try {
      await deleteLineage(id);
      
      // Update the lineages list
      setLineages(prev => prev.filter(l => l.id !== id));
      
      // Show success message
      setSuccessMessage('Lineage relationship deleted successfully!');
    } catch (err) {
      console.error('Error deleting lineage relationship:', err);
      setError('Failed to delete lineage relationship. Please try again.');
    }
  };
  
  const handleViewImpact = (fileId) => {
    navigate(`/lineage/impact/${fileId}`);
  };
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  return (
    <div className="lineage-container">
      <div className="page-header">
        <h1>File Lineage Mapper</h1>
        <p className="header-description">
          Create and manage relationships between files to track data lineage
        </p>
      </div>
      
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button 
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}
      
      {successMessage && (
        <div className="success-message">
          <p>{successMessage}</p>
        </div>
      )}
      
      <div className="lineage-content">
        <div className="lineage-mapping-section">
          <Card className="mapping-card">
            <h2>Create File Lineage</h2>
            <p className="section-description">
              Drag and drop files to establish relationships between them
            </p>
            
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToWindowEdges]}
            >
              <div className="drop-zones-container">
                <DropZone 
                  title="Source"
                  file={sourceFile}
                  icon={<FiDatabase />}
                  onClear={clearSourceFile}
                />
                
                <div className="relationship-selector">
                  <select
                    value={relationshipType}
                    onChange={(e) => setRelationshipType(e.target.value)}
                    className="relationship-select"
                  >
                    <option value="transforms">transforms</option>
                    <option value="aggregates">aggregates</option>
                    <option value="enriches">enriches</option>
                    <option value="filters">filters</option>
                    <option value="joins">joins</option>
                    <option value="derives_from">derives from</option>
                  </select>
                  <FiArrowRight className="arrow-icon" />
                </div>
                
                <DropZone 
                  title="Target"
                  file={targetFile}
                  icon={<FiDatabase />}
                  onClear={clearTargetFile}
                />
              </div>
              
              <DragOverlay>
                {activeFile ? <FileCard file={activeFile} isDragging={true} /> : null}
              </DragOverlay>
              
              <div className="create-lineage-actions">
                <button
                  className="btn btn-primary create-btn"
                  disabled={isCreateDisabled}
                  onClick={handleCreateRelationship}
                >
                  Create Relationship
                </button>
                
                {isCreateDisabled && sourceFile && targetFile && sourceFile.file_id === targetFile.file_id && (
                  <p className="validation-message">
                    Source and target files must be different
                  </p>
                )}
              </div>
            </DndContext>
          </Card>
        </div>
        
        <div className="files-and-lineages">
          <div className="available-files">
            <Card>
              <h2>Available Files</h2>
              <div className="file-list">
                {files.length === 0 ? (
                  <p className="empty-message">No files available. Upload files first.</p>
                ) : (
                  files.map(file => (
                    <div key={file.file_id} className="draggable-file">
                      <div data-draggable id={file.file_id}>
                        <FileCard file={file} />
                      </div>
                      <button 
                        className="impact-btn" 
                        onClick={() => handleViewImpact(file.file_id)}
                        title="View Impact Analysis"
                      >
                        <FiGitBranch />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
          
          <div className="lineage-relationships">
            <Card>
              <h2>Existing Relationships</h2>
              <div className="lineage-list">
                {lineages.length === 0 ? (
                  <p className="empty-message">No lineage relationships defined yet.</p>
                ) : (
                  lineages.map(lineage => (
                    <div key={lineage.id} className="lineage-item">
                      <div className="lineage-source">
                        {lineage.source_filename}
                        <span className="file-type-pill">{lineage.source_file_type}</span>
                      </div>
                      <div className="lineage-relation">
                        <span className="relation-type">{lineage.relationship_type}</span>
                        <FiArrowRight className="relation-arrow" />
                      </div>
                      <div className="lineage-target">
                        {lineage.target_filename}
                        <span className="file-type-pill">{lineage.target_file_type}</span>
                      </div>
                      <div className="lineage-actions">
                        <button 
                          className="delete-btn" 
                          onClick={() => handleDeleteLineage(lineage.id)}
                          title="Delete Relationship"
                        >
                          <FiTrash2 />
                        </button>
                        <button 
                          className="impact-btn" 
                          onClick={() => handleViewImpact(lineage.source_file_id)}
                          title="View Impact Analysis"
                        >
                          <FiGitBranch />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
      
      {/* Interactive Lineage Visualization Graph */}
      <Card className="lineage-visualization-card">
        <div className="card-header">
          <div className="header-title">
            <FiActivity className="header-icon" />
            <h2>Interactive Lineage Visualization</h2>
          </div>
          <p className="section-description">
            Visualize the relationships between files with this interactive graph
          </p>
        </div>
        {lineages.length === 0 ? (
          <div className="empty-graph-message">
            <FiMap className="empty-icon" />
            <p>Create lineage relationships to visualize them in the graph</p>
          </div>
        ) : (
          <LineageGraph onNodeClick={handleViewImpact} />
        )}
      </Card>
      
      <Card className="lineage-info-card">
        <div className="info-header">
          <FiInfo className="info-icon" />
          <h3>Understanding File Lineage</h3>
        </div>
        <p>
          File lineage tracks the relationships between data files, showing how data flows and transforms. 
          This helps with impact analysis, data governance, and troubleshooting.
        </p>
        <ul className="relationship-types">
          <li><strong>transforms:</strong> Data is processed from source to target with transformations</li>
          <li><strong>aggregates:</strong> Source data is summarized into the target</li>
          <li><strong>enriches:</strong> Target data includes source data plus additional information</li>
          <li><strong>filters:</strong> Target is a subset of source data</li>
          <li><strong>joins:</strong> Target combines source with other data</li>
          <li><strong>derives from:</strong> Target is based on or extracted from source</li>
        </ul>
      </Card>
    </div>
  );
}

export default FileLineage;