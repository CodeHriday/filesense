import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { FiUpload, FiEye, FiEyeOff, FiFolder } from 'react-icons/fi';
import Card from '../components/Card';
import FileDropzone from '../components/FileDropzone';
import DuplicateFileModal from '../components/DuplicateFileModal';
import StepProgress from '../components/StepProgress';
import BulkProfilingTab from '../components/BulkProfilingTab';
import { uploadFile, uploadFilesBatch, testApiConnection, checkDuplicateFile, deleteFile } from '../api/fileService';
import { getQualityRules } from '../api/qualityRulesService';
import { useAuth } from '../context/AuthContext';
import { isVendorUser } from '../utils/userHelpers';
import { matchesPattern } from '../utils/patternMatching';
import { API_BASE_URL } from '../config';
import axios from 'axios';
import './FileUpload.css';

// Map file type values to friendly display labels
const FILE_TYPE_LABELS = {
  'csv': 'CSV',
  'xlsx': 'Excel (XLSX)',
  'json': 'JSON',
  'xml': 'XML',
  'parquet': 'Parquet',
  'dat': 'Fixed Width (.dat)',
  'bin': 'Binary (.bin)',
  'bdat': 'Fixed Width Binary (.bdat)',
  'fixed_width': 'Fixed Width (.dat)',
  'binary': 'Binary (.bin)',
  'sas7bdat': 'SAS Dataset',
  'avro': 'Avro',
  'zip': 'ZIP Archive',
  '7z': '7z Archive',
  'tar': 'TAR Archive',
  'tar.gz': 'TAR.GZ Archive',
  'tar.bz2': 'TAR.BZ2 Archive'
};

const getFileTypeLabel = (fileType) => {
  if (!fileType) return '';
  return FILE_TYPE_LABELS[fileType] || fileType.toUpperCase();
};

