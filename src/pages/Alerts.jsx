import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash2, FiAlertTriangle, FiCheck } from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { getAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, getAlertHistory } from '../api/alertService';
import { formatDate, getTimeSince } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
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

  // Form state
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState('completeness');
  const [ruleCondition, setRuleCondition] = useState('less_than');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleSeverity, setRuleSeverity] = useState('warning');

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
    if (window.confirm('Are you sure you want to delete this alert rule?')) {
      try {
        await deleteAlertRule(ruleId);
        setAlertRules(alertRules.filter(rule => rule.id !== ruleId));
      } catch (err) {
        console.error('Error deleting alert rule:', err);
        alert('Failed to delete alert rule. Please try again.');
      }
    }
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
          <div className="rules-grid">
            {alertRules.map(rule => (
              <Card key={rule.id} className="rule-card">
                <div className="rule-header">
                  <div className="rule-title">
                    <h3>{rule.rule_name}</h3>
                    <span className={`badge badge-${rule.severity}`}>
                      {rule.severity}
                    </span>
                    {rule.enabled ? (
                      <span className="badge badge-success">Active</span>
                    ) : (
                      <span className="badge badge-error">Inactive</span>
                    )}
                  </div>
                  <div className="rule-actions">
                    {hasWritePermission('alerts') && (
                      <>
                        <button 
                          className="action-button" 
                          title="Edit Rule"
                          onClick={() => handleEditRule(rule)}
                        >
                          <FiEdit2 />
                        </button>
                        <button 
                          className="action-button delete-button" 
                          title="Delete Rule"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          <FiTrash2 />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="rule-content">
                  <div className="rule-detail">
                    <span className="detail-label">Type:</span>
                    <span className="detail-value">
                      {rule.rule_type.charAt(0).toUpperCase() + rule.rule_type.slice(1).replace('_', ' ')}
                    </span>
                  </div>
                  <div className="rule-detail">
                    <span className="detail-label">Condition:</span>
                    <span className="detail-value">
                      {rule.rule_condition.split('_').join(' ')} {rule.rule_value}
                    </span>
                  </div>
                </div>
                <div className="rule-footer">
                  <div className="rule-date">
                    Created: {formatDate(rule.created_at)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </>
    );
  };

  const renderHistoryTab = () => {
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
          <div className="history-list">
            {alertHistory.map(alert => (
              <Card key={alert.id} className="alert-history-card">
                <div className="alert-header">
                  <h3>{alert.rule_name}</h3>
                  <span className={`badge badge-${alert.severity}`}>
                    {alert.severity}
                  </span>
                </div>
                <div className="alert-content">
                  <p>{alert.message}</p>
                  <p className="alert-file">
                    <span>File:</span> {alert.filename}
                  </p>
                </div>
                <div className="alert-footer">
                  <div className="alert-time">
                    Triggered {getTimeSince(alert.triggered_at)}
                  </div>
                  <Link to={`/profile/${alert.file_id}`} className="alert-action">
                    View File
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="alerts-container">
      {loading ? (
        <LoadingSpinner message="Loading alert data..." />
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
    </div>
  );
}

export default Alerts;