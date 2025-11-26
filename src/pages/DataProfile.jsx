import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiFileText, FiCalendar, FiBarChart2, FiDownload, FiTable, FiCopy, FiEdit2, FiUser, FiClock, FiCheckCircle, FiAlertTriangle, FiXCircle, FiGitBranch } from 'react-icons/fi';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import FilePreview from '../components/FilePreview';
import ErrorModal from '../components/ErrorModal';
import SchemaHistoryTab from '../components/SchemaHistoryTab';
import { getFileDetails, getFileProfile, getFilePreview } from '../api/fileService';
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
            <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
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
          <label>Select Governance Tags (multi-select)</label>
          <div className="classification-options">
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
          <label>Owner Name</label>
          <input
            type="text"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Enter owner name"
          />
        </div>
        
        <div className="form-group">
          <label>Owner Email</label>
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            placeholder="Enter owner email"
          />
        </div>
        
        <div className="form-group">
          <label>Owner Contact</label>
          <input
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
          <label>Select Governance Tags</label>
          <div className="tags-selector">
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
          <label>Select Governance Policies</label>
          <div className="policies-selector">
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
  const { currentUser, hasPermission } = useAuth();
  const [file, setFile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('attributes');
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
  
  const getMaskedValue = (value, column) => {
    // Return masked placeholder if column should be masked, otherwise return the original value
    if (shouldMaskValue(column)) {
      return '****';
    }
    return value;
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

  useEffect(() => {
    // Fetch quality violations when quality-rules tab is active
    if (activeTab === 'quality-rules' && !qualityViolations) {
      fetchQualityViolations();
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
    
    const handleTagToggle = async (tagId) => {
      const isSelected = fileTags.some(ft => ft.tag_id === tagId);
      const encodedFileId = encodeURIComponent(fileId);
      if (isSelected) {
        // Remove tag
        await axios.delete(`/api/files/${encodedFileId}/tags/${tagId}`);
        await fetchFileTags();
      } else {
        // Add tag
        await axios.post(`/api/files/${encodedFileId}/tags`, { tag_id: tagId });
        await fetchFileTags();
      }
    };
    
    const handlePolicyToggle = async (policyId) => {
      const isSelected = policies.some(p => p.policy_id === policyId);
      const encodedFileId = encodeURIComponent(fileId);
      if (isSelected) {
        // Remove policy
        await axios.delete(`/api/files/${encodedFileId}/policies/${policyId}`);
        await fetchPolicies();
      } else {
        // Add policy
        await axios.post(`/api/files/${encodedFileId}/policies`, { policy_id: policyId });
        await fetchPolicies();
      }
    };
    
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
                    {headerValidation.issues.map((issue, index) => (
                      <div key={index} className={`issue-item ${issue.severity}`}>
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
            <div className="completeness-table-container">
              <table className="completeness-table">
                <thead>
                  <tr>
                    <th className="col-name">Name</th>
                    <th className="col-type">Type</th>
                    <th className="col-completeness-compact">Completeness</th>
                    <th className="col-tags">Tags</th>
                    <th className="col-policies">Policies</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map(column => {
                    const totalRows = file.row_count || basicInfo.rowCount || 100;
                    const nullCount = column.missing || 0;
                    const completeness = Math.round(((totalRows - nullCount) / totalRows) * 100);
                    
                    // Get column-level governance data
                    const columnGovernanceTags = allColumnGovernanceTags[column.name] || [];
                    const columnPoliciesData = allColumnPolicies[column.name] || [];
                    
                    // Check for anomalies
                    const nullPercentage = (nullCount / totalRows) * 100;
                    const hasHighNulls = nullPercentage > 10;
                    const hasMultiplePatterns = column.patterns && column.patterns.length > 1;
                    const hasAnomaly = hasHighNulls || hasMultiplePatterns;
                    
                    return (
                      <tr key={column.name} className={`completeness-row ${hasAnomaly ? 'row-with-anomaly' : ''}`}>
                        <td className="col-name">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span>{column.name}</span>
                            {hasHighNulls && (
                              <span className="anomaly-badge anomaly-warning" title={`${nullPercentage.toFixed(1)}% null values`}>
                                High Nulls
                              </span>
                            )}
                            {hasMultiplePatterns && (
                              <span className="anomaly-badge anomaly-warning" title={`${column.patterns.length} different patterns detected`}>
                                Multiple Patterns
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="col-type">{column.type}</td>
                        <td className="col-completeness-compact">
                          <div className="completeness-bar-container-compact">
                            <div className="completeness-bar-track-compact">
                              <div 
                                className="completeness-bar-fill" 
                                style={{ width: `${completeness}%` }}
                              ></div>
                            </div>
                            <span className="completeness-value-compact">
                              {formatDecimal(completeness, 1)}%
                            </span>
                          </div>
                        </td>
                        <td className="col-tags">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {columnGovernanceTags.length > 0 ? (
                              columnGovernanceTags.map(tagAssignment => (
                                <span key={tagAssignment.tag_id} className="tag-badge" style={{ 
                                  backgroundColor: tagAssignment.tag_color || '#3b82f6',
                                  color: 'white',
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '12px',
                                  fontWeight: '500'
                                }}>
                                  {tagAssignment.tag_name}
                                </span>
                              ))
                            ) : (
                              <span className="no-tag">—</span>
                            )}
                            <button 
                              className="btn-icon-small" 
                              onClick={async () => {
                                setSelectedColumn(column.name);
                                const tags = await fetchColumnGovernanceTags(column.name);
                                setCurrentColumnGovernanceTags(tags);
                                setShowColumnGovernanceTagModal(true);
                              }}
                              disabled={!canEditColumnGovernance(column.name)}
                              title={canEditColumnGovernance(column.name) ? "Edit column tags" : "You don't have permission to edit tags on this column"}
                            >
                              <FiEdit2 />
                            </button>
                          </div>
                        </td>
                        <td className="col-policies">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {columnPoliciesData.length > 0 ? (
                              <span className="policies-count">{columnPoliciesData.length} {columnPoliciesData.length === 1 ? 'policy' : 'policies'}</span>
                            ) : (
                              <span className="no-policy">—</span>
                            )}
                            <button 
                              className="btn-icon-small" 
                              onClick={async () => {
                                setSelectedColumn(column.name);
                                const colPolicies = await fetchColumnPolicies(column.name);
                                setCurrentColumnPolicies(colPolicies);
                                setShowColumnPolicyModal(true);
                              }}
                              disabled={!canEditColumnGovernance(column.name)}
                              title={canEditColumnGovernance(column.name) ? "Edit column policies" : "You don't have permission to edit policies on this column"}
                            >
                              <FiEdit2 />
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
    
    return (
      <div className="columns-tab">
        <Card title="Column Details">
          <table className="table">
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
              {columns.map((column) => {
                const nullCount = column.missing || 0;
                const missingPercentage = Math.round((nullCount / totalRows) * 100);
                const columnGovernanceTags = allColumnGovernanceTags[column.name] || [];
                
                // Format patterns for display
                const formatPatterns = (patterns) => {
                  if (!patterns || patterns.length === 0) return 'N/A';
                  if (shouldMaskValue(column)) return '****';
                  
                  // Show top 2 patterns with their percentages
                  const topPatterns = patterns.slice(0, 2);
                  return topPatterns.map(p => 
                    `${p.pattern} (${p.percentage}%)`
                  ).join(', ');
                };
                
                return (
                  <tr key={column.name}>
                    <td>{column.name}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        {columnGovernanceTags.length > 0 ? (
                          columnGovernanceTags.map(tag => (
                            <span 
                              key={tag.tag_id} 
                              className="tag-badge" 
                              style={{ 
                                backgroundColor: tag.tag_color || tag.color || '#3b82f6',
                                color: 'white',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: '500'
                              }}
                              title={tag.tag_name}
                            >
                              {tag.tag_name}
                            </span>
                          ))
                        ) : (
                          <span className="no-pii-indicator">—</span>
                        )}
                      </div>
                    </td>
                    <td>{column.type}</td>
                    <td className="pattern-cell">{formatPatterns(column.patterns)}</td>
                    <td>{column.unique !== undefined && column.unique !== null ? column.unique.toLocaleString() : '0'}</td>
                    <td>{`${nullCount.toLocaleString()} (${missingPercentage}%)`}</td>
                    <td>
                    {shouldMaskValue(column) ? '****' : 
                      hasMinMaxValues(column)
                        ? column.min_is_frequent 
                          ? `${formatMinMaxValue(column.min, column)} (occurs ${column.min_frequency || 1}x)` 
                          : formatMinMaxValue(column.min, column)
                        : column.least_frequent_value ? `${column.least_frequent_value} (occurs ${column.least_frequent_count || 1}x)` : 'N/A'}
                    </td>
                    <td>
                    {shouldMaskValue(column) ? '****' :
                      hasMinMaxValues(column)
                        ? column.max_is_frequent 
                          ? `${formatMinMaxValue(column.max, column)} (occurs ${column.max_frequency || 1}x)` 
                          : formatMinMaxValue(column.max, column)
                        : column.most_frequent_value ? `${column.most_frequent_value} (occurs ${column.most_frequent_count || 1}x)` : 'N/A'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    );
  };

  const renderDistributionTab = () => {
    if (!profile || !profile.columns) return null;
    
    const columns = profile.columns;
    const basicInfo = profile.basic_info || {};
    const totalRows = file.row_count || basicInfo.rowCount || 100;
    
    // Helper to check if column has anomalies
    const hasAnomalies = (column) => {
      const nullCount = column.missing || 0;
      const missingPercentage = (nullCount / totalRows) * 100;
      const hasHighNulls = missingPercentage > 10;
      const hasMultiplePatterns = column.patterns && column.patterns.length > 1;
      return hasHighNulls || hasMultiplePatterns;
    };
    
    // Helper to generate anomaly badges
    const getAnomalyBadges = (column) => {
      const badges = [];
      const nullCount = column.missing || 0;
      const missingPercentage = (nullCount / totalRows) * 100;
      
      if (missingPercentage > 10) {
        badges.push(
          <span key="nulls" className="anomaly-badge anomaly-warning" title={`${missingPercentage.toFixed(1)}% null values`}>
            High Nulls ({missingPercentage.toFixed(1)}%)
          </span>
        );
      }
      
      if (column.patterns && column.patterns.length > 1) {
        badges.push(
          <span key="patterns" className="anomaly-badge anomaly-warning" title={`${column.patterns.length} different patterns detected`}>
            Multiple Patterns ({column.patterns.length})
          </span>
        );
      }
      
      return badges;
    };
    
    return (
      <div className="distribution-tab">
        <div className="distribution-cards">
          {columns.map((column) => {
            const anomalyBadges = getAnomalyBadges(column);
            const columnGovernanceTags = allColumnGovernanceTags[column.name] || [];
            
            return (
              <Card 
                key={column.name} 
                className={hasAnomalies(column) ? 'card-with-anomaly' : ''}
              >
                <div className="distribution-card-header">
                  <h3>
                    <span>{column.name}</span>
                    {columnGovernanceTags.length > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
                        {columnGovernanceTags.map(tag => (
                          <span 
                            key={tag.tag_id} 
                            className="tag-badge" 
                            style={{ 
                              backgroundColor: tag.tag_color || tag.color || '#3b82f6',
                              color: 'white',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '500'
                            }}
                            title={tag.tag_name}
                          >
                            {tag.tag_name}
                          </span>
                        ))}
                      </span>
                    )}
                    {anomalyBadges}
                  </h3>
                </div>
                <div className="distribution-card-content">
                <div className="column-distribution">
                {/* NULL Values Section */}
                {(() => {
                  const nullCount = column.missing || 0;
                  const nullPercentage = ((nullCount / totalRows) * 100).toFixed(2);
                  const hasNulls = nullCount > 0;
                  const highNulls = parseFloat(nullPercentage) > 10;
                  
                  return (
                    <div className={`null-values-section ${highNulls ? 'null-warning' : hasNulls ? 'null-info' : ''}`}>
                      <div className="null-header">
                        <strong>NULL Values:</strong>
                        {highNulls && (
                          <span className="anomaly-badge anomaly-warning" style={{ marginLeft: '8px' }}>
                            High Nulls
                          </span>
                        )}
                      </div>
                      <div className="null-metrics-vertical">
                        <div className="null-metric-vertical">
                          <span className="null-label">Count</span>
                          <span className={`null-value ${hasNulls ? 'has-nulls' : ''}`}>
                            {nullCount.toLocaleString()}
                          </span>
                        </div>
                        <div className="null-metric-vertical">
                          <span className="null-label">Percentage</span>
                          <span className={`null-value ${hasNulls ? 'has-nulls' : ''}`}>
                            {nullPercentage}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div className="column-stats-table">
                  <div className="column-stat-row">
                    <div className="column-stat-label">Type:</div>
                    <div className="column-stat-value">{column.type || 'Unknown'}</div>
                  </div>
                  <div className="column-stat-row">
                    <div className="column-stat-label">Unique Values:</div>
                    <div className="column-stat-value">{column.unique !== undefined && column.unique !== null ? column.unique.toLocaleString() : '0'}</div>
                  </div>
                  {/* Show min/max for numeric and datetime types */}
                  {hasMinMaxValues(column) && (
                    <>
                      <div className="column-stat-row">
                        <div className="column-stat-label">Min:</div>
                        <div className="column-stat-value">
                          {shouldMaskValue(column) ? '****' :
                            column.min_is_frequent 
                              ? `${formatMinMaxValue(column.min, column)} (occurs ${column.min_frequency || 1}x)` 
                              : formatMinMaxValue(column.min, column)}
                        </div>
                      </div>
                      <div className="column-stat-row">
                        <div className="column-stat-label">Max:</div>
                        <div className="column-stat-value">
                          {shouldMaskValue(column) ? '****' :
                            column.max_is_frequent 
                              ? `${formatMinMaxValue(column.max, column)} (occurs ${column.max_frequency || 1}x)` 
                              : formatMinMaxValue(column.max, column)}
                        </div>
                      </div>
                    </>
                  )}
                  {/* For string/object types, show different stats */}
                  {(column.type === 'string' || column.type === 'object') && (
                    <>
                      <div className="column-stat-row">
                        <div className="column-stat-label">Most Frequent:</div>
                        <div className="column-stat-value">
                          {shouldMaskValue(column) ? '****' :
                            column.most_frequent_value ? `${column.most_frequent_value} (occurs ${column.most_frequent_count || 1}x)` : 'N/A'}
                        </div>
                      </div>
                      <div className="column-stat-row">
                        <div className="column-stat-label">Least Frequent:</div>
                        <div className="column-stat-value">
                          {shouldMaskValue(column) ? '****' :
                            column.least_frequent_value ? `${column.least_frequent_value} (occurs ${column.least_frequent_count || 1}x)` : 'N/A'}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="distribution-visualization">
                  {/* Pattern Detection */}
                  {column.patterns && column.patterns.length > 0 && (
                    <div className="pattern-section">
                      <div className="pattern-header">
                        <strong>Detected Patterns:</strong>
                        {column.patterns.length > 1 && (
                          <span className="anomaly-badge anomaly-warning" style={{ marginLeft: '8px' }}>
                            Multiple Patterns
                          </span>
                        )}
                      </div>
                      <div className="pattern-list">
                        {column.patterns.map((p, idx) => (
                          <div key={idx} className="pattern-item">
                            <code className="pattern-code">{p.pattern}</code>
                            <span className="pattern-count">
                              {p.count} occurrences ({p.percentage}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="histogram-container">
                    <div className="histogram-title">Value Distribution</div>
                    <div className="pseudo-histogram">
                      {hasMinMaxValues(column) ? (
                        // Simple min/max display for numeric/datetime data
                        <div className="numeric-summary">
                          <div className="min-max-display">
                            <div className="min-max-item">
                              <span className="label">Min:</span>
                              <span className="value">
                                {shouldMaskValue(column) ? '****' : formatMinMaxValue(column.min, column)}
                              </span>
                            </div>
                            <div className="min-max-item">
                              <span className="label">Max:</span>
                              <span className="value">
                                {shouldMaskValue(column) ? '****' : formatMinMaxValue(column.max, column)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        // Create a data-based distribution for categorical data based on top_values
                        <div className="categorical-distribution">
                          {(() => {
                            // Use actual top_values from profiling if available
                            if (column.top_values && column.top_values.length > 0) {
                              return column.top_values.map((item, index) => (
                                <div key={index} className="category-row">
                                  <div className="category-label">
                                    {shouldMaskValue(column) ? '****' : item.value}
                                  </div>
                                  <div className="category-bar-container">
                                    <div 
                                      className="category-bar" 
                                      style={{ 
                                        width: `${Math.max(5, Math.min(95, item.percentage))}%`,
                                        backgroundColor: `rgba(52, 152, 219, ${0.8 - (index * 0.05)})`
                                      }}
                                    ></div>
                                  </div>
                                  <div className="category-percentage">{`${item.percentage}%`}</div>
                                </div>
                              ));
                            }
                            
                            // Fallback if no top_values available
                            return (
                              <div className="empty-distribution">
                                <p>No distribution data available</p>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                    <div className="histogram-footer">
                      <div className="note">Based on actual data distribution</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </Card>
          );
          })}
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
    if (qualityLoading) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      );
    }

    if (!qualityViolations) {
      return (
        <div className="empty-state">
          <FiCheckCircle size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <p>Loading quality rule data...</p>
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

    // Check if no violations and no rules applied
    if (applied_rules.length === 0) {
      return (
        <div className="empty-state">
          <FiAlertTriangle size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <p>No quality rules configured</p>
          <p className="empty-state-hint">
            Configure quality rules in the Quality Rules page to validate your data
          </p>
        </div>
      );
    }

    // Check if all rules passed
    if (violations.length === 0) {
      return (
        <div className="quality-rules-tab">
          <div className="quality-summary">
            <Card>
              <div className="summary-stats">
                <div className="stat success">
                  <FiCheckCircle size={32} style={{ color: '#48bb78' }} />
                  <div className="stat-label">All Quality Rules Passed!</div>
                  <div className="stat-value">{summary.total_rules_applied} rules applied</div>
                </div>
              </div>
            </Card>
          </div>
          
          <Card>
            <h3 style={{ marginBottom: '1rem' }}>Applied Quality Rules</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rule Name</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {applied_rules.map((rule, idx) => (
                  <tr key={idx}>
                    <td>{rule.rule_name}</td>
                    <td>
                      <span className="badge badge-secondary">{rule.rule_type}</span>
                    </td>
                    <td>
                      <span className={`severity-badge severity-${rule.severity}`}>
                        {rule.severity}
                      </span>
                    </td>
                    <td>
                      <span className="status-badge status-success">
                        <FiCheckCircle /> Passed
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      );
    }

    return (
      <div className="quality-rules-tab">
        {/* Summary Cards */}
        <div className="quality-summary">
          <Card>
            <div className="summary-stats">
              <div className="stat">
                <div className="stat-label" style={{ fontSize: '0.75rem' }}>Total Rules Applied</div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{summary.total_rules_applied}</div>
              </div>
              <div className="stat success">
                <FiCheckCircle size={20} />
                <div className="stat-label" style={{ fontSize: '0.75rem' }}>Passed</div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{summary.rules_passed}</div>
              </div>
              <div className="stat error">
                <FiXCircle size={20} />
                <div className="stat-label" style={{ fontSize: '0.75rem' }}>Failed</div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{summary.rules_failed}</div>
              </div>
              <div className="stat">
                <div className="stat-label" style={{ fontSize: '0.75rem' }}>Total Violations</div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{summary.total_violations}</div>
              </div>
            </div>
          </Card>
          
          <Card>
            <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Violations by Severity</h4>
            <div className="severity-breakdown">
              <div className="severity-item critical">
                <FiAlertTriangle size={20} />
                <span className="severity-label">Critical</span>
                <span className="severity-count">{summary.violations_by_severity.critical}</span>
              </div>
              <div className="severity-item error">
                <FiXCircle size={20} />
                <span className="severity-label">Error</span>
                <span className="severity-count">{summary.violations_by_severity.error}</span>
              </div>
              <div className="severity-item warning">
                <FiAlertTriangle size={20} />
                <span className="severity-label">Warning</span>
                <span className="severity-count">{summary.violations_by_severity.warning}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <div className="quality-filters">
            <div className="filter-group">
              <label>Severity</label>
              <select 
                value={qualityFilter.severity} 
                onChange={(e) => setQualityFilter({...qualityFilter, severity: e.target.value})}
                className="filter-select"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="error">Error</option>
                <option value="warning">Warning</option>
              </select>
            </div>
            
            <div className="filter-group">
              <label>Rule Type</label>
              <select 
                value={qualityFilter.ruleType} 
                onChange={(e) => setQualityFilter({...qualityFilter, ruleType: e.target.value})}
                className="filter-select"
              >
                <option value="all">All Types</option>
                {uniqueRuleTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            
            {uniqueColumns.length > 0 && (
              <div className="filter-group">
                <label>Column</label>
                <select 
                  value={qualityFilter.column} 
                  onChange={(e) => setQualityFilter({...qualityFilter, column: e.target.value})}
                  className="filter-select"
                >
                  <option value="all">All Columns</option>
                  {uniqueColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="filter-results">
              Showing {filteredViolations.length} of {violations.length} violations
            </div>
          </div>
        </Card>

        {/* Violations Table */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Quality Rule Violations</h3>
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
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <FiDownload /> Export to Excel
              </button>
            )}
          </div>
          
          {filteredViolations.length === 0 ? (
            <div className="empty-state">
              <p>No violations match the selected filters</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table violations-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th style={{ fontSize: '0.75rem', fontWeight: '600' }}>Primary Key</th>
                    <th style={{ fontSize: '0.75rem', fontWeight: '600' }}>Rule Name</th>
                    <th style={{ fontSize: '0.75rem', fontWeight: '600' }}>Severity</th>
                    <th style={{ fontSize: '0.75rem', fontWeight: '600' }}>Column</th>
                    <th style={{ fontSize: '0.75rem', fontWeight: '600' }}>Expected</th>
                    <th style={{ fontSize: '0.75rem', fontWeight: '600' }}>Actual</th>
                    <th style={{ fontSize: '0.75rem', fontWeight: '600' }}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredViolations.map((violation, idx) => (
                    <tr key={idx}>
                      <td style={{ fontSize: '0.8rem' }}>
                        {violation.primary_key_value ? (
                          <div>
                            <code style={{ fontSize: '0.7rem' }}>{violation.primary_key_column}</code>
                            <div style={{ fontSize: '0.7rem', color: '#666' }}>{violation.primary_key_value}</div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.7rem', color: '#999' }}>Row {violation.row_number || 'N/A'}</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        <div className="rule-info">
                          <strong style={{ fontSize: '0.8rem' }}>{violation.rule_name}</strong>
                          {violation.rule_description && (
                            <div className="rule-description" style={{ fontSize: '0.7rem' }}>{violation.rule_description}</div>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        <span className={`severity-badge severity-${violation.severity}`} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}>
                          {violation.severity === 'critical' && <FiAlertTriangle size={12} />}
                          {violation.severity === 'error' && <FiXCircle size={12} />}
                          {violation.severity === 'warning' && <FiAlertTriangle size={12} />}
                          {violation.severity}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        <code style={{ fontSize: '0.7rem' }}>{violation.column_name || 'N/A'}</code>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        <span className="expected-value" style={{ fontSize: '0.75rem' }}>{violation.expected_value}</span>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        <span className="actual-value" style={{ fontSize: '0.75rem' }}>{violation.actual_value}</span>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        <span className="badge badge-secondary" style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}>{violation.rule_type}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
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

  const renderHistoryTab = () => {
    // Fetch history when tab is first accessed (only once)
    if (!historyFetched && !historyLoading) {
      fetchProfileHistory();
    }

    if (historyLoading) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      );
    }

    if (!profileHistory || !profileHistory.history || profileHistory.history.length === 0) {
      return (
        <div className="empty-state">
          <FiClock size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <p>No profile history available</p>
          <p className="empty-state-hint">
            Profile history is captured when files are processed through ETL transformations
          </p>
        </div>
      );
    }

    // Prepare data for quality metrics chart
    const history = profileHistory.history.sort((a, b) => 
      new Date(a.profile_timestamp) - new Date(b.profile_timestamp)
    );

    const chartData = {
      labels: history.map(h => formatDate(h.profile_timestamp)),
      datasets: [
        {
          label: 'Overall Quality',
          data: history.map(h => h.overall_quality_score || 0),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.4
        },
        {
          label: 'Completeness',
          data: history.map(h => h.completeness_score || 0),
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          tension: 0.4
        },
        {
          label: 'Consistency',
          data: history.map(h => h.consistency_score || 0),
          borderColor: 'rgb(255, 206, 86)',
          backgroundColor: 'rgba(255, 206, 86, 0.2)',
          tension: 0.4
        },
        {
          label: 'Validity',
          data: history.map(h => h.validity_score || 0),
          borderColor: 'rgb(153, 102, 255)',
          backgroundColor: 'rgba(153, 102, 255, 0.2)',
          tension: 0.4
        },
        {
          label: 'Uniqueness',
          data: history.map(h => h.uniqueness_score || 0),
          borderColor: 'rgb(255, 159, 64)',
          backgroundColor: 'rgba(255, 159, 64, 0.2)',
          tension: 0.4
        }
      ]
    };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: 'Data Quality Trends Over Time'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          title: {
            display: true,
            text: 'Score (%)'
          }
        }
      }
    };

    return (
      <div className="history-tab">
        <div className="history-summary">
          <Card>
            <div className="summary-stats">
              <div className="stat">
                <div className="stat-label">Total Snapshots</div>
                <div className="stat-value">{profileHistory.totalSnapshots}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Latest Profile</div>
                <div className="stat-value">
                  {history[history.length - 1]?.file_role === 'source' ? 'Source' : 
                   history[history.length - 1]?.file_role === 'target' ? 'Target' : 'Unknown'}
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">Last Updated</div>
                <div className="stat-value">{formatDate(history[history.length - 1]?.profile_timestamp)}</div>
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <h3>Quality Metrics Timeline</h3>
          <div style={{ height: '400px', marginTop: '20px' }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </Card>

        <Card style={{ marginTop: '20px' }}>
          <h3>Profile Snapshots</h3>
          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Role</th>
                  <th>Rows</th>
                  <th>Columns</th>
                  <th>Completeness</th>
                  <th>Consistency</th>
                  <th>Validity</th>
                  <th>Uniqueness</th>
                  <th>Overall Quality</th>
                </tr>
              </thead>
              <tbody>
                {history.map((snapshot, index) => (
                  <tr key={index}>
                    <td>{formatDate(snapshot.profile_timestamp)}</td>
                    <td>
                      <span className={`badge badge-${snapshot.file_role}`}>
                        {snapshot.file_role === 'source' ? 'Source' : 
                         snapshot.file_role === 'target' ? 'Target' : 'Ad-hoc'}
                      </span>
                    </td>
                    <td>{formatNumber(snapshot.row_count)}</td>
                    <td>{snapshot.column_count}</td>
                    <td>{snapshot.completeness_score ? `${snapshot.completeness_score.toFixed(1)}%` : 'N/A'}</td>
                    <td>{snapshot.consistency_score ? `${snapshot.consistency_score.toFixed(1)}%` : 'N/A'}</td>
                    <td>{snapshot.validity_score ? `${snapshot.validity_score.toFixed(1)}%` : 'N/A'}</td>
                    <td>{snapshot.uniqueness_score ? `${snapshot.uniqueness_score.toFixed(1)}%` : 'N/A'}</td>
                    <td>
                      <span className={`quality-badge quality-${
                        (snapshot.overall_quality_score || 0) >= 80 ? 'high' :
                        (snapshot.overall_quality_score || 0) >= 60 ? 'medium' : 'low'
                      }`}>
                        {snapshot.overall_quality_score ? `${snapshot.overall_quality_score.toFixed(1)}%` : 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
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
                  <span className="gps-badge gps-badge--primary" style={{ fontSize: '11px', padding: '6px 12px', fontWeight: '600' }}>
                    {file.file_type?.toUpperCase() || 'FILE'}
                  </span>
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
              className={`gps-tab ${activeTab === 'distribution' ? 'gps-tab--active' : ''}`}
              onClick={() => setActiveTab('distribution')}
            >
              Distribution
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
            <button 
              className={`gps-tab ${activeTab === 'quality-rules' ? 'gps-tab--active' : ''}`}
              onClick={() => setActiveTab('quality-rules')}
            >
              <FiCheckCircle style={{ marginRight: '6px' }} /> Quality Rules
            </button>
          </div>
          
          <div className="profile-content">
            {activeTab === 'attributes' && renderOverviewTab()}
            {activeTab === 'profile' && renderColumnsTab()}
            {activeTab === 'distribution' && renderDistributionTab()}
            {activeTab === 'schema-history' && <SchemaHistoryTab fileId={fileId} />}
            {activeTab === 'preview' && renderPreviewTab()}
            {activeTab === 'quality-rules' && renderQualityRulesTab()}
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
    </div>
  );
}

export default DataProfile;