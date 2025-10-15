import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  FiServer, 
  FiFilter, 
  FiTarget,
  FiSettings,
  FiCheckCircle,
  FiArrowLeft,
  FiArrowRight,
  FiSave,
  FiAlertCircle,
  FiPlus,
  FiTrash2,
  FiEdit
} from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import './MappingWizard.css';

const TRANSFORMATION_FUNCTIONS = {
  'null-to-value': { label: 'Replace Null with Value', params: ['value'] },
  'coalesce': { label: 'Coalesce (First Non-Null)', params: ['column2', 'column3'] },
  'UPPER': { label: 'Convert to UPPERCASE', params: [] },
  'LOWER': { label: 'Convert to lowercase', params: [] },
  'TRIM': { label: 'Trim Whitespace', params: [] },
  'SUBSTRING': { label: 'Extract Substring', params: ['start', 'length'] },
  'REPLACE': { label: 'Find and Replace', params: ['find', 'replace'] },
  'concat': { label: 'Concatenate Columns', params: ['column2', 'separator'] },
  'split': { label: 'Split Column', params: ['delimiter', 'index'] },
  'left-pad': { label: 'Left Pad', params: ['length', 'padChar'] },
  'right-pad': { label: 'Right Pad', params: ['length', 'padChar'] },
  'date-format': { label: 'Format Date', params: ['format'] },
  'current-date': { label: 'Current Date', params: [] },
  'current-timestamp': { label: 'Current Timestamp', params: [] },
  'ROUND': { label: 'Round Number', params: ['decimals'] },
  'FLOOR': { label: 'Round Down', params: [] },
  'CEIL': { label: 'Round Up', params: [] },
  'add': { label: 'Add', params: ['value'] },
  'subtract': { label: 'Subtract', params: ['value'] },
  'multiply': { label: 'Multiply', params: ['value'] },
  'divide': { label: 'Divide', params: ['value'] },
  'CASE': { label: 'Conditional (CASE WHEN)', params: ['condition', 'when_true', 'when_false'] },
  'cast-string': { label: 'Convert to String', params: [] },
  'cast-integer': { label: 'Convert to Integer', params: [] },
  'cast-float': { label: 'Convert to Float', params: [] },
  'cast-boolean': { label: 'Convert to Boolean', params: [] },
  'cast-date': { label: 'Convert to Date', params: [] },
  'hash': { label: 'Hash (MD5/SHA256)', params: ['algorithm'] },
  'lookup': { label: 'Lookup Value', params: ['lookupTable', 'key', 'value'] }
};

