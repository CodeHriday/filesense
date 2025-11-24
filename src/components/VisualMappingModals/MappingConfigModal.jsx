import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './MappingConfigModal.css';

const MappingConfigModal = ({ isOpen, onClose, onSave, initialConfig = {} }) => {
  const [name, setName] = useState(initialConfig.name || '');
  const [description, setDescription] = useState(initialConfig.description || '');
  const [projectId, setProjectId] = useState(initialConfig.projectId || '');
  const [subProjectId, setSubProjectId] = useState(initialConfig.subProjectId || '');
  
  const [projects, setProjects] = useState([]);
  const [subProjects, setSubProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen]);
  
  useEffect(() => {
    if (projectId) {
      fetchSubProjects(projectId);
    } else {
      setSubProjects([]);
    }
  }, [projectId]);
  
  const fetchProjects = async () => {
    try {
      const response = await axios.get('/api/projects');
      setProjects(response.data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };
  
  const fetchSubProjects = async (pid) => {
    try {
      const response = await axios.get(`/api/projects/${pid}/sub-projects`);
      setSubProjects(response.data);
    } catch (error) {
      console.error('Error fetching subprojects:', error);
      setSubProjects([]);
    }
  };
  
  const handleSave = () => {
    const config = {
      name,
      description,
      projectId,
      subProjectId,
      projectName: projects.find(p => p.id === parseInt(projectId))?.name || '',
      subProjectName: subProjects.find(sp => sp.id === parseInt(subProjectId))?.name || ''
    };
    onSave(config);
    onClose();
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="vm-modal-overlay" onClick={onClose}>
      <div className="vm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-header">
          <h2>Mapping Configuration</h2>
          <button onClick={onClose} className="vm-modal-close">×</button>
        </div>
        
        <div className="vm-modal-body">
          <div className="vm-form-group">
            <label>Mapping Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter mapping name"
              className="vm-input"
            />
          </div>
          
          <div className="vm-form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description (optional)"
              className="vm-textarea"
              rows="3"
            />
          </div>
          
          <div className="vm-form-group">
            <label>Project *</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="vm-select"
            >
              <option value="">Select Project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          
          {projectId && subProjects.length > 0 && (
            <div className="vm-form-group">
              <label>Sub-Project</label>
              <select
                value={subProjectId}
                onChange={(e) => setSubProjectId(e.target.value)}
                className="vm-select"
              >
                <option value="">Select Sub-Project (Optional)</option>
                {subProjects.map(sp => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        
        <div className="vm-modal-footer">
          <button onClick={onClose} className="vm-btn vm-btn-secondary">
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            disabled={!name || !projectId}
            className="vm-btn vm-btn-primary"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default MappingConfigModal;
