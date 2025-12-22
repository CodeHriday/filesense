import React, { useState, useEffect } from 'react';
import { FiLoader, FiSave, FiUpload, FiDownload } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import './MicroAnimations.css';
import PropTypes from 'prop-types';


/**
 * Button Animation Component
 * Adds micro-animations to buttons for better feedback
 */
export const AnimatedButton = ({ 
  icon, 
  children, 
  onClick, 
  variant = "primary", 
  animated = true,
  loading = false,
  disabled = false,
  className = "",
  ...props 
}) => {
  const [isAnimating, setIsAnimating] = useState(false);
  
  const handleClick = async (e) => {
    if (disabled || loading) return;
    
    if (animated) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
    }
    
    if (onClick) {
      await onClick(e);
    }
  };
  
  const getIcon = () => {
    if (loading) return <FiLoader className="button-icon spin" />;
    if (icon) return icon;
    return null;
  };
  
  return (
    <button
      className={`animated-button ${variant} ${isAnimating ? 'animate-click' : ''} ${loading ? 'loading' : ''} ${disabled ? 'disabled' : ''} ${className}`}
      onClick={handleClick}
      disabled={disabled || loading}
      {...props}
    >
      {getIcon()}
      <span>{children}</span>
    </button>
  );
};

/**
 * Save Button with Animation
 */
export const SaveButton = ({ onClick, loading = false, disabled = false, ...props }) => (
  <AnimatedButton
    icon={<FiSave className="button-icon" />}
    onClick={onClick}
    loading={loading}
    disabled={disabled}
    {...props}
  >
    Save
  </AnimatedButton>
);

/**
 * Upload Button with Animation
 */
export const UploadButton = ({ onClick, loading = false, disabled = false, ...props }) => (
  <AnimatedButton
    icon={<FiUpload className="button-icon" />}
    onClick={onClick}
    loading={loading}
    disabled={disabled}
    {...props}
  >
    Upload
  </AnimatedButton>
);

/**
 * Download Button with Animation
 */
export const DownloadButton = ({ onClick, loading = false, disabled = false, ...props }) => (
  <AnimatedButton
    icon={<FiDownload className="button-icon" />}
    onClick={onClick}
    loading={loading}
    disabled={disabled}
    variant="secondary"
    {...props}
  >
    Download
  </AnimatedButton>
);

/**
 * Animation Container for wrapping components with entrance/exit animations
 */
export const AnimationContainer = ({ 
  children, 
  animate = true, 
  animationType = "fade", 
  duration = 300, 
  delay = 0,
  className = ""
}) => {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, delay);
    
    return () => clearTimeout(timer);
  }, [delay]);
  
  if (!animate) return <div className={className}>{children}</div>;
  
  return (
    <div 
      className={`animation-container ${animationType} ${mounted ? 'visible' : ''} ${className}`}
      style={{ 
        '--animation-duration': `${duration}ms`,
        '--animation-delay': `${delay}ms`
      }}
    >
      {children}
    </div>
  );
};

/**
 * Success Animation Component
 * Displays a checkmark animation for successful operations
 */
export const SuccessAnimation = ({ show, message, duration = 2000, onComplete }) => {
  useEffect(() => {
    if (show && onComplete) {
      const timer = setTimeout(() => {
        onComplete();
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [show, duration, onComplete]);
  
  if (!show) return null;
  
  return (
    <div className="success-animation-container">
      <div className="success-animation">
        <div className="checkmark-circle">
          <div className="checkmark-circle-bg"></div>
          <div className="checkmark-stem"></div>
          <div className="checkmark-kick"></div>
        </div>
        {message && <div className="success-message">{message}</div>}
      </div>
    </div>
  );
};

/**
 * Page Transition Component
 * Adds smooth transitions between page changes
 */
AnimatedButton.propTypes = {
  icon: PropTypes.node,
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  variant: PropTypes.oneOf(['primary', 'secondary', 'success', 'danger']),
  animated: PropTypes.bool,
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  className: PropTypes.string
};
AnimatedButton.defaultProps = {
  variant: 'primary',
  animated: true,
  loading: false,
  disabled: false,
  className: ''
};
SaveButton.propTypes = {
  onClick: PropTypes.func,
  loading: PropTypes.bool,
  disabled: PropTypes.bool
};

UploadButton.propTypes = {
  onClick: PropTypes.func,
  loading: PropTypes.bool,
  disabled: PropTypes.bool
};

DownloadButton.propTypes = {
  onClick: PropTypes.func,
  loading: PropTypes.bool,
  disabled: PropTypes.bool
};
AnimationContainer.propTypes = {
  children: PropTypes.node.isRequired,
  animate: PropTypes.bool,
  animationType: PropTypes.oneOf(['fade', 'slide', 'zoom']),
  duration: PropTypes.number,
  delay: PropTypes.number,
  className: PropTypes.string
};

AnimationContainer.defaultProps = {
  animate: true,
  animationType: 'fade',
  duration: 300,
  delay: 0,
  className: ''
};
SuccessAnimation.propTypes = {
  show: PropTypes.bool.isRequired,
  message: PropTypes.string,
  duration: PropTypes.number,
  onComplete: PropTypes.func
};

SuccessAnimation.defaultProps = {
  duration: 2000
};


export const PageTransition = ({ children, className = "" }) => {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={window.location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className={`page-transition ${className}`}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

PageTransition.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string
};

PageTransition.defaultProps = {
  className: ''
};