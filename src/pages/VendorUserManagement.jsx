import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { FiEdit2, FiSearch } from 'react-icons/fi';
import { FaUserPlus } from 'react-icons/fa';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import '../styles/UserManagement.css';

const VendorUserManagement = () => {
  const [vendorUsers, setVendorUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const { currentUser, hasPermission } = useAuth();
  const navigate = useNavigate();
  
  // Check if user has vendor_users:read permission
  const canAccessVendorUsers = hasPermission && hasPermission('vendor_users:read');
  
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    
    if (!canAccessVendorUsers) {
      navigate('/');
      return;
    }
    
    fetchVendorUsers();
  }, [currentUser, canAccessVendorUsers, navigate]);
  
  const fetchVendorUsers = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.get('/api/users/by-role/vendor');
      setVendorUsers(response.data || []);
    } catch (error) {
      console.error('Error fetching vendor users:', error);
      setError('Failed to load vendor users');
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreateVendorUser = () => {
    navigate('/users?action=create&role=vendor');
  };
  
  const handleEditUser = (userId) => {
    navigate(`/users?action=edit&userId=${userId}`);
  };
  
  const filteredVendorUsers = vendorUsers.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (user.username || '').toLowerCase().includes(searchLower) ||
      (user.email || '').toLowerCase().includes(searchLower) ||
      (user.full_name || '').toLowerCase().includes(searchLower) ||
      (user.first_name || '').toLowerCase().includes(searchLower) ||
      (user.last_name || '').toLowerCase().includes(searchLower) ||
      (user.phone_number || '').toLowerCase().includes(searchLower)
    );
  });

  const totalPages = Math.ceil(filteredVendorUsers.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentVendorUsers = filteredVendorUsers.slice(startIndex, endIndex);

  // Clamp currentPage when filtered results shrink
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    } else if (filteredVendorUsers.length === 0 && currentPage > 1) {
      setCurrentPage(1);
    }
  }, [filteredVendorUsers.length, currentPage, totalPages]);
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  return (
    <div className="user-management-container">
      <div className="user-management-header">
        <h1>Vendor User Management</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', minWidth: '300px' }}>
            <FiSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search vendor users..."
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
          <button 
            className="btn-primary"
            onClick={handleCreateVendorUser}
            title="Create new vendor user"
          >
            <FaUserPlus /> Create Vendor User
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
      
      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Full Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredVendorUsers.length === 0 ? (
              <tr>
                <td colSpan="6" className="no-users-message">
                  {searchTerm ? 'No vendor users found matching your search' : 'No vendor users found'}
                </td>
              </tr>
            ) : (
              currentVendorUsers.map(user => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.full_name || '-'}</td>
                  <td>{user.email}</td>
                  <td>{user.phone_number || '-'}</td>
                  <td>
                    <span className="status-badge status-active">Active</span>
                  </td>
                  <td>
                    <button
                      className="icon-button edit-button"
                      onClick={() => handleEditUser(user.id)}
                      title="Edit user"
                    >
                      <FiEdit2 />
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
          totalItems={filteredVendorUsers.length}
        />
      )}
    </div>
  );
};

export default VendorUserManagement;
