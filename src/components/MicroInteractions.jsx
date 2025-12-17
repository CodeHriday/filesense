import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { 
  FiHeart, 
  FiCheckCircle, 
  FiAlertTriangle, 
  FiPlusCircle, 
  FiMinusCircle,
  FiChevronUp,
  FiChevronDown,
  FiCheck,
  FiX,
  FiStar,
  FiThumbsUp,
  FiBookmark
} from 'react-icons/fi';
import './MicroInteractions.css';

/**
 * Hover Card with reveal effect
 */
export const HoverCard = ({ 
  children, 
  hoverContent, 
  direction = 'up', 
  className = '',
  delay = 0,
  distance = 20,
  style = {}
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimerRef = useRef(null);
  
  const handleMouseEnter = () => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setIsHovered(true);
    }, delay);
  };
  
  const handleMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
    setIsHovered(false);
  };
  
  return (
    <div 
      className={`hover-card ${className}`} 
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="hover-card-default">
        {children}
      </div>
      
      <div className={`hover-card-content ${direction} ${isHovered ? 'visible' : ''}`} 
           style={{ 
             '--distance': `${distance}px` 
           }}
      >
        {hoverContent}
      </div>
    </div>
  );
};

/**
 * Like Button with animation
 */
export const LikeButton = ({ 
  initialState = false, 
  activeColor = '#e53935',
  count = 0,
  iconType = 'heart',
  onChange,
  withCounter = true,
  size = 'medium',
  className = '',
  style = {}
}) => {
  const [isActive, setIsActive] = useState(initialState);
  const [likeCount, setLikeCount] = useState(count);
  const [isAnimating, setIsAnimating] = useState(false);
  
  const getIcon = () => {
    switch (iconType) {
      case 'heart':
        return <FiHeart className="like-icon" />;
      case 'star':
        return <FiStar className="like-icon" />;
      case 'thumbsup':
        return <FiThumbsUp className="like-icon" />;
      case 'bookmark':
        return <FiBookmark className="like-icon" />;
      default:
        return <FiHeart className="like-icon" />;
    }
  };
  
  const handleClick = () => {
    const newState = !isActive;
    setIsActive(newState);
    setLikeCount(prev => newState ? prev + 1 : prev - 1);
    setIsAnimating(true);
    
    setTimeout(() => {
      setIsAnimating(false);
    }, 700);
    
    if (onChange) {
      onChange(newState);
    }
  };
  
  return (
    <button 
      className={`like-button ${isActive ? 'active' : ''} ${isAnimating ? 'animating' : ''} ${size} ${className}`}
      onClick={handleClick}
      style={{
        '--active-color': activeColor,
        ...style
      }}
      aria-pressed={isActive}
    >
      {getIcon()}
      {withCounter && <span className="like-count">{likeCount}</span>}
    </button>
  );
};

/**
 * Accordion component with smooth animations
 */
export const Accordion = ({ 
  title, 
  children, 
  initialOpen = false,
  className = '',
  style = {}
}) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(initialOpen ? 'auto' : 0);
  
  // Measure content height on mount and when children change
  useEffect(() => {
    if (contentRef.current) {
      const height = contentRef.current.scrollHeight;
      setContentHeight(isOpen ? `${height}px` : 0);
    }
  }, [isOpen, children]);
  
  const toggleAccordion = () => {
    // Get the exact height before toggling
    if (contentRef.current && !isOpen) {
      const height = contentRef.current.scrollHeight;
      setContentHeight(`${height}px`);
    } else {
      setContentHeight(0);
    }
    
    setIsOpen(!isOpen);
  };
  
  return (
    <div className={`accordion ${isOpen ? 'open' : ''} ${className}`} style={style}>
      <button 
        className="accordion-header"
        onClick={toggleAccordion}
        aria-expanded={isOpen}
      >
        <span className="accordion-title">{title}</span>
        {isOpen ? <FiChevronUp className="accordion-icon" /> : <FiChevronDown className="accordion-icon" />}
      </button>
      
      <div 
        className="accordion-content" 
        ref={contentRef}
        style={{ height: contentHeight }}
      >
        <div className="accordion-content-inner">
          {children}
        </div>
      </div>
    </div>
  );
};

/**
 * Toggle Switch with animation
 */
