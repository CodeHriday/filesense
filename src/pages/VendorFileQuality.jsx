import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiCheckCircle, FiAlertTriangle, FiXCircle, FiEye, FiDownload } from 'react-icons/fi';
import '../styles/VendorFileQuality.css';

function VendorFileQuality() {
  const [profilingResults, setProfilingResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedResult, setSelectedResult] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    minQualityScore: '',
    maxQualityScore: '',
    hasIssues: false
  });

  useEffect(() => {
    fetchProfilingResults();
  }, [filters]);

  const fetchProfilingResults = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (filters.minQualityScore) params.append('min_quality_score', filters.minQualityScore);
      if (filters.maxQualityScore) params.append('max_quality_score', filters.maxQualityScore);
      if (filters.hasIssues) params.append('has_issues', 'true');
      params.append('limit', '100');
      
      const response = await axios.get(`/api/vendor-file-profiling?${params.toString()}`);
      setProfilingResults(response.data.results || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching profiling results:', err);
      setError('Failed to load profiling results');
    } finally {
      setLoading(false);
    }
  };

  const viewDetails = async (fileId) => {
    try {
      const response = await axios.get(`/api/vendor-file-profiling/${fileId}`);
      setSelectedResult(response.data);
      setShowDetailModal(true);
    } catch (err) {
      console.error('Error fetching profiling details:', err);
      alert('Failed to load profiling details');
    }
  };

  const getQualityColor = (score) => {
    if (!score) return '#999';
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#eab308';
    return '#ef4444';
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'high':
        return <FiXCircle className="severity-icon severity-high" />;
      case 'medium':
        return <FiAlertTriangle className="severity-icon severity-medium" />;
      default:
        return <FiCheckCircle className="severity-icon severity-low" />;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const safeJSONParse = (value, defaultValue = {}) => {
    if (!value) return defaultValue;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return defaultValue;
    if (value.trim() === '') return defaultValue;
    
    try {
      return JSON.parse(value);
    } catch (e) {
      console.warn('Failed to parse JSON:', value, e);
      return defaultValue;
    }
  };

  const exportIssues = (result) => {
    const issues = result.issues || [];
    const csvContent = [
      ['Type', 'Severity', 'Column', 'Message'].join(','),
      ...issues.map(issue => [
        issue.type || '',
        issue.severity || '',
        issue.column || '',
        (issue.message || '').replace(/,/g, ';')
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quality-issues-${result.file_id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="vendor-file-quality-container">
      <div className="vendor-file-quality-header">
        <h1>Vendor File Catalog</h1>
        <p className="subtitle">Quality profiling results for vendor-uploaded files</p>
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label>Min Quality Score</label>
          <input
            type="number"
            min="0"
            max="100"
            value={filters.minQualityScore}
            onChange={(e) => setFilters({ ...filters, minQualityScore: e.target.value })}
            placeholder="0-100"
          />
        </div>
        <div className="filter-group">
          <label>Max Quality Score</label>
          <input
            type="number"
            min="0"
            max="100"
            value={filters.maxQualityScore}
            onChange={(e) => setFilters({ ...filters, maxQualityScore: e.target.value })}
            placeholder="0-100"
          />
        </div>
        <div className="filter-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={filters.hasIssues}
              onChange={(e) => setFilters({ ...filters, hasIssues: e.target.checked })}
            />
            <span>Show only files with issues</span>
          </label>
        </div>
      </div>

      {loading && <div className="loading-message">Loading profiling results...</div>}
      {error && <div className="error-message">{error}</div>}

      {!loading && !error && profilingResults.length === 0 && (
        <div className="empty-state">
          <p>No profiling results found matching your filters.</p>
        </div>
      )}

      {!loading && !error && profilingResults.length > 0 && (
        <div className="results-table-container">
          <table className="results-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Connection</th>
                <th>Vendor</th>
                <th>Quality Score</th>
                <th>Issues</th>
                <th>Uploaded</th>
                <th>Profiled</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {profilingResults.map((result) => {
                const issueCount = safeJSONParse(result.issues, []).length;
                const qualityScore = result.quality_score;

                return (
                  <tr key={result.file_id}>
                    <td className="filename-cell">
                      <div className="filename">{result.filename}</div>
                      <div className="file-meta">{result.file_type?.toUpperCase()} • {(result.file_size / 1024).toFixed(2)} KB</div>
                    </td>
                    <td>
                      <div className="connection-badge">
                        {result.connection_name || 'N/A'}
                      </div>
                    </td>
                    <td>{result.vendor_name || 'N/A'}</td>
                    <td>
                      <div className="quality-score" style={{ color: getQualityColor(qualityScore) }}>
                        {qualityScore ? `${qualityScore.toFixed(1)}%` : 'N/A'}
                      </div>
                    </td>
                    <td>
                      <div className="issues-count">
                        {issueCount > 0 ? (
                          <span className="has-issues">{issueCount} issues</span>
                        ) : (
                          <span className="no-issues">No issues</span>
                        )}
                      </div>
                    </td>
                    <td>{formatDate(result.file_uploaded_at)}</td>
                    <td>{formatDate(result.profiled_at)}</td>
                    <td>
                      <button
                        className="action-btn view-btn"
                        onClick={() => viewDetails(result.file_id)}
                        title="View Details"
                      >
                        <FiEye />
                      </button>
                      {issueCount > 0 && (
                        <button
                          className="action-btn export-btn"
                          onClick={() => exportIssues(result)}
                          title="Export Issues"
                        >
                          <FiDownload />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showDetailModal && selectedResult && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Quality Details: {selectedResult.filename}</h2>
              <button className="close-btn" onClick={() => setShowDetailModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              {/* Quality Score Overview */}
              <div className="detail-section">
                <h3>Quality Scores</h3>
                <div className="scores-grid">
                  <div className="score-card">
                    <div className="score-label">Overall</div>
                    <div className="score-value" style={{ color: getQualityColor(selectedResult.quality_score) }}>
                      {selectedResult.quality_score ? `${selectedResult.quality_score.toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                  <div className="score-card">
                    <div className="score-label">Completeness</div>
                    <div className="score-value">{selectedResult.completeness_score ? `${selectedResult.completeness_score.toFixed(1)}%` : 'N/A'}</div>
                  </div>
                  <div className="score-card">
                    <div className="score-label">Consistency</div>
                    <div className="score-value">{selectedResult.consistency_score ? `${selectedResult.consistency_score.toFixed(1)}%` : 'N/A'}</div>
                  </div>
                  <div className="score-card">
                    <div className="score-label">Validity</div>
                    <div className="score-value">{selectedResult.validity_score ? `${selectedResult.validity_score.toFixed(1)}%` : 'N/A'}</div>
                  </div>
                  <div className="score-card">
                    <div className="score-label">Uniqueness</div>
                    <div className="score-value">{selectedResult.uniqueness_score ? `${selectedResult.uniqueness_score.toFixed(1)}%` : 'N/A'}</div>
                  </div>
                </div>
              </div>

              {/* Issues List */}
              {selectedResult.issues && safeJSONParse(selectedResult.issues, []).length > 0 && (
                <div className="detail-section">
                  <h3>Issues Found ({safeJSONParse(selectedResult.issues, []).length})</h3>
                  <div className="issues-list">
                    {safeJSONParse(selectedResult.issues, []).map((issue, idx) => (
                      <div key={idx} className="issue-item">
                        <div className="issue-header">
                          {getSeverityIcon(issue.severity)}
                          <span className="issue-type">{issue.type}</span>
                          {issue.column && <span className="issue-column">Column: {issue.column}</span>}
                        </div>
                        <div className="issue-message">{issue.message}</div>
                        {issue.recommendation && (
                          <div className="issue-recommendation">💡 {issue.recommendation}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Header Issues */}
              {selectedResult.header_issues && Object.keys(safeJSONParse(selectedResult.header_issues, {})).length > 0 && (
                <div className="detail-section">
                  <h3>Header Issues</h3>
                  <div className="header-issues">
                    {Object.entries(safeJSONParse(selectedResult.header_issues, {})).map(([key, value]) => (
                      <div key={key} className="header-issue-item">
                        <strong>{key}:</strong> {JSON.stringify(value)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* NULL Value Summary */}
              {selectedResult.null_value_summary && Object.keys(safeJSONParse(selectedResult.null_value_summary, {})).length > 0 && (
                <div className="detail-section">
                  <h3>NULL Values Summary</h3>
                  <table className="null-values-table">
                    <thead>
                      <tr>
                        <th>Column</th>
                        <th>Missing Count</th>
                        <th>Missing %</th>
                        <th>Total Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(safeJSONParse(selectedResult.null_value_summary, {})).map(([col, data]) => (
                        <tr key={col}>
                          <td>{col}</td>
                          <td>{data.missing_count}</td>
                          <td>{data.missing_pct?.toFixed(2)}%</td>
                          <td>{data.total_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Date Format Issues */}
              {selectedResult.date_format_issues && Object.keys(safeJSONParse(selectedResult.date_format_issues, {})).length > 0 && (
                <div className="detail-section">
                  <h3>Date Format Inconsistencies</h3>
                  <div className="date-format-issues">
                    {Object.entries(safeJSONParse(selectedResult.date_format_issues, {})).map(([col, data]) => (
                      <div key={col} className="date-issue-item">
                        <strong>{col}:</strong> Found patterns: {data.patterns_found?.join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Duplicate Data */}
              {selectedResult.duplicate_data && Object.keys(safeJSONParse(selectedResult.duplicate_data, {})).length > 0 && (
                <div className="detail-section">
                  <h3>Duplicate Data</h3>
                  <div className="duplicate-summary">
                    {(() => {
                      const dupData = safeJSONParse(selectedResult.duplicate_data, {});
                      return (
                        <>
                          <p>Total Duplicates: {dupData.total_duplicates}</p>
                          <p>Duplicate Percentage: {dupData.duplicate_percentage?.toFixed(2)}%</p>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* File Metadata */}
              <div className="detail-section">
                <h3>File Metadata</h3>
                <div className="metadata-grid">
                  <div><strong>File ID:</strong> {selectedResult.file_id}</div>
                  <div><strong>File Type:</strong> {selectedResult.file_type?.toUpperCase()}</div>
                  <div><strong>File Size:</strong> {(selectedResult.file_size / 1024).toFixed(2)} KB</div>
                  <div><strong>Connection:</strong> {selectedResult.connection_name}</div>
                  <div><strong>Vendor:</strong> {selectedResult.vendor_name}</div>
                  <div><strong>Uploaded By:</strong> {selectedResult.uploaded_by_username}</div>
                  <div><strong>Uploaded At:</strong> {formatDate(selectedResult.file_uploaded_at)}</div>
                  <div><strong>Profiled At:</strong> {formatDate(selectedResult.profiled_at)}</div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowDetailModal(false)}>Close</button>
              <button className="btn-primary" onClick={() => exportIssues(selectedResult)}>
                <FiDownload /> Export Issues
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VendorFileQuality;
