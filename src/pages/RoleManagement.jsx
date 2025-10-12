import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoles, createRole, updateRole, deleteRole, getPermissions } from '../api/authService';
import LoadingSpinner from '../components/LoadingSpinner';
import '../styles/RoleManagement.css';
import axios from 'axios';
import { API_BASE_URL } from '../config';

// Define application features for permission assignment
const APP_FEATURES = [
  { id: 'dashboard', name: 'Dashboard', category: 'Core' },
  { id: 'file_upload', name: 'File Upload', category: 'Core' },
  { id: 'file_profile', name: 'Data Profile', category: 'Core' },
  { id: 'quality_checks', name: 'Quality Checks', category: 'Core' },
  { id: 'alerts', name: 'Alerts', category: 'Core' },
  { id: 'onboarding_wizard', name: 'Onboarding Wizard', category: 'Core' },
  { id: 'connections', name: 'Connections', category: 'Data Sources' },
  { id: 'mappings', name: 'Data Mappings', category: 'Data Sources' },
  { id: 'lineage', name: 'File Lineage', category: 'Data Sources' },
  { id: 'monitor', name: 'Monitor', category: 'Monitoring' },
  { id: 'scheduler', name: 'File Scheduler', category: 'Monitoring' },
  { id: 'badges', name: 'Achievement Badges', category: 'Insights' },
  { id: 'insights', name: 'AI Insights', category: 'Insights' },
  { id: 'recommendations', name: 'Recommendations', category: 'Insights' },
  { id: 'stories', name: 'Data Stories', category: 'Insights' },
  { id: 'settings', name: 'Dashboard Settings', category: 'Administration' },
  { id: 'users', name: 'User Management', category: 'Administration' },
  { id: 'roles', name: 'Role Management', category: 'Administration' }
];

