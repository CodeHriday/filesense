import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import './QualityChecks.css';

export const QualityChecks = ({ selectedFile }) => {
  const [qualityData, setQualityData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [customRules, setCustomRules] = useState([]);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    type: 'range',
    column: '',
    parameters: {
      min: '',
      max: '',
      pattern: '',
      required: false
    }
  });

  useEffect(() => {
    if (selectedFile) {
      fetchQualityData();
    } else {
      setQualityData(null);
    }
  }, [selectedFile]);

  const fetchQualityData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // In a real app, this would be an API call
      // For example: const response = await api.getFileQuality(selectedFile.id);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock quality data
      const mockQualityData = {
        id: selectedFile.id,
        fileName: selectedFile.fileName,
        qualityScore: 83.5,
        passedChecks: 7,
        failedChecks: 2,
        warningChecks: 1,
        totalChecks: 10,
        basicChecks: [
          { 
            id: 'check1', 
            name: 'Completeness Check', 
            description: 'Checks if the data has an acceptable amount of non-null values',
            result: 'pass',
            details: 'The file has 97.8% completeness which is above the threshold of 90%'
          },
          { 
            id: 'check2', 
            name: 'Duplicate Check', 
            description: 'Checks for duplicate rows in the data',
            result: 'warning',
            details: 'The file has 2.1% duplicate rows which is slightly above the warning threshold of 2%'
          },
          { 
            id: 'check3', 
            name: 'Data Type Consistency', 
            description: 'Checks if columns have consistent data types',
            result: 'pass',
            details: 'All columns have consistent data types'
          },
          { 
            id: 'check4', 
            name: 'Outlier Detection', 
            description: 'Checks for outliers in numeric columns',
            result: 'fail',
            details: 'Column "column_2" has 3.5% outliers which is above the threshold of 1%'
          },
          { 
            id: 'check5', 
            name: 'Date Format Check', 
            description: 'Checks if date/time columns have consistent formats',
            result: 'pass',
            details: 'All date/time columns have consistent formats'
          }
        ],
        columnIssues: [
          {
            column: 'column_2',
            type: 'numeric',
            issues: [
              'Contains outliers (values > 853.42)',
              'Has 23 null values'
            ]
          },
          {
            column: 'column_5',
            type: 'text',
            issues: [
              'Contains 45 values longer than expected (> 50 chars)'
            ]
          }
        ]
      };
      
      // Mock custom rules
      const mockCustomRules = [
        {
          id: 'rule1',
          name: 'Price Range Check',
          type: 'range',
          column: 'column_2',
          parameters: {
            min: '0',
            max: '1000'
          },
          result: 'fail',
          details: '12 values out of range (> 1000)'
        },
        {
          id: 'rule2',
          name: 'Email Format Check',
          type: 'pattern',
          column: 'column_5',
          parameters: {
            pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
          },
          result: 'pass',
          details: 'All non-null values match the pattern'
        }
      ];
      
      setQualityData(mockQualityData);
      setCustomRules(mockCustomRules);
    } catch (err) {
      setError('Failed to fetch quality data. Please try again.');
      console.error('Error fetching quality data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRule = () => {
    // Validate form
    if (!newRule.name || !newRule.column) {
      alert('Please fill in all required fields');
      return;
    }
    
    // Validate parameters based on rule type
    if (newRule.type === 'range' && (!newRule.parameters.min || !newRule.parameters.max)) {
      alert('Please specify both minimum and maximum values for range check');
      return;
    }
    
    if (newRule.type === 'pattern' && !newRule.parameters.pattern) {
      alert('Please specify a pattern for pattern check');
      return;
    }
    
    // Create new rule with random result (in a real app this would be determined by running the check)
    const results = ['pass', 'fail', 'warning'];
    const randomResult = results[Math.floor(Math.random() * results.length)];
    
    const newCustomRule = {
      id: 'rule' + (customRules.length + 3),
      ...newRule,
      result: randomResult,
      details: randomResult === 'pass' ? 'All values pass the check' : 
               randomResult === 'warning' ? 'Some values are close to the thresholds' : 
               'Some values fail the check'
    };
    
    setCustomRules([...customRules, newCustomRule]);
    
    // Reset form
    setNewRule({
      name: '',
      type: 'range',
      column: '',
      parameters: {
        min: '',
        max: '',
        pattern: '',
        required: false
      }
    });
    
    setShowAddRule(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewRule({
      ...newRule,
      [name]: value
    });
  };

  const handleParameterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewRule({
      ...newRule,
      parameters: {
        ...newRule.parameters,
        [name]: type === 'checkbox' ? checked : value
      }
    });
  };

  const handleDeleteRule = (ruleId) => {
    setCustomRules(customRules.filter(rule => rule.id !== ruleId));
  };

  if (!selectedFile) {
    return (
      <div className="quality-checks-container">
        <h1 className="page-title">Quality Checks</h1>
        <Card>
          <div className="no-file-message">
            <p>No file selected. Please upload a file or select a file from the catalog.</p>
            <button className="btn" onClick={() => window.history.pushState({}, '', '/')}>
              Upload a File
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="quality-checks-container">
        <h1 className="page-title">Quality Checks</h1>
        <div className="loading">Loading quality data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="quality-checks-container">
        <h1 className="page-title">Quality Checks</h1>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="quality-checks-container">
      <h1 className="page-title">Quality Checks</h1>
      
      {qualityData && (
        <>
          <div className="quality-score-card">
            <div className="score-gauge">
              <svg viewBox="0 0 100 100" className="gauge">
                <path 
                  className="gauge-background"
                  d="M 50,50 m 0,-40 a 40,40 0 1 1 0,80 a 40,40 0 1 1 0,-80"
                />
                <path 
                  className="gauge-value"
                  d={`M 50,50 m 0,-40 a 40,40 0 1 1 0,80 a 40,40 0 1 1 0,-80`}
                  style={{ 
                    strokeDasharray: 251.2, 
                    strokeDashoffset: 251.2 - (251.2 * qualityData.qualityScore / 100)
                  }}
                />
                <text x="50" y="50" className="gauge-text">{qualityData.qualityScore}</text>
                <text x="50" y="65" className="gauge-label">Quality Score</text>
              </svg>
            </div>
            
            <div className="score-summary">
              <div className="summary-item passed">
                <div className="summary-value">{qualityData.passedChecks}</div>
                <div className="summary-label">Passed</div>
              </div>
              <div className="summary-item failed">
                <div className="summary-value">{qualityData.failedChecks}</div>
                <div className="summary-label">Failed</div>
              </div>
              <div className="summary-item warning">
                <div className="summary-value">{qualityData.warningChecks}</div>
                <div className="summary-label">Warnings</div>
              </div>
            </div>
          </div>
          
          <Card title="Basic Quality Checks">
            <table className="checks-table">
              <thead>
                <tr>
                  <th>Check Name</th>
                  <th>Description</th>
                  <th className="result-column">Result</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {qualityData.basicChecks.map(check => (
                  <tr key={check.id} className={`result-${check.result}`}>
                    <td>{check.name}</td>
                    <td>{check.description}</td>
                    <td className="result-column">
                      <span className={`result-badge ${check.result}`}>
                        {check.result === 'pass' ? 'PASS' : 
                         check.result === 'fail' ? 'FAIL' : 'WARNING'}
                      </span>
                    </td>
                    <td>{check.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          
          <Card title="Custom Quality Rules">
            <div className="custom-rules-header">
              <p>Create custom rules to validate specific data quality requirements.</p>
              <button 
                className="btn" 
                onClick={() => setShowAddRule(!showAddRule)}
              >
                {showAddRule ? 'Cancel' : 'Add Custom Rule'}
              </button>
            </div>
            
            {showAddRule && (
              <div className="add-rule-form">
                <div className="form-group">
                  <label htmlFor="rule-name">Rule Name *</label>
                  <input 
                    type="text" 
                    id="rule-name" 
                    name="name" 
                    className="form-control" 
                    value={newRule.name} 
                    onChange={handleInputChange}
                    placeholder="e.g., Price Range Check"
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="rule-type">Rule Type *</label>
                    <select 
                      id="rule-type" 
                      name="type" 
                      className="form-control" 
                      value={newRule.type} 
                      onChange={handleInputChange}
                    >
                      <option value="range">Range Check</option>
                      <option value="pattern">Pattern Match</option>
                      <option value="null">Null Check</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="rule-column">Column *</label>
                    <input 
                      type="text" 
                      id="rule-column" 
                      name="column" 
                      className="form-control" 
                      value={newRule.column} 
                      onChange={handleInputChange}
                      placeholder="e.g., column_2"
                    />
                  </div>
                </div>
                
                {newRule.type === 'range' && (
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="rule-min">Minimum Value *</label>
                      <input 
                        type="text" 
                        id="rule-min" 
                        name="min" 
                        className="form-control" 
                        value={newRule.parameters.min} 
                        onChange={handleParameterChange}
                        placeholder="e.g., 0"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="rule-max">Maximum Value *</label>
                      <input 
                        type="text" 
                        id="rule-max" 
                        name="max" 
                        className="form-control" 
                        value={newRule.parameters.max} 
                        onChange={handleParameterChange}
                        placeholder="e.g., 1000"
                      />
                    </div>
                  </div>
                )}
                
                {newRule.type === 'pattern' && (
                  <div className="form-group">
                    <label htmlFor="rule-pattern">Regex Pattern *</label>
                    <input 
                      type="text" 
                      id="rule-pattern" 
                      name="pattern" 
                      className="form-control" 
                      value={newRule.parameters.pattern} 
                      onChange={handleParameterChange}
                      placeholder="e.g., ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
                    />
                  </div>
                )}
                
                {newRule.type === 'null' && (
                  <div className="form-group">
                    <div className="checkbox-group">
                      <input 
                        type="checkbox" 
                        id="rule-required" 
                        name="required" 
                        checked={newRule.parameters.required} 
                        onChange={handleParameterChange}
                      />
                      <label htmlFor="rule-required">Column is required (no nulls allowed)</label>
                    </div>
                  </div>
                )}
                
                <div className="form-actions">
                  <button className="btn" onClick={handleAddRule}>
                    Add Rule
                  </button>
                </div>
              </div>
            )}
            
            {customRules.length > 0 ? (
              <table className="checks-table custom-rules-table">
                <thead>
                  <tr>
                    <th>Rule Name</th>
                    <th>Type</th>
                    <th>Column</th>
                    <th className="result-column">Result</th>
                    <th>Details</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customRules.map(rule => (
                    <tr key={rule.id} className={`result-${rule.result}`}>
                      <td>{rule.name}</td>
                      <td>
                        {rule.type === 'range' ? 'Range Check' : 
                         rule.type === 'pattern' ? 'Pattern Match' : 'Null Check'}
                      </td>
                      <td>{rule.column}</td>
                      <td className="result-column">
                        <span className={`result-badge ${rule.result}`}>
                          {rule.result === 'pass' ? 'PASS' : 
                           rule.result === 'fail' ? 'FAIL' : 'WARNING'}
                        </span>
                      </td>
                      <td>{rule.details}</td>
                      <td>
                        <button 
                          className="icon-button delete" 
                          onClick={() => handleDeleteRule(rule.id)}
                          title="Delete rule"
                        >
                          ❌
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="no-rules-message">
                <p>No custom rules defined yet. Click "Add Custom Rule" to create one.</p>
              </div>
            )}
          </Card>
          
          {qualityData.columnIssues.length > 0 && (
            <Card title="Column Issues">
              <div className="issues-list">
                {qualityData.columnIssues.map((columnIssue, index) => (
                  <div key={index} className="issue-item">
                    <div className="issue-header">
                      <h3>{columnIssue.column}</h3>
                      <span className="issue-type">{columnIssue.type}</span>
                    </div>
                    <ul className="issue-details">
                      {columnIssue.issues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};