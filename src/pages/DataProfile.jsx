import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useParams, Link } from 'react-router-dom';
import { FiFileText, FiBarChart2, FiDownload, FiTable, FiCopy, FiEdit2, FiUser, FiClock, FiCheckCircle, FiAlertTriangle, FiXCircle, FiGitBranch, FiZap, FiPlay, FiRefreshCw } from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import FilePreview from '../components/FilePreview';
import ErrorModal from '../components/ErrorModal';
import SchemaHistoryTab from '../components/SchemaHistoryTab';
import AIDQSuggestionsTab from '../components/AIDQSuggestionsTab';
import { getFileDetails, getFileProfile} from '../api/fileService';
import { getFileQualityRules, assignFileQualityRules } from '../api/qualityRulesService';
import { formatBytes, formatDate, getTimeSince, formatNumber, formatDecimal } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import '../styles/global-page-styles.css';
import './DataProfile.css';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// ============================================================================
// SEMANTIC FIELD TYPE DETECTION - Intelligent multi-pattern flagging
// ============================================================================

// Detect semantic field type based on column name and data type
const getSemanticFieldType = (column) => {
  const name = (column.name || '').toLowerCase();
  const dataType = (column.type || '').toUpperCase();
  
  // Phone number detection
  if (/phone|tel|mobile|fax|cell/.test(name)) {
    return 'phone';
  }
  
  // Email detection
  if (/email|e-mail|e_mail/.test(name)) {
    return 'email';
  }
  
  // Date/DateTime detection - by type first
  if (dataType === 'DATETIME' || dataType === 'TIMESTAMP') {
    return 'datetime';
  }
  if (dataType === 'DATE') {
    return 'date';
  }
  
  // Date/DateTime detection - by column name patterns
  if (/(_ts|_at|timestamp|_datetime)$/.test(name) || /^(created|updated|modified|deleted|processed)_?(at|on|date|time)?$/.test(name)) {
    return 'datetime';
  }
  if (/(_date|_dt)$/.test(name) || /^(birth|start|end|order|ship|delivery|due|expir).*date/.test(name) || name === 'date' || name === 'dob') {
    return 'date';
  }
  
  // SSN / Tax ID detection
  if (/ssn|social.*security|tax.*id|tin|ein|itin/.test(name)) {
    return 'ssn';
  }
  
  // Zip/Postal code detection
  if (/zip|postal|postcode/.test(name)) {
    return 'zipcode';
  }
  
  // Credit card detection
  if (/credit.*card|card.*number|cc.*num/.test(name)) {
    return 'creditcard';
  }
  
  // IP address detection
  if (/ip.*addr|ip_address|ipv[46]/.test(name)) {
    return 'ip';
  }
  
  // URL detection
  if (/\burl\b|website|link|href/.test(name)) {
    return 'url';
  }
  
  // Generic string - no special pattern enforcement needed
  return 'generic';
};

// Check if a semantic field type should be flagged for multi-pattern issues
const shouldFlagMultiPattern = (semanticType) => {
  const flaggableTypes = ['phone', 'email', 'date', 'datetime', 'ssn', 'zipcode', 'creditcard', 'ip'];
  return flaggableTypes.includes(semanticType);
};

// Get human-readable label for semantic type
const getSemanticTypeLabel = (semanticType) => {
  const labels = {
    phone: 'Phone',
    email: 'Email',
    date: 'Date',
    datetime: 'DateTime',
    ssn: 'SSN/Tax ID',
    zipcode: 'Zip Code',
    creditcard: 'Credit Card',
    ip: 'IP Address',
    url: 'URL',
    generic: 'Text'
  };
  return labels[semanticType] || 'Text';
};

// Analyze column for data quality issues
const analyzeColumnQuality = (column, totalRows) => {
  const issues = [];
  const semanticType = getSemanticFieldType(column);
  const nullCount = column.missing || 0;
  const missingPercentage = totalRows > 0 ? (nullCount / totalRows) * 100 : 0;
  const uniquePercentage = totalRows > 0 && column.unique ? (column.unique / totalRows) * 100 : 0;
  
  // Multi-pattern check - only for semantic field types that should be consistent
  if (shouldFlagMultiPattern(semanticType) && column.patterns && column.patterns.length > 1) {
    issues.push({
      type: 'multipattern',
      severity: 'warning',
      label: 'Inconsistent Format',
      detail: `${getSemanticTypeLabel(semanticType)} field has ${column.patterns.length} different patterns`,
      tooltip: `${getSemanticTypeLabel(semanticType)} values should follow a consistent format. Found ${column.patterns.length} patterns: ${column.patterns.slice(0, 3).map(p => p.pattern).join(', ')}${column.patterns.length > 3 ? '...' : ''}`
    });
  }
  
  // Missing values check - highlight ALL missing values with severity based on percentage
  if (nullCount > 0) {
    let severity = 'info';
    let label = 'Has Nulls';
    
    if (missingPercentage > 50) {
      severity = 'danger';
      label = 'Critical Nulls';
    } else if (missingPercentage > 10) {
      severity = 'warning';
      label = 'High Nulls';
    }
    
    issues.push({
      type: 'missingvalues',
      severity,
      label,
      detail: `${missingPercentage.toFixed(1)}% missing`,
      tooltip: `${nullCount.toLocaleString()} of ${totalRows.toLocaleString()} values (${missingPercentage.toFixed(1)}%) are null or missing`
    });
  }
  
  // Low uniqueness check for ID-like fields
  const isIdField = /(_id|_key|_code|^id$)/.test((column.name || '').toLowerCase());
  if (isIdField && uniquePercentage < 90 && totalRows > 10) {
    issues.push({
      type: 'lowuniqueness',
      severity: 'info',
      label: 'Low Uniqueness',
      detail: `${uniquePercentage.toFixed(1)}% unique`,
      tooltip: `ID field has only ${uniquePercentage.toFixed(1)}% unique values - possible duplicates`
    });
  }
  
  // Constant value detection (very low uniqueness)
  if (column.unique === 1 && totalRows > 10) {
    issues.push({
      type: 'constant',
      severity: 'info',
      label: 'Constant Value',
      detail: 'Single unique value',
      tooltip: 'This column contains only one unique value across all rows'
    });
  }
  
  return {
    semanticType,
    issues,
    hasIssues: issues.length > 0,
    severityLevel: issues.some(i => i.severity === 'danger') ? 'danger' 
      : issues.some(i => i.severity === 'warning') ? 'warning' 
      : issues.length > 0 ? 'info' : 'none'
  };
};

