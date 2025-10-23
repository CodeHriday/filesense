import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { APP_FEATURES, getSidebarCategoryName, FEATURE_CATEGORIES_ORDER } from '../config/appFeatures';
import OnboardingWizard from './OnboardingWizard';
import './Sidebar.css';

function Sidebar() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { currentUser, hasPermission } = useAuth();
  
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
  const canViewFeature = (featureId) => {
    // Check for read permission in the format: featureId:read
    const readPermission = `${featureId}:read`;
    return hasPermission(readPermission);
  };
  
  // Group features by category
  const categorizedFeatures = {};
  
  APP_FEATURES.forEach(feature => {
    // Only include features that:
    // 1. Should be shown in sidebar
    // 2. User has permission to view
    if (feature.showInSidebar && canViewFeature(feature.id)) {
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
