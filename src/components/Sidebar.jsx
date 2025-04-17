import React from 'react';
import { NavLink } from 'react-router-dom';
import { FiHome, FiUpload, FiDatabase, FiBarChart2, FiAlertTriangle, FiSettings, FiLink, FiMonitor } from 'react-icons/fi';
import './Sidebar.css';

function Sidebar() {
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <ul>
          <li>
            <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>
              <FiHome className="icon" />
              <span>Dashboard</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/upload" className={({ isActive }) => isActive ? 'active' : ''}>
              <FiUpload className="icon" />
              <span>Upload File</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/monitor" className={({ isActive }) => isActive ? 'active' : ''}>
              <FiMonitor className="icon" />
              <span>Monitor</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/alerts" className={({ isActive }) => isActive ? 'active' : ''}>
              <FiAlertTriangle className="icon" />
              <span>Alerts</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/connections" className={({ isActive }) => isActive ? 'active' : ''}>
              <FiDatabase className="icon" />
              <span>Connections</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/mappings" className={({ isActive }) => isActive ? 'active' : ''}>
              <FiLink className="icon" />
              <span>Mappings</span>
            </NavLink>
          </li>
        </ul>
      </nav>
    </aside>
  );
}

export default Sidebar;