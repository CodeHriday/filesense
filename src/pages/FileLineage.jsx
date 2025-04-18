import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  FiFileText, FiArrowRight, FiPlus, FiTrash2, FiLink, FiActivity
} from 'react-icons/fi';
import { 
  DndContext, 
  useSensor, 
  useSensors, 
  PointerSensor,
  MouseSensor,
  TouchSensor,
  DragOverlay,
  closestCenter 
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import Card from '../components/Card';
import { getFileCatalog } from '../api/fileService';
import { getLineages, createLineage, deleteLineage } from '../api/lineageService';
import { formatDate, formatBytes } from '../utils/formatters';
import './FileLineage.css';

// Draggable file card component
const DraggableFile = ({ file, isOverlay = false }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: file.file_id,
    data: {
      type: 'file',
      file
    }
  });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: 'grab',
    opacity: isOverlay ? 0.8 : 1
  };
  
  const fileTypeIcon = () => {
    switch (file.file_type) {
      case 'csv':
        return '📊';
      case 'json':
        return '📋';
      case 'parquet':
        return '📦';
      default:
        return '📄';
    }
  };
  
  return (
    <div 
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`draggable-file ${isOverlay ? 'is-overlay' : ''}`}
    >
      <div className="file-icon">{fileTypeIcon()}</div>
      <div className="file-info">
        <div className="file-name" title={file.filename}>{file.filename}</div>
        <div className="file-meta">
          <span>{file.file_type.toUpperCase()}</span>
          <span>{formatBytes(file.file_size)}</span>
        </div>
      </div>
    </div>
  );
};

// Droppable target zone component
const DropTarget = ({ onDrop, label, index, className = '' }) => {
  const [isOver, setIsOver] = useState(false);
  
  return (
    <div 
      className={`drop-target ${className} ${isOver ? 'is-over' : ''}`}
      data-index={index}
      onDragEnter={() => setIsOver(true)}
      onDragLeave={() => setIsOver(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const fileId = e.dataTransfer.getData('text/plain');
        onDrop(fileId, index);
      }}
    >
      <div className="drop-label">{label}</div>
      <div className="drop-icon"><FiArrowRight /></div>
    </div>
  );
};

// Line connecting source to target
const ConnectionLine = ({ startElement, endElement }) => {
  const [path, setPath] = useState('');
  
  useEffect(() => {
    if (!startElement || !endElement) return;
    
    const updatePath = () => {
      const startRect = startElement.getBoundingClientRect();
      const endRect = endElement.getBoundingClientRect();
      
      // Calculate center points
      const startX = startRect.left + startRect.width;
      const startY = startRect.top + startRect.height / 2;
      const endX = endRect.left;
      const endY = endRect.top + endRect.height / 2;
      
      setPath(`M ${startX} ${startY} C ${startX + 50} ${startY}, ${endX - 50} ${endY}, ${endX} ${endY}`);
    };
    
    updatePath();
    window.addEventListener('resize', updatePath);
    
    return () => {
      window.removeEventListener('resize', updatePath);
    };
  }, [startElement, endElement]);
  
  return (
    <svg className="connection-svg">
      <path d={path} stroke="#3498db" strokeWidth="2" fill="none" />
    </svg>
  );
};

// Lineage relationship component
const LineageRelationship = ({ relationship, onDelete }) => {
  return (
    <div className="lineage-relationship">
      <div className="lineage-source">
        <span className="file-type-badge">{relationship.source_file_type.toUpperCase()}</span>
        <span className="file-name">{relationship.source_filename}</span>
      </div>
      <div className="lineage-arrow">
        <div className="relationship-type">{relationship.relationship_type}</div>
        <FiArrowRight />
      </div>
      <div className="lineage-target">
        <span className="file-type-badge">{relationship.target_file_type.toUpperCase()}</span>
        <span className="file-name">{relationship.target_filename}</span>
      </div>
      <button 
        className="delete-relationship" 
        onClick={() => onDelete(relationship.id)}
        title="Delete relationship"
      >
        <FiTrash2 />
      </button>
    </div>
  );
};

