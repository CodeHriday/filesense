import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
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
    status: 'active'
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  const { currentUser, hasRole } = useAuth();
  const navigate = useNavigate();
  
  // Check if user has Admin role
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    
    if (!hasRole || !hasRole('Admin')) {
      navigate('/');
      return;
    }
    
    fetchData();
  }, [currentUser, navigate, currentPage, pageSize]);
  
  const fetchData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const [vendorsResponse, projectsResponse] = await Promise.all([
        axios.get('/api/vendors', {
          params: { page: currentPage, pageSize }
        }),
        axios.get('/api/projects')
      ]);
      
      setVendors(vendorsResponse.data.vendors || []);
      setTotalPages(vendorsResponse.data.pagination?.totalPages || 1);
      setTotalCount(vendorsResponse.data.pagination?.totalCount || 0);
      
      setProjects(projectsResponse.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load vendor management data');
    } finally {
      setLoading(false);
    }
  };
  
  const openCreateModal = () => {
    setFormData({
      vendor_name: '',
      description: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      project_id: '',
      drop_location_path: '',
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
      
      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="vendor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalMode === 'create' ? 'Add New Vendor' : 'Edit Vendor'}</h2>
              <button className="close-modal-btn" onClick={closeModal}>
                &times;
              </button>
            </div>
            
            {modalError && (
              <div className="modal-error-message" role="alert">
                {modalError}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="vendor-form">
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
              </div>
              
              <div className="form-group">
                <label htmlFor="drop_location_path">Drop Location Path</label>
                <input
                  type="text"
                  id="drop_location_path"
                  name="drop_location_path"
                  value={formData.drop_location_path}
                  onChange={handleInputChange}
                  placeholder="Auto-generated or custom path"
                />
              </div>
              
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
              
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="save-btn">
                  {modalMode === 'create' ? 'Create Vendor' : 'Update Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default VendorManagement;
