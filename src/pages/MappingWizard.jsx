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
  FiEdit,
  FiEdit2,
  FiPlay,
  FiChevronDown,
  FiChevronUp,
  FiFolder,
  FiShield,
  FiGitBranch
} from 'react-icons/fi';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import TableBasedMapper from '../components/TableBasedMapper';
import RdmLookupStep from '../components/RdmLookupStep';
import CrosswalkLookupStep from '../components/CrosswalkLookupStep';
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
  const [agreementFileSchemas, setAgreementFileSchemas] = useState([]);
  const [selectedFileSchema, setSelectedFileSchema] = useState(null);
  const [loadingFileSchemas, setLoadingFileSchemas] = useState(false);

  // Step 2: Source Configuration
  const [sourceType, setSourceType] = useState('files');
  const [filePath, setFilePath] = useState('');
  const [fileNamePattern, setFileNamePattern] = useState('*.csv');
  const [matchingFiles, setMatchingFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null); // 'success', 'error', or null
  const [schemaDriftHandling, setSchemaDriftHandling] = useState('none'); // 'abort', 'alert', 'none'
  const [sourceOwner, setSourceOwner] = useState('');
  const [availableSourceOwners, setAvailableSourceOwners] = useState([]);
  const [loadingSourceOwners, setLoadingSourceOwners] = useState(false);

  // Step 3: Schema & Field Mapping
  const [schema, setSchema] = useState([]);
  const [fieldMappings, setFieldMappings] = useState([]);
  const [variables, setVariables] = useState([]);
  const [piiColumns, setPiiColumns] = useState([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  
  // RDM Lookup toggle and configuration
  const [rdmDatasetEnabled, setRdmDatasetEnabled] = useState(false);
  const [rdmCrosswalkEnabled, setRdmCrosswalkEnabled] = useState(false);
  const [rdmStepOrder, setRdmStepOrder] = useState([]); // Track order of enabled RDM steps
  const [rdmDatasetConfig, setRdmDatasetConfig] = useState({});
  const [rdmCrosswalkConfig, setRdmCrosswalkConfig] = useState({});

  // Cumulative schema tracking
  const [cumulativeSchema, setCumulativeSchema] = useState([]);

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
  const [violationHandling, setViolationHandling] = useState('log_continue'); // 'log_continue' or 'log_abort'

  // S3 Browse modals
  const [showSourceBrowse, setShowSourceBrowse] = useState(false);
  const [showTargetBrowse, setShowTargetBrowse] = useState(false);

  // Schema validation modal
  const [showSchemaValidationModal, setShowSchemaValidationModal] = useState(false);
  const [schemaValidationResult, setSchemaValidationResult] = useState(null);

  // Recompute cumulative schema when mappings change
  useEffect(() => {
    const expressionsSchema = fieldMappings
      .filter(m => m.target_field)
      .map(m => ({ name: m.target_field, type: 'string' }));
    
    let cumulative = [...expressionsSchema];
    
    // Add dataset columns if enabled
    if (rdmDatasetEnabled && rdmDatasetConfig?.column_mappings) {
      const datasetCols = rdmDatasetConfig.column_mappings.map(m => ({
        name: m.targetColumn,
        type: m.dataType || 'string'
      }));
      cumulative = [...cumulative, ...datasetCols];
    }
    
    // Add crosswalk columns if enabled
    if (rdmCrosswalkEnabled && rdmCrosswalkConfig?.column_mappings) {
      const crosswalkCols = rdmCrosswalkConfig.column_mappings.map(m => ({
        name: m.targetColumn,
        type: m.dataType || 'string'
      }));
      cumulative = [...cumulative, ...crosswalkCols];
    }
    
    setCumulativeSchema(cumulative);
  }, [fieldMappings, rdmDatasetEnabled, rdmDatasetConfig, rdmCrosswalkEnabled, rdmCrosswalkConfig]);

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
  
  // Handlers for RDM toggle changes - track order of enabled steps
  const handleDatasetToggle = (enabled) => {
    setRdmDatasetEnabled(enabled);
    if (enabled) {
      // Add to order if not already present
      setRdmStepOrder(prev => prev.includes('dataset') ? prev : [...prev, 'dataset']);
    } else {
      // Remove from order
      setRdmStepOrder(prev => prev.filter(step => step !== 'dataset'));
    }
  };

  const handleCrosswalkToggle = (enabled) => {
    setRdmCrosswalkEnabled(enabled);
    if (enabled) {
      // Add to order if not already present
      setRdmStepOrder(prev => prev.includes('crosswalk') ? prev : [...prev, 'crosswalk']);
    } else {
      // Remove from order
      setRdmStepOrder(prev => prev.filter(step => step !== 'crosswalk'));
    }
  };

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
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        params: { status: 'active' } // Only show active contracts in Mapping Wizard
      });
      
      // Extract hasApprovePermission flag from response (indicates user can see all agreements)
      const hasApprovePermission = response.data.hasApprovePermission || false;
      
      // Filter for approved and locked agreements only (ready for ETL use)
      // Accept both 'fully_approved' (legacy) and 'governance_approved' (new status after governance approval)
      const approvedAgreements = (response.data.agreements || response.data || []).filter(
        agreement => (agreement.approval_status === 'fully_approved' || agreement.approval_status === 'governance_approved') && agreement.is_locked
      );
      
      console.log(`Fetched ${approvedAgreements.length} active approved vendor agreements (hasApprovePermission: ${hasApprovePermission})`);
      setVendorAgreements(approvedAgreements);
    } catch (err) {
      console.error('Error fetching vendor agreements:', err);
      setVendorAgreements([]);
    }
  };

  const extractPiiColumnsFromSchema = (schema) => {
    if (!schema) {
      return;
    }

    try {
      // Parse schema if it's a string
      let schemaArray = schema;
      if (typeof schema === 'string') {
        schemaArray = JSON.parse(schema);
      }

      // Ensure it's an array
      if (!Array.isArray(schemaArray)) {
        console.log('Schema is not an array, skipping PII extraction');
        return;
      }

      // Extract fields marked as PII
      const piiFields = schemaArray
        .filter(field => field.pii === true)
        .map(field => field.name)
        .filter(name => name);

      if (piiFields.length > 0) {
        console.log('Auto-populated PII columns from schema:', piiFields);
        setPiiColumns(piiFields);
      } else {
        console.log('No PII fields found in schema');
      }
    } catch (err) {
      console.error('Error extracting PII columns from schema:', err);
    }
  };

  const fetchAgreementFileSchemas = async (agreementId) => {
    if (!agreementId) {
      setAgreementFileSchemas([]);
      setSelectedFileSchema(null);
      return;
    }

    try {
      setLoadingFileSchemas(true);
      const response = await axios.get(
        `${API_BASE_URL}/api/vendor-agreements/${agreementId}/file-schemas`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );

      const fileSchemas = response.data.fileSchemas || [];
      setAgreementFileSchemas(fileSchemas);

      // If only one file schema, auto-select it
      if (fileSchemas.length === 1) {
        setSelectedFileSchema(fileSchemas[0]);
        setFileNamePattern(fileSchemas[0].file_name_pattern);
        // Auto-populate PII columns from schema
        extractPiiColumnsFromSchema(fileSchemas[0].schema);
      } else if (fileSchemas.length === 0) {
        // Fallback to old agreement.file_name if no file schemas
        setSelectedFileSchema(null);
      } else {
        // Multiple file schemas - user must select
        setSelectedFileSchema(null);
        setFileNamePattern('');
      }
    } catch (err) {
      console.error('Error fetching agreement file schemas:', err);
      setAgreementFileSchemas([]);
      setSelectedFileSchema(null);
    } finally {
      setLoadingFileSchemas(false);
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
      
      const members = (response.data.members || []).map(member => ({
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
      setPiiColumns(mapping.pii_columns || []);
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
      
      // Load violation handling strategy
      if (mapping.violation_handling) {
        setViolationHandling(mapping.violation_handling);
      } else {
        setViolationHandling('log_continue');
      }
      
      // Load RDM lookup configuration
      const tempRdmStepOrder = [];
      
      if (mapping.rdm_dataset_config) {
        // Parse if string, otherwise use as-is
        const datasetConfig = typeof mapping.rdm_dataset_config === 'string' 
          ? JSON.parse(mapping.rdm_dataset_config) 
          : mapping.rdm_dataset_config;
        setRdmDatasetConfig(datasetConfig);
        setRdmDatasetEnabled(true);
        tempRdmStepOrder.push('dataset');
      }
      
      if (mapping.rdm_crosswalk_config) {
        // Parse if string, otherwise use as-is
        const crosswalkConfig = typeof mapping.rdm_crosswalk_config === 'string'
          ? JSON.parse(mapping.rdm_crosswalk_config)
          : mapping.rdm_crosswalk_config;
        setRdmCrosswalkConfig(crosswalkConfig);
        setRdmCrosswalkEnabled(true);
        tempRdmStepOrder.push('crosswalk');
      }
      
      // Set the RDM step order based on loaded configs
      if (tempRdmStepOrder.length > 0) {
        setRdmStepOrder(tempRdmStepOrder);
      }
      
      // Determine max completed step based on available data (5-step model)
      let maxStep = 1; // Step 1 always completed if mapping exists
      if (mapping.file_name_pattern || mapping.source_file_pattern || mapping.file_pattern) {
        maxStep = 2; // Step 2 completed if file pattern exists
      }
      if (mapping.field_mappings && mapping.field_mappings.length > 0) {
        // If field mappings exist, allow access to Step 5 (Target & Rules)
        // This ensures backward compatibility and lets users complete the wizard
        maxStep = 5; 
      }
      // Note: Step 4 is RDM Lookup (optional/skippable) - will be marked complete when RDM config exists
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
              vendor_agreement_file_schema_id: selectedFileSchema?.id || null,
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
    const steps = getWizardSteps();
    const currentStepConfig = steps[currentStep - 1];

    if (currentStepConfig?.id === 'config') {
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
    } else if (currentStepConfig?.id === 'source') {
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
    } else if (currentStepConfig?.id === 'expressions') {
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
    } else if (currentStepConfig?.id === 'rdm' || currentStepConfig?.id === 'crosswalk') {
      // RDM and Crosswalk steps: Optional validation
      setError(null);
    }

    // Move to next step
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
      setMaxCompletedStep(Math.max(maxCompletedStep, currentStep + 1));
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
        vendor_agreement_file_schema_id: selectedFileSchema?.id || null,
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
        pii_columns: piiColumns || [],
        anomaly_rules: anomalyRulesObject,
        schema_drift_handling: schemaDriftHandling,
        source_schema: schema || null,
        quality_rule_ids: selectedQualityRules && selectedQualityRules.length > 0 ? selectedQualityRules : null,
        violation_handling: selectedQualityRules && selectedQualityRules.length > 0 ? violationHandling : null,
        rdm_lookup_enabled: rdmDatasetEnabled || rdmCrosswalkEnabled,
        rdm_dataset_config: rdmDatasetConfig || null,
        rdm_crosswalk_config: rdmCrosswalkConfig || null
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

  // Dynamic step configuration based on RDM toggles
  const getWizardSteps = () => {
    const steps = [
      { id: 'config', label: 'Mapping Configuration', component: 'config' },
      { id: 'source', label: 'Source Configuration', component: 'source' },
      { id: 'expressions', label: 'Expressions', component: 'expressions' },
    ];
    
    // Add RDM steps in the order they were enabled
    rdmStepOrder.forEach(stepType => {
      if (stepType === 'dataset' && rdmDatasetEnabled) {
        steps.push({ id: 'rdm-dataset', label: 'Dataset Lookup', component: 'rdm-dataset' });
      } else if (stepType === 'crosswalk' && rdmCrosswalkEnabled) {
        steps.push({ id: 'rdm-crosswalk', label: 'Crosswalk Lookup', component: 'rdm-crosswalk' });
      }
    });
    
    steps.push({ id: 'target', label: 'Target & Rules', component: 'target' });
    
    return steps;
  };

  const renderStepIndicator = () => {
    const steps = getWizardSteps().map((step, idx) => ({
      num: idx + 1,
      id: step.id,
      label: step.label
    }));

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
                style={{ 
                  cursor: isClickable ? 'pointer' : 'default'
                }}
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
            <h2 style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}><FiServer /> Mapping Configuration</h2>
            
            {/* Project and Sub Project side-by-side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label htmlFor="project-select" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>Project *</label>
                <select
                  id="project-select"
                  className="form-control"
                  value={projectId}
                  onChange={(e) => {
                    const value = e.target.value ? parseInt(e.target.value) : '';
                    setProjectId(value);
                    setSubProjectId('');
                  }}
                  disabled={loadingProjects}
                  style={{ fontSize: '10px', fontFamily: 'Inter' }}
                >
                  <option value="">Select a project...</option>
                  {projects.map(proj => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name}
                    </option>
                  ))}
                </select>
                <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>Select the project for this mapping</small>
              </div>

              <div className="form-group">
                <label htmlFor="subproject-select" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>Sub Project</label>
                <select
                  id="subproject-select"
                  className="form-control"
                  value={subProjectId}
                  onChange={(e) => setSubProjectId(e.target.value ? parseInt(e.target.value) : '')}
                  disabled={!projectId || loadingSubProjects || subProjects.length === 0}
                  style={{ fontSize: '10px', fontFamily: 'Inter' }}
                >
                  <option value="">Select a sub-project (optional)...</option>
                  {subProjects.map(sp => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </select>
                <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>
                  {!projectId ? 'Select a project first' : subProjects.length === 0 ? 'No sub-projects available' : 'Optional: Select a sub-project'}
                </small>
              </div>
            </div>

            {/* Name and Description side-by-side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label htmlFor="mapping-name" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>Mapping Name *</label>
                <input
                  id="mapping-name"
                  type="text"
                  className="form-control"
                  value={mappingName}
                  onChange={(e) => setMappingName(e.target.value)}
                  placeholder="e.g., Daily Sales Data Transformation"
                  style={{ fontSize: '10px', fontFamily: 'Inter' }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="mapping-description" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>Mapping Description</label>
                <input
                  id="mapping-description"
                  type="text"
                  className="form-control"
                  value={mappingDescription}
                  onChange={(e) => setMappingDescription(e.target.value)}
                  placeholder="Brief description of this mapping"
                  style={{ fontSize: '10px', fontFamily: 'Inter' }}
                />
              </div>
            </div>

            {/* Source Connection and Vendor Contract side-by-side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label htmlFor="source-connection" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>Source Connection</label>
                <select
                  id="source-connection"
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
                  style={{ fontSize: '10px', fontFamily: 'Inter' }}
                >
                  <option value="">Select source connection</option>
                  {connections.map(conn => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name} ({conn.type})
                    </option>
                  ))}
                </select>
                <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>
                  {selectedVendorAgreement ? 'Disabled (Vendor Contract selected)' : 'Select where to read files from'}
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="vendor-contract" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>Vendor Contract</label>
                <select
                  id="vendor-contract"
                  className="form-control"
                  value={selectedVendorAgreement}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedVendorAgreement(value);
                    if (value) {
                      setSourceConnectionId('');
                      // Fetch file schemas for the selected agreement
                      fetchAgreementFileSchemas(value);
                      
                      // Auto-populate from agreement
                      const agreement = vendorAgreements.find(a => a.id === parseInt(value));
                      if (agreement) {
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
                      setAgreementFileSchemas([]);
                      setSelectedFileSchema(null);
                    }
                  }}
                  disabled={!!sourceConnectionId}
                  style={{ fontSize: '10px', fontFamily: 'Inter' }}
                >
                  <option value="">Select Vendor Contract</option>
                  {vendorAgreements.map(agreement => (
                    <option key={agreement.id} value={agreement.id}>
                      {agreement.vendor_name} ({agreement.agreement_code})
                    </option>
                  ))}
                </select>
                <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>
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
                    <FiCheckCircle style={{ color: '#16a34a', fontSize: '10px' }} />
                    <strong style={{ color: '#15803d', fontSize: '10px', fontFamily: 'Inter' }}>Vendor Contract Selected - Source Connection Auto-Populated</strong>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #d1fae5' }}>
                    <small style={{ color: '#6b7280', display: 'block', marginBottom: '4px', fontSize: '10px', fontFamily: 'Inter' }}>Source Connection:</small>
                    <div style={{ color: '#15803d', fontWeight: '500', fontSize: '10px', fontFamily: 'Inter' }}>
                      {agreement.vendor_connection_name || 'Vendor Connection'}
                    </div>
                    <small style={{ color: '#6b7280', fontSize: '10px', fontFamily: 'Inter' }}>ID: {agreement.vendor_connection_id?.substring(0, 8)}...</small>
                  </div>
                  <small style={{ color: '#15803d', display: 'block', marginTop: '8px', fontSize: '10px', fontFamily: 'Inter' }}>
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
            <h2 style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}><FiFilter /> Source Configuration</h2>
            
            {/* File Path and File Name/Pattern in one row */}
            <div className="form-group">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'start' }}>
                <div>
                  <label htmlFor="file-path" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>File Path *</label>
                  <input
                    id="file-path"
                    type="text"
                    className="form-control"
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    placeholder="e.g., /year/month/day/ or use / for root"
                    style={{ fontSize: '10px', fontFamily: 'Inter' }}
                  />
                  <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>
                    Required. Use "/" for root directory or specify a folder path (e.g., /data/input/).<br/>
                    Example: If file exists in bucket 'source' → subfolder 'year' → 'month' → 'day', enter: <code>/year/month/day/</code>
                  </small>
                </div>
                <div>
                  <label htmlFor="file-name-pattern" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>File Name/Pattern *</label>
                  <input
                    id="file-name-pattern"
                    type="text"
                    className="form-control"
                    value={fileNamePattern}
                    onChange={(e) => setFileNamePattern(e.target.value)}
                    placeholder="e.g., sales_data.csv or sales_*.csv"
                    readOnly={!!selectedVendorAgreement}
                    style={selectedVendorAgreement ? { backgroundColor: '#f9fafb', cursor: 'not-allowed', fontSize: '10px', fontFamily: 'Inter' } : { fontSize: '10px', fontFamily: 'Inter' }}
                  />
                  <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>
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
                <div style={{ paddingTop: '24px' }}>
                  {(sourceConnectionId || selectedVendorAgreement) && (
                    <button
                      type="button"
                      className="btn btn-browse"
                      onClick={() => setShowSourceBrowse(true)}
                    >
                      <FiFolder /> Browse
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* File Schema Selection - Show when agreement has multiple files */}
            {selectedVendorAgreement && agreementFileSchemas.length > 1 && (
              <div className="form-group">
                  <label htmlFor="file-pattern-select" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>Select File Pattern * <span style={{ color: '#6b7280', fontWeight: 'normal', textTransform: 'none' }}>(From Vendor Contract)</span></label>
                  <select
                    id="file-pattern-select"
                    className="form-control"
                    value={selectedFileSchema?.id || ''}
                    onChange={(e) => {
                    const schemaId = parseInt(e.target.value);
                    const schema = agreementFileSchemas.find(s => s.id === schemaId);
                    setSelectedFileSchema(schema);
                    if (schema) {
                      setFileNamePattern(schema.file_name_pattern);
                      // Auto-populate PII columns from schema
                      extractPiiColumnsFromSchema(schema.schema);
                    }
                  }}
                  style={{ marginBottom: '0.5rem', fontSize: '10px', fontFamily: 'Inter' }}
                >
                  <option value="">Select a file pattern...</option>
                  {agreementFileSchemas.map(schema => (
                    <option key={schema.id} value={schema.id}>
                      {schema.file_name_pattern}
                      {schema.file_description && ` - ${schema.file_description}`}
                    </option>
                  ))}
                </select>
                
                {/* Show governance badges for selected file */}
                {selectedFileSchema && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    {selectedFileSchema.contains_pii && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        backgroundColor: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #fca5a5',
                        borderRadius: '4px'
                      }}>
                        <FiAlertCircle size={12} /> Contains PII
                      </span>
                    )}
                    {selectedFileSchema.data_classification && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        backgroundColor: selectedFileSchema.data_classification === 'Highly Confidential' ? '#fef2f2' :
                                       selectedFileSchema.data_classification === 'Confidential' ? '#fff7ed' :
                                       selectedFileSchema.data_classification === 'Internal' ? '#eff6ff' : '#f0fdf4',
                        color: selectedFileSchema.data_classification === 'Highly Confidential' ? '#dc2626' :
                               selectedFileSchema.data_classification === 'Confidential' ? '#ea580c' :
                               selectedFileSchema.data_classification === 'Internal' ? '#2563eb' : '#16a34a',
                        border: `1px solid ${selectedFileSchema.data_classification === 'Highly Confidential' ? '#fca5a5' :
                                             selectedFileSchema.data_classification === 'Confidential' ? '#fed7aa' :
                                             selectedFileSchema.data_classification === 'Internal' ? '#bfdbfe' : '#86efac'}`,
                        borderRadius: '4px'
                      }}>
                        {selectedFileSchema.data_classification}
                      </span>
                    )}
                    {selectedFileSchema.file_type && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px'
                      }}>
                        {selectedFileSchema.file_type.toUpperCase()}
                      </span>
                    )}
                  </div>
                )}
                
                <small className="form-help">
                  {selectedFileSchema 
                    ? 'File pattern selected from vendor contract with governance settings applied.'
                    : 'Select which file pattern to use for this mapping job.'}
                </small>
              </div>
            )}


            {/* Source Owner Field */}
            <div className="form-group">
              <label htmlFor="source-owner" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>Source File Owner</label>
              <select
                id="source-owner"
                className="form-control"
                value={sourceOwner}
                onChange={(e) => setSourceOwner(e.target.value)}
                disabled={loadingSourceOwners}
                style={{ fontSize: '10px', fontFamily: 'Inter' }}
              >
                <option value="">Select source file owner (optional)...</option>
                {availableSourceOwners.map((owner, idx) => (
                  <option key={idx} value={owner.email}>
                    {owner.label}
                  </option>
                ))}
              </select>
              <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>
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

            {/* Schema Drift Handling and RDM Lookup Toggles side-by-side */}
            <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* Schema Drift Handling Panel */}
              <div style={{ padding: '1rem', backgroundColor: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                  <FiAlertCircle style={{ color: '#d97706', fontSize: '10px' }} />
                  <strong style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 700 }}>Schema Drift Handling *</strong>
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
                      <div style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 700, marginBottom: '2px' }}>
                        Abort Job - Stop processing if schema mismatch is detected
                      </div>
                      <div style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 400, color: '#6b7280' }}>
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
                      <div style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 700, marginBottom: '2px' }}>
                        Alert & Process - Log warning and continue processing
                      </div>
                      <div style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 400, color: '#6b7280' }}>
                        Schema drift will be logged in the Monitor with "Fail" status, but the job will continue
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RDM Lookup Toggles Panel */}
              <div style={{ padding: '1rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                {/* Panel Header */}
                <div style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 700, marginBottom: '1rem' }}>
                  Enable RDM Lookup
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Enable Dataset Lookup Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px', fontSize: '10px', fontFamily: 'Inter' }}>
                        Enable Datasets Lookup
                      </div>
                    <div style={{ fontSize: '10px', color: '#6b7280', fontFamily: 'Inter', fontWeight: 400 }}>
                      Join datasets from RDM to enrich records
                    </div>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '28px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={rdmDatasetEnabled}
                      onChange={(e) => handleDatasetToggle(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: rdmDatasetEnabled ? 'hsl(221, 83%, 53%)' : '#ccc',
                      transition: '0.4s',
                      borderRadius: '28px'
                    }}>
                      <span style={{
                        position: 'absolute',
                        content: '""',
                        height: '22px',
                        width: '22px',
                        left: rdmDatasetEnabled ? '25px' : '3px',
                        bottom: '3px',
                        backgroundColor: 'white',
                        transition: '0.4s',
                        borderRadius: '50%'
                      }}></span>
                    </span>
                  </label>
                </div>

                {/* Enable Crosswalk Lookup Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px', fontSize: '10px', fontFamily: 'Inter' }}>
                      Enable Crosswalks Lookup
                    </div>
                    <div style={{ fontSize: '10px', color: '#6b7280', fontFamily: 'Inter', fontWeight: 400 }}>
                      Apply crosswalk mappings to transform values
                    </div>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '28px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={rdmCrosswalkEnabled}
                      onChange={(e) => handleCrosswalkToggle(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: rdmCrosswalkEnabled ? 'hsl(221, 83%, 53%)' : '#ccc',
                      transition: '0.4s',
                      borderRadius: '28px'
                    }}>
                      <span style={{
                        position: 'absolute',
                        content: '""',
                        height: '22px',
                        width: '22px',
                        left: rdmCrosswalkEnabled ? '25px' : '3px',
                        bottom: '3px',
                        backgroundColor: 'white',
                        transition: '0.4s',
                        borderRadius: '50%'
                      }}></span>
                    </span>
                  </label>
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
              <>
                <TableBasedMapper
                  schema={schema}
                  fieldMappings={fieldMappings}
                  variables={variables}
                  piiColumns={piiColumns}
                  onMappingsChange={(mappings, vars, pii) => {
                    setFieldMappings(mappings);
                    if (vars !== undefined) {
                      setVariables(vars);
                    }
                    if (pii !== undefined) {
                      setPiiColumns(pii);
                    }
                  }}
                />
              </>
            ) : (
              <div className="alert alert-warning">
                <FiAlertCircle /> No schema available. Please go back and validate the file pattern first.
              </div>
            )}
          </div>
        )}

        {/* Dataset Lookup Step (dynamic) */}
        {getWizardSteps()[currentStep - 1]?.id === 'rdm-dataset' && (
          <div className="wizard-step-content">
            <h2><FiServer /> Dataset Lookup</h2>
            <RdmLookupStep
              datasetConfig={rdmDatasetConfig}
              crosswalkConfig={rdmCrosswalkConfig}
              schema={schema}
              datasetEnabled={rdmDatasetEnabled}
              crosswalkEnabled={false}
              onDatasetConfigChange={setRdmDatasetConfig}
              onCrosswalkConfigChange={setRdmCrosswalkConfig}
              onDatasetEnabledChange={handleDatasetToggle}
              onCrosswalkEnabledChange={handleCrosswalkToggle}
            />
          </div>
        )}

        {/* Crosswalk Lookup Step (dynamic) */}
        {getWizardSteps()[currentStep - 1]?.id === 'rdm-crosswalk' && (
          <div className="wizard-step-content">
            <h2><FiGitBranch /> Crosswalk Lookup</h2>
            <CrosswalkLookupStep
              crosswalkConfig={rdmCrosswalkConfig}
              schema={cumulativeSchema}
              onCrosswalkConfigChange={setRdmCrosswalkConfig}
            />
          </div>
        )}

        {/* Target & Rules Step */}
        {getWizardSteps()[currentStep - 1]?.id === 'target' && (
          <div className="wizard-step-content">
            <h2 style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}><FiTarget /> Target Connection & Quality Rules</h2>
            
            {/* Target Connection Section - 2 Column Grid */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(2, 1fr)', 
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="target-connection-select" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>Target Connection</label>
                <select
                  id="target-connection-select"
                  className="form-control"
                  value={targetConnectionId}
                  onChange={(e) => setTargetConnectionId(e.target.value)}
                  style={{ fontSize: '10px', fontFamily: 'Inter' }}
                >
                  <option value="">Select target connection</option>
                  {connections.map(conn => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name} ({conn.type})
                    </option>
                  ))}
                </select>
                <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>
                  Select where to write transformed files
                </small>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="target-file-path-input" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>Target File Path</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    id="target-file-path-input"
                    type="text"
                    className="form-control"
                    value={targetFilePath}
                    onChange={(e) => setTargetFilePath(e.target.value)}
                    placeholder="e.g., /output/processed/"
                    style={{ flex: 1, fontSize: '10px', fontFamily: 'Inter' }}
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
                <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>
                  Optional: Specify folder path (e.g., <code>/folder/</code>)
                </small>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="target-file-name-input" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>Target File Name</label>
                <input
                  id="target-file-name-input"
                  type="text"
                  className="form-control"
                  value={targetFileName}
                  onChange={(e) => setTargetFileName(e.target.value)}
                  placeholder="e.g., output_<current_date>.csv"
                  style={{ fontSize: '10px', fontFamily: 'Inter' }}
                />
                <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>
                  Use <code>&lt;current_date&gt;</code> or <code>&lt;current_timestamp&gt;</code>
                </small>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="target-file-format-select" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>Target File Format</label>
                <select
                  id="target-file-format-select"
                  className="form-control"
                  value={targetFileFormat}
                  onChange={(e) => setTargetFileFormat(e.target.value)}
                  style={{ fontSize: '10px', fontFamily: 'Inter' }}
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                  <option value="xml">XML</option>
                  <option value="xlsx">Excel (XLSX)</option>
                  <option value="parquet">Parquet</option>
                </select>
                <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>Choose output file format</small>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="target-owner-select" style={{ fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>Target File Owner (Data Steward)</label>
              <select
                id="target-owner-select"
                className="form-control"
                value={targetOwner}
                onChange={(e) => setTargetOwner(e.target.value)}
                disabled={loadingDataStewards || dataStewards.length === 0}
                style={{ fontSize: '10px', fontFamily: 'Inter' }}
              >
                <option value="">Select target file owner (optional)...</option>
                {dataStewards.map((steward) => (
                  <option key={steward.id} value={steward.email}>
                    {steward.full_name ? `${steward.full_name} (${steward.email})` : steward.email}
                  </option>
                ))}
              </select>
              <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>
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
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>
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
                    <div key={rule.id} style={{ 
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
                    onClick={() => {
                      if (selectedQualityRules.includes(rule.id)) {
                        setSelectedQualityRules(selectedQualityRules.filter(id => id !== rule.id));
                      } else {
                        setSelectedQualityRules([...selectedQualityRules, rule.id]);
                      }
                    }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedQualityRules.includes(rule.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (e.target.checked) {
                            setSelectedQualityRules([...selectedQualityRules, rule.id]);
                          } else {
                            setSelectedQualityRules(selectedQualityRules.filter(id => id !== rule.id));
                          }
                        }}
                        style={{ marginRight: '0.75rem', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <span style={{ fontWeight: 500, fontSize: '10px', fontFamily: 'Inter', marginRight: '0.5rem' }}>
                        {rule.rule_name}
                      </span>
                      <span style={{ fontSize: '10px', fontFamily: 'Inter', color: '#64748b' }}>
                        Type: {rule.rule_type}
                      </span>
                    </div>
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

            {/* Quality Violation Handling */}
            {selectedQualityRules.length > 0 && (
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '10px', fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase' }}>
                  <FiAlertCircle /> Quality Violation Handling
                </label>
                <select
                  className="form-control"
                  value={violationHandling}
                  onChange={(e) => setViolationHandling(e.target.value)}
                  style={{ fontSize: '10px', fontFamily: 'Inter' }}
                >
                  <option value="log_continue">Log and Proceed - Continue processing, log violations for review</option>
                  <option value="log_abort">Log and Abort - Stop processing immediately when violations are detected</option>
                </select>
                <small className="form-help" style={{ fontSize: '10px', fontFamily: 'Inter' }}>
                  {violationHandling === 'log_continue' 
                    ? 'Processing will continue even if quality rule violations are found. All violations will be logged in Quality Violations for review.'
                    : 'Processing will stop immediately if any quality rule violations are detected. The job will be marked as failed and all violations will be logged.'
                  }
                </small>
              </div>
            )}

            <h3 
              onClick={() => setAnomalyRulesExpanded(!anomalyRulesExpanded)}
              style={{ 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                userSelect: 'none',
                fontSize: '10px',
                fontFamily: 'Inter',
                fontWeight: 600,
                textTransform: 'uppercase'
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
            <button className="btn btn-back" onClick={handleBack}>
              <FiArrowLeft /> Back
            </button>
          )}
          <div className="wizard-actions-right">
            {currentStep < getWizardSteps().length ? (
              <>
                <button className="btn btn-xs btn-success" onClick={handleSave} disabled={loading} style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.125rem 0.25rem', marginRight: '0.25rem' }}>
                  <FiSave /> {loading ? 'Saving...' : 'Save'}
                </button>
                <button className="btn btn-xs btn-primary" onClick={handleNext} style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.125rem 0.25rem' }}>
                  Next <FiArrowRight />
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-xs btn-success" onClick={handleSave} disabled={loading} style={{ fontSize: '10px', fontFamily: 'Inter', padding: '0.125rem 0.25rem' }}>
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
