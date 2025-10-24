import React, { useState, useEffect } from 'react';
import { FaTrash, FaExclamationTriangle, FaCheckCircle } from 'react-icons/fa';
import SystemSettings from '../components/SystemSettings';
import '../styles/SystemCleanup.css';

const SystemCleanup = () => {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [step, setStep] = useState(1); // 1=selection, 2=confirmation, 3=final-confirm, 4=executing, 5=complete
  const [confirmationCode, setConfirmationCode] = useState('');
  const [deletedCounts, setDeletedCounts] = useState(null);
  const [error, setError] = useState(null);

  const categoryDescriptions = {
    files: {
      name: 'Files & Storage',
      description: 'All uploaded files, schemas, columns, and preview data',
      tables: ['files', 'file_columns', 'file_preview_data', 'file_schemas']
    },
    transformations: {
      name: 'Transformations & ETL',
      description: 'All transformation mappings, jobs, logs, profiling metrics, and anomalies',
      tables: ['transformation_mappings', 'transformation_jobs', 'transformation_logs', 'profiling_metrics', 'anomalies']
    },
    workflows: {
      name: 'Workflows & Orchestration',
      description: 'All N-step workflows, workflow steps, mapping groups, and schedules',
      tables: ['n_step_workflows', 'workflow_steps', 'mapping_groups', 'schedules']
    },
    governance: {
      name: 'Data Governance',
      description: 'All governance tags, policies, column assignments, and file ownership',
      tables: ['column_governance_tag_assignments', 'column_policy_assignments', 'file_ownership', 'governance_tags', 'governance_policies']
    },
    audits: {
      name: 'Audit & Monitoring',
      description: 'All audit trails, alert history, and file insights metrics',
      tables: ['file_audit_details', 'alert_history', 'file_pattern_metrics']
    },
    projects: {
      name: 'Projects & Access Control',
      description: 'All projects except Default Project and their members',
      tables: ['projects', 'project_members']
    },
    connections: {
      name: 'Connections',
      description: 'All storage and transformation connections',
      tables: ['storage_connections', 'transform_connections']
    },
    groups: {
      name: 'Groups',
      description: 'All access groups except Default Group, their members, and roles',
      tables: ['access_groups', 'access_group_members', 'access_group_roles']
    }
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  const fetchCounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/cleanup/counts', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch cleanup counts');
      }

      const data = await response.json();
      setCounts(data.counts);
    } catch (error) {
      console.error('Error fetching counts:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryToggle = (category) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  const getTotalRecords = (category) => {
    if (!counts || !counts[category]) return 0;
    return Object.values(counts[category]).reduce((sum, count) => sum + count, 0);
  };

  const getTotalSelectedRecords = () => {
    return selectedCategories.reduce((sum, cat) => sum + getTotalRecords(cat), 0);
  };

  const handleNext = () => {
    if (step === 1 && selectedCategories.length > 0) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
    } else if (step === 3) {
      setStep(2);
      setConfirmationCode('');
    }
  };

  const handleExecuteCleanup = async () => {
    if (confirmationCode !== 'DELETE ALL DATA') {
      setError('You must type "DELETE ALL DATA" exactly to proceed');
      return;
    }

    try {
      setStep(4);
      setError(null);

      const response = await fetch('/api/admin/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          categories: selectedCategories,
          confirmationCode
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Cleanup failed');
      }

      const data = await response.json();
      setDeletedCounts(data.deletedCounts);
      setStep(5);
      
      // Refresh counts after cleanup
      await fetchCounts();
    } catch (error) {
      console.error('Error executing cleanup:', error);
      setError(error.message);
      setStep(3);
    }
  };

  const handleStartOver = () => {
    setStep(1);
    setSelectedCategories([]);
    setConfirmationCode('');
    setDeletedCounts(null);
    setError(null);
  };

  if (loading) {
    return (
      <div className="system-cleanup-container">
        <div className="cleanup-loading">
          <div className="spinner"></div>
          <p>Loading cleanup data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="system-cleanup-container">
      {/* System Settings Section */}
      <SystemSettings />

      {/* Separator */}
      <div style={{ height: '2rem', borderBottom: '3px solid #e2e8f0', marginBottom: '2rem' }} />

      <div className="cleanup-header">
        <FaTrash className="cleanup-icon" />
        <h1>System Cleanup</h1>
        <p className="cleanup-subtitle">Permanently delete data from selected categories</p>
      </div>

      <div className="cleanup-warning-banner">
        <FaExclamationTriangle />
        <div>
          <strong>Warning:</strong> This operation is irreversible. All data in selected categories will be permanently deleted.
          User accounts, roles, and permissions are preserved.
        </div>
      </div>

      {error && (
        <div className="cleanup-error-banner">
          <FaExclamationTriangle />
          <span>{error}</span>
        </div>
      )}

      {step === 1 && (
        <div className="cleanup-step">
          <h2>Step 1: Select Categories to Clean Up</h2>
          <p className="step-description">Choose which data categories you want to delete</p>

          <div className="cleanup-categories">
            {Object.entries(categoryDescriptions).map(([key, category]) => {
              const totalRecords = getTotalRecords(key);
              const isSelected = selectedCategories.includes(key);

              return (
                <div 
                  key={key} 
                  className={`cleanup-category-card ${isSelected ? 'selected' : ''} ${totalRecords === 0 ? 'empty' : ''}`}
                  onClick={() => totalRecords > 0 && handleCategoryToggle(key)}
                >
                  <div className="category-header">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      disabled={totalRecords === 0}
                    />
                    <h3>{category.name}</h3>
                    <span className="record-count">{totalRecords.toLocaleString()} records</span>
                  </div>
                  <p className="category-description">{category.description}</p>
                  {counts[key] && (
                    <div className="category-tables">
                      {Object.entries(counts[key]).map(([table, count]) => (
                        count > 0 && (
                          <div key={table} className="table-count">
                            <span className="table-name">{table}</span>
                            <span className="count-badge">{count.toLocaleString()}</span>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="cleanup-actions">
            <div className="selected-summary">
              {selectedCategories.length > 0 ? (
                <>
                  <strong>{selectedCategories.length}</strong> categories selected
                  <span className="separator">•</span>
                  <strong>{getTotalSelectedRecords().toLocaleString()}</strong> total records to delete
                </>
              ) : (
                <span className="no-selection">No categories selected</span>
              )}
            </div>
            <button 
              className="btn-primary"
              onClick={handleNext}
              disabled={selectedCategories.length === 0}
            >
              Next: Review Selection
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="cleanup-step">
          <h2>Step 2: Review Your Selection</h2>
          <p className="step-description">Confirm the categories you want to delete</p>

          <div className="review-summary">
            <div className="summary-header">
              <FaExclamationTriangle className="warning-icon" />
              <div>
                <h3>You are about to delete:</h3>
                <p>{getTotalSelectedRecords().toLocaleString()} total records across {selectedCategories.length} categories</p>
              </div>
            </div>

            <div className="review-categories">
              {selectedCategories.map(key => {
                const category = categoryDescriptions[key];
                const totalRecords = getTotalRecords(key);

                return (
                  <div key={key} className="review-category">
                    <div className="review-category-header">
                      <h4>{category.name}</h4>
                      <span className="total-badge">{totalRecords.toLocaleString()} records</span>
                    </div>
                    <p>{category.description}</p>
                    <div className="review-tables">
                      {counts[key] && Object.entries(counts[key]).map(([table, count]) => (
                        count > 0 && (
                          <div key={table} className="review-table">
                            <span>{table}</span>
                            <span>{count.toLocaleString()}</span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="cleanup-actions">
            <button className="btn-secondary" onClick={handleBack}>
              Back to Selection
            </button>
            <button className="btn-danger" onClick={handleNext}>
              Proceed to Final Confirmation
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="cleanup-step">
          <h2>Step 3: Final Confirmation</h2>
          <p className="step-description">Type the confirmation code to proceed with deletion</p>

          <div className="final-confirmation">
            <div className="confirmation-warning">
              <FaExclamationTriangle size={48} />
              <h3>This action cannot be undone!</h3>
              <p>
                You are about to permanently delete <strong>{getTotalSelectedRecords().toLocaleString()} records</strong> from the database.
              </p>
              <p>
                Type <code>DELETE ALL DATA</code> to confirm
              </p>
            </div>

            <div className="confirmation-input-group">
              <label htmlFor="confirmationCode">Confirmation Code:</label>
              <input
                type="text"
                id="confirmationCode"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                placeholder="Type: DELETE ALL DATA"
                className="confirmation-input"
                autoFocus
              />
            </div>

            <div className="confirmation-checklist">
              <p><strong>Before proceeding, confirm that:</strong></p>
              <ul>
                <li>✓ You have reviewed the selected categories</li>
                <li>✓ You understand this operation is irreversible</li>
                <li>✓ You have backed up any data you need to preserve</li>
                <li>✓ You are authorized to perform this operation</li>
              </ul>
            </div>
          </div>

          <div className="cleanup-actions">
            <button className="btn-secondary" onClick={handleBack}>
              Back to Review
            </button>
            <button 
              className="btn-danger"
              onClick={handleExecuteCleanup}
              disabled={confirmationCode !== 'DELETE ALL DATA'}
            >
              Execute Cleanup
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="cleanup-step">
          <div className="cleanup-executing">
            <div className="spinner-large"></div>
            <h2>Executing Cleanup...</h2>
            <p>Please wait while we delete the selected data</p>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="cleanup-step">
          <div className="cleanup-complete">
            <FaCheckCircle size={64} className="success-icon" />
            <h2>Cleanup Complete</h2>
            <p>The selected data has been permanently deleted</p>

            {deletedCounts && (
              <div className="deletion-summary">
                <h3>Deletion Summary:</h3>
                {Object.entries(deletedCounts).map(([category, tables]) => {
                  const totalDeleted = Object.values(tables).reduce((sum, count) => sum + count, 0);
                  if (totalDeleted === 0) return null;

                  return (
                    <div key={category} className="deleted-category">
                      <h4>{categoryDescriptions[category].name}</h4>
                      <div className="deleted-tables">
                        {Object.entries(tables).map(([table, count]) => (
                          count > 0 && (
                            <div key={table} className="deleted-table">
                              <span>{table}</span>
                              <span className="deleted-count">{count.toLocaleString()} deleted</span>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="cleanup-actions">
              <button className="btn-primary" onClick={handleStartOver}>
                Perform Another Cleanup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemCleanup;
