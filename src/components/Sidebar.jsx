import React, { useState } from 'react';
import './Sidebar.css';

export const Sidebar = ({ activePage, onNavigate }) => {
  const [expanded, setExpanded] = useState(true);
  
  const toggleSidebar = () => {
    setExpanded(!expanded);
  };
  
  const handleNavigation = (page) => {
    onNavigate && onNavigate(page);
  };
  
  return (
    <div className={`sidebar ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="sidebar-toggle" onClick={toggleSidebar}>
        {expanded ? '◀' : '▶'}
      </div>
      
      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li 
            className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleNavigation('dashboard')}
          >
            <span className="nav-icon">📈</span>
            {expanded && <span className="nav-text">Dashboard</span>}
          </li>
          
          <li 
            className={`nav-item ${activePage === 'upload' ? 'active' : ''}`}
            onClick={() => handleNavigation('upload')}
          >
            <span className="nav-icon">📤</span>
            {expanded && <span className="nav-text">File Upload</span>}
          </li>
          
          <li 
            className={`nav-item ${activePage === 'profile' ? 'active' : ''}`}
            onClick={() => handleNavigation('profile')}
          >
            <span className="nav-icon">📋</span>
            {expanded && <span className="nav-text">Data Profile</span>}
          </li>
          
          <li 
            className={`nav-item ${activePage === 'quality' ? 'active' : ''}`}
            onClick={() => handleNavigation('quality')}
          >
            <span className="nav-icon">✓</span>
            {expanded && <span className="nav-text">Quality Checks</span>}
          </li>
          
          <li 
            className={`nav-item ${activePage === 'alerts' ? 'active' : ''}`}
            onClick={() => handleNavigation('alerts')}
          >
            <span className="nav-icon">🔔</span>
            {expanded && <span className="nav-text">Alerts</span>}
          </li>
          
          <li 
            className={`nav-item ${activePage === 'catalog' ? 'active' : ''}`}
            onClick={() => handleNavigation('catalog')}
          >
            <span className="nav-icon">📚</span>
            {expanded && <span className="nav-text">File Catalog</span>}
          </li>
        </ul>
      </nav>
      
      <div className="sidebar-footer">
        {expanded && (
          <div className="version-info">
            v1.0.0
          </div>
        )}
      </div>
    </div>
  );
};