function FileUpload() {
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [apiStatus, setApiStatus] = useState({ checked: false, status: null });
  const [diagnosticInfo, setDiagnosticInfo] = useState('');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateFileInfo, setDuplicateFileInfo] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingProgressHandler, setPendingProgressHandler] = useState(null);
  const [dropzoneKey, setDropzoneKey] = useState(0);
  const [activeTab, setActiveTab] = useState('upload-profile');
  const [dropLocationConfigured, setDropLocationConfigured] = useState(false);
  const [dropLocationChecking, setDropLocationChecking] = useState(true);
  const [showDropLocationModal, setShowDropLocationModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileOwner, setFileOwner] = useState('');
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [tempOwner, setTempOwner] = useState('');
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [subProjects, setSubProjects] = useState([]);
  const [selectedSubProject, setSelectedSubProject] = useState(null);
  const [loadingSubProjects, setLoadingSubProjects] = useState(false);
  const [batchUploadStatus, setBatchUploadStatus] = useState(null); // Track batch upload progress
  const [batchResults, setBatchResults] = useState(null); // Store batch upload results
  const pollingInterval = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { hasWritePermission, currentUser } = useAuth();
  
  const isAdmin = currentUser?.roles?.includes('Admin');
  
  // Vendor upload states
  const [vendorProjects, setVendorProjects] = useState([]);
  const [selectedVendorProject, setSelectedVendorProject] = useState(null);
  const [vendorConnections, setVendorConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [loadingVendorProjects, setLoadingVendorProjects] = useState(false);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [browseFolders, setBrowseFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [browsePrefix, setBrowsePrefix] = useState('');
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  
  // Quality rules states
  const [availableQualityRules, setAvailableQualityRules] = useState([]);
  const [selectedQualityRules, setSelectedQualityRules] = useState([]);
  const [loadingQualityRules, setLoadingQualityRules] = useState(false);
  
  // Upload type and contract validation states
  const [uploadType, setUploadType] = useState('adhoc'); // 'adhoc' or 'contract'
  const [vendorAgreements, setVendorAgreements] = useState([]);
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [selectedAgreementSchema, setSelectedAgreementSchema] = useState(null);
  const [loadingAgreements, setLoadingAgreements] = useState(false);
  
  // Multi-file pattern states for contract validation
  const [agreementFilePatterns, setAgreementFilePatterns] = useState([]); // All patterns from selected agreement
  const [selectedFilePattern, setSelectedFilePattern] = useState(null); // User-selected or auto-matched pattern
  const [autoMatchedPattern, setAutoMatchedPattern] = useState(null); // Auto-matched pattern based on filename
  
  // Owner dropdown states
  const [availableOwners, setAvailableOwners] = useState([]);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [filenameValidationError, setFilenameValidationError] = useState(null);
  const [validationError, setValidationError] = useState(null); // Unified contract validation error state
  
  // Delimiter/File type configuration states
  const [delimiterType, setDelimiterType] = useState('none'); // 'comma', 'pipe', 'tab', 'semicolon', 'custom', 'none', 'dat', 'bin', 'bdat'
  const [customDelimiter, setCustomDelimiter] = useState(''); // For multi-character delimiters like '~^'
  
  // Fixed-width file types that require schema definition
  // Include legacy values for backwards compatibility with existing data
  const FIXED_WIDTH_TYPES = ['dat', 'bin', 'bdat', 'fixed_width', 'binary'];
  const isFixedWidthType = (type) => FIXED_WIDTH_TYPES.includes(type);
  
  // Header configuration states
  const [hasHeader, setHasHeader] = useState(true); // Whether file has a header row
  const [columnNames, setColumnNames] = useState(''); // Comma-separated column names for files without headers
  
  // Fixed-width schema configuration
  const [fixedWidthSchema, setFixedWidthSchema] = useState([
    { name: '', width: '', type: 'string' }
  ]); // Array of {name: string, width: number, type: string} for fixed-width files
  
  // Supported binary column types for fixed-width files
  const binaryColumnTypes = [
    { value: 'string', label: 'String (text)', description: 'Null-padded text' },
    { value: 'uint8', label: 'UInt8 (1 byte)', description: 'Unsigned 0-255' },
    { value: 'uint16', label: 'UInt16 (2 bytes)', description: 'Unsigned 0-65535' },
    { value: 'uint32', label: 'UInt32 (4 bytes)', description: 'Unsigned integer' },
    { value: 'int8', label: 'Int8 (1 byte)', description: 'Signed -128 to 127' },
    { value: 'int16', label: 'Int16 (2 bytes)', description: 'Signed short' },
    { value: 'int32', label: 'Int32 (4 bytes)', description: 'Signed integer' },
    { value: 'float32', label: 'Float32 (4 bytes)', description: 'Single precision' },
    { value: 'float64', label: 'Float64 (8 bytes)', description: 'Double precision' }
  ];
  
  // Archive password configuration (for password-protected archives)
  const [archivePassword, setArchivePassword] = useState('');
  const [showArchivePassword, setShowArchivePassword] = useState(false);
  
  // Fixed-width schema file upload states
  const [schemaUploadError, setSchemaUploadError] = useState('');
  const [schemaUploadSuccess, setSchemaUploadSuccess] = useState('');
  
  // Apply configuration from a contract pattern to the upload form
  const applyPatternConfig = (pattern) => {
    if (!pattern) return;
    
    // Map file_type to delimiterType
    if (pattern.file_type) {
      const fileType = pattern.file_type;
      
      // Fixed-width types map directly to delimiterType
      if (isFixedWidthType(fileType)) {
        setDelimiterType(fileType);
        setHasHeader(false); // Fixed-width files don't have headers
      } else {
        // Map file types to delimiter types
        const delimiterMapping = {
          'csv': 'comma',
          'comma': 'comma',
          'pipe': 'pipe',
          'tab': 'tab',
          'semicolon': 'semicolon',
          'custom': 'custom',
          // Non-delimited types use auto-detect
          'json': 'none',
          'xml': 'none',
          'xlsx': 'none',
          'parquet': 'none',
          'avro': 'none',
          'sas7bdat': 'none',
          'zip': 'none',
          '7z': 'none',
          'tar': 'none',
          'tar.gz': 'none',
          'tar.bz2': 'none'
        };
        
        const mappedDelimiter = delimiterMapping[fileType] || 'none';
        setDelimiterType(mappedDelimiter);
        
        // Apply has_header from pattern (if explicitly set)
        if (pattern.has_header !== undefined) {
          setHasHeader(pattern.has_header);
        } else {
          setHasHeader(true); // Default to true for delimited files
        }
        
        // Apply custom delimiter if file type is 'custom' and pattern has a delimiter value
        if (fileType === 'custom' && pattern.delimiter) {
          setCustomDelimiter(pattern.delimiter);
        }
      }
    }
    
    // Apply archive password if configured (passwords are fetched separately for security)
    // Don't clear archive password if pattern doesn't have one - user may have entered it manually
    if (pattern.has_archive_password && !archivePassword) {
      // Pattern expects a password but none entered - could show a hint
      // The actual password is encrypted and not sent from server for security
    }
    
    // Apply fixed-width schema from pattern
    if (isFixedWidthType(pattern.file_type) && pattern.schema) {
      try {
        const schemaFields = Array.isArray(pattern.schema) ? pattern.schema : pattern.schema.fields;
        if (schemaFields && schemaFields.length > 0) {
          const columns = schemaFields.map(field => ({
            name: field.name || '',
            width: field.width ? String(field.width) : '',
            type: field.type || 'string'
          }));
          setFixedWidthSchema(columns.length > 0 ? columns : [{ name: '', width: '', type: 'string' }]);
        }
      } catch (e) {
        console.error('Error parsing pattern schema:', e);
      }
    }
  };
  
  // Auto-match file pattern when file is selected (contract validation mode)
  const autoMatchFilePattern = (filename) => {
    if (!filename || agreementFilePatterns.length === 0) {
      return null;
    }
    
    // Find first matching pattern (patterns are already sorted by priority)
    for (const pattern of agreementFilePatterns) {
      if (matchesPattern(filename, pattern.file_name_pattern)) {
        setAutoMatchedPattern(pattern.id);
        setSelectedFilePattern(pattern.id);
        setSelectedAgreementSchema(pattern);
        
        // Auto-populate quality rules from matched pattern
        if (pattern.quality_rule_ids && Array.isArray(pattern.quality_rule_ids)) {
          setSelectedQualityRules(pattern.quality_rule_ids);
        }
        
        // Auto-populate upload configuration from matched pattern
        applyPatternConfig(pattern);
        
        return pattern;
      }
    }
    
    // No match found - reset all pattern-related state to prevent using stale selections
    setAutoMatchedPattern(null);
    setSelectedFilePattern(null);
    setSelectedAgreementSchema(null);
    setSelectedQualityRules([]);
    return null;
  };
  
  // Set initial tab based on route or user type
  useEffect(() => {
    if (location.pathname === '/drop') {
      setActiveTab('drop-file');
    } else if (currentUser && isVendorUser(currentUser)) {
      setActiveTab('drop-file');
    }
  }, [location.pathname, currentUser]);
  
  useEffect(() => {
    if (currentUser?.email) {
      setFileOwner(currentUser.email);
    }
  }, [currentUser]);
  
  // Fetch projects on mount
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setLoadingProjects(false);
          return;
        }
        
        const response = await axios.get(`${API_BASE_URL}/api/projects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setProjects(response.data);
        
        // Check if project_id is in URL parameters
        const projectIdFromUrl = searchParams.get('project_id');
        
        if (projectIdFromUrl) {
          // Auto-select the project from URL parameter
          const projectId = parseInt(projectIdFromUrl);
          const projectExists = response.data.find(p => p.id === projectId);
          if (projectExists) {
            setSelectedProject(projectId);
          } else {
            // Fallback to default if project not found
            const defaultProject = response.data.find(p => p.name === 'Default Project' || p.is_default);
            if (defaultProject) {
              setSelectedProject(defaultProject.id);
            }
          }
        } else {
          // Find and select Default Project by default
          const defaultProject = response.data.find(p => p.name === 'Default Project' || p.is_default);
          if (defaultProject) {
            setSelectedProject(defaultProject.id);
          }
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        setLoadingProjects(false);
      }
    };
    
    fetchProjects();
  }, [searchParams]);
  
  // Fetch sub-projects when project is selected
  useEffect(() => {
    const fetchSubProjects = async () => {
      if (!selectedProject) {
        setSubProjects([]);
        setSelectedSubProject(null);
        return;
      }
      
      try {
        setLoadingSubProjects(true);
        const token = localStorage.getItem('token');
        if (!token) return;
        
        const response = await axios.get(`${API_BASE_URL}/api/projects/${selectedProject}/sub-projects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setSubProjects(response.data.subProjects || []);
        
        // Check if sub_project_id is in URL parameters
        const subProjectIdFromUrl = searchParams.get('sub_project_id');
        if (subProjectIdFromUrl) {
          const subProjectId = parseInt(subProjectIdFromUrl);
          const subProjectExists = response.data.subProjects?.find(sp => sp.id === subProjectId);
          if (subProjectExists) {
            setSelectedSubProject(subProjectId);
          } else {
            setSelectedSubProject(null);
          }
        } else {
          setSelectedSubProject(null); // Reset sub-project selection when project changes
        }
      } catch (error) {
        console.error('Error fetching sub-projects:', error);
        setSubProjects([]);
      } finally {
        setLoadingSubProjects(false);
      }
    };
    
    fetchSubProjects();
  }, [selectedProject, searchParams]);
  
  // Fetch quality rules when project is selected
  useEffect(() => {
    const fetchQualityRules = async () => {
      if (!selectedProject) {
        setAvailableQualityRules([]);
        return;
      }
      
      try {
        setLoadingQualityRules(true);
        const response = await getQualityRules({ project_id: selectedProject, enabled: true });
        setAvailableQualityRules(response.rules || []);
      } catch (error) {
        console.error('Error fetching quality rules:', error);
        setAvailableQualityRules([]);
      } finally {
        setLoadingQualityRules(false);
      }
    };
    
    fetchQualityRules();
  }, [selectedProject]);
  
  // Fetch vendor agreements when project is selected and upload type is 'contract'
  useEffect(() => {
    const fetchVendorAgreements = async () => {
      if (!selectedProject || uploadType !== 'contract') {
        setVendorAgreements([]);
        setSelectedAgreement(null);
        setSelectedAgreementSchema(null);
        return;
      }
      
      try {
        setLoadingAgreements(true);
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `${API_BASE_URL}/api/projects/${selectedProject}/vendor-agreements-with-schemas`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setVendorAgreements(response.data.agreements || []);
      } catch (error) {
        console.error('Error fetching vendor agreements:', error);
        setVendorAgreements([]);
      } finally {
        setLoadingAgreements(false);
      }
    };
    
    fetchVendorAgreements();
  }, [selectedProject, uploadType]);
  
  // Load all file patterns when agreement is selected
  useEffect(() => {
    if (!selectedAgreement) {
      setSelectedAgreementSchema(null);
      setAgreementFilePatterns([]);
      setSelectedFilePattern(null);
      setAutoMatchedPattern(null);
      return;
    }
    
    const agreement = vendorAgreements.find(a => a.id === parseInt(selectedAgreement));
    if (agreement && agreement.fileSchemas && agreement.fileSchemas.length > 0) {
      // Store all file patterns from the agreement
      setAgreementFilePatterns(agreement.fileSchemas);
      
      // Reset selection to null - user must choose pattern manually
      setSelectedFilePattern(null);
      setSelectedAgreementSchema(null);
      setSelectedQualityRules([]);
      setAutoMatchedPattern(null);
    }
  }, [selectedAgreement, vendorAgreements]);
  
  // Fetch available owners based on context
  useEffect(() => {
    const fetchAvailableOwners = async () => {
      try {
        setLoadingOwners(true);
        const token = localStorage.getItem('token');
        
        if (!token) {
          setAvailableOwners([]);
          return;
        }
        
        let owners = [];
        
        // For vendor users, show their agreement's primary and secondary contacts
        if (currentUser && isVendorUser(currentUser)) {
          if (selectedConnection) {
            try {
              const response = await axios.get(
                `${API_BASE_URL}/api/vendor-access/connections/${selectedConnection}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              
              const connection = response.data;
              if (connection.primary_contact_email) {
                owners.push({ email: connection.primary_contact_email, label: `${connection.primary_contact_email} (Primary)` });
              }
              if (connection.secondary_contact_email) {
                owners.push({ email: connection.secondary_contact_email, label: `${connection.secondary_contact_email} (Secondary)` });
              }
            } catch (error) {
              console.error('Error fetching connection contacts:', error);
            }
          }
        } 
        // For internal users with contract validation, show agreement contacts
        else if (uploadType === 'contract' && selectedAgreement) {
          const agreement = vendorAgreements.find(a => a.id === parseInt(selectedAgreement));
          if (agreement) {
            if (agreement.primary_contact_email) {
              owners.push({ email: agreement.primary_contact_email, label: `${agreement.primary_contact_email} (Primary)` });
            }
            if (agreement.secondary_contact_email) {
              owners.push({ email: agreement.secondary_contact_email, label: `${agreement.secondary_contact_email} (Secondary)` });
            }
          }
        }
        // For internal users with ad-hoc upload, show project members
        else if (selectedProject) {
          try {
            const response = await axios.get(
              `${API_BASE_URL}/api/projects/${selectedProject}/members`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            
            owners = response.data.members.map(member => ({
              email: member.email,
              label: member.full_name ? `${member.full_name} (${member.email})` : member.email
            }));
          } catch (error) {
            console.error('Error fetching project members:', error);
          }
        }
        
        setAvailableOwners(owners);
        
        // Auto-select current user if they're in the list
        if (currentUser?.email && owners.some(o => o.email === currentUser.email)) {
          setFileOwner(currentUser.email);
        } else if (owners.length > 0) {
          setFileOwner(owners[0].email);
        }
      } catch (error) {
        console.error('Error fetching available owners:', error);
        setAvailableOwners([]);
      } finally {
        setLoadingOwners(false);
      }
    };
    
    fetchAvailableOwners();
  }, [selectedProject, uploadType, selectedAgreement, vendorAgreements, selectedConnection, currentUser]);
  
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, []);
  
  // Test API connection when component mounts
  useEffect(() => {
    const checkApiStatus = async () => {
      try {
        const result = await testApiConnection();
        setApiStatus({ 
          checked: true, 
          status: result.status === 'ok' ? 'connected' : 'error',
          details: result 
        });
        setDiagnosticInfo(prev => prev + `\nAPI health check: ${JSON.stringify(result, null, 2)}`);
      } catch (err) {
        setApiStatus({ checked: true, status: 'error', error: err.message });
        setDiagnosticInfo(prev => prev + `\nAPI health check error: ${err.message}`);
      }
    };
    
    checkApiStatus();
    checkDropLocationConfig();
  }, []);
  
  const checkDropLocationConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token || !isAdmin) {
        setDropLocationChecking(false);
        return;
      }
      
      const response = await axios.get(`${API_BASE_URL}/api/drop-location/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setDropLocationConfigured(response.data.configured);
    } catch (err) {
      console.error('Error checking drop location:', err);
      setDropLocationConfigured(false);
    } finally {
      setDropLocationChecking(false);
    }
  };
  
  // Helper function to get the actual delimiter value
  const getDelimiterValue = () => {
    if (delimiterType === 'none' || isFixedWidthType(delimiterType)) {
      return null; // No delimiter specified - let backend auto-detect or use fixed-width
    }
    
    if (delimiterType === 'custom') {
      return customDelimiter || ','; // Default to comma if custom is empty
    }
    
    const delimiterMap = {
      'comma': ',',
      'pipe': '|',
      'tab': '\t',
      'semicolon': ';'
    };
    
    return delimiterMap[delimiterType] || ',';
  };
  
  // Helper function to build header configuration object
  const getHeaderConfig = () => {
    // Fixed-width files define headers in their schema, not separately
    if (isFixedWidthType(delimiterType)) {
      return null;
    }
    
    if (hasHeader) {
      return null; // File has headers - no config needed
    }
    
    // File has no headers - parse column names
    const names = columnNames
      .split(',')
      .map(name => name.trim())
      .filter(name => name.length > 0);
    
    if (names.length === 0) {
      return null; // No column names provided
    }
    
    return {
      hasHeader: false,
      columnNames: names
    };
  };
  
  // Helper function to build fixed-width schema object
  const getFixedWidthSchema = () => {
    if (!isFixedWidthType(delimiterType)) {
      return null; // Not a fixed-width file
    }
    
    // Filter out empty rows and parse widths as integers
    const columns = fixedWidthSchema
      .filter(col => col.name.trim() && (col.width || col.type !== 'string'))
      .map(col => ({
        name: col.name.trim(),
        width: parseInt(col.width, 10) || 0,
        type: col.type || 'string'
      }));
    
    if (columns.length === 0) {
      return null; // No valid columns defined
    }
    
    return {
      columns
    };
  };
  
  // Handle fixed-width schema file upload (JSON or CSV)
  const handleSchemaFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Clear previous messages
    setSchemaUploadError('');
    setSchemaUploadSuccess('');
    
    const fileName = file.name.toLowerCase();
    const isJSON = fileName.endsWith('.json');
    const isCSV = fileName.endsWith('.csv');
    
    if (!isJSON && !isCSV) {
      setSchemaUploadError('Please upload a .json or .csv file');
      return;
    }
    
    try {
      const text = await file.text();
      
      if (isJSON) {
        // Parse JSON schema
        const data = JSON.parse(text);
        
        // Validate structure - expect { columns: [{name, width}, ...] } or [{name, width}, ...]
        let columns = Array.isArray(data) ? data : data.columns;
        
        if (!Array.isArray(columns) || columns.length === 0) {
          setSchemaUploadError('Invalid JSON format. Expected array of columns with "name" and "width" fields');
          return;
        }
        
        // Validate each column
        const validatedColumns = [];
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i];
          if (!col.name || typeof col.name !== 'string') {
            setSchemaUploadError(`Column ${i + 1}: missing or invalid "name" field`);
            return;
          }
          if (!col.width) {
            setSchemaUploadError(`Column ${i + 1}: missing "width" field`);
            return;
          }
          
          // Strict validation: width must be a positive integer (no decimals, no extra characters)
          const widthStr = String(col.width).trim();
          if (!/^\d+$/.test(widthStr)) {
            setSchemaUploadError(`Column ${i + 1}: width must be a positive integer (got: "${widthStr}")`);
            return;
          }
          const width = parseInt(widthStr, 10);
          if (width <= 0) {
            setSchemaUploadError(`Column ${i + 1}: width must be greater than 0`);
            return;
          }
          validatedColumns.push({ name: col.name.trim(), width: width.toString() });
        }
        
        setFixedWidthSchema(validatedColumns);
        setSchemaUploadSuccess(`Successfully loaded ${validatedColumns.length} columns from JSON file`);
        
      } else if (isCSV) {
        // Parse CSV schema
        const lines = text.trim().split('\n');
        if (lines.length < 2) {
          setSchemaUploadError('CSV file must contain a header row and at least one data row');
          return;
        }
        
        // Parse header
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIndex = headers.indexOf('name');
        const widthIndex = headers.indexOf('width');
        
        if (nameIndex === -1 || widthIndex === -1) {
          setSchemaUploadError('CSV must have "name" and "width" columns in the header row');
          return;
        }
        
        // Parse data rows
        const validatedColumns = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue; // Skip empty lines
          
          const values = line.split(',').map(v => v.trim());
          const name = values[nameIndex];
          const width = values[widthIndex];
          
          if (!name) {
            setSchemaUploadError(`Row ${i + 1}: missing column name`);
            return;
          }
          if (!width) {
            setSchemaUploadError(`Row ${i + 1}: missing width`);
            return;
          }
          
          // Strict validation: width must be a positive integer (no decimals, no extra characters)
          if (!/^\d+$/.test(width)) {
            setSchemaUploadError(`Row ${i + 1}: width must be a positive integer (got: "${width}")`);
            return;
          }
          const widthNum = parseInt(width, 10);
          if (widthNum <= 0) {
            setSchemaUploadError(`Row ${i + 1}: width must be greater than 0`);
            return;
          }
          validatedColumns.push({ name: name, width: widthNum.toString() });
        }
        
        if (validatedColumns.length === 0) {
          setSchemaUploadError('No valid columns found in CSV file');
          return;
        }
        
        setFixedWidthSchema(validatedColumns);
        setSchemaUploadSuccess(`Successfully loaded ${validatedColumns.length} columns from CSV file`);
      }
      
      // Clear the file input so the same file can be uploaded again
      event.target.value = '';
      
    } catch (error) {
      console.error('Error parsing schema file:', error);
      if (isJSON) {
        setSchemaUploadError(`Failed to parse JSON file: ${error.message}`);
      } else {
        setSchemaUploadError(`Failed to parse CSV file: ${error.message}`);
      }
    }
  };
  
  // Download JSON template
  const downloadJSONTemplate = () => {
    const template = {
      columns: [
        { name: 'ID', width: 5 },
        { name: 'Name', width: 20 },
        { name: 'Age', width: 3 }
      ]
    };
    
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fixed-width-schema-template.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  // Download CSV template
  const downloadCSVTemplate = () => {
    const csvContent = 'name,width\nID,5\nName,20\nAge,3';
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fixed-width-schema-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  // Load vendor projects (or all projects for admins)
  const loadVendorProjects = async () => {
    setLoadingVendorProjects(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setDiagnosticInfo(prev => prev + 'No authentication token found\n');
        return;
      }
      
      // Admins get all projects, vendors get their authorized projects
      const endpoint = isAdmin 
        ? `${API_BASE_URL}/api/projects`
        : `${API_BASE_URL}/api/vendor-access/projects`;
      
      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Handle different response structures
      const projects = isAdmin ? response.data : (response.data.projects || []);
      setVendorProjects(projects);
      setDiagnosticInfo(prev => prev + `Loaded ${projects.length} project(s)\n`);
    } catch (error) {
      console.error('Error loading vendor projects:', error);
      setDiagnosticInfo(prev => prev + `Error loading projects: ${error.message}\n`);
      setVendorProjects([]);
    } finally {
      setLoadingVendorProjects(false);
    }
  };
  
  // Load connections for selected project (vendor-specific or all for admins)
  const loadVendorConnections = async (projectId) => {
    setLoadingConnections(true);
    setSelectedConnection(null);
    setBrowseFolders([]);
    setSelectedFolder('');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setDiagnosticInfo(prev => prev + 'No authentication token found\n');
        return;
      }
      
      // Admins get all connections for project, vendors get their authorized connections
      const endpoint = isAdmin
        ? `${API_BASE_URL}/api/connections?projectId=${projectId}`
        : `${API_BASE_URL}/api/vendor-access/connections?projectId=${projectId}`;
      
      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Handle different response structures
      const connections = isAdmin ? response.data : (response.data.connections || []);
      console.log('Loaded connections for FileUpload:', connections);
      if (connections.length > 0) {
        console.log('First connection structure:', connections[0]);
      }
      setVendorConnections(connections);
      setDiagnosticInfo(prev => prev + `Loaded ${connections.length} connection(s) for project\n`);
    } catch (error) {
      console.error('Error loading vendor connections:', error);
      setDiagnosticInfo(prev => prev + `Error loading connections: ${error.message}\n`);
      setVendorConnections([]);
    } finally {
      setLoadingConnections(false);
    }
  };
  
  // Browse folders in connection
  const browseFoldersInConnection = async (connectionId, prefix = '') => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setDiagnosticInfo(prev => prev + 'No authentication token found\n');
        return;
      }
      
      const response = await axios.post(
        `${API_BASE_URL}/api/connections/${connectionId}/browse`,
        { prefix },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setBrowseFolders(response.data.items || []);
      setBrowsePrefix(prefix);
      setDiagnosticInfo(prev => prev + `Found ${response.data.items?.length || 0} items in ${prefix || 'root'}\n`);
    } catch (error) {
      console.error('Error browsing folders:', error);
      setDiagnosticInfo(prev => prev + `Error browsing folders: ${error.message}\n`);
      setBrowseFolders([]);
    }
  };
  
  const pollProcessingStatus = async (fileId) => {
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const response = await axios.get(`${API_BASE_URL}/api/files/${fileId}/status`, {
        headers
      });
      
      const { step, isComplete } = response.data;
      
      if (step) {
        setCurrentStep(step);
      }
      
      if (isComplete) {
        // Stop polling
        if (pollingInterval.current) {
          clearInterval(pollingInterval.current);
          pollingInterval.current = null;
        }
        
        setIsProcessing(false);
        
        // Redirect to profile page after a short delay
        setTimeout(() => {
          navigate(`/profile/${encodeURIComponent(fileId)}?t=${Date.now()}`);
        }, 1500);
      }
    } catch (error) {
      console.error('Error polling processing status:', error);
    }
  };
  
  const startPolling = (fileId) => {
    // Clear any existing polling
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
    }
    
    // Poll every 500ms for real-time updates
    pollingInterval.current = setInterval(() => {
      pollProcessingStatus(fileId);
    }, 500);
    
    // Also poll immediately
    pollProcessingStatus(fileId);
  };
  
  const handleTestConnection = async () => {
    setDiagnosticInfo('Running API connection test...\n');
    try {
      const result = await testApiConnection();
      setDiagnosticInfo(prev => prev + `API connection test result: ${JSON.stringify(result, null, 2)}\n`);
      setApiStatus({ 
        checked: true, 
        status: result.status === 'ok' ? 'connected' : 'error',
        details: result 
      });
    } catch (err) {
      setDiagnosticInfo(prev => prev + `API connection test error: ${err.message}\n`);
      setApiStatus({ checked: true, status: 'error', error: err.message });
    }
  };
  
  const handleDirectUpload = async () => {
    setDiagnosticInfo('Attempting direct file upload...\n');
    try {
      // Create a blob from test data
      const csvData = 'id,name,email\n1,Test User,test@example.com';
      const blob = new Blob([csvData], { type: 'text/csv' });
      const testFile = new File([blob], 'test-upload.csv', { type: 'text/csv' });
      
      setDiagnosticInfo(prev => prev + `Created test file: ${testFile.name} (${testFile.size} bytes)\n`);
      setUploadStatus('uploading');
      
      // Manually create FormData
      const formData = new FormData();
      formData.append('files', testFile);
      
      setDiagnosticInfo(prev => prev + 'Sending direct axios request...\n');
      
      // Send direct request without using uploadFile function
      const response = await axios.post('/api/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        }
      });
      
      setDiagnosticInfo(prev => prev + `Upload response: ${JSON.stringify(response.data, null, 2)}\n`);
      setUploadStatus('success');
      
    } catch (err) {
      setDiagnosticInfo(prev => prev + `Direct upload error: ${err.message}\n`);
      if (err.response) {
        setDiagnosticInfo(prev => prev + `Error response: ${JSON.stringify(err.response.data, null, 2)}\n`);
      }
      setUploadStatus('error');
    }
  };
  
  const handleFileDrop = async (file, progressHandler) => {
    try {
      setDiagnosticInfo(`Checking for duplicate file: ${file.name}...\n`);
      setUploadStatus('checking');
      
      // Auto-match file pattern in contract validation mode
      if (uploadType === 'contract' && agreementFilePatterns.length > 0) {
        const matchedPattern = autoMatchFilePattern(file.name);
        if (!matchedPattern) {
          setDiagnosticInfo(prev => prev + `⚠️ Warning: File "${file.name}" does not match any expected patterns from the selected agreement.\n`);
          // User can still proceed, but show a warning
        } else {
          setDiagnosticInfo(prev => prev + `✓ Matched pattern: ${matchedPattern.file_name_pattern}\n`);
        }
      }
      
      // Check for duplicate file first (scoped to selected project)
      const duplicateCheck = await checkDuplicateFile(file, selectedProject);
      
      // Capture fileHash from duplicate check to avoid redundant hashing
      const fileHash = duplicateCheck.fileHash;
      
      if (duplicateCheck.isDuplicate) {
        // Show duplicate modal - preserve hash for later use
        setDuplicateFileInfo({
          ...duplicateCheck.existingFile,
          fileHash: fileHash  // Store hash so it can be reused in replace/keep-both flows
        });
        setPendingFile(file);
        setPendingProgressHandler(() => progressHandler);
        setShowDuplicateModal(true);
        setUploadStatus(null);
        setCurrentStep(null);
        setIsProcessing(false);
        return;
      }
      
      // If not duplicate, proceed with upload
      await proceedWithUpload(file, progressHandler, null, fileHash);
    } catch (error) {
      console.error('Error checking for duplicate or uploading file:', error);
      setDiagnosticInfo(prev => prev + `Error: ${error.message}\n`);
      setUploadStatus('error');
      setCurrentStep(null);
      setIsProcessing(false);
      throw error;
    }
  };

  const handleBatchFileDrop = async (files, progressHandler) => {
    try {
      setDiagnosticInfo(`Starting batch upload for ${files.length} files...\n`);
      setUploadStatus('uploading');
      setIsProcessing(true);
      setCurrentStep('uploading');
      setUploadProgress(0);
      setBatchUploadStatus({ total: files.length, current: 0, currentFile: null });
      setBatchResults(null); // Clear previous results
      
      // Validate project selection
      if (!selectedProject) {
        throw new Error('Please select a project before uploading');
      }
      
      // Validate agreement selection in contract validation mode
      if (uploadType === 'contract' && !selectedAgreement) {
        throw new Error('Please select a vendor agreement for contract validation');
      }
      
      setDiagnosticInfo(prev => prev + `Checking for duplicates and capturing file hashes...\n`);
      
      // Check all files for duplicates and build hash map
      const fileHashes = {};
      const filesToUpload = [];
      const skippedDuplicates = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileNumber = i + 1;
        
        setBatchUploadStatus({ 
          total: files.length, 
          current: fileNumber, 
          currentFile: file.name 
        });
        
        setDiagnosticInfo(prev => prev + `📁 Checking file ${fileNumber} of ${files.length}: ${file.name}\n`);
        
        // Check for duplicate and capture hash to avoid redundant hashing
        const duplicateCheck = await checkDuplicateFile(file, selectedProject);
        
        if (duplicateCheck.isDuplicate) {
          // In batch mode, skip duplicates automatically
          setDiagnosticInfo(prev => prev + `⚠️ File is a duplicate of ${duplicateCheck.existingFile.filename}, skipping\n`);
          skippedDuplicates.push({
            filename: file.name,
            error: 'Duplicate file (automatically skipped in batch mode)'
          });
        } else {
          // Capture hash for non-duplicate files
          fileHashes[file.name] = duplicateCheck.fileHash;
          filesToUpload.push(file);
          setDiagnosticInfo(prev => prev + `✓ File ${fileNumber} ready for upload (hash captured)\n`);
        }
      }
      
      setDiagnosticInfo(prev => prev + `\n📤 Uploading ${filesToUpload.length} files (${skippedDuplicates.length} duplicates skipped)...\n`);
      
      let results = [];
      let successCount = 0;
      let failedCount = skippedDuplicates.length;
      
      // Upload all non-duplicate files in batch with hash map
      if (filesToUpload.length > 0) {
        const wrappedProgressHandler = (progressEvent) => {
          const percentage = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentage);
          
          if (progressHandler) {
            progressHandler(progressEvent);
          }
        };
        
        const agreementIdForUpload = uploadType === 'contract' ? selectedAgreement : null;
        const delimiterValue = getDelimiterValue();
        const headerConfigValue = getHeaderConfig();
        const fixedWidthSchemaValue = getFixedWidthSchema();
        const result = await uploadFilesBatch(filesToUpload, wrappedProgressHandler, fileOwner, selectedProject, selectedSubProject, selectedQualityRules, agreementIdForUpload, fileHashes, delimiterValue, headerConfigValue, fixedWidthSchemaValue, archivePassword);
        
        // Process batch results
        if (result.results && Array.isArray(result.results)) {
          results = result.results.map(r => ({
            success: r.success !== false,
            filename: r.filename,
            fileId: r.fileId || (r.file && r.file.file_id),
            error: r.error
          }));
          
          successCount = results.filter(r => r.success).length;
          failedCount += results.filter(r => !r.success).length;
          
          results.forEach(r => {
            if (r.success) {
              setDiagnosticInfo(prev => prev + `✅ ${r.filename} uploaded successfully (ID: ${r.fileId})\n`);
            } else {
              setDiagnosticInfo(prev => prev + `❌ ${r.filename} failed: ${r.error}\n`);
            }
          });
        }
      }
      
      // Add skipped duplicates to results
      results = [...results, ...skippedDuplicates.map(d => ({ success: false, ...d }))];
      
      // Show final summary
      setDiagnosticInfo(prev => prev + `\n📊 Batch upload complete: ${successCount} succeeded, ${failedCount} failed\n`);
      
      // Set status based on results
      if (successCount === 0) {
        // All files failed
        setUploadStatus('error');
        setCurrentStep(null);
      } else if (failedCount > 0) {
        // Partial success
        setUploadStatus('warning');
        setCurrentStep('complete');
      } else {
        // All succeeded
        setUploadStatus('success');
        setCurrentStep('complete');
      }
      
      setIsProcessing(false);
      setBatchUploadStatus(null);
      
      // Store results for display (do NOT auto-redirect)
      setBatchResults({
        total: files.length,
        successCount,
        failedCount,
        results
      });
      
      return {
        success: successCount > 0,
        successCount,
        failedCount,
        results
      };
    } catch (error) {
      console.error('Error in batch upload:', error);
      setDiagnosticInfo(prev => prev + `Batch upload error: ${error.message}\n`);
      setUploadStatus('error');
      setCurrentStep(null);
      setIsProcessing(false);
      setBatchUploadStatus(null);
      throw error;
    }
  };

  const proceedWithUpload = async (file, progressHandler, replaceFileId = null, fileHash = null) => {
    try {
      setDiagnosticInfo(`Starting file upload for ${file.name} (${file.size} bytes, type: ${file.type})...\n`);
      setUploadStatus('uploading');
      setIsProcessing(true);
      setCurrentStep('uploading');
      setUploadProgress(0);
      
      // Create a wrapped progress handler that updates our state
      const wrappedProgressHandler = (progressEvent) => {
        const percentage = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadProgress(percentage);
        
        // Call the original progress handler
        if (progressHandler) {
          progressHandler(progressEvent);
        }
      };
      
      // Validate project selection
      if (!selectedProject) {
        throw new Error('Please select a project before uploading');
      }
      
      // Validate agreement selection in contract validation mode
      if (uploadType === 'contract' && !selectedAgreement) {
        throw new Error('Please select a vendor agreement for contract validation');
      }
      
      // Upload the file with progress tracking (optionally with atomic replacement)
      // Note: Pattern validation is done by backend, which returns detailed error messages
      const agreementIdForUpload = uploadType === 'contract' ? selectedAgreement : null;
      const fileSchemaIdForUpload = uploadType === 'contract' ? selectedFilePattern : null;
      const delimiterValue = getDelimiterValue();
      const headerConfigValue = getHeaderConfig();
      const fixedWidthSchemaValue = getFixedWidthSchema();
      const result = await uploadFile(
        file, 
        wrappedProgressHandler, 
        fileOwner, 
        selectedProject, 
        replaceFileId, 
        selectedSubProject, 
        selectedQualityRules, 
        agreementIdForUpload,
        fileSchemaIdForUpload,  // Pass the specific file pattern schema ID for validation
        fileHash,  // Pass fileHash to avoid redundant hashing
        delimiterValue,  // Pass delimiter for delimited files
        headerConfigValue,  // Pass header configuration for files without headers
        fixedWidthSchemaValue,  // Pass fixed-width schema for .dat files
        archivePassword  // Pass archive password for password-protected archives
      );
      
      setDiagnosticInfo(prev => prev + `Upload successful: ${JSON.stringify(result, null, 2)}\n`);
      
      // Extract fileId - handle both batch response (results array) and legacy single response
      let fileId;
      if (result.results && result.results.length > 0) {
        // Batch response: extract from first result
        const firstResult = result.results[0];
        fileId = firstResult.fileId || (firstResult.file && firstResult.file.file_id);
      } else {
        // Legacy single file response
        fileId = result.fileId || (result.file && result.file.file_id);
      }
      console.log('Extracted file ID from result:', fileId);
      
      const fileDetails = {
        fileId: fileId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      };
      
      setUploadedFile(fileDetails);
      setUploadStatus('success');
      
      // Clear archive password after successful upload (security best practice - one-time use)
      if (archivePassword) {
        setArchivePassword('');
        setShowArchivePassword(false);
      }
      
      // Move to scanning step (virus scan happens on server after upload)
      setCurrentStep('scanning');
      
      // Start polling for processing status
      console.log('File uploaded successfully, starting status polling. File ID:', fileId);
      startPolling(fileId);
      
      return result;
    } catch (error) {
      console.error('Error uploading file:', error);
      
      // Normalize error payload (axios errors may be unwrapped by interceptor)
      const errorPayload = error?.response?.data || error;
      
      // Check for contract validation errors (filename pattern, schema validation, or schema extraction)
      const isFilePatternError = errorPayload?.error === 'File pattern validation failed';
      const isSchemaError = errorPayload?.error === 'Schema validation failed';
      const isSchemaExtractionError = errorPayload?.error === 'Schema validation error';
      
      if ((isFilePatternError || isSchemaError || isSchemaExtractionError) && (errorPayload?.details || errorPayload?.message)) {
        // Determine error type for display
        let errorType = 'schema';
        if (isFilePatternError) errorType = 'pattern';
        else if (isSchemaExtractionError) errorType = 'extraction';
        
        // Store unified validation error with type and full details
        setValidationError({
          type: errorType,
          error: errorPayload.error,
          message: errorPayload.message,
          hint: errorPayload.hint || (isSchemaExtractionError ? 'For password-protected archives, ensure you have entered the correct archive password.' : null),
          details: errorPayload.details || { errorMessage: errorPayload.message }
        });
        
        setDiagnosticInfo(prev => prev + `${errorPayload.error}: ${errorPayload.message}\n`);
        setCurrentStep(null);
        setIsProcessing(false);
        return; // Don't set uploadStatus to 'error' - we have specific validation error display
      }
      
      setDiagnosticInfo(prev => prev + `Upload error: ${error.message}\n`);
      if (error.response) {
        setDiagnosticInfo(prev => prev + `Error response: ${JSON.stringify(error.response.data, null, 2)}\n`);
      }
      setUploadStatus('error');
      setCurrentStep(null);
      setIsProcessing(false);
      throw error;
    }
  };

  const proceedWithUploadWithReplacement = async (file, progressHandler, replaceFileId, fileHash = null) => {
    return proceedWithUpload(file, progressHandler, replaceFileId, fileHash);
  };

  const handleReplaceFile = async () => {
    setShowDuplicateModal(false);
    
    // Guard against null pendingFile
    if (!pendingFile || !pendingProgressHandler) {
      setDiagnosticInfo(prev => prev + `Error: No pending file to upload\n`);
      setUploadStatus('error');
      return;
    }
    
    try {
      // Upload new file with atomic replacement (backend handles deletion)
      // Reuse pre-calculated hash from duplicate check to avoid redundant hashing
      const result = await proceedWithUploadWithReplacement(pendingFile, pendingProgressHandler, duplicateFileInfo.fileId, duplicateFileInfo.fileHash);
      
      // Check if replacement was successful
      if (result && result.results && result.results.length > 0 && result.results[0].replaced) {
        setDiagnosticInfo(prev => prev + `Successfully replaced file: ${duplicateFileInfo.filename}\n`);
      } else {
        setDiagnosticInfo(prev => prev + `New file uploaded. Note: Old file may not have been deleted.\n`);
      }
      
      // Clean up state after successful replace
      setPendingFile(null);
      setPendingProgressHandler(null);
      setDuplicateFileInfo(null);
    } catch (error) {
      console.error('Error uploading replacement file:', error);
      setDiagnosticInfo(prev => prev + `Error uploading replacement file: ${error.message}\n`);
      setUploadStatus('error');
    }
  };

  const handleKeepBoth = async () => {
    setShowDuplicateModal(false);
    
    // Guard against null pendingFile
    if (!pendingFile || !pendingProgressHandler) {
      setDiagnosticInfo(prev => prev + `Error: No pending file to upload\n`);
      setUploadStatus('error');
      return;
    }
    
    try {
      // Simply proceed with upload (keeps both files)
      // Reuse pre-calculated hash from duplicate check to avoid redundant hashing
      await proceedWithUpload(pendingFile, pendingProgressHandler, null, duplicateFileInfo.fileHash);
      
      // Clean up state after successful upload
      setPendingFile(null);
      setPendingProgressHandler(null);
      setDuplicateFileInfo(null);
    } catch (error) {
      console.error('Error uploading file:', error);
      setDiagnosticInfo(prev => prev + `Error uploading file: ${error.message}\n`);
      setUploadStatus('error');
    }
  };

  const handleCancelUpload = () => {
    setShowDuplicateModal(false);
    setPendingFile(null);
    setPendingProgressHandler(null);
    setDuplicateFileInfo(null);
    setUploadStatus(null);
    setDropzoneKey(prev => prev + 1); // Reset FileDropzone component
  };
  
  const handleViewProfile = () => {
    if (uploadedFile && uploadedFile.fileId) {
      console.log('Manually navigating to profile for file:', uploadedFile.fileId);
      // Add a timestamp parameter to force a fresh load
      navigate(`/profile/${encodeURIComponent(uploadedFile.fileId)}?t=${Date.now()}`);
    }
  };
  
  const handleUploadAnother = () => {
    // Clear any polling
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    
    setUploadStatus(null);
    setUploadedFile(null);
    setCurrentStep(null);
    setUploadProgress(0);
    setIsProcessing(false);
    setBatchResults(null); // Clear batch results
    setBatchUploadStatus(null); // Clear batch upload status
    setDiagnosticInfo(''); // Clear diagnostic info
    setPendingFile(null); // Clear pending file
    setPendingProgressHandler(null); // Clear pending progress handler
    setDuplicateFileInfo(null); // Clear duplicate file info
    setDropzoneKey(prev => prev + 1); // Reset FileDropzone component
  };
  
  const handleOpenOwnerModal = () => {
    setTempOwner(fileOwner);
    setShowOwnerModal(true);
  };
  
  const handleSaveOwner = () => {
    setFileOwner(tempOwner);
    setShowOwnerModal(false);
  };
  
  const handleCancelOwnerModal = () => {
    setTempOwner('');
    setShowOwnerModal(false);
  };
  
  const handleResetOwnerToDefault = () => {
    const defaultOwner = currentUser?.email || '';
    setTempOwner(defaultOwner);
  };
  
  const handleDropFile = async (file, progressHandler) => {
    // Validate vendor selections for drop file tab
    if (!selectedVendorProject) {
      setUploadStatus('error');
      setDiagnosticInfo('Please select a project before uploading\n');
      throw new Error('Project selection required');
    }
    
    if (!selectedConnection) {
      setUploadStatus('error');
      setDiagnosticInfo('Please select a connection before uploading\n');
      throw new Error('Connection selection required');
    }
    
    // Note: When using connection-based upload, we don't need drop location configured
    // The connection provides the upload destination
    
    try {
      // Append timestamp to filename (format: basename_YYYYMMDDTHHMMSS.ext)
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0]; // Keep the 'T'
      
      // Handle files with or without extensions
      const lastDotIndex = file.name.lastIndexOf('.');
      const hasExtension = lastDotIndex > 0; // Must be > 0 to avoid files like '.gitignore'
      const baseName = hasExtension ? file.name.substring(0, lastDotIndex) : file.name;
      const fileExtension = hasExtension ? file.name.substring(lastDotIndex) : '';
      
      const timestampedFilename = `${baseName}_${timestamp}${fileExtension}`;
      
      // Create a new File object with the timestamped name
      const timestampedFile = new File([file], timestampedFilename, { type: file.type });
      
      setDiagnosticInfo(`Starting drop file upload for ${timestampedFilename} to connection ${selectedConnection}...\n`);
      setUploadStatus('uploading');
      
      const formData = new FormData();
      formData.append('file', timestampedFile);
      
      // Add quality rule IDs if selected
      if (selectedQualityRules && selectedQualityRules.length > 0) {
        formData.append('quality_rule_ids', JSON.stringify(selectedQualityRules));
      }
      
      const token = localStorage.getItem('token');
      
      // Build URL with connection and folder parameters
      let uploadUrl = `${API_BASE_URL}/api/files/drop?connectionId=${encodeURIComponent(selectedConnection)}`;
      if (browsePrefix) {
        uploadUrl += `&folder=${encodeURIComponent(browsePrefix)}`;
      }
      
      const response = await axios.post(uploadUrl, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          if (progressHandler) {
            progressHandler(progressEvent);
          }
        }
      });
      
      setDiagnosticInfo(prev => prev + `Drop upload successful: ${JSON.stringify(response.data, null, 2)}\n`);
      
      const fileDetails = {
        fileId: response.data.fileId,
        fileName: timestampedFilename, // Use the timestamped filename
        fileType: file.type,
        fileSize: file.size,
        s3Location: response.data.file.storage_location || response.data.file.s3_location,
        virusScan: response.data.virusScan
      };
      
      setUploadedFile(fileDetails);
      setUploadStatus('success');
      
    } catch (error) {
      console.error('Error dropping file:', error);
      setDiagnosticInfo(prev => prev + `Drop upload error: ${error.message}\n`);
      if (error.response) {
        setDiagnosticInfo(prev => prev + `Error response: ${JSON.stringify(error.response.data, null, 2)}\n`);
      }
      setUploadStatus('error');
      throw error;
    }
  };

  return (
    <div className="gps-page-container file-upload-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">File Upload & Profile</h1>
          <p className="gps-page-subtitle">Upload data files for analysis and quality profiling</p>
        </div>
      </div>
      
      {showDuplicateModal && duplicateFileInfo && (
        <DuplicateFileModal
          existingFile={duplicateFileInfo}
          onReplace={handleReplaceFile}
          onKeepBoth={handleKeepBoth}
          onCancel={handleCancelUpload}
        />
      )}
      
      {/* Owner Edit Modal */}
      {showOwnerModal && (
        <div className="modal-overlay">
          <div className="modal-content ownership-modal">
            <h2>Edit File Owner</h2>
            <p className="modal-description">
              Select the owner for files you upload from the available users.
            </p>
            <div className="form-group">
              <label htmlFor="owner-select">Owner:</label>
              {loadingOwners ? (
                <div className="loading-spinner">Loading available owners...</div>
              ) : availableOwners.length > 0 ? (
                <select
                  id="owner-select"
                  value={tempOwner}
                  onChange={(e) => setTempOwner(e.target.value)}
                  className="form-control"
                >
                  {availableOwners.map((owner) => (
                    <option key={owner.email} value={owner.email}>
                      {owner.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="no-owners-message">
                  No available owners found. Please select a project {uploadType === 'contract' ? 'and agreement' : ''} first.
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button 
                className="btn btn-primary"
                onClick={handleSaveOwner}
                disabled={!tempOwner || loadingOwners}
              >
                Save
              </button>
              <button 
                className="btn btn-secondary"
                onClick={handleResetOwnerToDefault}
              >
                Reset to Default
              </button>
              <button 
                className="btn btn-secondary"
                onClick={handleCancelOwnerModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Drop Location Not Configured Modal */}
      {showDropLocationModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Drop Location Not Configured</h2>
            <p>
              {isAdmin 
                ? 'The S3 drop location has not been configured yet. Please go to Connections to configure it.'
                : 'The drop file feature is not available. Please contact your administrator to configure the drop location.'}
            </p>
            <div className="modal-actions">
              {isAdmin && (
                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    setShowDropLocationModal(false);
                    navigate('/connections');
                  }}
                >
                  Go to Connections
                </button>
              )}
              <button 
                className="btn btn-secondary"
                onClick={() => setShowDropLocationModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      <Card>
        {/* Upload Mode Tabs */}
        <div className="gps-tabs-container">
          <button 
            className={`gps-tab ${activeTab === 'upload-profile' ? 'gps-tab--active' : ''}`}
            onClick={() => setActiveTab('upload-profile')}
          >
            Upload & Profile
          </button>
          {hasWritePermission('file_drop') && (
            <button 
              className={`gps-tab ${activeTab === 'drop-file' ? 'gps-tab--active' : ''}`}
              onClick={() => setActiveTab('drop-file')}
            >
              Drop File (S3 Direct)
            </button>
          )}
          <button 
            className={`gps-tab ${activeTab === 'bulk-profiling' ? 'gps-tab--active' : ''}`}
            onClick={() => setActiveTab('bulk-profiling')}
          >
            Bulk Profiling
          </button>
        </div>
        
        <div className="upload-instructions">
          <div className="upload-instructions-header">
            <div>
              <h2 className="upload-section-title">
                {activeTab === 'drop-file' 
                  ? 'Drop file to S3 storage'
                  : 'Add a new file to the observatory'}
              </h2>
              <p className="upload-section-subtitle">
                {activeTab === 'drop-file'
                  ? 'Upload files directly to S3 storage without profiling or analysis. Quick uploads for raw file storage.'
                  : 'Upload a data file to analyze its structure, profile its content, and track changes over time. Supported file types include CSV, JSON, Parquet, Excel, and XML.'}
              </p>
            </div>
            {(uploadStatus || uploadedFile) && (
              <button 
                className="gps-btn gps-btn--secondary"
                onClick={handleUploadAnother}
              >
                Reset
              </button>
            )}
          </div>
        </div>
        
        {/* Project and Owner Section - Combined */}
        {!isProcessing && activeTab === 'upload-profile' && hasWritePermission('file') && (
          <div className="upload-form-section">
            {/* Row 1: Project, Sub-Project */}
            <div className="upload-form-row upload-form-row--compact">
              {/* Project Selection */}
              <div className="upload-form-field upload-form-field--flex">
                <label htmlFor="project-select" className="upload-form-label">
                  Project: <span className="required-indicator">*</span>
                </label>
                <select 
                  id="project-select"
                  className="gps-form-select gps-form-select--compact"
                  value={selectedProject || ''}
                  onChange={(e) => setSelectedProject(Number(e.target.value))}
                  disabled={loadingProjects}
                >
                  {loadingProjects ? (
                    <option>Loading projects...</option>
                  ) : projects.length === 0 ? (
                    <option>No projects available</option>
                  ) : (
                    <>
                      <option value="">Select a project...</option>
                      {projects.map(project => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              {/* Sub-Project Selection */}
              <div className="upload-form-field upload-form-field--flex">
                <label htmlFor="sub-project-select" className="upload-form-label">Sub-Project:</label>
                <select 
                  id="sub-project-select"
                  className="gps-form-select gps-form-select--compact"
                  value={selectedSubProject || ''}
                  onChange={(e) => setSelectedSubProject(e.target.value ? Number(e.target.value) : null)}
                  disabled={!selectedProject || loadingSubProjects || subProjects.length === 0}
                >
                  {loadingSubProjects ? (
                    <option>Loading...</option>
                  ) : !selectedProject ? (
                    <option value="">Select project first</option>
                  ) : subProjects.length === 0 ? (
                    <option value="">None available</option>
                  ) : (
                    <>
                      <option value="">None (use parent project)</option>
                      {subProjects.map(subProject => (
                        <option key={subProject.id} value={subProject.id}>
                          {subProject.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Row 2: Upload Type Selection */}
            <div className="upload-type-section">
              <label className="upload-form-label">Upload Type:</label>
              <div className="upload-type-options">
                <label className="upload-radio-label">
                  <input
                    type="radio"
                    name="uploadType"
                    value="adhoc"
                    checked={uploadType === 'adhoc'}
                    onChange={(e) => {
                      setUploadType(e.target.value);
                      setSelectedAgreement(null);
                      setSelectedAgreementSchema(null);
                    }}
                  />
                  <span>Ad-hoc Upload</span>
                  <span className="upload-radio-hint">(Standard file upload)</span>
                </label>
                <label className="upload-radio-label">
                  <input
                    type="radio"
                    name="uploadType"
                    value="contract"
                    checked={uploadType === 'contract'}
                    onChange={(e) => setUploadType(e.target.value)}
                  />
                  <span>Contract Validation</span>
                  <span className="upload-radio-hint">(Validate against vendor agreement)</span>
                </label>
              </div>
            </div>

            {/* Row 3: Vendor Agreement (contract mode only), File Type, Archive Password */}
            <div className="upload-form-row upload-form-row--compact">
              {/* Vendor Agreement - only shown in contract mode */}
              {uploadType === 'contract' && (
                <div className="upload-form-field upload-form-field--flex">
                  <label htmlFor="vendor-agreement-select" className="upload-form-label">
                    Vendor Agreement: <span className="required-indicator">*</span>
                  </label>
                  <select 
                    id="vendor-agreement-select"
                    className="gps-form-select gps-form-select--compact"
                    value={selectedAgreement || ''}
                    onChange={(e) => setSelectedAgreement(e.target.value)}
                    disabled={!selectedProject || loadingAgreements}
                  >
                    {loadingAgreements ? (
                      <option>Loading...</option>
                    ) : !selectedProject ? (
                      <option value="">Select project first</option>
                    ) : vendorAgreements.length === 0 ? (
                      <option value="">No agreements available</option>
                    ) : (
                      <>
                        <option value="">Select an agreement...</option>
                        {vendorAgreements.map(agreement => (
                          <option key={agreement.id} value={agreement.id}>
                            {agreement.vendor_name} - {agreement.agreement_code}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              )}

              {/* File Type (formerly File Delimiter) */}
              <div className="upload-form-field upload-form-field--flex">
                <label htmlFor="delimiter-select-inline" className="upload-form-label">
                  File Type:
                </label>
                <select 
                  id="delimiter-select-inline"
                  className="gps-form-select gps-form-select--compact"
                  value={delimiterType}
                  onChange={(e) => {
                    setDelimiterType(e.target.value);
                    if (e.target.value !== 'custom') {
                      setCustomDelimiter('');
                    }
                    if (isFixedWidthType(e.target.value)) {
                      setHasHeader(false);
                    }
                  }}
                >
                  <option value="none">Auto-detect</option>
                  <option value="comma">Comma (,)</option>
                  <option value="pipe">Pipe (|)</option>
                  <option value="tab">Tab (\t)</option>
                  <option value="semicolon">Semicolon (;)</option>
                  <option value="custom">Custom...</option>
                  <option value="dat">Fixed Width (.dat)</option>
                  <option value="bin">Binary (.bin)</option>
                  <option value="bdat">Fixed Width Binary (.bdat)</option>
                  {/* Legacy values - only shown when currently selected (for backwards compatibility) */}
                  {delimiterType === 'fixed_width' && <option value="fixed_width">Fixed Width (.dat)</option>}
                  {delimiterType === 'binary' && <option value="binary">Binary (.bin)</option>}
                </select>
              </div>

              {/* Archive Password */}
              <div className="upload-form-field upload-form-field--flex">
                <label htmlFor="archive-password-inline" className="upload-form-label">
                  Archive Password:
                </label>
                <div className="password-input-wrapper password-input-wrapper--compact">
                  <input
                    id="archive-password-inline"
                    type={showArchivePassword ? 'text' : 'password'}
                    value={archivePassword}
                    onChange={(e) => setArchivePassword(e.target.value)}
                    placeholder="Optional..."
                    className="password-input password-input--compact"
                  />
                  <button
                    type="button"
                    onClick={() => setShowArchivePassword(!showArchivePassword)}
                    className="password-toggle-btn password-toggle-btn--compact"
                    title={showArchivePassword ? 'Hide password' : 'Show password'}
                  >
                    {showArchivePassword ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Row 4: Expected File Pattern (contract mode only), Header Configuration, File Owner */}
            <div className="upload-form-row upload-form-row--compact">
              {/* Expected File Pattern - only shown in contract mode with agreement selected */}
              {uploadType === 'contract' && (
                <div className="upload-form-field upload-form-field--flex">
                  <label htmlFor="file-pattern-select" className="upload-form-label">
                    Expected File Pattern:
                  </label>
                  <select 
                    id="file-pattern-select"
                    className={`gps-form-select gps-form-select--compact ${autoMatchedPattern ? 'pattern-auto-matched' : ''}`}
                    value={selectedFilePattern || ''}
                    onChange={(e) => {
                      const patternId = e.target.value ? parseInt(e.target.value) : null;
                      setSelectedFilePattern(patternId);
                      setAutoMatchedPattern(null);
                      
                      if (patternId) {
                        const pattern = agreementFilePatterns.find(p => p.id === patternId);
                        if (pattern) {
                          setSelectedAgreementSchema(pattern);
                          if (pattern.quality_rule_ids && Array.isArray(pattern.quality_rule_ids)) {
                            setSelectedQualityRules(pattern.quality_rule_ids);
                          } else {
                            setSelectedQualityRules([]);
                          }
                          // Auto-populate upload configuration from selected pattern
                          applyPatternConfig(pattern);
                        }
                      } else {
                        setSelectedAgreementSchema(null);
                        setSelectedQualityRules([]);
                        // Reset to defaults when no pattern selected
                        setDelimiterType('none');
                        setHasHeader(true);
                        setFixedWidthSchema([{ name: '', width: '', type: 'string' }]);
                      }
                    }}
                    disabled={!selectedAgreement || agreementFilePatterns.length === 0}
                  >
                    {!selectedAgreement ? (
                      <option value="">Select agreement first</option>
                    ) : agreementFilePatterns.length === 0 ? (
                      <option value="">No patterns defined</option>
                    ) : (
                      <>
                        <option value="">Auto-match on drop...</option>
                        {agreementFilePatterns.map(pattern => (
                          <option key={pattern.id} value={pattern.id}>
                            {pattern.file_name_pattern}
                            {autoMatchedPattern === pattern.id ? ' ✓' : ''}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              )}

              {/* Header Configuration */}
              <div className="upload-form-field upload-form-field--flex">
                <label className="upload-form-label">Header Configuration:</label>
                <label className="upload-checkbox-label upload-checkbox-label--inline">
                  <input 
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(e) => {
                      setHasHeader(e.target.checked);
                      if (e.target.checked) {
                        setColumnNames('');
                      }
                    }}
                  />
                  <span>File has a header row</span>
                </label>
              </div>

              {/* File Owner */}
              <div className="upload-form-field upload-form-field--flex upload-owner-field">
                <span className="upload-form-label">File Owner:</span>
                <span className="upload-owner-value">{fileOwner || 'Not set'}</span>
                <button 
                  className="upload-edit-link"
                  onClick={handleOpenOwnerModal}
                  title="Edit owner"
                >
                  Edit
                </button>
              </div>
            </div>

            {/* Custom Delimiter Input (shown when custom is selected) */}
            {delimiterType === 'custom' && (
              <div className="upload-form-row upload-form-row--compact">
                <div className="upload-form-field upload-form-field--flex">
                  <label htmlFor="custom-delimiter-input" className="upload-form-label">
                    Custom Delimiter:
                  </label>
                  <input 
                    id="custom-delimiter-input"
                    className="gps-form-input gps-form-input--compact"
                    type="text"
                    value={customDelimiter}
                    onChange={(e) => setCustomDelimiter(e.target.value)}
                    placeholder="e.g., ~^ or ||"
                  />
                </div>
              </div>
            )}

            {/* Column Names Input (shown when hasHeader is false) */}
            {!hasHeader && !isFixedWidthType(delimiterType) && (
              <div className="upload-form-row upload-form-row--compact">
                <div className="upload-form-field" style={{ flex: 1 }}>
                  <label htmlFor="column-names-input" className="upload-form-label">
                    Column Names (comma-separated):
                  </label>
                  <input 
                    id="column-names-input"
                    className="gps-form-input"
                    type="text"
                    value={columnNames}
                    onChange={(e) => setColumnNames(e.target.value)}
                    placeholder="e.g., PatientID, Name, DOB, Visit Date"
                  />
                </div>
              </div>
            )}

            {/* Schema Preview (Contract Validation Mode) */}
            {selectedProject && uploadType === 'contract' && selectedAgreementSchema && selectedAgreementSchema.schema && (
              <div className="upload-subsection">
                <div className="agreement-schema-preview">
                  <div className="agreement-schema-title">Expected Schema:</div>
                  <div className="agreement-columns">
                    {Array.isArray(selectedAgreementSchema.schema) && selectedAgreementSchema.schema.map((col, idx) => {
                      const columnName = col.column_name || col.name;
                      const dataType = col.data_type || col.type;
                      
                      return (
                        <span key={idx} className="agreement-column-chip">
                          {columnName} <span className="data-type">({dataType})</span>
                        </span>
                      );
                    })}
                  </div>
                  
                  {/* Governance Info */}
                  <div className="agreement-tags">
                    {selectedAgreementSchema.contains_pii && (
                      <span className="agreement-tag agreement-tag--pii">🔒 Contains PII</span>
                    )}
                    {selectedAgreementSchema.data_classification && (
                      <span className="agreement-tag agreement-tag--classification">
                        {selectedAgreementSchema.data_classification}
                      </span>
                    )}
                    {selectedAgreementSchema.file_type && (
                      <span className="agreement-tag agreement-tag--filetype">
                        {getFileTypeLabel(selectedAgreementSchema.file_type)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Fixed-Width Schema Builder - shown only when fixed-width file type is selected */}
            {selectedProject && isFixedWidthType(delimiterType) && (
              <div className="upload-subsection">
                {/* Fixed-Width Schema Builder */}
                  <div className="fixed-width-section">
                    <label className="fixed-width-label">
                      Define Column Schema:
                    </label>
                    <p className="fixed-width-desc">
                      Fixed-width files have no delimiters. Specify each column's name and width in characters. You can upload a schema file or define it manually below.
                    </p>
                    
                    {/* Schema File Upload and Template Download */}
                    <div className="fixed-width-upload-box">
                      <div className="fixed-width-upload-row">
                        <label htmlFor="schema-file-upload" className="fixed-width-upload-btn">
                          <FiFolder size={14} /> Upload Schema File
                        </label>
                        <input
                          id="schema-file-upload"
                          type="file"
                          accept=".json,.csv"
                          onChange={handleSchemaFileUpload}
                          style={{ display: 'none' }}
                        />
                        
                        <span className="fixed-width-template-text">or download template:</span>
                        
                        <button
                          type="button"
                          onClick={downloadJSONTemplate}
                          className="fixed-width-template-btn"
                        >
                          ↓ JSON Template
                        </button>
                        
                        <button
                          type="button"
                          onClick={downloadCSVTemplate}
                          className="fixed-width-template-btn"
                        >
                          ↓ CSV Template
                        </button>
                      </div>
                      
                      {/* Success/Error Messages */}
                      {schemaUploadSuccess && (
                        <div className="fixed-width-success-msg">
                          ✓ {schemaUploadSuccess}
                        </div>
                      )}
                      
                      {schemaUploadError && (
                        <div className="fixed-width-error-msg">
                          ✗ {schemaUploadError}
                        </div>
                      )}
                      
                      <div className="fixed-width-formats-hint">
                        Accepted formats: .json or .csv with "name" and "width" columns
                      </div>
                    </div>
                    
                    <div className="fixed-width-schema-box">
                      <div className="fixed-width-header-row">
                        <span className="fixed-width-header-name">Column Name</span>
                        <span className="fixed-width-header-type">Type</span>
                        <span className="fixed-width-header-width">Width (bytes)</span>
                        <span className="fixed-width-header-action"></span>
                      </div>
                      <div className="fixed-width-columns-scroll">
                        {fixedWidthSchema.map((column, index) => (
                          <div key={index} className="fixed-width-column-row">
                            <input 
                              type="text"
                              value={column.name}
                              onChange={(e) => {
                                const newSchema = [...fixedWidthSchema];
                                newSchema[index].name = e.target.value;
                                setFixedWidthSchema(newSchema);
                              }}
                              placeholder="Column Name"
                              className="fixed-width-column-input"
                            />
                            <select
                              value={column.type || 'string'}
                              onChange={(e) => {
                                const newSchema = [...fixedWidthSchema];
                                const newType = e.target.value;
                                newSchema[index].type = newType;
                                const typeWidths = {
                                  'uint8': 1, 'int8': 1,
                                  'uint16': 2, 'int16': 2,
                                  'uint32': 4, 'int32': 4, 'float32': 4,
                                  'uint64': 8, 'int64': 8, 'float64': 8
                                };
                                if (typeWidths[newType]) {
                                  newSchema[index].width = typeWidths[newType].toString();
                                } else if (newType === 'string') {
                                  newSchema[index].width = '';
                                }
                                setFixedWidthSchema(newSchema);
                              }}
                              className="fixed-width-type-select"
                            >
                              {binaryColumnTypes.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                            <input 
                              type="number"
                              value={column.width}
                              onChange={(e) => {
                                const newSchema = [...fixedWidthSchema];
                                newSchema[index].width = e.target.value;
                                setFixedWidthSchema(newSchema);
                              }}
                              placeholder={column.type && column.type !== 'string' ? 'Fixed' : 'Width'}
                              min="1"
                              className="fixed-width-width-input"
                              disabled={column.type && column.type !== 'string'}
                            />
                            <button 
                              type="button"
                              onClick={() => {
                                const newSchema = fixedWidthSchema.filter((_, i) => i !== index);
                                setFixedWidthSchema(newSchema.length > 0 ? newSchema : [{ name: '', width: '', type: 'string' }]);
                              }}
                              className="fixed-width-remove-btn"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      
                      <button 
                        type="button"
                        onClick={() => {
                          setFixedWidthSchema([...fixedWidthSchema, { name: '', width: '', type: 'string' }]);
                        }}
                        className="fixed-width-add-btn"
                      >
                        + Add Column
                      </button>
                    </div>
                    
                    <div className="fixed-width-example">
                      Binary files: Select data types for each column. String fields need width in bytes. Integer types have fixed sizes (e.g., UInt8 = 1 byte).
                    </div>
                  </div>
              </div>
            )}

            {!selectedProject && (
              <div className="project-required-warning">
                Please select a project to upload files
              </div>
            )}
          </div>
        )}
        
        {/* Show StepProgress when processing */}
        {isProcessing && currentStep && activeTab === 'upload-profile' && (
          <>
            <StepProgress 
              currentStep={currentStep}
              uploadProgress={currentStep === 'uploading' ? uploadProgress : null}
            />
            {batchUploadStatus && (
              <div style={{
                margin: '1rem',
                padding: '1rem',
                background: '#f0f9ff',
                border: '1px solid #3b82f6',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#1e40af', marginBottom: '0.5rem' }}>
                  Uploading file {batchUploadStatus.current} of {batchUploadStatus.total}
                </div>
                {batchUploadStatus.currentFile && (
                  <div style={{ fontSize: '0.95rem', color: '#475569' }}>
                    {batchUploadStatus.currentFile}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        
        {/* Filename Validation Error Display */}
        {filenameValidationError && activeTab === 'upload-profile' && (
          <div style={{
            margin: '12px 0',
            padding: '16px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            fontFamily: 'Inter, sans-serif'
          }}>
            <div style={{ 
              fontSize: '12px', 
              fontWeight: 600, 
              color: '#991b1b', 
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{ fontSize: '14px' }}>✕</span>
              File Pattern Validation Failed
            </div>
            
            <div style={{ 
              background: '#fff',
              padding: '10px 12px',
              borderRadius: '4px',
              marginBottom: '10px',
              fontSize: '10px',
              color: '#374151',
              textAlign: 'left',
              border: '1px solid #e5e7eb'
            }}>
              {filenameValidationError.contractCode && (
                <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#1f2937' }}>Contract:</span>
                  <code style={{ 
                    background: '#dbeafe', 
                    padding: '2px 6px', 
                    borderRadius: '3px',
                    color: '#1e40af',
                    fontSize: '10px',
                    fontFamily: 'Inter, monospace'
                  }}>
                    {filenameValidationError.contractCode}
                  </code>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 600, color: '#1f2937' }}>Uploaded File:</span>
                <code style={{ 
                  background: '#fee2e2', 
                  padding: '2px 6px', 
                  borderRadius: '3px',
                  color: '#991b1b',
                  fontSize: '10px',
                  fontFamily: 'Inter, monospace'
                }}>
                  {filenameValidationError.uploadedFile}
                </code>
              </div>
            </div>

            <div style={{ 
              background: '#fff',
              padding: '10px 12px',
              borderRadius: '4px',
              marginBottom: '10px',
              textAlign: 'left',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ fontWeight: 600, marginBottom: '6px', color: '#1f2937', fontSize: '10px' }}>
                Expected Filename Patterns ({filenameValidationError.patternCount || filenameValidationError.expectedPatterns?.length || 0}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {filenameValidationError.expectedPatterns?.map((pattern, idx) => (
                  <code key={idx} style={{ 
                    background: '#d1fae5', 
                    padding: '2px 8px', 
                    borderRadius: '3px',
                    fontSize: '10px',
                    color: '#065f46',
                    fontFamily: 'Inter, monospace'
                  }}>
                    {pattern}
                  </code>
                ))}
              </div>
            </div>

            <div style={{ 
              padding: '8px 12px',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '4px',
              fontSize: '10px',
              color: '#92400e',
              textAlign: 'left',
              lineHeight: '1.4'
            }}>
              <span style={{ fontWeight: 600 }}>Tip: </span>
              File patterns may include wildcards: * (matches any characters) and ? (matches single character). 
              Your filename must match at least one of the patterns listed above for this contract.
            </div>
          </div>
        )}
        
        {/* Show detailed validation error (filename pattern or schema) */}
        {validationError && !isProcessing && activeTab === 'upload-profile' && (
          <div style={{
            margin: '12px 0',
            padding: '16px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            fontFamily: 'Inter, sans-serif'
          }}>
            <div style={{ 
              fontSize: '12px', 
              fontWeight: 600, 
              color: '#991b1b', 
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{ fontSize: '14px' }}>✕</span>
              {validationError.error}
            </div>
            <div style={{ fontSize: '10px', color: '#7f1d1d', marginBottom: '12px', lineHeight: '1.4' }}>
              {validationError.message}
            </div>

            <div style={{ 
              background: '#fff',
              padding: '10px 12px',
              borderRadius: '4px',
              marginBottom: '10px',
              fontSize: '10px',
              color: '#374151',
              textAlign: 'left',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 600, color: '#1f2937' }}>Uploaded File:</span>
                <code style={{ 
                  background: '#fee2e2', 
                  padding: '2px 6px', 
                  borderRadius: '3px',
                  color: '#991b1b',
                  fontSize: '10px',
                  fontFamily: 'Inter, monospace'
                }}>
                  {validationError.details.uploadedFile}
                </code>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 600, color: '#1f2937' }}>Contract Code:</span>
                <code style={{ 
                  background: '#dbeafe', 
                  padding: '2px 6px', 
                  borderRadius: '3px',
                  color: '#1e40af',
                  fontSize: '10px',
                  fontFamily: 'Inter, monospace'
                }}>
                  {validationError.details.contractCode}
                </code>
              </div>
            </div>

            {/* Show expected patterns for pattern validation errors */}
            {validationError.type === 'pattern' && validationError.details.expectedPatterns && (
              <div style={{ 
                background: '#fff',
                padding: '10px 12px',
                borderRadius: '4px',
                marginBottom: '10px',
                textAlign: 'left',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: '#1f2937', fontSize: '10px' }}>
                  Expected Filename Patterns:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {validationError.details.expectedPatterns.map((pattern, idx) => (
                    <code key={idx} style={{ 
                      background: '#d1fae5', 
                      padding: '2px 8px', 
                      borderRadius: '3px',
                      fontSize: '10px',
                      color: '#065f46',
                      fontFamily: 'Inter, monospace'
                    }}>
                      {pattern}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* Show extraction errors (password issues, file format issues) */}
            {validationError.type === 'extraction' && (
              <div style={{ 
                background: '#fff',
                padding: '10px 12px',
                borderRadius: '4px',
                marginBottom: '10px',
                textAlign: 'left',
                border: '1px solid #fecaca'
              }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: '#991b1b', fontSize: '10px' }}>
                  File Processing Error:
                </div>
                <p style={{ margin: 0, color: '#7f1d1d', fontSize: '10px', lineHeight: '1.4' }}>
                  {validationError.details.errorMessage || validationError.message}
                </p>
              </div>
            )}

            {/* Show schema errors for schema validation failures */}
            {validationError.type === 'schema' && (
              <div style={{ textAlign: 'left' }}>
                {validationError.details.missingColumns && validationError.details.missingColumns.length > 0 && (
                  <div style={{ 
                    background: '#fff',
                    padding: '10px 12px',
                    borderRadius: '4px',
                    marginBottom: '10px',
                    border: '1px solid #fecaca'
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px', color: '#991b1b', fontSize: '10px' }}>
                      Missing Columns ({validationError.details.missingColumns.length}):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {validationError.details.missingColumns.map((col, idx) => (
                        <code key={idx} style={{ 
                          background: '#fee2e2', 
                          padding: '2px 6px', 
                          borderRadius: '3px',
                          color: '#991b1b',
                          fontSize: '10px',
                          fontFamily: 'Inter, monospace'
                        }}>
                          {col}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                {validationError.details.extraColumns && validationError.details.extraColumns.length > 0 && (
                  <div style={{ 
                    background: '#fff',
                    padding: '10px 12px',
                    borderRadius: '4px',
                    marginBottom: '10px',
                    border: '1px solid #fde68a'
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px', color: '#92400e', fontSize: '10px' }}>
                      Extra Columns ({validationError.details.extraColumns.length}):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {validationError.details.extraColumns.map((col, idx) => (
                        <code key={idx} style={{ 
                          background: '#fef3c7', 
                          padding: '2px 6px', 
                          borderRadius: '3px',
                          color: '#92400e',
                          fontSize: '10px',
                          fontFamily: 'Inter, monospace'
                        }}>
                          {col}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                {validationError.details.warnings && validationError.details.warnings.length > 0 && (
                  <div style={{ 
                    background: '#fffbeb',
                    padding: '10px 12px',
                    borderRadius: '4px',
                    marginBottom: '10px',
                    border: '1px solid #fbbf24'
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: '6px', color: '#92400e', fontSize: '10px' }}>
                      Warnings:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px', color: '#78350f', fontSize: '10px', lineHeight: '1.5' }}>
                      {validationError.details.warnings.map((warning, idx) => (
                        <li key={idx} style={{ marginBottom: '2px' }}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Show hint if provided */}
            {validationError.hint && (
              <div style={{ 
                padding: '8px 12px',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '4px',
                fontSize: '10px',
                color: '#92400e',
                marginBottom: '10px',
                textAlign: 'left',
                lineHeight: '1.4'
              }}>
                <span style={{ fontWeight: 600 }}>Tip: </span>{validationError.hint}
              </div>
            )}

            <button 
              onClick={() => {
                setValidationError(null);
                handleUploadAnother();
              }}
              style={{ 
                fontSize: '10px', 
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                padding: '8px 16px',
                background: '#025043',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Reset & Try Again
            </button>
          </div>
        )}

        {/* Show generic error message for non-validation errors */}
        {uploadStatus === 'error' && !validationError && !isProcessing && activeTab === 'upload-profile' && (
          <div style={{
            margin: '12px 0',
            padding: '16px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            textAlign: 'center',
            fontFamily: 'Inter, sans-serif'
          }}>
            <div style={{ 
              fontSize: '12px', 
              fontWeight: 600, 
              color: '#991b1b', 
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}>
              <span style={{ fontSize: '14px' }}>✕</span>
              Upload Failed
            </div>
            <div style={{ fontSize: '10px', color: '#7f1d1d', marginBottom: '12px', lineHeight: '1.4' }}>
              There was an error uploading your file. Please try again.
            </div>
            <button 
              onClick={handleUploadAnother}
              style={{ 
                fontSize: '10px', 
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                padding: '8px 16px',
                background: '#025043',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Reset & Try Again
            </button>
          </div>
        )}
        
        {/* Show upload dropzone when not processing */}
        {!isProcessing && activeTab === 'upload-profile' ? (
          hasWritePermission('file') ? (
            selectedProject ? (
              <FileDropzone 
                key={`profile-${dropzoneKey}`}
                onFileDrop={handleFileDrop}
                onBatchFileDrop={handleBatchFileDrop}
                acceptedFileTypes={['.csv', '.json', '.parquet', '.xlsx', '.xml', '.zip', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.gz', '.7z', '.sas7bdat', '.xpt', '.avro', '.dat']}
                maxSizeMB={25}
                multiple={true}
                externalStatus={uploadStatus}
              />
            ) : (
              <div className="dropzone-placeholder">
                <FiUpload size={48} className="dropzone-placeholder-icon" />
                <p className="dropzone-placeholder-text">Please select a project above to upload files</p>
              </div>
            )
          ) : (
            <div className="access-denied-message">
              <p>You do not have permission to upload files. Please contact an administrator.</p>
            </div>
          )
        ) : null}
        
        {/* Drop file tab (separate from upload-profile) */}
        {activeTab === 'drop-file' && (
          hasWritePermission('file_drop') ? (
            <>
              {/* Vendor Project and Connection Selection */}
              <div className="upload-form-section">
                <div className="dropfile-form-container">
                  {/* Project Selection */}
                  <div className="dropfile-field">
                    <div className="dropfile-label-row">
                      <label htmlFor="vendor-project-select" className="upload-form-label">
                        Project: <span className="required-indicator">*</span>
                      </label>
                      {!loadingVendorProjects && vendorProjects.length === 0 && (
                        <button 
                          className="gps-btn gps-btn--primary gps-btn--sm"
                          onClick={loadVendorProjects}
                        >
                          Load My Projects
                        </button>
                      )}
                    </div>
                    <select 
                      id="vendor-project-select"
                      className="gps-form-select"
                      value={selectedVendorProject || ''}
                      onChange={(e) => {
                        const projectId = Number(e.target.value);
                        setSelectedVendorProject(projectId);
                        if (projectId) {
                          loadVendorConnections(projectId);
                        } else {
                          setVendorConnections([]);
                          setSelectedConnection(null);
                        }
                      }}
                      disabled={loadingVendorProjects || vendorProjects.length === 0}
                    >
                      {loadingVendorProjects ? (
                        <option>Loading projects...</option>
                      ) : vendorProjects.length === 0 ? (
                        <option>Click "Load My Projects" to view your accessible projects</option>
                      ) : (
                        <>
                          <option value="">Select a project...</option>
                          {vendorProjects.map(project => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>

                  {/* Connection Selection */}
                  {selectedVendorProject && (
                    <div className="dropfile-field">
                      <label htmlFor="vendor-connection-select" className="upload-form-label">
                        Connection: <span className="required-indicator">*</span>
                      </label>
                      <select 
                        id="vendor-connection-select"
                        className="gps-form-select"
                        value={selectedConnection || ''}
                        onChange={(e) => {
                          setSelectedConnection(e.target.value);
                          setShowFolderBrowser(false);
                          setBrowseFolders([]);
                        }}
                        disabled={loadingConnections || vendorConnections.length === 0}
                      >
                        {loadingConnections ? (
                          <option>Loading connections...</option>
                        ) : vendorConnections.length === 0 ? (
                          <option>No connections available for this project</option>
                        ) : (
                          <>
                            <option value="">Select a connection...</option>
                            {vendorConnections.map(conn => {
                              const connId = conn.id || conn.connection_id;
                              return (
                                <option key={connId} value={connId}>
                                  {conn.name} ({conn.type.toUpperCase()})
                                </option>
                              );
                            })}
                          </>
                        )}
                      </select>
                    </div>
                  )}

                  {/* Connection Details and Folder Browser */}
                  {selectedConnection && (
                    <div className="connection-details-box">
                      {(() => {
                        const conn = vendorConnections.find(c => (c.id || c.connection_id) === selectedConnection);
                        if (!conn) return null;
                        return (
                          <>
                            <div className="connection-path-info">
                              <strong>Upload Path:</strong> {conn.path || conn.drop_location_path || 'root'}
                            </div>
                            <button 
                              className="gps-btn gps-btn--secondary gps-btn--sm"
                              onClick={() => {
                                setShowFolderBrowser(!showFolderBrowser);
                                if (!showFolderBrowser && browseFolders.length === 0) {
                                  browseFoldersInConnection(selectedConnection, '');
                                }
                              }}
                            >
                              {showFolderBrowser ? 'Hide' : 'Browse'} Folders
                            </button>
                          </>
                        );
                      })()}

                      {/* Folder Browser */}
                      {showFolderBrowser && (
                        <div className="folder-browser">
                          {browsePrefix && (
                            <div className="folder-breadcrumb">
                              <button 
                                className="gps-btn gps-btn--secondary gps-btn--sm"
                                onClick={() => {
                                  const parts = browsePrefix.split('/').filter(p => p);
                                  parts.pop();
                                  const newPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
                                  browseFoldersInConnection(selectedConnection, newPrefix);
                                }}
                              >
                                ← Back
                              </button>
                              <span className="folder-path-info">
                                Current: <span className="folder-path-value">/{browsePrefix}</span>
                              </span>
                            </div>
                          )}
                          {browseFolders.length === 0 ? (
                            <div className="folder-empty-state">
                              No items found
                            </div>
                          ) : (
                            <div className="folder-list">
                              {browseFolders.filter(item => item.type === 'folder').map((folder, idx) => (
                                <div 
                                  key={idx}
                                  className="folder-item"
                                  onClick={() => browseFoldersInConnection(selectedConnection, folder.path)}
                                >
                                  <FiFolder />
                                  <span>{folder.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>

              {selectedVendorProject && selectedConnection ? (
                <>
                  <FileDropzone 
                    key={`drop-${dropzoneKey}`}
                    onFileDrop={handleDropFile}
                    onBatchFileDrop={handleBatchFileDrop}
                    acceptedFileTypes={['.csv', '.json', '.parquet', '.xlsx', '.xml', '.zip', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.gz', '.7z', '.sas7bdat', '.xpt', '.avro', '.dat']}
                    maxSizeMB={25}
                    multiple={true}
                    virusScan={uploadedFile?.virusScan}
                    externalStatus={uploadStatus}
                  />
                  
                  {/* Reset button for drop file tab */}
                  {(uploadStatus === 'success' || uploadStatus === 'error') && (
                    <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                      <button 
                        className="btn btn-secondary"
                        onClick={handleUploadAnother}
                      >
                        Reset / Upload Another File
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div style={{
                  padding: '3rem',
                  border: '2px dashed #ccc',
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#999',
                  background: '#f9f9f9'
                }}>
                  <FiUpload size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <p style={{ fontSize: '1.1rem', margin: 0 }}>
                    {!selectedVendorProject ? 'Please select a project above to continue' : 'Please select a connection to upload files'}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="access-denied-message">
              <p>You do not have permission to drop files. Please contact an administrator.</p>
            </div>
          )
        )}
        
        {/* Bulk Profiling tab */}
        {activeTab === 'bulk-profiling' && (
          <BulkProfilingTab selectedProject={selectedProject} />
        )}
        
        {uploadStatus === 'success' && uploadedFile && activeTab === 'upload-profile' && !isProcessing && !batchResults && (
          <>
            <div className="upload-success-actions">
              <button 
                className="btn btn-primary"
                onClick={handleViewProfile}
              >
                View File Profile
              </button>
              <button 
                className="btn btn-secondary"
                onClick={handleUploadAnother}
              >
                Upload Another File
              </button>
            </div>
          </>
        )}
        
        {/* Batch Upload Results Summary */}
        {batchResults && activeTab === 'upload-profile' && !isProcessing && (
          <div style={{
            margin: '2rem 0',
            padding: '1.5rem',
            background: batchResults.successCount === batchResults.total ? '#f0fdf4' : 
                        batchResults.successCount === 0 ? '#fef2f2' : '#fefce8',
            border: `2px solid ${batchResults.successCount === batchResults.total ? '#10b981' : 
                                  batchResults.successCount === 0 ? '#ef4444' : '#f59e0b'}`,
            borderRadius: '8px'
          }}>
            <h3 style={{ 
              margin: '0 0 1rem 0', 
              color: batchResults.successCount === batchResults.total ? '#065f46' : 
                     batchResults.successCount === 0 ? '#991b1b' : '#92400e'
            }}>
              Batch Upload Complete
            </h3>
            
            <div style={{ 
              fontSize: '1.1rem', 
              fontWeight: 'bold', 
              marginBottom: '1rem',
              color: '#1f2937'
            }}>
              {batchResults.successCount} of {batchResults.total} files uploaded successfully
              {batchResults.failedCount > 0 && ` • ${batchResults.failedCount} failed`}
            </div>
            
            {/* File-by-file results */}
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '1rem',
              marginBottom: '1.5rem'
            }}>
              {batchResults.results.map((result, index) => (
                <div key={index} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.5rem',
                  borderBottom: index < batchResults.results.length - 1 ? '1px solid #f3f4f6' : 'none'
                }}>
                  <span style={{ 
                    marginRight: '0.75rem', 
                    fontSize: '1.2rem'
                  }}>
                    {result.success ? '✅' : '❌'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', color: '#374151' }}>
                      {result.filename}
                    </div>
                    {!result.success && result.error && (
                      <div style={{ fontSize: '0.875rem', color: '#ef4444', marginTop: '0.25rem' }}>
                        {result.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              {batchResults.successCount > 0 && (
                <button 
                  className="btn btn-primary"
                  onClick={() => navigate('/file-catalog')}
                  style={{ flex: 1 }}
                >
                  View File Catalog
                </button>
              )}
              <button 
                className="btn btn-secondary"
                onClick={handleUploadAnother}
                style={{ flex: 1 }}
              >
                Upload More Files
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default FileUpload;