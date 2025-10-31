import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash2, FiAlertTriangle, FiCheck } from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { getAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, getAlertHistory } from '../api/alertService';
import { formatDate, getTimeSince } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import './Alerts.css';

function Alerts() {
  const { hasWritePermission } = useAuth();
  const [alertRules, setAlertRules] = useState([]);
  const [alertHistory, setAlertHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [currentRule, setCurrentRule] = useState(null);
  const [activeTab, setActiveTab] = useState('rules');
  const [rulesPage, setRulesPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Form state
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState('completeness');
  const [ruleCondition, setRuleCondition] = useState('less_than');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleSeverity, setRuleSeverity] = useState('warning');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [rulesData, historyData] = await Promise.all([
          getAlertRules(),
          getAlertHistory()
        ]);
        
        setAlertRules(rulesData || []);
        setAlertHistory(historyData || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching alert data:', err);
        setError('Failed to load alert data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const handleAddRule = () => {
    setCurrentRule(null);
    setRuleName('');
    setRuleType('completeness');
    setRuleCondition('less_than');
    setRuleValue('');
    setRuleSeverity('warning');
    setShowRuleForm(true);
  };

  const handleEditRule = (rule) => {
    setCurrentRule(rule);
    setRuleName(rule.rule_name);
    setRuleType(rule.rule_type);
    setRuleCondition(rule.rule_condition);
    setRuleValue(rule.rule_value);
    setRuleSeverity(rule.severity);
    setShowRuleForm(true);
  };

  const handleDeleteRule = async (ruleId) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: 'Are you sure you want to delete this alert rule?',
      action: async () => {
        try {
          await deleteAlertRule(ruleId);
          setAlertRules(alertRules.filter(rule => rule.id !== ruleId));
        } catch (err) {
          console.error('Error deleting alert rule:', err);
          alert('Failed to delete alert rule. Please try again.');
        }
      }
    });
  };

  const handleSubmitRule = async (e) => {
    e.preventDefault();
    
    try {
      const ruleData = {
        rule_name: ruleName,
        rule_type: ruleType,
        rule_condition: ruleCondition,
        rule_value: ruleValue,
        severity: ruleSeverity,
        enabled: true
      };
      
      let result;
      
      if (currentRule) {
        // Update existing rule
        result = await updateAlertRule(currentRule.id, ruleData);
        setAlertRules(alertRules.map(rule => 
          rule.id === currentRule.id ? result : rule
        ));
      } else {
        // Create new rule
        result = await createAlertRule(ruleData);
        setAlertRules([...alertRules, result]);
      }
      
      setShowRuleForm(false);
    } catch (err) {
      console.error('Error saving alert rule:', err);
      alert('Failed to save alert rule. Please try again.');
    }
  };

  const renderRulesTab = () => {
    // Pagination logic for rules
    const indexOfLastRule = rulesPage * itemsPerPage;
    const indexOfFirstRule = indexOfLastRule - itemsPerPage;
    const currentRules = alertRules.slice(indexOfFirstRule, indexOfLastRule);
    const totalRulesPages = Math.ceil(alertRules.length / itemsPerPage);

    return (
      <>
        <div className="tab-header">
          <h2>Alert Rules</h2>
          {hasWritePermission('alerts') ? (
            <button className="btn btn-primary" onClick={handleAddRule}>
              <FiPlus className="btn-icon" />
              Add Rule
            </button>
          ) : (
            <div className="permission-notice">
              Write permission required to create alert rules
            </div>
          )}
        </div>
        
        {showRuleForm && (
          <Card className="rule-form-card">
            <h3>{currentRule ? 'Edit Alert Rule' : 'Create Alert Rule'}</h3>
            <form onSubmit={handleSubmitRule}>
              <div className="form-group">
                <label htmlFor="ruleName">Rule Name</label>
                <input
                  type="text"
                  id="ruleName"
                  className="form-control"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  required
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="ruleType">Rule Type</label>
                  <select
                    id="ruleType"
                    className="form-control"
                    value={ruleType}
                    onChange={(e) => setRuleType(e.target.value)}
                  >
                    <option value="completeness">Completeness</option>
                    <option value="validity">Validity</option>
                    <option value="uniqueness">Uniqueness</option>
                    <option value="consistency">Consistency</option>
                    <option value="freshness">Freshness</option>
                    <option value="schema_change">Schema Change</option>
                    <option value="row_count">Row Count</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="ruleCondition">Condition</label>
                  <select
                    id="ruleCondition"
                    className="form-control"
                    value={ruleCondition}
                    onChange={(e) => setRuleCondition(e.target.value)}
                  >
                    <option value="less_than">Less Than</option>
                    <option value="greater_than">Greater Than</option>
                    <option value="equal_to">Equal To</option>
                    <option value="not_equal_to">Not Equal To</option>
                    <option value="contains">Contains</option>
                    <option value="not_contains">Does Not Contain</option>
                  </select>
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="ruleValue">Value</label>
                  <input
                    type="text"
                    id="ruleValue"
                    className="form-control"
                    value={ruleValue}
                    onChange={(e) => setRuleValue(e.target.value)}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="ruleSeverity">Severity</label>
                  <select
                    id="ruleSeverity"
                    className="form-control"
                    value={ruleSeverity}
                    onChange={(e) => setRuleSeverity(e.target.value)}
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                  </select>
                </div>
              </div>
              
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowRuleForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {currentRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </form>
          </Card>
        )}
        
        {alertRules.length === 0 ? (
          <Card>
            <div className="empty-state">
              <FiAlertTriangle className="empty-icon" />
              <h2>No Alert Rules Configured</h2>
              <p>
                Configure alert rules to monitor your data files for quality issues,
                schema changes, and more.
              </p>
              {hasWritePermission('alerts') ? (
                <button className="btn btn-primary" onClick={handleAddRule}>
                  <FiPlus className="btn-icon" />
                  Create Your First Alert Rule
                </button>
              ) : (
                <div className="permission-notice">
                  Write permission required to create alert rules
                </div>
              )}
            </div>
          </Card>
        ) : (
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rule Name</th>
                    <th>Type</th>
                    <th>Condition</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRules.map(rule => (
                    <tr key={rule.id}>
                      <td className="font-weight-bold">{rule.rule_name}</td>
                      <td>{rule.rule_type.charAt(0).toUpperCase() + rule.rule_type.slice(1).replace('_', ' ')}</td>
                      <td>{rule.rule_condition.split('_').join(' ')} {rule.rule_value}</td>
                      <td>
                        <span className={`badge badge-${rule.severity}`}>
                          {rule.severity}
                        </span>
                      </td>
                      <td>
                        {rule.enabled ? (
                          <span className="badge badge-success">Active</span>
                        ) : (
                          <span className="badge badge-error">Inactive</span>
                        )}
                      </td>
                      <td>{formatDate(rule.created_at)}</td>
                      <td>
                        <div className="action-icons">
                          {hasWritePermission('alerts') && (
                            <>
                              <button 
                                className="icon-btn icon-btn-primary" 
                                title="Edit Rule"
                                onClick={() => handleEditRule(rule)}
                              >
                                <FiEdit2 />
                              </button>
                              <button 
                                className="icon-btn icon-btn-danger" 
                                title="Delete Rule"
                                onClick={() => handleDeleteRule(rule.id)}
                              >
                                <FiTrash2 />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {alertRules.length > 0 && (
              <Pagination
                currentPage={rulesPage}
                totalPages={totalRulesPages}
                onPageChange={setRulesPage}
                itemsPerPage={itemsPerPage}
                totalItems={alertRules.length}
              />
            )}
          </>
        )}
      </>
    );
  };

  const renderHistoryTab = () => {
    // Pagination logic for history
    const indexOfLastAlert = historyPage * itemsPerPage;
    const indexOfFirstAlert = indexOfLastAlert - itemsPerPage;
    const currentHistory = alertHistory.slice(indexOfFirstAlert, indexOfLastAlert);
    const totalHistoryPages = Math.ceil(alertHistory.length / itemsPerPage);

    return (
      <>
        <div className="tab-header">
          <h2>Alert History</h2>
        </div>
        
        {alertHistory.length === 0 ? (
          <Card>
            <div className="empty-state">
              <FiCheck className="empty-icon" />
              <h2>No Alerts Triggered</h2>
              <p>
                No alerts have been triggered yet. Once alerts are triggered,
                they will appear here.
              </p>
            </div>
          </Card>
        ) : (
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rule Name</th>
                    <th>Severity</th>
                    <th>Message</th>
                    <th>File</th>
                    <th>Triggered</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentHistory.map(alert => (
                    <tr key={alert.id}>
                      <td className="font-weight-bold">{alert.rule_name}</td>
                      <td>
                        <span className={`badge badge-${alert.severity}`}>
                          {alert.severity}
                        </span>
                      </td>
                      <td>{alert.message}</td>
                      <td>{alert.filename}</td>
                      <td>{getTimeSince(alert.triggered_at)}</td>
                      <td>
                        <Link to={`/profile/${alert.file_id}`} className="btn btn-sm btn-primary">
                          View File
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {alertHistory.length > 0 && (
              <Pagination
                currentPage={historyPage}
                totalPages={totalHistoryPages}
                onPageChange={setHistoryPage}
                itemsPerPage={itemsPerPage}
                totalItems={alertHistory.length}
              />
            )}
          </>
        )}
      </>
    );
  };

  return (
    <div className="alerts-container">
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="tabs">
            <button 
              className={`tab-button ${activeTab === 'rules' ? 'active' : ''}`}
              onClick={() => setActiveTab('rules')}
            >
              Alert Rules
            </button>
            <button 
              className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              Alert History
            </button>
          </div>
          
          <div className="tab-content">
            {activeTab === 'rules' && renderRulesTab()}
            {activeTab === 'history' && renderHistoryTab()}
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={() => {
          confirmModal.action?.();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        variant="danger"
      />
    </div>
  );
}

export default Alerts;