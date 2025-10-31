import React, { useState, useEffect } from 'react';
import { FiClock, FiAlertCircle, FiCheckCircle, FiArrowRight, FiExternalLink } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { getFileSchemaHistory } from '../api/fileService';
import { formatDate } from '../utils/formatters';
import LoadingSpinner from './LoadingSpinner';
import './SchemaHistoryTab.css';

function SchemaHistoryTab({ fileId }) {
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (fileId) {
      fetchSchemaHistory();
    }
  }, [fileId]);

  const fetchSchemaHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getFileSchemaHistory(fileId);
      setHistoryData(data);
    } catch (err) {
      console.error('Error fetching schema history:', err);
      setError(err.message || 'Failed to load schema history');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="schema-history-loading">
        <LoadingSpinner />
        <p>Loading schema history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="schema-history-error">
        <FiAlertCircle size={48} />
        <h3>Error Loading Schema History</h3>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={fetchSchemaHistory}>
          Retry
        </button>
      </div>
    );
  }

  if (!historyData?.hasHistory) {
    return (
      <div className="schema-history-empty">
        <FiClock size={48} />
        <h3>No Schema History Available</h3>
        <p>This file doesn't have any schema history yet. Schema changes will be tracked automatically as the file is transformed or updated.</p>
      </div>
    );
  }

  const { current, previous, comparison, hasPrevious, driftAction, transformationJobId, totalSnapshots } = historyData;

  const getDiffBadgeClass = (type) => {
    switch (type) {
      case 'added': return 'diff-badge-added';
      case 'removed': return 'diff-badge-removed';
      case 'modified': return 'diff-badge-modified';
      case 'reordered': return 'diff-badge-reordered';
      default: return '';
    }
  };

  const getDriftActionBadge = (action) => {
    if (!action) return null;
    
    const badges = {
      abort: { text: 'Abort on Drift', class: 'drift-abort', icon: <FiAlertCircle /> },
      alert: { text: 'Alert on Drift', class: 'drift-alert', icon: <FiCheckCircle /> },
      none: { text: 'Ignore Drift', class: 'drift-none', icon: <FiCheckCircle /> }
    };
    
    const badge = badges[action.toLowerCase()] || badges.none;
    
    return (
      <span className={`drift-action-badge ${badge.class}`}>
        {badge.icon}
        {badge.text}
      </span>
    );
  };

  return (
    <div className="schema-history-container">
      <div className="schema-history-header">
        <div className="history-title">
          <FiClock size={24} />
          <h2>Schema History</h2>
        </div>
        <div className="history-meta">
          <span className="snapshot-count">{totalSnapshots} snapshot{totalSnapshots !== 1 ? 's' : ''} recorded</span>
          {driftAction && getDriftActionBadge(driftAction)}
          {transformationJobId && (
            <Link to={`/jobs/${transformationJobId}`} className="job-link">
              <FiExternalLink size={14} />
              View Transformation Job
            </Link>
          )}
        </div>
      </div>

      {!hasPrevious ? (
        <div className="schema-single">
          <div className="schema-section">
            <h3>Current Schema</h3>
            <div className="schema-info">
              <p className="capture-date">
                <FiClock size={14} />
                Captured: {formatDate(current.capturedAt)}
              </p>
              <p className="schema-stats">
                {current.columnCount} columns • {current.rowCount?.toLocaleString() || 'N/A'} rows
              </p>
            </div>
            <div className="schema-table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Column Name</th>
                    <th>Data Type</th>
                    <th>Nullable</th>
                  </tr>
                </thead>
                <tbody>
                  {current.schema.columns.map((col, index) => (
                    <tr key={index}>
                      <td>{col.index !== undefined ? col.index + 1 : index + 1}</td>
                      <td className="column-name">{col.name}</td>
                      <td><span className="type-badge">{col.type}</span></td>
                      <td>{col.nullable ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="schema-comparison">
          {/* Previous Schema */}
          <div className="schema-section schema-previous">
            <h3>Previous Schema</h3>
            <div className="schema-info">
              <p className="capture-date">
                <FiClock size={14} />
                {formatDate(previous.capturedAt)}
              </p>
              <p className="schema-stats">
                {previous.columnCount} columns • {previous.rowCount?.toLocaleString() || 'N/A'} rows
              </p>
            </div>
            <div className="schema-table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Column Name</th>
                    <th>Data Type</th>
                  </tr>
                </thead>
                <tbody>
                  {previous.schema.columns.map((col, index) => {
                    const isRemoved = comparison?.removedColumns?.some(c => c.name === col.name);
                    return (
                      <tr key={index} className={isRemoved ? 'row-removed' : ''}>
                        <td>{col.index !== undefined ? col.index + 1 : index + 1}</td>
                        <td className="column-name">
                          {col.name}
                          {isRemoved && <span className={getDiffBadgeClass('removed')}>Removed</span>}
                        </td>
                        <td><span className="type-badge">{col.type}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Comparison Summary */}
          <div className="schema-diff-summary">
            <FiArrowRight size={32} className="diff-arrow" />
            {comparison?.hasChanges ? (
              <div className="diff-stats">
                <h4>Changes Detected</h4>
                {comparison.addedColumns?.length > 0 && (
                  <div className="diff-stat">
                    <span className={getDiffBadgeClass('added')}>
                      +{comparison.addedColumns.length} Added
                    </span>
                  </div>
                )}
                {comparison.removedColumns?.length > 0 && (
                  <div className="diff-stat">
                    <span className={getDiffBadgeClass('removed')}>
                      -{comparison.removedColumns.length} Removed
                    </span>
                  </div>
                )}
                {comparison.modifiedColumns?.length > 0 && (
                  <div className="diff-stat">
                    <span className={getDiffBadgeClass('modified')}>
                      ~{comparison.modifiedColumns.length} Modified
                    </span>
                  </div>
                )}
                {comparison.reorderedColumns?.length > 0 && (
                  <div className="diff-stat">
                    <span className={getDiffBadgeClass('reordered')}>
                      ↕{comparison.reorderedColumns.length} Reordered
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="diff-stats">
                <FiCheckCircle size={24} className="no-changes-icon" />
                <p>No changes detected</p>
              </div>
            )}
          </div>

          {/* Current Schema */}
          <div className="schema-section schema-current">
            <h3>Current Schema</h3>
            <div className="schema-info">
              <p className="capture-date">
                <FiClock size={14} />
                {formatDate(current.capturedAt)}
              </p>
              <p className="schema-stats">
                {current.columnCount} columns • {current.rowCount?.toLocaleString() || 'N/A'} rows
              </p>
            </div>
            <div className="schema-table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Column Name</th>
                    <th>Data Type</th>
                  </tr>
                </thead>
                <tbody>
                  {current.schema.columns.map((col, index) => {
                    const isAdded = comparison?.addedColumns?.some(c => c.name === col.name);
                    const isModified = comparison?.modifiedColumns?.some(c => c.name === col.name);
                    const isReordered = comparison?.reorderedColumns?.some(c => c.name === col.name);
                    
                    let diffClass = '';
                    let diffBadge = null;
                    
                    if (isAdded) {
                      diffClass = 'row-added';
                      diffBadge = <span className={getDiffBadgeClass('added')}>New</span>;
                    } else if (isModified) {
                      diffClass = 'row-modified';
                      const modifiedCol = comparison.modifiedColumns.find(c => c.name === col.name);
                      diffBadge = <span className={getDiffBadgeClass('modified')}>Type Changed: {modifiedCol?.previousType} → {modifiedCol?.currentType}</span>;
                    } else if (isReordered) {
                      diffClass = 'row-reordered';
                      diffBadge = <span className={getDiffBadgeClass('reordered')}>Reordered</span>;
                    }
                    
                    return (
                      <tr key={index} className={diffClass}>
                        <td>{col.index !== undefined ? col.index + 1 : index + 1}</td>
                        <td className="column-name">
                          {col.name}
                          {diffBadge}
                        </td>
                        <td><span className="type-badge">{col.type}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SchemaHistoryTab;
