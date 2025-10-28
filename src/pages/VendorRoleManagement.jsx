import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { FaEdit } from 'react-icons/fa';
import LoadingSpinner from '../components/LoadingSpinner';
import '../styles/RoleManagement.css';

const VendorRoleManagement = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  const { currentUser, hasPermission } = useAuth();
  const navigate = useNavigate();
  
  // Check if user has vendor_roles:read permission
  const canAccessVendorRoles = hasPermission && hasPermission('vendor_roles:read');
  
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    
    if (!canAccessVendorRoles) {
      navigate('/');
      return;
    }
    
    fetchRoles();
  }, [currentUser, canAccessVendorRoles, navigate]);
  
  const fetchRoles = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.get('/api/users/roles');
      // Filter to show vendor-related roles
      const vendorRoles = response.data.filter(role => 
        role.name.toLowerCase().includes('vendor') || role.name === 'Vendor'
      );
      setRoles(vendorRoles);
    } catch (error) {
      console.error('Error fetching roles:', error);
      setError('Failed to load vendor roles');
    } finally {
      setLoading(false);
    }
  };
  
  const handleEditRole = (roleId) => {
    navigate(`/roles?action=edit&roleId=${roleId}`);
  };
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  return (
    <div className="role-management-container">
      <div className="role-management-header">
        <h1>Vendor Role Management</h1>
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
      
      <div className="roles-table-container">
        <table className="roles-table">
          <thead>
            <tr>
              <th>Role Name</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 ? (
              <tr>
                <td colSpan="3" className="no-roles-message">No vendor roles found</td>
              </tr>
            ) : (
              roles.map(role => (
                <tr key={role.id}>
                  <td>{role.name}</td>
                  <td>{role.description || '-'}</td>
                  <td>
                    <button
                      className="icon-button edit-button"
                      onClick={() => handleEditRole(role.id)}
                      title="Edit role"
                    >
                      <FaEdit />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      <div className="role-info" style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
        <p><strong>Note:</strong> Vendor roles define permissions for vendor users accessing the system. Contact system administrators to modify role permissions.</p>
      </div>
    </div>
  );
};

export default VendorRoleManagement;
