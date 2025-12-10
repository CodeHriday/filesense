import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../config';
import { FaUser, FaCog, FaSignOutAlt, FaChartBar, FaLightbulb, FaUsers } from 'react-icons/fa';
import { FiHome } from 'react-icons/fi';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';
import './Header.css';

function Header({ showAIInsights }) {
  const { currentUser, logout, hasPermission } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if user is on dashboard page
  const isOnDashboard = location.pathname === '/' || location.pathname === '/dashboard';
  
  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };
  
  return (
    <header className="header">
      <div className="logo">
        <Link to="/">
          <img 
            src="/images/blumetra-logo.png" 
            alt="Blumetra" 
            className="header-logo"
            onError={(e) => {
              e.target.onerror = null;
              e.target.style.display = 'none';
            }}
          />
          <h1>Data File Observatory</h1>
        </Link>
      </div>
      <div className="header-actions">
        {currentUser && !isOnDashboard && (
          <button 
            className="header-home-btn" 
            onClick={() => navigate('/')}
            title="Go to Dashboard"
            aria-label="Go to Dashboard"
          >
            <FiHome />
          </button>
        )}
        <ThemeToggle />
        {currentUser && <NotificationBell />}
        
        {currentUser && (
          <div className="user-menu" ref={dropdownRef}>
            <button
              className="user-menu-btn"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-expanded={dropdownOpen}
              aria-haspopup="true"
              aria-label="User menu"
            >
              <FaUser />
              <span className="username">{currentUser.username}</span>
            </button>
            
            {dropdownOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-header">
                  <div className="user-info">
                    <strong>{currentUser.username}</strong>
                    <small>{currentUser.email || ''}</small>
                    <div className="user-roles">
                      {currentUser.roles && currentUser.roles.map(role => (
                        <span key={role} className="role-badge">{role}</span>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="dropdown-content">
                  <button className="dropdown-item" onClick={handleLogout}>
                    <FaSignOutAlt /> Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;