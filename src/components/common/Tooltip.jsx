import React, { useState, useRef, useEffect } from 'react';
import './Tooltip.css';
import PropTypes from 'prop-types';


const Tooltip = ({ children, content, position = 'top', className = '' }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipPlacement, setTooltipPlacement] = useState(position);
  const childRef = useRef(null);
  const tooltipRef = useRef(null);
  
  const calculatePosition = () => {
    if (!childRef.current || !tooltipRef.current) return;
    
    const childRect = childRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let calculatedPosition = position;
    let x = 0;
    let y = 0;
    
    // Default positions for different placements
    if (position === 'top') {
      x = childRect.left + (childRect.width / 2) - (tooltipRect.width / 2);
      y = childRect.top - tooltipRect.height - 10;
      
      // Check if tooltip goes above viewport
      if (y < 0) {
        calculatedPosition = 'bottom';
        y = childRect.bottom + 10;
      }
    } else if (position === 'bottom') {
      x = childRect.left + (childRect.width / 2) - (tooltipRect.width / 2);
      y = childRect.bottom + 10;
      
      // Check if tooltip goes below viewport
      if (y + tooltipRect.height > viewportHeight) {
        calculatedPosition = 'top';
        y = childRect.top - tooltipRect.height - 10;
      }
    } else if (position === 'left') {
      x = childRect.left - tooltipRect.width - 10;
      y = childRect.top + (childRect.height / 2) - (tooltipRect.height / 2);
      
      // Check if tooltip goes outside left viewport
      if (x < 0) {
        calculatedPosition = 'right';
        x = childRect.right + 10;
      }
    } else if (position === 'right') {
      x = childRect.right + 10;
      y = childRect.top + (childRect.height / 2) - (tooltipRect.height / 2);
      
      // Check if tooltip goes outside right viewport
      if (x + tooltipRect.width > viewportWidth) {
        calculatedPosition = 'left';
        x = childRect.left - tooltipRect.width - 10;
      }
    }
    
    // Ensure tooltip stays within viewport horizontally
    x = Math.max(10, Math.min(x, viewportWidth - tooltipRect.width - 10));
    
    // Ensure tooltip stays within viewport vertically
    y = Math.max(10, Math.min(y, viewportHeight - tooltipRect.height - 10));
    
    setTooltipPosition({ x, y });
    setTooltipPlacement(calculatedPosition);
  };
  
  useEffect(() => {
    if (showTooltip) {
      calculatePosition();
      
      // Recalculate position on window resize
      window.addEventListener('resize', calculatePosition);
      window.addEventListener('scroll', calculatePosition);
      
      return () => {
        window.removeEventListener('resize', calculatePosition);
        window.removeEventListener('scroll', calculatePosition);
      };
    }
  }, [showTooltip, position]);
  
  return (
    <div className={`tooltip-container ${className}`}>
      <div
        ref={childRef}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        className="tooltip-trigger"
      >
        {children}
      </div>
      
      {showTooltip && content && (
        <div
          ref={tooltipRef}
          className={`tooltip tooltip-${tooltipPlacement}`}
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            position: 'fixed'
          }}
          role="tooltip"
        >
          {content}
        </div>
      )}
    </div>
  );
};
Tooltip.propTypes = {
  children: PropTypes.node.isRequired,
  content: PropTypes.node,
  position: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
  className: PropTypes.string
};

export default Tooltip;