export const ToggleSwitch = ({
  isOn = false,
  onToggle,
  activeColor = '#2196f3',
  size = 'medium',
  label,
  labelPosition = 'right',
  disabled = false,
  className = '',
  style = {}
}) => {
  const [checked, setChecked] = useState(isOn);

  const handleChange = () => {
    if (disabled) return;
    
    const newValue = !checked;
    setChecked(newValue);
    
    if (onToggle) {
      onToggle(newValue);
    }
  };

  return (
    <label 
      className={`toggle-switch-container ${labelPosition} ${size} ${disabled ? 'disabled' : ''} ${className}`}
      style={style}
    >
      {label && labelPosition === 'left' && (
        <span className="toggle-label">{label}</span>
      )}
      
      <div 
        className={`toggle-switch ${checked ? 'on' : 'off'}`}
        style={{ '--active-color': activeColor }}
        onClick={handleChange}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className="toggle-input"
        />
        <div className="toggle-slider">
          <div className="toggle-knob">
            {checked ? <FiCheck className="toggle-icon" /> : <FiX className="toggle-icon" />}
          </div>
        </div>
      </div>
      
      {label && labelPosition === 'right' && (
        <span className="toggle-label">{label}</span>
      )}
    </label>
  );
};

/**
 * Ripple button with click animation
 */
export const RippleButton = ({
  children,
  onClick,
  color = '#2196f3',
  variant = 'filled',
  size = 'medium',
  rippleColor = 'rgba(255, 255, 255, 0.7)',
  disabled = false,
  loading = false,
  icon,
  className = '',
  style = {}
}) => {
  const [ripples, setRipples] = useState([]);
  const buttonRef = useRef(null);
  
  const createRipple = (event) => {
    if (disabled || loading) return;
    
    const button = buttonRef.current;
    const rect = button.getBoundingClientRect();
    
    const left = event.clientX - rect.left;
    const top = event.clientY - rect.top;
    const diameter = Math.max(rect.width, rect.height) * 2;
    
    const ripple = {
      id: Date.now(),
      left,
      top,
      diameter,
    };
    
    setRipples(prev => [...prev, ripple]);
    
    // Cleanup ripple after animation
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== ripple.id));
    }, 600);
  };
  
  const handleClick = (event) => {
    createRipple(event);
    
    if (onClick && !disabled && !loading) {
      onClick(event);
    }
  };
  
  return (
    <button
      ref={buttonRef}
      className={`ripple-button ${variant} ${size} ${disabled ? 'disabled' : ''} ${loading ? 'loading' : ''} ${className}`}
      onClick={handleClick}
      disabled={disabled || loading}
      style={{
        '--button-color': color,
        '--ripple-color': rippleColor,
        ...style
      }}
    >
      <div className="button-content">
        {icon && <span className="button-icon">{icon}</span>}
        {children}
      </div>
      
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          className="ripple"
          style={{
            left: ripple.left,
            top: ripple.top,
            width: ripple.diameter,
            height: ripple.diameter
          }}
        />
      ))}
      
      {loading && <span className="loading-spinner" />}
    </button>
  );
};

/**
 * Counter with increment/decrement animations
 */
export const AnimatedCounter = ({
  initialValue = 0,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  size = 'medium',
  label,
  className = '',
  style = {}
}) => {
  const [value, setValue] = useState(initialValue);
  const [isIncrementing, setIsIncrementing] = useState(false);
  const [isDecrementing, setIsDecrementing] = useState(false);
  
  const increment = () => {
    if (value < max) {
      const newValue = Math.min(value + step, max);
      setValue(newValue);
      setIsIncrementing(true);
      
      if (onChange) {
        onChange(newValue);
      }
      
      setTimeout(() => {
        setIsIncrementing(false);
      }, 200);
    }
  };
  
  const decrement = () => {
    if (value > min) {
      const newValue = Math.max(value - step, min);
      setValue(newValue);
      setIsDecrementing(true);
      
      if (onChange) {
        onChange(newValue);
      }
      
      setTimeout(() => {
        setIsDecrementing(false);
      }, 200);
    }
  };
  
  return (
    <div className={`animated-counter ${size} ${className}`} style={style}>
      {label && <span className="counter-label">{label}</span>}
      
      <div className="counter-control">
        <button 
          className="counter-button decrement"
          onClick={decrement}
          disabled={value <= min}
        >
          <FiMinusCircle />
        </button>
        
        <div className="counter-value-container">
          <div className={`counter-value ${isIncrementing ? 'incrementing' : ''} ${isDecrementing ? 'decrementing' : ''}`}>
            {value}
          </div>
        </div>
        
        <button 
          className="counter-button increment"
          onClick={increment}
          disabled={value >= max}
        >
          <FiPlusCircle />
        </button>
      </div>
    </div>
  );
};

