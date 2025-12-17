import React, { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import axios from 'axios';
import LoadingSpinner from './LoadingSpinner';
import { formatBytes, formatDate, formatNumber } from '../utils/formatters';
import '../styles/global-page-styles.css';
import './TransformationProfilingModal.css';
import PropTypes from 'prop-types';


const TransformationProfilingModal = ({ jobId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [parentTab, setParentTab] = useState('source'); // 'source' or 'target'
  const [childTab, setChildTab] = useState('attributes'); // 'attributes' or 'profile'
  const [sourceData, setSourceData] = useState(null);
  const [targetData, setTargetData] = useState(null);

  useEffect(() => {
    fetchProfilingData();
  }, [jobId]);

  const fetchProfilingData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Fetch profiling data directly from the new endpoint
      const response = await axios.get(`/api/jobs/${jobId}/profiling`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSourceData(response.data.source);
      setTargetData(response.data.target);
      setError(null);
    } catch (err) {
      console.error('Error fetching profiling data:', err);
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load profiling data');
    } finally {
      setLoading(false);
    }
  };

  const renderFileAttributes = (data) => {
    if (!data) return <div>No data available</div>;

    return (
      <div className="profile-attributes">
        <div className="attr-grid">
          <div className="attr-item">
            <label htmlFor={`tp-file-name-${jobId}-${data.file_id || 'unknown'}`}>File Name</label>
            <div id={`tp-file-name-${jobId}-${data.file_id || 'unknown'}`}>{data.filename || '-'}</div>
          </div>
          <div className="attr-item">
            <label htmlFor={`tp-file-type-${jobId}-${data.file_id || 'unknown'}`}>File Type</label>
            <div id={`tp-file-type-${jobId}-${data.file_id || 'unknown'}`}>{data.file_type?.toUpperCase() || '-'}</div>
          </div>
          <div className="attr-item">
            <label htmlFor={`tp-file-size-${jobId}-${data.file_id || 'unknown'}`}>File Size</label>
            <div id={`tp-file-size-${jobId}-${data.file_id || 'unknown'}`}>{formatBytes(parseInt(data.file_size) || 0)}</div>
          </div>
          <div className="attr-item">
            <label htmlFor={`tp-row-count-${jobId}-${data.file_id || 'unknown'}`}>Row Count</label>
            <div id={`tp-row-count-${jobId}-${data.file_id || 'unknown'}`}>{formatNumber(data.row_count || 0)}</div>
          </div>
          <div className="attr-item">
            <label htmlFor={`tp-column-count-${jobId}-${data.file_id || 'unknown'}`}>Column Count</label>
            <div id={`tp-column-count-${jobId}-${data.file_id || 'unknown'}`}>{data.column_count || '-'}</div>
          </div>
          <div className="attr-item">
            <label htmlFor={`tp-quality-score-${jobId}-${data.file_id || 'unknown'}`}>Quality Score</label>
            <div id={`tp-quality-score-${jobId}-${data.file_id || 'unknown'}`}>{data.quality_score ? `${parseFloat(data.quality_score).toFixed(2)}%` : '-'}</div>
          </div>
          <div className="attr-item">
            <label htmlFor={`tp-created-date-${jobId}-${data.file_id || 'unknown'}`}>Created Date</label>
            <div id={`tp-created-date-${jobId}-${data.file_id || 'unknown'}`}>{formatDate(data.created_at)}</div>
          </div>
          <div className="attr-item">
            <label htmlFor={`tp-file-id-${jobId}-${data.file_id || 'unknown'}`}>File ID</label>
            <div id={`tp-file-id-${jobId}-${data.file_id || 'unknown'}`} style={{ wordBreak: 'break-all', fontSize: '12px' }}>{data.file_id || '-'}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderFileProfile = (data) => {
    if (!data) return <div>No profile data available</div>;

    // column_stats is already a parsed object from the API
    const columns = data.column_stats || [];

    if (columns.length === 0) {
      return <div>No column profiling data available for this file</div>;
    }

    return (
      <div className="profile-columns">
        <table className="data-table">
          <thead>
            <tr>
              <th>Column Name</th>
              <th>Data Type</th>
              <th>Unique Values</th>
              <th>Null %</th>
              <th>Min/Max</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col, idx) => (
              <tr key={idx}>
                <td>{col.column_name || '-'}</td>
                <td>{col.column_type || '-'}</td>
                <td>{col.unique_count || '-'}</td>
                <td>{col.null_percentage ? `${parseFloat(col.null_percentage).toFixed(1)}%` : '0%'}</td>
                <td>
                  {col.min_value || col.max_value
                    ? `${col.min_value || col.min_value_decimal || '-'} / ${col.max_value || col.max_value_decimal || '-'}`
                    : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-container" onClick={(e) => e.stopPropagation()}>
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  const currentData = parentTab === 'source' ? sourceData : targetData;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container transformation-profiling-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Transformation Profiling Results</h2>
          <button className="modal-close" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="alert alert-danger">{error}</div>
          )}

          {/* Parent Tabs: Source / Target */}
          <div className="parent-tabs">
            <button
              className={`parent-tab ${parentTab === 'source' ? 'active' : ''}`}
              onClick={() => setParentTab('source')}
            >
              Source File
            </button>
            <button
              className={`parent-tab ${parentTab === 'target' ? 'active' : ''}`}
              onClick={() => setParentTab('target')}
            >
              Target File
            </button>
          </div>

          {/* Child Tabs: File Attributes / File Profile */}
          <div className="child-tabs">
            <button
              className={`child-tab ${childTab === 'attributes' ? 'active' : ''}`}
              onClick={() => setChildTab('attributes')}
            >
              File Attributes
            </button>
            <button
              className={`child-tab ${childTab === 'profile' ? 'active' : ''}`}
              onClick={() => setChildTab('profile')}
            >
              File Profile
            </button>
          </div>

          {/* Content Area */}
          <div className="tab-content">
            {childTab === 'attributes' && renderFileAttributes(currentData)}
            {childTab === 'profile' && renderFileProfile(currentData)}
          </div>
        </div>
      </div>
    </div>
  );
};
TransformationProfilingModal.propTypes = {
  jobId: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]).isRequired,

  onClose: PropTypes.func.isRequired
};

export default TransformationProfilingModal;
