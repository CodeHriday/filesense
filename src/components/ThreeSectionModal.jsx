import React from 'react';
import './ThreeSectionModal.css';
import PropTypes from 'prop-types';

/**
 * ThreeSectionModal Component
 * A modal with three sections: fixed header (10%), scrollable center (80%), fixed footer (10%)
 * 
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Callback when modal is closed
 * @param {string} title - Modal title
 * @param {ReactNode} children - Center content (scrollable)
 * @param {ReactNode} footer - Footer content (typically buttons)
 * @param {string} className - Additional CSS classes
 * @param {string} size - Modal size: 'small', 'medium', 'large' (default: 'large')
 */
const ThreeSectionModal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className = '',
  size = 'large'
}) => {
  if (!isOpen) return null;

  return (
    <div className="three-section-modal-overlay">
      <div className={`three-section-modal three-section-modal-${size} ${className}`}>
        {/* Fixed Header - 10% */}
        <div className="three-section-modal-header">
          <h2>{title}</h2>
          <button 
            className="three-section-modal-close" 
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        {/* Scrollable Center - 80% */}
        <div className="three-section-modal-content">
          {children}
        </div>

        {/* Fixed Footer - 10% */}
        {footer && (
          <div className="three-section-modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
ThreeSectionModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,

  children: PropTypes.node,
  footer: PropTypes.node,

  className: PropTypes.string,
  size: PropTypes.oneOf(['small', 'medium', 'large'])
};

export default ThreeSectionModal;
