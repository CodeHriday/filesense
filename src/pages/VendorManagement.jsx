import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiEdit2, FiTrash2, FiFolder, FiSearch, FiPlus } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import ThreeSectionModal from '../components/ThreeSectionModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import '../styles/global-page-styles.css';
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
    vendor_type: '',
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
  
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  // Vendor users state
  const [vendorUsers, setVendorUsers] = useState([]);
  
  // Delete confirmation modal state
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState(null);
  
  // Success modal state for vendor creation
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdVendorInfo, setCreatedVendorInfo] = useState(null);
  
  const { currentUser, hasPermission } = useAuth();
  const navigate = useNavigate();
  
  // Check if user has vendor_details:read permission - memoized to prevent recalculation
  const canAccessVendorDetails = useMemo(() => {
    return hasPermission && hasPermission('vendor_details:read');
  }, [hasPermission]);
  
  // Debounce search term (2.5 seconds)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 2500);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('pageSize', pageSize.toString());
      if (debouncedSearchTerm) params.append('search', debouncedSearchTerm);
      
      const response = await axios.get(`/api/vendors/init-data?${params}`);
      const data = response.data;
      
      setVendors(data.vendors || []);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages || 1);
        setTotalCount(data.pagination.totalCount || 0);
      }
      
      setProjects(data.projects || []);
      setVendorUsers(data.vendorUsers || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load vendor management data');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearchTerm]);
  
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
  }, [currentUser, canAccessVendorDetails, navigate, fetchData, debouncedSearchTerm, currentPage]);
  
  const openCreateModal = () => {
    setFormData({
      vendor_name: '',
      vendor_type: '',
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
      vendor_type: vendor.vendor_type || '',
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
    setModalOpen(true);
  };
  
  const closeModal = () => {
    setModalOpen(false);
    setSelectedVendor(null);
    setModalError('');
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
    // Use a safer email regex to prevent ReDoS - limit quantifiers
    const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{1,63}$/;
    return emailRegex.test(email);
  };
  
  // Handler for vendor creation/update
  const handleSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    
    // Validate required fields
    if (!formData.vendor_name.trim()) {
      setModalError('Vendor name is required');
      return;
    }
    
    if (!formData.vendor_type) {
      setModalError('Vendor type is required');
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
    
    try {
      // Prepare vendor data (exclude project_name as it's display-only)
      const vendorData = {
        vendor_name: formData.vendor_name,
        vendor_type: formData.vendor_type,
        description: formData.description,
        contact_name: formData.contact_name,
        contact_email: formData.contact_email,
        contact_phone: formData.contact_phone,
        address: formData.address,
        backup_contact_name: formData.backup_contact_name,
        backup_contact_phone: formData.backup_contact_phone,
        backup_contact_email: formData.backup_contact_email,
        status: formData.status
      };
      
      if (modalMode === 'create') {
        // Create new vendor
        const response = await axios.post('/api/vendors', vendorData);
        const createdVendor = response.data.vendor;
        
        // Close modal first
        closeModal();
        fetchData();
        
        // Show success modal with vendor and project info
        setCreatedVendorInfo({
          vendorName: createdVendor.vendor_name,
          projectName: createdVendor.project_name
        });
        setShowSuccessModal(true);
      } else {
        // Update existing vendor
        await axios.put(`/api/vendors/${selectedVendor.id}`, vendorData);
        setSuccessMessage(`Vendor "${formData.vendor_name}" updated successfully!`);
        
        closeModal();
        fetchData();
        
        // Clear success message after 5 seconds
        setTimeout(() => setSuccessMessage(''), 5000);
      }
      
      setModalError('');
    } catch (error) {
      console.error('Error saving vendor:', error);
      
      let errorMessage = modalMode === 'create' ? 'Failed to create vendor' : 'Failed to update vendor';
      
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
        return 'gps-badge gps-badge--success';
      case 'inactive':
        return 'gps-badge gps-badge--muted';
      case 'suspended':
        return 'gps-badge gps-badge--danger';
      default:
        return 'gps-badge';
    }
  };

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm]);
  
  return (
    <div className="gps-page-container">
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="gps-page-header">
            <div className="gps-page-header-left">
              <h1 className="gps-page-title">Data Provider (DP) Management</h1>
              <p className="gps-page-subtitle">Manage data providers and contacts</p>
            </div>
            <div className="gps-header-actions">
              <div className="gps-search-wrapper">
                <FiSearch className="gps-search-icon" />
                <input
                  type="text"
                  className="gps-search-input"
                  placeholder="Search vendors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button 
                className="gps-btn gps-btn--primary"
                onClick={openCreateModal}
              >
                <FiPlus /> Add New DP
              </button>
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
              <th>DP Code</th>
              <th>DP Name</th>
              <th>Contact Email</th>
              <th>Project</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr>
                <td colSpan="7" className="gps-table-empty">
                  {searchTerm ? 'No vendors found matching your search' : 'No vendors found'}
                </td>
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
                  <td>{vendor.created_at ? new Date(vendor.created_at).toLocaleString() : '-'}</td>
                  <td>
                    <div className="gps-action-buttons">
                      <button 
                        className="gps-icon-btn gps-icon-btn--edit" 
                        onClick={() => openEditModal(vendor)}
                        title="Edit Vendor"
                      >
                        <FiEdit2 />
                      </button>
                      <button 
                        className="gps-icon-btn gps-icon-btn--success" 
                        onClick={() => navigate('/projects')}
                        title="Go to Projects"
                      >
                        <FiFolder />
                      </button>
                      <button 
                        className="gps-icon-btn gps-icon-btn--delete" 
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
      
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={pageSize}
          totalItems={totalCount}
        />
      )}
      
      {/* Create/Edit Modal using ThreeSectionModal */}
      <ThreeSectionModal
        isOpen={modalOpen}
        onClose={closeModal}
        title={modalMode === 'create' ? 'Add New DP' : 'Edit DP'}
        size="large"
        footer={
          <>
            <button type="button" onClick={closeModal}>
              Cancel
            </button>
            <button 
              type="submit" 
              form="vendor-form"
            >
              {modalMode === 'create' ? 'Create DP' : 'Update DP'}
            </button>
          </>
        }
      >
        <form id="vendor-form" onSubmit={handleSubmit} className="vendor-form">
          {/* Error Display */}
          {modalError && (
            <div className="error-message" role="alert">
              {modalError}
            </div>
          )}
          
          {/* Section 1: Data Provider information */}
          <div className="form-section">
            <h3 className="section-title">Data Provider (DP) information</h3>
            
            <div className="form-row-2col">
              <div className="form-group">
                <label htmlFor="vendor_name">
                  DP Name <span className="required-field">*</span>
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
                <label htmlFor="vendor_type">
                  DP Type <span className="required-field">*</span>
                </label>
                <select
                  id="vendor_type"
                  name="vendor_type"
                  value={formData.vendor_type}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select DP type</option>
                  <option value="Data Provider">Data Provider</option>
                  <option value="Service Provider">Service Provider</option>
                  <option value="Technology Partner">Technology Partner</option>
                  <option value="Consultant">Consultant</option>
                  <option value="Supplier">Supplier</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows="2"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="address">DP Local Address</label>
              <textarea
                id="address"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                rows="2"
                placeholder="Enter DP's local address"
              />
            </div>
            
            {/* Two-column layout for Primary and Backup Contact */}
            <div className="contact-panels-container">
              {/* DP Primary Contact Panel */}
              <div className="contact-panel">
                <h4 className="contact-panel-title">DP Primary Contact</h4>
                
                <div className="form-group">
                  <label htmlFor="contact_user">
                    Select Contact <span className="required-field">*</span>
                  </label>
                  <select
                    id="contact_user"
                    name="contact_user"
                    value={formData.contact_user_id}
                    onChange={handleContactUserChange}
                    required
                  >
                    <option value="">Select a DP user</option>
                    {vendorUsers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.full_name || user.username} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="contact_name">Name (Auto-filled)</label>
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
                  <label htmlFor="contact_phone">Phone (Auto-filled)</label>
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
                  <label htmlFor="contact_email">
                    Email (Auto-filled) <span className="required-field">*</span>
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
              </div>
              
              {/* DP Backup Contact Panel */}
              <div className="contact-panel">
                <h4 className="contact-panel-title">DP Backup Contact</h4>
                
                <div className="form-group">
                  <label htmlFor="backup_contact_user">Select Contact</label>
                  <select
                    id="backup_contact_user"
                    name="backup_contact_user"
                    value={formData.backup_contact_user_id}
                    onChange={handleBackupContactUserChange}
                  >
                    <option value="">Select a DP user (optional)</option>
                    {vendorUsers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.full_name || user.username} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="backup_contact_name">Name (Auto-filled)</label>
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
                  <label htmlFor="backup_contact_phone">Phone (Auto-filled)</label>
                  <input
                    type="tel"
                    id="backup_contact_phone"
                    name="backup_contact_phone"
                    value={formData.backup_contact_phone}
                    readOnly
                    disabled
                    style={{ backgroundColor: '#f3f4f6' }}
                    placeholder="Alternate contact phone"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="backup_contact_email">Email (Auto-filled)</label>
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
              </div>
            </div>
          </div>
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
      
      {/* Vendor Creation Success Modal */}
      {showSuccessModal && createdVendorInfo && (
        <div className="gps-modal-overlay" onClick={() => setShowSuccessModal(false)}>
          <div className="gps-modal gps-modal--sm gps-modal--centered" onClick={(e) => e.stopPropagation()}>
            <div className="gps-modal-body">
              <div className="gps-modal-icon gps-modal-icon--success">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              
              <h2 className="gps-modal-title">Vendor Created Successfully</h2>
              
              <p className="gps-modal-text">
                Vendor <strong>"{createdVendorInfo.vendorName}"</strong> has been created.<br />
                A default project <strong>"{createdVendorInfo.projectName}"</strong> has been created.
              </p>
              
              <p className="gps-modal-text">
                Please go to the project management page and add respective dev teams or users to provide them access to the project.
              </p>
              
              <div className="gps-modal-actions">
                <button 
                  type="button" 
                  className="gps-btn gps-btn--secondary" 
                  onClick={() => setShowSuccessModal(false)}
                >
                  Close
                </button>
                <button 
                  type="button" 
                  className="gps-btn gps-btn--primary" 
                  onClick={() => {
                    setShowSuccessModal(false);
                    navigate('/project-management');
                  }}
                >
                  Go to Project Management
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default VendorManagement;
