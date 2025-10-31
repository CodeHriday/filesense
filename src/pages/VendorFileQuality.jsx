import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiEye, FiDownload, FiCheckCircle, FiAlertTriangle, FiGitBranch } from 'react-icons/fi';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import '../styles/VendorFileQuality.css';

function VendorFileQuality() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  
  const navigate = useNavigate();

  useEffect(() => {
    fetchVendorFiles();
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

  // Get unique file types for filter
  const fileTypes = [...new Set(files.map(f => f.file_type).filter(Boolean))];

  if (loading) {
    return (
      <div className="vendor-file-catalog-container">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="vendor-file-catalog-container">
      <div className="catalog-header">
        <div className="header-content">
          <h1>Vendor File Catalog</h1>
          <p className="subtitle">View and analyze your uploaded vendor files with full profiling details</p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Filters */}
      <div className="filters-container">
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
        <p>Showing {filteredFiles.length} of {files.length} vendor files</p>
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

      {!loading && !error && filteredFiles.length > 0 && (
        <div className="file-table-container">
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="file-table">
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
              {filteredFiles.map((file) => (
                <tr key={file.file_id} className="file-row">
                  <td className="filename-cell">
                    <div className="filename">
                      {file.filename}
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
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default VendorFileQuality;