function DelimiterConfigModal({ fileId, onClose, onSave, setErrorMessage }) {
  const [delimiterType, setDelimiterType] = useState('comma');
  const [customDelimiter, setCustomDelimiter] = useState('');
  const [saving, setSaving] = useState(false);

  const getDelimiterValue = () => {
    if (delimiterType === 'custom') {
      return customDelimiter || ',';
    }
    
    const delimiterMap = {
      'comma': ',',
      'pipe': '|',
      'tab': '\t',
      'semicolon': ';'
    };
    
    return delimiterMap[delimiterType] || ',';
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      if (delimiterType === 'custom' && !customDelimiter) {
        setErrorMessage('Please enter a custom delimiter');
        setSaving(false);
        return;
      }
      
      const delimiter = getDelimiterValue();
      const encodedFileId = encodeURIComponent(fileId);
      
      await axios.post(
        `/api/files/${encodedFileId}/delimiter`,
        { delimiter },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      
      onSave();
    } catch (err) {
      console.error('Error saving delimiter:', err);
      const errorMsg = err.response?.data?.details || err.response?.data?.error || 'Failed to save delimiter';
      setErrorMessage(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <h2>Configure File Delimiter</h2>
        <p style={{ marginBottom: '20px', color: '#64748b' }}>
          Specify the delimiter used in this delimited file to parse columns correctly.
        </p>
        
        <div className="form-group">
          <label htmlFor="delimiter-select" style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
            Delimiter Type:
          </label>
          <select 
            id="delimiter-select"
            value={delimiterType}
            onChange={(e) => {
              setDelimiterType(e.target.value);
              if (e.target.value !== 'custom') {
                setCustomDelimiter('');
              }
            }}
            className="form-control"
            style={{ marginBottom: delimiterType === 'custom' ? '1rem' : '0' }}
          >
            <option value="comma">Comma (,)</option>
            <option value="pipe">Pipe (|)</option>
            <option value="tab">Tab (\t)</option>
            <option value="semicolon">Semicolon (;)</option>
            <option value="custom">Custom Delimiter...</option>
          </select>
          
          {delimiterType === 'custom' && (
            <div style={{ marginTop: '1rem' }}>
              <label htmlFor="custom-delimiter-input" style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                Enter Custom Delimiter:
              </label>
              <input 
                id="custom-delimiter-input"
                type="text"
                value={customDelimiter}
                onChange={(e) => setCustomDelimiter(e.target.value)}
                placeholder="e.g., ~^ or || or any multi-character string"
                className="form-control"
                style={{ fontFamily: 'monospace' }}
              />
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
                Supports multi-character delimiters (e.g., '~^', '||', '::')
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save & Re-profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FixedWidthSchemaModal({ fileId, onClose, onSave, setErrorMessage }) {
  const [columns, setColumns] = useState([{ name: '', width: '' }]);
  const [saving, setSaving] = useState(false);

  const addColumn = () => {
    setColumns([...columns, { name: '', width: '' }]);
  };

  const removeColumn = (index) => {
    const newColumns = columns.filter((_, i) => i !== index);
    setColumns(newColumns);
  };

  const updateColumn = (index, field, value) => {
    const newColumns = [...columns];
    newColumns[index][field] = value;
    setColumns(newColumns);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const validColumns = columns.filter(col => col.name && col.width);
      
      if (validColumns.length === 0) {
        setErrorMessage('Please add at least one column with name and width');
        setSaving(false);
        return;
      }
      
      const parsedColumns = validColumns.map(col => ({
        name: col.name.trim(),
        width: parseInt(col.width, 10),
        type: 'string'
      }));
      
      if (parsedColumns.some(col => isNaN(col.width) || col.width <= 0)) {
        setErrorMessage('Column widths must be positive numbers');
        setSaving(false);
        return;
      }
      
      const encodedFileId = encodeURIComponent(fileId);
      await axios.post(
        `/api/files/${encodedFileId}/fixed-width-schema`,
        { schema_definition: { columns: parsedColumns } },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      
      onSave();
    } catch (err) {
      console.error('Error saving schema:', err);
      const errorMsg = err.response?.data?.error || 'Failed to save schema';
      setErrorMessage(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <h2>Configure Fixed-Width File Headers</h2>
        <p style={{ marginBottom: '20px', color: '#64748b' }}>
          Define column names and their character widths for this .dat file.
        </p>
        
        <div className="form-group">
          {columns.map((col, index) => (
            <div key={`col-${col.name || col.column_name || index}`} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="Column Name"
                value={col.name}
                onChange={(e) => updateColumn(index, 'name', e.target.value)}
                className="form-control"
                style={{ flex: 2 }}
              />
              <input
                type="number"
                placeholder="Width"
                value={col.width}
                onChange={(e) => updateColumn(index, 'width', e.target.value)}
                className="form-control"
                style={{ flex: 1 }}
                min="1"
              />
              {columns.length > 1 && (
                <button
                  className="btn btn-secondary"
                  onClick={() => removeColumn(index)}
                  style={{ padding: '8px 16px' }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        
        <button className="btn btn-secondary" onClick={addColumn} style={{ marginBottom: '20px' }}>
          + Add Column
        </button>
        
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save & Re-profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SensitivityTagModal({ fileId, columnName, currentTags, availableTags, onClose, onSave, setErrorMessage }) {
  const [selectedTagIds, setSelectedTagIds] = useState((currentTags || []).map(t => t.tag_id));
  const [saving, setSaving] = useState(false);

  const handleToggle = (tagId) => {
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(selectedTagIds.filter(id => id !== tagId));
    } else {
      setSelectedTagIds([...selectedTagIds, tagId]);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const encodedFileId = encodeURIComponent(fileId);
      const normalizedColumnName = columnName.toLowerCase();
      
      await axios.post(
        `/api/files/${encodedFileId}/columns/${encodeURIComponent(normalizedColumnName)}/tags`,
        { tag_ids: selectedTagIds },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      
      onSave();
    } catch (err) {
      console.error('Error saving tags:', err);
      const errorMsg = err.response?.data?.error || 'Failed to save tags';
      setErrorMessage(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Classify Column: {columnName}</h2>
        
        <div className="form-group">
          <label htmlFor="governance-tags-multiselect">Select Governance Tags (multi-select)</label>

          <div 
            id="governance-tags-multiselect"           
            className="classification-options"
            role="listbox"                            
            aria-multiselectable="true"                
            tabIndex={0}
          >
            {availableTags && availableTags.length > 0 ? (
              availableTags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.tag_id);
                return (
                  <div
                    key={tag.tag_id}
                    className={`classification-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleToggle(tag.tag_id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span 
                      className="sensitivity-badge" 
                      style={{
                        backgroundColor: isSelected ? tag.color : '#e2e8f0',
                        color: isSelected ? 'white' : '#64748b',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      {tag.tag_name}
                    </span>
                    {tag.description && (
                      <p className="option-description">{tag.description}</p>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="empty-state">No governance tags available</p>
            )}
          </div>
        </div>
        
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OwnershipModal({ fileId, currentOwnership, onClose, onSave, setErrorMessage }) {
  const [ownerName, setOwnerName] = useState(currentOwnership?.owner_name || '');
  const [ownerEmail, setOwnerEmail] = useState(currentOwnership?.owner_email || '');
  const [ownerContact, setOwnerContact] = useState(currentOwnership?.owner_contact || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const encodedFileId = encodeURIComponent(fileId);
      await axios.post(`/api/files/${encodedFileId}/ownership`, {
        owner_name: ownerName,
        owner_email: ownerEmail,
        owner_contact: ownerContact
      });
      onSave();
    } catch (err) {
      console.error('Error saving ownership:', err);
      setErrorMessage('Failed to save ownership information');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Edit File Ownership</h2>
        
        <div className="form-group">
          <label htmlFor="owner-name-input">Owner Name</label>
          <input
            id="owner-name-input"
            type="text"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Enter owner name"
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="owner-email-input">Owner Email</label>
          <input
            id="owner-email-input"
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            placeholder="Enter owner email"
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="owner-contact-input">Owner Contact</label>
          <input
            id="owner-contact-input"
            type="text"
            value={ownerContact}
            onChange={(e) => setOwnerContact(e.target.value)}
            placeholder="Enter owner contact"
          />
        </div>
        
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ColumnGovernanceTagModal({ fileId, columnName, currentTags, availableTags, onClose, onSave, setErrorMessage }) {
  const [selectedTags, setSelectedTags] = useState(currentTags || []);
  const [saving, setSaving] = useState(false);

  const handleToggle = (tagId) => {
    if (selectedTags.some(t => t.tag_id === tagId)) {
      setSelectedTags(selectedTags.filter(t => t.tag_id !== tagId));
    } else {
      const tag = availableTags.find(t => t.tag_id === tagId);
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const encodedFileId = encodeURIComponent(fileId);
      // Normalize column name to lowercase to handle Parquet case-sensitivity
      const normalizedColumnName = columnName.toLowerCase();
      
      // Send the selected tag IDs to the backend
      await axios.post(
        `/api/files/${encodedFileId}/columns/${encodeURIComponent(normalizedColumnName)}/tags`,
        { tag_ids: selectedTags.map(t => t.tag_id) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      onSave();
    } catch (err) {
      console.error('Error saving column tags:', err);
      const errorMsg = err.response?.data?.error || 'Failed to save column tags';
      setErrorMessage(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Assign Tags to Column: {columnName}</h2>
        
        <div className="form-group">
          <label htmlFor="governance-tags-selector">Select Governance Tags</label>
          <div
           id="governance-tags-selector"  
            className="tags-selector"
            role="listbox"
            aria-multiselectable="true"
            >
            {availableTags.length > 0 ? (
              availableTags.map(tag => {
                const isSelected = selectedTags.some(t => t.tag_id === tag.tag_id);
                return (
                  <button
                    key={tag.tag_id}
                    className={`tag-chip ${isSelected ? 'selected' : ''}`}
                    style={isSelected ? { backgroundColor: tag.color, color: 'white' } : {}}
                    onClick={() => handleToggle(tag.tag_id)}
                  >
                    {tag.tag_name}
                  </button>
                );
              })
            ) : (
              <span className="no-items">No tags available</span>
            )}
          </div>
        </div>
        
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ColumnPolicyModal({ fileId, columnName, currentPolicies, availablePolicies, onClose, onSave, setErrorMessage }) {
  const [selectedPolicies, setSelectedPolicies] = useState(currentPolicies || []);
  const [saving, setSaving] = useState(false);

  const handleToggle = (policyId) => {
    if (selectedPolicies.some(p => p.policy_id === policyId)) {
      setSelectedPolicies(selectedPolicies.filter(p => p.policy_id !== policyId));
    } else {
      const policy = availablePolicies.find(p => p.policy_id === policyId);
      setSelectedPolicies([...selectedPolicies, policy]);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const encodedFileId = encodeURIComponent(fileId);
      // Normalize column name to lowercase to handle Parquet case-sensitivity
      const normalizedColumnName = columnName.toLowerCase();
      
      // Send the selected policy IDs to the backend
      await axios.post(
        `/api/files/${encodedFileId}/columns/${encodeURIComponent(normalizedColumnName)}/policies`,
        { policy_ids: selectedPolicies.map(p => p.policy_id) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      onSave();
    } catch (err) {
      console.error('Error saving column policies:', err);
      const errorMsg = err.response?.data?.error || 'Failed to save column policies';
      setErrorMessage(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Assign Policies to Column: {columnName}</h2>
        
        <div className="form-group">
          <label htmlFor="policies-selector">Select Governance Policies</label>
          <div id="policies-selector" className="policies-selector" role="listbox" aria-multiselectable="true">
            {availablePolicies.length > 0 ? (
              availablePolicies.map(policy => {
                const isSelected = selectedPolicies.some(p => p.policy_id === policy.policy_id);
                return (
                  <button
                    key={policy.policy_id}
                    className={`policy-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleToggle(policy.policy_id)}
                  >
                    {policy.policy_name}
                  </button>
                );
              })
            ) : (
              <span className="no-items">No policies available</span>
            )}
          </div>
        </div>
        
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DataProfile() {
  const { fileId: encodedFileId } = useParams();
  const fileId = decodeURIComponent(encodedFileId || '');
  const { currentUser, hasPermission, hasRole } = useAuth();
  
  // Check if user is a Vendor User - they should not see DQ Suggestions, Quality Rules, and Schema Builder tabs
  // Vendor users can have roles like 'Vendor User - External' or 'Vendor User - Internal'
  const isVendorUser = hasRole(['Vendor User', 'Vendor User - External', 'Vendor User - Internal']);
  
  // Restricted tabs that Vendor Users cannot access
  const vendorRestrictedTabs = ['ai-suggestions', 'quality-rules', 'schema-builder'];
  
  const [file, setFile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('attributes');
  
  // Reset activeTab to 'attributes' if Vendor User has a restricted tab selected
  useEffect(() => {
    if (isVendorUser && vendorRestrictedTabs.includes(activeTab)) {
      setActiveTab('attributes');
    }
  }, [isVendorUser, activeTab]);
  
  const [ownership, setOwnership] = useState(null);
  const [showOwnershipModal, setShowOwnershipModal] = useState(false);
  const [policies, setPolicies] = useState([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [profileHistory, setProfileHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFetched, setHistoryFetched] = useState(false);
  const [showColumnGovernanceTagModal, setShowColumnGovernanceTagModal] = useState(false);
  const [showColumnPolicyModal, setShowColumnPolicyModal] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [currentColumnGovernanceTags, setCurrentColumnGovernanceTags] = useState([]);
  const [currentColumnPolicies, setCurrentColumnPolicies] = useState([]);
  
  // File-level governance state
  const [fileSensitivity, setFileSensitivity] = useState('Public');
  const [availableTags, setAvailableTags] = useState([]);
  const [fileTags, setFileTags] = useState([]);
  const [availablePolicies, setAvailablePolicies] = useState([]);
  
  // Column-level governance state (for table display)
  const [allColumnGovernanceTags, setAllColumnGovernanceTags] = useState({});
  const [allColumnPolicies, setAllColumnPolicies] = useState({});
  
  // Error modal state
  const [errorMessage, setErrorMessage] = useState(null);
  
  // Fixed-width schema modal state
  const [showFixedWidthModal, setShowFixedWidthModal] = useState(false);
  
  // Delimiter configuration modal state
  const [showDelimiterModal, setShowDelimiterModal] = useState(false);

  // Quality Rules state
  const [qualityViolations, setQualityViolations] = useState(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityFilter, setQualityFilter] = useState({
    severity: 'all',
    ruleType: 'all',
    column: 'all'
  });

  // Schema Builder state
  const [availableGenericRules, setAvailableGenericRules] = useState([]);
  const [columnDQAssignments, setColumnDQAssignments] = useState({});
  const [schemaBuilderLoading, setSchemaBuilderLoading] = useState(false);

  // File Quality Rules assignment state
  const [fileAvailableRules, setFileAvailableRules] = useState([]);
  const [fileAssignedRules, setFileAssignedRules] = useState([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);
  
  // Rule-to-column assignment state for Quality Rules tab
  const [expandedRuleId, setExpandedRuleId] = useState(null);
  const [ruleColumnAssignments, setRuleColumnAssignments] = useState({}); 
  const [savedRuleColumnAssignments, setSavedRuleColumnAssignments] = useState({}); // Tracks persisted state for change detection
  const [rulesRunning, setRulesRunning] = useState(false); // Running quality rule validation
  const [showRevalidateModal, setShowRevalidateModal] = useState(false); // Show file upload modal for revalidation
  const [revalidateFile, setRevalidateFile] = useState(null); // Selected file for revalidation
  const [revalidateProgress, setRevalidateProgress] = useState(0); // Upload progress
  const [violationsPage, setViolationsPage] = useState(1); // Current page for violations
  const [refreshingRules, setRefreshingRules] = useState(false); // Loading state for refresh button
  const VIOLATIONS_PER_PAGE = 20; // Pagination size

  // Helper functions for column type checking
  const isNumericColumn = (column) => {
    const numericTypes = ['integer', 'decimal', 'number', 'float', 'int64', 'float64', 'int32', 'float32'];
    return column.type && numericTypes.includes(column.type.toLowerCase());
  };

  const isDateTimeColumn = (column) => {
    return column.type && column.type.toLowerCase().includes('datetime');
  };

  const hasMinMaxValues = (column) => {
    return isNumericColumn(column) || isDateTimeColumn(column);
  };

  const formatMinMaxValue = (value, column) => {
    if (value === null || value === undefined) return 'N/A';
    
    if (isDateTimeColumn(column)) {
      // Format datetime values
      try {
        const date = new Date(value);
        return date.toLocaleString();
      } catch (e) {
        return value;
      }
    } else {
      // Format numeric values
      const columnType = column.type ? column.type.toLowerCase() : '';
      const isInteger = columnType === 'integer' || columnType === 'int64' || columnType === 'int32' || columnType === 'int';
      
      if (isInteger) {
        // Format integers without decimal places
        return Math.round(value).toLocaleString();
      } else {
        // Format floats/decimals with 2 decimal places
        return formatDecimal(value, 2);
      }
    }
  };
  
  // Helper functions for PII/sensitive data masking
  const shouldMaskValue = (column) => {
    // Check if column has restricted access based on _accessLevel property set by backend
    // Mask both 'masked' and 'denied'/'none' columns to prevent data exposure
    const accessLevel = column._accessLevel || column.accessLevel;
    return accessLevel === 'masked' || accessLevel === 'denied' || accessLevel === 'none';
  };
  
  
  
  // Check if user has edit permission for a column's governance tags
  // MUST match backend security logic: requires edit permission for ALL tags
  const canEditColumnGovernance = (columnName) => {
    console.log(`[canEditColumnGovernance] Checking permissions for column: ${columnName}`);
    console.log('[canEditColumnGovernance] currentUser:', currentUser);
    console.log('[canEditColumnGovernance] currentUser?.roles:', currentUser?.roles);
    
    // If user data is still loading, disable editing
    if (!currentUser) {
      console.log('[canEditColumnGovernance] No currentUser object, returning false');
      return false;
    }
    
    // Admin can always edit
    if (currentUser.roles && Array.isArray(currentUser.roles) && currentUser.roles.includes('Admin')) {
      console.log('[canEditColumnGovernance] User is Admin, returning true');
      return true;
    }
    
    console.log('[canEditColumnGovernance] User is NOT admin, checking tag permissions');
    
    // Get the tags assigned to this column
    const columnTagsData = allColumnGovernanceTags[columnName] || [];
    console.log('[canEditColumnGovernance] columnTagsData:', columnTagsData);
    
    // If no tags, check if user has ANY tag edit permission
    if (columnTagsData.length === 0) {
      console.log('[canEditColumnGovernance] No tags on column, checking for any tag edit permissions');
      
      // Check if user has any tag:*:edit or tag:*:write permission
      const userPermissions = currentUser.permissions || [];
      const hasAnyTagEditPerm = userPermissions.some(perm => {
        const permStr = typeof perm === 'string' ? perm : `${perm.resource}:${perm.action}`;
        return permStr.startsWith('tag:') && (permStr.endsWith(':edit') || permStr.endsWith(':write'));
      });
      
      console.log('[canEditColumnGovernance] hasAnyTagEditPerm:', hasAnyTagEditPerm);
      return hasAnyTagEditPerm;
    }
    
    // User must have edit permission for ALL tags on the column
    // (consistent with backend security model)
    const hasAllPermissions = columnTagsData.every(tag => {
      const tagName = tag.tag_name?.toLowerCase();
      const hasEditPerm = hasPermission(`tag:${tagName}:edit`);
      const hasWritePerm = hasPermission(`tag:${tagName}:write`);
      console.log(`[canEditColumnGovernance] Tag ${tagName}: edit=${hasEditPerm}, write=${hasWritePerm}`);
      return hasEditPerm || hasWritePerm;
    });
    
    console.log('[canEditColumnGovernance] hasAllPermissions:', hasAllPermissions);
    return hasAllPermissions;
  };

  const fetchOwnership = async () => {
    try {
      const encodedFileId = encodeURIComponent(fileId);
      const response = await axios.get(`/api/files/${encodedFileId}/ownership`);
      setOwnership(response.data);
      // Only set sensitivity from ownership if not already set from metadata
      setFileSensitivity(prev => {
        // If already set from metadata, keep it
        if (prev && prev !== 'Public') return prev;
        // Otherwise use ownership data
        return response.data?.sensitivity_level || 'Public';
      });
    } catch (err) {
      if (err.response?.status === 404) {
        // No ownership record exists, only set default if not already set from metadata
        setFileSensitivity(prev => prev || 'Public');
      } else {
        console.error('Error fetching ownership:', err);
      }
    }
  };

  const fetchPolicies = async () => {
    try {
      const encodedFileId = encodeURIComponent(fileId);
      const response = await axios.get(`/api/files/${encodedFileId}/policies`);
      setPolicies(response.data);
    } catch (err) {
      console.error('Error fetching policies:', err);
    }
  };

  const fetchAvailableTags = async () => {
    try {
      const response = await axios.get('/api/governance-tags');
      setAvailableTags(response.data);
    } catch (err) {
      console.error('Error fetching available tags:', err);
    }
  };

  const fetchFileTags = async () => {
    try {
      const encodedFileId = encodeURIComponent(fileId);
      const response = await axios.get(`/api/files/${encodedFileId}/tags`);
      setFileTags(response.data);
    } catch (err) {
      console.error('Error fetching file tags:', err);
    }
  };

  const fetchAvailablePolicies = async () => {
    try {
      const response = await axios.get('/api/governance-policies');
      setAvailablePolicies(response.data);
    } catch (err) {
      console.error('Error fetching available policies:', err);
    }
  };

  const fetchColumnGovernanceTags = async (columnName) => {
    try {
      const encodedFileId = encodeURIComponent(fileId);
      const normalizedColumnName = columnName.toLowerCase();
      const response = await axios.get(`/api/files/${encodedFileId}/columns/${encodeURIComponent(normalizedColumnName)}/tags`);
      return response.data || [];
    } catch (err) {
      if (err.response?.status === 404) {
        return [];
      }
      console.error('Error fetching column governance tags:', err);
      return [];
    }
  };

  const fetchColumnPolicies = async (columnName) => {
    try {
      const encodedFileId = encodeURIComponent(fileId);
      // Normalize column name to lowercase to handle Parquet case-sensitivity
      const normalizedColumnName = columnName.toLowerCase();
      const response = await axios.get(`/api/files/${encodedFileId}/columns/${encodeURIComponent(normalizedColumnName)}/policies`);
      return response.data;
    } catch (err) {
      console.error('Error fetching column policies:', err);
      return [];
    }
  };

  const fetchAllColumnGovernanceData = async (columns) => {
    if (!columns || columns.length === 0) return;
    
    try {
      // Fetch governance tags and policies for all columns in parallel
      const tagPromises = columns.map(column => 
        fetchColumnGovernanceTags(column.name)
          .then(tags => ({ columnName: column.name, tags }))
      );
      
      const policyPromises = columns.map(column =>
        fetchColumnPolicies(column.name)
          .then(policies => ({ columnName: column.name, policies }))
      );
      
      const [tagResults, policyResults] = await Promise.all([
        Promise.all(tagPromises),
        Promise.all(policyPromises)
      ]);
      
      // Convert arrays to objects keyed by column name
      const tagsMap = {};
      const policiesMap = {};
      
      tagResults.forEach(({ columnName, tags }) => {
        tagsMap[columnName] = tags;
      });
      
      policyResults.forEach(({ columnName, policies }) => {
        policiesMap[columnName] = policies;
      });
      
      setAllColumnGovernanceTags(tagsMap);
      setAllColumnPolicies(policiesMap);
    } catch (err) {
      console.error('Error fetching all column governance data:', err);
    }
  };

  const fetchQualityViolations = async () => {
    try {
      setQualityLoading(true);
      const encodedFileId = encodeURIComponent(fileId);
      const response = await axios.get(`/api/files/${encodedFileId}/quality-violations`);
      setQualityViolations(response.data);
    } catch (err) {
      console.error('Error fetching quality violations:', err);
      setErrorMessage('Failed to fetch quality violations');
    } finally {
      setQualityLoading(false);
    }
  };

  const fetchGenericQualityRules = async () => {
    try {
      setSchemaBuilderLoading(true);
      const response = await axios.get('/api/quality-rules');
      const genericRules = response.data.filter(rule => 
        ['null_check', 'duplicate_check', 'email_validity', 'phone_validity', 
         'column_completeness', 'date_format', 'timestamp_format', 'uniqueness', 'isna_check',
         'numeric_only_string', 'special_character_presence'].includes(rule.rule_type)
      );
      setAvailableGenericRules(genericRules);
    } catch (err) {
      console.error('Error fetching quality rules:', err);
    } finally {
      setSchemaBuilderLoading(false);
    }
  };

  const fetchFileQualityRulesData = async () => {
    try {
      setRulesLoading(true);
      const data = await getFileQualityRules(fileId);
      const availableRules = data.available || [];
      setFileAvailableRules(availableRules);
      setFileAssignedRules(data.assigned || []);
      setSelectedRuleIds((data.assigned || []).map(r => r.id));
      
      // Also populate availableGenericRules for Schema Builder consistency
      // Filter to only include generic column-level rules
      const genericRules = availableRules.filter(rule => 
        ['null_check', 'duplicate_check', 'email_validity', 'phone_validity', 
         'column_completeness', 'date_format', 'timestamp_format', 'uniqueness', 'isna_check',
         'numeric_only_string', 'special_character_presence'].includes(rule.rule_type)
      );
      setAvailableGenericRules(genericRules);
      
      // Load saved column assignments from the assigned rules
      // Create separate deep copies for current and saved state to avoid reference sharing
      const currentAssignments = {};
      const persistedAssignments = {};
      (data.assigned || []).forEach(rule => {
        if (rule.target_columns && rule.target_columns.length > 0) {
          // Clone arrays to prevent shared references
          currentAssignments[rule.id] = [...rule.target_columns];
          persistedAssignments[rule.id] = [...rule.target_columns];
        }
      });
      // Set both current and saved state with independent copies
      setRuleColumnAssignments(currentAssignments);
      setSavedRuleColumnAssignments(persistedAssignments);
      
      // Also sync with Schema Builder: invert mapping from { ruleId: [columns] } to { column: [ruleIds] }
      const invertedAssignments = {};
      Object.entries(currentAssignments).forEach(([ruleId, columns]) => {
        (columns || []).forEach(columnName => {
          if (!invertedAssignments[columnName]) {
            invertedAssignments[columnName] = [];
          }
          // Keep rule id as number to match availableGenericRules.id
          invertedAssignments[columnName].push(parseInt(ruleId, 10));
        });
      });
      setColumnDQAssignments(invertedAssignments);
    } catch (err) {
      console.error('Error fetching file quality rules:', err);
    } finally {
      setRulesLoading(false);
    }
  };

  const handleSaveFileRules = async () => {
    try {
      setRulesSaving(true);
      // Include column assignments in the save request
      const result = await assignFileQualityRules(fileId, selectedRuleIds, ruleColumnAssignments);
      setFileAssignedRules(result.assigned || fileAvailableRules.filter(r => selectedRuleIds.includes(r.id)));
      // Update saved state with deep copy to match current state (now persisted)
      const savedCopy = {};
      Object.keys(ruleColumnAssignments).forEach(ruleId => {
        savedCopy[ruleId] = [...(ruleColumnAssignments[ruleId] || [])];
      });
      setSavedRuleColumnAssignments(savedCopy);
      
      // Sync with Schema Builder: invert mapping from { ruleId: [columns] } to { column: [ruleIds] }
      const invertedAssignments = {};
      Object.entries(ruleColumnAssignments).forEach(([ruleId, columns]) => {
        (columns || []).forEach(columnName => {
          if (!invertedAssignments[columnName]) {
            invertedAssignments[columnName] = [];
          }
          // Keep rule id in its original form from the API (should match availableGenericRules.id)
          invertedAssignments[columnName].push(parseInt(ruleId, 10));
        });
      });
      setColumnDQAssignments(invertedAssignments);
      
      // Clear expanded state after save
      setExpandedRuleId(null);
      
      // Reset violations and rule statuses when rules are saved
      // This clears the pass/fail status until rules are run again
      setQualityViolations(prev => {
        if (!prev) return null;
        return {
          ...prev,
          violations: [],
          summary: {
            ...prev.summary,
            total_violations: 0,
            rules_passed: 0,
            rules_failed: 0,
            violations_by_severity: { critical: 0, error: 0, warning: 0 }
          },
          applied_rules: (prev.applied_rules || []).map(rule => ({
            ...rule,
            status: null, // Reset status
            violation_count: 0
          }))
        };
      });
      setViolationsPage(1); // Reset pagination
    } catch (err) {
      console.error('Error saving file quality rules:', err);
      setErrorMessage('Failed to save quality rules');
    } finally {
      setRulesSaving(false);
    }
  };

  // Refresh available rules from the backend (useful after creating rules in DQ Suggestions)
  const handleRefreshRules = async () => {
    try {
      setRefreshingRules(true);
      await fetchFileQualityRulesData();
    } catch (err) {
      console.error('Error refreshing rules:', err);
      setErrorMessage('Failed to refresh rules');
    } finally {
      setRefreshingRules(false);
    }
  };
  
  const handleRunQualityRules = () => {
    // Show the file upload modal for revalidation
    setShowRevalidateModal(true);
    setRevalidateFile(null);
    setRevalidateProgress(0);
  };
  
  const handleRevalidateFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setRevalidateFile(file);
    }
  };
  
  const handleRevalidateSubmit = async () => {
    if (!revalidateFile) {
      setErrorMessage('Please select a file to upload');
      return;
    }
    
    try {
      setRulesRunning(true);
      setRevalidateProgress(10);
      
      const formData = new FormData();
      formData.append('file', revalidateFile);
      
      const token = localStorage.getItem('token');
      const encodedFileId = encodeURIComponent(fileId);
      const response = await axios.post(`/api/files/${encodedFileId}/quality-rules/revalidate`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setRevalidateProgress(Math.min(percentCompleted, 90)); // Reserve last 10% for processing
        }
      });
      
      setRevalidateProgress(100);
      
      if (response.data.success) {
        // Close modal, reset state, and refresh violations data
        setShowRevalidateModal(false);
        setRevalidateFile(null);
        setRevalidateProgress(0);
        await fetchQualityViolations();
      } else {
        setErrorMessage(response.data.message || 'Failed to run quality rules');
        setShowRevalidateModal(false);
        setRevalidateFile(null);
      }
    } catch (err) {
      console.error('Error running quality rules:', err);
      const message = err.response?.data?.message || err.response?.data?.error || 'Failed to run quality rules';
      setErrorMessage(message);
      setShowRevalidateModal(false);
      setRevalidateFile(null);
    } finally {
      setRulesRunning(false);
      setRevalidateProgress(0);
    }
  };

  const handleRuleToggle = (ruleId) => {
    // Toggle rule selection
    setSelectedRuleIds(prev => {
      if (prev.includes(ruleId)) {
        // When deselecting a rule, also remove its column assignments
        setRuleColumnAssignments(prevAssignments => {
          const { [ruleId]: _, ...rest } = prevAssignments;
          return rest;
        });
        setExpandedRuleId(null);
        return prev.filter(id => id !== ruleId);
      } else {
        // When selecting a rule, expand it to show column selection
        setExpandedRuleId(ruleId);
        return [...prev, ruleId];
      }
    });
  };
  
  const handleRuleExpand = (ruleId) => {
    // Toggle expansion for column selection (only for selected rules)
    if (selectedRuleIds.includes(ruleId)) {
      setExpandedRuleId(prev => prev === ruleId ? null : ruleId);
    }
  };
  
  const handleRuleColumnToggle = (ruleId, columnName) => {
    setRuleColumnAssignments(prev => {
      const currentColumns = prev[ruleId] || [];
      if (currentColumns.includes(columnName)) {
        return { ...prev, [ruleId]: currentColumns.filter(c => c !== columnName) };
      } else {
        return { ...prev, [ruleId]: [...currentColumns, columnName] };
      }
    });
  };
  
  const selectAllColumnsForRule = (ruleId) => {
    if (!profile?.columns) return;
    const allColumnNames = profile.columns.map(col => col.name);
    setRuleColumnAssignments(prev => ({
      ...prev,
      [ruleId]: allColumnNames
    }));
  };
  
  const clearAllColumnsForRule = (ruleId) => {
    setRuleColumnAssignments(prev => ({
      ...prev,
      [ruleId]: []
    }));
  };

  const handleColumnRuleToggle = (columnName, ruleId) => {
    setColumnDQAssignments(prev => {
      const columnRules = prev[columnName] || [];
      if (columnRules.includes(ruleId)) {
        return { ...prev, [columnName]: columnRules.filter(id => id !== ruleId) };
      } else {
        return { ...prev, [columnName]: [...columnRules, ruleId] };
      }
    });
  };

  const mapProfileTypeToSchemaType = (profileType) => {
    const type = (profileType || 'string').toLowerCase();
    if (type.includes('int') || type === 'integer') return 'int';
    if (type.includes('float') || type.includes('decimal') || type.includes('number')) return 'float';
    if (type === 'boolean' || type === 'bool') return 'boolean';
    if (type.includes('date') && type.includes('time')) return 'timestamp';
    if (type.includes('date')) return 'date';
    if (type.includes('time')) return 'timestamp';
    return 'string';
  };

  const generateSchemaJSON = () => {
    if (!profile || !profile.columns) return null;
    
    const schema = profile.columns.map(col => {
      const baseSchema = {
        name: col.name,
        type: mapProfileTypeToSchemaType(col.type),
        nullable: col.missing > 0 || col.nullable !== false,
        pii: col.pii || false
      };
      
      if (baseSchema.type === 'string' && col.max_length) {
        baseSchema.width = Math.min(Math.ceil(col.max_length * 1.2), 255);
      }
      
      const assignedRuleIds = columnDQAssignments[col.name] || [];
      if (assignedRuleIds.length > 0) {
        baseSchema.quality_rules = assignedRuleIds.map(ruleId => {
          const rule = availableGenericRules.find(r => r.id === ruleId);
          return rule ? rule.rule_type : null;
        }).filter(Boolean);
      }
      
      return baseSchema;
    });
    
    return schema;
  };

  const handleDownloadSchema = () => {
    const schema = generateSchemaJSON();
    if (!schema) {
      setErrorMessage('No schema data available');
      return;
    }
    
    const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = file?.original_name || file?.file_name || 'file';
    link.download = `${fileName.replace(/\.[^/.]+$/, '')}_schema.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    // Fetch quality violations and file quality rules when quality-rules tab is active
    if (activeTab === 'quality-rules') {
      if (!qualityViolations) {
        fetchQualityViolations();
      }
      if (fileAvailableRules.length === 0) {
        fetchFileQualityRulesData();
      }
    }
    // Fetch generic rules when schema-builder tab is active
    if (activeTab === 'schema-builder' && availableGenericRules.length === 0) {
      fetchGenericQualityRules();
    }
  }, [activeTab]);

  useEffect(() => {
    console.log('DataProfile component mounted with fileId:', fileId);
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Validate fileId before making API calls
        if (!fileId) {
          console.error('Error fetching file data: No file ID provided');
          setError('No file ID provided. Please select a file from the catalog.');
          setLoading(false);
          return;
        }
        
        console.log('Fetching file details and profile for fileId:', fileId);
        const [fileData, profileData] = await Promise.all([
          getFileDetails(fileId),
          getFileProfile(fileId)
        ]);
        
        console.log('File details received:', fileData);
        console.log('Profile data received:', profileData);
        
        setFile(fileData);
        setProfile(profileData || {});
        setError(null);
        
        // Set file sensitivity from data_classification field (primary source) or ownership (fallback)
        // Handle both snake_case and camelCase from API
        const classification = fileData.data_classification || fileData.dataClassification;
        if (classification) {
          setFileSensitivity(classification);
        }
        
        // Fetch governance data
        await Promise.all([
          fetchOwnership(),
          fetchPolicies(),
          fetchAvailableTags(),
          fetchFileTags(),
          fetchAvailablePolicies()
        ]);
        
        // Fetch column-level governance data for all columns
        if (profileData && profileData.columns) {
          await fetchAllColumnGovernanceData(profileData.columns);
        }
      } catch (err) {
        console.error('Error fetching file data:', err);
        setError('Failed to load file data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [fileId]);

  const handleSensitivityChange = async (e) => {
    const newSensitivity = e.target.value;
    setFileSensitivity(newSensitivity);
    
    try {
      const token = localStorage.getItem('token');
      const encodedFileId = encodeURIComponent(fileId);
      await axios.put(
        `/api/files/${encodedFileId}/sensitivity`,
        { sensitivity_level: newSensitivity },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchOwnership();
    } catch (error) {
      console.error('Error saving sensitivity:', error);
      setErrorMessage('Failed to save sensitivity level');
    }
  };

  const renderOverviewTab = () => {
    if (!file || !profile) return null;
    
    // Get data from the updated API response format
    const basicInfo = profile.basic_info || {};
    const columns = profile.columns || [];
    
   
    
    
    
    const headerValidation = file.metadata?.header_validation;
    const hasHeaderIssues = headerValidation && (headerValidation.issues_found > 0 || headerValidation.status !== 'healthy');
    
    const getHeaderStatusIcon = () => {
      if (!headerValidation) return null;
      
      switch (headerValidation.status) {
        case 'healthy':
          return <FiCheckCircle className="status-icon healthy" />;
        case 'warning':
          return <FiAlertTriangle className="status-icon warning" />;
        case 'critical':
          return <FiXCircle className="status-icon critical" />;
        default:
          return <FiAlertTriangle className="status-icon warning" />;
      }
    };
    
    return (
      <div className="profile-overview">
        
        {headerValidation && hasHeaderIssues && (
          <div className="gps-card" style={{ marginBottom: '16px' }}>
            <div className="gps-card-header">
              <h3 className="gps-card-title">Header Validation</h3>
            </div>
            <div className="gps-card-body">
              <div className="header-validation-container">
                <div className="header-validation-status">
                  {getHeaderStatusIcon()}
                  <div className="status-text">
                    <h4 style={{ fontSize: '12px', fontWeight: '600', margin: '0 0 4px 0' }}>
                      {headerValidation.status === 'healthy' ? 'Healthy' : 
                       headerValidation.status === 'warning' ? 'Warning' : 'Critical'}
                    </h4>
                    <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>
                      {(headerValidation.issues_found || 0) === 0
                        ? 'No header issues detected' 
                        : `${headerValidation.issues_found} issue${headerValidation.issues_found > 1 ? 's' : ''} found`}
                    </p>
                  </div>
                  <div className="health-score">
                    <span className={`score ${headerValidation.status}`}>
                      {headerValidation.health_score || 0}%
                    </span>
                    <span className="score-label">Health Score</span>
                  </div>
                </div>
                
                {hasHeaderIssues && headerValidation.issues && headerValidation.issues.length > 0 && (
                  <div className="header-validation-issues">
                    <h5 style={{ fontSize: '10px', fontWeight: '600', marginBottom: '8px' }}>Issues Detected:</h5>
                    {headerValidation.issues.map((issue) => (
                      <div key={issue.issue_type} className={`issue-item ${issue.severity}`}>
                        <div className="issue-header">
                          <span className={`gps-badge gps-badge--${issue.severity === 'high' ? 'danger' : 'warning'}`} style={{ fontSize: '9px' }}>
                            {issue.severity === 'high' ? 'High' : 'Medium'}
                          </span>
                          <span className="issue-type" style={{ fontSize: '10px' }}>
                            {issue.issue_type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                        </div>
                        <div className="issue-message" style={{ fontSize: '10px' }}>{issue.message}</div>
                        {issue.recommendation && (
                          <div className="issue-recommendation" style={{ fontSize: '10px' }}>
                            <strong>Recommendation:</strong> {issue.recommendation}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
          <div className="gps-card">
            <div className="gps-card-body" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(2, 80, 67, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#025043' }}>
                <FiFileText size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 2px 0', color: '#333' }}>{formatNumber(file.row_count || basicInfo.rowCount || 0)}</h3>
                <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>Rows</p>
              </div>
            </div>
          </div>
          
          <div className="gps-card">
            <div className="gps-card-body" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                <FiBarChart2 size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 2px 0', color: '#333' }}>{file.column_count || columns.length || 0}</h3>
                <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>Columns</p>
              </div>
            </div>
          </div>
          
          <div className="gps-card">
            <div className="gps-card-body" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <FiDownload size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 2px 0', color: '#333' }}>{basicInfo.file_size ? formatBytes(basicInfo.file_size) : (file.file_size ? formatBytes(file.file_size) : 'Unknown')}</h3>
                <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>File Size</p>
              </div>
            </div>
          </div>
          
          <div className="gps-card">
            <div className="gps-card-body" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '16px', fontSize: '10px' }}>
              <div style={{ marginBottom: '4px' }}><strong>Created:</strong> {formatDate(basicInfo.created_at || file.created_at)}</div>
              <div><strong>Updated:</strong> {formatDate(basicInfo.updated_at || basicInfo.created_at || file.created_at)}</div>
            </div>
          </div>
          
          <div className="gps-card">
            <div className="gps-card-body" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                <FiCopy size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 2px 0', color: '#333' }}>{formatNumber(file.duplicate_records_count || 0)}</h3>
                <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>Duplicate Records ({formatDecimal(file.duplicate_records_percentage || 0, 1)}%)</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="gps-card">
          <div className="gps-card-header">
            <h3 className="gps-card-title">Column Details</h3>
          </div>
          <div className="gps-card-body">
          {columns && columns.length > 0 ? (
            <div className="gps-table-container">
              <table className="gps-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Completeness</th>
                    <th>Tags</th>
                    <th>Policies</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map(column => {
                    const totalRows = file.row_count || basicInfo.rowCount || 100;
                    const nullCount = column.missing || 0;
                    const completeness = Math.round(((totalRows - nullCount) / totalRows) * 100);
                    
                    const columnGovernanceTags = allColumnGovernanceTags[column.name] || [];
                    const columnPoliciesData = allColumnPolicies[column.name] || [];
                    
                    // Use intelligent quality analysis
                    const quality = analyzeColumnQuality(column, totalRows);
                    
                    // Get badge style based on severity
                    const getAttrIssueBadgeStyle = (severity) => {
                      const baseStyle = { fontSize: '9px', padding: '2px 6px', cursor: 'help' };
                      switch (severity) {
                        case 'danger': return { ...baseStyle, backgroundColor: '#ef4444', color: 'white' };
                        case 'warning': return { ...baseStyle, backgroundColor: '#f59e0b', color: 'white' };
                        case 'info': return { ...baseStyle, backgroundColor: '#3b82f6', color: 'white' };
                        default: return baseStyle;
                      }
                    };
                    
                    return (
                      <tr key={column.name}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: '500' }}>{column.name}</span>
                            {quality.semanticType !== 'generic' && (
                              <span 
                                className="gps-badge" 
                                style={{ 
                                  backgroundColor: '#e2e8f0', 
                                  color: '#475569', 
                                  fontSize: '8px', 
                                  padding: '1px 4px',
                                  fontWeight: '500'
                                }}
                                title={`Detected as ${getSemanticTypeLabel(quality.semanticType)} field`}
                              >
                                {getSemanticTypeLabel(quality.semanticType)}
                              </span>
                            )}
                            {quality.issues.map((issue) => (
                              <span 
                                key={issue.type} 
                                className="gps-badge"
                                style={getAttrIssueBadgeStyle(issue.severity)}
                                title={issue.tooltip}
                              >
                                {issue.label}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td><span className="gps-badge gps-badge--secondary" style={{ fontSize: '9px' }}>{column.type}</span></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '80px', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${completeness}%`, height: '100%', backgroundColor: '#025043', borderRadius: '3px' }}></div>
                            </div>
                            <span style={{ fontSize: '10px', color: '#666', minWidth: '40px' }}>{formatDecimal(completeness, 1)}%</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {columnGovernanceTags.length > 0 ? (
                              columnGovernanceTags.map(tagAssignment => (
                                <span key={tagAssignment.tag_id} className="gps-badge" style={{ 
                                  backgroundColor: tagAssignment.tag_color || '#3b82f6',
                                  color: 'white',
                                  fontSize: '9px',
                                  padding: '2px 8px'
                                }}>
                                  {tagAssignment.tag_name}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            )}
                            <button 
                              className="gps-icon-btn gps-icon-btn--edit"
                              style={{ width: '22px', height: '22px' }}
                              onClick={async () => {
                                setSelectedColumn(column.name);
                                const tags = await fetchColumnGovernanceTags(column.name);
                                setCurrentColumnGovernanceTags(tags);
                                setShowColumnGovernanceTagModal(true);
                              }}
                              disabled={!canEditColumnGovernance(column.name)}
                              title={canEditColumnGovernance(column.name) ? "Edit column tags" : "You don't have permission to edit tags on this column"}
                            >
                              <FiEdit2 size={12} />
                            </button>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {columnPoliciesData.length > 0 ? (
                              <span style={{ fontSize: '10px', color: '#666' }}>{columnPoliciesData.length} {columnPoliciesData.length === 1 ? 'policy' : 'policies'}</span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            )}
                            <button 
                              className="gps-icon-btn gps-icon-btn--edit"
                              style={{ width: '22px', height: '22px' }}
                              onClick={async () => {
                                setSelectedColumn(column.name);
                                const colPolicies = await fetchColumnPolicies(column.name);
                                setCurrentColumnPolicies(colPolicies);
                                setShowColumnPolicyModal(true);
                              }}
                              disabled={!canEditColumnGovernance(column.name)}
                              title={canEditColumnGovernance(column.name) ? "Edit column policies" : "You don't have permission to edit policies on this column"}
                            >
                              <FiEdit2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="gps-empty-state">
              <p>No completeness data available.</p>
            </div>
          )}
          </div>
        </div>
      </div>
    );
  };

  const renderColumnsTab = () => {
    if (!profile || !profile.columns) return null;
    
    const columns = profile.columns;
    const basicInfo = profile.basic_info || {};
    const totalRows = file.row_count || basicInfo.rowCount || 100;
    
    // Analyze all columns for quality issues
    const columnAnalysis = columns.map(col => ({
      ...col,
      quality: analyzeColumnQuality(col, totalRows)
    }));
    
    // Count columns with issues by severity
    const issueStats = {
      danger: columnAnalysis.filter(c => c.quality.severityLevel === 'danger').length,
      warning: columnAnalysis.filter(c => c.quality.severityLevel === 'warning').length,
      info: columnAnalysis.filter(c => c.quality.severityLevel === 'info').length,
      total: columnAnalysis.filter(c => c.quality.hasIssues).length
    };
    
    // Get row background style based on severity
    const getRowStyle = (severityLevel) => {
      switch (severityLevel) {
        case 'danger': return { backgroundColor: 'rgba(239, 68, 68, 0.08)' };
        case 'warning': return { backgroundColor: 'rgba(245, 158, 11, 0.08)' };
        case 'info': return { backgroundColor: 'rgba(59, 130, 246, 0.06)' };
        default: return {};
      }
    };
    
    // Get badge style based on severity
    const getIssueBadgeStyle = (severity) => {
      const baseStyle = { fontSize: '9px', padding: '2px 6px', marginLeft: '4px', cursor: 'help' };
      switch (severity) {
        case 'danger': return { ...baseStyle, backgroundColor: '#ef4444', color: 'white' };
        case 'warning': return { ...baseStyle, backgroundColor: '#f59e0b', color: 'white' };
        case 'info': return { ...baseStyle, backgroundColor: '#3b82f6', color: 'white' };
        default: return baseStyle;
      }
    };
    
    return (
      <div className="columns-tab">
        <div className="gps-card">
          <div className="gps-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="gps-card-title">Column Details</h3>
            {issueStats.total > 0 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Quality Issues:</span>
                {issueStats.danger > 0 && (
                  <span className="gps-badge" style={{ backgroundColor: '#ef4444', color: 'white', fontSize: '10px', padding: '2px 8px' }}>
                    {issueStats.danger} Critical
                  </span>
                )}
                {issueStats.warning > 0 && (
                  <span className="gps-badge" style={{ backgroundColor: '#f59e0b', color: 'white', fontSize: '10px', padding: '2px 8px' }}>
                    {issueStats.warning} Warning
                  </span>
                )}
                {issueStats.info > 0 && (
                  <span className="gps-badge" style={{ backgroundColor: '#3b82f6', color: 'white', fontSize: '10px', padding: '2px 8px' }}>
                    {issueStats.info} Info
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="gps-card-body">
            <div className="gps-table-container">
              <table className="gps-table">
                <thead>
                  <tr>
                    <th>Column Name</th>
                    <th>Governance Tags</th>
                    <th>Data Type</th>
                    <th>Pattern</th>
                    <th>Unique Values</th>
                    <th>Missing Values</th>
                    <th>Min/Least Frequent</th>
                    <th>Max/Most Frequent</th>
                  </tr>
                </thead>
                <tbody>
                  {columnAnalysis.map((column) => {
                    const nullCount = column.missing || 0;
                    const missingPercentage = Math.round((nullCount / totalRows) * 100);
                    const governanceTags = allColumnGovernanceTags[column.name] || [];
                    const { quality } = column;

                    // Early extraction of commonly used flags
                    const isMasked = shouldMaskValue(column);
                    const hasMinMax = hasMinMaxValues(column);
                    const multiPatternIssue = quality.issues.find(i => i.type === 'multipattern');
                    const highNullsIssue = quality.issues.find(i => i.type === 'highnulls');

                    // Helper: Format patterns (extracted to reduce nesting)
                    const renderedPatterns = (() => {
                      if (isMasked) return '****';
                      if (!column.patterns || column.patterns.length === 0) return 'N/A';
                      return column.patterns
                        .slice(0, 2)
                        .map(p => `${p.pattern} (${p.percentage}%)`)
                        .join(', ');
                    })();

                    // Helper: Render min or least frequent value
                    const renderMinValue = () => {
                      if (isMasked) return '****';
                      if (hasMinMax) {
                        const value = formatMinMaxValue(column.min, column);
                        return column.min_is_frequent
                          ? `${value} (occurs ${column.min_frequency || 1}x)`
                          : value;
                      }
                      if (column.least_frequent_value) {
                        return `${column.least_frequent_value} (occurs ${column.least_frequent_count || 1}x)`;
                      }
                      return 'N/A';
                    };

                    // Helper: Render max or most frequent value
                    const renderMaxValue = () => {
                      if (isMasked) return '****';
                      if (hasMinMax) {
                        const value = formatMinMaxValue(column.max, column);
                        return column.max_is_frequent
                          ? `${value} (occurs ${column.max_frequency || 1}x)`
                          : value;
                      }
                      if (column.most_frequent_value) {
                        return `${column.most_frequent_value} (occurs ${column.most_frequent_count || 1}x)`;
                      }
                      return 'N/A';
                    };

                    return (
                      <tr key={column.name} style={getRowStyle(quality.severityLevel)}>
                        {/* Column Name + Semantic Type + Issues */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                            <span style={{ fontWeight: '500' }}>{column.name}</span>

                            {quality.semanticType !== 'generic' && (
                              <span
                                className="gps-badge"
                                style={{
                                  backgroundColor: '#e2e8f0',
                                  color: '#475569',
                                  fontSize: '8px',
                                  padding: '1px 4px',
                                  fontWeight: '500'
                                }}
                                title={`Detected as ${getSemanticTypeLabel(quality.semanticType)} field`}
                              >
                                {getSemanticTypeLabel(quality.semanticType)}
                              </span>
                            )}

                            {quality.issues.map((issue, idx) => (
                              <span
                                key={`issue-${issue.type || issue.issue_type || issue.rule_name || idx}`}
                                className="gps-badge"
                                style={getIssueBadgeStyle(issue.severity)}
                                title={issue.tooltip}
                              >
                                {issue.label}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Governance Tags */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                            {governanceTags.length > 0 ? (
                              governanceTags.map(tag => (
                                <span
                                  key={tag.tag_id}
                                  className="gps-badge"
                                  style={{
                                    backgroundColor: tag.tag_color || tag.color || '#3b82f6',
                                    color: 'white',
                                    fontSize: '9px',
                                    padding: '2px 8px'
                                  }}
                                  title={tag.tag_name}
                                >
                                  {tag.tag_name}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            )}
                          </div>
                        </td>

                        {/* Data Type */}
                        <td>
                          <span className="gps-badge gps-badge--secondary" style={{ fontSize: '9px' }}>
                            {column.type}
                          </span>
                        </td>

                        {/* Patterns */}
                        <td
                          style={{
                            maxWidth: '150px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            ...(multiPatternIssue ? { borderLeft: '3px solid #f59e0b' } : {})
                          }}
                        >
                          {renderedPatterns}
                        </td>

                        {/* Unique Values */}
                        <td>
                          {column.unique !== undefined && column.unique !== null
                            ? column.unique.toLocaleString()
                            : '0'}
                        </td>

                        {/* Nulls */}
                        <td
                          style={{
                            ...(highNullsIssue
                              ? {
                                  borderLeft:
                                    highNullsIssue.severity === 'danger'
                                      ? '3px solid #ef4444'
                                      : '3px solid #f59e0b'
                                }
                              : {})
                          }}
                        >
                          {`${nullCount.toLocaleString()} (${missingPercentage}%)`}
                        </td>

                        {/* Min / Least Frequent */}
                        <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {renderMinValue()}
                        </td>

                        {/* Max / Most Frequent */}
                        <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {renderMaxValue()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  

  const renderPreviewTab = () => {
    if (!fileId || !profile || !profile.columns) return null;
    
    return (
      <div className="preview-tab">
        <FilePreview 
          fileId={fileId} 
          maxRows={100} 
          columnQualityData={profile.columns} 
        />
      </div>
    );
  };

  const renderQualityRulesTab = () => {
    const RULE_TYPE_LABELS = {
      'null_check': 'Null Check',
      'duplicate_check': 'Duplicate Check',
      'email_validity': 'Email Validity',
      'phone_validity': 'Phone Validity',
      'column_completeness': 'Completeness',
      'date_format': 'Date Format',
      'timestamp_format': 'Timestamp Format'
    };

    const hasRuleChanges = JSON.stringify(selectedRuleIds.sort()) !== 
      JSON.stringify(fileAssignedRules.map(r => r.id).sort());
    
    // Compare current column assignments with saved ones
    const hasColumnChanges = (() => {
      const currentKeys = Object.keys(ruleColumnAssignments).sort();
      const savedKeys = Object.keys(savedRuleColumnAssignments).sort();
      
      // Different number of rules with assignments
      if (currentKeys.length !== savedKeys.length) return true;
      
      // Check if any rule has different columns assigned
      return currentKeys.some(ruleId => {
        const currentCols = (ruleColumnAssignments[ruleId] || []).slice().sort();
        const savedCols = (savedRuleColumnAssignments[ruleId] || []).slice().sort();
        return JSON.stringify(currentCols) !== JSON.stringify(savedCols);
      });
    })();
    
    const hasUnsavedChanges = hasRuleChanges || hasColumnChanges;

    const renderRuleAssignmentSection = () => {
      const columns = profile?.columns || [];
      
      return (
        <div className="gps-card" style={{ marginBottom: '16px' }}>
          <div className="gps-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="gps-card-title" style={{ margin: 0, fontSize: '12px' }}>Assign Quality Rules</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#64748b' }}>
                Click a rule to select columns, then save to apply
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn btn-outline"
                onClick={handleRefreshRules}
                disabled={refreshingRules || rulesLoading}
                style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  fontSize: '11px', 
                  padding: '8px 12px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: 'white',
                  color: '#475569',
                  borderRadius: '6px',
                  cursor: refreshingRules ? 'not-allowed' : 'pointer'
                }}
                title="Refresh available rules from the database"
              >
                <FiRefreshCw size={12} style={{ animation: refreshingRules ? 'spin 1s linear infinite' : 'none' }} />
                {refreshingRules ? 'Refreshing...' : 'Refresh'}
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={handleRunQualityRules}
                disabled={rulesRunning || hasUnsavedChanges || fileAssignedRules.length === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '8px 16px' }}
                title={hasUnsavedChanges ? 'Save rules first before running' : 'Run quality rules against file data'}
              >
                <FiPlay size={12} />
                {rulesRunning ? 'Running...' : 'Run Rules'}
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveFileRules}
                disabled={rulesSaving || !hasUnsavedChanges}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '8px 16px' }}
              >
                {rulesSaving ? 'Saving...' : 'Save Rules'}
              </button>
            </div>
          </div>
          <div className="gps-card-body" style={{ padding: '16px' }}>
            {rulesLoading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <LoadingSpinner />
              </div>
            ) : fileAvailableRules.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '11px', margin: 0 }}>No quality rules available</p>
            ) : (
              <div>
                {/* Rule buttons */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: expandedRuleId ? '16px' : 0 }}>
                  {fileAvailableRules.map(rule => {
                    const isSelected = selectedRuleIds.includes(rule.id);
                    const isExpanded = expandedRuleId === rule.id;
                    const assignedColumns = ruleColumnAssignments[rule.id] || [];
                    
                    return (
                      <div key={rule.id} style={{ position: 'relative' }}>
                        <button
                          onClick={() => isSelected ? handleRuleExpand(rule.id) : handleRuleToggle(rule.id)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '10px',
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 500,
                            border: isExpanded ? '2px solid #025043' : (isSelected ? 'none' : '1px solid #e2e8f0'),
                            borderRadius: '6px',
                            cursor: 'pointer',
                            backgroundColor: isSelected ? '#025043' : '#f8fafc',
                            color: isSelected ? 'white' : '#475569',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          title={isSelected ? 'Click to select columns' : rule.description || rule.rule_name}
                        >
                          {isSelected && <FiCheckCircle size={12} />}
                          {RULE_TYPE_LABELS[rule.rule_type] || rule.rule_name}
                          {isSelected && assignedColumns.length > 0 && (
                            <span style={{ 
                              fontSize: '9px', 
                              backgroundColor: 'rgba(255,255,255,0.3)',
                              padding: '1px 5px',
                              borderRadius: '8px',
                              fontWeight: 600
                            }}>
                              {assignedColumns.length}
                            </span>
                          )}
                          <span style={{ 
                            fontSize: '9px', 
                            opacity: 0.8,
                            backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            {rule.severity}
                          </span>
                          {isSelected && (
                            <span
                              onClick={(e) => { e.stopPropagation(); handleRuleToggle(rule.id); }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); handleRuleToggle(rule.id); } }}
                              style={{
                                marginLeft: '4px',
                                background: 'rgba(255,255,255,0.2)',
                                border: 'none',
                                borderRadius: '50%',
                                width: '16px',
                                height: '16px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: 'white',
                                fontSize: '10px'
                              }}
                              title="Remove rule"
                              role="button"
                              tabIndex={0}
                            >
                              ×
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
                
                {/* Column selection panel for expanded rule */}
                {expandedRuleId && selectedRuleIds.includes(expandedRuleId) && (
                  <div style={{ 
                    marginTop: '16px',
                    padding: '16px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: '#334155' }}>
                          Select Columns for: {RULE_TYPE_LABELS[fileAvailableRules.find(r => r.id === expandedRuleId)?.rule_type] || 'Rule'}
                        </h4>
                        <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#64748b' }}>
                          Choose which columns this rule should validate
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => selectAllColumnsForRule(expandedRuleId)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '9px',
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 500,
                            border: '1px solid #025043',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            backgroundColor: 'white',
                            color: '#025043'
                          }}
                        >
                          Select All
                        </button>
                        <button
                          onClick={() => clearAllColumnsForRule(expandedRuleId)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '9px',
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 500,
                            border: '1px solid #94a3b8',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            backgroundColor: 'white',
                            color: '#64748b'
                          }}
                        >
                          Clear All
                        </button>
                        <button
                          onClick={() => setExpandedRuleId(null)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '9px',
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 500,
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            backgroundColor: '#025043',
                            color: 'white'
                          }}
                        >
                          Done
                        </button>
                      </div>
                    </div>
                    
                    {columns.length === 0 ? (
                      <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>No columns available. Please profile the file first.</p>
                    ) : (
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
                        gap: '8px',
                        maxHeight: '240px',
                        overflowY: 'auto',
                        paddingRight: '8px'
                      }}>
                        {columns.map(col => {
                          const isColumnSelected = (ruleColumnAssignments[expandedRuleId] || []).includes(col.name);
                          return (
                            <label 
                              key={col.name}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 10px',
                                backgroundColor: isColumnSelected ? '#ecfdf5' : 'white',
                                border: isColumnSelected ? '1px solid #059669' : '1px solid #e2e8f0',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '10px',
                                fontFamily: 'Inter, sans-serif',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isColumnSelected}
                                onChange={() => handleRuleColumnToggle(expandedRuleId, col.name)}
                                style={{ accentColor: '#025043', cursor: 'pointer' }}
                              />
                              <span style={{ 
                                fontWeight: 500, 
                                color: isColumnSelected ? '#059669' : '#334155',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {col.name}
                              </span>
                              <span style={{ 
                                fontSize: '9px', 
                                color: '#94a3b8',
                                marginLeft: 'auto',
                                flexShrink: 0
                              }}>
                                {col.type || 'unknown'}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    
                    <div style={{ marginTop: '12px', fontSize: '10px', color: '#64748b' }}>
                      {(ruleColumnAssignments[expandedRuleId] || []).length} of {columns.length} columns selected
                    </div>
                  </div>
                )}
              </div>
            )}
            {hasUnsavedChanges && (
              <p style={{ fontSize: '10px', color: '#f59e0b', marginTop: '12px', marginBottom: 0 }}>
                You have unsaved changes. Click "Save Rules" to apply them.
              </p>
            )}
          </div>
        </div>
      );
    };

    // Render Applied Quality Rules section (shown below Assign Quality Rules)
    // Reorganized to be column-centric: shows columns first, then rules assigned to each column
    const renderAppliedRulesSection = () => {
      if (!qualityViolations || !qualityViolations.applied_rules || qualityViolations.applied_rules.length === 0) {
        return null;
      }
      
      const rules = qualityViolations.applied_rules;
      
      // Transform rule-centric data to column-centric
      // Build a map of column -> array of rules applied to that column
      const columnRulesMap = {};
      
      rules.forEach(rule => {
        const targetCols = rule.target_columns && rule.target_columns.length > 0 
          ? rule.target_columns 
          : ['(All Columns)'];
        
        targetCols.forEach(col => {
          if (!columnRulesMap[col]) {
            columnRulesMap[col] = [];
          }
          columnRulesMap[col].push({
            rule_name: rule.rule_name,
            rule_type: rule.rule_type,
            severity: rule.severity,
            status: rule.status,
            violation_count: rule.violation_count
          });
        });
      });
      
      // Sort columns alphabetically, but keep "(All Columns)" at the end
      const sortedColumns = Object.keys(columnRulesMap).sort((a, b) => {
        if (a === '(All Columns)') return 1;
        if (b === '(All Columns)') return -1;
        return a.localeCompare(b);
      });
      
      return (
        <div className="gps-card" style={{ marginBottom: '16px' }}>
          <div className="gps-card-header">
            <h3 className="gps-card-title" style={{ fontSize: '12px' }}>Applied Quality Rules by Column</h3>
          </div>
          <div className="gps-card-body" style={{ padding: 0 }}>
            <div className="gps-table-container" style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <table className="gps-table">
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>
                  <tr>
                    <th style={{ width: '180px' }}>Target Column</th>
                    <th>Applied Rules</th>
                    <th style={{ width: '100px' }}>Severity</th>
                    <th style={{ width: '120px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedColumns.map((columnName, colIdx) => {
                    const columnRules = columnRulesMap[columnName];
                    
                    return columnRules.map((rule, ruleIdx) => (
                      <tr key={`rule-${columnName}-${rule.rule_type || rule.rule_name || rule.id || ruleIdx}`}>
                        {ruleIdx === 0 ? (
                          <td 
                            rowSpan={columnRules.length} 
                            style={{ 
                              verticalAlign: 'top',
                              borderBottom: colIdx < sortedColumns.length - 1 ? '2px solid #e2e8f0' : undefined,
                              backgroundColor: '#f8fafc'
                            }}
                          >
                            <span 
                              className="gps-badge gps-badge--info" 
                              style={{ 
                                fontSize: '10px', 
                                fontWeight: '600',
                                display: 'inline-block',
                                marginTop: '2px'
                              }}
                            >
                              {columnName}
                            </span>
                          </td>
                        ) : null}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: '500', fontSize: '10px' }}>{rule.rule_name}</span>
                            <span className="gps-badge gps-badge--secondary" style={{ fontSize: '8px' }}>{rule.rule_type}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`gps-badge gps-badge--${rule.severity === 'critical' ? 'danger' : rule.severity === 'high' ? 'danger' : rule.severity === 'error' ? 'danger' : 'warning'}`} style={{ fontSize: '9px' }}>
                            {rule.severity}
                          </span>
                        </td>
                        <td>
                          {rule.status === null ? (
                            <span className="gps-badge gps-badge--secondary" style={{ fontSize: '9px' }}>Not Run</span>
                          ) : rule.status === 'passed' ? (
                            <span className="gps-badge gps-badge--success" style={{ fontSize: '9px' }}><FiCheckCircle size={10} style={{ marginRight: '4px' }} /> Passed</span>
                          ) : (
                            <span className="gps-badge gps-badge--danger" style={{ fontSize: '9px' }}><FiXCircle size={10} style={{ marginRight: '4px' }} /> Failed ({rule.violation_count})</span>
                          )}
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    };

    if (qualityLoading && rulesLoading) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      );
    }

    if (!qualityViolations) {
      return (
        <div className="quality-rules-tab">
          {renderRuleAssignmentSection()}
          <div className="empty-state">
            <FiCheckCircle size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <p>Loading quality rule data...</p>
          </div>
        </div>
      );
    }

    const { summary, violations, applied_rules } = qualityViolations;

    // Get unique values for filters
    const uniqueColumns = [...new Set(violations.map(v => v.column_name).filter(Boolean))];
    const uniqueRuleTypes = [...new Set(violations.map(v => v.rule_type).filter(Boolean))];

    // Apply filters
    let filteredViolations = violations;
    if (qualityFilter.severity !== 'all') {
      filteredViolations = filteredViolations.filter(v => v.severity === qualityFilter.severity);
    }
    if (qualityFilter.ruleType !== 'all') {
      filteredViolations = filteredViolations.filter(v => v.rule_type === qualityFilter.ruleType);
    }
    if (qualityFilter.column !== 'all') {
      filteredViolations = filteredViolations.filter(v => v.column_name === qualityFilter.column);
    }

    if (applied_rules.length === 0) {
      return (
        <div className="quality-rules-tab">
          {renderRuleAssignmentSection()}
          {renderAppliedRulesSection()}
          <div className="gps-card">
            <div className="gps-card-body" style={{ textAlign: 'center', padding: '40px' }}>
              <FiAlertTriangle size={48} style={{ marginBottom: '16px', opacity: 0.5, color: '#94a3b8' }} />
              <p style={{ fontSize: '12px', color: '#475569', margin: 0 }}>No quality rules applied to this file</p>
              <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px' }}>
                Select rules above and click "Save Rules" to run quality checks
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Check if rules have been executed - a rule with status === null hasn't been run yet
    const rulesHaveBeenRun = applied_rules.some(rule => rule.status !== null);
    
    // Only show "All Quality Rules Passed" if rules have been run AND no violations exist
    if (violations.length === 0 && rulesHaveBeenRun) {
      return (
        <div className="quality-rules-tab">
          {renderRuleAssignmentSection()}
          {renderAppliedRulesSection()}
          <div className="gps-card">
            <div className="gps-card-body" style={{ textAlign: 'center', padding: '24px' }}>
              <FiCheckCircle size={32} style={{ color: '#16a34a', marginBottom: '8px' }} />
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#16a34a' }}>All Quality Rules Passed!</div>
              <div style={{ fontSize: '10px', color: '#666' }}>{summary.total_rules_applied} rules applied</div>
            </div>
          </div>
        </div>
      );
    }
    
    // Rules assigned but not run yet - show pending state
    if (violations.length === 0 && !rulesHaveBeenRun) {
      return (
        <div className="quality-rules-tab">
          {renderRuleAssignmentSection()}
          {renderAppliedRulesSection()}
          <div className="gps-card">
            <div className="gps-card-body" style={{ textAlign: 'center', padding: '24px' }}>
              <FiClock size={32} style={{ color: '#f59e0b', marginBottom: '8px' }} />
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#475569' }}>Quality Rules Pending</div>
              <div style={{ fontSize: '10px', color: '#666' }}>{applied_rules.length} rules assigned - click "Run Rules" to execute</div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="quality-rules-tab">
        {renderRuleAssignmentSection()}
        {renderAppliedRulesSection()}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div className="gps-card">
            <div className="gps-card-body" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#666' }}>Total Rules</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#333' }}>{summary.total_rules_applied}</div>
                </div>
                <div>
                  <FiCheckCircle size={16} style={{ color: '#16a34a', marginBottom: '4px' }} />
                  <div style={{ fontSize: '10px', color: '#666' }}>Passed</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#16a34a' }}>{summary.rules_passed}</div>
                </div>
                <div>
                  <FiXCircle size={16} style={{ color: '#e53e3e', marginBottom: '4px' }} />
                  <div style={{ fontSize: '10px', color: '#666' }}>Failed</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#e53e3e' }}>{summary.rules_failed}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#666' }}>Violations</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#333' }}>{summary.total_violations}</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="gps-card">
            <div className="gps-card-header" style={{ padding: '12px 16px' }}>
              <h4 className="gps-card-title" style={{ fontSize: '12px' }}>Violations by Severity</h4>
            </div>
            <div className="gps-card-body" style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiAlertTriangle size={14} style={{ color: '#e53e3e' }} />
                  <span style={{ fontSize: '10px' }}>Critical</span>
                  <span className="gps-badge gps-badge--danger" style={{ fontSize: '9px' }}>{summary.violations_by_severity.critical}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiXCircle size={14} style={{ color: '#dd6b20' }} />
                  <span style={{ fontSize: '10px' }}>Error</span>
                  <span className="gps-badge gps-badge--warning" style={{ fontSize: '9px' }}>{summary.violations_by_severity.error}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiAlertTriangle size={14} style={{ color: '#f59e0b' }} />
                  <span style={{ fontSize: '10px' }}>Warning</span>
                  <span className="gps-badge gps-badge--info" style={{ fontSize: '9px' }}>{summary.violations_by_severity.warning}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="gps-card" style={{ marginBottom: '16px' }}>
          <div className="gps-card-body" style={{ padding: '12px 16px' }}>
            <div className="gps-filter-row">
              <div className="gps-filter-group">
                <label className="gps-filter-label" htmlFor="filter-severity">Severity</label>
                <select 
                  id="filter-severity"
                  value={qualityFilter.severity} 
                  onChange={(e) => { setQualityFilter({...qualityFilter, severity: e.target.value}); setViolationsPage(1); }}
                  className="gps-form-select"
                >
                  <option value="all">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="error">Error</option>
                  <option value="warning">Warning</option>
                </select>
              </div>
              
              <div className="gps-filter-group">
                <label className="gps-filter-label" htmlFor="filter-rule-type">Rule Type</label>
                <select 
                  id="filter-rule-type"
                  value={qualityFilter.ruleType} 
                  onChange={(e) => { setQualityFilter({...qualityFilter, ruleType: e.target.value}); setViolationsPage(1); }}
                  className="gps-form-select"
                >
                  <option value="all">All Types</option>
                  {uniqueRuleTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              
              {uniqueColumns.length > 0 && (
                <div className="gps-filter-group">
                  <label className="gps-filter-label" htmlFor="filter-column">Column</label>
                  <select 
                    id="filter-column"
                    value={qualityFilter.column} 
                    onChange={(e) => { setQualityFilter({...qualityFilter, column: e.target.value}); setViolationsPage(1); }}
                    className="gps-form-select"
                  >
                    <option value="all">All Columns</option>
                    {uniqueColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div style={{ marginLeft: 'auto', fontSize: '10px', color: '#666' }}>
                Showing {filteredViolations.length} of {violations.length} violations
              </div>
            </div>
          </div>
        </div>

        {/* Quality Rule Violations - Scrollable paginated panel */}
        <div className="gps-card">
          <div className="gps-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="gps-card-title" style={{ fontSize: '12px' }}>Quality Rule Violations</h3>
            {filteredViolations.length > 0 && (
              <button
                onClick={() => {
                  const exportData = filteredViolations.map(v => ({
                    'Primary Key': v.primary_key_value ? `${v.primary_key_column}: ${v.primary_key_value}` : 'N/A',
                    'Rule Name': v.rule_name,
                    'Severity': v.severity,
                    'Column': v.column_name || 'N/A',
                    'Expected Value': v.expected_value,
                    'Actual Value': v.actual_value,
                    'Violation Details': v.rule_description || ''
                  }));
                  const ws = XLSX.utils.json_to_sheet(exportData);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'Quality Violations');
                  XLSX.writeFile(wb, `quality-violations-${fileId}.xlsx`);
                }}
                className="gps-btn gps-btn--secondary"
                style={{ fontSize: '10px' }}
              >
                <FiDownload size={12} style={{ marginRight: '4px' }} /> Export to Excel
              </button>
            )}
          </div>
          <div className="gps-card-body" style={{ padding: 0 }}>
            {filteredViolations.length === 0 ? (
              <div className="gps-empty-state" style={{ padding: '20px' }}>
                <p>No violations match the selected filters</p>
              </div>
            ) : (
              <>
                <div className="gps-table-container" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <table className="gps-table">
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>
                      <tr>
                        <th>Primary Key</th>
                        <th>Rule Name</th>
                        <th>Severity</th>
                        <th>Column</th>
                        <th>Expected</th>
                        <th>Actual</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredViolations
                        .slice((violationsPage - 1) * VIOLATIONS_PER_PAGE, violationsPage * VIOLATIONS_PER_PAGE)
                        .map((violation, idx) => (
                        <tr key={
                          violation.id ||
                          (violation.primary_key_value ? `${violation.primary_key_column || 'pk'}:${violation.primary_key_value}` :
                            (violation.row_number ? `row:${violation.row_number}` : `violation:${idx}`)) +
                          `-${violation.rule_name || violation.rule_type || idx}`
                        }>
                          <td>
                            {violation.primary_key_value ? (
                              <div>
                                <code style={{ fontSize: '9px', color: '#025043' }}>{violation.primary_key_column}</code>
                                <div style={{ fontSize: '10px', color: '#666' }}>{violation.primary_key_value}</div>
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '10px' }}>Row {violation.row_number || 'N/A'}</span>
                            )}
                          </td>
                          <td>
                            <div>
                              <span style={{ fontWeight: '500', fontSize: '10px' }}>{violation.rule_name}</span>
                              {violation.rule_description && (
                                <div style={{ fontSize: '9px', color: '#666' }}>{violation.rule_description}</div>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`gps-badge gps-badge--${violation.severity === 'critical' ? 'danger' : violation.severity === 'error' ? 'danger' : 'warning'}`} style={{ fontSize: '9px' }}>
                              {violation.severity === 'critical' && <FiAlertTriangle size={10} style={{ marginRight: '3px' }} />}
                              {violation.severity === 'error' && <FiXCircle size={10} style={{ marginRight: '3px' }} />}
                              {violation.severity === 'warning' && <FiAlertTriangle size={10} style={{ marginRight: '3px' }} />}
                              {violation.severity}
                            </span>
                          </td>
                          <td><code style={{ fontSize: '9px', color: '#025043' }}>{violation.column_name || 'N/A'}</code></td>
                          <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '10px' }}>{violation.expected_value}</td>
                          <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '10px' }}>{violation.actual_value}</td>
                          <td><span className="gps-badge gps-badge--secondary" style={{ fontSize: '9px' }}>{violation.rule_type}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination controls */}
                {filteredViolations.length > VIOLATIONS_PER_PAGE && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '12px 16px',
                    borderTop: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc'
                  }}>
                    <div style={{ fontSize: '10px', color: '#666' }}>
                      Showing {(violationsPage - 1) * VIOLATIONS_PER_PAGE + 1} - {Math.min(violationsPage * VIOLATIONS_PER_PAGE, filteredViolations.length)} of {filteredViolations.length}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setViolationsPage(p => Math.max(1, p - 1))}
                        disabled={violationsPage === 1}
                        style={{
                          padding: '4px 12px',
                          fontSize: '10px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '4px',
                          backgroundColor: violationsPage === 1 ? '#f1f5f9' : 'white',
                          cursor: violationsPage === 1 ? 'not-allowed' : 'pointer',
                          color: violationsPage === 1 ? '#94a3b8' : '#475569'
                        }}
                      >
                        Previous
                      </button>
                      <span style={{ fontSize: '10px', padding: '4px 8px', color: '#475569' }}>
                        Page {violationsPage} of {Math.ceil(filteredViolations.length / VIOLATIONS_PER_PAGE)}
                      </span>
                      <button
                        onClick={() => setViolationsPage(p => Math.min(Math.ceil(filteredViolations.length / VIOLATIONS_PER_PAGE), p + 1))}
                        disabled={violationsPage >= Math.ceil(filteredViolations.length / VIOLATIONS_PER_PAGE)}
                        style={{
                          padding: '4px 12px',
                          fontSize: '10px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '4px',
                          backgroundColor: violationsPage >= Math.ceil(filteredViolations.length / VIOLATIONS_PER_PAGE) ? '#f1f5f9' : 'white',
                          cursor: violationsPage >= Math.ceil(filteredViolations.length / VIOLATIONS_PER_PAGE) ? 'not-allowed' : 'pointer',
                          color: violationsPage >= Math.ceil(filteredViolations.length / VIOLATIONS_PER_PAGE) ? '#94a3b8' : '#475569'
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSchemaBuilderTab = () => {
    if (!profile || !profile.columns) {
      return (
        <div className="empty-state">
          <FiFileText size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <p>No column data available</p>
          <p className="empty-state-hint">Profile the file first to generate schema</p>
        </div>
      );
    }

    if (schemaBuilderLoading) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      );
    }

    const columns = profile.columns;
    const RULE_TYPE_LABELS = {
      'null_check': 'Null Check',
      'duplicate_check': 'Duplicate Check',
      'email_validity': 'Email Validity',
      'phone_validity': 'Phone Validity',
      'column_completeness': 'Completeness',
      'date_format': 'Date Format',
      'timestamp_format': 'Timestamp Format'
    };

    return (
      <div className="schema-builder-tab">
        <div className="gps-card" style={{ marginBottom: '16px' }}>
          <div className="gps-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="gps-card-title" style={{ margin: 0, fontSize: '12px' }}>Schema Builder</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#64748b' }}>
                Assign quality rules to columns and generate a schema JSON file for vendor agreements
              </p>
            </div>
            <button 
              className="btn btn-primary" 
              onClick={handleDownloadSchema}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '8px 16px', flex: '0 0 auto', whiteSpace: 'nowrap' }}
            >
              <FiDownload size={14} />
              Generate Schema
            </button>
          </div>
        </div>

        <div className="gps-card">
          <div className="gps-card-header">
            <h3 className="gps-card-title" style={{ margin: 0, fontSize: '11px' }}>Column Quality Rule Assignments</h3>
          </div>
          <div className="gps-card-body" style={{ padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="gps-table" style={{ fontSize: '10px', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '10px 12px', minWidth: '120px' }}>Column Name</th>
                    <th style={{ padding: '10px 12px', minWidth: '80px' }}>Type</th>
                    <th style={{ padding: '10px 12px', minWidth: '70px' }}>Nullable</th>
                    <th style={{ padding: '10px 12px', minWidth: '50px' }}>PII</th>
                    <th style={{ padding: '10px 12px', minWidth: '300px' }}>Quality Rules</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map(col => {
                    const schemaType = mapProfileTypeToSchemaType(col.type);
                    const isNullable = col.missing > 0 || col.nullable !== false;
                    const columnTags = allColumnGovernanceTags[col.name] || [];
                    const hasPII = col.pii || columnTags.some(t => t.tag_name?.toLowerCase().includes('pii'));
                    const assignedRules = columnDQAssignments[col.name] || [];

                    return (
                      <tr key={col.name}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{col.name}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className="gps-badge gps-badge--secondary" style={{ fontSize: '9px' }}>{schemaType}</span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ color: isNullable ? '#64748b' : '#059669', fontSize: '10px' }}>
                            {isNullable ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {hasPII ? (
                            <span className="gps-badge" style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '8px' }}>PII</span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '10px' }}>No</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {availableGenericRules.map(rule => {
                              const isSelected = assignedRules.includes(rule.id);
                              return (
                                <button
                                  key={rule.id}
                                  onClick={() => handleColumnRuleToggle(col.name, rule.id)}
                                  style={{
                                    padding: '3px 8px',
                                    fontSize: '9px',
                                    fontFamily: 'Inter, sans-serif',
                                    fontWeight: 500,
                                    border: isSelected ? 'none' : '1px solid #e2e8f0',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    backgroundColor: isSelected ? '#025043' : '#f8fafc',
                                    color: isSelected ? 'white' : '#475569',
                                    transition: 'all 0.2s ease'
                                  }}
                                  title={rule.rule_name}
                                >
                                  {RULE_TYPE_LABELS[rule.rule_type] || rule.rule_name}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Schema Preview */}
        <div className="gps-card" style={{ marginTop: '16px' }}>
          <div className="gps-card-header">
            <h3 className="gps-card-title" style={{ margin: 0, fontSize: '11px' }}>Schema Preview</h3>
          </div>
          <div className="gps-card-body">
            <pre style={{ 
              backgroundColor: '#1e293b', 
              color: '#e2e8f0', 
              padding: '16px', 
              borderRadius: '6px', 
              fontSize: '10px',
              fontFamily: 'monospace',
              overflow: 'auto',
              maxHeight: '300px',
              margin: 0
            }}>
              {JSON.stringify(generateSchemaJSON(), null, 2)}
            </pre>
          </div>
        </div>
      </div>
    );
  };

  const fetchProfileHistory = async () => {
    try {
      setHistoryLoading(true);
      setHistoryFetched(true);
      setErrorMessage(null);
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/files/${fileId}/profile-history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProfileHistory(response.data);
    } catch (err) {
      console.error('Error fetching profile history:', err);
      // Don't show error modal for now, just log it
      // setErrorMessage('Failed to load profile history');
    } finally {
      setHistoryLoading(false);
    }
  };

  

  return (
    <div className="gps-page-container data-profile-container">
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="gps-empty-state">
          <p>{error}</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' }}>
            <Link to="/file-catalog" className="gps-btn gps-btn--secondary">
              <FiFileText style={{ marginRight: '6px' }} /> Go to File Catalog
            </Link>
            <button className="gps-btn gps-btn--primary" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </div>
      ) : file ? (
        <>
          <div className="gps-card" style={{ marginBottom: '16px' }}>
            <div className="gps-card-body" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h1 className="gps-page-title" style={{ margin: 0, fontSize: '16px' }}>{file.filename}</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '10px', color: '#666' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FiUser size={12} />
                    <strong>Creator:</strong> {ownership?.creator_name || ownership?.creator_email || 'Unknown'}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FiUser size={12} />
                    <strong>Owner:</strong> {ownership?.owner_name || ownership?.owner_email || 'Unassigned'}
                    <button 
                      className="gps-icon-btn gps-icon-btn--edit"
                      style={{ width: '22px', height: '22px' }}
                      onClick={() => setShowOwnershipModal(true)}
                      disabled={!currentUser?.roles?.includes('Admin')}
                      title={currentUser?.roles?.includes('Admin') ? "Edit ownership" : "Only Admin can edit file ownership"}
                    >
                      <FiEdit2 size={12} />
                    </button>
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#666', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <span><strong>Size:</strong> {file.file_size ? formatBytes(file.file_size) : 'Unknown'}</span>
                  <span><strong>Uploaded:</strong> {getTimeSince(file.created_at)}</span>
                  <span><strong>Encoding:</strong> {file.encoding || profile?.basic_info?.encoding || 'UTF-8'}</span>
                  <span><strong>Format:</strong> {file.file_type || 'Unknown'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>Sensitivity:</strong>
                  <select 
                    value={fileSensitivity}
                    onChange={handleSensitivityChange}
                    className="gps-form-select"
                    style={{ minWidth: '100px', padding: '4px 8px' }}
                  >
                    <option value="Public">Public</option>
                    <option value="Internal">Internal</option>
                    <option value="Confidential">Confidential</option>
                    <option value="Restricted">Restricted</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          
          {file.processing_error && (
            <div className="processing-error-banner">
              <div className="error-banner-content">
                <span className="error-icon">⚠️</span>
                <div className="error-text-content">
                  <h3>File Processing Failed</h3>
                  <p>{file.processing_error}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Delimiter detection banner */}
          {profile && profile.columns && profile.columns.length === 1 && file.file_type && 
           ['csv', 'dat', 'txt'].includes(file.file_type.toLowerCase()) && (
            <div className="info-banner" style={{ backgroundColor: '#fef3c7', borderColor: '#f59e0b', marginBottom: '20px' }}>
              <div className="error-banner-content">
                <span className="error-icon">⚠️</span>
                <div className="error-text-content">
                  <h3>Delimiter Configuration Needed</h3>
                  <p>
                    This file has only 1 column, which may indicate an incorrect delimiter. 
                    Configure the correct delimiter to properly parse the columns.
                  </p>
                  <button 
                    className="btn btn-primary" 
                    style={{ marginTop: '10px' }}
                    onClick={() => setShowDelimiterModal(true)}
                  >
                    Configure Delimiter
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {showOwnershipModal && (
            <OwnershipModal
              fileId={fileId}
              currentOwnership={ownership}
              onClose={() => setShowOwnershipModal(false)}
              onSave={async () => {
                await fetchOwnership();
                setShowOwnershipModal(false);
              }}
              setErrorMessage={setErrorMessage}
            />
          )}
          
          {showTagModal && selectedColumn && (
            <SensitivityTagModal
              fileId={fileId}
              columnName={selectedColumn}
              currentTags={currentColumnGovernanceTags}
              availableTags={availableTags}
              onClose={() => {
                setShowTagModal(false);
                setSelectedColumn(null);
              }}
              onSave={async () => {
                setShowTagModal(false);
                setSelectedColumn(null);
                if (profile && profile.columns) {
                  await fetchAllColumnGovernanceData(profile.columns);
                }
              }}
              setErrorMessage={setErrorMessage}
            />
          )}
          
          {showColumnGovernanceTagModal && selectedColumn && (
            <ColumnGovernanceTagModal
              fileId={fileId}
              columnName={selectedColumn}
              currentTags={currentColumnGovernanceTags}
              availableTags={availableTags}
              onClose={() => {
                setShowColumnGovernanceTagModal(false);
                setSelectedColumn(null);
                setCurrentColumnGovernanceTags([]);
              }}
              onSave={async () => {
                setShowColumnGovernanceTagModal(false);
                setSelectedColumn(null);
                setCurrentColumnGovernanceTags([]);
                // Refresh column governance data to update the table
                if (profile && profile.columns) {
                  await fetchAllColumnGovernanceData(profile.columns);
                }
              }}
              setErrorMessage={setErrorMessage}
            />
          )}
          
          {showColumnPolicyModal && selectedColumn && (
            <ColumnPolicyModal
              fileId={fileId}
              columnName={selectedColumn}
              currentPolicies={currentColumnPolicies}
              availablePolicies={availablePolicies}
              onClose={() => {
                setShowColumnPolicyModal(false);
                setSelectedColumn(null);
                setCurrentColumnPolicies([]);
              }}
              onSave={async () => {
                setShowColumnPolicyModal(false);
                setSelectedColumn(null);
                setCurrentColumnPolicies([]);
                // Refresh column governance data to update the table
                if (profile && profile.columns) {
                  await fetchAllColumnGovernanceData(profile.columns);
                }
              }}
              setErrorMessage={setErrorMessage}
            />
          )}
          
          {showFixedWidthModal && (
            <FixedWidthSchemaModal
              fileId={fileId}
              onClose={() => setShowFixedWidthModal(false)}
              onSave={async () => {
                setShowFixedWidthModal(false);
                try {
                  const encodedFileId = encodeURIComponent(fileId);
                  const response = await axios.post(
                    `/api/files/${encodedFileId}/retry`,
                    {},
                    { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
                  );
                  
                  setSuccessMessage('Schema saved and file re-profiled successfully!');
                  
                  setTimeout(async () => {
                    setSuccessMessage(null);
                    await fetchFileDetails();
                    await fetchProfileData();
                  }, 1500);
                } catch (err) {
                  console.error('Error triggering re-profile:', err);
                  const errorMsg = err.response?.data?.details || err.response?.data?.error || 'Re-profiling failed';
                  setErrorMessage(`Schema saved but re-profiling failed: ${errorMsg}`);
                }
              }}
              setErrorMessage={setErrorMessage}
            />
          )}
          
          {showDelimiterModal && (
            <DelimiterConfigModal
              fileId={fileId}
              onClose={() => setShowDelimiterModal(false)}
              onSave={async () => {
                setShowDelimiterModal(false);
                setSuccessMessage('Delimiter saved and file re-profiled successfully!');
                
                setTimeout(async () => {
                  setSuccessMessage(null);
                  await fetchFileDetails();
                  await fetchProfileData();
                }, 1500);
              }}
              setErrorMessage={setErrorMessage}
            />
          )}
          
          <div className="gps-tabs">
            <button 
              className={`gps-tab ${activeTab === 'attributes' ? 'gps-tab--active' : ''}`}
              onClick={() => setActiveTab('attributes')}
            >
              File Attributes
            </button>
            <button 
              className={`gps-tab ${activeTab === 'profile' ? 'gps-tab--active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              File Profile
            </button>
            <button 
              className={`gps-tab ${activeTab === 'schema-history' ? 'gps-tab--active' : ''}`}
              onClick={() => setActiveTab('schema-history')}
            >
              <FiGitBranch style={{ marginRight: '6px' }} /> Schema History
            </button>
            <button 
              className={`gps-tab ${activeTab === 'preview' ? 'gps-tab--active' : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              <FiTable style={{ marginRight: '6px' }} /> Preview
            </button>
            {!isVendorUser && (
              <button 
                className={`gps-tab ${activeTab === 'ai-suggestions' ? 'gps-tab--active' : ''}`}
                onClick={() => setActiveTab('ai-suggestions')}
              >
                <FiZap style={{ marginRight: '6px' }} /> DQ Suggestions
              </button>
            )}
            {!isVendorUser && (
              <button 
                className={`gps-tab ${activeTab === 'quality-rules' ? 'gps-tab--active' : ''}`}
                onClick={() => setActiveTab('quality-rules')}
              >
                <FiCheckCircle style={{ marginRight: '6px' }} /> Quality Rules
              </button>
            )}
            {!isVendorUser && (
              <button 
                className={`gps-tab ${activeTab === 'schema-builder' ? 'gps-tab--active' : ''}`}
                onClick={() => setActiveTab('schema-builder')}
              >
                <FiFileText style={{ marginRight: '6px' }} /> Schema Builder
              </button>
            )}
          </div>
          
          <div className="profile-content">
            {activeTab === 'attributes' && renderOverviewTab()}
            {activeTab === 'profile' && renderColumnsTab()}
            {activeTab === 'schema-history' && <SchemaHistoryTab fileId={fileId} />}
            {activeTab === 'preview' && renderPreviewTab()}
            {activeTab === 'quality-rules' && !isVendorUser && renderQualityRulesTab()}
            {activeTab === 'ai-suggestions' && !isVendorUser && (
              <AIDQSuggestionsTab 
                fileId={fileId}
                filename={file?.filename}
                columns={profile?.columns || []}
                projectId={file?.project_id}
              />
            )}
            {activeTab === 'schema-builder' && !isVendorUser && renderSchemaBuilderTab()}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <p>File not found.</p>
          <Link to="/" className="btn btn-primary">Return to Dashboard</Link>
        </div>
      )}
      
      <ErrorModal 
        message={errorMessage} 
        onClose={() => setErrorMessage(null)} 
      />
      
      {/* Revalidation Modal - File Upload for Quality Rules */}
      {showRevalidateModal && (
        <div className="modal-overlay" style={{ zIndex: 2000 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '16px 20px',
              backgroundColor: '#ffffff',
              borderBottom: '1px solid #e0e0e0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FiPlay style={{ color: '#2e7d32', fontSize: '20px' }} />
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#333' }}>Run Quality Rules</h2>
              </div>
              <button 
                onClick={() => !rulesRunning && setShowRevalidateModal(false)}
                disabled={rulesRunning}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: rulesRunning ? 'not-allowed' : 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#666',
                  opacity: rulesRunning ? 0.5 : 1
                }}
              >
                <FiXCircle style={{ fontSize: '18px' }} />
              </button>
            </div>
            
            <div style={{ padding: '20px' }}>
              <p style={{ margin: '0 0 16px 0', color: '#555', fontSize: '14px', lineHeight: '1.5' }}>
                Upload a new version of the file to run quality rules validation. The existing rule configurations will be applied to the uploaded data.
              </p>
              
              <div style={{ 
                border: '2px dashed #ccc', 
                borderRadius: '8px', 
                padding: '24px', 
                textAlign: 'center',
                backgroundColor: revalidateFile ? '#f0f9f0' : '#fafafa',
                transition: 'all 0.2s'
              }}>
                {revalidateFile ? (
                  <div>
                    <FiCheckCircle style={{ fontSize: '32px', color: '#2e7d32', marginBottom: '8px' }} />
                    <p style={{ margin: '0 0 8px 0', fontWeight: 500, color: '#333' }}>{revalidateFile.name}</p>
                    <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                      {(revalidateFile.size / 1024).toFixed(1)} KB
                    </p>
                    {!rulesRunning && (
                      <button
                        onClick={() => setRevalidateFile(null)}
                        style={{
                          marginTop: '12px',
                          padding: '4px 12px',
                          fontSize: '12px',
                          border: '1px solid #ccc',
                          borderRadius: '4px',
                          backgroundColor: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        Choose Different File
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <FiFileText style={{ fontSize: '32px', color: '#999', marginBottom: '8px' }} />
                    <p style={{ margin: '0 0 12px 0', color: '#666' }}>Select a CSV or JSON file</p>
                    <label style={{
                      display: 'inline-block',
                      padding: '8px 16px',
                      backgroundColor: '#2e7d32',
                      color: '#fff',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}>
                      Choose File
                      <input 
                        type="file" 
                        accept=".csv,.json"
                        onChange={handleRevalidateFileSelect}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                )}
              </div>
              
              {rulesRunning && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#666' }}>
                      {revalidateProgress < 90 ? 'Uploading...' : 'Processing rules...'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#666' }}>{revalidateProgress}%</span>
                  </div>
                  <div style={{ 
                    height: '6px', 
                    backgroundColor: '#e0e0e0', 
                    borderRadius: '3px',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      height: '100%', 
                      width: `${revalidateProgress}%`, 
                      backgroundColor: '#2e7d32',
                      transition: 'width 0.3s'
                    }} />
                  </div>
                </div>
              )}
            </div>
            
            <div style={{ 
              display: 'flex',
              justifyContent: 'flex-end', 
              gap: '12px',
              padding: '12px 20px',
              borderTop: '1px solid #e0e0e0',
              backgroundColor: '#fafafa'
            }}>
              <button 
                onClick={() => setShowRevalidateModal(false)}
                disabled={rulesRunning}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  backgroundColor: '#fff',
                  cursor: rulesRunning ? 'not-allowed' : 'pointer',
                  opacity: rulesRunning ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleRevalidateSubmit}
                disabled={!revalidateFile || rulesRunning}
                style={{
                  padding: '8px 24px',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: (!revalidateFile || rulesRunning) ? '#ccc' : '#2e7d32',
                  color: '#fff',
                  cursor: (!revalidateFile || rulesRunning) ? 'not-allowed' : 'pointer'
                }}
              >
                {rulesRunning ? 'Running...' : 'Run Rules'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------
// PropTypes for local components
// ---------------------------

DelimiterConfigModal.propTypes = {
  fileId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  setErrorMessage: PropTypes.func
};
DelimiterConfigModal.defaultProps = {
  setErrorMessage: null
};

FixedWidthSchemaModal.propTypes = {
  fileId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  setErrorMessage: PropTypes.func
};
FixedWidthSchemaModal.defaultProps = {
  setErrorMessage: null
};

SensitivityTagModal.propTypes = {
  fileId: PropTypes.string.isRequired,
  columnName: PropTypes.string.isRequired,
  currentTags: PropTypes.array,
  availableTags: PropTypes.array,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  setErrorMessage: PropTypes.func
};
SensitivityTagModal.defaultProps = {
  currentTags: [],
  availableTags: [],
  setErrorMessage: null
};

OwnershipModal.propTypes = {
  fileId: PropTypes.string.isRequired,
  currentOwnership: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  setErrorMessage: PropTypes.func
};
OwnershipModal.defaultProps = {
  currentOwnership: null,
  setErrorMessage: null
};

ColumnGovernanceTagModal.propTypes = {
  fileId: PropTypes.string.isRequired,
  columnName: PropTypes.string.isRequired,
  currentTags: PropTypes.array,
  availableTags: PropTypes.array,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  setErrorMessage: PropTypes.func
};
ColumnGovernanceTagModal.defaultProps = {
  currentTags: [],
  availableTags: [],
  setErrorMessage: null
};

ColumnPolicyModal.propTypes = {
  fileId: PropTypes.string.isRequired,
  columnName: PropTypes.string.isRequired,
  currentPolicies: PropTypes.array,
  availablePolicies: PropTypes.array,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  setErrorMessage: PropTypes.func
};
ColumnPolicyModal.defaultProps = {
  currentPolicies: [],
  availablePolicies: [],
  setErrorMessage: null
};

DataProfile.propTypes = {};

export default DataProfile;