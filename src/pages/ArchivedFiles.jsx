import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ArchivedFiles.css';

const ArchivedFiles = () => {
  const [archives, setArchives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({
    policy_id: '',
    status: '',
    start_date: '',
    end_date: ''
  });
  const [pagination, setPagination] = useState({
    limit: 50,
    offset: 0,
    total: 0,
    hasMore: false
  });
  const [policies, setPolicies] = useState([]);
  const [restoringId, setRestoringId] = useState(null);
  const [restoreModal, setRestoreModal] = useState(null);

  useEffect(() => {
    fetchPolicies();
    fetchArchives();
  }, [filter, pagination.offset]);

  const fetchPolicies = async () => {
    try {
      const response = await axios.get('/api/retention-policies');
      setPolicies(response.data.policies || []);
    } catch (err) {
      console.error('Error fetching policies:', err);
    }
  };

  const fetchArchives = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        ...filter,
        limit: pagination.limit,
        offset: pagination.offset
      };

      // Remove empty filter values
      Object.keys(params).forEach(key => {
        if (params[key] === '') delete params[key];
      });

      const response = await axios.get('/api/retention-policies/archives/list', { params });

      setArchives(response.data.archives || []);
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination.total,
        hasMore: response.data.pagination.hasMore
      }));
    } catch (err) {
      console.error('Error fetching archived files:', err);
      setError('Failed to load archived files. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilter(prev => ({ ...prev, [field]: value }));
    setPagination(prev => ({ ...prev, offset: 0 })); // Reset to first page
  };

  const handleRestoreClick = (archive) => {
    setRestoreModal({
      id: archive.id,
      filename: archive.filename,
      originalPath: archive.original_path,
      restorePath: archive.original_path || `./uploads/${archive.filename}`,
      reason: ''
    });
  };

  const handleRestoreSubmit = async () => {
    if (!restoreModal) return;

    try {
      setRestoringId(restoreModal.id);
      
      const response = await axios.post(`/api/retention-policies/archives/${restoreModal.id}/restore`, {
        restore_path: restoreModal.restorePath,
        reason: restoreModal.reason
      });

      if (response.data.success) {
        alert('File restored successfully!');
        setRestoreModal(null);
        fetchArchives(); // Refresh the list
      } else {
        alert(`Restoration failed: ${response.data.message}`);
      }
    } catch (err) {
      console.error('Error restoring file:', err);
      alert(`Error: ${err.response?.data?.error || 'Failed to restore file'}`);
    } finally {
      setRestoringId(null);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status) => {
    const statusClasses = {
      'archived': 'status-badge status-archived',
      'pending': 'status-badge status-pending',
      'failed': 'status-badge status-failed'
    };

    return <span className={statusClasses[status] || 'status-badge'}>{status}</span>;
  };

  return (
    <div className="archived-files-container">
      <div className="page-header">
        <h1>Archived Files</h1>
        <p>View and restore files that have been archived by retention policies</p>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="policy-select">Policy:</label>
          <select 
            id="policy-select"
            value={filter.policy_id} 
            onChange={(e) => handleFilterChange('policy_id', e.target.value)}
          >
            <option value="">All Policies</option>
            {policies.map(policy => (
              <option key={policy.id} value={policy.id}>{policy.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="status-select">Status:</label>
          <select 
            id="status-select"
            value={filter.status} 
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="archived">Archived</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="start-date-input">Start Date:</label>
          <input 
            id="start-date-input"
            type="datetime-local"
            value={filter.start_date}
            onChange={(e) => handleFilterChange('start_date', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="end-date-input">End Date:</label>
          <input 
            id="end-date-input"
            type="datetime-local"
            value={filter.end_date}
            onChange={(e) => handleFilterChange('end_date', e.target.value)}
          />
        </div>

        <button 
          className="btn-secondary"
          onClick={() => {
            setFilter({ policy_id: '', status: '', start_date: '', end_date: '' });
            setPagination(prev => ({ ...prev, offset: 0 }));
          }}
        >
          Clear Filters
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          <p>Loading archived files...</p>
        </div>
      )}

      {/* Archives Table */}
      {!loading && (
        <>
          <div className="archives-summary">
            <p>Showing {archives.length} of {pagination.total} archived files</p>
          </div>

          <div className="table-container">
            <table className="archives-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Policy</th>
                  <th>Status</th>
                  <th>Original Size</th>
                  <th>Compressed Size</th>
                  <th>Archived At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {archives.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="no-data">
                      No archived files found
                    </td>
                  </tr>
                ) : (
                  archives.map(archive => (
                    <tr key={archive.id}>
                      <td>
                        <div className="file-info">
                          <span className="filename">{archive.filename}</span>
                          <span className="file-id">ID: {archive.file_id}</span>
                        </div>
                      </td>
                      <td>{archive.policy_name || 'N/A'}</td>
                      <td>{getStatusBadge(archive.archive_status)}</td>
                      <td>{formatBytes(archive.original_size_bytes)}</td>
                      <td>
                        {formatBytes(archive.compressed_size_bytes)}
                        {archive.compressed_size_bytes && archive.original_size_bytes && (
                          <span className="compression-ratio">
                            {' '}({Math.round((archive.compressed_size_bytes / archive.original_size_bytes) * 100)}%)
                          </span>
                        )}
                      </td>
                      <td>{formatDate(archive.archived_at)}</td>
                      <td>
                        <button
                          className="btn-action btn-restore"
                          onClick={() => handleRestoreClick(archive)}
                          disabled={archive.archive_status !== 'archived' || restoringId === archive.id}
                        >
                          {restoringId === archive.id ? 'Restoring...' : 'Restore'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.total > pagination.limit && (
            <div className="pagination">
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                disabled={pagination.offset === 0}
                className="btn-secondary"
              >
                Previous
              </button>
              <span className="page-info">
                Page {Math.floor(pagination.offset / pagination.limit) + 1} of {Math.ceil(pagination.total / pagination.limit)}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                disabled={!pagination.hasMore}
                className="btn-secondary"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Restore Modal */}
      {restoreModal && (
        <div className="modal-overlay" onClick={() => setRestoreModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Restore Archived File</h2>
            
            <div className="form-group">
              <label htmlFor="restore-filename">Filename:</label>
              <input id="restore-filename" type="text" value={restoreModal.filename} disabled />
            </div>

            <div className="form-group">
              <label htmlFor="restore-path">Restore Path:</label>
              <input 
                id="restore-path"
                type="text"
                value={restoreModal.restorePath}
                onChange={(e) => setRestoreModal({ ...restoreModal, restorePath: e.target.value })}
                placeholder="Path where file will be restored"
              />
              <small>Leave as default to restore to original location</small>
            </div>

            <div className="form-group">
              <label htmlFor="restore-reason">Reason (optional):</label>
              <textarea
                id="restore-reason"
                value={restoreModal.reason}
                onChange={(e) => setRestoreModal({ ...restoreModal, reason: e.target.value })}
                placeholder="Why are you restoring this file?"
                rows="3"
              />
            </div>

            <div className="modal-actions">
              <button 
                className="btn-primary"
                onClick={handleRestoreSubmit}
                disabled={restoringId}
              >
                {restoringId ? 'Restoring...' : 'Restore File'}
              </button>
              <button 
                className="btn-secondary"
                onClick={() => setRestoreModal(null)}
                disabled={restoringId}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchivedFiles;
