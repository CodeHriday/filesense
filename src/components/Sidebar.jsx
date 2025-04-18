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
  FiPlay,
  FiCalendar,
  FiUsers,
  FiShield
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import OnboardingWizard from './OnboardingWizard';
import './Sidebar.css';

function Sidebar() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { currentUser, hasPermission, hasRole } = useAuth();
  
  // If user is not logged in, show minimal sidebar
  if (!currentUser) {
    return (
      <div>
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <ul>
              <li>
                <NavLink to="/login" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiHome className="icon" />
                  <span>Login</span>
                </NavLink>
              </li>
            </ul>
          </nav>
        </aside>
      </div>
    );
  }
  
  // Check if the admin section should be displayed
  const showAdminSection = hasPermission('user_view') || 
                         hasPermission('role_view') || 
                         hasPermission('dashboard_edit');
  
  // Check if the insights section should be displayed
  const showInsightsSection = hasPermission('insight_view');

  return (
    <div>
      <aside className="sidebar">
        <nav className="sidebar-nav">
          <ul>
            {/* Core features */}
            {hasPermission('dashboard_view') && (
              <li>
                <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiHome className="icon" />
                  <span>Dashboard</span>
                </NavLink>
              </li>
            )}
            
            {hasPermission('file_upload') && (
              <li>
                <NavLink to="/upload" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiUpload className="icon" />
                  <span>Upload File</span>
                </NavLink>
              </li>
            )}
            
            {/* Onboarding wizard available to all logged-in users */}
            <li>
              <button
                className="onboarding-button"
                onClick={() => setShowOnboarding(true)}
              >
                <FiHelpCircle className="icon" />
                <span>Onboarding Wizard</span>
              </button>
            </li>
            
            {/* Monitoring section */}
            {hasPermission('file_view') && (
              <li>
                <NavLink to="/monitor" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiMonitor className="icon" />
                  <span>Monitor</span>
                </NavLink>
              </li>
            )}
            
            {hasPermission('alert_view') && (
              <li>
                <NavLink to="/alerts" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiAlertTriangle className="icon" />
                  <span>Alerts</span>
                </NavLink>
              </li>
            )}
            
            {hasPermission('file_view') && (
              <li>
                <NavLink to="/scheduler" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiCalendar className="icon" />
                  <span>File Scheduler</span>
                </NavLink>
              </li>
            )}
            
            {/* Data sources section */}
            {hasPermission('file_view') && (
              <li>
                <NavLink to="/connections" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiDatabase className="icon" />
                  <span>Connections</span>
                </NavLink>
              </li>
            )}
            
            {hasPermission('file_view') && (
              <li>
                <NavLink to="/mappings" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiLink className="icon" />
                  <span>Mappings</span>
                </NavLink>
              </li>
            )}
            
            {hasPermission('lineage_view') && (
              <li>
                <NavLink to="/lineage" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiGitBranch className="icon" />
                  <span>File Lineage</span>
                </NavLink>
              </li>
            )}
            
            {/* Administration section */}
            {showAdminSection && (
              <>
                <li className="nav-divider">
                  <span>Administration</span>
                </li>
                
                {hasPermission('user_view') && (
                  <li>
                    <NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiUsers className="icon" />
                      <span>User Management</span>
                    </NavLink>
                  </li>
                )}
                
                {hasPermission('role_view') && (
                  <li>
                    <NavLink to="/roles" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiShield className="icon" />
                      <span>Role Management</span>
                    </NavLink>
                  </li>
                )}
                
                {hasPermission('dashboard_edit') && (
                  <li>
                    <NavLink to="/dashboard-settings" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiSettings className="icon" />
                      <span>Dashboard Settings</span>
                    </NavLink>
                  </li>
                )}
              </>
            )}
            
            {/* Insights section */}
            {showInsightsSection && (
              <>
                <li className="nav-divider">
                  <span>Insights & Badges</span>
                </li>
                
                {hasPermission('insight_view') && (
                  <li>
                    <NavLink to="/badges" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiAward className="icon" />
                      <span>Achievement Badges</span>
                    </NavLink>
                  </li>
                )}
                
                {hasPermission('insight_view') && (
                  <li>
                    <NavLink to="/recommendations" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiTrendingUp className="icon" />
                      <span>Recommendations</span>
                    </NavLink>
                  </li>
                )}
                
                {hasPermission('insight_view') && (
                  <li>
                    <NavLink to="/insights" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiMessageSquare className="icon" />
                      <span>AI Insights</span>
                    </NavLink>
                  </li>
                )}
                
                {hasPermission('insight_view') && (
                  <li>
                    <NavLink to="/stories" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiBookOpen className="icon" />
                      <span>Data Stories</span>
                    </NavLink>
                  </li>
                )}
              </>
            )}
          </ul>
        </nav>
      </aside>

      {showOnboarding && (
        <OnboardingWizard onClose={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}

export default Sidebar;