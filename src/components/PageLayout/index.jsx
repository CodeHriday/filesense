import React from 'react';
import './PageLayout.css';

const PageLayout = ({ 
  title, 
  subtitle, 
  headerActions, 
  filters, 
  children,
  className = ''
}) => {
  return (
    <div className={`page-layout-container ${className}`}>
      {/* Page Header */}
      <div className="page-layout-header">
        <div className="page-layout-title-section">
          <h1 className="page-layout-title">{title}</h1>
          {subtitle && <p className="page-layout-subtitle">{subtitle}</p>}
        </div>
        {headerActions && (
          <div className="page-layout-header-actions">
            {headerActions}
          </div>
        )}
      </div>

      {/* Filters Section */}
      {filters && (
        <div className="page-layout-filters">
          {filters}
        </div>
      )}

      {/* Main Content */}
      <div className="page-layout-content">
        {children}
      </div>
    </div>
  );
};

// Subcomponent for filters
PageLayout.Filters = ({ children, className = '' }) => {
  return (
    <div className={`page-layout-filters-wrapper ${className}`}>
      {children}
    </div>
  );
};

// Subcomponent for table wrapper
PageLayout.TableWrapper = ({ children, className = '' }) => {
  return (
    <div className={`page-layout-table-container ${className}`}>
      {children}
    </div>
  );
};

export default PageLayout;
