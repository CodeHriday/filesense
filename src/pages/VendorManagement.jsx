import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import ThreeSectionModal from '../components/ThreeSectionModal';
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
    project_id: '',
    drop_location_path: '',
    vendor_connection_id: '', // Replaces drop_location_path
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
  
  // Vendor connections state
  const [vendorConnections, setVendorConnections] = useState([]);
  const [filteredConnections, setFilteredConnections] = useState([]);
  
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  // Check if user has Admin role - memoized to prevent recalculation
  const isAdmin = useMemo(() => {
    return currentUser?.roles?.includes('Admin') || currentUser?.role_id === 1;
  }, [currentUser?.roles, currentUser?.role_id]);
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      const [vendorsResponse, projectsResponse, connectionsResponse] = await Promise.all([
        axios.get('/api/vendors', {
          params: { page: currentPage, pageSize }
        }),
        axios.get('/api/projects'),
        axios.get('/api/vendor-connections')
      ]);
      
      setVendors(vendorsResponse.data.vendors || []);
      setTotalPages(vendorsResponse.data.pagination?.totalPages || 1);
      setTotalCount(vendorsResponse.data.pagination?.totalCount || 0);
      
      setProjects(projectsResponse.data || []);
      setVendorConnections(connectionsResponse.data.connections || []);
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
    
    if (!isAdmin) {
      navigate('/');
      return;
    }
    
    fetchData();
  }, [currentUser, isAdmin, navigate, fetchData]);
  
  // Filter vendor connections - show only vendor type connections (project_id is NULL for vendor connections)
  useEffect(() => {
    // Vendor connections are global and have type='vendor'
    const filtered = vendorConnections.filter(conn => conn.type === 'vendor');
    setFilteredConnections(filtered);
  }, [vendorConnections]);
  
  // Auto-populate drop_location_path from selected vendor connection (bucket + file_path)
  useEffect(() => {
    if (formData.vendor_connection_id && filteredConnections.length > 0) {
      const selectedConnection = filteredConnections.find(
        conn => String(conn.connection_id) === String(formData.vendor_connection_id)
      );
      
      if (selectedConnection) {
        const config = selectedConnection.config || {};
        const bucket = config.bucket || config.bucket_name || '';
        const filePath = config.path_prefix || '';
        
        // Combine bucket and file path
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
        setFormData(prev => ({
          ...prev,
          drop_location_path: ''
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        drop_location_path: ''
      }));
    }
  }, [formData.vendor_connection_id, filteredConnections]);
  
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
      project_id: '',
      drop_location_path: '',
      vendor_connection_id: '',
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
    setFormData({
      vendor_name: vendor.vendor_name || '',
      description: vendor.description || '',
      contact_name: vendor.contact_name || '',
      contact_email: vendor.contact_email || '',
      contact_phone: vendor.contact_phone || '',
      address: vendor.address || '',
      backup_contact_name: vendor.backup_contact_name || '',
      backup_contact_phone: vendor.backup_contact_phone || '',
      project_id: vendor.project_id || '',
      drop_location_path: vendor.drop_location_path || '',
      vendor_connection_id: vendor.vendor_connection_id || '',
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
      
      // Store vendor ID and auto-populate project with vendor name
      const newVendorId = response.data.vendor.id;
      const vendorName = response.data.vendor.vendor_name;
      
      setSavedVendorId(newVendorId);
      setBasicInfoSaved(true);
      
      // Auto-populate project field with vendor name (user can edit if needed)
      setFormData(prev => ({
        ...prev,
        project_id: vendorName
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
    if (!formData.project_id.trim()) {
      setModalError('Project name is required');
      return;
    }
    
    if (!formData.vendor_connection_id) {
      setModalError('Please select a vendor connection');
      return;
    }
    
    if (!formData.drop_location_path) {
      setModalError('Drop location path is required');
      return;
    }
    
    try {
      const vendorId = savedVendorId || selectedVendor.id;
      
      // Update vendor with project and connection info
      await axios.put(`/api/vendors/${vendorId}`, formData);
      
      setSuccessMessage(`Vendor "${formData.vendor_name}" configured successfully!`);
      
      closeModal();
      fetchData();
      setModalError('');
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error saving vendor:', error);
      
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
  
  const handleDeleteVendor = async (vendorId, vendorName) => {
    if (!window.confirm(`Are you sure you want to delete vendor "${vendorName}"? This will deactivate the vendor.`)) {
      return;
    }
    
    try {
      await axios.delete(`/api/vendors/${vendorId}`);
      setSuccessMessage(`Vendor "${vendorName}" deleted successfully!`);
      fetchData();
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error deleting vendor:', error);
      setError('Failed to delete vendor: ' + (error.response?.data?.error || error.message));
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
                        className="edit-vendor-btn" 
                        onClick={() => openEditModal(vendor)}
                      >
                        Edit
                      </button>
                      <button 
                        className="delete-vendor-btn" 
                        onClick={() => handleDeleteVendor(vendor.id, vendor.vendor_name)}
                      >
                        Delete
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
                disabled={!formData.project_id || !formData.vendor_connection_id || !formData.drop_location_path}
                style={{
                  opacity: (!formData.project_id || !formData.vendor_connection_id || !formData.drop_location_path) ? 0.5 : 1,
                  cursor: (!formData.project_id || !formData.vendor_connection_id || !formData.drop_location_path) ? 'not-allowed' : 'pointer'
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
              <label htmlFor="contact_name">
                Contact Name <span className="required-field">*</span>
              </label>
              <input
                type="text"
                id="contact_name"
                name="contact_name"
                value={formData.contact_name}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="contact_email">
                Contact Email <span className="required-field">*</span>
              </label>
              <input
                type="email"
                id="contact_email"
                name="contact_email"
                value={formData.contact_email}
                onChange={handleInputChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="contact_phone">Contact Phone</label>
              <input
                type="tel"
                id="contact_phone"
                name="contact_phone"
                value={formData.contact_phone}
                onChange={handleInputChange}
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
              <label htmlFor="backup_contact_name">Backup Contact Name</label>
              <input
                type="text"
                id="backup_contact_name"
                name="backup_contact_name"
                value={formData.backup_contact_name}
                onChange={handleInputChange}
                placeholder="Alternate contact person"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="backup_contact_phone">Backup Contact Phone</label>
              <input
                type="tel"
                id="backup_contact_phone"
                name="backup_contact_phone"
                value={formData.backup_contact_phone}
                onChange={handleInputChange}
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
              <input
                type="text"
                id="project_id"
                name="project_id"
                value={formData.project_id}
                onChange={handleInputChange}
                placeholder="Project name (defaults to vendor name)"
              />
              <small style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                Edit if needed, or leave as vendor name
              </small>
            </div>
            
            <div className="form-group">
              <label htmlFor="vendor_connection_id">Vendor File Drop Connection</label>
              <select
                id="vendor_connection_id"
                name="vendor_connection_id"
                value={formData.vendor_connection_id}
                onChange={handleInputChange}
              >
                <option value="">Select a vendor connection</option>
                {filteredConnections.map(conn => (
                  <option key={conn.connection_id} value={conn.connection_id}>
                    {conn.name} ({conn.config?.provider?.toUpperCase() || 'AWS'})
                  </option>
                ))}
              </select>
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
            </div>
          </div>
          )}
        </form>
      </ThreeSectionModal>
        </>
      )}
    </div>
  );
};

export default VendorManagement;
