import React, { useState, useEffect } from 'react';
import { FaFolder, FaFile, FaChevronRight, FaHome, FaSpinner } from 'react-icons/fa';
import axios from 'axios';

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
              <FaFile className="icon file-icon" />
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

      <style jsx>{`
        .s3-folder-browser {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background: white;
          overflow: hidden;
        }

        .s3-breadcrumb {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          background: #f5f5f5;
          border-bottom: 1px solid #e0e0e0;
          overflow-x: auto;
          gap: 8px;
        }

        .breadcrumb-item {
          background: none;
          border: none;
          padding: 4px 8px;
          cursor: pointer;
          color: #2196F3;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        .breadcrumb-item:hover {
          background: rgba(33, 150, 243, 0.1);
          border-radius: 4px;
        }

        .breadcrumb-separator {
          color: #999;
          font-size: 12px;
        }

        .s3-current-path {
          padding: 12px 16px;
          background: #fafafa;
          border-bottom: 1px solid #e0e0e0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 14px;
        }

        .btn-select-path {
          background: #2196F3;
          color: white;
          border: none;
          padding: 6px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
        }

        .btn-select-path:hover {
          background: #1976D2;
        }

        .s3-loading, .s3-error {
          padding: 24px;
          text-align: center;
        }

        .s3-error {
          color: #d32f2f;
        }

        .spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .s3-contents {
          max-height: 400px;
          overflow-y: auto;
        }

        .s3-item {
          display: grid;
          grid-template-columns: 24px 1fr auto auto;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid #f0f0f0;
          align-items: center;
          transition: background 0.2s;
        }

        .s3-folder, .s3-parent {
          cursor: pointer;
        }

        .s3-folder:hover, .s3-parent:hover {
          background: #f5f5f5;
        }

        .s3-item .icon {
          color: #FFA726;
          font-size: 15px;
        }

        .s3-item .file-icon {
          color: #666;
          font-size: 15px;
        }

        .s3-item .name {
          font-size: 14px;
          color: #333;
          font-weight: 500;
        }

        .s3-item .type {
          font-size: 12px;
          color: #666;
          background: #f0f0f0;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .s3-item .size {
          font-size: 12px;
          color: #999;
          margin-left: 12px;
        }

        .s3-empty {
          padding: 48px 16px;
          text-align: center;
          color: #999;
          font-size: 14px;
        }

        .s3-parent .icon {
          color: #999;
        }
      `}</style>
    </div>
  );
};

export default S3FolderBrowser;