/**
 * Notification Badge with pulse animation
 */
export const NotificationBadge = ({
  count = 0,
  max = 99,
  color = '#e53935',
  size = 'medium',
  animated = true,
  children,
  onClick,
  className = '',
  style = {}
}) => {
  const displayCount = count > max ? `${max}+` : count;
  const hasNotifications = count > 0;
  
  // Add pulse animation when count changes
  const [isPulsing, setIsPulsing] = useState(false);
  
  useEffect(() => {
    if (hasNotifications && animated) {
      setIsPulsing(true);
      
      const timer = setTimeout(() => {
        setIsPulsing(false);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [count, hasNotifications, animated]);
  
  return (
    <div 
      className={`badge-container ${size} ${className}`} 
      style={style}
      onClick={onClick}
    >
      {children}
      
      {hasNotifications && (
        <div 
          className={`badge ${isPulsing ? 'pulse' : ''}`}
          style={{ '--badge-color': color }}
        >
          <span className="badge-count">{displayCount}</span>
        </div>
      )}
    </div>
  );
};

/**
 * Progress indicator with animated fill
 */
export const ProgressIndicator = ({
  value = 0,
  maxValue = 100,
  showPercentage = true,
  color = '#2196f3',
  trailColor = '#e0e0e0',
  height = 10,
  animated = true,
  label,
  className = '',
  style = {}
}) => {
  const percentage = Math.min(Math.max((value / maxValue) * 100, 0), 100);
  
  return (
    <div className={`progress-container ${className}`} style={style}>
      {label && <div className="progress-label">{label}</div>}
      
      <div className="progress-track" style={{ height, backgroundColor: trailColor }}>
        <div 
          className={`progress-fill ${animated ? 'animated' : ''}`}
          style={{ 
            width: `${percentage}%`,
            backgroundColor: color
          }}
        />
      </div>
      
      {showPercentage && (
        <div className="progress-percentage">{Math.round(percentage)}%</div>
      )}
    </div>
  );
};

/**
 * Expandable search input
 */
export const ExpandableSearch = ({
  placeholder = 'Search...',
  onSearch,
  expandedWidth = '250px',
  collapsedWidth = '40px',
  autoFocus = true,
  className = '',
  style = {}
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef(null);
  
  const handleFocus = () => {
    setIsExpanded(true);
  };
  
  const handleBlur = () => {
    if (!searchTerm) {
      setIsExpanded(false);
    }
  };
  
  const handleChange = (e) => {
    setSearchTerm(e.target.value);
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchTerm && onSearch) {
      onSearch(searchTerm);
    }
  };
  
  // Auto-focus when expanded
  useEffect(() => {
    if (isExpanded && autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded, autoFocus]);
  
  return (
    <form 
      className={`expandable-search ${isExpanded ? 'expanded' : ''} ${className}`}
      onSubmit={handleSubmit}
      style={{
        '--expanded-width': expandedWidth,
        '--collapsed-width': collapsedWidth,
        ...style
      }}
    >
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={searchTerm}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="search-input"
      />
      <button type="submit" className="search-button">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </button>
    </form>
  );
};

/**
 * Collapsible panel with smooth transitions
 */
export const CollapsiblePanel = ({
  header,
  children,
  initialExpanded = false,
  className = '',
  onToggle,
  style = {}
}) => {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(initialExpanded ? 'auto' : 0);
  
  const toggleExpand = () => {
    if (contentRef.current) {
      if (!isExpanded) {
        const height = contentRef.current.scrollHeight;
        setContentHeight(`${height}px`);
      } else {
        setContentHeight('0px');
      }
    }
    
    setIsExpanded(!isExpanded);
    
    if (onToggle) {
      onToggle(!isExpanded);
    }
  };
  
  // Update content height when children change
  useEffect(() => {
    if (contentRef.current && isExpanded) {
      setContentHeight(`${contentRef.current.scrollHeight}px`);
      
      // Switch to 'auto' after transition to accommodate dynamic content changes
      const timer = setTimeout(() => {
        if (isExpanded) {
          setContentHeight('auto');
        }
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [children, isExpanded]);
  
  return (
    <div className={`collapsible-panel ${isExpanded ? 'expanded' : ''} ${className}`} style={style}>
      <div className="panel-header" onClick={toggleExpand}>
        {header}
        <div className="panel-icon">
          {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
        </div>
      </div>
      
      <div 
        ref={contentRef}
        className="panel-content"
        style={{ height: contentHeight }}
      >
        <div className="panel-content-inner">
          {children}
        </div>
      </div>
    </div>
  );
};


/* HoverCard */
HoverCard.propTypes = {
  children: PropTypes.node.isRequired,
  hoverContent: PropTypes.node,
  direction: PropTypes.oneOf(['up', 'down', 'left', 'right']),
  className: PropTypes.string,
  delay: PropTypes.number,
  distance: PropTypes.number,
  style: PropTypes.object
};

/* LikeButton */
LikeButton.propTypes = {
  initialState: PropTypes.bool,
  activeColor: PropTypes.string,
  count: PropTypes.number,
  iconType: PropTypes.oneOf(['heart', 'star', 'thumbsup', 'bookmark']),
  onChange: PropTypes.func,
  withCounter: PropTypes.bool,
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  className: PropTypes.string,
  style: PropTypes.object
};

/* Accordion */
Accordion.propTypes = {
  title: PropTypes.node.isRequired,
  children: PropTypes.node.isRequired,
  initialOpen: PropTypes.bool,
  className: PropTypes.string,
  style: PropTypes.object
};

/* ToggleSwitch */
ToggleSwitch.propTypes = {
  isOn: PropTypes.bool,
  onToggle: PropTypes.func,
  activeColor: PropTypes.string,
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  label: PropTypes.string,
  labelPosition: PropTypes.oneOf(['left', 'right']),
  disabled: PropTypes.bool,
  className: PropTypes.string,
  style: PropTypes.object
};

/* RippleButton */
RippleButton.propTypes = {
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  color: PropTypes.string,
  variant: PropTypes.oneOf(['filled', 'outlined', 'text']),
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  rippleColor: PropTypes.string,
  disabled: PropTypes.bool,
  loading: PropTypes.bool,
  icon: PropTypes.node,
  className: PropTypes.string,
  style: PropTypes.object
};

/* AnimatedCounter */
AnimatedCounter.propTypes = {
  initialValue: PropTypes.number,
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  onChange: PropTypes.func,
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  label: PropTypes.string,
  className: PropTypes.string,
  style: PropTypes.object
};

/* NotificationBadge */
NotificationBadge.propTypes = {
  count: PropTypes.number,
  max: PropTypes.number,
  color: PropTypes.string,
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  animated: PropTypes.bool,
  children: PropTypes.node,
  onClick: PropTypes.func,
  className: PropTypes.string,
  style: PropTypes.object
};

/* ProgressIndicator */
ProgressIndicator.propTypes = {
  value: PropTypes.number,
  maxValue: PropTypes.number,
  showPercentage: PropTypes.bool,
  color: PropTypes.string,
  trailColor: PropTypes.string,
  height: PropTypes.number,
  animated: PropTypes.bool,
  label: PropTypes.string,
  className: PropTypes.string,
  style: PropTypes.object
};

/* ExpandableSearch */
ExpandableSearch.propTypes = {
  placeholder: PropTypes.string,
  onSearch: PropTypes.func,
  expandedWidth: PropTypes.string,
  collapsedWidth: PropTypes.string,
  autoFocus: PropTypes.bool,
  className: PropTypes.string,
  style: PropTypes.object
};

/* CollapsiblePanel */
CollapsiblePanel.propTypes = {
  header: PropTypes.node.isRequired,
  children: PropTypes.node.isRequired,
  initialExpanded: PropTypes.bool,
  onToggle: PropTypes.func,
  className: PropTypes.string,
  style: PropTypes.object
};

export default {
  HoverCard,
  LikeButton,
  Accordion,
  ToggleSwitch,
  RippleButton,
  AnimatedCounter,
  NotificationBadge,
  ProgressIndicator,
  ExpandableSearch,
  CollapsiblePanel
};