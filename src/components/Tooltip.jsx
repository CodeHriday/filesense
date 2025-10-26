import React, { useState } from 'react';
import './Tooltip.css';

/**
 * Tooltip component that displays additional information when hovering over an element
 * 
 * @param {Object} props Component props
 * @param {React.ReactNode} props.children The element that triggers the tooltip
 * @param {string} props.content The content to display in the tooltip
 * @param {string} props.position The position of the tooltip (top, bottom, left, right)
 * @param {string} props.type The type of tooltip (default, info, warning, error, success)
 * @param {boolean} props.animated Whether the tooltip should have an animated entrance
 */
export const Tooltip = ({ 
  children, 
  content, 
  position = 'top', 
  type = 'default',
  animated = false,
  delay = 0
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleMouseEnter = () => {
    if (animated) {
      setIsAnimating(true);
      setTimeout(() => {
        setIsVisible(true);
      }, delay);
    } else {
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
    setIsAnimating(false);
  };

  return (
    <div className="tooltip-container" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {isVisible && (
        <div 
          className={`tooltip tooltip-${position} tooltip-${type} visible ${animated ? 'animated' : ''}`}
        >
          {typeof content === 'string' ? content : content}
          <div className={`tooltip-arrow tooltip-arrow-${position}`}></div>
        </div>
      )}
    </div>
  );
};
