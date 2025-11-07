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
import './DataProfile.css';
import axios from 'axios';
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

function SensitivityTagModal({ fileId, columnName, currentTag, onClose, onSave, setErrorMessage }) {
  const [sensitivityLevel, setSensitivityLevel] = useState(currentTag?.sensitivity_level || '');
  const [dataType, setDataType] = useState(currentTag?.data_type || '');
  const [saving, setSaving] = useState(false);

  const classificationLevels = [
    { value: 'Public', label: 'Public', color: 'blue', description: 'Data available to everyone' },
    { value: 'Internal', label: 'Internal', color: 'green', description: 'Data for internal use only' },
    { value: 'Confidential', label: 'Confidential', color: 'yellow', description: 'Sensitive business data' },
    { value: 'Restricted', label: 'Restricted', color: 'red', description: 'Highly sensitive data (PII/PHI/PCI)' },
    { value: 'PII', label: 'PII', color: 'purple', description: 'Personally Identifiable Information' }
  ];

  const handleSave = async () => {
    if (!sensitivityLevel) {
      setErrorMessage('Please select a sensitivity level');
      return;
    }

    try {
      setSaving(true);
      const encodedFileId = encodeURIComponent(fileId);
      await axios.post(`/api/files/${encodedFileId}/columns/${encodeURIComponent(columnName)}/sensitivity-tag`, {
        sensitivity_level: sensitivityLevel,
        data_type: dataType
      });
      onSave();
    } catch (err) {
      console.error('Error saving sensitivity tag:', err);
      setErrorMessage('Failed to save sensitivity tag');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentTag) return;

    if (!confirm('Are you sure you want to remove this sensitivity tag?')) {
      return;
    }

    try {
      setSaving(true);
      const encodedFileId = encodeURIComponent(fileId);
      await axios.delete(`/api/files/${encodedFileId}/columns/${encodeURIComponent(columnName)}/sensitivity-tag`);
      onSave();
    } catch (err) {
      console.error('Error deleting sensitivity tag:', err);
      setErrorMessage('Failed to delete sensitivity tag');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Classify Column: {columnName}</h2>
        
        <div className="form-group">
          <label>Classification Level</label>
          <div className="classification-options">
            {classificationLevels.map((level) => (
              <div
                key={level.value}
                className={`classification-option ${sensitivityLevel === level.value ? 'selected' : ''}`}
                onClick={() => setSensitivityLevel(level.value)}
              >
                <span className={`sensitivity-badge sensitivity-${level.value.toLowerCase()}`}>
                  {level.label}
                </span>
                <p className="option-description">{level.description}</p>
              </div>
            ))}
          </div>
        </div>
        
        <div className="form-group">
          <label>Data Type (optional)</label>
          <input
            type="text"
            value={dataType}
            onChange={(e) => setDataType(e.target.value)}
            placeholder="e.g., PII, PHI, PCI, Email, SSN"
          />
        </div>
        
        <div className="modal-actions">
          {currentTag && (
            <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
              Remove Tag
            </button>
          )}
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
      
      // Send the selected tag IDs to the backend
      await axios.post(
        `/api/files/${encodedFileId}/columns/${encodeURIComponent(columnName)}/tags`,
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
      
      // Send the selected policy IDs to the backend
      await axios.post(
        `/api/files/${encodedFileId}/columns/${encodeURIComponent(columnName)}/policies`,
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
  const [columnTags, setColumnTags] = useState([]);
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

  const fetchColumnTags = async () => {
    try {
      const encodedFileId = encodeURIComponent(fileId);
      const response = await axios.get(`/api/files/${encodedFileId}/columns/sensitivity-tags`);
      setColumnTags(response.data);
    } catch (err) {
      console.error('Error fetching column tags:', err);
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
      const response = await axios.get(`/api/files/${encodedFileId}/columns/${encodeURIComponent(columnName)}/sensitivity-tag`);
      // Return array format for consistency with frontend expectations
      return response.data ? [response.data] : [];
    } catch (err) {
      // 404 means no sensitivity tag for this column (expected for non-PII columns)
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
      const response = await axios.get(`/api/files/${encodedFileId}/columns/${encodeURIComponent(columnName)}/policies`);
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
        if (fileData.data_classification) {
          setFileSensitivity(fileData.data_classification);
        }
        
        // Fetch governance data
        await Promise.all([
          fetchOwnership(),
          fetchPolicies(),
          fetchColumnTags(),
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

  const renderOverviewTab = () => {
    if (!file || !profile) return null;
    
    // Get data from the updated API response format
    const basicInfo = profile.basic_info || {};
    const columns = profile.columns || [];
    
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
        <Card title="File Governance">
          <div className="file-governance-grid">
            <div className="governance-field">
              <label htmlFor="sensitivity">Sensitivity Level</label>
              <select 
                id="sensitivity"
                value={fileSensitivity}
                onChange={handleSensitivityChange}
                className="governance-select"
              >
                <option value="Public">Public</option>
                <option value="Internal">Internal</option>
                <option value="Confidential">Confidential</option>
                <option value="Restricted">Restricted</option>
              </select>
            </div>
          </div>
        </Card>
        
        {headerValidation && (
          <Card title="Header Validation">
            <div className="header-validation-container">
              <div className="header-validation-status">
                {getHeaderStatusIcon()}
                <div className="status-text">
                  <h4>
                    {headerValidation.status === 'healthy' ? 'Healthy' : 
                     headerValidation.status === 'warning' ? 'Warning' : 'Critical'}
                  </h4>
                  <p>
                    {headerValidation.issues_found === 0 
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
                  <h5>Issues Detected:</h5>
                  {headerValidation.issues.map((issue, index) => (
                    <div key={index} className={`issue-item ${issue.severity}`}>
                      <div className="issue-header">
                        <span className={`severity-badge ${issue.severity}`}>
                          {issue.severity === 'high' ? 'High' : 'Medium'}
                        </span>
                        <span className="issue-type">
                          {issue.issue_type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </div>
                      <div className="issue-message">{issue.message}</div>
                      {issue.recommendation && (
                        <div className="issue-recommendation">
                          <strong>Recommendation:</strong> {issue.recommendation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}
        
        <div className="file-stats-grid">
          <Card className="file-stat-card">
            <div className="stat-icon rows-icon">
              <FiFileText />
            </div>
            <div className="stat-details">
              <h3>{formatNumber(file.row_count || basicInfo.rowCount || 0)}</h3>
              <p>Rows</p>
            </div>
          </Card>
          
          <Card className="file-stat-card">
            <div className="stat-icon columns-icon">
              <FiBarChart2 />
            </div>
            <div className="stat-details">
              <h3>{file.column_count || columns.length || 0}</h3>
              <p>Columns</p>
            </div>
          </Card>
          
          <Card className="file-stat-card">
            <div className="stat-icon size-icon">
              <FiDownload />
            </div>
            <div className="stat-details">
              <h3>{basicInfo.file_size ? formatBytes(basicInfo.file_size) : (file.file_size ? formatBytes(file.file_size) : 'Unknown')}</h3>
              <p>File Size</p>
            </div>
          </Card>
          
          <Card className="file-stat-card">
            <div className="stat-icon age-icon">
              <FiCalendar />
            </div>
            <div className="stat-details">
              <h3>{getTimeSince(basicInfo.created_at || file.created_at)}</h3>
              <p>Age</p>
            </div>
          </Card>
          
          <Card className="file-stat-card">
            <div className="stat-icon duplicates-icon">
              <FiCopy />
            </div>
            <div className="stat-details">
              <h3>{formatNumber(file.duplicate_records_count || 0)}</h3>
              <p>Duplicate Records ({formatDecimal(file.duplicate_records_percentage || 0, 1)}%)</p>
            </div>
          </Card>
        </div>
        
        <Card title="Column Details">
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
            <div className="empty-state">
              <p>No completeness data available.</p>
            </div>
          )}
        </Card>
        
        <Card title="Data Freshness">
          <div className="freshness-stats">
            <div className="freshness-stat">
              <h3>Last Updated</h3>
              <p>{formatDate(basicInfo.updated_at || basicInfo.created_at || file.created_at)}</p>
            </div>
            
            <div className="freshness-stat">
              <h3>Created At</h3>
              <p>{formatDate(basicInfo.created_at || file.created_at)}</p>
            </div>
            
            <div className="freshness-stat">
              <h3>File Type</h3>
              <p>{basicInfo.file_type || file.file_type || 'Unknown'}</p>
            </div>
          </div>
        </Card>
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
                <th>PII</th>
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
                const columnTag = columnTags.find(tag => tag.column_name === column.name);
                const isPII = columnTag && columnTag.sensitivity_level === 'PII';
                
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
                      {isPII ? (
                        <span className="pii-badge" title="Contains Personally Identifiable Information">
                          PII
                        </span>
                      ) : (
                        <span className="no-pii-indicator">—</span>
                      )}
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
            
            return (
              <Card 
                key={column.name} 
                className={hasAnomalies(column) ? 'card-with-anomaly' : ''}
              >
                <div className="distribution-card-header">
                  <h3>
                    <span>{column.name}</span>
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
                      <div className="null-metrics">
                        <div className="null-metric">
                          <span className="null-label">Count:</span>
                          <span className={`null-value ${hasNulls ? 'has-nulls' : ''}`}>
                            {nullCount.toLocaleString()}
                          </span>
                        </div>
                        <div className="null-metric">
                          <span className="null-label">Percentage:</span>
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
    <div className="data-profile-container">
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="error-message">
          <p>{error}</p>
          <div className="error-actions">
            <Link to="/file-catalog" className="btn btn-secondary">
              <FiFileText className="btn-icon" /> Go to File Catalog
            </Link>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </div>
      ) : file ? (
        <>
          <div className="profile-header-three-line">
            <div className="header-line-1">
              <span className="file-icon">{file.file_type.toUpperCase()}</span>
              <h1>{file.filename}</h1>
            </div>
            <div className="header-line-2">
              <span className="header-property">
                <strong>Size:</strong> {file.file_size ? formatBytes(file.file_size) : 'Unknown'}
              </span>
              <span className="header-property">
                <strong>Uploaded:</strong> {getTimeSince(file.created_at)}
              </span>
              <span className="header-property">
                <strong>Encoding:</strong> {file.encoding || profile?.basic_info?.encoding || 'UTF-8'}
              </span>
              <span className="header-property">
                <strong>Format:</strong> {file.file_type || 'Unknown'}
              </span>
            </div>
            <div className="header-line-3">
              <span className="header-property">
                <FiUser className="icon-inline" />
                <strong>Creator:</strong> {ownership?.creator_name || ownership?.creator_email || 'Unknown'}
              </span>
              <span className="header-property">
                <FiUser className="icon-inline" />
                <strong>Owner:</strong> {ownership?.owner_name || ownership?.owner_email || 'Unassigned'}
                <button 
                  className="btn-icon-small" 
                  onClick={() => setShowOwnershipModal(true)}
                  disabled={!currentUser?.roles?.includes('Admin')}
                  title={currentUser?.roles?.includes('Admin') ? "Edit ownership" : "Only Admin can edit file ownership"}
                >
                  <FiEdit2 />
                </button>
              </span>
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
              currentTag={columnTags.find(tag => tag.column_name === selectedColumn)}
              onClose={() => {
                setShowTagModal(false);
                setSelectedColumn(null);
              }}
              onSave={async () => {
                await fetchColumnTags();
                setShowTagModal(false);
                setSelectedColumn(null);
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
          
          <div className="profile-tabs">
            <button 
              className={`tab-button ${activeTab === 'attributes' ? 'active' : ''}`}
              onClick={() => setActiveTab('attributes')}
            >
              File Attributes
            </button>
            <button 
              className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              File Profile
            </button>
            <button 
              className={`tab-button ${activeTab === 'distribution' ? 'active' : ''}`}
              onClick={() => setActiveTab('distribution')}
            >
              Distribution
            </button>
            <button 
              className={`tab-button ${activeTab === 'schema-history' ? 'active' : ''}`}
              onClick={() => setActiveTab('schema-history')}
            >
              <FiGitBranch className="tab-icon" /> Schema History
            </button>
            <button 
              className={`tab-button ${activeTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              <FiTable className="tab-icon" /> Preview
            </button>
          </div>
          
          <div className="profile-content">
            {activeTab === 'attributes' && renderOverviewTab()}
            {activeTab === 'profile' && renderColumnsTab()}
            {activeTab === 'distribution' && renderDistributionTab()}
            {activeTab === 'schema-history' && <SchemaHistoryTab fileId={fileId} />}
            {activeTab === 'preview' && renderPreviewTab()}
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