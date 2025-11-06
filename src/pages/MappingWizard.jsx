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
  FiPlay,
  FiChevronDown,
  FiChevronUp,
  FiFolder,
  FiShield
} from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import TableBasedMapper from '../components/TableBasedMapper';
import S3FolderBrowser from '../components/S3FolderBrowser';
import { getQualityRules } from '../api/qualityRulesService';
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
  'if': { label: 'IF Condition', params: ['operator', 'compareValue', 'thenValue', 'elseValue'] },
  'case_when': { label: 'CASE WHEN (Multiple Conditions)', params: ['conditions', 'defaultValue'] },
  'CASE': { label: 'Conditional (CASE WHEN - Legacy)', params: ['condition', 'when_true', 'when_false'] },
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
  const [maxCompletedStep, setMaxCompletedStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savedMappingId, setSavedMappingId] = useState(null);
  const [executeModalOpen, setExecuteModalOpen] = useState(false);

  // Step 1: Basic Info & Source
  const [mappingName, setMappingName] = useState('');
  const [mappingDescription, setMappingDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [subProjectId, setSubProjectId] = useState('');
  const [subProjects, setSubProjects] = useState([]);
  const [loadingSubProjects, setLoadingSubProjects] = useState(false);
  const [sourceConnectionId, setSourceConnectionId] = useState('');
  const [connections, setConnections] = useState([]);
  const [vendorAgreements, setVendorAgreements] = useState([]);
  const [selectedVendorAgreement, setSelectedVendorAgreement] = useState('');

  // Step 2: Source Configuration
  const [sourceType, setSourceType] = useState('files');
  const [filePath, setFilePath] = useState('');
  const [fileNamePattern, setFileNamePattern] = useState('*.csv');
  const [matchingFiles, setMatchingFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null); // 'success', 'error', or null
  const [schemaDriftHandling, setSchemaDriftHandling] = useState('none'); // 'abort', 'alert', 'none'
  const [schemaDriftDetected, setSchemaDriftDetected] = useState(false);
  const [schemaDriftMessage, setSchemaDriftMessage] = useState('');
  const [sourceOwner, setSourceOwner] = useState('');
  const [availableSourceOwners, setAvailableSourceOwners] = useState([]);
  const [loadingSourceOwners, setLoadingSourceOwners] = useState(false);

  // Step 3: Schema & Field Mapping
  const [schema, setSchema] = useState([]);
  const [fieldMappings, setFieldMappings] = useState([]);
  const [variables, setVariables] = useState([]);
  const [loadingSchema, setLoadingSchema] = useState(false);

  // Step 4: Target & Anomaly Rules
  const [targetConnectionId, setTargetConnectionId] = useState('');
  const [targetFilePath, setTargetFilePath] = useState('');
  const [targetFileName, setTargetFileName] = useState('');
  const [targetFileFormat, setTargetFileFormat] = useState('csv');
  const [targetOwner, setTargetOwner] = useState('');
  const [dataStewards, setDataStewards] = useState([]);
  const [loadingDataStewards, setLoadingDataStewards] = useState(false);
  const [anomalyRulesExpanded, setAnomalyRulesExpanded] = useState(false);
  const [anomalyRules, setAnomalyRules] = useState([
    { metric: 'numeric_deviation', threshold: 10, enabled: true },
    { metric: 'row_count_anomaly', threshold: 20, enabled: true },
    { metric: 'null_spike', threshold: 15, enabled: true },
    { metric: 'type_mismatch', threshold: 5, enabled: true }
  ]);
  
  // Quality Rules
  const [qualityRules, setQualityRules] = useState([]);
  const [selectedQualityRules, setSelectedQualityRules] = useState([]);
  const [loadingQualityRules, setLoadingQualityRules] = useState(false);

  // S3 Browse modals
  const [showSourceBrowse, setShowSourceBrowse] = useState(false);
  const [showTargetBrowse, setShowTargetBrowse] = useState(false);

  // Schema validation modal
  const [showSchemaValidationModal, setShowSchemaValidationModal] = useState(false);
  const [schemaValidationResult, setSchemaValidationResult] = useState(null);

  useEffect(() => {
    fetchConnections();
    fetchProjects();
    fetchVendorAgreements();
    fetchDataStewards();
    if (isEditMode) {
      loadMapping();
    }
  }, [mappingId]);
  
  // Fetch quality rules when projectId changes
  useEffect(() => {
    if (projectId) {
      fetchQualityRules();
    } else {
      setQualityRules([]);
    }
  }, [projectId]);

  // Fetch sub-projects when projectId changes
  useEffect(() => {
    if (projectId) {
      fetchSubProjects(projectId);
    } else {
      setSubProjects([]);
      setSubProjectId('');
    }
  }, [projectId]);

  // Fetch source owners when projectId or selectedVendorAgreement changes
  useEffect(() => {
    if (selectedVendorAgreement) {
      // Populate from vendor agreement contacts
      const agreement = vendorAgreements.find(a => a.id === parseInt(selectedVendorAgreement));
      if (agreement) {
        const owners = [];
        if (agreement.primary_contact_email) {
          owners.push({
            email: agreement.primary_contact_email,
            label: `${agreement.primary_contact_email} (Primary)`,
            type: 'primary'
          });
        }
        if (agreement.secondary_contact_email) {
          owners.push({
            email: agreement.secondary_contact_email,
            label: `${agreement.secondary_contact_email} (Secondary)`,
            type: 'secondary'
          });
        }
        setAvailableSourceOwners(owners);
      }
    } else if (projectId) {
      // Fetch project members
      fetchProjectMembers(projectId);
    } else {
      setAvailableSourceOwners([]);
    }
  }, [projectId, selectedVendorAgreement, vendorAgreements]);

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

  const fetchProjects = async () => {
    try {
      setLoadingProjects(true);
      // Fetch all projects user has access to (both internal and external/vendor projects)
      const response = await axios.get(`${API_BASE_URL}/api/projects`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setProjects(response.data || []);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchSubProjects = async (selectedProjectId) => {
    if (!selectedProjectId) {
      setSubProjects([]);
      return;
    }
    
    try {
      setLoadingSubProjects(true);
      const response = await axios.get(`${API_BASE_URL}/api/projects/${selectedProjectId}/sub-projects`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setSubProjects(response.data.subProjects || []);
    } catch (err) {
      console.error('Error fetching sub-projects:', err);
      setSubProjects([]);
    } finally {
      setLoadingSubProjects(false);
    }
  };

  const fetchVendorAgreements = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/vendor-agreements`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      // Extract hasApprovePermission flag from response (indicates user can see all agreements)
      const hasApprovePermission = response.data.hasApprovePermission || false;
      
      // Filter for approved and locked agreements only (ready for ETL use)
      // Accept both 'fully_approved' (legacy) and 'governance_approved' (new status after governance approval)
      const approvedAgreements = (response.data.agreements || response.data || []).filter(
        agreement => (agreement.approval_status === 'fully_approved' || agreement.approval_status === 'governance_approved') && agreement.is_locked
      );
      
      console.log(`Fetched ${approvedAgreements.length} approved vendor agreements (hasApprovePermission: ${hasApprovePermission})`);
      setVendorAgreements(approvedAgreements);
    } catch (err) {
      console.error('Error fetching vendor agreements:', err);
      setVendorAgreements([]);
    }
  };

  const fetchProjectMembers = async (selectedProjectId) => {
    if (!selectedProjectId) {
      setAvailableSourceOwners([]);
      return;
    }
    
    try {
      setLoadingSourceOwners(true);
      const response = await axios.get(`${API_BASE_URL}/api/projects/${selectedProjectId}/members`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      const members = (response.data || []).map(member => ({
        email: member.email,
        label: member.full_name ? `${member.full_name} (${member.email})` : member.email,
        type: 'member'
      }));
      
      setAvailableSourceOwners(members);
    } catch (err) {
      console.error('Error fetching project members:', err);
      setAvailableSourceOwners([]);
    } finally {
      setLoadingSourceOwners(false);
    }
  };

  const fetchDataStewards = async () => {
    try {
      setLoadingDataStewards(true);
      const response = await axios.get(`${API_BASE_URL}/api/users/data-stewards`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setDataStewards(response.data.dataStewards || []);
    } catch (err) {
      console.error('Error fetching data stewards:', err);
      setDataStewards([]);
    } finally {
      setLoadingDataStewards(false);
    }
  };
  
  const fetchQualityRules = async () => {
    if (!projectId) return;
    
    try {
      setLoadingQualityRules(true);
      const response = await getQualityRules({ project_id: projectId });
      setQualityRules(response.rules || []);
    } catch (err) {
      console.error('Error fetching quality rules:', err);
      setQualityRules([]);
    } finally {
      setLoadingQualityRules(false);
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
      setMappingDescription(mapping.description || '');
      setProjectId(mapping.project_id || '');
      setSubProjectId(mapping.sub_project_id || '');
      setSourceConnectionId(mapping.source_connection_id || '');
      setSelectedVendorAgreement(mapping.vendor_agreement_id ? String(mapping.vendor_agreement_id) : '');
      setSourceType(mapping.source_type || 'files');
      setFilePath(mapping.file_path || '');
      setFileNamePattern(mapping.file_name_pattern || mapping.source_file_pattern || mapping.file_pattern || '*.csv');
      setSourceOwner(mapping.source_owner || '');
      setTargetConnectionId(mapping.target_connection_id || '');
      setTargetFilePath(mapping.target_file_path || '');
      setTargetFileName(mapping.target_file_name || '');
      setTargetFileFormat(mapping.target_file_format || 'csv');
      setTargetOwner(mapping.target_owner || '');
      setFieldMappings(mapping.field_mappings || []);
      setVariables(mapping.variables || []);
      setSchemaDriftHandling(mapping.schema_drift_handling || 'none');
      
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
      
      // Load quality rule IDs if present
      if (mapping.quality_rule_ids && Array.isArray(mapping.quality_rule_ids)) {
        setSelectedQualityRules(mapping.quality_rule_ids);
      } else {
        setSelectedQualityRules([]);
      }
      
      // Determine max completed step based on available data
      let maxStep = 1; // Step 1 always completed if mapping exists
      if (mapping.file_name_pattern || mapping.source_file_pattern || mapping.file_pattern) {
        maxStep = 2; // Step 2 completed if file pattern exists
      }
      if (mapping.field_mappings && mapping.field_mappings.length > 0) {
        maxStep = 3; // Step 3 completed if field mappings exist
      }
      if (mapping.target_connection_id || mapping.target_file_name || mapping.target_file_format || 
          (mapping.anomaly_rules && Object.keys(mapping.anomaly_rules).length > 0)) {
        maxStep = 4; // Step 4 completed if target settings or anomaly rules exist
      }
      setMaxCompletedStep(maxStep);
      
      // Always start at Step 1 in edit mode for consistent user experience
      setCurrentStep(1);
      
      // If we're jumping to step 3 (field mappings), extract schema automatically
      if (maxStep >= 3 && (!mapping.field_mappings || mapping.field_mappings.length === 0)) {
        await extractSchema();
      } else if (maxStep >= 3) {
        // Schema exists from field mappings, reconstruct it
        const schemaFromMappings = mapping.field_mappings.map(fm => ({
          name: fm.source_field,
          type: 'string' // Default type, can be enhanced later
        }));
        setSchema(schemaFromMappings);
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
      
      // Determine which connection to use
      let connectionIdToUse = sourceConnectionId;
      
      // If vendor agreement is selected, we need to get the vendor_connection_id
      if (selectedVendorAgreement) {
        const agreement = vendorAgreements.find(a => a.id === parseInt(selectedVendorAgreement));
        if (agreement && agreement.vendor_connection_id) {
          connectionIdToUse = agreement.vendor_connection_id;
        }
      }
      
      const response = await axios.post(
        `${API_BASE_URL}/api/transformations/extract-schema`,
        { 
          source_connection_id: connectionIdToUse || null,
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

      // If vendor agreement is selected, validate schema against contract
      if (selectedVendorAgreement) {
        console.log('🔍 Starting vendor schema validation...', {
          agreementId: selectedVendorAgreement,
          connectionId: connectionIdToUse,
          filePath,
          fileNamePattern,
          driftHandling: schemaDriftHandling
        });
        
        try {
          const validationResponse = await axios.post(
            `${API_BASE_URL}/api/transformations/validate-vendor-schema`,
            {
              vendor_agreement_id: selectedVendorAgreement,
              source_connection_id: connectionIdToUse,
              file_path: filePath,
              file_name_pattern: fileNamePattern
            },
            {
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            }
          );

          const validationResult = validationResponse.data;
          console.log('✅ Validation response received:', validationResult);

          // Show validation modal if there's schema drift
          if (validationResult.schemaDrift) {
            console.log('⚠️ Schema drift detected!', {
              differences: validationResult.differences,
              driftHandling: schemaDriftHandling
            });
            
            setSchemaValidationResult(validationResult);
            setShowSchemaValidationModal(true);
            
            // If abort mode, block navigation
            if (schemaDriftHandling === 'abort') {
              console.log('🛑 Abort mode - blocking navigation');
              setError('Schema validation failed: File schema does not match vendor contract. Fix the schema issues before proceeding.');
              return false;
            }
          } else {
            console.log('✅ No schema drift detected');
          }
        } catch (validationErr) {
          console.error('❌ Schema validation error:', validationErr);
          console.error('Error details:', validationErr.response?.data);
          // Don't fail the extraction if validation fails, just log it
        }
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
      // Step 1 validation: Basic info
      if (!mappingName.trim()) {
        setError('Please enter a mapping name');
        return;
      }
      if (!projectId) {
        setError('Please select a project');
        return;
      }
      if (!sourceConnectionId && !selectedVendorAgreement) {
        setError('Please select either a source connection or a vendor agreement');
        return;
      }
      if (sourceConnectionId && selectedVendorAgreement) {
        setError('Please select only one: either a source connection or a vendor agreement');
        return;
      }
      setError(null);
      setCurrentStep(2);
      setMaxCompletedStep(Math.max(maxCompletedStep, 2));
    } else if (currentStep === 2) {
      // Step 2 validation: Source configuration - both filePath and fileNamePattern required
      if (!filePath || !filePath.trim()) {
        setError('Please enter a file path. Use "/" for root directory or specify a folder path (e.g., /data/input/)');
        return;
      }
      if (!fileNamePattern.trim()) {
        setError('Please enter a file name or pattern');
        return;
      }
      
      // Try to extract schema before moving to step 3
      setError(null);
      const schemaExtracted = await extractSchema();
      if (!schemaExtracted) {
        // Error already set by extractSchema
        return;
      }
      
      setCurrentStep(3);
      setMaxCompletedStep(Math.max(maxCompletedStep, 3));
    } else if (currentStep === 3) {
      // Step 3 validation: Field mappings required
      if (!fieldMappings || fieldMappings.length === 0) {
        setError('Please configure at least one field mapping');
        return;
      }
      
      // Check if at least one field mapping has a source field
      const hasValidMapping = fieldMappings.some(mapping => mapping.source_field && mapping.source_field.trim());
      if (!hasValidMapping) {
        setError('Please configure at least one valid field mapping with a source field');
        return;
      }
      
      setError(null);
      setCurrentStep(4);
      setMaxCompletedStep(Math.max(maxCompletedStep, 4));
    }
  };

  const handleBack = () => {
    setCurrentStep(Math.max(1, currentStep - 1));
    setError(null);
  };

  const handleSaveDraft = async () => {
    // Minimal validation for draft - only name and project required
    if (!mappingName.trim()) {
      setError('Please enter a mapping name to save draft');
      return;
    }
    if (!projectId) {
      setError('Please select a project to save draft');
      return;
    }
    
    await handleSave(true);
  };

  const handleSave = async (isDraft = false) => {
    // Prevent duplicate saves
    if (loading) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
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
        description: mappingDescription || null,
        project_id: projectId,
        sub_project_id: subProjectId || null,
        source_connection_id: selectedVendorAgreement ? null : (sourceConnectionId || null),
        vendor_agreement_id: selectedVendorAgreement ? parseInt(selectedVendorAgreement) : null,
        source_type: sourceType,
        file_path: filePath,
        file_name_pattern: fileNamePattern,
        source_owner: sourceOwner || null,
        target_connection_id: targetConnectionId || null,
        target_file_path: targetFilePath || null,
        target_file_name: targetFileName || null,
        target_file_format: targetFileFormat || 'csv',
        target_owner: targetOwner || null,
        field_mappings: fieldMappings,
        variables: variables,
        anomaly_rules: anomalyRulesObject,
        schema_drift_handling: schemaDriftHandling,
        source_schema: schema || null,
        quality_rule_ids: selectedQualityRules && selectedQualityRules.length > 0 ? selectedQualityRules : null
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
      setError(null);
      // Don't change currentStep - let the wizard stay where it is
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
      setExecuteModalOpen(true);
    } catch (err) {
      console.error('Error executing mapping:', err);
      setError(err.response?.data?.error || 'Failed to execute mapping');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteModalOk = () => {
    setExecuteModalOpen(false);
    navigate('/jobs');
  };

  const handleExecuteModalCancel = () => {
    setExecuteModalOpen(false);
    navigate('/mappings');
  };

  const renderStepIndicator = () => {
    const steps = [
      { num: 1, label: 'Mapping Configuration' },
      { num: 2, label: 'Source Configuration' },
      { num: 3, label: 'Expressions' },
      { num: 4, label: 'Target & Rules' }
    ];

    const handleStepClick = (stepNum) => {
      // Only allow navigation to completed steps in edit mode
      if (isEditMode && stepNum <= maxCompletedStep) {
        setCurrentStep(stepNum);
        setError(null);
      }
    };

    return (
      <div className="wizard-steps">
        {steps.map((step, idx) => {
          const isClickable = isEditMode && step.num <= maxCompletedStep;
          
          return (
            <React.Fragment key={step.num}>
              <div 
                className={`wizard-step ${currentStep === step.num ? 'active' : ''} ${currentStep > step.num ? 'completed' : ''} ${isClickable ? 'clickable' : ''}`}
                onClick={() => handleStepClick(step.num)}
                style={{ cursor: isClickable ? 'pointer' : 'default' }}
              >
                <div className="step-number">
                  {currentStep > step.num ? <FiCheckCircle /> : step.num}
                </div>
                <div className="step-label">{step.label}</div>
              </div>
              {idx < steps.length - 1 && <div className="step-connector"></div>}
            </React.Fragment>
          );
        })}
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
              onClick={() => navigate('/jobs')}
              disabled={loading}
            >
              View Transformation Jobs
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => {
                setSaveSuccess(false);
                setCurrentStep(1);
              }}
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
            <h2><FiServer /> Mapping Configuration</h2>
            
            {/* Project and Sub Project side-by-side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Project *</label>
                <select
                  className="form-control"
                  value={projectId}
                  onChange={(e) => {
                    const value = e.target.value ? parseInt(e.target.value) : '';
                    setProjectId(value);
                    setSubProjectId('');
                  }}
                  disabled={loadingProjects}
                >
                  <option value="">Select a project...</option>
                  {projects.map(proj => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name}
                    </option>
                  ))}
                </select>
                <small className="form-help">Select the project for this mapping</small>
              </div>

              <div className="form-group">
                <label>Sub Project</label>
                <select
                  className="form-control"
                  value={subProjectId}
                  onChange={(e) => setSubProjectId(e.target.value ? parseInt(e.target.value) : '')}
                  disabled={!projectId || loadingSubProjects || subProjects.length === 0}
                >
                  <option value="">Select a sub-project (optional)...</option>
                  {subProjects.map(sp => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </select>
                <small className="form-help">
                  {!projectId ? 'Select a project first' : subProjects.length === 0 ? 'No sub-projects available' : 'Optional: Select a sub-project'}
                </small>
              </div>
            </div>

            {/* Name and Description side-by-side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                <label>Mapping Description</label>
                <input
                  type="text"
                  className="form-control"
                  value={mappingDescription}
                  onChange={(e) => setMappingDescription(e.target.value)}
                  placeholder="Brief description of this mapping"
                />
              </div>
            </div>

            {/* Source Connection and Vendor Contract side-by-side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Source Connection</label>
                <select
                  className="form-control"
                  value={sourceConnectionId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSourceConnectionId(value);
                    if (value) {
                      setSelectedVendorAgreement('');
                    }
                  }}
                  disabled={!!selectedVendorAgreement}
                >
                  <option value="">Select source connection</option>
                  {connections.filter(c => c.connection_direction === 'source').map(conn => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name} ({conn.type})
                    </option>
                  ))}
                </select>
                <small className="form-help">
                  {selectedVendorAgreement ? 'Disabled (Vendor Contract selected)' : 'Select where to read files from'}
                </small>
              </div>

              <div className="form-group">
                <label>Vendor Contract</label>
                <select
                  className="form-control"
                  value={selectedVendorAgreement}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedVendorAgreement(value);
                    if (value) {
                      setSourceConnectionId('');
                      // Auto-populate from agreement
                      const agreement = vendorAgreements.find(a => a.id === parseInt(value));
                      if (agreement) {
                        // Auto-populate file name pattern from agreement (read-only)
                        if (agreement.file_name) {
                          setFileNamePattern(agreement.file_name);
                        }
                        // Auto-populate file path from connection configuration
                        if (agreement.vendor_connection_path) {
                          setFilePath(agreement.vendor_connection_path);
                        } else if (agreement.drop_location_path) {
                          // Fallback to drop_location_path if vendor_connection_path not available
                          let path = agreement.drop_location_path;
                          if (!path.startsWith('/')) {
                            path = '/' + path;
                          }
                          setFilePath(path);
                        }
                        // Enable schema drift handling for vendor agreements
                        setSchemaDriftHandling('alert');
                      }
                    } else {
                      // Clear auto-populated fields when vendor contract is deselected
                      setSchemaDriftHandling('none');
                    }
                  }}
                  disabled={!!sourceConnectionId}
                >
                  <option value="">Select Vendor Contract</option>
                  {vendorAgreements.map(agreement => (
                    <option key={agreement.id} value={agreement.id}>
                      {agreement.vendor_name} ({agreement.agreement_code})
                    </option>
                  ))}
                </select>
                <small className="form-help">
                  {sourceConnectionId ? 'Disabled (Source Connection selected)' : 'Or select an approved vendor contract'}
                </small>
              </div>
            </div>

            {/* Show resolved connections when vendor contract is selected */}
            {selectedVendorAgreement && (() => {
              const agreement = vendorAgreements.find(a => a.id === parseInt(selectedVendorAgreement));
              if (!agreement) return null;
              
              return (
                <div className="info-box" style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <FiCheckCircle style={{ color: '#16a34a' }} />
                    <strong style={{ color: '#15803d' }}>Vendor Contract Selected - Source Connection Auto-Populated</strong>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #d1fae5' }}>
                    <small style={{ color: '#6b7280', display: 'block', marginBottom: '4px' }}>Source Connection:</small>
                    <div style={{ color: '#15803d', fontWeight: '500' }}>
                      {agreement.vendor_connection_name || 'Vendor Connection'}
                    </div>
                    <small style={{ color: '#6b7280' }}>ID: {agreement.vendor_connection_id?.substring(0, 8)}...</small>
                  </div>
                  <small style={{ color: '#15803d', display: 'block', marginTop: '8px' }}>
                    The source connection is managed by the vendor contract. You can specify your own target connection in Step 4.
                  </small>
                </div>
              );
            })()}

            {!selectedVendorAgreement && (
              <div className="info-box" style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: '4px' }}>
                <small style={{ color: '#1e40af' }}>
                  <strong>Note:</strong> Select either a Source Connection OR a Vendor Contract (mutually exclusive). 
                  When a Vendor Contract is selected, the source connection will be auto-populated from the contract.
                </small>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Source Configuration */}
        {currentStep === 2 && (
          <div className="wizard-step-content">
            <h2><FiFilter /> Source Configuration</h2>
            
            <div className="form-group">
              <label>File Path *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-control"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="e.g., /year/month/day/ or use / for root"
                  style={{ flex: 1 }}
                />
                {(sourceConnectionId || selectedVendorAgreement) && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowSourceBrowse(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                  >
                    <FiFolder /> Browse
                  </button>
                )}
              </div>
              <small className="form-help">
                Required. Use "/" for root directory or specify a folder path (e.g., /data/input/).<br/>
                Example: If file exists in bucket 'source' → subfolder 'year' → 'month' → 'day', enter: <code>/year/month/day/</code>
              </small>
            </div>

            <div className="form-group">
              <label>File Name/Pattern * {selectedVendorAgreement && <span style={{ color: '#6b7280', fontWeight: 'normal' }}>(From Vendor Contract)</span>}</label>
              <input
                type="text"
                className="form-control"
                value={fileNamePattern}
                onChange={(e) => setFileNamePattern(e.target.value)}
                placeholder="e.g., sales_data.csv or sales_*.csv"
                readOnly={!!selectedVendorAgreement}
                style={selectedVendorAgreement ? { backgroundColor: '#f9fafb', cursor: 'not-allowed' } : {}}
              />
              <small className="form-help">
                {selectedVendorAgreement ? (
                  <>Auto-populated from vendor contract and locked for editing to ensure compliance.</>
                ) : (
                  <>
                    Enter a complete file name (e.g., <code>data.csv</code>) or a pattern with wildcards.<br/>
                    Wildcards: <code>*</code> matches multiple characters, <code>?</code> matches single character.<br/>
                    File existence will be validated during job execution.
                  </>
                )}
              </small>
            </div>

            {/* Source Owner Field */}
            <div className="form-group">
              <label>Source File Owner</label>
              <select
                className="form-control"
                value={sourceOwner}
                onChange={(e) => setSourceOwner(e.target.value)}
                disabled={loadingSourceOwners || availableSourceOwners.length === 0}
              >
                <option value="">Select source file owner (optional)...</option>
                {availableSourceOwners.map((owner, idx) => (
                  <option key={idx} value={owner.email}>
                    {owner.label}
                  </option>
                ))}
              </select>
              <small className="form-help">
                {loadingSourceOwners ? (
                  'Loading available owners...'
                ) : selectedVendorAgreement ? (
                  'Select from vendor agreement contacts (primary or secondary)'
                ) : projectId ? (
                  'Select from project members'
                ) : (
                  'Select a project or vendor agreement first'
                )}
              </small>
            </div>

            {/* Schema Drift Handling - Available for all source types */}
            <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                <FiAlertCircle style={{ color: '#d97706' }} />
                <strong>Schema Drift Handling *</strong>
              </div>
              
              {/* Radio Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Abort Job Option */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }} onClick={() => setSchemaDriftHandling('abort')}>
                  <input
                    type="radio"
                    name="schemaDriftHandling"
                    value="abort"
                    checked={schemaDriftHandling === 'abort'}
                    onChange={(e) => setSchemaDriftHandling(e.target.value)}
                    style={{ marginTop: '2px', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', marginBottom: '2px' }}>
                      Abort Job - Stop processing if schema mismatch is detected
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      Recommended for critical data pipelines where schema consistency is mandatory
                    </div>
                  </div>
                </div>

                {/* Alert & Process Option */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }} onClick={() => setSchemaDriftHandling('alert')}>
                  <input
                    type="radio"
                    name="schemaDriftHandling"
                    value="alert"
                    checked={schemaDriftHandling === 'alert'}
                    onChange={(e) => setSchemaDriftHandling(e.target.value)}
                    style={{ marginTop: '2px', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', marginBottom: '2px' }}>
                      Alert & Process - Log warning and continue processing
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      Schema drift will be logged in the Monitor with "Fail" status, but the job will continue
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Schema & Field Mapping */}
        {currentStep === 3 && (
          <div className="wizard-step-content">
            <h2><FiEdit /> Expressions</h2>
            
            {loadingSchema ? (
              <LoadingSpinner size="small" />
            ) : schema && schema.length > 0 ? (
              <TableBasedMapper
                schema={schema}
                fieldMappings={fieldMappings}
                variables={variables}
                onMappingsChange={(mappings, vars) => {
                  setFieldMappings(mappings);
                  if (vars !== undefined) {
                    setVariables(vars);
                  }
                }}
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
                onChange={(e) => setTargetConnectionId(e.target.value)}
              >
                <option value="">Select target connection</option>
                {connections.filter(c => c.connection_direction === 'target').map(conn => (
                  <option key={conn.id} value={conn.id}>
                    {conn.name} ({conn.type})
                  </option>
                ))}
              </select>
              <small className="form-help">
                Select where to write transformed files
              </small>
            </div>

            <div className="form-group">
              <label>Target File Path</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-control"
                  value={targetFilePath}
                  onChange={(e) => setTargetFilePath(e.target.value)}
                  placeholder="e.g., /output/processed/ or /data/transform/"
                  style={{ flex: 1 }}
                />
                {targetConnectionId && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowTargetBrowse(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                  >
                    <FiFolder /> Browse
                  </button>
                )}
              </div>
              <small className="form-help">
                Optional: Specify folder path for output files (e.g., <code>/folder/</code>). Leave empty for root directory.
              </small>
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
                Examples: <code>sales_&lt;current_date&gt;.csv</code> → <code>sales_20251018.csv</code> | <code>data_&lt;current_timestamp&gt;.json</code> → <code>data_1729267200.json</code>
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

            <div className="form-group">
              <label>Target File Owner (Data Steward)</label>
              <select
                className="form-control"
                value={targetOwner}
                onChange={(e) => setTargetOwner(e.target.value)}
                disabled={loadingDataStewards || dataStewards.length === 0}
              >
                <option value="">Select target file owner (optional)...</option>
                {dataStewards.map((steward) => (
                  <option key={steward.id} value={steward.email}>
                    {steward.full_name ? `${steward.full_name} (${steward.email})` : steward.email}
                  </option>
                ))}
              </select>
              <small className="form-help">
                {loadingDataStewards ? (
                  'Loading data stewards...'
                ) : dataStewards.length === 0 ? (
                  'No data stewards available'
                ) : (
                  'Select a data steward to own the target file'
                )}
              </small>
            </div>

            {/* Quality Rules Selection */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FiShield /> Quality Rules (Optional)
              </label>
              {loadingQualityRules ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>
                  <LoadingSpinner />
                  <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Loading quality rules...</p>
                </div>
              ) : qualityRules.length > 0 ? (
                <div style={{ 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '4px', 
                  padding: '0.75rem',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  backgroundColor: '#f8fafc'
                }}>
                  {qualityRules.map(rule => (
                    <label key={rule.id} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      padding: '0.5rem',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      transition: 'background-color 0.2s',
                      marginBottom: '0.25rem'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <input
                        type="checkbox"
                        checked={selectedQualityRules.includes(rule.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedQualityRules([...selectedQualityRules, rule.id]);
                          } else {
                            setSelectedQualityRules(selectedQualityRules.filter(id => id !== rule.id));
                          }
                        }}
                        style={{ marginRight: '0.75rem', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                          {rule.rule_name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          Type: {rule.rule_type} {rule.target_column && `• Column: ${rule.target_column}`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div style={{ 
                  padding: '1rem', 
                  textAlign: 'center', 
                  color: '#64748b',
                  border: '1px dashed #cbd5e1',
                  borderRadius: '4px',
                  backgroundColor: '#f8fafc'
                }}>
                  {projectId ? 'No quality rules available for this project' : 'Select a project to view quality rules'}
                </div>
              )}
              <small className="form-help">
                {selectedQualityRules.length > 0 
                  ? `${selectedQualityRules.length} rule(s) selected. Rules will run during processing.`
                  : 'Select quality rules to validate this data. Rules will run during processing.'
                }
              </small>
            </div>

            <h3 
              onClick={() => setAnomalyRulesExpanded(!anomalyRulesExpanded)}
              style={{ 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                userSelect: 'none'
              }}
            >
              <FiSettings /> 
              Anomaly Detection Rules
              {anomalyRulesExpanded ? <FiChevronUp /> : <FiChevronDown />}
            </h3>
            {anomalyRulesExpanded && (
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
            )}
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
              <>
                <button 
                  className="btn btn-outline-success" 
                  onClick={handleSaveDraft} 
                  disabled={loading}
                  style={{ marginRight: '0.5rem' }}
                >
                  <FiSave /> {loading ? 'Saving...' : 'Save Draft'}
                </button>
                {isEditMode && (
                  <button className="btn btn-success" onClick={handleSave} disabled={loading} style={{ marginRight: '0.5rem' }}>
                    <FiSave /> {loading ? 'Saving...' : 'Save'}
                  </button>
                )}
                <button className="btn btn-primary" onClick={handleNext}>
                  Next <FiArrowRight />
                </button>
              </>
            ) : (
              <>
                <button 
                  className="btn btn-outline-success" 
                  onClick={handleSaveDraft} 
                  disabled={loading}
                  style={{ marginRight: '0.5rem' }}
                >
                  <FiSave /> {loading ? 'Saving...' : 'Save Draft'}
                </button>
                <button className="btn btn-success" onClick={handleSave} disabled={loading}>
                  <FiSave /> {loading ? 'Saving...' : 'Save Mapping'}
                </button>
              </>
            )}
          </div>
        </div>
      </Card>
      )}

      {/* Execution Confirmation Modal */}
      {executeModalOpen && (
        <div className="modal-overlay" onClick={handleExecuteModalCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Job Submitted</h2>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <FiCheckCircle size={48} style={{ color: '#10b981', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, marginBottom: '0.5rem' }}>
                    The mapping job has been submitted for execution.
                  </p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em' }}>
                    Do you want to view the Jobs page to check on the status of execution?
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleExecuteModalCancel}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleExecuteModalOk}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Source Path Browse Modal */}
      {showSourceBrowse && (() => {
        // Determine which connection to use for browsing
        let connectionIdForBrowsing = sourceConnectionId;
        if (selectedVendorAgreement) {
          const agreement = vendorAgreements.find(a => a.id === parseInt(selectedVendorAgreement));
          if (agreement && agreement.vendor_connection_id) {
            connectionIdForBrowsing = agreement.vendor_connection_id;
          }
        }
        
        return (
          <div className="modal-overlay" onClick={() => setShowSourceBrowse(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
              <div className="modal-header">
                <h2><FiFolder /> Browse Source Path</h2>
                <button className="btn-icon" onClick={() => setShowSourceBrowse(false)}>×</button>
              </div>
              <div className="modal-body" style={{ padding: 0 }}>
                <S3FolderBrowser
                  connectionId={connectionIdForBrowsing}
                  initialPath={filePath || '/'}
                  onSelectPath={(path) => {
                    setFilePath(path);
                    setShowSourceBrowse(false);
                  }}
                  onSelectFile={(filename, path) => {
                    setFilePath(path);
                    setFileNamePattern(filename);
                    setShowSourceBrowse(false);
                  }}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Target Path Browse Modal */}
      {showTargetBrowse && (
        <div className="modal-overlay" onClick={() => setShowTargetBrowse(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h2><FiFolder /> Browse Target Path</h2>
              <button className="btn-icon" onClick={() => setShowTargetBrowse(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <S3FolderBrowser
                connectionId={targetConnectionId}
                initialPath={targetFilePath || '/'}
                onSelectPath={(path) => {
                  setTargetFilePath(path);
                  setShowTargetBrowse(false);
                }}
                onSelectFile={(filename, path) => {
                  setTargetFilePath(path);
                  setTargetFileName(filename);
                  setShowTargetBrowse(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Schema Validation Results Modal */}
      {showSchemaValidationModal && schemaValidationResult && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', height: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flex: '0 0 10%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem' }}>
              <h2 style={{ fontSize: '1rem', margin: 0 }}><FiAlertCircle style={{ color: '#dc2626' }} /> Schema Validation Issues Detected</h2>
              <button className="btn-icon" onClick={() => setShowSchemaValidationModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '1rem', flex: '1 1 80%', overflowY: 'auto' }}>
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ color: '#64748b', marginBottom: '0.75rem', fontSize: '0.8rem' }}>
                  The file schema does not match the vendor contract schema. Please review the differences below:
                </p>
              </div>

              {/* Missing Required Columns */}
              {schemaValidationResult.missingColumns && schemaValidationResult.missingColumns.length > 0 && (
                <div style={{ marginBottom: '0.75rem', padding: '0.75rem', backgroundColor: '#fff5f5', border: '2px solid #e53e3e', borderRadius: '6px' }}>
                  <h4 style={{ 
                    color: '#c53030', 
                    fontSize: '0.8rem', 
                    marginTop: 0,
                    marginBottom: '0.4rem',
                    fontWeight: 'bold'
                  }}>
                    Missing Required Columns ({schemaValidationResult.missingColumns.length})
                  </h4>
                  <ul style={{ 
                    margin: '0 0 0 1.2rem', 
                    padding: 0,
                    color: '#742a2a',
                    fontSize: '0.75rem'
                  }}>
                    {schemaValidationResult.missingColumns.map((col, idx) => (
                      <li key={idx} style={{ marginBottom: '0.2rem' }}>
                        <strong>{col}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Additional Errors */}
              {schemaValidationResult.errors && schemaValidationResult.errors.length > 0 && (
                <div style={{ marginBottom: '0.75rem', padding: '0.75rem', backgroundColor: '#fff5f5', border: '2px solid #e53e3e', borderRadius: '6px' }}>
                  <h4 style={{ 
                    color: '#c53030', 
                    fontSize: '0.8rem', 
                    marginTop: 0,
                    marginBottom: '0.4rem',
                    fontWeight: 'bold'
                  }}>
                    Additional Issues
                  </h4>
                  <ul style={{ 
                    margin: '0 0 0 1.2rem', 
                    padding: 0,
                    color: '#742a2a',
                    fontSize: '0.75rem'
                  }}>
                    {schemaValidationResult.errors.map((error, idx) => (
                      <li key={idx} style={{ marginBottom: '0.2rem' }}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings (Extra Columns) */}
              {schemaValidationResult.warnings && schemaValidationResult.warnings.length > 0 && (
                <div style={{ 
                  marginBottom: '0.75rem',
                  padding: '0.75rem',
                  background: '#fffaf0',
                  border: '1px solid #f6ad55',
                  borderRadius: '6px'
                }}>
                  <h4 style={{ 
                    color: '#c05621', 
                    fontSize: '0.75rem', 
                    marginTop: 0,
                    marginBottom: '0.4rem',
                    fontWeight: 'bold'
                  }}>
                    Warnings ({schemaValidationResult.warnings.length})
                  </h4>
                  <ul style={{ 
                    margin: '0 0 0 1.2rem', 
                    padding: 0,
                    color: '#744210',
                    fontSize: '0.7rem'
                  }}>
                    {schemaValidationResult.warnings.map((warning, idx) => (
                      <li key={idx} style={{ marginBottom: '0.2rem' }}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                {/* Expected Schema */}
                <div>
                  <h3 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <FiCheckCircle style={{ color: '#10b981', fontSize: '0.9rem' }} />
                    Contract Schema (Expected)
                  </h3>
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.6rem', maxHeight: '200px', overflowY: 'auto' }}>
                    {schemaValidationResult.expectedSchema && schemaValidationResult.expectedSchema.length > 0 ? (
                      <table style={{ width: '100%', fontSize: '0.7rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ textAlign: 'left', padding: '0.3rem', fontWeight: '600' }}>Column</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schemaValidationResult.expectedSchema.map((field, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '0.3rem' }}>{field.name || field.column_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.7rem' }}>No schema defined</p>
                    )}
                  </div>
                </div>

                {/* Actual Schema */}
                <div>
                  <h3 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <FiAlertCircle style={{ color: schemaValidationResult.schemaDrift ? '#dc2626' : '#10b981', fontSize: '0.9rem' }} />
                    Actual File Schema
                  </h3>
                  <div style={{ 
                    backgroundColor: schemaValidationResult.schemaDrift ? '#fef2f2' : '#f0fdf4', 
                    border: schemaValidationResult.schemaDrift ? '1px solid #fecaca' : '1px solid #bbf7d0', 
                    borderRadius: '4px', 
                    padding: '0.6rem', 
                    maxHeight: '200px', 
                    overflowY: 'auto' 
                  }}>
                    {schemaValidationResult.actualSchema && schemaValidationResult.actualSchema.length > 0 ? (
                      <table style={{ width: '100%', fontSize: '0.7rem' }}>
                        <thead>
                          <tr style={{ borderBottom: schemaValidationResult.schemaDrift ? '1px solid #fecaca' : '1px solid #bbf7d0' }}>
                            <th style={{ textAlign: 'left', padding: '0.3rem', fontWeight: '600' }}>Column</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schemaValidationResult.actualSchema.map((field, idx) => (
                            <tr key={idx} style={{ borderBottom: schemaValidationResult.schemaDrift ? '1px solid #fee2e2' : '1px solid #dcfce7' }}>
                              <td style={{ padding: '0.3rem' }}>{field.name || field.column_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.7rem' }}>No schema extracted</p>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#fffbeb', border: '1px solid #fbbf24', borderRadius: '4px' }}>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#92400e' }}>
                  <strong>Note:</strong> Your Schema Drift Handling policy is set to <strong>{schemaDriftHandling}</strong>. 
                  {schemaDriftHandling === 'abort' && ' This schema mismatch will cause job execution to fail.'}
                  {schemaDriftHandling === 'alert' && ' This schema mismatch will be logged with a "Fail" status, but the job will continue processing.'}
                  {schemaDriftHandling === 'none' && ' This schema mismatch will not affect job execution.'}
                </p>
              </div>
            </div>
            <div className="modal-footer" style={{ flex: '0 0 10%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 1.5rem' }}>
              <button className="btn btn-primary" onClick={() => setShowSchemaValidationModal(false)} style={{ fontSize: '0.85rem' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
  );
}

export default MappingWizard;
