import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiEye, FiDownload, FiCheckCircle, FiAlertTriangle, FiGitBranch } from 'react-icons/fi';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import '../styles/global-page-styles.css';
import '../styles/VendorFileQuality.css';

function VendorFileQuality() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [expandedGroups, setExpandedGroups] = useState({});
  
  const navigate = useNavigate();

  useEffect(() => {
    fetchVendorFiles();
  }, []);

  // Listen for vendor file uploads from other components/tabs
  useEffect(() => {
    const handleFileUploaded = (event) => {
      console.log('Vendor file uploaded, refreshing catalog...', event.detail);
      fetchVendorFiles();
    };

    window.addEventListener('vendorFileUploaded', handleFileUploaded);

    return () => {
      window.removeEventListener('vendorFileUploaded', handleFileUploaded);
    };
  }, []);

  const fetchVendorFiles = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/vendor-files');
      setFiles(response.data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching vendor files:', err);
      setError('Failed to load vendor files');
    } finally {
      setLoading(false);
    }
  };

  const handleViewProfile = (fileId) => {
    navigate(`/profile/${encodeURIComponent(fileId)}`);
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Filter files based on search and type
  const filteredFiles = files.filter(file => {
    const matchesSearch = !searchTerm || 
      file.filename?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.file_id?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = selectedType === 'all' || file.file_type === selectedType;
    
    return matchesSearch && matchesType;
  });

  // Group files by logical_file_id (canonical name grouping)
  const groupedFiles = filteredFiles.reduce((groups, file) => {
    // Use logical_file_id if available, otherwise fall back to filename
    const groupKey = file.logical_file_id || file.filename;
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(file);
    return groups;
  }, {});

  // Sort files within each group by date (newest first)
  Object.keys(groupedFiles).forEach(groupKey => {
    groupedFiles[groupKey].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  });

  // Convert to array of groups for easier handling
  const fileGroups = Object.entries(groupedFiles).map(([groupKey, files]) => {
    const groupId = `group_${files[0].logical_file_id || files[0].file_id}`;
    return {
      filename: files[0].filename, // Use representative filename for display
      groupId,
      files,
      count: files.length,
      logicalFileId: files[0].logical_file_id,
      // Use the most recent file for display data
      representativeFile: files[0]
    };
  });

  // Get unique file types for filter
  const fileTypes = [...new Set(files.map(f => f.file_type).filter(Boolean))];

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  if (loading) {
    return (
      <div className="gps-page-container">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Vendor File Catalog</h1>
          <p className="gps-page-subtitle">View and analyze your uploaded vendor files with full profiling details</p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Filters */}
      <div className="gps-filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by filename or file ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="filter-group">
          <label htmlFor="file-type-filter">File Type:</label>
          <select
            id="file-type-filter"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Types</option>
            {fileTypes.map(type => (
              <option key={type} value={type}>{type.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results summary */}
      <div className="results-summary">
        <p>Showing {fileGroups.length} file groups ({filteredFiles.length} total files) of {files.length} vendor files</p>
      </div>

      {!loading && !error && files.length === 0 && (
        <div className="empty-state">
          <FiCheckCircle size={48} style={{ color: '#ccc', marginBottom: '1rem' }} />
          <h3>No vendor files yet</h3>
          <p>Upload files through the Vendor File Upload page to see them here</p>
        </div>
      )}

      {!loading && !error && filteredFiles.length === 0 && files.length > 0 && (
        <div className="empty-state">
          <FiAlertTriangle size={48} style={{ color: '#f59e0b', marginBottom: '1rem' }} />
          <h3>No matching files</h3>
          <p>Try adjusting your search or filter criteria</p>
        </div>
      )}

      {!loading && !error && fileGroups.length > 0 && (
        <div className="file-table-container">
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="gps-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fileGroups.map(group => {
                const isExpanded = expandedGroups[group.groupId];
                const file = group.representativeFile;
                
                return (
                  <React.Fragment key={group.groupId}>
                    {/* Group Header Row */}
                    <tr className={`file-row ${isExpanded ? 'expanded' : ''}`}>
                      <td 
                        className="filename-cell" 
                        onClick={() => group.count > 1 && toggleGroup(group.groupId)} 
                        style={{cursor: group.count > 1 ? 'pointer' : 'default'}}
                      >
                        <div className="filename">
                          {file.filename}
                          {group.count > 1 && (
                            <span className="file-count-badge">×{group.count}</span>
                          )}
                          {file.has_schema_changes && (
                            <span 
                              className="schema-changed-badge" 
                              title="Schema has changed from previous upload"
                              style={{
                                marginLeft: '8px',
                                padding: '2px 8px',
                                backgroundColor: '#ff9800',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: '500',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <FiGitBranch size={12} /> Schema Changed
                            </span>
                          )}
                        </div>
                        <div className="file-id">{file.file_id}</div>
                      </td>
                      <td>
                        <span className="file-type-badge">
                          {file.file_type?.toUpperCase() || 'Unknown'}
                        </span>
                      </td>
                      <td>{formatBytes(file.file_size)}</td>
                      <td>{formatDate(file.created_at)}</td>
                      <td>
                        <button
                          className="action-btn view-btn"
                          onClick={() => handleViewProfile(file.file_id)}
                          title="View Full Profile"
                        >
                          <FiEye /> View Profile
                        </button>
                      </td>
                    </tr>
                    
                    {/* Child Rows (when expanded) */}
                    {isExpanded && group.files.length > 1 && group.files.slice(1).map((childFile, index) => (
                      <tr key={childFile.file_id} className="file-row child-row">
                        <td className="filename-cell child-cell">
                          <div className="filename child-filename">
                            <span className="child-indicator">↳</span>
                            {childFile.filename}
                            {childFile.has_schema_changes && (
                              <span 
                                className="schema-changed-badge" 
                                title="Schema has changed from previous upload"
                                style={{
                                  marginLeft: '8px',
                                  padding: '2px 8px',
                                  backgroundColor: '#ff9800',
                                  color: 'white',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: '500',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <FiGitBranch size={12} /> Schema Changed
                              </span>
                            )}
                          </div>
                          <div className="file-id">{childFile.file_id}</div>
                        </td>
                        <td>
                          <span className="file-type-badge">
                            {childFile.file_type?.toUpperCase() || 'Unknown'}
                          </span>
                        </td>
                        <td>{formatBytes(childFile.file_size)}</td>
                        <td>{formatDate(childFile.created_at)}</td>
                        <td>
                          <button
                            className="action-btn view-btn"
                            onClick={() => handleViewProfile(childFile.file_id)}
                            title="View Full Profile"
                          >
                            <FiEye /> View Profile
                          </button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default VendorFileQuality;
