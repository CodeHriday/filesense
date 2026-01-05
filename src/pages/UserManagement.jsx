import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { FiEdit2, FiTrash2, FiSearch } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import PasswordInput from '../components/PasswordInput';
import Pagination from '../components/Pagination';
import TransferOwnershipModal from '../components/TransferOwnershipModal';
import ThreeSectionModal from '../components/ThreeSectionModal';
import { useAuth } from '../context/AuthContext';
import { useDeletePermission } from '../hooks/useDeletePermission';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    phone_number: '',
    auth_provider: 'local',
    internal_user: false,
    user_type: '',
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
  
  // Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  
  // Bulk delete state
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  
  // Password reset confirmation modal state
  const [resetConfirmModalOpen, setResetConfirmModalOpen] = useState(false);
  const [resetActionType, setResetActionType] = useState(null);
  const [resetRequestToAction, setResetRequestToAction] = useState(null);
  
  // Temporary password display modal state
  const [tempPasswordModalOpen, setTempPasswordModalOpen] = useState(false);
  const [displayTempPassword, setDisplayTempPassword] = useState('');
  const [tempPasswordUsername, setTempPasswordUsername] = useState('');
  
  // Transfer ownership modal state
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [userWithDependencies, setUserWithDependencies] = useState(null);
  const [userDependencies, setUserDependencies] = useState(null);
  const [vendorContacts, setVendorContacts] = useState([]);
  
  // Field validation errors
  const [fieldErrors, setFieldErrors] = useState({});
  
  const { currentUser, hasPermission, hasRole } = useAuth();
  const { canDelete } = useDeletePermission('users');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const handlePageSizeChange = (e) => {
    setPageSize(parseInt(e.target.value));
    setCurrentPage(1);
  };
  
  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 2500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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
  }, [currentUser, navigate, currentPage, pageSize, debouncedSearchTerm]);
  
  const fetchData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', pageSize.toString());
      if (debouncedSearchTerm) params.append('search', debouncedSearchTerm);
      
      const response = await axios.get(`/api/users/init-data?${params}`);
      const data = response.data;
      
      setUsers(data.users || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.totalCount || 0);
      
      setRoles(data.roles || []);
      
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
  
  const handleApproveReset = async (requestId, username) => {
    try {
      const response = await axios.post(`/api/password-reset-requests/${requestId}/approve`, {
        notes: actionNotes
      });
      
      setTempPassword(response.data.tempPassword);
      setDisplayTempPassword(response.data.tempPassword);
      setTempPasswordUsername(username);
      setResetConfirmModalOpen(false);
      setTempPasswordModalOpen(true);
      
      await fetchResetRequests();
      fetchResetRequestsCount();
      setActionNotes('');
    } catch (error) {
      console.error('Error approving reset:', error);
      setError(error.response?.data?.error || 'Failed to approve password reset');
      setResetConfirmModalOpen(false);
    }
  };
  
  const handleDenyReset = async (requestId) => {
    try {
      await axios.post(`/api/password-reset-requests/${requestId}/deny`, {
        notes: actionNotes
      });
      
      setResetConfirmModalOpen(false);
      await fetchResetRequests();
      fetchResetRequestsCount();
      setActionNotes('');
    } catch (error) {
      console.error('Error denying reset:', error);
      setError(error.response?.data?.error || 'Failed to deny password reset');
      setResetConfirmModalOpen(false);
    }
  };
  
  const handleUnlockUser = async (userId) => {
    try {
      await axios.post(`/api/users/${userId}/unlock`);
      setError('');
      // Refresh the user list to show updated status
      fetchData();
    } catch (error) {
      console.error('Error unlocking user:', error);
      setError(error.response?.data?.error || 'Failed to unlock user account');
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
      internal_user: false,
      user_type: '',
      roles: []
    });
    setModalMode('create');
    setError('');
    setModalError('');
    setFieldErrors({});
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
      internal_user: user.internal_user || false,
      user_type: user.user_type || '',
      roles: user.roles || []
    });
    setModalMode('edit');
    setModalError('');
    setFieldErrors({});
    setModalOpen(true);
  };
  
  // Handle URL parameters for opening modals from vendor management pages
  useEffect(() => {
    if (loading) return;
    
    const action = searchParams.get('action');
    const role = searchParams.get('role');
    const userId = searchParams.get('userId');
    
    if (action === 'create' && role === 'vendor') {
      // Open create modal with Vendor role pre-selected
      setFormData({
        username: '',
        password: '',
        email: '',
        first_name: '',
        middle_name: '',
        last_name: '',
        phone_number: '',
        auth_provider: 'local',
        internal_user: false,
        user_type: 'Vendor',
        roles: ['Vendor']
      });
      setModalMode('create');
      setError('');
      setModalError('');
      setFieldErrors({});
      setModalOpen(true);
      
      // Clear URL parameters
      setSearchParams({});
    } else if (action === 'edit' && userId) {
      // Fetch the specific user by ID
      const fetchUserById = async () => {
        try {
          const response = await axios.get(`/api/users/${userId}`);
          const user = response.data;
          
          if (user) {
            openEditModal(user);
          } else {
            setError('User not found');
          }
        } catch (error) {
          console.error('Error fetching user:', error);
          setError('Failed to load user for editing');
        } finally {
          // Clear URL parameters regardless of outcome
          setSearchParams({});
        }
      };
      
      fetchUserById();
    }
  }, [loading, searchParams, setSearchParams]);
  
  const closeModal = () => {
    setModalOpen(false);
    setSelectedUser(null);
    setModalError('');
  };
  
  const validatePhone = (phone) => {
    if (!phone) return '';
    if (!/^\d*$/.test(phone)) {
      return 'Phone number can only contain numeric digits';
    }
    if (phone.length > 10) {
      return 'Phone number cannot exceed 10 digits';
    }
    return '';
  };

  const validateUsername = (username) => {
    if (!username || !username.trim()) {
      return 'Username is required';
    }
    if (username.length < 3) {
      return 'Username must be at least 3 characters';
    }
    if (username.length > 50) {
      return 'Username cannot exceed 50 characters';
    }
    return '';
  };

  const validateEmail = (email, checkRequired = false) => {
    if (!email) {
      return checkRequired ? 'Email is required' : '';
    }
    if (!email.includes('@')) {
      return 'Email must contain @';
    }
    if (!email.toLowerCase().endsWith('.com') && 
        !email.toLowerCase().endsWith('.org') && 
        !email.toLowerCase().endsWith('.net') && 
        !email.toLowerCase().endsWith('.edu') && 
        !email.toLowerCase().endsWith('.gov') &&
        !email.toLowerCase().includes('.')) {
      return 'Email must have a valid domain (e.g., .com)';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address';
    }
    return '';
  };

  const handleInputChange = (e) => {
    const { name, type, value, checked } = e.target;
    let newValue = type === 'checkbox' ? checked : value;
    
    // For phone_number, filter to only numeric digits
    if (name === 'phone_number') {
      newValue = value.replace(/\D/g, '').slice(0, 10);
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: newValue
    }));

    // Real-time validation
    if (name === 'phone_number') {
      const error = validatePhone(newValue);
      setFieldErrors(prev => ({ ...prev, phone_number: error }));
    } else if (name === 'email') {
      const error = validateEmail(newValue);
      setFieldErrors(prev => ({ ...prev, email: error }));
    } else if (name === 'username') {
      const error = validateUsername(newValue);
      setFieldErrors(prev => ({ ...prev, username: error }));
    }
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
    
    // Validate all fields
    const usernameError = modalMode === 'create' ? validateUsername(formData.username) : '';
    const phoneError = validatePhone(formData.phone_number);
    const emailError = validateEmail(formData.email, true);
    
    const newFieldErrors = {
      username: usernameError,
      phone_number: phoneError,
      email: emailError
    };
    
    setFieldErrors(newFieldErrors);
    
    // Check if any validation errors exist
    const hasErrors = Object.values(newFieldErrors).some(error => error !== '');
    if (hasErrors) {
      return; // Don't show generic error message, field-level errors are displayed
    }
    
    // Validate that at least one role is selected
    if (formData.roles.length === 0) {
      setFieldErrors(prev => ({ ...prev, roles: 'At least one role must be assigned' }));
      return;
    }
    
    try {
      if (modalMode === 'create') {
        await createUser(formData);
      } else {
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
      
      // Map backend validation errors to field-level errors
      if (error.response?.data) {
        const { message, errors, field } = error.response.data;
        
        // If backend returns field-specific errors, map them
        if (field) {
          setFieldErrors(prev => ({ ...prev, [field]: message }));
          return;
        }
        
        if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
          // Map error object to field errors
          setFieldErrors(prev => ({ ...prev, ...errors }));
          return;
        }
        
        // Check if message contains field-specific keywords
        const lowerMessage = (message || '').toLowerCase();
        if (lowerMessage.includes('phone')) {
          setFieldErrors(prev => ({ ...prev, phone_number: message }));
          return;
        } else if (lowerMessage.includes('email')) {
          setFieldErrors(prev => ({ ...prev, email: message }));
          return;
        } else if (lowerMessage.includes('username')) {
          setFieldErrors(prev => ({ ...prev, username: message }));
          return;
        } else if (lowerMessage.includes('password')) {
          setFieldErrors(prev => ({ ...prev, password: message }));
          return;
        }
        
        // Fallback to modal error for unrecognized backend errors
        setModalError(message || 'An error occurred while saving the user');
      } else {
        setModalError('An error occurred while saving the user');
      }
    }
  };
  
  // Fetch eligible replacement users based on the user being deleted
  const fetchEligibleReplacements = async (userId) => {
    try {
      const response = await axios.get(`/api/users/${userId}/eligible-replacements`);
      setVendorContacts(response.data.eligibleReplacements || []);
      return response.data;
    } catch (error) {
      console.error('Error fetching eligible replacements:', error);
      setVendorContacts([]);
      throw error;
    }
  };
  
  // Check user dependencies before delete
  const checkUserDependencies = async (userId) => {
    try {
      const response = await axios.get(`/api/users/${userId}/dependencies`);
      return response.data;
    } catch (error) {
      console.error('Error checking user dependencies:', error);
      throw error;
    }
  };
  
  const openDeleteModal = async (user) => {
    try {
      // Check if user has dependencies
      const dependencies = await checkUserDependencies(user.id);
      
      if (dependencies.hasDependencies) {
        // Fetch eligible replacement users for this specific user
        await fetchEligibleReplacements(user.id);
        
        // Show transfer modal instead
        setUserWithDependencies(user);
        setUserDependencies(dependencies);
        setTransferModalOpen(true);
      } else {
        // No dependencies, proceed with normal delete
        setUserToDelete(user);
        setDeleteModalOpen(true);
      }
    } catch (error) {
      console.error('Error checking dependencies:', error);
      setError('Failed to check user dependencies');
    }
  };
  
  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setUserToDelete(null);
  };
  
  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    
    if (!canDelete) {
      setError("You don't have permission to delete users");
      closeDeleteModal();
      return;
    }
    
    try {
      await deleteUser(userToDelete.id);
      closeDeleteModal();
      setSelectedUserIds(prev => prev.filter(id => id !== userToDelete.id));
      fetchData();
    } catch (error) {
      console.error('Error deleting user:', error);
      
      // Extract error message properly
      let errorMessage = 'Failed to delete user';
      if (error.response?.data) {
        if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      closeDeleteModal();
    }
  };
  
  // Transfer ownership modal handlers
  const closeTransferModal = () => {
    setTransferModalOpen(false);
    setUserWithDependencies(null);
    setUserDependencies(null);
  };
  
  const handleTransferAndDelete = async (fromUserId, toUserId) => {
    try {
      // Transfer ownership
      await axios.post(`/api/users/${fromUserId}/transfer-ownership`, {
        toUserId: toUserId
      });
      
      // Delete user after successful transfer
      await deleteUser(fromUserId);
      
      // Close modal and refresh
      closeTransferModal();
      setSelectedUserIds(prev => prev.filter(id => id !== fromUserId));
      fetchData();
    } catch (error) {
      console.error('Error transferring ownership:', error);
      throw error;
    }
  };
  
  // Bulk delete handlers
  const handleSelectAll = (e) => {
    if (!canDelete) return;
    if (e.target.checked) {
      const selectableUserIds = users
        .filter(user => user.id !== currentUser?.id)
        .map(user => user.id);
      setSelectedUserIds(selectableUserIds);
    } else {
      setSelectedUserIds([]);
    }
  };
  
  const handleSelectUser = (userId) => {
    setSelectedUserIds(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };
  
  const openBulkDeleteModal = async () => {
    if (selectedUserIds.length === 0) {
      setError('Please select at least one user to delete');
      return;
    }
    
    try {
      // Check if any selected users have dependencies
      const response = await axios.post('/api/users/bulk-dependencies', {
        userIds: selectedUserIds
      });
      
      if (response.data.usersWithDependencies.length > 0) {
        // Some users have dependencies
        const userList = response.data.usersWithDependencies
          .map(u => u.username)
          .join(', ');
        setError(
          `Cannot delete the following user(s) because they have associated assets: ${userList}. ` +
          `Please delete each user individually to transfer ownership.`
        );
        return;
      }
      
      // No dependencies, proceed with bulk delete
      setBulkDeleteModalOpen(true);
    } catch (error) {
      console.error('Error checking dependencies:', error);
      setError('Failed to check user dependencies');
    }
  };
  
  const closeBulkDeleteModal = () => {
    setBulkDeleteModalOpen(false);
  };
  
  const confirmBulkDelete = async () => {
    if (selectedUserIds.length === 0) return;
    
    if (!canDelete) {
      setError("You don't have permission to delete users");
      closeBulkDeleteModal();
      return;
    }
    
    try {
      const response = await axios.post('/api/users/bulk-delete', {
        userIds: selectedUserIds
      });
      
      const { results } = response.data;
      
      closeBulkDeleteModal();
      setSelectedUserIds([]);
      fetchData();
      
      if (results.failed.length > 0) {
        setError(`Deleted ${results.successful.length} user(s). ${results.failed.length} failed.`);
      } else {
        setError('');
      }
    } catch (error) {
      console.error('Error deleting users:', error);
      
      let errorMessage = 'Failed to delete users';
      if (error.response?.data) {
        if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      closeBulkDeleteModal();
    }
  };
  
  // Server-side search is now used - no client-side filtering needed
  // The search is passed to the API and handled by the backend

  return (
    <div className="gps-page-container">
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="gps-page-header">
            <div className="gps-page-header-left">
              <h1 className="gps-page-title">User Management</h1>
              <p className="gps-page-subtitle">Manage users and their roles</p>
            </div>
            <div className="gps-header-actions">
              <Link to="/roles" className="gps-btn gps-btn--secondary">
                Role Management
              </Link>
              {hasRole && hasRole('Admin') && (
                <button
                  onClick={handleOpenResetRequestsModal}
                  className="gps-btn gps-btn--secondary"
                >
                  Password Reset Requests
                  {pendingResetCount > 0 && (
                    <span className="gps-tab-count" style={{ marginLeft: '8px' }}>{pendingResetCount}</span>
                  )}
                </button>
              )}
              {canDelete && selectedUserIds.length > 0 && (
                <button 
                  className="gps-btn gps-btn--danger"
                  onClick={openBulkDeleteModal}
                >
                  Delete Selected ({selectedUserIds.length})
                </button>
              )}
              <button 
                className="gps-btn gps-btn--primary"
                onClick={openCreateModal}
              >
                Add New User
              </button>
            </div>
          </div>
          
          <div className="gps-filters">
            <div className="gps-search-container">
              <FiSearch className="gps-search-icon" />
              <input
                type="text"
                className="gps-search-input"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
          
          {error && (
            <div className="gps-alert gps-alert--error" role="alert">
              {error}
            </div>
          )}
      
      <div className="gps-table-container">
        <table className="gps-table">
          <thead>
            <tr>
              {canDelete && (
                <th style={{ width: '50px' }}>
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={selectedUserIds.length > 0 && selectedUserIds.length === users.filter(u => u.id !== currentUser?.id).length}
                  />
                </th>
              )}
              <th>Username</th>
              <th>Full Name</th>
              <th>Email</th>
              <th>Auth Provider</th>
              <th>Roles</th>
              <th>Account Status</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={canDelete ? 9 : 8} className="no-users-message">
                  {searchTerm ? 'No users found matching your search' : 'No users found'}
                </td>
              </tr>
            ) : (
              users.map(user => {
                const isLocked = user.locked_until && new Date(user.locked_until) > new Date();
                const failedAttempts = user.failed_login_attempts || 0;
                const isCurrentUser = user.id === currentUser?.id;
                
                return (
                  <tr key={user.id}>
                    {canDelete && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(user.id)}
                          onChange={() => handleSelectUser(user.id)}
                          disabled={isCurrentUser}
                        />
                      </td>
                    )}
                    <td>{user.username}</td>
                    <td>{user.full_name || '-'}</td>
                    <td>{user.email || '-'}</td>
                    <td>
                      <span className={`gps-badge ${user.auth_provider === 'okta' ? 'gps-badge--info' : 'gps-badge--secondary'}`}>
                        {user.auth_provider === 'okta' ? 'Okta SSO' : 'Local'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {user.roles && user.roles.length > 0 ? 
                          user.roles.map(role => (
                            <span key={role} className="gps-badge gps-badge--info">
                              {role}
                            </span>
                          )) : 
                          '-'
                        }
                      </div>
                    </td>
                    <td>
                      {isLocked ? (
                        <span className="gps-badge gps-badge--danger" title={`Locked until ${new Date(user.locked_until).toLocaleString()}`}>
                          Locked
                        </span>
                      ) : failedAttempts > 0 ? (
                        <span className="gps-badge gps-badge--warning" title={`${failedAttempts} failed login attempts`}>
                          {failedAttempts} Failed
                        </span>
                      ) : (
                        <span className="gps-badge gps-badge--success">Active</span>
                      )}
                    </td>
                    <td>{user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                    <td>
                      <div className="gps-action-buttons">
                        {isLocked && hasRole && hasRole('Admin') && (
                          <button 
                            className="gps-btn gps-btn--secondary gps-btn--sm" 
                            onClick={() => handleUnlockUser(user.id)}
                            title="Unlock this account"
                          >
                            Unlock
                          </button>
                        )}
                        <button 
                          className="gps-icon-btn gps-icon-btn--edit" 
                          onClick={() => openEditModal(user)}
                          title="Edit user"
                        >
                          <FiEdit2 />
                        </button>
                        
                        {canDelete && user.id !== currentUser?.id && (
                          <button 
                            className="gps-icon-btn gps-icon-btn--delete" 
                            onClick={() => openDeleteModal(user)}
                            title="Delete user"
                          >
                            <FiTrash2 />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
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
        pageSize={pageSize}
        onPageSizeChange={handlePageSizeChange}
      />
      
      {/* User Form Modal */}
      <ThreeSectionModal
        isOpen={modalOpen}
        onClose={closeModal}
        title={modalMode === 'create' ? 'Create New User' : 'Edit User'}
        size="medium"
        footer={
          <>
            <button type="button" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" form="user-form">
              {modalMode === 'create' ? 'Create User' : 'Update User'}
            </button>
          </>
        }
      >
        {modalError && (
          <div className="gps-alert gps-alert--error" role="alert" style={{ marginBottom: '16px' }}>
            {modalError}
          </div>
        )}
        
        <form id="user-form" onSubmit={handleSubmit}>
          <div className="form-section">
            <h3 className="section-title">ACCOUNT INFORMATION</h3>
            
            <div className="form-group">
              <label htmlFor="username">Username <span className="required-field">*</span></label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                disabled={modalMode === 'edit'}
                className={fieldErrors.username ? 'input-error' : ''}
                maxLength={50}
              />
              {fieldErrors.username && (
                <span className="field-error">{fieldErrors.username}</span>
              )}
            </div>
            
            {formData.auth_provider === 'local' && (
              <div className="form-group">
                <label htmlFor="password">
                  Password {modalMode === 'create' && <span className="required-field">*</span>}
                  {modalMode === 'edit' && <span style={{ fontWeight: 'normal', fontSize: '9px', color: '#666' }}> (leave blank to keep current)</span>}
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
          </div>
          
          <div className="form-section">
            <h3 className="section-title">PERSONAL INFORMATION</h3>
            
            <div className="form-row-grid">
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
            
            <div className="form-row-grid">
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
                  type="text"
                  inputMode="numeric"
                  id="phone_number"
                  name="phone_number"
                  value={formData.phone_number}
                  onChange={handleInputChange}
                  placeholder="1234567890"
                  maxLength={10}
                  className={fieldErrors.phone_number ? 'input-error' : ''}
                />
                <span className="gps-form-help">Numbers only, max 10 digits</span>
                {fieldErrors.phone_number && (
                  <span className="field-error">{fieldErrors.phone_number}</span>
                )}
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="email">Email <span className="required-field">*</span></label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={fieldErrors.email ? 'input-error' : ''}
                required
              />
              {fieldErrors.email && (
                <span className="field-error">{fieldErrors.email}</span>
              )}
            </div>
          </div>
          
          <div className="form-section">
            <h3 className="section-title">USER CLASSIFICATION</h3>
            
            <div className="form-row-grid">
              <div className="form-group">
                <label htmlFor="user_type">User Type</label>
                <select
                  id="user_type"
                  name="user_type"
                  value={formData.user_type}
                  onChange={handleInputChange}
                >
                  <option value="">Select Type</option>
                  <option value="FTE">FTE</option>
                  <option value="Consultant">Consultant</option>
                  <option value="Vendor">Vendor</option>
                </select>
              </div>
              
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '8px' }}>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    id="internal_user"
                    name="internal_user"
                    checked={formData.internal_user}
                    onChange={(e) => setFormData(prev => ({ ...prev, internal_user: e.target.checked }))}
                    disabled={formData.user_type === 'Vendor'}
                  />
                  <label htmlFor="internal_user" style={{ marginBottom: 0, cursor: 'pointer' }}>Internal User</label>
                </div>
              </div>
            </div>
          </div>
          
          <div className="form-section">
            <h3 className="section-title">ROLE ASSIGNMENT</h3>
            <small style={{ display: 'block', marginBottom: '12px', color: '#666', fontSize: '10px' }}>
              At least one role must be assigned to each user.
              {roles.length === 0 && (
                <span style={{ color: '#e53e3e', marginLeft: '8px' }}>
                  No roles available. Please <Link to="/roles" style={{ color: '#025043' }}>create roles</Link> first.
                </span>
              )}
            </small>
            <div className="user-roles-grid">
              {roles
                .filter(role => role.name !== 'Viewer')
                .map(role => (
                  <div key={role.id} className="user-role-checkbox" title={role.name}>
                    <input
                      type="checkbox"
                      id={`role-${role.id}`}
                      value={role.name}
                      checked={formData.roles.includes(role.name)}
                      onChange={handleRoleChange}
                    />
                    <label htmlFor={`role-${role.id}`} title={role.name}>{role.name}</label>
                  </div>
                ))}
            </div>
          </div>
        </form>
      </ThreeSectionModal>
      
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
                                  setResetRequestToAction(request);
                                  setResetActionType('approve');
                                  setResetConfirmModalOpen(true);
                                }}
                                className="btn-approve"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => {
                                  setResetRequestToAction(request);
                                  setResetActionType('deny');
                                  setResetConfirmModalOpen(true);
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
      
      {/* Delete User Confirmation Modal */}
      {deleteModalOpen && userToDelete && (
        <div className="gps-modal-overlay" onClick={closeDeleteModal}>
          <div className="gps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gps-modal-header">
              <h2 className="gps-modal-title">Delete User</h2>
              <button className="gps-modal-close" onClick={closeDeleteModal}>×</button>
            </div>
            <div className="gps-modal-body">
              <div className="gps-alert gps-alert--danger">
                Are you sure you want to delete the user <strong>{userToDelete.username}</strong>? This action cannot be undone.
              </div>
              <div style={{ marginTop: '16px' }}>
                {userToDelete.full_name && (
                  <p><strong>Full Name:</strong> {userToDelete.full_name}</p>
                )}
                {userToDelete.email && (
                  <p><strong>Email:</strong> {userToDelete.email}</p>
                )}
              </div>
            </div>
            <div className="gps-modal-footer">
              <button className="gps-btn gps-btn--secondary" onClick={closeDeleteModal}>
                Cancel
              </button>
              <button className="gps-btn gps-btn--danger" onClick={confirmDeleteUser}>
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteModalOpen && (
        <div className="gps-modal-overlay" onClick={closeBulkDeleteModal}>
          <div className="gps-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gps-modal-header">
              <h2 className="gps-modal-title">Delete Multiple Users</h2>
              <button className="gps-modal-close" onClick={closeBulkDeleteModal}>×</button>
            </div>
            <div className="gps-modal-body">
              <div className="gps-alert gps-alert--danger">
                Are you sure you want to delete <strong>{selectedUserIds.length}</strong> selected user(s)? This action cannot be undone.
              </div>
            </div>
            <div className="gps-modal-footer">
              <button className="gps-btn gps-btn--secondary" onClick={closeBulkDeleteModal}>
                Cancel
              </button>
              <button className="gps-btn gps-btn--danger" onClick={confirmBulkDelete}>
                Delete {selectedUserIds.length} User(s)
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Password Reset Confirmation Modal */}
      {resetConfirmModalOpen && resetRequestToAction && (
        <div className="modal-overlay">
          <div className="delete-confirmation-modal">
            <div className="modal-header">
              <h2>{resetActionType === 'approve' ? 'Approve Password Reset' : 'Deny Password Reset'}</h2>
              <button className="close-modal-btn" onClick={() => setResetConfirmModalOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="delete-warning-icon">
                {resetActionType === 'approve' ? '✓' : '✗'}
              </div>
              <p className="delete-confirmation-text">
                {resetActionType === 'approve' 
                  ? `Approve password reset for ${resetRequestToAction.username}?`
                  : `Deny password reset for ${resetRequestToAction.username}?`
                }
              </p>
              {resetRequestToAction.email && (
                <p className="user-detail">Email: {resetRequestToAction.email}</p>
              )}
              {resetActionType === 'approve' && (
                <p className="delete-warning-text">
                  This will generate a temporary password that the user must change on first login.
                </p>
              )}
            </div>
            
            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={() => setResetConfirmModalOpen(false)}>
                Cancel
              </button>
              <button 
                type="button" 
                className={resetActionType === 'approve' ? 'btn-approve' : 'delete-confirm-btn'} 
                onClick={() => {
                  if (resetActionType === 'approve') {
                    handleApproveReset(resetRequestToAction.id, resetRequestToAction.username);
                  } else {
                    handleDenyReset(resetRequestToAction.id);
                  }
                }}
              >
                {resetActionType === 'approve' ? 'Approve' : 'Deny'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Temporary Password Display Modal */}
      {tempPasswordModalOpen && (
        <div className="modal-overlay">
          <div className="delete-confirmation-modal">
            <div className="modal-header">
              <h2>Password Reset Approved</h2>
              <button className="close-modal-btn" onClick={() => setTempPasswordModalOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="delete-warning-icon">✓</div>
              <p className="delete-confirmation-text">
                Password reset approved for <strong>{tempPasswordUsername}</strong>
              </p>
              <div style={{
                margin: '20px 0',
                padding: '15px',
                backgroundColor: '#f0f9ff',
                border: '2px solid #3b82f6',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <p style={{ margin: '0 0 10px 0', fontWeight: '600', color: '#1e40af' }}>
                  Temporary Password:
                </p>
                <p style={{
                  margin: '0',
                  fontSize: '20px',
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  color: '#1e3a8a',
                  letterSpacing: '2px'
                }}>
                  {displayTempPassword}
                </p>
              </div>
              <p className="delete-warning-text">
                Please inform the user of this password. They must change it on first login.
              </p>
            </div>
            
            <div className="modal-actions">
              <button type="button" className="btn-approve" onClick={() => setTempPasswordModalOpen(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
      
      {/* Transfer Ownership Modal */}
      <TransferOwnershipModal
        isOpen={transferModalOpen}
        onClose={closeTransferModal}
        user={userWithDependencies}
        dependencies={userDependencies}
        vendorContacts={vendorContacts}
        onTransfer={handleTransferAndDelete}
      />
    </div>
  );
};

export default UserManagement;