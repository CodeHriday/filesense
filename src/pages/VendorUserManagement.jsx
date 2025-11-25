import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { FiEdit2, FiSearch, FiUserPlus } from 'react-icons/fi';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import '../styles/global-page-styles.css';

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
    <div className="gps-page-container">
      <div className="gps-page-header">
        <div className="gps-page-header-left">
          <h1 className="gps-page-title">Vendor User Management</h1>
          <p className="gps-page-subtitle">Manage vendor user accounts and access</p>
        </div>
        <div className="gps-header-actions">
          <div className="gps-search-wrapper">
            <FiSearch className="gps-search-icon" />
            <input
              type="text"
              className="gps-search-input"
              placeholder="Search vendor users..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <button 
            className="gps-btn gps-btn--primary"
            onClick={handleCreateVendorUser}
            title="Create new vendor user"
          >
            <FiUserPlus /> Create Vendor User
          </button>
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
                <td colSpan="6" className="gps-table-empty">
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
                    <span className="gps-badge gps-badge--success">Active</span>
                  </td>
                  <td>
                    <div className="gps-action-buttons">
                      <button
                        className="gps-icon-btn gps-icon-btn--edit"
                        onClick={() => handleEditUser(user.id)}
                        title="Edit user"
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
          totalItems={filteredVendorUsers.length}
        />
      )}
    </div>
  );
};

export default VendorUserManagement;
