import React from 'react';
import { useAccessibility } from '../../context/AccessibilityContext';
import PropTypes from 'prop-types';

/**
 * FormField - An accessible form field wrapper
 * 
 * @param {Object} props
 * @param {string} props.id - Unique ID for the form field
 * @param {string} props.label - Label text
 * @param {ReactNode} props.children - Form field component
 * @param {string} props.error - Error message if applicable
 * @param {string} props.helpText - Help text for the field
 * @param {boolean} props.required - Whether the field is required
 */
const FormField = ({
  id,
  label,
  children,
  error,
  helpText,
  required = false,
}) => {
  const { highContrast, largeText } = useAccessibility();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  
  // Check if children is a single child and clone it to add accessibility props
  const enhancedChild = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      // Pass additional props to the form control
      return React.cloneElement(child, {
        id: id,
        'aria-describedby': `${helpText ? helpId : ''} ${error ? errorId : ''}`.trim() || undefined,
        'aria-invalid': error ? 'true' : undefined,
        'aria-required': required ? 'true' : undefined,
        className: `${child.props.className || ''} ${error ? 'input-error' : ''}`.trim(),
      });
    }
    return child;
  });
  
  return (
    <div className={`form-field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id} className={required ? 'required-field' : ''}>
        {label}
        {required && (
          <span className="required-indicator" aria-hidden="true"> *</span>
        )}
        {required && (
          <span className="sr-only"> (required)</span>
        )}
      </label>
      
      {enhancedChild}
      
      {helpText && (
        <div id={helpId} className="form-help-text">
          {helpText}
        </div>
      )}
      
      {error && (
        <div 
          id={errorId} 
          className="form-error-message" 
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}
    </div>
  );
};
FormField.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  error: PropTypes.string,
  helpText: PropTypes.string,
  required: PropTypes.bool
};

export default FormField;