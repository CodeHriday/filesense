/**
 * Button Component
 * 
 * A flexible button component that supports various styles, sizes, and states.
 * This is a core UI element used throughout the application.
 */
import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';

// Button variants
const VARIANTS = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
  TERTIARY: 'tertiary',
  DANGER: 'danger',
  SUCCESS: 'success',
  WARNING: 'warning',
  INFO: 'info',
  GHOST: 'ghost',
  LINK: 'link',
};

// Button sizes
const SIZES = {
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
};

const Button = forwardRef(({
  children,
  className,
  variant = VARIANTS.PRIMARY,
  size = SIZES.MEDIUM,
  disabled = false,
  isLoading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  onClick,
  type = 'button',
  ariaLabel,
  ...props
}, ref) => {
  // Base classes
  const baseClasses = 'inline-flex items-center justify-center rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  // Variant classes
  const variantClasses = {
    [VARIANTS.PRIMARY]: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    [VARIANTS.SECONDARY]: 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400',
    [VARIANTS.TERTIARY]: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-400',
    [VARIANTS.DANGER]: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    [VARIANTS.SUCCESS]: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
    [VARIANTS.WARNING]: 'bg-yellow-500 text-white hover:bg-yellow-600 focus:ring-yellow-400',
    [VARIANTS.INFO]: 'bg-blue-400 text-white hover:bg-blue-500 focus:ring-blue-300',
    [VARIANTS.GHOST]: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-400',
    [VARIANTS.LINK]: 'bg-transparent text-blue-600 hover:text-blue-800 hover:underline focus:ring-blue-500 p-0',
  };
  
  // Size classes
  const sizeClasses = {
    [SIZES.SMALL]: 'text-xs px-2.5 py-1.5',
    [SIZES.MEDIUM]: 'text-sm px-4 py-2',
    [SIZES.LARGE]: 'text-base px-6 py-3',
  };
  
  // State classes
  const stateClasses = {
    disabled: 'opacity-50 cursor-not-allowed',
    loading: 'cursor-wait',
    fullWidth: 'w-full',
  };
  
  // Combine all classes
  const buttonClasses = clsx(
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    {
      [stateClasses.disabled]: disabled,
      [stateClasses.loading]: isLoading,
      [stateClasses.fullWidth]: fullWidth,
    },
    // Allow custom classes to override defaults
    className
  );
  
  // Handle click event
  const handleClick = (e) => {
    if (disabled || isLoading) return;
    if (onClick) onClick(e);
  };
  
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses}
      disabled={disabled || isLoading}
      onClick={handleClick}
      aria-label={ariaLabel || undefined}
      aria-disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...props}
    >
      {/* Loading indicator */}
      {isLoading && (
        <span className="mr-2">
          <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </span>
      )}
      
      {/* Left icon */}
      {!isLoading && leftIcon && (
        <span className="mr-2">{leftIcon}</span>
      )}
      
      {/* Button content */}
      <span>{children}</span>
      
      {/* Right icon */}
      {!isLoading && rightIcon && (
        <span className="ml-2">{rightIcon}</span>
      )}
    </button>
  );
});

Button.displayName = 'Button';

Button.propTypes = {
  /** Button content */
  children: PropTypes.node.isRequired,
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Button variant */
  variant: PropTypes.oneOf(Object.values(VARIANTS)),
  /** Button size */
  size: PropTypes.oneOf(Object.values(SIZES)),
  /** Disabled state */
  disabled: PropTypes.bool,
  /** Loading state */
  isLoading: PropTypes.bool,
  /** Full width button */
  fullWidth: PropTypes.bool,
  /** Icon to show on the left side */
  leftIcon: PropTypes.node,
  /** Icon to show on the right side */
  rightIcon: PropTypes.node,
  /** Click handler */
  onClick: PropTypes.func,
  /** Button type attribute */
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  /** Accessible label */
  ariaLabel: PropTypes.string,
};

// Export the component and its constants
export { Button, VARIANTS as BUTTON_VARIANTS, SIZES as BUTTON_SIZES };
export default Button;