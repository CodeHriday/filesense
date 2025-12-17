import React, { useState, useEffect } from 'react';
import { FiRefreshCw, FiKey, FiTrash2, FiFilter, FiAlertCircle } from 'react-icons/fi';
import axios from 'axios';
import PageLayout from '../components/PageLayout';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { useToast } from '../context/ToastContext';
import '../styles/FailedJobs.css';
import PropTypes from 'prop-types';


const FailedJobs = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalJobs, setTotalJobs] = useState(0);
  const [filters, setFilters] = useState({
    status: '',
    errorCode: '',
    fromDate: '',
    toDate: ''
  });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [password, setPassword] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const { addToast } = useToast();

  // Safe JSON parser with fallback to prevent render crashes
  const safeParsePayload = (payload) => {
    if (!payload) return {};
    
    try {
      return typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch (error) {
      console.error('Failed to parse DLQ job payload:', error);
      return {};
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [page, filters]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: pageSize,
        ...(filters.status && { status: filters.status }),
        ...(filters.errorCode && { errorCode: filters.errorCode }),
        ...(filters.fromDate && { fromDate: filters.fromDate }),
        ...(filters.toDate && { toDate: filters.toDate })
      });

      const response = await axios.get(`/api/dlq-jobs?${params.toString()}`);
      setJobs(response.data.jobs || []);
      setTotalJobs(response.data.total || 0);
      setError('');
    } catch (err) {
      console.error('Error fetching DLQ jobs:', err);
      setError('Failed to load failed jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (job) => {
    setActionLoading(true);
    try {
      await axios.post(`/api/dlq-jobs/${job.id}/retry`);
      addToast('success', 'Retry Initiated', 'Job retry has been queued successfully');
      fetchJobs();
    } catch (err) {
      console.error('Error retrying job:', err);
      addToast('error', 'Retry Failed', err.response?.data?.error || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleProvidePassword = async () => {
    if (!password || !selectedJob) return;
    
    setActionLoading(true);
    try {
      await axios.post(`/api/dlq-jobs/${selectedJob.id}/provide-password`, { password });
      addToast('success', 'Password Submitted', 'Password provided and extraction retry initiated');
      setShowPasswordModal(false);
      setPassword('');
      setSelectedJob(null);
      fetchJobs();
    } catch (err) {
      console.error('Error providing password:', err);
      addToast('error', 'Password Failed', err.response?.data?.error || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (jobId) => {
    if (!window.confirm('Are you sure you want to delete this job from the DLQ?')) return;

    setActionLoading(true);
    try {
      await axios.delete(`/api/dlq-jobs/${jobId}`);
      addToast('success', 'Job Deleted', 'Failed job removed from DLQ');
      fetchJobs();
    } catch (err) {
      console.error('Error deleting job:', err);
      addToast('error', 'Delete Failed', err.response?.data?.error || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const openPasswordModal = (job) => {
    setSelectedJob(job);
    setShowPasswordModal(true);
    setPassword('');
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      pending: 'badge-warning',
      failed: 'badge-danger',
      resolved: 'badge-success'
    };
    return <span className={`status-badge ${statusColors[status] || 'badge-secondary'}`}>{status}</span>;
  };

  const getErrorCodeBadge = (errorCode) => {
    const errorColors = {
      ARCHIVE_PASSWORD_REQUIRED: 'badge-password',
      INVALID_PASSWORD: 'badge-password',
      FILE_SIZE_EXCEEDED: 'badge-danger',
      UNSUPPORTED_FORMAT: 'badge-warning',
      CORRUPTED_ARCHIVE: 'badge-danger',
      VIRUS_DETECTED: 'badge-danger',
      UNKNOWN_ERROR: 'badge-secondary'
    };
    return <span className={`error-badge ${errorColors[errorCode] || 'badge-secondary'}`}>{errorCode}</span>;
  };

  return (
    <PageLayout title="Failed Archive Extraction Jobs">
      <div className="failed-jobs-container">
        {/* Filters */}
        <div className="filters-section">
          <div className="filter-row">
            <div className="filter-group">
              <label htmlFor="status-select">Status</label>
              <select
                id="status-select"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="error-type-select">Error Type</label>
              <select
                id="error-type-select"
                value={filters.errorCode}
                onChange={(e) => setFilters({ ...filters, errorCode: e.target.value })}
              >
                <option value="">All</option>
                <option value="ARCHIVE_PASSWORD_REQUIRED">Password Required</option>
                <option value="INVALID_PASSWORD">Invalid Password</option>
                <option value="FILE_SIZE_EXCEEDED">File Too Large</option>
                <option value="UNSUPPORTED_FORMAT">Unsupported Format</option>
                <option value="CORRUPTED_ARCHIVE">Corrupted Archive</option>
                <option value="VIRUS_DETECTED">Virus Detected</option>
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="from-date-input">From Date</label>
              <input
                id="from-date-input"
                type="date"
                value={filters.fromDate}
                onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
              />
            </div>

            <div className="filter-group">
              <label htmlFor="to-date-input">To Date</label>
              <input
                id="to-date-input"
                type="date"
                value={filters.toDate}
                onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
              />
            </div>

            <button className="btn-secondary" onClick={fetchJobs}>
              <FiFilter size={16} /> Apply Filters
            </button>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <FiAlertCircle /> {error}
          </div>
        )}

        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            <div className="jobs-table-container">
              <table className="jobs-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>File Name</th>
                    <th>Error Type</th>
                    <th>Error Message</th>
                    <th>Status</th>
                    <th>Retry Count</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>
                        No failed jobs found
                      </td>
                    </tr>
                  ) : (
                    jobs.map(job => {
                      const payload = safeParsePayload(job.original_payload);
                      
                      return (
                        <tr key={job.id}>
                          <td>{job.id}</td>
                          <td>
                            {payload.archiveFileId || 'N/A'}
                          </td>
                          <td>{getErrorCodeBadge(job.error_code)}</td>
                          <td>
                            <div className="error-message-cell">
                              {job.error_message}
                              {job.remediation_instructions && (
                                <div className="remediation-hint">
                                  <small>{job.remediation_instructions}</small>
                                </div>
                              )}
                            </div>
                          </td>
                          <td>{getStatusBadge(job.status)}</td>
                          <td>{job.retry_count || 0}</td>
                          <td>{new Date(job.created_at).toLocaleString()}</td>
                          <td>
                            <div className="action-buttons">
                              {(job.error_code === 'ARCHIVE_PASSWORD_REQUIRED' || job.error_code === 'INVALID_PASSWORD') && job.status !== 'resolved' && (
                                <button
                                  className="btn-icon btn-password"
                                  onClick={() => openPasswordModal(job)}
                                  title="Provide Password"
                                  disabled={actionLoading}
                                >
                                  <FiKey size={16} />
                                </button>
                              )}
                              {job.status !== 'resolved' && (
                                <button
                                  className="btn-icon btn-retry"
                                  onClick={() => handleRetry(job)}
                                  title="Retry"
                                  disabled={actionLoading}
                                >
                                  <FiRefreshCw size={16} />
                                </button>
                              )}
                              <button
                                className="btn-icon btn-delete"
                                onClick={() => handleDelete(job.id)}
                                title="Delete"
                                disabled={actionLoading}
                              >
                                <FiTrash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={page}
              totalPages={Math.ceil(totalJobs / pageSize)}
              onPageChange={setPage}
            />
          </>
        )}

        {/* Password Modal */}
        {showPasswordModal && selectedJob && (
          <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Provide Archive Password</h3>
              <p>
                <strong>File ID:</strong> {safeParsePayload(selectedJob.original_payload).archiveFileId || 'N/A'}
              </p>
              <p className="remediation-text">{selectedJob.remediation_instructions}</p>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter archive password"
                  onKeyPress={(e) => e.key === 'Enter' && handleProvidePassword()}
                />
              </div>
              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPassword('');
                  }}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={handleProvidePassword}
                  disabled={!password || actionLoading}
                >
                  {actionLoading ? 'Processing...' : 'Submit & Retry'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default FailedJobs;
