/**
 * PageLayout Component
 * 
 * A template component for consistent page layouts throughout the application.
 * It provides a structured layout with header, sidebar, main content area, and optional components.
 */
import React from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';
import { Typography, TYPOGRAPHY_VARIANTS } from '../atoms/typography/Typography';

const PageLayout = ({
  title,
  subtitle,
  breadcrumbs,
  actions,
  children,
  sidebar,
  rightSidebar,
  footer,
  loading,
  error,
  className,
  contentClassName,
  headerClassName,
  sidebarClassName,
  rightSidebarClassName,
  footerClassName,
  fullWidth = false,
  centerContent = false,
  ...props
}) => {
  // Layout classes
  const layoutClasses = clsx(
    'min-h-screen',
    {
      'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8': !fullWidth,
      'px-4 sm:px-6 lg:px-8': fullWidth,
    },
    className
  );
  
  // Container classes for main and sidebars
  const containerClasses = clsx(
    'mt-6 flex',
    {
      'justify-center': centerContent && !sidebar && !rightSidebar,
    }
  );
  
  // Sidebar classes
  const sidebarWrapperClasses = clsx(
    'w-64 flex-shrink-0',
    sidebarClassName
  );
  
  // Right sidebar classes
  const rightSidebarWrapperClasses = clsx(
    'w-64 flex-shrink-0 ml-6',
    rightSidebarClassName
  );
  
  // Content wrapper classes
  const contentWrapperClasses = clsx(
    'flex-1',
    {
      'ml-6': sidebar,
      'max-w-3xl mx-auto': centerContent && !sidebar && !rightSidebar,
    },
    contentClassName
  );
  
  // Header classes
  const headerWrapperClasses = clsx(
    'pt-6 pb-4 border-b border-gray-200',
    headerClassName
  );
  
  // Footer classes
  const footerWrapperClasses = clsx(
    'mt-6 py-4 border-t border-gray-200',
    footerClassName
  );
  
  return (
    <div className={layoutClasses} {...props}>
      {/* Page header with title, subtitle, breadcrumbs, and actions */}
      {(title || subtitle || breadcrumbs || actions) && (
        <div className={headerWrapperClasses}>
          <div className="flex items-center justify-between flex-wrap">
            {/* Left side: Title, subtitle, breadcrumbs */}
            <div className="flex-1 min-w-0">
              {breadcrumbs && (
                <div className="mb-2">{breadcrumbs}</div>
              )}
              {title && (
                <Typography variant={TYPOGRAPHY_VARIANTS.H1} className="text-2xl sm:text-3xl font-bold leading-tight text-gray-900">
                  {title}
                </Typography>
              )}
              {subtitle && (
                <Typography variant={TYPOGRAPHY_VARIANTS.SUBTITLE1} color="muted" className="mt-1">
                  {subtitle}
                </Typography>
              )}
            </div>
            
            {/* Right side: Actions */}
            {actions && (
              <div className="flex-shrink-0 mt-4 sm:mt-0 ml-4 flex flex-wrap gap-2 justify-end">
                {actions}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Main container with sidebar and content */}
      <div className={containerClasses}>
        {/* Left sidebar */}
        {sidebar && (
          <div className={sidebarWrapperClasses}>
            {sidebar}
          </div>
        )}
        
        {/* Main content area */}
        <main className={contentWrapperClasses}>
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
              <div className="flex">
                <div className="flex-shrink-0 text-red-500">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <Typography variant={TYPOGRAPHY_VARIANTS.H3} className="text-sm font-medium text-red-800">
                    Error
                  </Typography>
                  <Typography variant={TYPOGRAPHY_VARIANTS.BODY2} className="mt-1 text-red-700">
                    {typeof error === 'string' ? error : 'An error occurred while loading the page.'}
                  </Typography>
                </div>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
        
        {/* Right sidebar */}
        {rightSidebar && (
          <div className={rightSidebarWrapperClasses}>
            {rightSidebar}
          </div>
        )}
      </div>
      
      {/* Footer area */}
      {footer && (
        <div className={footerWrapperClasses}>
          {footer}
        </div>
      )}
    </div>
  );
};

PageLayout.propTypes = {
  /** Page title */
  title: PropTypes.node,
  /** Page subtitle */
  subtitle: PropTypes.node,
  /** Breadcrumbs navigation component */
  breadcrumbs: PropTypes.node,
  /** Action buttons/components */
  actions: PropTypes.node,
  /** Main content */
  children: PropTypes.node,
  /** Left sidebar content */
  sidebar: PropTypes.node,
  /** Right sidebar content */
  rightSidebar: PropTypes.node,
  /** Footer content */
  footer: PropTypes.node,
  /** Loading state */
  loading: PropTypes.bool,
  /** Error message or state */
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.bool, PropTypes.object]),
  /** Additional CSS class for the layout container */
  className: PropTypes.string,
  /** Additional CSS class for the content area */
  contentClassName: PropTypes.string,
  /** Additional CSS class for the header area */
  headerClassName: PropTypes.string,
  /** Additional CSS class for the sidebar */
  sidebarClassName: PropTypes.string,
  /** Additional CSS class for the right sidebar */
  rightSidebarClassName: PropTypes.string,
  /** Additional CSS class for the footer */
  footerClassName: PropTypes.string,
  /** Use full width layout */
  fullWidth: PropTypes.bool,
  /** Center content horizontally */
  centerContent: PropTypes.bool,
};

export default PageLayout;