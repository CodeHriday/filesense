import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { FaEdit } from 'react-icons/fa';
import { FiSearch } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import '../styles/RoleManagement.css';

const VendorRoleManagement = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
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
  
  const filteredRoles = roles.filter(role => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (role.name || '').toLowerCase().includes(searchLower) ||
      (role.description || '').toLowerCase().includes(searchLower)
    );
  });

  const totalPages = Math.ceil(filteredRoles.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentRoles = filteredRoles.slice(startIndex, endIndex);

  // Clamp currentPage when filtered results shrink
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    } else if (filteredRoles.length === 0 && currentPage > 1) {
      setCurrentPage(1);
    }
  }, [filteredRoles.length, currentPage, totalPages]);
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  return (
    <div className="role-management-container">
      <div className="role-management-header">
        <h1>Vendor Role Management</h1>
        <div style={{ position: 'relative', minWidth: '300px' }}>
          <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search vendor roles..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2.5rem',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '0.9rem',
              outline: 'none'
            }}
          />
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
            {filteredRoles.length === 0 ? (
              <tr>
                <td colSpan="3" className="no-roles-message">
                  {searchTerm ? 'No vendor roles found matching your search' : 'No vendor roles found'}
                </td>
              </tr>
            ) : (
              currentRoles.map(role => (
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
      
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={pageSize}
          totalItems={filteredRoles.length}
        />
      )}
      
      <div className="role-info" style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
        <p><strong>Note:</strong> Vendor roles define permissions for vendor users accessing the system. Contact system administrators to modify role permissions.</p>
      </div>
    </div>
  );
};

export default VendorRoleManagement;
