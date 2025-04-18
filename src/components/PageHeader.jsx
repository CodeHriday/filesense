import React from 'react';
import './styles/PageHeader.css';

const PageHeader = ({ title, subtitle, icon, actions }) => {
  return (
    <div className="page-header">
      <div className="page-header-content">
        <div className="page-header-title-row">
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