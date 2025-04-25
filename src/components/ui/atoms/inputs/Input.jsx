/**
 * Input Component
 * 
 * A reusable input component with support for different variants, states,
 * and built-in validation.
 */
import React, { forwardRef, useState } from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';

// Input variants
const VARIANTS = {
  DEFAULT: 'default',
  OUTLINED: 'outlined',
  FILLED: 'filled',
};

// Input sizes
const SIZES = {
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
};

const Input = forwardRef(({
  id,
  name,
  label,
  type = 'text',
  variant = VARIANTS.DEFAULT,
  size = SIZES.MEDIUM,
  value,
  defaultValue,
  placeholder,
  required = false,
  disabled = false,
  readOnly = false,
  error,
  helperText,
  className,
  leftIcon,
  rightIcon,
  onChange,
  onFocus,
  onBlur,
  ...props
}, ref) => {
  const [focused, setFocused] = useState(false);
  const [innerValue, setInnerValue] = useState(defaultValue || '');
  
  // Determine if it's a controlled or uncontrolled component
  const isControlled = value !== undefined;
  const inputValue = isControlled ? value : innerValue;
  
  // Base classes
  const baseInputClasses = 'w-full transition-colors focus:outline-none';
  
  // Variant classes
  const variantClasses = {
    [VARIANTS.DEFAULT]: 'border-b border-gray-300 focus:border-blue-500',
    [VARIANTS.OUTLINED]: 'border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
    [VARIANTS.FILLED]: 'bg-gray-100 border border-transparent rounded focus:bg-white focus:border-blue-500',
  };
  
  // Size classes
  const sizeClasses = {
    [SIZES.SMALL]: 'text-xs px-2 py-1',
    [SIZES.MEDIUM]: 'text-sm px-3 py-2',
    [SIZES.LARGE]: 'text-base px-4 py-3',
  };
  
  // State classes
  const stateClasses = {
    disabled: 'opacity-50 cursor-not-allowed bg-gray-100',
    readOnly: 'cursor-default bg-gray-50',
    error: 'border-red-500 focus:border-red-500 focus:ring-red-500',
    focused: 'ring-1',
  };
  
  // Container classes
  const containerClasses = 'relative';
  
  // Label classes
  const labelClasses = clsx(
    'block mb-1 font-medium',
    {
      'text-xs': size === SIZES.SMALL,
      'text-sm': size === SIZES.MEDIUM || size === SIZES.LARGE,
      'text-red-500': error,
      'text-gray-700': !error,
    }
  );
  
  // Helper text classes
  const helperTextClasses = clsx(
    'mt-1 text-xs',
    {
      'text-red-500': error,
      'text-gray-500': !error,
    }
  );
  
  // Combine input classes
  const inputClasses = clsx(
    baseInputClasses,
    variantClasses[variant],
    sizeClasses[size],
    {
      [stateClasses.disabled]: disabled,
      [stateClasses.readOnly]: readOnly,
      [stateClasses.error]: !!error,
      [stateClasses.focused]: focused,
      'pl-9': leftIcon,
      'pr-9': rightIcon,
    },
    className
  );
  
  // Handle change
  const handleChange = (e) => {
    if (!isControlled) {
      setInnerValue(e.target.value);
    }
    if (onChange) {
      onChange(e);
    }
  };
  
  // Handle focus
  const handleFocus = (e) => {
    setFocused(true);
    if (onFocus) {
      onFocus(e);
    }
  };
  
  // Handle blur
  const handleBlur = (e) => {
    setFocused(false);
    if (onBlur) {
      onBlur(e);
    }
  };
  
  const inputId = id || name;
  
  return (
    <div className={containerClasses}>
      {label && (
        <label htmlFor={inputId} className={labelClasses}>
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}
      
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
            {leftIcon}
          </div>
        )}
        
        <input
          ref={ref}
          id={inputId}
          name={name}
          type={type}
          value={inputValue}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={inputClasses}
          aria-invalid={!!error}
          aria-describedby={helperText && inputId ? `${inputId}-helper-text` : undefined}
          {...props}
        />
        
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
            {rightIcon}
          </div>
        )}
      </div>
      
      {helperText && (
        <p
          id={inputId ? `${inputId}-helper-text` : undefined}
          className={helperTextClasses}
        >
          {helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

Input.propTypes = {
  /** Input id attribute */
  id: PropTypes.string,
  /** Input name attribute */
  name: PropTypes.string,
  /** Input label */
  label: PropTypes.node,
  /** Input type attribute */
  type: PropTypes.string,
  /** Input variant */
  variant: PropTypes.oneOf(Object.values(VARIANTS)),
  /** Input size */
  size: PropTypes.oneOf(Object.values(SIZES)),
  /** Controlled value */
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  /** Default value for uncontrolled component */
  defaultValue: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  /** Placeholder text */
  placeholder: PropTypes.string,
  /** Required attribute */
  required: PropTypes.bool,
  /** Disabled attribute */
  disabled: PropTypes.bool,
  /** ReadOnly attribute */
  readOnly: PropTypes.bool,
  /** Error message */
  error: PropTypes.string,
  /** Helper text displayed below input */
  helperText: PropTypes.node,
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Icon displayed on the left side */
  leftIcon: PropTypes.node,
  /** Icon displayed on the right side */
  rightIcon: PropTypes.node,
  /** Change event handler */
  onChange: PropTypes.func,
  /** Focus event handler */
  onFocus: PropTypes.func,
  /** Blur event handler */
  onBlur: PropTypes.func,
};

// Export the component and its constants
export { Input, VARIANTS as INPUT_VARIANTS, SIZES as INPUT_SIZES };
export default Input;