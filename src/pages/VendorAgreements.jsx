import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import ThreeSectionModal from '../components/ThreeSectionModal';
import ConfirmationModal from '../components/ConfirmationModal';
import S3FolderBrowser from '../components/S3FolderBrowser';
import VendorUserSelect from '../components/VendorUserSelect';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import '../styles/VendorAgreements.css';

const VendorAgreements = () => {
  const [agreements, setAgreements] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [approvalHistory, setApprovalHistory] = useState([]);
  const [changeHistory, setChangeHistory] = useState([]);
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
  
  // S3 Folder Browser state
  const [s3BrowserOpen, setS3BrowserOpen] = useState(false);
  const [s3BrowserConnectionId, setS3BrowserConnectionId] = useState(null);
  const [s3BrowserCallback, setS3BrowserCallback] = useState(null);
  
  // Vendor connections state
  const [vendorConnections, setVendorConnections] = useState([]);
  const [filteredConnections, setFilteredConnections] = useState([]);
  
  const [formData, setFormData] = useState({
    vendor_id: '',
    file_name: '',
    file_description: '',
    schema: '',
    frequency: 'Daily',
    frequency_description: '',
    vendor_department_team: '',
    file_owner_user_id: '',
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
    target_connection_id: '',
    drop_location_path: '',
    target_file_path: '',
    project_id: '',
    project_name: '',
    manager_contact: '',
    vendor_type: '',
    vendor_onboarding_date: '',
    contains_pii: false,
    file_type: '',
    data_classification: '',
    domain: '',
    retention_days: '',
    expected_arrival_time: '',
    delivery_method: ''
  });
  
  const [templateFile, setTemplateFile] = useState(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  const { currentUser, hasRole } = useAuth();
  const navigate = useNavigate();
  
  const isAdmin = hasRole && hasRole('Admin');
  const isVendor = hasRole && hasRole('Vendor');
  const isOwner = hasRole && hasRole('Owner');
  
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    
    fetchData();
  }, [currentUser, navigate, currentPage, pageSize]);
  
  const fetchData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const [agreementsResponse, vendorsResponse, usersResponse, connectionsResponse] = await Promise.all([
        axios.get('/api/vendor-agreements', {
          params: { page: currentPage, pageSize }
        }),
        axios.get('/api/vendors'),
        axios.get('/api/users'),
        axios.get('/api/vendor-connections')
      ]);
      
      setAgreements(agreementsResponse.data.agreements || agreementsResponse.data || []);
      setTotalPages(agreementsResponse.data.pagination?.totalPages || 1);
      setTotalCount(agreementsResponse.data.pagination?.totalCount || 0);
      
      setVendors(vendorsResponse.data.vendors || vendorsResponse.data || []);
      setUsers(usersResponse.data.users || usersResponse.data || []);
      setVendorConnections(connectionsResponse.data.connections || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load vendor agreements data');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchAgreementDetails = async (agreementId) => {
    try {
      const [agreementResponse, approvalsResponse, changesResponse] = await Promise.all([
        axios.get(`/api/vendor-agreements/${agreementId}`),
        axios.get(`/api/vendor-agreements/${agreementId}/approvals`),
        axios.get(`/api/vendor-agreements/${agreementId}/changes`)
      ]);
      
      // Update selected agreement with fresh data from API
      setSelectedAgreement(agreementResponse.data.agreement || agreementResponse.data);
      
      // Handle approval history - API might return {approvals: [...]} or just [...]
      const approvals = approvalsResponse.data?.approvals || approvalsResponse.data || [];
      setApprovalHistory(Array.isArray(approvals) ? approvals : []);
      
      // Handle change history - API might return {changes: [...]} or just [...]
      const changes = changesResponse.data?.changes || changesResponse.data || [];
      setChangeHistory(Array.isArray(changes) ? changes : []);
    } catch (error) {
      console.error('Error fetching agreement details:', error);
      setError('Failed to load agreement details');
    }
  };
  
  // Filter vendor connections - show only vendor type connections
  useEffect(() => {
    const filtered = vendorConnections.filter(conn => conn.type === 'vendor');
    setFilteredConnections(filtered);
  }, [vendorConnections]);
  
  // Auto-populate drop_location_path from selected vendor connection
  useEffect(() => {
    if (formData.vendor_connection_id && filteredConnections.length > 0) {
      const selectedConnection = filteredConnections.find(
        conn => String(conn.connection_id) === String(formData.vendor_connection_id)
      );
      
      if (selectedConnection) {
        const config = selectedConnection.config || {};
        const bucket = config.bucket || config.bucket_name || '';
        const filePath = config.path_prefix || '';
        
        // Combine bucket and file path with proper slash handling
        let fullPath = bucket;
        if (filePath) {
          fullPath = filePath.startsWith('/') 
            ? `${bucket}${filePath}` 
            : `${bucket}/${filePath}`;
        }
        
        setFormData(prev => ({
          ...prev,
          drop_location_path: fullPath
        }));
      } else {
        // Connection not found, clear path
        setFormData(prev => ({
          ...prev,
          drop_location_path: ''
        }));
      }
    } else {
      // No connection selected, clear path
      setFormData(prev => ({
        ...prev,
        drop_location_path: ''
      }));
    }
  }, [formData.vendor_connection_id, filteredConnections]);
  
  // Auto-populate project fields from selected vendor
  useEffect(() => {
    if (formData.vendor_id && vendors.length > 0) {
      const selectedVendor = vendors.find(
        vendor => String(vendor.id) === String(formData.vendor_id)
      );
      
      if (selectedVendor) {
        setFormData(prev => ({
          ...prev,
          project_id: selectedVendor.project_id || '',
          project_name: selectedVendor.project_name || ''
        }));
      } else {
        // Vendor not found, clear project fields
        setFormData(prev => ({
          ...prev,
          project_id: '',
          project_name: ''
        }));
      }
    } else {
      // No vendor selected, clear project fields
      setFormData(prev => ({
        ...prev,
        project_id: '',
        project_name: ''
      }));
    }
  }, [formData.vendor_id, vendors]);
  
  // Auto-populate manager_contact from selected vendor manager
  useEffect(() => {
    if (formData.file_owner_user_id && users.length > 0) {
      const selectedUser = users.find(
        user => String(user.id) === String(formData.file_owner_user_id)
      );
      
      if (selectedUser) {
        setFormData(prev => ({
          ...prev,
          manager_contact: selectedUser.email || ''
        }));
      } else {
        // User not found, clear manager_contact
        setFormData(prev => ({
          ...prev,
          manager_contact: ''
        }));
      }
    } else {
      // No user selected, clear manager_contact
      setFormData(prev => ({
        ...prev,
        manager_contact: ''
      }));
    }
  }, [formData.file_owner_user_id, users]);
  
  const openCreateModal = () => {
    setFormData({
      vendor_id: isVendor && currentUser.vendor_id ? currentUser.vendor_id : '',
      file_name: '',
      file_description: '',
      schema: '',
      frequency: 'Daily',
      frequency_description: '',
      vendor_department_team: '',
      file_owner_user_id: '',
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
      target_connection_id: '',
      drop_location_path: '',
      target_file_path: '',
      project_id: '',
      project_name: '',
      manager_contact: '',
      vendor_type: '',
      vendor_onboarding_date: '',
      contains_pii: false,
      file_type: '',
      data_classification: '',
      domain: '',
      retention_days: '',
      expected_arrival_time: '',
      delivery_method: ''
    });
    setTemplateFile(null);
    setModalMode('create');
    setError('');
    setModalError('');
    setSuccessMessage('');
    setModalOpen(true);
  };
  
  const openEditModal = (agreement) => {
    setSelectedAgreement(agreement);
    setFormData({
      vendor_id: agreement.vendor_id || '',
      file_name: agreement.file_name || '',
      file_description: agreement.file_description || '',
      schema: agreement.schema ? JSON.stringify(agreement.schema, null, 2) : '',
      frequency: agreement.frequency || 'Daily',
      frequency_description: agreement.frequency_description || '',
      vendor_department_team: agreement.vendor_department_team || agreement.file_creator || '',
      file_owner_user_id: agreement.file_owner_user_id || '',
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
      target_connection_id: agreement.target_connection_id || '',
      drop_location_path: agreement.drop_location_path || '',
      target_file_path: agreement.target_file_path || '',
      project_id: agreement.project_id || '',
      project_name: agreement.project_name || '',
      manager_contact: agreement.manager_contact || '',
      vendor_type: agreement.vendor_type || '',
      vendor_onboarding_date: agreement.vendor_onboarding_date || '',
      contains_pii: agreement.contains_pii || false,
      file_type: agreement.file_type || '',
      data_classification: agreement.data_classification || '',
      domain: agreement.domain || '',
      retention_days: agreement.retention_days || '',
      expected_arrival_time: agreement.expected_arrival_time || '',
      delivery_method: agreement.delivery_method || ''
    });
    setTemplateFile(null);
    setModalMode('edit');
    setModalError('');
    setSuccessMessage('');
    setModalOpen(true);
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
    setModalError('');
    setTemplateFile(null);
  };
  
  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setSelectedAgreement(null);
    setApprovalHistory([]);
    setChangeHistory([]);
    setRejectComments('');
    setDetailModalError('');
    setDetailModalSuccess('');
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleDownloadTemplate = async (format) => {
    try {
      const response = await axios.get(`/api/vendor-agreements/template/${format}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `agreement_template.${format === 'excel' ? 'xlsx' : format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading template:', error);
      setModalError('Failed to download template');
    }
  };
  
  const handleTemplateUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const validExtensions = ['.xlsx', '.xls', '.csv', '.json'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      setModalError('Invalid file type. Please upload Excel (.xlsx, .xls), CSV (.csv), or JSON (.json) file.');
      setTemplateFile(null);
      return;
    }
    
    setTemplateFile(file);
    setUploadingTemplate(true);
    setModalError('');
    
    try {
      const formDataToUpload = new FormData();
      formDataToUpload.append('templateFile', file);
      
      const response = await axios.post('/api/vendor-agreements/parse-template', formDataToUpload, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        // Auto-populate form fields with parsed data
        const data = response.data.data;
        setFormData(prev => ({
          ...prev,
          file_name: data.file_name || prev.file_name,
          file_description: data.file_description || prev.file_description,
          vendor_department_team: data.vendor_department_team || data.file_creator || prev.vendor_department_team,
          primary_contact_name: data.primary_contact_name || data.vendor_contact || prev.primary_contact_name,
          owner_contact: data.owner_contact || prev.owner_contact,
          frequency: data.frequency || prev.frequency,
          frequency_description: data.frequency_description || prev.frequency_description,
          schema: data.schema || prev.schema
        }));
        
        setModalError('');
      }
    } catch (error) {
      console.error('Error parsing template:', error);
      let errorMessage = 'Failed to parse template file';
      
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      
      if (error.response?.data?.validationErrors) {
        errorMessage += ': ' + error.response.data.validationErrors.join(', ');
      }
      
      setModalError(errorMessage);
      setTemplateFile(null);
    } finally {
      setUploadingTemplate(false);
    }
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
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.file_name.trim()) {
      setModalError('File name is required');
      return;
    }
    
    if (!formData.file_owner_user_id) {
      setModalError('File owner is required');
      return;
    }
    
    if (formData.schema && !validateJSON(formData.schema)) {
      setModalError('Invalid JSON format in schema');
      return;
    }
    
    if (formData.metadata && !validateJSON(formData.metadata)) {
      setModalError('Invalid JSON format in metadata');
      return;
    }
    
    try {
      const submitData = new FormData();
      
      // Wrap form data in agreementData as expected by backend
      const agreementData = {};
      Object.keys(formData).forEach(key => {
        if (formData[key] !== '') {
          agreementData[key] = formData[key];
        }
      });
      
      submitData.append('agreementData', JSON.stringify(agreementData));
      
      let response;
      if (modalMode === 'create') {
        response = await axios.post('/api/vendor-agreements', submitData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        setSuccessMessage('Vendor agreement created successfully!');
      } else {
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
                setSuccessMessage('Vendor agreement updated successfully!');
                closeModal();
                fetchData();
                setModalError('');
                setTimeout(() => setSuccessMessage(''), 5000);
              } catch (error) {
                console.error('Error saving agreement:', error);
                let errorMessage = 'Failed to save vendor agreement';
                if (error.response?.data) {
                  const { error: errorMsg, message } = error.response.data;
                  errorMessage = errorMsg || message || errorMessage;
                } else if (error.message) {
                  errorMessage += ': ' + error.message;
                }
                setModalError(errorMessage);
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
        setSuccessMessage('Vendor agreement updated successfully!');
      }
      
      closeModal();
      fetchData();
      setModalError('');
      
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error saving agreement:', error);
      
      let errorMessage = 'Failed to save vendor agreement';
      
      if (error.response?.data) {
        const { error: errorMsg, message } = error.response.data;
        errorMessage = errorMsg || message || errorMessage;
      } else if (error.message) {
        errorMessage += ': ' + error.message;
      }
      
      setModalError(errorMessage);
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
  
  const handleDeleteAgreement = (agreementId, fileName) => {
    setConfirmModalConfig({
      title: 'Delete Agreement',
      message: `Are you sure you want to delete agreement "${fileName}"?`,
      onConfirm: async () => {
        try {
          await axios.delete(`/api/vendor-agreements/${agreementId}`);
          setSuccessMessage('Vendor agreement deleted successfully!');
          fetchData();
          setTimeout(() => setSuccessMessage(''), 5000);
        } catch (error) {
          console.error('Error deleting agreement:', error);
          setError('Failed to delete agreement: ' + (error.response?.data?.error || error.message));
        }
      }
    });
    setConfirmModalOpen(true);
  };
  
  const getApprovalStatusBadge = (agreement) => {
    if (agreement.is_locked) {
      return <span className="approval-badge approval-locked">🔒 Locked</span>;
    }
    
    const vendorApproved = !!agreement.vendor_approved_at;
    const ownerApproved = !!agreement.owner_approved_at;
    
    if (vendorApproved && ownerApproved) {
      return <span className="approval-badge approval-approved">Fully Approved</span>;
    } else if (vendorApproved || ownerApproved) {
      return <span className="approval-badge approval-partial">Partially Approved</span>;
    } else {
      return <span className="approval-badge approval-pending">Pending Approval</span>;
    }
  };
  
  const canApproveAsVendor = (agreement) => {
    // Admins can approve on behalf of vendor, or actual vendor users can approve
    const isVendorUser = isVendor && currentUser.vendor_id === agreement.vendor_id;
    return (isAdmin || isVendorUser) && !agreement.vendor_approved_at && !agreement.is_locked;
  };
  
  const canApproveAsOwner = (agreement) => {
    // Admins can approve on behalf of owner, or actual owner can approve
    const isOwnerUser = currentUser.id === agreement.file_owner_user_id;
    return (isAdmin || isOwnerUser) && !agreement.owner_approved_at && !agreement.is_locked;
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
  
  return (
    <div className="vendor-agreements-container">
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="vendor-agreements-header">
            <h1>Vendor Agreements</h1>
            {(isAdmin || isVendor) && (
              <div className="header-actions">
                <button 
                  className="create-agreement-btn"
                  onClick={openCreateModal}
                >
                  Create New Agreement
                </button>
              </div>
            )}
          </div>
          
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          
          {successMessage && (
            <div className="success-message" role="alert">
              {successMessage}
            </div>
          )}
      
          <div className="agreements-table-container">
            <table className="agreements-table">
              <thead>
                <tr>
                  <th>Agreement Code</th>
                  <th>File Name</th>
                  <th>Vendor</th>
                  <th>Frequency</th>
                  <th>Status</th>
                  <th>Approvals</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agreements.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="no-agreements-message">No agreements found</td>
                  </tr>
                ) : (
                  agreements.map(agreement => (
                    <tr key={agreement.id}>
                      <td>{agreement.agreement_code}</td>
                      <td>{agreement.file_name}</td>
                      <td>{agreement.vendor_name || agreement.vendor_code || '-'}</td>
                      <td>{agreement.frequency}</td>
                      <td>
                        <span className={`status-badge status-${agreement.status || 'active'}`}>
                          {agreement.status || 'Active'}
                        </span>
                      </td>
                      <td>{getApprovalStatusBadge(agreement)}</td>
                      <td>
                        <div className="agreement-actions">
                          <button 
                            className="view-agreement-btn" 
                            onClick={() => openDetailModal(agreement)}
                          >
                            View
                          </button>
                          {(isAdmin || (isVendor && currentUser.vendor_id === agreement.vendor_id)) && (
                            <button 
                              className="edit-agreement-btn" 
                              onClick={() => openEditModal(agreement)}
                            >
                              Edit
                            </button>
                          )}
                          {isAdmin && (
                            <button 
                              className="delete-agreement-btn" 
                              onClick={() => handleDeleteAgreement(agreement.id, agreement.file_name)}
                            >
                              Delete
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
          
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            itemsPerPage={pageSize}
            totalItems={totalCount}
          />
          
          {modalOpen && (
            <ThreeSectionModal
              isOpen={modalOpen}
              onClose={closeModal}
              title={modalMode === 'create' ? 'Create New Agreement' : 'Edit Agreement'}
              size="large"
              footer={
                <>
                  <button type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" form="agreement-form">
                    {modalMode === 'create' ? 'Create Agreement' : 'Update Agreement'}
                  </button>
                </>
              }
            >
              <form id="agreement-form" onSubmit={handleSubmit} className="agreement-form">
                {/* Section 1: Agreement Information */}
                <div className="form-section">
                  <h3 className="section-title">Agreement Information</h3>
                  
                  {/* Row 1: Vendor and Project */}
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
                          {vendors.map(vendor => (
                            <option key={vendor.id} value={vendor.id}>
                              {vendor.vendor_name} ({vendor.vendor_code})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={vendors.find(v => v.id === formData.vendor_id)?.vendor_name || 'Your Vendor'}
                          disabled
                        />
                      )}
                    </div>
                    
                    {formData.vendor_id && (
                      <div className="form-group">
                        <label htmlFor="project_name">Project</label>
                        <input
                          type="text"
                          id="project_name"
                          value={formData.project_name || 'Loading...'}
                          readOnly
                          placeholder="Auto-populated from selected vendor"
                          style={{ backgroundColor: '#f9fafb', cursor: 'not-allowed' }}
                        />
                        <small style={{ color: '#6b7280', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                          Automatically assigned from the vendor's project
                        </small>
                      </div>
                    )}
                  </div>
                  
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
                        {users.map(user => (
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
                          style={{ backgroundColor: '#f9fafb', cursor: 'not-allowed' }}
                        />
                        <small style={{ color: '#6b7280', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                          Automatically populated from vendor manager's email
                        </small>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Section 2: Template Upload (Optional - Auto-populate fields) */}
                {formData.vendor_id && modalMode === 'create' && (
                  <div className="form-section" style={{ backgroundColor: '#f8f9fa', padding: '1.5rem', borderRadius: '8px' }}>
                    <h3 className="section-title" style={{ marginBottom: '0.5rem' }}>
                      Quick Setup with Template
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
                      Download a template, fill it with your agreement details, and upload to auto-populate all fields.
                    </p>
                    
                    <div className="form-group">
                      <label>Download Template</label>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => handleDownloadTemplate('xlsx')}
                          className="btn-secondary"
                          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                        >
                          Excel (.xlsx)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadTemplate('csv')}
                          className="btn-secondary"
                          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                        >
                          CSV (.csv)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadTemplate('json')}
                          className="btn-secondary"
                          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                        >
                          JSON (.json)
                        </button>
                      </div>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="templateFile">Upload Filled Template</label>
                      <input
                        type="file"
                        id="templateFile"
                        accept=".xlsx,.xls,.csv,.json"
                        onChange={handleTemplateUpload}
                        disabled={uploadingTemplate}
                      />
                      {templateFile && (
                        <p className="file-selected" style={{ color: '#059669', marginTop: '0.5rem' }}>
                          ✓ Template uploaded: {templateFile.name}
                        </p>
                      )}
                      {uploadingTemplate && (
                        <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
                          Processing template...
                        </p>
                      )}
                      <small style={{ color: '#6b7280', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                        Upload Excel (.xlsx, .xls), CSV (.csv), or JSON (.json) file
                      </small>
                    </div>
                  </div>
                )}
                
                {/* Section 2: Vendor Information */}
                {formData.vendor_id && (
                  <div className="form-section">
                    <h3 className="section-title">Vendor Information</h3>
                    
                    <div className="form-row-grid">
                      <div className="form-group">
                        <label htmlFor="vendor_code">Vendor ID</label>
                        <input
                          type="text"
                          id="vendor_code"
                          value={vendors.find(v => v.id === formData.vendor_id)?.vendor_code || ''}
                          readOnly
                          placeholder="Auto from vendor"
                          style={{ backgroundColor: '#f9fafb', cursor: 'not-allowed' }}
                        />
                        <small style={{ color: '#6b7280', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                          Automatically assigned from vendor
                        </small>
                      </div>
                      
                      <div className="form-group">
                        <label htmlFor="vendor_type">Vendor Type</label>
                        <input
                          type="text"
                          id="vendor_type"
                          name="vendor_type"
                          value={formData.vendor_type}
                          onChange={handleInputChange}
                          placeholder="e.g., Data Provider, Service Provider"
                        />
                      </div>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="vendor_onboarding_date">Vendor Onboarding Date</label>
                      <input
                        type="date"
                        id="vendor_onboarding_date"
                        name="vendor_onboarding_date"
                        value={formData.vendor_onboarding_date}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                )}
                
                {/* Section 3: File Owner & Manager Details */}
                <div className="form-section">
                  <h3 className="section-title">File Owner & Manager</h3>
                  
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="vendor_department_team">Vendor Department/Team</label>
                      <input
                        type="text"
                        id="vendor_department_team"
                        name="vendor_department_team"
                        value={formData.vendor_department_team}
                        onChange={handleInputChange}
                        placeholder="e.g., Data Operations, Finance Team"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="owner_contact">Vendor Department Email</label>
                      <input
                        type="text"
                        id="owner_contact"
                        name="owner_contact"
                        value={formData.owner_contact}
                        onChange={handleInputChange}
                        placeholder="Additional owner contact details"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Section 4: File Details */}
                <div className="form-section">
                  <h3 className="section-title">File Details</h3>
                  
                  {/* File Name and File Description in same row */}
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="file_name">
                        File Name <span className="required-field">*</span>
                      </label>
                      <input
                        type="text"
                        id="file_name"
                        name="file_name"
                        value={formData.file_name}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="file_description">File Description</label>
                      <textarea
                        id="file_description"
                        name="file_description"
                        value={formData.file_description}
                        onChange={handleInputChange}
                        rows="2"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Section 5: Vendor Contact Information */}
                <div className="form-section">
                  <h3 className="section-title">Vendor Contact Information</h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    {/* Primary Contact (Left Column) */}
                    <div style={{ 
                      border: '1px solid #e5e7eb', 
                      borderRadius: '8px', 
                      padding: '1.5rem',
                      backgroundColor: '#f9fafb'
                    }}>
                      <h4 style={{ 
                        marginTop: 0, 
                        marginBottom: '1rem', 
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#374151'
                      }}>
                        Primary Contact
                      </h4>
                      
                      <div className="form-group">
                        <label htmlFor="primary_contact_user_id">
                          Select Contact <span className="required-field">*</span>
                        </label>
                        <VendorUserSelect
                          vendorId={formData.vendor_id}
                          value={formData.primary_contact_user_id || ''}
                          onChange={(e) => {
                            const user = e.target.vendorUser;
                            setFormData(prev => ({
                              ...prev,
                              primary_contact_user_id: e.target.value,
                              primary_contact_name: user?.name || '',
                              primary_contact_phone: user?.phone || '',
                              primary_contact_email: user?.email || '',
                              primary_contact_designation: user?.designation || ''
                            }));
                          }}
                          placeholder="Select primary contact"
                          required
                          name="primary_contact_user_id"
                        />
                      </div>
                      
                      {formData.primary_contact_name && (
                        <div style={{ 
                          marginTop: '1rem', 
                          padding: '0.75rem', 
                          backgroundColor: 'white', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px',
                          fontSize: '0.875rem'
                        }}>
                          <div><strong>Name:</strong> {formData.primary_contact_name}</div>
                          {formData.primary_contact_email && (
                            <div><strong>Email:</strong> {formData.primary_contact_email}</div>
                          )}
                          {formData.primary_contact_phone && (
                            <div><strong>Phone:</strong> {formData.primary_contact_phone}</div>
                          )}
                          {formData.primary_contact_designation && (
                            <div><strong>Designation:</strong> {formData.primary_contact_designation}</div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Secondary Contact (Right Column) */}
                    <div style={{ 
                      border: '1px solid #e5e7eb', 
                      borderRadius: '8px', 
                      padding: '1.5rem',
                      backgroundColor: '#f9fafb'
                    }}>
                      <h4 style={{ 
                        marginTop: 0, 
                        marginBottom: '1rem', 
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#374151'
                      }}>
                        Secondary Contact
                      </h4>
                      
                      <div className="form-group">
                        <label htmlFor="secondary_contact_user_id">Select Contact</label>
                        <VendorUserSelect
                          vendorId={formData.vendor_id}
                          value={formData.secondary_contact_user_id || ''}
                          onChange={(e) => {
                            const user = e.target.vendorUser;
                            setFormData(prev => ({
                              ...prev,
                              secondary_contact_user_id: e.target.value,
                              secondary_contact_name: user?.name || '',
                              secondary_contact_phone: user?.phone || '',
                              secondary_contact_email: user?.email || '',
                              secondary_contact_designation: user?.designation || ''
                            }));
                          }}
                          placeholder="Select secondary contact (optional)"
                          required={false}
                          name="secondary_contact_user_id"
                        />
                      </div>
                      
                      {formData.secondary_contact_name && (
                        <div style={{ 
                          marginTop: '1rem', 
                          padding: '0.75rem', 
                          backgroundColor: 'white', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px',
                          fontSize: '0.875rem'
                        }}>
                          <div><strong>Name:</strong> {formData.secondary_contact_name}</div>
                          {formData.secondary_contact_email && (
                            <div><strong>Email:</strong> {formData.secondary_contact_email}</div>
                          )}
                          {formData.secondary_contact_phone && (
                            <div><strong>Phone:</strong> {formData.secondary_contact_phone}</div>
                          )}
                          {formData.secondary_contact_designation && (
                            <div><strong>Designation:</strong> {formData.secondary_contact_designation}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Section 6: Data Classification */}
                <div className="form-section">
                  <h3 className="section-title">Data Classification</h3>
                  
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="contains_pii" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="checkbox"
                          id="contains_pii"
                          name="contains_pii"
                          checked={formData.contains_pii}
                          onChange={(e) => setFormData(prev => ({ ...prev, contains_pii: e.target.checked }))}
                          style={{ width: 'auto', margin: 0 }}
                        />
                        Contains PII
                      </label>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="file_type">File Type</label>
                      <input
                        type="text"
                        id="file_type"
                        name="file_type"
                        value={formData.file_type}
                        onChange={handleInputChange}
                        placeholder="e.g., CSV, JSON, XML"
                      />
                    </div>
                  </div>
                  
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="data_classification">Data Classification</label>
                      <select
                        id="data_classification"
                        name="data_classification"
                        value={formData.data_classification}
                        onChange={handleInputChange}
                      >
                        <option value="">Select classification</option>
                        <option value="Public">Public</option>
                        <option value="Private">Private</option>
                        <option value="Confidential">Confidential</option>
                      </select>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="domain">Domain</label>
                      <input
                        type="text"
                        id="domain"
                        name="domain"
                        value={formData.domain}
                        onChange={handleInputChange}
                        placeholder="e.g., Finance, Operations"
                      />
                    </div>
                  </div>
                  
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="retention_days">Retention (in Days)</label>
                      <input
                        type="number"
                        id="retention_days"
                        name="retention_days"
                        value={formData.retention_days}
                        onChange={handleInputChange}
                        placeholder="e.g., 365"
                        min="0"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="expected_arrival_time">Expected Arrival Time</label>
                      <input
                        type="text"
                        id="expected_arrival_time"
                        name="expected_arrival_time"
                        value={formData.expected_arrival_time}
                        onChange={handleInputChange}
                        placeholder="e.g., 9:00 AM EST"
                      />
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="delivery_method">Delivery Method</label>
                    <select
                      id="delivery_method"
                      name="delivery_method"
                      value={formData.delivery_method}
                      onChange={handleInputChange}
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
                
                {/* Section 4: Connection Configuration */}
                <div className="form-section">
                  <h3 className="section-title">Connection Configuration</h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    {/* Source Connection Panel */}
                    <div style={{ 
                      border: '1px solid #e5e7eb', 
                      borderRadius: '8px', 
                      padding: '1.5rem',
                      backgroundColor: '#f9fafb'
                    }}>
                      <h4 style={{ 
                        marginTop: 0, 
                        marginBottom: '1rem', 
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#374151'
                      }}>
                        Source Connection
                      </h4>
                      
                      <div className="form-group" style={{ marginBottom: '1rem' }}>
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
                              {conn.name} ({conn.config?.provider?.toUpperCase() || 'AWS'})
                            </option>
                          ))}
                        </select>
                        <small style={{ color: '#6b7280', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                          Where vendor will drop files
                        </small>
                      </div>
                      
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="drop_location_path">Drop Location Path</label>
                        <input
                          type="text"
                          id="drop_location_path"
                          name="drop_location_path"
                          value={formData.drop_location_path}
                          readOnly
                          placeholder="Auto-populated"
                          style={{ backgroundColor: '#ffffff', cursor: 'not-allowed' }}
                        />
                        <small style={{ color: '#6b7280', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                          Auto-populated from connection
                        </small>
                      </div>
                    </div>
                    
                    {/* Target Connection Panel */}
                    <div style={{ 
                      border: '1px solid #e5e7eb', 
                      borderRadius: '8px', 
                      padding: '1.5rem',
                      backgroundColor: '#f9fafb'
                    }}>
                      <h4 style={{ 
                        marginTop: 0, 
                        marginBottom: '1rem', 
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#374151'
                      }}>
                        Target Connection
                      </h4>
                      
                      <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label htmlFor="target_connection_id">
                          Target File Connection
                        </label>
                        <select
                          id="target_connection_id"
                          name="target_connection_id"
                          value={formData.target_connection_id}
                          onChange={handleInputChange}
                        >
                          <option value="">Select a target connection (optional)</option>
                          {filteredConnections.map(conn => (
                            <option key={conn.connection_id} value={conn.connection_id}>
                              {conn.name} ({conn.config?.provider?.toUpperCase() || 'AWS'})
                            </option>
                          ))}
                        </select>
                        <small style={{ color: '#6b7280', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                          Where processed files will be stored
                        </small>
                      </div>
                      
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="target_file_path">Target File Path</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            type="text"
                            id="target_file_path"
                            name="target_file_path"
                            value={formData.target_file_path}
                            onChange={handleInputChange}
                            placeholder="/path/to/target/folder"
                            style={{ flex: 1 }}
                          />
                          {formData.target_connection_id && (
                            <button
                              type="button"
                              onClick={() => {
                                setS3BrowserConnectionId(formData.target_connection_id);
                                setS3BrowserCallback((path) => {
                                  setFormData(prev => ({ ...prev, target_file_path: path }));
                                  setS3BrowserOpen(false);
                                });
                                setS3BrowserOpen(true);
                              }}
                              className="btn-secondary"
                              style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}
                            >
                              Browse
                            </button>
                          )}
                        </div>
                        <small style={{ color: '#6b7280', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                          Specify the target path for processed files
                        </small>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Section 8: Schema */}
                <div className="form-section">
                  <h3 className="section-title">Schema</h3>
                  
                  <div className="form-group">
                    <label htmlFor="schema">Schema (JSON)</label>
                    <textarea
                      id="schema"
                      name="schema"
                      value={formData.schema}
                      onChange={handleInputChange}
                      rows="6"
                      placeholder='[{"name": "column1", "type": "string", "description": "Description"}]'
                    />
                    <small style={{ color: '#6b7280', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                      Optional: Define the file structure as a JSON array of column definitions
                    </small>
                  </div>
                </div>
                
                {/* Error Message at Bottom */}
                {modalError && (
                  <div className="modal-error-message" role="alert" style={{ marginTop: '1.5rem' }}>
                    {modalError}
                  </div>
                )}
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
                <div className="detail-tabs">
                  <button
                    className={activeTab === 'details' ? 'active' : ''}
                    onClick={() => setActiveTab('details')}
                  >
                    Details
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
                          <label>Agreement Code:</label>
                          <span>{selectedAgreement.agreement_code || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <label>File Name:</label>
                          <span>{selectedAgreement.file_name || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <label>Vendor Name:</label>
                          <span>
                            {selectedAgreement.vendor_name || '-'}
                            {selectedAgreement.vendor_code ? ` (${selectedAgreement.vendor_code})` : ''}
                          </span>
                        </div>
                        <div className="detail-item">
                          <label>Frequency:</label>
                          <span>{selectedAgreement.frequency || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <label>Vendor Department/Team:</label>
                          <span>{selectedAgreement.vendor_department_team || selectedAgreement.file_creator || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <label>Vendor Manager/File Owner:</label>
                          <span>
                            {selectedAgreement.owner_username || selectedAgreement.owner_email || '-'}
                            {selectedAgreement.owner_username && selectedAgreement.owner_email ? ` (${selectedAgreement.owner_email})` : ''}
                          </span>
                        </div>
                        <div className="detail-item">
                          <label>Primary Contact Name:</label>
                          <span>{selectedAgreement.primary_contact_name || selectedAgreement.vendor_contact || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <label>Vendor Department Email:</label>
                          <span>{selectedAgreement.owner_contact || '-'}</span>
                        </div>
                        <div className="detail-item full-width">
                          <label>File Description:</label>
                          <span>{selectedAgreement.file_description || '-'}</span>
                        </div>
                        <div className="detail-item full-width">
                          <label>Frequency Description:</label>
                          <span>{selectedAgreement.frequency_description || '-'}</span>
                        </div>
                      </div>
                      
                      <div className="schema-section">
                        <h3>Schema</h3>
                        {renderSchemaTable(selectedAgreement.schema)}
                      </div>
                      
                      <div className="approval-section">
                        <h3>Approval Status</h3>
                        <div className="approval-status-grid">
                          <div className="approval-status-item">
                            <label>Vendor Approval:</label>
                            <span className={selectedAgreement.vendor_approved_at ? 'approved' : 'pending'}>
                              {selectedAgreement.vendor_approved_at 
                                ? `✓ Approved on ${new Date(selectedAgreement.vendor_approved_at).toLocaleString()}`
                                : '⏳ Pending'
                              }
                            </span>
                          </div>
                          <div className="approval-status-item">
                            <label>Owner Approval:</label>
                            <span className={selectedAgreement.owner_approved_at ? 'approved' : 'pending'}>
                              {selectedAgreement.owner_approved_at 
                                ? `✓ Approved on ${new Date(selectedAgreement.owner_approved_at).toLocaleString()}`
                                : '⏳ Pending'
                              }
                            </span>
                          </div>
                        </div>
                        
                        <div className="approval-actions">
                          {canApproveAsVendor(selectedAgreement) && (
                            <button className="approve-btn vendor-approve" onClick={() => handleApprove('vendor')}>
                              Vendor Approve
                            </button>
                          )}
                          
                          {canApproveAsOwner(selectedAgreement) && (
                            <button className="approve-btn owner-approve" onClick={() => handleApprove('owner')}>
                              Owner Approve
                            </button>
                          )}
                          
                          {(canApproveAsVendor(selectedAgreement) || canApproveAsOwner(selectedAgreement)) && (
                            <div className="reject-section">
                              <textarea
                                placeholder="Enter rejection comments (required)"
                                value={rejectComments}
                                onChange={(e) => setRejectComments(e.target.value)}
                                rows="3"
                              />
                              {canApproveAsVendor(selectedAgreement) && (
                                <button className="reject-btn" onClick={() => handleReject('vendor')} style={{ marginRight: '8px' }}>
                                  Vendor Reject
                                </button>
                              )}
                              {canApproveAsOwner(selectedAgreement) && (
                                <button className="reject-btn" onClick={() => handleReject('owner')}>
                                  Owner Reject
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {activeTab === 'approvals' && (
                    <div className="approvals-tab">
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
                            </tr>
                          </thead>
                          <tbody>
                            {Array.isArray(approvalHistory) && approvalHistory.map((approval, index) => (
                              <tr key={index}>
                                <td>{new Date(approval.timestamp || approval.created_at).toLocaleString()}</td>
                                <td>{approval.username || approval.user_id}</td>
                                <td>
                                  <span className={`action-badge action-${approval.action}`}>
                                    {approval.action}
                                  </span>
                                </td>
                                <td>{approval.comments || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
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
                            {Array.isArray(changeHistory) && changeHistory.map((change, index) => (
                              <tr key={index}>
                                <td>{new Date(change.timestamp || change.created_at).toLocaleString()}</td>
                                <td>{change.username || change.user_id}</td>
                                <td>
                                  <span className={`change-badge change-${change.change_type}`}>
                                    {change.change_type}
                                  </span>
                                </td>
                                <td>{change.summary || change.description || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Success/Error Messages at Bottom of Modal */}
                {detailModalSuccess && (
                  <div className="modal-success-message" role="alert" style={{ marginTop: '1rem', padding: '12px 16px', backgroundColor: '#e6f4ea', color: '#137333', borderRadius: '5px', fontSize: '14px' }}>
                    {detailModalSuccess}
                  </div>
                )}
                {detailModalError && (
                  <div className="modal-error-message" role="alert" style={{ marginTop: '1rem', padding: '12px 16px', backgroundColor: '#fce8e6', color: '#d93025', borderRadius: '5px', fontSize: '14px' }}>
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
        </>
      )}
    </div>
  );
};

export default VendorAgreements;
