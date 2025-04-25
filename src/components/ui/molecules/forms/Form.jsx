/**
 * Form Component
 * 
 * A reusable form component with built-in validation, submission handling,
 * and layout management.
 */
import React, { forwardRef, useState } from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';
import { Button, BUTTON_VARIANTS } from '../../atoms/buttons/Button';

// Layout options
const LAYOUTS = {
  VERTICAL: 'vertical',
  HORIZONTAL: 'horizontal',
  INLINE: 'inline',
};

// Form component
const Form = forwardRef(({
  children,
  className,
  onSubmit,
  resetOnSubmit = false,
  layout = LAYOUTS.VERTICAL,
  spacing = 'normal',
  disabled = false,
  fullWidth = false,
  submitButtonProps = {},
  resetButtonProps = {},
  showSubmitButton = true,
  showResetButton = false,
  submitButtonText = 'Submit',
  resetButtonText = 'Reset',
  isSubmitting = false,
  ...props
}, ref) => {
  // Track form state
  const [formState, setFormState] = useState({
    values: {},
    touched: {},
    errors: {},
    isSubmitting: false,
  });
  
  // Layout classes
  const layoutClasses = {
    [LAYOUTS.VERTICAL]: 'flex flex-col',
    [LAYOUTS.HORIZONTAL]: 'sm:flex sm:flex-row sm:flex-wrap sm:items-start',
    [LAYOUTS.INLINE]: 'flex flex-row flex-wrap items-center',
  };
  
  // Spacing classes
  const spacingClasses = {
    none: 'gap-0',
    tight: 'gap-1',
    normal: 'gap-4',
    loose: 'gap-6',
  };
  
  // Width classes
  const widthClasses = {
    fullWidth: 'w-full',
  };
  
  // Combine all classes
  const formClasses = clsx(
    layoutClasses[layout],
    spacingClasses[spacing],
    {
      [widthClasses.fullWidth]: fullWidth,
    },
    className
  );
  
  // Handle form submission
  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Set submitting state
    setFormState(prev => ({ ...prev, isSubmitting: true }));
    
    try {
      // Call submit handler with form values
      if (onSubmit) {
        await onSubmit(formState.values, event);
      }
      
      // Reset form if resetOnSubmit is true
      if (resetOnSubmit) {
        event.target.reset();
        setFormState({
          values: {},
          touched: {},
          errors: {},
          isSubmitting: false,
        });
      } else {
        setFormState(prev => ({ ...prev, isSubmitting: false }));
      }
    } catch (error) {
      console.error('Form submission error:', error);
      setFormState(prev => ({ 
        ...prev, 
        isSubmitting: false,
        errors: { 
          ...prev.errors, 
          form: error.message || 'Form submission failed' 
        }
      }));
    }
  };
  
  // Handle form reset
  const handleReset = (event) => {
    event.preventDefault();
    event.target.reset();
    setFormState({
      values: {},
      touched: {},
      errors: {},
      isSubmitting: false,
    });
  };
  
  // Form context value to pass to children
  const formContextValue = {
    formState,
    setFormState,
    layout,
    disabled,
  };
  
  return (
    <form
      ref={ref}
      className={formClasses}
      onSubmit={handleSubmit}
      onReset={handleReset}
      {...props}
    >
      {/* Wrap children with FormContext if it's a function */}
      {typeof children === 'function' 
        ? children(formContextValue)
        : children}
      
      {/* Error message if there's a form-level error */}
      {formState.errors.form && (
        <div className="text-red-500 text-sm mt-2 mb-2">
          {formState.errors.form}
        </div>
      )}
      
      {/* Form actions */}
      {(showSubmitButton || showResetButton) && (
        <div className={clsx(
          'flex',
          layout === LAYOUTS.HORIZONTAL ? 'mt-4 w-full' : 'mt-4',
          layout === LAYOUTS.INLINE ? 'ml-4' : ''
        )}>
          {showSubmitButton && (
            <Button
              type="submit"
              disabled={disabled || isSubmitting || formState.isSubmitting}
              isLoading={isSubmitting || formState.isSubmitting}
              {...submitButtonProps}
            >
              {submitButtonText}
            </Button>
          )}
          
          {showResetButton && (
            <Button
              type="reset"
              disabled={disabled || isSubmitting || formState.isSubmitting}
              variant={BUTTON_VARIANTS.SECONDARY}
              className="ml-2"
              {...resetButtonProps}
            >
              {resetButtonText}
            </Button>
          )}
        </div>
      )}
    </form>
  );
});

Form.displayName = 'Form';

Form.propTypes = {
  /** Form children */
  children: PropTypes.oneOfType([PropTypes.node, PropTypes.func]),
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Form submission handler */
  onSubmit: PropTypes.func,
  /** Reset form after successful submission */
  resetOnSubmit: PropTypes.bool,
  /** Form layout */
  layout: PropTypes.oneOf(Object.values(LAYOUTS)),
  /** Spacing between form elements */
  spacing: PropTypes.oneOf(['none', 'tight', 'normal', 'loose']),
  /** Disable all form elements */
  disabled: PropTypes.bool,
  /** Make form take full width */
  fullWidth: PropTypes.bool,
  /** Props to pass to submit button */
  submitButtonProps: PropTypes.object,
  /** Props to pass to reset button */
  resetButtonProps: PropTypes.object,
  /** Show submit button */
  showSubmitButton: PropTypes.bool,
  /** Show reset button */
  showResetButton: PropTypes.bool,
  /** Submit button text */
  submitButtonText: PropTypes.node,
  /** Reset button text */
  resetButtonText: PropTypes.node,
  /** Form is submitting */
  isSubmitting: PropTypes.bool,
};

// Form group component for grouping form controls
const FormGroup = ({
  children,
  className,
  label,
  labelFor,
  helperText,
  error,
  required,
  fullWidth = false,
  ...props
}) => {
  return (
    <div
      className={clsx(
        'mb-4',
        {
          'w-full': fullWidth,
        },
        className
      )}
      {...props}
    >
      {label && (
        <label
          htmlFor={labelFor}
          className={clsx(
            'block mb-1 font-medium text-sm',
            {
              'text-red-500': error,
              'text-gray-700': !error,
            }
          )}
        >
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}
      
      {children}
      
      {(helperText || error) && (
        <div
          className={clsx(
            'mt-1 text-xs',
            {
              'text-red-500': error,
              'text-gray-500': !error && helperText,
            }
          )}
        >
          {error || helperText}
        </div>
      )}
    </div>
  );
};

FormGroup.propTypes = {
  /** Form group children */
  children: PropTypes.node,
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Label text */
  label: PropTypes.node,
  /** HTML ID of the element the label is for */
  labelFor: PropTypes.string,
  /** Helper text */
  helperText: PropTypes.node,
  /** Error message */
  error: PropTypes.node,
  /** Mark field as required */
  required: PropTypes.bool,
  /** Make form group take full width */
  fullWidth: PropTypes.bool,
};

// Attach FormGroup to Form
Form.Group = FormGroup;

// Export the component and its constants
export { Form, LAYOUTS as FORM_LAYOUTS };
export default Form;