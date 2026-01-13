import React, { useState, useEffect, useMemo } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiAlertTriangle, FiCheck, FiX, FiRefreshCw } from 'react-icons/fi';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { createQualityRule, updateQualityRule, deleteQualityRule, getProjects } from '../api/qualityRulesService';
import { formatDate } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/global-page-styles.css';

function QualityRules() {
  const { hasWritePermission } = useAuth();
  const [rules, setRules] = useState([]);
  const [projects, setProjects] = useState([]);
  const [subProjects, setSubProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [currentRule, setCurrentRule] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [itemsPerPage] = useState(20);
  const [violationsSummary, setViolationsSummary] = useState([]);
  const [statistics, setStatistics] = useState({
    total: 0,
    enabled: 0,
    disabled: 0,
    violations: 0
  });

  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterSubProjectId, setFilterSubProjectId] = useState('');
  const [filterRuleType, setFilterRuleType] = useState('');
  const [filterEnabled, setFilterEnabled] = useState('');

  const [formData, setFormData] = useState({
    rule_name: '',
    rule_type: 'completeness',
    description: '',
    column_name: '',
    severity: 'warning',
    project_id: '',
    sub_project_id: '',
    enabled: true,
    rule_config: {}
  });

  const [formErrors, setFormErrors] = useState({});
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, message: '', title: '' });

  useEffect(() => {
    fetchData();
  }, [currentPage, filterProjectId, filterSubProjectId, filterRuleType, filterEnabled]);

  const [filterSubProjects, setFilterSubProjects] = useState([]);

  useEffect(() => {
    const loadFilterSubProjects = async () => {
      if (filterProjectId) {
        try {
          const response = await axios.get(`/api/projects/${filterProjectId}/sub-projects`);
          const subs = response.data?.subProjects || response.data || [];
          setFilterSubProjects(Array.isArray(subs) ? subs : []);
        } catch (err) {
          console.error('Failed to load filter subprojects:', err);
          setFilterSubProjects([]);
        }
      } else {
        setFilterSubProjects([]);
        if (filterSubProjectId) {
          setFilterSubProjectId('');
        }
      }
    };
    loadFilterSubProjects();
  }, [filterProjectId]);

  const hasActiveFilters = filterProjectId || filterSubProjectId || filterRuleType || filterEnabled;

  const handleClearFilters = () => {
    setFilterProjectId('');
    setFilterSubProjectId('');
    setFilterRuleType('');
    setFilterEnabled('');
    setCurrentPage(1);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const filters = {
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage
      };
      
      if (filterProjectId) filters.project_id = filterProjectId;
      if (filterSubProjectId) filters.sub_project_id = filterSubProjectId;
      if (filterRuleType) filters.rule_type = filterRuleType;
      if (filterEnabled !== '') filters.enabled = filterEnabled;

      const response = await axios.get('/api/quality-rules/init-data', {
        params: { ...filters, days: 30 }
      });
      const data = response.data;
      
      setRules(data.rules || []);
      setPagination(data.pagination || {});
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setViolationsSummary(data.summary || []);
      
      const totalViolations = (data.summary || []).reduce((sum, item) => sum + parseInt(item.total_violations || 0), 0);
      
      setStatistics({
        total: data.pagination?.total || 0,
        enabled: (data.rules || []).filter(r => r.enabled).length,
        disabled: (data.rules || []).filter(r => !r.enabled).length,
        violations: totalViolations
      });
      
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load quality rules. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSubProjects = async (parentProjectId) => {
    if (!parentProjectId) {
      setSubProjects([]);
      return;
    }
    
    try {
      const response = await axios.get(`/api/projects/${parentProjectId}/sub-projects`);
      const subs = response.data?.subProjects || response.data || [];
      setSubProjects(Array.isArray(subs) ? subs : []);
    } catch (err) {
      console.error('Error fetching sub-projects:', err);
      setSubProjects([]);
    }
  };

  const handleProjectChange = async (projectId) => {
    setFormData({
      ...formData,
      project_id: projectId,
      sub_project_id: ''
    });
    await fetchSubProjects(projectId);
  };

  const handleAddRule = () => {
    setCurrentRule(null);
    setFormData({
      rule_name: '',
      rule_type: 'completeness',
      description: '',
      column_name: '',
      severity: 'warning',
      project_id: '',
      sub_project_id: '',
      enabled: true,
      rule_config: {}
    });
    setFormErrors({});
    setSubProjects([]);
    setShowRuleForm(true);
  };

  const handleEditRule = async (rule) => {
    setCurrentRule(rule);
    
    let ruleConfig = typeof rule.rule_config === 'string' ? JSON.parse(rule.rule_config) : (rule.rule_config || {});
    
    if (rule.rule_type === 'completeness' && ruleConfig.threshold !== undefined) {
      ruleConfig.threshold = Math.round(ruleConfig.threshold * 100);
    }
    
    setFormData({
      rule_name: rule.rule_name,
      rule_type: rule.rule_type,
      description: rule.description || '',
      column_name: rule.column_name || '',
      severity: rule.severity,
      project_id: rule.project_id || '',
      sub_project_id: rule.sub_project_id || '',
      enabled: rule.enabled,
      rule_config: ruleConfig
    });
    setFormErrors({});
    
    if (rule.project_id) {
      await fetchSubProjects(rule.project_id);
    }
    
    setShowRuleForm(true);
  };

  const handleDeleteRule = async (ruleId) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: 'Are you sure you want to delete this quality rule? All associated violations will also be deleted.',
      action: async () => {
        try {
          await deleteQualityRule(ruleId);
          await fetchData();
        } catch (err) {
          console.error('Error deleting quality rule:', err);
          setError('Failed to delete quality rule. Please try again.');
        }
      }
    });
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.rule_name.trim()) {
      errors.rule_name = 'Rule name is required';
    }
    
    if (!formData.rule_type) {
      errors.rule_type = 'Rule type is required';
    }
    
    const config = formData.rule_config;
    
    switch (formData.rule_type) {
      case 'completeness':
        if (config.threshold === undefined || config.threshold === null || config.threshold < 0 || config.threshold > 100) {
          errors.threshold = 'Threshold must be between 0 and 100';
        }
        if (!formData.column_name && !config.columns?.length) {
          errors.column = 'At least one column is required';
        }
        break;
        
      case 'validity':
        if (!config.validity_type) {
          errors.validity_type = 'Validity type is required';
        }
        if (config.validity_type === 'pattern' && !config.pattern) {
          errors.pattern = 'Pattern is required for pattern validation';
        }
        if (config.validity_type === 'range' && (config.min === undefined || config.max === undefined)) {
          errors.range = 'Min and max values are required for range validation';
        }
        if (config.validity_type === 'enum' && (!config.allowed_values || config.allowed_values.length === 0)) {
          errors.allowed_values = 'At least one allowed value is required';
        }
        if (config.validity_type === 'datatype' && !config.datatype) {
          errors.datatype = 'Datatype is required';
        }
        break;
        
      case 'consistency':
        if (!config.consistency_type) {
          errors.consistency_type = 'Consistency type is required';
        }
        if (config.consistency_type === 'cross_field' && !config.expression) {
          errors.expression = 'Expression is required for cross-field consistency';
        }
        break;
        
      case 'uniqueness':
        if (!config.columns || config.columns.length === 0) {
          errors.columns = 'At least one column is required for uniqueness check';
        }
        break;
        
      case 'freshness':
        if (!config.max_age_hours || config.max_age_hours <= 0) {
          errors.max_age_hours = 'Max age hours must be greater than 0';
        }
        if (!config.timestamp_column && !formData.column_name) {
          errors.timestamp_column = 'Timestamp column is required';
        }
        break;
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmitRule = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    try {
      let ruleConfig = { ...formData.rule_config };
      if (formData.rule_type === 'completeness' && ruleConfig.threshold !== undefined) {
        ruleConfig.threshold = ruleConfig.threshold / 100;
      }
      
      const ruleData = {
        rule_name: formData.rule_name,
        rule_type: formData.rule_type,
        description: formData.description,
        column_name: formData.column_name,
        rule_config: ruleConfig,
        severity: formData.severity,
        project_id: formData.project_id || null,
        sub_project_id: formData.sub_project_id || null,
        enabled: formData.enabled
      };
      
      if (currentRule) {
        await updateQualityRule(currentRule.id, ruleData);
      } else {
        await createQualityRule(ruleData);
      }
      
      setShowRuleForm(false);
      await fetchData();
    } catch (err) {
      console.error('Error saving quality rule:', err);
      setError(err.response?.data?.error || 'Failed to save quality rule. Please try again.');
    }
  };

  const handleRuleTypeChange = (newType) => {
    const defaultConfig = {};
    if (newType === 'completeness') {
      defaultConfig.threshold = 95;
    }
    setFormData({
      ...formData,
      rule_type: newType,
      rule_config: defaultConfig
    });
    setFormErrors({});
  };

  const updateRuleConfig = (key, value) => {
    setFormData({
      ...formData,
      rule_config: {
        ...formData.rule_config,
        [key]: value
      }
    });
  };

  const getRuleTypeDescription = (type) => {
    const descriptions = {
      completeness: 'Ensure data fields are filled in and not missing',
      validity: 'Validate that data values match expected formats and ranges',
      consistency: 'Check that related data fields are logically consistent',
      uniqueness: 'Verify that values are unique (no duplicates)',
      freshness: 'Monitor data age and detect stale information',
      validity_check: 'General validity validation with pattern or datatype checks',
      length_check: 'Validate string length within min/max bounds',
      range_check: 'Validate numeric values within min/max bounds'
    };
    return descriptions[type] || '';
  };

  const renderRuleTypeFields = () => {
    const config = formData.rule_config;
    
    switch (formData.rule_type) {
      case 'completeness':
        return (
          <div className="gps-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div className="gps-form-group">
              <label htmlFor="completeness-threshold" className="gps-form-label">Completeness Threshold (%)</label>
              <span className="gps-form-hint" style={{ marginTop: 0, marginBottom: '8px' }}>Minimum percentage of non-null values required</span>
              <input
                id="completeness-threshold"
                type="range"
                min="0"
                max="100"
                value={config.threshold || 95}
                onChange={(e) => updateRuleConfig('threshold', parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#025043' }}
              />
              <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 700, color: '#025043' }}>{config.threshold || 95}%</div>
              {formErrors.threshold && <span className="gps-form-hint" style={{ color: '#e53e3e' }}>{formErrors.threshold}</span>}
            </div>
            
            <div className="gps-form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="completeness-column-name" className="gps-form-label">Column Name</label>
              <span className="gps-form-hint" style={{ marginTop: 0, marginBottom: '8px' }}>The column to check for completeness</span>
              <input
                id="completeness-column-name"
                type="text"
                className="gps-form-input"
                value={formData.column_name}
                onChange={(e) => setFormData({ ...formData, column_name: e.target.value })}
                placeholder="e.g., email, customer_id"
              />
              {formErrors.column && <span className="gps-form-hint" style={{ color: '#e53e3e' }}>{formErrors.column}</span>}
            </div>
          </div>
        );
        
      case 'validity':
        return (
          <div className="gps-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div className="gps-form-group">
              <label htmlFor="validity-type" className="gps-form-label">Validation Type</label>
              <select
                id="validity-type"
                className="gps-form-select"
                value={config.validity_type || ''}
                onChange={(e) => updateRuleConfig('validity_type', e.target.value)}
              >
                <option value="">Select type...</option>
                <option value="pattern">Pattern Match (Regex)</option>
                <option value="range">Numeric Range</option>
                <option value="enum">Allowed Values List</option>
                <option value="datatype">Data Type Check</option>
              </select>
              {formErrors.validity_type && <span className="gps-form-hint" style={{ color: '#e53e3e' }}>{formErrors.validity_type}</span>}
            </div>
            
            {config.validity_type === 'pattern' && (
              <div className="gps-form-group">
                <label htmlFor="validity-pattern" className="gps-form-label">Pattern (Regular Expression)</label>
                <input
                  id="validity-pattern"
                  type="text"
                  className="gps-form-input"
                  value={config.pattern || ''}
                  onChange={(e) => updateRuleConfig('pattern', e.target.value)}
                  placeholder="^[a-zA-Z0-9]+$"
                />
                {formErrors.pattern && <span className="gps-form-hint" style={{ color: '#e53e3e' }}>{formErrors.pattern}</span>}
              </div>
            )}
            
            {config.validity_type === 'range' && (
              <div className="gps-form-row">
                <div className="gps-form-group">
                  <label htmlFor="validity-min" className="gps-form-label">Minimum Value</label>
                  <input
                    id="validity-min"
                    type="number"
                    className="gps-form-input"
                    value={config.min || ''}
                    onChange={(e) => updateRuleConfig('min', parseFloat(e.target.value))}
                  />
                </div>
                <div className="gps-form-group">
                  <label htmlFor="validity-max" className="gps-form-label">Maximum Value</label>
                  <input
                    id="validity-max"
                    type="number"
                    className="gps-form-input"
                    value={config.max || ''}
                    onChange={(e) => updateRuleConfig('max', parseFloat(e.target.value))}
                  />
                </div>
                {formErrors.range && <span className="gps-form-hint" style={{ color: '#e53e3e', gridColumn: '1 / -1' }}>{formErrors.range}</span>}
              </div>
            )}
            
            {config.validity_type === 'enum' && (
              <div className="gps-form-group">
                <label htmlFor="validity-allowed-values" className="gps-form-label">Allowed Values (comma-separated)</label>
                <textarea
                  id="validity-allowed-values"
                  className="gps-form-textarea"
                  rows="3"
                  value={(config.allowed_values || []).join(', ')}
                  onChange={(e) => updateRuleConfig('allowed_values', e.target.value.split(',').map(v => v.trim()).filter(v => v))}
                  placeholder="Active, Pending, Closed"
                />
                {formErrors.allowed_values && <span className="gps-form-hint" style={{ color: '#e53e3e' }}>{formErrors.allowed_values}</span>}
              </div>
            )}
            
            {config.validity_type === 'datatype' && (
              <div className="gps-form-group">
                <label htmlFor="validity-datatype" className="gps-form-label">Expected Data Type</label>
                <select
                  id="validity-datatype"
                  className="gps-form-select"
                  value={config.datatype || ''}
                  onChange={(e) => updateRuleConfig('datatype', e.target.value)}
                >
                  <option value="">Select data type...</option>
                  <option value="string">Text</option>
                  <option value="integer">Whole Number</option>
                  <option value="float">Decimal Number</option>
                  <option value="boolean">True/False</option>
                  <option value="date">Date</option>
                  <option value="datetime">Date & Time</option>
                </select>
                {formErrors.datatype && <span className="gps-form-hint" style={{ color: '#e53e3e' }}>{formErrors.datatype}</span>}
              </div>
            )}
            
            <div className="gps-form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="validity-column-name" className="gps-form-label">Column Name</label>
              <input
                id="validity-column-name"
                type="text"
                className="gps-form-input"
                value={formData.column_name}
                onChange={(e) => setFormData({ ...formData, column_name: e.target.value })}
                placeholder="e.g., status, amount"
              />
            </div>
          </div>
        );
        
      case 'consistency':
        return (
          <div className="gps-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div className="gps-form-group">
              <label htmlFor="consistency-type" className="gps-form-label">Consistency Type</label>
              <select
                id="consistency-type"
                className="gps-form-select"
                value={config.consistency_type || ''}
                onChange={(e) => updateRuleConfig('consistency_type', e.target.value)}
              >
                <option value="">Select type...</option>
                <option value="cross_field">Cross-Field Validation</option>
                <option value="format_consistency">Format Consistency</option>
              </select>
              {formErrors.consistency_type && <span className="gps-form-hint" style={{ color: '#e53e3e' }}>{formErrors.consistency_type}</span>}
            </div>
            
            {config.consistency_type === 'cross_field' && (
              <div className="gps-form-group">
                <label htmlFor="consistency-expression" className="gps-form-label">Validation Expression</label>
                <textarea
                  id="consistency-expression"
                  className="gps-form-textarea"
                  rows="3"
                  value={config.expression || ''}
                  onChange={(e) => updateRuleConfig('expression', e.target.value)}
                  placeholder="end_date > start_date"
                />
                {formErrors.expression && <span className="gps-form-hint" style={{ color: '#e53e3e' }}>{formErrors.expression}</span>}
              </div>
            )}
            
            {config.consistency_type === 'format_consistency' && (
              <div className="gps-form-group">
                <label htmlFor="consistency-format-pattern" className="gps-form-label">Expected Format Pattern</label>
                <input
                  id="consistency-format-pattern"
                  type="text"
                  className="gps-form-input"
                  value={config.format_pattern || ''}
                  onChange={(e) => updateRuleConfig('format_pattern', e.target.value)}
                  placeholder="^\d{3}-\d{2}-\d{4}$"
                />
              </div>
            )}
            
            <div className="gps-form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="consistency-column-name" className="gps-form-label">Column Name (Optional)</label>
              <input
                id="consistency-column-name"
                type="text"
                className="gps-form-input"
                value={formData.column_name}
                onChange={(e) => setFormData({ ...formData, column_name: e.target.value })}
                placeholder="Leave blank for multi-column rules"
              />
            </div>
          </div>
        );
        
      case 'uniqueness':
        return (
          <div className="gps-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div className="gps-form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="uniqueness-columns" className="gps-form-label">Columns to Check for Uniqueness</label>
              <span className="gps-form-hint" style={{ marginTop: 0, marginBottom: '8px' }}>Comma-separated list of columns that should form a unique key</span>
              <textarea
                id="uniqueness-columns"
                className="gps-form-textarea"
                rows="2"
                value={(config.columns || []).join(', ')}
                onChange={(e) => updateRuleConfig('columns', e.target.value.split(',').map(v => v.trim()).filter(v => v))}
                placeholder="customer_id, order_id"
              />
              {formErrors.columns && <span className="gps-form-hint" style={{ color: '#e53e3e' }}>{formErrors.columns}</span>}
            </div>
          </div>
        );
        
      case 'freshness':
        return (
          <div className="gps-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div className="gps-form-group">
              <label htmlFor="freshness-max-age" className="gps-form-label">Maximum Age (Hours)</label>
              <span className="gps-form-hint" style={{ marginTop: 0, marginBottom: '8px' }}>Data older than this will be flagged as stale</span>
              <input
                id="freshness-max-age"
                type="number"
                className="gps-form-input"
                min="1"
                value={config.max_age_hours || 24}
                onChange={(e) => updateRuleConfig('max_age_hours', parseInt(e.target.value))}
              />
              {formErrors.max_age_hours && <span className="gps-form-hint" style={{ color: '#e53e3e' }}>{formErrors.max_age_hours}</span>}
            </div>
            
            <div className="gps-form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="freshness-timestamp-column" className="gps-form-label">Timestamp Column</label>
              <input
                id="freshness-timestamp-column"
                type="text"
                className="gps-form-input"
                value={config.timestamp_column || formData.column_name}
                onChange={(e) => {
                  updateRuleConfig('timestamp_column', e.target.value);
                  setFormData({ ...formData, column_name: e.target.value });
                }}
                placeholder="e.g., created_at, updated_at"
              />
              {formErrors.timestamp_column && <span className="gps-form-hint" style={{ color: '#e53e3e' }}>{formErrors.timestamp_column}</span>}
            </div>
          </div>
        );
      
      case 'validity_check':
        return (
          <div className="gps-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div className="gps-form-group">
              <label htmlFor="validitycheck-pattern" className="gps-form-label">Pattern (Regex) - Optional</label>
              <span className="gps-form-hint" style={{ marginTop: 0, marginBottom: '8px' }}>Regular expression pattern to validate values</span>
              <input
                id="validitycheck-pattern"
                type="text"
                className="gps-form-input"
                value={config.pattern || ''}
                onChange={(e) => updateRuleConfig('pattern', e.target.value)}
                placeholder="^[A-Z]{2}[0-9]{4}$"
              />
            </div>
            
            <div className="gps-form-group">
              <label htmlFor="validitycheck-datatype" className="gps-form-label">Data Type - Optional</label>
              <select
                id="validitycheck-datatype"
                className="gps-form-select"
                value={config.datatype || ''}
                onChange={(e) => updateRuleConfig('datatype', e.target.value)}
              >
                <option value="">No type check</option>
                <option value="string">Text</option>
                <option value="number">Number</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="date">Date</option>
              </select>
            </div>
            
            <div className="gps-form-group">
              <label htmlFor="validitycheck-custom-message" className="gps-form-label">Custom Error Message - Optional</label>
              <input
                id="validitycheck-custom-message"
                type="text"
                className="gps-form-input"
                value={config.custom_message || ''}
                onChange={(e) => updateRuleConfig('custom_message', e.target.value)}
                placeholder="Value must be a valid product code"
              />
            </div>
            
            <div className="gps-form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="validitycheck-column-name" className="gps-form-label">Column Name</label>
              <input
                id="validitycheck-column-name"
                type="text"
                className="gps-form-input"
                value={formData.column_name}
                onChange={(e) => setFormData({ ...formData, column_name: e.target.value })}
                placeholder="e.g., product_code, status"
              />
            </div>
          </div>
        );
      
      case 'length_check':
        return (
          <div className="gps-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div className="gps-form-row">
              <div className="gps-form-group">
                <label htmlFor="length-min-length" className="gps-form-label">Minimum Length</label>
                <input
                  id="length-min-length"
                  type="number"
                  className="gps-form-input"
                  min="0"
                  value={config.min_length || ''}
                  onChange={(e) => updateRuleConfig('min_length', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="0"
                />
              </div>
              <div className="gps-form-group">
                <label htmlFor="length-max-length" className="gps-form-label">Maximum Length</label>
                <input
                  id="length-max-length"
                  type="number"
                  className="gps-form-input"
                  min="0"
                  value={config.max_length || ''}
                  onChange={(e) => updateRuleConfig('max_length', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="255"
                />
              </div>
            </div>
            
            <div className="gps-form-group">
              <label htmlFor="length-exact-length" className="gps-form-label">Exact Length (Optional)</label>
              <span className="gps-form-hint" style={{ marginTop: 0, marginBottom: '8px' }}>If set, overrides min/max and requires exact character count</span>
              <input
                id="length-exact-length"
                type="number"
                className="gps-form-input"
                min="0"
                value={config.exact_length || ''}
                onChange={(e) => updateRuleConfig('exact_length', e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="Leave empty to use min/max"
              />
            </div>
            
            <div className="gps-form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="length-column-name" className="gps-form-label">Column Name</label>
              <input
                id="length-column-name"
                type="text"
                className="gps-form-input"
                value={formData.column_name}
                onChange={(e) => setFormData({ ...formData, column_name: e.target.value })}
                placeholder="e.g., zip_code, phone_number"
              />
            </div>
          </div>
        );
      
      case 'range_check':
        return (
          <div className="gps-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div className="gps-form-row">
              <div className="gps-form-group">
                <label htmlFor="range-min" className="gps-form-label">Minimum Value</label>
                <input
                  id="range-min"
                  type="number"
                  className="gps-form-input"
                  value={config.min !== undefined ? config.min : ''}
                  onChange={(e) => updateRuleConfig('min', e.target.value !== '' ? parseFloat(e.target.value) : undefined)}
                  placeholder="No minimum"
                />
              </div>
              <div className="gps-form-group">
                <label htmlFor="range-max" className="gps-form-label">Maximum Value</label>
                <input
                  id="range-max"
                  type="number"
                  className="gps-form-input"
                  value={config.max !== undefined ? config.max : ''}
                  onChange={(e) => updateRuleConfig('max', e.target.value !== '' ? parseFloat(e.target.value) : undefined)}
                  placeholder="No maximum"
                />
              </div>
            </div>
            
            <div className="gps-form-row">
              <div className="gps-form-group">
                <label className="gps-form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={config.exclusive_min || false}
                    onChange={(e) => updateRuleConfig('exclusive_min', e.target.checked)}
                  />
                  Exclusive Minimum (value must be greater than min)
                </label>
              </div>
              <div className="gps-form-group">
                <label className="gps-form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={config.exclusive_max || false}
                    onChange={(e) => updateRuleConfig('exclusive_max', e.target.checked)}
                  />
                  Exclusive Maximum (value must be less than max)
                </label>
              </div>
            </div>
            
            <div className="gps-form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="range-column-name" className="gps-form-label">Column Name</label>
              <input
                id="range-column-name"
                type="text"
                className="gps-form-input"
                value={formData.column_name}
                onChange={(e) => setFormData({ ...formData, column_name: e.target.value })}
                placeholder="e.g., price, quantity, age"
              />
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  const totalPages = Math.ceil((pagination.total || 0) / itemsPerPage);

  useEffect(() => {
    setFilterSubProjectId('');
  }, [filterProjectId]);

  return (
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Data Quality Rules</h1>
          <p className="gps-page-subtitle">Define and manage rules to monitor data quality across your datasets</p>
        </div>
        <div className="gps-header-actions">
          {hasWritePermission('quality_rules') && (
            <button className="gps-btn gps-btn--primary" onClick={handleAddRule}>
              <FiPlus /> Create Rule
            </button>
          )}
        </div>
      </div>

      <div className="gps-card-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '24px' }}>
        <div className="gps-stat-card">
          <span className="gps-text-muted" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Rules</span>
          <span style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937' }}>{statistics.total}</span>
        </div>
        <div className="gps-stat-card" style={{ borderLeft: '3px solid #16a34a' }}>
          <span className="gps-text-muted" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Enabled Rules</span>
          <span style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>{statistics.enabled}</span>
        </div>
        <div className="gps-stat-card" style={{ borderLeft: '3px solid #f59e0b' }}>
          <span className="gps-text-muted" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Disabled Rules</span>
          <span style={{ fontSize: '24px', fontWeight: 700, color: '#f59e0b' }}>{statistics.disabled}</span>
        </div>
        <div className="gps-stat-card" style={{ borderLeft: '3px solid #e53e3e' }}>
          <span className="gps-text-muted" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Violations (30d)</span>
          <span style={{ fontSize: '24px', fontWeight: 700, color: '#e53e3e' }}>{statistics.violations.toLocaleString()}</span>
        </div>
      </div>

      <div className="gps-filters" style={{ marginBottom: '16px' }}>
        <select
          className="gps-filter-select"
          value={filterProjectId}
          onChange={(e) => {
            setFilterProjectId(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">All Projects</option>
          {projects.filter(p => !p.parent_id).map(project => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        
        <select
          className="gps-filter-select"
          value={filterSubProjectId}
          onChange={(e) => {
            setFilterSubProjectId(e.target.value);
            setCurrentPage(1);
          }}
          disabled={!filterProjectId}
          style={{ opacity: filterProjectId ? 1 : 0.6 }}
        >
          <option value="">All Subprojects</option>
          {filterSubProjects.map(subProject => (
            <option key={subProject.id} value={subProject.id}>
              {subProject.name}
            </option>
          ))}
        </select>
        
        <select
          className="gps-filter-select"
          value={filterRuleType}
          onChange={(e) => {
            setFilterRuleType(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">All Types</option>
          <option value="completeness">Completeness</option>
          <option value="validity">Validity</option>
          <option value="consistency">Consistency</option>
          <option value="uniqueness">Uniqueness</option>
          <option value="freshness">Freshness</option>
          <option value="validity_check">Validity Check</option>
          <option value="length_check">Length Check</option>
          <option value="range_check">Range Check</option>
        </select>
        
        <select
          className="gps-filter-select"
          value={filterEnabled}
          onChange={(e) => {
            setFilterEnabled(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">All Status</option>
          <option value="true">Enabled Only</option>
          <option value="false">Disabled Only</option>
        </select>

        {hasActiveFilters && (
          <button 
            type="button"
            className="gps-btn gps-btn--secondary" 
            onClick={handleClearFilters}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FiRefreshCw size={14} /> Clear Filters
          </button>
        )}
      </div>

      {loading ? (
        <LoadingSpinner size="small" />
      ) : error ? (
        <div className="gps-alert gps-alert--error">
          <FiAlertTriangle />
          <span>{error}</span>
          <button className="gps-btn gps-btn--primary" onClick={fetchData} style={{ marginLeft: 'auto' }}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '12px' }}>
            Showing {rules.length} of {pagination.total || rules.length} quality rules
          </div>
          
          {rules.length === 0 ? (
            <div className="gps-empty-state">
              <p>
                {hasActiveFilters
                  ? 'No rules match your current filters. Try adjusting your filter criteria.'
                  : 'No quality rules found. Create one to get started!'
                }
              </p>
              {hasWritePermission('quality_rules') && !hasActiveFilters && (
                <button className="gps-btn gps-btn--primary" onClick={handleAddRule} style={{ marginTop: '12px' }}>
                  <FiPlus /> Create Your First Quality Rule
                </button>
              )}
            </div>
          ) : (
            <div className="gps-table-container">
              <table className="gps-table">
                <thead>
                  <tr>
                    <th>Rule Name</th>
                    <th>Project</th>
                    <th>Subproject</th>
                    <th>Type</th>
                    <th>Column</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Created</th>
                    {hasWritePermission('quality_rules') && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {rules.map(rule => (
                    <tr key={rule.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: '500' }}>{rule.rule_name}</span>
                          {rule.description && (
                            <span style={{ fontSize: '10px', color: '#666', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {rule.description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{rule.project_name || '-'}</td>
                      <td>{rule.sub_project_name || '-'}</td>
                      <td>
                        <span className={`gps-badge gps-badge--${rule.rule_type === 'completeness' ? 'info' : rule.rule_type === 'validity' ? 'info' : rule.rule_type === 'consistency' ? 'success' : rule.rule_type === 'uniqueness' ? 'warning' : 'muted'}`}>
                          {rule.rule_type}
                        </span>
                      </td>
                      <td>{rule.column_name || '-'}</td>
                      <td>
                        <span className={`gps-badge gps-badge--${rule.severity === 'critical' ? 'danger' : rule.severity === 'error' ? 'danger' : 'warning'}`}>
                          {rule.severity}
                        </span>
                      </td>
                      <td>
                        {rule.enabled ? (
                          <span className="gps-badge gps-badge--success">
                            <FiCheck style={{ marginRight: '4px' }} /> Enabled
                          </span>
                        ) : (
                          <span className="gps-badge gps-badge--muted">Disabled</span>
                        )}
                      </td>
                      <td>{formatDate(rule.created_at)}</td>
                      {hasWritePermission('quality_rules') && (
                        <td>
                          <div className="gps-action-buttons">
                            <button 
                              className="gps-icon-btn gps-icon-btn--edit" 
                              title="Edit Rule"
                              onClick={() => handleEditRule(rule)}
                            >
                              <FiEdit2 />
                            </button>
                            <button 
                              className="gps-icon-btn gps-icon-btn--delete" 
                              title="Delete Rule"
                              onClick={() => handleDeleteRule(rule.id)}
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {pagination.total > itemsPerPage && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              totalItems={pagination.total}
            />
          )}
        </>
      )}

      {showRuleForm && (
        <div className="gps-modal-overlay">
          <div className="gps-modal gps-modal--large">
            <div className="gps-modal-header">
              <h2 className="gps-modal-title">{currentRule ? 'Edit Quality Rule' : 'Create New Quality Rule'}</h2>
              <button className="gps-modal-close" onClick={() => setShowRuleForm(false)}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleSubmitRule}>
              <div className="gps-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <div className="gps-form-row">
                  <div className="gps-form-group">
                    <label htmlFor="rule-name" className="gps-form-label">Rule Name *</label>
                    <input
                      id="rule-name"
                      type="text"
                      className="gps-form-input"
                      value={formData.rule_name}
                      onChange={(e) => setFormData({ ...formData, rule_name: e.target.value })}
                      placeholder="e.g., Email Address Completeness"
                      required
                    />
                    {formErrors.rule_name && <span className="gps-form-hint" style={{ color: '#e53e3e' }}>{formErrors.rule_name}</span>}
                  </div>
                  
                  <div className="gps-form-group">
                    <label htmlFor="project-select" className="gps-form-label">Project (Optional)</label>
                    <select
                      id="project-select"
                      className="gps-form-select"
                      value={formData.project_id}
                      onChange={(e) => handleProjectChange(e.target.value)}
                    >
                      <option value="">All Projects</option>
                      {projects.filter(p => !p.parent_id).map(project => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {formData.project_id && (
                  <div className="gps-form-group">
                    <label htmlFor="subproject-select" className="gps-form-label">Sub-Project (Optional)</label>
                    <select
                      id="subproject-select"
                      className="gps-form-select"
                      value={formData.sub_project_id}
                      onChange={(e) => setFormData({ ...formData, sub_project_id: e.target.value })}
                    >
                      <option value="">None (Parent Project Level)</option>
                      {subProjects.map(subProject => (
                        <option key={subProject.id} value={subProject.id}>
                          {subProject.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div className="gps-form-group">
                  <label htmlFor="rule-description" className="gps-form-label">Description</label>
                  <textarea
                    id="rule-description"
                    className="gps-form-textarea"
                    rows="2"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe what this rule checks..."
                  />
                </div>
                
                <div className="gps-form-row">
                  <div className="gps-form-group">
                    <label htmlFor="rule-type" className="gps-form-label">Rule Type *</label>
                    <select
                      id="rule-type"
                      className="gps-form-select"
                      value={formData.rule_type}
                      onChange={(e) => handleRuleTypeChange(e.target.value)}
                      required
                    >
                      <option value="completeness">Completeness</option>
                      <option value="validity">Validity</option>
                      <option value="consistency">Consistency</option>
                      <option value="uniqueness">Uniqueness</option>
                      <option value="freshness">Freshness</option>
                      <option value="validity_check">Validity Check (Generic)</option>
                      <option value="length_check">Length Check (Generic)</option>
                      <option value="range_check">Range Check (Generic)</option>
                    </select>
                    <span className="gps-form-hint">{getRuleTypeDescription(formData.rule_type)}</span>
                  </div>
                  
                  <div className="gps-form-group">
                    <label htmlFor="severity-select" className="gps-form-label">Severity</label>
                    <select
                      id="severity-select"
                      className="gps-form-select"
                      value={formData.severity}
                      onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                    >
                      <option value="warning">Warning</option>
                      <option value="error">Error</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>
                
                {renderRuleTypeFields()}
                
                <div className="gps-form-group" style={{ marginTop: '16px' }}>
                  <label htmlFor="enable-rule" className="gps-checkbox-label">
                    <input
                      id="enable-rule"
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    />
                    <span>Enable this rule immediately</span>
                  </label>
                </div>
              </div>
              <div className="gps-modal-footer">
                <button type="button" className="gps-btn gps-btn--secondary" onClick={() => setShowRuleForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="gps-btn gps-btn--primary">
                  {currentRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={() => {
          confirmModal.action();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
}

export default QualityRules;
