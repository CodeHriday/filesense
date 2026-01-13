import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiEye, FiTrash2, FiCheckCircle, FiAlertTriangle, FiGitBranch, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import '../styles/global-page-styles.css';
import '../styles/VendorFileQuality.css';

function VendorFileQuality() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  const navigate = useNavigate();
  const { hasWritePermission } = useAuth();
  const { addToast } = useToast();

  const canDelete = hasWritePermission('vendor_file_quality');

  const fetchVendorFiles = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/vendor-files?page=${page}&pageSize=${pageSize}`);
      const data = response.data;
      
      if (data.files) {
        setFiles(data.files);
        setTotalCount(data.totalCount || 0);
        setTotalPages(data.totalPages || 0);
      } else {
        setFiles(data || []);
        setTotalCount(data.length || 0);
        setTotalPages(1);
      }
      setError(null);
      setSelectedFiles(new Set());
    } catch (err) {
      console.error('Error fetching vendor files:', err);
      setError('Failed to load vendor files');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchVendorFiles();
  }, [fetchVendorFiles]);

  useEffect(() => {
    const handleFileUploaded = (event) => {
      console.log('Vendor file uploaded, refreshing catalog...', event.detail);
      fetchVendorFiles();
    };

    window.addEventListener('vendorFileUploaded', handleFileUploaded);

    return () => {
      window.removeEventListener('vendorFileUploaded', handleFileUploaded);
    };
  }, [fetchVendorFiles]);

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

  const filteredFiles = files.filter(file => {
    const matchesSearch = !searchTerm || 
      file.filename?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.file_id?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = selectedType === 'all' || file.file_type === selectedType;
    
    return matchesSearch && matchesType;
  });

  const groupedFiles = filteredFiles.reduce((groups, file) => {
    const groupKey = file.logical_file_id || file.filename;
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(file);
    return groups;
  }, {});

  Object.keys(groupedFiles).forEach(groupKey => {
    groupedFiles[groupKey].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  });

  const fileGroups = Object.entries(groupedFiles).map(([groupKey, files]) => {
    const groupId = `group_${files[0].logical_file_id || files[0].file_id}`;
    return {
      filename: files[0].filename,
      groupId,
      files,
      count: files.length,
      logicalFileId: files[0].logical_file_id,
      representativeFile: files[0]
    };
  });

  const fileTypes = [...new Set(files.map(f => f.file_type).filter(Boolean))];

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const allFileIds = filteredFiles.map(f => f.file_id);
  const allSelected = allFileIds.length > 0 && allFileIds.every(id => selectedFiles.has(id));
  const someSelected = allFileIds.some(id => selectedFiles.has(id)) && !allSelected;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(allFileIds));
    }
  };

  const handleSelectFile = (fileId) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const handleSelectGroup = (groupFiles) => {
    const groupFileIds = groupFiles.map(f => f.file_id);
    const allGroupSelected = groupFileIds.every(id => selectedFiles.has(id));
    
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (allGroupSelected) {
        groupFileIds.forEach(id => newSet.delete(id));
      } else {
        groupFileIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  const isGroupSelected = (groupFiles) => {
    return groupFiles.every(f => selectedFiles.has(f.file_id));
  };

  const isGroupPartiallySelected = (groupFiles) => {
    const hasSelected = groupFiles.some(f => selectedFiles.has(f.file_id));
    const allSelected = groupFiles.every(f => selectedFiles.has(f.file_id));
    return hasSelected && !allSelected;
  };

  const handleBulkDelete = async () => {
    if (selectedFiles.size === 0) return;
    
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.delete('/api/vendor-files/bulk', {
        data: { fileIds: Array.from(selectedFiles) },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      addToast('success', 'Files Deleted', response.data.message);
      setShowDeleteModal(false);
      setSelectedFiles(new Set());
      fetchVendorFiles();
    } catch (err) {
      console.error('Error deleting files:', err);
      addToast('error', 'Delete Failed', err.response?.data?.error || 'Failed to delete files');
    } finally {
      setDeleting(false);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setPage(1);
  };

  const renderPaginationControls = () => {
    const startRecord = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const endRecord = Math.min(page * pageSize, totalCount);
    
    return (
      <div className="pagination-controls" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '12px 0',
        borderTop: '1px solid #e5e7eb',
        marginTop: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '10px', color: '#6b7280' }}>
            Showing {startRecord}-{endRecord} of {totalCount} files
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '10px', fontWeight: '600', color: '#374151' }}>Per Page:</label>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
              className="gps-form-select"
              style={{ minWidth: '70px', padding: '4px 8px', fontSize: '10px' }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => handlePageChange(1)}
            disabled={page === 1}
            className="pagination-btn"
            style={{
              padding: '6px 10px',
              fontSize: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              background: page === 1 ? '#f3f4f6' : 'white',
              color: page === 1 ? '#9ca3af' : '#374151',
              cursor: page === 1 ? 'not-allowed' : 'pointer'
            }}
          >
            First
          </button>
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className="pagination-btn"
            style={{
              padding: '6px 10px',
              fontSize: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              background: page === 1 ? '#f3f4f6' : 'white',
              color: page === 1 ? '#9ca3af' : '#374151',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <FiChevronLeft size={12} /> Prev
          </button>
          
          <span style={{ fontSize: '10px', color: '#374151', padding: '0 8px' }}>
            Page {page} of {totalPages || 1}
          </span>
          
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
            className="pagination-btn"
            style={{
              padding: '6px 10px',
              fontSize: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              background: page >= totalPages ? '#f3f4f6' : 'white',
              color: page >= totalPages ? '#9ca3af' : '#374151',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            Next <FiChevronRight size={12} />
          </button>
          <button
            onClick={() => handlePageChange(totalPages)}
            disabled={page >= totalPages}
            className="pagination-btn"
            style={{
              padding: '6px 10px',
              fontSize: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              background: page >= totalPages ? '#f3f4f6' : 'white',
              color: page >= totalPages ? '#9ca3af' : '#374151',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer'
            }}
          >
            Last
          </button>
        </div>
      </div>
    );
  };

  if (loading && files.length === 0) {
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
        <div className="gps-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="gps-stat-card" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#025043' }}>{filteredFiles.length.toLocaleString()}</span>
            <span style={{ fontSize: '10px', color: '#666' }}>Total Files</span>
          </div>
        </div>
        {canDelete && selectedFiles.size > 0 && (
          <div className="gps-page-header-right">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="action-btn delete-btn"
              style={{
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: '500'
              }}
            >
              <FiTrash2 size={14} /> Delete Selected ({selectedFiles.size})
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="gps-filter-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by filename or file ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          maxLength={100}
          className="gps-form-input"
          style={{ flex: '1 1 200px', minWidth: '150px', maxWidth: '100%' }}
        />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <label style={{ fontSize: '10px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>File Type:</label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="gps-form-select"
            style={{ minWidth: '90px' }}
          >
            <option value="all">All Types</option>
            {fileTypes.map(type => (
              <option key={type} value={type}>{type.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="results-summary">
        <p>Showing {fileGroups.length} file groups ({filteredFiles.length} total files) of {totalCount} vendor files</p>
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
                {canDelete && (
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={handleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                )}
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
                    <tr className={`file-row ${isExpanded ? 'expanded' : ''}`}>
                      {canDelete && (
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isGroupSelected(group.files)}
                            ref={(el) => {
                              if (el) el.indeterminate = isGroupPartiallySelected(group.files);
                            }}
                            onChange={() => handleSelectGroup(group.files)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: 'pointer' }}
                            title={group.count > 1 ? `Select all ${group.count} files in this group` : 'Select file'}
                          />
                        </td>
                      )}
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
                    
                    {isExpanded && group.files.length > 1 && group.files.slice(1).map((childFile) => (
                      <tr key={childFile.file_id} className="file-row child-row">
                        {canDelete && (
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectedFiles.has(childFile.file_id)}
                              onChange={() => handleSelectFile(childFile.file_id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                        )}
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
          
          {renderPaginationControls()}
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
          }}>
            <h3 style={{ margin: '0 0 16px', color: '#dc2626', fontSize: '16px' }}>
              Confirm Delete
            </h3>
            <p style={{ margin: '0 0 24px', color: '#374151', fontSize: '12px' }}>
              Are you sure you want to delete {selectedFiles.size} file(s)? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '10px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {deleting ? 'Deleting...' : 'Delete Files'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VendorFileQuality;
