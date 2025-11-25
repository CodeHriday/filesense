import React, { useState, useEffect, useMemo } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiAlertTriangle, FiCheck } from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { getQualityRules, createQualityRule, updateQualityRule, deleteQualityRule, getViolationsSummary, getProjects } from '../api/qualityRulesService';
import { formatDate } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/global-page-styles.css';
import './QualityRules.css';

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

  // Filter state
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterSubProjectId, setFilterSubProjectId] = useState('');
  const [filterRuleType, setFilterRuleType] = useState('');
  const [filterEnabled, setFilterEnabled] = useState('');

  // Form state
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

  // Get unique projects from the rules data for filtering
  const uniqueProjects = useMemo(() => {
    const projectSet = new Map();
    rules.forEach(rule => {
      if (rule.project_id && rule.project_name) {
        projectSet.set(rule.project_id, rule.project_name);
      }
    });
    return Array.from(projectSet.entries()).map(([id, name]) => ({ id, name }));
  }, [rules]);

  // Get unique subprojects based on selected project filter
  const uniqueSubProjects = useMemo(() => {
    const subProjectSet = new Map();
    rules.forEach(rule => {
      if (rule.sub_project_id && rule.sub_project_name) {
        if (!filterProjectId || rule.project_id === parseInt(filterProjectId)) {
          subProjectSet.set(rule.sub_project_id, rule.sub_project_name);
        }
      }
    });
    return Array.from(subProjectSet.entries()).map(([id, name]) => ({ id, name }));
  }, [rules, filterProjectId]);

  // Filter rules based on all filter criteria
  const filteredRules = useMemo(() => {
    return rules.filter(rule => {
      if (filterProjectId && rule.project_id !== parseInt(filterProjectId)) return false;
      if (filterSubProjectId && rule.sub_project_id !== parseInt(filterSubProjectId)) return false;
      if (filterRuleType && rule.rule_type !== filterRuleType) return false;
      if (filterEnabled !== '') {
        const enabledValue = filterEnabled === 'true';
        if (rule.enabled !== enabledValue) return false;
      }
      return true;
    });
  }, [rules, filterProjectId, filterSubProjectId, filterRuleType, filterEnabled]);

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

      const [rulesData, projectsData, summaryData] = await Promise.all([
        getQualityRules(filters),
        getProjects(),
        getViolationsSummary({ days: 30 })
      ]);
      
      setRules(rulesData.rules || []);
      setPagination(rulesData.pagination || {});
      setProjects(Array.isArray(projectsData) ? projectsData : []);
      setViolationsSummary(summaryData.summary || []);
      
      const totalViolations = (summaryData.summary || []).reduce((sum, item) => sum + parseInt(item.total_violations || 0), 0);
      
      setStatistics({
        total: rulesData.pagination?.total || 0,
        enabled: (rulesData.rules || []).filter(r => r.enabled).length,
        disabled: (rulesData.rules || []).filter(r => !r.enabled).length,
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
      const allProjects = await getProjects();
      const filteredSubProjects = Array.isArray(allProjects) 
        ? allProjects.filter(p => p.parent_project_id === parseInt(parentProjectId))
        : [];
      setSubProjects(filteredSubProjects);
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
        if (!config.threshold || config.threshold < 0 || config.threshold > 100) {
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
    setFormData({
      ...formData,
      rule_type: newType,
      rule_config: {}
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

  const renderRuleTypeFields = () => {
    const config = formData.rule_config;
    
    switch (formData.rule_type) {
      case 'completeness':
        return (
          <div className="rule-type-fields">
            <div className="form-group">
              <label htmlFor="completeness-threshold">
                Completeness Threshold (%)
                <span className="field-hint">Minimum percentage of non-null values required</span>
              </label>
              <input
                type="range"
                id="completeness-threshold"
                min="0"
                max="100"
                value={config.threshold || 95}
                onChange={(e) => updateRuleConfig('threshold', parseInt(e.target.value))}
                className="threshold-slider"
              />
              <div className="threshold-value">{config.threshold || 95}%</div>
              {formErrors.threshold && <span className="error-text">{formErrors.threshold}</span>}
            </div>
            
            <div className="form-group">
              <label htmlFor="completeness-column">
                Column Name
                <span className="field-hint">The column to check for completeness</span>
              </label>
              <input
                type="text"
                id="completeness-column"
                className="form-control"
                value={formData.column_name}
                onChange={(e) => setFormData({ ...formData, column_name: e.target.value })}
                placeholder="e.g., email, customer_id"
              />
              {formErrors.column && <span className="error-text">{formErrors.column}</span>}
            </div>
          </div>
        );
        
      case 'validity':
        return (
          <div className="rule-type-fields">
            <div className="form-group">
              <label htmlFor="validity-type">
                Validation Type
                <span className="field-hint">Type of data validation to perform</span>
              </label>
              <select
                id="validity-type"
                className="form-control"
                value={config.validity_type || ''}
                onChange={(e) => updateRuleConfig('validity_type', e.target.value)}
              >
                <option value="">Select type...</option>
                <option value="pattern">Pattern Match (Regex)</option>
                <option value="range">Numeric Range</option>
                <option value="enum">Allowed Values List</option>
                <option value="datatype">Data Type Check</option>
              </select>
              {formErrors.validity_type && <span className="error-text">{formErrors.validity_type}</span>}
            </div>
            
            {config.validity_type === 'pattern' && (
              <div className="form-group">
                <label htmlFor="validity-pattern">
                  Pattern (Regular Expression)
                  <span className="field-hint">e.g., ^[A-Z0-9]+$ for alphanumeric uppercase</span>
                </label>
                <input
                  type="text"
                  id="validity-pattern"
                  className="form-control"
                  value={config.pattern || ''}
                  onChange={(e) => updateRuleConfig('pattern', e.target.value)}
                  placeholder="^[a-zA-Z0-9]+$"
                />
                {formErrors.pattern && <span className="error-text">{formErrors.pattern}</span>}
              </div>
            )}
            
            {config.validity_type === 'range' && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="validity-min">Minimum Value</label>
                  <input
                    type="number"
                    id="validity-min"
                    className="form-control"
                    value={config.min || ''}
                    onChange={(e) => updateRuleConfig('min', parseFloat(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="validity-max">Maximum Value</label>
                  <input
                    type="number"
                    id="validity-max"
                    className="form-control"
                    value={config.max || ''}
                    onChange={(e) => updateRuleConfig('max', parseFloat(e.target.value))}
                  />
                </div>
                {formErrors.range && <span className="error-text">{formErrors.range}</span>}
              </div>
            )}
            
            {config.validity_type === 'enum' && (
              <div className="form-group">
                <label htmlFor="validity-allowed-values">
                  Allowed Values
                  <span className="field-hint">Comma-separated list of allowed values</span>
                </label>
                <textarea
                  id="validity-allowed-values"
                  className="form-control"
                  rows="3"
                  value={(config.allowed_values || []).join(', ')}
                  onChange={(e) => updateRuleConfig('allowed_values', e.target.value.split(',').map(v => v.trim()).filter(v => v))}
                  placeholder="Active, Pending, Closed"
                />
                {formErrors.allowed_values && <span className="error-text">{formErrors.allowed_values}</span>}
              </div>
            )}
            
            {config.validity_type === 'datatype' && (
              <div className="form-group">
                <label htmlFor="validity-datatype">Expected Data Type</label>
                <select
                  id="validity-datatype"
                  className="form-control"
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
                {formErrors.datatype && <span className="error-text">{formErrors.datatype}</span>}
              </div>
            )}
            
            <div className="form-group">
              <label htmlFor="validity-column">Column Name</label>
              <input
                type="text"
                id="validity-column"
                className="form-control"
                value={formData.column_name}
                onChange={(e) => setFormData({ ...formData, column_name: e.target.value })}
                placeholder="e.g., status, amount"
              />
            </div>
          </div>
        );
        
      case 'consistency':
        return (
          <div className="rule-type-fields">
            <div className="form-group">
              <label htmlFor="consistency-type">
                Consistency Type
                <span className="field-hint">Type of consistency check to perform</span>
              </label>
              <select
                id="consistency-type"
                className="form-control"
                value={config.consistency_type || ''}
                onChange={(e) => updateRuleConfig('consistency_type', e.target.value)}
              >
                <option value="">Select type...</option>
                <option value="cross_field">Cross-Field Validation</option>
                <option value="format_consistency">Format Consistency</option>
              </select>
              {formErrors.consistency_type && <span className="error-text">{formErrors.consistency_type}</span>}
            </div>
            
            {config.consistency_type === 'cross_field' && (
              <div className="form-group">
                <label htmlFor="consistency-expression">
                  Validation Expression
                  <span className="field-hint">e.g., end_date &gt; start_date or total = subtotal + tax</span>
                </label>
                <textarea
                  id="consistency-expression"
                  className="form-control"
                  rows="3"
                  value={config.expression || ''}
                  onChange={(e) => updateRuleConfig('expression', e.target.value)}
                  placeholder="end_date > start_date"
                />
                {formErrors.expression && <span className="error-text">{formErrors.expression}</span>}
              </div>
            )}
            
            {config.consistency_type === 'format_consistency' && (
              <div className="form-group">
                <label htmlFor="consistency-format">
                  Expected Format Pattern
                  <span className="field-hint">Regex pattern for format validation</span>
                </label>
                <input
                  type="text"
                  id="consistency-format"
                  className="form-control"
                  value={config.format_pattern || ''}
                  onChange={(e) => updateRuleConfig('format_pattern', e.target.value)}
                  placeholder="^\d{3}-\d{2}-\d{4}$"
                />
              </div>
            )}
            
            <div className="form-group">
              <label htmlFor="consistency-column">Column Name (Optional)</label>
              <input
                type="text"
                id="consistency-column"
                className="form-control"
                value={formData.column_name}
                onChange={(e) => setFormData({ ...formData, column_name: e.target.value })}
                placeholder="Leave blank for multi-column rules"
              />
            </div>
          </div>
        );
        
      case 'uniqueness':
        return (
          <div className="rule-type-fields">
            <div className="form-group">
              <label htmlFor="uniqueness-columns">
                Columns to Check for Uniqueness
                <span className="field-hint">Comma-separated list of columns that should form a unique key</span>
              </label>
              <textarea
                id="uniqueness-columns"
                className="form-control"
                rows="2"
                value={(config.columns || []).join(', ')}
                onChange={(e) => updateRuleConfig('columns', e.target.value.split(',').map(v => v.trim()).filter(v => v))}
                placeholder="customer_id, order_id"
              />
              {formErrors.columns && <span className="error-text">{formErrors.columns}</span>}
              <span className="field-hint">For composite keys, list all columns that together should be unique</span>
            </div>
            
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.case_sensitive || false}
                  onChange={(e) => updateRuleConfig('case_sensitive', e.target.checked)}
                />
                {' '}Case-sensitive comparison
              </label>
            </div>
          </div>
        );
        
      case 'freshness':
        return (
          <div className="rule-type-fields">
            <div className="form-group">
              <label htmlFor="freshness-max-age">
                Maximum Age (Hours)
                <span className="field-hint">Data older than this will be flagged as stale</span>
              </label>
              <input
                type="number"
                id="freshness-max-age"
                className="form-control"
                min="1"
                value={config.max_age_hours || 24}
                onChange={(e) => updateRuleConfig('max_age_hours', parseInt(e.target.value))}
              />
              {formErrors.max_age_hours && <span className="error-text">{formErrors.max_age_hours}</span>}
            </div>
            
            <div className="form-group">
              <label htmlFor="freshness-timestamp-column">
                Timestamp Column
                <span className="field-hint">Column containing the data timestamp</span>
              </label>
              <input
                type="text"
                id="freshness-timestamp-column"
                className="form-control"
                value={config.timestamp_column || formData.column_name}
                onChange={(e) => {
                  updateRuleConfig('timestamp_column', e.target.value);
                  setFormData({ ...formData, column_name: e.target.value });
                }}
                placeholder="e.g., created_at, updated_at"
              />
              {formErrors.timestamp_column && <span className="error-text">{formErrors.timestamp_column}</span>}
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  const getRuleTypeDescription = (type) => {
    const descriptions = {
      completeness: 'Ensure data fields are filled in and not missing',
      validity: 'Validate that data values match expected formats and ranges',
      consistency: 'Check that related data fields are logically consistent',
      uniqueness: 'Verify that values are unique (no duplicates)',
      freshness: 'Monitor data age and detect stale information'
    };
    return descriptions[type] || '';
  };

  const totalPages = Math.ceil((pagination.total || 0) / itemsPerPage);

  // Reset subproject filter when project filter changes
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
        {hasWritePermission('quality_rules') && (
          <button className="gps-btn-primary" onClick={handleAddRule}>
            <FiPlus />
            Create Rule
          </button>
        )}
      </div>

      {/* Summary Statistics */}
      <div className="statistics-grid">
        <Card className="stat-card">
          <div className="stat-label">Total Rules</div>
          <div className="stat-value">{statistics.total}</div>
        </Card>
        <Card className="stat-card stat-success">
          <div className="stat-label">Enabled Rules</div>
          <div className="stat-value">{statistics.enabled}</div>
        </Card>
        <Card className="stat-card stat-warning">
          <div className="stat-label">Disabled Rules</div>
          <div className="stat-value">{statistics.disabled}</div>
        </Card>
        <Card className="stat-card stat-error">
          <div className="stat-label">Total Violations (30d)</div>
          <div className="stat-value">{statistics.violations}</div>
        </Card>
      </div>

      {/* Filters */}
      <div className="gps-filters">
        <select
          className="gps-filter-select"
          value={filterProjectId}
          onChange={(e) => {
            setFilterProjectId(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">All Projects</option>
          {(uniqueProjects.length > 0 ? uniqueProjects : projects).map(project => (
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
        >
          <option value="">All Subprojects</option>
          {uniqueSubProjects.map(subProject => (
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
      </div>

      {loading ? (
        <LoadingSpinner size="small" />
      ) : error ? (
        <div className="gps-alert gps-alert-danger">
          <FiAlertTriangle />
          <span>{error}</span>
          <button className="gps-btn-primary" onClick={fetchData}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Rule Form */}
          {showRuleForm && (
            <Card className="rule-form-card">
              <h2>{currentRule ? 'Edit Quality Rule' : 'Create New Quality Rule'}</h2>
              <form onSubmit={handleSubmitRule}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="rule-name">
                      Rule Name *
                    </label>
                    <input
                      type="text"
                      id="rule-name"
                      className="form-control"
                      value={formData.rule_name}
                      onChange={(e) => setFormData({ ...formData, rule_name: e.target.value })}
                      placeholder="e.g., Email Address Completeness"
                      required
                    />
                    {formErrors.rule_name && <span className="error-text">{formErrors.rule_name}</span>}
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="rule-project">Project (Optional)</label>
                    <select
                      id="rule-project"
                      className="form-control"
                      value={formData.project_id}
                      onChange={(e) => handleProjectChange(e.target.value)}
                    >
                      <option value="">All Projects</option>
                      {projects.map(project => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {formData.project_id && (
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="rule-sub-project">Sub-Project (Optional)</label>
                      <select
                        id="rule-sub-project"
                        className="form-control"
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
                  </div>
                )}
                
                <div className="form-group">
                  <label htmlFor="rule-description">Description</label>
                  <textarea
                    id="rule-description"
                    className="form-control"
                    rows="2"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe what this rule checks..."
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="rule-type">
                      Rule Type *
                    </label>
                    <select
                      id="rule-type"
                      className="form-control"
                      value={formData.rule_type}
                      onChange={(e) => handleRuleTypeChange(e.target.value)}
                      required
                    >
                      <option value="completeness">Completeness</option>
                      <option value="validity">Validity</option>
                      <option value="consistency">Consistency</option>
                      <option value="uniqueness">Uniqueness</option>
                      <option value="freshness">Freshness</option>
                    </select>
                    <span className="field-hint">{getRuleTypeDescription(formData.rule_type)}</span>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="rule-severity">Severity</label>
                    <select
                      id="rule-severity"
                      className="form-control"
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
                
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    />
                    {' '}Enable this rule immediately
                  </label>
                </div>
                
                <div className="form-actions">
                  <button type="button" className="gps-btn-secondary" onClick={() => setShowRuleForm(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="gps-btn-primary">
                    {currentRule ? 'Update Rule' : 'Create Rule'}
                  </button>
                </div>
              </form>
            </Card>
          )}
          
          <div className="gps-results-info">
            Showing {filteredRules.length} of {pagination.total || rules.length} quality rules
          </div>
          
          {/* Rules Table */}
          {filteredRules.length === 0 ? (
            <div className="gps-empty-state">
              <p>
                {filterProjectId || filterSubProjectId || filterRuleType || filterEnabled
                  ? 'No rules match your current filters. Try adjusting your filter criteria.'
                  : 'No quality rules found. Create one to get started!'
                }
              </p>
              {hasWritePermission('quality_rules') && !filterProjectId && !filterSubProjectId && !filterRuleType && !filterEnabled && (
                <button className="gps-btn-primary" onClick={handleAddRule} style={{ marginTop: '12px' }}>
                  <FiPlus />
                  Create Your First Quality Rule
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
                  {filteredRules.map(rule => (
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
                        <span className={`gps-badge gps-badge-${rule.rule_type === 'completeness' ? 'info' : rule.rule_type === 'validity' ? 'primary' : rule.rule_type === 'consistency' ? 'success' : rule.rule_type === 'uniqueness' ? 'warning' : 'secondary'}`}>
                          {rule.rule_type}
                        </span>
                      </td>
                      <td>{rule.column_name || '-'}</td>
                      <td>
                        <span className={`gps-badge gps-badge-${rule.severity === 'critical' ? 'danger' : rule.severity === 'error' ? 'danger' : 'warning'}`}>
                          {rule.severity}
                        </span>
                      </td>
                      <td>
                        {rule.enabled ? (
                          <span className="gps-badge gps-badge-success">
                            <FiCheck style={{ marginRight: '4px' }} /> Enabled
                          </span>
                        ) : (
                          <span className="gps-badge gps-badge-secondary">Disabled</span>
                        )}
                      </td>
                      <td>{formatDate(rule.created_at)}</td>
                      {hasWritePermission('quality_rules') && (
                        <td>
                          <div className="gps-action-buttons">
                            <button 
                              className="gps-icon-btn gps-icon-btn-primary" 
                              title="Edit Rule"
                              onClick={() => handleEditRule(rule)}
                            >
                              <FiEdit2 />
                            </button>
                            <button 
                              className="gps-icon-btn gps-icon-btn-danger" 
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
      
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={() => {
          confirmModal.action();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
}

export default QualityRules;
