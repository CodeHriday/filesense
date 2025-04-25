/**
 * Main Layout Component
 * 
 * This component provides the main application layout with:
 * - Header
 * - Sidebar
 * - Main content area
 * - Footer
 */
import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useSidebar } from '../../hooks/useUI';
import { useAuth } from '../../hooks/useAuth';
import '../../styles/MainLayout.css';

// Header component with logo
const Header = () => (
  <header className="header-container">
    <div className="header-logo-container">
      <img src="/logo.svg" alt="DFO Logo" className="header-logo" />
      <div className="header-title">Data File Observatory</div>
    </div>
    <div className="header-actions">
      <button className="header-notification-btn">
        <span className="sr-only">Notifications</span>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </button>
      <button className="header-profile-btn">
        <span className="sr-only">User profile</span>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </button>
    </div>
  </header>
);

const Sidebar = ({ isOpen, isCollapsed }) => {
  // Get logout functionality from auth hook
  const { logout } = useAuth();
  
  return (
    <div
      className={`sidebar-container ${
        isOpen ? 'sidebar-visible' : 'sidebar-hidden'
      } ${isCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}
    >
      <div className="flex flex-col h-full">
        <div className="sidebar-header">
          {isCollapsed ? (
            <span className="sidebar-title-short">DFO</span>
          ) : (
            <span className="sidebar-title">Data File Observatory</span>
          )}
        </div>
        <nav className="sidebar-nav">
          <ul className="sidebar-menu">
            <li>
              <Link
                to="/dashboard"
                className="sidebar-link"
              >
                <svg className="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                {!isCollapsed && <span>Dashboard</span>}
              </Link>
            </li>
            <li>
              <Link
                to="/files"
                className="sidebar-link"
              >
                <svg className="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                {!isCollapsed && <span>Files</span>}
              </Link>
            </li>
            <li>
              <Link
                to="/processes"
                className="sidebar-link"
              >
                <svg className="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                {!isCollapsed && <span>Processes</span>}
              </Link>
            </li>
            <li>
              <Link
                to="/transformations"
                className="sidebar-link"
              >
                <svg className="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                {!isCollapsed && <span>Transformations</span>}
              </Link>
            </li>
            <li>
              <Link
                to="/settings"
                className="sidebar-link"
              >
                <svg className="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {!isCollapsed && <span>Settings</span>}
              </Link>
            </li>
          </ul>
        </nav>
        <div className="sidebar-footer">
          <Link
            to="/profile"
            className="sidebar-link"
          >
            <svg className="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {!isCollapsed && <span>Profile</span>}
          </Link>
          
          {/* Add logout button */}
          <button 
            onClick={() => logout()} 
            className="sidebar-link text-left w-full mt-2"
          >
            <svg className="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!isCollapsed && <span>Logout</span>}
          </button>
        </div>
      </div>
    </div>
  );
};

Sidebar.propTypes = {
  isOpen: PropTypes.bool,
  isCollapsed: PropTypes.bool,
};

const Footer = () => (
  <footer className="footer-container">
    <div className="footer-content">
      <div>© 2025 Data File Observatory</div>
      <div>Version 1.0.0</div>
    </div>
  </footer>
);

const MainLayout = () => {
  const sidebar = useSidebar();
  
  return (
    <div className="layout-container">
      {/* Sidebar */}
      <Sidebar isOpen={sidebar.isOpen} isCollapsed={sidebar.isCollapsed} />
      
      {/* Main Content */}
      <div className="main-content-wrapper">
        <Header />
        
        <main className="main-content-area">
          <Outlet />
        </main>
        
        <Footer />
      </div>
    </div>
  );
};

export default MainLayout;