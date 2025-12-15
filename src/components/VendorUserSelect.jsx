import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './VendorUserSelect.css';
import PropTypes from 'prop-types';


const VendorUserSelect = ({ 
  value, 
  onChange, 
  placeholder = 'Select contact',
  disabled = false,
  required = false,
  name = 'vendor_user',
  filterByVendorId = null
}) => {
  const [vendorUsers, setVendorUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetchVendorUsers();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const fetchVendorUsers = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.get('/api/users/by-role/vendor');
      setVendorUsers(response.data || []);
    } catch (err) {
      console.error('Error fetching vendor users:', err);
      setError('Failed to load vendor users');
      setVendorUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const getSelectedUser = () => {
    if (!value) return null;
    
    // Check if value is a vendor user object or just an ID
    if (typeof value === 'object') {
      return value;
    }
    
    // Find user by ID
    return vendorUsers.find(user => user.id === value);
  };

  const getDisplayText = () => {
    const selectedUser = getSelectedUser();
    if (selectedUser) {
      const displayName = selectedUser.full_name || selectedUser.username;
      return `${displayName}${selectedUser.email ? ` (${selectedUser.email})` : ''}`;
    }
    return value || '';
  };

  const filteredUsers = vendorUsers.filter(user => {
    // Filter by vendor_id if provided
    if (filterByVendorId) {
      const filterVendorId = parseInt(filterByVendorId, 10);
      const userVendorId = parseInt(user.vendor_id, 10);
      
      if (userVendorId !== filterVendorId) {
        return false;
      }
    }
    
    // Filter by search term
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      user.username?.toLowerCase().includes(searchLower) ||
      user.full_name?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.phone_number?.toLowerCase().includes(searchLower)
    );
  });

  const handleSelect = (user) => {
    onChange({
      target: {
        name,
        value: user.id,
        vendorUser: user
      }
    });
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange({
      target: {
        name,
        value: '',
        vendorUser: null
      }
    });
  };

  return (
    <div className="vendor-user-select" ref={dropdownRef}>
      <div 
        className={`vendor-user-input-wrapper ${disabled ? 'disabled' : ''} ${isOpen ? 'open' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <input
          type="text"
          className="vendor-user-input"
          value={isOpen ? searchTerm : getDisplayText()}
          onChange={(e) => setSearchTerm(e.target.value)}
          onClick={(e) => {
            if (!disabled) {
              e.stopPropagation();
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          readOnly={!isOpen}
        />
        
        {value && !disabled && (
          <button
            type="button"
            className="clear-button"
            onClick={handleClear}
            title="Clear selection"
          >
            ×
          </button>
        )}
        
        <span className={`dropdown-arrow ${isOpen ? 'open' : ''}`}>▼</span>
      </div>

      {isOpen && (
        <div className="vendor-user-dropdown">
          {loading ? (
            <div className="dropdown-message">Loading...</div>
          ) : error ? (
            <div className="dropdown-message error">{error}</div>
          ) : filteredUsers.length === 0 ? (
            <div className="dropdown-message">
              {searchTerm ? 'No users match your search' : 'No vendor users found'}
            </div>
          ) : (
            <div className="vendor-user-list">
              {filteredUsers.map(user => (
                <div
                  key={user.id}
                  className={`vendor-user-item ${value === user.id ? 'selected' : ''}`}
                  onClick={() => handleSelect(user)}
                >
                  <div className="user-name">{user.full_name || user.username}</div>
                  <div className="user-details">
                    {user.email && <span className="user-email">{user.email}</span>}
                    {user.phone_number && <span className="user-phone">{user.phone_number}</span>}
                  </div>
                  {user.username && (
                    <div className="user-designation">@{user.username}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
VendorUserSelect.propTypes = {
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
    PropTypes.object
  ]),

  onChange: PropTypes.func.isRequired,

  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
  required: PropTypes.bool,
  name: PropTypes.string,

  filterByVendorId: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ])
};

export default VendorUserSelect;