// Group features by category
const FEATURE_CATEGORIES = APP_FEATURES.reduce((acc, feature) => {
  if (!acc[feature.category]) {
    acc[feature.category] = [];
  }
  acc[feature.category].push(feature);
  return acc;
}, {});

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
    permissions: {}
  });

  const { currentUser, hasPermission } = useAuth();
  const navigate = useNavigate();

  // Check if user has permission to manage roles
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    // For now, allow access to all logged-in users
    // Later we can add proper permission checking when the roles are set up
    // if (!hasPermission('role_view')) {
    //   navigate('/');
    //   return;
    // }

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

  // Initialize empty permissions object with all features
  const initializePermissions = () => {
    const permissions = {};
    APP_FEATURES.forEach(feature => {
      permissions[feature.id] = { read: false, write: false };
    });
    return permissions;
  };

  const openCreateModal = () => {
    setFormData({
      name: '',
      description: '',
      permissions: initializePermissions()
    });
    setModalMode('create');
    setModalOpen(true);
  };

  const openEditModal = (role) => {
    setSelectedRole(role);
    
    // Convert role.permissions array to our permissions object format
    const permissionsObj = initializePermissions();
    
    if (role.permissions && Array.isArray(role.permissions)) {
      role.permissions.forEach(perm => {
        const [featureId, action] = perm.split(':');
        if (permissionsObj[featureId] && (action === 'read' || action === 'write')) {
          permissionsObj[featureId][action] = true;
        }
      });
    }
    
    setFormData({
      name: role.name,
      description: role.description || '',
      permissions: permissionsObj
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

  const handlePermissionChange = (featureId, action, checked) => {
    setFormData(prev => {
      const updatedPermissions = {
        ...prev.permissions,
        [featureId]: {
          ...prev.permissions[featureId],
          [action]: checked
        }
      };
      
      // If write permission is checked, also check read permission
      if (action === 'write' && checked) {
        updatedPermissions[featureId].read = true;
        // Add visual feedback if needed
        const readCheckbox = document.getElementById(`${featureId}-read`);
        if (readCheckbox && !readCheckbox.checked) {
          readCheckbox.checked = true;
        }
      }
      
      // If read permission is unchecked, also uncheck write permission
      if (action === 'read' && !checked) {
        updatedPermissions[featureId].write = false;
      }
      
      return {
        ...prev,
        permissions: updatedPermissions
      };
    });
  };

  // Convert permissions object to array format for API
  const formatPermissionsForAPI = (permissions) => {
    const result = [];
    
    Object.entries(permissions).forEach(([featureId, actions]) => {
      if (actions.read) {
        result.push(`${featureId}:read`);
      }
      if (actions.write) {
        result.push(`${featureId}:write`);
      }
    });
    
    return result;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate role name
    if (!formData.name.trim()) {
      setError('Role name is required');
      return;
    }
    
    // Format data for API
    const roleData = {
      name: formData.name,
      description: formData.description,
      permissions: formatPermissionsForAPI(formData.permissions)
    };
    
    try {
      if (modalMode === 'create') {
        // Temporarily bypass permission checks
        // if (!hasPermission('role_create')) {
        //   setError("You don't have permission to create roles");
        //   return;
        // }
        
        await createRole(roleData);
      } else {
        // Temporarily bypass permission checks
        // if (!hasPermission('role_edit')) {
        //   setError("You don't have permission to edit roles");
        //   return;
        // }
        
        console.log(`Attempting to update role ${selectedRole.id} with data:`, roleData);
        
        try {
          // Try the service function first
          await updateRole(selectedRole.id, roleData);
        } catch (serviceError) {
          console.error('Service updateRole failed:', serviceError);
          
          // If that fails, try direct API call as fallback
          console.log('Attempting direct API call as fallback');
          const token = localStorage.getItem('token');
          const response = await axios.put(
            `${API_BASE_URL}/api/roles/${selectedRole.id}`, 
            roleData,
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              }
            }
          );
          console.log('Direct API call response:', response.data);
        }
      }
      
      closeModal();
      fetchData();
    } catch (error) {
      console.error('Error saving role:', error);
      setError('Failed to save role: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteRole = async (roleId, roleName) => {
    // Don't delete 'Admin' role
    if (roleName.toLowerCase() === 'admin') {
      setError("The Admin role cannot be deleted");
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete the role "${roleName}"?`)) {
      return;
    }
    
    try {
      // Temporarily bypass permission checks
      // if (!hasPermission('role_delete')) {
      //   setError("You don't have permission to delete roles");
      //   return;
      // }
      
      await deleteRole(roleId);
      fetchData();
    } catch (error) {
      console.error('Error deleting role:', error);
      setError('Failed to delete role: ' + (error.response?.data?.error || error.message));
    }
  };

  // Helper function to format permission display in the table
  const formatPermissionsDisplay = (permissions) => {
    if (!permissions || !Array.isArray(permissions)) {
      return [];
    }
    
    const permMap = {};
    
    permissions.forEach(perm => {
      const [featureId, action] = perm.split(':');
      if (!permMap[featureId]) {
        permMap[featureId] = { read: false, write: false };
      }
      if (action === 'read' || action === 'write') {
        permMap[featureId][action] = true;
      }
    });
    
    return Object.entries(permMap).map(([featureId, actions]) => {
      const feature = APP_FEATURES.find(f => f.id === featureId);
      return {
        id: featureId,
        name: feature ? feature.name : featureId,
        read: actions.read,
        write: actions.write
      };
    });
  };

  if (loading) {
    return (
      <div className="role-management-loading">
        <LoadingSpinner fullPage={true} />
      </div>
    );
  }

  return (
    <div className="role-management-container">
      <div className="role-management-header">
        <h1>Role Management</h1>
        <Link to="/users" className="user-management-link">
          User Management
        </Link>
      </div>
      
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
              roles.map(role => {
                const permissions = formatPermissionsDisplay(role.permissions);
                return (
                  <tr key={role.id}>
                    <td>{role.name}</td>
                    <td>{role.description || '-'}</td>
                    <td>
                      <div className="permission-tags">
                        {permissions.length > 0 ? 
                          permissions.slice(0, 3).map(perm => (
                            <div key={perm.id} className="permission-tag">
                              {perm.name} {perm.write ? '(Edit)' : '(View)'}
                            </div>
                          )) : 
                          '-'
                        }
                        {permissions.length > 3 && (
                          <div className="permission-tag">
                            +{permissions.length - 3} more
                          </div>
                        )}
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
                        {role.name.toLowerCase() !== 'admin' && (
                          <button 
                            className="delete-role-btn" 
                            onClick={() => handleDeleteRole(role.id, role.name)}
                          >
                            Delete
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
                <label htmlFor="name">Role Name <span className="required-field">*</span></label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  disabled={modalMode === 'edit' && formData.name.toLowerCase() === 'admin'}
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
                  placeholder="Describe the purpose of this role"
                />
              </div>
              
              <div className="permissions-section">
                <h3 className="permissions-title">Feature Permissions</h3>
                <p>Select which features this role can access and modify.</p>
                
                {Object.entries(FEATURE_CATEGORIES).map(([category, features]) => (
                  <div key={category} className="permission-category">
                    <div className="permissions-grid">
                      <div className="permission-header feature-name">{category}</div>
                      <div className="permission-header">View</div>
                      <div className="permission-header">Edit</div>
                      
                      <div className="section-divider"></div>
                      
                      {features.map(feature => (
                        <React.Fragment key={feature.id}>
                          <div className="feature-name">{feature.name}</div>
                          <div className="permission-checkbox">
                            <input
                              type="checkbox"
                              id={`${feature.id}-read`}
                              checked={formData.permissions[feature.id]?.read || false}
                              onChange={(e) => handlePermissionChange(feature.id, 'read', e.target.checked)}
                              aria-label={`View permission for ${feature.name}`}
                            />
                          </div>
                          <div className="permission-checkbox">
                            <input
                              type="checkbox"
                              id={`${feature.id}-write`}
                              checked={formData.permissions[feature.id]?.write || false}
                              onChange={(e) => handlePermissionChange(feature.id, 'write', e.target.checked)}
                              aria-label={`Edit permission for ${feature.name}`}
                              disabled={!formData.permissions[feature.id]?.read}
                            />
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="section-divider"></div>
                  </div>
                ))}
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