import React from 'react';
import './PageLayout.css';
import PropTypes from 'prop-types';

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


PageLayout.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  headerActions: PropTypes.node,
  filters: PropTypes.node,
  children: PropTypes.node.isRequired,
  className: PropTypes.string
};

PageLayout.Filters.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string
};

PageLayout.TableWrapper.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string
};

export default PageLayout;
