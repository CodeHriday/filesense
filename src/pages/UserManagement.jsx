import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAllUsers, getRoles, createUser, updateUser, deleteUser } from '../api/authService';
import '../styles/UserManagement.css';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    fullName: '',
    roles: []
  });
  
  const { currentUser, hasPermission } = useAuth();
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
  }, [currentUser, navigate]);
  
  const fetchData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const [usersData, rolesData] = await Promise.all([
        getAllUsers(),
        getRoles()
      ]);
      
      setUsers(usersData);
      setRoles(rolesData);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load user management data');
    } finally {
      setLoading(false);
    }
  };
  
  const openCreateModal = () => {
    setFormData({
      username: '',
      password: '',
      email: '',
      fullName: '',
      roles: []
    });
    setModalMode('create');
    setModalOpen(true);
  };
  
  const openEditModal = (user) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      password: '', // Don't prefill password for security reasons
      email: user.email || '',
      fullName: user.full_name || '',
      roles: user.roles || []
    });
    setModalMode('edit');
    setModalOpen(true);
  };
  
  const closeModal = () => {
    setModalOpen(false);
    setSelectedUser(null);
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
    } catch (error) {
      console.error('Error saving user:', error);
      setError('Failed to save user: ' + (error.response?.data?.error || error.message));
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
  
  if (loading) {
    return <div className="user-management-loading">Loading user management...</div>;
  }
  
  return (
    <div className="user-management-container">
      <h1>User Management</h1>
      
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      
      <div className="user-management-actions">
        {/* Temporarily enable Add New User button for all users */}
      <button 
        className="create-user-btn"
        onClick={openCreateModal}
      >
        Add New User
      </button>
      </div>
      
      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Full Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="6" className="no-users-message">No users found</td>
              </tr>
            ) : (
              users.map(user => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.full_name || '-'}</td>
                  <td>{user.email || '-'}</td>
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
            
            <form onSubmit={handleSubmit} className="user-form">
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  disabled={modalMode === 'edit'} // Can't change username in edit mode
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="password">
                  Password {modalMode === 'edit' && '(leave blank to keep current)'}
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required={modalMode === 'create'}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="fullName">Full Name</label>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                />
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
                <label>Roles</label>
                <div className="roles-checkboxes">
                  {roles.map(role => (
                    <div key={role.id} className="role-checkbox">
                      <input
                        type="checkbox"
                        id={`role-${role.id}`}
                        value={role.name}
                        checked={formData.roles.includes(role.name)}
                        onChange={handleRoleChange}
                      />
                      <label htmlFor={`role-${role.id}`}>
                        {role.name}
                      </label>
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
    </div>
  );
};

export default UserManagement;