import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  FiHome, 
  FiUpload, 
  FiDatabase, 
  FiBarChart2, 
  FiAlertTriangle, 
  FiSettings, 
  FiLink, 
  FiMonitor, 
  FiGitBranch,
  FiAward,
  FiMessageSquare,
  FiTrendingUp,
  FiBookOpen,
  FiHelpCircle,
  FiPlay
} from 'react-icons/fi';
import OnboardingWizard from './OnboardingWizard';
import './Sidebar.css';

function Sidebar() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  return (
    <>
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
              <button
                className="onboarding-button"
                onClick={() => setShowOnboarding(true)}
              >
                <FiHelpCircle className="icon" />
                <span>Onboarding Wizard</span>
              </button>
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
            <li>
              <NavLink to="/lineage" className={({ isActive }) => isActive ? 'active' : ''}>
                <FiGitBranch className="icon" />
                <span>File Lineage</span>
              </NavLink>
            </li>
            
            <li className="nav-divider">
              <span>Insights & Badges</span>
            </li>
            
            <li>
              <NavLink to="/dashboard-settings" className={({ isActive }) => isActive ? 'active' : ''}>
                <FiSettings className="icon" />
                <span>Dashboard Settings</span>
              </NavLink>
            </li>
            
            <li>
              <NavLink to="/badges" className={({ isActive }) => isActive ? 'active' : ''}>
                <FiAward className="icon" />
                <span>Achievement Badges</span>
              </NavLink>
            </li>
            
            <li>
              <NavLink to="/recommendations" className={({ isActive }) => isActive ? 'active' : ''}>
                <FiTrendingUp className="icon" />
                <span>Recommendations</span>
              </NavLink>
            </li>
            
            <li>
              <NavLink to="/insights" className={({ isActive }) => isActive ? 'active' : ''}>
                <FiMessageSquare className="icon" />
                <span>AI Insights</span>
              </NavLink>
            </li>
            
            <li>
              <NavLink to="/stories" className={({ isActive }) => isActive ? 'active' : ''}>
                <FiBookOpen className="icon" />
                <span>Data Stories</span>
              </NavLink>
            </li>
          </ul>
        </nav>
      </aside>

      {showOnboarding && (
        <OnboardingWizard onClose={() => setShowOnboarding(false)} />
      )}
    </>
  );
}

export default Sidebar;