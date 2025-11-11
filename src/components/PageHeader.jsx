import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiHome } from 'react-icons/fi';
import './styles/PageHeader.css';

const PageHeader = ({ title, subtitle, icon, actions }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnDashboard = location.pathname === '/';

  return (
    <div className="page-header">
      <div className="page-header-content">
        <div className="page-header-title-row">
          {!isOnDashboard && (
            <button 
              className="home-icon-button" 
              onClick={() => navigate('/')}
              title="Go to Dashboard"
              aria-label="Go to Dashboard"
            >
              <FiHome />
            </button>
          )}
          {icon && <div className="page-header-icon">{icon}</div>}
          <div className="page-header-titles">
            <h1 className="page-title">{title}</h1>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </div>
  );
};

export default PageHeader;