import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FiRefreshCw } from 'react-icons/fi';
import './Anomalies.css';
import HealingRecommendations from '../components/HealingRecommendations';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const Anomalies = () => {
  const [anomalies, setAnomalies] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [filters, setFilters] = useState({
    severity: '',
    status: 'open',
    anomaly_type: '',
    limit: 100
  });

  // Resolution modal
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolving, setResolving] = useState(false);
  
  // Recommendations modal
  const [recommendationsAnomaly, setRecommendationsAnomaly] = useState(null);

  const fetchAnomalies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (filters.severity) params.append('severity', filters.severity);
      if (filters.status) params.append('status', filters.status);
      if (filters.anomaly_type) params.append('anomaly_type', filters.anomaly_type);
      params.append('limit', filters.limit);
      
      const response = await axios.get(`${API_BASE_URL}/api/ml/anomalies?${params.toString()}`);
      setAnomalies(response.data.anomalies || []);
    } catch (err) {
      console.error('Error fetching anomalies:', err);
      setError(err.response?.data?.error || 'Failed to fetch anomalies');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchStatistics = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/ml/anomalies/statistics`);
      setStatistics(response.data);
    } catch (err) {
      console.error('Error fetching statistics:', err);
    }
  }, []);

  useEffect(() => {
    fetchAnomalies();
    fetchStatistics();
  }, [fetchAnomalies, fetchStatistics]);

  const handleRefresh = useCallback(() => {
    fetchAnomalies();
    fetchStatistics();
  }, [fetchAnomalies, fetchStatistics]);

  const handleResolve = async () => {
    if (!selectedAnomaly || !resolutionNotes.trim()) {
      alert('Please enter resolution notes');
      return;
    }

    try {
      setResolving(true);
      await axios.post(`${API_BASE_URL}/api/ml/anomalies/${selectedAnomaly.anomaly_id}/resolve`, {
        resolution_notes: resolutionNotes
      });
      
      setSelectedAnomaly(null);
      setResolutionNotes('');
      fetchAnomalies();
      fetchStatistics();
    } catch (err) {
      console.error('Error resolving anomaly:', err);
      alert(err.response?.data?.error || 'Failed to resolve anomaly');
    } finally {
      setResolving(false);
    }
  };

  const getSeverityBadgeClass = (severity) => {
    const classes = {
      critical: 'badge-critical',
      high: 'badge-high',
      medium: 'badge-medium',
      low: 'badge-low'
    };
    return classes[severity] || 'badge-default';
  };

  const getStatusBadgeClass = (status) => {
    return status === 'open' ? 'badge-status-open' : 'badge-status-resolved';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="anomalies-container">
      <div className="anomalies-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1>Anomaly Detection</h1>
          <button 
            className="gps-btn gps-btn-secondary" 
            onClick={handleRefresh} 
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FiRefreshCw className={loading ? 'spinning' : ''} /> Refresh
          </button>
        </div>
        <p>ML-based anomaly detection for data quality monitoring</p>
      </div>

      {statistics && (
        <div className="anomaly-statistics">
          <div className="stat-card">
            <div className="stat-value">{statistics.total_open || 0}</div>
            <div className="stat-label">Open Anomalies</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{statistics.total_resolved || 0}</div>
            <div className="stat-label">Resolved</div>
          </div>
          <div className="stat-card severity-critical">
            <div className="stat-value">{statistics.by_severity?.critical || 0}</div>
            <div className="stat-label">Critical</div>
          </div>
          <div className="stat-card severity-high">
            <div className="stat-value">{statistics.by_severity?.high || 0}</div>
            <div className="stat-label">High</div>
          </div>
          <div className="stat-card severity-medium">
            <div className="stat-value">{statistics.by_severity?.medium || 0}</div>
            <div className="stat-label">Medium</div>
          </div>
        </div>
      )}

      <div className="anomaly-filters">
        <div className="filter-group">
          <label htmlFor="severity-filter">Severity:</label>
          <select 
            id="severity-filter"
            value={filters.severity} 
            onChange={(e) => setFilters({...filters, severity: e.target.value})}
          >
            <option value="">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="status-filter">Status:</label>
          <select 
            id="status-filter"
            value={filters.status} 
            onChange={(e) => setFilters({...filters, status: e.target.value})}
          >
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="type-filter">Type:</label>
          <select 
            id="type-filter"
            value={filters.anomaly_type} 
            onChange={(e) => setFilters({...filters, anomaly_type: e.target.value})}
          >
            <option value="">All Types</option>
            <option value="statistical_outlier">Statistical Outlier</option>
            <option value="range_violation">Range Violation</option>
            <option value="trend_deviation">Trend Deviation</option>
            <option value="quality_degradation">Quality Degradation</option>
            <option value="schema_mismatch">Schema Mismatch</option>
          </select>
        </div>

        <button className="btn-refresh" onClick={fetchAnomalies}>
          Refresh
        </button>
      </div>

      {loading && <div className="loading">Loading anomalies...</div>}
      {error && <div className="error-message">{error}</div>}

      {!loading && !error && (
        <div className="anomaly-list">
          {anomalies.length === 0 ? (
            <div className="no-data">No anomalies found</div>
          ) : (
            <table className="anomaly-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>File</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Deviation</th>
                  <th>Detected</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((anomaly) => (
                  <tr key={anomaly.anomaly_id}>
                    <td>
                      <span className={`badge ${getSeverityBadgeClass(anomaly.severity)}`}>
                        {anomaly.severity}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(anomaly.status)}`}>
                        {anomaly.status}
                      </span>
                    </td>
                    <td className="anomaly-type">{anomaly.anomaly_type?.replace(/_/g, ' ')}</td>
                    <td className="anomaly-title">{anomaly.title}</td>
                    <td className="file-name">{anomaly.file_name}</td>
                    <td>{anomaly.expected_value}</td>
                    <td>{anomaly.actual_value}</td>
                    <td>
                      {anomaly.deviation_percentage ? `${anomaly.deviation_percentage}%` : '-'}
                    </td>
                    <td className="detected-date">{formatDate(anomaly.detected_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {anomaly.status === 'open' && (
                          <button 
                            className="btn-resolve"
                            onClick={() => setSelectedAnomaly(anomaly)}
                          >
                            Resolve
                          </button>
                        )}
                        <button 
                          className="btn-secondary"
                          onClick={() => setRecommendationsAnomaly(anomaly)}
                          title="View healing recommendations"
                        >
                          💡 Recommendations
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selectedAnomaly && (
        <div className="modal-overlay" onClick={() => setSelectedAnomaly(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Resolve Anomaly</h2>
            
            <div className="anomaly-details">
              <p><strong>Title:</strong> {selectedAnomaly.title}</p>
              <p><strong>Description:</strong> {selectedAnomaly.description}</p>
              <p><strong>File:</strong> {selectedAnomaly.file_name}</p>
              <p><strong>Type:</strong> {selectedAnomaly.anomaly_type?.replace(/_/g, ' ')}</p>
              <p><strong>Severity:</strong> {selectedAnomaly.severity}</p>
            </div>

            <div className="form-group">
              <label htmlFor="resolution-notes">Resolution Notes:</label>
              <textarea
                id="resolution-notes"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Describe how this anomaly was resolved..."
                rows="4"
              />
            </div>

            <div className="modal-actions">
              <button 
                className="btn-primary" 
                onClick={handleResolve}
                disabled={resolving || !resolutionNotes.trim()}
              >
                {resolving ? 'Resolving...' : 'Resolve Anomaly'}
              </button>
              <button 
                className="btn-secondary" 
                onClick={() => {
                  setSelectedAnomaly(null);
                  setResolutionNotes('');
                }}
                disabled={resolving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {recommendationsAnomaly && (
        <div className="modal-overlay" onClick={() => setRecommendationsAnomaly(null)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2>Healing Recommendations</h2>
              <button 
                className="btn-close"
                onClick={() => setRecommendationsAnomaly(null)}
                style={{ fontSize: '24px', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            
            <div className="anomaly-details" style={{ marginBottom: '24px' }}>
              <p><strong>Title:</strong> {recommendationsAnomaly.title}</p>
              <p><strong>File:</strong> {recommendationsAnomaly.file_name}</p>
              <p><strong>Type:</strong> {recommendationsAnomaly.anomaly_type?.replace(/_/g, ' ')}</p>
              <p><strong>Severity:</strong> {recommendationsAnomaly.severity}</p>
            </div>

            <HealingRecommendations 
              anomalyId={recommendationsAnomaly.anomaly_id} 
              anomaly={recommendationsAnomaly}
            />
          </div>
        </div>
      )}
    </div>
  );
};


export default Anomalies;
