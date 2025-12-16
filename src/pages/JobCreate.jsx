import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getBusinessProcesses } from '../api/businessProcessesService';
import { createJob } from '../api/jobsService';
import '../styles/JobCreate.css';

const JobCreate = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialProcessId = queryParams.get('process');
  
  // State for step management
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5;
  
  // State for job data
  const [jobData, setJobData] = useState({
    name: '',
    business_process_id: initialProcessId || '',
    source_connection_id: null,
    target_connection_id: null,
    validation_settings: {
      rules: [],
      enabled: true
    },
    error_handling_settings: {
      stop_on_error: false,
      max_errors: 100,
      log_level: 'warning'
    },
    notification_settings: {
      email_on_success: false,
      email_on_failure: true,
      recipients: []
    },
    schedule_settings: {
      type: 'manual',
      cron_expression: '',
      start_date: '',
      enabled: false
    }
  });
  
  // State for business processes list
  const [businessProcesses, setBusinessProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Connection options (mock data - would come from API in real implementation)
  const [connectionOptions, setConnectionOptions] = useState([
    { id: 1, name: 'PostgreSQL Database', type: 'database' },
    { id: 2, name: 'CSV File', type: 'file' },
    { id: 3, name: 'REST API', type: 'api' },
    { id: 4, name: 'S3 Bucket', type: 'cloud_storage' }
  ]);
  
  // Validation rule types
  const validationRuleTypes = [
    { id: 'not_null', name: 'Not Null' },
    { id: 'unique', name: 'Unique Values' },
    { id: 'range', name: 'Value Range' },
    { id: 'regex', name: 'Pattern Match' },
    { id: 'cross_field', name: 'Cross Field Validation' }
  ];
  
  // Fetch business processes on component mount
  useEffect(() => {
    const fetchBusinessProcesses = async () => {
      try {
        const response = await getBusinessProcesses();
        if (response.success) {
          setBusinessProcesses(response.data);
        } else {
          setError(response.error || 'Failed to fetch workflows');
        }
      } catch (err) {
        setError('An error occurred while fetching workflows');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchBusinessProcesses();
  }, []);
  
  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setJobData({
      ...jobData,
      [name]: value
    });
  };
  
  // Handle nested object changes
  const handleNestedChange = (parentKey, childKey, value) => {
    setJobData({
      ...jobData,
      [parentKey]: {
        ...jobData[parentKey],
        [childKey]: value
      }
    });
  };
  
  // Handle validation rule changes
  const handleAddValidationRule = () => {
    const newRule = {
      id: Date.now(), // temporary ID
      type: 'not_null',
      field: '',
      parameters: {}
    };
    
    setJobData({
      ...jobData,
      validation_settings: {
        ...jobData.validation_settings,
        rules: [...jobData.validation_settings.rules, newRule]
      }
    });
  };
  
  const handleUpdateValidationRule = (ruleId, field, value) => {
    const updatedRules = jobData.validation_settings.rules.map(rule => {
      if (rule.id === ruleId) {
        return { ...rule, [field]: value };
      }
      return rule;
    });
    
    setJobData({
      ...jobData,
      validation_settings: {
        ...jobData.validation_settings,
        rules: updatedRules
      }
    });
  };
  
  const handleRemoveValidationRule = (ruleId) => {
    const updatedRules = jobData.validation_settings.rules.filter(
      rule => rule.id !== ruleId
    );
    
    setJobData({
      ...jobData,
      validation_settings: {
        ...jobData.validation_settings,
        rules: updatedRules
      }
    });
  };
  
  // Handle notification recipient changes
  const handleAddRecipient = () => {
    setJobData({
      ...jobData,
      notification_settings: {
        ...jobData.notification_settings,
        recipients: [...jobData.notification_settings.recipients, '']
      }
    });
  };
  
  const handleUpdateRecipient = (index, value) => {
    const updatedRecipients = [...jobData.notification_settings.recipients];
    updatedRecipients[index] = value;
    
    setJobData({
      ...jobData,
      notification_settings: {
        ...jobData.notification_settings,
        recipients: updatedRecipients
      }
    });
  };
  
  const handleRemoveRecipient = (index) => {
    const updatedRecipients = [...jobData.notification_settings.recipients];
    updatedRecipients.splice(index, 1);
    
    setJobData({
      ...jobData,
      notification_settings: {
        ...jobData.notification_settings,
        recipients: updatedRecipients
      }
    });
  };
  
  // Handle form navigation
  const goToNextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };
  
  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  // Handle form submission
  const handleSubmit = async () => {
    try {
      const response = await createJob(jobData);
      if (response.success) {
        navigate(`/jobs/${response.data.id}`);
      } else {
        setError(response.error || 'Failed to create job');
      }
    } catch (err) {
      setError('An error occurred while creating job');
      console.error(err);
    }
  };
  
  // Validation for current step
  const isCurrentStepValid = () => {
    switch (currentStep) {
      case 1:
        return jobData.name && jobData.business_process_id;
      case 2:
        return jobData.source_connection_id !== null;
      case 3:
        return true; // Target connection is optional
      case 4:
        return true; // Validation settings are optional
      case 5:
        return true; // All remaining settings have defaults
      default:
        return false;
    }
  };
  
  // Render Step 1: Job Details
  const renderStep1 = () => (
    <div className="step-content">
      <h2>Step 1: Job Details</h2>
      <div className="form-group">
        <label htmlFor="name">Job Name<span className="required">*</span></label>
        <input
          id="name"
          name="name"
          type="text"
          value={jobData.name}
          onChange={handleInputChange}
          placeholder="Enter job name"
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="business_process_id">Workflow<span className="required">*</span></label>
        <select
          id="business_process_id"
          name="business_process_id"
          value={jobData.business_process_id}
          onChange={handleInputChange}
          required
        >
          <option value="">Select a workflow</option>
          {businessProcesses.map(process => (
            <option key={process.id} value={process.id}>
              {process.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
  
  // Render Step 2: Source Configuration
  const renderStep2 = () => (
    <div className="step-content">
      <h2>Step 2: Source Configuration</h2>
      <div className="form-group">
        <label htmlFor="source_connection_id">Source Connection<span className="required">*</span></label>
        <select
          id="source_connection_id"
          name="source_connection_id"
          value={jobData.source_connection_id || ''}
          onChange={handleInputChange}
          required
        >
          <option value="">Select a source connection</option>
          {connectionOptions.map(connection => (
            <option key={connection.id} value={connection.id}>
              {connection.name} ({connection.type})
            </option>
          ))}
        </select>
      </div>
      {jobData.source_connection_id && (
        <div className="connection-preview">
          <h3>Source Preview</h3>
          <p>Connection ID: {jobData.source_connection_id}</p>
          <div className="preview-data">
            <p>First 10 rows would be displayed here in a real implementation.</p>
            <p>This would include the source data schema.</p>
          </div>
        </div>
      )}
    </div>
  );
  
  // Render Step 3: Target Configuration
  const renderStep3 = () => (
    <div className="step-content">
      <h2>Step 3: Target Configuration (Optional)</h2>
      <div className="form-group">
        <label htmlFor="target_connection_id">Target Connection</label>
        <select
          id="target_connection_id"
          name="target_connection_id"
          value={jobData.target_connection_id || ''}
          onChange={handleInputChange}
        >
          <option value="">No target (read-only job)</option>
          {connectionOptions.map(connection => (
            <option key={connection.id} value={connection.id}>
              {connection.name} ({connection.type})
            </option>
          ))}
        </select>
      </div>
      {jobData.target_connection_id && (
        <div className="connection-preview">
          <h3>Target Preview</h3>
          <p>Connection ID: {jobData.target_connection_id}</p>
          <div className="preview-data">
            <p>Target schema and mapping interface would be displayed here in a real implementation.</p>
            <p>This would allow mapping source columns to target columns.</p>
          </div>
        </div>
      )}
    </div>
  );
  
  // Render Step 4: Validation and Error Handling
  const renderStep4 = () => (
    <div className="step-content">
      <h2>Step 4: Validation and Error Handling</h2>
      
      <div className="sub-section">
        <h3>Data Validation</h3>
        <div className="form-group checkbox-group">
          <input
            type="checkbox"
            id="validation_enabled"
            checked={jobData.validation_settings.enabled}
            onChange={(e) => handleNestedChange('validation_settings', 'enabled', e.target.checked)}
          />
          <label htmlFor="validation_enabled">Enable data validation</label>
        </div>
        
        {jobData.validation_settings.enabled && (
          <div className="validation-rules">
            <div className="rules-header">
              <h4>Validation Rules</h4>
              <button 
                type="button" 
                className="secondary-button"
                onClick={handleAddValidationRule}
              >
                Add Rule
              </button>
            </div>
            
            {jobData.validation_settings.rules.length === 0 ? (
              <p className="no-rules">No validation rules configured yet. Click "Add Rule" to create one.</p>
            ) : (
              <div className="rules-list">
                {jobData.validation_settings.rules.map(rule => (
                  <div key={rule.id} className="rule-item">
                    <div className="rule-content">
                      <div className="form-group">
                        <label htmlFor="rule-type-select">Rule Type</label>
                        <select
                          id="rule-type-select"
                          value={rule.type}
                          onChange={(e) => handleUpdateValidationRule(rule.id, 'type', e.target.value)}
                        >
                          {validationRuleTypes.map(type => (
                            <option key={type.id} value={type.id}>
                              {type.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="rule-field-input">Field</label>
                        <input
                          id="rule-field-input"
                          type="text"
                          value={rule.field}
                          onChange={(e) => handleUpdateValidationRule(rule.id, 'field', e.target.value)}
                          placeholder="Enter field name"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="icon-button delete"
                      onClick={() => handleRemoveValidationRule(rule.id)}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="sub-section">
        <h3>Error Handling</h3>
        <div className="form-group checkbox-group">
          <input
            type="checkbox"
            id="stop_on_error"
            checked={jobData.error_handling_settings.stop_on_error}
            onChange={(e) => handleNestedChange('error_handling_settings', 'stop_on_error', e.target.checked)}
          />
          <label htmlFor="stop_on_error">Stop job on first error</label>
        </div>
        
        {!jobData.error_handling_settings.stop_on_error && (
          <div className="form-group">
            <label htmlFor="max_errors">Maximum Errors Before Stopping</label>
            <input
              type="number"
              id="max_errors"
              min="1"
              value={jobData.error_handling_settings.max_errors}
              onChange={(e) => handleNestedChange(
                'error_handling_settings', 
                'max_errors', 
                parseInt(e.target.value)
              )}
            />
          </div>
        )}
        
        <div className="form-group">
          <label htmlFor="log_level">Log Level</label>
          <select
            id="log_level"
            value={jobData.error_handling_settings.log_level}
            onChange={(e) => handleNestedChange(
              'error_handling_settings', 
              'log_level', 
              e.target.value
            )}
          >
            <option value="debug">Debug (Most Verbose)</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="critical">Critical (Least Verbose)</option>
          </select>
        </div>
      </div>
      
      <div className="sub-section">
        <h3>Notifications</h3>
        <div className="form-group checkbox-group">
          <input
            type="checkbox"
            id="email_on_success"
            checked={jobData.notification_settings.email_on_success}
            onChange={(e) => handleNestedChange(
              'notification_settings', 
              'email_on_success', 
              e.target.checked
            )}
          />
          <label htmlFor="email_on_success">Email on successful completion</label>
        </div>
        
        <div className="form-group checkbox-group">
          <input
            type="checkbox"
            id="email_on_failure"
            checked={jobData.notification_settings.email_on_failure}
            onChange={(e) => handleNestedChange(
              'notification_settings', 
              'email_on_failure', 
              e.target.checked
            )}
          />
          <label htmlFor="email_on_failure">Email on failure</label>
        </div>
        
        {(jobData.notification_settings.email_on_success || 
           jobData.notification_settings.email_on_failure) && (
          <div className="recipients">
            <div className="recipients-header">
              <h4>Email Recipients</h4>
              <button 
                type="button" 
                className="secondary-button"
                onClick={handleAddRecipient}
              >
                Add Recipient
              </button>
            </div>
            
            {jobData.notification_settings.recipients.length === 0 ? (
              <p className="no-recipients">No recipients added yet. Click "Add Recipient" to add one.</p>
            ) : (
              <div className="recipients-list">
                {jobData.notification_settings.recipients.map((recipient, index) => (
                  <div key={index} className="recipient-item">
                    <input
                      type="email"
                      value={recipient}
                      onChange={(e) => handleUpdateRecipient(index, e.target.value)}
                      placeholder="Enter email address"
                    />
                    <button
                      type="button"
                      className="icon-button delete"
                      onClick={() => handleRemoveRecipient(index)}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
  
  // Render Step 5: Scheduling
  const renderStep5 = () => (
    <div className="step-content">
      <h2>Step 5: Scheduling</h2>
      
      <div className="form-group">
        <label htmlFor="schedule_type">Run Schedule</label>
        <select
          id="schedule_type"
          value={jobData.schedule_settings.type}
          onChange={(e) => handleNestedChange('schedule_settings', 'type', e.target.value)}
        >
          <option value="manual">Manual (Run On-Demand)</option>
          <option value="one_time">One-Time Schedule</option>
          <option value="recurring">Recurring Schedule</option>
        </select>
      </div>
      
      {jobData.schedule_settings.type !== 'manual' && (
        <div className="schedule-details">
          {jobData.schedule_settings.type === 'one_time' && (
            <div className="form-group">
              <label htmlFor="start_date">Start Date and Time</label>
              <input
                type="datetime-local"
                id="start_date"
                value={jobData.schedule_settings.start_date}
                onChange={(e) => handleNestedChange(
                  'schedule_settings', 
                  'start_date', 
                  e.target.value
                )}
              />
            </div>
          )}
          
          {jobData.schedule_settings.type === 'recurring' && (
            <>
              <div className="form-group">
                <label htmlFor="cron_expression">Cron Expression</label>
                <input
                  type="text"
                  id="cron_expression"
                  value={jobData.schedule_settings.cron_expression}
                  onChange={(e) => handleNestedChange(
                    'schedule_settings', 
                    'cron_expression', 
                    e.target.value
                  )}
                  placeholder="e.g., 0 0 * * * (daily at midnight)"
                />
                <small>Format: minute hour day-of-month month day-of-week</small>
              </div>
              
              <div className="form-group">
                <label htmlFor="start_date">Start From (Optional)</label>
                <input
                  type="datetime-local"
                  id="start_date"
                  value={jobData.schedule_settings.start_date}
                  onChange={(e) => handleNestedChange(
                    'schedule_settings', 
                    'start_date', 
                    e.target.value
                  )}
                />
              </div>
            </>
          )}
          
          <div className="form-group checkbox-group">
            <input
              type="checkbox"
              id="schedule_enabled"
              checked={jobData.schedule_settings.enabled}
              onChange={(e) => handleNestedChange(
                'schedule_settings', 
                'enabled', 
                e.target.checked
              )}
            />
            <label htmlFor="schedule_enabled">Enable this schedule immediately</label>
          </div>
        </div>
      )}
      
      <div className="job-summary">
        <h3>Job Summary</h3>
        <div className="summary-item">
          <span className="summary-label">Job Name:</span>
          <span className="summary-value">{jobData.name}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Workflow:</span>
          <span className="summary-value">
            {businessProcesses.find(p => p.id == jobData.business_process_id)?.name || 'None'}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Source Connection:</span>
          <span className="summary-value">
            {connectionOptions.find(c => c.id == jobData.source_connection_id)?.name || 'None'}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Target Connection:</span>
          <span className="summary-value">
            {connectionOptions.find(c => c.id == jobData.target_connection_id)?.name || 'None (Read-only job)'}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Validation Rules:</span>
          <span className="summary-value">
            {jobData.validation_settings.enabled 
              ? `${jobData.validation_settings.rules.length} rule(s)`
              : 'Disabled'}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Schedule:</span>
          <span className="summary-value">
            {jobData.schedule_settings.type === 'manual' 
              ? 'Manual (Run On-Demand)' 
              : jobData.schedule_settings.type === 'one_time'
                ? `One-time at ${jobData.schedule_settings.start_date}`
                : `Recurring (${jobData.schedule_settings.cron_expression || 'Not configured'})`}
          </span>
        </div>
      </div>
    </div>
  );
  
  // Render current step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      case 5:
        return renderStep5();
      default:
        return <div>Unknown step</div>;
    }
  };
  
  if (loading) {
    return <div className="loading">Loading...</div>;
  }
  
  return (
    <div className="job-create-container">
      <h1>Create New Job</h1>
      
      {error && <div className="error-message">{error}</div>}
      
      <div className="wizard">
        <div className="wizard-steps">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div 
              key={i + 1} 
              className={`wizard-step ${currentStep === i + 1 ? 'active' : ''} ${currentStep > i + 1 ? 'completed' : ''}`}
            >
              <div className="step-number">{i + 1}</div>
              <div className="step-label">
                {i === 0 && 'Job Details'}
                {i === 1 && 'Source'}
                {i === 2 && 'Target'}
                {i === 3 && 'Validation'}
                {i === 4 && 'Schedule'}
              </div>
            </div>
          ))}
        </div>
        
        <div className="wizard-content">
          {renderStepContent()}
          
          <div className="wizard-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => navigate('/business-processes')}
            >
              Cancel
            </button>
            
            {currentStep > 1 && (
              <button
                type="button"
                className="secondary-button"
                onClick={goToPreviousStep}
              >
                Previous
              </button>
            )}
            
            {currentStep < totalSteps ? (
              <button
                type="button"
                className="primary-button"
                onClick={goToNextStep}
                disabled={!isCurrentStepValid()}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                onClick={handleSubmit}
              >
                Create Job
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobCreate;