import React, { useState, useEffect } from 'react';
import { FiLoader, FiSave, FiUpload, FiDownload } from 'react-icons/fi';
import './MicroAnimations.css';

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