import React from 'react';
import './PageHeader.css';

const PageHeader = ({ 
  title, 
  description, 
  icon, 
  actions,
  breadcrumbs
}) => {
  return (
    <div className="page-header">
      <div className="page-header-content">
        <div className="page-header-left">
          {icon && <div className="page-header-icon">{icon}</div>}
          <div>
            <h1 className="page-header-title">{title}</h1>
            {description && <p className="page-header-description">{description}</p>}
          </div>
        </div>
        
        {actions && (
          <div className="page-header-actions">
            {actions}
          </div>
        )}
      </div>
      
      {breadcrumbs && (
        <div className="page-header-breadcrumbs">
          {breadcrumbs}
        </div>
      )}
    </div>
  );
};

export default PageHeader;