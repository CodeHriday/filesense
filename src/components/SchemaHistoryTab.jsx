import React, { useState, useEffect, useMemo } from 'react';
import { FiClock, FiAlertCircle, FiCheckCircle, FiArrowRight, FiExternalLink, FiX } from 'react-icons/fi';
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
  const [selectedCompareSnapshot, setSelectedCompareSnapshot] = useState(null);

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
      setSelectedCompareSnapshot(null);
    } catch (err) {
      console.error('Error fetching schema history:', err);
      setError(err.message || 'Failed to load schema history');
    } finally {
      setLoading(false);
    }
  };

  const computeComparison = (currentSchema, previousSchema) => {
    if (!currentSchema?.columns || !previousSchema?.columns) {
      return { hasChanges: false };
    }

    const currentCols = currentSchema.columns;
    const previousCols = previousSchema.columns;
    
    const currentColNames = new Set(currentCols.map(c => c.name));
    const previousColNames = new Set(previousCols.map(c => c.name));
    
    const addedColumns = currentCols
      .filter(c => !previousColNames.has(c.name))
      .map(c => ({ name: c.name, currentType: c.type }));
    
    const removedColumns = previousCols
      .filter(c => !currentColNames.has(c.name))
      .map(c => ({ name: c.name, previousType: c.type }));
    
    const modifiedColumns = [];
    const reorderedColumns = [];
    
    currentCols.forEach((currentCol, currentIdx) => {
      const previousCol = previousCols.find(p => p.name === currentCol.name);
      if (previousCol) {
        if (previousCol.type !== currentCol.type) {
          modifiedColumns.push({
            name: currentCol.name,
            previousType: previousCol.type,
            currentType: currentCol.type
          });
        }
        const previousIdx = previousCols.findIndex(p => p.name === currentCol.name);
        if (previousIdx !== currentIdx && previousIdx !== -1) {
          reorderedColumns.push({
            name: currentCol.name,
            previousIndex: previousIdx,
            currentIndex: currentIdx
          });
        }
      }
    });
    
    const hasChanges = addedColumns.length > 0 || 
                       removedColumns.length > 0 || 
                       modifiedColumns.length > 0 || 
                       reorderedColumns.length > 0;
    
    return {
      hasChanges,
      addedColumns,
      removedColumns,
      modifiedColumns,
      reorderedColumns
    };
  };

  const activeComparison = useMemo(() => {
    if (!historyData?.current?.schema || !selectedCompareSnapshot) {
      return historyData?.comparison || null;
    }
    return computeComparison(historyData.current.schema, selectedCompareSnapshot.schema);
  }, [historyData, selectedCompareSnapshot]);

  const activePrevious = useMemo(() => {
    if (selectedCompareSnapshot) {
      return {
        ...selectedCompareSnapshot,
        columnCount: selectedCompareSnapshot.columnCount || selectedCompareSnapshot.schema?.columns?.length || 0,
        rowCount: selectedCompareSnapshot.rowCount
      };
    }
    return historyData?.previous || null;
  }, [historyData, selectedCompareSnapshot]);

  const handleSnapshotClick = (snapshot, idx) => {
    if (idx === 0) {
      setSelectedCompareSnapshot(null);
      return;
    }
    if (selectedCompareSnapshot?.id === snapshot.id) {
      setSelectedCompareSnapshot(null);
    } else {
      setSelectedCompareSnapshot(snapshot);
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

  const renderUploadHistory = () => {
    if (!allSnapshots || allSnapshots.length <= 1) return null;
    
    return (
      <div className="snapshot-history">
        <h4>Upload History</h4>
        {selectedCompareSnapshot && (
          <div className="compare-indicator">
            <span>Comparing current with: {formatDate(selectedCompareSnapshot.capturedAt)}</span>
            <button 
              className="clear-compare-btn"
              onClick={() => setSelectedCompareSnapshot(null)}
              title="Clear comparison"
            >
              <FiX size={14} />
            </button>
          </div>
        )}
        <div className="snapshot-timeline">
          {allSnapshots.map((snapshot, idx) => {
            const isCurrent = idx === 0;
            const isSelected = selectedCompareSnapshot?.id === snapshot.id;
            
            return (
              <div 
                key={snapshot.id} 
                className={`snapshot-item ${isCurrent ? 'snapshot-current' : ''} ${isSelected ? 'snapshot-selected' : ''} ${!isCurrent ? 'snapshot-clickable' : ''}`}
                onClick={() => handleSnapshotClick(snapshot, idx)}
                role={!isCurrent ? "button" : undefined}
                tabIndex={!isCurrent ? 0 : undefined}
                onKeyDown={(e) => {
                  if (!isCurrent && (e.key === 'Enter' || e.key === ' ')) {
                    handleSnapshotClick(snapshot, idx);
                  }
                }}
              >
                <div className="snapshot-marker">{isCurrent ? '●' : isSelected ? '◉' : '○'}</div>
                <div className="snapshot-details">
                  <span className="snapshot-date">
                    {formatDate(snapshot.capturedAt)}
                    {isCurrent && <span className="current-label"> (Current)</span>}
                    {isSelected && <span className="selected-label"> (Comparing)</span>}
                  </span>
                  <span className="snapshot-meta">
                    {snapshot.columnCount} cols • {snapshot.rowCount?.toLocaleString() || 'N/A'} rows
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
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
        {hasSchemaChanged && hasPrevious && comparison?.hasChanges && (
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
      ) : hasPrevious || selectedCompareSnapshot ? (
        <div className="schema-comparison-three-panel">
          {/* Change Summary (Left Panel) */}
          <div className="schema-changes-panel">
            <h3>Change Summary</h3>
            
            {activeComparison?.hasChanges ? (
              <div className="changes-content">
                <div className="change-overview">
                  {activeComparison.addedColumns?.length > 0 && (
                    <div className="change-category">
                      <h4>
                        <span className={getDiffBadgeClass('added')}>
                          +{activeComparison.addedColumns.length} Column{activeComparison.addedColumns.length !== 1 ? 's' : ''} Added
                        </span>
                      </h4>
                      <ul className="change-list">
                        {activeComparison.addedColumns.map((col, idx) => (
                          <li key={idx} className="change-item-added">
                            <strong>{col.name}</strong>
                            <span className="type-badge-small">{col.currentType}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {activeComparison.removedColumns?.length > 0 && (
                    <div className="change-category">
                      <h4>
                        <span className={getDiffBadgeClass('removed')}>
                          -{activeComparison.removedColumns.length} Column{activeComparison.removedColumns.length !== 1 ? 's' : ''} Removed
                        </span>
                      </h4>
                      <ul className="change-list">
                        {activeComparison.removedColumns.map((col, idx) => (
                          <li key={idx} className="change-item-removed">
                            <strong>{col.name}</strong>
                            <span className="type-badge-small">{col.previousType}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {activeComparison.modifiedColumns?.length > 0 && (
                    <div className="change-category">
                      <h4>
                        <span className={getDiffBadgeClass('modified')}>
                          ~{activeComparison.modifiedColumns.length} Column{activeComparison.modifiedColumns.length !== 1 ? 's' : ''} Modified
                        </span>
                      </h4>
                      <ul className="change-list">
                        {activeComparison.modifiedColumns.map((col, idx) => (
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

                  {activeComparison.reorderedColumns?.length > 0 && (
                    <div className="change-category">
                      <h4>
                        <span className={getDiffBadgeClass('reordered')}>
                          ↕{activeComparison.reorderedColumns.length} Column{activeComparison.reorderedColumns.length !== 1 ? 's' : ''} Reordered
                        </span>
                      </h4>
                      <ul className="change-list">
                        {activeComparison.reorderedColumns.map((col, idx) => (
                          <li key={idx} className="change-item-reordered">
                            <strong>{col.name}</strong>
                            <span className="position-change">Position {col.previousIndex + 1} → {col.currentIndex + 1}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {renderUploadHistory()}
              </div>
            ) : (
              <div className="no-changes">
                <FiCheckCircle size={48} className="no-changes-icon" />
                <h4>No Changes Detected</h4>
                <p>The schema is identical to the {selectedCompareSnapshot ? 'selected' : 'previous'} upload.</p>
                {renderUploadHistory()}
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
                    const isAdded = activeComparison?.addedColumns?.some(c => c.name === col.name);
                    const isModified = activeComparison?.modifiedColumns?.some(c => c.name === col.name);
                    
                    let diffClass = '';
                    let diffBadge = null;
                    
                    if (isAdded) {
                      diffClass = 'row-added';
                      diffBadge = <span className={getDiffBadgeClass('added')}>New</span>;
                    } else if (isModified) {
                      diffClass = 'row-modified';
                      const modifiedCol = activeComparison.modifiedColumns.find(c => c.name === col.name);
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

          {/* Previous/Selected Schema (Right Panel) */}
          <div className="schema-section schema-previous">
            <h3>
              {selectedCompareSnapshot ? 'Selected Upload' : 'Previous Schema'}
              {activePrevious?.actualFilename && activePrevious?.actualFilename !== activePrevious?.fileName && (
                <span className="schema-subtitle">{activePrevious.actualFilename}</span>
              )}
            </h3>
            <div className="schema-info">
              <p className="capture-date">
                <FiClock size={14} />
                {formatDate(activePrevious?.capturedAt)}
              </p>
              <p className="schema-stats">
                {activePrevious?.columnCount || activePrevious?.schema?.columns?.length || 0} columns • {activePrevious?.rowCount?.toLocaleString() || 'N/A'} rows
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
                  {(activePrevious?.schema?.columns || []).map((col, index) => {
                    const isRemoved = activeComparison?.removedColumns?.some(c => c.name === col.name);
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
            {renderUploadHistory()}
          </div>
        </div>
      )}
    </div>
  );
}

export default SchemaHistoryTab;
