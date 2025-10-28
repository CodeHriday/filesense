import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { APP_FEATURES, getSidebarCategoryName, FEATURE_CATEGORIES_ORDER } from '../config/appFeatures';
import OnboardingWizard from './OnboardingWizard';
import { isVendorUser } from '../utils/userHelpers';
import './Sidebar.css';

function Sidebar() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});
  const { currentUser, hasPermission } = useAuth();
  
  const toggleMenu = (featureId) => {
    setExpandedMenus(prev => ({
      ...prev,
      [featureId]: !prev[featureId]
    }));
  };
  
  // Check if user is a vendor using user attributes (not roles)
  const isVendorOnly = isVendorUser(currentUser) && 
    currentUser.roles && 
    currentUser.roles.length === 1;
  
  // If user is not logged in, show minimal sidebar
  if (!currentUser) {
    return (
      <div>
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <ul>
              <li>
                <NavLink to="/login" className={({ isActive }) => isActive ? 'active' : ''}>
                  <span>Login</span>
                </NavLink>
              </li>
            </ul>
          </nav>
        </aside>
      </div>
    );
  }
  
  // Helper function to check if user has read permission for a feature
  const canViewFeature = (featureId, parentId = null) => {
    // Special handling for vendor-only users
    if (isVendorOnly) {
      // Allow file_drop, vendor_agreements, and vendor_management (parent)
      // vendor_management needs to be allowed so its children can render
      return featureId === 'file_drop' || 
             featureId === 'vendor_agreements' || 
             featureId === 'vendor_management';
    }
    
    // Check for read permission in the format: featureId:read
    const readPermission = `${featureId}:read`;
    
    // For child features, check individual permission first (granular access)
    // This allows roles to have access to specific vendor modules without parent access
    if (parentId) {
      // First check if user has direct permission to this child
      if (hasPermission(readPermission)) {
        return true;
      }
      // Fall back to parent permission for convenience
      const parentPermission = `${parentId}:read`;
      return hasPermission(parentPermission);
    }
    
    // For parent features with children (like vendor_management), check if user has
    // permission to view ANY child. This allows users with granular permissions
    // (e.g., only vendor_agreements:read) to see the parent section
    const feature = APP_FEATURES.find(f => f.id === featureId);
    if (feature && feature.children && feature.children.length > 0) {
      // Check if user has permission for any child
      const hasAnyChildPermission = feature.children.some(child => {
        const childPermission = `${child.id}:read`;
        return hasPermission(childPermission);
      });
      
      if (hasAnyChildPermission) {
        return true;
      }
    }
    
    return hasPermission(readPermission);
  };
  
  // Group features by category
  const categorizedFeatures = {};
  
  APP_FEATURES.forEach(feature => {
    // For vendor-only users, override showInSidebar for file_drop
    const shouldShowInSidebar = isVendorOnly && feature.id === 'file_drop' 
      ? true 
      : feature.showInSidebar;
    
    // Only include features that:
    // 1. Should be shown in sidebar
    // 2. User has permission to view
    if (shouldShowInSidebar && canViewFeature(feature.id)) {
      if (!categorizedFeatures[feature.category]) {
        categorizedFeatures[feature.category] = [];
      }
      categorizedFeatures[feature.category].push(feature);
    }
  });
  
  // Render menu items for a category
  const renderCategoryItems = (category) => {
    const features = categorizedFeatures[category];
    if (!features || features.length === 0) {
      return null;
    }
    
    return (
      <React.Fragment key={category}>
        <li className="nav-divider">
          <span>{getSidebarCategoryName(category)}</span>
        </li>
        {features.map(feature => {
          const IconComponent = feature.icon;
          const isExpanded = expandedMenus[feature.id];
          
          // Handle collapsible menu items
          if (feature.isCollapsible && feature.children) {
            // Check if any children are visible to this user
            const visibleChildren = feature.children.filter(child => 
              child.showInSidebar && canViewFeature(child.id, feature.id)
            );
            
            // Only show parent if it has visible children
            if (visibleChildren.length === 0) {
              return null;
            }
            
            return (
              <React.Fragment key={feature.id}>
                <li>
                  <div 
                    className="collapsible-menu-item" 
                    onClick={() => toggleMenu(feature.id)}
                  >
                    {IconComponent && <IconComponent className="icon" />}
                    <span>{feature.name}</span>
                    {isExpanded ? <FiChevronDown className="chevron" /> : <FiChevronRight className="chevron" />}
                  </div>
                </li>
                {isExpanded && visibleChildren.map(child => (
                  <li key={child.id} className="submenu-item">
                    <NavLink to={child.route} className={({ isActive }) => isActive ? 'active' : ''}>
                      <span>{child.name}</span>
                    </NavLink>
                  </li>
                ))}
              </React.Fragment>
            );
          }
          
          // Regular menu items
          return (
            <li key={feature.id}>
              <NavLink to={feature.route} className={({ isActive }) => isActive ? 'active' : ''}>
                {IconComponent && <IconComponent className="icon" />}
                <span>{feature.name}</span>
              </NavLink>
            </li>
          );
        })}
      </React.Fragment>
    );
  };

  return (
    <div>
      <aside className="sidebar">
        <nav className="sidebar-nav">
          <ul>
            {/* Render categories in the defined order */}
            {FEATURE_CATEGORIES_ORDER.map(category => renderCategoryItems(category))}
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
