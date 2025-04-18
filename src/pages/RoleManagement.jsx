import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoles, createRole, updateRole, deleteRole, getPermissions } from '../api/authService';
import '../styles/RoleManagement.css';

const FeaturePermission = ({ feature, permissions, onChange }) => {
  const readPermission = permissions.find(p => p.feature === feature.name && p.action === 'read');
  const writePermission = permissions.find(p => p.feature === feature.name && p.action === 'write');

  return (
    <div className="feature-permission">
      <div className="feature-name">{feature.displayName}</div>
      <div className="permission-controls">
        <label>
          <input
            type="checkbox"
            checked={!!readPermission}
            onChange={() => onChange(feature.name, 'read', !readPermission)}
          />
          Read
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!writePermission}
            onChange={() => onChange(feature.name, 'write', !writePermission)}
          />
          Write
        </label>
      </div>
    </div>
  );
};

const RoleManagement = () => {
  const [roles, setRoles] = useState([]);
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [selectedRole, setSelectedRole] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: []
  });
  
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  // List of application features
  const applicationFeatures = [
    { name: 'dashboard', displayName: 'Dashboard' },
    { name: 'file_upload', displayName: 'File Upload' },
    { name: 'file_catalog', displayName: 'File Catalog' },
    { name: 'data_profile', displayName: 'Data Profile' },
    { name: 'quality_checks', displayName: 'Quality Checks' },
    { name: 'monitor', displayName: 'Monitoring' },
    { name: 'scheduler', displayName: 'Scheduler' },
    { name: 'insights', displayName: 'AI Insights' },
    { name: 'alerts', displayName: 'Alerts & Notifications' },
    { name: 'lineage', displayName: 'Data Lineage' },
    { name: 'user_management', displayName: 'User Management' },
    { name: 'role_management', displayName: 'Role Management' },
    { name: 'settings', displayName: 'System Settings' }
  ];

  // Check if user is logged in
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    
    fetchData();
  }, [currentUser, navigate]);
  
  const fetchData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const [rolesData, permissionsData] = await Promise.all([
        getRoles(),
        getPermissions()
      ]);
      
      setRoles(rolesData);
      setAvailablePermissions(permissionsData);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load role management data');
    } finally {
      setLoading(false);
    }
  };
  
  const openCreateModal = () => {
    setFormData({
      name: '',
      description: '',
      permissions: []
    });
    setModalMode('create');
    setModalOpen(true);
  };
  
  const openEditModal = (role) => {
    setSelectedRole(role);
    
    // Map role permissions to our internal format
    const rolePermissions = role.permissions.map(p => ({
      feature: p.resource,
      action: p.action,
      id: p.id
    }));
    
    setFormData({
      name: role.name,
      description: role.description || '',
      permissions: rolePermissions
    });
    setModalMode('edit');
    setModalOpen(true);
  };
  
  const closeModal = () => {
    setModalOpen(false);
    setSelectedRole(null);
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handlePermissionChange = (featureName, action, enabled) => {
    setFormData(prev => {
      let updatedPermissions = [...prev.permissions];
      
      if (enabled) {
        // Add permission if it doesn't exist
        if (!updatedPermissions.find(p => p.feature === featureName && p.action === action)) {
          updatedPermissions.push({
            feature: featureName,
            action: action
          });
        }
      } else {
        // Remove permission if it exists
        updatedPermissions = updatedPermissions.filter(
          p => !(p.feature === featureName && p.action === action)
        );
      }
      
      return {
        ...prev,
        permissions: updatedPermissions
      };
    });
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name) {
      setError('Role name is required');
      return;
    }
    
    try {
      // Convert permissions to the format expected by the API
      const apiPermissions = formData.permissions.map(p => ({
        resource: p.feature,
        action: p.action
      }));
      
      const submitData = {
        name: formData.name,
        description: formData.description,
        permissions: apiPermissions
      };
      
      if (modalMode === 'create') {
        await createRole(submitData);
      } else {
        await updateRole(selectedRole.id, submitData);
      }
      
      closeModal();
      fetchData();
    } catch (error) {
      console.error('Error saving role:', error);
      setError('Failed to save role: ' + (error.response?.data?.error || error.message));
    }
  };
  
  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Are you sure you want to delete this role? Users with this role will lose associated permissions.')) {
      return;
    }
    
    try {
      await deleteRole(roleId);
      fetchData();
    } catch (error) {
      console.error('Error deleting role:', error);
      setError('Failed to delete role: ' + (error.response?.data?.error || error.message));
    }
  };
  
  if (loading) {
    return <div className="role-management-loading">Loading role management...</div>;
  }
  
  return (
    <div className="role-management-container">
      <h1>Role Management</h1>
      
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      
      <div className="role-management-actions">
        <button 
          className="create-role-btn"
          onClick={openCreateModal}
        >
          Add New Role
        </button>
      </div>
      
      <div className="roles-table-container">
        <table className="roles-table">
          <thead>
            <tr>
              <th>Role Name</th>
              <th>Description</th>
              <th>Permissions</th>
              <th>Users</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 ? (
              <tr>
                <td colSpan="5" className="no-roles-message">No roles found</td>
              </tr>
            ) : (
              roles.map(role => (
                <tr key={role.id}>
                  <td>{role.name}</td>
                  <td>{role.description || '-'}</td>
                  <td>
                    <div className="permission-summary">
                      {role.permissions && role.permissions.length > 0 
                        ? `${role.permissions.length} permission(s)` 
                        : 'No permissions'
                      }
                    </div>
                  </td>
                  <td>{role.user_count || 0}</td>
                  <td>
                    <div className="role-actions">
                      <button 
                        className="edit-role-btn" 
                        onClick={() => openEditModal(role)}
                      >
                        Edit
                      </button>
                      
                      {/* Don't allow deleting the Admin role */}
                      {role.name !== 'Admin' && (
                        <button 
                          className="delete-role-btn" 
                          onClick={() => handleDeleteRole(role.id)}
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
      
      {/* Role Form Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="role-modal" role="dialog" aria-labelledby="role-modal-title">
            <div className="modal-header">
              <h2 id="role-modal-title">
                {modalMode === 'create' ? 'Create New Role' : 'Edit Role'}
              </h2>
              <button className="close-modal-btn" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="role-form">
              <div className="form-group">
                <label htmlFor="name">Role Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  disabled={modalMode === 'edit' && selectedRole?.name === 'Admin'} // Can't change Admin role name
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
                <label>Feature Permissions</label>
                <div className="permissions-grid">
                  {applicationFeatures.map(feature => (
                    <FeaturePermission
                      key={feature.name}
                      feature={feature}
                      permissions={formData.permissions}
                      onChange={handlePermissionChange}
                    />
                  ))}
                </div>
              </div>
              
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="save-btn">
                  {modalMode === 'create' ? 'Create Role' : 'Update Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;