function FileLineage() {
  const [files, setFiles] = useState([]);
  const [lineages, setLineages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [targetFile, setTargetFile] = useState(null);
  const [relationshipType, setRelationshipType] = useState('derives_from');
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(MouseSensor)
  );
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [filesData, lineagesData] = await Promise.all([
          getFileCatalog(),
          getLineages()
        ]);
        
        setFiles(filesData);
        setLineages(lineagesData);
        setError(null);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };
  
  const handleDragEnd = (event) => {
    setActiveId(null);
    
    const { active, over } = event;
    
    if (!over) return;
    
    const activeData = active.data.current;
    const overData = over.data.current;
    
    if (activeData?.type === 'file') {
      const droppedFile = activeData.file;
      
      // Determine if this is source or target based on the drop target
      const dropZone = over.id;
      
      if (dropZone === 'source-drop') {
        setSourceFile(droppedFile);
      } else if (dropZone === 'target-drop') {
        setTargetFile(droppedFile);
      }
    }
  };
  
  const handleCreateRelationship = async () => {
    if (!sourceFile || !targetFile) {
      alert('Please select both source and target files.');
      return;
    }
    
    if (sourceFile.file_id === targetFile.file_id) {
      alert('Source and target files must be different.');
      return;
    }
    
    try {
      const newLineage = await createLineage({
        source_file_id: sourceFile.file_id,
        target_file_id: targetFile.file_id,
        relationship_type: relationshipType,
        transformation_details: {}
      });
      
      // Add the file names to the new lineage for display
      const enrichedLineage = {
        ...newLineage,
        source_filename: sourceFile.filename,
        target_filename: targetFile.filename,
        source_file_type: sourceFile.file_type,
        target_file_type: targetFile.file_type
      };
      
      setLineages([enrichedLineage, ...lineages]);
      
      // Reset form
      setSourceFile(null);
      setTargetFile(null);
      setRelationshipType('derives_from');
    } catch (err) {
      console.error('Error creating lineage relationship:', err);
      alert('Failed to create relationship. Please try again.');
    }
  };
  
  const handleDeleteRelationship = async (id) => {
    if (!confirm('Are you sure you want to delete this relationship?')) return;
    
    try {
      await deleteLineage(id);
      setLineages(lineages.filter(lineage => lineage.id !== id));
    } catch (err) {
      console.error('Error deleting lineage relationship:', err);
      alert('Failed to delete relationship. Please try again.');
    }
  };
  
  const handleClearSource = () => setSourceFile(null);
  const handleClearTarget = () => setTargetFile(null);
  
  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner"></div>
        <p>Loading lineage data...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="error-message">
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }
  
  return (
    <div className="file-lineage-container">
      <div className="page-header">
        <h1>File Lineage Mapper</h1>
        <p className="page-description">
          Visualize and manage relationships between your data files.
          Drag and drop files to create lineage relationships.
        </p>
      </div>
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="lineage-mapper">
          <Card className="files-section">
            <h2>Available Files</h2>
            <div className="files-list">
              {files.length === 0 ? (
                <div className="empty-files">
                  <p>No files available. Upload files to create lineage relationships.</p>
                  <Link to="/upload" className="btn btn-primary">
                    <FiPlus className="btn-icon" /> Upload Files
                  </Link>
                </div>
              ) : (
                files.map(file => (
                  <DraggableFile key={file.file_id} file={file} />
                ))
              )}
            </div>
          </Card>
          
          <Card className="mapping-section">
            <h2>Create Relationship</h2>
            <div className="mapping-builder">
              <div className="source-target-container">
                <div className="drop-container">
                  <label>Source File</label>
                  {sourceFile ? (
                    <div className="selected-file">
                      <div className="file-type-badge">{sourceFile.file_type.toUpperCase()}</div>
                      <div className="file-name">{sourceFile.filename}</div>
                      <button className="clear-file" onClick={handleClearSource}>×</button>
                    </div>
                  ) : (
                    <div 
                      className="drop-zone"
                      id="source-drop"
                      data-target="source"
                    >
                      <FiFileText className="drop-icon" />
                      <p>Drag source file here</p>
                    </div>
                  )}
                </div>
                
                <div className="relationship-config">
                  <label htmlFor="relationshipType">Relationship:</label>
                  <select 
                    id="relationshipType" 
                    value={relationshipType}
                    onChange={(e) => setRelationshipType(e.target.value)}
                  >
                    <option value="derives_from">Derives From</option>
                    <option value="transforms_to">Transforms To</option>
                    <option value="extends">Extends</option>
                    <option value="replaces">Replaces</option>
                    <option value="aggregates">Aggregates</option>
                    <option value="splits_into">Splits Into</option>
                  </select>
                </div>
                
                <div className="drop-container">
                  <label>Target File</label>
                  {targetFile ? (
                    <div className="selected-file">
                      <div className="file-type-badge">{targetFile.file_type.toUpperCase()}</div>
                      <div className="file-name">{targetFile.filename}</div>
                      <button className="clear-file" onClick={handleClearTarget}>×</button>
                    </div>
                  ) : (
                    <div 
                      className="drop-zone"
                      id="target-drop"
                      data-target="target"
                    >
                      <FiFileText className="drop-icon" />
                      <p>Drag target file here</p>
                    </div>
                  )}
                </div>
              </div>
              
              <button 
                className="btn btn-primary create-relationship-btn"
                onClick={handleCreateRelationship}
                disabled={!sourceFile || !targetFile}
              >
                <FiPlus className="btn-icon" /> Create Relationship
              </button>
            </div>
          </Card>
          
          <DragOverlay>
            {activeId ? (
              <DraggableFile 
                file={files.find(file => file.file_id === activeId)}
                isOverlay
              />
            ) : null}
          </DragOverlay>
        </div>
      </DndContext>
      
      <Card className="lineage-section">
        <h2>Existing Relationships</h2>
        <div className="lineage-list">
          {lineages.length === 0 ? (
            <div className="empty-relationships">
              <FiLink className="empty-icon" />
              <p>No relationships defined yet. Create your first file lineage relationship above.</p>
            </div>
          ) : (
            lineages.map(relationship => (
              <LineageRelationship 
                key={relationship.id} 
                relationship={relationship}
                onDelete={handleDeleteRelationship}
              />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

export default FileLineage;