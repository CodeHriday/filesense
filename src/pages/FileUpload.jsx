import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { FiUpload } from 'react-icons/fi';
import Card from '../components/Card';
import FileDropzone from '../components/FileDropzone';
import DuplicateFileModal from '../components/DuplicateFileModal';
import StepProgress from '../components/StepProgress';
import BulkProfilingTab from '../components/BulkProfilingTab';
import { uploadFile, uploadFilesBatch, testApiConnection, checkDuplicateFile, deleteFile } from '../api/fileService';
import { getQualityRules } from '../api/qualityRulesService';
import { useAuth } from '../context/AuthContext';
import { isVendorUser } from '../utils/userHelpers';
import { API_BASE_URL } from '../config';
import axios from 'axios';
import './FileUpload.css';

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
  
  // Auto-populate quality rules and schema when agreement is selected
  useEffect(() => {
    if (!selectedAgreement) {
      setSelectedAgreementSchema(null);
      return;
    }
    
    const agreement = vendorAgreements.find(a => a.id === parseInt(selectedAgreement));
    if (agreement && agreement.fileSchemas && agreement.fileSchemas.length > 0) {
      // For now, use the first file schema (later we can add file pattern matching)
      const firstSchema = agreement.fileSchemas[0];
      setSelectedAgreementSchema(firstSchema);
      
      // Auto-populate quality rules from the schema
      if (firstSchema.quality_rule_ids && Array.isArray(firstSchema.quality_rule_ids)) {
        setSelectedQualityRules(firstSchema.quality_rule_ids);
      }
    }
  }, [selectedAgreement, vendorAgreements]);
  
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
      
      // Check for duplicate file first (scoped to selected project)
      const duplicateCheck = await checkDuplicateFile(file, selectedProject);
      
      if (duplicateCheck.isDuplicate) {
        // Show duplicate modal
        setDuplicateFileInfo(duplicateCheck.existingFile);
        setPendingFile(file);
        setPendingProgressHandler(() => progressHandler);
        setShowDuplicateModal(true);
        setUploadStatus(null);
        setCurrentStep(null);
        setIsProcessing(false);
        return;
      }
      
      // If not duplicate, proceed with upload
      await proceedWithUpload(file, progressHandler);
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
      
      const results = [];
      let successCount = 0;
      let failedCount = 0;
      
      // Process each file sequentially to show individual progress
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileNumber = i + 1;
        
        try {
          // Update batch status
          setBatchUploadStatus({ 
            total: files.length, 
            current: fileNumber, 
            currentFile: file.name 
          });
          
          setDiagnosticInfo(prev => prev + `\n📁 Uploading file ${fileNumber} of ${files.length}: ${file.name}\n`);
          
          // Create a wrapped progress handler for this specific file
          const wrappedProgressHandler = (progressEvent) => {
            const percentage = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentage);
            
            // Call the original progress handler
            if (progressHandler) {
              progressHandler(progressEvent);
            }
          };
          
          // Upload individual file
          const agreementIdForUpload = uploadType === 'contract' ? selectedAgreement : null;
          const result = await uploadFile(file, wrappedProgressHandler, fileOwner, selectedProject, null, selectedSubProject, selectedQualityRules, agreementIdForUpload);
          
          // Extract fileId from result
          let fileId;
          if (result.results && result.results.length > 0) {
            const firstResult = result.results[0];
            fileId = firstResult.fileId || (firstResult.file && firstResult.file.file_id);
          } else {
            fileId = result.fileId || (result.file && result.file.file_id);
          }
          
          setDiagnosticInfo(prev => prev + `✅ File ${fileNumber} uploaded successfully: ${file.name} (ID: ${fileId})\n`);
          
          results.push({
            success: true,
            filename: file.name,
            fileId: fileId
          });
          successCount++;
          
          // Add a small delay between files to make progress visible (400ms)
          if (i < files.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 400));
          }
          
        } catch (error) {
          console.error(`Error uploading file ${fileNumber} (${file.name}):`, error);
          setDiagnosticInfo(prev => prev + `❌ File ${fileNumber} failed: ${file.name} - ${error.message}\n`);
          
          results.push({
            success: false,
            filename: file.name,
            error: error.message
          });
          failedCount++;
          
          // Add delay even on error to show the failure
          if (i < files.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 400));
          }
        }
      }
      
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

  const proceedWithUpload = async (file, progressHandler, replaceFileId = null) => {
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
      const agreementIdForUpload = uploadType === 'contract' ? selectedAgreement : null;
      const result = await uploadFile(file, wrappedProgressHandler, fileOwner, selectedProject, replaceFileId, selectedSubProject, selectedQualityRules, agreementIdForUpload);
      
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
      
      // Move to scanning step (virus scan happens on server after upload)
      setCurrentStep('scanning');
      
      // Start polling for processing status
      console.log('File uploaded successfully, starting status polling. File ID:', fileId);
      startPolling(fileId);
      
      return result;
    } catch (error) {
      console.error('Error uploading file:', error);
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

  const proceedWithUploadWithReplacement = async (file, progressHandler, replaceFileId) => {
    return proceedWithUpload(file, progressHandler, replaceFileId);
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
      const result = await proceedWithUploadWithReplacement(pendingFile, pendingProgressHandler, duplicateFileInfo.fileId);
      
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
      await proceedWithUpload(pendingFile, pendingProgressHandler);
      
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
    <div className="file-upload-container">
      <h1>File Upload & Profile</h1>
      
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
              Set the owner for files you upload. This defaults to your email address.
            </p>
            <div className="form-group">
              <label htmlFor="owner-input">Owner Email:</label>
              <input
                id="owner-input"
                type="email"
                value={tempOwner}
                onChange={(e) => setTempOwner(e.target.value)}
                placeholder="owner@example.com"
                className="form-control"
              />
            </div>
            <div className="modal-actions">
              <button 
                className="btn btn-primary"
                onClick={handleSaveOwner}
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
        <div className="upload-tabs">
          <button 
            className={`tab-button ${activeTab === 'upload-profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload-profile')}
          >
            Upload & Profile
          </button>
          {hasWritePermission('file_drop') && (
            <button 
              className={`tab-button ${activeTab === 'drop-file' ? 'active' : ''}`}
              onClick={() => setActiveTab('drop-file')}
            >
              Drop File (S3 Direct)
            </button>
          )}
          <button 
            className={`tab-button ${activeTab === 'bulk-profiling' ? 'active' : ''}`}
            onClick={() => setActiveTab('bulk-profiling')}
          >
            Bulk Profiling
          </button>
        </div>
        
        <div className="upload-instructions">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2>
                {activeTab === 'drop-file' 
                  ? 'Drop file to S3 storage'
                  : 'Add a new file to the observatory'}
              </h2>
              <p>
                {activeTab === 'drop-file'
                  ? 'Upload files directly to S3 storage without profiling or analysis. Quick uploads for raw file storage.'
                  : 'Upload a data file to analyze its structure, profile its content, and track changes over time. Supported file types include CSV, JSON, Parquet, Excel, and XML.'}
              </p>
            </div>
            {(uploadStatus || uploadedFile) && (
              <button 
                className="btn btn-secondary"
                onClick={handleUploadAnother}
                style={{ alignSelf: 'flex-start' }}
              >
                Reset
              </button>
            )}
          </div>
        </div>
        
        {/* Project and Owner Section - Combined */}
        {!isProcessing && activeTab === 'upload-profile' && hasWritePermission('file') && (
          <div style={{ padding: '1rem', background: 'transparent', marginBottom: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
            {/* Upload Type Selection */}
            <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #e0e0e0' }}>
              <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.75rem' }}>
                Upload Type:
              </label>
              <div style={{ display: 'flex', gap: '2rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
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
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Ad-hoc Upload</span>
                  <span style={{ fontSize: '0.875rem', color: '#666' }}>(Standard file upload)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="uploadType"
                    value="contract"
                    checked={uploadType === 'contract'}
                    onChange={(e) => setUploadType(e.target.value)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Contract Validation</span>
                  <span style={{ fontSize: '0.875rem', color: '#666' }}>(Validate against vendor agreement)</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Project Selection */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 300px' }}>
                <label htmlFor="project-select" style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  Project: <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <select 
                  id="project-select"
                  value={selectedProject || ''}
                  onChange={(e) => setSelectedProject(Number(e.target.value))}
                  disabled={loadingProjects}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    cursor: 'pointer',
                    minWidth: '200px'
                  }}
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
              {selectedProject && subProjects.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 300px' }}>
                  <label htmlFor="sub-project-select" style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    Sub-Project:
                  </label>
                  <select 
                    id="sub-project-select"
                    value={selectedSubProject || ''}
                    onChange={(e) => setSelectedSubProject(e.target.value ? Number(e.target.value) : null)}
                    disabled={loadingSubProjects}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      cursor: 'pointer',
                      minWidth: '200px'
                    }}
                  >
                    {loadingSubProjects ? (
                      <option>Loading sub-projects...</option>
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
              )}

              {/* File Owner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 300px' }}>
                <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>File Owner:</span>
                <span style={{ flex: 1 }}>{fileOwner || 'Not set'}</span>
                <button 
                  className="btn-link"
                  onClick={handleOpenOwnerModal}
                  title="Edit owner"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Edit
                </button>
              </div>
            </div>

            {/* Vendor Agreement Selection (Contract Validation Mode) */}
            {selectedProject && uploadType === 'contract' && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
                <label htmlFor="vendor-agreement-select" style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                  Vendor Agreement: <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.75rem' }}>
                  Select the vendor agreement to validate the uploaded file against its defined schema and governance rules.
                </p>
                <select 
                  id="vendor-agreement-select"
                  value={selectedAgreement || ''}
                  onChange={(e) => setSelectedAgreement(e.target.value)}
                  disabled={loadingAgreements}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    cursor: 'pointer'
                  }}
                >
                  {loadingAgreements ? (
                    <option>Loading agreements...</option>
                  ) : vendorAgreements.length === 0 ? (
                    <option>No vendor agreements available for this project</option>
                  ) : (
                    <>
                      <option value="">Select an agreement...</option>
                      {vendorAgreements.map(agreement => (
                        <option key={agreement.id} value={agreement.id}>
                          {agreement.vendor_name} - {agreement.file_name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                
                {/* Schema Preview */}
                {selectedAgreementSchema && selectedAgreementSchema.schema && (
                  <div style={{ 
                    marginTop: '1rem', 
                    padding: '1rem', 
                    background: '#f8f9fa', 
                    borderRadius: '4px',
                    border: '1px solid #dee2e6'
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#495057' }}>
                      Expected Schema:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {Array.isArray(selectedAgreementSchema.schema) && selectedAgreementSchema.schema.map((col, idx) => (
                        <span 
                          key={idx}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#fff',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            fontSize: '0.875rem'
                          }}
                        >
                          {col.column_name} <span style={{ color: '#6c757d' }}>({col.data_type})</span>
                        </span>
                      ))}
                    </div>
                    
                    {/* Governance Info */}
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #dee2e6' }}>
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
                        {selectedAgreementSchema.contains_pii && (
                          <span style={{ 
                            padding: '0.25rem 0.5rem', 
                            background: '#fff3cd', 
                            border: '1px solid #ffc107',
                            borderRadius: '4px',
                            color: '#856404'
                          }}>
                            🔒 Contains PII
                          </span>
                        )}
                        {selectedAgreementSchema.data_classification && (
                          <span style={{ 
                            padding: '0.25rem 0.5rem', 
                            background: '#d1ecf1', 
                            border: '1px solid #17a2b8',
                            borderRadius: '4px',
                            color: '#0c5460'
                          }}>
                            {selectedAgreementSchema.data_classification}
                          </span>
                        )}
                        {selectedAgreementSchema.file_type && (
                          <span style={{ 
                            padding: '0.25rem 0.5rem', 
                            background: '#d4edda', 
                            border: '1px solid #28a745',
                            borderRadius: '4px',
                            color: '#155724'
                          }}>
                            {selectedAgreementSchema.file_type.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quality Rules Selection */}
            {selectedProject && uploadType === 'adhoc' && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
                <label htmlFor="quality-rules-select" style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                  Quality Rules (Optional):
                </label>
                <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.75rem' }}>
                  Select quality rules to validate this data. Rules will run during processing.
                </p>
                <select 
                  id="quality-rules-select"
                  multiple
                  value={selectedQualityRules.map(String)}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                    setSelectedQualityRules(selected);
                  }}
                  disabled={loadingQualityRules}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    minHeight: '100px',
                    cursor: 'pointer'
                  }}
                >
                  {loadingQualityRules ? (
                    <option disabled>Loading quality rules...</option>
                  ) : availableQualityRules.length === 0 ? (
                    <option disabled>No quality rules available for this project</option>
                  ) : (
                    availableQualityRules.map(rule => (
                      <option key={rule.id} value={rule.id}>
                        {rule.rule_name} - {rule.rule_type} ({rule.severity})
                      </option>
                    ))
                  )}
                </select>
                <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
                  {selectedQualityRules.length > 0 
                    ? `${selectedQualityRules.length} rule(s) selected` 
                    : 'No rules selected (hold Ctrl/Cmd to select multiple)'}
                </div>
              </div>
            )}
            
            {/* Quality Rules Display for Contract Validation (read-only) */}
            {selectedProject && uploadType === 'contract' && selectedQualityRules.length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                  Quality Rules (from agreement):
                </label>
                <div style={{ 
                  padding: '0.75rem', 
                  background: '#f8f9fa', 
                  borderRadius: '4px',
                  border: '1px solid #dee2e6'
                }}>
                  {selectedQualityRules.map(ruleId => {
                    const rule = availableQualityRules.find(r => r.id === ruleId);
                    return rule ? (
                      <div key={ruleId} style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                        ✓ {rule.rule_name} - {rule.rule_type} ({rule.severity})
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            {!selectedProject && (
              <div style={{ marginTop: '0.75rem', color: '#e74c3c', fontSize: '0.875rem' }}>
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
        
        {/* Show error message with reset button */}
        {uploadStatus === 'error' && !isProcessing && activeTab === 'upload-profile' && (
          <div style={{
            margin: '1rem 0',
            padding: '1.5rem',
            background: '#fef2f2',
            border: '2px solid #ef4444',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#991b1b', marginBottom: '0.5rem' }}>
              ❌ Upload Failed
            </div>
            <div style={{ fontSize: '0.95rem', color: '#7f1d1d', marginBottom: '1.5rem' }}>
              There was an error uploading your file. Please try again.
            </div>
            <button 
              className="btn btn-primary"
              onClick={handleUploadAnother}
              style={{ fontSize: '1rem', padding: '0.75rem 2rem' }}
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
                acceptedFileTypes={['.csv', '.json', '.parquet', '.xlsx', '.xml']}
                maxSizeMB={25}
                multiple={true}
                externalStatus={uploadStatus}
              />
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
                <p style={{ fontSize: '1.1rem', margin: 0 }}>Please select a project above to upload files</p>
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
              <div style={{ padding: '1rem', background: '#f8f9fa', marginBottom: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Project Selection */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <label htmlFor="vendor-project-select" style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        Project: <span style={{ color: '#e74c3c' }}>*</span>
                      </label>
                      {!loadingVendorProjects && vendorProjects.length === 0 && (
                        <button 
                          className="btn btn-sm btn-primary"
                          onClick={loadVendorProjects}
                          style={{ marginLeft: 'auto' }}
                        >
                          Load My Projects
                        </button>
                      )}
                    </div>
                    <select 
                      id="vendor-project-select"
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
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        cursor: 'pointer'
                      }}
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
                    <div>
                      <label htmlFor="vendor-connection-select" style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                        Connection: <span style={{ color: '#e74c3c' }}>*</span>
                      </label>
                      <select 
                        id="vendor-connection-select"
                        value={selectedConnection || ''}
                        onChange={(e) => {
                          setSelectedConnection(e.target.value);
                          setShowFolderBrowser(false);
                          setBrowseFolders([]);
                        }}
                        disabled={loadingConnections || vendorConnections.length === 0}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          border: '1px solid #ccc',
                          cursor: 'pointer'
                        }}
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
                    <div style={{ background: 'white', padding: '0.75rem', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
                      {(() => {
                        const conn = vendorConnections.find(c => (c.id || c.connection_id) === selectedConnection);
                        if (!conn) return null;
                        return (
                          <>
                            <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                              <strong>Upload Path:</strong> {conn.path || conn.drop_location_path || 'root'}
                            </div>
                            <button 
                              className="btn btn-sm btn-secondary"
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
                        <div style={{ marginTop: '1rem', maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px', padding: '0.5rem' }}>
                          {browsePrefix && (
                            <div style={{ marginBottom: '0.5rem' }}>
                              <button 
                                className="btn btn-sm btn-secondary"
                                onClick={() => {
                                  const parts = browsePrefix.split('/').filter(p => p);
                                  parts.pop();
                                  const newPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
                                  browseFoldersInConnection(selectedConnection, newPrefix);
                                }}
                              >
                                ← Back
                              </button>
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                                Current: /{browsePrefix}
                              </span>
                            </div>
                          )}
                          {browseFolders.length === 0 ? (
                            <div style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>
                              No items found
                            </div>
                          ) : (
                            <div>
                              {browseFolders.filter(item => item.type === 'folder').map((folder, idx) => (
                                <div 
                                  key={idx}
                                  style={{ 
                                    padding: '0.5rem', 
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #f0f0f0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                  }}
                                  onClick={() => browseFoldersInConnection(selectedConnection, folder.path)}
                                >
                                  <span style={{ fontSize: '1.2rem' }}>📁</span>
                                  <span>{folder.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quality Rules Selection */}
                  {selectedVendorProject && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
                      <label htmlFor="quality-rules-select-drop" style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                        Quality Rules (Optional):
                      </label>
                      <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.75rem' }}>
                        Select quality rules to validate this data. Rules will run during processing.
                      </p>
                      <select 
                        id="quality-rules-select-drop"
                        multiple
                        value={selectedQualityRules.map(String)}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                          setSelectedQualityRules(selected);
                        }}
                        disabled={loadingQualityRules}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          border: '1px solid #ccc',
                          minHeight: '100px',
                          cursor: 'pointer'
                        }}
                      >
                        {loadingQualityRules ? (
                          <option disabled>Loading quality rules...</option>
                        ) : availableQualityRules.length === 0 ? (
                          <option disabled>No quality rules available for this project</option>
                        ) : (
                          availableQualityRules.map(rule => (
                            <option key={rule.id} value={rule.id}>
                              {rule.rule_name} - {rule.rule_type} ({rule.severity})
                            </option>
                          ))
                        )}
                      </select>
                      <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
                        {selectedQualityRules.length > 0 
                          ? `${selectedQualityRules.length} rule(s) selected` 
                          : 'No rules selected (hold Ctrl/Cmd to select multiple)'}
                      </div>
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
                    acceptedFileTypes={['.csv', '.json', '.parquet', '.xlsx', '.xml']}
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

      {/* Debug Tools */}
      <Card>
        <div className="debug-section">
          <h2>API Diagnostics</h2>
          <div className="debug-status">
            <div className="api-status">
              <span>API Status: </span>
              <span className={`status-badge ${apiStatus.status}`}>
                {!apiStatus.checked ? 'Checking...' : 
                  apiStatus.status === 'connected' ? 'Connected' : 'Error'}
              </span>
            </div>
            
            <div className="debug-actions">
              <button 
                className="btn btn-secondary"
                onClick={handleTestConnection}
              >
                Test API Connection
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleDirectUpload}
              >
                Test Direct Upload
              </button>
            </div>
          </div>
          
          <div className="diagnostic-info">
            <h3>Diagnostic Information</h3>
            <pre>
              {diagnosticInfo || 'No diagnostic information available yet.'}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default FileUpload;