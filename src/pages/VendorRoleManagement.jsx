import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { FiEdit2, FiSearch } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import '../styles/global-page-styles.css';

const VendorRoleManagement = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const { currentUser, hasPermission } = useAuth();
  const navigate = useNavigate();
  
  const canAccessVendorRoles = hasPermission && hasPermission('vendor_roles:read');
  
  // Debounce search term (2.5 seconds)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 2500);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  
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
    const searchLower = debouncedSearchTerm.toLowerCase();
    return (
      (role.name || '').toLowerCase().includes(searchLower) ||
      (role.description || '').toLowerCase().includes(searchLower)
    );
  });

  const totalPages = Math.ceil(filteredRoles.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentRoles = filteredRoles.slice(startIndex, endIndex);

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
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Vendor Role Management</h1>
          <p className="gps-page-subtitle">Manage vendor-specific roles and permissions</p>
        </div>
        <div className="gps-header-actions">
          <div className="gps-search-wrapper">
            <FiSearch className="gps-search-icon" />
            <input
              type="text"
              className="gps-search-input"
              placeholder="Search vendor roles..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
      </div>
      
      {error && (
        <div className="gps-alert gps-alert--error" role="alert">
          {error}
        </div>
      )}
      
      {successMessage && (
        <div className="gps-alert gps-alert--success" role="alert">
          {successMessage}
        </div>
      )}
      
      <div className="gps-table-container">
        <table className="gps-table">
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
                <td colSpan="3" className="gps-table-empty">
                  {searchTerm ? 'No vendor roles found matching your search' : 'No vendor roles found'}
                </td>
              </tr>
            ) : (
              currentRoles.map(role => (
                <tr key={role.id}>
                  <td>{role.name}</td>
                  <td>{role.description || '-'}</td>
                  <td>
                    <div className="gps-action-buttons">
                      <button
                        className="gps-icon-btn gps-icon-btn--edit"
                        onClick={() => handleEditRole(role.id)}
                        title="Edit role"
                      >
                        <FiEdit2 />
                      </button>
                    </div>
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
      
      <div className="gps-info-box">
        <p><strong>Note:</strong> Vendor roles define permissions for vendor users accessing the system. Contact system administrators to modify role permissions.</p>
      </div>
    </div>
  );
};

export default VendorRoleManagement;
