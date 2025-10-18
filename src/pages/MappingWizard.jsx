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
  FiEdit,
  FiEdit2,
  FiPlay
} from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import TableBasedMapper from '../components/TableBasedMapper';
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
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savedMappingId, setSavedMappingId] = useState(null);

  // Step 1: Basic Info & Source
  const [mappingName, setMappingName] = useState('');
  const [sourceConnectionId, setSourceConnectionId] = useState('');
  const [connections, setConnections] = useState([]);

  // Step 2: Source Configuration
  const [sourceType, setSourceType] = useState('files');
  const [filePath, setFilePath] = useState('');
  const [fileNamePattern, setFileNamePattern] = useState('*.csv');
  const [matchingFiles, setMatchingFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null); // 'success', 'error', or null

  // Step 3: Schema & Field Mapping
  const [schema, setSchema] = useState([]);
  const [fieldMappings, setFieldMappings] = useState([]);
  const [loadingSchema, setLoadingSchema] = useState(false);

  // Step 4: Target & Anomaly Rules
  const [targetConnectionId, setTargetConnectionId] = useState('');
  const [targetFileName, setTargetFileName] = useState('');
  const [targetFileFormat, setTargetFileFormat] = useState('csv');
  const [anomalyRules, setAnomalyRules] = useState([
    { metric: 'numeric_deviation', threshold: 10, enabled: true },
    { metric: 'row_count_anomaly', threshold: 20, enabled: true },
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
      setMappingName(mapping.mapping_name || mapping.name);
      setSourceConnectionId(mapping.source_connection_id || '');
      setSourceType(mapping.source_type || 'files');
      setFilePath(mapping.file_path || '');
      setFileNamePattern(mapping.file_name_pattern || mapping.source_file_pattern || mapping.file_pattern || '*.csv');
      setTargetConnectionId(mapping.target_connection_id || '');
      setTargetFileName(mapping.target_file_name || '');
      setTargetFileFormat(mapping.target_file_format || 'csv');
      setFieldMappings(mapping.field_mappings || []);
      
      // Convert anomaly rules from object format to array format
      if (mapping.anomaly_rules && typeof mapping.anomaly_rules === 'object' && !Array.isArray(mapping.anomaly_rules)) {
        const rulesArray = Object.entries(mapping.anomaly_rules).map(([metric, config]) => ({
          metric,
          threshold: config.threshold ?? 10,
          enabled: config.enabled !== false
        }));
        setAnomalyRules(rulesArray);
      } else if (Array.isArray(mapping.anomaly_rules)) {
        setAnomalyRules(mapping.anomaly_rules);
      } else {
        setAnomalyRules(anomalyRules);
      }
      
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load mapping');
    } finally {
      setLoading(false);
    }
  };

  // Removed validation function - validation happens during job execution

  const extractSchema = async () => {
    try {
      setLoadingSchema(true);
      const response = await axios.post(
        `${API_BASE_URL}/api/transformations/extract-schema`,
        { 
          source_connection_id: sourceConnectionId || null,
          source_type: sourceType,
          file_path: filePath,
          file_name_pattern: fileNamePattern
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
      if (!fileNamePattern.trim()) {
        setError('Please enter a file name or pattern');
        return;
      }
      setError(null);
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
      
      // Convert anomaly rules array to object format expected by backend
      const anomalyRulesObject = {};
      anomalyRules
        .filter(r => r.enabled)
        .forEach(rule => {
          anomalyRulesObject[rule.metric] = {
            enabled: rule.enabled,
            threshold: rule.threshold
          };
        });
      
      const mappingData = {
        mapping_name: mappingName,
        source_connection_id: sourceConnectionId || null,
        source_type: sourceType,
        file_path: filePath,
        file_name_pattern: fileNamePattern,
        target_connection_id: targetConnectionId || null,
        target_file_name: targetFileName || null,
        target_file_format: targetFileFormat || 'csv',
        field_mappings: fieldMappings,
        anomaly_rules: anomalyRulesObject
      };

      let response;
      if (isEditMode) {
        response = await axios.put(
          `${API_BASE_URL}/api/transformations/${mappingId}`,
          mappingData,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          }
        );
        setSavedMappingId(mappingId);
      } else {
        response = await axios.post(
          `${API_BASE_URL}/api/transformations`,
          mappingData,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          }
        );
        setSavedMappingId(response.data.mapping_id);
      }

      setSaveSuccess(true);
    } catch (err) {
      console.error('Save mapping error:', err);
      console.error('Error response:', err.response);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to save mapping';
      setError(errorMessage);
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

  const handleExecuteMapping = async () => {
    try {
      setLoading(true);
      const response = await axios.post(
        `${API_BASE_URL}/api/transformations/${savedMappingId}/execute`,
        {},
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );
      
      const jobId = response.data.jobId;
      navigate(`/etl-jobs/${jobId}`);
    } catch (err) {
      console.error('Error executing mapping:', err);
      setError(err.response?.data?.error || 'Failed to execute mapping');
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => {
    const steps = [
      { num: 1, label: 'Source & Name' },
      { num: 2, label: 'Source Configuration' },
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

      {!saveSuccess && renderStepIndicator()}

      {error && (
        <div className="error-message">
          <FiAlertCircle /> {error}
        </div>
      )}

      {saveSuccess ? (
        <Card className="success-screen" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ marginBottom: '2rem' }}>
            <FiCheckCircle size={64} style={{ color: '#10b981', marginBottom: '1rem' }} />
            <h2 style={{ marginBottom: '0.5rem' }}>Mapping Saved Successfully!</h2>
            <p style={{ color: '#64748b', marginBottom: '2rem' }}>
              Your ETL mapping "{mappingName}" has been {isEditMode ? 'updated' : 'created'} successfully.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-primary"
              onClick={handleExecuteMapping}
              disabled={loading}
            >
              <FiPlay /> {loading ? 'Starting...' : 'Execute Now'}
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => navigate('/mappings')}
              disabled={loading}
            >
              View All Mappings
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => navigate(`/mappings/edit/${savedMappingId}`)}
              disabled={loading}
            >
              <FiEdit2 /> Edit Mapping
            </button>
          </div>
        </Card>
      ) : (
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

        {/* Step 2: Source Configuration */}
        {currentStep === 2 && (
          <div className="wizard-step-content">
            <h2><FiFilter /> Source Configuration</h2>
            
            <div className="form-group">
              <label>Source Type *</label>
              <select
                className="form-control"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
              >
                <option value="files">Files</option>
              </select>
              <small className="form-help">Type of data source (currently supports Files only)</small>
            </div>

            <div className="form-group">
              <label>File Path</label>
              <input
                type="text"
                className="form-control"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="e.g., /year/month/day/ or leave blank for root"
              />
              <small className="form-help">
                Leave blank if file is in the main bucket. For files in subfolders, provide the path starting with /.<br/>
                Example: If file exists in bucket 'source' → subfolder 'year' → 'month' → 'day', enter: <code>/year/month/day/</code>
              </small>
            </div>

            <div className="form-group">
              <label>File Name/Pattern *</label>
              <input
                type="text"
                className="form-control"
                value={fileNamePattern}
                onChange={(e) => setFileNamePattern(e.target.value)}
                placeholder="e.g., sales_data.csv or sales_*.csv"
              />
              <small className="form-help">
                Enter a complete file name (e.g., <code>data.csv</code>) or a pattern with wildcards.<br/>
                Wildcards: <code>*</code> matches multiple characters, <code>?</code> matches single character.<br/>
                File existence will be validated during job execution.
              </small>
            </div>
          </div>
        )}

        {/* Step 3: Schema & Field Mapping */}
        {currentStep === 3 && (
          <div className="wizard-step-content">
            <h2><FiEdit /> Field Mapping</h2>
            
            {loadingSchema ? (
              <LoadingSpinner size="small" />
            ) : schema && schema.length > 0 ? (
              <TableBasedMapper
                schema={schema}
                fieldMappings={fieldMappings}
                onMappingsChange={setFieldMappings}
              />
            ) : (
              <div className="alert alert-warning">
                <FiAlertCircle /> No schema available. Please go back and validate the file pattern first.
              </div>
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

            <div className="form-group">
              <label>Target File Name</label>
              <input
                type="text"
                className="form-control"
                value={targetFileName}
                onChange={(e) => setTargetFileName(e.target.value)}
                placeholder="e.g., output.csv or output_<current_date>.csv"
              />
              <small className="form-help">
                Optional: Specify output file name. Use <code>&lt;current_date&gt;</code> for YYYYMMDD or <code>&lt;current_timestamp&gt;</code> for Unix timestamp.<br/>
                Examples: <code>sales_<current_date>.csv</code> → <code>sales_20251018.csv</code> | <code>data_<current_timestamp>.json</code> → <code>data_1729267200.json</code>
              </small>
            </div>

            <div className="form-group">
              <label>Target File Format</label>
              <select
                className="form-control"
                value={targetFileFormat}
                onChange={(e) => setTargetFileFormat(e.target.value)}
              >
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
                <option value="xml">XML</option>
                <option value="xlsx">Excel (XLSX)</option>
                <option value="parquet">Parquet</option>
              </select>
              <small className="form-help">Choose output file format (any format can be converted to any other format)</small>
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
      )}
      </div>
  );
}

export default MappingWizard;
