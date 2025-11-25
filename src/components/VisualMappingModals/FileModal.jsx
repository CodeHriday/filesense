import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './MappingConfigModal.css';

const FileModal = ({ isOpen, onClose, onSave, initialConfig = {} }) => {
  const [projectId, setProjectId] = useState(initialConfig.projectId || '');
  const [subProjectId, setSubProjectId] = useState(initialConfig.subProjectId || '');
  const [fileId, setFileId] = useState(initialConfig.fileId || '');
  
  const [projects, setProjects] = useState([]);
  const [subProjects, setSubProjects] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('selection');
  const [schema, setSchema] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [selectedFileMetadata, setSelectedFileMetadata] = useState(null);
  
  // Initialize state from initialConfig when modal opens
  useEffect(() => {
    if (isOpen) {
      setProjectId(initialConfig.projectId || '');
      setSubProjectId(initialConfig.subProjectId || '');
      setFileId(initialConfig.fileId || '');
      
      fetchProjects();
      
      // Reset to selection tab when modal opens
      setActiveTab('selection');
      
      // Restore schema from saved config if available
      if (initialConfig.schema && initialConfig.schemaMetadata) {
        setSchema({
          columns: initialConfig.schema,
          ...initialConfig.schemaMetadata
        });
      }
      
      // Restore file metadata from saved config if available
      if (initialConfig.fileName) {
        setSelectedFileMetadata({
          file_name: initialConfig.fileName,
          file_path: initialConfig.filePath,
          file_size: initialConfig.fileSize,
          upload_date: initialConfig.uploadDate,
          file_format: initialConfig.fileFormat
        });
      }
    }
  }, [isOpen]);
  
  const fetchProjects = async () => {
    try {
      const response = await axios.get('/api/projects');
      setProjects(response.data || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
      setProjects([]);
    }
  };
  
  const fetchSubProjects = async (pid) => {
    if (!pid) {
      setSubProjects([]);
      return;
    }
    
    try {
      const response = await axios.get(`/api/projects/${pid}/sub-projects`);
      setSubProjects(response.data || []);
    } catch (error) {
      console.error('Error fetching sub-projects:', error);
      setSubProjects([]);
    }
  };
  
  const fetchFiles = async (pid, spid) => {
    if (!pid) {
      setFiles([]);
      return;
    }
    
    setLoading(true);
    try {
      let url = `/api/files?project_id=${pid}`;
      if (spid) {
        url += `&sub_project_id=${spid}`;
      }
      const response = await axios.get(url);
      setFiles(response.data.files || response.data || []);
    } catch (error) {
      console.error('Error fetching files:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchFileSchema = async (fid) => {
    if (!fid) {
      setSchema(null);
      return;
    }
    
    setSchemaLoading(true);
    try {
      const response = await axios.get(`/api/files/${fid}/schema`);
      if (response.data.success && response.data.schema) {
        setSchema({
          columns: response.data.schema.columns || [],
          file_type: response.data.schema.file_type || 'unknown',
          contains_pii: response.data.schema.contains_pii || false,
          data_classification: response.data.schema.data_classification || 'unclassified'
        });
        console.log('Fetched schema for file:', fid, response.data.schema);
      } else {
        setSchema(null);
      }
    } catch (error) {
      console.error('Error fetching file schema:', error);
      setSchema(null);
    } finally {
      setSchemaLoading(false);
    }
  };
  
  // Fetch sub-projects when project changes
  useEffect(() => {
    if (projectId) {
      fetchSubProjects(projectId);
      fetchFiles(projectId, subProjectId);
    } else {
      setSubProjects([]);
      setFiles([]);
      setSubProjectId('');
      setFileId('');
      setSchema(null);
      setSelectedFileMetadata(null);
    }
  }, [projectId]);
  
  // Fetch files when sub-project changes
  useEffect(() => {
    if (projectId) {
      fetchFiles(projectId, subProjectId);
    }
  }, [subProjectId]);
  
  // Fetch schema when file changes
  useEffect(() => {
    if (fileId) {
      const selectedFile = files.find(f => String(f.id) === String(fileId));
      if (selectedFile) {
        setSelectedFileMetadata(selectedFile);
        fetchFileSchema(fileId);
      }
    } else {
      setSelectedFileMetadata(null);
      setSchema(null);
    }
  }, [fileId, files]);
  
  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    const kb = bytes / 1024;
    const mb = kb / 1024;
    const gb = mb / 1024;
    
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    if (kb >= 1) return `${kb.toFixed(2)} KB`;
    return `${bytes} bytes`;
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };
  
  const handleSave = () => {
    const selectedProject = projects.find(p => String(p.id) === String(projectId));
    const selectedSubProject = subProjects.find(sp => String(sp.id) === String(subProjectId));
    const selectedFile = files.find(f => String(f.id) === String(fileId));
    
    const config = {
      projectId,
      projectName: selectedProject?.name || '',
      subProjectId: subProjectId || null,
      subProjectName: selectedSubProject?.name || '',
      fileId,
      fileName: selectedFile?.file_name || '',
      filePath: selectedFile?.file_path || '',
      fileSize: selectedFile?.file_size,
      uploadDate: selectedFile?.upload_date,
      fileFormat: selectedFile?.file_format || schema?.file_type || 'unknown',
      schema: schema?.columns || [],
      schemaMetadata: {
        file_type: schema?.file_type || 'unknown',
        contains_pii: schema?.contains_pii || false,
        data_classification: schema?.data_classification || 'unclassified',
        source: 'file_schema'
      }
    };
    onSave(config);
    onClose();
  };
  
  if (!isOpen) return null;
  
  // Show schema tab if schema is available
  const showSchemaTab = schema !== null;
  
  return (
    <div className="vm-modal-overlay" onClick={onClose}>
      <div className="vm-modal vm-modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-header">
          <h2>File Configuration</h2>
          <button onClick={onClose} className="vm-modal-close">×</button>
        </div>
        
        {/* Tab Navigation */}
        <div className="vm-tabs">
          <button 
            className={`vm-tab ${activeTab === 'selection' ? 'vm-tab-active' : ''}`}
            onClick={() => setActiveTab('selection')}
          >
            Selection
          </button>
          {showSchemaTab && (
            <button 
              className={`vm-tab ${activeTab === 'schema' ? 'vm-tab-active' : ''}`}
              onClick={() => setActiveTab('schema')}
            >
              Schema
            </button>
          )}
        </div>
        
        <div className="vm-modal-body">
          {/* Selection Tab */}
          {activeTab === 'selection' && (
            <div className="vm-modal-body-scroll">
              <h3 className="vm-section-title">File Selection</h3>
              
              {/* Project Dropdown */}
              <div className="vm-form-group">
                <label>Project *</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="vm-select"
                >
                  <option value="">Select Project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Sub-Project Dropdown (Cascading) */}
              {projectId && (
                <div className="vm-form-group">
                  <label>Sub-Project (Optional)</label>
                  <select
                    value={subProjectId}
                    onChange={(e) => setSubProjectId(e.target.value)}
                    className="vm-select"
                  >
                    <option value="">None / All Files</option>
                    {subProjects.map(sp => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* File Dropdown (Cascading) */}
              {projectId && (
                <div className="vm-form-group">
                  <label>File *</label>
                  <select
                    value={fileId}
                    onChange={(e) => setFileId(e.target.value)}
                    className="vm-select"
                    disabled={loading}
                  >
                    <option value="">Select File</option>
                    {files.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.file_name}
                      </option>
                    ))}
                  </select>
                  {loading && (
                    <small className="vm-help-text">Loading files...</small>
                  )}
                </div>
              )}
              
              {/* File Metadata Display */}
              {selectedFileMetadata && (
                <>
                  <h3 className="vm-section-title">File Metadata</h3>
                  
                  <div className="vm-form-row-two-cols">
                    <div className="vm-form-group">
                      <label>File Name</label>
                      <input
                        type="text"
                        value={selectedFileMetadata.file_name || 'N/A'}
                        readOnly
                        className="vm-input"
                      />
                    </div>
                    
                    <div className="vm-form-group">
                      <label>File Size</label>
                      <input
                        type="text"
                        value={formatFileSize(selectedFileMetadata.file_size)}
                        readOnly
                        className="vm-input"
                      />
                    </div>
                  </div>
                  
                  <div className="vm-form-row-two-cols">
                    <div className="vm-form-group">
                      <label>Upload Date</label>
                      <input
                        type="text"
                        value={formatDate(selectedFileMetadata.upload_date)}
                        readOnly
                        className="vm-input"
                      />
                    </div>
                    
                    <div className="vm-form-group">
                      <label>Format</label>
                      <input
                        type="text"
                        value={selectedFileMetadata.file_format || schema?.file_type || 'unknown'}
                        readOnly
                        className="vm-input"
                      />
                    </div>
                  </div>
                </>
              )}
              
              {schemaLoading && (
                <div className="vm-info-box">
                  <p>Loading schema...</p>
                </div>
              )}
            </div>
          )}
          
          {/* Schema Tab (Read-only) */}
          {activeTab === 'schema' && (
            <div className="vm-schema-container">
              {schema ? (
                <>
                  <div className="vm-schema-meta">
                    <div className="vm-schema-meta-row">
                      <span className="vm-schema-label">File Format:</span>
                      <span className="vm-schema-value">{schema.file_type || 'unknown'}</span>
                    </div>
                    <div className="vm-schema-meta-row">
                      <span className="vm-schema-label">Total Columns:</span>
                      <span className="vm-schema-value">{schema.columns.length}</span>
                    </div>
                    <div className="vm-schema-meta-row">
                      <span className="vm-schema-label">Contains PII:</span>
                      <span className="vm-schema-value">{schema.contains_pii ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                  
                  <div className="vm-schema-table-container">
                    <table className="vm-schema-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Column Name</th>
                          <th>Data Type</th>
                          <th>Description</th>
                          <th>PII</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schema.columns && schema.columns.length > 0 ? (
                          schema.columns.map((col, idx) => {
                            const isPII = col.contains_pii || col.pii || false;
                            return (
                              <tr key={idx}>
                                <td>{idx + 1}</td>
                                <td className="vm-schema-col-name">{col.column_name || col.name}</td>
                                <td className="vm-schema-col-type">{col.data_type || col.type || 'unknown'}</td>
                                <td className="vm-schema-col-desc">{col.description || '—'}</td>
                                <td className="vm-schema-col-pii">
                                  <span className={`vm-pii-indicator ${isPII ? 'vm-pii-yes' : 'vm-pii-no'}`}>
                                    {isPII ? 'Yes' : 'No'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="5" style={{ textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>
                              No columns in schema
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="vm-schema-note">
                    <strong>Note:</strong> This schema is read-only and represents the structure of the selected file. 
                    It will be used as the output schema for downstream nodes in the mapping flow.
                  </div>
                </>
              ) : (
                <div className="vm-empty-state">Please select a file in the Selection tab</div>
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
            disabled={!projectId || !fileId}
            className="vm-btn vm-btn-primary"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileModal;
