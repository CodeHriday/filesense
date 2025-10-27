import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import '../styles/UserManagement.css';

const VendorUserManagement = () => {
  const [vendorUsers, setVendorUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  // Check if user has Admin role
  const isAdmin = currentUser?.roles?.includes('Admin') || currentUser?.role_id === 1;
  
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    
    if (!isAdmin) {
      navigate('/');
      return;
    }
    
    fetchVendorUsers();
  }, [currentUser, isAdmin, navigate]);
  
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
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  return (
    <div className="user-management-container">
      <div className="user-management-header">
        <h1>Vendor User Management</h1>
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
            </tr>
          </thead>
          <tbody>
            {vendorUsers.length === 0 ? (
              <tr>
                <td colSpan="5" className="no-users-message">No vendor users found</td>
              </tr>
            ) : (
              vendorUsers.map(user => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.full_name || '-'}</td>
                  <td>{user.email}</td>
                  <td>{user.phone_number || '-'}</td>
                  <td>
                    <span className="status-badge status-active">Active</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VendorUserManagement;
