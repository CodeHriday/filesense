import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { FiEye, FiEdit2, FiTrash2, FiSearch, FiSlash } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import ThreeSectionModal from '../components/ThreeSectionModal';
import ConfirmationModal from '../components/ConfirmationModal';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';
import NotificationModal from '../components/NotificationModal';
import S3FolderBrowser from '../components/S3FolderBrowser';
import VendorUserSelect from '../components/VendorUserSelect';
import ThreeStageApprovalPanel from '../components/ThreeStageApprovalPanel';
import DynamicApprovalPanel from '../components/DynamicApprovalPanel';
import ApprovalChainConfig from '../components/ApprovalChainConfig';
import FileSchemaManager from '../components/FileSchemaManager';
import FileConfigurationsSection, { normaliseSchema } from '../components/FileConfigurationsSection';
import { useAuth } from '../context/AuthContext';
import { isVendorUser } from '../utils/userHelpers';
import { formatChangeSummary } from '../utils/formatters';
import axios from 'axios';
import LineageBackButton from '../components/LineageBackButton';
import '../styles/global-page-styles.css';
import '../styles/VendorAgreements.css';

const VendorAgreements = () => {
  const [agreements, setAgreements] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingApprovalChain, setPendingApprovalChain] = useState(null);
  const [autoApprovalChain, setAutoApprovalChain] = useState(null);
  // True once the user has clicked Apply — prevents field changes from overwriting their work.
  const chainManuallyApplied = useRef(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [approvalHistory, setApprovalHistory] = useState([]);
  const [changeHistory, setChangeHistory] = useState([]);
  const [stepDecisions, setStepDecisions] = useState([]);
  const [rejectComments, setRejectComments] = useState('');
  const [detailModalError, setDetailModalError] = useState('');
  const [detailModalSuccess, setDetailModalSuccess] = useState('');
  
  // Confirmation modal state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState({
    title: '',
    message: '',
    onConfirm: null
  });
  
  // Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalAgreement, setDeleteModalAgreement] = useState(null);
  const [deleteModalDependencies, setDeleteModalDependencies] = useState(null);
  
  // S3 Folder Browser state
  const [s3BrowserOpen, setS3BrowserOpen] = useState(false);
  const [s3BrowserConnectionId, setS3BrowserConnectionId] = useState(null);
  const [s3BrowserCallback, setS3BrowserCallback] = useState(null);
  
  // Vendor connections state
  const [vendorConnections, setVendorConnections] = useState([]);
  const [filteredConnections, setFilteredConnections] = useState([]);
  const [allConnections, setAllConnections] = useState([]);
  
  // Sub-projects state
  const [subProjects, setSubProjects] = useState([]);
  const [loadingSubProjects, setLoadingSubProjects] = useState(false);
  
  // File configurations state (for create/edit modal)
  const [fileConfigurations, setFileConfigurations] = useState([]);
  
  // Multiple files display modal
  const [multipleFilesModalOpen, setMultipleFilesModalOpen] = useState(false);
  const [multipleFilesData, setMultipleFilesData] = useState([]);
  
  // Notification modal state
  const [notificationModal, setNotificationModal] = useState({
    isOpen: false,
    type: 'success',
    title: '',
    message: ''
  });
  
  const [formData, setFormData] = useState({
    vendor_id: '',
    vendor_code: '',
    file_name: '',
    file_description: '',
    description: '',
    schema: '',
    frequency: 'Daily',
    frequency_description: '',
    vendor_department_team: '',
    vendor_department_email: '',
    file_owner_user_id: '',
    governance_manager_user_id: '',
    primary_contact_user_id: '',
    primary_contact_name: '',
    primary_contact_phone: '',
    primary_contact_email: '',
    primary_contact_designation: '',
    secondary_contact_user_id: '',
    secondary_contact_name: '',
    secondary_contact_phone: '',
    secondary_contact_email: '',
    secondary_contact_designation: '',
    owner_contact: '',
    metadata: '',
    vendor_connection_id: '',
    drop_location_path: '',
    project_id: '',
    project_name: '',
    sub_project_id: '',
    manager_contact: '',
    vendor_type: '',
    vendor_onboarding_date: '',
    domain: '',
    retention_days: '',
    expected_arrival_time: '',
    delivery_method: '',
    contract_start_date: new Date().toISOString().split('T')[0],
    contract_end_date: '',
    sla_enabled: false,
    frequency_pattern: 'daily',
    arrival_time: '09:00',
    arrival_days: '',
    alert_threshold_minutes: 60,
    additional_stakeholder_user_ids: [],
    additional_stakeholder_group_ids: []
  });
  
  // Additional stakeholders state
  const [stakeholderOptions, setStakeholderOptions] = useState({ users: [], groups: [] });
  const [loadingStakeholders, setLoadingStakeholders] = useState(false);
  
  const [templateFile, setTemplateFile] = useState(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  
  // Store the vendor ID for the current vendor user
  const [currentVendorId, setCurrentVendorId] = useState(null);
  
  const { currentUser, hasRole, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Check for admin-level access (uses permission-based check for backward compatibility)
  const isAdmin = hasPermission('users:write') || hasPermission('project_management:write') || (hasRole && hasRole('Admin'));
  const isVendor = isVendorUser(currentUser);
  
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    
    fetchData();
  }, [currentUser, navigate]);
  
  // Handle opening agreement from notification
  useEffect(() => {
    const viewAgreementId = searchParams.get('view');
    if (viewAgreementId) {
      const agreementId = parseInt(viewAgreementId);
      
      // First check if the agreement is in the current page
      const agreement = agreements.find(a => a.id === agreementId);
      if (agreement) {
        openDetailModal(agreement);
        setSearchParams({}, { state: location.state });
      } else if (agreements.length > 0) {
        // Agreement not on current page, fetch it directly
        axios.get(`/api/vendor-agreements/${agreementId}`)
          .then(response => {
            const agreementData = response.data.agreement || response.data;
            if (agreementData && agreementData.id) {
              openDetailModal(agreementData);
              setSearchParams({}, { state: location.state });
            } else {
              setError('Could not load the requested agreement');
              setSearchParams({}, { state: location.state });
            }
          })
          .catch(error => {
            console.error('Error loading agreement from notification:', error);
            setError('Could not load the requested agreement');
            setSearchParams({}, { state: location.state });
          });
      }
    }
  }, [searchParams, agreements, setSearchParams]);
  
  const fetchData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.get('/api/vendor-agreements/init-data');
      const { vendorConnections: vc, allConnections: ac, vendors: v, agreements: a, users: u } = response.data;
      
      setAgreements(a || []);
      setVendors(v || []);
      setUsers(u || []);
      setVendorConnections(vc || []);
      setAllConnections(ac || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load vendor contracts data');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchAgreementDetails = async (agreementId) => {
    try {
      const response = await axios.get(`/api/vendor-agreements/${agreementId}/full`);
      const { agreement: agreementData, approvals, changes, step_decisions } = response.data;
      
      setSelectedAgreement(agreementData);
      setApprovalHistory(Array.isArray(approvals) ? approvals : []);
      setChangeHistory(Array.isArray(changes) ? changes : []);
      setStepDecisions(Array.isArray(step_decisions) ? step_decisions : []);
    } catch (error) {
      console.error('Error fetching agreement details:', error);
      setError('Failed to load agreement details');
    }
  };
  
  const fetchSubProjects = async (projectId) => {
    if (!projectId) {
      setSubProjects([]);
      return;
    }
    
    try {
      setLoadingSubProjects(true);
      const response = await axios.get(`/api/projects/${projectId}/sub-projects`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      const subProjectsData = response.data?.subProjects || response.data || [];
      setSubProjects(Array.isArray(subProjectsData) ? subProjectsData : []);
    } catch (error) {
      console.error('Error fetching sub-projects:', error);
      setSubProjects([]);
    } finally {
      setLoadingSubProjects(false);
    }
  };
  
  const fetchStakeholderOptions = async () => {
    try {
      setLoadingStakeholders(true);
      const response = await axios.get('/api/vendor-agreements/stakeholder-options');
      if (response.data.success) {
        setStakeholderOptions({
          users: response.data.users || [],
          groups: response.data.groups || []
        });
      }
    } catch (error) {
      console.error('Error fetching stakeholder options:', error);
      setStakeholderOptions({ users: [], groups: [] });
    } finally {
      setLoadingStakeholders(false);
    }
  };
  
  // Auto-populate currentVendorId for vendor users
  useEffect(() => {
    if (isVendor && currentUser && Array.isArray(vendors) && vendors.length > 0) {
      // Find the vendor where vendor_user_id matches the current user's ID
      const userVendor = vendors.find(v => v.vendor_user_id === currentUser.id);
      if (userVendor) {
        setCurrentVendorId(userVendor.id);
      }
    }
  }, [isVendor, currentUser, vendors]);
  
  // Fetch sub-projects when project_id changes
  useEffect(() => {
    if (formData.project_id) {
      setFormData(prev => ({ ...prev, sub_project_id: '' }));
      fetchSubProjects(formData.project_id);
    } else {
      setSubProjects([]);
      setFormData(prev => ({ ...prev, sub_project_id: '' }));
    }
  }, [formData.project_id]);
  
  // Filter vendor connections for the dropdown.
  // Base list: External connections, optionally scoped to the vendor's project.
  // Always include the vendor's project drop-location connection (if set) even when
  // its connection_user is 'Internal' — it is the authoritative connection for that
  // vendor regardless of how it was classified at creation time.
  useEffect(() => {
    const externalConns = vendorConnections.filter(conn => conn.connection_user === 'External');

    let baseList = externalConns;

    if (formData.vendor_id && Array.isArray(vendors) && vendors.length > 0) {
      const selectedVendor = vendors.find(v => String(v.id) === String(formData.vendor_id));

      if (selectedVendor && selectedVendor.project_id) {
        const vendorConns = externalConns.filter(
          conn => String(conn.project_id) === String(selectedVendor.project_id)
        );
        // Fall back to all external connections if none match the vendor's project
        baseList = vendorConns.length > 0 ? vendorConns : externalConns;
      }

      // Always ensure the vendor's project drop-location connection is in the list,
      // even if it was created with connection_user = 'Internal'.
      const projectConnId = selectedVendor?.drop_location_connection_id;
      if (projectConnId) {
        const alreadyIncluded = baseList.some(
          c => String(c.connection_id) === String(projectConnId)
        );
        if (!alreadyIncluded) {
          const projectConn = vendorConnections.find(
            c => String(c.connection_id) === String(projectConnId)
          );
          if (projectConn) {
            baseList = [projectConn, ...baseList];
          }
        }
      }
    }

    setFilteredConnections(baseList);
  }, [vendorConnections, formData.vendor_id, vendors]);
  
  // Auto-populate drop_location_path from selected vendor connection.
  // Priority 1: use drop_location_bucket / drop_location_prefix from the vendor's project
  //             (the authoritative values set in Edit Project → File Drop Location).
  // Priority 2: fall back to parsing the selected connection's config JSON.
  // When editing an existing agreement (formData.id is set) skip auto-population so the
  // saved path is preserved and not silently overwritten by project-level defaults.
  useEffect(() => {
    // Only auto-populate when creating (not editing an existing agreement)
    if (formData.id) return;

    // Priority 1: project-level bucket/prefix
    if (formData.vendor_id && vendors.length > 0) {
      const selectedVendor = vendors.find(v => String(v.id) === String(formData.vendor_id));
      const projectBucket = selectedVendor?.drop_location_bucket || '';
      if (projectBucket) {
        const projectPrefix = selectedVendor?.drop_location_prefix || '';
        const projectPath = projectPrefix ? `${projectBucket}/${projectPrefix}` : projectBucket;
        if (formData.drop_location_path !== projectPath) {
          setFormData(prev => ({ ...prev, drop_location_path: projectPath }));
        }
        return; // Project-level path takes priority — skip connection-config derivation
      }
    }

    // Priority 2: derive path from the selected connection's config
    if (formData.vendor_connection_id && filteredConnections.length > 0) {
      const selectedConnection = filteredConnections.find(
        conn => String(conn.connection_id) === String(formData.vendor_connection_id)
      );
      
      if (selectedConnection) {
        const config = selectedConnection.config || {};
        const bucket = config.bucket || config.bucket_name || '';
        // Check both top-level path field and config fields
        const filePath = selectedConnection.path || config.path_prefix || config.file_path || config.path || '';
        
        // Combine bucket and file path with proper slash handling
        let fullPath = bucket;
        if (filePath) {
          fullPath = filePath.startsWith('/') 
            ? `${bucket}${filePath}` 
            : `${bucket}/${filePath}`;
        }
        
        // Only update if the value would actually change
        if (formData.drop_location_path !== fullPath) {
          setFormData(prev => ({
            ...prev,
            drop_location_path: fullPath
          }));
        }
      } else if (formData.drop_location_path !== '') {
        // Connection not found, clear path
        setFormData(prev => ({
          ...prev,
          drop_location_path: ''
        }));
      }
    } else if (formData.drop_location_path !== '') {
      // No connection selected, clear path
      setFormData(prev => ({
        ...prev,
        drop_location_path: ''
      }));
    }
  }, [formData.id, formData.vendor_id, formData.vendor_connection_id, formData.drop_location_path, vendors, filteredConnections]);
  
  // Auto-populate project fields from selected vendor
  useEffect(() => {
    if (formData.vendor_id && Array.isArray(vendors) && vendors.length > 0) {
      const selectedVendor = vendors.find(
        vendor => String(vendor.id) === String(formData.vendor_id)
      );
      
      if (selectedVendor) {
        const newProjectId = selectedVendor.project_id || '';
        const newProjectName = selectedVendor.project_name || '';
        
        // Only update if the values would actually change
        if (formData.project_id !== newProjectId || formData.project_name !== newProjectName) {
          setFormData(prev => ({
            ...prev,
            project_id: newProjectId,
            project_name: newProjectName
          }));
        }
      } else if (formData.project_id !== '' || formData.project_name !== '') {
        // Vendor not found, clear project fields
        setFormData(prev => ({
          ...prev,
          project_id: '',
          project_name: ''
        }));
      }
    } else if (formData.project_id !== '' || formData.project_name !== '') {
      // No vendor selected, clear project fields
      setFormData(prev => ({
        ...prev,
        project_id: '',
        project_name: ''
      }));
    }
  }, [formData.vendor_id, formData.project_id, formData.project_name, vendors]);

  // Auto-populate vendor_connection_id when a vendor is selected while creating a contract.
  // Priority 1: use drop_location_connection_id from the vendor's project (the connection
  //             configured in Edit Project → File Drop Location — the authoritative source).
  // Priority 2: fall back to filteredConnections when exactly one option exists (handles
  //             vendors whose project has no drop-location connection configured yet).
  useEffect(() => {
    // Only auto-populate when creating (not editing an existing agreement)
    if (!formData.id && formData.vendor_id) {
      const selectedVendor = vendors.find(v => String(v.id) === String(formData.vendor_id));
      const projectConnId = selectedVendor?.drop_location_connection_id || null;

      if (projectConnId) {
        // Use the connection set on the vendor's project directly
        if (formData.vendor_connection_id !== projectConnId) {
          setFormData(prev => ({ ...prev, vendor_connection_id: projectConnId }));
        }
      } else if (filteredConnections.length === 1) {
        // Fallback: exactly one connection in the scoped list — auto-select it
        const autoConnId = filteredConnections[0].connection_id;
        if (formData.vendor_connection_id !== autoConnId) {
          setFormData(prev => ({ ...prev, vendor_connection_id: autoConnId }));
        }
      } else {
        // No deterministic choice — clear any stale selection from a previous vendor
        if (formData.vendor_connection_id !== '') {
          setFormData(prev => ({ ...prev, vendor_connection_id: '' }));
        }
      }
    }
  }, [formData.vendor_id, formData.id, vendors, filteredConnections]);

  // Auto-populate vendor_code, vendor_type, vendor_onboarding_date, and contact information from selected vendor
  useEffect(() => {
    if (formData.vendor_id && vendors.length > 0) {
      const selectedVendor = vendors.find(
        vendor => String(vendor.id) === String(formData.vendor_id)
      );
      
      if (selectedVendor) {
        const newVendorCode = selectedVendor.vendor_code || '';
        const newVendorType = selectedVendor.vendor_type || '';
        // Parse onboarding date - handle both ISO format (with T) and PostgreSQL format (with space)
        let newOnboardingDate = '';
        if (selectedVendor.vendor_onboarding_date) {
          try {
            const dateStr = String(selectedVendor.vendor_onboarding_date);
            // Try to extract YYYY-MM-DD from various formats
            const isoMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
            if (isoMatch) {
              newOnboardingDate = isoMatch[1];
            } else {
              // Fall back to Date parsing
              const parsed = new Date(dateStr);
              if (!isNaN(parsed.getTime())) {
                newOnboardingDate = parsed.toISOString().split('T')[0];
              }
            }
          } catch (e) {
            console.error('Error parsing vendor_onboarding_date:', e);
          }
        }
        
        // Extract primary contact information from vendor
        const newPrimaryContactName = selectedVendor.contact_name || '';
        const newPrimaryContactEmail = selectedVendor.contact_email || '';
        const newPrimaryContactPhone = selectedVendor.contact_phone || '';
        
        // Extract secondary contact information from vendor's backup contact
        const newSecondaryContactName = selectedVendor.backup_contact_name || '';
        const newSecondaryContactEmail = selectedVendor.backup_contact_email || '';
        const newSecondaryContactPhone = selectedVendor.backup_contact_phone || '';
        
        // Only update if the values would actually change
        if (formData.vendor_code !== newVendorCode || 
            formData.vendor_type !== newVendorType ||
            formData.vendor_onboarding_date !== newOnboardingDate ||
            formData.primary_contact_name !== newPrimaryContactName ||
            formData.primary_contact_email !== newPrimaryContactEmail ||
            formData.primary_contact_phone !== newPrimaryContactPhone ||
            formData.secondary_contact_name !== newSecondaryContactName ||
            formData.secondary_contact_email !== newSecondaryContactEmail ||
            formData.secondary_contact_phone !== newSecondaryContactPhone) {
          setFormData(prev => ({
            ...prev,
            vendor_code: newVendorCode,
            vendor_type: newVendorType,
            vendor_onboarding_date: newOnboardingDate,
            primary_contact_name: newPrimaryContactName,
            primary_contact_email: newPrimaryContactEmail,
            primary_contact_phone: newPrimaryContactPhone,
            secondary_contact_name: newSecondaryContactName,
            secondary_contact_email: newSecondaryContactEmail,
            secondary_contact_phone: newSecondaryContactPhone
          }));
        }
      } else if (formData.vendor_code !== '' || formData.vendor_type !== '' || 
                 formData.vendor_onboarding_date !== '' ||
                 formData.primary_contact_name !== '' ||
                 formData.primary_contact_email !== '' ||
                 formData.primary_contact_phone !== '' ||
                 formData.secondary_contact_name !== '' ||
                 formData.secondary_contact_email !== '' ||
                 formData.secondary_contact_phone !== '') {
        // Vendor not found, clear vendor and contact fields
        setFormData(prev => ({
          ...prev,
          vendor_code: '',
          vendor_type: '',
          vendor_onboarding_date: '',
          primary_contact_name: '',
          primary_contact_email: '',
          primary_contact_phone: '',
          secondary_contact_name: '',
          secondary_contact_email: '',
          secondary_contact_phone: ''
        }));
      }
    } else if (formData.vendor_code !== '' || formData.vendor_type !== '' || 
               formData.vendor_onboarding_date !== '' ||
               formData.primary_contact_name !== '' ||
               formData.primary_contact_email !== '' ||
               formData.primary_contact_phone !== '' ||
               formData.secondary_contact_name !== '' ||
               formData.secondary_contact_email !== '' ||
               formData.secondary_contact_phone !== '') {
      // No vendor selected, clear vendor and contact fields
      setFormData(prev => ({
        ...prev,
        vendor_code: '',
        vendor_type: '',
        vendor_onboarding_date: '',
        primary_contact_name: '',
        primary_contact_email: '',
        primary_contact_phone: '',
        secondary_contact_name: '',
        secondary_contact_email: '',
        secondary_contact_phone: ''
      }));
    }
  }, [
    formData.vendor_id, 
    formData.vendor_code, 
    formData.vendor_type, 
    formData.vendor_onboarding_date,
    vendors
  ]);
  
  // Auto-populate manager_contact from selected vendor manager
  useEffect(() => {
    if (formData.file_owner_user_id && users.length > 0) {
      const selectedUser = users.find(
        user => String(user.id) === String(formData.file_owner_user_id)
      );
      
      if (selectedUser) {
        const newManagerContact = selectedUser.email || '';
        
        // Only update if the value would actually change
        if (formData.manager_contact !== newManagerContact) {
          setFormData(prev => ({
            ...prev,
            manager_contact: newManagerContact
          }));
        }
      } else if (formData.manager_contact !== '') {
        // User not found, clear manager_contact
        setFormData(prev => ({
          ...prev,
          manager_contact: ''
        }));
      }
    } else if (formData.manager_contact !== '') {
      // No user selected, clear manager_contact
      setFormData(prev => ({
        ...prev,
        manager_contact: ''
      }));
    }
  }, [formData.file_owner_user_id, formData.manager_contact, users]);

  // ── Auto-populate 3-step approval chain ─────────────────────────────────
  // Triggers whenever the vendor manager or governance manager changes.
  // Skipped if the user has already manually applied their own chain.
  useEffect(() => {
    if (modalMode !== 'create') return;
    if (chainManuallyApplied.current) return;

    const mgr = formData.file_owner_user_id;
    const gov = formData.governance_manager_user_id;
    const primaryId = formData.primary_contact_user_id
      ? Number(formData.primary_contact_user_id)
      : null;

    // All three anchor roles must be selected before auto-populating.
    // Without a primary contact, Step 1 would have no approvers and the chain
    // save would be rejected by the API.
    if (!mgr || !gov || !primaryId) {
      setAutoApprovalChain(null);
      return;
    }

    const secondaryId = formData.secondary_contact_user_id
      ? Number(formData.secondary_contact_user_id)
      : null;

    // Step 1 includes both contacts when set and distinct
    const step1Ids = [];
    if (primaryId) step1Ids.push(primaryId);
    if (secondaryId && secondaryId !== primaryId) step1Ids.push(secondaryId);

    setAutoApprovalChain([
      {
        step_number: 1,
        name: 'Vendor Contact Approval',
        approver_user_ids: step1Ids,
        require_all: false,
      },
      {
        step_number: 2,
        name: 'Vendor Manager Approval',
        approver_user_ids: [Number(mgr)],
        require_all: false,
      },
      {
        step_number: 3,
        name: 'Governance Approval',
        approver_user_ids: [Number(gov)],
        require_all: false,
      },
    ]);
  }, [
    modalMode,
    formData.file_owner_user_id,
    formData.governance_manager_user_id,
    formData.primary_contact_user_id,
    formData.secondary_contact_user_id,
  ]);

  // ── Merged user list for the approval chain picker ───────────────────────
  // In create mode, vendor contacts (primary / secondary) may not be in
  // stakeholderOptions.users (which is the internal-user list).  Build a
  // combined list so their checkboxes show and pre-selections render correctly.
  const chainUsers = useMemo(() => {
    const base = stakeholderOptions.users || [];
    if (modalMode !== 'create') return base;

    const extra = [];
    const addIfMissing = (id, name, email) => {
      if (!id) return;
      const numId = Number(id);
      if (base.some((u) => u.id === numId)) return;
      if (extra.some((u) => u.id === numId)) return;
      extra.push({ id: numId, fullName: name || '', email: email || '' });
    };

    addIfMissing(
      formData.primary_contact_user_id,
      formData.primary_contact_name,
      formData.primary_contact_email
    );
    addIfMissing(
      formData.secondary_contact_user_id,
      formData.secondary_contact_name,
      formData.secondary_contact_email
    );

    return extra.length ? [...extra, ...base] : base;
  }, [
    stakeholderOptions.users,
    modalMode,
    formData.primary_contact_user_id,
    formData.primary_contact_name,
    formData.primary_contact_email,
    formData.secondary_contact_user_id,
    formData.secondary_contact_name,
    formData.secondary_contact_email,
  ]);

  const openCreateModal = () => {
    setFileConfigurations([]);
    setFormData({
      vendor_id: isVendor && currentVendorId ? currentVendorId : '',
      vendor_code: '',
      file_name: '',
      file_description: '',
      schema: '',
      frequency: 'Daily',
      frequency_description: '',
      vendor_department_team: '',
      vendor_department_email: '',
      file_owner_user_id: '',
      governance_manager_user_id: '',
      primary_contact_user_id: '',
      primary_contact_name: '',
      primary_contact_phone: '',
      primary_contact_email: '',
      primary_contact_designation: '',
      secondary_contact_user_id: '',
      secondary_contact_name: '',
      secondary_contact_phone: '',
      secondary_contact_email: '',
      secondary_contact_designation: '',
      owner_contact: '',
      metadata: '',
      vendor_connection_id: '',
      drop_location_path: '',
      project_id: '',
      project_name: '',
      manager_contact: '',
      vendor_type: '',
      vendor_onboarding_date: '',
      domain: '',
      retention_days: '',
      expected_arrival_time: '',
      delivery_method: '',
      contract_start_date: (() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      })(),
      contract_end_date: '',
      sla_enabled: false,
      frequency_pattern: 'daily',
      arrival_time: '09:00',
      arrival_days: '',
      alert_threshold_minutes: 60,
      additional_stakeholder_user_ids: [],
      additional_stakeholder_group_ids: []
    });
    setTemplateFile(null);
    setTemplateError('');
    setPendingApprovalChain(null);
    setAutoApprovalChain(null);
    chainManuallyApplied.current = false;
    setModalMode('create');
    setError('');
    setSuccessMessage('');
    setModalOpen(true);
    fetchStakeholderOptions();
  };
  
  const openEditModal = async (agreement) => {
    setSelectedAgreement(agreement);
    
    // Load file configurations for this agreement
    try {
      const response = await axios.get(`/api/vendor-agreements/${agreement.id}/file-schemas`);
      const schemas = response.data.fileSchemas || response.data || [];
      // Convert to the format expected by FileConfigurationsSection
      const configs = schemas.map(schema => ({
        id: schema.id,
        file_name_pattern_base: schema.file_name_pattern ? schema.file_name_pattern.replace(/\*\.\w+$/, '') : '',
        file_type: schema.file_type || (schema.file_name_pattern ? schema.file_name_pattern.split('.').pop() : 'csv'),
        file_name_pattern: schema.file_name_pattern,
        file_description: schema.file_description || '',
        schema: schema.schema,
        priority: schema.priority ?? 100,
        is_active: schema.is_active !== false,
        contains_pii: schema.contains_pii || false,
        data_classification: schema.data_classification || '',
        quality_rule_ids: schema.quality_rule_ids || [],
        archive_password: schema.has_archive_password ? '__KEEP_EXISTING__' : '',
        has_archive_password: schema.has_archive_password || false,
        has_header: schema.has_header !== undefined ? schema.has_header : true,
        header_definition: schema.header_definition || null
      }));
      setFileConfigurations(configs);
    } catch (error) {
      console.error('Error loading file schemas:', error);
      setFileConfigurations([]);
    }
    
    // Format date for HTML date input (YYYY-MM-DD)
    let formattedDate = '';
    if (agreement.vendor_onboarding_date) {
      const dateStr = agreement.vendor_onboarding_date.split('T')[0]; // Handle ISO format
      formattedDate = dateStr;
    }
    
    // Format contract dates for datetime-local input (YYYY-MM-DDTHH:mm)
    // datetime-local expects local time, not UTC
    const formatDateTimeLocal = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    let formattedStartDate = formatDateTimeLocal(agreement.contract_start_date);
    let formattedEndDate = formatDateTimeLocal(agreement.contract_end_date);
    
    setFormData({
      id: agreement.id,
      vendor_id: agreement.vendor_id || '',
      vendor_code: agreement.vendor_code || '',
      file_name: agreement.file_name || '',
      file_description: agreement.file_description || '',
      description: agreement.description || '',
      schema: agreement.schema ? JSON.stringify(agreement.schema, null, 2) : '',
      frequency: agreement.frequency || 'Daily',
      frequency_description: agreement.frequency_description || '',
      vendor_department_team: agreement.vendor_department_team || agreement.file_creator || '',
      vendor_department_email: agreement.vendor_department_email || '',
      file_owner_user_id: agreement.file_owner_user_id || '',
      governance_manager_user_id: agreement.governance_manager_user_id || '',
      primary_contact_user_id: agreement.primary_contact_user_id || '',
      primary_contact_name: agreement.primary_contact_name || agreement.vendor_contact || '',
      primary_contact_phone: agreement.primary_contact_phone || '',
      primary_contact_email: agreement.primary_contact_email || '',
      primary_contact_designation: agreement.primary_contact_designation || '',
      secondary_contact_user_id: agreement.secondary_contact_user_id || '',
      secondary_contact_name: agreement.secondary_contact_name || '',
      secondary_contact_phone: agreement.secondary_contact_phone || '',
      secondary_contact_email: agreement.secondary_contact_email || '',
      secondary_contact_designation: agreement.secondary_contact_designation || '',
      owner_contact: agreement.owner_contact || '',
      metadata: agreement.metadata ? JSON.stringify(agreement.metadata, null, 2) : '',
      vendor_connection_id: agreement.vendor_connection_id || '',
      drop_location_path: agreement.drop_location_path || '',
      project_id: agreement.project_id || '',
      project_name: agreement.project_name || '',
      sub_project_id: agreement.sub_project_id || '',
      manager_contact: agreement.manager_contact || '',
      vendor_type: agreement.vendor_type || '',
      vendor_onboarding_date: formattedDate,
      domain: agreement.domain || '',
      retention_days: agreement.retention_days || '',
      expected_arrival_time: agreement.expected_arrival_time || '',
      delivery_method: agreement.delivery_method || '',
      contract_start_date: formattedStartDate,
      contract_end_date: formattedEndDate,
      sla_enabled: agreement.sla_enabled || false,
      frequency_pattern: agreement.frequency_pattern || 'daily',
      arrival_time: agreement.arrival_time || '09:00',
      arrival_days: agreement.arrival_days || '',
      alert_threshold_minutes: agreement.alert_threshold_minutes || 60,
      additional_stakeholder_user_ids: agreement.additional_stakeholder_user_ids || [],
      additional_stakeholder_group_ids: agreement.additional_stakeholder_group_ids || []
    });
    setTemplateFile(null);
    setSelectedAgreement(agreement);
    setModalMode('edit');
    setSuccessMessage('');
    setModalOpen(true);
    fetchStakeholderOptions();
  };
  
  const openDetailModal = async (agreement) => {
    setSelectedAgreement(agreement);
    setActiveTab('details');
    setDetailModalOpen(true);
    await fetchAgreementDetails(agreement.id);
  };
  
  const closeModal = () => {
    setModalOpen(false);
    setSelectedAgreement(null);
    setTemplateFile(null);
  };
  
  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setSelectedAgreement(null);
    setApprovalHistory([]);
    setChangeHistory([]);
    setStepDecisions([]);
    setRejectComments('');
    setDetailModalError('');
    setDetailModalSuccess('');
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Field-specific validations
    let sanitizedValue = value;
    
    // Phone fields: only allow numbers, spaces, dashes, parentheses, and plus sign
    if (name === 'primary_contact_phone' || name === 'secondary_contact_phone') {
      sanitizedValue = value.replace(/[^0-9\s\-\(\)\+]/g, '');
    }
    
    // Email fields: basic sanitization (full validation on submit)
    // Allow only valid email characters
    if (name === 'vendor_department_email' || name === 'primary_contact_email' || 
        name === 'secondary_contact_email' || name === 'owner_contact') {
      sanitizedValue = value.replace(/[^a-zA-Z0-9@._\-+]/g, '');
    }
    
    // Expected arrival time: don't allow negative values, only allow time format
    if (name === 'expected_arrival_time') {
      // Remove leading minus signs and restrict to valid time characters
      sanitizedValue = value.replace(/^-+/, '').replace(/[^0-9:aAmMpP\s]/g, '');
    }
    
    // Retention days: only positive numbers
    if (name === 'retention_days') {
      sanitizedValue = value.replace(/[^0-9]/g, '');
    }
    
    // Domain: alphanumeric, spaces, commas, and hyphens only
    if (name === 'domain') {
      sanitizedValue = value.replace(/[^a-zA-Z0-9\s,\-]/g, '');
    }
    
    // Vendor department/team: alphanumeric, spaces, hyphens, underscores
    if (name === 'vendor_department_team') {
      sanitizedValue = value.replace(/[^a-zA-Z0-9\s\-_&]/g, '');
    }
    
    // Description and frequency_description: allow basic punctuation but no dangerous chars
    if (name === 'description' || name === 'frequency_description' || name === 'file_description') {
      sanitizedValue = value.replace(/[<>{}[\]\\]/g, '');
    }
    
    // Note: vendor_code and vendor_onboarding_date auto-population is handled by useEffect
    setFormData(prev => ({
      ...prev,
      [name]: sanitizedValue
    }));
  };
  
  const validateJSON = (jsonString) => {
    try {
      if (jsonString.trim() === '') return true;
      JSON.parse(jsonString);
      return true;
    } catch (e) {
      return false;
    }
  };
  
  const handleSubmit = async (e, isDraft = false) => {
    e.preventDefault();
    
    // Critical validation: ensure vendor_id is present for vendor users
    if (isVendor && !formData.vendor_id) {
      setNotificationModal({
        isOpen: true,
        type: 'error',
        title: 'Validation Error',
        message: 'Unable to determine your vendor. Please refresh the page and try again.'
      });
      return;
    }
    
    // Vendor is always required (even for drafts)
    if (!formData.vendor_id) {
      setNotificationModal({
        isOpen: true,
        type: 'error',
        title: 'Validation Error',
        message: 'Vendor is required'
      });
      return;
    }
    
    // Only validate other fields if not saving as draft
    if (!isDraft) {
      if (!formData.file_owner_user_id) {
        setNotificationModal({
          isOpen: true,
          type: 'error',
          title: 'Validation Error',
          message: 'File owner is required'
        });
        return;
      }
      
      if (!formData.governance_manager_user_id) {
        setNotificationModal({
          isOpen: true,
          type: 'error',
          title: 'Validation Error',
          message: 'Governance manager is required'
        });
        return;
      }
      
      if (!formData.vendor_connection_id) {
        setNotificationModal({
          isOpen: true,
          type: 'error',
          title: 'Validation Error',
          message: 'Vendor connection is required'
        });
        return;
      }
      
      // File configurations are mandatory for vendor contracts
      if (!fileConfigurations || fileConfigurations.length === 0) {
        setNotificationModal({
          isOpen: true,
          type: 'error',
          title: 'Validation Error',
          message: 'At least one file configuration is required. Please add file configurations before creating the contract.'
        });
        return;
      }
    }
    
    if (formData.schema && !validateJSON(formData.schema)) {
      setNotificationModal({
        isOpen: true,
        type: 'error',
        title: 'Validation Error',
        message: 'Invalid JSON format in schema'
      });
      return;
    }
    
    if (formData.metadata && !validateJSON(formData.metadata)) {
      setNotificationModal({
        isOpen: true,
        type: 'error',
        title: 'Validation Error',
        message: 'Invalid JSON format in metadata'
      });
      return;
    }
    
    // Email format validation (proper format, not just @)
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const emailFields = [
      { field: 'vendor_department_email', label: 'Vendor Department Email' },
      { field: 'primary_contact_email', label: 'Primary Contact Email' },
      { field: 'secondary_contact_email', label: 'Secondary Contact Email' }
    ];
    
    for (const { field, label } of emailFields) {
      if (formData[field] && formData[field].trim() !== '' && !emailRegex.test(formData[field])) {
        setNotificationModal({
          isOpen: true,
          type: 'error',
          title: 'Validation Error',
          message: `${label} is not in a valid format (e.g., name@domain.com)`
        });
        return;
      }
    }
    
    // Phone format validation (must contain at least some digits)
    const phoneFields = [
      { field: 'primary_contact_phone', label: 'Primary Contact Phone' },
      { field: 'secondary_contact_phone', label: 'Secondary Contact Phone' }
    ];
    
    for (const { field, label } of phoneFields) {
      if (formData[field] && formData[field].trim() !== '') {
        const digitsOnly = formData[field].replace(/\D/g, '');
        if (digitsOnly.length < 7) {
          setNotificationModal({
            isOpen: true,
            type: 'error',
            title: 'Validation Error',
            message: `${label} must contain at least 7 digits`
          });
          return;
        }
      }
    }
    
    try {
      const submitData = new FormData();
      
      // List of integer fields that should be null instead of empty string
      const integerFields = [
        'vendor_id', 
        'file_owner_user_id',
        'governance_manager_user_id',
        'vendor_connection_id',
        'retention_days',
        'project_id',
        'sub_project_id'
      ];
      
      // Wrap form data in agreementData/updateData as expected by backend
      const agreementData = {};
      Object.keys(formData).forEach(key => {
        // Exclude user_id fields - they're frontend-only for tracking contact selection
        // The actual contact info is stored in name/email/phone/designation fields
        if (key === 'primary_contact_user_id' || key === 'secondary_contact_user_id') {
          return;
        }
        
        let value = formData[key];
        
        // Convert empty strings to null for integer fields to avoid DB errors
        if (integerFields.includes(key) && value === '') {
          value = null;
        }
        
        // For UPDATE, include all fields (even empty ones) so backend can detect changes
        // For CREATE, only include non-empty fields to avoid sending unnecessary data
        if (modalMode === 'edit' || value !== '') {
          agreementData[key] = value;
        }
      });
      
      // Add status field based on isDraft
      // isDraft = true means "Save Draft" button was clicked
      // isDraft = false means "Create Contract" button was clicked (should set to active)
      agreementData.status = isDraft ? 'draft' : 'active';
      
      // Include file configurations count for backend validation
      agreementData.file_configurations_count = fileConfigurations?.length || 0;

      // Embed the approval chain in the creation payload so it is saved
      // transactionally — avoids the owner-only permission check on the
      // separate PUT /:id/approval-chain endpoint.
      if (modalMode === 'create') {
        const chainToSave = pendingApprovalChain || autoApprovalChain;
        if (chainToSave?.length) {
          agreementData.initial_approval_chain = { steps: chainToSave };
        }
      }
      
      // Backend expects 'agreementData' for CREATE and 'updateData' for UPDATE
      const dataKey = modalMode === 'create' ? 'agreementData' : 'updateData';
      submitData.append(dataKey, JSON.stringify(agreementData));
      
      let response;
      if (modalMode === 'create') {
        response = await axios.post('/api/vendor-agreements', submitData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        // Chain was sent in the creation payload; clear local state.
        setPendingApprovalChain(null);
        setAutoApprovalChain(null);

        setNotificationModal({
          isOpen: true,
          type: 'success',
          title: 'Success',
          message: isDraft ? 'Draft saved successfully!' : 'Vendor agreement created successfully!'
        });
      } else {
        // Check if agreement is in approval workflow (not draft)
        const isInApprovalWorkflow = selectedAgreement.approval_status && 
          selectedAgreement.approval_status !== 'draft' &&
          selectedAgreement.status === 'active';
        
        if (selectedAgreement.is_locked && isAdmin) {
          setConfirmModalConfig({
            title: 'Edit Locked Agreement',
            message: 'This agreement is locked (fully approved). Editing will require re-approval from both vendor and owner. Continue?',
            onConfirm: async () => {
              try {
                const response = await axios.put(`/api/vendor-agreements/${selectedAgreement.id}`, submitData, {
                  headers: {
                    'Content-Type': 'multipart/form-data'
                  }
                });
                
                // Save file configurations for locked agreement edit
                const agreementIdForConfigs = selectedAgreement.id;
                if (agreementIdForConfigs && fileConfigurations.length > 0) {
                  try {
                    const fileSchemas = fileConfigurations.map(config => ({
                      file_name_pattern: config.file_name_pattern,
                      file_description: config.file_description || '',
                      schema: config.schema || [],
                      priority: config.priority ?? 100,
                      is_active: config.is_active !== false,
                      contains_pii: config.contains_pii || false,
                      data_classification: config.data_classification || null,
                      file_type: config.file_type || null,
                      quality_rule_ids: config.quality_rule_ids || [],
                      archive_password: config.archive_password || '',
                      has_header: config.has_header !== undefined ? config.has_header : true,
                      header_definition: config.header_definition || null
                    }));
                    await axios.put(`/api/vendor-agreements/${agreementIdForConfigs}/file-schemas`, { fileSchemas });
                  } catch (fileConfigError) {
                    console.error('Error saving file configurations:', fileConfigError);
                  }
                }
                
                setNotificationModal({
                  isOpen: true,
                  type: 'success',
                  title: 'Success',
                  message: 'Vendor agreement updated successfully! Approvals have been reset.'
                });
                setTimeout(() => {
                  closeModal();
                  fetchData();
                }, 2000);
              } catch (error) {
                console.error('Error saving agreement:', error);
                let errorMessage = 'Failed to save vendor agreement';
                if (error.response?.data) {
                  const { error: errorMsg, message } = error.response.data;
                  errorMessage = errorMsg || message || errorMessage;
                } else if (error.message) {
                  errorMessage += ': ' + error.message;
                }
                setNotificationModal({
                  isOpen: true,
                  type: 'error',
                  title: 'Error',
                  message: errorMessage
                });
              }
            }
          });
          setConfirmModalOpen(true);
          return;
        }
        
        // Show warning if editing a contract that's in the approval workflow
        if (isInApprovalWorkflow) {
          setConfirmModalConfig({
            title: 'Contract In Approval Workflow',
            message: 'This contract is currently in the approval process. Saving changes will reset all approvals and the contract will need to be re-approved starting from Vendor acceptance. Do you want to continue?',
            onConfirm: async () => {
              try {
                const response = await axios.put(`/api/vendor-agreements/${selectedAgreement.id}`, submitData, {
                  headers: {
                    'Content-Type': 'multipart/form-data'
                  }
                });
                
                // Save file configurations
                const agreementIdForConfigs = selectedAgreement.id;
                if (agreementIdForConfigs && fileConfigurations.length > 0) {
                  try {
                    const fileSchemas = fileConfigurations.map(config => ({
                      file_name_pattern: config.file_name_pattern,
                      file_description: config.file_description || '',
                      schema: config.schema || [],
                      priority: config.priority ?? 100,
                      is_active: config.is_active !== false,
                      contains_pii: config.contains_pii || false,
                      data_classification: config.data_classification || null,
                      file_type: config.file_type || null,
                      quality_rule_ids: config.quality_rule_ids || [],
                      archive_password: config.archive_password || '',
                      has_header: config.has_header !== undefined ? config.has_header : true,
                      header_definition: config.header_definition || null
                    }));
                    await axios.put(`/api/vendor-agreements/${agreementIdForConfigs}/file-schemas`, { fileSchemas });
                  } catch (fileConfigError) {
                    console.error('Error saving file configurations:', fileConfigError);
                  }
                }
                
                setNotificationModal({
                  isOpen: true,
                  type: 'success',
                  title: 'Success',
                  message: 'Contract updated successfully! Approvals have been reset to Pending Vendor acceptance.'
                });
                setTimeout(() => {
                  closeModal();
                  fetchData();
                }, 2000);
              } catch (error) {
                console.error('Error saving agreement:', error);
                let errorMessage = 'Failed to save vendor agreement';
                if (error.response?.data) {
                  const { error: errorMsg, message } = error.response.data;
                  errorMessage = errorMsg || message || errorMessage;
                } else if (error.message) {
                  errorMessage += ': ' + error.message;
                }
                setNotificationModal({
                  isOpen: true,
                  type: 'error',
                  title: 'Error',
                  message: errorMessage
                });
              }
            }
          });
          setConfirmModalOpen(true);
          return;
        }
        
        response = await axios.put(`/api/vendor-agreements/${selectedAgreement.id}`, submitData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        setNotificationModal({
          isOpen: true,
          type: 'success',
          title: 'Success',
          message: 'Vendor agreement updated successfully!'
        });
      }
      
      // Save file configurations after agreement is created/updated
      const agreementId = modalMode === 'create' ? response.data.agreement?.id : selectedAgreement.id;
      
      console.log('File configurations save check:', { 
        agreementId, 
        responseData: response.data,
        fileConfigsLength: fileConfigurations.length,
        fileConfigurations: fileConfigurations 
      });
      
      if (agreementId && fileConfigurations.length > 0) {
        try {
          console.log('Starting file configurations bulk save...', fileConfigurations.length, 'configurations');
          
          // Prepare file schemas for bulk save
          // Debug: Log each config's archive_password
          console.log('=== DEBUG: File configurations before mapping ===');
          fileConfigurations.forEach((config, idx) => {
            console.log(`Config ${idx}: pattern=${config.file_name_pattern}, archive_password=${config.archive_password ? config.archive_password.substring(0, 3) + '***' : 'EMPTY'}, has_archive_password=${config.has_archive_password}`);
          });
          
          const fileSchemas = fileConfigurations.map(config => ({
            file_name_pattern: config.file_name_pattern,
            file_description: config.file_description || '',
            schema: config.schema || [],
            priority: config.priority ?? 100,
            is_active: config.is_active !== false,
            contains_pii: config.contains_pii || false,
            data_classification: config.data_classification || null,
            file_type: config.file_type || null,
            quality_rule_ids: config.quality_rule_ids || [],
            archive_password: config.archive_password || '',
            has_header: config.has_header !== undefined ? config.has_header : true,
            header_definition: config.header_definition || null
          }));
          
          console.log('=== DEBUG: File schemas being sent ===');
          fileSchemas.forEach((schema, idx) => {
            console.log(`Schema ${idx}: pattern=${schema.file_name_pattern}, archive_password=${schema.archive_password ? schema.archive_password.substring(0, 3) + '***' : 'EMPTY'}`);
          });
          
          // Use bulk replace endpoint (deletes all existing and creates new ones in one transaction)
          const bulkResponse = await axios.put(`/api/vendor-agreements/${agreementId}/file-schemas`, {
            fileSchemas
          });
          
          console.log('File configurations saved successfully:', bulkResponse.data);
        } catch (fileConfigError) {
          console.error('Error saving file configurations:', fileConfigError);
          console.error('Error details:', fileConfigError.response?.data);
          setNotificationModal({
            isOpen: true,
            type: 'error',
            title: 'Partial Error',
            message: 'Agreement saved but failed to save file configurations: ' + (fileConfigError.response?.data?.error || fileConfigError.message)
          });
        }
      } else {
        console.log('Skipping file configurations save:', { agreementId, hasConfigs: fileConfigurations.length > 0 });
      }
      
      setTimeout(() => {
        closeModal();
        fetchData();
      }, 2000);
    } catch (error) {
      console.error('Error saving agreement:', error);
      
      let errorMessage = 'Failed to save vendor agreement';
      
      if (error.response?.data) {
        const { error: errorMsg, message } = error.response.data;
        errorMessage = errorMsg || message || errorMessage;
      } else if (error.message) {
        errorMessage += ': ' + error.message;
      }
      
      setNotificationModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: errorMessage
      });
    }
  };
  
  const handleApprove = async (approverType) => {
    setDetailModalError('');
    setDetailModalSuccess('');
    
    try {
      const response = await axios.post(`/api/vendor-agreements/${selectedAgreement.id}/approve`, {
        approver_type: approverType
      });
      
      setDetailModalSuccess(`Agreement approved as ${approverType} successfully!`);
      
      await fetchAgreementDetails(selectedAgreement.id);
      fetchData();
      
      setTimeout(() => setDetailModalSuccess(''), 5000);
    } catch (error) {
      console.error('Error approving agreement:', error);
      setDetailModalError('Failed to approve agreement: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const handleReject = async (approverType) => {
    setDetailModalError('');
    setDetailModalSuccess('');
    
    if (!rejectComments.trim()) {
      setDetailModalError('Comments are required for rejection');
      return;
    }
    
    try {
      await axios.post(`/api/vendor-agreements/${selectedAgreement.id}/reject`, {
        comments: rejectComments,
        approver_type: approverType
      });
      
      setDetailModalSuccess(`Agreement rejected as ${approverType} successfully!`);
      setRejectComments('');
      
      await fetchAgreementDetails(selectedAgreement.id);
      fetchData();
      
      setTimeout(() => setDetailModalSuccess(''), 5000);
    } catch (error) {
      console.error('Error rejecting agreement:', error);
      setDetailModalError('Failed to reject agreement: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const handleDeleteAgreement = async (agreementId, fileName) => {
    try {
      // First, check for dependencies
      const response = await axios.get(`/api/vendor-agreements/${agreementId}/check-dependencies`);
      const dependencyData = response.data;
      
      // Find the full agreement object
      const agreement = agreements.find(a => a.id === agreementId);
      
      // Set modal data and open the delete confirmation modal
      setDeleteModalAgreement(agreement);
      setDeleteModalDependencies(dependencyData);
      setDeleteModalOpen(true);
    } catch (error) {
      console.error('Error checking dependencies:', error);
      setError('Failed to check contract dependencies: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const handleConfirmDelete = async (agreementId) => {
    try {
      await axios.delete(`/api/vendor-agreements/${agreementId}`);
      setSuccessMessage('Vendor agreement deleted successfully!');
      fetchData();
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error deleting agreement:', error);
      setError('Failed to delete contract: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const handleDisableAgreement = (agreementId, fileName) => {
    setConfirmModalConfig({
      title: 'Disable Agreement',
      message: `Are you sure you want to disable agreement "${fileName}"? This action can be reversed by editing the agreement later.`,
      onConfirm: async () => {
        try {
          await axios.patch(`/api/vendor-agreements/${agreementId}/disable`);
          setSuccessMessage('Vendor agreement disabled successfully!');
          fetchData();
          setTimeout(() => setSuccessMessage(''), 5000);
        } catch (error) {
          console.error('Error disabling agreement:', error);
          setError('Failed to disable contract: ' + (error.response?.data?.error || error.message));
        }
      }
    });
    setConfirmModalOpen(true);
  };
  
  const handleDownloadTemplate = async () => {
    try {
      setError('');
      const response = await axios.get('/api/vendor-agreement-template/download', {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vendor_agreement_template_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setSuccessMessage('Template downloaded successfully!');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error downloading template:', error);
      setError('Failed to download template: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const handleTemplateUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setTemplateFile(file);
    event.target.value = '';
    
    try {
      setTemplateError('');
      setUploadingTemplate(true);
      setLoading(true);
      
      const formData = new FormData();
      formData.append('template', file);
      
      const response = await axios.post('/api/vendor-agreement-template/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setLoading(false);
      setUploadingTemplate(false);
      
      console.log('Template upload response:', response.data);
      
      if (response.data.success && response.data.agreements.length > 0) {
        const agreement = response.data.agreements[0];
        console.log('First agreement data:', agreement);
        
        setFormData(prev => ({
          ...prev,
          vendor_id: prev.vendor_id || '',
          project_id: prev.project_id || '',
          vendor_connection_id: prev.vendor_connection_id || '',
          file_owner_user_id: prev.file_owner_user_id || '',
          file_name: agreement.file_name || '',
          file_description: agreement.file_description || '',
          description: agreement.file_description || agreement.description || '',
          vendor_department_team: agreement.vendor_department_team || '',
          vendor_department_email: agreement.vendor_department_email || '',
          owner_contact: agreement.vendor_department_email || '',
          schema: agreement.schema || '',
          frequency: agreement.frequency || '',
          frequency_description: agreement.frequency_description || '',
          domain: agreement.domain || '',
          retention_days: agreement.retention_days || '',
          expected_arrival_time: agreement.expected_arrival_time || '',
          delivery_method: agreement.delivery_method || '',
          primary_contact_user_id: '',
          primary_contact_name: '',
          primary_contact_email: '',
          primary_contact_phone: '',
          primary_contact_designation: '',
          secondary_contact_user_id: '',
          secondary_contact_name: '',
          secondary_contact_email: '',
          secondary_contact_phone: '',
          secondary_contact_designation: ''
        }));
        
        // Populate file configurations from template
        if (agreement.fileConfigurations && agreement.fileConfigurations.length > 0) {
          console.log('Setting file configurations from template:', agreement.fileConfigurations);
          setFileConfigurations(agreement.fileConfigurations);
        } else {
          setFileConfigurations([]);
        }
        
        setModalOpen(true);
        
        if (response.data.agreements.length > 1) {
          setSuccessMessage(`Template loaded with first agreement. Note: ${response.data.agreements.length} agreements found in template, but only the first one was loaded.`);
        } else {
          setSuccessMessage('Template loaded successfully! Please review and fill in vendor, project, connections, and contacts before submitting.');
        }
        setTimeout(() => setSuccessMessage(''), 8000);
      }
    } catch (error) {
      console.error('Error uploading template:', error);
      setLoading(false);
      setUploadingTemplate(false);
      
      if (error.response?.data?.details && Array.isArray(error.response.data.details)) {
        const details = error.response.data.details;
        const errorMsg = `Template validation failed:\n${details.map(e => 
          `Row ${e.row}: ${e.errors.join(', ')}`
        ).join('\n')}`;
        setTemplateError(errorMsg);
      } else {
        setTemplateError('Failed to upload template: ' + (error.response?.data?.error || error.response?.data?.message || error.message));
      }
    }
  };
  
  const getApprovalStatusBadge = (agreement) => {
    if (agreement.is_locked) {
      return <span className="approval-badge approval-locked">🔒 Locked</span>;
    }
    
    // Check approval_status field for accurate workflow state
    const status = agreement.approval_status;
    
    // If status is null/empty and agreement is in draft, show nothing (blank)
    if (!status && agreement.status === 'draft') {
      return null;
    }
    
    switch (status) {
      case 'draft':
        return <span className="approval-badge approval-draft">Draft</span>;
      
      case 'pending_vendor_acceptance':
      case 'changes_pending':
        return <span className="approval-badge approval-pending">Pending Vendor</span>;
      
      case 'vendor_accepted':
        return <span className="approval-badge approval-partial">Pending Vendor Manager</span>;
      
      case 'vendor_rejected':
        return <span className="approval-badge approval-pending">Pending Vendor Manager</span>;
      
      case 'manager_approved':
        return <span className="approval-badge approval-partial">Pending Governance Manager</span>;
      
      case 'manager_rejected':
        return <span className="approval-badge approval-pending">Pending Vendor Manager</span>;
      
      case 'pending_approval':
        return <span className="approval-badge approval-partial">⛓ Chain Approval In Progress</span>;

      case 'governance_approved':
      case 'fully_approved':
        return <span className="approval-badge approval-approved">Fully Approved ✓</span>;
      
      case 'governance_rejected':
        return <span className="approval-badge approval-pending">Pending Vendor Manager</span>;
      
      case 'closed':
        return <span className="approval-badge approval-locked">Closed</span>;
      
      default:
        // For active agreements with no approval_status, default to Pending Vendor
        if (agreement.status === 'active') {
          return <span className="approval-badge approval-pending">Pending Vendor</span>;
        }
        return null;
    }
  };
  
  const canApproveAsVendor = (agreement) => {
    // Only Admin OR vendor-side users/contacts can approve as vendor
    // Vendor Manager role should NOT see this button (they only see internal approval)
    
    // Check if user is a vendor user for this agreement
    const isVendorUserForAgreement = isVendor && currentUser.vendor_id === agreement.vendor_id;
    
    // Also allow if user's email matches primary or secondary contact email
    const isContactUser = currentUser.email && (
      currentUser.email === agreement.primary_contact_email ||
      currentUser.email === agreement.secondary_contact_email
    );
    
    // Only show for Admin OR actual vendor-side people
    return (isAdmin || isVendorUserForAgreement || isContactUser) && !agreement.vendor_approved_at && !agreement.is_locked;
  };
  
  const canApproveAsOwner = (agreement) => {
    // Vendor users should NEVER see the Owner Approve button
    if (isVendor) {
      return false;
    }
    
    // Check if user has vendor_agreements:approve permission
    const hasApprovePermission = hasPermission && hasPermission('vendor_agreements:approve');
    
    // Allow if user has approve permission OR is the owner
    const isOwnerUser = currentUser.id === agreement.file_owner_user_id;
    return (hasApprovePermission || isAdmin || isOwnerUser) && !agreement.owner_approved_at && !agreement.is_locked;
  };
  
  const renderSchemaTable = (schema) => {
    if (!schema || !Array.isArray(schema) || schema.length === 0) {
      return <p className="no-data">No schema defined</p>;
    }
    
    return (
      <table className="schema-table">
        <thead>
          <tr>
            <th>Column Name</th>
            <th>Data Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {schema.map((column, index) => (
            <tr key={index}>
              <td>{column.name || column.column_name || '-'}</td>
              <td>{column.type || column.data_type || '-'}</td>
              <td>{column.description || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };
  
  const frequencyOptions = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually', 'On-Demand'];

  // Filter agreements based on search term
  const filteredAgreements = agreements.filter(agreement => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (agreement.file_name || '').toLowerCase().includes(term) ||
      (agreement.vendor_name || '').toLowerCase().includes(term) ||
      (agreement.agreement_code || '').toLowerCase().includes(term) ||
      (agreement.file_description || '').toLowerCase().includes(term) ||
      (agreement.description || '').toLowerCase().includes(term)
    );
  });

  // Apply pagination to filtered agreements
  const totalItems = filteredAgreements.length;
  const totalPagesFiltered = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedAgreements = filteredAgreements.slice(startIndex, endIndex);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Clamp currentPage when filtered results change
  useEffect(() => {
    if (currentPage > totalPagesFiltered && totalPagesFiltered > 0) {
      setCurrentPage(totalPagesFiltered);
    }
  }, [totalPagesFiltered, currentPage]);
  
  return (
    <div className="gps-page-container">
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="gps-page-header">
            <div className="gps-page-header-left">
              <h1 className="gps-page-title">Vendor Contracts</h1>
              <p className="gps-page-subtitle">Manage vendor file delivery agreements and contracts</p>
            </div>
            <div className="gps-header-actions">
              <LineageBackButton />
              <div className="gps-search-wrapper">
                <FiSearch className="gps-search-icon" />
                <input
                  type="text"
                  className="gps-search-input"
                  placeholder="Search contracts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {(isAdmin || (hasPermission && hasPermission('vendor_agreements:write'))) && !isVendor && (
                <>
                  {isAdmin && (
                    <>
                      <button 
                        className="gps-btn gps-btn--secondary"
                        onClick={handleDownloadTemplate}
                        title="Download Excel template for bulk agreement creation"
                      >
                        Download Template
                      </button>
                      <label 
                        className="gps-btn gps-btn--secondary" 
                        style={{ cursor: 'pointer' }}
                        title="Upload filled Excel template to create multiple agreements"
                      >
                        Upload Template
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleTemplateUpload}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </>
                  )}
                  <button 
                    className="gps-btn gps-btn--primary"
                    onClick={openCreateModal}
                  >
                    Create Vendor Contract
                  </button>
                </>
              )}
            </div>
          </div>
          
          {error && (
            <div className="gps-alert gps-alert--error" role="alert">
              {error}
            </div>
          )}
          
          {successMessage && (
            <div className="gps-alert gps-alert--success" role="alert">
              {successMessage}
            </div>
          )}
      
          <div className="gps-table-container">
            <table className="gps-table">
              <thead>
                <tr>
                  <th>Agreement Code</th>
                  <th>Description</th>
                  <th>File Name</th>
                  <th>Vendor</th>
                  <th>Frequency</th>
                  <th>Status</th>
                  <th>Approvals</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAgreements.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="gps-table-empty">No contracts found</td>
                  </tr>
                ) : (
                  paginatedAgreements.map(agreement => (
                    <tr key={agreement.id}>
                      <td>{agreement.agreement_code}</td>
                      <td>{agreement.description || '-'}</td>
                      <td>
                        {(() => {
                          const fileSchemas = agreement.file_schemas || [];
                          const legacyFileName = agreement.file_name;
                          
                          if (fileSchemas.length === 0 && !legacyFileName) {
                            return <span className="gps-text-muted" style={{ fontStyle: 'italic' }}>No files configured</span>;
                          } else if (fileSchemas.length === 0 && legacyFileName) {
                            return legacyFileName;
                          } else if (fileSchemas.length === 1) {
                            return fileSchemas[0].file_name;
                          } else {
                            return (
                              <span
                                onClick={() => {
                                  setMultipleFilesData(fileSchemas);
                                  setMultipleFilesModalOpen(true);
                                }}
                                className="gps-link"
                                title="Click to view all files"
                              >
                                Multiple Files ({fileSchemas.length})
                              </span>
                            );
                          }
                        })()}
                      </td>
                      <td>{agreement.vendor_name || agreement.vendor_code || '-'}</td>
                      <td>{agreement.frequency}</td>
                      <td>
                        <span className={`gps-badge gps-badge--${agreement.status === 'active' ? 'success' : agreement.status === 'disabled' ? 'muted' : 'info'}`}>
                          {agreement.status || 'Active'}
                        </span>
                      </td>
                      <td>{getApprovalStatusBadge(agreement)}</td>
                      <td>{agreement.created_at ? new Date(agreement.created_at).toLocaleString() : '-'}</td>
                      <td>
                        <div className="gps-action-buttons">
                          <button 
                            className="gps-icon-btn gps-icon-btn--view" 
                            onClick={() => openDetailModal(agreement)}
                            title="View details"
                          >
                            <FiEye />
                          </button>
                          {(isAdmin || (isVendor && currentUser.vendor_id === agreement.vendor_id && hasPermission && hasPermission('vendor_agreements:write'))) && (
                            <button 
                              className="gps-icon-btn gps-icon-btn--edit" 
                              onClick={() => openEditModal(agreement)}
                              title="Edit contract"
                            >
                              <FiEdit2 />
                            </button>
                          )}
                          {isAdmin && agreement.status !== 'disabled' && (
                            <button 
                              className="gps-icon-btn" 
                              onClick={() => handleDisableAgreement(agreement.id, agreement.file_name)}
                              title="Disable contract"
                              style={{ color: '#f59e0b' }}
                            >
                              <FiSlash />
                            </button>
                          )}
                          {isAdmin && (
                            <button 
                              className="gps-icon-btn gps-icon-btn--delete" 
                              onClick={() => handleDeleteAgreement(agreement.id, agreement.file_name)}
                              title="Delete contract"
                            >
                              <FiTrash2 />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {totalPagesFiltered > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPagesFiltered}
              onPageChange={setCurrentPage}
              itemsPerPage={pageSize}
              totalItems={totalItems}
            />
          )}
          
          {modalOpen && (
            <ThreeSectionModal
              isOpen={modalOpen}
              onClose={closeModal}
              title={modalMode === 'create' ? 'Create Vendor Contract' : 'Edit Vendor Contract'}
              size="large"
              footer={
                <>
                  <button type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    onClick={(e) => handleSubmit(e, true)}
                    className="btn-secondary"
                    disabled={modalMode === 'edit' && selectedAgreement?.approval_status && selectedAgreement.approval_status !== 'draft'}
                    title={modalMode === 'edit' && selectedAgreement?.approval_status && selectedAgreement.approval_status !== 'draft' ? 'Cannot save as draft once contract is in approval workflow' : ''}
                  >
                    Save Draft
                  </button>
                  <button type="submit" form="agreement-form">
                    {modalMode === 'create' || selectedAgreement?.status === 'draft' ? 'Create Contract' : 'Update Contract'}
                  </button>
                </>
              }
            >
              <form id="agreement-form" onSubmit={handleSubmit} className="agreement-form">
                {/* Section 1: Quick Setup with Template (Optional - Auto-populate fields) */}
                {modalMode === 'create' && (
                  <div className="form-section quick-setup-section">
                    <h3 className="section-title quick-setup-title">
                      Quick Setup with Template
                    </h3>
                    <p className="quick-setup-description">
                      Download a template, fill it with your contract details, and upload to auto-populate most fields below.
                    </p>
                    
                    <div className="form-group">
                      <div className="form-label">Download Template</div>
                      <div className="template-buttons">
                        <button
                          type="button"
                          onClick={() => handleDownloadTemplate('xlsx')}
                          className="btn-template"
                        >
                          Excel (.xlsx)
                        </button>
                      </div>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="templateFile">Upload Filled Template</label>
                      <input
                        type="file"
                        id="templateFile"
                        accept=".xlsx,.xls"
                        onChange={handleTemplateUpload}
                        disabled={uploadingTemplate}
                      />
                      {templateFile && !templateError && (
                        <p className="file-selected success-text">
                          Template uploaded: {templateFile.name}
                        </p>
                      )}
                      {uploadingTemplate && (
                        <p className="processing-text">
                          Processing template...
                        </p>
                      )}
                      {templateError && (
                        <div className="template-error-message">
                          <p className="error-text" style={{ 
                            color: '#dc3545', 
                            backgroundColor: '#f8d7da', 
                            border: '1px solid #f5c6cb',
                            borderRadius: '4px',
                            padding: '10px 12px',
                            marginTop: '8px',
                            fontSize: '12px',
                            whiteSpace: 'pre-line'
                          }}>
                            {templateError}
                          </p>
                        </div>
                      )}
                      <small>
                        Upload Excel (.xlsx, .xls) file - Fields below will auto-populate
                      </small>
                    </div>
                  </div>
                )}
                
                {/* Section 2: Agreement Information */}
                <div className="form-section">
                  <h3 className="section-title">Agreement Information</h3>
                  
                  {/* Row 1: Vendor and Description */}
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="vendor_id">
                        Vendor Name {isAdmin && <span className="required-field">*</span>}
                      </label>
                      {isAdmin ? (
                        <select
                          id="vendor_id"
                          name="vendor_id"
                          value={formData.vendor_id}
                          onChange={handleInputChange}
                          required
                        >
                          <option value="">Select a vendor</option>
                          {Array.isArray(vendors) && vendors.map(vendor => (
                            <option key={vendor.id} value={vendor.id}>
                              {vendor.vendor_name} ({vendor.vendor_code})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={
                            currentVendorId && Array.isArray(vendors) 
                              ? (vendors.find(v => v.id === currentVendorId)?.vendor_name || 'Loading...')
                              : 'Loading...'
                          }
                          disabled
                        />
                      )}
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="description">Description</label>
                      <input
                        type="text"
                        id="description"
                        name="description"
                        value={formData.description || ''}
                        onChange={handleInputChange}
                        placeholder="Enter a description for this agreement"
                      />
                      <span className="form-helper-text">Optional: Add a description to easily identify this agreement</span>
                    </div>
                  </div>
                  
                  {/* Row 2: Project and Sub-Project (conditional) */}
                  {formData.vendor_id && (
                    <div className="form-row-grid">
                      <div className="form-group">
                        <label htmlFor="project_name">Project</label>
                        <input
                          type="text"
                          id="project_name"
                          value={formData.project_name || ''}
                          readOnly
                          placeholder={formData.project_name ? "" : "No project assigned to vendor"}
                        />
                        <span className="form-helper-text">Automatically assigned from the vendor's project</span>
                      </div>
                      
                      {formData.project_id && (
                        <div className="form-group">
                          <label htmlFor="sub_project_id">Sub Project</label>
                          <select
                            id="sub_project_id"
                            name="sub_project_id"
                            value={formData.sub_project_id || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              sub_project_id: e.target.value ? parseInt(e.target.value) : ''
                            }))}
                            disabled={!formData.project_id || loadingSubProjects || subProjects.length === 0}
                          >
                            <option value="">Select a sub-project (optional)...</option>
                            {subProjects.map(sp => (
                              <option key={sp.id} value={sp.id}>
                                {sp.name}
                              </option>
                            ))}
                          </select>
                          <span className="form-helper-text">
                            {!formData.project_id ? 'Project assignment required' : subProjects.length === 0 ? 'No sub-projects available' : 'Optional: Select a sub-project for this agreement'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Row 2: Vendor Manager and Manager Contact */}
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="file_owner_user_id">
                        Vendor Manager/File Owner <span className="required-field">*</span>
                      </label>
                      <select
                        id="file_owner_user_id"
                        name="file_owner_user_id"
                        value={formData.file_owner_user_id}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="">Select a user</option>
                        {users
                          .filter(user => user.roles && user.roles.includes('Vendor Manager'))
                          .map(user => (
                            <option key={user.id} value={user.id}>
                              {user.username} - {user.email}
                            </option>
                          ))}
                      </select>
                    </div>
                    
                    {formData.file_owner_user_id && (
                      <div className="form-group">
                        <label htmlFor="manager_contact">Manager Contact</label>
                        <input
                          type="text"
                          id="manager_contact"
                          name="manager_contact"
                          value={formData.manager_contact}
                          onChange={handleInputChange}
                          readOnly
                          placeholder="Auto-populated from vendor manager"
                        />
                        <span className="form-helper-text">Automatically populated from vendor manager's email</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Row 3: Governance Manager */}
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="governance_manager_user_id">
                        Governance Manager <span className="required-field">*</span>
                      </label>
                      <select
                        id="governance_manager_user_id"
                        name="governance_manager_user_id"
                        value={formData.governance_manager_user_id}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="">Select a governance manager</option>
                        {users
                          .filter(user => user.roles && user.roles.includes('Governance Manager'))
                          .map(user => (
                            <option key={user.id} value={user.id}>
                              {user.username} - {user.email}
                            </option>
                          ))}
                      </select>
                      <span className="form-helper-text">Responsible for final approval of the vendor contract</span>
                    </div>
                    
                    {formData.governance_manager_user_id && (
                      <div className="form-group">
                        <label htmlFor="governance_manager_email">Governance Manager Email</label>
                        <input
                          type="text"
                          id="governance_manager_email"
                          value={users.find(u => u.id === parseInt(formData.governance_manager_user_id))?.email || ''}
                          readOnly
                          placeholder="Governance manager email"
                        />
                        <span className="form-helper-text">Email address of the selected governance manager</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Section 3: Vendor Information */}
                {formData.vendor_id && (
                  <div className="form-section">
                    <h3 className="section-title">Vendor Information</h3>
                    
                    <div className="form-row-grid">
                      <div className="form-group">
                        <label htmlFor="vendor_code">Vendor ID</label>
                        <input
                          type="text"
                          id="vendor_code"
                          name="vendor_code"
                          value={formData.vendor_code}
                          readOnly
                          placeholder="Auto from vendor"
                        />
                        <span className="form-helper-text">Automatically assigned when vendor is selected</span>
                      </div>
                      
                      <div className="form-group">
                        <label htmlFor="vendor_type">Vendor Type</label>
                        <input
                          type="text"
                          id="vendor_type"
                          name="vendor_type"
                          value={formData.vendor_type}
                          readOnly
                          placeholder="Auto from vendor"
                        />
                        <span className="form-helper-text">Automatically assigned when vendor is selected</span>
                      </div>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="vendor_onboarding_date">Vendor Onboarding Date <span className="required-field">*</span></label>
                      <input
                        type="date"
                        id="vendor_onboarding_date"
                        name="vendor_onboarding_date"
                        value={formData.vendor_onboarding_date}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    
                    <div className="form-row-grid">
                      <div className="form-group">
                        <label htmlFor="contract_start_date">Contract Start Date & Time <span className="required-field">*</span></label>
                        <input
                          type="datetime-local"
                          id="contract_start_date"
                          name="contract_start_date"
                          value={formData.contract_start_date}
                          onChange={handleInputChange}
                          required
                        />
                        <span className="form-helper-text">Date and time when the contract becomes active</span>
                      </div>
                      
                      <div className="form-group">
                        <label htmlFor="contract_end_date">Contract End Date & Time <span className="required-field">*</span></label>
                        <input
                          type="datetime-local"
                          id="contract_end_date"
                          name="contract_end_date"
                          value={formData.contract_end_date}
                          onChange={handleInputChange}
                          required
                        />
                        <span className="form-helper-text">Contract will be automatically disabled after this date and time</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Section 3: File Owner & Manager Details */}
                <div className="form-section">
                  <h3 className="section-title">File Owner & Manager</h3>
                  
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="vendor_department_team">Vendor Department/Team <span className="required-field">*</span></label>
                      <input
                        type="text"
                        id="vendor_department_team"
                        name="vendor_department_team"
                        value={formData.vendor_department_team}
                        onChange={handleInputChange}
                        placeholder="e.g., Data Operations, Finance Team"
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="vendor_department_email">Vendor Department Email <span className="required-field">*</span></label>
                      <input
                        type="email"
                        id="vendor_department_email"
                        name="vendor_department_email"
                        value={formData.vendor_department_email}
                        onChange={handleInputChange}
                        placeholder="department@vendor.com"
                        required
                      />
                    </div>
                  </div>
                </div>
                
                {/* Section 4: Vendor Contact Information */}
                <div className="form-section">
                  <h3 className="section-title">Vendor Contact Information</h3>
                  
                  <div className="two-column-grid">
                    {/* Primary Contact (Left Column) */}
                    <div className="form-panel">
                      <h4 className="form-panel-title">Primary Contact</h4>
                      
                      <div className="form-group">
                        <label htmlFor="primary_contact_user_id">
                          Select Contact <span className="required-field">*</span>
                        </label>
                        <VendorUserSelect
                          value={formData.primary_contact_user_id || ''}
                          onChange={(e) => {
                            const user = e.target.vendorUser;
                            setFormData(prev => ({
                              ...prev,
                              primary_contact_user_id: e.target.value,
                              primary_contact_name: user?.full_name || user?.username || '',
                              primary_contact_phone: user?.phone_number || '',
                              primary_contact_email: user?.email || '',
                              primary_contact_designation: user?.username || ''
                            }));
                          }}
                          placeholder="Select primary contact"
                          required
                          name="primary_contact_user_id"
                          filterByVendorId={currentVendorId || formData.vendor_id}
                        />
                      </div>
                      
                      {formData.primary_contact_name && (
                        <div className="contact-info-box">
                          <p><strong>Name:</strong> {formData.primary_contact_name}</p>
                          {formData.primary_contact_email && (
                            <p><strong>Email:</strong> {formData.primary_contact_email}</p>
                          )}
                          {formData.primary_contact_phone && (
                            <p><strong>Phone:</strong> {formData.primary_contact_phone}</p>
                          )}
                          {formData.primary_contact_designation && (
                            <p><strong>Designation:</strong> {formData.primary_contact_designation}</p>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Secondary Contact (Right Column) */}
                    <div className="form-panel">
                      <h4 className="form-panel-title">Secondary Contact</h4>
                      
                      <div className="form-group">
                        <label htmlFor="secondary_contact_user_id">Select Contact <span className="required-field">*</span></label>
                        <VendorUserSelect
                          value={formData.secondary_contact_user_id || ''}
                          onChange={(e) => {
                            const user = e.target.vendorUser;
                            setFormData(prev => ({
                              ...prev,
                              secondary_contact_user_id: e.target.value,
                              secondary_contact_name: user?.full_name || user?.username || '',
                              secondary_contact_phone: user?.phone_number || '',
                              secondary_contact_email: user?.email || '',
                              secondary_contact_designation: user?.username || ''
                            }));
                          }}
                          placeholder="Select secondary contact"
                          required
                          name="secondary_contact_user_id"
                          filterByVendorId={currentVendorId || formData.vendor_id}
                        />
                      </div>
                      
                      {formData.secondary_contact_name && (
                        <div className="contact-info-box">
                          <p><strong>Name:</strong> {formData.secondary_contact_name}</p>
                          {formData.secondary_contact_email && (
                            <p><strong>Email:</strong> {formData.secondary_contact_email}</p>
                          )}
                          {formData.secondary_contact_phone && (
                            <p><strong>Phone:</strong> {formData.secondary_contact_phone}</p>
                          )}
                          {formData.secondary_contact_designation && (
                            <p><strong>Designation:</strong> {formData.secondary_contact_designation}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Section 5: Additional Stakeholders */}
                <div className="form-section">
                  <h3 className="section-title">Additional Stakeholders</h3>
                  <p className="section-description" style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
                    Add internal users or groups who should receive notifications when this agreement is updated.
                    These stakeholders will be notified in addition to the primary contacts, vendor manager, and governance manager.
                  </p>
                  
                  <div className="form-row-grid">
                    {/* Additional Users */}
                      <div className="form-group">
                        <label htmlFor="additional-users-select">Additional Users</label>
                      {loadingStakeholders ? (
                        <p style={{ color: '#666', fontSize: '12px' }}>Loading users...</p>
                      ) : (
                        <>
                          <select
                            id="additional-users-select"
                            multiple
                            value={formData.additional_stakeholder_user_ids.map(id => String(id))}
                            onChange={(e) => {
                              const selectedIds = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                              setFormData(prev => ({
                                ...prev,
                                additional_stakeholder_user_ids: selectedIds
                              }));
                            }}
                            style={{ minHeight: '120px', width: '100%' }}
                          >
                            {stakeholderOptions.users.map(user => (
                              <option key={user.id} value={user.id}>
                                {user.fullName} ({user.email})
                              </option>
                            ))}
                          </select>
                          <span className="form-helper-text">Hold Ctrl/Cmd to select multiple users</span>
                          {formData.additional_stakeholder_user_ids.length > 0 && (
                            <div style={{ marginTop: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                              <strong style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', fontWeight: 600 }}>Selected ({formData.additional_stakeholder_user_ids.length}):</strong>
                              <ul style={{ margin: '4px 0 0 16px', padding: 0, fontFamily: 'Inter, sans-serif', fontSize: '8px', fontWeight: 400 }}>
                                {formData.additional_stakeholder_user_ids.map(id => {
                                  const user = stakeholderOptions.users.find(u => u.id === id);
                                  return user ? <li key={id}>{user.fullName}</li> : null;
                                })}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    
                    {/* Additional Groups */}
                    <div className="form-group">
                      <label htmlFor="additional-groups-select">Additional Groups</label>
                      {loadingStakeholders ? (
                        <p style={{ color: '#666', fontSize: '12px' }}>Loading groups...</p>
                      ) : (
                        <>
                          <select
                            id="additional-groups-select"
                            multiple
                            value={formData.additional_stakeholder_group_ids.map(id => String(id))}
                            onChange={(e) => {
                              const selectedIds = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                              setFormData(prev => ({
                                ...prev,
                                additional_stakeholder_group_ids: selectedIds
                              }));
                            }}
                            style={{ minHeight: '120px', width: '100%' }}
                          >
                            {stakeholderOptions.groups.map(group => (
                              <option key={group.id} value={group.id}>
                                {group.name} ({group.memberCount} members)
                              </option>
                            ))}
                          </select>
                          <span className="form-helper-text">Hold Ctrl/Cmd to select multiple groups. All members of selected groups will be notified.</span>
                          {formData.additional_stakeholder_group_ids.length > 0 && (
                            <div style={{ marginTop: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                              <strong style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', fontWeight: 600 }}>Selected ({formData.additional_stakeholder_group_ids.length}):</strong>
                              <ul style={{ margin: '4px 0 0 16px', padding: 0, fontFamily: 'Inter, sans-serif', fontSize: '8px', fontWeight: 400 }}>
                                {formData.additional_stakeholder_group_ids.map(id => {
                                  const group = stakeholderOptions.groups.find(g => g.id === id);
                                  return group ? <li key={id}>{group.name} ({group.memberCount} members)</li> : null;
                                })}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Section 5b: Approval Chain — available in both create and edit modes */}
                {modalMode === 'create' && (
                  <div className="form-section">
                    <h3 className="section-title">Approval Chain</h3>
                    <p className="section-description" style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
                      Optionally configure a sequential multi-step approval chain. Click &ldquo;Apply&rdquo; to
                      confirm your steps — the chain will be saved automatically when the contract is created.
                    </p>
                    <ApprovalChainConfig
                      users={chainUsers}
                      initialSteps={autoApprovalChain}
                      onChange={(steps) => {
                        chainManuallyApplied.current = true;
                        setPendingApprovalChain(steps);
                      }}
                      onError={(msg) => setError(msg)}
                      onSuccess={(msg) => {
                        setSuccessMessage(msg);
                        setTimeout(() => setSuccessMessage(''), 5000);
                      }}
                    />
                  </div>
                )}

                {modalMode === 'edit' && selectedAgreement?.id && (
                  <div className="form-section">
                    <h3 className="section-title">Approval Chain</h3>
                    <p className="section-description" style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
                      Configure a sequential multi-step approval chain for this contract.
                      After configuring, use the &ldquo;Submit for Chain Approval&rdquo; button inside
                      the contract details view to start the approval process.
                    </p>
                    <ApprovalChainConfig
                      agreement={selectedAgreement}
                      users={stakeholderOptions.users}
                      onSave={() => {
                        /* Refresh the selected agreement so the badge updates */
                        axios.get(`/api/vendor-agreements/${selectedAgreement.id}`)
                          .then(r => setSelectedAgreement(r.data.agreement || r.data))
                          .catch(() => {});
                      }}
                      onError={(msg) => setError(msg)}
                      onSuccess={(msg) => {
                        setSuccessMessage(msg);
                        setTimeout(() => setSuccessMessage(''), 5000);
                      }}
                    />
                  </div>
                )}

                {/* Section 6: Configuration */}
                <div className="form-section">
                  <h3 className="section-title">Configuration</h3>
                  
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="domain">Domain <span className="required-field">*</span></label>
                      <input
                        type="text"
                        id="domain"
                        name="domain"
                        value={formData.domain}
                        onChange={handleInputChange}
                        placeholder="e.g., Finance, Operations"
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="retention_days">Retention (in Days) <span className="required-field">*</span></label>
                      <input
                        type="number"
                        id="retention_days"
                        name="retention_days"
                        value={formData.retention_days}
                        onChange={handleInputChange}
                        placeholder="e.g., 365"
                        min="0"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="expected_arrival_time">Expected Arrival Time <span className="required-field">*</span></label>
                      <input
                        type="text"
                        id="expected_arrival_time"
                        name="expected_arrival_time"
                        value={formData.expected_arrival_time}
                        onChange={handleInputChange}
                        placeholder="e.g., 9:00 AM EST"
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="delivery_method">Delivery Method <span className="required-field">*</span></label>
                      <select
                        id="delivery_method"
                        name="delivery_method"
                        value={formData.delivery_method}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="">Select delivery method</option>
                        <option value="SFTP">SFTP</option>
                        <option value="S3">S3</option>
                        <option value="API">API</option>
                        <option value="Email">Email</option>
                        <option value="Manual">Manual</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                {/* Section 7: Configuration */}
                <div className="form-section">
                  <h3 className="section-title">Configuration</h3>
                  
                  {/* Frequency and Frequency Description in same row */}
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="frequency">
                        Frequency <span className="required-field">*</span>
                      </label>
                      <select
                        id="frequency"
                        name="frequency"
                        value={formData.frequency}
                        onChange={handleInputChange}
                        required
                      >
                        {frequencyOptions.map(freq => (
                          <option key={freq} value={freq}>{freq}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="frequency_description">Frequency Description</label>
                      <textarea
                        id="frequency_description"
                        name="frequency_description"
                        value={formData.frequency_description}
                        onChange={handleInputChange}
                        rows="2"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Section 8: SLA Monitoring Configuration */}
                <div className="form-section">
                  <h3 className="section-title">SLA Monitoring Configuration</h3>
                  
                  {/* SLA Enabled Toggle */}
                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="sla_enabled"
                        checked={formData.sla_enabled}
                        onChange={(e) => setFormData(prev => ({ ...prev, sla_enabled: e.target.checked }))}
                      />
                      <span className="checkbox-text">Enable SLA Monitoring</span>
                    </label>
                    <span className="form-helper-text checkbox-helper">
                      Automatically track file arrival times and send alerts when files are late
                    </span>
                  </div>
                  
                  {formData.sla_enabled && (
                    <>
                      <div className="form-row-grid">
                        <div className="form-group">
                          <label htmlFor="frequency_pattern">
                            Frequency Pattern <span className="required-field">*</span>
                          </label>
                          <select
                            id="frequency_pattern"
                            name="frequency_pattern"
                            value={formData.frequency_pattern}
                            onChange={handleInputChange}
                            required={formData.sla_enabled}
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="custom">Custom</option>
                          </select>
                          <span className="form-helper-text">How often the file is expected to arrive</span>
                        </div>
                        
                        <div className="form-group">
                          <label htmlFor="arrival_time">
                            Expected Arrival Time <span className="required-field">*</span>
                          </label>
                          <input
                            type="time"
                            id="arrival_time"
                            name="arrival_time"
                            value={formData.arrival_time}
                            onChange={handleInputChange}
                            required={formData.sla_enabled}
                          />
                          <span className="form-helper-text">Time of day the file should arrive (24-hour format)</span>
                        </div>
                      </div>
                      
                      {formData.frequency_pattern === 'weekly' && (
                        <div className="form-group">
                          <label htmlFor="arrival_days">
                            Expected Arrival Days <span className="required-field">*</span>
                          </label>
                          <input
                            type="text"
                            id="arrival_days"
                            name="arrival_days"
                            value={formData.arrival_days}
                            onChange={handleInputChange}
                            placeholder="e.g., 1,3,5 for Monday, Wednesday, Friday"
                            required={formData.sla_enabled && formData.frequency_pattern === 'weekly'}
                          />
                          <span className="form-helper-text">Days of the week: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday</span>
                        </div>
                      )}
                      
                      <div className="form-group">
                        <label htmlFor="alert_threshold_minutes">
                          Alert Threshold (Minutes) <span className="required-field">*</span>
                        </label>
                        <input
                          type="number"
                          id="alert_threshold_minutes"
                          name="alert_threshold_minutes"
                          value={formData.alert_threshold_minutes}
                          onChange={handleInputChange}
                          placeholder="e.g., 60"
                          min="0"
                          required={formData.sla_enabled}
                        />
                        <span className="form-helper-text">
                          Grace period in minutes after expected arrival time before triggering an alert
                        </span>
                      </div>
                    </>
                  )}
                </div>
                
                {/* Section 4: Connection Configuration */}
                <div className="form-section">
                  <h3 className="section-title">Connection Configuration</h3>
                  
                  <div className="form-panel">
                    <h4 className="form-panel-title">Source Connection</h4>
                    
                    <div className="form-group">
                      <label htmlFor="vendor_connection_id">
                        Vendor File Drop Connection <span className="required-field">*</span>
                      </label>
                      <select
                        id="vendor_connection_id"
                        name="vendor_connection_id"
                        value={formData.vendor_connection_id}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="">Select a vendor connection</option>
                        {filteredConnections.map(conn => (
                          <option key={conn.connection_id} value={conn.connection_id}>
                            {conn.name} ({conn.connection_type?.toUpperCase() || conn.storage_type?.toUpperCase() || 'AWS'})
                          </option>
                        ))}
                      </select>
                      <span className="form-helper-text">Where vendor will drop files</span>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="drop_location_path">Drop Location Path</label>
                      <input
                        type="text"
                        id="drop_location_path"
                        name="drop_location_path"
                        value={formData.drop_location_path}
                        readOnly
                        placeholder="Auto-populated"
                      />
                      <span className="form-helper-text">Auto-populated from connection</span>
                    </div>
                  </div>
                </div>
                
                {/* File Configurations Section */}
                <FileConfigurationsSection
                  fileConfigurations={fileConfigurations}
                  onChange={(newConfigs) => {
                    console.log('=== VendorAgreements: fileConfigurations onChange called ===');
                    const zipConfig = newConfigs.find(c => c.file_type === 'zip');
                    if (zipConfig) {
                      console.log('ZIP config archive_password:', zipConfig.archive_password ? zipConfig.archive_password.substring(0, 3) + '***' : 'EMPTY');
                    }
                    setFileConfigurations(newConfigs);
                  }}
                />
              </form>
            </ThreeSectionModal>
          )}
          
          {detailModalOpen && selectedAgreement && (
            <ThreeSectionModal
              isOpen={detailModalOpen}
              onClose={closeDetailModal}
              title={`Agreement Details - ${selectedAgreement.agreement_code || ''}`}
              primaryAction={null}
              secondaryAction="Close"
              onSecondaryClick={closeDetailModal}
              maxWidth="900px"
            >
              <div className="detail-modal-wrapper">
                <LineageBackButton />
                <div className="detail-tabs">
                  <button
                    className={activeTab === 'details' ? 'active' : ''}
                    onClick={() => setActiveTab('details')}
                  >
                    Details
                  </button>
                  <button
                    className={activeTab === 'fileSchemas' ? 'active' : ''}
                    onClick={() => setActiveTab('fileSchemas')}
                  >
                    File Schemas
                  </button>
                  <button
                    className={activeTab === 'approvals' ? 'active' : ''}
                    onClick={() => setActiveTab('approvals')}
                  >
                    Approvals
                  </button>
                  <button
                    className={activeTab === 'changes' ? 'active' : ''}
                    onClick={() => setActiveTab('changes')}
                  >
                    Change History
                  </button>
                </div>
                
                <div className="detail-content">
                  {activeTab === 'details' && (
                    <div className="details-tab">
                      {selectedAgreement.is_locked && (
                        <div className="locked-message">
                          🔒 This agreement is locked (fully approved). Editing requires re-approval.
                        </div>
                      )}
                      
                      <div className="detail-grid">
                        <div className="detail-item">
                          <div className="detail-label">Agreement Code:</div>
                          <span>{selectedAgreement.agreement_code || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">File Name:</div>
                          <span>{selectedAgreement.file_name || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Vendor Name:</div>
                          <span>
                            {selectedAgreement.vendor_name || '-'}
                            {selectedAgreement.vendor_code ? ` (${selectedAgreement.vendor_code})` : ''}
                          </span>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Frequency:</div>
                          <span>{selectedAgreement.frequency || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Vendor Department/Team:</div>
                          <span>{selectedAgreement.vendor_department_team || selectedAgreement.file_creator || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Vendor Manager/File Owner:</div>
                          <span>
                            {selectedAgreement.owner_username || selectedAgreement.owner_email || '-'}
                            {selectedAgreement.owner_username && selectedAgreement.owner_email ? ` (${selectedAgreement.owner_email})` : ''}
                          </span>
                        </div>
                        <div className="detail-item full-width detail-section-header">
                          <div className="detail-label">Primary Contact</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Name:</div>
                          <span>{selectedAgreement.primary_contact_name || selectedAgreement.vendor_contact || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Email:</div>
                          <span>{selectedAgreement.primary_contact_email || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Phone:</div>
                          <span>{selectedAgreement.primary_contact_phone || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Designation:</div>
                          <span>{selectedAgreement.primary_contact_designation || '-'}</span>
                        </div>
                        <div className="detail-item full-width detail-section-header">
                          <div className="detail-label">Secondary Contact</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Name:</div>
                          <span>{selectedAgreement.secondary_contact_name || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Email:</div>
                          <span>{selectedAgreement.secondary_contact_email || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Phone:</div>
                          <span>{selectedAgreement.secondary_contact_phone || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Designation:</div>
                          <span>{selectedAgreement.secondary_contact_designation || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Vendor Department Email:</div>
                          <span>{selectedAgreement.owner_contact || '-'}</span>
                        </div>
                        <div className="detail-item full-width">
                          <div className="detail-label">File Description:</div>
                          <span>{selectedAgreement.file_description || '-'}</span>
                        </div>
                        <div className="detail-item full-width">
                          <div className="detail-label">Frequency Description:</div>
                          <span>{selectedAgreement.frequency_description || '-'}</span>
                        </div>
                      </div>
                      
                      {/* Backward-compat guard: use DynamicApprovalPanel when a chain
                          config is present, ThreeStageApprovalPanel for legacy contracts */}
                      {selectedAgreement.approval_chain_config?.steps?.length > 0 ? (
                        <DynamicApprovalPanel
                          agreement={selectedAgreement}
                          currentUser={currentUser}
                          stepDecisions={stepDecisions}
                          users={users}
                          isAdmin={isAdmin}
                          onUpdate={() => fetchAgreementDetails(selectedAgreement.id)}
                          onError={(msg) => setDetailModalError(msg)}
                          onSuccess={(msg) => {
                            setDetailModalSuccess(msg);
                            setTimeout(() => setDetailModalSuccess(''), 5000);
                            fetchData();
                          }}
                        />
                      ) : (
                        <ThreeStageApprovalPanel
                          agreement={selectedAgreement}
                          currentUser={currentUser}
                          onUpdate={() => fetchAgreementDetails(selectedAgreement.id)}
                          onError={(msg) => setDetailModalError(msg)}
                          onSuccess={(msg) => {
                            setDetailModalSuccess(msg);
                            setTimeout(() => setDetailModalSuccess(''), 5000);
                            fetchData();
                          }}
                        />
                      )}
                    </div>
                  )}
                  
                  {activeTab === 'approvals' && (
                    <div className="approvals-tab">
                      {/* ── Chain step decisions (new N-step flow) ── */}
                      {stepDecisions.length > 0 && (
                        <>
                          <h3>Approval Chain Decisions</h3>
                          <table className="history-table" style={{ marginBottom: '20px' }}>
                            <thead>
                              <tr>
                                <th>Step</th>
                                <th>Timestamp</th>
                                <th>Approver</th>
                                <th>Action</th>
                                <th>Comments</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stepDecisions.map((dec, index) => (
                                <tr key={index}>
                                  <td>Step {dec.step_number}</td>
                                  <td>{dec.decided_at ? new Date(dec.decided_at).toLocaleString() : '-'}</td>
                                  <td>{dec.display_name || dec.username || dec.approver_user_id}</td>
                                  <td>
                                    <span className={`action-badge action-${dec.action}`}>
                                      {dec.action}
                                    </span>
                                  </td>
                                  <td>{dec.comments || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}

                      {/* ── Legacy 3-stage approval history ── */}
                      <h3>Approval History</h3>
                      {!Array.isArray(approvalHistory) || approvalHistory.length === 0 ? (
                        <p className="no-data">No approval history</p>
                      ) : (
                        <table className="history-table">
                          <thead>
                            <tr>
                              <th>Timestamp</th>
                              <th>User</th>
                              <th>Action</th>
                              <th>Comments</th>
                              <th>Documents</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.isArray(approvalHistory) && approvalHistory.map((approval, index) => (
                              <tr key={index}>
                                <td>{new Date(approval.approval_timestamp || approval.timestamp || approval.created_at).toLocaleString()}</td>
                                <td>{approval.username || approval.user_id}</td>
                                <td>
                                  <span className={`action-badge action-${approval.action}`}>
                                    {approval.action}
                                  </span>
                                </td>
                                <td>{approval.comments || '-'}</td>
                                <td>
                                  {approval.documents && approval.documents.length > 0 ? (
                                    <div className="document-list">
                                      {approval.documents.map((doc, docIndex) => (
                                        <div key={docIndex} className="document-item">
                                          📎 <a 
                                            href="#"
                                            className="document-link"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              const token = localStorage.getItem('token');
                                              if (!token) {
                                                setError('Session expired. Please log in again.');
                                                return;
                                              }
                                              fetch(`/api/vendor-agreements/${selectedAgreement.id}/documents/${doc.id}/download`, {
                                                headers: { 'Authorization': `Bearer ${token}` }
                                              })
                                              .then(res => {
                                                if (!res.ok) {
                                                  throw new Error(res.status === 401 ? 'Session expired. Please log in again.' : 'Failed to download document');
                                                }
                                                return res.blob();
                                              })
                                              .then(blob => {
                                                const url = window.URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = doc.document_name;
                                                document.body.appendChild(a);
                                                a.click();
                                                window.URL.revokeObjectURL(url);
                                                document.body.removeChild(a);
                                              })
                                              .catch(err => {
                                                console.error('Download error:', err);
                                                setError(err.message || 'Failed to download document');
                                              });
                                            }}
                                          >
                                            {doc.document_name}
                                          </a> ({(doc.file_size / 1024).toFixed(1)} KB)
                                        </div>
                                      ))}
                                    </div>
                                  ) : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                  
                  {activeTab === 'fileSchemas' && (
                    <div className="file-schemas-tab">
                      <FileSchemaManager agreementId={selectedAgreement.id} />
                    </div>
                  )}
                  
                  {activeTab === 'changes' && (
                    <div className="changes-tab">
                      <h3>Change History</h3>
                      {!Array.isArray(changeHistory) || changeHistory.length === 0 ? (
                        <p className="no-data">No change history</p>
                      ) : (
                        <table className="history-table">
                          <thead>
                            <tr>
                              <th>Timestamp</th>
                              <th>User</th>
                              <th>Change Type</th>
                              <th>Summary</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.isArray(changeHistory) && changeHistory.map((change, index) => {
                              const displayDate = change.changed_at || change.timestamp || change.created_at;
                              return (
                                <tr key={index}>
                                  <td>{displayDate ? new Date(displayDate).toLocaleString() : '-'}</td>
                                  <td>{change.username || change.user_id}</td>
                                  <td>
                                    <span className={`change-badge change-${change.change_type}`}>
                                      {change.change_type}
                                    </span>
                                  </td>
                                  <td>{formatChangeSummary(change.changes_summary || change.summary || change.description)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Success/Error Messages at Bottom of Modal */}
                {detailModalSuccess && (
                  <div className="modal-success-message" role="alert">
                    {detailModalSuccess}
                  </div>
                )}
                {detailModalError && (
                  <div className="modal-error-message" role="alert">
                    {detailModalError}
                  </div>
                )}
              </div>
            </ThreeSectionModal>
          )}
          
          {/* Confirmation Modal */}
          <ConfirmationModal
            isOpen={confirmModalOpen}
            onClose={() => setConfirmModalOpen(false)}
            onConfirm={() => {
              if (confirmModalConfig.onConfirm) {
                confirmModalConfig.onConfirm();
              }
              setConfirmModalOpen(false);
            }}
            title={confirmModalConfig.title}
            message={confirmModalConfig.message}
          />
          
          {/* Delete Confirmation Modal */}
          <DeleteConfirmationModal
            isOpen={deleteModalOpen}
            onClose={() => setDeleteModalOpen(false)}
            agreement={deleteModalAgreement}
            dependencies={deleteModalDependencies}
            onDelete={handleConfirmDelete}
            onDisable={handleDisableAgreement}
          />
          
          {/* S3 Folder Browser Modal */}
          {s3BrowserOpen && (
            <ThreeSectionModal
              isOpen={s3BrowserOpen}
              onClose={() => setS3BrowserOpen(false)}
              title="Browse S3 Folder"
              size="large"
              footer={
                <>
                  <button type="button" onClick={() => setS3BrowserOpen(false)}>
                    Close
                  </button>
                </>
              }
            >
              <S3FolderBrowser
                connectionId={s3BrowserConnectionId}
                onSelectPath={(path) => {
                  if (s3BrowserCallback) {
                    s3BrowserCallback(path);
                  }
                }}
                initialPath="/"
              />
            </ThreeSectionModal>
          )}
          
          {/* Multiple Files Modal */}
          {multipleFilesModalOpen && (
            <ThreeSectionModal
              isOpen={multipleFilesModalOpen}
              onClose={() => setMultipleFilesModalOpen(false)}
              title="Agreement Files"
              size="medium"
              footer={
                <>
                  <button type="button" onClick={() => setMultipleFilesModalOpen(false)}>
                    Close
                  </button>
                </>
              }
            >
              <div className="agreement-files-modal-content">
                {multipleFilesData.length === 0 ? (
                  <p className="no-files-message">No files configured</p>
                ) : (
                  <div className="agreement-files-list">
                    {multipleFilesData.map((fileSchema, index) => (
                      <div key={index} className="agreement-file-card">
                        <div className="file-card-header">
                          <span className="file-pattern">{fileSchema.file_name}</span>
                          <div className="file-badges">
                            {fileSchema.contains_pii && (
                              <span className="file-badge badge-pii">PII</span>
                            )}
                            {fileSchema.data_classification && (
                              <span className={`file-badge badge-classification badge-${fileSchema.data_classification.toLowerCase().replace(' ', '-')}`}>
                                {fileSchema.data_classification}
                              </span>
                            )}
                            {fileSchema.file_type && (
                              <span className="file-badge badge-filetype">{fileSchema.file_type}</span>
                            )}
                          </div>
                        </div>
                        {fileSchema.file_description && (
                          <p className="file-description">{fileSchema.file_description}</p>
                        )}
                        {fileSchema.quality_rule_ids && fileSchema.quality_rule_ids.length > 0 && (
                          <div className="file-quality-rules">
                            <span>Quality Rules: {fileSchema.quality_rule_ids.length}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ThreeSectionModal>
          )}
          
          {/* Notification Modal for Success/Error Messages */}
          <NotificationModal
            isOpen={notificationModal.isOpen}
            onClose={() => setNotificationModal({ ...notificationModal, isOpen: false })}
            type={notificationModal.type}
            title={notificationModal.title}
            message={notificationModal.message}
            autoClose={notificationModal.type !== 'error'}
          />
        </>
      )}
    </div>
  );
};

export default VendorAgreements;
