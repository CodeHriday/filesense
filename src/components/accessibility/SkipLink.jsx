/**
 * SkipLink Component
 * 
 * A component that allows keyboard users to skip navigation and jump directly to content.
 * It's visually hidden but becomes visible when focused.
 */
import React from 'react';
import PropTypes from 'prop-types';

const SkipLink = ({ targetId, children, className, ...props }) => {
  return (
    <a
      href={`#${targetId}`}
      className={`sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:p-4 focus:bg-white focus:text-blue-600 focus:border focus:border-blue-500 focus:outline-none ${className || ''}`}
      {...props}
    >
      {children || 'Skip to content'}
    </a>
  );
};

SkipLink.propTypes = {
  /** ID of the target element to skip to */
  targetId: PropTypes.string.isRequired,
  /** Content of the skip link */
  children: PropTypes.node,
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default SkipLink;