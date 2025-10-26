import React, { useState, useEffect } from 'react';
import { FaFolder, FaFile, FaChevronRight, FaHome, FaSpinner } from 'react-icons/fa';
import axios from 'axios';
import './S3FolderBrowser.css';

const S3FolderBrowser = ({ connectionId, onSelectPath, initialPath = '/' }) => {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bucketName, setBucketName] = useState('');

  useEffect(() => {
    if (connectionId) {
      loadPath(currentPath);
    }
  }, [connectionId, currentPath]);

  const loadPath = async (path) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.post('/api/bulk-profiling/browse', {
        connectionId,
        s3Path: path
      });
      
      if (response.data.success) {
        setFolders(response.data.folders || []);
        setFiles(response.data.files || []);
        setBucketName(response.data.bucketName || '');
        setCurrentPath(response.data.currentPath || '/');
      }
    } catch (err) {
      console.error('Error browsing S3 path:', err);
      setError(err.response?.data?.message || 'Failed to browse S3 path');
    } finally {
      setLoading(false);
    }
  };

  const handleFolderClick = (folder) => {
    setCurrentPath(folder.path);
  };

  const handlePathSelect = () => {
    onSelectPath(currentPath);
  };

  const navigateToParent = () => {
    if (currentPath === '/') return;
    
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.length > 0 ? '/' + parts.join('/') : '/';
    setCurrentPath(parentPath);
  };

  const navigateToRoot = () => {
    setCurrentPath('/');
  };

  // Build breadcrumb items
  const getBreadcrumbs = () => {
    if (currentPath === '/') return [];
    
    const parts = currentPath.split('/').filter(Boolean);
    const breadcrumbs = [];
    
    for (let i = 0; i < parts.length; i++) {
      const path = '/' + parts.slice(0, i + 1).join('/');
      breadcrumbs.push({ name: parts[i], path });
    }
    
    return breadcrumbs;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="s3-folder-browser">
      {/* Breadcrumb Navigation */}
      <div className="s3-breadcrumb">
        <button 
          onClick={navigateToRoot}
          className="breadcrumb-item"
          title="Go to root"
        >
          <FaHome /> {bucketName}
        </button>
        
        {getBreadcrumbs().map((crumb, index) => (
          <React.Fragment key={index}>
            <FaChevronRight className="breadcrumb-separator" />
            <button
              onClick={() => setCurrentPath(crumb.path)}
              className="breadcrumb-item"
            >
              {crumb.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Current Path Display */}
      <div className="s3-current-path">
        <strong>Current Path:</strong> {currentPath || '/'}
        <button 
          onClick={handlePathSelect}
          className="btn-select-path"
        >
          Select This Path
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="s3-loading">
          <FaSpinner className="spinner" /> Loading...
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="s3-error">
          <p>{error}</p>
        </div>
      )}

      {/* Folder and File List */}
      {!loading && !error && (
        <div className="s3-contents">
          {/* Parent Folder Navigation */}
          {currentPath !== '/' && (
            <div 
              className="s3-item s3-parent"
              onClick={navigateToParent}
            >
              <FaFolder className="icon" />
              <span className="name">..</span>
              <span className="type">Parent folder</span>
            </div>
          )}

          {/* Folders */}
          {folders.map((folder, index) => (
            <div 
              key={`folder-${index}`}
              className="s3-item s3-folder"
              onClick={() => handleFolderClick(folder)}
            >
              <FaFolder className="icon" />
              <span className="name">{folder.name}</span>
              <span className="type">Folder</span>
            </div>
          ))}

          {/* Files */}
          {files.map((file, index) => (
            <div 
              key={`file-${index}`}
              className="s3-item s3-file"
            >
              <span className="name">{file.name}</span>
              <span className="type">{file.type.toUpperCase()}</span>
              <span className="size">{formatFileSize(file.size)}</span>
            </div>
          ))}

          {/* Empty State */}
          {folders.length === 0 && files.length === 0 && (
            <div className="s3-empty">
              No folders or compatible files found in this location.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default S3FolderBrowser;