function MappingWizard() {
  const navigate = useNavigate();
  const { mappingId } = useParams();
  const isEditMode = !!mappingId;

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 1: Basic Info & Source
  const [mappingName, setMappingName] = useState('');
  const [sourceConnectionId, setSourceConnectionId] = useState('');
  const [connections, setConnections] = useState([]);

  // Step 2: File Pattern
  const [filePattern, setFilePattern] = useState('*.csv');
  const [matchingFiles, setMatchingFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null); // 'success', 'error', or null

  // Step 3: Schema & Field Mapping
  const [schema, setSchema] = useState([]);
  const [fieldMappings, setFieldMappings] = useState([]);
  const [loadingSchema, setLoadingSchema] = useState(false);

  // Step 4: Target & Anomaly Rules
  const [targetConnectionId, setTargetConnectionId] = useState('');
  const [anomalyRules, setAnomalyRules] = useState([
    { metric: 'numeric_deviation', threshold: 10, enabled: true },
    { metric: 'row_count_change', threshold: 20, enabled: true },
    { metric: 'null_spike', threshold: 15, enabled: true },
    { metric: 'type_mismatch', threshold: 5, enabled: true }
  ]);

  useEffect(() => {
    fetchConnections();
    if (isEditMode) {
      loadMapping();
    }
  }, [mappingId]);

  const fetchConnections = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/connections`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setConnections(response.data || []);
    } catch (err) {
      console.error('Error fetching connections:', err);
    }
  };

  const loadMapping = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/transformations/${mappingId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      const mapping = response.data;
      setMappingName(mapping.name);
      setSourceConnectionId(mapping.source_connection_id || '');
      setFilePattern(mapping.file_pattern);
      setTargetConnectionId(mapping.target_connection_id || '');
      setFieldMappings(mapping.field_mappings || []);
      setAnomalyRules(mapping.anomaly_rules || anomalyRules);
      
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load mapping');
    } finally {
      setLoading(false);
    }
  };

  const validateFilePattern = async () => {
    try {
      setLoadingFiles(true);
      setValidationStatus(null);
      setError(null);
      
      // Validate connection ID if provided
      if (sourceConnectionId && (typeof sourceConnectionId !== 'number' || isNaN(sourceConnectionId))) {
        throw new Error('Invalid connection ID. Please select a valid connection.');
      }
      
      const response = await axios.post(
        `${API_BASE_URL}/api/transformations/validate-pattern`,
        { 
          source_connection_id: sourceConnectionId || null,
          source_file_pattern: filePattern 
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );
      
      const files = response.data.samples || [];
      setMatchingFiles(files);
      setValidationStatus('success');
      
      if (files.length === 0) {
        setError('Pattern is valid but no files matched. Please adjust your pattern or upload files first.');
      }
      
      return files.length > 0;
    } catch (err) {
      const errorMsg = typeof err.response?.data?.error === 'string' 
        ? err.response.data.error 
        : err.response?.data?.error?.message || 'Failed to validate file pattern';
      setError(errorMsg);
      setValidationStatus('error');
      setMatchingFiles([]);
      return false;
    } finally {
      setLoadingFiles(false);
    }
  };

  const extractSchema = async () => {
    try {
      setLoadingSchema(true);
      const response = await axios.post(
        `${API_BASE_URL}/api/transformations/extract-schema`,
        { 
          source_connection_id: sourceConnectionId || null,
          file_pattern: filePattern 
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );
      
      const extractedSchema = response.data.schema || [];
      setSchema(extractedSchema);
      
      // Initialize field mappings
      if (fieldMappings.length === 0) {
        setFieldMappings(extractedSchema.map(field => ({
          source_field: field.name,
          target_field: field.name,
          transformation: 'none',
          transformation_params: {}
        })));
      }
      
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to extract schema');
      return false;
    } finally {
      setLoadingSchema(false);
    }
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!mappingName.trim()) {
        setError('Please enter a mapping name');
        return;
      }
      if (!sourceConnectionId) {
        setError('Please select a source connection');
        return;
      }
      setError(null);
      setCurrentStep(2);
    } else if (currentStep === 2) {
      // Check if validation was successful
      if (validationStatus !== 'success' || matchingFiles.length === 0) {
        setError('Please validate the file pattern first and ensure files are matched.');
        return;
      }
      setCurrentStep(3);
      await extractSchema();
    } else if (currentStep === 3) {
      setCurrentStep(4);
    }
  };

  const handleBack = () => {
    setCurrentStep(Math.max(1, currentStep - 1));
    setError(null);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      const mappingData = {
        name: mappingName,
        source_connection_id: sourceConnectionId || null,
        file_pattern: filePattern,
        target_connection_id: targetConnectionId || null,
        field_mappings: fieldMappings,
        anomaly_rules: anomalyRules.filter(r => r.enabled)
      };

      if (isEditMode) {
        await axios.put(
          `${API_BASE_URL}/api/transformations/${mappingId}`,
          mappingData,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          }
        );
      } else {
        await axios.post(
          `${API_BASE_URL}/api/transformations`,
          mappingData,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          }
        );
      }

      navigate('/mappings');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save mapping');
    } finally {
      setLoading(false);
    }
  };

  const updateFieldMapping = (index, field, value) => {
    const updated = [...fieldMappings];
    updated[index] = { ...updated[index], [field]: value };
    setFieldMappings(updated);
  };

  const removeFieldMapping = (index) => {
    setFieldMappings(fieldMappings.filter((_, i) => i !== index));
  };

  const addFieldMapping = () => {
    setFieldMappings([...fieldMappings, {
      source_field: '',
      target_field: '',
      transformation: 'none',
      transformation_params: {}
    }]);
  };

  const renderStepIndicator = () => {
    const steps = [
      { num: 1, label: 'Source & Name' },
      { num: 2, label: 'File Pattern' },
      { num: 3, label: 'Field Mapping' },
      { num: 4, label: 'Target & Rules' }
    ];

    return (
      <div className="wizard-steps">
        {steps.map((step, idx) => (
          <React.Fragment key={step.num}>
            <div className={`wizard-step ${currentStep === step.num ? 'active' : ''} ${currentStep > step.num ? 'completed' : ''}`}>
              <div className="step-number">
                {currentStep > step.num ? <FiCheckCircle /> : step.num}
              </div>
              <div className="step-label">{step.label}</div>
            </div>
            {idx < steps.length - 1 && <div className="step-connector"></div>}
          </React.Fragment>
        ))}
      </div>
    );
  };

  if (loading && isEditMode) {
    return <LoadingSpinner />;
  }

  return (
    <div className="page-container">
      <div className="wizard-header">
        <button className="btn-back" onClick={() => navigate('/mappings')}>
          <FiArrowLeft /> Back to Mappings
        </button>
        <h1>{isEditMode ? 'Edit' : 'Create'} Mapping</h1>
      </div>

      {renderStepIndicator()}

      {error && (
        <div className="error-message">
          <FiAlertCircle /> {error}
        </div>
      )}

      <Card className="wizard-content">
        {/* Step 1: Basic Info & Source */}
        {currentStep === 1 && (
          <div className="wizard-step-content">
            <h2><FiServer /> Mapping Name & Source Connection</h2>
            
            <div className="form-group">
              <label>Mapping Name *</label>
              <input
                type="text"
                className="form-control"
                value={mappingName}
                onChange={(e) => setMappingName(e.target.value)}
                placeholder="e.g., Daily Sales Data Transformation"
              />
            </div>

            <div className="form-group">
              <label>Source Connection</label>
              <select
                className="form-control"
                value={sourceConnectionId}
                onChange={(e) => setSourceConnectionId(e.target.value ? parseInt(e.target.value) : '')}
              >
                <option value="">Local Files</option>
                {connections.filter(c => c.connection_direction === 'source').map(conn => (
                  <option key={conn.id} value={conn.id}>
                    {conn.name} ({conn.type})
                  </option>
                ))}
              </select>
              <small className="form-help">Select where to read files from</small>
            </div>
          </div>
        )}

        {/* Step 2: File Pattern */}
        {currentStep === 2 && (
          <div className="wizard-step-content">
            <h2><FiFilter /> File Pattern Selection</h2>
            
            <div className="form-group">
              <label>File Pattern *</label>
              <input
                type="text"
                className="form-control"
                value={filePattern}
                onChange={(e) => {
                  setFilePattern(e.target.value);
                  setValidationStatus(null);
                  setMatchingFiles([]);
                }}
                placeholder="e.g., sales_*.csv or data_2024*.parquet"
              />
              <small className="form-help">
                Use * for multiple characters, ? for single character
              </small>
            </div>

            <button 
              className="btn btn-secondary"
              onClick={validateFilePattern}
              disabled={loadingFiles}
            >
              {loadingFiles ? 'Validating...' : 'Validate Pattern'}
            </button>

            {validationStatus === 'success' && matchingFiles.length > 0 && (
              <div className="alert alert-success" style={{ marginTop: '1rem' }}>
                ✓ Validation successful! Found {matchingFiles.length} matching file(s).
              </div>
            )}

            {matchingFiles.length > 0 && (
              <div className="matched-files">
                <h4>Matched Files ({matchingFiles.length})</h4>
                <ul>
                  {matchingFiles.slice(0, 10).map((file, idx) => (
                    <li key={idx}>
                      {file.filename || file}
                      {file.rowCount && ` (${file.rowCount} rows)`}
                      {file.size && ` (${(file.size / 1024).toFixed(2)} KB)`}
                      {file.source && ` [${file.source.toUpperCase()}]`}
                    </li>
                  ))}
                  {matchingFiles.length > 10 && (
                    <li className="more-files">...and {matchingFiles.length - 10} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Schema & Field Mapping */}
        {currentStep === 3 && (
          <div className="wizard-step-content">
            <h2><FiEdit /> Field Mapping & Transformations</h2>
            
            {loadingSchema ? (
              <LoadingSpinner size="small" />
            ) : (
              <>
                <div className="field-mappings-header">
                  <button className="btn btn-sm" onClick={addFieldMapping}>
                    <FiPlus /> Add Field
                  </button>
                </div>

                <div className="field-mappings-list">
                  {fieldMappings.map((mapping, idx) => (
                    <div key={idx} className="field-mapping-row">
                      <div className="field-mapping-inputs">
                        <div className="form-group">
                          <label>Source Field</label>
                          <select
                            className="form-control"
                            value={mapping.source_field}
                            onChange={(e) => updateFieldMapping(idx, 'source_field', e.target.value)}
                          >
                            <option value="">Select source field</option>
                            {schema.map(field => (
                              <option key={field.column_name} value={field.column_name}>
                                {field.column_name} ({field.data_type})
                              </option>
                            ))}
                          </select>
                        </div>

                        <FiArrowRight className="arrow-icon" />

                        <div className="form-group">
                          <label>Target Field</label>
                          <input
                            type="text"
                            className="form-control"
                            value={mapping.target_field}
                            onChange={(e) => updateFieldMapping(idx, 'target_field', e.target.value)}
                            placeholder="Target field name"
                          />
                        </div>

                        <div className="form-group">
                          <label>Transformation</label>
                          <select
                            className="form-control"
                            value={mapping.transformation}
                            onChange={(e) => updateFieldMapping(idx, 'transformation', e.target.value)}
                          >
                            <option value="none">None (Direct Copy)</option>
                            <optgroup label="Null Handling">
                              <option value="null-to-value">Replace Null</option>
                              <option value="coalesce">Coalesce</option>
                            </optgroup>
                            <optgroup label="String Operations">
                              <option value="UPPER">UPPERCASE</option>
                              <option value="LOWER">lowercase</option>
                              <option value="TRIM">Trim</option>
                              <option value="SUBSTRING">Substring</option>
                              <option value="REPLACE">Find & Replace</option>
                              <option value="concat">Concatenate</option>
                            </optgroup>
                            <optgroup label="Numeric Operations">
                              <option value="ROUND">Round</option>
                              <option value="FLOOR">Floor</option>
                              <option value="CEIL">Ceiling</option>
                              <option value="add">Add</option>
                              <option value="multiply">Multiply</option>
                            </optgroup>
                            <optgroup label="Date/Time">
                              <option value="date-format">Format Date</option>
                              <option value="current-date">Current Date</option>
                            </optgroup>
                            <optgroup label="Type Casting">
                              <option value="cast-string">To String</option>
                              <option value="cast-integer">To Integer</option>
                              <option value="cast-float">To Float</option>
                            </optgroup>
                          </select>
                        </div>

                        <button
                          className="btn-icon-danger"
                          onClick={() => removeFieldMapping(idx)}
                          title="Remove field"
                        >
                          <FiTrash2 />
                        </button>
                      </div>

                      {mapping.transformation !== 'none' && TRANSFORMATION_FUNCTIONS[mapping.transformation]?.params.length > 0 && (
                        <div className="transformation-params">
                          {TRANSFORMATION_FUNCTIONS[mapping.transformation].params.map(param => (
                            <div key={param} className="form-group-inline">
                              <label>{param}:</label>
                              <input
                                type="text"
                                className="form-control-sm"
                                value={mapping.transformation_params?.[param] || ''}
                                onChange={(e) => updateFieldMapping(idx, 'transformation_params', {
                                  ...mapping.transformation_params,
                                  [param]: e.target.value
                                })}
                                placeholder={`Enter ${param}`}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Target & Anomaly Rules */}
        {currentStep === 4 && (
          <div className="wizard-step-content">
            <h2><FiTarget /> Target Connection & Quality Rules</h2>
            
            <div className="form-group">
              <label>Target Connection</label>
              <select
                className="form-control"
                value={targetConnectionId}
                onChange={(e) => setTargetConnectionId(e.target.value ? parseInt(e.target.value) : '')}
              >
                <option value="">Local Files</option>
                {connections.filter(c => c.connection_direction === 'target').map(conn => (
                  <option key={conn.id} value={conn.id}>
                    {conn.name} ({conn.type})
                  </option>
                ))}
              </select>
              <small className="form-help">Select where to write transformed files</small>
            </div>

            <h3><FiSettings /> Anomaly Detection Rules</h3>
            <div className="anomaly-rules">
              {anomalyRules.map((rule, idx) => (
                <div key={idx} className="anomaly-rule">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => {
                        const updated = [...anomalyRules];
                        updated[idx].enabled = e.target.checked;
                        setAnomalyRules(updated);
                      }}
                    />
                    <span>{rule.metric.replace(/_/g, ' ')}</span>
                  </label>
                  <div className="threshold-input">
                    <input
                      type="number"
                      className="form-control-sm"
                      value={rule.threshold}
                      onChange={(e) => {
                        const updated = [...anomalyRules];
                        updated[idx].threshold = parseInt(e.target.value);
                        setAnomalyRules(updated);
                      }}
                      disabled={!rule.enabled}
                    />
                    <span>%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="wizard-actions">
          {currentStep > 1 && (
            <button className="btn btn-secondary" onClick={handleBack}>
              <FiArrowLeft /> Back
            </button>
          )}
          <div className="wizard-actions-right">
            {currentStep < 4 ? (
              <button className="btn btn-primary" onClick={handleNext}>
                Next <FiArrowRight />
              </button>
            ) : (
              <button className="btn btn-success" onClick={handleSave} disabled={loading}>
                <FiSave /> {loading ? 'Saving...' : 'Save Mapping'}
              </button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default MappingWizard;
