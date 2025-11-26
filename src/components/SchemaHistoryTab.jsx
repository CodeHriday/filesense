import React, { useState, useEffect } from 'react';
import { FiClock, FiAlertCircle, FiCheckCircle, FiArrowRight, FiExternalLink } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { getFileSchemaHistory } from '../api/fileService';
import { formatDate } from '../utils/formatters';
import LoadingSpinner from './LoadingSpinner';
import '../styles/global-page-styles.css';
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

  const { 
    current, 
    previous, 
    comparison, 
    hasPrevious, 
    driftAction, 
    transformationJobId, 
    totalSnapshots,
    logicalFileId,
    canonicalName,
    hasSchemaChanged,
    totalUploads,
    allSnapshots,
    isContractUpload,
    contractSchema,
    contractComparison
  } = historyData;

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
      <div className="schema-history-metrics">
        {totalUploads > 1 && (
          <span className="upload-count">
            {totalUploads} upload{totalUploads !== 1 ? 's' : ''} tracked
          </span>
        )}
        <span className="snapshot-count">{totalSnapshots} snapshot{totalSnapshots !== 1 ? 's' : ''} recorded</span>
        {hasSchemaChanged && (
          <span className="schema-changed-badge">
            <FiAlertCircle size={14} />
            Schema Changed
          </span>
        )}
        {driftAction && getDriftActionBadge(driftAction)}
        {transformationJobId && (
          <Link to={`/jobs/${transformationJobId}`} className="job-link">
            <FiExternalLink size={14} />
            View Transformation Job
          </Link>
        )}
      </div>

      {isContractUpload && contractSchema && contractSchema.schema?.columns ? (
        <div className="schema-comparison-three-panel">
          {/* Contract Expected Schema (Left Panel) */}
          <div className="schema-section schema-previous">
            <h3>
              Expected Schema
              <span className="schema-subtitle">{contractSchema.agreementName} - {contractSchema.vendorName}</span>
            </h3>
            <div className="schema-info">
              <p className="schema-stats">
                {contractSchema.schema.columns.length} expected columns
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
                  {contractSchema.schema.columns.map((col, index) => {
                    const isRemoved = contractComparison?.removedColumns?.some(c => c.name === col.name);
                    return (
                      <tr key={index} className={isRemoved ? 'row-removed' : ''}>
                        <td>{col.index !== undefined ? col.index + 1 : index + 1}</td>
                        <td className="column-name">
                          {col.name}
                          {isRemoved && <span className={getDiffBadgeClass('removed')}>Missing</span>}
                        </td>
                        <td><span className="type-badge">{col.type}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Current Schema (Middle Panel) */}
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
                  {current.schema?.columns?.map((col, index) => {
                    const isAdded = contractComparison?.addedColumns?.some(c => c.name === col.name);
                    const isModified = contractComparison?.modifiedColumns?.some(c => c.name === col.name);
                    
                    let diffClass = '';
                    let diffBadge = null;
                    
                    if (isAdded) {
                      diffClass = 'row-added';
                      diffBadge = <span className={getDiffBadgeClass('added')}>Extra Column</span>;
                    } else if (isModified) {
                      diffClass = 'row-modified';
                      const modifiedCol = contractComparison.modifiedColumns.find(c => c.name === col.name);
                      diffBadge = <span className={getDiffBadgeClass('modified')}>Type Mismatch: Expected {modifiedCol?.previousType}, Got {modifiedCol?.currentType}</span>;
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

          {/* Contract Validation Summary (Right Panel) */}
          <div className="schema-changes-panel">
            <h3>Validation Summary</h3>
            
            {!contractSchema?.patternMatched && (
              <div className="validation-alert-warning" style={{
                background: '#fffbeb',
                border: '2px solid #f59e0b',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                color: '#92400e',
                fontSize: '0.85rem'
              }}>
                <FiAlertCircle size={16} style={{ marginRight: '8px', color: '#f59e0b' }} />
                <span>No exact pattern match found. Comparing against latest contract schema.</span>
              </div>
            )}
            
            {contractComparison?.hasChanges ? (
              <div className="changes-content">
                <div className="validation-alert-error">
                  <FiAlertCircle size={24} />
                  <p><strong>Schema Mismatch Detected</strong></p>
                  <p>The uploaded file does not match the expected contract schema.</p>
                </div>
                
                <div className="change-overview">
                  {contractComparison.removedColumns?.length > 0 && (
                    <div className="change-category">
                      <h4>
                        <span className={getDiffBadgeClass('removed')}>
                          {contractComparison.removedColumns.length} Missing Column{contractComparison.removedColumns.length !== 1 ? 's' : ''}
                        </span>
                      </h4>
                      <ul className="change-list">
                        {contractComparison.removedColumns.map((col, idx) => (
                          <li key={idx} className="change-item-removed">
                            <strong>{col.name}</strong>
                            <span className="type-badge-small">{col.previousType}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {contractComparison.addedColumns?.length > 0 && (
                    <div className="change-category">
                      <h4>
                        <span className={getDiffBadgeClass('added')}>
                          {contractComparison.addedColumns.length} Extra Column{contractComparison.addedColumns.length !== 1 ? 's' : ''}
                        </span>
                      </h4>
                      <ul className="change-list">
                        {contractComparison.addedColumns.map((col, idx) => (
                          <li key={idx} className="change-item-added">
                            <strong>{col.name}</strong>
                            <span className="type-badge-small">{col.currentType}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {contractComparison.modifiedColumns?.length > 0 && (
                    <div className="change-category">
                      <h4>
                        <span className={getDiffBadgeClass('modified')}>
                          {contractComparison.modifiedColumns.length} Type Mismatch{contractComparison.modifiedColumns.length !== 1 ? 'es' : ''}
                        </span>
                      </h4>
                      <ul className="change-list">
                        {contractComparison.modifiedColumns.map((col, idx) => (
                          <li key={idx} className="change-item-modified">
                            <strong>{col.name}</strong>
                            <div className="type-change">
                              <span className="type-badge-small">Expected: {col.previousType}</span>
                              <FiArrowRight size={12} />
                              <span className="type-badge-small">Got: {col.currentType}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="no-changes">
                <FiCheckCircle size={48} className="no-changes-icon" />
                <h4>Contract Validated</h4>
                <p>The uploaded file schema matches the expected contract schema perfectly.</p>
              </div>
            )}
          </div>
        </div>
      ) : hasPrevious ? (
        <div className="schema-comparison-three-panel">
          {/* Change Summary (Left Panel) */}
          <div className="schema-changes-panel">
            <h3>Change Summary</h3>
            
            {comparison?.hasChanges ? (
              <div className="changes-content">
                <div className="change-overview">
                  {comparison.addedColumns?.length > 0 && (
                    <div className="change-category">
                      <h4>
                        <span className={getDiffBadgeClass('added')}>
                          +{comparison.addedColumns.length} Column{comparison.addedColumns.length !== 1 ? 's' : ''} Added
                        </span>
                      </h4>
                      <ul className="change-list">
                        {comparison.addedColumns.map((col, idx) => (
                          <li key={idx} className="change-item-added">
                            <strong>{col.name}</strong>
                            <span className="type-badge-small">{col.currentType}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {comparison.removedColumns?.length > 0 && (
                    <div className="change-category">
                      <h4>
                        <span className={getDiffBadgeClass('removed')}>
                          -{comparison.removedColumns.length} Column{comparison.removedColumns.length !== 1 ? 's' : ''} Removed
                        </span>
                      </h4>
                      <ul className="change-list">
                        {comparison.removedColumns.map((col, idx) => (
                          <li key={idx} className="change-item-removed">
                            <strong>{col.name}</strong>
                            <span className="type-badge-small">{col.previousType}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {comparison.modifiedColumns?.length > 0 && (
                    <div className="change-category">
                      <h4>
                        <span className={getDiffBadgeClass('modified')}>
                          ~{comparison.modifiedColumns.length} Column{comparison.modifiedColumns.length !== 1 ? 's' : ''} Modified
                        </span>
                      </h4>
                      <ul className="change-list">
                        {comparison.modifiedColumns.map((col, idx) => (
                          <li key={idx} className="change-item-modified">
                            <strong>{col.name}</strong>
                            <div className="type-change">
                              <span className="type-badge-small">{col.previousType}</span>
                              <FiArrowRight size={12} />
                              <span className="type-badge-small">{col.currentType}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {comparison.reorderedColumns?.length > 0 && (
                    <div className="change-category">
                      <h4>
                        <span className={getDiffBadgeClass('reordered')}>
                          ↕{comparison.reorderedColumns.length} Column{comparison.reorderedColumns.length !== 1 ? 's' : ''} Reordered
                        </span>
                      </h4>
                      <ul className="change-list">
                        {comparison.reorderedColumns.map((col, idx) => (
                          <li key={idx} className="change-item-reordered">
                            <strong>{col.name}</strong>
                            <span className="position-change">Position {col.previousIndex + 1} → {col.currentIndex + 1}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {allSnapshots && allSnapshots.length > 2 && (
                  <div className="snapshot-history">
                    <h4>Upload History</h4>
                    <div className="snapshot-timeline">
                      {allSnapshots.slice(0, 5).map((snapshot, idx) => (
                        <Link 
                          key={snapshot.id} 
                          to={`/files/${snapshot.fileId}`}
                          className={`snapshot-item ${idx === 0 ? 'snapshot-current' : ''}`}
                        >
                          <div className="snapshot-marker">{idx === 0 ? '●' : '○'}</div>
                          <div className="snapshot-details">
                            <span className="snapshot-date">{formatDate(snapshot.capturedAt)}</span>
                            <span className="snapshot-meta">
                              {snapshot.columnCount} cols • {snapshot.rowCount?.toLocaleString() || 'N/A'} rows
                            </span>
                          </div>
                        </Link>
                      ))}
                      {allSnapshots.length > 5 && (
                        <div className="snapshot-more">+ {allSnapshots.length - 5} more upload{allSnapshots.length - 5 !== 1 ? 's' : ''}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-changes">
                <FiCheckCircle size={48} className="no-changes-icon" />
                <h4>No Changes Detected</h4>
                <p>The schema is identical to the previous upload.</p>
                {allSnapshots && allSnapshots.length > 2 && (
                  <div className="snapshot-history">
                    <h4>Upload History</h4>
                    <div className="snapshot-timeline">
                      {allSnapshots.slice(0, 5).map((snapshot, idx) => (
                        <Link 
                          key={snapshot.id} 
                          to={`/files/${snapshot.fileId}`}
                          className={`snapshot-item ${idx === 0 ? 'snapshot-current' : ''}`}
                        >
                          <div className="snapshot-marker">{idx === 0 ? '●' : '○'}</div>
                          <div className="snapshot-details">
                            <span className="snapshot-date">{formatDate(snapshot.capturedAt)}</span>
                            <span className="snapshot-meta">
                              {snapshot.columnCount} cols • {snapshot.rowCount?.toLocaleString() || 'N/A'} rows
                            </span>
                          </div>
                        </Link>
                      ))}
                      {allSnapshots.length > 5 && (
                        <div className="snapshot-more">+ {allSnapshots.length - 5} more upload{allSnapshots.length - 5 !== 1 ? 's' : ''}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Current Schema (Middle Panel) */}
          <div className="schema-section schema-current">
            <h3>
              Current Schema
              {current.actualFilename && current.actualFilename !== current.fileName && (
                <span className="schema-subtitle">{current.actualFilename}</span>
              )}
            </h3>
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
                  {current.schema?.columns?.map((col, index) => {
                    const isAdded = comparison?.addedColumns?.some(c => c.name === col.name);
                    const isModified = comparison?.modifiedColumns?.some(c => c.name === col.name);
                    
                    let diffClass = '';
                    let diffBadge = null;
                    
                    if (isAdded) {
                      diffClass = 'row-added';
                      diffBadge = <span className={getDiffBadgeClass('added')}>New</span>;
                    } else if (isModified) {
                      diffClass = 'row-modified';
                      const modifiedCol = comparison.modifiedColumns.find(c => c.name === col.name);
                      diffBadge = <span className={getDiffBadgeClass('modified')}>Type: {modifiedCol?.previousType} → {modifiedCol?.currentType}</span>;
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

          {/* Previous Schema (Right Panel) */}
          <div className="schema-section schema-previous">
            <h3>
              Previous Schema
              {previous.actualFilename && previous.actualFilename !== previous.fileName && (
                <span className="schema-subtitle">{previous.actualFilename}</span>
              )}
            </h3>
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
                  {previous.schema?.columns?.map((col, index) => {
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
        </div>
      ) : (
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
                  {current.schema?.columns?.map((col, index) => (
                    <tr key={index}>
                      <td>{col.index !== undefined ? col.index + 1 : index + 1}</td>
                      <td className="column-name">{col.name}</td>
                      <td><span className="type-badge">{col.type}</span></td>
                      <td>{col.nullable ? 'Yes' : 'No'}</td>
                    </tr>
                  )) || []}
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
