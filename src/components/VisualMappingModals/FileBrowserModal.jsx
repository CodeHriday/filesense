import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaFolder, FaFile, FaChevronRight, FaHome } from 'react-icons/fa';
import './MappingConfigModal.css';

const FileBrowserModal = ({ isOpen, onClose, onSelect, connectionId, connectionName }) => {
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState({ folders: [], files: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pathParts, setPathParts] = useState([]);
  
  useEffect(() => {
    if (isOpen && connectionId) {
      fetchItems(currentPath);
    }
  }, [isOpen, connectionId, currentPath]);
  
  useEffect(() => {
    // Parse current path into breadcrumb parts
    if (currentPath) {
      const parts = currentPath.split('/').filter(p => p);
      setPathParts(parts);
    } else {
      setPathParts([]);
    }
  }, [currentPath]);
  
  const fetchItems = async (path) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.get(`/api/connections/${connectionId}/browse`, {
        params: { path }
      });
      
      setItems({
        folders: response.data.folders || [],
        files: response.data.files || []
      });
    } catch (error) {
      console.error('Error fetching items:', error);
      setError(error.response?.data?.error || 'Failed to browse connection');
      setItems({ folders: [], files: [] });
    } finally {
      setLoading(false);
    }
  };
  
  const handleFolderClick = (folder) => {
    setCurrentPath(folder.path);
  };
  
  const handleFileClick = (file) => {
    // Extract path and filename from file.path
    const fullPath = file.path;
    const lastSlashIndex = fullPath.lastIndexOf('/');
    
    let filePath, fileName;
    if (lastSlashIndex >= 0) {
      filePath = fullPath.substring(0, lastSlashIndex + 1); // Include trailing slash
      fileName = fullPath.substring(lastSlashIndex + 1);
    } else {
      filePath = '';
      fileName = fullPath;
    }
    
    onSelect({
      filePath,
      fileName,
      fullPath
    });
    onClose();
  };
  
  const handleBreadcrumbClick = (index) => {
    if (index === -1) {
      // Root
      setCurrentPath('');
    } else {
      // Navigate to specific level
      const newPath = pathParts.slice(0, index + 1).join('/') + '/';
      setCurrentPath(newPath);
    }
  };
  
  const formatFileSize = (bytes) => {
    if (!bytes) return '-';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };
  
  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString();
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="vm-modal-overlay" onClick={onClose}>
      <div className="vm-modal vm-modal-large vm-file-browser-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vm-modal-header">
          <h2>Browse Files - {connectionName}</h2>
          <button onClick={onClose} className="vm-modal-close">×</button>
        </div>
        
        <div className="vm-modal-body">
          {/* Breadcrumb Navigation */}
          <div className="vm-breadcrumb">
            <button 
              onClick={() => handleBreadcrumbClick(-1)}
              className="vm-breadcrumb-item"
            >
              <FaHome size={12} />
            </button>
            {pathParts.map((part, index) => (
              <React.Fragment key={index}>
                <FaChevronRight size={10} className="vm-breadcrumb-separator" />
                <button 
                  onClick={() => handleBreadcrumbClick(index)}
                  className="vm-breadcrumb-item"
                >
                  {part}
                </button>
              </React.Fragment>
            ))}
          </div>
          
          {/* Current Path Display */}
          <div className="vm-current-path">
            <strong>Path:</strong> /{currentPath || 'root'}
          </div>
          
          {error && (
            <div className="vm-error-message">
              {error}
            </div>
          )}
          
          {loading ? (
            <div className="vm-loading">Loading...</div>
          ) : (
            <div className="vm-file-list">
              {items.folders.length === 0 && items.files.length === 0 ? (
                <div className="vm-empty-state">No files or folders found</div>
              ) : (
                <table className="vm-file-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th>Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Folders first */}
                    {items.folders.map((folder, index) => (
                      <tr 
                        key={`folder-${index}`}
                        onClick={() => handleFolderClick(folder)}
                        className="vm-file-row vm-folder-row"
                      >
                        <td>
                          <FaFolder className="vm-icon vm-icon-folder" />
                          <span className="vm-file-name">{folder.name}</span>
                        </td>
                        <td>Folder</td>
                        <td>-</td>
                        <td>-</td>
                      </tr>
                    ))}
                    
                    {/* Then files */}
                    {items.files.map((file, index) => (
                      <tr 
                        key={`file-${index}`}
                        onClick={() => handleFileClick(file)}
                        className="vm-file-row vm-file-row-clickable"
                      >
                        <td>
                          <FaFile className="vm-icon vm-icon-file" />
                          <span className="vm-file-name">{file.name}</span>
                        </td>
                        <td>File</td>
                        <td>{formatFileSize(file.size)}</td>
                        <td>{formatDate(file.modified)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
        
        <div className="vm-modal-footer">
          <button onClick={onClose} className="vm-btn vm-btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileBrowserModal;
