import React, { useState, useEffect } from 'react';
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
  FiShield,
  FiBriefcase,
  FiCpu,
  FiLayers,
  FiMapPin,
  FiFilter,
  FiPlusCircle,
  FiFileText
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import OnboardingWizard from './OnboardingWizard';
import './Sidebar.css';

function Sidebar() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { currentUser, hasPermission, hasRole, hasFeaturePermission } = useAuth();
  const [debug, setDebug] = useState(true);
  
  // Debug info to help diagnose permission issues
  useEffect(() => {
    if (debug && currentUser && currentUser.permissions) {
      console.log("Current user permissions:", currentUser.permissions);
      
      // Test specific permissions to help diagnose issues
      console.log("dashboard:read permission:", 
        currentUser.permissions.some(p => 
          (typeof p === 'string' && p.includes('dashboard:read')) ||
          (typeof p === 'object' && p.resource === 'dashboard' && p.action === 'read'))
      );
      
      console.log("file_profile permission:", 
        currentUser.permissions.some(p => 
          (typeof p === 'string' && p.includes('file_profile')) ||
          (typeof p === 'object' && p.resource === 'file_profile'))
      );
    }
  }, [currentUser, debug]);
  
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
  
  // Debug info for role detection
  if (debug && currentUser) {
    console.log("Current user roles:", currentUser.roles);
    console.log("Is Admin via hasRole:", hasRole('Admin'));
    console.log("Is Creator via hasRole:", hasRole('Creator'));
    console.log("Is Executor via hasRole:", hasRole('Executor'));
    console.log("Manual check for Executor role:", 
      currentUser.roles && 
      (Array.isArray(currentUser.roles) ? 
        currentUser.roles.includes('Executor') : 
        (typeof currentUser.roles === 'string' ? 
          currentUser.roles === 'Executor' : 
          false)
      )
    );
  }

  // Admin users see all sections and menu items - use multiple detection methods
  const isAdmin = hasRole('Admin') || 
                 (currentUser.roles && 
                   (Array.isArray(currentUser.roles) ? 
                     currentUser.roles.includes('Admin') : 
                     currentUser.roles === 'Admin'));
                     
  const isCreator = hasRole('Creator') || 
                   (currentUser.roles && 
                     (Array.isArray(currentUser.roles) ? 
                       currentUser.roles.includes('Creator') : 
                       currentUser.roles === 'Creator'));
                       
  const isExecutor = hasRole('Executor') || 
                    (currentUser.roles && 
                      (Array.isArray(currentUser.roles) ? 
                        currentUser.roles.includes('Executor') : 
                        currentUser.roles === 'Executor')) ||
                    // Also check for role_id for older API responses
                    (currentUser.role_id === 3);
  
  // Admin section should always be shown for Admin users and for others with specific permissions
  let showAdminSection = isAdmin || 
                        hasPermission('user_view') || 
                        hasPermission('role_view') || 
                        hasPermission('dashboard_edit');
                         
  // Force visibility of admin section for Admin role
  if (currentUser.roles && currentUser.roles.includes('Admin')) {
    showAdminSection = true;
  }
  
  // Check if the insights section should be displayed based on permissions
  let showInsightsSection = isAdmin || isCreator || 
    hasPermission('badges:read') || 
    hasPermission('insights:read') || 
    hasPermission('recommendations:read') || 
    hasPermission('stories:read');
    
  // Modified helper for permission checking that accounts for multiple formats and variations
  const checkPermissions = (permissions) => {
    // Admin role always has all permissions
    if (isAdmin) return true;
    
    // Convert permissions to array if it's a string
    const permissionList = Array.isArray(permissions) ? permissions : [permissions];
    
    // For executor role, just check permissions directly
    // This will pull exactly what's in the database row plus server-side additions
    if (isExecutor) {
      return permissionList.some(perm => {
        // Clean up the permission string to check against database format
        const cleanPerm = perm.replace(/:/g, '_').replace(/s$/, '');
        const altPerm = perm.replace(/:/g, '_');
        
        return hasPermission(perm) || hasPermission(cleanPerm) || hasPermission(altPerm);
      });
    }
    
    // For Creator role - they have access to most features except admin
    if (isCreator) {
      // Define which menu items are visible for Creator role
      const creatorVisible = [
        'dashboard_view', 'dashboard:read', 'dashboard',
        'file_upload', 'file_upload:read', 'file_upload:write',
        'file_view', 'file:read', 'file:write',
        'file_profile', 'file_profile:read', 'file_profile:write',
        'quality_checks', 'quality_checks:read', 'quality_checks:write',
        'monitor', 'monitor:read', 'monitor:write',
        'alerts', 'alerts:read', 'alerts:write',
        'connections', 'connections:read', 'connections:write',
        'mappings', 'mappings:read', 'mappings:write',
        'lineage', 'lineage_view', 'lineage:read', 'lineage:write',
        'scheduler', 'scheduler:read', 'scheduler:write'
      ];
      
      // If any of the permissions match what the Creator can access, return true
      if (permissionList.some(p => creatorVisible.includes(p))) {
        return true;
      }
    }
    
    // Fallback to checking permissions from the database/token
    return permissionList.some(perm => hasPermission(perm));
  };

  return (
    <div>
      <aside className="sidebar">
        <nav className="sidebar-nav">
          <ul>
            {/* Core features */}
            {checkPermissions(['dashboard_view', 'dashboard:read']) && (
              <li>
                <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiHome className="icon" />
                  <span>Dashboard</span>
                </NavLink>
              </li>
            )}
            
            {/* Ad Hoc Process section */}
            <li className="nav-divider">
              <span>Ad Hoc Process</span>
            </li>
            
            {checkPermissions(['file_upload', 'file_upload:write']) && (
              <li>
                <NavLink to="/upload" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiUpload className="icon" />
                  <span>Upload File</span>
                </NavLink>
              </li>
            )}
            
            {checkPermissions(['file_view', 'file:read', 'file_upload:read']) && (
              <li>
                <NavLink to="/file-catalog" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiDatabase className="icon" />
                  <span>File Catalog</span>
                </NavLink>
              </li>
            )}
            
            {/* Onboarding wizard available to Admin, Creator roles, or with specific permission */}
            {(isAdmin || isCreator || hasPermission('onboarding_wizard') || hasPermission('onboarding_wizard:read')) && (
              <li>
                <button
                  className="onboarding-button"
                  onClick={() => setShowOnboarding(true)}
                >
                  <FiHelpCircle className="icon" />
                  <span>Onboarding Wizard</span>
                </button>
              </li>
            )}
            
            {/* Business Process Management section */}
            <li className="nav-divider">
              <span>Process Management</span>
            </li>
            
            {/* Connections */}
            {checkPermissions(['connections', 'connections:read']) && (
              <li>
                <NavLink to="/connections" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiDatabase className="icon" />
                  <span>Connections</span>
                </NavLink>
              </li>
            )}
            
            {/* Mappings */}
            {checkPermissions(['mappings', 'mappings:read']) && (
              <li>
                <NavLink to="/mappings" className={({ isActive }) => isActive ? 'active' : ''}>
                  <FiLink className="icon" />
                  <span>Mappings</span>
                </NavLink>
              </li>
            )}
            
            {/* Process Management Wizard */}
            <li>
              <NavLink to="/process-management-wizard" className={({ isActive }) => isActive ? 'active' : ''}>
                <FiFilter className="icon" />
                <span>Process Wizard</span>
              </NavLink>
            </li>
            
            {/* ETL Orchestration section */}
            <li className="nav-divider">
              <span>ETL Orchestration</span>
            </li>
            
            <li>
              <NavLink to="/mapping-groups" className={({ isActive }) => isActive ? 'active' : ''}>
                <FiLayers className="icon" />
                <span>Batch Groups</span>
              </NavLink>
            </li>
            
            <li>
              <NavLink to="/workflows" className={({ isActive }) => isActive ? 'active' : ''}>
                <FiGitBranch className="icon" />
                <span>Workflows</span>
              </NavLink>
            </li>
            
            <li>
              <NavLink to="/etl-scheduler" className={({ isActive }) => isActive ? 'active' : ''}>
                <FiCalendar className="icon" />
                <span>ETL Scheduler</span>
              </NavLink>
            </li>
            
            {/* Jobs and Monitoring section */}
            {(checkPermissions(['file_view', 'monitor:read', 'monitor']) || 
              checkPermissions(['alerts', 'alerts:read', 'alert_view']) || 
              checkPermissions(['scheduler', 'scheduler:read'])) && (
              <>
                <li className="nav-divider">
                  <span>Jobs and Monitoring</span>
                </li>
                
                {/* Jobs */}
                <li>
                  <NavLink to="/jobs" className={({ isActive }) => isActive ? 'active' : ''}>
                    <FiPlay className="icon" />
                    <span>Jobs</span>
                  </NavLink>
                </li>
                
                {checkPermissions(['file_view', 'monitor:read', 'monitor']) && (
                  <li>
                    <NavLink to="/monitor" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiMonitor className="icon" />
                      <span>Monitor</span>
                    </NavLink>
                  </li>
                )}
                
                {checkPermissions(['alerts', 'alerts:read', 'alert_view']) && (
                  <li>
                    <NavLink to="/alerts" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiAlertTriangle className="icon" />
                      <span>Alerts</span>
                    </NavLink>
                  </li>
                )}
              </>
            )}
            
            {/* Governance section */}
            {checkPermissions(['lineage', 'lineage:read', 'lineage_view']) && (
              <>
                <li className="nav-divider">
                  <span>Governance</span>
                </li>
                
                <li>
                  <NavLink to="/lineage" className={({ isActive }) => isActive ? 'active' : ''}>
                    <FiGitBranch className="icon" />
                    <span>File Lineage</span>
                  </NavLink>
                </li>
              </>
            )}
            
            {/* Administration section */}
            {showAdminSection && (
              <>
                <li className="nav-divider">
                  <span>Administration</span>
                </li>
                
                {checkPermissions(['user_view', 'user:read']) && (
                  <li>
                    <NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiUsers className="icon" />
                      <span>User Management</span>
                    </NavLink>
                  </li>
                )}
                
                {checkPermissions(['role_view', 'role:read']) && (
                  <li>
                    <NavLink to="/roles" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiShield className="icon" />
                      <span>Role Management</span>
                    </NavLink>
                  </li>
                )}
                
                {checkPermissions(['dashboard_edit', 'dashboard:write']) && (
                  <li>
                    <NavLink to="/dashboard-settings" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiSettings className="icon" />
                      <span>Dashboard Settings</span>
                    </NavLink>
                  </li>
                )}
                
                {/* Audit Trail - Admin only */}
                {isAdmin && (
                  <li>
                    <NavLink to="/audit-trail" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiFileText className="icon" />
                      <span>Audit Trail</span>
                    </NavLink>
                  </li>
                )}
              </>
            )}
            
            {/* Insights section */}
            {showInsightsSection && (
              <>
                <li className="nav-divider">
                  <span>Insights</span>
                </li>
                
                {/* Only show recommendations if permission exists */}
                {checkPermissions(['recommendations', 'recommendations:read', 'recommendation:read']) && (
                  <li>
                    <NavLink to="/recommendations" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiTrendingUp className="icon" />
                      <span>Recommendations</span>
                    </NavLink>
                  </li>
                )}
                
                {/* Only show insights if permission exists */}
                {checkPermissions(['insights', 'insights:read', 'insight:read']) && (
                  <li>
                    <NavLink to="/insights" className={({ isActive }) => isActive ? 'active' : ''}>
                      <FiMessageSquare className="icon" />
                      <span>AI Insights</span>
                    </NavLink>
                  </li>
                )}
                
                {/* Only show stories if permission exists */}
                {checkPermissions(['stories', 'stories:read', 'story:read']) && (
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