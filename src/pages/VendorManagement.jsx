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
  
  // Filter vendor connections by selected project
  useEffect(() => {
    if (formData.project_id) {
      const filtered = vendorConnections.filter(
        conn => conn.project_id === parseInt(formData.project_id)
      );
      setFilteredConnections(filtered);
    } else {
      setFilteredConnections([]);
    }
  }, [formData.project_id, vendorConnections]);
  
  // Auto-populate drop_location_path from selected vendor connection
  useEffect(() => {
    if (formData.vendor_connection_id && filteredConnections.length > 0) {
      const selectedConnection = filteredConnections.find(
        conn => conn.connection_id === parseInt(formData.vendor_connection_id)
      );
      
      if (selectedConnection && selectedConnection.config?.path) {
        setFormData(prev => ({
          ...prev,
          drop_location_path: selectedConnection.config.path
        }));
      } else {
        // Clear the path if connection is deselected or doesn't have a path
        setFormData(prev => ({
          ...prev,
          drop_location_path: ''
        }));
      }
    } else {
      // Clear the path if no connection is selected
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
      project_id: '',
      drop_location_path: '',
      vendor_connection_id: '',
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
    setFormData({
      vendor_name: vendor.vendor_name || '',
      description: vendor.description || '',
      contact_name: vendor.contact_name || '',
      contact_email: vendor.contact_email || '',
      contact_phone: vendor.contact_phone || '',
      project_id: vendor.project_id || '',
      drop_location_path: vendor.drop_location_path || '',
      vendor_connection_id: vendor.vendor_connection_id || '',
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
  
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate required fields
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
    
    try {
      if (modalMode === 'create') {
        const response = await axios.post('/api/vendors', formData);
        
        // Show success message with info about created user account
        if (response.data.vendor && response.data.vendor.vendor_username) {
          setSuccessMessage(
            `Vendor "${response.data.vendor.vendor_name}" created successfully! ` +
            `A user account has been created with username: ${response.data.vendor.vendor_username}`
          );
        } else {
          setSuccessMessage(`Vendor created successfully!`);
        }
      } else {
        await axios.put(`/api/vendors/${selectedVendor.id}`, formData);
        setSuccessMessage(`Vendor "${formData.vendor_name}" updated successfully!`);
      }
      
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
            <button type="submit" form="vendor-form">
              {modalMode === 'create' ? 'Create Vendor' : 'Update Vendor'}
            </button>
          </>
        }
      >
        {modalError && (
          <div className="modal-error-message" role="alert" style={{ marginBottom: '1rem' }}>
            {modalError}
          </div>
        )}
        
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
          </div>
          
          {/* Section 2: Project & Connection */}
          <div className="form-section">
            <h3 className="section-title">Project & Connection</h3>
            
            <div className="form-group">
              <label htmlFor="project_id">Project</label>
              <select
                id="project_id"
                name="project_id"
                value={formData.project_id}
                onChange={handleInputChange}
              >
                <option value="">Select a project</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <small style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                A project will be auto-created if not selected
              </small>
            </div>
            
            <div className="form-group">
              <label htmlFor="vendor_connection_id">Vendor File Drop Connection</label>
              <select
                id="vendor_connection_id"
                name="vendor_connection_id"
                value={formData.vendor_connection_id}
                onChange={handleInputChange}
                disabled={!formData.project_id}
              >
                <option value="">Select a vendor connection</option>
                {filteredConnections.map(conn => (
                  <option key={conn.connection_id} value={conn.connection_id}>
                    {conn.name} ({conn.config?.provider?.toUpperCase() || 'AWS'})
                  </option>
                ))}
              </select>
              {!formData.project_id && (
                <small style={{ color: '#f59e0b', fontSize: '0.875rem' }}>
                  Select a project first to see available connections
                </small>
              )}
              {formData.project_id && filteredConnections.length === 0 && (
                <small style={{ color: '#f59e0b', fontSize: '0.875rem' }}>
                  No vendor connections available for this project. Create one in Connections page.
                </small>
              )}
            </div>
            
            <div className="form-group">
              <label htmlFor="drop_location_path">Drop Location Path</label>
              <input
                type="text"
                id="drop_location_path"
                name="drop_location_path"
                value={formData.drop_location_path}
                readOnly
                placeholder="Select a vendor connection to see the path"
                style={{ backgroundColor: '#f9fafb', cursor: 'not-allowed' }}
              />
              <small style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                {formData.vendor_connection_id 
                  ? 'Path from selected vendor connection' 
                  : 'Auto-populated from selected connection or auto-generated'}
              </small>
            </div>          </div>
          
          {/* Section 3: Configuration */}
          <div className="form-section">
            <h3 className="section-title">Configuration</h3>
            
            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleInputChange}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        </form>
      </ThreeSectionModal>
        </>
      )}
    </div>
  );
};

export default VendorManagement;
