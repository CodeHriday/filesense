import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaCheckCircle, FaExclamationCircle, FaEnvelope, FaClock, FaFilter, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import PageLayout from '../components/PageLayout';
import './AlertHistory.css';

const AlertHistory = () => {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  
  const [filters, setFilters] = useState({
    policy_id: '',
    status: '',
    entity_type: '',
    start_date: '',
    end_date: ''
  });
  
  const [expandedRun, setExpandedRun] = useState(null);
  const [runDetails, setRunDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState({});
  
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchRuns();
  }, [offset, filters]);

  const fetchRuns = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const params = new URLSearchParams({
        limit,
        offset,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== ''))
      });
      
      const response = await axios.get(`/api/alert-history/runs?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setRuns(response.data.runs);
        setTotal(response.data.total);
      } else {
        setError(response.data.error || 'Failed to fetch alert history');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch alert history');
    } finally {
      setLoading(false);
    }
  };

  const fetchRunDetails = async (runId) => {
    try {
      setLoadingDetails(prev => ({ ...prev, [runId]: true }));
      const token = localStorage.getItem('token');
      
      const [detailsRes, eventsRes] = await Promise.all([
        axios.get(`/api/alert-history/runs/${runId}/delivery-details`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`/api/alert-history/runs/${runId}/events`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      if (detailsRes.data.success && eventsRes.data.success) {
        setRunDetails(prev => ({
          ...prev,
          [runId]: {
            ...detailsRes.data,
            events: eventsRes.data.events
          }
        }));
      }
    } catch (err) {
      console.error('Failed to fetch run details:', err);
    } finally {
      setLoadingDetails(prev => ({ ...prev, [runId]: false }));
    }
  };

  const toggleRunExpand = async (runId) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
    } else {
      setExpandedRun(runId);
      if (!runDetails[runId]) {
        await fetchRunDetails(runId);
      }
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setOffset(0);
  };

  const clearFilters = () => {
    setFilters({
      policy_id: '',
      status: '',
      entity_type: '',
      start_date: '',
      end_date: ''
    });
    setOffset(0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'delivered':
      case 'sent':
        return <FaCheckCircle className="status-icon success" />;
      case 'failed':
      case 'error':
        return <FaExclamationCircle className="status-icon error" />;
      default:
        return <FaClock className="status-icon pending" />;
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'delivered':
      case 'sent':
        return 'status-badge success';
      case 'failed':
      case 'error':
        return 'status-badge error';
      default:
        return 'status-badge pending';
    }
  };

  const renderEventsSummary = (run) => {
    if (!run.events_summary || run.events_summary.length === 0 || !run.events_summary[0].entity_type) {
      return <span className="text-muted">No events</span>;
    }
    
    const entityTypes = [...new Set(run.events_summary.map(e => e.entity_type))];
    const successCount = run.events_summary.filter(e => e.status === 'completed' || e.status === 'success').length;
    const failureCount = run.events_summary.filter(e => e.status === 'failed' || e.status === 'error').length;
    
    return (
      <div className="events-summary">
        <span className="entity-types">{entityTypes.join(', ')}</span>
        <span className="event-counts">
          {successCount > 0 && <span className="success-count">{successCount} success</span>}
          {failureCount > 0 && <span className="failure-count">{failureCount} failed</span>}
        </span>
      </div>
    );
  };

  const renderRunDetails = (run) => {
    const details = runDetails[run.id];
    if (!details) return null;

    return (
      <div className="run-details-expanded">
        <div className="details-section">
          <h4>Delivery Information</h4>
          <div className="details-grid">
          <div className="detail-item">
            <strong>Email Connection:</strong>
            <span>{details.run?.email_connection_name || 'N/A'} ({details.run?.provider_type || 'Unknown'})</span>
          </div>
          <div className="detail-item">
            <strong>Recipients Count:</strong>
            <span>{details.run?.recipients_count || 0}</span>
          </div>
          <div className="detail-item">
            <strong>Sent At:</strong>
            <span>{formatDate(details.run?.sent_at)}</span>
          </div>
          <div className="detail-item">
            <strong>Run Type:</strong>
            <span>{details.run?.run_type || 'N/A'}</span>
          </div>
        </div>
          
          {details.run?.error_message && (
            <div className="error-message-box">
              <strong>Error:</strong> {details.run.error_message}
            </div>
          )}
          
          {details.run?.metadata && Object.keys(details.run.metadata).length > 0 && (
            <div className="metadata-box">
              <strong>Metadata:</strong>
              <pre>{JSON.stringify(details.run.metadata, null, 2)}</pre>
            </div>
          )}
        </div>

        {details.recipients && details.recipients.length > 0 && (
          <div className="details-section">
            <h4>Recipients ({details.recipients.length})</h4>
            <div className="recipients-list">
              {details.recipients.map((recipient, idx) => {
                const recipientKey = recipient.user_email || recipient.email || recipient.username || `recipient-${idx}`;
                return (
                <div key={recipientKey} className="recipient-item">
                  <FaEnvelope className="recipient-icon" />
                  <span>
                    {recipient.recipient_type === 'user' 
                      ? `${recipient.username} (${recipient.user_email})`
                      : recipient.email}
                  </span>
                </div>
              );})}
            </div>
          </div>
        )}

        {details.attachments && details.attachments.length > 0 && (
          <div className="details-section">
            <h4>Attachments ({details.attachments.length})</h4>
            <div className="attachments-list">
              {details.attachments.map((attachment, idx) => {
                const attachmentKey = attachment.filename || attachment.cloud_url || `attachment-${idx}`;
                return (
                <div key={attachmentKey} className="attachment-item">
                  <span className="attachment-name">{attachment.filename}</span>
                  <span className="attachment-size">{(attachment.file_size / 1024).toFixed(2)} KB</span>
                  {attachment.cloud_url && (
                    <a href={attachment.cloud_url} target="_blank" rel="noopener noreferrer" className="attachment-link">
                      View
                    </a>
                  )}
                </div>
              );})}
            </div>
          </div>
        )}

        {details.events && details.events.length > 0 && (
          <div className="details-section">
            <h4>Events ({details.events.length})</h4>
            <div className="events-list">
              {details.events.map((event, idx) => {
                const eventKey = event.id || `${event.entity_id || 'entity'}-${event.occurred_at || idx}-${event.event_type || ''}`;
                return (
                <div key={eventKey} className="event-item">
                  <div className="event-header">
                    {getStatusIcon(event.status)}
                    <span className="event-type">{event.entity_type}</span>
                    <span className="event-id">ID: {event.entity_id}</span>
                    <span className="event-status">{event.event_type}</span>
                  </div>
                  <div className="event-meta">
                    <span className="event-time">{formatDate(event.occurred_at)}</span>
                  </div>
                  {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <div className="event-metadata">
                      <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );})}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <PageLayout title="Alert History" icon={<FaEnvelope />}>
      <div className="alert-history-container">
        <div className="alert-history-header">
          <button 
            className="btn-filter"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FaFilter /> {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>

        {showFilters && (
          <div className="filters-panel">
            <div className="filters-grid">
              <div className="filter-group">
                <label htmlFor="filter-status">Status</label>
                <select 
                  id="filter-status"
                  value={filters.status} 
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                >
                  <option value="">All</option>
                  <option value="delivered">Delivered</option>
                  <option value="sent">Sent</option>
                  <option value="failed">Failed</option>
                  <option value="error">Error</option>
                </select>
              </div>
              
              <div className="filter-group">
                <label htmlFor="filter-entity">Entity Type</label>
                <select 
                  id="filter-entity"
                  value={filters.entity_type} 
                  onChange={(e) => handleFilterChange('entity_type', e.target.value)}
                >
                  <option value="">All</option>
                  <option value="job">Job</option>
                  <option value="workflow">Workflow</option>
                  <option value="mapping_group">Mapping Group</option>
                  <option value="schedule">Schedule</option>
                </select>
              </div>
              
              <div className="filter-group">
                <label htmlFor="filter-start-date">Start Date</label>
                <input 
                  id="filter-start-date"
                  type="datetime-local"
                  value={filters.start_date}
                  onChange={(e) => handleFilterChange('start_date', e.target.value)}
                />
              </div>
              
              <div className="filter-group">
                <label htmlFor="filter-end-date">End Date</label>
                <input 
                  id="filter-end-date"
                  type="datetime-local"
                  value={filters.end_date}
                  onChange={(e) => handleFilterChange('end_date', e.target.value)}
                />
              </div>
            </div>
            
            <button className="btn-clear-filters" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading-spinner">Loading alert history...</div>
        ) : (
          <>
            <div className="runs-list">
              {runs.length === 0 ? (
                <div className="no-data">No alert runs found</div>
              ) : (
                runs.map(run => (
                  <div key={run.id} className="run-card">
                    <div className="run-card-header" onClick={() => toggleRunExpand(run.id)}>
                      <div className="run-info-main">
                        <div className="run-status">
                          {getStatusIcon(run.status)}
                          <span className={getStatusClass(run.status)}>{run.status}</span>
                        </div>
                        <div className="run-policy">
                          <strong>{run.policy_name}</strong>
                          <span className="project-name">{run.project_name}</span>
                        </div>
                      </div>
                      
                      <div className="run-info-secondary">
                        <div className="run-events">
                          {renderEventsSummary(run)}
                        </div>
                        <div className="run-meta">
                          <span className="run-date">{formatDate(run.created_at)}</span>
                          <span className="run-recipients">
                            <FaEnvelope /> {run.recipients_count} recipient{run.recipients_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      
                      <div className="run-expand-icon">
                        {expandedRun === run.id ? <FaChevronUp /> : <FaChevronDown />}
                      </div>
                    </div>
                    
                    {expandedRun === run.id && (
                      <div className="run-card-body">
                        {loadingDetails[run.id] ? (
                          <div className="loading-details">Loading details...</div>
                        ) : (
                          renderRunDetails(run)
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {total > limit && (
              <div className="pagination">
                <button 
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                >
                  Previous
                </button>
                <span>
                  Showing {offset + 1} - {Math.min(offset + limit, total)} of {total}
                </span>
                <button 
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= total}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default AlertHistory;
