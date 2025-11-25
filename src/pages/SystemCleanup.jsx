import React, { useState, useEffect } from 'react';
import { FaTrash, FaExclamationTriangle, FaCheckCircle } from 'react-icons/fa';
import SystemSettings from '../components/SystemSettings';
import '../styles/global-page-styles.css';

const SystemCleanup = () => {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [step, setStep] = useState(1);
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
      description: 'All audit trails, alert history, file insights, execution logs, and security audit logs',
      tables: ['file_audit_details', 'alert_history', 'file_pattern_metrics', 'execution_audit', 'security_audit_log']
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
    },
    vendors: {
      name: 'Vendors & Agreements',
      description: 'All vendor data including agreements, approvals, changes, documents, profiling results, and vendor users',
      tables: ['vendor_agreements', 'vendor_agreement_approvals', 'vendor_agreement_changes', 'vendor_agreement_documents', 'vendor_file_profiling_results', 'vendor_users', 'vendors']
    },
    dbt: {
      name: 'DBT Integration',
      description: 'All DBT models and execution history',
      tables: ['dbt_models', 'dbt_executions']
    },
    activity: {
      name: 'Notifications & User Activity',
      description: 'All notifications, user sessions, badges, and dashboard settings',
      tables: ['notifications', 'user_sessions', 'user_badges', 'user_dashboard_settings']
    },
    violations: {
      name: 'Quality Violations',
      description: 'All quality rule violations detected during file uploads and transformation jobs',
      tables: ['quality_rule_violations']
    },
    lineage: {
      name: 'Data Lineage',
      description: 'All data lineage records tracking file transformations and data flow',
      tables: ['transformation_lineage']
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
      <div className="gps-page-container">
        <div className="gps-empty-state">
          <div className="gps-spinner"></div>
          <p>Loading cleanup data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gps-page-container">
      <SystemSettings />

      <div className="gps-divider" style={{ marginBottom: '24px' }}></div>

      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">
            <FaTrash style={{ marginRight: '8px', color: '#e53e3e' }} />
            System Cleanup
          </h1>
          <p className="gps-page-subtitle">Permanently delete data from selected categories</p>
        </div>
      </div>

      <div className="gps-alert gps-alert--warning" style={{ marginBottom: '24px' }}>
        <FaExclamationTriangle style={{ marginRight: '8px' }} />
        <div>
          <strong>Warning:</strong> This operation is irreversible. All data in selected categories will be permanently deleted.
          User accounts, roles, and permissions are preserved.
        </div>
      </div>

      {error && (
        <div className="gps-alert gps-alert--error" style={{ marginBottom: '24px' }}>
          <FaExclamationTriangle style={{ marginRight: '8px' }} />
          <span>{error}</span>
        </div>
      )}

      {step === 1 && (
        <div className="gps-section">
          <h2 className="gps-section-title">Step 1: Select Categories to Clean Up</h2>
          <p className="gps-page-subtitle" style={{ marginBottom: '16px' }}>Choose which data categories you want to delete</p>

          <div className="gps-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', marginBottom: '24px' }}>
            {Object.entries(categoryDescriptions).map(([key, category]) => {
              const totalRecords = getTotalRecords(key);
              const isSelected = selectedCategories.includes(key);

              return (
                <div 
                  key={key} 
                  className="gps-stat-card"
                  style={{ 
                    cursor: totalRecords > 0 ? 'pointer' : 'not-allowed',
                    opacity: totalRecords === 0 ? 0.5 : 1,
                    border: isSelected ? '2px solid #025043' : '1px solid #e2e8f0',
                    flexDirection: 'column',
                    alignItems: 'flex-start'
                  }}
                  onClick={() => totalRecords > 0 && handleCategoryToggle(key)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', marginBottom: '8px' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      disabled={totalRecords === 0}
                      style={{ width: '16px', height: '16px' }}
                    />
                    <span style={{ fontWeight: 600, fontSize: '12px', flex: 1 }}>{category.name}</span>
                    <span className={`gps-badge ${totalRecords > 0 ? 'gps-badge--info' : 'gps-badge--muted'}`}>
                      {totalRecords.toLocaleString()} records
                    </span>
                  </div>
                  <p style={{ fontSize: '10px', color: '#666', margin: '0 0 8px 0' }}>{category.description}</p>
                  {counts[key] && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {Object.entries(counts[key]).map(([table, count]) => (
                        count > 0 && (
                          <span key={table} className="gps-badge gps-badge--muted" style={{ fontSize: '9px' }}>
                            {table}: {count.toLocaleString()}
                          </span>
                        )
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <div>
              {selectedCategories.length > 0 ? (
                <>
                  <strong>{selectedCategories.length}</strong> categories selected
                  <span style={{ margin: '0 8px' }}>•</span>
                  <strong>{getTotalSelectedRecords().toLocaleString()}</strong> total records to delete
                </>
              ) : (
                <span className="gps-text-muted">No categories selected</span>
              )}
            </div>
            <button 
              className="gps-btn gps-btn--primary"
              onClick={handleNext}
              disabled={selectedCategories.length === 0}
            >
              Next: Review Selection
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="gps-section">
          <h2 className="gps-section-title">Step 2: Review Your Selection</h2>
          <p className="gps-page-subtitle" style={{ marginBottom: '16px' }}>Confirm the categories you want to delete</p>

          <div className="gps-alert gps-alert--warning" style={{ marginBottom: '24px' }}>
            <FaExclamationTriangle style={{ marginRight: '12px', fontSize: '24px' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '14px' }}>You are about to delete:</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>{getTotalSelectedRecords().toLocaleString()} total records across {selectedCategories.length} categories</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            {selectedCategories.map(key => {
              const category = categoryDescriptions[key];
              const totalRecords = getTotalRecords(key);

              return (
                <div key={key} style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>{category.name}</h4>
                    <span className="gps-badge gps-badge--danger">{totalRecords.toLocaleString()} records</span>
                  </div>
                  <p style={{ fontSize: '10px', color: '#666', margin: '0 0 8px 0' }}>{category.description}</p>
                  <div className="gps-table-container">
                    <table className="gps-table gps-table--compact">
                      <thead>
                        <tr>
                          <th>Table</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {counts[key] && Object.entries(counts[key]).map(([table, count]) => (
                          count > 0 && (
                            <tr key={table}>
                              <td>{table}</td>
                              <td>{count.toLocaleString()}</td>
                            </tr>
                          )
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button className="gps-btn gps-btn--secondary" onClick={handleBack}>
              Back to Selection
            </button>
            <button className="gps-btn gps-btn--danger" onClick={handleNext}>
              Proceed to Final Confirmation
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="gps-section">
          <h2 className="gps-section-title">Step 3: Final Confirmation</h2>
          <p className="gps-page-subtitle" style={{ marginBottom: '16px' }}>Type the confirmation code to proceed with deletion</p>

          <div style={{ textAlign: 'center', padding: '32px', backgroundColor: '#fef2f2', borderRadius: '8px', marginBottom: '24px' }}>
            <FaExclamationTriangle style={{ fontSize: '48px', color: '#e53e3e', marginBottom: '16px' }} />
            <h3 style={{ margin: '0 0 8px 0', color: '#e53e3e' }}>This action cannot be undone!</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px' }}>
              You are about to permanently delete <strong>{getTotalSelectedRecords().toLocaleString()} records</strong> from the database.
            </p>
            <p style={{ margin: 0, fontSize: '12px' }}>
              Type <code style={{ padding: '4px 8px', backgroundColor: '#fee2e2', borderRadius: '4px', fontWeight: 600 }}>DELETE ALL DATA</code> to confirm
            </p>
          </div>

          <div className="gps-form-group" style={{ maxWidth: '400px', margin: '0 auto 24px' }}>
            <label className="gps-label">Confirmation Code:</label>
            <input
              type="text"
              className="gps-input"
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value)}
              placeholder="Type: DELETE ALL DATA"
              autoFocus
            />
          </div>

          <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', marginBottom: '24px' }}>
            <p style={{ fontWeight: 600, marginBottom: '8px', fontSize: '12px' }}>Before proceeding, confirm that:</p>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '10px', color: '#666' }}>
              <li>You have reviewed the selected categories</li>
              <li>You understand this operation is irreversible</li>
              <li>You have backed up any data you need to preserve</li>
              <li>You are authorized to perform this operation</li>
            </ul>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button className="gps-btn gps-btn--secondary" onClick={handleBack}>
              Back to Review
            </button>
            <button 
              className="gps-btn gps-btn--danger"
              onClick={handleExecuteCleanup}
              disabled={confirmationCode !== 'DELETE ALL DATA'}
            >
              Execute Cleanup
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="gps-section">
          <div className="gps-empty-state">
            <div className="gps-spinner"></div>
            <h2>Executing Cleanup...</h2>
            <p>Please wait while we delete the selected data</p>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="gps-section">
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <FaCheckCircle style={{ fontSize: '64px', color: '#16a34a', marginBottom: '16px' }} />
            <h2 style={{ margin: '0 0 8px 0', color: '#16a34a' }}>Cleanup Complete</h2>
            <p style={{ margin: '0 0 24px 0', color: '#666' }}>The selected data has been permanently deleted</p>

            {deletedCounts && (
              <div style={{ textAlign: 'left', maxWidth: '600px', margin: '0 auto 24px' }}>
                <h3 style={{ fontSize: '14px', marginBottom: '16px' }}>Deletion Summary:</h3>
                {Object.entries(deletedCounts).map(([category, tables]) => {
                  const totalDeleted = Object.values(tables).reduce((sum, count) => sum + count, 0);
                  if (totalDeleted === 0) return null;

                  return (
                    <div key={category} style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '12px' }}>{categoryDescriptions[category].name}</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {Object.entries(tables).map(([table, count]) => (
                          count > 0 && (
                            <span key={table} className="gps-badge gps-badge--success" style={{ fontSize: '9px' }}>
                              {table}: {count.toLocaleString()} deleted
                            </span>
                          )
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button className="gps-btn gps-btn--primary" onClick={handleStartOver}>
              Perform Another Cleanup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemCleanup;
