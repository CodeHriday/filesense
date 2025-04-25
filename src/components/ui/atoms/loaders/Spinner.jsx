/**
 * Spinner Component
 * 
 * A loading spinner with customizable size and color.
 */
import React from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';

// Size options
export const SPINNER_SIZES = {
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
};

// Color options
export const SPINNER_COLORS = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
  WHITE: 'white',
  BLACK: 'black',
};

// Spinner component
const Spinner = ({
  size = SPINNER_SIZES.MEDIUM,
  color = SPINNER_COLORS.PRIMARY,
  className,
  ...props
}) => {
  // Size classes
  const sizeClasses = {
    [SPINNER_SIZES.SMALL]: 'w-4 h-4',
    [SPINNER_SIZES.MEDIUM]: 'w-8 h-8',
    [SPINNER_SIZES.LARGE]: 'w-12 h-12',
  };
  
  // Color classes
  const colorClasses = {
    [SPINNER_COLORS.PRIMARY]: 'text-blue-600',
    [SPINNER_COLORS.SECONDARY]: 'text-gray-600',
    [SPINNER_COLORS.WHITE]: 'text-white',
    [SPINNER_COLORS.BLACK]: 'text-black',
  };
  
  // Combine all classes
  const spinnerClasses = clsx(
    'inline-block animate-spin rounded-full border-4 border-solid border-current border-r-transparent',
    sizeClasses[size],
    colorClasses[color],
    className
  );
  
  return (
    <div
      className={spinnerClasses}
      role="status"
      aria-label="loading"
      {...props}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

Spinner.propTypes = {
  /** Size of the spinner */
  size: PropTypes.oneOf(Object.values(SPINNER_SIZES)),
  /** Color of the spinner */
  color: PropTypes.oneOf(Object.values(SPINNER_COLORS)),
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default Spinner;