import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiEdit2, FiTrash2, FiFolderPlus } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import ThreeSectionModal from '../components/ThreeSectionModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import '../styles/VendorManagement.css';

const VendorManagement = () => {
  const [vendors, setVendors] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [formData, setFormData] = useState({
    vendor_name: '',
    description: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    contact_user_id: '', // Selected vendor user ID for primary contact
    backup_contact_user_id: '', // Selected vendor user ID for backup contact
    project_id: '',
    project_name: '',
    status: 'active'
  });
  
  // Two-stage form state
  const [savedVendorId, setSavedVendorId] = useState(null);
  const [savingBasicInfo, setSavingBasicInfo] = useState(false);
  const [basicInfoSaved, setBasicInfoSaved] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Vendor users state
  const [vendorUsers, setVendorUsers] = useState([]);
  
  // Delete confirmation modal state
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState(null);
  
  const { currentUser, hasPermission } = useAuth();
  const navigate = useNavigate();
  
  // Check if user has vendor_details:read permission - memoized to prevent recalculation
  const canAccessVendorDetails = useMemo(() => {
    return hasPermission && hasPermission('vendor_details:read');
  }, [hasPermission]);
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      const [vendorsResponse, projectsResponse, vendorUsersResponse] = await Promise.all([
        axios.get('/api/vendors', {
          params: { page: currentPage, pageSize }
        }),
        axios.get('/api/projects'),
        axios.get('/api/users/by-role/vendor')
      ]);
      
      setVendors(vendorsResponse.data.vendors || []);
      setTotalPages(vendorsResponse.data.pagination?.totalPages || 1);
      setTotalCount(vendorsResponse.data.pagination?.totalCount || 0);
      
      setProjects(projectsResponse.data || []);
      setVendorUsers(vendorUsersResponse.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load vendor management data');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize]);
  
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    
    if (!canAccessVendorDetails) {
      navigate('/');
      return;
    }
    
    fetchData();
  }, [currentUser, canAccessVendorDetails, navigate, fetchData]);
  
  const openCreateModal = () => {
    setFormData({
      vendor_name: '',
      description: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      address: '',
      backup_contact_name: '',
      backup_contact_phone: '',
      backup_contact_email: '',
      project_id: '',
      project_name: '',
      status: 'active'
    });
    setModalMode('create');
    setError('');
    setModalError('');
    setSuccessMessage('');
    setSavedVendorId(null);
    setBasicInfoSaved(false);
    setModalOpen(true);
  };
  
  const openEditModal = (vendor) => {
    setSelectedVendor(vendor);
    
    // Find matching vendor user IDs for contacts by matching name or email
    const contactUser = vendorUsers.find(user => 
      (user.full_name === vendor.contact_name || user.username === vendor.contact_name) ||
      user.email === vendor.contact_email
    );
    
    const backupContactUser = vendorUsers.find(user => 
      (user.full_name === vendor.backup_contact_name || user.username === vendor.backup_contact_name)
    );
    
    setFormData({
      vendor_name: vendor.vendor_name || '',
      description: vendor.description || '',
      contact_name: vendor.contact_name || '',
      contact_email: vendor.contact_email || '',
      contact_phone: vendor.contact_phone || '',
      contact_user_id: contactUser ? String(contactUser.id) : '',
      address: vendor.address || '',
      backup_contact_name: vendor.backup_contact_name || '',
      backup_contact_phone: vendor.backup_contact_phone || '',
      backup_contact_email: vendor.backup_contact_email || '',
      backup_contact_user_id: backupContactUser ? String(backupContactUser.id) : '',
      project_id: vendor.project_id || '',
      project_name: vendor.project_name || '',
      status: vendor.status || 'active'
    });
    setModalMode('edit');
    setModalError('');
    setSuccessMessage('');
    setSavedVendorId(vendor.id);
    setBasicInfoSaved(true); // In edit mode, basic info is already saved
    setModalOpen(true);
  };
  
  const closeModal = () => {
    setModalOpen(false);
    setSelectedVendor(null);
    setModalError('');
    setSavedVendorId(null);
    setBasicInfoSaved(false);
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle vendor user selection for primary contact
  const handleContactUserChange = (e) => {
    const userId = e.target.value;
    const selectedUser = vendorUsers.find(user => String(user.id) === String(userId));
    
    if (selectedUser) {
      // Check if primary contact is same as backup contact
      if (formData.backup_contact_email && selectedUser.email && 
          formData.backup_contact_email.toLowerCase() === selectedUser.email.toLowerCase()) {
        setModalError('Primary contact cannot be the same as backup contact');
        // Reset selection
        e.target.value = formData.contact_user_id || '';
        return;
      }
      
      setModalError(''); // Clear any previous errors
      setFormData(prev => ({
        ...prev,
        contact_user_id: userId,
        contact_name: selectedUser.full_name || selectedUser.username,
        contact_email: selectedUser.email || '',
        contact_phone: selectedUser.phone_number || ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        contact_user_id: '',
        contact_name: '',
        contact_email: '',
        contact_phone: ''
      }));
    }
  };
  
  // Handle vendor user selection for backup contact
  const handleBackupContactUserChange = (e) => {
    const userId = e.target.value;
    const selectedUser = vendorUsers.find(user => String(user.id) === String(userId));
    
    if (selectedUser) {
      // Check if backup user is same as primary contact
      if (formData.contact_email && selectedUser.email && 
          formData.contact_email.toLowerCase() === selectedUser.email.toLowerCase()) {
        setModalError('Backup contact cannot be the same as primary contact');
        // Reset selection
        e.target.value = formData.backup_contact_user_id || '';
        return;
      }
      
      setModalError(''); // Clear any previous errors
      setFormData(prev => ({
        ...prev,
        backup_contact_user_id: userId,
        backup_contact_name: selectedUser.full_name || selectedUser.username,
        backup_contact_email: selectedUser.email || '',
        backup_contact_phone: selectedUser.phone_number || ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        backup_contact_user_id: '',
        backup_contact_name: '',
        backup_contact_email: '',
        backup_contact_phone: ''
      }));
    }
  };
  
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  // Handler for saving basic vendor info (Stage 1)
  const handleSaveBasicInfo = async () => {
    setModalError('');
    
    // Validate required fields for basic info
    if (!formData.vendor_name.trim()) {
      setModalError('Vendor name is required');
      return;
    }
    
    if (!formData.contact_name.trim()) {
      setModalError('Contact name is required');
      return;
    }
    
    if (!formData.contact_email.trim()) {
      setModalError('Contact email is required');
      return;
    }
    
    if (!validateEmail(formData.contact_email)) {
      setModalError('Please enter a valid email address');
      return;
    }
    
    setSavingBasicInfo(true);
    
    try {
      // Save basic vendor info with minimal fields
      const basicData = {
        vendor_name: formData.vendor_name,
        description: formData.description,
        contact_name: formData.contact_name,
        contact_email: formData.contact_email,
        contact_phone: formData.contact_phone,
        status: formData.status
      };
      
      const response = await axios.post('/api/vendors', basicData);
      
      // Store vendor ID, project ID, and project name from response
      const newVendorId = response.data.vendor.id;
      const projectId = response.data.vendor.project_id;
      const projectName = response.data.vendor.project_name;
      
      setSavedVendorId(newVendorId);
      setBasicInfoSaved(true);
      
      // Auto-populate project info from the created vendor
      setFormData(prev => ({
        ...prev,
        project_id: projectId,
        project_name: projectName
      }));
      
      setModalError('');
      
      // Refresh vendors list to show new vendor
      fetchData();
    } catch (error) {
      console.error('Error saving basic vendor info:', error);
      
      let errorMessage = 'Failed to save vendor information';
      if (error.response?.data) {
        const { error: errorMsg, message } = error.response.data;
        errorMessage = errorMsg || message || errorMessage;
      }
      
      setModalError(errorMessage);
    } finally {
      setSavingBasicInfo(false);
    }
  };
  
  // Handler for final vendor creation with project & connection (Stage 2)
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate all fields are filled
    if (!formData.project_id) {
      setModalError('Project is required');
      return;
    }
    
    try {
      const vendorId = savedVendorId || selectedVendor.id;
      
      // Filter formData to send only valid backend fields (exclude project_name)
      const updateData = {
        vendor_name: formData.vendor_name,
        description: formData.description,
        contact_name: formData.contact_name,
        contact_email: formData.contact_email,
        contact_phone: formData.contact_phone,
        address: formData.address,
        backup_contact_name: formData.backup_contact_name,
        backup_contact_phone: formData.backup_contact_phone,
        backup_contact_email: formData.backup_contact_email,
        project_id: formData.project_id,
        status: formData.status
      };
      
      console.log('Sending vendor update:', updateData);
      
      // Update vendor with project and connection info
      await axios.put(`/api/vendors/${vendorId}`, updateData);
      
      setSuccessMessage(`Vendor "${formData.vendor_name}" configured successfully!`);
      
      closeModal();
      fetchData();
      setModalError('');
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error saving vendor:', error);
      console.error('Error response:', error.response?.data);
      
      // Extract detailed error message
      let errorMessage = 'Failed to save vendor';
      
      if (error.response?.data) {
        const { error: errorMsg, message } = error.response.data;
        errorMessage = errorMsg || message || errorMessage;
      } else if (error.message) {
        errorMessage += ': ' + error.message;
      }
      
      setModalError(errorMessage);
    }
  };
  
  const openDeleteConfirmation = (vendorId, vendorName) => {
    setVendorToDelete({ id: vendorId, name: vendorName });
    setDeleteConfirmationOpen(true);
  };
  
  const handleDeleteVendor = async () => {
    if (!vendorToDelete) return;
    
    try {
      await axios.delete(`/api/vendors/${vendorToDelete.id}`);
      setSuccessMessage(`Vendor "${vendorToDelete.name}" deleted successfully!`);
      setDeleteConfirmationOpen(false);
      setVendorToDelete(null);
      fetchData();
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error deleting vendor:', error);
      setError('Failed to delete vendor: ' + (error.response?.data?.error || error.message));
      setDeleteConfirmationOpen(false);
      setVendorToDelete(null);
    }
  };
  
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'active':
        return 'status-badge status-active';
      case 'inactive':
        return 'status-badge status-inactive';
      case 'suspended':
        return 'status-badge status-suspended';
      default:
        return 'status-badge';
    }
  };
  
  return (
    <div className="vendor-management-container">
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="vendor-management-header">
            <h1>Vendor Management</h1>
            <div className="header-actions">
              <button 
                className="create-vendor-btn"
                onClick={openCreateModal}
              >
                Add New Vendor
              </button>
            </div>
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
      
      <div className="vendors-table-container">
        <table className="vendors-table">
          <thead>
            <tr>
              <th>Vendor Code</th>
              <th>Vendor Name</th>
              <th>Contact Email</th>
              <th>Project</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr>
                <td colSpan="6" className="no-vendors-message">No vendors found</td>
              </tr>
            ) : (
              vendors.map(vendor => (
                <tr key={vendor.id}>
                  <td>{vendor.vendor_code}</td>
                  <td>{vendor.vendor_name}</td>
                  <td>{vendor.contact_email}</td>
                  <td>{vendor.project_name || '-'}</td>
                  <td>
                    <span className={getStatusBadgeClass(vendor.status)}>
                      {vendor.status}
                    </span>
                  </td>
                  <td>
                    <div className="vendor-actions">
                      <button 
                        className="icon-btn edit-icon-btn" 
                        onClick={() => openEditModal(vendor)}
                        title="Edit Vendor"
                      >
                        <FiEdit2 />
                      </button>
                      <button 
                        className="icon-btn project-icon-btn" 
                        onClick={() => navigate('/projects')}
                        title="Go to Projects"
                      >
                        <FiFolderPlus />
                      </button>
                      <button 
                        className="icon-btn delete-icon-btn" 
                        onClick={() => openDeleteConfirmation(vendor.id, vendor.vendor_name)}
                        title="Delete Vendor"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination Controls */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        itemsPerPage={pageSize}
        totalItems={totalCount}
      />
      
      {/* Create/Edit Modal using ThreeSectionModal */}
      <ThreeSectionModal
        isOpen={modalOpen}
        onClose={closeModal}
        title={modalMode === 'create' ? 'Add New Vendor' : 'Edit Vendor'}
        size="large"
        footer={
          <>
            <button type="button" onClick={closeModal}>
              Cancel
            </button>
            {basicInfoSaved && (
              <button 
                type="submit" 
                form="vendor-form"
                disabled={!formData.project_id}
                style={{
                  opacity: !formData.project_id ? 0.5 : 1,
                  cursor: !formData.project_id ? 'not-allowed' : 'pointer'
                }}
              >
                {modalMode === 'create' ? 'Create Vendor' : 'Update Vendor'}
              </button>
            )}
          </>
        }
      >
        <form id="vendor-form" onSubmit={handleSubmit} className="vendor-form">
          {/* Section 1: Vendor Information */}
          <div className="form-section">
            <h3 className="section-title">Vendor Information</h3>
            
            <div className="form-group">
              <label htmlFor="vendor_name">
                Vendor Name <span className="required-field">*</span>
              </label>
              <input
                type="text"
                id="vendor_name"
                name="vendor_name"
                value={formData.vendor_name}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows="3"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="contact_user">
                Contact User <span className="required-field">*</span>
              </label>
              <select
                id="contact_user"
                name="contact_user"
                value={formData.contact_user_id}
                onChange={handleContactUserChange}
                required
              >
                <option value="">Select a vendor user</option>
                {vendorUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.username} ({user.email})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label htmlFor="contact_name">Contact Name (Auto-filled)</label>
              <input
                type="text"
                id="contact_name"
                name="contact_name"
                value={formData.contact_name}
                readOnly
                disabled
                style={{ backgroundColor: '#f3f4f6' }}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="contact_email">
                Contact Email (Auto-filled) <span className="required-field">*</span>
              </label>
              <input
                type="email"
                id="contact_email"
                name="contact_email"
                value={formData.contact_email}
                readOnly
                disabled
                required
                style={{ backgroundColor: '#f3f4f6' }}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="contact_phone">Contact Phone (Auto-filled)</label>
              <input
                type="tel"
                id="contact_phone"
                name="contact_phone"
                value={formData.contact_phone}
                readOnly
                disabled
                style={{ backgroundColor: '#f3f4f6' }}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="address">Address</label>
              <textarea
                id="address"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                rows="3"
                placeholder="Enter vendor's full address"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="backup_contact_user">Backup Contact User</label>
              <select
                id="backup_contact_user"
                name="backup_contact_user"
                value={formData.backup_contact_user_id}
                onChange={handleBackupContactUserChange}
              >
                <option value="">Select a vendor user (optional)</option>
                {vendorUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.username} ({user.email})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label htmlFor="backup_contact_name">Backup Contact Name (Auto-filled)</label>
              <input
                type="text"
                id="backup_contact_name"
                name="backup_contact_name"
                value={formData.backup_contact_name}
                readOnly
                disabled
                style={{ backgroundColor: '#f3f4f6' }}
                placeholder="Alternate contact person"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="backup_contact_email">Backup Contact Email (Auto-filled)</label>
              <input
                type="email"
                id="backup_contact_email"
                name="backup_contact_email"
                value={formData.backup_contact_email}
                readOnly
                disabled
                style={{ backgroundColor: '#f3f4f6' }}
                placeholder="Alternate contact email"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="backup_contact_phone">Backup Contact Phone (Auto-filled)</label>
              <input
                type="tel"
                id="backup_contact_phone"
                name="backup_contact_phone"
                value={formData.backup_contact_phone}
                readOnly
                disabled
                style={{ backgroundColor: '#f3f4f6' }}
                placeholder="Alternate contact phone number"
              />
            </div>
            
            {/* Save button for basic info in create mode */}
            {modalMode === 'create' && !basicInfoSaved && (
              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                {modalError && (
                  <div className="modal-error-message" role="alert" style={{ marginBottom: '1rem' }}>
                    {modalError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleSaveBasicInfo}
                  disabled={savingBasicInfo}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#4a90e2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    cursor: savingBasicInfo ? 'not-allowed' : 'pointer',
                    opacity: savingBasicInfo ? 0.6 : 1
                  }}
                >
                  {savingBasicInfo ? 'Saving...' : 'Save Vendor Information'}
                </button>
                <small style={{ color: '#6b7280', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                  Save basic information to continue with project and connection setup
                </small>
              </div>
            )}
          </div>
          
          {/* Section 2: Project & Connection - Only show after basic info is saved */}
          {basicInfoSaved && (
          <div className="form-section">
            <h3 className="section-title">Project & Connection</h3>
            
            <div className="form-group">
              <label htmlFor="project_id">Project</label>
              <select
                id="project_id"
                name="project_id"
                value={formData.project_id}
                onChange={handleInputChange}
                required
              >
                <option value="">Select a project</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <small style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                Select the project for this vendor
              </small>
            </div>
          </div>
          )}
        </form>
      </ThreeSectionModal>
      
      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirmationOpen}
        onClose={() => {
          setDeleteConfirmationOpen(false);
          setVendorToDelete(null);
        }}
        onConfirm={handleDeleteVendor}
        title="Delete Vendor"
        message={`Are you sure you want to delete vendor "${vendorToDelete?.name}"? This will deactivate the vendor.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonStyle={{ background: '#dc2626' }}
      />
        </>
      )}
    </div>
  );
};

export default VendorManagement;
