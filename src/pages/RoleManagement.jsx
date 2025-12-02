import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { FiEdit2, FiTrash2, FiSearch } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { getRoles, createRole, updateRole, deleteRole, getPermissions } from '../api/authService';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import ThreeSectionModal from '../components/ThreeSectionModal';
import '../styles/RoleManagement.css';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { APP_FEATURES, FEATURE_CATEGORIES } from '../config/appFeatures';

const RoleManagement = () => {
  const [roles, setRoles] = useState([]);
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [governanceTags, setGovernanceTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [selectedRole, setSelectedRole] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: {},
    tagPermissions: {}
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Expanded permissions state
  const [expandedRoles, setExpandedRoles] = useState({});
  
  // Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState(null);
  
  // Bulk delete state
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);

  const { currentUser, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const togglePermissionsExpand = (roleId) => {
    setExpandedRoles(prev => ({
      ...prev,
      [roleId]: !prev[roleId]
    }));
  };

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
  }, [currentUser, navigate, currentPage, pageSize]);

  const fetchData = async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const [rolesResponse, permissionsData, tagsResponse] = await Promise.all([
        getRoles(currentPage, pageSize),
        getPermissions(),
        axios.get('/api/governance-tags', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setRoles(rolesResponse.roles || rolesResponse);
      setTotalPages(rolesResponse.pagination?.totalPages || 1);
      setTotalCount(rolesResponse.pagination?.totalCount || 0);
      
      setAvailablePermissions(permissionsData);
      setGovernanceTags(tagsResponse.data || []);
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
      // Skip parent-only features (like vendor_management container)
      if (feature.isParentOnly) {
        return;
      }
      permissions[feature.id] = { 
        read: false, 
        write: false,
        execute: feature.supportsExecute ? false : undefined,
        approve: feature.supportsApprove ? false : undefined
      };
    });
    return permissions;
  };

  // Initialize empty tag permissions object
  const initializeTagPermissions = () => {
    const tagPerms = {};
    governanceTags.forEach(tag => {
      tagPerms[tag.tag_name.toLowerCase()] = { read: false, edit: false };
    });
    return tagPerms;
  };

  const openCreateModal = () => {
    setFormData({
      name: '',
      description: '',
      permissions: initializePermissions(),
      tagPermissions: initializeTagPermissions()
    });
    setModalMode('create');
    setModalOpen(true);
  };

  const openEditModal = (role) => {
    setSelectedRole(role);
    
    // Convert role.permissions array to our permissions object format
    const permissionsObj = initializePermissions();
    const tagPermsObj = initializeTagPermissions();
    
    if (role.permissions && Array.isArray(role.permissions)) {
      role.permissions.forEach(perm => {
        const parts = perm.split(':');
        
        // Handle tag permissions: "tag:tagType:action"
        if (parts.length === 3 && parts[0] === 'tag') {
          const [, tagType, action] = parts;
          const tagKey = tagType.toLowerCase();
          if (tagPermsObj[tagKey] && (action === 'read' || action === 'edit')) {
            tagPermsObj[tagKey][action] = true;
          }
        }
        // Handle regular permissions: "featureId:action"
        else if (parts.length === 2) {
          const [featureId, action] = parts;
          if (permissionsObj[featureId] && (action === 'read' || action === 'write' || action === 'execute' || action === 'approve')) {
            permissionsObj[featureId][action] = true;
          }
        }
      });
    }
    
    setFormData({
      name: role.name,
      description: role.description || '',
      permissions: permissionsObj,
      tagPermissions: tagPermsObj
    });
    
    setModalMode('edit');
    setModalOpen(true);
  };

  // Handle URL parameters for opening edit modal from vendor role management page
  useEffect(() => {
    if (loading) return;
    
    const action = searchParams.get('action');
    const roleId = searchParams.get('roleId');
    
    if (action === 'edit' && roleId) {
      // Fetch the specific role by ID
      const fetchRoleById = async () => {
        try {
          const response = await axios.get(`/api/users/roles/${roleId}`);
          const role = response.data;
          
          if (role) {
            openEditModal(role);
          } else {
            setError('Role not found');
          }
        } catch (error) {
          console.error('Error fetching role:', error);
          setError('Failed to load role for editing');
        } finally {
          // Clear URL parameters regardless of outcome
          setSearchParams({});
        }
      };
      
      fetchRoleById();
    }
  }, [loading, searchParams, setSearchParams]);

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
      
      // If execute permission is checked, also check read permission
      if (action === 'execute' && checked) {
        updatedPermissions[featureId].read = true;
        const readCheckbox = document.getElementById(`${featureId}-read`);
        if (readCheckbox && !readCheckbox.checked) {
          readCheckbox.checked = true;
        }
      }
      
      // If read permission is unchecked, also uncheck write and execute permissions
      if (action === 'read' && !checked) {
        updatedPermissions[featureId].write = false;
        if (updatedPermissions[featureId].execute !== undefined) {
          updatedPermissions[featureId].execute = false;
        }
      }
      
      return {
        ...prev,
        permissions: updatedPermissions
      };
    });
  };

  const handleTagPermissionChange = (tagType, action, checked) => {
    setFormData(prev => {
      const updatedTagPermissions = {
        ...prev.tagPermissions,
        [tagType]: {
          ...prev.tagPermissions[tagType],
          [action]: checked
        }
      };
      
      // If edit permission is checked, also check read permission
      if (action === 'edit' && checked) {
        updatedTagPermissions[tagType].read = true;
      }
      
      // If read permission is unchecked, also uncheck edit permission
      if (action === 'read' && !checked) {
        updatedTagPermissions[tagType].edit = false;
      }
      
      return {
        ...prev,
        tagPermissions: updatedTagPermissions
      };
    });
  };

  // Convert permissions object to array format for API
  const formatPermissionsForAPI = (permissions, tagPermissions) => {
    const result = [];
    
    // Add feature permissions
    Object.entries(permissions).forEach(([featureId, actions]) => {
      if (actions.read) {
        result.push(`${featureId}:read`);
      }
      if (actions.write) {
        result.push(`${featureId}:write`);
      }
      if (actions.execute) {
        result.push(`${featureId}:execute`);
      }
      if (actions.approve) {
        result.push(`${featureId}:approve`);
      }
    });
    
    // Add tag permissions in format "tag:tagType:action"
    Object.entries(tagPermissions || {}).forEach(([tagType, actions]) => {
      if (actions.read) {
        result.push(`tag:${tagType}:read`);
      }
      if (actions.edit) {
        result.push(`tag:${tagType}:edit`);
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
      permissions: formatPermissionsForAPI(formData.permissions, formData.tagPermissions)
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

  const openDeleteModal = (role) => {
    // Don't delete 'Admin' role
    if (role.name.toLowerCase() === 'admin') {
      setError("The Admin role cannot be deleted");
      return;
    }
    setRoleToDelete(role);
    setDeleteModalOpen(true);
  };
  
  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setRoleToDelete(null);
  };
  
  const confirmDeleteRole = async () => {
    if (!roleToDelete) return;
    
    try {
      // Temporarily bypass permission checks
      // if (!hasPermission('role_delete')) {
      //   setError("You don't have permission to delete roles");
      //   return;
      // }
      
      await deleteRole(roleToDelete.id);
      closeDeleteModal();
      fetchData();
    } catch (error) {
      console.error('Error deleting role:', error);
      setError('Failed to delete role: ' + (error.response?.data?.error || error.message));
    }
  };
  
  // Bulk delete handlers for roles
  const protectedRoleNames = ['Admin', 'User', 'Vendor', 'Governance Manager', 'Data Steward'];
  
  const handleSelectAllRoles = (e) => {
    if (e.target.checked) {
      const selectableRoleIds = filteredRoles
        .filter(role => !protectedRoleNames.includes(role.name))
        .map(role => role.id);
      setSelectedRoleIds(selectableRoleIds);
    } else {
      setSelectedRoleIds([]);
    }
  };
  
  const handleSelectRole = (roleId) => {
    setSelectedRoleIds(prev => {
      if (prev.includes(roleId)) {
        return prev.filter(id => id !== roleId);
      } else {
        return [...prev, roleId];
      }
    });
  };
  
  const openBulkDeleteModal = () => {
    if (selectedRoleIds.length === 0) {
      setError('Please select at least one role to delete');
      return;
    }
    setBulkDeleteModalOpen(true);
  };
  
  const closeBulkDeleteModal = () => {
    setBulkDeleteModalOpen(false);
  };
  
  const confirmBulkDeleteRoles = async () => {
    if (selectedRoleIds.length === 0) return;
    
    try {
      const response = await axios.post('/api/users/roles/bulk-delete', {
        roleIds: selectedRoleIds
      });
      
      const { results } = response.data;
      
      closeBulkDeleteModal();
      setSelectedRoleIds([]);
      fetchData();
      
      if (results.failed.length > 0) {
        setError(`Deleted ${results.successful.length} role(s). ${results.failed.length} failed.`);
      } else {
        setError('');
      }
    } catch (error) {
      console.error('Error deleting roles:', error);
      
      let errorMessage = 'Failed to delete roles';
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

  const filteredRoles = roles.filter(role => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (role.name || '').toLowerCase().includes(searchLower) ||
      (role.description || '').toLowerCase().includes(searchLower)
    );
  });

  // Clamp currentPage when filtered results are empty
  useEffect(() => {
    if (filteredRoles.length === 0 && currentPage > 1) {
      setCurrentPage(1);
    }
  }, [filteredRoles.length, currentPage]);

  if (loading) {
    return (
      <div className="gps-page-container">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Role Management</h1>
          <p className="gps-page-subtitle">Manage roles and permissions</p>
        </div>
        <div className="gps-header-actions">
          <Link to="/users" className="gps-btn gps-btn--secondary">
            User Management
          </Link>
          {selectedRoleIds.length > 0 && (
            <button 
              className="gps-btn gps-btn--danger"
              onClick={openBulkDeleteModal}
            >
              Delete Selected ({selectedRoleIds.length})
            </button>
          )}
          <button 
            className="gps-btn gps-btn--primary"
            onClick={openCreateModal}
          >
            Add New Role
          </button>
        </div>
      </div>
      
      <div className="gps-filters">
        <div className="gps-search-container">
          <FiSearch className="gps-search-icon" />
          <input
            type="text"
            className="gps-search-input"
            placeholder="Search roles..."
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
              <th style={{ width: '50px' }}>
                <input
                  type="checkbox"
                  onChange={handleSelectAllRoles}
                  checked={selectedRoleIds.length > 0 && selectedRoleIds.length === filteredRoles.filter(r => !protectedRoleNames.includes(r.name)).length}
                />
              </th>
              <th>Role Name</th>
              <th>Description</th>
              <th>Permissions</th>
              <th>Users</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoles.length === 0 ? (
              <tr>
                <td colSpan="6" className="no-roles-message">
                  {searchTerm ? 'No roles found matching your search' : 'No roles found'}
                </td>
              </tr>
            ) : (
              filteredRoles.map(role => {
                const permissions = formatPermissionsDisplay(role.permissions);
                const isExpanded = expandedRoles[role.id];
                const displayedPermissions = isExpanded ? permissions : permissions.slice(0, 3);
                const isProtected = protectedRoleNames.includes(role.name);
                
                return (
                  <tr key={role.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedRoleIds.includes(role.id)}
                        onChange={() => handleSelectRole(role.id)}
                        disabled={isProtected}
                      />
                    </td>
                    <td>{role.name}</td>
                    <td>{role.description || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {permissions.length > 0 ? 
                          displayedPermissions.map(perm => (
                            <span key={perm.id} className={`gps-badge ${perm.write ? 'gps-badge--success' : 'gps-badge--info'}`}>
                              {perm.name} {perm.write ? '(Edit)' : '(View)'}
                            </span>
                          )) : 
                          '-'
                        }
                        {permissions.length > 3 && (
                          <span 
                            className="gps-badge gps-badge--secondary"
                            onClick={() => togglePermissionsExpand(role.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            {isExpanded ? 'Show less' : `+${permissions.length - 3} more`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{role.user_count || 0}</td>
                    <td>
                      <div className="gps-action-buttons">
                        <button 
                          className="gps-icon-btn gps-icon-btn--edit" 
                          onClick={() => openEditModal(role)}
                          title="Edit role"
                        >
                          <FiEdit2 />
                        </button>
                        
                        {role.name.toLowerCase() !== 'admin' && (
                          <button 
                            className="gps-icon-btn gps-icon-btn--delete" 
                            onClick={() => openDeleteModal(role)}
                            title="Delete role"
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
      />
      
      {/* Role Form Modal */}
      <ThreeSectionModal
        isOpen={modalOpen}
        onClose={closeModal}
        title={modalMode === 'create' ? 'Create New Role' : 'Edit Role'}
        size="large"
        footer={
          <>
            <button type="button" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" form="role-form">
              {modalMode === 'create' ? 'Create Role' : 'Update Role'}
            </button>
          </>
        }
      >
        <form id="role-form" onSubmit={handleSubmit}>
          <div className="form-section">
            <h3 className="section-title">ROLE INFORMATION</h3>
            
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
                rows={3}
              />
            </div>
          </div>
          
          <div className="form-section">
            <h3 className="section-title">FEATURE PERMISSIONS</h3>
            <small style={{ display: 'block', marginBottom: '16px', color: '#666', fontSize: '10px' }}>
              Select which features this role can access and modify.
            </small>
            
            {Object.entries(FEATURE_CATEGORIES).map(([category, features]) => {
              const displayFeatures = features.filter(f => !f.isParentOnly);
              if (displayFeatures.length === 0) return null;
              
              const hasExecuteFeatures = displayFeatures.some(f => f.supportsExecute);
              const hasApproveFeatures = displayFeatures.some(f => f.supportsApprove);
              
              let gridClass = "permissions-grid";
              if (hasExecuteFeatures && hasApproveFeatures) {
                gridClass = "permissions-grid-with-execute-approve";
              } else if (hasExecuteFeatures) {
                gridClass = "permissions-grid-with-execute";
              } else if (hasApproveFeatures) {
                gridClass = "permissions-grid-with-approve";
              }
              
              return (
                <div key={category} className="permission-category">
                  <div className={gridClass}>
                    <div className="permission-header feature-name">{category}</div>
                    <div className="permission-header">View</div>
                    <div className="permission-header">Edit</div>
                    {hasExecuteFeatures && <div className="permission-header">Execute</div>}
                    {hasApproveFeatures && <div className="permission-header">Approve</div>}
                    
                    <div className="section-divider"></div>
                    
                    {displayFeatures.map(feature => (
                      <React.Fragment key={feature.id}>
                        <div className={`feature-name ${feature.isNested || feature.isVendorSubmodule ? 'nested-feature' : ''}`}>
                          {(feature.isNested || feature.isVendorSubmodule) && <span className="nested-indicator">↳ </span>}
                          {feature.name}
                        </div>
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
                        {hasExecuteFeatures && (
                          <div className="permission-checkbox">
                            {feature.supportsExecute ? (
                              <input
                                type="checkbox"
                                id={`${feature.id}-execute`}
                                checked={formData.permissions[feature.id]?.execute || false}
                                onChange={(e) => handlePermissionChange(feature.id, 'execute', e.target.checked)}
                                aria-label={`Execute permission for ${feature.name}`}
                                disabled={!formData.permissions[feature.id]?.read}
                              />
                            ) : (
                              <span className="permission-na">-</span>
                            )}
                          </div>
                        )}
                        {hasApproveFeatures && (
                          <div className="permission-checkbox">
                            {feature.supportsApprove ? (
                              <input
                                type="checkbox"
                                id={`${feature.id}-approve`}
                                checked={formData.permissions[feature.id]?.approve || false}
                                onChange={(e) => handlePermissionChange(feature.id, 'approve', e.target.checked)}
                                aria-label={`Approve permission for ${feature.name}`}
                                disabled={!formData.permissions[feature.id]?.read}
                              />
                            ) : (
                              <span className="permission-na">-</span>
                            )}
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="section-divider"></div>
                </div>
              );
            })}
          </div>
          
          {/* Tag Permissions Section */}
          {governanceTags.length > 0 && (
            <div className="form-section">
              <h3 className="section-title">DATA GOVERNANCE TAG PERMISSIONS</h3>
              <small style={{ display: 'block', marginBottom: '16px', color: '#666', fontSize: '10px' }}>
                Control access to columns tagged with sensitive data classifications.
              </small>
              
              <div className="permission-category">
                <div className="permissions-grid">
                  <div className="permission-header feature-name">Tag</div>
                  <div className="permission-header">View</div>
                  <div className="permission-header">Edit</div>
                  
                  <div className="section-divider"></div>
                  
                  {governanceTags.map(tag => {
                    const tagKey = tag.tag_name.toLowerCase();
                    return (
                      <React.Fragment key={tag.tag_id}>
                        <div className="feature-name">
                          <span 
                            className="tag-badge-inline" 
                            style={{ backgroundColor: tag.color || '#3B82F6' }}
                          >
                            {tag.tag_name}
                          </span>
                          {tag.sensitivity_level && (
                            <span className="tag-sensitivity-hint">
                              ({tag.sensitivity_level})
                            </span>
                          )}
                        </div>
                        <div className="permission-checkbox">
                          <input
                            type="checkbox"
                            id={`tag-${tagKey}-read`}
                            checked={formData.tagPermissions?.[tagKey]?.read || false}
                            onChange={(e) => handleTagPermissionChange(tagKey, 'read', e.target.checked)}
                            aria-label={`View permission for ${tag.tag_name} tagged data`}
                          />
                        </div>
                        <div className="permission-checkbox">
                          <input
                            type="checkbox"
                            id={`tag-${tagKey}-edit`}
                            checked={formData.tagPermissions?.[tagKey]?.edit || false}
                            onChange={(e) => handleTagPermissionChange(tagKey, 'edit', e.target.checked)}
                            aria-label={`Edit permission for ${tag.tag_name} tagged data`}
                            disabled={!formData.tagPermissions?.[tagKey]?.read}
                          />
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </form>
      </ThreeSectionModal>
      
      {/* Delete Role Confirmation Modal */}
      {deleteModalOpen && roleToDelete && (
        <div className="modal-overlay">
          <div className="delete-confirmation-modal">
            <div className="modal-header">
              <h2>Delete Role</h2>
              <button className="close-modal-btn" onClick={closeDeleteModal} aria-label="Close">
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="delete-warning-icon">⚠️</div>
              <p className="delete-confirmation-text">
                Are you sure you want to delete the role <strong>{roleToDelete.name}</strong>?
              </p>
              {roleToDelete.description && (
                <p className="user-detail">Description: {roleToDelete.description}</p>
              )}
              {roleToDelete.user_count !== undefined && (
                <p className="user-detail">Users with this role: {roleToDelete.user_count}</p>
              )}
              <p className="delete-warning-text">
                This action cannot be undone.
              </p>
            </div>
            
            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={closeDeleteModal}>
                Cancel
              </button>
              <button type="button" className="delete-confirm-btn" onClick={confirmDeleteRole}>
                Delete Role
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Bulk Delete Roles Confirmation Modal */}
      {bulkDeleteModalOpen && (
        <div className="modal-overlay">
          <div className="delete-confirmation-modal">
            <div className="modal-header">
              <h2>Delete Multiple Roles</h2>
              <button className="close-modal-btn" onClick={closeBulkDeleteModal} aria-label="Close">
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="delete-warning-icon">⚠️</div>
              <p className="delete-confirmation-text">
                Are you sure you want to delete <strong>{selectedRoleIds.length}</strong> selected role(s)?
              </p>
              <p className="delete-warning-text">
                This action cannot be undone.
              </p>
            </div>
            
            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={closeBulkDeleteModal}>
                Cancel
              </button>
              <button type="button" className="delete-confirm-btn" onClick={confirmBulkDeleteRoles}>
                Delete {selectedRoleIds.length} Role(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;