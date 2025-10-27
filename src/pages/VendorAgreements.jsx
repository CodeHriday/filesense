import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import ThreeSectionModal from '../components/ThreeSectionModal';
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
    file_creator: '',
    file_owner_user_id: '',
    vendor_contact: '',
    owner_contact: '',
    metadata: '',
    vendor_connection_id: '',
    drop_location_path: '',
    project_id: '',
    project_name: '',
    manager_contact: ''
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
      
      setSelectedAgreement(agreementResponse.data);
      setApprovalHistory(approvalsResponse.data || []);
      setChangeHistory(changesResponse.data || []);
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
      file_creator: '',
      file_owner_user_id: '',
      vendor_contact: '',
      owner_contact: '',
      metadata: '',
      vendor_connection_id: '',
      drop_location_path: '',
      project_id: '',
      project_name: '',
      manager_contact: ''
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
      file_creator: agreement.file_creator || '',
      file_owner_user_id: agreement.file_owner_user_id || '',
      vendor_contact: agreement.vendor_contact || '',
      owner_contact: agreement.owner_contact || '',
      metadata: agreement.metadata ? JSON.stringify(agreement.metadata, null, 2) : '',
      vendor_connection_id: agreement.vendor_connection_id || '',
      drop_location_path: agreement.drop_location_path || '',
      project_id: agreement.project_id || '',
      project_name: agreement.project_name || '',
      manager_contact: agreement.manager_contact || ''
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
          file_creator: data.file_creator || prev.file_creator,
          vendor_contact: data.vendor_contact || prev.vendor_contact,
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
          const confirmEdit = window.confirm(
            'This agreement is locked (fully approved). Editing will require re-approval from both vendor and owner. Continue?'
          );
          if (!confirmEdit) return;
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
  
  const handleApprove = async () => {
    try {
      const response = await axios.post(`/api/vendor-agreements/${selectedAgreement.id}/approve`);
      
      setSuccessMessage('Agreement approved successfully!');
      
      await fetchAgreementDetails(selectedAgreement.id);
      fetchData();
      
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error approving agreement:', error);
      setError('Failed to approve agreement: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const handleReject = async () => {
    if (!rejectComments.trim()) {
      setError('Comments are required for rejection');
      return;
    }
    
    try {
      await axios.post(`/api/vendor-agreements/${selectedAgreement.id}/reject`, {
        comments: rejectComments
      });
      
      setSuccessMessage('Agreement rejected successfully!');
      setRejectComments('');
      
      await fetchAgreementDetails(selectedAgreement.id);
      fetchData();
      
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error rejecting agreement:', error);
      setError('Failed to reject agreement: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const handleDeleteAgreement = async (agreementId, fileName) => {
    if (!window.confirm(`Are you sure you want to delete agreement "${fileName}"?`)) {
      return;
    }
    
    try {
      await axios.delete(`/api/vendor-agreements/${agreementId}`);
      setSuccessMessage('Vendor agreement deleted successfully!');
      fetchData();
      
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error deleting agreement:', error);
      setError('Failed to delete agreement: ' + (error.response?.data?.error || error.message));
    }
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
    return isVendor && currentUser.vendor_id === agreement.vendor_id && !agreement.vendor_approved_at && !agreement.is_locked;
  };
  
  const canApproveAsOwner = (agreement) => {
    return currentUser.id === agreement.file_owner_user_id && !agreement.owner_approved_at && !agreement.is_locked;
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
                        Vendor {isAdmin && <span className="required-field">*</span>}
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
                        Vendor Manager <span className="required-field">*</span>
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
                
                {/* Section 2.5: Additional Contact Information */}
                <div className="form-section">
                  <h3 className="section-title">Contact Information</h3>
                  
                  {/* Row 3: File Creator and Vendor Contact */}
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="file_creator">File Creator</label>
                      <input
                        type="text"
                        id="file_creator"
                        name="file_creator"
                        value={formData.file_creator}
                        onChange={handleInputChange}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="vendor_contact">Vendor Contact</label>
                      <input
                        type="text"
                        id="vendor_contact"
                        name="vendor_contact"
                        value={formData.vendor_contact}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                  
                  {/* Row 4: Owner Contact */}
                  <div className="form-group">
                    <label htmlFor="owner_contact">Owner Contact</label>
                    <input
                      type="text"
                      id="owner_contact"
                      name="owner_contact"
                      value={formData.owner_contact}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
                
                {/* Section 3: File Details */}
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
                
                {/* Section 4: Schema */}
                <div className="form-section">
                  <h3 className="section-title">File Schema</h3>
                  
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
                
                {/* Section 5: Configuration */}
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
                
                {/* Section 6: Vendor File Drop Connection */}
                <div className="form-section">
                  <h3 className="section-title">File Drop Connection</h3>
                  
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
                          {conn.name} ({conn.config?.provider?.toUpperCase() || 'AWS'})
                        </option>
                      ))}
                    </select>
                    <small style={{ color: '#6b7280', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                      Select the connection where vendor will drop files
                    </small>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="drop_location_path">Drop Location Path</label>
                    <input
                      type="text"
                      id="drop_location_path"
                      name="drop_location_path"
                      value={formData.drop_location_path}
                      readOnly
                      placeholder="Auto-populated from selected connection"
                      style={{ backgroundColor: '#f9fafb', cursor: 'not-allowed' }}
                    />
                    <small style={{ color: '#6b7280', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                      This path is automatically populated from the selected connection
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
            <div className="modal-overlay">
              <div className="detail-modal">
                <div className="modal-header">
                  <h2>Agreement Details - {selectedAgreement.agreement_code}</h2>
                  <button className="close-modal-btn" onClick={closeDetailModal}>
                    &times;
                  </button>
                </div>
                
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
                          <span>{selectedAgreement.agreement_code}</span>
                        </div>
                        <div className="detail-item">
                          <label>File Name:</label>
                          <span>{selectedAgreement.file_name}</span>
                        </div>
                        <div className="detail-item">
                          <label>Vendor:</label>
                          <span>{selectedAgreement.vendor_name} ({selectedAgreement.vendor_code})</span>
                        </div>
                        <div className="detail-item">
                          <label>Frequency:</label>
                          <span>{selectedAgreement.frequency}</span>
                        </div>
                        <div className="detail-item">
                          <label>File Creator:</label>
                          <span>{selectedAgreement.file_creator || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <label>File Owner:</label>
                          <span>{selectedAgreement.owner_username} ({selectedAgreement.owner_email})</span>
                        </div>
                        <div className="detail-item">
                          <label>Vendor Contact:</label>
                          <span>{selectedAgreement.vendor_contact || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <label>Owner Contact:</label>
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
                            <button className="approve-btn vendor-approve" onClick={handleApprove}>
                              Vendor Approve
                            </button>
                          )}
                          
                          {canApproveAsOwner(selectedAgreement) && (
                            <button className="approve-btn owner-approve" onClick={handleApprove}>
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
                              <button className="reject-btn" onClick={handleReject}>
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {activeTab === 'approvals' && (
                    <div className="approvals-tab">
                      <h3>Approval History</h3>
                      {approvalHistory.length === 0 ? (
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
                            {approvalHistory.map((approval, index) => (
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
                      {changeHistory.length === 0 ? (
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
                            {changeHistory.map((change, index) => (
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
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VendorAgreements;
