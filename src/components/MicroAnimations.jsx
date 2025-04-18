import React, { useState, useEffect } from 'react';
import { FiCheckCircle, FiAlertCircle, FiInfo, FiLoader, FiRefreshCw, FiSave, FiUpload, FiDownload } from 'react-icons/fi';
import './MicroAnimations.css';

/**
 * Success Animation Component
 * Used for successful operations like saving, uploading, or completing tasks
 */
export const SuccessAnimation = ({ message = "Success!", onComplete }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onComplete) onComplete();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div className="micro-animation success-animation">
      <div className="animation-icon-wrapper">
        <FiCheckCircle className="animation-icon" />
      </div>
      <div className="animation-message">{message}</div>
    </div>
  );
};

/**
 * Error Animation Component
 * Used for operation failures, validation errors, or connection issues
 */
export const ErrorAnimation = ({ message = "Error occurred", onComplete }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onComplete) onComplete();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div className="micro-animation error-animation">
      <div className="animation-icon-wrapper shake">
        <FiAlertCircle className="animation-icon" />
      </div>
      <div className="animation-message">{message}</div>
    </div>
  );
};

/**
 * Info Animation Component
 * Used for non-critical notifications or updates
 */
export const InfoAnimation = ({ message = "Information", onComplete }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onComplete) onComplete();
    }, 2500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div className="micro-animation info-animation">
      <div className="animation-icon-wrapper pulse">
        <FiInfo className="animation-icon" />
      </div>
      <div className="animation-message">{message}</div>
    </div>
  );
};

/**
 * Loading Animation Component
 * Used for operations in progress
 */
export const LoadingAnimation = ({ message = "Loading...", variant = "spinner" }) => {
  return (
    <div className="micro-animation loading-animation">
      <div className="animation-icon-wrapper spin">
        {variant === "spinner" ? (
          <FiLoader className="animation-icon" />
        ) : (
          <FiRefreshCw className="animation-icon" />
        )}
      </div>
      <div className="animation-message">{message}</div>
    </div>
  );
};

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
 * Animation Wrapper for page transitions
 */
export const PageTransition = ({ children }) => (
  <AnimationContainer 
    animationType="slide-up" 
    duration={400}
    className="page-transition"
  >
    {children}
  </AnimationContainer>
);