import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import PasswordInput from '../components/PasswordInput';
import Pagination from '../components/Pagination';
import { useAuth } from '../context/AuthContext';
import { getAllUsers, getRoles, createUser, updateUser, deleteUser } from '../api/authService';
import axios from 'axios';
import '../styles/UserManagement.css';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    phone_number: '',
    auth_provider: 'local',
    roles: []
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Password reset requests state
  const [resetRequestsModalOpen, setResetRequestsModalOpen] = useState(false);
  const [resetRequests, setResetRequests] = useState([]);
  const [pendingResetCount, setPendingResetCount] = useState(0);
  const [resetRequestsLoading, setResetRequestsLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [actionNotes, setActionNotes] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  
  const { currentUser, hasPermission, hasRole } = useAuth();
  const navigate = useNavigate();
  
  // Check if user has permission to view users
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    
    // For now, allow access to all logged-in users
    // Later we can add proper permission checking when the roles are set up
    // if (!hasPermission('user_view')) {
    //   navigate('/');
    //   return;
    // }
    
    fetchData();
  }, [currentUser, navigate, currentPage, pageSize]);
  
  const fetchData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const [usersResponse, rolesData] = await Promise.all([
        getAllUsers(currentPage, pageSize),
        getRoles(1, 100)
      ]);
      
      setUsers(usersResponse.users || []);
      setTotalPages(usersResponse.pagination?.totalPages || 1);
      setTotalCount(usersResponse.pagination?.totalCount || 0);
      
      setRoles(rolesData.roles || rolesData);
      
      // Fetch password reset requests count for admins
      if (hasRole && hasRole('Admin')) {
        fetchResetRequestsCount();
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load user management data');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchResetRequestsCount = async () => {
    try {
      const response = await axios.get('/api/password-reset-requests');
      const pending = response.data.filter(req => req.status === 'pending').length;
      setPendingResetCount(pending);
    } catch (error) {
      console.error('Error fetching reset requests count:', error);
    }
  };
  
  const fetchResetRequests = async () => {
    setResetRequestsLoading(true);
    try {
      const response = await axios.get('/api/password-reset-requests');
      setResetRequests(response.data);
    } catch (error) {
      console.error('Error fetching reset requests:', error);
      setError('Failed to load password reset requests');
    } finally {
      setResetRequestsLoading(false);
    }
  };
  
  const handleOpenResetRequestsModal = async () => {
    setResetRequestsModalOpen(true);
    await fetchResetRequests();
  };
  
  const handleApproveReset = async (requestId) => {
    try {
      const response = await axios.post(`/api/password-reset-requests/${requestId}/approve`, {
        notes: actionNotes
      });
      
      setTempPassword(response.data.tempPassword);
      await fetchResetRequests();
      fetchResetRequestsCount();
      setActionNotes('');
      
      alert(`Password reset approved. Temporary password: ${response.data.tempPassword}\n\nPlease inform the user of this password.`);
    } catch (error) {
      console.error('Error approving reset:', error);
      setError(error.response?.data?.error || 'Failed to approve password reset');
    }
  };
  
  const handleDenyReset = async (requestId) => {
    try {
      await axios.post(`/api/password-reset-requests/${requestId}/deny`, {
        notes: actionNotes
      });
      
      await fetchResetRequests();
      fetchResetRequestsCount();
      setActionNotes('');
    } catch (error) {
      console.error('Error denying reset:', error);
      setError(error.response?.data?.error || 'Failed to deny password reset');
    }
  };
  
  const openCreateModal = () => {
    setFormData({
      username: '',
      password: '',
      email: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      phone_number: '',
      auth_provider: 'local',
      roles: []
    });
    setModalMode('create');
    setError('');
    setModalError('');
    setModalOpen(true);
  };
  
  const openEditModal = (user) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      password: '',
      email: user.email || '',
      first_name: user.first_name || '',
      middle_name: user.middle_name || '',
      last_name: user.last_name || '',
      phone_number: user.phone_number || '',
      auth_provider: user.auth_provider || 'local',
      roles: user.roles || []
    });
    setModalMode('edit');
    setModalError('');
    setModalOpen(true);
  };
  
  const closeModal = () => {
    setModalOpen(false);
    setSelectedUser(null);
    setModalError('');
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleRoleChange = (e) => {
    const { value, checked } = e.target;
    
    if (checked) {
      setFormData(prev => ({
        ...prev,
        roles: [...prev.roles, value]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        roles: prev.roles.filter(role => role !== value)
      }));
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate that at least one role is selected
    if (formData.roles.length === 0) {
      setModalError('At least one role must be assigned to the user');
      return;
    }
    
    try {
      if (modalMode === 'create') {
        // Temporarily bypass permission checks
        // if (!hasPermission('user_create')) {
        //   setError("You don't have permission to create users");
        //   return;
        // }
        
        await createUser(formData);
      } else {
        // Temporarily bypass permission checks
        // if (!hasPermission('user_edit')) {
        //   setError("You don't have permission to edit users");
        //   return;
        // }
        
        // Don't send password if it's empty (no change)
        const updateData = { ...formData };
        if (!updateData.password) {
          delete updateData.password;
        }
        
        await updateUser(selectedUser.id, updateData);
      }
      
      closeModal();
      fetchData();
      setModalError('');
    } catch (error) {
      console.error('Error saving user:', error);
      
      // Extract detailed error message
      let errorMessage = 'Failed to save user';
      
      if (error.response?.data) {
        const { message, errors } = error.response.data;
        
        if (message) {
          errorMessage = message;
        }
        
        // If there are specific validation errors, add them
        if (errors && Array.isArray(errors)) {
          errorMessage += ': ' + errors.join(', ');
        } else if (errors && typeof errors === 'object') {
          const errorDetails = Object.values(errors).join(', ');
          if (errorDetails) {
            errorMessage += ': ' + errorDetails;
          }
        }
      } else if (error.message) {
        errorMessage += ': ' + error.message;
      }
      
      setModalError(errorMessage);
    }
  };
  
  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }
    
    try {
      // Temporarily bypass permission checks
      // if (!hasPermission('user_delete')) {
      //   setError("You don't have permission to delete users");
      //   return;
      // }
      
      await deleteUser(userId);
      fetchData();
    } catch (error) {
      console.error('Error deleting user:', error);
      setError('Failed to delete user: ' + (error.response?.data?.error || error.message));
    }
  };
  
  return (
    <div className="user-management-container">
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="user-management-header">
            <h1>User Management</h1>
            <div className="header-actions">
              <Link to="/roles" className="role-management-link">
                Role Management
              </Link>
              {hasRole && hasRole('Admin') && (
                <button
                  onClick={handleOpenResetRequestsModal}
                  className="reset-requests-btn"
                >
                  Password Reset Requests
                  {pendingResetCount > 0 && (
                    <span className="badge-count">{pendingResetCount}</span>
                  )}
                </button>
              )}
              <button 
                className="create-user-btn"
                onClick={openCreateModal}
              >
                Add New User
              </button>
            </div>
          </div>
          
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
      
      
      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Full Name</th>
              <th>Email</th>
              <th>Auth Provider</th>
              <th>Roles</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-users-message">No users found</td>
              </tr>
            ) : (
              users.map(user => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.full_name || '-'}</td>
                  <td>{user.email || '-'}</td>
                  <td>
                    <span className={`auth-provider-badge ${user.auth_provider || 'local'}`}>
                      {user.auth_provider === 'okta' ? 'Okta SSO' : 'Local'}
                    </span>
                  </td>
                  <td>
                    <div className="user-roles">
                      {user.roles && user.roles.length > 0 ? 
                        user.roles.map(role => (
                          <span key={role} className="role-badge">
                            {role}
                          </span>
                        )) : 
                        '-'
                      }
                    </div>
                  </td>
                  <td>{user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                  <td>
                    <div className="user-actions">
                                      {/* Temporarily enable Edit button for all users */}
                      <button 
                        className="edit-user-btn" 
                        onClick={() => openEditModal(user)}
                      >
                        Edit
                      </button>
                      
                      {/* Temporarily enable Delete button for all users except current user */}
                      {user.id !== currentUser?.id && (
                        <button 
                          className="delete-user-btn" 
                          onClick={() => handleDeleteUser(user.id)}
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
      
      {/* Pagination Controls */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        itemsPerPage={pageSize}
        totalItems={totalCount}
      />
      
      {/* User Form Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="user-modal" role="dialog" aria-labelledby="user-modal-title">
            <div className="modal-header">
              <h2 id="user-modal-title">
                {modalMode === 'create' ? 'Create New User' : 'Edit User'}
              </h2>
              <button className="close-modal-btn" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>
            
            {modalError && (
              <div className="error-message modal-error-message" role="alert">
                {modalError}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="user-form">
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  disabled={modalMode === 'edit'}
                  required
                />
              </div>
              
              {formData.auth_provider === 'local' && (
                <div className="form-group">
                  <label htmlFor="password">
                    Password {modalMode === 'edit' && '(leave blank to keep current)'}
                  </label>
                  <PasswordInput
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder={modalMode === 'edit' ? 'Leave blank to keep current' : 'Enter password'}
                    required={modalMode === 'create'}
                  />
                  {modalMode === 'create' && formData.password && (
                    <PasswordStrengthMeter password={formData.password} />
                  )}
                </div>
              )}
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="first_name">First Name</label>
                  <input
                    type="text"
                    id="first_name"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="middle_name">Middle Name</label>
                  <input
                    type="text"
                    id="middle_name"
                    name="middle_name"
                    value={formData.middle_name}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="last_name">Last Name</label>
                  <input
                    type="text"
                    id="last_name"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="phone_number">Phone Number</label>
                  <input
                    type="tel"
                    id="phone_number"
                    name="phone_number"
                    value={formData.phone_number}
                    onChange={handleInputChange}
                    placeholder="+1-555-123-4567"
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="form-group">
                <label>Roles <span className="required-field">*</span></label>
                <div className="roles-info">
                  At least one role must be assigned to each user.
                  {roles.length === 0 && (
                    <div className="no-roles-warning">
                      No roles available. Please <Link to="/roles">create roles</Link> first.
                    </div>
                  )}
                </div>
                <div className="roles-checkboxes">
                  {roles
                    .filter(role => role.name !== 'Viewer') // Filter out the Viewer role
                    .map(role => (
                      <div key={role.id} className="role-checkbox">
                        <label htmlFor={`role-${role.id}`}>
                          {role.name}
                        </label>
                        <input
                          type="checkbox"
                          id={`role-${role.id}`}
                          value={role.name}
                          checked={formData.roles.includes(role.name)}
                          onChange={handleRoleChange}
                        />
                      </div>
                    ))}
                </div>
              </div>
              
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="save-btn">
                  {modalMode === 'create' ? 'Create User' : 'Update User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Password Reset Requests Modal */}
      {resetRequestsModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content large-modal">
            <div className="modal-header">
              <h3>Password Reset Requests</h3>
              <button
                className="modal-close"
                onClick={() => setResetRequestsModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              {resetRequestsLoading ? (
                <LoadingSpinner />
              ) : resetRequests.length === 0 ? (
                <div className="no-requests-message">
                  No password reset requests found.
                </div>
              ) : (
                <table className="reset-requests-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Requested At</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resetRequests.map(request => (
                      <tr key={request.id} className={request.status}>
                        <td>
                          <div>
                            <strong>{request.username}</strong>
                            {request.full_name && (
                              <div className="user-full-name">{request.full_name}</div>
                            )}
                          </div>
                        </td>
                        <td>{request.email || '-'}</td>
                        <td>{new Date(request.requested_at).toLocaleString()}</td>
                        <td>
                          <span className={`status-badge status-${request.status}`}>
                            {request.status}
                          </span>
                          {request.approved_at && (
                            <div className="status-detail">
                              by {request.approved_by_username} at {new Date(request.approved_at).toLocaleString()}
                            </div>
                          )}
                          {request.denied_at && (
                            <div className="status-detail">
                              by {request.approved_by_username} at {new Date(request.denied_at).toLocaleString()}
                            </div>
                          )}
                          {request.notes && (
                            <div className="status-notes">Note: {request.notes}</div>
                          )}
                        </td>
                        <td>
                          {request.status === 'pending' && (
                            <div className="request-actions">
                              <button
                                onClick={() => {
                                  if (window.confirm(`Approve password reset for ${request.username}?\n\nThis will generate a temporary password that the user must change on first login.`)) {
                                    handleApproveReset(request.id);
                                  }
                                }}
                                className="btn-approve"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm(`Deny password reset for ${request.username}?`)) {
                                    handleDenyReset(request.id);
                                  }
                                }}
                                className="btn-deny"
                              >
                                Deny
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

export default UserManagement;