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
import { Outlet } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useSidebar } from '../../hooks/useUI';

// Placeholder components to be implemented later
const Header = () => (
  <header className="bg-white border-b border-gray-200 h-16 flex items-center px-4 justify-between">
    <div className="flex items-center">
      <div className="text-xl font-bold text-blue-600">Data File Observatory</div>
    </div>
    <div className="flex items-center space-x-4">
      <button className="p-2 rounded hover:bg-gray-100">
        <span className="sr-only">Notifications</span>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </button>
      <button className="p-2 rounded-full bg-gray-200">
        <span className="sr-only">User profile</span>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </button>
    </div>
  </header>
);

const Sidebar = ({ isOpen, isCollapsed }) => (
  <div
    className={`bg-gray-800 text-white transition-all duration-300 ${
      isOpen ? 'block' : 'hidden'
    } ${isCollapsed ? 'w-16' : 'w-64'}`}
  >
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-700">
        {isCollapsed ? (
          <span className="text-2xl font-bold">DFO</span>
        ) : (
          <span className="text-xl font-bold">Data File Observatory</span>
        )}
      </div>
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          <li>
            <a
              href="/dashboard"
              className="flex items-center p-2 rounded hover:bg-gray-700"
            >
              <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              {!isCollapsed && <span>Dashboard</span>}
            </a>
          </li>
          <li>
            <a
              href="/files"
              className="flex items-center p-2 rounded hover:bg-gray-700"
            >
              <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              {!isCollapsed && <span>Files</span>}
            </a>
          </li>
          <li>
            <a
              href="/processes"
              className="flex items-center p-2 rounded hover:bg-gray-700"
            >
              <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              {!isCollapsed && <span>Processes</span>}
            </a>
          </li>
          <li>
            <a
              href="/transformations"
              className="flex items-center p-2 rounded hover:bg-gray-700"
            >
              <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              {!isCollapsed && <span>Transformations</span>}
            </a>
          </li>
          <li>
            <a
              href="/settings"
              className="flex items-center p-2 rounded hover:bg-gray-700"
            >
              <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {!isCollapsed && <span>Settings</span>}
            </a>
          </li>
        </ul>
      </nav>
      <div className="p-4 border-t border-gray-700">
        <a
          href="/profile"
          className="flex items-center p-2 rounded hover:bg-gray-700"
        >
          <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          {!isCollapsed && <span>Profile</span>}
        </a>
      </div>
    </div>
  </div>
);

Sidebar.propTypes = {
  isOpen: PropTypes.bool,
  isCollapsed: PropTypes.bool,
};

const Footer = () => (
  <footer className="bg-white border-t border-gray-200 p-4 text-sm text-gray-600">
    <div className="flex justify-between items-center">
      <div>© 2025 Data File Observatory</div>
      <div>Version 1.0.0</div>
    </div>
  </footer>
);

const MainLayout = () => {
  const sidebar = useSidebar();
  
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar isOpen={sidebar.isOpen} isCollapsed={sidebar.isCollapsed} />
      
      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
        
        <Footer />
      </div>
    </div>
  );
};

export default MainLayout;